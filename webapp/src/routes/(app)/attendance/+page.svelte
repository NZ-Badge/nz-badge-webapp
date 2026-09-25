<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { afterNavigate, goto, invalidateAll } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';
	import { Pencil, Plus, Trash2 } from '@lucide/svelte';
	import AttendanceEditDialog from '$lib/components/AttendanceEditDialog.svelte';
	import AttendanceExportDialog from '$lib/components/AttendanceExportDialog.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import SubscriberManualEntryDialog from '$lib/components/SubscriberManualEntryDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import { Label } from '$lib/components/ui/label';
	import { formatDateTimeIT } from '$lib/utils/date.js';
	import { apiFetch } from '$lib/utils/http';
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

	let { data } = $props();
	type Row = (typeof data.rows)[number];
	let manualOpen = $state(false);
	let exportDialogOpen = $state(false);
	let editOpen = $state(false);
	let editing = $state<Row | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state<Row | null>(null);
	let bulkDeleteOpen = $state(false);

	const isLoading = $derived(Boolean(navigating.to));

	// --- Selezione ---
	const selectedIds = new SvelteSet<number>();
	let selectAllFiltered = $state(false);

	function clearSelection() {
		selectedIds.clear();
		selectAllFiltered = false;
	}

	// Filtri e pagine cambiano l'insieme dei record: la selezione non ha più senso.
	afterNavigate(({ from, to }) => {
		if (from?.url.search !== to?.url.search) clearSelection();
	});

	const allPageSelected = $derived(
		data.rows.length > 0 && data.rows.every((r) => selectedIds.has(r.id))
	);
	const somePageSelected = $derived(data.rows.some((r) => selectedIds.has(r.id)));
	const selectionCount = $derived(selectAllFiltered ? data.total : selectedIds.size);
	const showSelectAllFilteredBanner = $derived(
		allPageSelected && !selectAllFiltered && data.total > data.rows.length
	);
	// L'eliminazione per filtro è riservata agli Amministratori e richiede almeno un filtro attivo.
	const hasActiveFilter = $derived(Boolean(data.from || data.to || data.subscriber || data.device));
	const canDeleteByFilters = $derived(data.user?.role === 'admin' && hasActiveFilter);

	function pageHref(pageNumber: number): string {
		const params = new URLSearchParams();
		if (pageNumber > 1) params.set('page', String(pageNumber));
		if (data.from) params.set('from', data.from);
		if (data.to) params.set('to', data.to);
		if (data.subscriber) params.set('subscriber', data.subscriber);
		if (data.device) params.set('device', data.device);
		const qs = params.toString();
		return `/attendance${qs ? '?' + qs : ''}`;
	}

	function toggleHeaderCheckbox() {
		if (allPageSelected) {
			for (const row of data.rows) selectedIds.delete(row.id);
			selectAllFiltered = false;
		} else {
			for (const row of data.rows) selectedIds.add(row.id);
		}
	}

	function toggleRow(id: number) {
		if (selectedIds.has(id)) {
			selectedIds.delete(id);
			selectAllFiltered = false;
		} else {
			selectedIds.add(id);
		}
	}

	function openEdit(row: Row) {
		editing = row;
		editOpen = true;
	}

	function openDelete(row: Row) {
		deleting = row;
		deleteOpen = true;
	}

	async function deleteOne() {
		if (!deleting) return;
		const id = deleting.id;
		await apiFetch('/api/v1/attendance', { method: 'DELETE', body: { mode: 'ids', ids: [id] } });
		selectedIds.delete(id);
		selectAllFiltered = false;
		toast.success('Presenza eliminata');
		await invalidateAll();
	}

	async function deleteSelected() {
		let body: Record<string, unknown>;
		if (selectAllFiltered) {
			if (!canDeleteByFilters) throw new Error('Eliminazione per filtro non consentita');
			body = {
				mode: 'filters',
				filters: {
					from: data.from,
					to: data.to,
					subscriber: data.subscriber,
					device: data.device
				}
			};
		} else {
			body = { mode: 'ids', ids: [...selectedIds] };
		}

		const count = selectionCount;
		await apiFetch('/api/v1/attendance', { method: 'DELETE', body });
		clearSelection();
		toast.success(count === 1 ? 'Presenza eliminata' : `${count} presenze eliminate`);

		const targetUrl = pageHref(1);
		if (targetUrl === `${page.url.pathname}${page.url.search}`) {
			await invalidateAll();
		} else {
			await goto(targetUrl);
		}
	}
</script>

<div class="space-y-5">
	<PageHeader
		title="Ingressi corsisti"
		description="Cerca le presenze per persona e periodo. Puoi aggiungere un ingresso o un’uscita mancanti ed esportare l’elenco."
	>
		<div class="flex flex-wrap items-center gap-2">
			{#if selectionCount > 0}
				<Button
					variant="destructive"
					size="sm"
					onclick={() => (bulkDeleteOpen = true)}
					data-tutorial-title="Elimina selezionati"
					data-tutorial-description="Apre la conferma per eliminare definitivamente le presenze selezionate."
				>
					<Trash2 size={14} /> Elimina {selectionCount}
				</Button>
			{/if}
			<Button variant="outline" onclick={() => (exportDialogOpen = true)}>Esporta CSV</Button>
			<Button onclick={() => (manualOpen = true)}><Plus size={16} /> Inserisci evento</Button>
		</div>
	</PageHeader>

	<AttendanceExportDialog
		bind:open={exportDialogOpen}
		endpoint="/api/v1/attendance/export"
		subjectLabel="iscritto"
		emailOptions={data.subscriberOptions}
		defaultFrom={data.from}
		defaultTo={data.to}
		defaultEmail={data.subscriber.includes('@') ? data.subscriber : ''}
		listId="subscriber-export-emails"
	/>

	<!-- Filtri -->
	<form method="GET" action="/attendance" class="filter-panel">
		<div class="space-y-1">
			<Label for="from">Dal</Label>
			<DatePicker id="from" name="from" value={data.from} class="w-40" />
		</div>
		<div class="space-y-1">
			<Label for="to">Al</Label>
			<DatePicker id="to" name="to" value={data.to} class="w-40" />
		</div>
		<div class="space-y-1">
			<Label for="subscriber">Iscritto</Label>
			<Input
				id="subscriber"
				name="subscriber"
				placeholder="Nome o email…"
				value={data.subscriber}
				class="w-48"
			/>
		</div>
		<div class="space-y-1">
			<Label for="device">Dispositivo</Label>
			<Input
				id="device"
				name="device"
				placeholder="ID dispositivo…"
				value={data.device}
				class="w-40"
			/>
		</div>
		<Button type="submit" variant="outline" disabled={isLoading}>Filtra</Button>
		<Button
			href="/attendance"
			variant="ghost"
			data-tutorial-title="Azzera filtri"
			data-tutorial-description="Rimuove i filtri e torna all’elenco degli ultimi 30 giorni."
			>Azzera</Button
		>
	</form>

	<!-- Banner "seleziona tutti i filtrati" -->
	{#if showSelectAllFilteredBanner}
		<div class="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">
			<span>Tutti i {data.rows.length} record di questa pagina sono selezionati.</span>
			{#if canDeleteByFilters}
				<button
					class="font-medium underline hover:no-underline"
					onclick={() => (selectAllFiltered = true)}
				>
					Seleziona tutti i {data.total} record filtrati
				</button>
			{/if}
		</div>
	{:else if selectAllFiltered}
		<div class="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">
			<span>Tutti i {data.total} record filtrati sono selezionati.</span>
			<button class="font-medium underline hover:no-underline" onclick={clearSelection}>
				Annulla selezione
			</button>
		</div>
	{/if}

	<!-- Tabella con overlay loading -->
	<TablePanel aria-busy={isLoading}>
		{#if isLoading}
			<div data-slot="table-loading" role="status">Caricamento…</div>
		{/if}
		<Table embedded>
			<TableHeader>
				<TableRow>
					<TableHead class="w-10">
						<input
							type="checkbox"
							class="h-4 w-4 cursor-pointer rounded border-gray-300"
							checked={allPageSelected || selectAllFiltered}
							indeterminate={somePageSelected && !allPageSelected && !selectAllFiltered}
							onchange={toggleHeaderCheckbox}
							aria-label="Seleziona tutti nella pagina"
						/>
					</TableHead>
					<TableHead>Data/ora</TableHead>
					<TableHead>Iscritto</TableHead>
					<TableHead>Evento</TableHead>
					<TableHead>Dispositivo</TableHead>
					<TableHead>Offline</TableHead>
					<TableHead class="w-px text-right">Azioni</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#if data.rows.length === 0}
					<TableRow>
						<TableCell colspan={7} data-empty>Nessuna presenza trovata.</TableCell>
					</TableRow>
				{/if}
				{#each data.rows as row (row.id)}
					<TableRow
						data-state={selectedIds.has(row.id) || selectAllFiltered ? 'selected' : undefined}
					>
						<TableCell>
							<input
								type="checkbox"
								class="h-4 w-4 cursor-pointer rounded border-gray-300"
								checked={selectedIds.has(row.id) || selectAllFiltered}
								onchange={() => {
									if (!selectAllFiltered) toggleRow(row.id);
								}}
								aria-label="Seleziona record"
							/>
						</TableCell>
						<TableCell>
							<span class="font-mono text-xs"
								>{formatDateTimeIT(row.readTimestamp, { seconds: true }) || '—'}</span
							>
						</TableCell>
						<TableCell>
							{#if row.subscriberId && row.subscriberName}
								<a href={`/subscribers/${row.subscriberId}`} class="app-link font-medium">
									{`${row.subscriberName} ${row.subscriberSurname}`}
								</a>
							{:else}
								—
							{/if}
						</TableCell>
						<TableCell>
							<Badge variant={row.eventType === 'entry' ? 'default' : 'secondary'}>
								{row.eventType === 'entry' ? 'Ingresso' : 'Uscita'}
							</Badge>
						</TableCell>
						<TableCell class="text-xs text-muted-foreground">{row.deviceId}</TableCell>
						<TableCell>{row.offlineQueued ? '✓' : ''}</TableCell>
						<TableCell class="w-px whitespace-nowrap text-right">
							<div class="flex items-center justify-end gap-1">
								<Button
									size="icon-sm"
									variant="ghost"
									aria-label="Modifica orario"
									data-tutorial-title="Modifica orario"
									data-tutorial-description="Apre il modulo per correggere data e ora di questa presenza."
									onclick={() => openEdit(row)}
								>
									<Pencil size={16} />
								</Button>
								<Button
									size="icon-sm"
									variant="destructive-ghost"
									aria-label={`Elimina ${row.eventType === 'entry' ? 'ingresso' : 'uscita'} di ${row.subscriberName ?? 'iscritto'}`}
									data-tutorial-title="Elimina presenza"
									data-tutorial-description="Apre la conferma per eliminare definitivamente questo ingresso o questa uscita del corsista."
									onclick={() => openDelete(row)}><Trash2 size={16} /></Button
								>
							</div>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
		<TablePagination
			page={data.page}
			totalPages={data.totalPages}
			total={data.total}
			getPageHref={pageHref}
			disabled={isLoading}
			ariaLabel="Paginazione ingressi corsisti"
		/>
	</TablePanel>
</div>

<SubscriberManualEntryDialog
	bind:open={manualOpen}
	subscribers={data.subscriberOptions}
	onsaved={invalidateAll}
/>

<AttendanceEditDialog
	bind:open={editOpen}
	endpoint="/api/v1/attendance"
	record={editing}
	onsaved={invalidateAll}
/>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Elimina presenza"
	description="Eliminare definitivamente questo ingresso o questa uscita?"
	confirmLabel="Elimina"
	busyLabel="Eliminazione…"
	variant="destructive"
	onConfirm={deleteOne}
/>

<ConfirmDialog
	bind:open={bulkDeleteOpen}
	title="Elimina presenze"
	description={`Eliminare ${selectionCount} record di presenza? Questa operazione non è reversibile.`}
	confirmLabel={`Elimina ${selectionCount}`}
	busyLabel="Eliminazione…"
	variant="destructive"
	onConfirm={deleteSelected}
/>
