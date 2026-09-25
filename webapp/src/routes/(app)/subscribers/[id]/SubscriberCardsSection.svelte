<script lang="ts">
	import { CreditCard, Smartphone, WalletCards } from '@lucide/svelte';
	import CardStatusBadge from '$lib/components/CardStatusBadge.svelte';
	import { Button } from '$lib/components/ui/button';
	import { formatDateIT } from '$lib/utils/date.js';
	import { pluralize } from './format';
	import type { PageData } from './$types';

	let { subscriberId, cards }: { subscriberId: number; cards: PageData['cards'] } = $props();

	const canWriteCard = $derived(!cards.some((c) => c.status === 'active' && c.type === 'rfid'));

	const tone = (status: string | null) =>
		status === 'active'
			? { article: 'border-emerald-200 bg-emerald-50/70', icon: 'bg-emerald-700 text-white' }
			: status === 'lost'
				? { article: 'border-red-200 bg-red-50/70', icon: 'bg-red-600 text-white' }
				: { article: 'bg-muted/30', icon: 'bg-muted text-foreground' };
</script>

<section class="overflow-hidden rounded-xl border bg-card shadow-sm">
	<div class="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/50 px-5 py-4">
		<div class="flex items-center gap-3">
			<div class="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-800 text-white">
				<WalletCards size={19} aria-hidden="true" />
			</div>
			<div>
				<h2 class="font-semibold">Tessere</h2>
				<p class="text-xs text-muted-foreground">
					{pluralize(cards.length, 'tessera associata', 'tessere associate')}
				</p>
			</div>
		</div>
		{#if canWriteCard}
			<Button
				href={`/subscribers/${subscriberId}/write-card`}
				size="sm"
				data-tutorial-title="Scrivi card RFID"
				data-tutorial-description="Avvia la procedura guidata per programmare una nuova tessera RFID e associarla a questo iscritto."
			>
				<CreditCard size={14} aria-hidden="true" /> Scrivi card RFID
			</Button>
		{/if}
	</div>

	{#if cards.length === 0}
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
			{#each cards as card (card.id)}
				{@const style = tone(card.status)}
				<article class="rounded-lg border p-4 {style.article}">
					<div class="flex items-start justify-between gap-3">
						<div class="flex min-w-0 items-center gap-3">
							<div class="grid size-10 shrink-0 place-items-center rounded-lg {style.icon}">
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
								<div class="mt-0.5 font-mono text-sm font-semibold break-all">{card.uid}</div>
							</div>
						</div>
						<CardStatusBadge status={card.status} />
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
