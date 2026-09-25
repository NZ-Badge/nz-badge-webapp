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

	// Ripristina il modulo a ogni apertura (non quando cambia l'elenco degli utenti).
	$effect(() => {
		if (!open) return;
		untrack(() => {
			const defaultUser = users.find((user) => user.id === defaultUserId) ?? users[0];
			userId = defaultUser?.id ?? 0;
			userEmail = defaultUser?.email ?? '';
			eventType = 'entry';
			readTimestamp = nowInRomeInput();
			note = '';
			error = '';
		});
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
			await apiFetch('/api/v1/staff-attendance', {
				method: 'POST',
				body: { userId, eventType, readTimestamp, note: note.trim() || undefined }
			});

			open = false;
			note = '';
			readTimestamp = nowInRomeInput();
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
				<NativeSelect
					id="manual-event-type"
					bind:value={eventType}
					class="w-full"
					data-tutorial="field.event-type"
				>
					<NativeSelectOption value="entry">{EVENT_TYPE.entry.label}</NativeSelectOption>
					<NativeSelectOption value="exit">{EVENT_TYPE.exit.label}</NativeSelectOption>
				</NativeSelect>
			</div>

			<div class="space-y-2">
				<Label for="manual-time">Data e ora</Label>
				<DatePicker
					id="manual-time"
					withTime
					bind:value={readTimestamp}
					aria-label="Data e ora dell'evento"
					data-tutorial="field.datetime"
				/>
			</div>

			<div class="space-y-2">
				<Label for="manual-note">Nota (facoltativa)</Label>
				<Input id="manual-note" maxlength={255} bind:value={note} data-tutorial="field.note" />
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
				disabled={submitting}
				data-tutorial="attendance.manual-entry-confirm"
			>
				{submitting ? 'Inserimento…' : 'Inserisci'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
