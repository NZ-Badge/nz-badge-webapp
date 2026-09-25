<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker/index.js';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Label } from '$lib/components/ui/label';
	import { toRomeDateTimeInputValue } from '$lib/utils/date.js';
	import { apiFetch, errorMessage } from '$lib/utils/http';

	type Props = {
		open?: boolean;
		/** Endpoint che accetta `PATCH { id, readTimestamp }`. */
		endpoint: '/api/v1/attendance' | '/api/v1/staff-attendance';
		/** Presenza da modificare; `null` quando il dialog è chiuso. */
		record: { id: number; readTimestamp: Date | string } | null;
		description?: string;
		onsaved?: () => unknown;
	};

	let {
		open = $bindable(false),
		endpoint,
		record,
		description = 'È possibile modificare soltanto data e ora della presenza.',
		onsaved
	}: Props = $props();

	// Writable $derived: si ricalcola a ogni apertura (legge `open`) e resta modificabile.
	let timestamp = $derived(
		open && record ? toRomeDateTimeInputValue(new Date(record.readTimestamp)) : ''
	);
	let error = $state('');
	let busy = $state(false);

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (!record || !timestamp) {
			error = 'Inserisci data e ora.';
			return;
		}
		busy = true;
		error = '';
		try {
			await apiFetch(endpoint, {
				method: 'PATCH',
				body: { id: record.id, readTimestamp: timestamp }
			});
			open = false;
			toast.success('Orario aggiornato');
			await onsaved?.();
		} catch (err) {
			error = errorMessage(err, 'Modifica non riuscita');
		} finally {
			busy = false;
		}
	}
</script>

<Dialog.Root
	bind:open
	onOpenChange={(next) => {
		if (!next) error = '';
	}}
>
	<Dialog.Content class="sm:max-w-sm">
		<form class="grid gap-4" onsubmit={save}>
			<Dialog.Header>
				<Dialog.Title>Modifica orario</Dialog.Title>
				<Dialog.Description>{description}</Dialog.Description>
			</Dialog.Header>
			<div class="space-y-2 py-2">
				<Label for="attendance-edit-time">Data e ora</Label>
				<DatePicker
					id="attendance-edit-time"
					withTime
					required
					bind:value={timestamp}
					aria-invalid={!!error}
					data-tutorial="field.datetime"
				/>
				{#if error}
					<p class="text-sm text-red-600" role="alert">{error}</p>
				{/if}
			</div>
			<Dialog.Footer class="gap-2">
				<Button
					variant="secondary"
					onclick={() => (open = false)}
					disabled={busy}
					data-tutorial="dialog.cancel">Annulla</Button
				>
				<Button
					type="submit"
					disabled={busy}
					data-tutorial-title="Salva orario"
					data-tutorial-description="Salva la nuova data e ora della presenza. I totali vengono ricalcolati."
				>
					{busy ? 'Salvataggio…' : 'Salva'}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
