import { CardWriterError } from '$lib/services/card-writer';
import { badRequest, conflict, notFound } from '$lib/utils/api';

/**
 * HTTP response for a `CardWriterError`, based on its code rather than on the message text:
 * NOT_FOUND → 404, UID conflicts → 409 with `details.code`, other domain errors → 400.
 * Returns `null` for any other error, which the caller logs and turns into a 500.
 */
export function cardWriterErrorResponse(err: unknown): Response | null {
	if (!(err instanceof CardWriterError)) return null;
	switch (err.code) {
		case 'NOT_FOUND':
			return notFound(err.message);
		case 'UID_ALREADY_EXISTS':
		case 'UID_IN_DELETED_HISTORY':
			return conflict(err.message, { code: err.code });
		default:
			return badRequest(err.message);
	}
}
