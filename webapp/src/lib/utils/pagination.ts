import { z } from 'zod';

/** Limite superiore di sicurezza: numeri di pagina oltre questa soglia sono considerati non validi. */
export const MAX_PAGE = 100_000;

const pageSchema = z.coerce.number().int().positive().max(MAX_PAGE);

export interface Pagination {
	page: number;
	pageSize: number;
	offset: number;
}

/**
 * Legge `?page=` dalla URL. Valori mancanti o non validi (`abc`, `0`, `-1`, `1.5`)
 * ricadono sulla pagina 1, cosi' l'offset e' sempre un intero non negativo.
 */
export function parsePagination(url: URL, pageSize: number): Pagination {
	const parsed = pageSchema.safeParse(url.searchParams.get('page') ?? undefined);
	const page = parsed.success ? parsed.data : 1;
	return { page, pageSize, offset: (page - 1) * pageSize };
}

/**
 * Limita la pagina richiesta all'ultima disponibile per `total` elementi
 * (almeno una pagina, anche con zero risultati).
 */
export function clampPagination(
	pagination: Pagination,
	total: number
): Pagination & { totalPages: number } {
	const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
	const page = Math.min(pagination.page, totalPages);
	return {
		page,
		pageSize: pagination.pageSize,
		offset: (page - 1) * pagination.pageSize,
		totalPages
	};
}
