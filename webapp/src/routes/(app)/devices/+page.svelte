<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { enhance } from '$app/forms';
	import { Pencil, Trash2, Plus, Copy, Check, Usb } from '@lucide/svelte';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { connection, connect, disconnect } from '$lib/stores/webserial.svelte';
	import { WebSerialProvisioner } from '$lib/utils/webserial-provisioner';
	import type { ProvisionLogEntry, ProvisionState } from '$lib/utils/webserial-provisioner';

	let { data, form } = $props();

	// State dialogs
	let createDialogOpen = $state(false);
	let editDevice = $state<(typeof data.devices)[0] | null>(null);
	let editDialogOpen = $state(false);
	let deleteDevice = $state<(typeof data.devices)[0] | null>(null);
	let deleteDialogOpen = $state(false);
	let showTokenDialog = $state(false);
	let copiedToken = $state(false);

	// Form data
	let newDeviceId = $state('');
	let newDeviceType = $state<'reader' | 'writer'>('reader');
	let newLocation = $state('');

	// Provisioner
	const serialSupported = browser && 'serial' in navigator;
	let showProvisionerDialog = $state(false);
	let provisioner: WebSerialProvisioner | null = null;
	let provisionState = $state<ProvisionState>('idle');
	let provisionLogs = $state<ProvisionLogEntry[]>([]);
	let provisionLogContainer = $state<HTMLElement | null>(null);
	// Salviamo i dati del device al momento della creazione (form sparisce alla chiusura dialog)
	let provisionDeviceId = $state('');
	let provisionToken = $state('');
	let copiedDeviceId = $state(false);
	let copiedApiUrl = $state(false);

	$effect(() => {
		if (provisionLogs.length > 0 && provisionLogContainer) {
			provisionLogContainer.scrollTop = provisionLogContainer.scrollHeight;
		}
	});

	// Show token dialog when device is created
	$effect(() => {
		if (form?.action === 'create' && form?.success && form?.token) {
			createDialogOpen = false;
			showTokenDialog = true;
			provisionDeviceId = form.deviceId ?? '';
			provisionToken = form.token;
			// Reset form
			newDeviceId = '';
			newLocation = '';
		}
	});

	function copyToken() {
		if (browser && provisionToken) {
			navigator.clipboard.writeText(provisionToken);
			copiedToken = true;
			setTimeout(() => (copiedToken = false), 2000);
		}
	}

	function copyDeviceId() {
		if (browser && provisionDeviceId) {
			navigator.clipboard.writeText(provisionDeviceId);
			copiedDeviceId = true;
			setTimeout(() => (copiedDeviceId = false), 2000);
		}
	}

	function copyApiUrl() {
		if (browser) {
			navigator.clipboard.writeText(window.location.origin);
			copiedApiUrl = true;
			setTimeout(() => (copiedApiUrl = false), 2000);
		}
	}

	function copyProvisionCommand() {
		if (browser && provisionDeviceId && provisionToken) {
			const cmd = `PROVISION:${provisionDeviceId},${provisionToken},${window.location.origin}`;
			navigator.clipboard.writeText(cmd);
			copiedToken = true;
			setTimeout(() => (copiedToken = false), 2000);
		}
	}

	async function openProvisioner() {
		showTokenDialog = false;
		provisionLogs = [];
		provisionState = 'idle';

		// Il provisioner apre la propria connessione dedicata.
		// Se lo store globale ha la porta aperta dobbiamo chiuderla prima
		// perché Web Serial non consente due connessioni simultanee alla stessa porta.
		if (connection.state === 'connected') {
			await disconnect();
		}

		showProvisionerDialog = true;

		provisioner = new WebSerialProvisioner();
		provisioner.onState((s) => {
			provisionState = s;
		});
		provisioner.onLog((entry) => {
			provisionLogs = [...provisionLogs.slice(-999), entry];
		});

		const origin = browser ? window.location.origin : '';
		await provisioner.start(provisionDeviceId, provisionToken, origin);
	}

	async function sendProvisionNow() {
		await provisioner?.sendNow();
	}

	async function closeProvisioner() {
		await provisioner?.cancel();
		provisioner = null;
		showProvisionerDialog = false;
	}

	onDestroy(() => {
		provisioner?.cancel();
	});

	function formatDate(date: Date | null) {
		if (!date) return 'Mai';
		return new Date(date).toLocaleString('it-IT');
	}

	function openEdit(device: (typeof data.devices)[0]) {
		editDevice = device;
		editDialogOpen = true;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-bold">Dispositivi</h1>
		<Button onclick={() => (createDialogOpen = true)}
			><Plus size={16} class="mr-2" /> Registra dispositivo</Button
		>
	</div>

	<p class="text-sm text-gray-600">
		Gestisci i dispositivi RFID. Ogni dispositivo richiede un token univoco per l’autenticazione.
	</p>

	<!-- Filters -->
	<form method="GET" class="flex gap-3">
		<Input
			name="q"
			placeholder="Cerca ID dispositivo o posizione..."
			value={data.q}
			class="max-w-xs"
		/>
		<Button type="submit" variant="outline">Filtra</Button>
	</form>

	<!-- Table -->
	<Table>
		<TableHeader>
			<TableRow>
				<TableHead>ID dispositivo</TableHead>
				<TableHead>Tipo</TableHead>
				<TableHead>Posizione</TableHead>
				<TableHead>Stato</TableHead>
				<TableHead>Ultimo ping</TableHead>
				<TableHead>Firmware</TableHead>
				<TableHead></TableHead>
			</TableRow>
		</TableHeader>
		<TableBody>
			{#each data.devices as device}
				<TableRow>
					<TableCell class="font-mono text-sm">{device.deviceId}</TableCell>
					<TableCell>
						<Badge variant={device.deviceType === 'reader' ? 'default' : 'secondary'}>
							{device.deviceType}
						</Badge>
					</TableCell>
					<TableCell>{device.location || '—'}</TableCell>
					<TableCell>
						{#if device.active}
							<span class="inline-flex items-center gap-1.5">
								<span class="h-2 w-2 rounded-full bg-green-500"></span>
								<span class="text-sm text-green-700">Attivo</span>
							</span>
						{:else}
							<span class="inline-flex items-center gap-1.5">
								<span class="h-2 w-2 rounded-full bg-gray-400"></span>
								<span class="text-sm text-gray-600">Disabilitato</span>
							</span>
						{/if}
					</TableCell>
					<TableCell class="text-sm text-gray-600">{formatDate(device.lastPing)}</TableCell>
					<TableCell class="text-sm text-gray-600">{device.firmwareVersion || '—'}</TableCell>
					<TableCell class="flex gap-2">
						<Button size="sm" variant="ghost" onclick={() => openEdit(device)}>
							<Pencil size={16} />
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onclick={() => {
								deleteDevice = device;
								deleteDialogOpen = true;
							}}
						>
							<Trash2 size={16} />
						</Button>
					</TableCell>
				</TableRow>
			{:else}
				<TableRow>
					<TableCell colspan={7} class="py-8 text-center text-gray-500">
						Nessun dispositivo registrato.
						<Button variant="link" onclick={() => (createDialogOpen = true)}
							>Registrane uno ora</Button
						>
					</TableCell>
				</TableRow>
			{/each}
		</TableBody>
	</Table>

	<!-- Pagination -->
	<div class="flex items-center justify-between text-sm text-gray-600">
		<span>Pagina {data.page} di {data.totalPages} ({data.total} totali)</span>
		<div class="flex gap-2">
			{#if data.page > 1}
				<a href="?page={data.page - 1}&q={data.q}">
					<Button variant="outline" size="sm">Precedente</Button>
				</a>
			{/if}
			{#if data.page < data.totalPages}
				<a href="?page={data.page + 1}&q={data.q}">
					<Button variant="outline" size="sm">Successiva</Button>
				</a>
			{/if}
		</div>
	</div>
</div>

<!-- Create Dialog -->
<Dialog bind:open={createDialogOpen}>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>Registra nuovo dispositivo</DialogTitle>
		</DialogHeader>
		<form method="POST" action="?/create" use:enhance class="space-y-4">
			<div class="space-y-2">
				<label class="text-sm font-medium">ID dispositivo</label>
				<Input
					name="deviceId"
					placeholder="e.g., reader_entrata"
					bind:value={newDeviceId}
					required
					pattern="[a-zA-Z0-9_-]+"
					title="Sono consentiti solo lettere, numeri, underscore e trattini"
				/>
				<p class="text-xs text-gray-500">
					Identificatore univoco. Usa solo lettere, numeri, underscore e trattini.
				</p>
			</div>

			<div class="space-y-2">
				<label class="text-sm font-medium">Tipo dispositivo</label>
				<select
					name="deviceType"
					bind:value={newDeviceType}
					class="w-full rounded border px-3 py-2 text-sm"
				>
					<option value="reader">Reader (rilevazione presenze)</option>
					<option value="writer">Writer (programmazione card)</option>
				</select>
			</div>

			<div class="space-y-2">
				<label class="text-sm font-medium">Posizione (opzionale)</label>
				<Input name="location" placeholder="e.g., Ingresso principale" bind:value={newLocation} />
			</div>

			{#if form?.error && form?.action === 'create'}
				<p class="text-sm text-red-600">{form.error}</p>
			{/if}

			<DialogFooter>
				<Button type="button" variant="outline" onclick={() => (createDialogOpen = false)}
					>Annulla</Button
				>
				<Button type="submit">Registra dispositivo</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>

<!-- Show Token Dialog (one-time only!) -->
<Dialog bind:open={showTokenDialog}>
	<DialogContent class="sm:max-w-lg">
		<DialogHeader>
			<DialogTitle>Dispositivo registrato</DialogTitle>
		</DialogHeader>
		<div class="space-y-4">
			<div class="rounded-md border border-amber-200 bg-amber-50 p-4">
				<p class="text-sm font-medium text-amber-800">
					Copia il token ora — non verrà mostrato di nuovo.
				</p>
			</div>

			{#if provisionToken}
				<div class="space-y-2">
					<label class="text-sm font-medium">Token dispositivo (JWT)</label>
					<div class="flex gap-2">
						<code class="flex-1 overflow-x-auto rounded bg-gray-100 px-3 py-2 text-xs break-all">
							{provisionToken}
						</code>
						<Button variant="outline" size="sm" onclick={copyToken}>
							{#if copiedToken}
								<Check size={16} />
							{:else}
								<Copy size={16} />
							{/if}
						</Button>
					</div>
				</div>

				<!-- Primary: captive portal provisioning -->
				<div class="rounded-md border border-green-200 bg-green-50 p-4 space-y-3">
					<p class="text-sm font-semibold text-green-900">
						Configura il dispositivo via captive portal
					</p>
					<ol class="text-sm text-green-800 list-decimal list-inside space-y-1">
						<li>Accendi il dispositivo (premi RESET o collega l’alimentazione)</li>
						<li>
							Sul telefono o PC connettiti al WiFi <code class="rounded bg-white/70 px-1 text-xs"
								>reader-XXXXXX</code
							> visibile nelle reti disponibili
						</li>
						<li>
							Si apre il browser — oppure vai a <code class="rounded bg-white/70 px-1 text-xs"
								>192.168.4.1</code
							>
						</li>
						<li>Inserisci le credenziali WiFi e i campi sottostanti, poi clicca <em>Save</em></li>
					</ol>
					<div class="rounded bg-white/70 p-2 space-y-2">
						<div class="flex items-center gap-2">
							<span class="w-24 shrink-0 text-xs text-green-700">ID dispositivo:</span>
							<code class="flex-1 break-all text-xs">{provisionDeviceId}</code>
							<Button variant="ghost" size="sm" class="h-6 w-6 p-0" onclick={copyDeviceId}>
								{#if copiedDeviceId}<Check size={12} />{:else}<Copy size={12} />{/if}
							</Button>
						</div>
						<div class="flex items-center gap-2">
							<span class="w-24 shrink-0 text-xs text-green-700">JWT Token:</span>
							<span class="flex-1 text-xs italic text-gray-500">← copia dal campo sopra</span>
						</div>
						<div class="flex items-center gap-2">
							<span class="w-24 shrink-0 text-xs text-green-700">API Base URL:</span>
							<code class="flex-1 break-all text-xs">{browser ? window.location.origin : ''}</code>
							<Button variant="ghost" size="sm" class="h-6 w-6 p-0" onclick={copyApiUrl}>
								{#if copiedApiUrl}<Check size={12} />{:else}<Copy size={12} />{/if}
							</Button>
						</div>
					</div>
				</div>

				<!-- Secondary: USB / serial provisioning (advanced) -->
				<details class="rounded-md border border-gray-200 text-sm">
					<summary class="cursor-pointer select-none px-3 py-2 text-gray-500"
						>Configurazione via USB / seriale (avanzata)</summary
					>
					<div class="space-y-2 border-t border-gray-100 px-3 pb-3 pt-2">
						{#if serialSupported}
							<p class="text-xs text-gray-600">
								Collega il dispositivo via USB e clicca il bottone, poi resetta:
							</p>
							<Button size="sm" onclick={openProvisioner}>
								<Usb size={14} class="mr-1" /> Configurazione automatica via USB
							</Button>
						{:else}
							<p class="text-xs text-gray-600">
								Connetti via seriale (115200 baud), resetta e incolla entro 3 s:
							</p>
						{/if}
						<div class="flex gap-2">
							<code class="flex-1 overflow-x-auto rounded bg-gray-100 px-2 py-1.5 text-xs break-all"
								>PROVISION:{provisionDeviceId},{provisionToken},{browser
									? window.location.origin
									: ''}</code
							>
							<Button variant="outline" size="sm" onclick={copyProvisionCommand}>
								{#if copiedToken}<Check size={14} />{:else}<Copy size={14} />{/if}
							</Button>
						</div>
					</div>
				</details>
			{/if}

			<DialogFooter>
				<Button onclick={() => (showTokenDialog = false)}>Chiudi</Button>
			</DialogFooter>
		</div>
	</DialogContent>
</Dialog>

<!-- Provisioner Dialog -->
<Dialog bind:open={showProvisionerDialog}>
	<DialogContent class="sm:max-w-xl">
		<DialogHeader>
			<DialogTitle>Configurazione via USB — {provisionDeviceId}</DialogTitle>
		</DialogHeader>
		<div class="space-y-4">
			<!-- Stato connessione -->
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
						Controlla il log seriale. Se il reader mostra l'AP WiFi (<code
							>reader-{provisionDeviceId}</code
						>) o "OFFLINE" sul display, il provisioning è andato a buon fine — connettiti all'AP e
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

			<!-- Log terminale -->
			<div class="space-y-1">
				<div class="flex items-center justify-between">
					<span class="text-xs font-medium text-gray-600">Log seriale</span>
					{#if provisionState === 'listening' || provisionState === 'sending'}
						<Button
							size="sm"
							variant="outline"
							onclick={sendProvisionNow}
							disabled={provisionState === 'sending'}
						>
							Invia ora
						</Button>
					{/if}
				</div>
				<div
					bind:this={provisionLogContainer}
					class="h-60 overflow-y-auto rounded bg-gray-900 p-3 font-mono text-xs"
				>
					{#if provisionLogs.length === 0}
						<span class="text-gray-500 italic">In attesa di output dal dispositivo...</span>
					{:else}
						{#each provisionLogs as entry (entry.time + entry.text)}
							<div
								class={entry.type === 'tx'
									? 'text-yellow-400'
									: entry.type === 'success'
										? 'text-green-400 font-semibold'
										: entry.type === 'error'
											? 'text-red-400'
											: entry.type === 'info'
												? 'text-blue-300'
												: 'text-green-400'}
							>
								<span class="text-gray-500">{entry.time}</span>
								{' '}{entry.text}
							</div>
						{/each}
					{/if}
				</div>
			</div>
		</div>
		<DialogFooter>
			<Button variant="outline" onclick={closeProvisioner}>
				{provisionState === 'success' ? 'Fatto' : 'Annulla'}
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>

<!-- Edit Dialog -->
<Dialog bind:open={editDialogOpen}>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>Modifica dispositivo</DialogTitle>
		</DialogHeader>
		{#if editDevice}
			<form method="POST" action="?/update" use:enhance class="space-y-4">
				<input type="hidden" name="id" value={editDevice.id} />

				<div class="space-y-2">
					<label class="text-sm font-medium">ID dispositivo</label>
					<Input value={editDevice.deviceId} disabled class="bg-gray-100" />
					<p class="text-xs text-gray-500">L’ID dispositivo non può essere modificato.</p>
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium">Posizione</label>
					<Input name="location" value={editDevice.location || ''} />
				</div>

				<div class="space-y-2">
					<label class="text-sm font-medium">Stato</label>
					<select name="active" class="w-full rounded border px-3 py-2 text-sm">
						<option value="true" selected={editDevice.active}>Attivo</option>
						<option value="false" selected={!editDevice.active}>Disabilitato</option>
					</select>
				</div>

				{#if form?.error && form?.action === 'update'}
					<p class="text-sm text-red-600">{form.error}</p>
				{/if}

				<DialogFooter>
					<Button type="button" variant="outline" onclick={() => (editDialogOpen = false)}
						>Annulla</Button
					>
					<Button type="submit">Salva modifiche</Button>
				</DialogFooter>
			</form>
		{/if}
	</DialogContent>
</Dialog>

<!-- Delete Dialog -->
<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Elimina dispositivo</DialogTitle>
		</DialogHeader>
		<p>
			Sei sicuro di voler eliminare il dispositivo <strong>{deleteDevice?.deviceId}</strong>?
		</p>
		<p class="text-sm text-gray-600">
			L’accesso del dispositivo verrà revocato in modo permanente. Per tornare operativo dovrà
			essere registrato di nuovo.
		</p>
		{#if form?.error && form?.action === 'delete'}
			<p class="text-sm text-red-600">{form.error}</p>
		{/if}
		<DialogFooter>
			<Button variant="outline" onclick={() => (deleteDialogOpen = false)}>Annulla</Button>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() =>
					({ update }) => {
						update();
						deleteDialogOpen = false;
					}}
			>
				<input type="hidden" name="id" value={deleteDevice?.id} />
				<Button type="submit" variant="destructive">Elimina</Button>
			</form>
		</DialogFooter>
	</DialogContent>
</Dialog>
