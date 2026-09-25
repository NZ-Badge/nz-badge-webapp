import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '$lib/db/schema';

const mocks = vi.hoisted(() => {
	const deleteWhere = vi.fn();
	const remove = vi.fn(() => ({ where: deleteWhere }));
	const select = vi.fn();
	const logAudit = vi.fn();
	return { deleteWhere, remove, select, logAudit };
});

vi.mock('$lib/db', () => ({ db: { delete: mocks.remove, select: mocks.select } }));
vi.mock('$lib/services/audit', () => ({ logAudit: mocks.logAudit }));

import {
	deleteSubscriberAttendance,
	deleteSubscriberAttendanceSchema,
	SubscriberAttendanceAdminError
} from './subscriber-attendance-admin';

const admin = { id: 1, role: 'admin' } as User;
const staff = { id: 2, role: 'staff' } as User;

describe('deleteSubscriberAttendanceSchema', () => {
	it('accepts the documented { ids } payload without mode', () => {
		const parsed = deleteSubscriberAttendanceSchema.parse({ ids: [3, 4] });
		expect(parsed).toEqual({ mode: 'ids', ids: [3, 4] });
	});

	it.each([
		{ all: true },
		{ all: true, filters: {} },
		{ mode: 'filters', filters: {} },
		{ mode: 'filters', filters: { from: '', to: '', subscriber: ' ', device: '' } },
		{ mode: 'ids', ids: [] },
		{ mode: 'filters', filters: { from: '2026-03-12', to: '2026-03-11' } },
		{ mode: 'filters', filters: { from: '2026-02-30' } }
	])('rejects an unsafe or invalid payload: %j', (body) => {
		expect(deleteSubscriberAttendanceSchema.safeParse(body).success).toBe(false);
	});

	it('accepts a filter-based delete with at least one filter', () => {
		const parsed = deleteSubscriberAttendanceSchema.parse({
			mode: 'filters',
			filters: { from: '2026-03-11', to: '', device: 'reader-1' }
		});
		expect(parsed).toEqual({
			mode: 'filters',
			filters: { from: '2026-03-11', to: undefined, subscriber: undefined, device: 'reader-1' }
		});
	});
});

describe('deleteSubscriberAttendance', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.deleteWhere.mockResolvedValue([{ affectedRows: 5 }]);
	});

	it('refuses a filter-based delete from a non-admin before touching the database', async () => {
		await expect(
			deleteSubscriberAttendance({
				actor: staff,
				request: { mode: 'filters', filters: { from: '2026-03-11', to: '2026-03-11' } }
			})
		).rejects.toMatchObject({
			code: 'FORBIDDEN'
		} satisfies Partial<SubscriberAttendanceAdminError>);
		expect(mocks.remove).not.toHaveBeenCalled();
		expect(mocks.logAudit).not.toHaveBeenCalled();
	});

	it('refuses a filter-based delete without filters even for an admin', async () => {
		await expect(
			deleteSubscriberAttendance({ actor: admin, request: { mode: 'filters', filters: {} } })
		).rejects.toMatchObject({ code: 'INVALID_FILTERS' });
		expect(mocks.remove).not.toHaveBeenCalled();
	});

	it('lets staff delete explicitly selected records and audits them', async () => {
		mocks.deleteWhere.mockResolvedValueOnce([{ affectedRows: 2 }]);
		const result = await deleteSubscriberAttendance({
			actor: staff,
			request: { mode: 'ids', ids: [7, 8] }
		});
		expect(result).toEqual({ deleted: 2 });
		expect(mocks.logAudit).toHaveBeenCalledWith({
			userId: 2,
			action: 'DELETE',
			entityType: 'attendance',
			entityId: undefined,
			dataBefore: { mode: 'ids', ids: [7, 8], count: 2 }
		});
	});

	it('deletes by filters for an admin and audits count and filters', async () => {
		const filters = { from: '2026-03-11', to: '2026-03-11' };
		const result = await deleteSubscriberAttendance({
			actor: admin,
			request: { mode: 'filters', filters }
		});
		expect(result).toEqual({ deleted: 5 });
		expect(mocks.deleteWhere).toHaveBeenCalledOnce();
		expect(mocks.deleteWhere.mock.calls[0][0]).toBeDefined();
		expect(mocks.logAudit).toHaveBeenCalledWith({
			userId: 1,
			action: 'DELETE',
			entityType: 'attendance',
			entityId: undefined,
			dataBefore: { mode: 'filters', filters, count: 5 }
		});
	});
});
