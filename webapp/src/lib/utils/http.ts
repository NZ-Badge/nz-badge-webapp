/**
 * Client HTTP per le API interne che rispondono con l'involucro `{ success, data | error }`
 * prodotto da `$lib/utils/api.ts`. Pensato per il browser: lato server load e action
 * chiamano direttamente i service in `$lib/services`.
 */

export class ApiError extends Error {
	readonly status: number;
	readonly details?: unknown;

	constructor(status: number, message: string, details?: unknown) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.details = details;
	}
}

type Envelope<T> =
	| { success: true; data: T }
	| { success: false; error?: string; details?: unknown }
	| Record<string, unknown>;

export interface ApiFetchInit extends Omit<RequestInit, 'body'> {
	/** Oggetti semplici vengono serializzati in JSON; FormData/stringhe passano invariati. */
	body?: BodyInit | Record<string, unknown> | unknown[] | null;
	/** Fetch alternativa (es. `event.fetch` in load/action). */
	fetch?: typeof fetch;
}

const DEFAULT_ERROR = 'Operazione non riuscita';

function isPlainBody(body: unknown): body is Record<string, unknown> | unknown[] {
	if (body === null || typeof body !== 'object') return false;
	if (Array.isArray(body)) return true;
	const proto = Object.getPrototypeOf(body);
	return proto === Object.prototype || proto === null;
}

/** Messaggio leggibile per un errore qualsiasi (ApiError, Error o valore sconosciuto). */
export function errorMessage(err: unknown, fallback = DEFAULT_ERROR): string {
	if (err instanceof Error && err.message) return err.message;
	return fallback;
}

/**
 * Esegue la richiesta e restituisce `data` dall'involucro. In caso di risposta non riuscita
 * (HTTP non 2xx o `success: false`) lancia `ApiError` con il messaggio inviato dal server.
 */
export async function apiFetch<T = unknown>(url: string, init: ApiFetchInit = {}): Promise<T> {
	const { fetch: fetchFn = fetch, body, headers: rawHeaders, ...rest } = init;
	const headers = new Headers(rawHeaders);
	let requestBody: BodyInit | null | undefined;

	if (isPlainBody(body)) {
		requestBody = JSON.stringify(body);
		if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
	} else {
		requestBody = body as BodyInit | null | undefined;
	}
	if (!headers.has('Accept')) headers.set('Accept', 'application/json');

	let response: Response;
	try {
		response = await fetchFn(url, { ...rest, headers, body: requestBody });
	} catch (cause) {
		throw new ApiError(0, 'Impossibile contattare il server. Controlla la connessione.', cause);
	}

	let payload: Envelope<T> | undefined;
	const text = await response.text();
	if (text) {
		try {
			payload = JSON.parse(text) as Envelope<T>;
		} catch {
			payload = undefined;
		}
	}

	const failed = !response.ok || (payload && 'success' in payload && payload.success === false);
	if (failed) {
		const serverMessage = payload && 'error' in payload ? payload.error : undefined;
		const message =
			typeof serverMessage === 'string' && serverMessage
				? serverMessage
				: response.ok
					? DEFAULT_ERROR
					: `Errore del server (${response.status})`;
		const details = payload && 'details' in payload ? payload.details : undefined;
		throw new ApiError(response.status, message, details);
	}

	if (payload && 'data' in payload) return payload.data as T;
	return payload as T;
}
