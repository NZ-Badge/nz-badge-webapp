<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { ArrowLeft, CreditCard } from '@lucide/svelte';
	import StaffHoursSummary from '$lib/components/StaffHoursSummary.svelte';
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
	import { formatDateIT } from '$lib/utils/date.js';
	import { apiFetch, errorMessage } from '$lib/utils/http';

	let { data } = $props();
	let cardBusy = $state<number | null>(null);

	const hasActiveCard = $derived(data.cards.some((card) => card.status === 'active'));

	function formatDate(value: Date | string | null): string {
		return formatDateIT(value) || '—';
	}

	async function changeCardStatus(cardId: number, action: 'enable' | 'disable' | 'restore') {
		cardBusy = cardId;
		try {
			await apiFetch(`/api/v1/card/${cardId}/${action}`, { method: 'POST' });
			toast.success(
				action === 'disable'
					? 'Card disabilitata'
					: action === 'enable'
						? 'Card riabilitata'
						: 'Card ripristinata'
			);
			await invalidateAll();
		} catch (err) {
			toast.error(errorMessage(err, 'Operazione non riuscita'));
		} finally {
			cardBusy = null;
		}
	}
</script>

<div class="mb-4 flex items-center gap-3">
	<a href="/admin/users" class="app-link-muted" aria-label="Torna allo Staff">
		<ArrowLeft size={18} />
	</a>
	<Badge variant={data.targetUser.status === 'active' ? 'positive' : 'secondary'}>
		{data.targetUser.status === 'active' ? 'Attivo' : 'Disattivato'}
	</Badge>
</div>

<StaffHoursSummary
	user={data.targetUser}
	report={data.report}
	from={data.from}
	to={data.to}
	manualUsers={data.activeUsers}
	canSelectManualUser={true}
	showManualAction={data.targetUser.status === 'active'}
/>

<TablePanel class="mt-6">
	<div data-slot="table-panel-header">
		<h2 class="font-semibold">Card RFID</h2>
		{#if data.targetUser.status === 'active' && !hasActiveCard}
			<Button
				href="/admin/users/{data.targetUser.id}/write-card"
				size="sm"
				variant="outline"
				data-tutorial-title="Scrivi tessera staff"
				data-tutorial-description="Apre la procedura guidata per associare una tessera a questa persona tramite il lettore USB."
				><CreditCard size={14} /> Scrivi tessera</Button
			>
		{/if}
	</div>
	{#if data.cards.length === 0}
		<p class="px-5 py-5 text-sm text-muted-foreground">Nessuna card RFID associata.</p>
	{:else}
		<Table embedded>
			<TableHeader
				><TableRow
					><TableHead>UID</TableHead><TableHead>Stato</TableHead><TableHead>Scritta il</TableHead
					><TableHead class="text-right">Azioni</TableHead></TableRow
				></TableHeader
			>
			<TableBody>
				{#each data.cards as card (card.id)}
					<TableRow>
						<TableCell class="font-mono text-xs">{card.uid}</TableCell>
						<TableCell
							><Badge variant={card.status === 'active' ? 'positive' : 'secondary'}
								>{card.status === 'active'
									? 'Attiva'
									: card.status === 'disabled'
										? 'Disabilitata'
										: card.status === 'deleted'
											? 'Cancellata'
											: card.status === 'lost'
												? 'Smarrita'
												: card.status === 'replaced'
													? 'Sostituita'
													: card.status}</Badge
							></TableCell
						>
						<TableCell>{formatDate(card.writeDate)}</TableCell>
						<TableCell class="text-right">
							{#if card.status === 'active'}
								<Button
									size="sm"
									variant="destructive-ghost"
									disabled={cardBusy === card.id}
									onclick={() => changeCardStatus(card.id, 'disable')}>Disabilita</Button
								>
							{:else if card.status === 'disabled' && data.targetUser.status === 'active' && !hasActiveCard}
								<Button
									size="sm"
									variant="positive"
									disabled={cardBusy === card.id}
									onclick={() => changeCardStatus(card.id, 'enable')}>Riabilita</Button
								>
							{:else if card.status === 'deleted' && data.targetUser.status === 'active'}
								<Button
									size="sm"
									variant="positive"
									disabled={cardBusy === card.id}
									onclick={() => changeCardStatus(card.id, 'restore')}>Ripristina</Button
								>
							{/if}
							{#if card.status === 'active' || card.status === 'disabled'}
								<Button
									class="ml-2"
									href="/cards/{card.id}/erase"
									size="sm"
									variant="destructive-ghost"
									data-tutorial-title="Cancella card"
									data-tutorial-description="Apre la procedura guidata per cancellare i dati dalla card tramite il lettore USB."
									>Erase</Button
								>
							{/if}
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	{/if}
</TablePanel>
