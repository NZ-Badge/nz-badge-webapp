<script lang="ts">
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
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import SubscriberFormDialog from '$lib/components/SubscriberFormDialog.svelte';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import { formatDateIT, formatDateTimeIT, toRomeDateInputValue } from '$lib/utils/date.js';
	import { enhance } from '$app/forms';
	import {
		Pencil,
		Trash2,
		CreditCard,
		Smartphone,
		ArrowLeft,
		ExternalLink,
		Clock,
		CalendarDays,
		CircleCheck,
		TriangleAlert,
		Activity,
		UserRound,
		Mail,
		Phone,
		IdCard,
		CalendarPlus,
		StickyNote,
		WalletCards
	} from '@lucide/svelte';

	let { data, form } = $props();

	let editDialogOpen = $state(false);
	let deleteDialogOpen = $state(false);

	const sub = $derived(data.subscriber);

	const statusVariant = (status: string) =>
		status === 'active'
			? 'positive'
			: status === 'completed'
				? 'secondary'
				: status === 'suspended'
					? 'warning'
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

	function dateInputValue(d: Date | string | null | undefined) {
		return toRomeDateInputValue(d);
	}

	function enrollmentEndDateValue(enrollment: { id: number; endDate: Date | string | null }) {
		const actionForm = form as
			| { action?: string; enrollmentId?: number; endDate?: string; error?: string }
			| null
			| undefined;

		if (
			actionForm?.action === 'updateEnrollmentEndDate' &&
			actionForm.enrollmentId === enrollment.id &&
			actionForm.endDate !== undefined
		) {
			return actionForm.endDate ?? '';
		}

		return dateInputValue(enrollment.endDate);
	}

	function enrollmentEndDateError(enrollmentId: number) {
		const actionForm = form as
			| { action?: string; enrollmentId?: number; error?: string }
			| null
			| undefined;

		if (
			actionForm?.action === 'updateEnrollmentEndDate' &&
			actionForm.enrollmentId === enrollmentId
		) {
			return actionForm.error;
		}

		return undefined;
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

	function pluralize(value: number, singular: string, plural: string) {
		return `${value} ${value === 1 ? singular : plural}`;
	}
</script>

<div class="space-y-6">
	<!-- Header -->
	<a
		href="/subscribers"
		class="app-link-muted inline-flex items-center gap-2 text-sm"
		data-tutorial-title="Torna agli iscritti"
		data-tutorial-description="Torna all’elenco per cercare e aprire la scheda di un’altra persona."
		><ArrowLeft size={16} /> Tutti gli iscritti</a
	>
	<PageHeader
		title={`${sub.firstName} ${sub.lastName}`}
		description="Dati personali, corsi, tessere e presenze dell’iscritto."
	>
		{#snippet summary()}
			<Badge variant={statusVariant(sub.status ?? '')}>{statusLabel(sub.status ?? '')}</Badge>
		{/snippet}
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => (editDialogOpen = true)}>
				<Pencil size={14} class="mr-1" /> Modifica
			</Button>
			<Button variant="destructive" size="sm" onclick={() => (deleteDialogOpen = true)}>
				<Trash2 size={14} class="mr-1" /> Elimina
			</Button>
		</div>
	</PageHeader>

	<div class="grid items-stretch gap-6 xl:grid-cols-2">
		<!-- Info -->
		<section
			class="overflow-hidden rounded-xl border border-blue-200 bg-card shadow-sm dark:border-blue-900"
		>
			<div
				class="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-5 py-4 dark:border-blue-900 dark:bg-blue-950/40"
			>
				<div class="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
					<UserRound size={19} aria-hidden="true" />
				</div>
				<div>
					<h2 class="font-semibold text-blue-950 dark:text-blue-100">Anagrafica</h2>
					<p class="text-xs text-blue-800/80 dark:text-blue-300/80">
						Contatti e dati identificativi
					</p>
				</div>
			</div>

			<dl class="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
				<div class="flex min-w-0 gap-3 rounded-lg border bg-background/70 p-3">
					<Mail
						class="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400"
						size={17}
						aria-hidden="true"
					/>
					<div class="min-w-0">
						<dt class="text-xs font-medium text-muted-foreground">Email</dt>
						<dd class="mt-1 truncate font-medium">
							<a href={`mailto:${sub.email}`} class="app-link">{sub.email}</a>
						</dd>
					</div>
				</div>

				<div class="flex gap-3 rounded-lg border bg-background/70 p-3">
					<Phone
						class="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400"
						size={17}
						aria-hidden="true"
					/>
					<div>
						<dt class="text-xs font-medium text-muted-foreground">Telefono</dt>
						<dd class="mt-1 font-medium">{sub.phone ?? '—'}</dd>
					</div>
				</div>

				<div class="flex min-w-0 gap-3 rounded-lg border bg-background/70 p-3">
					<IdCard
						class="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400"
						size={17}
						aria-hidden="true"
					/>
					<div class="min-w-0">
						<dt class="text-xs font-medium text-muted-foreground">Codice fiscale</dt>
						<dd class="mt-1 break-all font-mono font-medium">{sub.taxId ?? '—'}</dd>
					</div>
				</div>

				<div class="flex gap-3 rounded-lg border bg-background/70 p-3">
					<CalendarPlus
						class="mt-0.5 shrink-0 text-blue-600 dark:text-blue-400"
						size={17}
						aria-hidden="true"
					/>
					<div>
						<dt class="text-xs font-medium text-muted-foreground">Creato il</dt>
						<dd class="mt-1 font-medium">{formatDateIT(sub.createdAt) || '—'}</dd>
					</div>
				</div>

				{#if sub.note}
					<div
						class="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2 dark:border-amber-900 dark:bg-amber-950/30"
					>
						<StickyNote
							class="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400"
							size={17}
							aria-hidden="true"
						/>
						<div>
							<dt class="text-xs font-medium text-amber-800 dark:text-amber-300">Note</dt>
							<dd class="mt-1 whitespace-pre-wrap text-amber-950 dark:text-amber-100">
								{sub.note}
							</dd>
						</div>
					</div>
				{/if}
			</dl>
		</section>

		<!-- Cards -->
		<section class="overflow-hidden rounded-xl border bg-card shadow-sm">
			<div
				class="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50 px-5 py-4 dark:bg-slate-900/60"
			>
				<div class="flex items-center gap-3">
					<div
						class="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-white dark:bg-slate-700"
					>
						<WalletCards size={19} aria-hidden="true" />
					</div>
					<div>
						<h2 class="font-semibold">Tessere</h2>
						<p class="text-xs text-muted-foreground">
							{pluralize(data.cards.length, 'tessera associata', 'tessere associate')}
						</p>
					</div>
				</div>
				{#if !data.cards.some((c) => c.status === 'active' && c.type === 'rfid')}
					<Button
						href={`/subscribers/${sub.id}/write-card`}
						size="sm"
						data-tutorial-title="Scrivi card RFID"
						data-tutorial-description="Avvia la procedura guidata per programmare una nuova tessera RFID e associarla a questo iscritto."
					>
						<CreditCard size={14} /> Scrivi card RFID
					</Button>
				{/if}
			</div>

			{#if data.cards.length === 0}
				<div class="p-4 sm:p-5">
					<div
						class="grid min-h-32 place-items-center rounded-lg border border-dashed bg-muted/30 p-5 text-center"
					>
						<div>
							<CreditCard class="mx-auto text-muted-foreground" size={24} aria-hidden="true" />
							<p class="mt-2 text-sm font-medium">Nessuna tessera associata</p>
							<p class="mt-1 text-xs text-muted-foreground">
								Scrivi una card RFID per abilitare le presenze.
							</p>
						</div>
					</div>
				</div>
			{:else}
				<div class="grid gap-3 p-4 sm:p-5">
					{#each data.cards as card}
						<article
							class="rounded-lg border p-4 {card.status === 'active'
								? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30'
								: card.status === 'lost'
									? 'border-red-200 bg-red-50/70 dark:border-red-900 dark:bg-red-950/30'
									: 'bg-muted/30'}"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex min-w-0 items-center gap-3">
									<div
										class="grid size-10 shrink-0 place-items-center rounded-lg {card.status ===
										'active'
											? 'bg-emerald-700 text-white'
											: card.status === 'lost'
												? 'bg-red-600 text-white'
												: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}"
									>
										{#if card.type === 'nfc'}
											<Smartphone size={19} aria-hidden="true" />
										{:else}
											<CreditCard size={19} aria-hidden="true" />
										{/if}
									</div>
									<div class="min-w-0">
										<div class="text-xs font-medium text-muted-foreground">
											{card.type === 'nfc' ? 'Tessera NFC' : 'Card RFID'}
										</div>
										<div class="mt-0.5 break-all font-mono text-sm font-semibold">{card.uid}</div>
									</div>
								</div>
								<Badge variant={cardStatusVariant(card.status ?? '')}>
									{cardStatusLabel(card.status ?? '')}
								</Badge>
							</div>

							<dl class="mt-4 grid grid-cols-2 gap-3 border-t border-current/10 pt-3 text-sm">
								<div>
									<dt class="text-xs text-muted-foreground">Scritta il</dt>
									<dd class="mt-1 font-medium">{formatDateIT(card.writeDate) || '—'}</dd>
								</div>
								<div>
									<dt class="text-xs text-muted-foreground">Scadenza</dt>
									<dd class="mt-1 font-medium">{formatDateIT(card.expirationDate) || '—'}</dd>
								</div>
							</dl>
						</article>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	<!-- Iscrizioni -->
	<section class="overflow-hidden rounded-xl border bg-card shadow-sm">
		<div class="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
			<div>
				<h2 class="font-semibold">Iscrizioni ai corsi</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Ore registrate, periodo del corso e problemi che richiedono attenzione.
				</p>
			</div>
			{#if false}
				<!-- Link nascosto: riattivare rimuovendo il blocco if -->
				<a
					href="/courses?q={encodeURIComponent(sub.email)}"
					class="app-link flex items-center gap-1 text-xs"
				>
					Vedi nei corsi <ExternalLink size={12} />
				</a>
			{/if}
		</div>
		{#if data.enrollments.length === 0}
			<p class="px-5 py-4 text-sm text-muted-foreground">Nessuna iscrizione trovata.</p>
		{:else}
			<div class="space-y-4 bg-muted/20 p-4 sm:p-5">
				{#each data.enrollments as enrollment}
					{@const attendanceSummary = getCourseAttendance(enrollment.id)}
					{@const endDateError = enrollmentEndDateError(enrollment.id)}
					{@const issueCount = attendanceSummary?.issues.length ?? 0}
					{@const otherIssueCount = Math.max(
						0,
						issueCount - (attendanceSummary?.resolvableIssueCount ?? 0)
					)}
					{@const lastSession = attendanceSummary?.sessions.at(-1)}

					<article class="overflow-hidden rounded-xl border bg-card shadow-xs">
						<header class="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
							<div class="min-w-0">
								<h3 class="text-base font-semibold leading-snug">
									{enrollment.productTitle ?? 'Corso senza titolo'}
								</h3>
								{#if enrollment.variantTitle}
									<p class="mt-1 text-sm text-muted-foreground">{enrollment.variantTitle}</p>
								{/if}
							</div>
							{#if enrollment.orderName}
								<div class="shrink-0 text-right">
									<div
										class="text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
									>
										Ordine
									</div>
									<div class="font-mono text-xs">{enrollment.orderName}</div>
								</div>
							{/if}
						</header>

						<div class="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
							<div class="space-y-4">
								<div class="grid grid-cols-2 gap-3">
									<div
										class="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/40"
									>
										<div
											class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-300"
										>
											<Clock size={15} aria-hidden="true" /> Ore presenza
										</div>
										<div class="mt-2 text-2xl font-bold text-blue-950 dark:text-blue-100">
											{attendanceSummary?.totalLabel ?? '—'}
										</div>
										<p class="mt-1 text-xs text-blue-800/80 dark:text-blue-300/80">
											{pluralize(
												attendanceSummary?.validSessions ?? 0,
												'sessione valida',
												'sessioni valide'
											)}
										</p>
									</div>

									<div class="rounded-lg border bg-muted/40 p-4">
										<div
											class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
										>
											<CalendarDays size={15} aria-hidden="true" /> Durata corso
										</div>
										<div class="mt-2 text-2xl font-bold">
											{formatCourseDuration(enrollment.courseDurationDays)}
										</div>
										<p class="mt-1 text-xs text-muted-foreground">Durata prevista a calendario</p>
									</div>
								</div>

								<dl class="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2">
									<div>
										<dt class="text-xs font-medium text-muted-foreground">Periodo del corso</dt>
										<dd class="mt-1 font-medium">
											{formatDateIT(enrollment.startDate) || '—'} → {formatDateIT(
												enrollment.endDate
											) || '—'}
										</dd>
									</div>
									<div>
										<dt class="text-xs font-medium text-muted-foreground">
											Ultima sessione valida
										</dt>
										<dd class="mt-1 font-medium">
											{lastSession ? formatDateIT(lastSession.exitAt) : 'Nessuna sessione'}
										</dd>
									</div>
								</dl>
							</div>

							<div class="flex flex-col rounded-lg border p-4">
								<div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Stato presenze
								</div>

								{#if !attendanceSummary?.canCalculate}
									<div
										class="mt-3 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
									>
										<TriangleAlert class="mt-0.5 shrink-0" size={18} aria-hidden="true" />
										<div>
											<p class="font-semibold">Calcolo ore non disponibile</p>
											<p class="mt-1 text-sm">
												Completa il periodo del corso per attribuire correttamente le presenze.
											</p>
										</div>
									</div>
								{:else if (attendanceSummary.resolvableIssueCount ?? 0) > 0}
									<div
										class="mt-3 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
									>
										<TriangleAlert class="mt-0.5 shrink-0" size={18} aria-hidden="true" />
										<div>
											<p class="font-semibold">
												{pluralize(
													attendanceSummary.resolvableIssueCount,
													'anomalia da risolvere',
													'anomalie da risolvere'
												)}
											</p>
											<p class="mt-1 text-sm">
												Una o più uscite mancanti rendono incompleto il totale.
											</p>
										</div>
									</div>
									<Button
										href={`/subscribers/${sub.id}/attendance-anomalies/${enrollment.id}`}
										variant="warning"
										class="mt-3 w-full"
										data-tutorial-title="Risolvi anomalie presenze"
										data-tutorial-description="Apre le presenze incomplete di questo corso per inserire le uscite mancanti e aggiornare il totale delle ore."
									>
										Risolvi anomalie
									</Button>
								{:else if otherIssueCount > 0}
									<div
										class="mt-3 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
									>
										<TriangleAlert class="mt-0.5 shrink-0" size={18} aria-hidden="true" />
										<div>
											<p class="font-semibold">
												{pluralize(
													otherIssueCount,
													'anomalia da verificare',
													'anomalie da verificare'
												)}
											</p>
											<p class="mt-1 text-sm">
												Alcune registrazioni non formano una coppia ingresso/uscita valida.
											</p>
										</div>
									</div>
								{:else if (attendanceSummary?.validSessions ?? 0) > 0}
									<div
										class="mt-3 flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100"
									>
										<CircleCheck class="mt-0.5 shrink-0" size={18} aria-hidden="true" />
										<div>
											<p class="font-semibold">Presenze regolari</p>
											<p class="mt-1 text-sm">
												Tutte le registrazioni risultano abbinate correttamente.
											</p>
										</div>
									</div>
								{:else}
									<div class="mt-3 flex gap-3 rounded-lg border bg-muted/40 p-3">
										<Activity
											class="mt-0.5 shrink-0 text-muted-foreground"
											size={18}
											aria-hidden="true"
										/>
										<div>
											<p class="font-semibold">In attesa di presenze</p>
											<p class="mt-1 text-sm text-muted-foreground">
												Non risultano ancora sessioni valide nel periodo.
											</p>
										</div>
									</div>
								{/if}

								<p class="mt-auto pt-3 text-xs text-muted-foreground">
									{pluralize(
										attendanceSummary?.eventCount ?? 0,
										'registrazione acquisita',
										'registrazioni acquisite'
									)}
								</p>
							</div>
						</div>

						<footer class="border-t bg-muted/20 px-5 py-4">
							<form
								method="POST"
								action="?/updateEnrollmentEndDate"
								use:enhance
								class="flex flex-wrap items-end gap-3"
							>
								<input type="hidden" name="enrollmentId" value={enrollment.id} />
								<label class="grid gap-1.5 text-sm font-medium">
									Data fine corso
									<DatePicker
										name="endDate"
										value={enrollmentEndDateValue(enrollment)}
										class="w-44"
										aria-invalid={Boolean(endDateError)}
										aria-describedby={endDateError ? `end-date-error-${enrollment.id}` : undefined}
									/>
								</label>
								<Button
									type="submit"
									size="sm"
									data-tutorial-title="Salva data fine corso"
									data-tutorial-description="Aggiorna la fine del periodo usato per attribuire le registrazioni e calcolare le ore di presenza di questo corso."
								>
									Salva data
								</Button>
								{#if !enrollment.endDate}
									<p
										class="flex items-center gap-1.5 pb-2 text-xs font-medium text-amber-700 dark:text-amber-400"
									>
										<TriangleAlert size={14} aria-hidden="true" />
										Data fine corso non impostata
									</p>
								{/if}
								{#if endDateError}
									<p
										id={`end-date-error-${enrollment.id}`}
										class="w-full text-xs text-red-600 dark:text-red-400"
									>
										{endDateError}
									</p>
								{/if}
							</form>
						</footer>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Presenze recenti -->
	<TablePanel>
		<div data-slot="table-panel-header">
			<h2 class="font-semibold">Ultime presenze</h2>
			<a
				href="/attendance?subscriber={encodeURIComponent(sub.firstName + ' ' + sub.lastName)}"
				class="app-link text-xs"
			>
				Vedi tutte →
			</a>
		</div>
		{#if data.recentAttendance.length === 0}
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
					{#each data.recentAttendance as row}
						<TableRow>
							<TableCell class="font-mono text-sm font-medium"
								>{formatDateTimeIT(row.readTimestamp) || '—'}</TableCell
							>
							<TableCell>
								<Badge variant={row.eventType === 'entry' ? 'default' : 'secondary'}>
									{eventTypeLabel(row.eventType)}
								</Badge>
							</TableCell>
							<TableCell class="text-xs text-muted-foreground">{row.deviceId}</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		{/if}
	</TablePanel>
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
