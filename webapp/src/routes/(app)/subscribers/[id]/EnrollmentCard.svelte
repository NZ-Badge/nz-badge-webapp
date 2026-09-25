<script lang="ts">
	import { enhance } from '$app/forms';
	import { Activity, CalendarDays, CircleCheck, Clock, TriangleAlert } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { formatDateIT } from '$lib/utils/date.js';
	import { formatCourseDuration, pluralize } from './format';
	import type { PageData } from './$types';

	let {
		subscriberId,
		enrollment,
		summary,
		endDateValue,
		endDateError
	}: {
		subscriberId: number;
		enrollment: PageData['enrollments'][number];
		summary: PageData['courseAttendance'][number] | undefined;
		/** Valore del campo: quello inviato dopo un errore, altrimenti la data salvata. */
		endDateValue: string;
		endDateError?: string;
	} = $props();

	const resolvableIssues = $derived(summary?.resolvableIssueCount ?? 0);
	const otherIssues = $derived(Math.max(0, (summary?.issues.length ?? 0) - resolvableIssues));
	const lastSession = $derived(summary?.sessions.at(-1));
	const errorId = $derived(`end-date-error-${enrollment.id}`);
</script>

{#snippet notice(tone: 'warning' | 'danger' | 'positive' | 'muted', title: string, text: string)}
	<div
		class="mt-3 flex gap-3 rounded-lg border p-3 {tone === 'warning'
			? 'border-amber-300 bg-amber-50 text-amber-950'
			: tone === 'danger'
				? 'border-red-200 bg-red-50 text-red-950'
				: tone === 'positive'
					? 'border-emerald-200 bg-emerald-50 text-emerald-950'
					: 'bg-muted/40'}"
	>
		{#if tone === 'positive'}
			<CircleCheck class="mt-0.5 shrink-0" size={18} aria-hidden="true" />
		{:else if tone === 'muted'}
			<Activity class="mt-0.5 shrink-0 text-muted-foreground" size={18} aria-hidden="true" />
		{:else}
			<TriangleAlert class="mt-0.5 shrink-0" size={18} aria-hidden="true" />
		{/if}
		<div>
			<p class="font-semibold">{title}</p>
			<p class="mt-1 text-sm {tone === 'muted' ? 'text-muted-foreground' : ''}">{text}</p>
		</div>
	</div>
{/snippet}

<article class="overflow-hidden rounded-xl border bg-card shadow-xs">
	<header class="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
		<div class="min-w-0">
			<h3 class="text-base leading-snug font-semibold">
				{enrollment.productTitle ?? 'Corso senza titolo'}
			</h3>
			{#if enrollment.variantTitle}
				<p class="mt-1 text-sm text-muted-foreground">{enrollment.variantTitle}</p>
			{/if}
		</div>
		{#if enrollment.orderName}
			<div class="shrink-0 text-right">
				<div class="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
					Ordine
				</div>
				<div class="font-mono text-xs">{enrollment.orderName}</div>
			</div>
		{/if}
	</header>

	<div class="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
		<div class="space-y-4">
			<div class="grid grid-cols-2 gap-3">
				<div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
					<div
						class="flex items-center gap-2 text-xs font-semibold tracking-wide text-blue-800 uppercase"
					>
						<Clock size={15} aria-hidden="true" /> Ore presenza
					</div>
					<div class="mt-2 text-2xl font-bold text-blue-950">{summary?.totalLabel ?? '—'}</div>
					<p class="mt-1 text-xs text-blue-800/80">
						{pluralize(summary?.validSessions ?? 0, 'sessione valida', 'sessioni valide')}
					</p>
				</div>

				<div class="rounded-lg border bg-muted/40 p-4">
					<div
						class="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
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
						{formatDateIT(enrollment.startDate) || '—'} → {formatDateIT(enrollment.endDate) || '—'}
					</dd>
				</div>
				<div>
					<dt class="text-xs font-medium text-muted-foreground">Ultima sessione valida</dt>
					<dd class="mt-1 font-medium">
						{lastSession ? formatDateIT(lastSession.exitAt) : 'Nessuna sessione'}
					</dd>
				</div>
			</dl>
		</div>

		<div class="flex flex-col rounded-lg border p-4">
			<div class="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
				Stato presenze
			</div>

			{#if !summary?.canCalculate}
				{@render notice(
					'warning',
					'Calcolo ore non disponibile',
					'Completa il periodo del corso per attribuire correttamente le presenze.'
				)}
			{:else if resolvableIssues > 0}
				{@render notice(
					'warning',
					pluralize(resolvableIssues, 'anomalia da risolvere', 'anomalie da risolvere'),
					'Una o più uscite mancanti rendono incompleto il totale.'
				)}
				<Button
					href={`/subscribers/${subscriberId}/attendance-anomalies/${enrollment.id}`}
					variant="warning"
					class="mt-3 w-full"
					data-tutorial-title="Risolvi anomalie presenze"
					data-tutorial-description="Apre le presenze incomplete di questo corso per inserire le uscite mancanti e aggiornare il totale delle ore."
				>
					Risolvi anomalie
				</Button>
			{:else if otherIssues > 0}
				{@render notice(
					'danger',
					pluralize(otherIssues, 'anomalia da verificare', 'anomalie da verificare'),
					'Alcune registrazioni non formano una coppia ingresso/uscita valida.'
				)}
			{:else if (summary?.validSessions ?? 0) > 0}
				{@render notice(
					'positive',
					'Presenze regolari',
					'Tutte le registrazioni risultano abbinate correttamente.'
				)}
			{:else}
				{@render notice(
					'muted',
					'In attesa di presenze',
					'Non risultano ancora sessioni valide nel periodo.'
				)}
			{/if}

			<p class="mt-auto pt-3 text-xs text-muted-foreground">
				{pluralize(summary?.eventCount ?? 0, 'registrazione acquisita', 'registrazioni acquisite')}
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
					value={endDateValue}
					class="w-44"
					aria-label="Data fine corso"
					aria-invalid={Boolean(endDateError)}
					aria-describedby={endDateError ? errorId : undefined}
					data-tutorial="field.course-end"
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
				<p class="flex items-center gap-1.5 pb-2 text-xs font-medium text-amber-700">
					<TriangleAlert size={14} aria-hidden="true" />
					Data fine corso non impostata
				</p>
			{/if}
			{#if endDateError}
				<p id={errorId} class="w-full text-xs text-red-600" role="alert">{endDateError}</p>
			{/if}
		</form>
	</footer>
</article>
