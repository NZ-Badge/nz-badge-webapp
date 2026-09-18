<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { invalidateAll } from '$app/navigation';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Power, RotateCcw, Trash2, Eraser } from '@lucide/svelte';
	import {
		Table,
		TablePanel,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TablePagination,
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
			? 'positive'
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

	function formatExpirationDate(value: Date | string | null): string {
		if (!value) return '—';

		// Le colonne SQL DATE arrivano come YYYY-MM-DD: le formatto senza convertirle in UTC,
		// evitando che il giorno cambi in base al fuso orario del browser.
		if (typeof value === 'string') {
			const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
			if (match) return `${match[3]}/${match[2]}/${match[1]}`;
		}

		return new Intl.DateTimeFormat('it-IT', {
			timeZone: 'Europe/Rome',
			day: '2-digit',
			month: '2-digit',
			year: 'numeric'
		}).format(new Date(value));
	}

	function buildListUrl(page: number): string {
		const params = new URLSearchParams({ tab: data.tab });
		if (page > 1) params.set('page', String(page));
		if (data.status) params.set('status', data.status);
		return `?${params}`;
	}

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
	<PageHeader
		title="Tessere"
		description="Controlla le tessere associate alle persone, verifica il loro stato e consulta quelle cancellate."
	/>

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
			Tessere cancellate dal sistema. Con “Ripristina” una tessera torna disponibile come
			disabilitata: potrai riscriverla o completarne la cancellazione con il lettore USB.
		</p>

		{#if restoreError}
			<p class="text-sm text-red-600">{restoreError}</p>
		{/if}

		<TablePanel>
			<Table embedded>
				<TableHeader>
					<TableRow>
						<TableHead>UID</TableHead>
						<TableHead>Iscritto</TableHead>
						<TableHead>Scritta il</TableHead>
						<TableHead>Cancellata il</TableHead>
						<TableHead class="w-px text-right">Azioni</TableHead>
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
							<TableCell class="w-px whitespace-nowrap text-right">
								<div class="flex items-center justify-end gap-1">
									<Button
										href={`/cards/${card.id}/erase`}
										size="icon-sm"
										variant="destructive-ghost"
										aria-label={`Cancella fisicamente la tessera ${card.uid}`}
										data-tutorial-title="Cancella fisicamente"
										data-tutorial-description="Avvia la procedura guidata per cancellare i dati dalla tessera tramite il lettore USB."
									>
										<Eraser size={16} />
									</Button>
									<Button
										size="icon-sm"
										variant="positive-ghost"
										onclick={() => restoreCard(card.id)}
										disabled={restoring === card.id}
										aria-label={`Ripristina la tessera ${card.uid}`}
										data-tutorial-title="Ripristina tessera"
										data-tutorial-description="Ripristina questa tessera nello stato disabilitato per consentirne il riutilizzo."
									>
										<RotateCcw size={16} />
									</Button>
								</div>
							</TableCell>
						</TableRow>
					{/each}
					{#if data.cards.length === 0}
						<TableRow>
							<TableCell colspan={5} data-empty>Nessuna card cancellata nello storico.</TableCell>
						</TableRow>
					{/if}
				</TableBody>
			</Table>
			<TablePagination
				page={data.page}
				totalPages={data.totalPages}
				total={data.total}
				getPageHref={buildListUrl}
				ariaLabel="Paginazione tessere cancellate"
			/>
		</TablePanel>
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

		<TablePanel>
			<Table embedded>
				<TableHeader>
					<TableRow>
						<TableHead>UID</TableHead>
						<TableHead>Iscritto</TableHead>
						<TableHead>Scritta il</TableHead>
						<TableHead>Scadenza</TableHead>
						<TableHead>Stato</TableHead>
						<TableHead class="w-px text-right">Azioni</TableHead>
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
							<TableCell>{formatExpirationDate(card.expirationDate)}</TableCell>
							<TableCell>
								<Badge variant={statusVariant(card.status ?? '')}
									>{statusLabel(card.status ?? '')}</Badge
								>
							</TableCell>
							<TableCell class="w-px whitespace-nowrap text-right">
								{#if card.status === 'active' || card.status === 'disabled'}
									<div class="flex items-center justify-end gap-1">
										{#if card.status === 'active'}
											<Button
												size="icon-sm"
												variant="destructive-ghost"
												onclick={() => {
													cardToDisable = card;
													disableDialogOpen = true;
												}}
												aria-label={`Disabilita la tessera ${card.uid}`}
												data-tutorial-title="Disabilita tessera"
												data-tutorial-description="Apre la conferma per disabilitare questa tessera senza cancellarne i dati."
											>
												<Power size={16} />
											</Button>
										{:else if card.status === 'disabled'}
											<Button
												size="icon-sm"
												variant="positive-ghost"
												onclick={() => enableCard(card.id)}
												disabled={enabling === card.id}
												aria-label={`Abilita la tessera ${card.uid}`}
												data-tutorial-title="Abilita tessera"
												data-tutorial-description="Riabilita questa tessera per consentirne nuovamente l’utilizzo."
											>
												<Power size={16} />
											</Button>
										{/if}
										<Button
											href={`/cards/${card.id}/erase`}
											size="icon-sm"
											variant="destructive-ghost"
											aria-label={`Cancella la tessera ${card.uid}`}
											data-tutorial-title="Cancella tessera"
											data-tutorial-description="Avvia la procedura guidata per cancellare e rimuovere questa tessera."
										>
											<Trash2 size={16} />
										</Button>
									</div>
								{/if}
							</TableCell>
						</TableRow>
					{/each}
					{#if data.cards.length === 0}
						<TableRow
							><TableCell colspan={6} data-empty>Nessuna tessera trovata.</TableCell></TableRow
						>
					{/if}
				</TableBody>
			</Table>
			<TablePagination
				page={data.page}
				totalPages={data.totalPages}
				total={data.total}
				getPageHref={buildListUrl}
				ariaLabel="Paginazione tessere"
			/>
		</TablePanel>
	{/if}
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
