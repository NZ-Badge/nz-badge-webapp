import type { RequestEvent } from '@sveltejs/kit';
import { getEnrollmentApiConfig } from '$lib/services/enrollments';
import { ok, unauthorized, serverError } from '$lib/utils/api';
import { AuthError } from '$lib/services/auth';

/**
 * POST /api/v1/settings/enrollment-api/test
 * Testa la connessione all'API esterna delle iscrizioni
 */
export async function POST(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdmin();
	} catch (err) {
		return err instanceof AuthError ? unauthorized(err.message) : serverError();
	}

	try {
		let apiUrl: string | null = null;
		let apiKey: string | null = null;

		// Preferisci i valori passati nel body (form non ancora salvato)
		try {
			const body = await event.request.json();
			apiUrl = body?.url?.trim() || null;
			apiKey = body?.key?.trim() || null;
		} catch {
			// body assente o non-JSON: fallback al DB
		}

		if (!apiUrl || !apiKey) {
			const saved = await getEnrollmentApiConfig();
			apiUrl = apiUrl || saved.url;
			apiKey = apiKey || saved.key;
		}

		if (!apiUrl || !apiKey) {
			return ok({
				success: false,
				message: 'URL API e API Key devono essere configurati prima di testare la connessione'
			});
		}

		// Prova a fare una richiesta all'API di health check o enrollments
		// Usiamo un endpoint che dovrebbe esistere (es. /api/v1/enrollments con limit=1)
		const testUrl = new URL(`${apiUrl}/api/v1/enrollments`);
		testUrl.searchParams.set('limit', '1');

		const response = await fetch(testUrl.toString(), {
			method: 'GET',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			signal: AbortSignal.timeout(10000) // 10 secondi timeout
		});

		if (response.ok) {
			return ok({
				success: true,
				message: `Connessione riuscita! Status: ${response.status}`
			});
		} else if (response.status === 401) {
			return ok({
				success: false,
				message: 'Autenticazione fallita: API key non valida'
			});
		} else {
			return ok({
				success: false,
				message: `Errore HTTP ${response.status}: ${response.statusText}`
			});
		}
	} catch (err) {
		console.error('[settings/enrollment-api/test] Error:', err);

		if (err instanceof Error) {
			if (err.name === 'AbortError' || err.message.includes('timeout')) {
				return ok({
					success: false,
					message: 'Timeout: il server non ha risposto entro 10 secondi'
				});
			}
			if (err.message.includes('fetch') || err.message.includes('network')) {
				return ok({
					success: false,
					message: `Errore di connessione: ${err.message}`
				});
			}
		}

		return serverError();
	}
}
