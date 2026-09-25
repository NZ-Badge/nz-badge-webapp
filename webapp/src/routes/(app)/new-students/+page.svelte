<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { Label } from '$lib/components/ui/label';
	import {
		Table,
		TablePanel,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { formatDateIT } from '$lib/utils/date';
	import { Download } from '@lucide/svelte';

	let { data } = $props();
	let from = $state('');
	let to = $state('');
	let rangeError = $state('');
	$effect(() => {
		from = data.range.start;
		to = data.range.end;
		rangeError = '';
	});
	const exportHref = $derived(
		`/api/v1/new-students/export?from=${encodeURIComponent(data.range.start)}&to=${encodeURIComponent(data.range.end)}`
	);

	function filter(event: SubmitEvent) {
		event.preventDefault();
		if (!from || !to) {
			rangeError = 'Inserisci entrambe le date.';
			return;
		}
		if (from > to) {
			rangeError = 'La data Da deve precedere o coincidere con la data A.';
			return;
		}
		rangeError = '';
		goto(`/new-students?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
	}
</script>

<div class="space-y-5">
	<PageHeader
		title="Nuovi corsisti"
		description="Corsisti che iniziano un corso nell'intervallo di date selezionato (Europe/Rome)."
	>
		<Button
			href={exportHref}
			data-tutorial-title="Esporta nuovi corsisti"
			data-tutorial-description="Scarica tutti i corsisti nell'intervallo visualizzato in un file CSV apribile con Excel o LibreOffice."
		>
			<Download size={16} /> Esporta CSV
		</Button>
	</PageHeader>

	<form
		onsubmit={filter}
		class="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-4"
	>
		<div class="space-y-1.5">
			<Label for="from">Da</Label>
			<DatePicker
				id="from"
				bind:value={from}
				class="w-40"
				aria-invalid={!!rangeError}
				data-tutorial-title="Data iniziale"
				data-tutorial-description="Scegli il primo giorno dell'intervallo, incluso nel filtro. La data è nel formato gg/mm/aaaa."
			/>
		</div>
		<div class="space-y-1.5">
			<Label for="to">A</Label>
			<DatePicker
				id="to"
				bind:value={to}
				class="w-40"
				aria-invalid={!!rangeError}
				data-tutorial-title="Data finale"
				data-tutorial-description="Scegli l'ultimo giorno dell'intervallo, incluso nel filtro. La data è nel formato gg/mm/aaaa."
			/>
		</div>
		<Button
			type="submit"
			variant="secondary"
			data-tutorial-title="Applica intervallo"
			data-tutorial-description="Mostra i corsisti che iniziano tra le date Da e A, estremi inclusi."
			>Applica filtro</Button
		>
		{#if rangeError}<p role="alert" class="w-full text-sm text-destructive">{rangeError}</p>{/if}
	</form>

	<p class="text-sm text-muted-foreground">
		Dal <strong>{formatDateIT(data.range.start)}</strong> al
		<strong>{formatDateIT(data.range.end)}</strong>
		· {data.rows.length}
		{data.rows.length === 1 ? 'iscrizione' : 'iscrizioni'} in partenza
	</p>

	{#if data.rows.length === 0}
		<p class="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
			Nessun corsista inizia un corso nell'intervallo selezionato.
		</p>
	{:else}
		<TablePanel>
			<Table embedded class="min-w-[48rem]">
				<TableHeader
					><TableRow
						><TableHead>Inizio</TableHead><TableHead>Corsista</TableHead><TableHead>Corso</TableHead
						><TableHead>Email</TableHead><TableHead>Telefono</TableHead></TableRow
					></TableHeader
				>
				<TableBody>
					{#each data.rows as row (row.id)}
						<TableRow>
							<TableCell>{formatDateIT(row.startDate)}</TableCell>
							<TableCell class="font-medium">
								{#if row.subscriberId}
									<a
										href={`/subscribers/${row.subscriberId}`}
										class="app-link"
										data-tutorial-title="Scheda corsista"
										data-tutorial-description="Apre la scheda del corsista per consultare iscrizioni, tessere e presenze."
										>{row.firstName} {row.lastName}</a
									>
								{:else}{row.firstName} {row.lastName}{/if}
							</TableCell>
							<TableCell
								>{row.productTitle ?? 'Corso senza nome'}{#if row.variantTitle}<span
										class="block text-sm text-muted-foreground">{row.variantTitle}</span
									>{/if}</TableCell
							>
							<TableCell>{row.email}</TableCell>
							<TableCell>{row.phone ?? '—'}</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</TablePanel>
	{/if}
</div>
