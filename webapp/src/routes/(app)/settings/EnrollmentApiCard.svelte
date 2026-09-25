<script lang="ts">
	import { AlertCircle, Eye, EyeOff, Link, Shield } from '@lucide/svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { callAction } from '$lib/utils/enhance';
	import { errorMessage } from '$lib/utils/http';

	let {
		url = $bindable(),
		apiKey = $bindable(),
		clearKey = $bindable(),
		hasKey
	}: {
		url: string;
		/** Nuova chiave digitata: quella salvata non viene mai inviata al browser. */
		apiKey: string;
		/** Rimuove la chiave salvata al prossimo salvataggio. */
		clearKey: boolean;
		hasKey: boolean;
	} = $props();

	let apiKeyVisible = $state(false);
	let testing = $state(false);
	let testResult = $state<{ success: boolean; message: string } | null>(null);

	const canTest = $derived(url.trim() !== '' && (apiKey.trim() !== '' || (hasKey && !clearKey)));

	async function testConnection() {
		testing = true;
		testResult = null;
		try {
			const result = await callAction(
				'?/testEnrollmentApi',
				{ url, key: apiKey },
				{ invalidate: false, error: 'Errore durante il test' }
			);
			testResult = {
				success: result?.success === true,
				message: String(result?.message ?? 'Errore di connessione')
			};
		} catch (err) {
			testResult = { success: false, message: errorMessage(err, 'Errore durante il test') };
		} finally {
			testing = false;
		}
	}
</script>

<Card>
	<CardHeader>
		<div class="flex items-center gap-2">
			<Link size={20} class="text-foreground" />
			<CardTitle>API Iscrizioni</CardTitle>
		</div>
		<CardDescription>
			Configura l'URL e la API key per la sincronizzazione delle iscrizioni dal server remoto
		</CardDescription>
	</CardHeader>
	<CardContent class="space-y-4">
		<div class="space-y-2">
			<Label for="enrollment-api-url" class="text-sm font-medium">URL API</Label>
			<Input
				id="enrollment-api-url"
				type="url"
				placeholder="https://api.example.com"
				bind:value={url}
				class="font-mono"
			/>
			<p class="text-xs text-muted-foreground">
				URL base dell'API esterna (es: https://api.example.com)
			</p>
		</div>

		<div class="space-y-2">
			<Label for="enrollment-api-key" class="text-sm font-medium">Chiave API</Label>
			<div class="flex items-center gap-2">
				<Input
					id="enrollment-api-key"
					type={apiKeyVisible ? 'text' : 'password'}
					autocomplete="off"
					placeholder={hasKey && !clearKey
						? 'Chiave salvata: lascia vuoto per non modificarla'
						: 'sk-...'}
					bind:value={apiKey}
					class="font-mono"
				/>
				<Button
					variant="outline"
					size="icon"
					onclick={() => (apiKeyVisible = !apiKeyVisible)}
					aria-label={apiKeyVisible ? 'Nascondi chiave API' : 'Mostra chiave API'}
					aria-pressed={apiKeyVisible}
					title={apiKeyVisible ? 'Nascondi' : 'Mostra'}
					data-tutorial={apiKeyVisible ? 'secret.hide' : 'secret.show'}
				>
					{#if apiKeyVisible}
						<EyeOff size={14} />
					{:else}
						<Eye size={14} />
					{/if}
				</Button>
			</div>
			<p class="text-xs text-muted-foreground">
				Chiave di autenticazione Bearer per le chiamate all'API
			</p>
			{#if hasKey}
				<div class="flex flex-wrap items-center gap-2">
					<span class="text-xs {clearKey ? 'text-red-700' : 'text-green-700'}">
						{clearKey
							? 'La chiave salvata verrà rimossa al salvataggio'
							: 'Una chiave è già salvata'}
					</span>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (clearKey = !clearKey)}
						data-tutorial-title="Rimuovi chiave API"
						data-tutorial-description="Segna la chiave API salvata per la rimozione. La modifica viene applicata solo quando premi Salva impostazioni; premi di nuovo per annullare."
					>
						{clearKey ? 'Annulla rimozione' : 'Rimuovi chiave salvata'}
					</Button>
				</div>
			{/if}
		</div>

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
				onclick={testConnection}
				disabled={testing || !canTest}
				data-tutorial="settings.test-connection"
			>
				{#if testing}
					<span
						class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
					></span>
					Test in corso...
				{:else}
					<Shield size={14} class="mr-2" />
					Test connessione
				{/if}
			</Button>
			{#if !canTest}
				<span class="text-xs text-amber-600">
					Inserisci URL e API key per testare la connessione
				</span>
			{/if}
		</div>
	</CardContent>
</Card>
