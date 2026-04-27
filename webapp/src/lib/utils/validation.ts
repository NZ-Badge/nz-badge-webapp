import { z } from 'zod';

// UID pattern: uppercase hex pairs separated by colons, 4–7 bytes
// e.g. "AA:BB:CC:DD" (4 bytes) up to "AA:BB:CC:DD:EE:FF:GG" (7 bytes)
const UID_PATTERN = /^[A-F0-9]{2}(:[A-F0-9]{2}){3,6}$/;

// 1. attendanceEventSchema (LEGACY - deprecato, da rimuovere in v2)
export const attendanceEventSchema = z.object({
	uid: z.string().regex(UID_PATTERN),
	timestamp: z.string().datetime(),
	event_type: z.enum(['entry', 'exit'])
});

// 1b. attendanceEventSchemaV2 — Schema evento conforme al protocollo
export const attendanceEventSchemaV2 = z.object({
	uid: z.string().regex(UID_PATTERN),
	uid_raw: z.string().regex(/^[A-F0-9]{8,14}$/).optional(),
	timestamp: z.string().datetime(),
	type: z.enum(['entry', 'exit']),
	device_time_raw: z.string().datetime({ offset: true }).optional()
});

// 1c. attendanceEventUnifiedSchema — Schema che accetta entrambi (transizione)
export const attendanceEventUnifiedSchema = z.union([
	attendanceEventSchemaV2,
	attendanceEventSchema.transform((data) => ({
		uid: data.uid,
		timestamp: data.timestamp,
		type: data.event_type === 'entry' ? ('entry' as const) : ('exit' as const)
	}))
]);

// Queue status schema
const queueStatusSchema = z.object({
	pending: z.number().int().min(0),
	storage_free_percent: z.number().int().min(0).max(100)
});

// Batch info schema conforme alle specifiche
const batchInfoSchema = z.object({
	total_queued: z.number().int().min(0),
	batch_sequence: z.number().int().min(1)
});

// 2. attendanceSingleSchema
export const attendanceSingleSchema = z.object({
	events: z.array(attendanceEventSchemaV2).min(1),
	queue_status: queueStatusSchema.optional()
});

// 3. attendanceBatchSchema
export const attendanceBatchSchema = z.object({
	events: z.array(attendanceEventSchemaV2).min(1).max(10),
	batch_info: batchInfoSchema,
	queue_status: queueStatusSchema
});

// 4. shopifyWebhookOrderSchema
export const shopifyWebhookOrderSchema = z
	.object({
		id: z.number(),
		email: z.string().email(),
		line_items: z.array(
			z.object({
				product_id: z.number(),
				variant_id: z.number()
			})
		)
	})
	.passthrough();

// 5. cardWriteSchema
export const cardWriteSchema = z.object({
	subscriber_id: z.number().int().positive()
});

// 6. cardValidateSchema
export const cardValidateSchema = z.object({
	session_token: z.string().uuid(),
	uid: z.string().regex(UID_PATTERN),
	allow_reuse_deleted: z.boolean().optional(),
	sector_data_hash: z.string().optional()
});

// 7. cardDisableSchema (for path param validation)
export const cardDisableSchema = z.object({
	id: z.coerce.number().int().positive()
});

// 8. subscriberCreateSchema
export const subscriberCreateSchema = z.object({
	firstName: z.string().min(1).max(100),
	lastName: z.string().min(1).max(100),
	email: z.string().email(),
	phone: z.string().max(20).optional(),
	taxId: z
		.string()
		.regex(/^[A-Z0-9]{16}$/)
		.optional(),
	courseId: z.number().int().positive().optional(),
	courseName: z.string().max(255).optional(),
	purchaseDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	courseStartDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	courseEndDate: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	status: z.enum(['active', 'completed', 'suspended', 'cancelled']).optional(),
	note: z.string().optional(),
	shopifyOrderId: z.number().optional()
});

// 9. subscriberUpdateSchema — all fields optional
export const subscriberUpdateSchema = subscriberCreateSchema.partial();

// 10. attendanceQuerySchema (query params — use z.coerce for numbers)
export const attendanceQuerySchema = z.object({
	from: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	to: z
		.string()
		.regex(/^\d{4}-\d{2}-\d{2}$/)
		.optional(),
	device_id: z.string().optional(),
	subscriber_id: z.coerce.number().int().positive().optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(50)
});

// 11. cardQuerySchema
export const cardQuerySchema = z.object({
	status: z.enum(['active', 'disabled', 'replaced', 'lost', 'deleted']).optional(),
	subscriber_id: z.coerce.number().int().positive().optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(100)
});

// 12. subscribersQuerySchema
export const subscribersQuerySchema = z.object({
	status: z.enum(['active', 'completed', 'suspended', 'cancelled']).optional(),
	course_id: z.coerce.number().int().positive().optional(),
	search: z.string().max(100).optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(25)
});

// Inferred TypeScript types
export type AttendanceEvent = z.infer<typeof attendanceEventSchemaV2>;
export type AttendanceSingle = z.infer<typeof attendanceSingleSchema>;
export type AttendanceBatch = z.infer<typeof attendanceBatchSchema>;
export type AttendanceEventLegacy = z.infer<typeof attendanceEventSchema>;
export type AttendanceEventV2 = z.infer<typeof attendanceEventSchemaV2>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type BatchInfo = z.infer<typeof batchInfoSchema>;
export type ShopifyWebhookOrder = z.infer<typeof shopifyWebhookOrderSchema>;
export type CardWrite = z.infer<typeof cardWriteSchema>;
export type CardValidate = z.infer<typeof cardValidateSchema>;
export type CardDisable = z.infer<typeof cardDisableSchema>;
export type SubscriberCreate = z.infer<typeof subscriberCreateSchema>;
export type SubscriberUpdate = z.infer<typeof subscriberUpdateSchema>;
export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
export type CardQuery = z.infer<typeof cardQuerySchema>;
export type SubscribersQuery = z.infer<typeof subscribersQuerySchema>;
