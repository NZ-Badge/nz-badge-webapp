<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
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

	type DiagnosticCtor = new () => WebSerialDiagnostic;

	type CardLookupResult = {
		found: boolean;
		card?: {
			id: number;
			uid: string;
			status: string;
			writeDate: string | null;
			expirationDate: string | null;
			sector: number | null;
		};
		subscriber?: {
			id: number;
			firstName: string;
			lastName: string;
			email: string | null;
			courseName: string | null;
			status: string;
		} | null;
		error?: string;
	};

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

	$effect(() => {
		if (connection.state === 'connected' && connection.port && DiagnosticClass) {
			if (!diagnostic || !diagnostic.connected) {
				diagnosticError = null;
				diagnostic = new DiagnosticClass();
				diagnostic
					.connect(connection.port)
					.then(() => {
						diagnostic!.onLogLine((line) => {
							const time = new Date().toLocaleTimeString();
							logLines = [...logLines.slice(-499), { id: logSeq++, time, text: line }];
						});
					})
					.catch((err: unknown) => {
						diagnosticError =
							err instanceof Error ? err.message : 'Connessione al dispositivo fallita';
						diagnostic = null;
					});
			}
		} else if (connection.state !== 'connected' && diagnostic) {
			diagnostic.disconnect();
			diagnostic = null;
			diagnosticError = null;
		}
	});

	async function readCard() {
		if (!diagnostic) return;

		loading = true;
		cardResult = null;

		try {
			const response: ReadCardResponse = await diagnostic.readCard();

			if (response.status === 'success' && response.uid) {
				const res = await fetch(`/api/v1/card/lookup?uid=${encodeURIComponent(response.uid)}`);
				const json = await res.json();
				const payload = json.data ?? json;
				cardResult = payload as CardLookupResult;
			} else {
				cardResult = { found: false, error: response.message };
			}
		} catch (err) {
			cardResult = {
				found: false,
				error: err instanceof Error ? err.message : 'Errore imprevisto'
			};
		} finally {
			loading = false;
		}
	}

	function clearLog() {
		logLines = [];
	}

	onDestroy(() => {
		diagnostic?.disconnect();
	});
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
							<a href="/card-diagnostics" class="shrink-0">
								<Button variant="outline" size="sm">Apri diagnostica</Button>
							</a>
						{/if}
					</div>
				</CardHeader>
				<CardContent class={stretch ? 'flex h-full flex-col space-y-4' : 'space-y-4'}>
					<Button onclick={readCard} disabled={loading}>
						{loading ? 'Lettura in corso...' : 'Leggi carta'}
					</Button>

					{#if loading}
						<div class="space-y-2">
							<div class="text-sm text-slate-600">Avvicinare la card al lettore</div>
							<div class="h-1.5 animate-pulse rounded bg-blue-100"></div>
						</div>
					{/if}

					{#if cardResult !== null}
						<div class="rounded border p-4 text-sm">
							{#if cardResult.error}
								<div class="text-red-600">{cardResult.error}</div>
							{:else if cardResult.found && cardResult.card}
								<div class="space-y-2">
									<div>
										<span class="text-gray-500">UID:</span>
										<strong class="ml-1 font-mono">{cardResult.card.uid}</strong>
									</div>
									<div class="flex items-center gap-2">
										<span class="text-gray-500">Stato card:</span>
										<span
											class="rounded-full px-2 py-0.5 text-xs font-medium
											{cardResult.card.status === 'active'
												? 'bg-green-100 text-green-800'
												: cardResult.card.status === 'disabled'
													? 'bg-gray-100 text-gray-700'
													: cardResult.card.status === 'lost'
														? 'bg-red-100 text-red-700'
														: 'bg-yellow-100 text-yellow-800'}"
										>
											{cardResult.card.status}
										</span>
									</div>
									{#if cardResult.subscriber}
										<div class="mt-3 border-t pt-3">
											<div class="font-medium">
												{cardResult.subscriber.firstName}
												{cardResult.subscriber.lastName}
											</div>
											{#if cardResult.subscriber.email}
												<div class="text-gray-500">{cardResult.subscriber.email}</div>
											{/if}
											{#if cardResult.subscriber.courseName}
												<div class="mt-1 text-xs text-gray-400">
													Corso: {cardResult.subscriber.courseName}
												</div>
											{/if}
											<div class="mt-1">
												<span
													class="rounded-full px-2 py-0.5 text-xs font-medium
													{cardResult.subscriber.status === 'active'
														? 'bg-green-100 text-green-800'
														: 'bg-gray-100 text-gray-600'}"
												>
													Iscritto {cardResult.subscriber.status === 'active'
														? 'attivo'
														: cardResult.subscriber.status}
												</span>
											</div>
										</div>
									{:else}
										<div class="mt-2 text-gray-400 italic">Nessun subscriber associato</div>
									{/if}
								</div>
							{:else}
								<div class="text-gray-600">Card non riconosciuta nel sistema</div>
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
							<button onclick={clearLog} class="text-xs text-gray-400 hover:text-gray-700">
								Pulisci log
							</button>
						</div>
					</CardHeader>
					<CardContent>
						<div
							bind:this={logContainer}
							class="max-h-96 overflow-y-auto rounded bg-gray-900 p-3 font-mono text-xs text-green-400"
						>
							{#if logLines.length === 0}
								<div class="text-gray-600 italic">In attesa di dati dal dispositivo...</div>
							{:else}
								{#each logLines as entry (entry.id)}
									<div>
										<span class="text-gray-500">{entry.time}</span>
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

				{#if showDiagnosticsLink}
					<div class="flex justify-end">
						<a href="/card-diagnostics">
							<Button variant="outline" size="sm">Apri diagnostica completa</Button>
						</a>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
{/if}
