<script lang="ts">
	import { enhance } from '$app/forms';
	import { Alert, AlertDescription, AlertTitle } from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { ArrowLeft } from '@lucide/svelte';

	let { data, form } = $props();

	function formatDate(d: Date | string | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('it-IT');
	}

	function formatDateTime(d: Date | string | null | undefined) {
		if (!d) return '—';
		return new Date(d).toLocaleString('it-IT');
	}

	function formatHours(value: number | null | undefined) {
		if (value === null || value === undefined) return '—';

		return value.toLocaleString('it-IT', {
			minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
			maximumFractionDigits: 2
		});
	}

	function getFieldValue(fieldName: string) {
		if (!form || !('values' in form)) return '';
		const values = form.values as Record<string, string> | undefined;
		return values?.[fieldName] ?? '';
	}

	function getFieldError(fieldName: string) {
		if (!form || !('fieldErrors' in form)) return undefined;
		const fieldErrors = form.fieldErrors as Record<string, string> | undefined;
		return fieldErrors?.[fieldName];
	}
</script>

<div class="space-y-6">
	<div class="flex items-center gap-3">
		<a href="/subscribers/{data.subscriber.id}" class="text-muted-foreground hover:text-foreground">
			<ArrowLeft size={18} />
		</a>
		<div>
			<h1 class="text-2xl font-bold">Risolvi anomalie presenze</h1>
			<p class="text-sm text-muted-foreground">
				{data.subscriber.firstName}
				{data.subscriber.lastName}
			</p>
		</div>
	</div>

	<div class="rounded-lg border bg-white p-5 space-y-3">
		<div class="flex flex-wrap items-center gap-2">
			<h2 class="font-semibold">{data.enrollment.productTitle ?? 'Corso senza titolo'}</h2>
			{#if data.enrollment.variantTitle}
				<Badge variant="secondary">{data.enrollment.variantTitle}</Badge>
			{/if}
		</div>
		<dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
			<div class="flex gap-2">
				<dt class="w-32 shrink-0 text-muted-foreground">Ordine</dt>
				<dd class="font-mono">{data.enrollment.orderName ?? '—'}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="w-32 shrink-0 text-muted-foreground">Data inizio</dt>
				<dd>{formatDate(data.enrollment.startDate)}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="w-32 shrink-0 text-muted-foreground">Data fine</dt>
				<dd>{formatDate(data.enrollment.endDate)}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="w-32 shrink-0 text-muted-foreground">Ore valide</dt>
				<dd>{data.summary.totalLabel}</dd>
			</div>
			<div class="flex gap-2">
				<dt class="w-32 shrink-0 text-muted-foreground">Anomalie aperte</dt>
				<dd>{data.summary.resolvableIssueCount}</dd>
			</div>
		</dl>
	</div>

	{#if form?.error && form?.action === 'resolve'}
		<Alert variant="destructive">
			<AlertTitle>Salvataggio non riuscito</AlertTitle>
			<AlertDescription>{form.error}</AlertDescription>
		</Alert>
	{/if}

	{#if data.resolutionRows.length === 0}
		<Alert>
			<AlertTitle>Nessuna anomalia da risolvere</AlertTitle>
			<AlertDescription>
				Per questa iscrizione non risultano più ingressi aperti senza uscita.
			</AlertDescription>
		</Alert>
	{:else}
		<form method="POST" action="?/resolve" use:enhance class="space-y-4">
			<div class="rounded-lg border bg-white divide-y">
				{#each data.resolutionRows as row}
					<div class="p-5 space-y-4">
						<div class="flex flex-wrap items-center justify-between gap-2">
							<div>
								<div class="font-medium">Ingresso #{row.entryAttendanceId}</div>
								<div class="text-sm text-muted-foreground">{formatDateTime(row.entryAt)}</div>
							</div>
							<Badge variant="outline">
								{row.nextEventAt
									? `Prossimo evento: ${formatDateTime(row.nextEventAt)}`
									: 'Ultimo evento disponibile'}
							</Badge>
						</div>

						<div class="grid gap-4 md:grid-cols-[220px_1fr]">
							<div class="space-y-2">
								<Label for={row.fieldName}>Ore svolte</Label>
								<Input
									id={row.fieldName}
									name={row.fieldName}
									type="number"
									step="0.25"
									min="0.25"
									max={row.maxHours ?? undefined}
									placeholder="Es. 3.5"
									value={getFieldValue(row.fieldName)}
									aria-invalid={Boolean(getFieldError(row.fieldName))}
								/>
								{#if getFieldError(row.fieldName)}
									<p class="text-sm text-red-600">{getFieldError(row.fieldName)}</p>
								{/if}
							</div>

							<div class="text-sm text-muted-foreground space-y-1">
								<p>Inserisci le ore effettivamente svolte per calcolare e registrare l’uscita.</p>
								<p>Massimo inseribile: {formatHours(row.maxHours)} ore.</p>
								{#if row.maxHours === 0}
									<p class="text-red-600">
										Questo ingresso non ha spazio utile prima del prossimo evento o della fine del
										periodo.
									</p>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>

			<div class="flex items-center justify-end gap-2">
				<Button variant="outline" href={`/subscribers/${data.subscriber.id}`}>Annulla</Button>
				<Button type="submit">Salva uscite</Button>
			</div>
		</form>
	{/if}
</div>
