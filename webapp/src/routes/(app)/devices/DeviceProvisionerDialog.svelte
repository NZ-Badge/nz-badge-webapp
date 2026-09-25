<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import {
		WebSerialProvisioner,
		type ProvisionLogEntry,
		type ProvisionState
	} from '$lib/utils/webserial-provisioner';

	let {
		open = $bindable(false),
		deviceId,
		token,
		apiUrl
	}: { open?: boolean; deviceId: string; token: string; apiUrl: string } = $props();

	const MAX_LOG_LINES = 1000;

	let provisioner: WebSerialProvisioner | null = null;
	let provisionState = $state<ProvisionState>('idle');
	let logs = $state<Array<ProvisionLogEntry & { id: number }>>([]);
	let logContainer = $state<HTMLElement | null>(null);
	let logSeq = 0;

	// Il provisioner apre una connessione seriale dedicata finché il dialog resta aperto;
	// chiudere il dialog (pulsante, Esc o clic fuori) annulla sempre l'operazione.
	$effect(() => {
		if (!open) return;
		const instance = new WebSerialProvisioner();
		provisioner = instance;
		untrack(() => {
			logs = [];
			provisionState = 'idle';
		});
		instance.onState((s) => (provisionState = s));
		instance.onLog((entry) => {
			logs = [...logs.slice(-(MAX_LOG_LINES - 1)), { ...entry, id: logSeq++ }];
		});
		void instance.start(
			untrack(() => deviceId),
			untrack(() => token),
			untrack(() => apiUrl)
		);

		return () => {
			void instance.cancel();
			if (provisioner === instance) provisioner = null;
		};
	});

	$effect(() => {
		if (logs.length > 0 && logContainer) {
			logContainer.scrollTop = logContainer.scrollHeight;
		}
	});

	const logTone: Record<ProvisionLogEntry['type'], string> = {
		tx: 'text-yellow-400',
		success: 'font-semibold text-green-400',
		error: 'text-red-400',
		info: 'text-blue-300',
		rx: 'text-green-400'
	};
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-xl">
		<DialogHeader>
			<DialogTitle>Configurazione via USB: {deviceId}</DialogTitle>
		</DialogHeader>
		<div class="space-y-4" aria-live="polite">
			{#if provisionState === 'connecting'}
				<div
					class="flex items-center gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-4 py-3"
				>
					<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-yellow-400"></span>
					<span class="text-sm text-yellow-800">Seleziona la porta nel picker del browser...</span>
				</div>
			{:else if provisionState === 'success'}
				<div
					class="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
				>
					Configurazione completata. Il dispositivo si sta riavviando e si connetterà al WiFi.
				</div>
			{:else if provisionState === 'error'}
				<div class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
					<p class="font-medium">Errore o timeout durante il provisioning.</p>
					<p class="mt-1">
						Controlla il log seriale. Se il reader mostra l'AP WiFi (<code>reader-{deviceId}</code>)
						o "OFFLINE" sul display, il provisioning è andato a buon fine: connettiti all'AP e
						configura il WiFi tramite il captive portal.
					</p>
				</div>
			{:else if provisionState === 'listening'}
				<div class="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
					<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400"></span>
					<span class="text-sm text-blue-800">
						In ascolto... <strong>Resetta il dispositivo</strong> premendo il tasto RESET sull'ESP.
					</span>
				</div>
			{:else if provisionState === 'sending'}
				<div class="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3">
					<span class="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-600"></span>
					<span class="text-sm text-blue-800">Comando inviato, in attesa di conferma...</span>
				</div>
			{/if}

			<div class="space-y-1">
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-muted-foreground">Log seriale</span>
					{#if provisionState === 'listening' || provisionState === 'sending'}
						<Button
							size="sm"
							variant="outline"
							onclick={() => provisioner?.sendNow()}
							disabled={provisionState === 'sending'}
							data-tutorial="device.provision-send"
						>
							Invia ora
						</Button>
					{/if}
				</div>
				<div
					bind:this={logContainer}
					class="h-60 overflow-y-auto rounded bg-slate-900 p-3 font-mono text-xs"
				>
					{#if logs.length === 0}
						<span class="text-slate-500 italic">In attesa di output dal dispositivo...</span>
					{:else}
						{#each logs as entry (entry.id)}
							<div class={logTone[entry.type]}>
								<span class="text-slate-500">{entry.time}</span>
								{' '}{entry.text}
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
		<DialogFooter>
			<Button
				variant="outline"
				onclick={() => (open = false)}
				data-tutorial="device.provision-close"
			>
				{provisionState === 'success' ? 'Fatto' : 'Annulla'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
