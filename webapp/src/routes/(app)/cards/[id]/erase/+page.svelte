<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { WebSerialCardWriter } from '$lib/utils/webserial';
	import { connection } from '$lib/stores/webserial.svelte';
	import { changeCardState, eraseCardFlow, errorMessage } from '$lib/services/card-client';

	let { data } = $props();

	let WriterClass: typeof WebSerialCardWriter | null = null;
	let writer: WebSerialCardWriter | null = null;

	type Step = 'choose' | 'connect' | 'ready' | 'erasing' | 'deleting' | 'done';
	let step = $state<Step>('choose');
	let errorText = $state<string | null>(null);
	let isLoading = $state(false);
	let deleteMode = $state<'soft' | 'hard' | null>(null);
	let confirmationOpen = $state(false);
	let pendingDeleteMode = $state<'soft' | 'hard' | null>(null);

	const serialSupported = browser && 'serial' in navigator;

	if (browser) {
		import('$lib/utils/webserial').then((m) => {
			WriterClass = m.WebSerialCardWriter;
		});
	}

	// Nella cancellazione fisica "Connetti" e "Pronto" seguono lo stato della connessione.
	const view = $derived.by<Step>(() => {
		if (deleteMode !== 'hard') return step;
		const connected = connection.state === 'connected';
		if (step === 'connect' && connected) return 'ready';
		if (step === 'ready' && !connected) return 'connect';
		return step;
	});

	function chooseSoftDelete() {
		pendingDeleteMode = 'soft';
		confirmationOpen = true;
	}

	function confirmDelete() {
		if (!pendingDeleteMode || isLoading) return;
		const mode = pendingDeleteMode;
		confirmationOpen = false;
		deleteMode = mode;
		if (mode === 'soft') {
			void handleSoftDelete();
		} else {
			void handleErase();
		}
	}

	function chooseHardDelete() {
		deleteMode = 'hard';
		if (connection.state === 'connected') {
			step = 'ready';
		} else {
			step = 'connect';
		}
	}

	async function runDeletion(progress: Step, onError: Step, task: () => Promise<void>) {
		isLoading = true;
		errorText = null;
		step = progress;
		try {
			await task();
			step = 'done';
		} catch (err) {
			errorText = errorMessage(err, 'Operazione fallita');
			step = onError;
		} finally {
			isLoading = false;
		}
	}

	// Solo cancellazione logica dal DB
	function handleSoftDelete() {
		return runDeletion('deleting', 'choose', () => changeCardState(data.card.id, 'delete'));
	}

	function handleErase() {
		if (!WriterClass) return;
		const Writer = WriterClass;
		return runDeletion('erasing', 'ready', async () => {
			// Writer nuovo a ogni tentativo: usa sempre la porta attualmente connessa.
			writer = new Writer();
			await writer.connect(connection.port ?? undefined);
			await eraseCardFlow(writer, data.card.id);
		});
	}

	onDestroy(() => {
		writer = null;
	});
</script>

<div class="mx-auto max-w-lg space-y-6">
	<a href={data.backHref} class="app-link-muted text-sm" data-tutorial="flow.return"
		>← {data.backLabel}</a
	>
	<PageHeader
		title="Cancella tessera"
		description="Questa operazione rimuove i dati dalla tessera. Verifica l’intestatario prima di procedere e segui le istruzioni del lettore."
	/>

	<div class="space-y-4 rounded-lg border bg-card p-6">
		<div class="space-y-1 text-sm">
			<p>
				Carta: <code class="rounded bg-muted px-1 font-mono">{data.card.uid}</code>
			</p>
			{#if data.card.subscriberFirstName}
				<p>
					Abbinata a: <strong>{data.card.subscriberFirstName} {data.card.subscriberLastName}</strong
					>
				</p>
			{:else if data.card.userName}
				<p class="text-muted-foreground">Abbinata a: <strong>{data.card.userName}</strong></p>
			{/if}
		</div>

		{#if errorText}
			<div
				class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
				role="alert"
			>
				{errorText}
			</div>
		{/if}

		<div aria-live="polite" class="space-y-4">
			{#if view === 'choose'}
				{#if data.use_mifare}
					<p class="text-sm text-muted-foreground">
						Scegli come procedere con la cancellazione della carta:
					</p>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-3 rounded border p-4">
							<div>
								<h3 class="text-sm font-semibold">Cancella</h3>
								<p class="mt-1 text-xs text-muted-foreground">
									Rimuove solo il record dal database. La carta fisica rimane invariata e potrà
									essere riassociata.
								</p>
							</div>
							<Button
								onclick={chooseSoftDelete}
								disabled={isLoading}
								variant="destructive"
								class="w-full"
								data-tutorial-title="Cancella tessera"
								data-tutorial-description="Apre la conferma per rimuovere la tessera dal database senza modificare la card fisica."
							>
								Cancella
							</Button>
						</div>

						<div class="space-y-3 rounded border border-red-200 bg-red-50 p-4">
							<div>
								<h3 class="text-sm font-semibold text-red-900">Cancella e Formatta</h3>
								<p class="mt-1 text-xs text-red-700">
									Cancella i dati fisicamente dalla carta RFID e rimuove il record. Richiede il
									dispositivo writer.
								</p>
							</div>
							<Button
								onclick={chooseHardDelete}
								disabled={isLoading}
								variant="destructive"
								class="w-full"
								data-tutorial="card.erase-format"
							>
								Cancella e Formatta
							</Button>
						</div>
					</div>

					<Button
						href={data.backHref}
						variant="outline"
						class="w-full"
						data-tutorial-title="Annulla cancellazione"
						data-tutorial-description="Torna alla pagina precedente senza cancellare la tessera."
						>Annulla</Button
					>
				{:else}
					<!-- Modalità UID-only: solo soft-delete disponibile -->
					<p class="text-sm text-muted-foreground">
						Elimina il record della carta dal database. La carta fisica non viene modificata.
					</p>
					<div class="flex gap-2">
						<Button
							onclick={chooseSoftDelete}
							disabled={isLoading}
							variant="destructive"
							class="min-w-0 flex-1"
							data-tutorial-title="Elimina tessera"
							data-tutorial-description="Apre la conferma prima di rimuovere la tessera dal database. La card fisica resta invariata."
						>
							Elimina
						</Button>
						<Button
							href={data.backHref}
							variant="outline"
							class="min-w-0 flex-1"
							data-tutorial-title="Annulla cancellazione"
							data-tutorial-description="Torna alla pagina precedente senza cancellare la tessera."
							>Annulla</Button
						>
					</div>
				{/if}
			{:else if view === 'connect'}
				<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					{#if !serialSupported}
						WebSerial API richiede Chrome o Edge (desktop). Questa funzione non è disponibile nel
						browser corrente.
					{:else}
						<strong>Connessione richiesta:</strong> Connetti il dispositivo writer usando il pulsante
						nella toolbar in alto per procedere con la cancellazione fisica.
					{/if}
				</div>
				<div class="flex gap-2">
					<Button onclick={() => (step = 'choose')} variant="outline" data-tutorial="flow.back"
						>Indietro</Button
					>
					{#if serialSupported}
						<Button href={data.backHref} variant="ghost" data-tutorial="dialog.cancel"
							>Annulla</Button
						>
					{/if}
				</div>
			{:else if view === 'ready'}
				<p class="text-sm">
					Dispositivo connesso. Avvicina la carta RFID al writer e clicca "Cancella e Formatta" per
					procedere con la cancellazione fisica.
				</p>
				<div class="flex gap-2">
					<Button
						onclick={() => {
							pendingDeleteMode = 'hard';
							confirmationOpen = true;
						}}
						disabled={isLoading}
						variant="destructive"
						data-tutorial-title="Cancella e formatta"
						data-tutorial-description="Apre la conferma prima di cancellare i dati dalla card fisica e dal database."
					>
						Cancella e Formatta
					</Button>
					<Button onclick={() => (step = 'choose')} variant="outline" data-tutorial="flow.back"
						>Indietro</Button
					>
				</div>
			{:else if view === 'deleting'}
				<p class="text-sm text-muted-foreground">Cancellazione in corso...</p>
				<div class="h-2 animate-pulse rounded bg-amber-100"></div>
			{:else if view === 'erasing'}
				<p class="text-sm text-muted-foreground">
					Cancellazione fisica in corso... mantenere la carta ferma.
				</p>
				<div class="h-2 animate-pulse rounded bg-red-100"></div>
			{:else if view === 'done'}
				<div class="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
					{#if deleteMode === 'soft'}
						✓ Carta cancellata con successo! Il record è stato rimosso dal database.
					{:else}
						✓ Carta cancellata e formattata con successo! I dati sono stati rimossi dalla carta e
						dal database.
					{/if}
				</div>
				<Button href={data.backHref} data-tutorial="flow.return">Torna indietro</Button>
			{/if}
		</div>
	</div>
</div>

<ConfirmDialog
	bind:open={confirmationOpen}
	title={pendingDeleteMode === 'hard'
		? 'Conferma cancellazione e formattazione'
		: 'Conferma cancellazione'}
	confirmLabel={pendingDeleteMode === 'hard' ? 'Cancella e formatta' : 'Cancella tessera'}
	variant="destructive"
	tutorialDescription="Conferma la rimozione della tessera dal database e, se scelta, anche dalla card fisica."
	onConfirm={confirmDelete}
>
	<div class="space-y-2 text-sm">
		<p>
			Vuoi cancellare la tessera
			<code class="rounded bg-muted px-1.5 py-0.5 font-mono">{data.card.uid}</code>?
		</p>
		<p class="text-muted-foreground">
			{#if pendingDeleteMode === 'hard'}
				I dati verranno rimossi anche dalla card fisica tramite il writer.
			{:else}
				La card fisica non verrà modificata.
			{/if}
		</p>
	</div>
</ConfirmDialog>
