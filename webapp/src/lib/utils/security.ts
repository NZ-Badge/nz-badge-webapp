/**
 * Security utilities for healthcare environment
 * CSP/security headers, id sanitization, rate limiting and audit masking helpers
 */

// CSP nonce storage for request lifecycle
const CSP_NONCE_SIZE = 32;

/**
 * Generate a cryptographically secure nonce for CSP
 */
export function generateCspNonce(): string {
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		const array = new Uint8Array(CSP_NONCE_SIZE);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
	}
	// Fallback for server-side
	return Array.from({ length: CSP_NONCE_SIZE }, () =>
		Math.floor(Math.random() * 256)
			.toString(16)
			.padStart(2, '0')
	).join('');
}

/**
 * Content Security Policy for healthcare application
 * Strict policy to prevent XSS and data injection
 */
function generateCspHeader(nonce: string): string {
	const directives = [
		"default-src 'self'",
		"script-src 'self' 'nonce-${nonce}' 'strict-dynamic'",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		"connect-src 'self'",
		"media-src 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		'upgrade-insecure-requests'
	];

	return directives.join('; ').replace('${nonce}', nonce);
}

/**
 * Security headers for healthcare compliance
 */
export function generateSecurityHeaders(nonce: string): Record<string, string> {
	return {
		'Content-Security-Policy': generateCspHeader(nonce),
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY',
		'X-XSS-Protection': '1; mode=block',
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=self',
		'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
		'Cache-Control': 'no-store, max-age=0',
		Pragma: 'no-cache'
	};
}

/**
 * Sanitize ID parameter - must be positive integer
 */
export function sanitizeId(id: unknown): number | null {
	if (id === null || id === undefined) return null;

	const num = Number(id);
	if (Number.isNaN(num) || !Number.isFinite(num)) return null;
	if (num <= 0 || num > Number.MAX_SAFE_INTEGER) return null;
	if (!Number.isInteger(num)) return null;

	return num;
}

/**
 * Rate limiting storage with automatic cleanup
 */
class RateLimiter {
	private requests = new Map<string, number[]>();
	private readonly windowMs: number;
	private readonly maxRequests: number;

	constructor(windowMs = 60000, maxRequests = 100) {
		this.windowMs = windowMs;
		this.maxRequests = maxRequests;

		// Cleanup old entries every 5 minutes
		setInterval(() => this.cleanup(), 300000);
	}

	isLimited(key: string): boolean {
		const now = Date.now();
		const timestamps = this.requests.get(key) ?? [];

		// Filter to only include requests within the window
		const validTimestamps = timestamps.filter((t) => now - t < this.windowMs);

		if (validTimestamps.length >= this.maxRequests) {
			this.requests.set(key, validTimestamps);
			return true;
		}

		validTimestamps.push(now);
		this.requests.set(key, validTimestamps);
		return false;
	}

	getRemainingRequests(key: string): number {
		const now = Date.now();
		const timestamps = this.requests.get(key) ?? [];
		const validTimestamps = timestamps.filter((t) => now - t < this.windowMs);

		return Math.max(0, this.maxRequests - validTimestamps.length);
	}

	reset(key: string): void {
		this.requests.delete(key);
	}

	private cleanup(): void {
		const now = Date.now();
		for (const [key, timestamps] of this.requests.entries()) {
			const validTimestamps = timestamps.filter((t) => now - t < this.windowMs);
			if (validTimestamps.length === 0) {
				this.requests.delete(key);
			} else {
				this.requests.set(key, validTimestamps);
			}
		}
	}
}

// Global rate limiter instances
export const authRateLimiter = new RateLimiter(300000, 5); // 5 device auth attempts per 5 minutes
// Admin login: per-IP limit is looser because staff may share a NAT/proxy address.
export const loginIpRateLimiter = new RateLimiter(15 * 60000, 20); // 20 attempts per 15 minutes
export const loginEmailRateLimiter = new RateLimiter(15 * 60000, 5); // 5 attempts per 15 minutes

/**
 * Hash sensitive data for audit logs (one-way)
 */
export async function hashForAudit(data: string): Promise<string> {
	if (typeof crypto !== 'undefined' && crypto.subtle) {
		const encoder = new TextEncoder();
		const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	// Server-side fallback
	const { createHash } = await import('crypto');
	return createHash('sha256').update(data).digest('hex');
}

/**
 * Mask sensitive data for display (e.g., email, phone)
 */
export function maskEmail(email: string): string {
	if (!email || !email.includes('@')) return '***';

	const [local, domain] = email.split('@');
	const maskedLocal =
		local.length > 2
			? local.charAt(0) + '*'.repeat(local.length - 2) + local.charAt(local.length - 1)
			: '*'.repeat(local.length);

	return `${maskedLocal}@${domain}`;
}

export function maskUid(uid: string, visibleChars = 4): string {
	if (!uid || uid.length <= visibleChars * 2) return '*'.repeat(uid?.length ?? 0);

	const start = uid.slice(0, visibleChars);
	const end = uid.slice(-visibleChars);
	return `${start}...${end}`;
}
