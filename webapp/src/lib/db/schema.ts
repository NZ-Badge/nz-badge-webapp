import {
	mysqlTable,
	int,
	bigint,
	varchar,
	text,
	timestamp,
	boolean,
	mysqlEnum,
	json,
	binary,
	date,
	datetime,
	index
} from 'drizzle-orm/mysql-core';

// ── users ────────────────────────────────────────────────────────────────────
export const users = mysqlTable('users', {
	id: int().primaryKey().autoincrement(),
	name: varchar({ length: 100 }).notNull(),
	email: varchar({ length: 255 }).unique().notNull(),
	passwordHash: varchar('password_hash', { length: 255 }).notNull(),
	role: mysqlEnum('role', ['admin', 'staff']).default('staff'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
});

// ── subscribers ─────────────────────────────────────────────────────────────────
export const subscribers = mysqlTable(
	'subscribers',
	{
		id: int().primaryKey().autoincrement(),
		shopifyOrderId: bigint('shopify_order_id', { mode: 'number' }).unique(),
		firstName: varchar('first_name', { length: 100 }).notNull(),
		lastName: varchar('last_name', { length: 100 }).notNull(),
		email: varchar({ length: 255 }).notNull(),
		phone: varchar({ length: 20 }),
		taxId: varchar('tax_id', { length: 16 }),
		courseId: int('course_id'),
		courseName: varchar('course_name', { length: 255 }),
		purchaseDate: date('purchase_date'),
		courseStartDate: date('course_start_date'),
		courseEndDate: date('course_end_date'),
		status: mysqlEnum('status', ['active', 'completed', 'suspended', 'cancelled']).default(
			'active'
		),
		note: text(),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
	},
	(t) => [
		index('idx_course').on(t.courseId),
		index('idx_status').on(t.status),
		index('idx_email').on(t.email)
	]
);

// ── enrollments ──────────────────────────────────────────────────────────────
export const enrollments = mysqlTable(
	'enrollments',
	{
		id: int().primaryKey().autoincrement(),
		externalId: varchar('external_id', { length: 50 }).unique().notNull(),
		subscriberId: int('subscriber_id').references(() => subscribers.id, { onDelete: 'set null' }),
		orderId: varchar('order_id', { length: 255 }).notNull(),
		orderName: varchar('order_name', { length: 50 }),
		lineItemId: varchar('line_item_id', { length: 255 }).notNull(),
		productId: varchar('product_id', { length: 255 }),
		productTitle: varchar('product_title', { length: 255 }),
		variantTitle: varchar('variant_title', { length: 255 }),
		quantity: int().notNull().default(1),
		customerEmail: varchar('customer_email', { length: 255 }).notNull(),
		customerDisplayName: varchar('customer_display_name', { length: 255 }),
		firstName: varchar('first_name', { length: 100 }),
		lastName: varchar('last_name', { length: 100 }),
		phone: varchar({ length: 20 }),
		fiscalCode: varchar('fiscal_code', { length: 20 }),
		preferredDate: date('preferred_date'),
		courseDurationDays: int('course_duration_days'),
		notes: text(),
		submittedAt: timestamp('submitted_at'),
		status: mysqlEnum('status', ['PENDING', 'SUBMITTED', 'COMPLETED']).notNull().default('PENDING'),
		externalCreatedAt: timestamp('external_created_at').notNull(),
		externalUpdatedAt: timestamp('external_updated_at').notNull(),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
	},
	(t) => [
		index('idx_enrollment_email').on(t.customerEmail),
		index('idx_enrollment_status').on(t.status),
		index('idx_enrollment_subscriber').on(t.subscriberId),
		index('idx_enrollment_order').on(t.orderId)
	]
);

// ── enrollment_sync_log ───────────────────────────────────────────────────────
export const enrollmentSyncLog = mysqlTable('enrollment_sync_log', {
	id: int().primaryKey().autoincrement(),
	startedAt: timestamp('started_at').defaultNow(),
	completedAt: timestamp('completed_at'),
	status: mysqlEnum('status', ['running', 'success', 'error']).notNull().default('running'),
	enrollmentsFound: int('enrollments_found').notNull().default(0),
	enrollmentsCreated: int('enrollments_created').notNull().default(0),
	subscribersCreated: int('subscribers_created').notNull().default(0),
	errors: int().notNull().default(0),
	errorMsg: text('error_msg'),
	triggeredBy: mysqlEnum('triggered_by', ['manual', 'scheduled', 'webhook'])
		.notNull()
		.default('manual')
});

// ── card_rfid ────────────────────────────────────────────────────────────────
export const cardRfid = mysqlTable(
	'card_rfid',
	{
		id: int().primaryKey().autoincrement(),
		subscriberId: int('subscriber_id').references(() => subscribers.id, { onDelete: 'set null' }),
		uid: varchar({ length: 14 }).unique().notNull(),
		type: mysqlEnum('type', ['rfid', 'nfc']).default('rfid').notNull(),
		uidRaw: binary('uid_raw', { length: 7 }),
		sectorData: json('sector_data'),
		keyA: varchar('key_a', { length: 12 }),
		keyB: varchar('key_b', { length: 12 }),
		sector: int().default(4),
		writeDate: timestamp('write_date'),
		expirationDate: date('expiration_date'),
		status: mysqlEnum('status', ['active', 'disabled', 'replaced', 'lost', 'deleted']).default(
			'active'
		),
		deletedAt: timestamp('deleted_at'),
		writtenByUserId: int('written_by_user_id').references(() => users.id),
		writtenByDevice: varchar('written_by_device', { length: 100 })
	},
	(t) => [
		index('idx_uid').on(t.uid),
		index('idx_status').on(t.status),
		index('idx_subscriber').on(t.subscriberId)
	]
);

// ── attendance ─────────────────────────────────────────────────────────────────
export const attendance = mysqlTable(
	'attendance',
	{
		id: bigint({ mode: 'number' }).primaryKey().autoincrement(),
		cardUid: varchar('card_uid', { length: 14 }).notNull(),
		uidRaw: varchar('uid_raw', { length: 14 }),
		subscriberId: int('subscriber_id').references(() => subscribers.id, { onDelete: 'set null' }),
		deviceId: varchar('device_id', { length: 50 }).notNull(),
		eventType: mysqlEnum('event_type', ['entry', 'exit']).notNull(),
		readTimestamp: datetime('read_timestamp', { fsp: 3 }).notNull(),
		deviceTimeRaw: datetime('device_time_raw', { fsp: 3 }),
		timestampSync: timestamp('timestamp_sync').defaultNow(),
		offlineQueued: boolean('offline_queued').default(false),
		rawPayload: json('raw_payload'),
		validated: boolean().default(true),
		queuePending: int('queue_pending'),
		storageFreePercent: int('storage_free_percent'),
		note: varchar({ length: 255 })
	},
	(t) => [
		index('idx_card_uid').on(t.cardUid),
		index('idx_timestamp').on(t.readTimestamp),
		index('idx_device').on(t.deviceId),
		index('idx_subscriber').on(t.subscriberId)
	]
);

// ── device_registry ───────────────────────────────────────────────────────────
export const deviceRegistry = mysqlTable('device_registry', {
	id: int().primaryKey().autoincrement(),
	deviceId: varchar('device_id', { length: 50 }).unique().notNull(),
	deviceType: mysqlEnum('device_type', ['reader', 'writer']).notNull(),
	location: varchar({ length: 100 }),
	tokenHash: varchar('token_hash', { length: 255 }).notNull(),
	lastPing: timestamp('last_ping'),
	firmwareVersion: varchar('firmware_version', { length: 20 }),
	ipAddress: varchar('ip_address', { length: 45 }),
	active: boolean().default(true),
	createdAt: timestamp('created_at').defaultNow()
});

// ── audit_log ─────────────────────────────────────────────────────────────────
export const auditLog = mysqlTable(
	'audit_log',
	{
		id: bigint({ mode: 'number' }).primaryKey().autoincrement(),
		userId: int('user_id').references(() => users.id),
		action: varchar({ length: 50 }).notNull(),
		entityType: varchar('entity_type', { length: 50 }),
		entityId: int('entity_id'),
		dataBefore: json('data_before'),
		dataAfter: json('data_after'),
		ipAddress: varchar('ip_address', { length: 45 }),
		userAgent: varchar('user_agent', { length: 500 }),
		createdAt: timestamp('created_at').defaultNow()
	},
	(t) => [
		index('idx_user').on(t.userId),
		index('idx_action').on(t.action),
		index('idx_time').on(t.createdAt)
	]
);

// ── settings ─────────────────────────────────────────────────────────────────
export const settings = mysqlTable('settings', {
	id: int().primaryKey().autoincrement(),
	key: varchar({ length: 50 }).unique().notNull(),
	value: text().notNull(),
	dataType: mysqlEnum('data_type', ['boolean', 'integer', 'string', 'json']).default('string'),
	description: varchar({ length: 255 }),
	updatedAt: timestamp('updated_at').defaultNow().onUpdateNow(),
	updatedByUserId: int('updated_by_user_id').references(() => users.id)
});

// ── mifare_keys ──────────────────────────────────────────────────────────────
export const mifareKeys = mysqlTable(
	'mifare_keys',
	{
		id: int().primaryKey().autoincrement(),
		name: varchar({ length: 50 }).notNull().default('default'),
		keyA: varchar('key_a', { length: 12 }).notNull(),
		keyB: varchar('key_b', { length: 12 }).notNull(),
		isActive: boolean('is_active').default(true),
		createdAt: timestamp('created_at').defaultNow(),
		updatedAt: timestamp('updated_at').defaultNow().onUpdateNow()
	},
	(t) => [index('idx_mifare_keys_name').on(t.name)]
);

// ── firmware_releases ─────────────────────────────────────────────────────────
export const firmwareReleases = mysqlTable(
	'firmware_releases',
	{
		id: int().primaryKey().autoincrement(),
		version: varchar({ length: 32 }).unique().notNull(),
		deviceType: varchar('device_type', { length: 64 }).notNull().default('reader-station'),
		filePath: varchar('file_path', { length: 255 }).notNull(),
		fileSizeBytes: int('file_size_bytes').notNull(),
		sha256: varchar({ length: 64 }).notNull(),
		isActive: boolean('is_active').notNull().default(false),
		releaseNotes: text('release_notes'),
		createdAt: timestamp('created_at').defaultNow(),
		createdByUserId: int('created_by_user_id').references(() => users.id)
	},
	(t) => [index('idx_fw_device_type').on(t.deviceType), index('idx_fw_active').on(t.isActive)]
);

// ── Inferred TypeScript types ─────────────────────────────────────────────────
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserRole = 'admin' | 'staff';
export type Subscriber = typeof subscribers.$inferSelect;
export type NewSubscriber = typeof subscribers.$inferInsert;
export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
export type EnrollmentSyncLog = typeof enrollmentSyncLog.$inferSelect;
export type CardRfid = typeof cardRfid.$inferSelect;
export type NewCardRfid = typeof cardRfid.$inferInsert;
export type Attendance = typeof attendance.$inferSelect;
export type NewAttendance = typeof attendance.$inferInsert;
export type DeviceReg = typeof deviceRegistry.$inferSelect;
export type NewDeviceReg = typeof deviceRegistry.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;
export type MifareKey = typeof mifareKeys.$inferSelect;
export type NewMifareKey = typeof mifareKeys.$inferInsert;
export type FirmwareRelease = typeof firmwareReleases.$inferSelect;
export type NewFirmwareRelease = typeof firmwareReleases.$inferInsert;
