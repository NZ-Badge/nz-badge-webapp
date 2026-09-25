import { UserServiceError } from '$lib/services/users';
import { badRequest, conflict, forbidden, notFound } from '$lib/utils/api';

/** Traduce un errore del service utenti nella risposta HTTP corrispondente. */
export function userErrorResponse(err: unknown): Response {
	if (!(err instanceof UserServiceError)) throw err;
	switch (err.code) {
		case 'VALIDATION_ERROR':
			return badRequest(err.message, err.fieldErrors);
		case 'FORBIDDEN':
			return forbidden(err.message);
		case 'NOT_FOUND':
			return notFound(err.message);
		case 'CONFLICT':
			return conflict(err.message);
	}
}
