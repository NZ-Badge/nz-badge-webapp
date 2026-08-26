<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Plus,
		Pencil,
		Trash2,
		Shield,
		User,
		AlertCircle,
		CheckCircle,
		Loader2,
		Search
	} from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Alert from '$lib/components/ui/alert';
	import * as Table from '$lib/components/ui/table';
	import type { UserRole } from '$lib/db/schema';

	// Types
	interface User {
		id: number;
		name: string;
		email: string;
		role: UserRole;
		status: 'active' | 'deleted';
		deletedAt: string | null;
		createdAt: string;
		updatedAt: string;
	}

	interface FormData {
		name: string;
		email: string;
		role: UserRole;
		password: string;
		confirmPassword: string;
	}

	let { data } = $props();

	// State
	let users = $state<User[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let searchQuery = $state('');

	// Dialog states
	let isCreateDialogOpen = $state(false);
	let isEditDialogOpen = $state(false);
	let isDeleteDialogOpen = $state(false);
	let selectedUser = $state<User | null>(null);

	// Form state
	let formData = $state<FormData>({
		name: '',
		email: '',
		role: 'staff',
		password: '',
		confirmPassword: ''
	});
	let formErrors = $state<Record<string, string>>({});
	let submitting = $state(false);
	let successMessage = $state<string | null>(null);

	// Filtered users based on search
	const filteredUsers = $derived(
		users.filter((u) => {
			const nameMatch = (u.name || '').toLowerCase().includes(searchQuery.toLowerCase());
			const emailMatch = (u.email || '').toLowerCase().includes(searchQuery.toLowerCase());
			return nameMatch || emailMatch;
		})
	);

	// Load users on mount
	onMount(() => {
		loadUsers();
	});

	async function loadUsers() {
		try {
			loading = true;
			error = null;

			const response = await fetch('/api/v1/users');
			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Impossibile caricare gli utenti');
			}

			const data = await response.json();
			users = data.users;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossibile caricare gli utenti';
		} finally {
			loading = false;
		}
	}

	function resetForm() {
		formData = {
			name: '',
			email: '',
			role: 'staff',
			password: '',
			confirmPassword: ''
		};
		formErrors = {};
	}

	function openCreateDialog() {
		resetForm();
		isCreateDialogOpen = true;
	}

	function openEditDialog(user: User) {
		selectedUser = user;
		formData = {
			name: user.name,
			email: user.email,
			role: user.role,
			password: '',
			confirmPassword: ''
		};
		formErrors = {};
		isEditDialogOpen = true;
	}

	function openDeleteDialog(user: User) {
		selectedUser = user;
		isDeleteDialogOpen = true;
	}

	function validateForm(isEdit = false): boolean {
		formErrors = {};

		if (!formData.name.trim()) {
			formErrors.name = 'Il nome è obbligatorio';
		}

		if (!formData.email.trim()) {
			formErrors.email = 'L’email è obbligatoria';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
			formErrors.email = 'Formato email non valido';
		}

		if (!isEdit || formData.password) {
			if (!isEdit && !formData.password) {
				formErrors.password = 'La password è obbligatoria';
			}
			if (formData.password && formData.password.length < 8) {
				formErrors.password = 'La password deve contenere almeno 8 caratteri';
			}
			if (formData.password !== formData.confirmPassword) {
				formErrors.confirmPassword = 'Le password non coincidono';
			}
		}

		return Object.keys(formErrors).length === 0;
	}

	async function handleCreate() {
		if (!validateForm(false)) return;

		try {
			submitting = true;
			error = null;

			const response = await fetch('/api/v1/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: formData.name,
					email: formData.email,
					role: formData.role,
					password: formData.password
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Impossibile creare l’utente');
			}

			users = [...users, data.user];
			isCreateDialogOpen = false;
			showSuccess('Utente creato con successo');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossibile creare l’utente';
		} finally {
			submitting = false;
		}
	}

	async function handleUpdate() {
		if (!selectedUser || !validateForm(true)) return;

		try {
			submitting = true;
			error = null;

			const body: Record<string, unknown> = {
				id: selectedUser.id,
				name: formData.name,
				email: formData.email,
				role: formData.role
			};

			if (formData.password) {
				body.password = formData.password;
			}

			const response = await fetch('/api/v1/users', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Impossibile aggiornare l’utente');
			}

			users = users.map((u) => (u.id === selectedUser!.id ? data.user : u));
			isEditDialogOpen = false;
			showSuccess('Utente aggiornato con successo');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossibile aggiornare l’utente';
		} finally {
			submitting = false;
		}
	}

	async function handleDelete() {
		if (!selectedUser) return;

		try {
			submitting = true;
			error = null;

			const response = await fetch('/api/v1/users', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: selectedUser.id })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Impossibile disattivare l’utente');
			}

			await loadUsers();
			isDeleteDialogOpen = false;
			showSuccess('Utente disattivato con successo');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Impossibile disattivare l’utente';
		} finally {
			submitting = false;
		}
	}

	function showSuccess(message: string) {
		successMessage = message;
		setTimeout(() => {
			successMessage = null;
		}, 3000);
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('it-IT', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-slate-900">Staff</h1>
			<p class="text-sm text-slate-500 mt-1">
				Gestisci gli utenti del sistema e i relativi livelli di accesso
			</p>
		</div>
		{#if data.canManageAccounts}
			<Button onclick={openCreateDialog} class="gap-2">
				<Plus size={16} />
				Aggiungi utente
			</Button>
		{/if}
	</div>

	<!-- Alerts -->
	{#if error}
		<Alert.Root variant="destructive" class="animate-in fade-in slide-in-from-top-2">
			<AlertCircle class="h-4 w-4" />
			<Alert.Title>Errore</Alert.Title>
			<Alert.Description>{error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if successMessage}
		<Alert.Root class="bg-green-50 border-green-200 animate-in fade-in slide-in-from-top-2">
			<CheckCircle class="h-4 w-4 text-green-600" />
			<Alert.Title class="text-green-800">Operazione completata</Alert.Title>
			<Alert.Description class="text-green-700">{successMessage}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Search -->
	<div class="flex items-center gap-4">
		<div class="relative flex-1 max-w-sm">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
			<Input type="text" placeholder="Cerca utenti..." bind:value={searchQuery} class="pl-10" />
		</div>
		<div class="text-sm text-slate-500">
			{filteredUsers.length} utent{filteredUsers.length !== 1 ? 'i' : 'e'}
		</div>
	</div>

	<!-- Users Table -->
	<div class="rounded-lg border bg-white shadow-sm">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-[200px]">Nome</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head class="w-[100px]">Ruolo</Table.Head>
					<Table.Head class="w-[100px]">Stato</Table.Head>
					<Table.Head class="w-[120px]">Creato</Table.Head>
					<Table.Head class="w-[100px] text-right">Azioni</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if loading}
					<Table.Row>
						<Table.Cell colspan={6} class="h-32 text-center">
							<div class="flex items-center justify-center gap-2 text-slate-500">
								<Loader2 class="h-5 w-5 animate-spin" />
								<span>Caricamento utenti...</span>
							</div>
						</Table.Cell>
					</Table.Row>
				{:else if filteredUsers.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} class="h-32 text-center text-slate-500">
							{searchQuery ? 'Nessun utente trovato per questa ricerca' : 'Nessun utente trovato'}
						</Table.Cell>
					</Table.Row>
				{:else}
					{#each filteredUsers as user (user.id)}
						<Table.Row class="group">
							<Table.Cell class="font-medium">
								<div class="flex items-center gap-2">
									{#if user.role === 'admin'}
										<Shield class="h-4 w-4 text-blue-600" />
									{:else}
										<User class="h-4 w-4 text-slate-400" />
									{/if}
									<a href="/admin/users/{user.id}" class="hover:underline"
										>{user.name || '(senza nome)'}</a
									>
								</div>
							</Table.Cell>
							<Table.Cell class="text-slate-600">{user.email}</Table.Cell>
							<Table.Cell>
								<span
									class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
									{user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}"
								>
									{user.role === 'admin'
										? 'Amministratore'
										: user.role === 'staff'
											? 'Operatore'
											: 'Collaboratore'}
								</span>
							</Table.Cell>
							<Table.Cell>
								<span
									class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium {user.status ===
									'active'
										? 'bg-green-100 text-green-800'
										: 'bg-slate-100 text-slate-600'}"
								>
									{user.status === 'active' ? 'Attivo' : 'Disattivato'}
								</span>
							</Table.Cell>
							<Table.Cell class="text-slate-500 text-sm">
								{formatDate(user.createdAt)}
							</Table.Cell>
							<Table.Cell class="text-right">
								{#if data.canManageAccounts && user.status === 'active'}
									<div
										class="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
									>
										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8"
											onclick={() => openEditDialog(user)}
											title="Modifica utente"
										>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											class="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
											onclick={() => openDeleteDialog(user)}
											title="Disattiva utente"
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</div>

<!-- Create User Dialog -->
<Dialog.Root bind:open={isCreateDialogOpen}>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Nuovo utente</Dialog.Title>
			<Dialog.Description>
				Aggiungi un nuovo utente al sistema. Potrà accedere subito.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<div class="space-y-2">
				<Label for="name">Nome completo</Label>
				<Input
					id="name"
					bind:value={formData.name}
					placeholder="John Doe"
					class={formErrors.name ? 'border-red-500' : ''}
				/>
				{#if formErrors.name}
					<p class="text-xs text-red-500">{formErrors.name}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					type="email"
					bind:value={formData.email}
					placeholder="john@example.com"
					class={formErrors.email ? 'border-red-500' : ''}
				/>
				{#if formErrors.email}
					<p class="text-xs text-red-500">{formErrors.email}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="role">Ruolo</Label>
				<select
					id="role"
					bind:value={formData.role}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<option value="staff">Operatore - accesso a dashboard, tessere e presenze</option>
					<option value="collaborator">Collaboratore - accesso ai propri ingressi</option>
					<option value="admin">Amministratore - accesso completo al sistema</option>
				</select>
			</div>

			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input
					id="password"
					type="password"
					bind:value={formData.password}
					placeholder="Min 8 characters"
					class={formErrors.password ? 'border-red-500' : ''}
				/>
				{#if formErrors.password}
					<p class="text-xs text-red-500">{formErrors.password}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="confirmPassword">Conferma password</Label>
				<Input
					id="confirmPassword"
					type="password"
					bind:value={formData.confirmPassword}
					placeholder="Conferma password"
					class={formErrors.confirmPassword ? 'border-red-500' : ''}
				/>
				{#if formErrors.confirmPassword}
					<p class="text-xs text-red-500">{formErrors.confirmPassword}</p>
				{/if}
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isCreateDialogOpen = false)}>Annulla</Button>
			<Button onclick={handleCreate} disabled={submitting}>
				{#if submitting}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				Crea utente
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Edit User Dialog -->
<Dialog.Root bind:open={isEditDialogOpen}>
	<Dialog.Content class="sm:max-w-[425px]">
		<Dialog.Header>
			<Dialog.Title>Modifica utente</Dialog.Title>
			<Dialog.Description>
				Aggiorna le informazioni utente. Lascia la password vuota per non modificarla.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-4">
			<div class="space-y-2">
				<Label for="edit-name">Nome completo</Label>
				<Input
					id="edit-name"
					bind:value={formData.name}
					class={formErrors.name ? 'border-red-500' : ''}
				/>
				{#if formErrors.name}
					<p class="text-xs text-red-500">{formErrors.name}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="edit-email">Email</Label>
				<Input
					id="edit-email"
					type="email"
					bind:value={formData.email}
					class={formErrors.email ? 'border-red-500' : ''}
				/>
				{#if formErrors.email}
					<p class="text-xs text-red-500">{formErrors.email}</p>
				{/if}
			</div>

			<div class="space-y-2">
				<Label for="edit-role">Ruolo</Label>
				<select
					id="edit-role"
					bind:value={formData.role}
					class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				>
					<option value="staff">Operatore - accesso a dashboard, tessere e presenze</option>
					<option value="collaborator">Collaboratore - accesso ai propri ingressi</option>
					<option value="admin">Amministratore - accesso completo al sistema</option>
				</select>
			</div>

			<div class="space-y-2">
				<Label for="edit-password">
					Nuova password
					<span class="text-xs text-slate-400 font-normal ml-1"
						>(lascia vuoto per non modificarla)</span
					>
				</Label>
				<Input
					id="edit-password"
					type="password"
					bind:value={formData.password}
					placeholder="Min 8 characters"
					class={formErrors.password ? 'border-red-500' : ''}
				/>
				{#if formErrors.password}
					<p class="text-xs text-red-500">{formErrors.password}</p>
				{/if}
			</div>

			{#if formData.password}
				<div class="space-y-2">
					<Label for="edit-confirm-password">Conferma nuova password</Label>
					<Input
						id="edit-confirm-password"
						type="password"
						bind:value={formData.confirmPassword}
						class={formErrors.confirmPassword ? 'border-red-500' : ''}
					/>
					{#if formErrors.confirmPassword}
						<p class="text-xs text-red-500">{formErrors.confirmPassword}</p>
					{/if}
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isEditDialogOpen = false)}>Annulla</Button>
			<Button onclick={handleUpdate} disabled={submitting}>
				{#if submitting}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				Salva modifiche
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Delete Confirmation Dialog -->
<Dialog.Root bind:open={isDeleteDialogOpen}>
	<Dialog.Content class="sm:max-w-[400px]">
		<Dialog.Header>
			<Dialog.Title class="flex items-center gap-2 text-red-600">
				<AlertCircle class="h-5 w-5" />
				Disattiva utente
			</Dialog.Title>
			<Dialog.Description>
				Sei sicuro di voler disattivare <strong>{selectedUser?.name || selectedUser?.email}</strong
				>? L’account verrà disattivato e lo storico resterà conservato.
			</Dialog.Description>
		</Dialog.Header>

		<Dialog.Footer class="gap-2 sm:gap-0">
			<Button variant="outline" onclick={() => (isDeleteDialogOpen = false)}>Annulla</Button>
			<Button variant="destructive" onclick={handleDelete} disabled={submitting}>
				{#if submitting}
					<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				{/if}
				Disattiva utente
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
