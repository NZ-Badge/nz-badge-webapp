import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
	select: vi.fn(),
	insert: vi.fn(),
	update: vi.fn(),
	delete: vi.fn()
}));
vi.mock('$lib/db', () => ({ db }));
vi.mock('$lib/services/subscriber-list', () => ({ enrichSubscribersForList: vi.fn() }));
vi.mock('$lib/services/subscriber-course-attendance', () => ({
	buildSubscriberCourseAttendanceSummaries: vi.fn()
}));

import { AuthError } from '$lib/services/auth';
import { actions as listActions } from './+page.server';
import { actions as detailActions } from './[id]/+page.server';

type ActionEvent = Parameters<(typeof listActions)['delete']>[0];

function event(verifyUser: () => Promise<unknown>) {
	const body = new FormData();
	body.set('id', '7');
	body.set('firstName', 'Mario');
	body.set('lastName', 'Rossi');
	body.set('email', 'mario@example.com');
	return {
		request: new Request('http://localhost/subscribers', { method: 'POST', body }),
		params: { id: '7' },
		locals: { verifyUser }
	} as unknown as ActionEvent;
}

const anonymous = () => Promise.reject(new AuthError('No session cookie', 'UNAUTHORIZED'));
const collaborator = async () => ({ id: 2, role: 'collaborator' });

describe('subscriber form actions require staff', () => {
	beforeEach(() => vi.clearAllMocks());

	const cases = [
		['list create', listActions.create],
		['list update', listActions.update],
		['list delete', listActions.delete],
		['detail update', detailActions.update],
		['detail updateEnrollmentEndDate', detailActions.updateEnrollmentEndDate],
		['detail delete', detailActions.delete]
	] as const;

	it.each(cases)('%s redirects anonymous requests to /login', async (_name, action) => {
		await expect(action(event(anonymous) as never)).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
		expect(db.select).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
	});

	it.each(cases)('%s rejects collaborators with 403', async (_name, action) => {
		await expect(action(event(collaborator) as never)).rejects.toMatchObject({ status: 403 });
		expect(db.delete).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
	});
});
