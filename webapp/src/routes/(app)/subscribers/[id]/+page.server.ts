import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/db';
import { subscribers, cardRfid, attendance, enrollments } from '$lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { buildSubscriberCourseAttendanceSummaries } from '$lib/services/subscriber-course-attendance';

export const load: PageServerLoad = async ({ params }) => {
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

export const actions: Actions = {
	update: async ({ request, params }) => {
		const id = Number(params.id);
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'update' });

		const data = await request.formData();

		await db
			.update(subscribers)
			.set({
				firstName: data.get('firstName')?.toString().trim(),
				lastName: data.get('lastName')?.toString().trim(),
				email: data.get('email')?.toString().trim(),
				phone: data.get('phone')?.toString().trim() || null,
				taxId: data.get('taxCode')?.toString().trim() || null,
				status: (data.get('status')?.toString() ?? 'active') as
					| 'active'
					| 'completed'
					| 'suspended'
					| 'cancelled',
				note: data.get('notes')?.toString().trim() || null
			})
			.where(eq(subscribers.id, id));

		return { success: true, action: 'update' };
	},

	updateEnrollmentEndDate: async ({ request, params }) => {
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

		if (rawEndDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawEndDate)) {
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

	delete: async ({ params }) => {
		const id = Number(params.id);
		if (!id) return fail(400, { error: 'ID iscritto mancante', action: 'delete' });

		const [activeCard] = await db
			.select({ id: cardRfid.id })
			.from(cardRfid)
			.where(and(eq(cardRfid.subscriberId, id), eq(cardRfid.status, 'active')))
			.limit(1);

		if (activeCard) {
			return fail(400, {
				error: 'Non puoi eliminare un iscritto con una tessera attiva',
				action: 'delete'
			});
		}

		await db.delete(subscribers).where(eq(subscribers.id, id));
		redirect(303, '/subscribers');
	}
};
