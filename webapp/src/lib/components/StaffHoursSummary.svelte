<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Clock, CalendarDays, TriangleAlert, Plus } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
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
		const [year, month, day] = value.split('-');
		return `${day}/${month}/${year}`;
	}

	function formatDateTime(value: Date | string | null | undefined): string {
		if (!value) return '—';
		return new Date(value).toLocaleString('it-IT', {
			timeZone: 'Europe/Rome',
			dateStyle: 'short',
			timeStyle: 'short'
		});
	}
</script>

<div class="space-y-6">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">{user.name}</h1>
			<p class="text-sm text-muted-foreground">{user.email}</p>
		</div>
		{#if showManualAction}
			<Button onclick={() => (manualOpen = true)}><Plus size={16} /> Inserisci evento</Button>
		{/if}
	</div>

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

	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4">
		<div class="space-y-1">
			<Label for="hours-from">Dal</Label>
			<Input id="hours-from" name="from" type="date" value={from} class="w-44" />
		</div>
		<div class="space-y-1">
			<Label for="hours-to">Al</Label>
			<Input id="hours-to" name="to" type="date" value={to} class="w-44" />
		</div>
		<Button type="submit" variant="outline">Calcola</Button>
	</form>

	<div class="rounded-lg border bg-white">
		<div class="border-b px-5 py-3"><h2 class="font-semibold">Sessioni del periodo</h2></div>
		{#if report.custom.sessions.length === 0}
			<p class="px-5 py-5 text-sm text-muted-foreground">Nessuna sessione completa nel periodo.</p>
		{:else}
			<Table>
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
	</div>

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
