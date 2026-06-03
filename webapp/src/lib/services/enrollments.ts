import { randomBytes } from 'node:crypto';
import { db } from '$lib/db';
import { enrollments, enrollmentSyncLog, subscribers, settings } from '$lib/db/schema';
import { eq } from 'drizzle-orm';

// ── API types ─────────────────────────────────────────────────────────────────

export interface ApiParticipant {
	index: number;
	firstName: string;
	lastName: string;
	email: string | null;
	phone: string | null;
	fiscalCode: string | null;
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
	productId: string | null;
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

const WEBHOOK_SECRET_KEY = 'webhook_enrollment_secret';
const ENROLLMENT_API_URL_KEY = 'enrollment_api_url';
const ENROLLMENT_API_KEY_KEY = 'enrollment_api_key';

export async function getWebhookSecret(): Promise<string | null> {
	const [row] = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, WEBHOOK_SECRET_KEY))
		.limit(1);
	return row?.value ?? null;
}

export async function regenerateWebhookSecret(): Promise<string> {
	const secret = randomBytes(32).toString('hex');
	await db
		.insert(settings)
		.values({
			key: WEBHOOK_SECRET_KEY,
			value: secret,
			dataType: 'string',
			description: 'Secret per autenticare le chiamate webhook iscrizioni'
		})
		.onDuplicateKeyUpdate({ set: { value: secret } });
	return secret;
}

// ── Enrollment API settings management ────────────────────────────────────────

export interface EnrollmentApiConfig {
	url: string | null;
	key: string | null;
}

export async function getEnrollmentApiConfig(): Promise<EnrollmentApiConfig> {
	const [urlRow] = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, ENROLLMENT_API_URL_KEY))
		.limit(1);
	const [keyRow] = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, ENROLLMENT_API_KEY_KEY))
		.limit(1);
	return {
		url: urlRow?.value || null,
		key: keyRow?.value || null
	};
}

export async function setEnrollmentApiConfig(url: string, key: string): Promise<void> {
	await db
		.insert(settings)
		.values({
			key: ENROLLMENT_API_URL_KEY,
			value: url,
			dataType: 'string',
			description: 'URL base API esterna iscrizioni'
		})
		.onDuplicateKeyUpdate({ set: { value: url } });

	await db
		.insert(settings)
		.values({
			key: ENROLLMENT_API_KEY_KEY,
			value: key,
			dataType: 'string',
			description: 'API key per autenticazione API esterna iscrizioni'
		})
		.onDuplicateKeyUpdate({ set: { value: key } });
}

// ── Core sync logic ───────────────────────────────────────────────────────────

export async function syncEnrollments(
	triggeredBy: 'manual' | 'scheduled' = 'manual'
): Promise<SyncResult> {
	const { url: apiUrl, key: apiKey } = await getEnrollmentApiConfig();

	if (!apiUrl || !apiKey) {
		throw new Error('URL e chiave API iscrizioni devono essere configurati nelle impostazioni');
	}

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

			const response = await fetch(url.toString(), {
				headers: { Authorization: `Bearer ${apiKey}` }
			});

			if (!response.ok) {
				throw new Error(`Errore API: ${response.status} ${response.statusText}`);
			}

			const body = (await response.json()) as ApiResponse;
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
 */
export async function processEnrollment(
	item: ApiEnrollment,
	result: SyncResult,
	upsert = false
): Promise<void> {
	const participants = item.participants ?? [];

	if (participants.length > 0) {
		for (const p of participants) {
			await processSingleParticipant(item, p, result, upsert);
		}
	} else {
		// Backward compat / PENDING: use flat deprecated fields + externalId = item.id
		await processFlatEnrollment(item, result, upsert);
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

async function createSubscriberFromParticipant(
	item: ApiEnrollment,
	participant: ApiParticipant
): Promise<number> {
	const [newSub] = await db
		.insert(subscribers)
		.values({
			firstName: participant.firstName,
			lastName: participant.lastName,
			email: participant.email ?? item.customerEmail,
			phone: participant.phone ?? null,
			taxId: participant.fiscalCode ?? null,
			courseName: getCourseName(item),
			courseStartDate: getCourseStartDate(item),
			courseEndDate: getCourseEndDate(item),
			status: 'active'
		})
		.$returningId();

	return newSub.id;
}

async function updateSubscriberFromParticipant(
	subscriberId: number,
	item: ApiEnrollment,
	participant: ApiParticipant
): Promise<void> {
	await db
		.update(subscribers)
		.set({
			firstName: participant.firstName,
			lastName: participant.lastName,
			email: participant.email ?? item.customerEmail,
			phone: participant.phone ?? null,
			taxId: participant.fiscalCode ?? null,
			courseName: getCourseName(item),
			courseStartDate: getCourseStartDate(item),
			courseEndDate: getCourseEndDate(item)
		})
		.where(eq(subscribers.id, subscriberId));
}

async function createSubscriberFromFlatEnrollment(item: ApiEnrollment): Promise<number> {
	const [newSub] = await db
		.insert(subscribers)
		.values({
			firstName: item.firstName ?? item.customerDisplayName?.split(' ')[0] ?? '',
			lastName: item.lastName ?? (item.customerDisplayName?.split(' ').slice(1).join(' ') || ''),
			email: item.customerEmail,
			phone: item.phone ?? null,
			taxId: item.fiscalCode ?? null,
			courseName: getCourseName(item),
			courseStartDate: getCourseStartDate(item),
			courseEndDate: getCourseEndDate(item),
			status: 'active'
		})
		.$returningId();

	return newSub.id;
}

async function updateSubscriberFromFlatEnrollment(
	subscriberId: number,
	item: ApiEnrollment
): Promise<void> {
	await db
		.update(subscribers)
		.set({
			firstName: item.firstName ?? item.customerDisplayName?.split(' ')[0] ?? '',
			lastName: item.lastName ?? (item.customerDisplayName?.split(' ').slice(1).join(' ') || ''),
			email: item.customerEmail,
			phone: item.phone ?? null,
			taxId: item.fiscalCode ?? null,
			courseName: getCourseName(item),
			courseStartDate: getCourseStartDate(item),
			courseEndDate: getCourseEndDate(item)
		})
		.where(eq(subscribers.id, subscriberId));
}

async function processSingleParticipant(
	item: ApiEnrollment,
	participant: ApiParticipant,
	result: SyncResult,
	upsert: boolean
): Promise<void> {
	const externalId = `${item.id}_${participant.index}`;

	// Check if this enrollment row already exists to recover its subscriberId (re-sync safety)
	const [existingEnrollment] = await db
		.select({ id: enrollments.id, subscriberId: enrollments.subscriberId })
		.from(enrollments)
		.where(eq(enrollments.externalId, externalId))
		.limit(1);

	let subscriberId: number | null = null;

	if (existingEnrollment) {
		if (!upsert) return;
		// Reuse the subscriber already linked to this enrollment row
		subscriberId = existingEnrollment.subscriberId ?? null;
		if (!subscriberId) {
			subscriberId = await createSubscriberFromParticipant(item, participant);
			result.subscribersCreated++;
		}
	} else {
		// First sync: always create a fresh subscriber for this participant
		// (each participant has their own email from the participants array)
		subscriberId = await createSubscriberFromParticipant(item, participant);
		result.subscribersCreated++;
	}

	if (existingEnrollment) {
		if (subscriberId) {
			await updateSubscriberFromParticipant(subscriberId, item, participant);
		}

		// upsert: aggiorna dati anagrafici e corso
		await db
			.update(enrollments)
			.set({
				subscriberId,
				orderId: item.orderId,
				orderName: item.orderName ?? null,
				lineItemId: item.lineItemId,
				productId: item.productId ?? null,
				productTitle: item.productTitle ?? null,
				variantTitle: item.variantTitle ?? null,
				quantity: 1,
				customerEmail: participant.email ?? item.customerEmail,
				customerDisplayName: item.customerDisplayName ?? null,
				firstName: participant.firstName,
				lastName: participant.lastName,
				phone: participant.phone ?? null,
				fiscalCode: participant.fiscalCode ?? null,
				startDate: getCourseStartDate(item),
				endDate: getCourseEndDate(item),
				courseDurationDays: item.enrollmentType?.duration ?? null,
				notes: item.notes ?? null,
				submittedAt: item.submittedAt ? new Date(item.submittedAt) : null,
				status: item.status,
				externalUpdatedAt: new Date(item.updatedAt)
			})
			.where(eq(enrollments.externalId, externalId));

		return;
	}

	await db.insert(enrollments).values({
		externalId,
		subscriberId,
		orderId: item.orderId,
		orderName: item.orderName ?? null,
		lineItemId: item.lineItemId,
		productId: item.productId ?? null,
		productTitle: item.productTitle ?? null,
		variantTitle: item.variantTitle ?? null,
		quantity: 1,
		customerEmail: participant.email ?? item.customerEmail,
		customerDisplayName: item.customerDisplayName ?? null,
		firstName: participant.firstName,
		lastName: participant.lastName,
		phone: participant.phone ?? null,
		fiscalCode: participant.fiscalCode ?? null,
		startDate: getCourseStartDate(item),
		endDate: getCourseEndDate(item),
		courseDurationDays: item.enrollmentType?.duration ?? null,
		notes: item.notes ?? null,
		submittedAt: item.submittedAt ? new Date(item.submittedAt) : null,
		status: item.status,
		externalCreatedAt: new Date(item.createdAt),
		externalUpdatedAt: new Date(item.updatedAt)
	});

	result.enrollmentsCreated++;
}

async function processFlatEnrollment(
	item: ApiEnrollment,
	result: SyncResult,
	upsert: boolean
): Promise<void> {
	let subscriberId: number | null = null;

	const [existing] = await db
		.select({ id: enrollments.id, subscriberId: enrollments.subscriberId })
		.from(enrollments)
		.where(eq(enrollments.externalId, item.id))
		.limit(1);

	if (existing) {
		if (!upsert) return;

		subscriberId = existing.subscriberId ?? null;
		if (!subscriberId) {
			subscriberId = await createSubscriberFromFlatEnrollment(item);
			result.subscribersCreated++;
		}

		if (subscriberId) {
			await updateSubscriberFromFlatEnrollment(subscriberId, item);
		}

		await db
			.update(enrollments)
			.set({
				subscriberId,
				orderId: item.orderId,
				orderName: item.orderName ?? null,
				lineItemId: item.lineItemId,
				productId: item.productId ?? null,
				productTitle: item.productTitle ?? null,
				variantTitle: item.variantTitle ?? null,
				quantity: item.quantity,
				customerEmail: item.customerEmail,
				customerDisplayName: item.customerDisplayName ?? null,
				firstName: item.firstName ?? null,
				lastName: item.lastName ?? null,
				phone: item.phone ?? null,
				fiscalCode: item.fiscalCode ?? null,
				startDate: getCourseStartDate(item),
				endDate: getCourseEndDate(item),
				courseDurationDays: item.enrollmentType?.duration ?? null,
				notes: item.notes ?? null,
				submittedAt: item.submittedAt ? new Date(item.submittedAt) : null,
				status: item.status,
				externalUpdatedAt: new Date(item.updatedAt)
			})
			.where(eq(enrollments.externalId, item.id));

		return;
	}

	const [existingSub] = await db
		.select({ id: subscribers.id })
		.from(subscribers)
		.where(eq(subscribers.email, item.customerEmail))
		.limit(1);

	if (existingSub) {
		subscriberId = existingSub.id;
		if (upsert) {
			await updateSubscriberFromFlatEnrollment(subscriberId, item);
		}
	} else {
		subscriberId = await createSubscriberFromFlatEnrollment(item);
		result.subscribersCreated++;
	}

	await db.insert(enrollments).values({
		externalId: item.id,
		subscriberId,
		orderId: item.orderId,
		orderName: item.orderName ?? null,
		lineItemId: item.lineItemId,
		productId: item.productId ?? null,
		productTitle: item.productTitle ?? null,
		variantTitle: item.variantTitle ?? null,
		quantity: item.quantity,
		customerEmail: item.customerEmail,
		customerDisplayName: item.customerDisplayName ?? null,
		firstName: item.firstName ?? null,
		lastName: item.lastName ?? null,
		phone: item.phone ?? null,
		fiscalCode: item.fiscalCode ?? null,
		startDate: getCourseStartDate(item),
		endDate: getCourseEndDate(item),
		courseDurationDays: item.enrollmentType?.duration ?? null,
		notes: item.notes ?? null,
		submittedAt: item.submittedAt ? new Date(item.submittedAt) : null,
		status: item.status,
		externalCreatedAt: new Date(item.createdAt),
		externalUpdatedAt: new Date(item.updatedAt)
	});

	result.enrollmentsCreated++;
}
