<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { invalidateAll } from '$app/navigation';
	import { navigating } from '$app/state';
	import { toast } from 'svelte-sonner';
	import { History, Pencil, Plus, Trash2 } from '@lucide/svelte';
	import AttendanceEditDialog from '$lib/components/AttendanceEditDialog.svelte';
	import AttendanceExportDialog from '$lib/components/AttendanceExportDialog.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { eventType } from '$lib/labels';
	import { formatDateTimeIT } from '$lib/utils/date.js';
	import { apiFetch } from '$lib/utils/http';
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
	import StaffManualEntryDialog from '$lib/components/StaffManualEntryDialog.svelte';

	let { data } = $props();
	type Row = (typeof data.rows)[number];

	let manualOpen = $state(false);
	let exportDialogOpen = $state(false);
	let editOpen = $state(false);
	let editing = $state<Row | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state<Row | null>(null);
	const isLoading = $derived(Boolean(navigating.to));

	function sourceLabel(source: string): string {
		return source === 'card' ? 'Card RFID' : source === 'manual' ? 'Manuale' : 'Pulsante Home';
	}

	function pageHref(pageNumber: number): string {
		const params = new URLSearchParams();
		if (pageNumber > 1) params.set('page', String(pageNumber));
		const values: Record<string, string> = {
			from: data.from,
			to: data.to,
			user: data.userQuery,
			device: data.device,
			source: data.source
		};
		for (const [key, value] of Object.entries(values)) {
			if (value) params.set(key, value);
		}
		return `/staff-attendance${params.size ? `?${params}` : ''}`;
	}

	function openEdit(row: Row) {
		editing = row;
		editOpen = true;
	}

	function openDelete(row: Row) {
		deleting = row;
		deleteOpen = true;
	}

	async function deleteOne() {
		if (!deleting) return;
		await apiFetch('/api/v1/staff-attendance', { method: 'DELETE', body: { id: deleting.id } });
		toast.success('Strisciata eliminata');
		await invalidateAll();
	}
</script>

<div class="space-y-5">
	<PageHeader
		title="Ingressi collaboratori"
		description="Consulta gli ingressi e le uscite del personale. Usa i filtri per trovare una persona o controllare un periodo."
	>
		<div class="flex flex-wrap items-center gap-2">
			<Button
				variant="outline"
				onclick={() => (exportDialogOpen = true)}
				data-tutorial="attendance.export">Esporta CSV</Button
			>
			<Button onclick={() => (manualOpen = true)} data-tutorial="attendance.manual-entry"
				><Plus size={16} /> Inserisci evento</Button
			>
		</div>
	</PageHeader>

	<AttendanceExportDialog
		bind:open={exportDialogOpen}
		endpoint="/api/v1/staff-attendance/export"
		subjectLabel="collaboratore"
		emailOptions={data.exportUsers}
		defaultFrom={data.from || data.exportDefaultRange.from}
		defaultTo={data.to || data.exportDefaultRange.to}
		defaultEmail={data.userQuery.includes('@') ? data.userQuery : ''}
		listId="staff-export-emails"
	/>

	<form method="GET" action="/staff-attendance" class="filter-panel">
		<div class="space-y-1">
			<Label for="from">Dal</Label>
			<DatePicker
				id="from"
				name="from"
				value={data.from}
				class="w-40"
				aria-label="Data iniziale"
				data-tutorial="field.from"
			/>
		</div>
		<div class="space-y-1">
			<Label for="to">Al</Label>
			<DatePicker
				id="to"
				name="to"
				value={data.to}
				class="w-40"
				aria-label="Data finale"
				data-tutorial="field.to"
			/>
		</div>
		{#if data.canManage}<div class="space-y-1">
				<Label for="user">Utente</Label><Input
					id="user"
					name="user"
					value={data.userQuery}
					placeholder="Nome o email…"
					class="w-48"
				/>
			</div>{/if}
		<div class="space-y-1">
			<Label for="source">Sorgente</Label>
			<NativeSelect id="source" name="source" value={data.source} data-tutorial="field.source">
				<NativeSelectOption value="">Tutte</NativeSelectOption>
				<NativeSelectOption value="card">Card RFID</NativeSelectOption>
				<NativeSelectOption value="manual">Manuale</NativeSelectOption>
				<NativeSelectOption value="simulation">Pulsante Home</NativeSelectOption>
			</NativeSelect>
		</div>
		<div class="space-y-1">
			<Label for="device">Dispositivo</Label><Input
				id="device"
				name="device"
				value={data.device}
				placeholder="ID dispositivo…"
				class="w-40"
			/>
		</div>
		<Button type="submit" variant="outline" disabled={isLoading} data-tutorial="filter.apply"
			>Filtra</Button
		>
		<Button href="/staff-attendance" variant="ghost" data-tutorial="filter.reset">Azzera</Button>
	</form>

	<TablePanel aria-busy={isLoading}>
		{#if isLoading}<div data-slot="table-loading" role="status">Caricamento…</div>{/if}
		<Table embedded>
			<TableHeader
				><TableRow
					><TableHead>Data/ora</TableHead>{#if data.canManage}<TableHead>Utente</TableHead
						>{/if}<TableHead>Evento</TableHead><TableHead>Sorgente</TableHead><TableHead
						>Dispositivo</TableHead
					><TableHead>Offline</TableHead>{#if data.canManage}<TableHead class="w-px text-right"
							>Azioni</TableHead
						>{/if}</TableRow
				></TableHeader
			>
			<TableBody>
				{#if data.rows.length === 0}<TableRow
						><TableCell colspan={data.canManage ? 7 : 5} data-empty
							>Nessun ingresso trovato.</TableCell
						></TableRow
					>{/if}
				{#each data.rows as row (row.id)}
					<TableRow>
						<TableCell
							><span class="inline-flex items-center gap-1.5 font-mono text-xs"
								>{formatDateTimeIT(row.readTimestamp, { seconds: true }) ||
									'—'}{#if row.isBackdated}<History
										size={14}
										class="text-amber-600"
										aria-label="Inserimento retrodatato"
										><title>Inserimento manuale retrodatato</title></History
									>{/if}</span
							></TableCell
						>
						{#if data.canManage}<TableCell
								><a href="/admin/users/{row.userId}" class="app-link font-medium">{row.userName}</a>
								<div class="text-xs text-muted-foreground">{row.userEmail}</div></TableCell
							>{/if}
						<TableCell
							><Badge variant={eventType(row.eventType).variant}
								>{eventType(row.eventType).label}</Badge
							></TableCell
						>
						<TableCell>{sourceLabel(row.source)}</TableCell><TableCell
							class="text-xs text-muted-foreground">{row.deviceId ?? '—'}</TableCell
						><TableCell>{row.offlineQueued ? '✓' : ''}</TableCell>
						{#if data.canManage}<TableCell class="w-px whitespace-nowrap text-right"
								><div class="flex items-center justify-end gap-1">
									<Button
										size="icon-sm"
										variant="ghost"
										aria-label="Modifica orario"
										data-tutorial="attendance.edit-time"
										onclick={() => openEdit(row)}><Pencil size={16} /></Button
									><Button
										size="icon-sm"
										variant="destructive-ghost"
										aria-label={`Elimina ${eventType(row.eventType).lower} di ${row.userName}`}
										data-tutorial-title="Elimina strisciata"
										data-tutorial-description="Apre la conferma per eliminare definitivamente questo ingresso o questa uscita del collaboratore."
										onclick={() => openDelete(row)}><Trash2 size={16} /></Button
									>
								</div></TableCell
							>{/if}
					</TableRow>
				{/each}
			</TableBody>
		</Table>
		<TablePagination
			page={data.page}
			totalPages={data.totalPages}
			total={data.total}
			getPageHref={pageHref}
			disabled={isLoading}
			ariaLabel="Paginazione ingressi collaboratori"
		/>
	</TablePanel>
</div>

<StaffManualEntryDialog
	bind:open={manualOpen}
	users={data.activeUsers}
	defaultUserId={data.actorId}
	canSelectUser={data.canManage}
	onsaved={invalidateAll}
/>

<AttendanceEditDialog
	bind:open={editOpen}
	endpoint="/api/v1/staff-attendance"
	record={editing}
	description="È possibile modificare soltanto data e ora della strisciata."
	onsaved={invalidateAll}
/>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Elimina strisciata"
	description="Eliminare definitivamente questo ingresso o questa uscita? Il totale delle ore verrà ricalcolato."
	confirmLabel="Elimina"
	busyLabel="Eliminazione…"
	variant="destructive"
	onConfirm={deleteOne}
/>
