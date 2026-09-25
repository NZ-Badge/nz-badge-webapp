import { z } from 'zod';

// UID pattern: uppercase hex pairs separated by colons, 4–7 bytes
// e.g. "AA:BB:CC:DD" (4 bytes) up to "AA:BB:CC:DD:EE:FF:GG" (7 bytes)
const UID_PATTERN = /^[A-F0-9]{2}(:[A-F0-9]{2}){3,6}$/;

// attendanceEventSchemaV2 — Schema evento conforme al protocollo
export const attendanceEventSchemaV2 = z.object({
	uid: z.string().regex(UID_PATTERN),
	uid_raw: z
		.string()
		.regex(/^[A-F0-9]{8,14}$/)
		.optional(),
	timestamp: z.string().datetime(),
	type: z.enum(['entry', 'exit']),
	device_time_raw: z.string().datetime({ offset: true }).optional()
});

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

// attendanceSingleSchema
export const attendanceSingleSchema = z.object({
	events: z.array(attendanceEventSchemaV2).min(1),
	queue_status: queueStatusSchema.optional()
});

// attendanceBatchSchema
export const attendanceBatchSchema = z.object({
	events: z.array(attendanceEventSchemaV2).min(1).max(10),
	batch_info: batchInfoSchema,
	queue_status: queueStatusSchema
});

// cardWriteSchema
export const cardWriteSchema = z
	.object({
		subscriber_id: z.number().int().positive().optional(),
		user_id: z.number().int().positive().optional()
	})
	.refine((data) => Number(Boolean(data.subscriber_id)) + Number(Boolean(data.user_id)) === 1, {
		message: 'Indica esattamente uno tra subscriber_id e user_id'
	});

// cardValidateSchema
export const cardValidateSchema = z.object({
	session_token: z.string().uuid(),
	uid: z.string().regex(UID_PATTERN),
	allow_reuse_deleted: z.boolean().optional(),
	sector_data_hash: z.string().optional()
});

// Subscriber create/update schemas live in $lib/services/subscribers.

// cardQuerySchema
export const cardQuerySchema = z.object({
	status: z.enum(['active', 'disabled', 'replaced', 'lost', 'deleted']).optional(),
	subscriber_id: z.coerce.number().int().positive().optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(100)
});

// subscribersQuerySchema
export const subscribersQuerySchema = z.object({
	status: z.enum(['active', 'completed', 'suspended', 'cancelled']).optional(),
	course_id: z.coerce.number().int().positive().optional(),
	search: z.string().max(100).optional(),
	page: z.coerce.number().int().positive().default(1),
	limit: z.coerce.number().int().positive().max(100).default(25)
});

// Password policy for system users (API create/update). The admin UI checks the same
// minimum length before submitting, so keep PASSWORD_MIN_LENGTH in sync with it.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 100;

export const passwordSchema = z
	.string()
	.min(PASSWORD_MIN_LENGTH, `La password deve contenere almeno ${PASSWORD_MIN_LENGTH} caratteri`)
	.max(PASSWORD_MAX_LENGTH, 'Password troppo lunga');

// Inferred TypeScript types
export type AttendanceEvent = z.infer<typeof attendanceEventSchemaV2>;
export type QueueStatus = z.infer<typeof queueStatusSchema>;
export type BatchInfo = z.infer<typeof batchInfoSchema>;
