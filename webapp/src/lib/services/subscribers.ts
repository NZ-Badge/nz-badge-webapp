/**
 * Subscriber write operations shared by the admin pages and the REST API.
 *
 * Deletion policy: subscribers are never hard-deleted. `removeSubscriber` sets
 * `status = 'cancelled'`, so attendance, enrollments, cards and weekly-summary logs keep
 * their link (their FKs are `ON DELETE SET NULL`, a hard delete would silently orphan
 * them). A subscriber with an active card cannot be removed: the card would keep
 * producing attendance for a cancelled subscriber.
 */

import { and, eq } from 'drizzle-orm';
import { z, type ZodError } from 'zod';
import { db } from '$lib/db';
import { cardRfid, subscribers, type Subscriber, type User } from '$lib/db/schema';
import type { DbTransaction } from '$lib/db/types';
import { logAudit } from './audit';
import { dateKeySchema } from '$lib/utils/date';

export const SUBSCRIBER_STATUSES = ['active', 'completed', 'suspended', 'cancelled'] as const;
export type SubscriberStatus = (typeof SUBSCRIBER_STATUSES)[number];

export class SubscriberServiceError extends Error {
	constructor(
		message: string,
		public readonly code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'HAS_ACTIVE_CARD',
		public readonly zodError?: ZodError
	) {
		super(message);
		this.name = 'SubscriberServiceError';
	}
}

const dateKey = dateKeySchema;
// `undefined` = unchanged, `null` = cleared.
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const subscriberCreateSchema = z.object({
	firstName: z.string().trim().min(1).max(100),
	lastName: z.string().trim().min(1).max(100),
	email: z.string().trim().email().max(255),
	phone: optionalText(20),
	// Length only: synced records may hold a VAT number or a foreign code.
	taxId: z.string().trim().toUpperCase().max(16).nullable().optional(),
	courseId: z.number().int().positive().nullable().optional(),
	courseName: optionalText(255),
	purchaseDate: dateKey.nullable().optional(),
	courseStartDate: dateKey.nullable().optional(),
	courseEndDate: dateKey.nullable().optional(),
	status: z.enum(SUBSCRIBER_STATUSES).optional(),
	note: z.string().trim().nullable().optional(),
	shopifyOrderId: z.number().nullable().optional()
});

export const subscriberUpdateSchema = subscriberCreateSchema.partial();

export type SubscriberCreateInput = z.input<typeof subscriberCreateSchema>;
export type SubscriberUpdateInput = z.input<typeof subscriberUpdateSchema>;

type Actor = Pick<User, 'id'>;

const FIELD_LABELS: Record<string, string> = {
	firstName: 'Nome',
	lastName: 'Cognome',
	email: 'Email',
	phone: 'Telefono',
	taxId: 'Codice fiscale',
	status: 'Stato',
	note: 'Note'
};

function validationError(error: ZodError): SubscriberServiceError {
	const fields = [
		...new Set(error.issues.map((issue) => FIELD_LABELS[String(issue.path[0])] ?? issue.path[0]))
	];
	return new SubscriberServiceError(
		`Campi non validi: ${fields.join(', ')}`,
		'VALIDATION_ERROR',
		error
	);
}

function toDate(value: string | null | undefined): Date | null | undefined {
	return value ? new Date(value) : value === null ? null : undefined;
}

function toColumns(
	data: z.output<typeof subscriberUpdateSchema>
): Partial<typeof subscribers.$inferInsert> {
	const columns: Partial<typeof subscribers.$inferInsert> = {
		...data,
		purchaseDate: toDate(data.purchaseDate),
		courseStartDate: toDate(data.courseStartDate),
		courseEndDate: toDate(data.courseEndDate)
	};
	// Drop `undefined` so a partial update never touches omitted columns.
	return Object.fromEntries(
		Object.entries(columns).filter(([, value]) => value !== undefined)
	) as Partial<typeof subscribers.$inferInsert>;
}

function auditSnapshot(row: Subscriber): Record<string, unknown> {
	return row as unknown as Record<string, unknown>;
}

async function selectForUpdate(tx: DbTransaction, id: number): Promise<Subscriber> {
	const [row] = await tx
		.select()
		.from(subscribers)
		.where(eq(subscribers.id, id))
		.limit(1)
		.for('update');
	if (!row) throw new SubscriberServiceError('Iscritto non trovato', 'NOT_FOUND');
	return row;
}

async function selectById(tx: DbTransaction, id: number): Promise<Subscriber> {
	const [row] = await tx.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
	return row;
}

export async function createSubscriber(input: unknown, actor: Actor): Promise<Subscriber> {
	const parsed = subscriberCreateSchema.safeParse(input);
	if (!parsed.success) throw validationError(parsed.error);
	const values = toColumns(parsed.data) as typeof subscribers.$inferInsert;

	return db.transaction(async (tx) => {
		const [{ id }] = await tx.insert(subscribers).values(values).$returningId();
		const created = await selectById(tx, id);
		await logAudit(
			{
				userId: actor.id,
				action: 'CREATE',
				entityType: 'subscriber',
				entityId: id,
				dataAfter: auditSnapshot(created)
			},
			tx
		);
		return created;
	});
}

export async function updateSubscriber(
	id: number,
	input: unknown,
	actor: Actor
): Promise<Subscriber> {
	const parsed = subscriberUpdateSchema.safeParse(input);
	if (!parsed.success) throw validationError(parsed.error);
	const values = toColumns(parsed.data);

	return db.transaction(async (tx) => {
		const before = await selectForUpdate(tx, id);
		if (Object.keys(values).length > 0) {
			await tx.update(subscribers).set(values).where(eq(subscribers.id, id));
		}
		const after = await selectById(tx, id);
		await logAudit(
			{
				userId: actor.id,
				action: 'UPDATE',
				entityType: 'subscriber',
				entityId: id,
				dataBefore: auditSnapshot(before),
				dataAfter: auditSnapshot(after)
			},
			tx
		);
		return after;
	});
}

/** Soft delete: marks the subscriber as `cancelled` (see module comment). */
export async function removeSubscriber(id: number, actor: Actor): Promise<Subscriber> {
	return db.transaction(async (tx) => {
		const before = await selectForUpdate(tx, id);

		const [activeCard] = await tx
			.select({ id: cardRfid.id })
			.from(cardRfid)
			.where(and(eq(cardRfid.subscriberId, id), eq(cardRfid.status, 'active')))
			.limit(1)
			.for('update');
		if (activeCard) {
			throw new SubscriberServiceError(
				'Non puoi eliminare un iscritto con una tessera attiva. Rimuovi prima la tessera dalla pagina Tessere.',
				'HAS_ACTIVE_CARD'
			);
		}

		await tx.update(subscribers).set({ status: 'cancelled' }).where(eq(subscribers.id, id));
		const after = await selectById(tx, id);
		await logAudit(
			{
				userId: actor.id,
				action: 'DELETE',
				entityType: 'subscriber',
				entityId: id,
				dataBefore: auditSnapshot(before),
				dataAfter: { status: 'cancelled', softDelete: true }
			},
			tx
		);
		return after;
	});
}

/**
 * Map the admin subscriber form (SubscriberFormDialog) to the service input.
 * Empty optional fields clear the stored value.
 */
export function subscriberInputFromForm(data: FormData): SubscriberCreateInput {
	const text = (name: string) => data.get(name)?.toString().trim() ?? '';
	const optional = (name: string) => text(name) || null;
	const status = text('status');

	return {
		firstName: text('firstName'),
		lastName: text('lastName'),
		email: text('email'),
		phone: optional('phone'),
		taxId: optional('taxCode'),
		note: optional('notes'),
		status: (status || 'active') as SubscriberStatus
	};
}
