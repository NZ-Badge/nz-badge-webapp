<script lang="ts">
	import { CreditCard, Smartphone } from '@lucide/svelte';
	import CardQuickReader from '$lib/components/CardQuickReader.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import { Button } from '$lib/components/ui/button';

	let { data } = $props();

	const kpis = $derived([
		{ title: 'Iscritti attivi', value: data.activeSubscribers },
		{ title: 'Presenze di oggi', value: data.todayAttendance },
		{ title: 'Tessere attive', value: data.activeCards },
		{ title: 'Dispositivi online', value: data.onlineDevices }
	]);

	function formatDateTime(d: Date | string | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleString('it-IT');
	}
</script>

<h1 class="mb-6 text-2xl font-bold">Panoramica</h1>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch">
	<div class="grid gap-3 lg:h-full lg:grid-rows-4">
		{#each kpis as kpi}
			<Card class="h-full">
				<CardContent class="grid h-full grid-cols-[1fr_56px] items-center gap-3 px-4 py-1.5">
					<div class="truncate text-sm font-medium text-gray-700">{kpi.title}</div>
					<div class="text-right text-base font-bold leading-none text-gray-950">{kpi.value}</div>
				</CardContent>
			</Card>
		{/each}
	</div>

	<div class="lg:h-full">
		<CardQuickReader
			description="Avvicina il badge al lettore per verificare subito UID, stato e intestatario."
			showDiagnosticsLink={true}
			stretch={true}
		/>
	</div>
</div>

<div class="mt-8">
	<div class="mb-4 flex items-center justify-between gap-4">
		<div>
			<h2 class="text-xl font-semibold">Iscritti del mese corrente</h2>
			<p class="text-muted-foreground text-sm capitalize">
				{data.currentMonthLabel} · {data.currentMonthSubscribers.length}
				{data.currentMonthSubscribers.length === 1 ? ' iscritto' : ' iscritti'}
			</p>
		</div>
		<a href="/subscribers">
			<Button variant="outline" size="sm">Apri iscritti</Button>
		</a>
	</div>

	{#if data.currentMonthSubscribers.length === 0}
		<Card>
			<CardContent class="text-muted-foreground py-6 text-sm">
				Nessun iscritto con corso nel mese corrente.
			</CardContent>
		</Card>
	{:else}
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Nome</TableHead>
					<TableHead>Email</TableHead>
					<TableHead class="w-32">Ore ultimo corso</TableHead>
					<TableHead class="w-40">Ultimo ingresso</TableHead>
					<TableHead class="w-32 text-center">Tessera</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.currentMonthSubscribers as sub}
					<TableRow>
						<TableCell>
							<a href="/subscribers/{sub.id}" class="font-medium hover:underline">
								{sub.firstName} {sub.lastName}
							</a>
						</TableCell>
						<TableCell>{sub.email}</TableCell>
						<TableCell class="text-sm">{sub.latestCourseAttendance}</TableCell>
						<TableCell class="text-sm">{formatDateTime(sub.lastEntryAt)}</TableCell>
						<TableCell class="w-32 text-center">
							<div class="flex items-center justify-center gap-1">
								{#if sub.hasActiveCard}
									<span title="Tessera RFID">
										<CreditCard size={14} class="text-blue-500" />
									</span>
								{/if}
								{#if sub.hasNfcPairing}
									<span title="NFC smartphone">
										<Smartphone size={14} class="text-green-500" />
									</span>
								{/if}
								{#if !sub.hasActiveCard && !sub.hasNfcPairing}
									<span class="text-muted-foreground text-xs">—</span>
								{/if}
							</div>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
			</Table>
		{/if}
	</div>
