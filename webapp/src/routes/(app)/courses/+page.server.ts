import type { PageServerLoad } from './$types';
import { db } from '$lib/db';
import { enrollments, subscribers, enrollmentSyncLog } from '$lib/db/schema';
import { eq, like, or, and, desc, gte, isNull } from 'drizzle-orm';

const MAX_ROWS = 500;

export const load: PageServerLoad = async ({ url }) => {
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
				like(enrollments.orderName, `%${q}%`)
			)
		);
	}
	if (status && ['PENDING', 'SUBMITTED', 'COMPLETED'].includes(status)) {
		filters.push(eq(enrollments.status, status as 'PENDING' | 'SUBMITTED' | 'COMPLETED'));
	}
	if (!showPast) {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
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
