// Flussi lato browser per le tessere: chiamano le API admin (/api/v1/card/*) e orchestrano
// il writer WebSerial. Nessuna logica di dominio: autorizzazioni e stato restano sul server.

import { ApiError, apiFetch } from '$lib/utils/http';
import type { WebSerialCardWriter } from '$lib/utils/webserial';

export { errorMessage } from '$lib/utils/http';

/** Errore di un passaggio sul writer (la risposta del firmware non è un successo). */
export class CardWriterError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CardWriterError';
	}
}

/** POST verso le API admin; il messaggio del server ha la precedenza su `fallbackError`. */
async function post<T>(url: string, fallbackError: string, body?: Record<string, unknown>) {
	try {
		return await apiFetch<T>(url, { method: 'POST', credentials: 'include', body });
	} catch (err) {
		// Senza un messaggio del server, meglio un testo che dica quale passaggio è fallito.
		if (err instanceof ApiError && err.message.startsWith('Errore del server (')) {
			throw new ApiError(err.status, fallbackError, err.details);
		}
		throw err;
	}
}

function errorCode(err: unknown): string | undefined {
	if (!(err instanceof ApiError)) return undefined;
	const details = err.details as { code?: unknown } | undefined;
	return typeof details?.code === 'string' ? details.code : undefined;
}

// ─── Lookup ────────────────────────────────────────────────────────────────────

export type CardLookupResult = {
	found: boolean;
	card?: {
		id: number;
		uid: string;
		status: string;
		writeDate?: string | null;
		expirationDate?: string | null;
		sector: number | null;
		deletedAt?: string | null;
	};
	subscriber?: {
		id: number;
		firstName: string;
		lastName: string;
		email: string | null;
		courseName: string | null;
		status: string;
	} | null;
	user?: { id: number; name: string; email: string; role: string; status: string } | null;
	error?: string;
};

/** Cerca una tessera per UID; `null` se la ricerca non è riuscita. */
export async function lookupCard(uid: string): Promise<CardLookupResult | null> {
	try {
		return await apiFetch<CardLookupResult>(`/api/v1/card/lookup?uid=${encodeURIComponent(uid)}`, {
			credentials: 'include'
		});
	} catch {
		return null;
	}
}

// ─── Azioni sullo stato ────────────────────────────────────────────────────────

export type CardStateAction = 'enable' | 'disable' | 'restore' | 'delete';

const STATE_ACTION_ERRORS: Record<CardStateAction, string> = {
	enable: 'Impossibile abilitare la tessera',
	disable: 'Impossibile disabilitare la tessera',
	restore: 'Impossibile ripristinare la tessera',
	delete: 'Cancellazione fallita'
};

export async function changeCardState(cardId: number, action: CardStateAction): Promise<void> {
	await post(`/api/v1/card/${cardId}/${action}`, STATE_ACTION_ERRORS[action]);
}

// ─── Cancellazione fisica ─────────────────────────────────────────────────────

export type CardEraser = Pick<WebSerialCardWriter, 'eraseCard' | 'forceEraseCard'>;

type EraseAuthorization = {
	session_token: string;
	erase_data: { sector: number; key_a: string };
};

/**
 * Cancella una tessera registrata: autorizzazione dal server, erase via writer, conferma nel DB.
 *
 * Se l'autenticazione MIFARE fallisce (es. carta già riportata alle chiavi di fabbrica
 * FFFFFFFFFFFF) ritenta con `force_erase_card`, che prova le chiavi comuni.
 */
export async function eraseCardFlow(writer: CardEraser, cardId: number): Promise<void> {
	const { session_token, erase_data } = await post<EraseAuthorization>(
		`/api/v1/card/${cardId}/erase`,
		'Autorizzazione cancellazione fallita'
	);

	let response = await writer.eraseCard({ sector: erase_data.sector, key_a: erase_data.key_a });
	if (response.status !== 'success' && isAuthenticationFailure(response.message)) {
		response = await writer.forceEraseCard({ sector: erase_data.sector });
	}
	if (response.status !== 'success') {
		throw new CardWriterError(response.message || 'Cancellazione hardware fallita');
	}

	await post(`/api/v1/card/${cardId}/erase/confirm`, 'Conferma nel database fallita', {
		session_token
	});
}

export function isAuthenticationFailure(message: string | undefined): boolean {
	return Boolean(message?.toLowerCase().includes('authentication'));
}

/** Il firmware non conosce la chiave della carta: non è cancellabile né riscrivibile. */
export function isUnknownKeyFailure(message: string | undefined): boolean {
	return Boolean(message?.includes('unknown key'));
}

// ─── Scrittura ────────────────────────────────────────────────────────────────

export type CardOwner = { type: 'subscriber' | 'user'; id: number };

export type WriteSession = {
	session_token: string;
	key_a: string | null;
	key_b: string | null;
	sector: number;
	use_mifare: boolean;
};

export async function requestWriteSession(owner: CardOwner): Promise<WriteSession> {
	const data = await post<Partial<WriteSession> & { session_token: string }>(
		'/api/v1/card/write',
		'Impossibile ottenere l’autorizzazione di scrittura',
		owner.type === 'user' ? { user_id: owner.id } : { subscriber_id: owner.id }
	);
	return {
		session_token: data.session_token,
		key_a: data.key_a ?? null,
		key_b: data.key_b ?? null,
		sector: data.sector ?? 4,
		use_mifare: data.use_mifare ?? true
	};
}

/** Conflitti di UID che il server segnala con 409 durante la conferma della scrittura. */
export type CardUidConflict = 'UID_IN_DELETED_HISTORY' | 'UID_ALREADY_EXISTS';

export type ValidateResult = { ok: true } | { ok: false; conflict: CardUidConflict };

export async function validateCardWrite(
	sessionToken: string,
	uid: string,
	{ allowReuseDeleted = false } = {}
): Promise<ValidateResult> {
	try {
		await post('/api/v1/card/validate', 'Impossibile confermare la tessera nel database', {
			session_token: sessionToken,
			uid,
			...(allowReuseDeleted ? { allow_reuse_deleted: true } : {})
		});
		return { ok: true };
	} catch (err) {
		const code = errorCode(err);
		if (
			err instanceof ApiError &&
			err.status === 409 &&
			(code === 'UID_IN_DELETED_HISTORY' || code === 'UID_ALREADY_EXISTS')
		) {
			return { ok: false, conflict: code };
		}
		throw err;
	}
}
