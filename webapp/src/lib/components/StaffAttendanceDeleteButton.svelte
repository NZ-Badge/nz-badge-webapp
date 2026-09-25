<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { Trash2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	let { id, eventType }: { id: number; eventType: 'entry' | 'exit' } = $props();
	let open = $state(false);
	let busy = $state(false);
	let error = $state('');

	async function remove() {
		busy = true;
		error = '';
		try {
			const response = await fetch('/api/v1/staff-attendance', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ id })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? 'Eliminazione non riuscita');
			open = false;
			await invalidateAll();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Eliminazione non riuscita';
		} finally {
			busy = false;
		}
	}
</script>

<Button
	size="icon-sm"
	variant="destructive-ghost"
	aria-label={`Elimina ${eventType === 'entry' ? 'ingresso' : 'uscita'}`}
	data-tutorial-title="Elimina strisciata"
	data-tutorial-description="Apre la conferma per eliminare definitivamente questa strisciata errata. Le ore lavorate vengono ricalcolate."
	onclick={() => {
		error = '';
		open = true;
	}}><Trash2 size={16} /></Button
>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-sm">
		<Dialog.Header>
			<Dialog.Title>Elimina strisciata</Dialog.Title>
			<Dialog.Description>
				Eliminare definitivamente questo {eventType === 'entry' ? 'ingresso' : 'uscita'}? Il totale
				delle ore verrà ricalcolato.
			</Dialog.Description>
		</Dialog.Header>
		{#if error}<p class="text-sm text-red-600" role="alert">{error}</p>{/if}
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={busy}>Annulla</Button>
			<Button variant="destructive" onclick={remove} disabled={busy}>
				{busy ? 'Eliminazione…' : 'Elimina'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
