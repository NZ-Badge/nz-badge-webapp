<script lang="ts">
	import { goto } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
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

	function formatDateTime(d: Date | string | null) {
		if (!d) return '—';
		return new Date(d).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' });
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

	// Genera array di pagine da mostrare: prime, ultime, vicine alla corrente, con ellissi
	function getPageNumbers(current: number, total: number): (number | null)[] {
		if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
		const pages = new Set<number>();
		pages.add(1);
		pages.add(total);
		for (let i = Math.max(2, current - 2); i <= Math.min(total - 1, current + 2); i++) pages.add(i);
		const sorted = [...pages].sort((a, b) => a - b);
		const result: (number | null)[] = [];
		for (let i = 0; i < sorted.length; i++) {
			if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push(null); // ellissi
			result.push(sorted[i]);
		}
		return result;
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
			goto(buildUrl(1));
		} catch {
			alert("Errore durante l'eliminazione. Riprova.");
		} finally {
			isDeleting = false;
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Presenze</h1>
		<div class="flex items-center gap-2">
			{#if selectionCount > 0}
				<Button variant="destructive" size="sm" disabled={isDeleting} onclick={deleteSelected}>
					{isDeleting ? 'Eliminazione...' : `Elimina ${selectionCount}`}
				</Button>
			{/if}
			<a href={data.exportUrl} download>
				<Button variant="outline" size="sm">Esporta CSV</Button>
			</a>
		</div>
	</div>

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
				placeholder="Nome o email..."
				value={data.subscriber}
				class="w-48"
			/>
		</div>
		<div class="space-y-1">
			<Label for="device">Dispositivo</Label>
			<Input
				id="device"
				name="device"
				placeholder="ID dispositivo..."
				value={data.device}
				class="w-36"
			/>
		</div>
		<Button type="submit" variant="outline" disabled={isLoading}>Filtra</Button>
		<Button
			type="button"
			variant="ghost"
			size="sm"
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
	<div class="relative">
		{#if isLoading}
			<div class="absolute inset-0 z-10 flex items-center justify-center rounded bg-white/60">
				<span class="text-sm text-gray-500">Caricamento...</span>
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
				</TableRow>
			</TableHeader>
			<TableBody>
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
						<TableCell class="whitespace-nowrap">{formatDateTime(row.readTimestamp)}</TableCell>
						<TableCell>
							{row.subscriberName ? `${row.subscriberName} ${row.subscriberSurname}` : '—'}
						</TableCell>
						<TableCell>
							<Badge variant={row.eventType === 'entry' ? 'default' : 'secondary'}>
								{row.eventType === 'entry' ? 'Ingresso' : 'Uscita'}
							</Badge>
						</TableCell>
						<TableCell class="font-mono text-sm">{row.deviceId}</TableCell>
						<TableCell>{row.offlineQueued ? '📴' : ''}</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	<!-- Paginazione -->
	{#if data.totalPages > 1}
		<div class="flex items-center justify-between text-sm text-gray-600">
			<span>{data.total} record &mdash; pagina {data.page} di {data.totalPages}</span>
			<div class="flex items-center gap-1">
				<Button
					variant="outline"
					size="sm"
					disabled={data.page <= 1 || isLoading}
					onclick={() => goto(buildUrl(data.page - 1))}
				>
					&lsaquo; Prec.
				</Button>

				{#each getPageNumbers(data.page, data.totalPages) as p}
					{#if p === null}
						<span class="px-1 text-gray-400">&hellip;</span>
					{:else}
						<Button
							variant={p === data.page ? 'default' : 'outline'}
							size="sm"
							disabled={p === data.page || isLoading}
							onclick={() => goto(buildUrl(p))}
						>
							{p}
						</Button>
					{/if}
				{/each}

				<Button
					variant="outline"
					size="sm"
					disabled={data.page >= data.totalPages || isLoading}
					onclick={() => goto(buildUrl(data.page + 1))}
				>
					Succ. &rsaquo;
				</Button>
			</div>
		</div>
	{:else}
		<p class="text-sm text-gray-500">{data.total} record</p>
	{/if}
</div>
