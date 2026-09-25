import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { db } from '$lib/db';
import { enrollments, subscribers, enrollmentSyncLog } from '$lib/db/schema';
import { eq, like, or, and, desc, gte, isNull } from 'drizzle-orm';
import { romeDateKey } from '$lib/utils/date';
import { requirePageStaff } from '$lib/services/auth';
import { syncEnrollments } from '$lib/services/enrollments';
import { createLogger } from '$lib/server/logger';

const log = createLogger('courses');

const MAX_ROWS = 500;

export const load: PageServerLoad = async ({ url, locals }) => {
	await requirePageStaff(locals);
	const q = url.searchParams.get('q')?.trim() ?? '';
	const status = url.searchParams.get('status') ?? '';
	const showPast = url.searchParams.get('showPast') === '1';

	const filters = [];
	if (q) {
		filters.push(
			or(
				like(enrollments.customerEmail, `%${q}%`),
				like(enrollments.firstName, `%${q}%`),
				like(enrollments.lastName, `%${q}%`),
				like(enrollments.productTitle, `%${q}%`),
				like(enrollments.variantTitle, `%${q}%`),
				like(enrollments.variantId, `%${q}%`),
				like(enrollments.orderName, `%${q}%`)
			)
		);
	}
	if (status && ['PENDING', 'SUBMITTED', 'COMPLETED'].includes(status)) {
		filters.push(eq(enrollments.status, status as 'PENDING' | 'SUBMITTED' | 'COMPLETED'));
	}
	if (!showPast) {
		// Colonna DATE: confronto con la mezzanotte UTC del giorno corrente a Roma.
		const today = new Date(`${romeDateKey(new Date())}T00:00:00.000Z`);
		filters.push(or(isNull(enrollments.startDate), gte(enrollments.startDate, today)));
	}

	const whereClause = filters.length > 0 ? and(...filters) : undefined;

	const [rows, lastSync] = await Promise.all([
		db
			.select({
				id: enrollments.id,
				externalId: enrollments.externalId,
				subscriberId: enrollments.subscriberId,
				orderName: enrollments.orderName,
				variantId: enrollments.variantId,
				productTitle: enrollments.productTitle,
				variantTitle: enrollments.variantTitle,
				quantity: enrollments.quantity,
				customerEmail: enrollments.customerEmail,
				customerDisplayName: enrollments.customerDisplayName,
				firstName: enrollments.firstName,
				lastName: enrollments.lastName,
				startDate: enrollments.startDate,
				fiscalCode: enrollments.fiscalCode,
				phone: enrollments.phone,
				notes: enrollments.notes,
				submittedAt: enrollments.submittedAt,
				status: enrollments.status,
				externalCreatedAt: enrollments.externalCreatedAt,
				subscriberFirstName: subscribers.firstName,
				subscriberLastName: subscribers.lastName
			})
			.from(enrollments)
			.leftJoin(subscribers, eq(enrollments.subscriberId, subscribers.id))
			.where(whereClause)
			.orderBy(desc(enrollments.startDate), enrollments.productTitle, enrollments.variantTitle)
			.limit(MAX_ROWS),
		db
			.select({
				startedAt: enrollmentSyncLog.startedAt,
				completedAt: enrollmentSyncLog.completedAt,
				status: enrollmentSyncLog.status,
				enrollmentsCreated: enrollmentSyncLog.enrollmentsCreated,
				subscribersCreated: enrollmentSyncLog.subscribersCreated
			})
			.from(enrollmentSyncLog)
			.orderBy(desc(enrollmentSyncLog.startedAt))
			.limit(1)
	]);

	return {
		enrollments: rows,
		q,
		status,
		showPast,
		lastSync: lastSync[0] ?? null
	};
};

export const actions: Actions = {
	/** Stessa sincronizzazione di `POST /api/v1/courses/sync`, avviata dalla pagina. */
	sync: async ({ locals }) => {
		await requirePageStaff(locals);
		try {
			const result = await syncEnrollments('manual');
			return { result };
		} catch (err) {
			log.error('Enrollment sync failed', { err });
			return fail(502, {
				message: err instanceof Error ? err.message : 'Sincronizzazione non riuscita'
			});
		}
	}
};
