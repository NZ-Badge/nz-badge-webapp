import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '$lib/db/schema';

const mocks = vi.hoisted(() => {
	const limit = vi.fn();
	const selectWhere = vi.fn(() => ({ limit }));
	const from = vi.fn(() => ({ where: selectWhere }));
	const select = vi.fn(() => ({ from }));
	const deleteWhere = vi.fn();
	const remove = vi.fn(() => ({ where: deleteWhere }));
	const logAudit = vi.fn();
	return { limit, select, remove, deleteWhere, logAudit };
});

vi.mock('$lib/db', () => ({ db: { select: mocks.select, delete: mocks.remove } }));
vi.mock('$lib/services/audit', () => ({ logAudit: mocks.logAudit }));

import { deleteStaffAttendance, StaffAttendanceError } from './staff-attendance';

const manager = { id: 1, role: 'staff' } as User;
const collaborator = { id: 2, role: 'collaborator' } as User;

describe('deleteStaffAttendance', () => {
	beforeEach(() => vi.clearAllMocks());

	// Policy (README, canDeleteStaffAttendance, /my-attendance e dashboard): un Collaboratore può
	// eliminare soltanto le proprie strisciate, quindi il controllo richiede prima la lettura del
	// record per conoscerne il proprietario.
	it("refuses a collaborator deleting another user's record without deleting it", async () => {
		mocks.limit.mockResolvedValueOnce([
			{
				id: 7,
				userId: 3,
				eventType: 'entry',
				readTimestamp: new Date('2026-09-25T07:00:00Z'),
				source: 'card'
			}
		]);
		await expect(
			deleteStaffAttendance({ actor: collaborator, attendanceId: 7 })
		).rejects.toMatchObject({ code: 'FORBIDDEN' } satisfies Partial<StaffAttendanceError>);
		expect(mocks.remove).not.toHaveBeenCalled();
		expect(mocks.logAudit).not.toHaveBeenCalled();
	});

	it('lets a collaborator delete their own record', async () => {
		mocks.limit.mockResolvedValueOnce([
			{
				id: 8,
				userId: collaborator.id,
				eventType: 'entry',
				readTimestamp: new Date('2026-09-25T07:00:00Z'),
				source: 'card'
			}
		]);
		await deleteStaffAttendance({ actor: collaborator, attendanceId: 8 });
		expect(mocks.remove).toHaveBeenCalledOnce();
		expect(mocks.logAudit).toHaveBeenCalledOnce();
	});

	it('reports a missing event without deleting it', async () => {
		mocks.limit.mockResolvedValueOnce([]);
		await expect(deleteStaffAttendance({ actor: manager, attendanceId: 7 })).rejects.toMatchObject({
			code: 'NOT_FOUND'
		} satisfies Partial<StaffAttendanceError>);
		expect(mocks.remove).not.toHaveBeenCalled();
	});

	it('deletes one event and records its details in the audit log', async () => {
		mocks.limit.mockResolvedValueOnce([
			{
				id: 7,
				userId: 3,
				eventType: 'exit',
				readTimestamp: new Date('2026-09-25T16:00:00Z'),
				source: 'card'
			}
		]);
		await deleteStaffAttendance({ actor: manager, attendanceId: 7 });
		expect(mocks.remove).toHaveBeenCalledOnce();
		expect(mocks.deleteWhere).toHaveBeenCalledOnce();
		expect(mocks.logAudit).toHaveBeenCalledWith({
			userId: 1,
			action: 'DELETE',
			entityType: 'staff_attendance',
			entityId: 7,
			dataBefore: {
				targetUserId: 3,
				eventType: 'exit',
				readTimestamp: '2026-09-25T16:00:00.000Z',
				source: 'card'
			}
		});
	});
});
