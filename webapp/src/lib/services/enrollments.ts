import { randomBytes } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { db } from '$lib/db';
import {
	enrollments,
	enrollmentSyncLog,
	subscribers,
	type NewEnrollment,
	type NewSubscriber
} from '$lib/db/schema';
import type { DbTransaction } from '$lib/db/types';
import { getSetting, getSettings, setSettings } from './settings';
import { eq } from 'drizzle-orm';

// ── API types ─────────────────────────────────────────────────────────────────

export interface ApiParticipant {
	index: number;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	fiscalCode?: string | null;
}

export interface ApiEnrollmentType {
	id: number;
	name: string;
	courseClass: string;
	courseType: string;
	duration: number;
}

export interface ApiEnrollment {
	id: string;
	orderId: string;
	orderName: string | null;
	lineItemId: string;
	shopifyLineItemId?: string | null;
	internalLineItemId?: string | null;
	productId: string | null;
	variantId?: string | null;
	productTitle: string | null;
	variantTitle: string | null;
	quantity: number;
	customerEmail: string;
	customerDisplayName: string | null;
	participants: ApiParticipant[];
	/** @deprecated use participants[0] */
	firstName: string | null;
	/** @deprecated use participants[0] */
	lastName: string | null;
	/** @deprecated use participants[0] */
	phone: string | null;
	/** @deprecated use participants[0] */
	fiscalCode: string | null;
	vatNumber: string | null;
	courseClass: string | null;
	enrollmentType: ApiEnrollmentType | null;
	preferredDate: string | null;
	endDate?: string | null;
	notes: string | null;
	submittedAt: string | null;
	status: 'PENDING' | 'SUBMITTED' | 'COMPLETED';
	createdAt: string;
	updatedAt: string;
}

interface ApiResponse {
	data: ApiEnrollment[];
	meta: {
		total: number;
		page: number;
		limit: number;
		pages: number;
	};
}

export interface SyncResult {
	enrollmentsFound: number;
	enrollmentsCreated: number;
	subscribersCreated: number;
	errors: number;
}

// ── Webhook secret management ─────────────────────────────────────────────────

export async function getWebhookSecret(): Promise<string | null> {
	return (await getSetting('webhook_enrollment_secret')) || null;
}

export async function regenerateWebhookSecret(): Promise<string> {
	const secret = randomBytes(32).toString('hex');
	await setSettings({ webhook_enrollment_secret: secret });
	return secret;
}

// ── Enrollment API settings management ────────────────────────────────────────

export interface EnrollmentApiConfig {
	url: string | null;
	key: string | null;
}

export async function getEnrollmentApiConfig(): Promise<EnrollmentApiConfig> {
	const { enrollment_api_url: url, enrollment_api_key: key } = await getSettings();
	return { url: url || null, key: key || null };
}

// ── Sync lock ─────────────────────────────────────────────────────────────────

/** Timeout of each request to the external enrollment API. */
export const ENROLLMENT_API_TIMEOUT_MS = 30_000;

export class EnrollmentSyncInProgressError extends Error {
	constructor() {
		super('Una sincronizzazione delle iscrizioni è già in corso. Riprova tra qualche minuto.');
		this.name = 'EnrollmentSyncInProgressError';
	}
}

let syncInProcess = false;

/**
 * Runs `fn` while holding the enrollment sync lock.
 *
 * Uses a MySQL named lock (`GET_LOCK`) on a dedicated pool connection, so it also works
 * with several replicas and is released automatically by the server if the process dies
 * (a `running` row in `enrollment_sync_log` would stay stale after a crash). The name is
 * prefixed with the current schema so different databases on the same server do not clash.
 * An in-process flag avoids borrowing a pool connection for a sync that would be refused.
 */
async function withEnrollmentSyncLock<T>(fn: () => Promise<T>): Promise<T> {
	if (syncInProcess) throw new EnrollmentSyncInProgressError();
	syncInProcess = true;

	try {
		const connection = await db.$client.getConnection();
		try {
			const [rows] = await connection.query<RowDataPacket[]>(
				"SELECT GET_LOCK(CONCAT(DATABASE(), ':enrollment_sync'), 0) AS acquired"
			);
			if (Number(rows[0]?.acquired) !== 1) throw new EnrollmentSyncInProgressError();

			try {
				return await fn();
			} finally {
				await connection
					.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':enrollment_sync'))")
					.catch((err) => console.error('[enrollments] failed to release sync lock', err));
			}
		} finally {
			connection.release();
		}
	} finally {
		syncInProcess = false;
	}
}

async function fetchEnrollmentPage(url: URL, apiKey: string): Promise<ApiResponse> {
	let response: Response;
	try {
		response = await fetch(url.toString(), {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(ENROLLMENT_API_TIMEOUT_MS)
		});
	} catch (err) {
		if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
			throw new Error(
				`Timeout API iscrizioni: nessuna risposta entro ${ENROLLMENT_API_TIMEOUT_MS / 1000} secondi`
			);
		}
		throw err;
	}

	if (!response.ok) {
		throw new Error(`Errore API: ${response.status} ${response.statusText}`);
	}

	return (await response.json()) as ApiResponse;
}

// ── Core sync logic ───────────────────────────────────────────────────────────

/**
 * Imports the COMPLETED enrollments from the external API.
 * Throws `EnrollmentSyncInProgressError` if another sync (in any replica) is running.
 */
export async function syncEnrollments(
	triggeredBy: 'manual' | 'scheduled' = 'manual'
): Promise<SyncResult> {
	const { url: apiUrl, key: apiKey } = await getEnrollmentApiConfig();

	if (!apiUrl || !apiKey) {
		throw new Error('URL e chiave API iscrizioni devono essere configurati nelle impostazioni');
	}

	return withEnrollmentSyncLock(() => runEnrollmentSync(apiUrl, apiKey, triggeredBy));
}

async function runEnrollmentSync(
	apiUrl: string,
	apiKey: string,
	triggeredBy: 'manual' | 'scheduled'
): Promise<SyncResult> {
	// Create sync log entry
	const [logEntry] = await db
		.insert(enrollmentSyncLog)
		.values({ triggeredBy, status: 'running' })
		.$returningId();
	const logId = logEntry.id;

	const result: SyncResult = {
		enrollmentsFound: 0,
		enrollmentsCreated: 0,
		subscribersCreated: 0,
		errors: 0
	};

	try {
		let page = 1;
		let totalPages = 1;
		const limit = 100;

		while (page <= totalPages) {
			const url = new URL(`${apiUrl}/api/v1/enrollments`);
			url.searchParams.set('status', 'COMPLETED');
			url.searchParams.set('page', String(page));
			url.searchParams.set('limit', String(limit));

			const body = await fetchEnrollmentPage(url, apiKey);
			totalPages = body.meta.pages;
			result.enrollmentsFound += body.data.length;

			for (const item of body.data) {
				try {
					await processEnrollment(item, result);
				} catch (err) {
					console.error('[enrollments] failed to process enrollment', item.id, err);
					result.errors++;
				}
			}

			page++;
		}

		await db
			.update(enrollmentSyncLog)
			.set({
				status: 'success',
				completedAt: new Date(),
				enrollmentsFound: result.enrollmentsFound,
				enrollmentsCreated: result.enrollmentsCreated,
				subscribersCreated: result.subscribersCreated,
				errors: result.errors
			})
			.where(eq(enrollmentSyncLog.id, logId));
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await db
			.update(enrollmentSyncLog)
			.set({
				status: 'error',
				completedAt: new Date(),
				enrollmentsFound: result.enrollmentsFound,
				enrollmentsCreated: result.enrollmentsCreated,
				subscribersCreated: result.subscribersCreated,
				errors: result.errors,
				errorMsg: msg
			})
			.where(eq(enrollmentSyncLog.id, logId));
		throw err;
	}

	return result;
}

// ── Webhook enrollment processing ─────────────────────────────────────────────

export async function processWebhookEnrollment(item: ApiEnrollment): Promise<SyncResult> {
	// Ignora solo gli enrollment ancora PENDING.
	// I webhook SUBMITTED devono essere persistiti per mostrare subito il corso associato.
	if (item.status === 'PENDING') {
		console.log(`[webhook] Ignorato enrollment ${item.id} - stato: ${item.status}`);
		return {
			enrollmentsFound: 1,
			enrollmentsCreated: 0,
			subscribersCreated: 0,
			errors: 0
		};
	}

	const [logEntry] = await db
		.insert(enrollmentSyncLog)
		.values({ triggeredBy: 'webhook', status: 'running' })
		.$returningId();
	const logId = logEntry.id;

	const result: SyncResult = {
		enrollmentsFound: 1,
		enrollmentsCreated: 0,
		subscribersCreated: 0,
		errors: 0
	};

	try {
		await processEnrollment(item, result, true);

		await db
			.update(enrollmentSyncLog)
			.set({
				status: 'success',
				completedAt: new Date(),
				enrollmentsFound: 1,
				enrollmentsCreated: result.enrollmentsCreated,
				subscribersCreated: result.subscribersCreated,
				errors: result.errors
			})
			.where(eq(enrollmentSyncLog.id, logId));
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		result.errors++;
		await db
			.update(enrollmentSyncLog)
			.set({
				status: 'error',
				completedAt: new Date(),
				enrollmentsFound: 1,
				errors: result.errors,
				errorMsg: msg
			})
			.where(eq(enrollmentSyncLog.id, logId));
		throw err;
	}

	return result;
}

// ── Single enrollment processing ──────────────────────────────────────────────

/**
 * Processes one enrollment from the API.
 *
 * When `participants[]` is non-empty (SUBMITTED / COMPLETED), one subscriber
 * and one enrollment row are created **per participant**, using the participant's
 * own anagrafica data and a composite externalId (`item.id + '_' + index`).
 *
 * When `participants[]` is empty (PENDING or legacy flat-field enrollments),
 * the original single-row behaviour is preserved using `externalId = item.id`.
 *
 * Each row (subscriber + enrollment) is written in its own transaction, so a failure
 * never leaves an orphan subscriber behind; counters are updated only after commit.
 */
export async function processEnrollment(
	item: ApiEnrollment,
	result: SyncResult,
	upsert = false
): Promise<void> {
	const participants = item.participants ?? [];

	if (participants.length > 0) {
		for (const p of participants) {
			await upsertEnrollmentRow(buildParticipantTarget(item, p), result, upsert);
		}
	} else {
		// Backward compat / PENDING: use flat deprecated fields + externalId = item.id
		await upsertEnrollmentRow(buildFlatTarget(item), result, upsert);
	}
}

function getCourseName(item: ApiEnrollment): string | null {
	return item.variantTitle ?? item.productTitle ?? item.enrollmentType?.name ?? null;
}

function getCourseStartDate(item: ApiEnrollment): Date | null {
	return item.preferredDate ? new Date(item.preferredDate) : null;
}

function getCourseEndDate(item: ApiEnrollment): Date | null {
	return item.endDate ? new Date(item.endDate) : null;
}

function getParticipantPhone(item: ApiEnrollment, participant: ApiParticipant): string | null {
	return item.phone ?? participant.phone ?? null;
}

function getParticipantFiscalCode(item: ApiEnrollment, participant: ApiParticipant): string | null {
	return item.fiscalCode ?? participant.fiscalCode ?? null;
}

function getShopifyLineItemId(item: ApiEnrollment): string | null {
	return item.shopifyLineItemId ?? item.lineItemId;
}

function getInternalLineItemId(item: ApiEnrollment): string | null {
	return item.internalLineItemId ?? item.lineItemId;
}

/** Enrollment columns written on both insert and update (i.e. all but identity/creation). */
export type EnrollmentRowValues = Omit<
	NewEnrollment,
	'id' | 'externalId' | 'subscriberId' | 'externalCreatedAt' | 'createdAt' | 'updatedAt'
>;

/** Subscriber anagrafica copied from the enrollment on create and update. */
export type SubscriberRowValues = Pick<
	NewSubscriber,
	| 'firstName'
	| 'lastName'
	| 'email'
	| 'phone'
	| 'taxId'
	| 'courseName'
	| 'courseStartDate'
	| 'courseEndDate'
>;

interface EnrollmentPerson {
	customerEmail: string;
	firstName: string | null;
	lastName: string | null;
	phone: string | null;
	fiscalCode: string | null;
	quantity: number;
}

export interface EnrollmentTarget {
	externalId: string;
	enrollment: EnrollmentRowValues;
	externalCreatedAt: Date;
	subscriber: SubscriberRowValues;
	/** Legacy flat enrollments reuse an existing subscriber with the same email on first import. */
	matchSubscriberByEmail: boolean;
}

/** Single mapping from the API payload to the `enrollments` columns. */
export function buildEnrollmentValues(
	item: ApiEnrollment,
	person: EnrollmentPerson
): EnrollmentRowValues {
	return {
		orderId: item.orderId,
		orderName: item.orderName ?? null,
		lineItemId: item.lineItemId,
		shopifyLineItemId: getShopifyLineItemId(item),
		internalLineItemId: getInternalLineItemId(item),
		productId: item.productId ?? null,
		variantId: item.variantId ?? null,
		productTitle: item.productTitle ?? null,
		variantTitle: item.variantTitle ?? null,
		quantity: person.quantity,
		customerEmail: person.customerEmail,
		customerDisplayName: item.customerDisplayName ?? null,
		firstName: person.firstName,
		lastName: person.lastName,
		phone: person.phone,
		fiscalCode: person.fiscalCode,
		vatNumber: item.vatNumber ?? null,
		startDate: getCourseStartDate(item),
		endDate: getCourseEndDate(item),
		courseDurationDays: item.enrollmentType?.duration ?? null,
		courseClass: item.courseClass ?? item.enrollmentType?.courseClass ?? null,
		enrollmentTypeId: item.enrollmentType?.id ?? null,
		enrollmentTypeName: item.enrollmentType?.name ?? null,
		enrollmentTypeCourseType: item.enrollmentType?.courseType ?? null,
		notes: item.notes ?? null,
		submittedAt: item.submittedAt ? new Date(item.submittedAt) : null,
		status: item.status,
		externalUpdatedAt: new Date(item.updatedAt)
	};
}

export function buildParticipantTarget(
	item: ApiEnrollment,
	participant: ApiParticipant
): EnrollmentTarget {
	const email = participant.email ?? item.customerEmail;
	const phone = getParticipantPhone(item, participant);
	const fiscalCode = getParticipantFiscalCode(item, participant);

	return {
		externalId: `${item.id}_${participant.index}`,
		enrollment: buildEnrollmentValues(item, {
			customerEmail: email,
			firstName: participant.firstName,
			lastName: participant.lastName,
			phone,
			fiscalCode,
			quantity: 1
		}),
		externalCreatedAt: new Date(item.createdAt),
		subscriber: {
			firstName: participant.firstName,
			lastName: participant.lastName,
			email,
			phone,
			taxId: fiscalCode,
			courseName: getCourseName(item),
			courseStartDate: getCourseStartDate(item),
			courseEndDate: getCourseEndDate(item)
		},
		// First sync: always a fresh subscriber for each participant
		matchSubscriberByEmail: false
	};
}

export function buildFlatTarget(item: ApiEnrollment): EnrollmentTarget {
	return {
		externalId: item.id,
		enrollment: buildEnrollmentValues(item, {
			customerEmail: item.customerEmail,
			firstName: item.firstName ?? null,
			lastName: item.lastName ?? null,
			phone: item.phone ?? null,
			fiscalCode: item.fiscalCode ?? null,
			quantity: item.quantity
		}),
		externalCreatedAt: new Date(item.createdAt),
		subscriber: {
			firstName: item.firstName ?? item.customerDisplayName?.split(' ')[0] ?? '',
			lastName: item.lastName ?? (item.customerDisplayName?.split(' ').slice(1).join(' ') || ''),
			email: item.customerEmail,
			phone: item.phone ?? null,
			taxId: item.fiscalCode ?? null,
			courseName: getCourseName(item),
			courseStartDate: getCourseStartDate(item),
			courseEndDate: getCourseEndDate(item)
		},
		matchSubscriberByEmail: true
	};
}

async function createSubscriber(tx: DbTransaction, values: SubscriberRowValues): Promise<number> {
	const [newSub] = await tx
		.insert(subscribers)
		.values({ ...values, status: 'active' })
		.$returningId();
	return newSub.id;
}

async function updateSubscriber(
	tx: DbTransaction,
	subscriberId: number,
	values: SubscriberRowValues
): Promise<void> {
	await tx.update(subscribers).set(values).where(eq(subscribers.id, subscriberId));
}

/**
 * Creates or (with `upsert`) updates one enrollment row and its subscriber atomically.
 *
 * The existing row is read `FOR UPDATE`, so a webhook and a sync touching the same
 * `externalId` are serialized; the insert uses `ON DUPLICATE KEY UPDATE` on the unique
 * `external_id` as a last line of defence against a concurrent first insert.
 */
async function upsertEnrollmentRow(
	target: EnrollmentTarget,
	result: SyncResult,
	upsert: boolean
): Promise<void> {
	const counters = await db.transaction(async (tx) => {
		const created = { enrollments: 0, subscribers: 0 };

		const [existing] = await tx
			.select({ id: enrollments.id, subscriberId: enrollments.subscriberId })
			.from(enrollments)
			.where(eq(enrollments.externalId, target.externalId))
			.limit(1)
			.for('update');

		if (existing && !upsert) return created;

		let subscriberId: number | null = existing?.subscriberId ?? null;

		if (subscriberId) {
			// Reuse the subscriber already linked to this enrollment row
			await updateSubscriber(tx, subscriberId, target.subscriber);
		} else if (!existing && target.matchSubscriberByEmail) {
			const [existingSub] = await tx
				.select({ id: subscribers.id })
				.from(subscribers)
				.where(eq(subscribers.email, target.subscriber.email))
				.limit(1);

			if (existingSub) {
				subscriberId = existingSub.id;
				if (upsert) await updateSubscriber(tx, subscriberId, target.subscriber);
			}
		}

		if (!subscriberId) {
			subscriberId = await createSubscriber(tx, target.subscriber);
			created.subscribers++;
		}

		const values = { ...target.enrollment, subscriberId };
		await tx
			.insert(enrollments)
			.values({
				...values,
				externalId: target.externalId,
				externalCreatedAt: target.externalCreatedAt
			})
			.onDuplicateKeyUpdate({ set: values });

		if (!existing) created.enrollments++;
		return created;
	});

	result.enrollmentsCreated += counters.enrollments;
	result.subscribersCreated += counters.subscribers;
}
