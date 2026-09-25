<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Trash2 } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { apiFetch } from '$lib/utils/http';

	let { id, eventType }: { id: number; eventType: 'entry' | 'exit' } = $props();
	let open = $state(false);

	async function remove() {
		await apiFetch('/api/v1/staff-attendance', { method: 'DELETE', body: { id } });
		toast.success('Strisciata eliminata');
		await invalidateAll();
	}
</script>

<Button
	size="icon-sm"
	variant="destructive-ghost"
	aria-label={`Elimina ${eventType === 'entry' ? 'ingresso' : 'uscita'}`}
	data-tutorial-title="Elimina strisciata"
	data-tutorial-description="Apre la conferma per eliminare definitivamente questa strisciata errata. Le ore lavorate vengono ricalcolate."
	onclick={() => (open = true)}><Trash2 size={16} /></Button
>

<ConfirmDialog
	bind:open
	title="Elimina strisciata"
	description={`Eliminare definitivamente ${eventType === 'entry' ? 'questo ingresso' : 'questa uscita'}? Il totale delle ore verrà ricalcolato.`}
	confirmLabel="Elimina"
	busyLabel="Eliminazione…"
	variant="destructive"
	onConfirm={remove}
/>
