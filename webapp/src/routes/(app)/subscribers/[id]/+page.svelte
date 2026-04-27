<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import SubscriberFormDialog from '$lib/components/SubscriberFormDialog.svelte';
	import { enhance } from '$app/forms';
	import { Pencil, Trash2, CreditCard, Smartphone, ArrowLeft, ExternalLink } from '@lucide/svelte';

	let { data, form } = $props();

	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);

	const sub = $derived(data.subscriber);

	const statusVariant = (status: string) =>
		status === 'active'
			? 'default'
			: status === 'completed'
				? 'secondary'
				: status === 'suspended'
					? 'outline'
					: 'destructive';

	const statusLabel = (status: string) =>
		status === 'active'
			? 'Attivo'
			: status === 'completed'
				? 'Completato'
				: status === 'suspended'
					? 'Sospeso'
					: status === 'cancelled'
						? 'Annullato'
						: status;

	function formatDate(d: Date | string | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('it-IT');
	}

	function formatDateTime(d: Date | string | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleString('it-IT');
	}

	const cardStatusVariant = (status: string) =>
		status === 'active'
			? 'default'
			: status === 'disabled'
				? 'outline'
				: status === 'lost'
					? 'destructive'
					: 'secondary';

	const cardStatusLabel = (status: string) =>
		status === 'active'
			? 'Attiva'
			: status === 'disabled'
				? 'Disabilitata'
				: status === 'lost'
					? 'Smarrita'
					: status === 'replaced'
						? 'Sostituita'
						: status;

	const eventTypeLabel = (eventType: string) => (eventType === 'entry' ? 'Ingresso' : 'Uscita');

	function getCourseAttendance(enrollmentId: number) {
		return data.courseAttendance.find((row) => row.enrollmentId === enrollmentId);
	}

	function formatCourseDuration(days: number | null) {
		if (days == null) return '—';
		return `${days} ${days === 1 ? 'giorno' : 'giorni'}`;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<a href="/subscribers" class="text-muted-foreground hover:text-foreground">
				<ArrowLeft size={18} />
			</a>
			<h1 class="text-2xl font-bold">{sub.firstName} {sub.lastName}</h1>
			<Badge variant={statusVariant(sub.status ?? '')}>{statusLabel(sub.status ?? '')}</Badge>
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => (editDialogOpen = true)}>
				<Pencil size={14} class="mr-1" /> Modifica
			</Button>
			<Button variant="destructive" size="sm" onclick={() => (deleteDialogOpen = true)}>
				<Trash2 size={14} class="mr-1" /> Elimina
			</Button>
		</div>
	</div>

	<!-- Info -->
	<div class="rounded-lg border bg-white p-5 space-y-3">
		<h2 class="font-semibold text-sm text-muted-foreground uppercase tracking-wide">Anagrafica</h2>
		<dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
			<div class="flex gap-2">
				<dt class="w-32 text-muted-foreground shrink-0">Email</dt>
				<dd class="font-medium">{sub.email}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="w-32 text-muted-foreground shrink-0">Telefono</dt>
				<dd>{sub.phone ?? '—'}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="w-32 text-muted-foreground shrink-0">Codice fiscale</dt>
				<dd class="font-mono">{sub.taxId ?? '—'}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="w-32 text-muted-foreground shrink-0">Creato il</dt>
				<dd>{formatDate(sub.createdAt)}</dd>
			</div>
			{#if sub.note}
				<div class="flex gap-2 sm:col-span-2">
					<dt class="w-32 text-muted-foreground shrink-0">Note</dt>
					<dd class="whitespace-pre-wrap">{sub.note}</dd>
				</div>
			{/if}
		</dl>
	</div>

	<!-- Iscrizioni -->
	<div class="rounded-lg border bg-white">
		<div class="flex items-center justify-between px-5 py-3 border-b">
			<h2 class="font-semibold">Iscrizioni ai corsi</h2>
			<a
				href="/courses?q={encodeURIComponent(sub.email)}"
				class="text-xs text-muted-foreground hover:underline flex items-center gap-1"
			>
				Vedi nei corsi <ExternalLink size={12} />
			</a>
		</div>
		{#if data.enrollments.length === 0}
			<p class="px-5 py-4 text-sm text-muted-foreground">Nessuna iscrizione trovata.</p>
		{:else}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Ordine</TableHead>
						<TableHead>Corso</TableHead>
						<TableHead>Data inizio</TableHead>
						<TableHead>Durata</TableHead>
						<TableHead>Ore presenza</TableHead>
						<TableHead>Anomalie</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.enrollments as enrollment}
						{@const attendanceSummary = getCourseAttendance(enrollment.id)}
						<TableRow>
							<TableCell class="font-mono text-xs">{enrollment.orderName ?? '—'}</TableCell>
							<TableCell>
								<div>{enrollment.productTitle ?? '—'}</div>
								{#if enrollment.variantTitle}
									<div class="text-xs text-muted-foreground">{enrollment.variantTitle}</div>
								{/if}
							</TableCell>
							<TableCell class="text-sm">{formatDate(enrollment.preferredDate)}</TableCell>
							<TableCell class="text-sm">{formatCourseDuration(enrollment.courseDurationDays)}</TableCell>
							<TableCell class="text-sm align-top">
								{#if attendanceSummary}
									<div class="font-medium">{attendanceSummary.totalLabel}</div>
									<div class="text-xs text-muted-foreground">
										{attendanceSummary.validSessions} sessioni valide
									</div>
								{:else}
									—
								{/if}
							</TableCell>
							<TableCell class="text-sm align-top">
								{#if !attendanceSummary}
									—
								{:else}
									<div class="flex flex-wrap items-center gap-2">
										<span
											class={attendanceSummary.resolvableIssueCount > 0
												? 'font-medium text-red-600'
												: 'text-muted-foreground'}
										>
											{attendanceSummary.resolvableIssueCount}
										</span>
										{#if attendanceSummary.resolvableIssueCount > 0}
											<Button
												href={`/subscribers/${sub.id}/attendance-anomalies/${enrollment.id}`}
												variant="outline"
												size="sm"
											>
												Risolvi
											</Button>
										{/if}
									</div>
								{/if}
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		{/if}
	</div>

	<!-- Cards -->
	<div class="rounded-lg border bg-white">
		<div class="flex items-center justify-between px-5 py-3 border-b">
			<h2 class="font-semibold">Tessere</h2>
			{#if !data.cards.some((c) => c.status === 'active' && c.type === 'rfid')}
				<a href="/subscribers/{sub.id}/write-card">
					<Button size="sm" variant="outline"
						><CreditCard size={14} class="mr-1" /> Scrivi card RFID</Button
					>
				</a>
			{/if}
		</div>
		{#if data.cards.length === 0}
			<p class="px-5 py-4 text-sm text-muted-foreground">Nessuna tessera associata.</p>
		{:else}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>UID</TableHead>
						<TableHead>Tipo</TableHead>
						<TableHead>Stato</TableHead>
						<TableHead>Scritta il</TableHead>
						<TableHead>Scadenza</TableHead>
						<TableHead>Dispositivo</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.cards as card}
						<TableRow>
							<TableCell class="font-mono text-xs">{card.uid}</TableCell>
							<TableCell>
								{#if card.type === 'nfc'}
									<span class="flex items-center gap-1"><Smartphone size={12} /> NFC</span>
								{:else}
									<span class="flex items-center gap-1"><CreditCard size={12} /> RFID</span>
								{/if}
							</TableCell>
							<TableCell>
								<Badge variant={cardStatusVariant(card.status ?? '')}
									>{cardStatusLabel(card.status ?? '')}</Badge
								>
							</TableCell>
							<TableCell>{formatDate(card.writeDate)}</TableCell>
							<TableCell>{formatDate(card.expirationDate)}</TableCell>
							<TableCell class="text-xs text-muted-foreground"
								>{card.writtenByDevice ?? '—'}</TableCell
							>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		{/if}
	</div>

	<!-- Presenze recenti -->
	<div class="rounded-lg border bg-white">
		<div class="flex items-center justify-between px-5 py-3 border-b">
			<h2 class="font-semibold">Ultime presenze</h2>
			<a
				href="/attendance?subscriber={encodeURIComponent(sub.firstName + ' ' + sub.lastName)}"
				class="text-xs text-muted-foreground hover:underline"
			>
				Vedi tutte →
			</a>
		</div>
		{#if data.recentAttendance.length === 0}
			<p class="px-5 py-4 text-sm text-muted-foreground">Nessuna presenza registrata.</p>
		{:else}
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Data / ora</TableHead>
						<TableHead>Tipo</TableHead>
						<TableHead>Dispositivo</TableHead>
						<TableHead class="w-20 text-center">Offline</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each data.recentAttendance as row}
						<TableRow>
							<TableCell class="font-mono text-xs">{formatDateTime(row.readTimestamp)}</TableCell>
							<TableCell>
								<Badge variant={row.eventType === 'entry' ? 'default' : 'secondary'}>
									{eventTypeLabel(row.eventType)}
								</Badge>
							</TableCell>
							<TableCell class="text-xs text-muted-foreground">{row.deviceId}</TableCell>
							<TableCell class="text-center text-xs">
								{row.offlineQueued ? '✓' : ''}
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		{/if}
	</div>
</div>

<!-- Dialog modifica -->
<SubscriberFormDialog bind:open={editDialogOpen} subscriber={sub} formResult={form} />

<!-- Dialog elimina -->
<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Elimina iscritto</DialogTitle>
		</DialogHeader>
		<p>
			Sei sicuro di voler eliminare <strong>{sub.firstName} {sub.lastName}</strong>?
		</p>
		{#if form?.error && form?.action === 'delete'}
			<p class="text-sm text-red-600">{form.error}</p>
		{/if}
		<DialogFooter>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Annulla</Button>
			<form method="POST" action="?/delete" use:enhance>
				<Button type="submit" variant="destructive">Elimina</Button>
			</form>
		</DialogFooter>
	</DialogContent>
</Dialog>
