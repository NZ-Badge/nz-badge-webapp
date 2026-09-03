<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import EmailAutocomplete from '$lib/components/EmailAutocomplete.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Dialog from '$lib/components/ui/dialog';

	type EmailOption = { name: string; email: string };

	let {
		open = $bindable(false),
		endpoint,
		subjectLabel,
		emailOptions,
		defaultFrom = '',
		defaultTo = '',
		defaultEmail = '',
		listId
	}: {
		open?: boolean;
		endpoint: string;
		subjectLabel: string;
		emailOptions: EmailOption[];
		defaultFrom?: string;
		defaultTo?: string;
		defaultEmail?: string;
		listId: string;
	} = $props();

	let exportMode = $state<'dates' | 'email'>('dates');
	let exportFrom = $state('');
	let exportTo = $state('');
	let exportEmail = $state('');
	let exportError = $state('');

	$effect(() => {
		if (!open) {
			exportMode = 'dates';
			exportFrom = defaultFrom;
			exportTo = defaultTo;
			exportEmail = defaultEmail;
			exportError = '';
		}
	});

	function submitExport() {
		exportError = '';
		const params = new URLSearchParams();

		if (exportMode === 'dates') {
			if (!exportFrom || !exportTo) {
				exportError = 'Inserisci sia la data inizio sia la data fine.';
				return;
			}
			if (exportFrom > exportTo) {
				exportError = 'La data inizio non può essere successiva alla data fine.';
				return;
			}
			params.set('from', exportFrom);
			params.set('to', exportTo);
		} else {
			const email = exportEmail.trim();
			const selectedEmail = emailOptions.find(
				(option) => option.email.toLocaleLowerCase() === email.toLocaleLowerCase()
			)?.email;
			if (!selectedEmail) {
				exportError = `Seleziona l’email di un ${subjectLabel} dall’elenco.`;
				return;
			}
			params.set('email', selectedEmail);
		}

		open = false;
		window.location.href = `${endpoint}?${params.toString()}`;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Esporta CSV</Dialog.Title>
			<Dialog.Description>
				Scegli un range di date oppure l’email di un {subjectLabel}.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<div class="grid gap-2 sm:grid-cols-2">
				<label
					class="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
					class:border-primary={exportMode === 'dates'}
				>
					<input type="radio" name={`${listId}-mode`} value="dates" bind:group={exportMode} />
					<span>Range date</span>
				</label>
				<label
					class="flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm"
					class:border-primary={exportMode === 'email'}
				>
					<input type="radio" name={`${listId}-mode`} value="email" bind:group={exportMode} />
					<span>Email {subjectLabel}</span>
				</label>
			</div>

			{#if exportMode === 'dates'}
				<div class="grid gap-3 sm:grid-cols-2">
					<div class="space-y-1">
						<Label for={`${listId}-from`}>Dal</Label>
						<Input id={`${listId}-from`} type="date" bind:value={exportFrom} />
					</div>
					<div class="space-y-1">
						<Label for={`${listId}-to`}>Al</Label>
						<Input id={`${listId}-to`} type="date" bind:value={exportTo} />
					</div>
				</div>
			{:else}
				<div class="space-y-1">
					<Label for={`${listId}-email`}>Email</Label>
					<EmailAutocomplete
						id={`${listId}-email`}
						bind:value={exportEmail}
						options={emailOptions}
					/>
					<p class="text-xs text-muted-foreground">
						Digita per cercare, quindi seleziona un indirizzo dall’elenco.
					</p>
				</div>
			{/if}

			{#if exportError}
				<p class="text-sm text-red-600">{exportError}</p>
			{/if}
		</div>

		<Dialog.Footer>
			<Button type="button" variant="outline" onclick={() => (open = false)}>Annulla</Button>
			<Button type="button" onclick={submitExport}>Esporta</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
