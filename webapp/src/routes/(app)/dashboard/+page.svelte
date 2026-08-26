<script lang="ts">
	import { CreditCard, Smartphone, History, Plus, ScanLine } from '@lucide/svelte';
	import { invalidateAll } from '$app/navigation';
	import CardQuickReader from '$lib/components/CardQuickReader.svelte';
	import StaffManualEntryDialog from '$lib/components/StaffManualEntryDialog.svelte';
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

	const kpis = $derived(
		data.mode === 'management'
			? [
					{ title: 'Iscritti attivi', value: data.activeSubscribers },
					{ title: 'Presenze di oggi', value: data.todayAttendance },
					{ title: 'Tessere attive', value: data.activeCards },
					{ title: 'Dispositivi online', value: data.onlineDevices }
				]
			: []
	);
	const currentMonthSubscribers = $derived(
		data.mode === 'management' ? (data.currentMonthSubscribers ?? []) : []
	);
	let manualOpen = $state(false);
	let simulateBusy = $state(false);
	let simulateMessage = $state('');
	let simulateError = $state(false);

	function formatDateTime(d: Date | string | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome' });
	}

	function sourceLabel(source: string): string {
		return source === 'card' ? 'Card RFID' : source === 'manual' ? 'Manuale' : 'Pulsante Home';
	}

	async function simulateSwipe() {
		simulateBusy = true;
		simulateMessage = '';
		simulateError = false;
		try {
			const response = await fetch('/api/v1/staff-attendance/simulate', { method: 'POST' });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				if (body.ignored)
					throw new Error(
						'Strisciata troppo vicina alla precedente. Riprova dopo l’intervallo configurato.'
					);
				throw new Error(body.error ?? 'Registrazione non riuscita');
			}
			simulateMessage = `${body.nextType === 'entry' ? 'Ingresso' : 'Uscita'} registrato correttamente.`;
			await invalidateAll();
		} catch (err) {
			simulateError = true;
			simulateMessage = err instanceof Error ? err.message : 'Registrazione non riuscita';
		} finally {
			simulateBusy = false;
		}
	}
</script>

{#if data.mode === 'collaborator'}
	<h1 class="mb-2 text-2xl font-bold">Panoramica</h1>
	<p class="mb-6 text-sm text-muted-foreground">
		Ciao {data.targetUser.name}, gestisci qui i tuoi ingressi.
	</p>

	<div class="grid gap-4 md:grid-cols-2">
		<Card>
			<CardContent class="space-y-4 p-5">
				<div>
					<h2 class="font-semibold">Simula strisciata</h2>
					<p class="text-sm text-muted-foreground">
						Il prossimo evento previsto è <strong
							>{data.nextEventType === 'entry' ? 'Ingresso' : 'Uscita'}</strong
						>.
					</p>
				</div>
				<Button class="w-full" onclick={simulateSwipe} disabled={simulateBusy}
					><ScanLine size={17} />
					{simulateBusy
						? 'Registrazione…'
						: `Registra ${data.nextEventType === 'entry' ? 'ingresso' : 'uscita'}`}</Button
				>
				{#if simulateMessage}<p class="text-sm {simulateError ? 'text-red-600' : 'text-green-700'}">
						{simulateMessage}
					</p>{/if}
			</CardContent>
		</Card>
		<Card>
			<CardContent class="space-y-4 p-5">
				<div>
					<h2 class="font-semibold">Inserimento manuale</h2>
					<p class="text-sm text-muted-foreground">
						Inserisci un ingresso o un’uscita, anche con una data passata.
					</p>
				</div>
				<Button class="w-full" variant="outline" onclick={() => (manualOpen = true)}
					><Plus size={17} /> Inserisci evento</Button
				>
				<a href="/my-attendance" class="block text-center text-sm text-blue-700 hover:underline"
					>Apri il riepilogo delle ore →</a
				>
			</CardContent>
		</Card>
	</div>

	<div class="mt-8 rounded-lg border bg-white">
		<div class="flex items-center justify-between border-b px-5 py-3">
			<h2 class="font-semibold">Le mie ultime 10 strisciate</h2>
			<a href="/staff-attendance" class="text-sm text-blue-700 hover:underline">Vedi tutte →</a>
		</div>
		{#if data.recentStaffAttendance.length === 0}<p class="px-5 py-6 text-sm text-muted-foreground">
				Nessuna strisciata registrata.
			</p>{:else}
			<Table
				><TableHeader
					><TableRow
						><TableHead>Data/ora</TableHead><TableHead>Evento</TableHead><TableHead
							>Sorgente</TableHead
						></TableRow
					></TableHeader
				><TableBody
					>{#each data.recentStaffAttendance as row}<TableRow
							><TableCell
								><span class="inline-flex items-center gap-1.5"
									>{formatDateTime(row.readTimestamp)}{#if row.isBackdated}<History
											size={14}
											class="text-amber-600"><title>Inserimento retrodatato</title></History
										>{/if}</span
								></TableCell
							><TableCell>{row.eventType === 'entry' ? 'Ingresso' : 'Uscita'}</TableCell><TableCell
								>{sourceLabel(row.source)}</TableCell
							></TableRow
						>{/each}</TableBody
				></Table
			>
		{/if}
	</div>

	<StaffManualEntryDialog
		bind:open={manualOpen}
		users={[data.targetUser]}
		defaultUserId={data.targetUser.id}
		canSelectUser={false}
		onsaved={invalidateAll}
	/>
{:else}
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
{/if}

{#if data.mode === 'management'}
	<div class="mt-8">
		<div class="mb-4 flex items-center justify-between gap-4">
			<div>
				<h2 class="text-xl font-semibold">Iscritti del mese corrente</h2>
				<p class="text-muted-foreground text-sm capitalize">
					{data.currentMonthLabel} · {currentMonthSubscribers.length}
					{currentMonthSubscribers.length === 1 ? ' iscritto' : ' iscritti'}
				</p>
			</div>
			<a href="/subscribers">
				<Button variant="outline" size="sm">Apri iscritti</Button>
			</a>
		</div>

		{#if currentMonthSubscribers.length === 0}
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
					{#each currentMonthSubscribers as sub}
						<TableRow>
							<TableCell>
								<a href="/subscribers/{sub.id}" class="font-medium hover:underline">
									{sub.firstName}
									{sub.lastName}
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
{/if}
