<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Table,
		TablePanel,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TablePagination,
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
		ArrowUpDown,
		Users,
		Search
	} from '@lucide/svelte';

	let { data, form } = $props();

	type SortField = typeof data.sort;

	// Stato dialogs
	let createDialogOpen = $state(false);
	let editSubscriber = $state<(typeof data.subscribers)[0] | null>(null);
	let editDialogOpen = $state(false);
	let deleteSubscriber = $state<(typeof data.subscribers)[0] | null>(null);
	let deleteDialogOpen = $state(false);
	const linkedCardsOnPage = $derived(
		data.subscribers.filter((sub) => sub.hasActiveCard || sub.hasNfcPairing).length
	);

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

	const statusVariant = (status: string) =>
		status === 'active'
			? 'positive'
			: status === 'completed'
				? 'secondary'
				: status === 'suspended'
					? 'warning'
					: 'destructive';

	const statusLabel = (status: string) =>
		status === 'active'
			? 'Attivo'
			: status === 'completed'
				? 'Completato'
				: status === 'suspended'
					? 'Sospeso'
					: status === 'cancelled'
						? 'Annullato'
						: status;
</script>

<div class="space-y-6">
	<PageHeader
		title="Iscritti"
		description="Cerca una persona per consultare presenze, tessere, corsi e dati di contatto."
	>
		<Button
			onclick={() => (createDialogOpen = true)}
			data-tutorial-title="Nuovo iscritto"
			data-tutorial-description="Apre il modulo per registrare un nuovo iscritto con dati anagrafici, contatti e stato."
		>
			+ Nuovo iscritto
		</Button>
		{#snippet summary()}
			<span
				class="rounded-full border border-blue-200 bg-white/80 px-3 py-1.5 font-medium text-blue-900 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200"
			>
				{data.total}
				{data.total === 1 ? 'iscritto totale' : 'iscritti totali'}
			</span>
			<span
				class="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
			>
				{linkedCardsOnPage} con tessera in questa pagina
			</span>
		{/snippet}
	</PageHeader>

	<!-- Filtri -->
	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4 shadow-sm">
		<label class="grid w-full min-w-0 flex-1 gap-1.5 text-sm font-medium sm:min-w-64">
			Cerca iscritti
			<span class="relative">
				<Search
					class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
					size={16}
					aria-hidden="true"
				/>
				<Input name="q" placeholder="Nome, cognome o email..." value={data.q} class="w-full pl-9" />
			</span>
		</label>
		<input type="hidden" name="sort" value={data.sort} />
		<input type="hidden" name="dir" value={data.dir} />
		<Button type="submit" variant="outline">Filtra</Button>
		{#if data.q}
			<Button
				href="/subscribers"
				variant="ghost"
				data-tutorial-title="Azzera ricerca"
				data-tutorial-description="Rimuove il testo cercato e mostra nuovamente tutti gli iscritti."
			>
				Azzera
			</Button>
		{/if}
	</form>

	<!-- Tabella -->
	<TablePanel>
		<div data-slot="table-panel-header">
			<div>
				<h2 class="font-semibold">Elenco iscritti</h2>
				{#if data.q}
					<p class="mt-0.5 text-xs text-muted-foreground">Risultati per “{data.q}”</p>
				{/if}
			</div>
			<span class="text-xs text-muted-foreground">
				{data.subscribers.length}
				{data.subscribers.length === 1 ? 'risultato' : 'risultati'} in pagina
			</span>
		</div>

		<Table embedded>
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
					<TableHead class="w-36">
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
							href={buildListUrl({
								sort: 'lastEntryAt',
								dir: getNextSortDirection('lastEntryAt')
							})}
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
					<TableHead class="w-48 text-center">
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
					<TableHead class="w-px text-right">Azioni</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.subscribers as sub}
					<TableRow>
						<TableCell>
							<div class="flex items-center gap-2">
								<a href="/subscribers/{sub.id}" class="app-link font-semibold">
									{sub.firstName}
									{sub.lastName}
								</a>
								<Badge variant={statusVariant(sub.status ?? '')}>
									{statusLabel(sub.status ?? '')}
								</Badge>
							</div>
						</TableCell>
						<TableCell>
							<a href={`mailto:${sub.email}`} class="app-link text-sm">{sub.email}</a>
						</TableCell>
						<TableCell>
							<span
								class="inline-flex min-w-14 justify-center rounded-md bg-blue-100 px-2 py-1 text-sm font-semibold text-blue-900 dark:bg-blue-950/60 dark:text-blue-200"
							>
								{sub.latestCourseAttendance}
							</span>
						</TableCell>
						<TableCell class="text-sm text-muted-foreground">
							{formatDateTime(sub.lastEntryAt)}
						</TableCell>
						<TableCell class="w-48 text-center">
							<div class="flex items-center justify-center gap-1.5">
								{#if sub.hasActiveCard}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
									>
										<CreditCard size={13} aria-hidden="true" /> RFID
									</span>
								{/if}
								{#if !sub.hasActiveCard}
									<Button
										href={`/subscribers/${sub.id}/write-card`}
										size="sm"
										variant="ghost"
										class="h-7 px-2 text-xs text-blue-700 dark:text-blue-300"
										data-tutorial-title={`Crea tessera per ${sub.firstName} ${sub.lastName}`}
										data-tutorial-description="Avvia la procedura guidata per scrivere e associare una card RFID a questo iscritto."
									>
										<CreditCard size={14} /> Crea tessera
									</Button>
								{/if}
								{#if sub.hasNfcPairing}
									<span
										class="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-1 text-xs font-medium text-cyan-900 dark:bg-cyan-950/60 dark:text-cyan-200"
									>
										<Smartphone size={13} aria-hidden="true" /> NFC
									</span>
								{/if}
							</div>
						</TableCell>
						<TableCell class="w-px whitespace-nowrap text-right">
							<div class="flex items-center justify-end gap-1">
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label={`Modifica ${sub.firstName} ${sub.lastName}`}
									data-tutorial-title={`Modifica ${sub.firstName} ${sub.lastName}`}
									data-tutorial-description="Apre il modulo per aggiornare dati anagrafici, contatti, note e stato dell’iscritto."
									onclick={() => openEdit(sub)}
								>
									<Pencil size={16} />
								</Button>
								<Button
									size="icon-sm"
									variant="destructive-ghost"
									aria-label={`Elimina ${sub.firstName} ${sub.lastName}`}
									data-tutorial-title={`Elimina ${sub.firstName} ${sub.lastName}`}
									data-tutorial-description="Verifica se l’iscritto può essere eliminato e apre la richiesta di conferma."
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
						<TableCell colspan={6} data-empty>
							<Users class="mx-auto text-muted-foreground" size={26} aria-hidden="true" />
							<p class="mt-2 font-medium">Nessun iscritto trovato</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Prova a modificare la ricerca oppure aggiungi un nuovo iscritto.
							</p>
						</TableCell>
					</TableRow>
				{/if}
			</TableBody>
		</Table>

		<TablePagination
			page={data.page}
			totalPages={data.totalPages}
			total={data.total}
			getPageHref={(page) => buildListUrl({ page })}
			ariaLabel="Paginazione iscritti"
		/>
	</TablePanel>
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
