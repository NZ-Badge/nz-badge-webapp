import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({
	selectedDateRange: vi.fn(() => ({ start: '2026-09-01', end: '2026-09-30', next: '2026-10-01' })),
	countNewStudents: vi.fn(),
	getNewStudents: vi.fn()
}));

vi.mock('$lib/services/new-students', () => service);

import { load } from './+page.server';

describe('new students pagination', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		service.countNewStudents.mockResolvedValue(52);
		service.getNewStudents.mockResolvedValue([]);
	});

	it('keeps the selected range and loads only the requested page', async () => {
		const url = new URL('http://localhost/new-students?from=2026-09-01&to=2026-09-30&page=2');
		const result = await load({ url } as Parameters<typeof load>[0]);

		expect(service.selectedDateRange).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
		expect(service.countNewStudents).toHaveBeenCalledWith('2026-09-01', '2026-10-01');
		expect(service.getNewStudents).toHaveBeenCalledWith('2026-09-01', '2026-10-01', {
			limit: 25,
			offset: 25
		});
		expect(result).toMatchObject({ total: 52, page: 2, totalPages: 3 });
	});

	it('clamps an out-of-range page to the last available page', async () => {
		const url = new URL('http://localhost/new-students?page=99');
		const result = await load({ url } as Parameters<typeof load>[0]);

		expect(service.getNewStudents).toHaveBeenCalledWith('2026-09-01', '2026-10-01', {
			limit: 25,
			offset: 50
		});
		expect(result).toMatchObject({ total: 52, page: 3, totalPages: 3 });
	});
});
