<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Table,
		TablePanel,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TablePagination,
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
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { Pencil, Trash2, Plus } from '@lucide/svelte';
	import { connection, disconnect } from '$lib/stores/webserial.svelte';
	import { formatDateTimeIT } from '$lib/utils/date.js';
	import { DEVICE_TYPE } from '$lib/labels';
	import DeviceFormDialog from './DeviceFormDialog.svelte';
	import DeviceTokenDialog from './DeviceTokenDialog.svelte';
	import DeviceProvisionerDialog from './DeviceProvisionerDialog.svelte';

	let { data, form } = $props();

	type Device = (typeof data.devices)[number];

	const serialSupported = browser && 'serial' in navigator;
	const apiUrl = $derived(page.url.origin);

	let createDialogOpen = $state(false);
	let editDevice = $state<Device | null>(null);
	let editDialogOpen = $state(false);
	let deleteDevice = $state<Device | null>(null);
	let deleteDialogOpen = $state(false);
	let provisionerOpen = $state(false);

	// Il token viene restituito una sola volta dall'azione `create`: il dialog si apre a ogni
	// nuova registrazione riuscita e l'utente può chiuderlo.
	const created = $derived(
		form?.action === 'create' && form.success && form.token
			? { deviceId: form.deviceId ?? '', token: form.token }
			: null
	);
	let tokenDialogOpen = $derived(created !== null);

	const actionError = (action: string) =>
		form && 'error' in form && form.action === action ? (form.error ?? null) : null;

	async function openProvisioner() {
		tokenDialogOpen = false;
		// Web Serial non consente due connessioni alla stessa porta: il provisioner apre la
		// propria, quindi chiudiamo prima quella della toolbar.
		if (connection.state === 'connected') await disconnect();
		provisionerOpen = true;
	}

	function formatDate(date: Date | null) {
		if (!date) return 'Mai';
		return formatDateTimeIT(date, { seconds: true });
	}

	function openEdit(device: Device) {
		editDevice = device;
		editDialogOpen = true;
	}

	function buildListUrl(pageNumber: number): string {
		const params = new URLSearchParams();
		if (pageNumber > 1) params.set('page', String(pageNumber));
		if (data.q) params.set('q', data.q);
		return params.size ? `?${params}` : '?';
	}
</script>

<div class="space-y-4">
	<PageHeader
		title="Dispositivi"
		description="Gestisci i lettori delle presenze e i dispositivi per scrivere le tessere. Controlla lo stato e autorizza nuovi dispositivi."
	>
		<Button onclick={() => (createDialogOpen = true)} data-tutorial="device.create"
			><Plus size={16} aria-hidden="true" /> Registra dispositivo</Button
		>
	</PageHeader>

	<form method="GET" class="filter-panel" data-sveltekit-keepfocus>
		<label class="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
			Cerca dispositivi
			<Input
				type="search"
				name="q"
				placeholder="Cerca ID dispositivo o posizione..."
				value={data.q}
				class="w-full"
			/>
		</label>
		<Button type="submit" variant="outline" data-tutorial="filter.apply">Filtra</Button>
		{#if data.q}
			<Button href="/devices" variant="ghost" data-tutorial="filter.reset">Azzera</Button>
		{/if}
	</form>

	<TablePanel>
		<Table embedded>
			<TableHeader>
				<TableRow>
					<TableHead>ID dispositivo</TableHead>
					<TableHead>Tipo</TableHead>
					<TableHead>Posizione</TableHead>
					<TableHead>Stato</TableHead>
					<TableHead>Ultimo ping</TableHead>
					<TableHead>Firmware</TableHead>
					<TableHead class="w-px text-right">Azioni</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.devices as device (device.id)}
					{@const type = DEVICE_TYPE[device.deviceType]}
					<TableRow>
						<TableCell class="font-mono text-sm">{device.deviceId}</TableCell>
						<TableCell>
							<Badge variant={type?.variant ?? 'outline'}>{type?.label ?? device.deviceType}</Badge>
						</TableCell>
						<TableCell>{device.location || '—'}</TableCell>
						<TableCell>
							<span class="inline-flex items-center gap-1.5">
								<span
									class="h-2 w-2 rounded-full {device.active ? 'bg-green-500' : 'bg-slate-400'}"
									aria-hidden="true"
								></span>
								<span class="text-sm {device.active ? 'text-green-700' : 'text-muted-foreground'}"
									>{device.active ? 'Attivo' : 'Disabilitato'}</span
								>
							</span>
						</TableCell>
						<TableCell class="text-sm text-muted-foreground"
							>{formatDate(device.lastPing)}</TableCell
						>
						<TableCell class="text-sm text-muted-foreground"
							>{device.firmwareVersion || '—'}</TableCell
						>
						<TableCell class="w-px text-right whitespace-nowrap">
							<div class="flex items-center justify-end gap-1">
								<Button
									size="icon-sm"
									variant="ghost"
									onclick={() => openEdit(device)}
									aria-label={`Modifica ${device.deviceId}`}
									data-tutorial-title={`Modifica ${device.deviceId}`}
									data-tutorial-description="Apre il modulo per cambiare la posizione o lo stato operativo di questo dispositivo."
								>
									<Pencil size={16} aria-hidden="true" />
								</Button>
								<Button
									size="icon-sm"
									variant="destructive-ghost"
									onclick={() => {
										deleteDevice = device;
										deleteDialogOpen = true;
									}}
									aria-label={`Elimina ${device.deviceId}`}
									data-tutorial-title={`Elimina ${device.deviceId}`}
									data-tutorial-description="Apre la conferma per eliminare questo dispositivo e revocarne l’accesso."
								>
									<Trash2 size={16} aria-hidden="true" />
								</Button>
							</div>
						</TableCell>
					</TableRow>
				{:else}
					<TableRow>
						<TableCell colspan={7} data-empty>
							Nessun dispositivo registrato.
							<Button
								variant="link"
								onclick={() => (createDialogOpen = true)}
								data-tutorial-title="Registrane uno ora"
								data-tutorial-description="Apre il modulo per autorizzare il primo dispositivo e generare le sue credenziali."
								>Registrane uno ora</Button
							>
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>

		<TablePagination
			page={data.page}
			totalPages={data.totalPages}
			total={data.total}
			getPageHref={buildListUrl}
			ariaLabel="Paginazione dispositivi"
		/>
	</TablePanel>
</div>

<DeviceFormDialog bind:open={createDialogOpen} error={actionError('create')} />

{#if editDevice}
	{#key editDevice.id}
		<DeviceFormDialog
			bind:open={editDialogOpen}
			device={editDevice}
			error={actionError('update')}
		/>
	{/key}
{/if}

<DeviceTokenDialog
	bind:open={tokenDialogOpen}
	deviceId={created?.deviceId ?? ''}
	token={created?.token ?? ''}
	{apiUrl}
	{serialSupported}
	onProvision={openProvisioner}
/>

<DeviceProvisionerDialog
	bind:open={provisionerOpen}
	deviceId={created?.deviceId ?? ''}
	token={created?.token ?? ''}
	{apiUrl}
/>

<Dialog bind:open={deleteDialogOpen}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>Elimina dispositivo</DialogTitle>
		</DialogHeader>
		<p>
			Sei sicuro di voler eliminare il dispositivo <strong>{deleteDevice?.deviceId}</strong>?
		</p>
		<p class="text-sm text-muted-foreground">
			L’accesso del dispositivo verrà revocato in modo permanente. Per tornare operativo dovrà
			essere registrato di nuovo.
		</p>
		{#if actionError('delete')}
			<p class="text-sm text-red-600" role="alert">{actionError('delete')}</p>
		{/if}
		<DialogFooter>
			<Button
				variant="outline"
				onclick={() => (deleteDialogOpen = false)}
				data-tutorial="dialog.cancel">Annulla</Button
			>
			<form
				method="POST"
				action="?/delete"
				use:enhance={() =>
					async ({ result, update }) => {
						await update();
						if (result.type === 'success') deleteDialogOpen = false;
					}}
			>
				<input type="hidden" name="id" value={deleteDevice?.id} />
				<Button type="submit" variant="destructive" data-tutorial="item.delete">Elimina</Button>
			</form>
		</DialogFooter>
	</DialogContent>
</Dialog>
