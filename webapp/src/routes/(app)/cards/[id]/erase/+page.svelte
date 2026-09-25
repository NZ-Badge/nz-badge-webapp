<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import type { WebSerialCardWriter } from '$lib/utils/webserial';
	import { connection } from '$lib/stores/webserial.svelte';

	let { data } = $props();

	let WriterClass: typeof WebSerialCardWriter | null = null;
	let writer: WebSerialCardWriter | null = null;

	type Step = 'choose' | 'connect' | 'ready' | 'erasing' | 'deleting' | 'done';
	let step = $state<Step>('choose');
	let errorMessage = $state<string | null>(null);
	let isLoading = $state(false);
	let deleteMode = $state<'soft' | 'hard' | null>(null);
	let confirmationOpen = $state(false);
	let pendingDeleteMode = $state<'soft' | 'hard' | null>(null);

	const serialSupported = browser && 'serial' in navigator;

	if (browser) {
		import('$lib/utils/webserial').then((m) => {
			WriterClass = m.WebSerialCardWriter;
			// Se già connesso, inizializza subito il writer con la porta condivisa
			if (connection.state === 'connected' && connection.port) {
				writer = new m.WebSerialCardWriter();
				writer.connect(connection.port);
			}
		});
	}

	$effect(() => {
		if (deleteMode === 'hard') {
			if (connection.state === 'connected' && step === 'connect') step = 'ready';
			if (connection.state !== 'connected' && step === 'ready') step = 'connect';
		}
	});

	function chooseSoftDelete() {
		pendingDeleteMode = 'soft';
		confirmationOpen = true;
	}

	function confirmDelete() {
		if (!pendingDeleteMode || isLoading) return;
		const mode = pendingDeleteMode;
		confirmationOpen = false;
		pendingDeleteMode = null;
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

	async function handleSoftDelete() {
		isLoading = true;
		errorMessage = null;
		step = 'deleting';

		try {
			// Solo cancellazione logica dal DB
			const res = await fetch(`/api/v1/card/${data.card.id}/delete`, {
				method: 'POST',
				credentials: 'include'
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? 'Cancellazione fallita');
			}
			step = 'done';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Operazione fallita';
			step = 'choose';
		} finally {
			isLoading = false;
		}
	}

	async function handleErase() {
		if (!WriterClass) return;
		if (!writer) {
			writer = new WriterClass();
			await writer.connect(connection.port ?? undefined);
		}
		isLoading = true;
		errorMessage = null;
		step = 'erasing';

		try {
			// Passo 1: ottieni autorizzazione dal server (chiavi per sbloccare il settore)
			const authRes = await fetch(`/api/v1/card/${data.card.id}/erase`, {
				method: 'POST',
				credentials: 'include'
			});
			if (!authRes.ok) {
				const body = await authRes.json().catch(() => ({}));
				throw new Error(body.error ?? 'Autorizzazione cancellazione fallita');
			}
			const { session_token, erase_data } = (await authRes.json()).data;

			// Passo 2: invia comando di cancellazione al dispositivo via WebSerial
			let eraseResponse = await writer.eraseCard({
				sector: erase_data.sector,
				key_a: erase_data.key_a
			});

			// Se l'autenticazione fallisce (es. carta già resettata a chiavi factory FFFFFFFFFFFF),
			// ritenta con force erase che prova le chiavi comuni inclusa FFFFFFFFFFFF
			if (
				eraseResponse.status !== 'success' &&
				eraseResponse.message?.toLowerCase().includes('authentication')
			) {
				eraseResponse = await writer.forceEraseCard({ sector: erase_data.sector });
			}

			if (eraseResponse.status !== 'success') {
				throw new Error(eraseResponse.message || 'Cancellazione hardware fallita');
			}

			// Passo 3: conferma cancellazione nel DB
			const confirmRes = await fetch(`/api/v1/card/${data.card.id}/erase/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_token }),
				credentials: 'include'
			});
			if (!confirmRes.ok) {
				const body = await confirmRes.json().catch(() => ({}));
				throw new Error(body.error ?? 'Conferma nel database fallita');
			}

			step = 'done';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Operazione fallita';
			step = 'ready';
		} finally {
			isLoading = false;
		}
	}

	onDestroy(() => {
		writer = null;
	});
</script>

<div class="mx-auto max-w-lg space-y-6">
	<a href={data.backHref} class="app-link-muted text-sm">← {data.backLabel}</a>
	<PageHeader
		title="Cancella tessera"
		description="Questa operazione rimuove i dati dalla tessera. Verifica l’intestatario prima di procedere e segui le istruzioni del lettore."
	/>

	<div class="space-y-4 rounded-lg border bg-white p-6">
		<!-- Info carta -->
		<div class="space-y-1 text-sm">
			<p>
				Carta: <code class="rounded bg-gray-100 px-1 font-mono">{data.card.uid}</code>
			</p>
			{#if data.card.subscriberFirstName}
				<p>
					Abbinata a: <strong>{data.card.subscriberFirstName} {data.card.subscriberLastName}</strong
					>
				</p>
			{:else if data.card.userName}
				<p class="text-sm text-gray-500">Abbinata a: <strong>{data.card.userName}</strong></p>
			{/if}
		</div>

		{#if errorMessage}
			<div class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				{errorMessage}
			</div>
		{/if}

		{#if step === 'choose'}
			<div class="space-y-4">
				{#if data.use_mifare}
					<p class="text-sm text-gray-600">
						Scegli come procedere con la cancellazione della carta:
					</p>

					<div class="grid gap-4 sm:grid-cols-2">
						<!-- Soft delete -->
						<div class="rounded border p-4 space-y-3">
							<div>
								<h3 class="font-semibold text-sm">Cancella</h3>
								<p class="text-xs text-gray-500 mt-1">
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

						<!-- Hard delete (MIFARE) -->
						<div class="rounded border border-red-200 bg-red-50 p-4 space-y-3">
							<div>
								<h3 class="font-semibold text-sm text-red-900">Cancella e Formatta</h3>
								<p class="text-xs text-red-700 mt-1">
									Cancella i dati fisicamente dalla carta RFID e rimuove il record. Richiede il
									dispositivo writer.
								</p>
							</div>
							<Button
								onclick={chooseHardDelete}
								disabled={isLoading}
								variant="destructive"
								class="w-full"
							>
								Cancella e Formatta
							</Button>
						</div>
					</div>
				{:else}
					<!-- Modalità UID-only: solo soft-delete disponibile -->
					<p class="text-sm text-gray-600">
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

				{#if data.use_mifare}
					<Button
						href={data.backHref}
						variant="outline"
						class="w-full"
						data-tutorial-title="Annulla cancellazione"
						data-tutorial-description="Torna alla pagina precedente senza cancellare la tessera."
						>Annulla</Button
					>
				{/if}
			</div>
		{:else if step === 'connect'}
			{#if !serialSupported}
				<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					WebSerial API richiede Chrome o Edge (desktop). Questa funzione non è disponibile nel
					browser corrente.
				</div>
			{:else}
				<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					<strong>Connessione richiesta:</strong> Connetti il dispositivo writer usando il pulsante nella
					toolbar in alto per procedere con la cancellazione fisica.
				</div>
				<a href={data.backHref}>
					<Button variant="outline">Annulla</Button>
				</a>
			{/if}
		{:else if step === 'ready'}
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
				<Button onclick={() => (step = 'choose')} variant="outline">Indietro</Button>
			</div>
		{:else if step === 'deleting'}
			<p class="text-sm text-gray-600">Cancellazione in corso...</p>
			<div class="h-2 animate-pulse rounded bg-amber-100"></div>
		{:else if step === 'erasing'}
			<p class="text-sm text-gray-600">
				Cancellazione fisica in corso... mantenere la carta ferma.
			</p>
			<div class="h-2 animate-pulse rounded bg-red-100"></div>
		{:else if step === 'done'}
			<div class="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
				{#if deleteMode === 'soft'}
					✓ Carta cancellata con successo! Il record è stato rimosso dal database.
				{:else}
					✓ Carta cancellata e formattata con successo! I dati sono stati rimossi dalla carta e dal
					database.
				{/if}
			</div>
			<Button onclick={() => goto(data.backHref)}>Torna indietro</Button>
		{/if}
	</div>
</div>

<Dialog bind:open={confirmationOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>
				{pendingDeleteMode === 'hard'
					? 'Conferma cancellazione e formattazione'
					: 'Conferma cancellazione'}
			</DialogTitle>
		</DialogHeader>
		<div class="space-y-2 text-sm">
			<p>
				Vuoi cancellare la tessera
				<code class="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800"
					>{data.card.uid}</code
				>?
			</p>
			<p class="text-muted-foreground">
				{#if pendingDeleteMode === 'hard'}
					I dati verranno rimossi anche dalla card fisica tramite il writer.
				{:else}
					La card fisica non verrà modificata.
				{/if}
			</p>
		</div>
		<DialogFooter class="flex-row">
			<Button
				variant="outline"
				class="min-w-0 flex-1"
				onclick={() => (confirmationOpen = false)}
				data-tutorial-title="Annulla cancellazione"
				data-tutorial-description="Chiude la conferma senza cancellare la tessera.">Annulla</Button
			>
			<Button
				variant="destructive"
				class="min-w-0 flex-1"
				onclick={confirmDelete}
				data-tutorial-title="Conferma cancellazione"
				data-tutorial-description="Conferma la rimozione della tessera dal database e, se scelta, anche dalla card fisica."
			>
				{pendingDeleteMode === 'hard' ? 'Cancella e formatta' : 'Cancella tessera'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
