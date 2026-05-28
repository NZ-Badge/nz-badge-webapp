<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Switch } from '$lib/components/ui/switch';
	import {
		Save,
		Settings,
		AlertCircle,
		Check,
		Key,
		RefreshCw,
		Webhook,
		Copy,
		Eye,
		EyeOff,
		Link,
		Shield,
		Mail
	} from '@lucide/svelte';

	let { data } = $props();
	const getInitialValues = () => data.values;
	const getInitialMifareKeys = () => data.mifareKeys;
	const getInitialActiveCardsCount = () => data.activeCardsCount ?? 0;
	const getInitialWebhookSecret = () => data.webhookSecret ?? null;
	const getInitialEnrollmentApiConfig = () => data.enrollmentApiConfig;

	// Stato locale dei settings
	let resetEntryTypeDaily = $state(getInitialValues().reset_entry_type_daily ?? true);
	let minSwipeIntervalMinutes = $state(getInitialValues().min_swipe_interval_minutes ?? 15);
	let weeklyAttendanceSummaryEnabled = $state(
		getInitialValues().weekly_attendance_summary_enabled ?? false
	);
	let useMifare = $state(getInitialValues().use_mifare ?? false);
	let useSingleMifareKey = $state(getInitialValues().use_single_mifare_key ?? false);

	// Stato MIFARE keys
	let mifareKeys = $state(getInitialMifareKeys());

	// Stato card attive
	let activeCardsCount = $state(getInitialActiveCardsCount());

	// Stato webhook
	let webhookSecret = $state<string | null>(getInitialWebhookSecret());
	let webhookSecretVisible = $state(false);
	let generatingSecret = $state(false);
	let copiedUrl = $state(false);
	let copiedSecret = $state(false);

	// Stato Enrollment API
	let enrollmentApiUrl = $state(getInitialEnrollmentApiConfig().url ?? '');
	let enrollmentApiKey = $state(getInitialEnrollmentApiConfig().key ?? '');
	let apiKeyVisible = $state(false);
	let testingApi = $state(false);
	let testResult = $state<{ success: boolean; message: string } | null>(null);

	const webhookUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/webhooks/enrollments`;

	async function generateWebhookSecret() {
		generatingSecret = true;
		saveError = '';
		try {
			const response = await fetch('/api/v1/webhooks/enrollments/secret', { method: 'POST' });
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Errore nella generazione del secret');
			}
			webhookSecret = result.data.secret;
			webhookSecretVisible = true;
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Errore sconosciuto';
		} finally {
			generatingSecret = false;
		}
	}

	async function copyToClipboard(text: string, type: 'url' | 'secret') {
		try {
			await navigator.clipboard.writeText(text);
			if (type === 'url') {
				copiedUrl = true;
				setTimeout(() => {
					copiedUrl = false;
				}, 2000);
			} else {
				copiedSecret = true;
				setTimeout(() => {
					copiedSecret = false;
				}, 2000);
			}
		} catch {
			// clipboard non disponibile
		}
	}

	async function testApiConnection() {
		testingApi = true;
		testResult = null;
		saveError = '';
		try {
			const response = await fetch('/api/v1/settings/enrollment-api/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ url: enrollmentApiUrl, key: enrollmentApiKey })
			});
			const result = await response.json();
			const data = result.data ?? result;
			testResult = {
				success: data.success ?? false,
				message: data.message || (data.success ? 'Connessione riuscita' : 'Errore di connessione')
			};
		} catch (err) {
			testResult = {
				success: false,
				message: err instanceof Error ? err.message : 'Errore durante il test'
			};
		} finally {
			testingApi = false;
		}
	}

	// Stato UI
	let saving = $state(false);
	let saveError = $state('');
	let saveSuccess = $state(false);
	let regeneratingKeys = $state(false);
	let showSingleKeyWarning = $state(false);

	async function saveSettings() {
		saving = true;
		saveError = '';
		saveSuccess = false;
		showSingleKeyWarning = false;

		// Se stiamo abilitando la modalità chiave unica e ci sono card attive, mostra avviso
		if (useSingleMifareKey && activeCardsCount > 0 && !getInitialValues().use_single_mifare_key) {
			showSingleKeyWarning = true;
			saving = false;
			return;
		}

		try {
			const response = await fetch('/api/v1/settings', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					reset_entry_type_daily: resetEntryTypeDaily,
					min_swipe_interval_minutes: minSwipeIntervalMinutes,
					weekly_attendance_summary_enabled: weeklyAttendanceSummaryEnabled,
					// Invia use_single_mifare_key solo se MIFARE è abilitato
					...(useMifare ? { use_single_mifare_key: useSingleMifareKey } : {}),
					// Enrollment API config
					enrollment_api_url: enrollmentApiUrl,
					enrollment_api_key: enrollmentApiKey
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Impossibile salvare le impostazioni');
			}

			// Aggiorna stato chiavi se cambiato
			if (result.mifare_keys) {
				mifareKeys = result.mifare_keys;
			}

			saveSuccess = true;
			setTimeout(() => {
				saveSuccess = false;
			}, 3000);
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Errore sconosciuto';
		} finally {
			saving = false;
		}
	}

	function dismissSingleKeyWarning() {
		showSingleKeyWarning = false;
		// Reverti il toggle
		useSingleMifareKey = false;
	}

	async function toggleUseMifare(newValue: boolean) {
		const previous = useMifare;
		useMifare = newValue;
		// Se si disabilita MIFARE, nascondi anche la sezione chiave unica
		if (!newValue) {
			useSingleMifareKey = false;
		}
		try {
			const response = await fetch('/api/v1/settings', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ use_mifare: newValue })
			});
			const result = await response.json();
			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Impossibile salvare l’impostazione');
			}
		} catch (err) {
			// Rollback on error
			useMifare = previous;
			if (!previous) useSingleMifareKey = getInitialValues().use_single_mifare_key ?? false;
			saveError = err instanceof Error ? err.message : 'Errore sconosciuto';
		}
	}

	async function regenerateKeys() {
		if (
			!confirm(
				'Sei sicuro di voler rigenerare le chiavi MIFARE? Le card già scritte con le chiavi precedenti potrebbero non essere più leggibili.'
			)
		) {
			return;
		}

		regeneratingKeys = true;
		saveError = '';

		try {
			const response = await fetch('/api/v1/settings', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					regenerate_mifare_keys: true
				})
			});

			const result = await response.json();

			if (!response.ok || !result.success) {
				throw new Error(result.error || 'Impossibile rigenerare le chiavi');
			}

			if (result.mifare_keys) {
				mifareKeys = result.mifare_keys;
			}

			saveSuccess = true;
			setTimeout(() => {
				saveSuccess = false;
			}, 3000);
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Errore sconosciuto';
		} finally {
			regeneratingKeys = false;
		}
	}
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<div class="flex items-center gap-3">
		<Settings size={28} class="text-gray-700" />
		<h1 class="text-2xl font-bold">Impostazioni</h1>
	</div>

	<p class="text-sm text-gray-600">
		Configura le regole per la gestione delle presenze e delle strisciate.
	</p>

	{#if saveError}
		<Alert variant="destructive">
			<AlertCircle size={16} class="mr-2" />
			<AlertDescription>{saveError}</AlertDescription>
		</Alert>
	{/if}

	{#if saveSuccess}
		<Alert class="border-green-200 bg-green-50">
			<Check size={16} class="mr-2 text-green-600" />
			<AlertDescription class="text-green-800">Impostazioni salvate con successo!</AlertDescription>
		</Alert>
	{/if}

	<!-- Card Presenze -->
	<Card>
		<CardHeader>
			<CardTitle>Regole Presenze</CardTitle>
			<CardDescription>Configura come vengono gestite le strisciate delle card</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			<!-- Setting 1: Azzera tipo ingresso -->
			<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
				<div class="flex-1 space-y-1">
					<div class="flex items-center gap-2">
						<Label for="reset-entry-type" class="text-base font-medium">
							Azzera tipo ingresso ogni giorno
						</Label>
					</div>
					<p class="text-sm text-gray-500">
						Se abilitato, la prima strisciata del giorno viene sempre segnata come ingresso (entry),
						indipendentemente dallo stato precedente. Se disabilitato, la logica entry/exit continua
						dal giorno precedente.
					</p>
				</div>
				<Switch id="reset-entry-type" bind:checked={resetEntryTypeDaily} />
			</div>

			<!-- Setting 2: Intervallo minimo -->
			<div class="space-y-3 rounded-lg border p-4">
				<div class="space-y-1">
					<Label for="min-interval" class="text-base font-medium">
						Intervallo minimo tra strisciate
					</Label>
					<p class="text-sm text-gray-500">
						Determina l'intervallo minimo (in minuti) tra due strisciate per la stessa card. Se un
						utente striscia due volte entro questo intervallo, la seconda strisciata viene ignorata.
					</p>
				</div>
				<div class="flex items-center gap-3">
					<Input
						id="min-interval"
						type="number"
						min={1}
						max={1440}
						bind:value={minSwipeIntervalMinutes}
						class="w-24"
					/>
					<span class="text-sm text-gray-600">minuti</span>
				</div>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<div class="flex items-center gap-2">
				<Mail size={20} class="text-gray-700" />
				<CardTitle>Riepilogo settimanale presenze</CardTitle>
			</div>
			<CardDescription>
				Abilita l'invio automatico del riepilogo ore agli iscritti con strisciate nella settimana
			</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
				<div class="flex-1 space-y-1">
					<Label for="weekly-attendance-summary" class="text-base font-medium">
						Invia riepilogo settimanale
					</Label>
					<p class="text-sm text-gray-500">
						Il comando schedulato puo' essere lanciato ogni giorno: inviera' le email solo il
						sabato, per la settimana lunedi-venerdi appena conclusa, e non ripetera' invii gia'
						registrati.
					</p>
				</div>
				<Switch id="weekly-attendance-summary" bind:checked={weeklyAttendanceSummaryEnabled} />
			</div>
		</CardContent>
	</Card>

	<!-- Avviso card attive quando si tenta di abilitare chiave unica -->
	{#if showSingleKeyWarning}
		<Alert class="border-red-200 bg-red-50">
			<div class="flex items-start gap-3">
				<AlertCircle size={20} class="mt-0.5 text-red-600 shrink-0" />
				<div class="flex-1 space-y-2">
					<AlertDescription class="text-red-900 font-medium">
						Impossibile abilitare la modalità chiave unica
					</AlertDescription>
					<p class="text-sm text-red-800">
						Esistono <strong>{activeCardsCount}</strong> card attive nel sistema. Tutte le card devono
						essere disattivate o cancellate prima di attivare questa opzione.
					</p>
					<p class="text-sm text-red-700">
						<strong>Nota:</strong> Una volta attivata la modalità chiave unica, le card esistenti non
						funzioneranno più e dovranno essere riscritte.
					</p>
					<div class="pt-2">
						<Button
							onclick={dismissSingleKeyWarning}
							variant="outline"
							size="sm"
							class="border-red-300 text-red-700 hover:bg-red-100"
						>
							Ho capito, annulla
						</Button>
						<a href="/cards" class="ml-2">
							<Button variant="default" size="sm" class="bg-red-600 hover:bg-red-700">
								Vai alle card
							</Button>
						</a>
					</div>
				</div>
			</div>
		</Alert>
	{/if}

	<!-- Card MIFARE Keys -->
	<Card>
		<CardHeader>
			<div class="flex items-center gap-2">
				<Key size={20} class="text-gray-700" />
				<CardTitle>Gestione Chiavi MIFARE</CardTitle>
			</div>
			<CardDescription>Configura le chiavi di accesso per le card RFID</CardDescription>
		</CardHeader>
		<CardContent class="space-y-6">
			<!-- Setting: Abilita MIFARE -->
			<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
				<div class="flex-1 space-y-1">
					<div class="flex items-center gap-2">
						<Label for="use-mifare" class="text-base font-medium">Usa MIFARE</Label>
					</div>
					<p class="text-sm text-gray-500">
						Abilita la scrittura e cancellazione dei settori MIFARE. Se disabilitato, le card
						vengono registrate solo tramite UID.
					</p>
				</div>
				<Switch id="use-mifare" checked={useMifare} onCheckedChange={toggleUseMifare} />
			</div>

			<!-- Setting: Modalità chiave unica (visibile solo se MIFARE abilitato) -->
			{#if useMifare}
				<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
					<div class="flex-1 space-y-1">
						<div class="flex items-center gap-2">
							<Label for="use-single-key" class="text-base font-medium">
								Usa chiave unica per tutte le card
							</Label>
						</div>
						<p class="text-sm text-gray-500">
							Se abilitato, tutte le card RFID utilizzeranno la stessa coppia di chiavi MIFARE.
							Questo semplifica la gestione ma riduce la sicurezza. Se disabilitato, ogni card avrà
							una coppia di chiavi univoca generata automaticamente.
						</p>
					</div>
					<Switch id="use-single-key" bind:checked={useSingleMifareKey} />
				</div>

				<!-- Visualizzazione chiavi correnti (solo se modalità chiave unica) -->
				{#if useSingleMifareKey && mifareKeys.keys}
					<div class="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
						<h4 class="font-medium text-amber-900">Chiavi MIFARE Globali</h4>
						<p class="text-sm text-amber-700">
							Queste chiavi verranno utilizzate per tutte le nuove card scritte.
						</p>
						<div class="grid gap-3 sm:grid-cols-2">
							<div>
								<Label class="text-xs text-amber-800">Key A</Label>
								<div class="font-mono text-sm bg-white border rounded px-3 py-2">
									{mifareKeys.keys.keyA}
								</div>
							</div>
							<div>
								<Label class="text-xs text-amber-800">Key B</Label>
								<div class="font-mono text-sm bg-white border rounded px-3 py-2">
									{mifareKeys.keys.keyB}
								</div>
							</div>
						</div>
						<div class="pt-2">
							<Button
								onclick={regenerateKeys}
								disabled={regeneratingKeys}
								variant="outline"
								size="sm"
								class="text-amber-700 border-amber-300 hover:bg-amber-100"
							>
								{#if regeneratingKeys}
									<span
										class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-700 border-t-transparent mr-2"
									></span>
									Generazione...
								{:else}
									<RefreshCw size={14} class="mr-2" />
									Rigenera chiavi
								{/if}
							</Button>
						</div>
					</div>
				{:else if useSingleMifareKey && !mifareKeys.keys}
					<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
						<p class="text-sm text-yellow-800">
							Le chiavi globali verranno generate automaticamente al primo utilizzo.
						</p>
					</div>
				{/if}
			{/if}
		</CardContent>
	</Card>

	<!-- Card Configurazione API Iscrizioni -->
	<Card>
		<CardHeader>
			<div class="flex items-center gap-2">
				<Link size={20} class="text-gray-700" />
				<CardTitle>API Iscrizioni</CardTitle>
			</div>
			<CardDescription>
				Configura l'URL e la API key per la sincronizzazione delle iscrizioni dal server remoto
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- URL API -->
			<div class="space-y-2">
				<Label for="enrollment-api-url" class="text-sm font-medium">URL API</Label>
				<Input
					id="enrollment-api-url"
					type="url"
					placeholder="https://api.example.com"
					bind:value={enrollmentApiUrl}
					class="font-mono"
				/>
				<p class="text-xs text-gray-500">URL base dell'API esterna (es: https://api.example.com)</p>
			</div>

			<!-- API Key -->
			<div class="space-y-2">
				<Label for="enrollment-api-key" class="text-sm font-medium">Chiave API</Label>
				<div class="flex items-center gap-2">
					<Input
						id="enrollment-api-key"
						type={apiKeyVisible ? 'text' : 'password'}
						placeholder="sk-..."
						bind:value={enrollmentApiKey}
						class="font-mono"
					/>
					<Button
						variant="outline"
						size="icon"
						onclick={() => {
							apiKeyVisible = !apiKeyVisible;
						}}
						title={apiKeyVisible ? 'Nascondi' : 'Mostra'}
					>
						{#if apiKeyVisible}
							<EyeOff size={14} />
						{:else}
							<Eye size={14} />
						{/if}
					</Button>
				</div>
				<p class="text-xs text-gray-500">Chiave di autenticazione Bearer per le chiamate all'API</p>
			</div>

			<!-- Test connessione -->
			{#if testResult}
				<Alert
					class={testResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}
				>
					<AlertCircle
						size={16}
						class={testResult.success ? 'mr-2 text-green-600' : 'mr-2 text-red-600'}
					/>
					<AlertDescription class={testResult.success ? 'text-green-800' : 'text-red-800'}>
						{testResult.message}
					</AlertDescription>
				</Alert>
			{/if}

			<div class="flex items-center gap-2 pt-2">
				<Button
					variant="outline"
					size="sm"
					onclick={testApiConnection}
					disabled={testingApi || !enrollmentApiUrl || !enrollmentApiKey}
				>
					{#if testingApi}
						<span
							class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent mr-2"
						></span>
						Test in corso...
					{:else}
						<Shield size={14} class="mr-2" />
						Test connessione
					{/if}
				</Button>
				{#if !enrollmentApiUrl || !enrollmentApiKey}
					<span class="text-xs text-amber-600">
						Inserisci URL e API key per testare la connessione
					</span>
				{/if}
			</div>
		</CardContent>
	</Card>

	<!-- Card Webhook Iscrizioni -->
	<Card>
		<CardHeader>
			<div class="flex items-center gap-2">
				<Webhook size={20} class="text-gray-700" />
				<CardTitle>Webhook Iscrizioni</CardTitle>
			</div>
			<CardDescription>
				Configura il webhook per ricevere le iscrizioni in push dal server remoto
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<!-- URL webhook -->
			<div class="space-y-2">
				<p class="text-sm font-medium text-gray-700">URL endpoint</p>
				<div class="flex items-center gap-2">
					<code
						class="flex-1 rounded border bg-gray-50 px-3 py-2 text-sm font-mono text-gray-800 break-all"
					>
						/api/v1/webhooks/enrollments
					</code>
					<Button
						variant="outline"
						size="sm"
						onclick={() => copyToClipboard(webhookUrl, 'url')}
						class="shrink-0"
					>
						{#if copiedUrl}
							<Check size={14} class="mr-1 text-green-600" />
							Copiato
						{:else}
							<Copy size={14} class="mr-1" />
							Copia
						{/if}
					</Button>
				</div>
				<p class="text-xs text-gray-500">
					Il server remoto deve inviare una <code class="font-mono">POST</code> a questo URL con
					header
					<code class="font-mono">X-Webhook-Secret: &lt;secret&gt;</code>
				</p>
			</div>

			<!-- Secret -->
			<div class="space-y-2">
				<p class="text-sm font-medium text-gray-700">Secret</p>
				{#if webhookSecret}
					<div class="flex items-center gap-2">
						<code
							class="flex-1 rounded border bg-gray-50 px-3 py-2 text-sm font-mono text-gray-800 break-all"
						>
							{webhookSecretVisible ? webhookSecret : '•'.repeat(20)}
						</code>
						<Button
							variant="outline"
							size="icon"
							onclick={() => {
								webhookSecretVisible = !webhookSecretVisible;
							}}
							title={webhookSecretVisible ? 'Nascondi' : 'Mostra'}
						>
							{#if webhookSecretVisible}
								<EyeOff size={14} />
							{:else}
								<Eye size={14} />
							{/if}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onclick={() => copyToClipboard(webhookSecret!, 'secret')}
							class="shrink-0"
						>
							{#if copiedSecret}
								<Check size={14} class="mr-1 text-green-600" />
								Copiato
							{:else}
								<Copy size={14} class="mr-1" />
								Copia
							{/if}
						</Button>
					</div>
				{:else}
					<p class="text-sm text-gray-500 italic">
						Nessun secret configurato. Genera uno per abilitare il webhook.
					</p>
				{/if}
				<Button
					variant="outline"
					size="sm"
					onclick={generateWebhookSecret}
					disabled={generatingSecret}
					class="text-gray-700"
				>
					{#if generatingSecret}
						<span
							class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent mr-2"
						></span>
						Generazione...
					{:else}
						<RefreshCw size={14} class="mr-2" />
						{webhookSecret ? 'Rigenera secret' : 'Genera secret'}
					{/if}
				</Button>
				{#if webhookSecret}
					<p class="text-xs text-amber-700">
						Attenzione: rigenerare il secret invalida quello precedente. Aggiorna la configurazione
						del server remoto dopo la rigenerazione.
					</p>
				{/if}
			</div>
		</CardContent>
	</Card>

	<!-- Pulsante Salva -->
	<div class="flex justify-end">
		<Button onclick={saveSettings} disabled={saving} class="min-w-32">
			{#if saving}
				<span
					class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2"
				></span>
				Salvataggio...
			{:else}
				<Save size={16} class="mr-2" />
				Salva impostazioni
			{/if}
		</Button>
	</div>
</div>
