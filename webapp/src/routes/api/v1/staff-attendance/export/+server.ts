import { and, asc, eq, gte, lt, type SQL } from 'drizzle-orm';
import { formatInTimeZone } from 'date-fns-tz';
import type { RequestHandler } from './$types';
import { db } from '$lib/db';
import { staffAttendance, users } from '$lib/db/schema';
import { AuthError, isStaffManager } from '$lib/services/auth';
import { authErrorResponse, badRequest, forbidden, serverError } from '$lib/utils/api';
import { toCsv } from '$lib/utils/csv';
import { isDateKey, romeDayRange, TIMEZONE } from '$lib/utils/date';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/staff-attendance/export');

type ExportFilters = { from?: string; to?: string; email?: string };

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
		if (!isDateKey(from) || !isDateKey(to) || from > to) {
			return { ok: false, message: 'Range di date non valido.' };
		}
		return { ok: true, filters: { from, to } };
	}
	if (!email?.includes('@')) return { ok: false, message: 'Email non valida.' };
	return { ok: true, filters: { email } };
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
		if (!isStaffManager(actor)) {
			return forbidden('Operazione non consentita');
		}
		const parsed = parseExportFilters(url);
		if (!parsed.ok) return badRequest(parsed.message);

		const conditions: SQL[] = [];
		if (parsed.filters.email) conditions.push(eq(users.email, parsed.filters.email));
		if (parsed.filters.from && parsed.filters.to) {
			const { start, end } = romeDayRange(parsed.filters.from, parsed.filters.to);
			conditions.push(gte(staffAttendance.readTimestamp, start));
			conditions.push(lt(staffAttendance.readTimestamp, end));
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
		const lines = rows.map((row) => [
			row.name,
			row.email,
			row.eventType === 'entry' ? 'Ingresso' : 'Uscita',
			formatInTimeZone(row.readTimestamp, TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
			sourceLabel(row.source),
			row.deviceId,
			row.offlineQueued ? 'Sì' : 'No',
			row.isBackdated ? 'Sì' : 'No',
			row.note
		]);

		const suffix = parsed.filters.email
			? filenameSuffix(parsed.filters.email)
			: `${parsed.filters.from!.replaceAll('-', '')}-${parsed.filters.to!.replaceAll('-', '')}`;
		return new Response(toCsv(headers, lines), {
			headers: {
				'Content-Type': 'text/csv; charset=utf-8',
				'Content-Disposition': `attachment; filename="staff-attendance-${suffix}.csv"`
			}
		});
	} catch (error) {
		if (error instanceof AuthError) return authErrorResponse(error);
		log.error('Request failed', { err: error });
		return serverError('Errore interno');
	}
};
