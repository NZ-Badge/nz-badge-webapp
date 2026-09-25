<script lang="ts">
	import type { SubmitFunction } from '@sveltejs/kit';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { Loader2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import type { UserRole } from '$lib/db/schema';

	type EditableUser = { id: number; name: string; email: string; role: UserRole };

	let {
		open = $bindable(false),
		user = null
	}: {
		open?: boolean;
		/** Utente da modificare; `null` per crearne uno nuovo. */
		user?: EditableUser | null;
	} = $props();

	const isEdit = $derived(user !== null);
	const idPrefix = $derived(isEdit ? 'edit-user' : 'new-user');

	/** Valore iniziale che si ripristina a ogni apertura del dialog (legge `open`). */
	function resetOnOpen<T>(value: T): T {
		void open;
		return value;
	}

	// Writable $derived: modificabili nel form, ripartono dai valori iniziali a ogni apertura.
	let name = $derived(resetOnOpen(user?.name ?? ''));
	let email = $derived(resetOnOpen(user?.email ?? ''));
	let role = $derived<UserRole>(resetOnOpen(user?.role ?? 'staff'));
	let password = $derived(resetOnOpen(''));
	let confirmPassword = $derived(resetOnOpen(''));
	let errors = $derived<Record<string, string>>(resetOnOpen({}));
	let formError = $derived(resetOnOpen(''));
	let submitting = $state(false);

	function validate(): boolean {
		const next: Record<string, string> = {};
		if (!name.trim()) next.name = 'Il nome è obbligatorio';
		if (!email.trim()) next.email = 'L’email è obbligatoria';
		else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
			next.email = 'Formato email non valido';

		if (!isEdit && !password) next.password = 'La password è obbligatoria';
		else if (password && password.length < 8)
			next.password = 'La password deve contenere almeno 8 caratteri';
		if (password && password !== confirmPassword)
			next.confirmPassword = 'Le password non coincidono';

		errors = next;
		return Object.keys(next).length === 0;
	}

	const submit: SubmitFunction = ({ cancel }) => {
		formError = '';
		if (!validate()) {
			cancel();
			return;
		}
		submitting = true;
		return async ({ result, update }) => {
			try {
				if (result.type === 'success') {
					await update({ reset: false });
					open = false;
					toast.success(isEdit ? 'Utente aggiornato' : 'Utente creato');
				} else if (result.type === 'failure') {
					const data = result.data as
						{ message?: string; errors?: Record<string, string> } | undefined;
					errors = data?.errors ?? {};
					formError =
						data?.message ??
						(isEdit ? 'Impossibile aggiornare l’utente' : 'Impossibile creare l’utente');
				} else if (result.type === 'error') {
					formError = 'Operazione non riuscita. Riprova.';
				} else {
					await update();
				}
			} finally {
				submitting = false;
			}
		};
	};
</script>

{#snippet fieldError(message: string | undefined, id: string)}
	{#if message}
		<p class="text-xs text-red-600" {id}>{message}</p>
	{/if}
{/snippet}

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-[425px]">
		<form
			method="POST"
			action={isEdit ? '?/update' : '?/create'}
			use:enhance={submit}
			novalidate
			class="grid gap-4"
		>
			<Dialog.Header>
				<Dialog.Title>{isEdit ? 'Modifica utente' : 'Nuovo utente'}</Dialog.Title>
				<Dialog.Description>
					{isEdit
						? 'Aggiorna le informazioni utente. Lascia la password vuota per non modificarla.'
						: 'Aggiungi un nuovo utente al sistema. Potrà accedere subito.'}
				</Dialog.Description>
			</Dialog.Header>

			{#if user}
				<input type="hidden" name="id" value={user.id} />
			{/if}

			<div class="space-y-4 py-2">
				<div class="space-y-2">
					<Label for="{idPrefix}-name">Nome completo</Label>
					<Input
						id="{idPrefix}-name"
						name="name"
						bind:value={name}
						placeholder="Mario Rossi"
						autocomplete="name"
						aria-invalid={!!errors.name}
						aria-describedby={errors.name ? `${idPrefix}-name-error` : undefined}
					/>
					{@render fieldError(errors.name, `${idPrefix}-name-error`)}
				</div>

				<div class="space-y-2">
					<Label for="{idPrefix}-email">Email</Label>
					<Input
						id="{idPrefix}-email"
						name="email"
						type="email"
						bind:value={email}
						placeholder="mario.rossi@example.com"
						autocomplete="email"
						aria-invalid={!!errors.email}
						aria-describedby={errors.email ? `${idPrefix}-email-error` : undefined}
					/>
					{@render fieldError(errors.email, `${idPrefix}-email-error`)}
				</div>

				<div class="space-y-2">
					<Label for="{idPrefix}-role">Ruolo</Label>
					<select
						id="{idPrefix}-role"
						name="role"
						bind:value={role}
						class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
					>
						<option value="staff">Operatore - accesso a dashboard, tessere e presenze</option>
						<option value="collaborator">Collaboratore - accesso ai propri ingressi</option>
						<option value="admin">Amministratore - accesso completo al sistema</option>
					</select>
					{@render fieldError(errors.role, `${idPrefix}-role-error`)}
				</div>

				<div class="space-y-2">
					<Label for="{idPrefix}-password">
						{isEdit ? 'Nuova password' : 'Password'}
						{#if isEdit}
							<span class="ml-1 text-xs font-normal text-slate-400"
								>(lascia vuoto per non modificarla)</span
							>
						{/if}
					</Label>
					<Input
						id="{idPrefix}-password"
						name="password"
						type="password"
						bind:value={password}
						placeholder="Almeno 8 caratteri"
						autocomplete="new-password"
						aria-invalid={!!errors.password}
						aria-describedby={errors.password ? `${idPrefix}-password-error` : undefined}
					/>
					{@render fieldError(errors.password, `${idPrefix}-password-error`)}
				</div>

				{#if !isEdit || password}
					<div class="space-y-2">
						<Label for="{idPrefix}-confirm-password">
							{isEdit ? 'Conferma nuova password' : 'Conferma password'}
						</Label>
						<Input
							id="{idPrefix}-confirm-password"
							type="password"
							bind:value={confirmPassword}
							placeholder="Conferma password"
							autocomplete="new-password"
							aria-invalid={!!errors.confirmPassword}
							aria-describedby={errors.confirmPassword
								? `${idPrefix}-confirm-password-error`
								: undefined}
						/>
						{@render fieldError(errors.confirmPassword, `${idPrefix}-confirm-password-error`)}
					</div>
				{/if}

				{#if formError}
					<p class="text-sm text-red-600" role="alert">{formError}</p>
				{/if}
			</div>

			<Dialog.Footer class="gap-2">
				<Button variant="secondary" onclick={() => (open = false)} disabled={submitting}>
					Annulla
				</Button>
				<Button
					type="submit"
					disabled={submitting}
					data-tutorial-title={isEdit ? 'Salva modifiche utente' : 'Crea utente'}
					data-tutorial-description={isEdit
						? 'Salva nome, email, ruolo ed eventuale nuova password dell’utente.'
						: 'Crea l’account con il ruolo scelto: la persona potrà accedere subito con email e password.'}
				>
					{#if submitting}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" />
					{/if}
					{isEdit ? 'Salva modifiche' : 'Crea utente'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
