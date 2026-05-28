import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { attendance, settings, subscribers, weeklyAttendanceSummaryLog } from '../db/schema';
import * as schema from '../db/schema';
import { calculateAttendanceHours, formatAttendanceMinutes } from './attendance-hours';
import { TIMEZONE } from '../utils/date';

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

function addDays(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function getRomeDateKey(date: Date): string {
	return formatInTimeZone(date, TIMEZONE, 'yyyy-MM-dd');
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
	const saturdayDateKey = getRomeDateKey(referenceDate);
	const weekStartDate = addDays(saturdayDateKey, -5);
	const weekEndDate = addDays(saturdayDateKey, -1);

	return {
		weekStartDate,
		weekEndDate,
		start: fromZonedTime(`${weekStartDate}T00:00:00.000`, TIMEZONE),
		end: fromZonedTime(`${saturdayDateKey}T00:00:00.000`, TIMEZONE)
	};
}

function formatDateTime(value: Date | string): string {
	return formatInTimeZone(value, TIMEZONE, 'dd/MM/yyyy HH:mm');
}

function formatDate(value: string): string {
	const [year, month, day] = value.split('-');
	return `${day}/${month}/${year}`;
}

function dateKeyToDate(value: string): Date {
	return new Date(`${value}T00:00:00.000Z`);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
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

function buildEmail(params: {
	subscriber: SubscriberCandidate;
	weekStartDate: string;
	weekEndDate: string;
	weekRows: AttendanceRow[];
	totalRows: AttendanceRow[];
}): { subject: string; text: string; html: string } {
	const weekCalculation = calculateAttendanceHours(params.weekRows);
	const totalCalculation = calculateAttendanceHours(params.totalRows);
	const fullName = `${params.subscriber.firstName} ${params.subscriber.lastName}`.trim();
	const period = `${formatDate(params.weekStartDate)} - ${formatDate(params.weekEndDate)}`;
	const subject = `Riepilogo presenze ${period}`;
	const eventLines = params.weekRows.map(
		(row) =>
			`- ${formatDateTime(row.readTimestamp)}: ${row.eventType === 'entry' ? 'Ingresso' : 'Uscita'}`
	);
	const sessionLines = weekCalculation.sessions.map(
		(session) =>
			`- ${formatDateTime(session.entryAt)} - ${formatDateTime(session.exitAt)}: ${session.durationLabel}`
	);

	const text = [
		`Ciao ${fullName},`,
		'',
		`questo e' il riepilogo delle presenze dal ${period}.`,
		'',
		'Ingressi e uscite:',
		...(eventLines.length ? eventLines : ['- Nessuna strisciata valida']),
		'',
		'Sessioni calcolate:',
		...(sessionLines.length ? sessionLines : ['- Nessuna sessione completa']),
		'',
		`Monte ore della settimana: ${weekCalculation.totalLabel}`,
		`Monte ore totale fino al ${formatDate(params.weekEndDate)}: ${totalCalculation.totalLabel}`
	].join('\n');

	const eventRows = params.weekRows
		.map(
			(row) =>
				`<tr><td>${escapeHtml(formatDateTime(row.readTimestamp))}</td><td>${
					row.eventType === 'entry' ? 'Ingresso' : 'Uscita'
				}</td></tr>`
		)
		.join('');
	const sessionRows = weekCalculation.sessions
		.map(
			(session) =>
				`<tr><td>${escapeHtml(formatDateTime(session.entryAt))}</td><td>${escapeHtml(
					formatDateTime(session.exitAt)
				)}</td><td>${escapeHtml(session.durationLabel)}</td></tr>`
		)
		.join('');

	const html = `<!doctype html>
<html lang="it">
<body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
	<p>Ciao ${escapeHtml(fullName)},</p>
	<p>questo e' il riepilogo delle presenze dal <strong>${escapeHtml(period)}</strong>.</p>
	<h2 style="font-size: 16px;">Ingressi e uscite</h2>
	<table cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #d1d5db;">
		<thead><tr><th align="left">Data/ora</th><th align="left">Evento</th></tr></thead>
		<tbody>${eventRows || '<tr><td colspan="2">Nessuna strisciata valida</td></tr>'}</tbody>
	</table>
	<h2 style="font-size: 16px;">Sessioni calcolate</h2>
	<table cellpadding="6" cellspacing="0" style="border-collapse: collapse; border: 1px solid #d1d5db;">
		<thead><tr><th align="left">Ingresso</th><th align="left">Uscita</th><th align="left">Durata</th></tr></thead>
		<tbody>${sessionRows || '<tr><td colspan="3">Nessuna sessione completa</td></tr>'}</tbody>
	</table>
	<p><strong>Monte ore della settimana:</strong> ${escapeHtml(weekCalculation.totalLabel)}</p>
	<p><strong>Monte ore totale fino al ${escapeHtml(formatDate(params.weekEndDate))}:</strong> ${escapeHtml(
		totalCalculation.totalLabel
	)}</p>
</body>
</html>`;

	return { subject, text, html };
}

async function isEnabled(database: AppDb): Promise<boolean> {
	const [setting] = await database
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, 'weekly_attendance_summary_enabled'))
		.limit(1);

	return setting?.value === 'true';
}

async function recordLog(
	database: AppDb,
	params: {
		existingId?: number;
		weekStartDate: string;
		weekEndDate: string;
		subscriberId: number;
		recipientEmail: string;
		status: 'sent' | 'skipped' | 'error';
		errorMsg?: string | null;
	}
): Promise<void> {
	const values = {
		weekStartDate: dateKeyToDate(params.weekStartDate),
		weekEndDate: dateKeyToDate(params.weekEndDate),
		subscriberId: params.subscriberId,
		recipientEmail: params.recipientEmail,
		status: params.status,
		sentAt: params.status === 'sent' ? new Date() : null,
		errorMsg: params.errorMsg ?? null
	};

	if (params.existingId) {
		await database
			.update(weeklyAttendanceSummaryLog)
			.set(values)
			.where(eq(weeklyAttendanceSummaryLog.id, params.existingId));
		return;
	}

	await database.insert(weeklyAttendanceSummaryLog).values(values);
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

		const email = buildEmail({
			subscriber,
			weekStartDate: week.weekStartDate,
			weekEndDate: week.weekEndDate,
			weekRows: weekRowsBySubscriber.get(subscriber.id) ?? [],
			totalRows: totalRowsBySubscriber.get(subscriber.id) ?? []
		});

		try {
			if (transport) {
				await transport.sendMail({
					from: mailConfig!.from,
					to: subscriber.email,
					subject: email.subject,
					text: email.text,
					html: email.html
				});
			}

			if (!options.dryRun) {
				await recordLog(database, {
					existingId: existing?.id,
					weekStartDate: week.weekStartDate,
					weekEndDate: week.weekEndDate,
					subscriberId: subscriber.id,
					recipientEmail: subscriber.email,
					status: 'sent'
				});
			}
			sent += 1;
		} catch (err) {
			errors += 1;
			if (!options.dryRun) {
				await recordLog(database, {
					existingId: existing?.id,
					weekStartDate: week.weekStartDate,
					weekEndDate: week.weekEndDate,
					subscriberId: subscriber.id,
					recipientEmail: subscriber.email,
					status: 'error',
					errorMsg: err instanceof Error ? err.message : 'Errore sconosciuto'
				});
			}
		}
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
