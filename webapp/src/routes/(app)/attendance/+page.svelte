<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { Pencil, Plus } from '@lucide/svelte';
	import AttendanceExportDialog from '$lib/components/AttendanceExportDialog.svelte';
	import SubscriberManualEntryDialog from '$lib/components/SubscriberManualEntryDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import { Label } from '$lib/components/ui/label';
	import { formatDateTimeIT, toRomeDateTimeInputValue } from '$lib/utils/date.js';
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
	let editOpen = $state(false);
	let editingId = $state<number | null>(null);
	let editTimestamp = $state('');
	let editError = $state('');
	let editBusy = $state(false);
	let manualOpen = $state(false);
	let exportDialogOpen = $state(false);

	function openEdit(row: { id: number; readTimestamp: Date | string }) {
		editingId = row.id;
		editTimestamp = toRomeDateTimeInputValue(new Date(row.readTimestamp));
		editError = '';
		editOpen = true;
	}

	async function saveEdit() {
		if (editingId === null || !editTimestamp) return;
		editBusy = true;
		editError = '';

		try {
			const response = await fetch('/api/v1/attendance', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: editingId, readTimestamp: editTimestamp })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? 'Modifica non riuscita');
			editOpen = false;
			await invalidateAll();
		} catch (err) {
			editError = err instanceof Error ? err.message : 'Modifica non riuscita';
		} finally {
			editBusy = false;
		}
	}

	function buildUrl(
		page: number,
		filters?: { from: string; to: string; subscriber: string; device: string }
	) {
		const f = filters ?? {
			from: data.from,
			to: data.to,
			subscriber: data.subscriber,
			device: data.device
		};
		const params = new URLSearchParams();
		if (page > 1) params.set('page', String(page));
		if (f.from) params.set('from', f.from);
		if (f.to) params.set('to', f.to);
		if (f.subscriber) params.set('subscriber', f.subscriber);
		if (f.device) params.set('device', f.device);
		const qs = params.toString();
		return `/attendance${qs ? '?' + qs : ''}`;
	}

	function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		const fd = new FormData(e.target as HTMLFormElement);
		selectedIds = new Set();
		selectAllFiltered = false;
		goto(
			buildUrl(1, {
				from: (fd.get('from') as string) ?? '',
				to: (fd.get('to') as string) ?? '',
				subscriber: (fd.get('subscriber') as string) ?? '',
				device: (fd.get('device') as string) ?? ''
			})
		);
	}

	const isLoading = $derived(!!$navigating);

	// --- Selezione e eliminazione ---
	let selectedIds = $state(new Set<number>());
	let selectAllFiltered = $state(false);
	let isDeleting = $state(false);

	const allPageSelected = $derived(
		data.rows.length > 0 && data.rows.every((r) => selectedIds.has(r.id))
	);
	const somePageSelected = $derived(data.rows.some((r) => selectedIds.has(r.id)));
	const selectionCount = $derived(selectAllFiltered ? data.total : selectedIds.size);
	const showSelectAllFilteredBanner = $derived(
		allPageSelected && !selectAllFiltered && data.total > data.rows.length
	);

	function toggleHeaderCheckbox() {
		if (allPageSelected) {
			const next = new Set(selectedIds);
			for (const row of data.rows) next.delete(row.id);
			selectedIds = next;
			selectAllFiltered = false;
		} else {
			const next = new Set(selectedIds);
			for (const row of data.rows) next.add(row.id);
			selectedIds = next;
		}
	}

	function toggleRow(id: number) {
		const next = new Set(selectedIds);
		if (next.has(id)) {
			next.delete(id);
			selectAllFiltered = false;
		} else {
			next.add(id);
		}
		selectedIds = next;
	}

	async function deleteSelected() {
		const count = selectionCount;
		if (!confirm(`Eliminare ${count} record di presenza? Questa operazione non è reversibile.`))
			return;

		isDeleting = true;
		try {
			let body: object;
			if (selectAllFiltered) {
				body = {
					all: true,
					filters: {
						from: data.from,
						to: data.to,
						subscriber: data.subscriber,
						device: data.device
					}
				};
			} else {
				body = { ids: [...selectedIds] };
			}

			const res = await fetch('/api/v1/attendance', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (!res.ok) throw new Error('Eliminazione non riuscita');

			selectedIds = new Set();
			selectAllFiltered = false;
			const targetUrl = buildUrl(1);
			const currentUrl = `${window.location.pathname}${window.location.search}`;

			if (targetUrl === currentUrl) {
				await invalidateAll();
			} else {
				await goto(targetUrl);
			}
		} catch {
			alert("Errore durante l'eliminazione. Riprova.");
		} finally {
			isDeleting = false;
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
				<Button variant="destructive" size="sm" disabled={isDeleting} onclick={deleteSelected}>
					{isDeleting ? 'Eliminazione...' : `Elimina ${selectionCount}`}
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
	<form onsubmit={handleSubmit} class="filter-panel">
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
			type="button"
			variant="ghost"
			onclick={() => {
				selectedIds = new Set();
				selectAllFiltered = false;
				goto('/attendance');
			}}>Azzera</Button
		>
	</form>

	<!-- Banner "seleziona tutti i filtrati" -->
	{#if showSelectAllFilteredBanner}
		<div class="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">
			<span>Tutti i {data.rows.length} record di questa pagina sono selezionati.</span>
			<button
				class="font-medium underline hover:no-underline"
				onclick={() => (selectAllFiltered = true)}
			>
				Seleziona tutti i {data.total} record filtrati
			</button>
		</div>
	{:else if selectAllFiltered}
		<div class="flex items-center gap-2 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-800">
			<span>Tutti i {data.total} record filtrati sono selezionati.</span>
			<button
				class="font-medium underline hover:no-underline"
				onclick={() => {
					selectAllFiltered = false;
					selectedIds = new Set();
				}}
			>
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
				{#each data.rows as row}
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
							<Button
								size="icon-sm"
								variant="ghost"
								aria-label="Modifica orario"
								data-tutorial-title="Modifica orario"
								data-tutorial-description="Apre il modulo per correggere data e ora di questa presenza."
								onclick={() => openEdit(row)}
							>
								<Pencil size={15} />
							</Button>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
		<TablePagination
			page={data.page}
			totalPages={data.totalPages}
			total={data.total}
			onPageChange={(page) => goto(buildUrl(page))}
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

<Dialog bind:open={editOpen}>
	<DialogContent class="sm:max-w-sm">
		<DialogHeader>
			<DialogTitle>Modifica orario</DialogTitle>
			<DialogDescription>
				È possibile modificare soltanto data e ora della presenza.
			</DialogDescription>
		</DialogHeader>
		<div class="space-y-2 py-2">
			<Label for="edit-time">Data e ora</Label>
			<DatePicker id="edit-time" withTime bind:value={editTimestamp} />
			{#if editError}
				<p class="text-sm text-red-600">{editError}</p>
			{/if}
		</div>
		<DialogFooter>
			<Button variant="outline" onclick={() => (editOpen = false)}>Annulla</Button>
			<Button onclick={saveEdit} disabled={editBusy}>
				{editBusy ? 'Salvataggio…' : 'Salva'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
