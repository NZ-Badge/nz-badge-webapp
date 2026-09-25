<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import {
		Table,
		TablePanel,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { eventType } from '$lib/labels';
	import { formatDateTimeIT } from '$lib/utils/date.js';
	import type { PageData } from './$types';

	let { subscriberName, rows }: { subscriberName: string; rows: PageData['recentAttendance'] } =
		$props();
</script>

<TablePanel>
	<div data-slot="table-panel-header">
		<h2 class="font-semibold">Ultime presenze</h2>
		<a
			href="/attendance?subscriber={encodeURIComponent(subscriberName)}"
			class="app-link text-xs"
			data-tutorial-title="Vedi tutte le presenze"
			data-tutorial-description="Mostra l’intera cronologia delle presenze di questo iscritto, già filtrata per persona."
		>
			Vedi tutte →
		</a>
	</div>
	{#if rows.length === 0}
		<p class="px-5 py-4 text-sm text-muted-foreground">Nessuna presenza registrata.</p>
	{:else}
		<Table embedded>
			<TableHeader>
				<TableRow>
					<TableHead>Data / ora</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead>Dispositivo</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each rows as row (row.id)}
					{@const type = eventType(row.eventType)}
					<TableRow>
						<TableCell class="font-mono text-sm font-medium"
							>{formatDateTimeIT(row.readTimestamp) || '—'}</TableCell
						>
						<TableCell><Badge variant={type.variant}>{type.label}</Badge></TableCell>
						<TableCell class="text-xs text-muted-foreground">{row.deviceId}</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	{/if}
</TablePanel>
