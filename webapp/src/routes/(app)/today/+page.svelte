<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Table,
		TablePanel,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { formatTimeIT } from '$lib/utils/date';
	import { RefreshCw } from '@lucide/svelte';

	let { data } = $props();
	const dateLabel = $derived(data.dateKey.split('-').reverse().join('/'));
</script>

<div class="space-y-4">
	<PageHeader
		title="Corsisti attesi oggi"
		description={`Corsisti con un corso in programma il ${dateLabel}. Le date e le timbrature seguono il fuso Europe/Rome.`}
	>
		<Button
			variant="secondary"
			onclick={() => invalidateAll()}
			data-tutorial-title="Aggiorna presenze"
			data-tutorial-description="Ricarica l'elenco dei corsisti attesi e controlla le timbrature registrate fino a questo momento."
			><RefreshCw size={16} /> Aggiorna</Button
		>
	</PageHeader>

	<div class="flex flex-wrap gap-2 text-sm">
		<Badge variant="outline">{data.rows.length} attesi</Badge>
		<Badge variant="positive">{data.present} hanno timbrato</Badge>
		<Badge variant="warning">{data.missing} senza timbratura</Badge>
		{#if data.unlinked}<Badge variant="secondary">{data.unlinked} senza anagrafica collegata</Badge
			>{/if}
	</div>

	{#if data.rows.length === 0}
		<p class="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
			Nessun corsista con date di corso che comprendono oggi.
		</p>
	{:else}
		<TablePanel>
			<Table embedded class="min-w-[42rem]">
				<TableHeader>
					<TableRow>
						<TableHead>Corsista</TableHead>
						<TableHead>Corso</TableHead>
						<TableHead>Timbratura di oggi</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.rows as row (row.key)}
						<TableRow>
							<TableCell class="font-medium">
								{#if row.subscriberId !== null}
									<a
										href={`/subscribers/${row.subscriberId}`}
										class="app-link"
										data-tutorial-title="Scheda corsista"
										data-tutorial-description="Apri la scheda del corsista per consultare le sue iscrizioni e la cronologia completa degli ingressi e delle uscite."
										>{row.name}</a
									>
								{:else}{row.name}{/if}
							</TableCell>
							<TableCell>
								{#each row.courses as course, index (index)}
									<div>{course}</div>
								{/each}
							</TableCell>
							<TableCell>
								{#if row.firstSwipe}
									<Badge variant="positive">Ha timbrato</Badge>
									<span class="ml-2 text-sm text-muted-foreground"
										>prima alle {formatTimeIT(row.firstSwipe)}</span
									>
								{:else if row.subscriberId === null}
									<Badge variant="secondary">Anagrafica da collegare</Badge>
								{:else}
									<Badge variant="warning">Non ha timbrato</Badge>
								{/if}
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</TablePanel>
	{/if}
	<p class="text-xs text-muted-foreground">
		L'elenco usa le date di inizio e fine corso, incluse. Una timbratura indica almeno un ingresso o
		un'uscita registrati oggi.
	</p>
</div>
