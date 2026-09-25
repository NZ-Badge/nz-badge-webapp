import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requirePageAdmin, requirePageStaff } from '$lib/services/auth';
import type { UserRole } from '$lib/db/schema';
import { ApiError, apiAction, apiFetch } from '$lib/utils/http';

interface UserListItem {
	id: number;
	name: string;
	email: string;
	role: UserRole;
	status: 'active' | 'deleted';
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

const ROLES: readonly UserRole[] = ['admin', 'staff', 'collaborator'];

export const load: PageServerLoad = async ({ locals, fetch }) => {
	const user = await requirePageStaff(locals);
	try {
		const { users } = await apiFetch<{ users: UserListItem[] }>('/api/v1/users', { fetch });
		return { users, canManageAccounts: user.role === 'admin' };
	} catch (err) {
		if (err instanceof ApiError) error(err.status >= 400 ? err.status : 500, err.message);
		throw err;
	}
};

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function parseId(form: FormData): number | null {
	const id = Number(text(form, 'id'));
	return Number.isInteger(id) && id > 0 ? id : null;
}

function readUserForm(form: FormData) {
	const role = text(form, 'role') as UserRole;
	return {
		name: text(form, 'name'),
		email: text(form, 'email'),
		role: ROLES.includes(role) ? role : undefined,
		password: typeof form.get('password') === 'string' ? (form.get('password') as string) : ''
	};
}

/*
 * Le action delegano a `/api/v1/users` tramite `event.fetch`, così i controlli (ultimo
 * amministratore, email duplicata, proprio ruolo) e l'audit restano in un solo punto.
 * Ogni action ripete il controllo di ruolo, perché il load non viene eseguito per le POST.
 */
export const actions: Actions = {
	create: async ({ request, locals, fetch }) => {
		await requirePageAdmin(locals);
		const { name, email, role, password } = readUserForm(await request.formData());
		if (!role) return fail(400, { message: 'Ruolo non valido' });

		const res = await apiAction<{ user?: UserListItem }>('/api/v1/users', {
			method: 'POST',
			body: { name, email, role, password },
			fetch
		});
		if (!res.ok) return res.failure;
		return { user: res.data.user };
	},

	update: async ({ request, locals, fetch }) => {
		await requirePageAdmin(locals);
		const form = await request.formData();
		const id = parseId(form);
		if (!id) return fail(400, { message: 'ID utente non valido' });
		const { name, email, role, password } = readUserForm(form);
		if (!role) return fail(400, { message: 'Ruolo non valido' });

		const res = await apiAction<{ user?: UserListItem }>('/api/v1/users', {
			method: 'PATCH',
			body: { id, name, email, role, ...(password ? { password } : {}) },
			fetch
		});
		if (!res.ok) return res.failure;
		return { user: res.data.user };
	},

	deactivate: async ({ request, locals, fetch }) => {
		await requirePageAdmin(locals);
		const id = parseId(await request.formData());
		if (!id) return fail(400, { message: 'ID utente non valido' });

		const res = await apiAction<{ user?: UserListItem }>('/api/v1/users', {
			method: 'DELETE',
			body: { id },
			fetch
		});
		if (!res.ok) return res.failure;
		return { deactivated: id };
	},

	reactivate: async ({ request, locals, fetch }) => {
		await requirePageAdmin(locals);
		const id = parseId(await request.formData());
		if (!id) return fail(400, { message: 'ID utente non valido' });

		const res = await apiAction<{ user?: UserListItem }>(`/api/v1/users/${id}/reactivate`, {
			method: 'POST',
			fetch
		});
		if (!res.ok) return res.failure;
		return { reactivated: id };
	}
};
