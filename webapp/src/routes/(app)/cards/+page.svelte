<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Power, RotateCcw, Trash2, Eraser } from '@lucide/svelte';
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

	let { data } = $props();

	let cardToDisable = $state<(typeof data.cards)[0] | null>(null);
	let disableDialogOpen = $state(false);
	let disabling = $state(false);
	let disableError = $state<string | null>(null);

	let restoring = $state<number | null>(null);
	let restoreError = $state<string | null>(null);

	let enabling = $state<number | null>(null);
	let enableError = $state<string | null>(null);

	async function enableCard(id: number) {
		enabling = id;
		enableError = null;
		try {
			const res = await fetch(`/api/v1/card/${id}/enable`, {
				method: 'POST',
				credentials: 'include'
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Impossibile abilitare la tessera');
			}
			await invalidateAll();
		} catch (err) {
			enableError = err instanceof Error ? err.message : 'Errore';
		} finally {
			enabling = null;
		}
	}

	const statusVariant = (status: string) =>
		status === 'active'
			? 'default'
			: status === 'disabled'
				? 'secondary'
				: status === 'lost'
					? 'destructive'
					: status === 'deleted'
						? 'destructive'
						: 'outline';

	const statusLabel = (status: string) =>
		status === 'active'
			? 'Attiva'
			: status === 'disabled'
				? 'Disabilitata'
				: status === 'replaced'
					? 'Sostituita'
					: status === 'lost'
						? 'Smarrita'
						: status === 'deleted'
							? 'Eliminata'
							: status;

	async function confirmDisable() {
		if (!cardToDisable) return;
		disabling = true;
		disableError = null;
		try {
			const res = await fetch(`/api/v1/card/${cardToDisable.id}/disable`, {
				method: 'POST',
				credentials: 'include'
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Impossibile disabilitare la tessera');
			}
			disableDialogOpen = false;
			cardToDisable = null;
			await invalidateAll();
		} catch (err) {
			disableError = err instanceof Error ? err.message : 'Errore';
		} finally {
			disabling = false;
		}
	}

	async function restoreCard(id: number) {
		restoring = id;
		restoreError = null;
		try {
			const res = await fetch(`/api/v1/card/${id}/restore`, {
				method: 'POST',
				credentials: 'include'
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Impossibile ripristinare la tessera');
			}
			await invalidateAll();
		} catch (err) {
			restoreError = err instanceof Error ? err.message : 'Errore';
		} finally {
			restoring = null;
		}
	}
</script>

<div class="space-y-4">
	<h1 class="text-2xl font-bold">Tessere RFID</h1>

	<!-- Tab navigation -->
	<div class="flex gap-2 border-b">
		<a
			href="?tab=active"
			class="px-4 py-2 text-sm font-medium border-b-2 -mb-px {data.tab !== 'history'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Tessere attive
		</a>
		<a
			href="?tab=history"
			class="px-4 py-2 text-sm font-medium border-b-2 -mb-px {data.tab === 'history'
				? 'border-primary text-primary'
				: 'border-transparent text-muted-foreground hover:text-foreground'}"
		>
			Storico cancellate
		</a>
	</div>

	{#if data.tab === 'history'}
		<!-- Storico card cancellate -->
		<p class="text-sm text-muted-foreground">
			Card eliminate fisicamente. Le chiavi sono conservate per permettere cancellazioni fisiche
			tardive. "Ripristina" riporta la card allo stato <em>disabled</em> per permettere una nuova cancellazione
			fisica o riscrittura.
		</p>

		{#if restoreError}
			<p class="text-sm text-red-600">{restoreError}</p>
		{/if}

		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>UID</TableHead>
					<TableHead>Iscritto</TableHead>
					<TableHead>Scritta il</TableHead>
					<TableHead>Cancellata il</TableHead>
					<TableHead></TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.cards as card}
					<TableRow>
						<TableCell class="font-mono text-sm">{card.uid}</TableCell>
						<TableCell>
							{card.subscriberName ? `${card.subscriberName} ${card.subscriberSurname}` : '—'}
						</TableCell>
						<TableCell>
							{card.writeDate ? new Date(card.writeDate).toLocaleDateString('it-IT') : '—'}
						</TableCell>
						<TableCell>
							{card.deletedAt ? new Date(card.deletedAt).toLocaleDateString('it-IT') : '—'}
						</TableCell>
						<TableCell class="w-px whitespace-nowrap">
							<div class="flex items-center gap-1">
								<a href="/cards/{card.id}/erase" title="Cancella fisicamente">
									<Button
										size="sm"
										variant="ghost"
										class="text-red-600 hover:text-red-700 hover:bg-red-50"
									>
										<Eraser size={16} />
									</Button>
								</a>
								<Button
									size="sm"
									variant="ghost"
									onclick={() => restoreCard(card.id)}
									disabled={restoring === card.id}
									title="Ripristina"
								>
									<RotateCcw size={16} />
								</Button>
							</div>
						</TableCell>
					</TableRow>
				{/each}
				{#if data.cards.length === 0}
					<TableRow>
						<TableCell colspan={5} class="text-center text-muted-foreground py-8">
							Nessuna card cancellata nello storico.
						</TableCell>
					</TableRow>
				{/if}
			</TableBody>
		</Table>
	{:else}
		<!-- Vista principale: card non cancellate -->
		{#if enableError}
			<p class="text-sm text-red-600">{enableError}</p>
		{/if}

		<form method="GET" class="flex gap-3">
			<input type="hidden" name="tab" value="active" />
			<select name="status" class="rounded border px-2 py-1 text-sm">
				<option value="">Tutti gli stati</option>
				{#each ['active', 'disabled', 'replaced', 'lost'] as opt}
					<option value={opt} selected={data.status === opt}>{statusLabel(opt)}</option>
				{/each}
			</select>
			<Button type="submit" variant="outline" size="sm">Filtra</Button>
		</form>

		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>UID</TableHead>
					<TableHead>Iscritto</TableHead>
					<TableHead>Scritta il</TableHead>
					<TableHead>Scadenza</TableHead>
					<TableHead>Stato</TableHead>
					<TableHead></TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.cards as card}
					<TableRow>
						<TableCell class="font-mono text-sm">{card.uid}</TableCell>
						<TableCell>
							{card.subscriberName ? `${card.subscriberName} ${card.subscriberSurname}` : '—'}
						</TableCell>
						<TableCell>
							{card.writeDate ? new Date(card.writeDate).toLocaleDateString('it-IT') : '—'}
						</TableCell>
						<TableCell>{card.expirationDate ?? '—'}</TableCell>
						<TableCell>
							<Badge variant={statusVariant(card.status ?? '')}
								>{statusLabel(card.status ?? '')}</Badge
							>
						</TableCell>
						<TableCell class="w-px whitespace-nowrap">
							{#if card.status === 'active' || card.status === 'disabled'}
								<div class="flex items-center gap-1">
									{#if card.status === 'active'}
										<Button
											size="sm"
											variant="ghost"
											class="text-red-600 hover:text-red-700 hover:bg-red-50"
											onclick={() => {
												cardToDisable = card;
												disableDialogOpen = true;
											}}
											title="Disabilita"
										>
											<Power size={16} />
										</Button>
									{:else if card.status === 'disabled'}
										<Button
											size="sm"
											variant="ghost"
											class="text-green-600 hover:text-green-700 hover:bg-green-50"
											onclick={() => enableCard(card.id)}
											disabled={enabling === card.id}
											title="Abilita"
										>
											<Power size={16} />
										</Button>
									{/if}
									<a href="/cards/{card.id}/erase" title="Cancella">
										<Button size="sm" variant="ghost">
											<Trash2 size={16} />
										</Button>
									</a>
								</div>
							{/if}
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	{/if}

	<!-- Paginazione -->
	<div class="flex items-center justify-between text-sm text-gray-600">
		<span>Pagina {data.page} di {data.totalPages} ({data.total} totali)</span>
		<div class="flex gap-2">
			{#if data.page > 1}
				<a href="?page={data.page - 1}&tab={data.tab}&status={data.status}">
					<Button variant="outline" size="sm">Precedente</Button>
				</a>
			{/if}
			{#if data.page < data.totalPages}
				<a href="?page={data.page + 1}&tab={data.tab}&status={data.status}">
					<Button variant="outline" size="sm">Successiva</Button>
				</a>
			{/if}
		</div>
	</div>
</div>

<!-- Dialog conferma disabilitazione -->
<Dialog bind:open={disableDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Disabilita tessera</DialogTitle>
		</DialogHeader>
		<p class="text-sm">
			Sicuro di voler disabilitare la card <code class="font-mono">{cardToDisable?.uid}</code>?
		</p>
		{#if disableError}
			<p class="text-sm text-red-600">{disableError}</p>
		{/if}
		<DialogFooter>
			<Button variant="outline" onclick={() => (disableDialogOpen = false)}>Annulla</Button>
			<Button variant="destructive" onclick={confirmDisable} disabled={disabling}>
				{disabling ? 'Disabilitando...' : 'Disabilita'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
