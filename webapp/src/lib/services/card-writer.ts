/**
 * Card Writer Service - Secure card lifecycle management
 * Handles card writing, erasing, and restoration with audit logging
 */

import { eq } from 'drizzle-orm';
import { db } from '$lib/db';
import { subscribers, cardRfid } from '$lib/db/schema';
import type { User } from '$lib/db/schema';
import { getMifareKeyConfig, isMifareEnabled, getOrCreateGlobalKeys } from './mifare-keys';
import { logAudit } from './audit';
import { sanitizeId } from '$lib/utils/security';

// ───────────────────────────────────────────────────────────────────────────────
// Types & Constants
// ───────────────────────────────────────────────────────────────────────────────

interface WriteSessionData {
	subscriberId: number;
	keyA: string | null;
	keyB: string | null;
	useMifare: boolean;
	validUntil: Date;
	expiresAt: number;
}

interface EraseSessionData {
	cardId: number;
	cardUid: string;
	keyA: string | null;
	useMifare: boolean;
	sector: number;
	expiresAt: number;
}

export interface CardData {
	subscriber_id: number;
	key_a: string | null;
	key_b: string | null;
	sector: number;
	valid_until: string;
}

export interface EraseData {
	card_id: number;
	uid: string;
	key_a: string | null;
	sector: number;
}

const SESSION_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute

// ───────────────────────────────────────────────────────────────────────────────
// Session Stores with automatic cleanup
// ───────────────────────────────────────────────────────────────────────────────

class SessionStore<T> {
	private sessions = new Map<string, T & { expiresAt: number }>();
	private cleanupInterval: ReturnType<typeof setInterval>;

	constructor() {
		this.cleanupInterval = setInterval(() => this.cleanup(), SESSION_CLEANUP_INTERVAL_MS);
	}

	set(token: string, data: T & { expiresAt: number }): void {
		this.sessions.set(token, data);
	}

	get(token: string): (T & { expiresAt: number }) | undefined {
		const session = this.sessions.get(token);
		if (!session) return undefined;

		if (Date.now() > session.expiresAt) {
			this.sessions.delete(token);
			return undefined;
		}

		return session;
	}

	delete(token: string): boolean {
		return this.sessions.delete(token);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [token, session] of this.sessions.entries()) {
			if (now > session.expiresAt) {
				this.sessions.delete(token);
			}
		}
	}

	dispose(): void {
		clearInterval(this.cleanupInterval);
	}
}

const writeSessions = new SessionStore<WriteSessionData>();
const eraseSessions = new SessionStore<EraseSessionData>();

// ───────────────────────────────────────────────────────────────────────────────
// Error Classes
// ───────────────────────────────────────────────────────────────────────────────

export class CardWriterError extends Error {
	constructor(
		message: string,
		public readonly code:
			| 'NOT_FOUND'
			| 'INVALID_STATE'
			| 'SESSION_EXPIRED'
			| 'VALIDATION_ERROR'
			| 'UID_IN_DELETED_HISTORY'
			| 'UID_ALREADY_EXISTS'
	) {
		super(message);
		this.name = 'CardWriterError';
	}
}

// ───────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ───────────────────────────────────────────────────────────────────────────────

function generateHexKey(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(6))).toString('hex').toUpperCase();
}

function oneYearFromNow(): Date {
	return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
}

function generateSessionToken(): string {
	return crypto.randomUUID();
}

/**
 * Validate card UID format.
 * Accepts colon-separated uppercase hex (AA:BB:CC:DD), matching the firmware
 * output format and the UID_PATTERN used in the API validation layer.
 */
function validateCardUid(uid: string): boolean {
	return /^[A-F0-9]{2}(:[A-F0-9]{2}){3,6}$/i.test(uid);
}

// ───────────────────────────────────────────────────────────────────────────────
// Card Write Operations
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Authorize a card write operation
 * Step 1: Create session with keys
 */
export async function authorizeCardWrite(
	subscriberId: number
): Promise<{
	session_token: string;
	key_a: string | null;
	key_b: string | null;
	sector: number;
	expires_in: number;
	use_single_key: boolean;
	use_mifare: boolean;
}> {
	// Validate subscriber ID
	const validId = sanitizeId(subscriberId);
	if (!validId) {
		throw new CardWriterError('Invalid subscriber ID', 'VALIDATION_ERROR');
	}

	// Verify subscriber exists and is active
	const [subscriber] = await db
		.select()
		.from(subscribers)
		.where(eq(subscribers.id, validId))
		.limit(1);

	if (!subscriber) {
		throw new CardWriterError(`Subscriber ${validId} not found`, 'NOT_FOUND');
	}

	if (subscriber.status !== 'active') {
		throw new CardWriterError(
			`Subscriber ${validId} is not active (status: ${subscriber.status})`,
			'INVALID_STATE'
		);
	}

	// Check if subscriber already has an active card
	const [existingCard] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.subscriberId, validId))
		.limit(1);

	if (existingCard?.status === 'active') {
		throw new CardWriterError(
			'Subscriber already has an active card',
			'INVALID_STATE'
		);
	}

	// Retrieve MIFARE configuration (useMifare + useSingleKey + optional global keys)
	const mifareConfig = await getMifareKeyConfig();
	const { useMifare, useSingleKey } = mifareConfig;

	let keyA: string | null;
	let keyB: string | null;

	if (!useMifare) {
		// UID-only mode: no keys needed
		keyA = null;
		keyB = null;
	} else if (useSingleKey) {
		// Use global keys (already loaded by getMifareKeyConfig)
		const globalKeys = mifareConfig.keys ?? (await getOrCreateGlobalKeys());
		keyA = globalKeys.keyA;
		keyB = globalKeys.keyB;
	} else {
		// Generate unique keys for this card
		keyA = generateHexKey();
		keyB = generateHexKey();
	}

	const validUntil = oneYearFromNow();
	const sessionToken = generateSessionToken();

	writeSessions.set(sessionToken, {
		subscriberId: validId,
		keyA,
		keyB,
		useMifare,
		validUntil,
		expiresAt: Date.now() + SESSION_TTL_MS
	});

	return {
		session_token: sessionToken,
		key_a: keyA,
		key_b: keyB,
		sector: 4,
		expires_in: Math.floor(SESSION_TTL_MS / 1000),
		use_single_key: useSingleKey,
		use_mifare: useMifare
	};
}

/**
 * Confirm a card write operation
 * Step 2: Persist card after successful hardware write
 */
export async function confirmCardWrite(
	sessionToken: string,
	uid: string,
	adminUser: User,
	allowReuseDeleted = false
): Promise<{ id: number; uid: string }> {
	// Validate UID format
	if (!validateCardUid(uid)) {
		throw new CardWriterError('Invalid card UID format', 'VALIDATION_ERROR');
	}

	// Normalize UID to uppercase
	const normalizedUid = uid.toUpperCase();

	// Retrieve session. It is consumed only on success or permanent failure.
	const session = writeSessions.get(sessionToken);
	if (!session) {
		throw new CardWriterError('Invalid or expired session token', 'SESSION_EXPIRED');
	}

	// Check if card UID already exists
	const [existingCard] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.uid, normalizedUid))
		.limit(1);

	if (existingCard) {
		if (existingCard.status === 'deleted') {
			if (!allowReuseDeleted) {
				throw new CardWriterError(
					`Card with UID ${normalizedUid} is present in deleted history`,
					'UID_IN_DELETED_HISTORY'
				);
			}

			await db
				.update(cardRfid)
				.set({
					subscriberId: session.subscriberId,
					uid: normalizedUid,
					type: 'rfid',
					keyA: session.keyA,
					keyB: session.keyB,
					sector: 4,
					writeDate: new Date(),
					expirationDate: session.validUntil,
					status: 'active',
					deletedAt: null,
					writtenByUserId: adminUser.id
				})
				.where(eq(cardRfid.id, existingCard.id));

			writeSessions.delete(sessionToken);

			await logAudit({
				userId: adminUser.id,
				action: 'CARD_WRITE',
				entityType: 'card',
				entityId: existingCard.id,
				dataBefore: {
					status: existingCard.status,
					subscriberId: existingCard.subscriberId,
					deletedAt: existingCard.deletedAt?.toISOString() ?? null
				},
				dataAfter: {
					uid: normalizedUid,
					subscriberId: session.subscriberId,
					expirationDate: session.validUntil.toISOString(),
					status: 'active',
					deletedAt: null
				},
				metadata: {
					sector: 4,
					reusedDeletedRecord: true,
					singleKeyMode: session.keyA === session.keyB
				}
			});

			return { id: existingCard.id, uid: normalizedUid };
		}

		writeSessions.delete(sessionToken);
		throw new CardWriterError(
			`Card with UID ${normalizedUid} is already assigned`,
			'UID_ALREADY_EXISTS'
		);
	}

	// Insert card record
	const [created] = await db.insert(cardRfid).values({
		subscriberId: session.subscriberId,
		uid: normalizedUid,
		type: 'rfid',
		keyA: session.keyA,
		keyB: session.keyB,
		sector: 4,
		writeDate: new Date(),
		expirationDate: session.validUntil,
		status: 'active',
		writtenByUserId: adminUser.id
	});

	if (!created.insertId) {
		writeSessions.delete(sessionToken);
		throw new CardWriterError('Failed to create card record', 'VALIDATION_ERROR');
	}

	const cardId = Number(created.insertId);
	writeSessions.delete(sessionToken);

	// Audit log
	await logAudit({
		userId: adminUser.id,
		action: 'CARD_WRITE',
		entityType: 'card',
		entityId: cardId,
		dataAfter: {
			uid: normalizedUid,
			subscriberId: session.subscriberId,
			expirationDate: session.validUntil.toISOString()
		},
		metadata: {
			sector: 4,
			singleKeyMode: session.keyA === session.keyB
		}
	});

	return { id: cardId, uid: normalizedUid };
}

// ───────────────────────────────────────────────────────────────────────────────
// Card Erase Operations
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Authorize a card erase operation
 * Step 1: Create session with erase data
 */
export async function authorizeCardErase(
	cardId: number
): Promise<{ session_token: string; erase_data: EraseData; use_mifare: boolean }> {
	// Validate card ID
	const validId = sanitizeId(cardId);
	if (!validId) {
		throw new CardWriterError('Invalid card ID', 'VALIDATION_ERROR');
	}

	// Fetch card
	const [card] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.id, validId))
		.limit(1);

	if (!card) {
		throw new CardWriterError(`Card ${validId} not found`, 'NOT_FOUND');
	}

	if (!['active', 'disabled', 'deleted'].includes(card.status ?? '')) {
		throw new CardWriterError(
			`Card cannot be erased (status: ${card.status})`,
			'INVALID_STATE'
		);
	}

	const useMifare = await isMifareEnabled();

	if (useMifare && !card.keyA) {
		throw new CardWriterError('Card key not available in database', 'INVALID_STATE');
	}

	const keyA: string | null = useMifare ? (card.keyA ?? null) : null;
	const sessionToken = generateSessionToken();
	eraseSessions.set(sessionToken, {
		cardId: card.id,
		cardUid: card.uid,
		keyA,
		useMifare,
		sector: card.sector ?? 4,
		expiresAt: Date.now() + SESSION_TTL_MS
	});

	return {
		session_token: sessionToken,
		erase_data: {
			card_id: card.id,
			uid: card.uid,
			key_a: keyA,
			sector: card.sector ?? 4
		},
		use_mifare: useMifare
	};
}

/**
 * Confirm a card erase operation
 * Step 2: Soft delete card after successful hardware erase
 */
export async function confirmCardErase(
	sessionToken: string,
	adminUser: User
): Promise<{ cardId: number; uid: string }> {
	// Retrieve and immediately remove session (one-time use)
	const session = eraseSessions.get(sessionToken);
	eraseSessions.delete(sessionToken);

	if (!session) {
		throw new CardWriterError('Invalid or expired session token', 'SESSION_EXPIRED');
	}

	// Fetch current card state for audit
	const [cardBefore] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.id, session.cardId))
		.limit(1);

	// Soft delete: keep record with keys for future physical erasure
	await db
		.update(cardRfid)
		.set({ status: 'deleted', deletedAt: new Date() })
		.where(eq(cardRfid.id, session.cardId));

	// Audit log
	await logAudit({
		userId: adminUser.id,
		action: 'CARD_ERASE',
		entityType: 'card',
		entityId: session.cardId,
		dataBefore: cardBefore ? {
			status: cardBefore.status,
			subscriberId: cardBefore.subscriberId
		} : undefined,
		dataAfter: {
			status: 'deleted',
			deletedAt: new Date().toISOString()
		},
		metadata: {
			uid: session.cardUid,
			sector: session.sector
		}
	});

	return { cardId: session.cardId, uid: session.cardUid };
}

// ───────────────────────────────────────────────────────────────────────────────
// Card State Management
// ───────────────────────────────────────────────────────────────────────────────

/**
 * Restore a soft-deleted card
 */
export async function restoreCard(
	cardId: number,
	adminUser: User
): Promise<void> {
	// Validate card ID
	const validId = sanitizeId(cardId);
	if (!validId) {
		throw new CardWriterError('Invalid card ID', 'VALIDATION_ERROR');
	}

	// Fetch card
	const [card] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.id, validId))
		.limit(1);

	if (!card) {
		throw new CardWriterError(`Card ${validId} not found`, 'NOT_FOUND');
	}

	if (card.status !== 'deleted') {
		throw new CardWriterError(
			`Card is not in deleted state (status: ${card.status})`,
			'INVALID_STATE'
		);
	}

	// Restore to disabled state
	await db
		.update(cardRfid)
		.set({ status: 'disabled', deletedAt: null })
		.where(eq(cardRfid.id, validId));

	// Audit log
	await logAudit({
		userId: adminUser.id,
		action: 'CARD_ENABLE',
		entityType: 'card',
		entityId: validId,
		dataBefore: { status: 'deleted' },
		dataAfter: { status: 'disabled', deletedAt: null }
	});
}

/**
 * Soft delete a card (without hardware erase)
 */
export async function softDeleteCard(
	cardId: number,
	adminUser: User
): Promise<{ cardId: number; uid: string }> {
	// Validate card ID
	const validId = sanitizeId(cardId);
	if (!validId) {
		throw new CardWriterError('Invalid card ID', 'VALIDATION_ERROR');
	}

	// Fetch card
	const [card] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.id, validId))
		.limit(1);

	if (!card) {
		throw new CardWriterError(`Card ${validId} not found`, 'NOT_FOUND');
	}

	if (!['active', 'disabled'].includes(card.status ?? '')) {
		throw new CardWriterError(
			`Card cannot be deleted (status: ${card.status})`,
			'INVALID_STATE'
		);
	}

	// Soft delete
	await db
		.update(cardRfid)
		.set({ status: 'deleted', deletedAt: new Date() })
		.where(eq(cardRfid.id, validId));

	// Audit log
	await logAudit({
		userId: adminUser.id,
		action: 'CARD_DISABLE',
		entityType: 'card',
		entityId: validId,
		dataBefore: { status: card.status },
		dataAfter: { status: 'deleted', deletedAt: new Date().toISOString() },
		metadata: { uid: card.uid }
	});

	return { cardId: validId, uid: card.uid };
}

/**
 * Enable a disabled card
 */
export async function enableCard(
	cardId: number,
	adminUser: User
): Promise<void> {
	// Validate card ID
	const validId = sanitizeId(cardId);
	if (!validId) {
		throw new CardWriterError('Invalid card ID', 'VALIDATION_ERROR');
	}

	// Fetch card
	const [card] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.id, validId))
		.limit(1);

	if (!card) {
		throw new CardWriterError(`Card ${validId} not found`, 'NOT_FOUND');
	}

	if (card.status !== 'disabled') {
		throw new CardWriterError(
			`Card is not disabled (status: ${card.status})`,
			'INVALID_STATE'
		);
	}

	// Enable card
	await db
		.update(cardRfid)
		.set({ status: 'active' })
		.where(eq(cardRfid.id, validId));

	// Audit log
	await logAudit({
		userId: adminUser.id,
		action: 'CARD_ENABLE',
		entityType: 'card',
		entityId: validId,
		dataBefore: { status: 'disabled' },
		dataAfter: { status: 'active' }
	});
}

/**
 * Disable an active card
 */
export async function disableCard(
	cardId: number,
	adminUser: User
): Promise<void> {
	// Validate card ID
	const validId = sanitizeId(cardId);
	if (!validId) {
		throw new CardWriterError('Invalid card ID', 'VALIDATION_ERROR');
	}

	// Fetch card
	const [card] = await db
		.select()
		.from(cardRfid)
		.where(eq(cardRfid.id, validId))
		.limit(1);

	if (!card) {
		throw new CardWriterError(`Card ${validId} not found`, 'NOT_FOUND');
	}

	if (card.status !== 'active') {
		throw new CardWriterError(
			`Card is not active (status: ${card.status})`,
			'INVALID_STATE'
		);
	}

	// Disable card
	await db
		.update(cardRfid)
		.set({ status: 'disabled' })
		.where(eq(cardRfid.id, validId));

	// Audit log
	await logAudit({
		userId: adminUser.id,
		action: 'CARD_DISABLE',
		entityType: 'card',
		entityId: validId,
		dataBefore: { status: 'active' },
		dataAfter: { status: 'disabled' }
	});
}

// ───────────────────────────────────────────────────────────────────────────────
// Cleanup on module unload (for testing)
// ───────────────────────────────────────────────────────────────────────────────

export function disposeSessionStores(): void {
	writeSessions.dispose();
	eraseSessions.dispose();
}
