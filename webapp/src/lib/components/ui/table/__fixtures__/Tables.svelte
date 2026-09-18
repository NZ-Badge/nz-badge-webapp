<script lang="ts">
	// Visual regression fixture; not imported by application routes.
	import {
		Table,
		TablePanel,
		TableHeader,
		TableBody,
		TableRow,
		TableHead,
		TableCell
	} from '$lib/components/ui/table';
</script>

{#snippet content()}
	<TableHeader
		><TableRow><TableHead>Persona</TableHead><TableHead>Stato</TableHead></TableRow></TableHeader
	>
	<TableBody>
		<TableRow><TableCell>Maria Rossi</TableCell><TableCell>Attivo</TableCell></TableRow>
		<TableRow><TableCell>Luca Bianchi</TableCell><TableCell>Attivo</TableCell></TableRow>
		<TableRow data-state="selected"
			><TableCell>Anna Verdi</TableCell><TableCell>Selezionato</TableCell></TableRow
		>
	</TableBody>
{/snippet}

<main class="app-workspace space-y-4 p-4" data-area="operations">
	<Table class="min-w-[48rem]">{@render content()}</Table>
	<TablePanel>
		<div data-slot="table-panel-header">Elenco persone</div>
		<Table embedded class="min-w-[48rem]">{@render content()}</Table>
		<div data-slot="table-panel-footer">Pagina 1 di 1</div>
	</TablePanel>
	<Table
		><TableBody
			><TableRow><TableCell colspan={2} data-empty>Nessun risultato</TableCell></TableRow
			></TableBody
		></Table
	>
</main>
