import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { formatInTimeZone } from 'date-fns-tz';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { attendance, subscribers, weeklyAttendanceSummaryLog } from '../db/schema';
import * as schema from '../db/schema';
import { buildWeeklySummaryEmail } from './weekly-attendance-summary-email';
import { readSettings } from './settings-schema';
import { addDaysToDateKey, romeDateKey, romeDayStart, TIMEZONE } from '../utils/date';

type AppDb = MySql2Database<typeof schema>;

interface AttendanceRow {
	id: number;
	eventType: 'entry' | 'exit';
	readTimestamp: Date | string;
	cardUid?: string | null;
	uidRaw?: string | null;
	subscriberId?: number | null;
	deviceId?: string | null;
}

interface SubscriberCandidate {
	id: number;
	firstName: string;
	lastName: string;
	email: string;
}

interface MailConfig {
	host: string;
	port: number;
	secure: boolean;
	user?: string;
	pass?: string;
	from: string;
}

export interface WeeklyAttendanceSummaryOptions {
	referenceDate?: Date;
	force?: boolean;
	dryRun?: boolean;
	env?: Record<string, string | undefined>;
}

export interface WeeklyAttendanceSummaryRunResult {
	status: 'disabled' | 'not_due' | 'completed';
	weekStartDate?: string;
	weekEndDate?: string;
	candidates: number;
	sent: number;
	skipped: number;
	errors: number;
}

function getRomeIsoDay(date: Date): number {
	return Number(formatInTimeZone(date, TIMEZONE, 'i'));
}

function getWeekWindow(referenceDate: Date): {
	weekStartDate: string;
	weekEndDate: string;
	start: Date;
	end: Date;
} {
	const saturdayDateKey = romeDateKey(referenceDate);
	const weekStartDate = addDaysToDateKey(saturdayDateKey, -5);
	const weekEndDate = addDaysToDateKey(saturdayDateKey, -1);

	return {
		weekStartDate,
		weekEndDate,
		start: romeDayStart(weekStartDate),
		end: romeDayStart(saturdayDateKey)
	};
}

function dateKeyToDate(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`);
}

function getMailConfig(env: Record<string, string | undefined>): MailConfig {
	const host = env.SMTP_HOST;
	const from = env.MAIL_FROM;

	if (!host || !from) {
		throw new Error('SMTP_HOST e MAIL_FROM sono obbligatori per inviare i riepiloghi via email');
	}

	const port = Number(env.SMTP_PORT ?? 587);
	if (!Number.isInteger(port) || port < 1) {
		throw new Error('SMTP_PORT non valido');
	}

	return {
		host,
		port,
		secure: env.SMTP_SECURE === 'true' || port === 465,
		user: env.SMTP_USER || undefined,
		pass: env.SMTP_PASS || undefined,
		from
	};
}

function createTransport(config: MailConfig) {
	const options: SMTPTransport.Options = {
		host: config.host,
		port: config.port,
		secure: config.secure
	};

	if (config.user || config.pass) {
		options.auth = {
			user: config.user ?? '',
			pass: config.pass ?? ''
		};
	}

	return nodemailer.createTransport(options);
}

function groupRowsBySubscriber(rows: AttendanceRow[]): Map<number, AttendanceRow[]> {
	const grouped = new Map<number, AttendanceRow[]>();

	for (const row of rows) {
		if (!row.subscriberId) continue;
		const existing = grouped.get(row.subscriberId) ?? [];
		existing.push(row);
		grouped.set(row.subscriberId, existing);
	}

	return grouped;
}

async function isEnabled(database: AppDb): Promise<boolean> {
	return (await readSettings(database)).weekly_attendance_summary_enabled;
}

function isDuplicateKeyError(err: unknown): boolean {
	for (let current: unknown = err; current; current = (current as { cause?: unknown }).cause) {
		if (typeof current === 'object' && (current as { code?: unknown }).code === 'ER_DUP_ENTRY') {
			return true;
		}
		if (typeof current !== 'object') break;
	}
	return false;
}

/**
 * Reserves the log row of a recipient for this week *before* the email is sent, so that
 * two overlapping runs (or a retry after a crash) cannot send the same summary twice.
 *
 * - no row yet: insert it as `pending` (the unique key on subscriber/week settles races);
 * - `error`/`skipped` row: flip it to `pending` only if it still has that status;
 * - `sent` or `pending` row: not reserved. A `pending` row left by a crashed run is not
 *   retried automatically, because the email may already have gone out.
 *
 * Returns the id of the reserved row, or `null` if another run owns it.
 */
async function reserveLogRow(
	database: AppDb,
	params: {
		existing?: { id: number; status: string };
		weekStartDate: string;
		weekEndDate: string;
		subscriberId: number;
		recipientEmail: string;
	}
): Promise<number | null> {
	if (params.existing) {
		if (params.existing.status !== 'error' && params.existing.status !== 'skipped') return null;
		const [result] = await database
			.update(weeklyAttendanceSummaryLog)
			.set({
				status: 'pending',
				recipientEmail: params.recipientEmail,
				sentAt: null,
				errorMsg: null
			})
			.where(
				and(
					eq(weeklyAttendanceSummaryLog.id, params.existing.id),
					eq(weeklyAttendanceSummaryLog.status, params.existing.status as 'error' | 'skipped')
				)
			);
		return result.affectedRows === 1 ? params.existing.id : null;
	}

	try {
		const [result] = await database.insert(weeklyAttendanceSummaryLog).values({
			weekStartDate: dateKeyToDate(params.weekStartDate),
			weekEndDate: dateKeyToDate(params.weekEndDate),
			subscriberId: params.subscriberId,
			recipientEmail: params.recipientEmail,
			status: 'pending',
			sentAt: null,
			errorMsg: null
		});
		return Number(result.insertId);
	} catch (err) {
		if (isDuplicateKeyError(err)) return null;
		throw err;
	}
}

/** Final state of a reserved row once the send attempt is over. */
async function completeLogRow(
	database: AppDb,
	id: number,
	outcome: { status: 'sent' } | { status: 'error'; errorMsg: string }
): Promise<void> {
	await database
		.update(weeklyAttendanceSummaryLog)
		.set(
			outcome.status === 'sent'
				? { status: 'sent', sentAt: new Date(), errorMsg: null }
				: { status: 'error', sentAt: null, errorMsg: outcome.errorMsg }
		)
		.where(eq(weeklyAttendanceSummaryLog.id, id));
}

export async function sendWeeklyAttendanceSummaries(
	database: AppDb,
	options: WeeklyAttendanceSummaryOptions = {}
): Promise<WeeklyAttendanceSummaryRunResult> {
	const referenceDate = options.referenceDate ?? new Date();
	const env = options.env ?? process.env;
	const enabled = await isEnabled(database);

	if (!enabled) {
		return { status: 'disabled', candidates: 0, sent: 0, skipped: 0, errors: 0 };
	}

	if (!options.force && getRomeIsoDay(referenceDate) !== 6) {
		return { status: 'not_due', candidates: 0, sent: 0, skipped: 0, errors: 0 };
	}

	const week = getWeekWindow(referenceDate);
	const weekRows = await database
		.select({
			id: attendance.id,
			eventType: attendance.eventType,
			readTimestamp: attendance.readTimestamp,
			cardUid: attendance.cardUid,
			uidRaw: attendance.uidRaw,
			subscriberId: attendance.subscriberId,
			deviceId: attendance.deviceId,
			subscriberFirstName: subscribers.firstName,
			subscriberLastName: subscribers.lastName,
			subscriberEmail: subscribers.email
		})
		.from(attendance)
		.innerJoin(subscribers, eq(attendance.subscriberId, subscribers.id))
		.where(
			and(
				eq(attendance.validated, true),
				eq(subscribers.status, 'active'),
				gte(attendance.readTimestamp, week.start),
				lt(attendance.readTimestamp, week.end)
			)
		)
		.orderBy(asc(attendance.subscriberId), asc(attendance.readTimestamp), asc(attendance.id));

	const candidatesById = new Map<number, SubscriberCandidate>();
	const normalizedWeekRows: AttendanceRow[] = [];

	for (const row of weekRows) {
		if (!row.subscriberId) continue;
		candidatesById.set(row.subscriberId, {
			id: row.subscriberId,
			firstName: row.subscriberFirstName,
			lastName: row.subscriberLastName,
			email: row.subscriberEmail
		});
		normalizedWeekRows.push(row);
	}

	const candidates = [...candidatesById.values()];
	if (candidates.length === 0) {
		return {
			status: 'completed',
			weekStartDate: week.weekStartDate,
			weekEndDate: week.weekEndDate,
			candidates: 0,
			sent: 0,
			skipped: 0,
			errors: 0
		};
	}

	const existingLogs = await database
		.select({
			id: weeklyAttendanceSummaryLog.id,
			subscriberId: weeklyAttendanceSummaryLog.subscriberId,
			status: weeklyAttendanceSummaryLog.status
		})
		.from(weeklyAttendanceSummaryLog)
		.where(eq(weeklyAttendanceSummaryLog.weekStartDate, dateKeyToDate(week.weekStartDate)));
	const existingBySubscriber = new Map(
		existingLogs.filter((log) => log.subscriberId !== null).map((log) => [log.subscriberId!, log])
	);

	const subscriberIds = candidates.map((candidate) => candidate.id);
	const totalRows = await database
		.select({
			id: attendance.id,
			eventType: attendance.eventType,
			readTimestamp: attendance.readTimestamp,
			cardUid: attendance.cardUid,
			uidRaw: attendance.uidRaw,
			subscriberId: attendance.subscriberId,
			deviceId: attendance.deviceId
		})
		.from(attendance)
		.where(
			and(
				eq(attendance.validated, true),
				inArray(attendance.subscriberId, subscriberIds),
				lt(attendance.readTimestamp, week.end)
			)
		)
		.orderBy(asc(attendance.subscriberId), asc(attendance.readTimestamp), asc(attendance.id));

	const weekRowsBySubscriber = groupRowsBySubscriber(normalizedWeekRows);
	const totalRowsBySubscriber = groupRowsBySubscriber(totalRows);
	const mailConfig = options.dryRun ? null : getMailConfig(env);
	const transport = mailConfig ? createTransport(mailConfig) : null;
	let sent = 0;
	let skipped = 0;
	let errors = 0;

	for (const subscriber of candidates) {
		const existing = existingBySubscriber.get(subscriber.id);
		if (existing?.status === 'sent') {
			skipped += 1;
			continue;
		}

		const email = buildWeeklySummaryEmail({
			subscriber,
			weekStartDate: week.weekStartDate,
			weekEndDate: week.weekEndDate,
			weekRows: weekRowsBySubscriber.get(subscriber.id) ?? [],
			totalRows: totalRowsBySubscriber.get(subscriber.id) ?? []
		});

		if (options.dryRun || !transport) {
			sent += 1;
			continue;
		}

		const logId = await reserveLogRow(database, {
			existing,
			weekStartDate: week.weekStartDate,
			weekEndDate: week.weekEndDate,
			subscriberId: subscriber.id,
			recipientEmail: subscriber.email
		});
		if (logId === null) {
			skipped += 1;
			continue;
		}

		try {
			await transport.sendMail({
				from: mailConfig!.from,
				to: subscriber.email,
				subject: email.subject,
				text: email.text,
				html: email.html
			});
		} catch (err) {
			errors += 1;
			await completeLogRow(database, logId, {
				status: 'error',
				errorMsg: err instanceof Error ? err.message : 'Errore sconosciuto'
			});
			continue;
		}

		await completeLogRow(database, logId, { status: 'sent' });
		sent += 1;
	}

	return {
		status: 'completed',
		weekStartDate: week.weekStartDate,
		weekEndDate: week.weekEndDate,
		candidates: candidates.length,
		sent,
		skipped,
		errors
	};
}
