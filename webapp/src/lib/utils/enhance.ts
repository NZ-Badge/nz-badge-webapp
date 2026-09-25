import type { SubmitFunction } from '@sveltejs/kit';
import { deserialize } from '$app/forms';
import { goto, invalidateAll } from '$app/navigation';
import { toast } from 'svelte-sonner';

type ActionPayload = Record<string, unknown> | undefined;

export interface ToastEnhanceOptions {
	/** Messaggio (o funzione dei dati restituiti dall'action) mostrato in caso di successo. */
	success?: string | ((data: ActionPayload) => string | undefined);
	/** Messaggio di ripiego se l'action fallisce senza fornire `message`. */
	error?: string;
	/** Chiamato prima dell'invio (es. per impostare lo stato di attesa). */
	onStart?: () => void;
	/** Chiamato a richiesta terminata, con qualunque esito. */
	onDone?: () => void;
	/** Chiamato dopo un successo, dopo l'aggiornamento dei dati della pagina. */
	onSuccess?: (data: ActionPayload) => unknown;
	/** Reimposta il form dopo un successo (default: true, come `use:enhance`). */
	reset?: boolean;
}

function failureMessage(data: ActionPayload, fallback: string): string {
	const message = data?.message ?? data?.error;
	return typeof message === 'string' && message ? message : fallback;
}

/**
 * `SubmitFunction` per `use:enhance` che notifica l'esito dell'action con un toast.
 * Le action segnalano gli errori con `fail(status, { message })`.
 */
export function toastEnhance(options: ToastEnhanceOptions = {}): SubmitFunction {
	const { error = 'Operazione non riuscita', reset = true } = options;
	return () => {
		options.onStart?.();
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					await update({ reset });
					const data = result.data as ActionPayload;
					const message =
						typeof options.success === 'function' ? options.success(data) : options.success;
					if (message) toast.success(message);
					await options.onSuccess?.(data);
				} else if (result.type === 'failure') {
					await update({ reset: false });
					toast.error(failureMessage(result.data as ActionPayload, error));
				} else if (result.type === 'error') {
					const message = (result.error as { message?: unknown } | undefined)?.message;
					toast.error(typeof message === 'string' && message ? message : error);
				} else {
					await update();
				}
			} finally {
				options.onDone?.();
			}
		};
	};
}

export interface CallActionOptions {
	/** Ricarica i dati della pagina dopo un successo (default: true). */
	invalidate?: boolean;
	/** Messaggio di ripiego se l'action fallisce senza fornire `message`. */
	error?: string;
}

/**
 * Invoca una form action da codice (es. dalla conferma di un dialog) e restituisce i dati
 * dell'esito positivo. Lancia un `Error` con il messaggio dell'action in caso di fallimento.
 */
export async function callAction(
	action: string,
	data: FormData | Record<string, string | number | boolean | null | undefined> = {},
	options: CallActionOptions = {}
): Promise<ActionPayload> {
	const { invalidate = true, error = 'Operazione non riuscita' } = options;
	let body: FormData;
	if (data instanceof FormData) {
		body = data;
	} else {
		body = new FormData();
		for (const [key, value] of Object.entries(data)) {
			if (value !== null && value !== undefined) body.set(key, String(value));
		}
	}

	let response: Response;
	try {
		response = await fetch(action, {
			method: 'POST',
			body,
			headers: { accept: 'application/json', 'x-sveltekit-action': 'true' }
		});
	} catch {
		throw new Error('Impossibile contattare il server. Controlla la connessione.');
	}

	const result = deserialize(await response.text());
	switch (result.type) {
		case 'success':
			if (invalidate) await invalidateAll();
			return result.data as ActionPayload;
		case 'failure':
			throw new Error(failureMessage(result.data as ActionPayload, error));
		case 'redirect':
			await goto(result.location, { invalidateAll: true });
			return undefined;
		case 'error': {
			const message = (result.error as { message?: unknown } | undefined)?.message;
			throw new Error(typeof message === 'string' && message ? message : error);
		}
	}
}
