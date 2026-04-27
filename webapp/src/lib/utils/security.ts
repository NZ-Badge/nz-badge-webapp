/**
 * Security utilities for healthcare environment
 * Implements XSS prevention, input sanitization, and secure headers
 */

// CSP nonce storage for request lifecycle
const CSP_NONCE_SIZE = 32;

function stripControlCharacters(value: string): string {
	return Array.from(value)
		.filter((char) => {
			const code = char.charCodeAt(0);
			return (code >= 0x20 || char === '\n' || char === '\r' || char === '\t') && code !== 0x7f;
		})
		.join('');
}

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
export function generateCspHeader(nonce: string): string {
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

// XSS Sanitization patterns
const XSS_PATTERNS = {
	// Script tags and event handlers
	scriptTag: /<script[^>]*>[\s\S]*?<\/script>/gi,
	eventHandler: /\s*on\w+\s*=\s*["'][^"']*["']/gi,
	// Data URLs that could execute JavaScript
	dataUrl: /data:text\/html[^,]*/gi,
	// VBScript (IE)
	vbscript: /vbscript:/gi,
	// Expression (IE)
	expression: /expression\s*\(/gi,
	// JavaScript protocol
	javascript: /javascript:/gi
};

/**
 * Sanitize string input to prevent XSS
 * Use for user-generated content displayed in templates
 */
export function sanitizeHtml(input: string): string {
	if (!input || typeof input !== 'string') return '';

	let sanitized = input;

	// Remove script tags
	sanitized = sanitized.replace(XSS_PATTERNS.scriptTag, '');

	// Remove event handlers
	sanitized = sanitized.replace(XSS_PATTERNS.eventHandler, '');

	// Remove dangerous protocols
	sanitized = sanitized.replace(XSS_PATTERNS.javascript, '');
	sanitized = sanitized.replace(XSS_PATTERNS.vbscript, '');
	sanitized = sanitized.replace(XSS_PATTERNS.expression, '');

	// Escape HTML entities
	sanitized = sanitized
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;')
		.replace(/\//g, '&#x2F;');

	return sanitized;
}

/**
 * Validate and sanitize email address
 */
export function sanitizeEmail(email: string): string | null {
	if (!email || typeof email !== 'string') return null;

	const trimmed = email.trim().toLowerCase();
	const emailRegex =
		/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

	if (!emailRegex.test(trimmed)) return null;

	// Additional check for dangerous characters
	if (/[<>"']/.test(trimmed)) return null;

	return trimmed;
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
 * Sanitize UUID/GUID format
 */
export function sanitizeUuid(uuid: unknown): string | null {
	if (typeof uuid !== 'string') return null;

	const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
	const cleaned = uuid.trim().toLowerCase();

	if (!uuidRegex.test(cleaned)) return null;

	return cleaned;
}

/**
 * Sanitize search query - limit length and remove dangerous chars
 */
export function sanitizeSearchQuery(query: string, maxLength = 100): string {
	if (!query || typeof query !== 'string') return '';

	let sanitized = query.trim();

	// Limit length
	if (sanitized.length > maxLength) {
		sanitized = sanitized.substring(0, maxLength);
	}

	// Remove control characters and potential injection patterns
	sanitized = stripControlCharacters(sanitized)
		.replace(/[<>"']/g, '') // HTML special chars
		.replace(/[;|&$`]/g, ''); // Shell special chars

	return sanitized;
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
export const apiRateLimiter = new RateLimiter(60000, 100); // 100 requests per minute
export const authRateLimiter = new RateLimiter(300000, 5); // 5 login attempts per 5 minutes

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

/**
 * Validate password strength for healthcare standards
 */
export function validatePasswordStrength(password: string): {
	valid: boolean;
	score: number;
	feedback: string[];
} {
	const feedback: string[] = [];
	let score = 0;

	if (password.length < 12) {
		feedback.push('Password must be at least 12 characters');
	} else {
		score += 2;
	}

	if (password.length >= 16) score += 1;

	if (/[a-z]/.test(password)) score += 1;
	else feedback.push('Include lowercase letters');

	if (/[A-Z]/.test(password)) score += 1;
	else feedback.push('Include uppercase letters');

	if (/[0-9]/.test(password)) score += 1;
	else feedback.push('Include numbers');

	if (/[^a-zA-Z0-9]/.test(password)) score += 1;
	else feedback.push('Include special characters');

	// Check for common patterns
	const commonPatterns = [/password/i, /123456/, /qwerty/i, /admin/i];
	if (commonPatterns.some((p) => p.test(password))) {
		score = 0;
		feedback.push('Password contains common patterns');
	}

	return {
		valid: score >= 5,
		score,
		feedback
	};
}

/**
 * Secure random token generation for CSRF or session
 */
export function generateSecureToken(length = 32): string {
	if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
		const array = new Uint8Array(length);
		crypto.getRandomValues(array);
		return Array.from(array, (byte) => byte.toString(36).padStart(2, '0'))
			.join('')
			.slice(0, length);
	}
	// Fallback
	return Array.from({ length }, () => Math.random().toString(36).charAt(2)).join('');
}
