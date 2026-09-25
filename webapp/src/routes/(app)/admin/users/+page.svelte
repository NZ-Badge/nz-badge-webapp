<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { toast } from 'svelte-sonner';
	import { Plus, Pencil, Trash2, Shield, User, Loader2, Search, RotateCcw } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { formatDateIT } from '$lib/utils/date.js';
	import { Input } from '$lib/components/ui/input';
	import * as Table from '$lib/components/ui/table';
	import { callAction } from '$lib/utils/enhance';
	import { errorMessage } from '$lib/utils/http';
	import { USER_ROLE_LABEL } from '$lib/labels';
	import UserFormDialog from './UserFormDialog.svelte';

	let { data } = $props();
	type UserRow = (typeof data.users)[number];

	let searchQuery = $state('');
	let formOpen = $state(false);
	let editingUser = $state<UserRow | null>(null);
	let deactivateOpen = $state(false);
	let deactivatingUser = $state<UserRow | null>(null);
	let reactivatingUserId = $state<number | null>(null);

	const filteredUsers = $derived.by(() => {
		const query = searchQuery.trim().toLowerCase();
		if (!query) return data.users;
		return data.users.filter(
			(u) =>
				(u.name || '').toLowerCase().includes(query) ||
				(u.email || '').toLowerCase().includes(query)
		);
	});

	function openCreateDialog() {
		editingUser = null;
		formOpen = true;
	}

	function openEditDialog(user: UserRow) {
		editingUser = user;
		formOpen = true;
	}

	function openDeactivateDialog(user: UserRow) {
		deactivatingUser = user;
		deactivateOpen = true;
	}

	async function deactivate() {
		if (!deactivatingUser) return;
		await callAction(
			'?/deactivate',
			{ id: deactivatingUser.id },
			{ error: 'Impossibile disattivare l’utente' }
		);
		toast.success('Utente disattivato');
	}

	async function reactivate(user: UserRow) {
		reactivatingUserId = user.id;
		try {
			await callAction(
				'?/reactivate',
				{ id: user.id },
				{ error: 'Impossibile riattivare l’utente' }
			);
			toast.success('Utente riattivato');
		} catch (err) {
			toast.error(errorMessage(err, 'Impossibile riattivare l’utente'));
		} finally {
			reactivatingUserId = null;
		}
	}

	function formatDate(value: Date | string | null): string {
		return formatDateIT(value) || '—';
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<PageHeader
		title="Staff e accessi"
		description="Gestisci le persone che utilizzano NZBadge e scegli quali funzioni possono usare."
	>
		{#if data.canManageAccounts}
			<Button onclick={openCreateDialog} class="gap-2" data-tutorial="user.create">
				<Plus size={16} />
				Aggiungi utente
			</Button>
		{/if}
	</PageHeader>

	<!-- Search -->
	<div class="filter-panel">
		<div class="relative flex-1 max-w-sm">
			<Search class="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
			<Input
				type="text"
				aria-label="Cerca nello staff"
				placeholder="Cerca utenti..."
				bind:value={searchQuery}
				class="pl-10"
			/>
		</div>
		<div class="text-sm text-muted-foreground">
			{filteredUsers.length} utent{filteredUsers.length !== 1 ? 'i' : 'e'}
		</div>
	</div>

	<!-- Users Table -->
	<Table.Panel>
		<Table.Root embedded>
			<Table.Header>
				<Table.Row>
					<Table.Head class="w-[200px]">Nome</Table.Head>
					<Table.Head>Email</Table.Head>
					<Table.Head class="w-[100px]">Ruolo</Table.Head>
					<Table.Head class="w-[100px]">Stato</Table.Head>
					<Table.Head class="w-[120px]">Creato</Table.Head>
					<Table.Head class="w-px text-right">Azioni</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#if filteredUsers.length === 0}
					<Table.Row>
						<Table.Cell colspan={6} data-empty>
							{searchQuery ? 'Nessun utente trovato per questa ricerca' : 'Nessun utente trovato'}
						</Table.Cell>
					</Table.Row>
				{:else}
					{#each filteredUsers as user (user.id)}
						<Table.Row>
							<Table.Cell class="font-medium">
								<div class="flex items-center gap-2">
									{#if user.role === 'admin'}
										<Shield class="h-4 w-4 text-blue-600" />
									{:else}
										<User class="h-4 w-4 text-muted-foreground" />
									{/if}
									<a href="/admin/users/{user.id}" class="app-link">{user.name || '(senza nome)'}</a
									>
								</div>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground">{user.email}</Table.Cell>
							<Table.Cell>
								<Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
									{USER_ROLE_LABEL[user.role] ?? user.role}
								</Badge>
							</Table.Cell>
							<Table.Cell>
								<Badge variant={user.status === 'active' ? 'positive' : 'secondary'}>
									{user.status === 'active' ? 'Attivo' : 'Disattivato'}
								</Badge>
							</Table.Cell>
							<Table.Cell class="text-muted-foreground text-sm">
								{formatDate(user.createdAt)}
							</Table.Cell>
							<Table.Cell class="w-px whitespace-nowrap text-right">
								{#if data.canManageAccounts && user.status === 'active'}
									<div class="flex items-center justify-end gap-1">
										<Button
											variant="ghost"
											size="icon-sm"
											onclick={() => openEditDialog(user)}
											aria-label={`Modifica ${user.name}`}
											data-tutorial="user.edit"
										>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="destructive-ghost"
											size="icon-sm"
											onclick={() => openDeactivateDialog(user)}
											aria-label={`Disattiva ${user.name}`}
											data-tutorial="user.disable"
										>
											<Trash2 class="h-4 w-4" />
										</Button>
									</div>
								{:else if data.canManageAccounts && user.status === 'deleted'}
									<Button
										variant="positive-ghost"
										size="icon-sm"
										onclick={() => reactivate(user)}
										disabled={reactivatingUserId === user.id}
										aria-label={`Riattiva ${user.name}`}
										data-tutorial="user.enable"
									>
										{#if reactivatingUserId === user.id}
											<Loader2 class="h-4 w-4 animate-spin" />
										{:else}
											<RotateCcw class="h-4 w-4" />
										{/if}
									</Button>
								{/if}
							</Table.Cell>
						</Table.Row>
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
		<Table.Pagination page={1} totalPages={1} total={filteredUsers.length} />
	</Table.Panel>
</div>

<UserFormDialog bind:open={formOpen} user={editingUser} />

<ConfirmDialog
	bind:open={deactivateOpen}
	title="Disattiva utente"
	confirmLabel="Disattiva utente"
	busyLabel="Disattivazione…"
	variant="destructive"
	tutorialDescription="Disattiva l’accesso di questo utente e ne disabilita le tessere attive. Lo storico resta conservato."
	onConfirm={deactivate}
>
	{#snippet description()}
		Sei sicuro di voler disattivare <strong
			>{deactivatingUser?.name || deactivatingUser?.email}</strong
		>? L’account verrà disattivato e lo storico resterà conservato.
	{/snippet}
</ConfirmDialog>
