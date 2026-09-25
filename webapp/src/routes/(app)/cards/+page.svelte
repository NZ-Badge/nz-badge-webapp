<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { invalidateAll } from '$app/navigation';
	import CardStatusBadge from '$lib/components/CardStatusBadge.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { CARD_FILTER_STATUSES, USER_ROLE_LABEL, cardStatus } from '$lib/labels';
	import { changeCardState, errorMessage, type CardStateAction } from '$lib/services/card-client';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Power,
		RotateCcw,
		Trash2,
		Eraser,
		Search,
		ArrowUp,
		ArrowDown,
		ArrowUpDown
	} from '@lucide/svelte';
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
	import { formatDateIT } from '$lib/utils/date.js';

	let { data } = $props();

	type SortField = typeof data.sort;

	let cardToDisable = $state<(typeof data.cards)[0] | null>(null);
	let disableDialogOpen = $state(false);

	/** Tessera con un'azione in corso e ultimo errore, condivisi da abilita e ripristina. */
	let pendingCardId = $state<number | null>(null);
	let actionError = $state<string | null>(null);

	async function runCardAction(id: number, action: CardStateAction) {
		pendingCardId = id;
		actionError = null;
		try {
			await changeCardState(id, action);
			await invalidateAll();
		} catch (err) {
			actionError = errorMessage(err, 'Errore');
		} finally {
			pendingCardId = null;
		}
	}

	async function confirmDisable() {
		if (!cardToDisable) return;
		// Gli errori vengono mostrati da ConfirmDialog, che resta aperto.
		await changeCardState(cardToDisable.id, 'disable');
		cardToDisable = null;
		await invalidateAll();
	}

	const ownerName = (card: (typeof data.cards)[number]) =>
		card.subscriberId
			? [card.subscriberName, card.subscriberSurname].filter(Boolean).join(' ') || '—'
			: (card.userName ?? '—');

	const ownerType = (card: (typeof data.cards)[number]) =>
		card.subscriberId ? 'Corsista' : (USER_ROLE_LABEL[card.userRole ?? ''] ?? '—');

	function formatExpirationDate(value: Date | string | null): string {
		if (!value) return '—';

		// Le colonne SQL DATE arrivano come YYYY-MM-DD: le formatto senza convertirle in UTC,
		// evitando che il giorno cambi in base al fuso orario del browser.
		if (typeof value === 'string') {
			const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
			if (match) return `${match[3]}/${match[2]}/${match[1]}`;
		}

		return formatDateIT(value) || '—';
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
		const params = new URLSearchParams({ tab: data.tab });
		if (page > 1) params.set('page', String(page));
		if (data.status) params.set('status', data.status);
		if (data.q) params.set('q', data.q);
		if (sort !== 'writeDate' || dir !== 'desc') {
			params.set('sort', sort);
			params.set('dir', dir);
		}
		return `?${params}`;
	}

	function getNextSortDirection(column: SortField) {
		if (data.sort !== column) return 'asc' as const;
		return data.dir === 'asc' ? ('desc' as const) : ('asc' as const);
	}
</script>

{#snippet sortHeader(column: SortField, label: string)}
	<a
		href={buildListUrl({ sort: column, dir: getNextSortDirection(column) })}
		class="inline-flex items-center gap-1 hover:underline"
		data-tutorial-title={`Ordina per ${label.toLowerCase()}`}
		data-tutorial-description={`Ordina le tessere per ${label.toLowerCase()}, alternando ordine crescente e decrescente.`}
	>
		{label}
		{#if data.sort === column}
			{#if data.dir === 'asc'}
				<ArrowUp size={14} aria-hidden="true" />
			{:else}
				<ArrowDown size={14} aria-hidden="true" />
			{/if}
		{:else}
			<ArrowUpDown size={14} aria-hidden="true" />
		{/if}
	</a>
{/snippet}

<div class="space-y-4">
	<PageHeader
		title="Tessere"
		description="Controlla le tessere associate alle persone, verifica il loro stato e consulta quelle cancellate."
	/>

	<nav class="flex gap-2 border-b" aria-label="Viste tessere">
		<a
			href="?tab=active"
			aria-current={data.tab !== 'history' ? 'page' : undefined}
			data-tutorial-title="Tessere attive"
			data-tutorial-description="Mostra tutte le tessere non cancellate di corsisti, collaboratori, operatori e amministratori."
			class="-mb-px border-b-2 px-4 py-2 text-sm font-medium {data.tab !== 'history'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Tessere attive
		</a>
		<a
			href="?tab=history"
			aria-current={data.tab === 'history' ? 'page' : undefined}
			data-tutorial-title="Storico cancellate"
			data-tutorial-description="Mostra le tessere cancellate dal sistema e le azioni disponibili per ripristinarle o cancellarle fisicamente."
			class="-mb-px border-b-2 px-4 py-2 text-sm font-medium {data.tab === 'history'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Storico cancellate
		</a>
	</nav>

	{#if actionError}
		<p class="text-sm text-red-600" role="alert">{actionError}</p>
	{/if}

	{#if data.tab === 'history'}
		<p class="text-sm text-muted-foreground">
			Tessere cancellate dal sistema. Con “Ripristina” una tessera torna disponibile come
			disabilitata: potrai riscriverla o completarne la cancellazione con il lettore USB.
		</p>

		<TablePanel>
			<Table embedded>
				<TableHeader>
					<TableRow>
						<TableHead>UID</TableHead>
						<TableHead>Intestatario</TableHead>
						<TableHead>Tipo</TableHead>
						<TableHead>Scritta il</TableHead>
						<TableHead>Cancellata il</TableHead>
						<TableHead class="w-px text-right">Azioni</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.cards as card (card.id)}
						<TableRow>
							<TableCell class="font-mono text-sm">{card.uid}</TableCell>
							<TableCell>{ownerName(card)}</TableCell>
							<TableCell>{ownerType(card)}</TableCell>
							<TableCell>{card.writeDate ? formatDateIT(card.writeDate) : '—'}</TableCell>
							<TableCell>{card.deletedAt ? formatDateIT(card.deletedAt) : '—'}</TableCell>
							<TableCell class="w-px text-right whitespace-nowrap">
								<div class="flex items-center justify-end gap-1">
									<Button
										href={`/cards/${card.id}/erase`}
										size="icon-sm"
										variant="destructive-ghost"
										aria-label={`Cancella fisicamente la tessera ${card.uid}`}
										data-tutorial-title="Cancella fisicamente"
										data-tutorial-description="Avvia la procedura guidata per cancellare i dati dalla tessera tramite il lettore USB."
									>
										<Eraser size={16} aria-hidden="true" />
									</Button>
									<Button
										size="icon-sm"
										variant="positive-ghost"
										onclick={() => runCardAction(card.id, 'restore')}
										disabled={pendingCardId === card.id}
										aria-label={`Ripristina la tessera ${card.uid}`}
										data-tutorial-title="Ripristina tessera"
										data-tutorial-description="Ripristina questa tessera nello stato disabilitato per consentirne il riutilizzo."
									>
										<RotateCcw size={16} aria-hidden="true" />
									</Button>
								</div>
							</TableCell>
						</TableRow>
					{:else}
						<TableRow>
							<TableCell colspan={6} data-empty>Nessuna card cancellata nello storico.</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
			<TablePagination
				page={data.page}
				totalPages={data.totalPages}
				total={data.total}
				getPageHref={(page) => buildListUrl({ page })}
				ariaLabel="Paginazione tessere cancellate"
			/>
		</TablePanel>
	{:else}
		<form method="GET" class="filter-panel" data-sveltekit-keepfocus>
			<input type="hidden" name="tab" value="active" />
			<input type="hidden" name="sort" value={data.sort} />
			<input type="hidden" name="dir" value={data.dir} />
			<label class="grid min-w-0 flex-1 gap-1.5 text-sm font-medium sm:min-w-64">
				Cerca intestatario
				<span class="relative">
					<Search
						class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
						size={16}
						aria-hidden="true"
					/>
					<Input
						type="search"
						name="q"
						placeholder="Nome o cognome..."
						value={data.q}
						class="w-full pl-9"
					/>
				</span>
			</label>
			<label class="grid gap-1.5 text-sm font-medium">
				Stato
				<NativeSelect name="status" value={data.status ?? ''}>
					<NativeSelectOption value="">Tutti gli stati</NativeSelectOption>
					{#each CARD_FILTER_STATUSES as opt (opt)}
						<NativeSelectOption value={opt}>{cardStatus(opt).label}</NativeSelectOption>
					{/each}
				</NativeSelect>
			</label>
			<Button
				type="submit"
				variant="outline"
				data-tutorial-title="Filtra tessere"
				data-tutorial-description="Cerca le tessere per nome o cognome dell'intestatario e filtra per stato."
				>Filtra</Button
			>
			{#if data.q || data.status}
				<Button
					href="/cards?tab=active"
					variant="ghost"
					data-tutorial-title="Azzera filtri"
					data-tutorial-description="Rimuove ricerca e filtro per stato, mostrando nuovamente tutte le tessere."
				>
					Azzera
				</Button>
			{/if}
		</form>

		<TablePanel>
			<Table embedded>
				<TableHeader>
					<TableRow>
						<TableHead>UID</TableHead>
						<TableHead>{@render sortHeader('subscriber', 'Intestatario')}</TableHead>
						<TableHead>Tipo</TableHead>
						<TableHead>{@render sortHeader('writeDate', 'Scritta il')}</TableHead>
						<TableHead>{@render sortHeader('expirationDate', 'Scadenza')}</TableHead>
						<TableHead>Stato</TableHead>
						<TableHead class="w-px text-right">Azioni</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.cards as card (card.id)}
						<TableRow>
							<TableCell class="font-mono text-sm">{card.uid}</TableCell>
							<TableCell>{ownerName(card)}</TableCell>
							<TableCell>{ownerType(card)}</TableCell>
							<TableCell>{card.writeDate ? formatDateIT(card.writeDate) : '—'}</TableCell>
							<TableCell>{formatExpirationDate(card.expirationDate)}</TableCell>
							<TableCell><CardStatusBadge status={card.status} /></TableCell>
							<TableCell class="w-px text-right whitespace-nowrap">
								{#if card.status === 'active' || card.status === 'disabled'}
									<div class="flex items-center justify-end gap-1">
										{#if card.status === 'active'}
											<Button
												size="icon-sm"
												variant="destructive-ghost"
												onclick={() => {
													cardToDisable = card;
													disableDialogOpen = true;
												}}
												aria-label={`Disabilita la tessera ${card.uid}`}
												data-tutorial-title="Disabilita tessera"
												data-tutorial-description="Apre la conferma per disabilitare questa tessera senza cancellarne i dati."
											>
												<Power size={16} aria-hidden="true" />
											</Button>
										{:else}
											<Button
												size="icon-sm"
												variant="positive-ghost"
												onclick={() => runCardAction(card.id, 'enable')}
												disabled={pendingCardId === card.id}
												aria-label={`Abilita la tessera ${card.uid}`}
												data-tutorial-title="Abilita tessera"
												data-tutorial-description="Riabilita questa tessera per consentirne nuovamente l’utilizzo."
											>
												<Power size={16} aria-hidden="true" />
											</Button>
										{/if}
										<Button
											href={`/cards/${card.id}/erase`}
											size="icon-sm"
											variant="destructive-ghost"
											aria-label={`Cancella la tessera ${card.uid}`}
											data-tutorial-title="Cancella tessera"
											data-tutorial-description="Avvia la procedura guidata per cancellare e rimuovere questa tessera."
										>
											<Trash2 size={16} aria-hidden="true" />
										</Button>
									</div>
								{/if}
							</TableCell>
						</TableRow>
					{:else}
						<TableRow>
							<TableCell colspan={7} data-empty>Nessuna tessera trovata.</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
			<TablePagination
				page={data.page}
				totalPages={data.totalPages}
				total={data.total}
				getPageHref={(page) => buildListUrl({ page })}
				ariaLabel="Paginazione tessere"
			/>
		</TablePanel>
	{/if}
</div>

<ConfirmDialog
	bind:open={disableDialogOpen}
	title="Disabilita tessera"
	confirmLabel="Disabilita"
	busyLabel="Disabilitazione…"
	variant="destructive"
	tutorialDescription="Disabilita la tessera selezionata senza cancellarne i dati."
	onConfirm={confirmDisable}
>
	<p class="text-sm">
		Sicuro di voler disabilitare la card <code class="font-mono">{cardToDisable?.uid}</code>?
	</p>
</ConfirmDialog>
