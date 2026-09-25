<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
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
	let selectedDate = $state('');
	$effect(() => {
		selectedDate = data.week.start;
	});
	const exportHref = $derived(
		`/api/v1/new-students/export?week=${encodeURIComponent(data.week.start)}`
	);

	function filter(event: SubmitEvent) {
		event.preventDefault();
		if (selectedDate) goto(`/new-students?week=${encodeURIComponent(selectedDate)}`);
	}
</script>

<div class="space-y-5">
	<PageHeader
		title="Nuovi corsisti"
		description="Corsisti che iniziano un corso nella settimana selezionata, da lunedì a domenica (Europe/Rome)."
	>
		<Button
			href={exportHref}
			data-tutorial-title="Esporta nuovi corsisti"
			data-tutorial-description="Scarica tutti i corsisti della settimana visualizzata in un file CSV apribile con Excel o LibreOffice."
		>
			<Download size={16} /> Esporta CSV
		</Button>
	</PageHeader>

	<form
		onsubmit={filter}
		class="flex flex-wrap items-end gap-3 rounded-lg border bg-background p-4"
	>
		<div class="space-y-1.5">
			<Label for="week-date">Seleziona un giorno della settimana</Label>
			<Input
				id="week-date"
				type="date"
				bind:value={selectedDate}
				data-tutorial-title="Settimana di inizio"
				data-tutorial-description="Scegli una data: verranno mostrati tutti i corsisti che iniziano dal lunedì alla domenica di quella settimana, anche nelle settimane future."
			/>
		</div>
		<Button
			type="submit"
			variant="secondary"
			data-tutorial-title="Mostra settimana"
			data-tutorial-description="Applica la data scelta e mostra i corsisti che iniziano nella relativa settimana."
			>Mostra settimana</Button
		>
	</form>

	<p class="text-sm text-muted-foreground">
		Dal <strong>{formatDateIT(data.week.start)}</strong> al
		<strong>{formatDateIT(data.week.end)}</strong>
		· {data.rows.length}
		{data.rows.length === 1 ? 'iscrizione' : 'iscrizioni'} in partenza
	</p>

	{#if data.rows.length === 0}
		<p class="rounded-lg border bg-background p-8 text-center text-sm text-muted-foreground">
			Nessun corsista inizia un corso in questa settimana.
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
