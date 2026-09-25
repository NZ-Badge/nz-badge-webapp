<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Loader2 } from '@lucide/svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { errorMessage } from '$lib/utils/http';

	type Props = {
		open?: boolean;
		title: string;
		description?: string | Snippet;
		confirmLabel?: string;
		busyLabel?: string;
		cancelLabel?: string;
		variant?: 'default' | 'destructive' | 'warning';
		/** Spiegazione estesa del pulsante di conferma per la modalità tutorial. */
		tutorialDescription?: string;
		/**
		 * Azione da confermare. Il dialog resta aperto con lo stato di attesa finché la promessa
		 * non si risolve; se lancia un errore il messaggio viene mostrato nel dialog.
		 * Restituire `false` per lasciarlo aperto senza errore.
		 */
		onConfirm: () => unknown | Promise<unknown>;
		children?: Snippet;
	};

	let {
		open = $bindable(false),
		title,
		description,
		confirmLabel = 'Conferma',
		busyLabel,
		cancelLabel = 'Annulla',
		variant = 'default',
		tutorialDescription,
		onConfirm,
		children
	}: Props = $props();

	let busy = $state(false);
	let error = $state('');

	async function confirm() {
		busy = true;
		error = '';
		try {
			const result = await onConfirm();
			if (result !== false) open = false;
		} catch (err) {
			error = errorMessage(err);
		} finally {
			busy = false;
		}
	}

	function close() {
		open = false;
		error = '';
	}

	function onOpenChange(next: boolean) {
		if (!next) error = '';
	}
</script>

<Dialog.Root bind:open {onOpenChange}>
	<Dialog.Content
		class="sm:max-w-md"
		showCloseButton={!busy}
		escapeKeydownBehavior={busy ? 'ignore' : 'close'}
		interactOutsideBehavior={busy ? 'ignore' : 'close'}
	>
		<Dialog.Header>
			<Dialog.Title class={variant === 'destructive' ? 'text-red-700' : undefined}>
				{title}
			</Dialog.Title>
			{#if description}
				<Dialog.Description>
					{#if typeof description === 'string'}
						{description}
					{:else}
						{@render description()}
					{/if}
				</Dialog.Description>
			{/if}
		</Dialog.Header>

		{@render children?.()}

		{#if error}
			<p class="text-sm text-red-600" role="alert">{error}</p>
		{/if}

		<Dialog.Footer class="gap-2">
			<Button variant="secondary" onclick={close} disabled={busy}>
				{cancelLabel}
			</Button>
			<Button
				{variant}
				onclick={confirm}
				disabled={busy}
				aria-busy={busy}
				data-tutorial-title={confirmLabel}
				data-tutorial-description={tutorialDescription ??
					(typeof description === 'string' ? description : `Conferma: ${title}.`)}
			>
				{#if busy}
					<Loader2 class="animate-spin" />
					{busyLabel ?? `${confirmLabel}…`}
				{:else}
					{confirmLabel}
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
