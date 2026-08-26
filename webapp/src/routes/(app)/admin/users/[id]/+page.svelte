<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { ArrowLeft, CreditCard } from '@lucide/svelte';
	import StaffHoursSummary from '$lib/components/StaffHoursSummary.svelte';
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

	let { data } = $props();
	let cardError = $state('');
	let cardBusy = $state<number | null>(null);

	const hasActiveCard = $derived(data.cards.some((card) => card.status === 'active'));

	function formatDate(value: Date | string | null): string {
		return value ? new Date(value).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' }) : '—';
	}

	async function changeCardStatus(cardId: number, action: 'enable' | 'disable' | 'restore') {
		cardBusy = cardId;
		cardError = '';
		try {
			const response = await fetch(`/api/v1/card/${cardId}/${action}`, { method: 'POST' });
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? 'Operazione non riuscita');
			await invalidateAll();
		} catch (err) {
			cardError = err instanceof Error ? err.message : 'Operazione non riuscita';
		} finally {
			cardBusy = null;
		}
	}
</script>

<div class="mb-4 flex items-center gap-3">
	<a
		href="/admin/users"
		class="text-muted-foreground hover:text-foreground"
		aria-label="Torna allo Staff"
	>
		<ArrowLeft size={18} />
	</a>
	<Badge variant={data.targetUser.status === 'active' ? 'default' : 'secondary'}>
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

<div class="mt-6 rounded-lg border bg-white">
	<div class="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
		<h2 class="font-semibold">Card RFID</h2>
		{#if data.targetUser.status === 'active' && !hasActiveCard}
			<a href="/admin/users/{data.targetUser.id}/write-card">
				<Button size="sm" variant="outline"><CreditCard size={14} /> Scrivi card RFID</Button>
			</a>
		{/if}
	</div>
	{#if cardError}<p class="px-5 pt-3 text-sm text-red-600">{cardError}</p>{/if}
	{#if data.cards.length === 0}
		<p class="px-5 py-5 text-sm text-muted-foreground">Nessuna card RFID associata.</p>
	{:else}
		<Table>
			<TableHeader
				><TableRow
					><TableHead>UID</TableHead><TableHead>Stato</TableHead><TableHead>Scritta il</TableHead
					><TableHead class="text-right">Azioni</TableHead></TableRow
				></TableHeader
			>
			<TableBody>
				{#each data.cards as card}
					<TableRow>
						<TableCell class="font-mono text-xs">{card.uid}</TableCell>
						<TableCell
							><Badge variant={card.status === 'active' ? 'default' : 'secondary'}
								>{card.status}</Badge
							></TableCell
						>
						<TableCell>{formatDate(card.writeDate)}</TableCell>
						<TableCell class="text-right">
							{#if card.status === 'active'}
								<Button
									size="sm"
									variant="outline"
									disabled={cardBusy === card.id}
									onclick={() => changeCardStatus(card.id, 'disable')}>Disabilita</Button
								>
							{:else if card.status === 'disabled' && data.targetUser.status === 'active' && !hasActiveCard}
								<Button
									size="sm"
									variant="outline"
									disabled={cardBusy === card.id}
									onclick={() => changeCardStatus(card.id, 'enable')}>Riabilita</Button
								>
							{:else if card.status === 'deleted' && data.targetUser.status === 'active'}
								<Button
									size="sm"
									variant="outline"
									disabled={cardBusy === card.id}
									onclick={() => changeCardStatus(card.id, 'restore')}>Ripristina</Button
								>
							{/if}
							{#if card.status === 'active' || card.status === 'disabled'}
								<a class="ml-2" href="/cards/{card.id}/erase"
									><Button size="sm" variant="ghost">Erase</Button></a
								>
							{/if}
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	{/if}
</div>
