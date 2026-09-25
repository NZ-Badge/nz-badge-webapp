import type { RequestEvent } from '@sveltejs/kit';
import { ok, badRequest, serverError, conflict, authErrorResponse } from '$lib/utils/api';
import { getSettingsOverview } from '$lib/services/settings-view';
import { SettingsUpdateError, updateSettings } from '$lib/services/settings-update';
import { createLogger } from '$lib/server/logger';

const log = createLogger('api/settings');

/**
 * GET /api/v1/settings
 * Restituisce i settings (segreti mascherati) e lo stato della configurazione MIFARE.
 * Solo Amministratori.
 */
export async function GET(event: RequestEvent): Promise<Response> {
	try {
		await event.locals.verifyAdminOnly();
	} catch (err) {
		return authErrorResponse(err);
	}

	try {
		const overview = await getSettingsOverview();
		return ok({
			settings: overview.settings,
			values: overview.values,
			mifare_keys: overview.mifareKeys,
			active_cards_count: overview.activeCardsCount,
			enrollment_api: {
				url: overview.enrollmentApi.url,
				has_key: overview.enrollmentApi.hasKey
			},
			webhook: { has_secret: overview.webhook.hasSecret }
		});
	} catch (err) {
		log.error('GET failed', { err });
		return serverError();
	}
}

/**
 * PATCH /api/v1/settings
 * Aggiorna uno o più settings
 */
export async function PATCH(event: RequestEvent): Promise<Response> {
	let user;
	try {
		user = await event.locals.verifyAdminOnly();
	} catch (err) {
		return authErrorResponse(err);
	}

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		return badRequest('JSON non valido');
	}

	try {
		const result = await updateSettings(body, user);
		return ok({ settings: result.settings, mifare_keys: result.mifareKeys });
	} catch (err) {
		if (err instanceof SettingsUpdateError) {
			return err.code === 'VALIDATION_ERROR'
				? badRequest(err.message, err.details)
				: conflict(err.message, err.details);
		}
		log.error('PATCH failed', { err });
		return serverError();
	}
}
