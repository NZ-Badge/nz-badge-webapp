<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Copy, Eye, EyeOff, RefreshCw, Webhook } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { callAction } from '$lib/utils/enhance';
	import { apiFetch, errorMessage } from '$lib/utils/http';

	let { webhookUrl, hasSecret: initialHasSecret }: { webhookUrl: string; hasSecret: boolean } =
		$props();

	// Il secret non arriva con la pagina: viene letto solo su richiesta.
	let hasSecret = $derived(initialHasSecret);
	let secret = $state<string | null>(null);
	let secretVisible = $state(false);
	let loadingSecret = $state(false);
	let generating = $state(false);
	let regenerateOpen = $state(false);

	async function fetchSecret(): Promise<string | null> {
		if (secret) return secret;
		loadingSecret = true;
		try {
			const result = await apiFetch<{ secret: string | null }>(
				'/api/v1/webhooks/enrollments/secret'
			);
			secret = result.secret;
			return secret;
		} catch (err) {
			toast.error(errorMessage(err, 'Impossibile leggere il secret'));
			return null;
		} finally {
			loadingSecret = false;
		}
	}

	async function toggleSecretVisible() {
		if (!secretVisible && !(await fetchSecret())) return;
		secretVisible = !secretVisible;
	}

	async function copy(text: string, kind: 'url' | 'secret') {
		try {
			await navigator.clipboard.writeText(text);
			toast.success(kind === 'url' ? 'URL copiato' : 'Secret copiato');
		} catch {
			toast.error('Impossibile copiare negli appunti');
		}
	}

	async function copySecret() {
		const value = await fetchSecret();
		if (value) await copy(value, 'secret');
	}

	async function generate() {
		generating = true;
		try {
			const result = await callAction(
				'?/generateWebhookSecret',
				{},
				{ invalidate: false, error: 'Errore nella generazione del secret' }
			);
			secret = typeof result?.secret === 'string' ? result.secret : null;
			secretVisible = secret !== null;
			const regenerated = hasSecret;
			hasSecret = true;
			toast.success(regenerated ? 'Secret rigenerato' : 'Secret generato');
		} finally {
			generating = false;
		}
	}

	async function generateFromButton() {
		if (hasSecret) {
			regenerateOpen = true;
			return;
		}
		try {
			await generate();
		} catch (err) {
			toast.error(errorMessage(err, 'Errore nella generazione del secret'));
		}
	}
</script>

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
		<div class="space-y-2">
			<p class="text-sm font-medium text-gray-700">URL endpoint</p>
			<div class="flex items-center gap-2">
				<code
					class="flex-1 rounded border bg-gray-50 px-3 py-2 font-mono text-sm break-all text-gray-800"
				>
					{webhookUrl}
				</code>
				<Button
					variant="outline"
					size="sm"
					onclick={() => copy(webhookUrl, 'url')}
					class="shrink-0"
					data-tutorial-title="Copia URL webhook"
					data-tutorial-description="Copia negli appunti l'indirizzo da configurare sul server remoto."
				>
					<Copy size={14} class="mr-1" />
					Copia
				</Button>
			</div>
			<p class="text-xs text-gray-500">
				Il server remoto deve inviare una <code class="font-mono">POST</code> a questo URL con
				header
				<code class="font-mono">X-Webhook-Secret: &lt;secret&gt;</code>
			</p>
		</div>

		<div class="space-y-2">
			<p class="text-sm font-medium text-gray-700">Secret</p>
			{#if hasSecret}
				<div class="flex items-center gap-2">
					<code
						class="flex-1 rounded border bg-gray-50 px-3 py-2 font-mono text-sm break-all text-gray-800"
					>
						{secretVisible && secret ? secret : '•'.repeat(20)}
					</code>
					<Button
						variant="outline"
						size="icon"
						onclick={toggleSecretVisible}
						disabled={loadingSecret}
						aria-label={secretVisible ? 'Nascondi secret' : 'Mostra secret'}
						aria-pressed={secretVisible}
						title={secretVisible ? 'Nascondi' : 'Mostra'}
					>
						{#if secretVisible}
							<EyeOff size={14} />
						{:else}
							<Eye size={14} />
						{/if}
					</Button>
					<Button
						variant="outline"
						size="sm"
						onclick={copySecret}
						disabled={loadingSecret}
						class="shrink-0"
						data-tutorial-title="Copia secret"
						data-tutorial-description="Copia negli appunti il secret da inserire nell'header X-Webhook-Secret del server remoto."
					>
						<Copy size={14} class="mr-1" />
						Copia
					</Button>
				</div>
			{:else}
				<p class="text-sm text-gray-500 italic">
					Nessun secret configurato. Genera uno per abilitare il webhook.
				</p>
			{/if}
			<Button
				variant={hasSecret ? 'warning' : 'outline'}
				size="sm"
				onclick={generateFromButton}
				disabled={generating}
				data-tutorial-title={hasSecret ? 'Rigenera secret' : 'Genera secret'}
				data-tutorial-description="Crea un nuovo secret per autenticare le chiamate del server remoto. Rigenerarlo invalida quello precedente."
			>
				{#if generating}
					<span
						class="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-transparent"
					></span>
					Generazione...
				{:else}
					<RefreshCw size={14} class="mr-2" />
					{hasSecret ? 'Rigenera secret' : 'Genera secret'}
				{/if}
			</Button>
			{#if hasSecret}
				<p class="text-xs text-amber-700">
					Attenzione: rigenerare il secret invalida quello precedente. Aggiorna la configurazione
					del server remoto dopo la rigenerazione.
				</p>
			{/if}
		</div>
	</CardContent>
</Card>

<ConfirmDialog
	bind:open={regenerateOpen}
	title="Rigenera secret webhook"
	description="Il secret attuale smetterà subito di funzionare. Dovrai aggiornare la configurazione del server remoto con quello nuovo."
	confirmLabel="Rigenera secret"
	busyLabel="Generazione…"
	variant="warning"
	onConfirm={generate}
/>
