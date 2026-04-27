import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { attendance, enrollments, subscribers } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import {
	buildSubscriberCourseAttendanceSummary,
	getEnrollmentAttendancePeriod,
	type CourseAttendanceResolvableIssue
} from '$lib/services/subscriber-course-attendance';
import { createAuditLogger } from '$lib/services/audit';

const MANUAL_FIX_DEVICE_ID = 'admin_manual_fix';
const MAX_MANUAL_HOURS = 24;

function parseNumericId(value: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		error(400, 'ID non valido');
	}

	return parsed;
}

function getHoursFieldName(entryAttendanceId: number): string {
	return `hours_${entryAttendanceId}`;
}

function parseHours(rawValue: FormDataEntryValue | null): number | null {
	if (typeof rawValue !== 'string') return null;

	const normalized = rawValue.trim().replace(',', '.');
	if (!normalized) return null;

	const hours = Number(normalized);
	if (!Number.isFinite(hours)) return null;

	return hours;
}

function buildResolutionLimits(
	issue: CourseAttendanceResolvableIssue,
	periodEnd: number | null
): { maxMinutes: number | null; maxHours: number | null } {
	const entryAt = new Date(issue.entryAt).getTime();
	const candidateEnds = [
		issue.nextEventAt ? new Date(issue.nextEventAt).getTime() : null,
		periodEnd
	].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

	if (candidateEnds.length === 0) {
		return { maxMinutes: MAX_MANUAL_HOURS * 60, maxHours: MAX_MANUAL_HOURS };
	}

	const nearestBoundary = Math.min(...candidateEnds);
	const maxMinutes = Math.floor((nearestBoundary - entryAt - 1) / 60000);

	if (maxMinutes <= 0) {
		return { maxMinutes: 0, maxHours: 0 };
	}

	return {
		maxMinutes: Math.min(maxMinutes, MAX_MANUAL_HOURS * 60),
		maxHours: Number((Math.min(maxMinutes, MAX_MANUAL_HOURS * 60) / 60).toFixed(2))
	};
}

async function loadResolutionContext(subscriberId: number, enrollmentId: number) {
	const [subscriber] = await db
		.select({
			id: subscribers.id,
			firstName: subscribers.firstName,
			lastName: subscribers.lastName,
			email: subscribers.email
		})
		.from(subscribers)
		.where(eq(subscribers.id, subscriberId))
		.limit(1);

	if (!subscriber) {
		error(404, 'Iscritto non trovato');
	}

	const [enrollment] = await db
		.select({
			id: enrollments.id,
			orderName: enrollments.orderName,
			productTitle: enrollments.productTitle,
			variantTitle: enrollments.variantTitle,
			preferredDate: enrollments.preferredDate,
			status: enrollments.status
		})
		.from(enrollments)
		.where(and(eq(enrollments.id, enrollmentId), eq(enrollments.subscriberId, subscriberId)))
		.limit(1);

	if (!enrollment) {
		error(404, 'Iscrizione non trovata');
	}

	const allAttendance = await db
		.select({
			id: attendance.id,
			cardUid: attendance.cardUid,
			uidRaw: attendance.uidRaw,
			subscriberId: attendance.subscriberId,
			deviceId: attendance.deviceId,
			eventType: attendance.eventType,
			readTimestamp: attendance.readTimestamp
		})
		.from(attendance)
		.where(eq(attendance.subscriberId, subscriberId))
		.orderBy(attendance.readTimestamp, attendance.id);

	const summary = buildSubscriberCourseAttendanceSummary(enrollment, allAttendance);
	const period = getEnrollmentAttendancePeriod(enrollment);

	return {
		subscriber,
		enrollment,
		allAttendance,
		summary,
		period
	};
}

export const load: PageServerLoad = async ({ params, locals }) => {
	await locals.verifyAdmin();

	const subscriberId = parseNumericId(params.id);
	const enrollmentId = parseNumericId(params.enrollmentId);
	const context = await loadResolutionContext(subscriberId, enrollmentId);
	const periodEnd = context.period?.end ?? null;

	return {
		subscriber: context.subscriber,
		enrollment: context.enrollment,
		summary: context.summary,
		resolutionRows: context.summary.resolvableIssues.map((issue) => ({
			...issue,
			fieldName: getHoursFieldName(issue.entryAttendanceId),
			...buildResolutionLimits(issue, periodEnd)
		}))
	};
};

export const actions: Actions = {
	resolve: async (event) => {
		const user = await event.locals.verifyAdmin();
		const subscriberId = parseNumericId(event.params.id);
		const enrollmentId = parseNumericId(event.params.enrollmentId);
		const formData = await event.request.formData();
		const context = await loadResolutionContext(subscriberId, enrollmentId);
		const periodEnd = context.period?.end ?? null;

		if (!context.summary.canCalculate || !context.period) {
			return fail(400, {
				action: 'resolve',
				error: 'Questa iscrizione non ha un periodo valido per il calcolo delle presenze.',
				fieldErrors: {},
				values: {}
			});
		}

		if (context.summary.resolvableIssues.length === 0) {
			redirect(303, `/subscribers/${subscriberId}`);
		}

		const attendanceById = new Map(context.allAttendance.map((row) => [row.id, row]));
		const fieldErrors: Record<string, string> = {};
		const values: Record<string, string> = {};
		const resolutions: Array<{
			entryId: number;
			exitAt: Date;
			durationMinutes: number;
			hours: number;
			cardUid: string;
			uidRaw: string | null;
			subscriberId: number | null;
		}> = [];

		for (const issue of context.summary.resolvableIssues) {
			const fieldName = getHoursFieldName(issue.entryAttendanceId);
			const rawValue = formData.get(fieldName);
			const stringValue = typeof rawValue === 'string' ? rawValue.trim() : '';
			values[fieldName] = stringValue;

			const hours = parseHours(rawValue);
			if (hours === null) {
				fieldErrors[fieldName] = 'Inserisci il numero di ore.';
				continue;
			}

			if (hours <= 0) {
				fieldErrors[fieldName] = 'Le ore devono essere maggiori di zero.';
				continue;
			}

			if (hours > MAX_MANUAL_HOURS) {
				fieldErrors[fieldName] = `Puoi inserire al massimo ${MAX_MANUAL_HOURS} ore.`;
				continue;
			}

			const limits = buildResolutionLimits(issue, periodEnd);
			if (limits.maxHours !== null && hours > limits.maxHours) {
				fieldErrors[fieldName] =
					`Il massimo consentito per questo ingresso è ${limits.maxHours} ore.`;
				continue;
			}

			const entryRow = attendanceById.get(issue.entryAttendanceId);
			if (!entryRow || entryRow.eventType !== 'entry' || !entryRow.cardUid) {
				return fail(409, {
					action: 'resolve',
					error: 'Le anomalie sono cambiate nel frattempo. Ricarica la pagina.',
					fieldErrors: {},
					values
				});
			}

			const durationMinutes = Math.round(hours * 60);
			const exitAt = new Date(new Date(issue.entryAt).getTime() + durationMinutes * 60_000);

			if (issue.nextEventAt && exitAt.getTime() >= new Date(issue.nextEventAt).getTime()) {
				fieldErrors[fieldName] = 'L’uscita calcolata supera il prossimo evento registrato.';
				continue;
			}

			if (periodEnd !== null && exitAt.getTime() >= periodEnd) {
				fieldErrors[fieldName] = 'L’uscita calcolata esce dal mese associato a questo corso.';
				continue;
			}

			resolutions.push({
				entryId: entryRow.id,
				exitAt,
				durationMinutes,
				hours,
				cardUid: entryRow.cardUid,
				uidRaw: entryRow.uidRaw ?? null,
				subscriberId: entryRow.subscriberId ?? null
			});
		}

		if (Object.keys(fieldErrors).length > 0) {
			return fail(400, {
				action: 'resolve',
				error: 'Correggi i valori evidenziati e riprova.',
				fieldErrors,
				values
			});
		}

		const createdAttendance: Array<{
			id: number;
			entryId: number;
			durationMinutes: number;
			hours: number;
		}> = [];

		await db.transaction(async (tx) => {
			for (const resolution of resolutions) {
				const result = await tx.insert(attendance).values({
					cardUid: resolution.cardUid,
					uidRaw: resolution.uidRaw,
					subscriberId: resolution.subscriberId,
					deviceId: MANUAL_FIX_DEVICE_ID,
					eventType: 'exit',
					readTimestamp: resolution.exitAt,
					deviceTimeRaw: resolution.exitAt,
					offlineQueued: false,
					rawPayload: {
						source: 'admin_manual_resolution',
						entryAttendanceId: resolution.entryId,
						enrollmentId,
						durationMinutes: resolution.durationMinutes,
						hours: resolution.hours,
						resolvedByUserId: user.id
					},
					validated: true,
					note: `Correzione manuale ingresso #${resolution.entryId}`
				});

				createdAttendance.push({
					id: Number(result[0].insertId),
					entryId: resolution.entryId,
					durationMinutes: resolution.durationMinutes,
					hours: resolution.hours
				});
			}
		});

		const audit = createAuditLogger(event, user.id);
		await Promise.all(
			createdAttendance.map((record) =>
				audit.log({
					action: 'CREATE',
					entityType: 'attendance',
					entityId: record.id,
					dataAfter: {
						subscriberId,
						enrollmentId,
						entryAttendanceId: record.entryId,
						durationMinutes: record.durationMinutes,
						hours: record.hours,
						deviceId: MANUAL_FIX_DEVICE_ID
					}
				})
			)
		);

		redirect(303, `/subscribers/${subscriberId}`);
	}
};
