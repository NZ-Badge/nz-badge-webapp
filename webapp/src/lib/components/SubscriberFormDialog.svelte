<script lang="ts">
	import { enhance } from '$app/forms';
	import { Dialog, DialogContent, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';
	import { SUBSCRIBER_STATUSES, subscriberStatus } from '$lib/labels';

	let {
		open = $bindable(false),
		subscriber = null as {
			id: number;
			firstName: string;
			lastName: string;
			email: string;
			phone?: string | null;
			taxId?: string | null;
			note?: string | null;
			status?: string | null;
		} | null,
		formResult = null as { error?: string; action?: string } | null
	} = $props();

	const isEdit = $derived(subscriber !== null);
	const actionUrl = $derived(isEdit ? '?/update' : '?/create');

	const idPrefix = $derived(subscriber ? `subscriber-${subscriber.id}` : 'subscriber-new');
</script>

<Dialog bind:open>
	<DialogContent class="max-w-lg">
		<DialogHeader>
			<DialogTitle>{isEdit ? 'Modifica iscritto' : 'Nuovo iscritto'}</DialogTitle>
		</DialogHeader>

		{#if formResult?.error && formResult.action === (isEdit ? 'update' : 'create')}
			<div class="mb-2 text-sm text-red-600" role="alert">{formResult.error}</div>
		{/if}

		<form
			method="POST"
			action={actionUrl}
			use:enhance={() =>
				async ({ result, update }) => {
					await update({ reset: !isEdit });
					if (result.type === 'success') open = false;
				}}
			class="space-y-3"
		>
			{#if isEdit}
				<input type="hidden" name="id" value={subscriber!.id} />
			{/if}

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="{idPrefix}-firstName">Nome *</Label>
					<Input
						id="{idPrefix}-firstName"
						name="firstName"
						value={subscriber?.firstName ?? ''}
						required
					/>
				</div>
				<div class="space-y-1">
					<Label for="{idPrefix}-lastName">Cognome *</Label>
					<Input
						id="{idPrefix}-lastName"
						name="lastName"
						value={subscriber?.lastName ?? ''}
						required
					/>
				</div>
			</div>

			<div class="space-y-1">
				<Label for="{idPrefix}-email">Email *</Label>
				<Input
					id="{idPrefix}-email"
					name="email"
					type="email"
					value={subscriber?.email ?? ''}
					required
				/>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="space-y-1">
					<Label for="{idPrefix}-phone">Telefono</Label>
					<Input id="{idPrefix}-phone" name="phone" value={subscriber?.phone ?? ''} />
				</div>
				<div class="space-y-1">
					<Label for="{idPrefix}-taxCode">Codice fiscale</Label>
					<Input id="{idPrefix}-taxCode" name="taxCode" value={subscriber?.taxId ?? ''} />
				</div>
			</div>

			<div class="space-y-1">
				<Label for="{idPrefix}-status">Stato</Label>
				<NativeSelect
					id="{idPrefix}-status"
					name="status"
					value={subscriber?.status ?? 'active'}
					class="w-full"
				>
					{#each SUBSCRIBER_STATUSES as opt (opt)}
						<NativeSelectOption value={opt}>{subscriberStatus(opt).label}</NativeSelectOption>
					{/each}
				</NativeSelect>
			</div>

			<div class="space-y-1">
				<Label for="{idPrefix}-notes">Note</Label>
				<Textarea id="{idPrefix}-notes" name="notes" rows={3} value={subscriber?.note ?? ''}
				></Textarea>
			</div>

			<div class="flex justify-end gap-2 pt-2">
				<Button
					type="button"
					variant="outline"
					onclick={() => (open = false)}
					data-tutorial="dialog.cancel">Annulla</Button
				>
				<Button type="submit" data-tutorial="form.save">{isEdit ? 'Aggiorna' : 'Crea'}</Button>
			</div>
		</form>
	</DialogContent>
</Dialog>
