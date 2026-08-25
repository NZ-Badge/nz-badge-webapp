<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import SubscriberFormDialog from '$lib/components/SubscriberFormDialog.svelte';
	import { enhance } from '$app/forms';
	import {
		Pencil,
		Trash2,
		CreditCard,
		Smartphone,
		ArrowUp,
		ArrowDown,
		ArrowUpDown
	} from '@lucide/svelte';

	let { data, form } = $props();

	type SortField = typeof data.sort;

	// Stato dialogs
	let createDialogOpen = $state(false);
	let editSubscriber = $state<(typeof data.subscribers)[0] | null>(null);
	let editDialogOpen = $state(false);
	let deleteSubscriber = $state<(typeof data.subscribers)[0] | null>(null);
	let deleteDialogOpen = $state(false);

	function openEdit(sub: (typeof data.subscribers)[0]) {
		editSubscriber = sub;
		editDialogOpen = true;
	}

	function subscriberHasLinkedCard(
		sub:
			| ((typeof data.subscribers)[0] & { hasActiveCard?: boolean; hasNfcPairing?: boolean })
			| null
	) {
		return Boolean(sub?.hasActiveCard || sub?.hasNfcPairing);
	}

	function formatDateTime(d: Date | string | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleString('it-IT');
	}

	function buildListUrl({
		page = 1,
		sort = data.sort,
		dir = data.dir
	}: {
		page?: number;
		sort?: SortField;
		dir?: typeof data.dir;
	} = {}) {
		const searchParams = new URLSearchParams();

		if (data.q) searchParams.set('q', data.q);
		if (page > 1) searchParams.set('page', String(page));
		if (sort !== 'name' || dir !== 'asc') {
			searchParams.set('sort', sort);
			searchParams.set('dir', dir);
		}

		const query = searchParams.toString();
		return query ? `?${query}` : '?';
	}

	function getNextSortDirection(column: SortField) {
		if (data.sort !== column) return 'asc' as const;
		return data.dir === 'asc' ? ('desc' as const) : ('asc' as const);
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Iscritti</h1>
		<Button onclick={() => (createDialogOpen = true)}>+ Nuovo iscritto</Button>
	</div>

	<!-- Filtri -->
	<form method="GET" class="flex gap-3">
		<Input name="q" placeholder="Cerca nome o email..." value={data.q} class="max-w-xs" />
		<input type="hidden" name="sort" value={data.sort} />
		<input type="hidden" name="dir" value={data.dir} />
		<Button type="submit" variant="outline">Filtra</Button>
	</form>

	<!-- Tabella -->
	<Table>
		<TableHeader>
			<TableRow>
				<TableHead>
					<a
						href={buildListUrl({ sort: 'name', dir: getNextSortDirection('name') })}
						class="inline-flex items-center gap-1 hover:underline"
					>
						Nome
						{#if data.sort === 'name'}
							{#if data.dir === 'asc'}
								<ArrowUp size={14} />
							{:else}
								<ArrowDown size={14} />
							{/if}
						{:else}
							<ArrowUpDown size={14} />
						{/if}
					</a>
				</TableHead>
				<TableHead>
					<a
						href={buildListUrl({ sort: 'email', dir: getNextSortDirection('email') })}
						class="inline-flex items-center gap-1 hover:underline"
					>
						Email
						{#if data.sort === 'email'}
							{#if data.dir === 'asc'}
								<ArrowUp size={14} />
							{:else}
								<ArrowDown size={14} />
							{/if}
						{:else}
							<ArrowUpDown size={14} />
						{/if}
					</a>
				</TableHead>
				<TableHead class="w-32">
					<a
						href={buildListUrl({
							sort: 'latestCourseAttendance',
							dir: getNextSortDirection('latestCourseAttendance')
						})}
						class="inline-flex items-center gap-1 hover:underline"
					>
						Ore ultimo corso
						{#if data.sort === 'latestCourseAttendance'}
							{#if data.dir === 'asc'}
								<ArrowUp size={14} />
							{:else}
								<ArrowDown size={14} />
							{/if}
						{:else}
							<ArrowUpDown size={14} />
						{/if}
					</a>
				</TableHead>
				<TableHead class="w-40">
					<a
						href={buildListUrl({ sort: 'lastEntryAt', dir: getNextSortDirection('lastEntryAt') })}
						class="inline-flex items-center gap-1 hover:underline"
					>
						Ultimo ingresso
						{#if data.sort === 'lastEntryAt'}
							{#if data.dir === 'asc'}
								<ArrowUp size={14} />
							{:else}
								<ArrowDown size={14} />
							{/if}
						{:else}
							<ArrowUpDown size={14} />
						{/if}
					</a>
				</TableHead>
				<TableHead class="w-32 text-center">
					<a
						href={buildListUrl({ sort: 'card', dir: getNextSortDirection('card') })}
						class="inline-flex items-center justify-center gap-1 hover:underline"
					>
						Tessera
						{#if data.sort === 'card'}
							{#if data.dir === 'asc'}
								<ArrowUp size={14} />
							{:else}
								<ArrowDown size={14} />
							{/if}
						{:else}
							<ArrowUpDown size={14} />
						{/if}
					</a>
				</TableHead>
				<TableHead class="w-px"></TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			{#each data.subscribers as sub}
				<TableRow>
					<TableCell>
						<a href="/subscribers/{sub.id}" class="hover:underline font-medium"
							>{sub.firstName} {sub.lastName}</a
						>
					</TableCell>
					<TableCell>{sub.email}</TableCell>
					<TableCell class="text-sm">{sub.latestCourseAttendance}</TableCell>
					<TableCell class="text-sm">{formatDateTime(sub.lastEntryAt)}</TableCell>
					<TableCell class="w-32 text-center">
						<div class="flex items-center justify-center gap-1">
							{#if sub.hasActiveCard}
								<span title="Tessera RFID">
									<CreditCard size={14} class="text-blue-500" />
								</span>
							{/if}
							{#if !sub.hasActiveCard}
								<a href="/subscribers/{sub.id}/write-card">
									<Button size="sm" variant="outline" class="h-7 px-2 text-xs">
										<CreditCard size={14} />
										Crea tessera
									</Button>
								</a>
							{/if}
							{#if sub.hasNfcPairing}
								<span title="NFC smartphone">
									<Smartphone size={14} class="text-green-500" />
								</span>
							{/if}
						</div>
					</TableCell>
					<TableCell class="w-px whitespace-nowrap">
						<div class="flex items-center gap-1">
							<Button size="sm" variant="ghost" onclick={() => openEdit(sub)}>
								<Pencil size={16} />
							</Button>
							<Button
								size="sm"
								variant="ghost"
								onclick={() => {
									deleteSubscriber = sub;
									deleteDialogOpen = true;
								}}
							>
								<Trash2 size={16} />
							</Button>
						</div>
					</TableCell>
				</TableRow>
			{/each}
			{#if data.subscribers.length === 0}
				<TableRow>
					<TableCell colspan={6} class="py-8 text-center text-muted-foreground">
						Nessun iscritto trovato.
					</TableCell>
				</TableRow>
			{/if}
		</TableBody>
	</Table>

	<!-- Paginazione -->
	<div class="flex items-center justify-between text-sm text-gray-600">
		<span>Pagina {data.page} di {data.totalPages} ({data.total} totali)</span>
		<div class="flex gap-2">
			{#if data.page > 1}
				<a href={buildListUrl({ page: data.page - 1 })}>
					<Button variant="outline" size="sm">Precedente</Button>
				</a>
			{/if}
			{#if data.page < data.totalPages}
				<a href={buildListUrl({ page: data.page + 1 })}>
					<Button variant="outline" size="sm">Successiva</Button>
				</a>
			{/if}
		</div>
	</div>
</div>

<!-- Dialog crea -->
<SubscriberFormDialog bind:open={createDialogOpen} subscriber={null} formResult={form} />

<!-- Dialog modifica -->
{#if editSubscriber}
	<SubscriberFormDialog bind:open={editDialogOpen} subscriber={editSubscriber} formResult={form} />
{/if}

<!-- Dialog elimina -->
<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Elimina iscritto</DialogTitle>
		</DialogHeader>
		{#if subscriberHasLinkedCard(deleteSubscriber)}
			<div class="space-y-3 text-sm">
				<p>
					Non puoi eliminare <strong
						>{deleteSubscriber?.firstName} {deleteSubscriber?.lastName}</strong
					>
					finché ha una tessera abbinata.
				</p>
				<p class="text-muted-foreground">
					Prima rimuovi la tessera dalla pagina tessere, poi riprova a cancellare l'iscritto.
				</p>
				<a href="/cards">
					<Button variant="outline">Vai a Tessere</Button>
				</a>
			</div>
		{:else}
			<p>
				Sei sicuro di voler eliminare <strong
					>{deleteSubscriber?.firstName} {deleteSubscriber?.lastName}</strong
				>?
			</p>
		{/if}
		{#if form?.error && form?.action === 'delete'}
			<p class="text-sm text-red-600">{form.error}</p>
		{/if}
		<DialogFooter>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Annulla</Button>
			{#if !subscriberHasLinkedCard(deleteSubscriber)}
				<form
					method="POST"
					action="?/delete"
					use:enhance={() =>
						({ update }) => {
							update();
							deleteDialogOpen = false;
						}}
				>
					<input type="hidden" name="id" value={deleteSubscriber?.id} />
					<Button type="submit" variant="destructive">Elimina</Button>
				</form>
			{/if}
		</DialogFooter>
	</DialogContent>
</Dialog>
