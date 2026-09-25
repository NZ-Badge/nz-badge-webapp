import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requirePageStaff } from '$lib/services/auth';
import { db } from '$lib/db';
import { subscribers, cardRfid, attendance, enrollments } from '$lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { buildSubscriberCourseAttendanceSummaries } from '$lib/services/subscriber-course-attendance';
import {
	removeSubscriber,
	SubscriberServiceError,
	subscriberInputFromForm,
	updateSubscriber
} from '$lib/services/subscribers';
import { isDateKey } from '$lib/utils/date';

export const load: PageServerLoad = async ({ params, locals }) => {
	await requirePageStaff(locals);
	const subscriberId = Number(params.id);
	if (isNaN(subscriberId)) error(400, 'Invalid subscriber ID');

	const [subscriber] = await db
		.select()
		.from(subscribers)
		.where(eq(subscribers.id, subscriberId))
		.limit(1);

	if (!subscriber) error(404, 'Subscriber not found');

	const [cards, recentAttendance, allAttendance, subscriberEnrollments] = await Promise.all([
		db
			.select({
				id: cardRfid.id,
				uid: cardRfid.uid,
				type: cardRfid.type,
				status: cardRfid.status,
				writeDate: cardRfid.writeDate,
				expirationDate: cardRfid.expirationDate,
				writtenByDevice: cardRfid.writtenByDevice
			})
			.from(cardRfid)
			.where(eq(cardRfid.subscriberId, subscriberId))
			.orderBy(desc(cardRfid.writeDate)),
		db
			.select({
				id: attendance.id,
				eventType: attendance.eventType,
				readTimestamp: attendance.readTimestamp,
				deviceId: attendance.deviceId,
				offlineQueued: attendance.offlineQueued
			})
			.from(attendance)
			.where(eq(attendance.subscriberId, subscriberId))
			.orderBy(desc(attendance.readTimestamp))
			.limit(50),
		db
			.select({
				id: attendance.id,
				eventType: attendance.eventType,
				readTimestamp: attendance.readTimestamp
			})
			.from(attendance)
			.where(eq(attendance.subscriberId, subscriberId))
			.orderBy(attendance.readTimestamp),
		db
			.select({
				id: enrollments.id,
				orderName: enrollments.orderName,
				productTitle: enrollments.productTitle,
				variantTitle: enrollments.variantTitle,
				startDate: enrollments.startDate,
				endDate: enrollments.endDate,
				courseDurationDays: enrollments.courseDurationDays,
				status: enrollments.status,
				submittedAt: enrollments.submittedAt,
				notes: enrollments.notes
			})
			.from(enrollments)
			.where(eq(enrollments.subscriberId, subscriberId))
			.orderBy(desc(enrollments.externalCreatedAt))
	]);

	const courseAttendance = buildSubscriberCourseAttendanceSummaries(
		subscriberEnrollments,
		allAttendance
	);

	return {
		subscriber,
		cards,
		recentAttendance,
		enrollments: subscriberEnrollments,
		courseAttendance
	};
};

function actionFailure(err: unknown, action: 'update' | 'delete') {
	if (err instanceof SubscriberServiceError) {
		const status = err.code === 'NOT_FOUND' ? 404 : 400;
		return fail(status, { error: err.message, action });
	}
	throw err;
}

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		const user = await requirePageStaff(locals);
		const id = Number(params.id);
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'update' });

		try {
			await updateSubscriber(id, subscriberInputFromForm(await request.formData()), user);
		} catch (err) {
			return actionFailure(err, 'update');
		}
		return { success: true, action: 'update' };
	},

	updateEnrollmentEndDate: async ({ request, params, locals }) => {
		await requirePageStaff(locals);
		const subscriberId = Number(params.id);
		if (!subscriberId) {
			return fail(400, { error: 'ID iscritto mancante', action: 'updateEnrollmentEndDate' });
		}

		const data = await request.formData();
		const enrollmentId = Number(data.get('enrollmentId'));
		const rawEndDate = data.get('endDate')?.toString().trim() ?? '';

		if (!enrollmentId) {
			return fail(400, { error: 'ID iscrizione mancante', action: 'updateEnrollmentEndDate' });
		}

		if (rawEndDate && !isDateKey(rawEndDate)) {
			return fail(400, {
				error: 'Data fine non valida',
				action: 'updateEnrollmentEndDate',
				enrollmentId,
				endDate: rawEndDate
			});
		}

		const [enrollment] = await db
			.select({ startDate: enrollments.startDate })
			.from(enrollments)
			.where(and(eq(enrollments.id, enrollmentId), eq(enrollments.subscriberId, subscriberId)))
			.limit(1);

		if (!enrollment) {
			return fail(404, {
				error: 'Iscrizione non trovata',
				action: 'updateEnrollmentEndDate',
				enrollmentId
			});
		}

		if (
			rawEndDate &&
			enrollment.startDate &&
			new Date(rawEndDate).getTime() < new Date(enrollment.startDate).getTime()
		) {
			return fail(400, {
				error: 'La data fine non può precedere la data inizio',
				action: 'updateEnrollmentEndDate',
				enrollmentId,
				endDate: rawEndDate
			});
		}

		await db
			.update(enrollments)
			.set({ endDate: rawEndDate ? new Date(rawEndDate) : null })
			.where(and(eq(enrollments.id, enrollmentId), eq(enrollments.subscriberId, subscriberId)));

		return { success: true, action: 'updateEnrollmentEndDate', enrollmentId };
	},

	delete: async ({ params, locals }) => {
		const user = await requirePageStaff(locals);
		const id = Number(params.id);
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'delete' });

		// Soft delete: l'iscritto passa allo stato 'cancelled' (vedi $lib/services/subscribers).
		try {
			await removeSubscriber(id, user);
		} catch (err) {
			return actionFailure(err, 'delete');
		}
		redirect(303, '/subscribers');
	}
};
