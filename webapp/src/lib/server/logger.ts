/**
 * Logger strutturato lato server: una riga JSON per evento su stdout/stderr, con
 * `level`, `time`, `scope`, `requestId` (se la chiamata avviene dentro una richiesta) e
 * i campi aggiuntivi gia' redatti.
 *
 * La redazione e' volutamente conservativa: i campi con nomi sensibili (password, token,
 * secret, cookie, authorization, chiavi) diventano `[REDACTED]`, email e token nel testo
 * vengono mascherati e gli errori vengono ridotti a nome, messaggio e stack sanificati.
 *
 * Il modulo non dipende da `$env` ne' da SvelteKit, cosi' e' usabile anche dagli script
 * eseguiti con `tsx`.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const SENSITIVE_KEY =
	/pass(word)?|secret|token|authorization|cookie|api_?key|key_?[ab]\b|^key[AB]$/i;
const EMAIL_KEY = /e-?mail/i;
const MAX_DEPTH = 4;
const MAX_STRING_LENGTH = 2000;

interface RequestContext {
	requestId: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Esegue `fn` associando i log emessi al suo interno al `requestId` indicato. */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
	return requestContext.run({ requestId }, fn);
}

/** `requestId` della richiesta in corso, se presente. */
export function currentRequestId(): string | undefined {
	return requestContext.getStore()?.requestId;
}

/** Identificativo breve e univoco per correlare i log di una richiesta. */
export function generateRequestId(): string {
	return crypto.randomUUID();
}

/**
 * Maschera dati personali e credenziali in un testo libero (messaggi d'errore, stack).
 * Usato anche da `handleError` in hooks.server.ts.
 */
export function sanitizeLogText(value: string): string {
	return value
		.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
		.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [TOKEN]')
		.replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[TOKEN]')
		.replace(/\b[0-9a-fA-F]{32,}\b/g, '[TOKEN]')
		.replace(/\b(?:\d{3}-?){2}\d{4}\b/g, '[SSN]')
		.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD]');
}

function truncate(value: string): string {
	return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
}

function serializeError(err: Error, depth: number): LogFields {
	const result: LogFields = {
		name: err.name,
		message: truncate(sanitizeLogText(err.message))
	};
	const code = (err as { code?: unknown }).code;
	if (typeof code === 'string' || typeof code === 'number') result.code = code;
	if (err.stack) result.stack = truncate(sanitizeLogText(err.stack));
	if (err.cause !== undefined && depth < MAX_DEPTH) {
		result.cause = redactValue(err.cause, depth + 1);
	}
	return result;
}

function redactValue(value: unknown, depth = 0): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === 'string') return truncate(sanitizeLogText(value));
	if (typeof value === 'number' || typeof value === 'boolean') return value;
	if (typeof value === 'bigint') return value.toString();
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Error) return serializeError(value, depth);
	if (depth >= MAX_DEPTH) return '[TRUNCATED]';
	if (Array.isArray(value)) return value.slice(0, 50).map((item) => redactValue(item, depth + 1));
	if (typeof value === 'object') {
		const result: LogFields = {};
		for (const [key, item] of Object.entries(value as LogFields)) {
			if (SENSITIVE_KEY.test(key)) result[key] = '[REDACTED]';
			else if (EMAIL_KEY.test(key) && typeof item === 'string') result[key] = '[EMAIL]';
			else result[key] = redactValue(item, depth + 1);
		}
		return result;
	}
	return String(value);
}

/** Redige ricorsivamente un insieme di campi di log. */
export function redactLogFields(fields: LogFields): LogFields {
	return redactValue(fields) as LogFields;
}

function minimumLevel(): LogLevel {
	const configured = process.env.LOG_LEVEL?.toLowerCase();
	return configured && configured in LEVEL_WEIGHT ? (configured as LogLevel) : 'info';
}

function write(level: LogLevel, scope: string, message: string, fields?: LogFields): void {
	if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[minimumLevel()]) return;

	const entry: LogFields = {
		level,
		time: new Date().toISOString(),
		scope,
		message: sanitizeLogText(message)
	};
	const requestId = currentRequestId();
	if (requestId) entry.requestId = requestId;
	if (fields) Object.assign(entry, redactLogFields(fields));

	const line = JSON.stringify(entry);
	if (level === 'error') console.error(line);
	else if (level === 'warn') console.warn(line);
	else console.log(line);
}

export interface Logger {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
}

/** Logger con un `scope` fisso (per esempio `auth` o `api/attendance`). */
export function createLogger(scope: string): Logger {
	return {
		debug: (message, fields) => write('debug', scope, message, fields),
		info: (message, fields) => write('info', scope, message, fields),
		warn: (message, fields) => write('warn', scope, message, fields),
		error: (message, fields) => write('error', scope, message, fields)
	};
}
