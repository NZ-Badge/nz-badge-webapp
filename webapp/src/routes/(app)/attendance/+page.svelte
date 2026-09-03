<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { Pencil } from '@lucide/svelte';
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
	import { Label } from '$lib/components/ui/label';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	let { data } = $props();
	let editOpen = $state(false);
	let editingId = $state<number | null>(null);
	let editTimestamp = $state('');
	let editError = $state('');
	let editBusy = $state(false);

	function formatDateTime(d: Date | string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleString('it-IT', {
			timeZone: 'Europe/Rome',
			dateStyle: 'short',
			timeStyle: 'medium'
		});
	}

	function toRomeInput(value: Date | string): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Rome',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date(value));
		const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
		return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
	}

	function openEdit(row: { id: number; readTimestamp: Date | string }) {
		editingId = row.id;
		editTimestamp = toRomeInput(row.readTimestamp);
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

	function getPageNumbers(current: number, total: number): (number | null)[] {
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
		const pages = new Set<number>([1, total]);
		for (let i = Math.max(2, current - 2); i <= Math.min(total - 1, current + 2); i++) {
			pages.add(i);
		}

		const sorted = [...pages].sort((a, b) => a - b);
		const result: (number | null)[] = [];
		for (let i = 0; i < sorted.length; i++) {
			if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null);
			result.push(sorted[i]);
		}
		return result;
	}

	const isLoading = $derived(!!$navigating);

	// --- Selezione e eliminazione ---
	let selectedIds = $state(new Set<number>());
	let selectAllFiltered = $state(false);
	let isDeleting = $state(false);
	let exportDialogOpen = $state(false);
	let exportMode = $state<'dates' | 'email'>('dates');
	let exportFrom = $state('');
	let exportTo = $state('');
	let exportEmail = $state('');
	let exportError = $state('');

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

	function openExportDialog() {
		exportMode = 'dates';
		exportFrom = data.from;
		exportTo = data.to;
		exportEmail = data.subscriber.includes('@') ? data.subscriber : '';
		exportError = '';
		exportDialogOpen = true;
	}

	function submitExport() {
		exportError = '';
		const params = new URLSearchParams();

		if (exportMode === 'dates') {
			if (!exportFrom || !exportTo) {
				exportError = 'Inserisci sia la data inizio sia la data fine.';
				return;
			}
			if (new Date(exportFrom).getTime() > new Date(exportTo).getTime()) {
				exportError = 'La data inizio non può essere successiva alla data fine.';
				return;
			}
			params.set('from', exportFrom);
			params.set('to', exportTo);
		} else {
			const email = exportEmail.trim();
			if (!email || !email.includes('@')) {
				exportError = 'Inserisci una email valida.';
				return;
			}
			params.set('email', email);
		}

		exportDialogOpen = false;
		window.location.href = `/api/v1/attendance/export?${params.toString()}`;
	}
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-2xl font-bold">Ingressi corsisti</h1>
		<div class="flex items-center gap-2">
			{#if selectionCount > 0}
				<Button variant="destructive" size="sm" disabled={isDeleting} onclick={deleteSelected}>
					{isDeleting ? 'Eliminazione...' : `Elimina ${selectionCount}`}
				</Button>
			{/if}
			<Button variant="outline" onclick={openExportDialog}>Esporta CSV</Button>
		</div>
	</div>

	<Dialog bind:open={exportDialogOpen}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Esporta CSV</DialogTitle>
				<DialogDescription>
					Scegli un range di date oppure l’email di un iscritto.
				</DialogDescription>
			</DialogHeader>

			<div class="space-y-4">
				<div class="grid gap-2 sm:grid-cols-2">
					<label
						class="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
						class:border-primary={exportMode === 'dates'}
					>
						<input type="radio" name="exportMode" value="dates" bind:group={exportMode} />
						<span>Range date</span>
					</label>
					<label
						class="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
						class:border-primary={exportMode === 'email'}
					>
						<input type="radio" name="exportMode" value="email" bind:group={exportMode} />
						<span>Email iscritto</span>
					</label>
				</div>

				{#if exportMode === 'dates'}
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="space-y-1">
							<Label for="export-from">Dal</Label>
							<Input id="export-from" type="date" bind:value={exportFrom} />
						</div>
						<div class="space-y-1">
							<Label for="export-to">Al</Label>
							<Input id="export-to" type="date" bind:value={exportTo} />
						</div>
					</div>
				{:else}
					<div class="space-y-1">
						<Label for="export-email">Email</Label>
						<Input
							id="export-email"
							type="email"
							placeholder="nome@example.com"
							bind:value={exportEmail}
						/>
					</div>
				{/if}

				{#if exportError}
					<p class="text-sm text-red-600">{exportError}</p>
				{/if}
			</div>

			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (exportDialogOpen = false)}>
					Annulla
				</Button>
				<Button type="button" onclick={submitExport}>Esporta</Button>
			</DialogFooter>
		</DialogContent>
	</Dialog>

	<!-- Filtri -->
	<form onsubmit={handleSubmit} class="flex flex-wrap items-end gap-3">
		<div class="space-y-1">
			<Label for="from">Dal</Label>
			<Input id="from" name="from" type="date" value={data.from} class="w-40" />
		</div>
		<div class="space-y-1">
			<Label for="to">Al</Label>
			<Input id="to" name="to" type="date" value={data.to} class="w-40" />
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
	<div class="relative rounded-lg border bg-white">
		{#if isLoading}
			<div
				class="absolute inset-0 z-10 grid place-items-center bg-white/60 text-sm text-muted-foreground"
			>
				Caricamento…
			</div>
		{/if}
		<Table>
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
					<TableHead class="text-right">Azioni</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#if data.rows.length === 0}
					<TableRow>
						<TableCell colspan={7} class="h-28 text-center text-muted-foreground">
							Nessuna presenza trovata.
						</TableCell>
					</TableRow>
				{/if}
				{#each data.rows as row}
					<TableRow class={selectedIds.has(row.id) || selectAllFiltered ? 'bg-blue-50' : ''}>
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
							<span class="font-mono text-xs">{formatDateTime(row.readTimestamp)}</span>
						</TableCell>
						<TableCell>
							{#if row.subscriberId && row.subscriberName}
								<a href={`/subscribers/${row.subscriberId}`} class="font-medium hover:underline">
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
						<TableCell class="text-right">
							<Button
								size="icon"
								variant="ghost"
								title="Modifica orario"
								onclick={() => openEdit(row)}
							>
								<Pencil size={15} />
							</Button>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	<!-- Paginazione -->
	{#if data.totalPages > 1}
		<div class="flex items-center justify-between text-sm">
			<span>Pagina {data.page} di {data.totalPages}</span>
			<div class="flex items-center gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={data.page <= 1 || isLoading}
					onclick={() => goto(buildUrl(data.page - 1))}
				>
					Precedente
				</Button>
				{#each getPageNumbers(data.page, data.totalPages) as pageNumber}
					{#if pageNumber === null}
						<span class="text-muted-foreground">…</span>
					{:else}
						<Button
							variant={pageNumber === data.page ? 'default' : 'outline'}
							size="sm"
							disabled={pageNumber === data.page || isLoading}
							onclick={() => goto(buildUrl(pageNumber))}
						>
							{pageNumber}
						</Button>
					{/if}
				{/each}
				<Button
					variant="outline"
					size="sm"
					disabled={data.page >= data.totalPages || isLoading}
					onclick={() => goto(buildUrl(data.page + 1))}
				>
					Successiva
				</Button>
			</div>
		</div>
	{/if}
</div>

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
			<Input id="edit-time" type="datetime-local" bind:value={editTimestamp} />
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
