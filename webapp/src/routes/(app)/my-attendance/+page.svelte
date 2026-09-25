<script lang="ts">
	import { History } from '@lucide/svelte';
	import StaffHoursSummary from '$lib/components/StaffHoursSummary.svelte';
	import StaffAttendanceDeleteButton from '$lib/components/StaffAttendanceDeleteButton.svelte';
	import { eventType } from '$lib/labels';
	import { formatDateTimeIT } from '$lib/utils/date';
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
	function sourceLabel(source: string): string {
		return source === 'card' ? 'Card RFID' : source === 'manual' ? 'Manuale' : 'Pulsante Home';
	}
	function pageUrl(page: number): string {
		const params = new URLSearchParams({ from: data.from, to: data.to });
		if (page > 1) params.set('page', String(page));
		return `/my-attendance?${params}#strisciate`;
	}
</script>

<StaffHoursSummary
	user={data.targetUser}
	report={data.report}
	from={data.from}
	to={data.to}
	manualUsers={data.manualUsers}
/>

<TablePanel class="mt-6" id="strisciate">
	<div data-slot="table-panel-header"><h2 class="font-semibold">Tutte le mie strisciate</h2></div>
	{#if data.swipes.length === 0}
		<p class="px-5 py-6 text-sm text-muted-foreground">Nessuna strisciata registrata.</p>
	{:else}
		<Table embedded>
			<TableHeader
				><TableRow>
					<TableHead>Data/ora</TableHead><TableHead>Evento</TableHead><TableHead>Sorgente</TableHead
					><TableHead class="w-px text-right">Azioni</TableHead>
				</TableRow></TableHeader
			>
			<TableBody>
				{#each data.swipes as row (row.id)}
					<TableRow>
						<TableCell
							><span class="inline-flex items-center gap-1.5">
								{formatDateTimeIT(row.readTimestamp, { seconds: true }) || '—'}
								{#if row.isBackdated}<History
										size={14}
										class="text-amber-600"
										aria-label="Inserimento retrodatato"
									/>{/if}
							</span></TableCell
						>
						<TableCell>{eventType(row.eventType).label}</TableCell>
						<TableCell>{sourceLabel(row.source)}</TableCell>
						<TableCell class="w-px text-right"
							><StaffAttendanceDeleteButton id={row.id} eventType={row.eventType} /></TableCell
						>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	{/if}
	<TablePagination
		page={data.page}
		totalPages={data.totalPages}
		total={data.total}
		getPageHref={pageUrl}
		ariaLabel="Paginazione delle mie strisciate"
	/>
</TablePanel>
