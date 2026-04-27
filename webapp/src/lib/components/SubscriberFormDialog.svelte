<script lang="ts">
	import { enhance } from '$app/forms';
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';

	let {
		open = $bindable(false),
		subscriber = null as {
			id: number;
			firstName: string;
			lastName: string;
			email: string;
			status?: string | null;
		} | null,
		formResult = null as { error?: string; action?: string } | null
	} = $props();

	const isEdit = $derived(subscriber !== null);
	const actionUrl = $derived(isEdit ? '?/update' : '?/create');

	const statusOptions = ['active', 'completed', 'suspended', 'cancelled'];
	const statusLabels: Record<string, string> = {
		active: 'Attivo',
		completed: 'Completato',
		suspended: 'Sospeso',
		cancelled: 'Annullato'
	};
</script>

<Dialog bind:open>
	<DialogContent class="max-w-lg">
		<DialogHeader>
			<DialogTitle>{isEdit ? 'Modifica iscritto' : 'Nuovo iscritto'}</DialogTitle>
		</DialogHeader>

		{#if formResult?.error && (formResult?.action === 'create' || formResult?.action === 'update')}
			<div class="mb-2 text-sm text-red-600">{formResult.error}</div>
		{/if}

		<form
			method="POST"
			action={actionUrl}
			use:enhance={() => {
				return ({ update }) => {
					update();
					open = false;
				};
			}}
			class="space-y-3"
		>
			{#if isEdit}
				<input type="hidden" name="id" value={subscriber!.id} />
			{/if}

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="firstName">Nome *</Label>
					<Input id="firstName" name="firstName" value={subscriber?.firstName ?? ''} required />
				</div>
				<div class="space-y-1">
					<Label for="lastName">Cognome *</Label>
					<Input id="lastName" name="lastName" value={subscriber?.lastName ?? ''} required />
				</div>
			</div>

			<div class="space-y-1">
				<Label for="email">Email *</Label>
				<Input id="email" name="email" type="email" value={subscriber?.email ?? ''} required />
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="phone">Telefono</Label>
					<Input id="phone" name="phone" />
				</div>
				<div class="space-y-1">
					<Label for="taxCode">Codice fiscale</Label>
					<Input id="taxCode" name="taxCode" />
				</div>
			</div>

			<div class="space-y-1">
				<Label for="status">Stato</Label>
				<select name="status" class="w-full rounded border px-2 py-1 text-sm">
					{#each statusOptions as opt}
						<option value={opt} selected={subscriber?.status === opt}
							>{statusLabels[opt] ?? opt}</option
						>
					{/each}
				</select>
			</div>

			<div class="space-y-1">
				<Label for="notes">Note</Label>
				<Textarea id="notes" name="notes" rows={3}></Textarea>
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Annulla</Button>
				<Button type="submit">{isEdit ? 'Aggiorna' : 'Crea'}</Button>
			</div>
		</form>
	</DialogContent>
</Dialog>
