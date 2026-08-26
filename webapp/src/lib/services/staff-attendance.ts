import { and, asc, desc, eq, gte, lt, lte, sql } from 'drizzle-orm';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { db } from '$lib/db';
import * as schema from '$lib/db/schema';
import { settings, staffAttendance, users } from '$lib/db/schema';
import type { User } from '$lib/db/schema';
import { calculateAttendanceHours, formatAttendanceMinutes } from './attendance-hours';
import { logAudit } from './audit';
import { TIMEZONE, toDatabaseDateTime } from '$lib/utils/date';
import { isStaffManager, requireSelfOrStaffManager } from './auth';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbOrTx = MySql2Database<typeof schema> | DbTransaction;

export interface StaffAttendanceSettings {
	resetEntryTypeDaily: boolean;
	minSwipeIntervalMinutes: number;
}

export interface StaffAttendanceInputRow {
	id: number;
	eventType: 'entry' | 'exit';
	readTimestamp: Date | string;
}

export interface StaffAttendancePeriodSummary {
	from: string;
	to: string;
	totalMinutes: number;
	totalLabel: string;
	validSessions: number;
	eventCount: number;
	sessions: ReturnType<typeof calculateAttendanceHours>['sessions'];
	issues: ReturnType<typeof calculateAttendanceHours>['issues'];
}

export interface StaffAttendanceReport {
	week: StaffAttendancePeriodSummary;
	month: StaffAttendancePeriodSummary;
	custom: StaffAttendancePeriodSummary;
}

export class StaffAttendanceError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'NOT_FOUND'
			| 'FORBIDDEN'
			| 'INVALID_STATE'
			| 'INVALID_TIMESTAMP'
			| 'TOO_SOON'
	) {
		super(message);
		this.name = 'StaffAttendanceError';
	}
}

function addDays(dateKey: string, days: number): string {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function compareDateKeys(a: string, b: string): number {
	return a.localeCompare(b);
}

export function getRomeDateKey(value: Date | string): string {
	return formatInTimeZone(new Date(value), TIMEZONE, 'yyyy-MM-dd');
}

export function getCurrentWeekDateRange(now: Date = new Date()): { from: string; to: string } {
	const today = getRomeDateKey(now);
	const weekday = new Date(`${today}T12:00:00.000Z`).getUTCDay();
	const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
	const from = addDays(today, -daysFromMonday);
	return { from, to: addDays(from, 6) };
}

export function getCurrentMonthDateRange(now: Date = new Date()): { from: string; to: string } {
	const today = getRomeDateKey(now);
	const from = `${today.slice(0, 7)}-01`;
	const firstOfNextMonth = new Date(`${from}T12:00:00.000Z`);
	firstOfNextMonth.setUTCMonth(firstOfNextMonth.getUTCMonth() + 1);
	return { from, to: addDays(firstOfNextMonth.toISOString().slice(0, 10), -1) };
}

export function normalizeStaffAttendanceRange(
	from: string | null | undefined,
	to: string | null | undefined,
	fallback: { from: string; to: string }
): { from: string; to: string } {
	const datePattern = /^\d{4}-\d{2}-\d{2}$/;
	const normalizedFrom = from && datePattern.test(from) ? from : fallback.from;
	const normalizedTo = to && datePattern.test(to) ? to : fallback.to;

	if (compareDateKeys(normalizedFrom, normalizedTo) > 0) {
		throw new StaffAttendanceError(
			'La data iniziale non può essere successiva alla data finale',
			'INVALID_TIMESTAMP'
		);
	}

	return { from: normalizedFrom, to: normalizedTo };
}

export function getStaffAttendanceRangeBounds(range: { from: string; to: string }): {
	start: Date;
	end: Date;
} {
	return {
		start: fromZonedTime(`${range.from}T00:00:00.000`, TIMEZONE),
		end: fromZonedTime(`${addDays(range.to, 1)}T00:00:00.000`, TIMEZONE)
	};
}

export function parseRomeLocalDateTime(value: string): Date {
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value)) {
		throw new StaffAttendanceError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}
	const parsed = fromZonedTime(value, TIMEZONE);
	if (!Number.isFinite(parsed.getTime())) {
		throw new StaffAttendanceError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}
	return parsed;
}

export function summarizeStaffAttendancePeriod(
	rows: StaffAttendanceInputRow[],
	range: { from: string; to: string }
): StaffAttendancePeriodSummary {
	const calculation = calculateAttendanceHours(rows);
	const dateBounds = getStaffAttendanceRangeBounds(range);
	const bounds = { start: dateBounds.start.getTime(), end: dateBounds.end.getTime() };
	const sessions = calculation.sessions.filter((session) => {
		const entryTime = new Date(session.entryAt).getTime();
		return entryTime >= bounds.start && entryTime < bounds.end;
	});
	const issues = calculation.issues.filter((issue) => {
		if (!issue.timestamp) return false;
		const issueTime = new Date(issue.timestamp).getTime();
		return issueTime >= bounds.start && issueTime < bounds.end;
	});
	const eventCount = rows.filter((row) => {
		const eventTime = new Date(row.readTimestamp).getTime();
		return eventTime >= bounds.start && eventTime < bounds.end;
	}).length;
	const totalMinutes = sessions.reduce((total, session) => total + session.durationMinutes, 0);

	return {
		...range,
		totalMinutes,
		totalLabel: formatAttendanceMinutes(totalMinutes),
		validSessions: sessions.length,
		eventCount,
		sessions,
		issues
	};
}

export function buildStaffAttendanceReport(
	rows: StaffAttendanceInputRow[],
	customRange: { from: string; to: string },
	now: Date = new Date()
): StaffAttendanceReport {
	return {
		week: summarizeStaffAttendancePeriod(rows, getCurrentWeekDateRange(now)),
		month: summarizeStaffAttendancePeriod(rows, getCurrentMonthDateRange(now)),
		custom: summarizeStaffAttendancePeriod(rows, customRange)
	};
}

export async function loadStaffAttendanceSettings(tx?: DbOrTx): Promise<StaffAttendanceSettings> {
	const dbInstance = tx ?? db;
	const rows = await dbInstance
		.select({ key: settings.key, value: settings.value })
		.from(settings)
		.where(sql`${settings.key} IN ('reset_entry_type_daily', 'min_swipe_interval_minutes')`);

	let resetEntryTypeDaily = true;
	let minSwipeIntervalMinutes = 15;
	for (const row of rows) {
		if (row.key === 'reset_entry_type_daily') resetEntryTypeDaily = row.value === 'true';
		if (row.key === 'min_swipe_interval_minutes') {
			const parsed = Number.parseInt(row.value, 10);
			if (Number.isFinite(parsed)) minSwipeIntervalMinutes = parsed;
		}
	}

	return { resetEntryTypeDaily, minSwipeIntervalMinutes };
}

export function determineNextStaffEventTypeFromPrevious(
	previous: { eventType: 'entry' | 'exit'; readTimestamp: Date | string } | null,
	currentTimestamp: Date | string,
	resetEntryTypeDaily: boolean
): 'entry' | 'exit' {
	if (!previous || previous.eventType === 'exit') return 'entry';
	if (!resetEntryTypeDaily) return 'exit';

	return getRomeDateKey(previous.readTimestamp) === getRomeDateKey(currentTimestamp)
		? 'exit'
		: 'entry';
}

export function isManualAttendanceBackdated(readTimestamp: Date, now: Date = new Date()): boolean {
	const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000;
	return readTimestamp.getTime() < currentMinute;
}

export async function determineNextStaffEventType(
	userId: number,
	currentTimestamp: Date | string,
	resetEntryTypeDaily: boolean,
	tx?: DbOrTx
): Promise<'entry' | 'exit'> {
	const dbInstance = tx ?? db;
	const [previous] = await dbInstance
		.select({
			eventType: staffAttendance.eventType,
			readTimestamp: staffAttendance.readTimestamp
		})
		.from(staffAttendance)
		.where(
			and(
				eq(staffAttendance.userId, userId),
				lt(staffAttendance.readTimestamp, toDatabaseDateTime(currentTimestamp))
			)
		)
		.orderBy(desc(staffAttendance.readTimestamp), desc(staffAttendance.id))
		.limit(1);

	return determineNextStaffEventTypeFromPrevious(
		previous ?? null,
		currentTimestamp,
		resetEntryTypeDaily
	);
}

export async function isWithinStaffMinInterval(
	userId: number,
	currentTimestamp: Date | string,
	minIntervalMinutes: number,
	tx?: DbOrTx
): Promise<boolean> {
	if (minIntervalMinutes <= 0) return false;
	const current = new Date(currentTimestamp);
	const minimum = new Date(current.getTime() - minIntervalMinutes * 60_000);
	const dbInstance = tx ?? db;
	const [recent] = await dbInstance
		.select({ id: staffAttendance.id })
		.from(staffAttendance)
		.where(
			and(
				eq(staffAttendance.userId, userId),
				gte(staffAttendance.readTimestamp, minimum),
				lte(staffAttendance.readTimestamp, current)
			)
		)
		.limit(1);

	return Boolean(recent);
}

async function getActiveTargetUser(userId: number, tx?: DbOrTx): Promise<User> {
	const dbInstance = tx ?? db;
	const [target] = await dbInstance.select().from(users).where(eq(users.id, userId)).limit(1);
	if (!target) throw new StaffAttendanceError('Utente non trovato', 'NOT_FOUND');
	if (target.status !== 'active') {
		throw new StaffAttendanceError('L’utente non è attivo', 'INVALID_STATE');
	}
	return target;
}

export async function createManualStaffAttendance(params: {
	actor: User;
	targetUserId: number;
	eventType: 'entry' | 'exit';
	readTimestamp: Date;
	note?: string | null;
}): Promise<typeof staffAttendance.$inferSelect> {
	requireSelfOrStaffManager(params.actor, params.targetUserId);
	if (!Number.isFinite(params.readTimestamp.getTime())) {
		throw new StaffAttendanceError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}

	const now = new Date();
	if (params.readTimestamp.getTime() > now.getTime() + 60_000) {
		throw new StaffAttendanceError(
			'Non è possibile inserire un evento futuro',
			'INVALID_TIMESTAMP'
		);
	}
	await getActiveTargetUser(params.targetUserId);

	const isBackdated = isManualAttendanceBackdated(params.readTimestamp, now);
	const [inserted] = await db.insert(staffAttendance).values({
		userId: params.targetUserId,
		eventType: params.eventType,
		readTimestamp: params.readTimestamp,
		deviceId: 'web-manual',
		source: 'manual',
		createdByUserId: params.actor.id,
		isBackdated,
		note: params.note?.trim() || null,
		validated: true
	});
	const id = Number(inserted.insertId);
	const [created] = await db
		.select()
		.from(staffAttendance)
		.where(eq(staffAttendance.id, id))
		.limit(1);

	await logAudit({
		userId: params.actor.id,
		action: 'CREATE',
		entityType: 'staff_attendance',
		entityId: id,
		dataAfter: {
			targetUserId: params.targetUserId,
			eventType: params.eventType,
			readTimestamp: params.readTimestamp.toISOString(),
			isBackdated,
			source: 'manual'
		}
	});

	return created;
}

export async function simulateStaffAttendance(actor: User): Promise<{
	event: typeof staffAttendance.$inferSelect | null;
	ignored: boolean;
	nextType: 'entry' | 'exit';
	ignoredReason?: string;
}> {
	await getActiveTargetUser(actor.id);
	const now = new Date();
	const attendanceSettings = await loadStaffAttendanceSettings();
	const nextType = await determineNextStaffEventType(
		actor.id,
		now,
		attendanceSettings.resetEntryTypeDaily
	);
	const tooSoon = await isWithinStaffMinInterval(
		actor.id,
		now,
		attendanceSettings.minSwipeIntervalMinutes
	);
	if (tooSoon) {
		return {
			event: null,
			ignored: true,
			nextType,
			ignoredReason: `min_interval_${attendanceSettings.minSwipeIntervalMinutes}min`
		};
	}

	const [inserted] = await db.insert(staffAttendance).values({
		userId: actor.id,
		eventType: nextType,
		readTimestamp: now,
		deviceId: 'web-simulation',
		source: 'simulation',
		createdByUserId: actor.id,
		isBackdated: false,
		validated: true
	});
	const id = Number(inserted.insertId);
	const [created] = await db
		.select()
		.from(staffAttendance)
		.where(eq(staffAttendance.id, id))
		.limit(1);

	await logAudit({
		userId: actor.id,
		action: 'CREATE',
		entityType: 'staff_attendance',
		entityId: id,
		dataAfter: { targetUserId: actor.id, eventType: nextType, source: 'simulation' }
	});

	return { event: created, ignored: false, nextType };
}

export async function updateStaffAttendanceTimestamp(params: {
	actor: User;
	attendanceId: number;
	readTimestamp: Date;
}): Promise<typeof staffAttendance.$inferSelect> {
	if (!isStaffManager(params.actor)) {
		throw new StaffAttendanceError('Operazione non consentita', 'FORBIDDEN');
	}
	if (!Number.isFinite(params.readTimestamp.getTime())) {
		throw new StaffAttendanceError('Data e ora non valide', 'INVALID_TIMESTAMP');
	}
	const [current] = await db
		.select()
		.from(staffAttendance)
		.where(eq(staffAttendance.id, params.attendanceId))
		.limit(1);
	if (!current) throw new StaffAttendanceError('Strisciata non trovata', 'NOT_FOUND');

	await db
		.update(staffAttendance)
		.set({ readTimestamp: params.readTimestamp })
		.where(eq(staffAttendance.id, params.attendanceId));
	const [updated] = await db
		.select()
		.from(staffAttendance)
		.where(eq(staffAttendance.id, params.attendanceId))
		.limit(1);

	await logAudit({
		userId: params.actor.id,
		action: 'UPDATE',
		entityType: 'staff_attendance',
		entityId: params.attendanceId,
		dataBefore: { readTimestamp: current.readTimestamp.toISOString() },
		dataAfter: { readTimestamp: params.readTimestamp.toISOString() }
	});

	return updated;
}

export async function getStaffAttendanceReport(
	userId: number,
	customRange: { from: string; to: string },
	now: Date = new Date()
): Promise<StaffAttendanceReport> {
	const rows = await db
		.select({
			id: staffAttendance.id,
			eventType: staffAttendance.eventType,
			readTimestamp: staffAttendance.readTimestamp
		})
		.from(staffAttendance)
		.where(eq(staffAttendance.userId, userId))
		.orderBy(asc(staffAttendance.readTimestamp), asc(staffAttendance.id));

	return buildStaffAttendanceReport(rows, customRange, now);
}
