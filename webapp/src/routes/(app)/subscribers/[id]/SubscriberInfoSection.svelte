<script lang="ts">
	import { CalendarPlus, IdCard, Mail, Phone, StickyNote, UserRound } from '@lucide/svelte';
	import { formatDateIT } from '$lib/utils/date.js';
	import type { PageData } from './$types';

	let { subscriber }: { subscriber: PageData['subscriber'] } = $props();
</script>

{#snippet field(icon: typeof Mail, label: string, value: string, mono = false)}
	{@const Icon = icon}
	<div class="flex min-w-0 gap-3 rounded-lg border bg-background/70 p-3">
		<Icon class="mt-0.5 shrink-0 text-blue-600" size={17} aria-hidden="true" />
		<div class="min-w-0">
			<dt class="text-xs font-medium text-muted-foreground">{label}</dt>
			<dd class="mt-1 font-medium {mono ? 'font-mono break-all' : ''}">{value}</dd>
		</div>
	</div>
{/snippet}

<section class="overflow-hidden rounded-xl border border-blue-200 bg-card shadow-sm">
	<div class="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-5 py-4">
		<div class="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
			<UserRound size={19} aria-hidden="true" />
		</div>
		<div>
			<h2 class="font-semibold text-blue-950">Anagrafica</h2>
			<p class="text-xs text-blue-800/80">Contatti e dati identificativi</p>
		</div>
	</div>

	<dl class="grid gap-3 p-4 text-sm sm:grid-cols-2 sm:p-5">
		<div class="flex min-w-0 gap-3 rounded-lg border bg-background/70 p-3">
			<Mail class="mt-0.5 shrink-0 text-blue-600" size={17} aria-hidden="true" />
			<div class="min-w-0">
				<dt class="text-xs font-medium text-muted-foreground">Email</dt>
				<dd class="mt-1 truncate font-medium">
					<a href={`mailto:${subscriber.email}`} class="app-link">{subscriber.email}</a>
				</dd>
			</div>
		</div>
		{@render field(Phone, 'Telefono', subscriber.phone ?? '—')}
		{@render field(IdCard, 'Codice fiscale', subscriber.taxId ?? '—', true)}
		{@render field(CalendarPlus, 'Creato il', formatDateIT(subscriber.createdAt) || '—')}

		{#if subscriber.note}
			<div class="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 sm:col-span-2">
				<StickyNote class="mt-0.5 shrink-0 text-amber-700" size={17} aria-hidden="true" />
				<div>
					<dt class="text-xs font-medium text-amber-800">Note</dt>
					<dd class="mt-1 whitespace-pre-wrap text-amber-950">{subscriber.note}</dd>
				</div>
			</div>
		{/if}
	</dl>
</section>
