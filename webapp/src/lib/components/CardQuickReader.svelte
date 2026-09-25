<script lang="ts">
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import type { ReadCardResponse, WebSerialDiagnostic } from '$lib/utils/webserial-diagnostic';
	import { connection } from '$lib/stores/webserial.svelte';
	import CardStatusBadge from '$lib/components/CardStatusBadge.svelte';
	import { subscriberStatus, USER_ROLE_LABEL } from '$lib/labels';
	import { errorMessage, lookupCard, type CardLookupResult } from '$lib/services/card-client';

	type DiagnosticCtor = new () => WebSerialDiagnostic;

	let {
		title = 'Leggi card',
		description = 'Avvicina il badge al lettore per una lettura rapida.',
		showLog = false,
		showDiagnosticsLink = false,
		stretch = false
	}: {
		title?: string;
		description?: string;
		showLog?: boolean;
		showDiagnosticsLink?: boolean;
		stretch?: boolean;
	} = $props();

	let DiagnosticClass = $state<DiagnosticCtor | null>(null);
	let diagnostic: WebSerialDiagnostic | null = null;

	if (browser) {
		import('$lib/utils/webserial-diagnostic').then((m) => {
			DiagnosticClass = m.WebSerialDiagnostic as DiagnosticCtor;
		});
	}

	const serialSupported = browser && 'serial' in navigator;

	let loading = $state(false);
	let logSeq = 0;
	let logLines = $state<Array<{ id: number; time: string; text: string }>>([]);
	let cardResult = $state<CardLookupResult | null>(null);
	let logContainer = $state<HTMLElement | null>(null);
	let diagnosticError = $state<string | null>(null);

	$effect(() => {
		if (showLog && logLines.length > 0 && logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	});

	// Una connessione diagnostica per porta: si apre quando il writer è connesso e si chiude
	// (con i listener) quando la porta cambia, si disconnette o il componente viene smontato.
	$effect(() => {
		const port = connection.state === 'connected' ? connection.port : null;
		const Diagnostic = DiagnosticClass;
		if (!port || !Diagnostic) return;

		const instance = new Diagnostic();
		let disposed = false;
		let stopLog = () => {};
		untrack(() => (diagnosticError = null));

		instance
			.connect(port)
			.then(() => {
				if (disposed) return;
				diagnostic = instance;
				stopLog = instance.onLogLine((line) => {
					const time = new Date().toLocaleTimeString('it-IT');
					logLines = [...logLines.slice(-499), { id: logSeq++, time, text: line }];
				});
			})
			.catch((err: unknown) => {
				if (!disposed) diagnosticError = errorMessage(err, 'Connessione al dispositivo fallita');
			});

		return () => {
			disposed = true;
			stopLog();
			if (diagnostic === instance) diagnostic = null;
			void instance.disconnect();
		};
	});

	async function readCard() {
		if (!diagnostic) return;

		loading = true;
		cardResult = null;

		try {
			const response: ReadCardResponse = await diagnostic.readCard();

			if (response.status === 'success' && response.uid) {
				cardResult = (await lookupCard(response.uid)) ?? {
					found: false,
					error: 'Ricerca della tessera non riuscita'
				};
			} else {
				cardResult = { found: false, error: response.message };
			}
		} catch (err) {
			cardResult = {
				found: false,
				error: errorMessage(err, 'Errore imprevisto')
			};
		} finally {
			loading = false;
		}
	}

	function clearLog() {
		logLines = [];
	}
</script>

{#if !serialSupported}
	<div class="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
		WebSerial API richiede Chrome o Edge (desktop). Questa funzionalita' non e' disponibile nel
		browser corrente.
	</div>
{:else}
	{#if diagnosticError}
		<div class="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
			<strong>Errore connessione dispositivo:</strong>
			{diagnosticError}
			<span class="ml-2 text-red-600">
				La porta seriale potrebbe essere bloccata da un'altra scheda. Prova a scollegare e
				ricollegare il dispositivo.
			</span>
		</div>
	{/if}

	{#if connection.state === 'connected'}
		<div class={showLog ? 'grid gap-6 lg:grid-cols-2' : 'h-full'}>
			<Card class={stretch ? 'h-full' : ''}>
				<CardHeader>
					<div class="flex items-start justify-between gap-4">
						<div class="space-y-1">
							<CardTitle>{title}</CardTitle>
							<CardDescription>{description}</CardDescription>
						</div>
						{#if showDiagnosticsLink}
							<Button
								href="/card-diagnostics"
								variant="outline"
								size="sm"
								class="shrink-0"
								data-tutorial="card.open-diagnostics">Apri diagnostica</Button
							>
						{/if}
					</div>
				</CardHeader>
				<CardContent class={stretch ? 'flex h-full flex-col space-y-4' : 'space-y-4'}>
					<Button onclick={readCard} disabled={loading} data-tutorial="card.read">
						{loading ? 'Lettura in corso...' : 'Leggi carta'}
					</Button>

					{#if loading}
						<div class="space-y-2">
							<div class="text-sm text-muted-foreground">Avvicinare la card al lettore</div>
							<div class="h-1.5 animate-pulse rounded bg-blue-100"></div>
						</div>
					{/if}

					{#if cardResult !== null}
						<div class="rounded border p-4 text-sm" aria-live="polite">
							{#if cardResult.error}
								<div class="text-red-600">{cardResult.error}</div>
							{:else if cardResult.found && cardResult.card}
								<div class="space-y-2">
									<div>
										<span class="text-muted-foreground">UID:</span>
										<strong class="ml-1 font-mono">{cardResult.card.uid}</strong>
									</div>
									<div class="flex items-center gap-2">
										<span class="text-muted-foreground">Stato card:</span>
										<CardStatusBadge status={cardResult.card.status} />
									</div>
									{#if cardResult.subscriber}
										<div class="mt-3 border-t pt-3">
											<div class="font-medium">
												{cardResult.subscriber.firstName}
												{cardResult.subscriber.lastName}
											</div>
											{#if cardResult.subscriber.email}
												<div class="text-muted-foreground">{cardResult.subscriber.email}</div>
											{/if}
											{#if cardResult.subscriber.courseName}
												<div class="mt-1 text-xs text-muted-foreground">
													Corso: {cardResult.subscriber.courseName}
												</div>
											{/if}
											<div class="mt-1">
												<Badge variant={subscriberStatus(cardResult.subscriber.status).variant}>
													Iscritto: {subscriberStatus(
														cardResult.subscriber.status
													).label.toLowerCase()}
												</Badge>
											</div>
										</div>
									{:else if cardResult.user}
										<div class="mt-3 border-t pt-3">
											<div class="font-medium">{cardResult.user.name}</div>
											<div class="text-muted-foreground">{cardResult.user.email}</div>
											<div class="mt-1 text-xs text-muted-foreground">
												Utente staff · {USER_ROLE_LABEL[cardResult.user.role] ??
													cardResult.user.role}
											</div>
										</div>
									{:else}
										<div class="mt-2 text-muted-foreground italic">Nessun titolare associato</div>
									{/if}
								</div>
							{:else}
								<div class="text-muted-foreground">Card non riconosciuta nel sistema</div>
							{/if}
						</div>
					{/if}
				</CardContent>
			</Card>

			{#if showLog}
				<Card>
					<CardHeader>
						<div class="flex items-center justify-between gap-4">
							<CardTitle>Log seriale</CardTitle>
							<Button variant="ghost" size="sm" onclick={clearLog} data-tutorial="card.clear-log">
								Pulisci log
							</Button>
						</div>
					</CardHeader>
					<CardContent>
						<div
							bind:this={logContainer}
							class="max-h-96 overflow-y-auto rounded bg-slate-900 p-3 font-mono text-xs text-green-400"
						>
							{#if logLines.length === 0}
								<div class="text-slate-500 italic">In attesa di dati dal dispositivo...</div>
							{:else}
								{#each logLines as entry (entry.id)}
									<div>
										<span class="text-slate-500">{entry.time}</span>
										{' '}
										{entry.text}
									</div>
								{/each}
							{/if}
						</div>
					</CardContent>
				</Card>
			{/if}
		</div>
	{:else}
		<Card class={stretch ? 'h-full' : ''}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-4">
				<div
					class="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-8 text-center"
				>
					<h3 class="mb-2 text-base font-semibold text-slate-700">Dispositivo non connesso</h3>
					<p class="text-sm text-slate-500">
						Connetti il Writer Station via USB usando il pulsante nella toolbar in alto.
					</p>
				</div>
			</CardContent>
		</Card>
	{/if}
{/if}
