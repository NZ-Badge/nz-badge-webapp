import { json } from '@sveltejs/kit';
import { and, asc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { staffAttendance, users } from '$lib/db/schema';
import { AuthError, isStaffManager } from '$lib/services/auth';
import { TIMEZONE } from '$lib/utils/date';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type ExportFilters = { from?: string; to?: string; email?: string };

function addOneDay(dateKey: string): string {
	const date = new Date(`${dateKey}T12:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + 1);
	return date.toISOString().slice(0, 10);
}

function parseExportFilters(
	url: URL
): { ok: true; filters: ExportFilters } | { ok: false; message: string } {
	const from = url.searchParams.get('from')?.trim() || undefined;
	const to = url.searchParams.get('to')?.trim() || undefined;
	const email = url.searchParams.get('email')?.trim() || undefined;
	const hasDateRange = Boolean(from || to);

	if (hasDateRange && email) {
		return { ok: false, message: 'Usa il filtro per date oppure quello per email, non entrambi.' };
	}
	if (!hasDateRange && !email) {
		return { ok: false, message: 'Seleziona un range di date oppure una email.' };
	}
	if (hasDateRange) {
		if (!from || !to) return { ok: false, message: 'Il range richiede entrambe le date.' };
		if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(to) || from > to) {
			return { ok: false, message: 'Range di date non valido.' };
		}
		return { ok: true, filters: { from, to } };
	}
	if (!email?.includes('@')) return { ok: false, message: 'Email non valida.' };
	return { ok: true, filters: { email } };
}

function csvEscape(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value);
	return `"${text.replace(/"/g, '""')}"`;
}

function filenameSuffix(value: string): string {
	return value.toLocaleLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function sourceLabel(source: 'card' | 'manual' | 'simulation'): string {
	return source === 'card' ? 'Card RFID' : source === 'manual' ? 'Manuale' : 'Pulsante Home';
}

export const GET: RequestHandler = async ({ locals, url }) => {
	try {
		const actor = await locals.verifyUser();
		const parsed = parseExportFilters(url);
		if (!parsed.ok) return json({ error: parsed.message }, { status: 400 });

		if (
			parsed.filters.email &&
			!isStaffManager(actor) &&
			parsed.filters.email.toLocaleLowerCase() !== actor.email.toLocaleLowerCase()
		) {
			return json({ error: 'Operazione non consentita' }, { status: 403 });
		}

		const conditions: SQL[] = [];
		if (!isStaffManager(actor)) conditions.push(eq(staffAttendance.userId, actor.id));
		if (parsed.filters.email) conditions.push(eq(users.email, parsed.filters.email));
		if (parsed.filters.from) {
			conditions.push(
				gte(
					staffAttendance.readTimestamp,
					fromZonedTime(`${parsed.filters.from}T00:00:00`, TIMEZONE)
				)
			);
		}
		if (parsed.filters.to) {
			conditions.push(
				lt(
					staffAttendance.readTimestamp,
					fromZonedTime(`${addOneDay(parsed.filters.to)}T00:00:00`, TIMEZONE)
				)
			);
		}

		const rows = await db
			.select({
				name: users.name,
				email: users.email,
				eventType: staffAttendance.eventType,
				readTimestamp: staffAttendance.readTimestamp,
				source: staffAttendance.source,
				deviceId: staffAttendance.deviceId,
				offlineQueued: staffAttendance.offlineQueued,
				isBackdated: staffAttendance.isBackdated,
				note: staffAttendance.note
			})
			.from(staffAttendance)
			.innerJoin(users, eq(staffAttendance.userId, users.id))
			.where(conditions.length ? and(...conditions) : undefined)
			.orderBy(asc(users.name), asc(staffAttendance.readTimestamp), asc(staffAttendance.id));

		const headers = [
			'nome',
			'email',
			'evento',
			'data_ora',
			'sorgente',
			'dispositivo',
			'offline',
			'retrodatato',
			'nota'
		];
		const lines = rows.map((row) =>
			[
				row.name,
				row.email,
				row.eventType === 'entry' ? 'Ingresso' : 'Uscita',
				formatInTimeZone(row.readTimestamp, TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
				sourceLabel(row.source),
				row.deviceId,
				row.offlineQueued ? 'Sì' : 'No',
				row.isBackdated ? 'Sì' : 'No',
				row.note
			]
				.map(csvEscape)
				.join(',')
		);

		const suffix = parsed.filters.email
			? filenameSuffix(parsed.filters.email)
			: `${parsed.filters.from!.replaceAll('-', '')}-${parsed.filters.to!.replaceAll('-', '')}`;
		return new Response([headers.join(','), ...lines].join('\n') + '\n', {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="staff-attendance-${suffix}.csv"`
			}
		});
	} catch (error) {
		if (error instanceof AuthError) {
			return json({ error: error.message }, { status: error.code === 'UNAUTHORIZED' ? 401 : 403 });
		}
		console.error('[staff-attendance/export] request failed:', error);
		return json({ error: 'Errore interno' }, { status: 500 });
	}
};
