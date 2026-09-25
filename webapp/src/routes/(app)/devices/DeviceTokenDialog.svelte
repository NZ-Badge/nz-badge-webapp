<script lang="ts">
	import { Usb } from '@lucide/svelte';
	import CopyButton from '$lib/components/CopyButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';

	let {
		open = $bindable(false),
		deviceId,
		token,
		apiUrl,
		serialSupported,
		onProvision
	}: {
		open?: boolean;
		deviceId: string;
		token: string;
		apiUrl: string;
		serialSupported: boolean;
		/** Avvia la configurazione automatica via USB. */
		onProvision: () => void;
	} = $props();

	const provisionCommand = $derived(`PROVISION:${deviceId},${token},${apiUrl}`);
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-lg">
		<DialogHeader>
			<DialogTitle>Dispositivo registrato</DialogTitle>
		</DialogHeader>
		<div class="space-y-4">
			<div class="rounded-md border border-amber-200 bg-amber-50 p-4">
				<p class="text-sm font-medium text-amber-800">
					Copia il token ora: non verrà mostrato di nuovo.
				</p>
			</div>

			{#if token}
				<div class="space-y-2">
					<p class="text-sm font-medium">Token dispositivo (JWT)</p>
					<div class="flex gap-2">
						<code class="flex-1 overflow-x-auto rounded bg-muted px-3 py-2 text-xs break-all">
							{token}
						</code>
						<CopyButton value={token} label="Copia token" />
					</div>
				</div>

				<!-- Primario: configurazione tramite captive portal -->
				<div class="space-y-3 rounded-md border border-green-200 bg-green-50 p-4">
					<p class="text-sm font-semibold text-green-900">
						Configura il dispositivo via captive portal
					</p>
					<ol class="list-inside list-decimal space-y-1 text-sm text-green-800">
						<li>Accendi il dispositivo (premi RESET o collega l’alimentazione)</li>
						<li>
							Sul telefono o PC connettiti al WiFi <code class="rounded bg-card/70 px-1 text-xs"
								>reader-XXXXXX</code
							> visibile nelle reti disponibili
						</li>
						<li>
							Si apre il browser, oppure vai a <code class="rounded bg-card/70 px-1 text-xs"
								>192.168.4.1</code
							>
						</li>
						<li>Inserisci le credenziali WiFi e i campi sottostanti, poi clicca <em>Save</em></li>
					</ol>
					<dl class="space-y-2 rounded bg-card/70 p-2">
						<div class="flex items-center gap-2">
							<dt class="w-24 shrink-0 text-xs text-green-700">ID dispositivo:</dt>
							<dd class="flex-1 font-mono text-xs break-all">{deviceId}</dd>
							<CopyButton
								value={deviceId}
								label="Copia ID dispositivo"
								variant="ghost"
								class="size-6"
								iconSize={12}
							/>
						</div>
						<div class="flex items-center gap-2">
							<dt class="w-24 shrink-0 text-xs text-green-700">JWT Token:</dt>
							<dd class="flex-1 text-xs text-muted-foreground italic">← copia dal campo sopra</dd>
						</div>
						<div class="flex items-center gap-2">
							<dt class="w-24 shrink-0 text-xs text-green-700">API Base URL:</dt>
							<dd class="flex-1 font-mono text-xs break-all">{apiUrl}</dd>
							<CopyButton
								value={apiUrl}
								label="Copia indirizzo API"
								variant="ghost"
								class="size-6"
								iconSize={12}
							/>
						</div>
					</dl>
				</div>

				<!-- Secondario: configurazione USB / seriale (avanzata) -->
				<details class="rounded-md border text-sm">
					<summary class="cursor-pointer px-3 py-2 text-muted-foreground select-none"
						>Configurazione via USB / seriale (avanzata)</summary
					>
					<div class="space-y-2 border-t px-3 pt-2 pb-3">
						{#if serialSupported}
							<p class="text-xs text-muted-foreground">
								Collega il dispositivo via USB e clicca il bottone, poi resetta:
							</p>
							<Button size="sm" onclick={onProvision} data-tutorial="device.provision-usb">
								<Usb size={14} aria-hidden="true" /> Configurazione automatica via USB
							</Button>
						{:else}
							<p class="text-xs text-muted-foreground">
								Connetti via seriale (115200 baud), resetta e incolla entro 3 s:
							</p>
						{/if}
						<div class="flex gap-2">
							<code class="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 text-xs break-all"
								>{provisionCommand}</code
							>
							<CopyButton
								value={provisionCommand}
								label="Copia comando di provisioning"
								size="sm"
								iconSize={14}
							/>
						</div>
					</div>
				</details>
			{/if}

			<DialogFooter>
				<Button onclick={() => (open = false)} data-tutorial="dialog.done">Chiudi</Button>
			</DialogFooter>
		</div>
	</DialogContent>
</Dialog>
