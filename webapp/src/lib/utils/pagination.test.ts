import { describe, expect, it } from 'vitest';
import { clampPagination, MAX_PAGE, parsePagination } from './pagination';

const url = (query = '') => new URL(`http://localhost/list${query}`);

describe('parsePagination', () => {
	it('defaults to the first page', () => {
		expect(parsePagination(url(), 25)).toEqual({ page: 1, pageSize: 25, offset: 0 });
	});

	it('computes the offset for a valid page', () => {
		expect(parsePagination(url('?page=3'), 25)).toEqual({ page: 3, pageSize: 25, offset: 50 });
	});

	it.each(['abc', '', '0', '-2', '1.5', 'NaN', 'Infinity', '1e400', String(MAX_PAGE + 1)])(
		'falls back to page 1 for %j',
		(value) => {
			const pagination = parsePagination(url(`?page=${encodeURIComponent(value)}`), 20);
			expect(pagination).toEqual({ page: 1, pageSize: 20, offset: 0 });
		}
	);
});

describe('clampPagination', () => {
	it('limits the page to the last available one', () => {
		expect(clampPagination(parsePagination(url('?page=9'), 10), 25)).toEqual({
			page: 3,
			pageSize: 10,
			offset: 20,
			totalPages: 3
		});
	});

	it('keeps at least one page when there are no results', () => {
		expect(clampPagination(parsePagination(url('?page=4'), 10), 0)).toEqual({
			page: 1,
			pageSize: 10,
			offset: 0,
			totalPages: 1
		});
	});
});
