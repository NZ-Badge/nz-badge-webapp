<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import EmailAutocomplete from '$lib/components/EmailAutocomplete.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';

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
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'Europe/Rome',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hourCycle: 'h23'
		}).formatToParts(new Date());
		const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
		return `${value.year}-${value.month}-${value.day}T${value.hour}:${value.minute}`;
	}

	$effect(() => {
		if (open) {
			const defaultSubscriber = subscribers[0];
			subscriberId = defaultSubscriber?.id ?? 0;
			subscriberEmail = defaultSubscriber?.email ?? '';
			eventType = 'entry';
			readTimestamp = nowInRomeInput();
			note = '';
			error = '';
		}
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
			const response = await fetch('/api/v1/attendance/manual', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subscriberId,
					eventType,
					readTimestamp,
					note: note.trim() || undefined
				})
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? 'Inserimento non riuscito');

			open = false;
			note = '';
			await onsaved?.();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Inserimento non riuscito';
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
				<select
					id="subscriber-manual-event-type"
					bind:value={eventType}
					class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
				>
					<option value="entry">Ingresso</option>
					<option value="exit">Uscita</option>
				</select>
			</div>

			<div class="space-y-2">
				<Label for="subscriber-manual-time">Data e ora</Label>
				<Input id="subscriber-manual-time" type="datetime-local" bind:value={readTimestamp} />
			</div>

			<div class="space-y-2">
				<Label for="subscriber-manual-note">Nota (facoltativa)</Label>
				<Input id="subscriber-manual-note" maxlength={255} bind:value={note} />
			</div>

			{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={submitting}>Annulla</Button
			>
			<Button onclick={submit} disabled={submitting || subscribers.length === 0}>
				{submitting ? 'Inserimento…' : 'Inserisci'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
