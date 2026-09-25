import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requirePageAdmin, requirePageStaff } from '$lib/services/auth';
import {
	createUser,
	deactivateUser,
	listUsers,
	reactivateUser,
	updateUser,
	UserServiceError
} from '$lib/services/users';

export const load: PageServerLoad = async ({ locals }) => {
	const user = await requirePageStaff(locals);
	return { users: await listUsers(), canManageAccounts: user.role === 'admin' };
};

function text(form: FormData, name: string): string {
	const value = form.get(name);
	return typeof value === 'string' ? value.trim() : '';
}

function readUserForm(form: FormData) {
	const password = form.get('password');
	return {
		name: text(form, 'name'),
		email: text(form, 'email'),
		role: text(form, 'role'),
		password: typeof password === 'string' ? password : ''
	};
}

/** Esegue l'operazione del service e traduce un `UserServiceError` in `fail()`. */
async function run<T>(operation: () => Promise<T>) {
	try {
		return await operation();
	} catch (err) {
		if (!(err instanceof UserServiceError)) throw err;
		const errors: Record<string, string> = {};
		for (const [field, messages] of Object.entries(err.fieldErrors ?? {})) {
			if (messages?.[0]) errors[field] = messages[0];
		}
		return fail(err.status, {
			message: err.message,
			errors: Object.keys(errors).length > 0 ? errors : undefined
		});
	}
}

/*
 * Le action chiamano direttamente `$lib/services/users`, come l'API REST: controlli (ultimo
 * amministratore, email duplicata, proprio ruolo) e audit restano in un solo punto.
 * Ogni action ripete il controllo di ruolo, perché il load non viene eseguito per le POST.
 */
export const actions: Actions = {
	create: async ({ request, locals }) => {
		const actor = await requirePageAdmin(locals);
		const input = readUserForm(await request.formData());
		return run(async () => ({ user: await createUser(input, actor) }));
	},

	update: async ({ request, locals }) => {
		const actor = await requirePageAdmin(locals);
		const form = await request.formData();
		const { password, ...input } = readUserForm(form);
		return run(async () => ({
			user: await updateUser(
				{ id: Number(text(form, 'id')), ...input, ...(password ? { password } : {}) },
				actor
			)
		}));
	},

	deactivate: async ({ request, locals }) => {
		const actor = await requirePageAdmin(locals);
		const id = Number(text(await request.formData(), 'id'));
		return run(async () => {
			await deactivateUser(id, actor);
			return { deactivated: id };
		});
	},

	reactivate: async ({ request, locals }) => {
		const actor = await requirePageAdmin(locals);
		const id = Number(text(await request.formData(), 'id'));
		return run(async () => {
			await reactivateUser(id, actor);
			return { reactivated: id };
		});
	}
};
