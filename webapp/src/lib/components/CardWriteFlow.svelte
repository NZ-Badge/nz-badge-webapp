<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import CardStatusBadge from '$lib/components/CardStatusBadge.svelte';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import type { WebSerialCardWriter } from '$lib/utils/webserial';
	import { connection } from '$lib/stores/webserial.svelte';
	import {
		errorMessage,
		eraseCardFlow,
		isUnknownKeyFailure,
		lookupCard,
		requestWriteSession,
		validateCardWrite,
		type CardLookupResult,
		type CardUidConflict,
		type WriteSession
	} from '$lib/services/card-client';

	type FlowData = {
		ownerType: 'subscriber' | 'user';
		ownerLabel: string;
		backHref: string;
		backLabel: string;
		subscriber: { id: number; firstName: string; lastName: string; email: string | null };
	};

	let { data }: { data: FlowData } = $props();

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

	const PROGRESS_STEPS = [
		{ step: 'connect', label: 'Connetti' },
		{ step: 'start', label: 'Pronto' },
		{ step: 'writing', label: 'Scrittura' },
		{ step: 'result', label: 'Fatto' }
	] as const;

	const serialSupported = browser && 'serial' in navigator;
	const ownerName = $derived(`${data.subscriber.firstName} ${data.subscriber.lastName}`.trim());

	let WriterClass: typeof WebSerialCardWriter | null = null;
	let writer: WebSerialCardWriter | null = null;

	if (browser) {
		import('$lib/utils/webserial').then((m) => {
			WriterClass = m.WebSerialCardWriter;
		});
	}

	let step = $state<Step>(connection.state === 'connected' ? 'start' : 'connect');
	// Prima di avviare la procedura, "Connetti" e "Pronto" seguono lo stato della connessione.
	const view = $derived.by<Step>(() => {
		const connected = connection.state === 'connected';
		if (step === 'start' && !connected) return 'connect';
		if (step === 'connect' && connected) return 'start';
		return step;
	});
	let errorText = $state<string | null>(null);
	let resultUid = $state<string | null>(null);
	let isLoading = $state(false);

	// Stato per il flusso "carta non blank"
	let nonBlankUid = $state<string | null>(null);
	let cardInfo = $state<CardLookupResult | null>(null);
	let deletedHistoryRequiresErase = $state(false);
	// Sessione di scrittura salvata per il retry automatico dopo l'erase
	let writeSession = $state<WriteSession | null>(null);

	const progressIndex = $derived(PROGRESS_STEPS.findIndex((s) => s.step === view));

	const owner = $derived({ type: data.ownerType, id: data.subscriber.id });

	function resetConflictState() {
		nonBlankUid = null;
		cardInfo = null;
		deletedHistoryRequiresErase = false;
	}

	async function showCardConflict(
		uid: string,
		requiresErase: boolean,
		fallbackStep: Step = 'card_not_blank'
	) {
		nonBlankUid = uid;
		cardInfo = await lookupCard(uid);
		deletedHistoryRequiresErase = requiresErase;

		if (cardInfo?.found && cardInfo.card) {
			step = cardInfo.card.status === 'deleted' ? 'deleted_history' : 'already_assigned';
			return;
		}
		step = fallbackStep;
	}

	const conflictStep = (conflict: CardUidConflict): Step =>
		conflict === 'UID_IN_DELETED_HISTORY' ? 'deleted_history' : 'already_assigned';

	// Invia write_card (MIFARE) o scan_card (solo UID) al firmware e conferma nel DB.
	async function doWrite(session: WriteSession) {
		if (!writer) throw new Error('Porta seriale non connessa');

		let uid: string;
		if (session.use_mifare) {
			if (!session.key_a || !session.key_b) {
				throw new Error('Chiavi MIFARE mancanti per la sessione di scrittura');
			}
			const response = await writer.writeCard({
				user_id: data.subscriber.id,
				name: ownerName,
				sector: session.sector,
				key_a: session.key_a,
				key_b: session.key_b,
				timestamp: new Date().toISOString()
			});

			if (response.message === 'card_not_blank') {
				// Carta non blank: se esiste nel DB distingui "abbinata" da "storico cancellate".
				if (response.uid) await showCardConflict(response.uid, true);
				else step = 'card_not_blank';
				return;
			}
			if (response.status !== 'success') {
				throw new Error(response.message || 'Scrittura non riuscita');
			}
			uid = response.uid ?? 'unknown';
		} else {
			const response = await writer.scanCard();
			if (response.status === 'timeout') {
				throw new Error('Nessuna carta rilevata. Avvicina la card al lettore e riprova.');
			}
			if (response.status !== 'success' || !response.uid) {
				throw new Error(response.message || 'Scansione carta fallita');
			}
			uid = response.uid;
		}

		const validation = await validateCardWrite(session.session_token, uid);
		if (!validation.ok) {
			await showCardConflict(uid, false, conflictStep(validation.conflict));
			return;
		}

		resultUid = uid;
		step = 'result';
	}

	/** Esegue un passaggio della procedura gestendo attesa ed errori in un solo punto. */
	async function run(progress: Step, onError: Step, fallback: string, task: () => Promise<void>) {
		isLoading = true;
		errorText = null;
		step = progress;
		try {
			await task();
		} catch (err) {
			errorText = errorMessage(err, fallback);
			step = onError;
		} finally {
			isLoading = false;
		}
	}

	async function writeAgain() {
		writeSession ??= await requestWriteSession(owner);
		step = 'writing';
		await doWrite(writeSession);
	}

	function handleWrite() {
		if (!WriterClass) return;
		const Writer = WriterClass;
		resetConflictState();
		return run('writing', 'start', 'Scrittura non riuscita', async () => {
			writer = new Writer();
			await writer.connect(connection.port ?? undefined);
			writeSession = await requestWriteSession(owner);
			await doWrite(writeSession);
		});
	}

	// Carta registrata: cancellazione con le chiavi del DB (ritenta con force erase), poi
	// la carta è ancora sul lettore e vuota, quindi si riprova subito la scrittura.
	function handleErase() {
		const card = cardInfo?.card;
		if (!card || !nonBlankUid) return;
		return run('erasing', 'card_not_blank', 'Cancellazione non riuscita', async () => {
			if (!writer) throw new Error('Porta seriale non connessa');
			await eraseCardFlow(writer, card.id);
			await writeAgain();
		});
	}

	// Carta sconosciuta: il firmware prova le chiavi MIFARE comuni.
	function handleForceErase() {
		return run(
			'force_erasing',
			'card_not_blank',
			'Cancellazione forzata non riuscita',
			async () => {
				if (!writer) throw new Error('Porta seriale non connessa');
				const response = await writer.forceEraseCard({ sector: writeSession?.sector ?? 4 });
				if (response.status !== 'success') {
					// Autenticazione fallita con tutte le chiavi note → carta irrecuperabile
					if (isUnknownKeyFailure(response.message)) {
						step = 'unrecoverable';
						return;
					}
					throw new Error(response.message || 'Cancellazione forzata non riuscita');
				}
				await writeAgain();
			}
		);
	}

	function handleDeletedHistoryContinue() {
		if (deletedHistoryRequiresErase) return handleErase();

		const session = writeSession;
		const uid = nonBlankUid;
		if (!session || !uid) return;

		return run('writing', 'deleted_history', 'Aggiornamento tessera non riuscito', async () => {
			const validation = await validateCardWrite(session.session_token, uid, {
				allowReuseDeleted: true
			});
			if (!validation.ok) throw new Error('Impossibile aggiornare la tessera nel database');
			resultUid = uid;
			resetConflictState();
			step = 'result';
		});
	}

	function handleCancelErase() {
		step = connection.state === 'connected' ? 'start' : 'connect';
		resetConflictState();
		writeSession = null;
		errorText = null;
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
		title="Scrivi tessera"
		description="Collega il lettore USB e segui le istruzioni per associare una tessera alla persona."
	/>

	<div class="space-y-4 rounded-lg border bg-card p-6">
		<p class="text-muted-foreground">
			{data.ownerLabel}: <strong class="text-foreground">{ownerName}</strong>
		</p>

		{#if !serialSupported}
			<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
				WebSerial API richiede Chrome o Edge (desktop).
			</div>
		{:else}
			<ol class="flex gap-2 text-xs text-muted-foreground" aria-label="Avanzamento">
				{#each PROGRESS_STEPS as item, i (item.step)}
					<li
						class:text-blue-600={i <= progressIndex}
						class:font-semibold={i === progressIndex}
						aria-current={i === progressIndex ? 'step' : undefined}
					>
						{i + 1}. {item.label}{#if i < PROGRESS_STEPS.length - 1}<span
								class="ml-2"
								aria-hidden="true">→</span
							>{/if}
					</li>
				{/each}
			</ol>

			{#if errorText}
				<div
					class="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
					role="alert"
				>
					{errorText}
				</div>
			{/if}

			<div aria-live="polite" class="space-y-4">
				{#if view === 'connect'}
					<p class="text-sm text-muted-foreground">
						Connetti il dispositivo usando il pulsante nella toolbar in alto.
					</p>
				{:else if view === 'start'}
					<p class="text-sm">
						Dispositivo connesso. Avvicina la tessera RFID al writer e fai clic su "Scrivi tessera".
					</p>
					<Button onclick={handleWrite} disabled={isLoading} data-tutorial="card.write"
						>Scrivi tessera</Button
					>
				{:else if view === 'writing'}
					<p class="text-sm text-muted-foreground">
						{writeSession && !writeSession.use_mifare
							? 'Avvicina la card al lettore...'
							: 'Scrittura sulla tessera in corso... mantieni il badge fermo.'}
					</p>
					<div class="h-2 animate-pulse rounded bg-blue-100"></div>
				{:else if view === 'card_not_blank'}
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
							<Button
								onclick={handleForceErase}
								disabled={isLoading}
								variant="destructive"
								data-tutorial="card.force-erase"
							>
								{isLoading ? 'Cancellazione...' : 'Forza cancellazione'}
							</Button>
							<Button
								variant="outline"
								onclick={handleCancelErase}
								disabled={isLoading}
								data-tutorial="dialog.cancel"
							>
								Annulla
							</Button>
						</div>
					</div>
				{:else if view === 'deleted_history' || view === 'already_assigned'}
					<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
						<p class="mb-3 font-medium text-amber-800">
							Tessera rilevata: <code class="font-mono">{nonBlankUid}</code>
						</p>

						{#if cardInfo?.card}
							<dl class="mb-3 space-y-1 text-amber-900">
								<div class="flex items-center gap-2">
									<dt class="text-amber-800/80">Stato carta nel DB:</dt>
									<dd><CardStatusBadge status={cardInfo.card.status} /></dd>
								</div>
								{#if cardInfo.subscriber}
									<div>
										<dt class="inline text-amber-800/80">Assegnata a:</dt>
										<dd class="ml-1 inline font-medium">
											{cardInfo.subscriber.firstName}
											{cardInfo.subscriber.lastName}
											{#if cardInfo.subscriber.email}
												<span class="font-normal text-amber-800/80">
													— {cardInfo.subscriber.email}</span
												>
											{/if}
										</dd>
									</div>
									{#if cardInfo.subscriber.courseName}
										<div>
											<dt class="inline text-amber-800/80">Corso:</dt>
											<dd class="ml-1 inline">{cardInfo.subscriber.courseName}</dd>
										</div>
									{/if}
								{:else if cardInfo.user}
									<div class="mt-3 rounded bg-card/70 p-3 text-sm">
										<dt class="inline text-muted-foreground">Utente staff:</dt>
										<dd class="ml-1 inline">
											<strong>{cardInfo.user.name}</strong>
											<span class="text-muted-foreground"> — {cardInfo.user.email}</span>
										</dd>
									</div>
								{:else}
									<p class="text-amber-800/80 italic">Nessun titolare associato nel DB.</p>
								{/if}
							</dl>
						{/if}

						{#if view === 'deleted_history'}
							<p class="mb-3 text-amber-800">
								Questa tessera è presente nello <strong>Storico cancellate</strong>. Se continui,
								verrà aggiornata con i dati di <strong>{ownerName}</strong>.
							</p>
							<div class="flex gap-2">
								<Button
									onclick={handleDeletedHistoryContinue}
									disabled={isLoading}
									variant={deletedHistoryRequiresErase ? 'warning' : 'default'}
									data-tutorial={deletedHistoryRequiresErase
										? 'card.erase-rewrite'
										: 'flow.continue'}
								>
									{isLoading
										? 'Aggiornamento...'
										: deletedHistoryRequiresErase
											? 'Cancella e riscrivi'
											: 'Continua'}
								</Button>
								<Button
									variant="outline"
									onclick={handleCancelErase}
									disabled={isLoading}
									data-tutorial="dialog.cancel"
								>
									Annulla
								</Button>
							</div>
						{:else}
							<p class="mb-3 text-amber-800">
								Questa tessera risulta già abbinata a un utente. Non può essere sovrascritta da
								questa schermata.
							</p>
							<Button
								variant="outline"
								onclick={handleCancelErase}
								disabled={isLoading}
								data-tutorial="flow.return"
							>
								Torna indietro
							</Button>
						{/if}
					</div>
				{:else if view === 'erasing'}
					<p class="text-sm text-muted-foreground">Cancellazione carta in corso...</p>
					<div class="h-2 animate-pulse rounded bg-amber-100"></div>
				{:else if view === 'force_erasing'}
					<p class="text-sm text-muted-foreground">
						Cancellazione forzata in corso (provo le chiavi comuni)...
					</p>
					<div class="h-2 animate-pulse rounded bg-red-100"></div>
				{:else if view === 'unrecoverable'}
					<div
						class="space-y-2 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
					>
						<p class="font-medium">Carta non recuperabile</p>
						<p>
							La carta è protetta con una chiave sconosciuta che non rientra nel dizionario MIFARE
							standard. Non è possibile cancellarla né sovrascriverla senza conoscere la chiave
							originale: è una limitazione del protocollo MIFARE Classic, non del software.
						</p>
						<p class="text-red-700">Usa una carta blank diversa per questo titolare.</p>
					</div>
					<Button variant="outline" onclick={handleCancelErase} data-tutorial="flow.return"
						>Torna indietro</Button
					>
				{:else if view === 'result'}
					<div class="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
						✓ Tessera scritta con successo.<br />
						UID: <code class="font-mono">{resultUid}</code>
					</div>
					<Button variant="outline" href={data.backHref} data-tutorial="flow.return"
						>Torna a {data.backLabel}</Button
					>
				{/if}
			</div>
		{/if}
	</div>
</div>
