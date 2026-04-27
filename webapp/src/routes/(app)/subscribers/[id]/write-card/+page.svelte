<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import type { WebSerialCardWriter } from '$lib/utils/webserial';
	import { connection } from '$lib/stores/webserial.svelte';

	let { data } = $props();

	// Importa WebSerialCardWriter solo client-side
	let WriterClass: typeof WebSerialCardWriter | null = null;
	let writer: WebSerialCardWriter | null = null;

	// Stato macchina a passi
	type Step =
		| 'connect'
		| 'start'
		| 'writing'
		| 'card_not_blank'
		| 'deleted_history'
		| 'already_assigned'
		| 'erasing'
		| 'force_erasing'
		| 'unrecoverable'
		| 'result';
	let step = $state<Step>(connection.state === 'connected' ? 'start' : 'connect');
	let errorMessage = $state<string | null>(null);
	let resultUid = $state<string | null>(null);
	let isLoading = $state(false);

	// Stato per il flusso "carta non blank"
	type CardInfo = {
		found: boolean;
		card?: {
			id: number;
			uid: string;
			status: string;
			sector: number | null;
			deletedAt?: string | null;
		};
		subscriber?: {
			id: number;
			firstName: string;
			lastName: string;
			email: string | null;
			courseName: string | null;
			status: string;
		} | null;
	};
	let nonBlankUid = $state<string | null>(null);
	let cardInfo = $state<CardInfo | null>(null);
	let deletedHistoryRequiresErase = $state(false);
	// Sessione di scrittura salvata per il retry automatico dopo l'erase
	let writeSession = $state<{
		session_token: string;
		key_a: string | null;
		key_b: string | null;
		sector: number;
		use_mifare: boolean;
	} | null>(null);

	const serialSupported = browser && 'serial' in navigator;

	if (browser) {
		import('$lib/utils/webserial').then((m) => {
			WriterClass = m.WebSerialCardWriter;
		});
	}

	$effect(() => {
		if (connection.state === 'connected' && step === 'connect') step = 'start';
		if (connection.state !== 'connected' && step === 'start') step = 'connect';
	});

	// Ottiene la sessione di scrittura dal server (step 1 del protocollo)
	async function fetchWriteSession() {
		const authRes = await fetch('/api/v1/card/write', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ subscriber_id: data.subscriber.id }),
			credentials: 'include'
		});
		if (!authRes.ok) throw new Error('Impossibile ottenere l’autorizzazione di scrittura');
		const { session_token, key_a, key_b, sector, use_mifare } = (await authRes.json()).data;
		return { session_token, key_a, key_b, sector: sector ?? 4, use_mifare: use_mifare ?? true };
	}

	async function lookupCardInfo(uid: string): Promise<CardInfo | null> {
		const res = await fetch(`/api/v1/card/lookup?uid=${encodeURIComponent(uid)}`);
		if (!res.ok) return null;

		const json = await res.json();
		return (json.data ?? json) as CardInfo;
	}

	function resetConflictState() {
		nonBlankUid = null;
		cardInfo = null;
		deletedHistoryRequiresErase = false;
	}

	async function showCardConflict(
		uid: string,
		requiresErase: boolean,
		fallbackStep: 'card_not_blank' | 'deleted_history' | 'already_assigned' = 'card_not_blank'
	) {
		nonBlankUid = uid;
		cardInfo = await lookupCardInfo(uid);
		deletedHistoryRequiresErase = requiresErase;

		if (cardInfo?.found && cardInfo.card) {
			step = cardInfo.card.status === 'deleted' ? 'deleted_history' : 'already_assigned';
			return;
		}

		step = fallbackStep;
	}

	// Invia il comando write_card (MIFARE) o scan_card (UID-only) al firmware e gestisce la risposta
	async function doWrite(session: typeof writeSession) {
		if (!session || !writer) throw new Error('Sessione o writer non disponibili');

		let uid: string;

		if (session.use_mifare) {
			// Modalità MIFARE: scrivi dati sul settore della carta
			const writeResponse = await writer.writeCard({
				user_id: data.subscriber.id,
				name: `${data.subscriber.firstName} ${data.subscriber.lastName}`,
				sector: session.sector,
				key_a: session.key_a,
				key_b: session.key_b,
				timestamp: new Date().toISOString()
			});

			if (writeResponse.message === 'card_not_blank') {
				// Carta non blank: se esiste nel DB distingui "abbinata" da "storico cancellate".
				if (writeResponse.uid) {
					await showCardConflict(writeResponse.uid, true);
					return;
				}
				step = 'card_not_blank';
				return;
			}

			if (writeResponse.status !== 'success') {
				throw new Error(writeResponse.message || 'Scrittura non riuscita');
			}

			uid = writeResponse.uid ?? 'unknown';
		} else {
			// Modalità UID-only: leggi solo l'UID della carta senza scrivere dati MIFARE
			const scanResponse = await writer.scanCard();
			if (scanResponse.status === 'timeout') {
				throw new Error('Nessuna carta rilevata. Avvicina la card al lettore e riprova.');
			}
			if (scanResponse.status !== 'success' || !scanResponse.uid) {
				throw new Error(scanResponse.message || 'Scansione carta fallita');
			}
			uid = scanResponse.uid;
		}

		// Step 3 del protocollo: conferma scrittura nel DB
		const validateRes = await fetch('/api/v1/card/validate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ session_token: session.session_token, uid }),
			credentials: 'include'
		});
		if (!validateRes.ok) {
			let body: { error?: string; details?: { code?: string } } | null = null;
			try {
				body = await validateRes.json();
			} catch {
				body = null;
			}

			const conflictCode = body?.details?.code;
			if (
				validateRes.status === 409 &&
				(conflictCode === 'UID_IN_DELETED_HISTORY' || conflictCode === 'UID_ALREADY_EXISTS')
			) {
				await showCardConflict(
					uid,
					false,
					conflictCode === 'UID_IN_DELETED_HISTORY' ? 'deleted_history' : 'already_assigned'
				);
				return;
			}

			throw new Error(body?.error ?? 'Impossibile confermare la tessera nel database');
		}

		resultUid = uid;
		step = 'result';
	}

	async function handleWrite() {
		if (!WriterClass) return;
		isLoading = true;
		errorMessage = null;
		resetConflictState();
		step = 'writing';

		try {
			writer = new WriterClass();
			await writer.connect(connection.port ?? undefined);
			writeSession = await fetchWriteSession();
			await doWrite(writeSession);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Scrittura non riuscita';
			step = 'start';
		} finally {
			isLoading = false;
		}
	}

	async function handleErase() {
		if (!cardInfo?.card || !nonBlankUid) return;
		isLoading = true;
		errorMessage = null;
		step = 'erasing';

		try {
			// Step 1: ottieni sessione erase (include key_a corrente dal DB)
			const eraseAuthRes = await fetch(`/api/v1/card/${cardInfo.card.id}/erase`, {
				method: 'POST',
				credentials: 'include'
			});
			if (!eraseAuthRes.ok)
				throw new Error('Impossibile ottenere l’autorizzazione alla cancellazione');
			const { session_token: eraseToken, erase_data } = (await eraseAuthRes.json()).data;

			// Step 2: invia erase_card al firmware
			if (!writer) throw new Error('Porta seriale non connessa');
			const eraseResponse = await writer.eraseCard({
				sector: erase_data.sector,
				key_a: erase_data.key_a
			});
			if (eraseResponse.status !== 'success') {
				throw new Error(eraseResponse.message || 'Cancellazione non riuscita');
			}

			// Step 3: conferma eliminazione dal DB
			const confirmRes = await fetch(`/api/v1/card/${cardInfo.card.id}/erase/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ session_token: eraseToken }),
				credentials: 'include'
			});
			if (!confirmRes.ok) throw new Error('Impossibile confermare la cancellazione nel database');

			// Carta cancellata — procedi automaticamente con la scrittura
			// La carta è ancora sul lettore e ora è blank: riusa la sessione di scrittura
			if (!writeSession) writeSession = await fetchWriteSession();
			step = 'writing';
			await doWrite(writeSession);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Cancellazione non riuscita';
			step = 'card_not_blank';
		} finally {
			isLoading = false;
		}
	}

	async function handleForceErase() {
		isLoading = true;
		errorMessage = null;
		step = 'force_erasing';

		try {
			const sector = writeSession?.sector ?? 4;
			const eraseResponse = await writer!.forceEraseCard({ sector });
			if (eraseResponse.status !== 'success') {
				// Autenticazione fallita con tutte le chiavi note → carta irrecuperabile
				if (eraseResponse.message?.includes('unknown key')) {
					step = 'unrecoverable';
					return;
				}
				throw new Error(eraseResponse.message || 'Cancellazione forzata non riuscita');
			}

			// Carta cancellata — procedi con la scrittura
			if (!writeSession) writeSession = await fetchWriteSession();
			step = 'writing';
			await doWrite(writeSession);
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Cancellazione forzata non riuscita';
			step = 'card_not_blank';
		} finally {
			isLoading = false;
		}
	}

	async function handleDeletedHistoryContinue() {
		if (deletedHistoryRequiresErase) {
			await handleErase();
			return;
		}

		if (!writeSession || !nonBlankUid) return;

		isLoading = true;
		errorMessage = null;
		step = 'writing';

		try {
			const validateRes = await fetch('/api/v1/card/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					session_token: writeSession.session_token,
					uid: nonBlankUid,
					allow_reuse_deleted: true
				}),
				credentials: 'include'
			});

			let body: { error?: string } | null = null;
			try {
				body = await validateRes.json();
			} catch {
				body = null;
			}

			if (!validateRes.ok) {
				throw new Error(body?.error ?? 'Impossibile aggiornare la tessera nel database');
			}

			resultUid = nonBlankUid;
			resetConflictState();
			step = 'result';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Aggiornamento tessera non riuscito';
			step = 'deleted_history';
		} finally {
			isLoading = false;
		}
	}

	function handleCancelErase() {
		step = 'start';
		resetConflictState();
		writeSession = null;
		errorMessage = null;
	}

	onDestroy(() => {
		writer = null;
	});
</script>

<div class="mx-auto max-w-lg space-y-6">
	<div class="flex items-center gap-3">
		<a href="/subscribers" class="text-sm text-gray-500 hover:text-gray-900">← Iscritti</a>
		<h1 class="text-xl font-bold">Scrivi tessera</h1>
	</div>

	<div class="space-y-4 rounded-lg border bg-white p-6">
		<p class="text-gray-600">
			Iscritto: <strong>{data.subscriber.firstName} {data.subscriber.lastName}</strong>
		</p>

		{#if !serialSupported}
			<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
				WebSerial API richiede Chrome o Edge (desktop).
			</div>
		{:else}
			<!-- Indicatore step -->
			<div class="flex gap-2 text-xs text-gray-400">
				{#each ['Connetti', 'Pronto', 'Scrittura', 'Fatto'] as label, i}
					{@const stepIndex = ['connect', 'start', 'writing', 'result'].indexOf(step)}
					<span class:text-blue-600={i <= stepIndex} class:font-semibold={i === stepIndex}>
						{i + 1}. {label}
					</span>
					{#if i < 3}<span>→</span>{/if}
				{/each}
			</div>

			{#if errorMessage}
				<div class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
					{errorMessage}
				</div>
			{/if}

			{#if step === 'connect'}
				<p class="text-sm text-gray-600">
					Connetti il dispositivo usando il pulsante nella toolbar in alto.
				</p>
			{:else if step === 'start'}
				<p class="text-sm">
					Dispositivo connesso. Avvicina la tessera RFID al writer e fai clic su "Scrivi tessera".
				</p>
				<Button onclick={handleWrite} disabled={isLoading}>Scrivi tessera</Button>
			{:else if step === 'writing'}
				{#if writeSession && !writeSession.use_mifare}
					<p class="text-sm text-gray-600">Avvicina la card al lettore...</p>
				{:else}
					<p class="text-sm text-gray-600">
						Scrittura sulla tessera in corso... mantieni il badge fermo.
					</p>
				{/if}
				<div class="h-2 animate-pulse rounded bg-blue-100"></div>
			{:else if step === 'card_not_blank'}
				<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
					<p class="mb-3 font-medium text-amber-800">
						La carta rilevata (UID: <code class="font-mono">{nonBlankUid}</code>) non è blank.
					</p>
					<p class="mb-3 text-amber-800">
						Questa carta non è presente nel database e potrebbe essere stata scritta con un altro
						sistema.
					</p>
					<p class="mb-3 text-sm text-amber-700">
						È possibile tentare la cancellazione forzata: il firmware proverà le chiavi MIFARE più
						comuni. Se la carta usa una chiave non standard, l'operazione fallirà.
					</p>
					<div class="flex gap-2">
						<Button onclick={handleForceErase} disabled={isLoading} variant="destructive">
							{isLoading ? 'Cancellazione...' : 'Forza cancellazione'}
						</Button>
						<Button variant="outline" onclick={handleCancelErase} disabled={isLoading}>
							Annulla
						</Button>
					</div>
				</div>
			{:else if step === 'deleted_history' || step === 'already_assigned'}
				<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
					<p class="mb-3 font-medium text-amber-800">
						Tessera rilevata: <code class="font-mono">{nonBlankUid}</code>
					</p>

					{#if cardInfo?.card}
						<div class="mb-3 space-y-1 text-amber-900">
							<p>
								<span class="text-gray-500">Stato carta nel DB:</span>
								<span class="ml-1 font-medium">{cardInfo.card.status}</span>
							</p>
							{#if cardInfo.subscriber}
								<p>
									<span class="text-gray-500">Assegnata a:</span>
									<span class="ml-1 font-medium">
										{cardInfo.subscriber.firstName}
										{cardInfo.subscriber.lastName}
									</span>
									{#if cardInfo.subscriber.email}
										<span class="text-gray-400"> — {cardInfo.subscriber.email}</span>
									{/if}
								</p>
								{#if cardInfo.subscriber.courseName}
									<p>
										<span class="text-gray-500">Corso:</span>
										<span class="ml-1">{cardInfo.subscriber.courseName}</span>
									</p>
								{/if}
							{:else}
								<p class="text-gray-500 italic">Nessun iscritto associato nel DB.</p>
							{/if}
						</div>
					{/if}

					{#if step === 'deleted_history'}
						<p class="mb-3 text-amber-800">
							Questa tessera è presente nello <strong>Storico cancellate</strong>. Se continui,
							verrà aggiornata con i dati di
							<strong>{data.subscriber.firstName} {data.subscriber.lastName}</strong>.
						</p>
						<div class="flex gap-2">
							<Button onclick={handleDeletedHistoryContinue} disabled={isLoading}>
								{isLoading
									? 'Aggiornamento...'
									: deletedHistoryRequiresErase
										? 'Cancella e riscrivi'
										: 'Continua'}
							</Button>
							<Button variant="outline" onclick={handleCancelErase} disabled={isLoading}>
								Annulla
							</Button>
						</div>
					{:else}
						<p class="mb-3 text-amber-800">
							Questa tessera risulta già abbinata a un utente. Non può essere sovrascritta da questa
							schermata.
						</p>
						<Button variant="outline" onclick={handleCancelErase} disabled={isLoading}>
							Torna indietro
						</Button>
					{/if}
				</div>
			{:else if step === 'erasing'}
				<p class="text-sm text-gray-600">Cancellazione carta in corso...</p>
				<div class="h-2 animate-pulse rounded bg-amber-100"></div>
			{:else if step === 'force_erasing'}
				<p class="text-sm text-gray-600">
					Cancellazione forzata in corso (provo le chiavi comuni)...
				</p>
				<div class="h-2 animate-pulse rounded bg-red-100"></div>
			{:else if step === 'unrecoverable'}
				<div
					class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 space-y-2"
				>
					<p class="font-medium">Carta non recuperabile</p>
					<p>
						La carta è protetta con una chiave sconosciuta che non rientra nel dizionario MIFARE
						standard. Non è possibile cancellarla né sovrascriverla senza conoscere la chiave
						originale — questa è una limitazione del protocollo MIFARE Classic, non del software.
					</p>
					<p class="text-red-700">Usa una carta blank diversa per questo iscritto.</p>
				</div>
				<Button variant="outline" onclick={handleCancelErase}>Torna indietro</Button>
			{:else if step === 'result'}
				<div class="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
					✓ Tessera scritta con successo.<br />
					UID: <code class="font-mono">{resultUid}</code>
				</div>
				<a href="/subscribers">
					<Button variant="outline">Torna agli iscritti</Button>
				</a>
			{/if}
		{/if}
	</div>
</div>
