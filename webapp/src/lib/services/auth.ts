/**
 * Authentication Service - Security hardened for healthcare
 * Implements device token verification and admin session management
 * with audit logging and rate limiting
 */

import bcrypt from 'bcryptjs';
import { jwtVerify, SignJWT } from 'jose';
import { env } from '$env/dynamic/private';
import { db } from '$lib/db';
import { deviceRegistry, users } from '$lib/db/schema';
import { eq } from 'drizzle-orm';
import type { DeviceReg, User } from '$lib/db/schema';
import { authRateLimiter, hashForAudit } from '$lib/utils/security';

// Session configuration
const SESSION_DURATION_HOURS = 8; // 8 hour session for hospital shifts
const TOKEN_PREFIX = 'Bearer ';

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

	// Verify token against bcrypt hash
	const valid = await bcrypt.compare(token, device.tokenHash);
	if (!valid) {
		console.warn('[AUTH] Invalid token for device:', deviceId);
		throw new AuthError('Invalid token', 'UNAUTHORIZED');
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
export async function verifyAdminSession(cookies: {
	get(name: string): string | undefined;
}): Promise<User> {
	const sessionCookie = cookies.get('session');

	if (!sessionCookie) {
		throw new AuthError('No session cookie', 'UNAUTHORIZED');
	}

	let userId: number;
	let payload: SessionPayload;

	try {
		const secret = new TextEncoder().encode(env.JWT_SECRET);
		const { payload: verifiedPayload } = await jwtVerify(sessionCookie, secret);

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

	// Verify user still has admin/staff role
	const validRoles = ['admin', 'staff'] as const;
	if (!user.role || !validRoles.includes(user.role as typeof validRoles[number])) {
		console.warn('[AUTH] User lacks required role:', userId, user.role);
		throw new AuthError('Insufficient permissions', 'FORBIDDEN');
	}

	return user;
}

/**
 * Create a new session for admin user
 * Returns the JWT token to be set as cookie
 */
export async function createAdminSession(
	user: User
): Promise<{ token: string; expires: Date }> {
	const now = Math.floor(Date.now() / 1000);
	const exp = now + SESSION_DURATION_HOURS * 3600;

	const secret = new TextEncoder().encode(env.JWT_SECRET);

	const token = await new SignJWT({
		userId: user.id,
		email: user.email,
		role: user.role
	})
		.setProtectedHeader({ alg: 'HS256' })
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

	const hash = await bcrypt.hash(token, 12);

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
		const user = await verifyAdminSession(cookies);
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
