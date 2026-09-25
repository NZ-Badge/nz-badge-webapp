<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import EmailAutocomplete from '$lib/components/EmailAutocomplete.svelte';
	import { Input } from '$lib/components/ui/input';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { toRomeDateTimeInputValue } from '$lib/utils/date';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { EVENT_TYPE } from '$lib/labels';
	import { apiFetch, errorMessage } from '$lib/utils/http';
	import { untrack } from 'svelte';

	type SubscriberOption = { id: number; name: string; email: string };

	let {
		open = $bindable(false),
		subscribers,
		onsaved
	}: {
		open?: boolean;
		subscribers: SubscriberOption[];
		onsaved?: () => void | Promise<void>;
	} = $props();

	let subscriberId = $state(0);
	let subscriberEmail = $state('');
	let eventType = $state<'entry' | 'exit'>('entry');
	let readTimestamp = $state('');
	let note = $state('');
	let submitting = $state(false);
	let error = $state('');

	function nowInRomeInput(): string {
		return toRomeDateTimeInputValue();
	}

	// Ripristina il modulo a ogni apertura (non quando cambia l'elenco degli iscritti).
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const defaultSubscriber = subscribers[0];
			subscriberId = defaultSubscriber?.id ?? 0;
			subscriberEmail = defaultSubscriber?.email ?? '';
			eventType = 'entry';
			readTimestamp = nowInRomeInput();
			note = '';
			error = '';
		});
	});

	async function submit() {
		error = '';
		if (!subscriberId) {
			error = 'Seleziona un iscritto.';
			return;
		}
		if (!readTimestamp) {
			error = 'Inserisci data e ora.';
			return;
		}

		submitting = true;
		try {
			await apiFetch('/api/v1/attendance/manual', {
				method: 'POST',
				body: {
					subscriberId,
					eventType,
					readTimestamp,
					note: note.trim() || undefined
				}
			});

			open = false;
			note = '';
			await onsaved?.();
		} catch (err) {
			error = errorMessage(err, 'Inserimento non riuscito');
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Inserisci ingresso o uscita</Dialog.Title>
			<Dialog.Description>
				Aggiungi manualmente un evento alla cronologia di un iscritto.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<div class="space-y-2">
				<Label for="subscriber-manual-person">Email iscritto</Label>
				<EmailAutocomplete
					id="subscriber-manual-person"
					bind:value={subscriberEmail}
					options={subscribers}
					onselect={(subscriber) => (subscriberId = subscriber?.id ?? 0)}
				/>
			</div>

			<div class="space-y-2">
				<Label for="subscriber-manual-event-type">Tipo</Label>
				<NativeSelect
					id="subscriber-manual-event-type"
					bind:value={eventType}
					class="w-full"
					data-tutorial="field.event-type"
				>
					<NativeSelectOption value="entry">{EVENT_TYPE.entry.label}</NativeSelectOption>
					<NativeSelectOption value="exit">{EVENT_TYPE.exit.label}</NativeSelectOption>
				</NativeSelect>
			</div>

			<div class="space-y-2">
				<Label for="subscriber-manual-time">Data e ora</Label>
				<DatePicker
					id="subscriber-manual-time"
					withTime
					bind:value={readTimestamp}
					aria-label="Data e ora dell'evento"
					data-tutorial="field.datetime"
				/>
			</div>

			<div class="space-y-2">
				<Label for="subscriber-manual-note">Nota (facoltativa)</Label>
				<Input
					id="subscriber-manual-note"
					maxlength={255}
					bind:value={note}
					data-tutorial="field.note"
				/>
			</div>

			{#if error}<p class="text-sm text-red-600" role="alert">{error}</p>{/if}
		</div>

		<Dialog.Footer>
			<Button
				variant="outline"
				onclick={() => (open = false)}
				disabled={submitting}
				data-tutorial="dialog.cancel">Annulla</Button
			>
			<Button
				onclick={submit}
				disabled={submitting || subscribers.length === 0}
				data-tutorial="attendance.manual-entry-confirm"
			>
				{submitting ? 'Inserimento…' : 'Inserisci'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
