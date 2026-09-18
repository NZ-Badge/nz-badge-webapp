<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { invalidateAll } from '$app/navigation';
	import { Clock, CalendarDays, TriangleAlert, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import { formatDateIT, formatDateTimeIT } from '$lib/utils/date';
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
	import StaffManualEntryDialog from '$lib/components/StaffManualEntryDialog.svelte';
	import type { StaffAttendanceReport } from '$lib/services/staff-attendance';

	let {
		user,
		report,
		from,
		to,
		manualUsers,
		canSelectManualUser = false,
		showManualAction = true
	}: {
		user: { id: number; name: string; email: string };
		report: StaffAttendanceReport;
		from: string;
		to: string;
		manualUsers: { id: number; name: string; email?: string | null }[];
		canSelectManualUser?: boolean;
		showManualAction?: boolean;
	} = $props();

	let manualOpen = $state(false);

	function formatDate(value: string): string {
		return formatDateIT(value) || '—';
	}

	function formatDateTime(value: Date | string | null | undefined): string {
		return formatDateTimeIT(value) || '—';
	}
</script>

<div class="space-y-6">
	<PageHeader
		title={user.name}
		description={`Riepilogo delle ore e delle presenze · ${user.email}`}
	>
		{#if showManualAction}
			<Button onclick={() => (manualOpen = true)}><Plus size={16} /> Inserisci evento</Button>
		{/if}
	</PageHeader>

	<div class="grid gap-4 md:grid-cols-3">
		<Card>
			<CardHeader class="pb-2"><CardTitle class="text-sm">Settimana corrente</CardTitle></CardHeader
			>
			<CardContent>
				<div class="flex items-center gap-2 text-2xl font-bold">
					<Clock size={20} />
					{report.week.totalLabel}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatDate(report.week.from)} – {formatDate(report.week.to)} · {report.week
						.validSessions}
					sessioni
				</p>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="pb-2"><CardTitle class="text-sm">Mese corrente</CardTitle></CardHeader>
			<CardContent>
				<div class="flex items-center gap-2 text-2xl font-bold">
					<CalendarDays size={20} />
					{report.month.totalLabel}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{formatDate(report.month.from)} – {formatDate(report.month.to)} · {report.month
						.validSessions}
					sessioni
				</p>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="pb-2"
				><CardTitle class="text-sm">Periodo selezionato</CardTitle></CardHeader
			>
			<CardContent>
				<div class="flex items-center gap-2 text-2xl font-bold">
					<Clock size={20} />
					{report.custom.totalLabel}
				</div>
				<p class="mt-1 text-xs text-muted-foreground">
					{report.custom.validSessions} sessioni · {report.custom.eventCount} eventi
				</p>
			</CardContent>
		</Card>
	</div>

	<form method="GET" class="filter-panel">
		<div class="min-w-44 flex-1 space-y-1">
			<Label for="hours-from">Dal</Label>
			<DatePicker id="hours-from" name="from" value={from} class="w-full" />
		</div>
		<div class="min-w-44 flex-1 space-y-1">
			<Label for="hours-to">Al</Label>
			<DatePicker id="hours-to" name="to" value={to} class="w-full" />
		</div>
		<Button type="submit" variant="outline">Calcola</Button>
	</form>

	<TablePanel>
		<div data-slot="table-panel-header"><h2 class="font-semibold">Sessioni del periodo</h2></div>
		{#if report.custom.sessions.length === 0}
			<p class="px-5 py-5 text-sm text-muted-foreground">Nessuna sessione completa nel periodo.</p>
		{:else}
			<Table embedded>
				<TableHeader
					><TableRow
						><TableHead>Ingresso</TableHead><TableHead>Uscita</TableHead><TableHead
							>Durata</TableHead
						></TableRow
					></TableHeader
				>
				<TableBody>
					{#each report.custom.sessions as session}
						<TableRow>
							<TableCell>{formatDateTime(session.entryAt)}</TableCell>
							<TableCell>{formatDateTime(session.exitAt)}</TableCell>
							<TableCell class="font-medium">{session.durationLabel}</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		{/if}
	</TablePanel>

	{#if report.custom.issues.length > 0}
		<div class="rounded-lg border border-amber-200 bg-amber-50">
			<div
				class="flex items-center gap-2 border-b border-amber-200 px-5 py-3 font-semibold text-amber-900"
			>
				<TriangleAlert size={16} /> Anomalie del periodo
			</div>
			<ul class="space-y-2 px-5 py-4 text-sm text-amber-900">
				{#each report.custom.issues as issue}
					<li>{formatDateTime(issue.timestamp)} — {issue.message}</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<StaffManualEntryDialog
	bind:open={manualOpen}
	users={manualUsers}
	defaultUserId={user.id}
	canSelectUser={canSelectManualUser}
	onsaved={invalidateAll}
/>
