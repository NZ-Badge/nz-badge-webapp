<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import EmailAutocomplete from '$lib/components/EmailAutocomplete.svelte';
	import { Input } from '$lib/components/ui/input';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import { toRomeDateTimeInputValue } from '$lib/utils/date';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';

	type UserOption = { id: number; name: string; email?: string | null };

	let {
		open = $bindable(false),
		users,
		defaultUserId,
		canSelectUser,
		onsaved
	}: {
		open?: boolean;
		users: UserOption[];
		defaultUserId: number;
		canSelectUser: boolean;
		onsaved?: () => void | Promise<void>;
	} = $props();

	let userId = $state(0);
	let userEmail = $state('');
	let eventType = $state<'entry' | 'exit'>('entry');
	let readTimestamp = $state('');
	let note = $state('');
	let submitting = $state(false);
	let error = $state('');
	const emailOptions = $derived(
		users.flatMap((user) =>
			user.email ? [{ id: user.id, name: user.name, email: user.email }] : []
		)
	);

	function nowInRomeInput(): string {
		return toRomeDateTimeInputValue();
	}

	$effect(() => {
		if (open) {
			const defaultUser = users.find((user) => user.id === defaultUserId) ?? users[0];
			userId = defaultUser?.id ?? 0;
			userEmail = defaultUser?.email ?? '';
			eventType = 'entry';
			readTimestamp = nowInRomeInput();
			note = '';
			error = '';
		}
	});

	async function submit() {
		error = '';
		if (!userId) {
			error = 'Seleziona un collaboratore.';
			return;
		}
		if (!readTimestamp) {
			error = 'Inserisci data e ora.';
			return;
		}
		submitting = true;
		try {
			const response = await fetch('/api/v1/staff-attendance', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ userId, eventType, readTimestamp, note: note.trim() || undefined })
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) throw new Error(body.error ?? 'Inserimento non riuscito');

			open = false;
			note = '';
			readTimestamp = nowInRomeInput();
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
				Gli inserimenti con una data precedente saranno contrassegnati come retrodatati.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			{#if canSelectUser}
				<div class="space-y-2">
					<Label for="manual-user">Email collaboratore</Label>
					<EmailAutocomplete
						id="manual-user"
						bind:value={userEmail}
						options={emailOptions}
						onselect={(user) => (userId = user?.id ?? 0)}
					/>
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="manual-event-type">Tipo</Label>
				<select
					id="manual-event-type"
					bind:value={eventType}
					class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
				>
					<option value="entry">Ingresso</option>
					<option value="exit">Uscita</option>
				</select>
			</div>

			<div class="space-y-2">
				<Label for="manual-time">Data e ora</Label>
				<DatePicker id="manual-time" withTime bind:value={readTimestamp} />
			</div>

			<div class="space-y-2">
				<Label for="manual-note">Nota (facoltativa)</Label>
				<Input id="manual-note" maxlength={255} bind:value={note} />
			</div>

			{#if error}<p class="text-sm text-red-600">{error}</p>{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)} disabled={submitting}>Annulla</Button
			>
			<Button onclick={submit} disabled={submitting}>
				{submitting ? 'Inserimento…' : 'Inserisci'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
