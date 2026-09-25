/**
 * Authentication Service - Security hardened for healthcare
 * Implements device token verification and admin session management
 * with audit logging and rate limiting
 */

import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'node:crypto';
import { error, redirect } from '@sveltejs/kit';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { deviceRegistry, users } from '$lib/db/schema';
import { and, eq } from 'drizzle-orm';
import type { DeviceReg, User } from '$lib/db/schema';
import { authRateLimiter, hashForAudit } from '$lib/utils/security';

// Session configuration
const SESSION_DURATION_HOURS = 8; // 8 hour session for hospital shifts
const TOKEN_PREFIX = 'Bearer ';
const JWT_ALGORITHM = 'HS256';
const JWT_SECRET_MIN_LENGTH = 32;

/** All roles that can hold an application session. */
export const APP_ROLES = ['admin', 'staff', 'collaborator'] as const;
/** Roles allowed on the management surface (Amministratore/Operatore). */
export const STAFF_ROLES = ['admin', 'staff'] as const;

/** Page prefixes a Collaborator may reach inside the (app) group. */
export const COLLABORATOR_ALLOWED_PREFIXES = [
	'/dashboard',
	'/my-attendance',
	'/copyrights',
	'/today',
	'/new-students'
] as const;

let cachedJwtSecret: { raw: string; key: Uint8Array } | null = null;

/**
 * Return the JWT signing key, failing fast when JWT_SECRET is missing or too short.
 * Evaluated lazily (first sign/verify) so that `vite build` does not need the secret.
 */
export function getJwtSecretKey(): Uint8Array {
	const raw = env.JWT_SECRET ?? '';
	if (cachedJwtSecret?.raw === raw) return cachedJwtSecret.key;
	if (raw.length < JWT_SECRET_MIN_LENGTH) {
		throw new Error(
			`JWT_SECRET mancante o troppo corto: servono almeno ${JWT_SECRET_MIN_LENGTH} caratteri`
		);
	}
	cachedJwtSecret = { raw, key: new TextEncoder().encode(raw) };
	return cachedJwtSecret.key;
}

/**
 * Custom auth error with code for proper HTTP response
 */
export class AuthError extends Error {
	constructor(
		message: string,
		public readonly code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'RATE_LIMITED'
	) {
		super(message);
		this.name = 'AuthError';
	}
}

/**
 * Rate limit key generator
 */
function getRateLimitKey(deviceId: string): string {
	return `auth:${deviceId}`;
}

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Hash di un token dispositivo per la memorizzazione: SHA-256 in esadecimale (64 caratteri).
 * I token sono valori casuali ad alta entropia, quindi non serve un hash lento come bcrypt.
 */
export function hashDeviceToken(token: string): string {
	return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** True se l'hash salvato e' un hash bcrypt legacy ($2a/$2b/$2y). */
export function isLegacyBcryptHash(storedHash: string): boolean {
	return BCRYPT_HASH_PATTERN.test(storedHash);
}

/**
 * Confronta un token con l'hash salvato.
 * - SHA-256 hex: confronto a tempo costante con `timingSafeEqual`.
 * - bcrypt legacy: `bcrypt.compare`; `needsRehash` segnala di migrare l'hash a SHA-256.
 */
export async function verifyDeviceTokenHash(
	token: string,
	storedHash: string
): Promise<{ valid: boolean; needsRehash: boolean }> {
	if (isLegacyBcryptHash(storedHash)) {
		const valid = await bcrypt.compare(token, storedHash);
		return { valid, needsRehash: valid };
	}

	const normalized = storedHash.toLowerCase();
	if (!SHA256_HEX_PATTERN.test(normalized)) return { valid: false, needsRehash: false };

	const expected = Buffer.from(normalized, 'hex');
	const actual = Buffer.from(hashDeviceToken(token), 'hex');
	return { valid: timingSafeEqual(expected, actual), needsRehash: false };
}

/**
 * Verify device token from request headers
 * Used by IoT card readers and attendance devices
 */
export async function verifyDeviceToken(request: Request): Promise<DeviceReg> {
	// Extract Authorization: Bearer <token> and X-Device-ID headers
	const authHeader = request.headers.get('Authorization');
	const deviceId = request.headers.get('X-Device-ID');

	if (!authHeader?.startsWith(TOKEN_PREFIX) || !deviceId) {
		throw new AuthError('Missing authorization headers', 'UNAUTHORIZED');
	}

	const token = authHeader.slice(TOKEN_PREFIX.length);

	// Check rate limit
	const rateKey = getRateLimitKey(deviceId);
	if (authRateLimiter.isLimited(rateKey)) {
		throw new AuthError('Too many authentication attempts', 'RATE_LIMITED');
	}

	// Look up device in device_registry by deviceId
	const [device] = await db
		.select()
		.from(deviceRegistry)
		.where(eq(deviceRegistry.deviceId, deviceId))
		.limit(1);

	if (!device) {
		// Log failed attempt (hashed device ID for privacy)
		console.warn('[AUTH] Device not found:', await hashForAudit(deviceId));
		throw new AuthError('Device not found', 'UNAUTHORIZED');
	}

	if (!device.active) {
		console.warn('[AUTH] Disabled device attempted connection:', deviceId);
		throw new AuthError('Device is disabled', 'UNAUTHORIZED');
	}

	// Verify token against stored hash (SHA-256, or legacy bcrypt)
	const { valid, needsRehash } = await verifyDeviceTokenHash(token, device.tokenHash);
	if (!valid) {
		console.warn('[AUTH] Invalid token for device:', deviceId);
		throw new AuthError('Invalid token', 'UNAUTHORIZED');
	}

	// Legacy bcrypt hash: migrate transparently to SHA-256 (fire and forget — do not await)
	if (needsRehash) {
		const legacyHash = device.tokenHash;
		db.update(deviceRegistry)
			.set({ tokenHash: hashDeviceToken(token) })
			.where(and(eq(deviceRegistry.deviceId, deviceId), eq(deviceRegistry.tokenHash, legacyHash)))
			.catch((err: unknown) => {
				console.error('[AUTH] Device token rehash failed:', deviceId, err);
			});
	}

	// Update last_ping asynchronously (fire and forget — do not await)
	db.update(deviceRegistry)
		.set({ lastPing: new Date() })
		.where(eq(deviceRegistry.deviceId, deviceId))
		.catch(() => {
			/* ignore ping update errors */
		});

	// Reset rate limit on success
	authRateLimiter.reset(rateKey);

	return device;
}

/**
 * Admin session payload structure
 */
interface SessionPayload {
	userId: number;
	email: string;
	role: string;
	iat: number;
	exp: number;
}

/**
 * Verify admin session from cookies
 * Returns user object if valid
 */
async function verifySessionForRoles(
	cookies: { get(name: string): string | undefined },
	validRoles: readonly string[]
): Promise<User> {
	const sessionCookie = cookies.get('session');

	if (!sessionCookie) {
		throw new AuthError('No session cookie', 'UNAUTHORIZED');
	}

	let userId: number;
	let payload: SessionPayload;
	// Outside the try: a missing/weak JWT_SECRET is a server misconfiguration, not a bad session.
	const secret = getJwtSecretKey();

	try {
		const { payload: verifiedPayload } = await jwtVerify(sessionCookie, secret, {
			algorithms: [JWT_ALGORITHM]
		});

		payload = verifiedPayload as unknown as SessionPayload;
		userId = payload.userId;

		if (!userId || typeof userId !== 'number') {
			throw new Error('No userId in token');
		}

		// Verify token hasn't expired (jwtVerify checks this, but double-check)
		const now = Math.floor(Date.now() / 1000);
		if (payload.exp && payload.exp < now) {
			throw new Error('Token expired');
		}
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Invalid token';
		console.warn('[AUTH] Session verification failed:', errorMessage);
		throw new AuthError('Invalid or expired session', 'UNAUTHORIZED');
	}

	// Fetch user from database
	const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

	if (!user) {
		console.warn('[AUTH] User from token not found:', userId);
		throw new AuthError('User not found', 'FORBIDDEN');
	}

	// Verify user is active and still has one of the application roles.
	if (user.status !== 'active') {
		console.warn('[AUTH] Disabled user attempted access:', userId);
		throw new AuthError('User account is disabled', 'FORBIDDEN');
	}

	if (!user.role || !validRoles.includes(user.role)) {
		console.warn('[AUTH] User lacks required role:', userId, user.role);
		throw new AuthError('Insufficient permissions', 'FORBIDDEN');
	}

	return user;
}

/** Verify any active system user, including Collaborators. */
export function verifyUserSession(cookies: {
	get(name: string): string | undefined;
}): Promise<User> {
	return verifySessionForRoles(cookies, APP_ROLES);
}

/**
 * Check that an already verified user holds one of the given roles.
 * Throws the same FORBIDDEN AuthError as the session verification.
 */
export function assertRole(user: User, validRoles: readonly string[]): User {
	if (!user.role || !validRoles.includes(user.role)) {
		console.warn('[AUTH] User lacks required role:', user.id, user.role);
		throw new AuthError('Insufficient permissions', 'FORBIDDEN');
	}
	return user;
}

/** Verify an Administrator/Operator session (roles admin or staff). */
export async function verifyStaffOrAdminSession(cookies: {
	get(name: string): string | undefined;
}): Promise<User> {
	return assertRole(await verifyUserSession(cookies), STAFF_ROLES);
}

/** Verify a session that strictly belongs to an Administrator (role admin). */
export async function verifyAdminOnlySession(cookies: {
	get(name: string): string | undefined;
}): Promise<User> {
	return assertRole(await verifyUserSession(cookies), ['admin']);
}

/** Whether the given role may open the (app) page at `pathname`. */
export function canAccessAppPath(role: string | null | undefined, pathname: string): boolean {
	if (role === 'admin' || role === 'staff') return true;
	if (role === 'collaborator') {
		return COLLABORATOR_ALLOWED_PREFIXES.some(
			(prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
		);
	}
	return false;
}

// ── Page guards (loads and form actions under routes/(app)) ─────────────────
// Every (app) load/action must call one of these: layout loads do not run for form
// actions nor for data requests that skip the layout, so they cannot be relied upon.

type SessionLocals = Pick<App.Locals, 'verifyUser'>;

/** Require any active session; redirects to /login otherwise. */
export async function requirePageUser(locals: SessionLocals): Promise<User> {
	try {
		return await locals.verifyUser();
	} catch (err) {
		if (err instanceof AuthError) redirect(303, '/login');
		throw err;
	}
}

async function requirePageRoles(locals: SessionLocals, roles: readonly string[]): Promise<User> {
	const user = await requirePageUser(locals);
	if (!user.role || !roles.includes(user.role)) error(403, 'Accesso non consentito');
	return user;
}

/** Require an Administrator or Operator (admin/staff); 403 for Collaborators. */
export function requirePageStaff(locals: SessionLocals): Promise<User> {
	return requirePageRoles(locals, STAFF_ROLES);
}

/** Require an Administrator (admin only); 403 for everyone else. */
export function requirePageAdmin(locals: SessionLocals): Promise<User> {
	return requirePageRoles(locals, ['admin']);
}

/**
 * Create a new session for admin user
 * Returns the JWT token to be set as cookie
 */
export async function createAdminSession(user: User): Promise<{ token: string; expires: Date }> {
	const now = Math.floor(Date.now() / 1000);
	const exp = now + SESSION_DURATION_HOURS * 3600;

	const secret = getJwtSecretKey();

	const token = await new SignJWT({
		userId: user.id,
		email: user.email,
		role: user.role
	})
		.setProtectedHeader({ alg: JWT_ALGORITHM })
		.setIssuedAt(now)
		.setExpirationTime(exp)
		.sign(secret);

	const expires = new Date(exp * 1000);

	return { token, expires };
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
	return bcrypt.compare(password, hash);
}

/**
 * Hash password for storage
 */
export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, 12); // 12 rounds for security/performance balance
}

/**
 * Generate secure device token
 * Returns the plaintext token (to be shown once) and its hash
 */
export async function generateDeviceToken(): Promise<{ token: string; hash: string }> {
	// Generate 32-byte random token
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	const token = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');

	const hash = hashDeviceToken(token);

	return { token, hash };
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
	valid: boolean;
	user?: User;
	error?: string;
}

/**
 * Validate session without throwing
 * Useful for optional auth checks
 */
export async function validateSession(cookies: {
	get(name: string): string | undefined;
}): Promise<SessionValidationResult> {
	try {
		const user = await verifyStaffOrAdminSession(cookies);
		return { valid: true, user };
	} catch (err) {
		return {
			valid: false,
			error: err instanceof AuthError ? err.message : 'Invalid session'
		};
	}
}

/**
 * Middleware helper: Require admin role
 */
export function requireAdmin(user: User): void {
	if (user.role !== 'admin') {
		throw new AuthError('Admin access required', 'FORBIDDEN');
	}
}

/** Require a role allowed to manage staff cards and attendance. */
export function requireStaffManager(user: User): void {
	if (user.role !== 'admin' && user.role !== 'staff') {
		throw new AuthError('Staff manager access required', 'FORBIDDEN');
	}
}

/** Require access to the target user's attendance. */
export function requireSelfOrStaffManager(user: User, targetUserId: number): void {
	if (user.id !== targetUserId && user.role !== 'admin' && user.role !== 'staff') {
		throw new AuthError('Access to another user is forbidden', 'FORBIDDEN');
	}
}

/**
 * Middleware helper: Require specific role
 */
export function requireRole(user: User, ...allowedRoles: string[]): void {
	if (!user.role || !allowedRoles.includes(user.role)) {
		throw new AuthError(`Required role: ${allowedRoles.join(' or ')}`, 'FORBIDDEN');
	}
}

/**
 * Check if user has admin role
 */
export function isAdmin(user: User): boolean {
	return user.role === 'admin';
}

export function isStaffManager(user: User): boolean {
	return user.role === 'admin' || user.role === 'staff';
}
