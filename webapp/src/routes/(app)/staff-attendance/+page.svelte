<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { navigating } from '$app/stores';
	import { History, Pencil, Plus } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';
	import StaffManualEntryDialog from '$lib/components/StaffManualEntryDialog.svelte';

	let { data } = $props();
	let manualOpen = $state(false);
	let editOpen = $state(false);
	let editingId = $state<number | null>(null);
	let editTimestamp = $state('');
	let editError = $state('');
	let editBusy = $state(false);
	const isLoading = $derived(Boolean($navigating));

	function formatDateTime(value: Date | string | null): string {
		return value
			? new Date(value).toLocaleString('it-IT', {
					timeZone: 'Europe/Rome',
					dateStyle: 'short',
					timeStyle: 'medium'
				})
			: '—';
	}

	function toRomeInput(value: Date | string): string {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Rome',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date(value));
		const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
		return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
	}

	function sourceLabel(source: string): string {
		return source === 'card' ? 'Card RFID' : source === 'manual' ? 'Manuale' : 'Pulsante Home';
	}

	function buildUrl(page: number, form?: FormData): string {
		const params = new URLSearchParams();
		if (page > 1) params.set('page', String(page));
		const currentValues: Record<string, string> = {
			from: data.from,
			to: data.to,
			user: data.userQuery,
			device: data.device,
			source: data.source
		};
		for (const key of ['from', 'to', 'user', 'device', 'source']) {
			const value = form ? String(form.get(key) ?? '') : currentValues[key];
			if (value) params.set(key, value);
		}
		return `/staff-attendance${params.size ? `?${params}` : ''}`;
	}

	function filter(event: SubmitEvent) {
		event.preventDefault();
		goto(buildUrl(1, new FormData(event.currentTarget as HTMLFormElement)));
	}

	function openEdit(row: { id: number; readTimestamp: Date | string }) {
		editingId = row.id;
		editTimestamp = toRomeInput(row.readTimestamp);
		editError = '';
		editOpen = true;
	}

	async function saveEdit() {
		if (!editingId || !editTimestamp) return;
		editBusy = true;
		editError = '';
		try {
			const response = await fetch('/api/v1/staff-attendance', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id: editingId, readTimestamp: editTimestamp })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? 'Modifica non riuscita');
			editOpen = false;
			await invalidateAll();
		} catch (err) {
			editError = err instanceof Error ? err.message : 'Modifica non riuscita';
		} finally {
			editBusy = false;
		}
	}
</script>

<div class="space-y-5">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div>
			<h1 class="text-2xl font-bold">Ingressi collaboratori</h1>
			<p class="text-sm text-muted-foreground">{data.total} eventi registrati</p>
		</div>
		<Button onclick={() => (manualOpen = true)}><Plus size={16} /> Inserisci evento</Button>
	</div>

	<form onsubmit={filter} class="flex flex-wrap items-end gap-3">
		<div class="space-y-1">
			<Label for="from">Dal</Label><Input
				id="from"
				name="from"
				type="date"
				value={data.from}
				class="w-40"
			/>
		</div>
		<div class="space-y-1">
			<Label for="to">Al</Label><Input id="to" name="to" type="date" value={data.to} class="w-40" />
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
			<Label for="source">Sorgente</Label><select
				id="source"
				name="source"
				value={data.source}
				class="h-10 rounded-md border bg-background px-3 text-sm"
				><option value="">Tutte</option><option value="card">Card RFID</option><option
					value="manual">Manuale</option
				><option value="simulation">Pulsante Home</option></select
			>
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
		<Button type="submit" variant="outline" disabled={isLoading}>Filtra</Button>
		<Button type="button" variant="ghost" onclick={() => goto('/staff-attendance')}>Azzera</Button>
	</form>

	<div class="relative rounded-lg border bg-white">
		{#if isLoading}<div
				class="absolute inset-0 z-10 grid place-items-center bg-white/60 text-sm text-muted-foreground"
			>
				Caricamento…
			</div>{/if}
		<Table>
			<TableHeader
				><TableRow
					><TableHead>Data/ora</TableHead>{#if data.canManage}<TableHead>Utente</TableHead
						>{/if}<TableHead>Evento</TableHead><TableHead>Sorgente</TableHead><TableHead
						>Dispositivo</TableHead
					><TableHead>Offline</TableHead>{#if data.canManage}<TableHead class="text-right"
							>Azioni</TableHead
						>{/if}</TableRow
				></TableHeader
			>
			<TableBody>
				{#if data.rows.length === 0}<TableRow
						><TableCell
							colspan={data.canManage ? 7 : 5}
							class="h-28 text-center text-muted-foreground">Nessun ingresso trovato.</TableCell
						></TableRow
					>{/if}
				{#each data.rows as row}
					<TableRow>
						<TableCell
							><span class="inline-flex items-center gap-1.5 font-mono text-xs"
								>{formatDateTime(row.readTimestamp)}{#if row.isBackdated}<History
										size={14}
										class="text-amber-600"
										aria-label="Inserimento retrodatato"
										><title>Inserimento manuale retrodatato</title></History
									>{/if}</span
							></TableCell
						>
						{#if data.canManage}<TableCell
								><a href="/admin/users/{row.userId}" class="font-medium hover:underline"
									>{row.userName}</a
								>
								<div class="text-xs text-muted-foreground">{row.userEmail}</div></TableCell
							>{/if}
						<TableCell
							><Badge variant={row.eventType === 'entry' ? 'default' : 'secondary'}
								>{row.eventType === 'entry' ? 'Ingresso' : 'Uscita'}</Badge
							></TableCell
						>
						<TableCell>{sourceLabel(row.source)}</TableCell><TableCell
							class="text-xs text-muted-foreground">{row.deviceId ?? '—'}</TableCell
						><TableCell>{row.offlineQueued ? '✓' : ''}</TableCell>
						{#if data.canManage}<TableCell class="text-right"
								><Button
									size="icon"
									variant="ghost"
									title="Modifica orario"
									onclick={() => openEdit(row)}><Pencil size={15} /></Button
								></TableCell
							>{/if}
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	{#if data.totalPages > 1}<div class="flex items-center justify-between text-sm">
			<span>Pagina {data.page} di {data.totalPages}</span>
			<div class="flex gap-2">
				<Button
					variant="outline"
					size="sm"
					disabled={data.page <= 1}
					onclick={() => goto(buildUrl(data.page - 1))}>Precedente</Button
				><Button
					variant="outline"
					size="sm"
					disabled={data.page >= data.totalPages}
					onclick={() => goto(buildUrl(data.page + 1))}>Successiva</Button
				>
			</div>
		</div>{/if}
</div>

<StaffManualEntryDialog
	bind:open={manualOpen}
	users={data.activeUsers}
	defaultUserId={data.actorId}
	canSelectUser={data.canManage}
	onsaved={invalidateAll}
/>

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="sm:max-w-sm"
		><Dialog.Header
			><Dialog.Title>Modifica orario</Dialog.Title><Dialog.Description
				>È possibile modificare soltanto data e ora della strisciata.</Dialog.Description
			></Dialog.Header
		>
		<div class="space-y-2 py-2">
			<Label for="edit-time">Data e ora</Label><Input
				id="edit-time"
				type="datetime-local"
				bind:value={editTimestamp}
			/>{#if editError}<p class="text-sm text-red-600">{editError}</p>{/if}
		</div>
		<Dialog.Footer
			><Button variant="outline" onclick={() => (editOpen = false)}>Annulla</Button><Button
				onclick={saveEdit}
				disabled={editBusy}>{editBusy ? 'Salvataggio…' : 'Salva'}</Button
			></Dialog.Footer
		></Dialog.Content
	>
</Dialog.Root>
