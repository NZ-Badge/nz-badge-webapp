<script lang="ts">
	import { Check, Copy } from '@lucide/svelte';
	import { onDestroy } from 'svelte';
	import { Button, type ButtonSize, type ButtonVariant } from '$lib/components/ui/button';

	let {
		value,
		label = 'Copia',
		variant = 'outline',
		size = 'icon-sm',
		iconSize = 16,
		class: className,
		tutorialDescription = 'Copia negli appunti il valore mostrato accanto, così puoi incollarlo dove serve.'
	}: {
		/**
		 * Testo da copiare. Una funzione viene valutata solo al clic e può essere asincrona
		 * (es. per leggere un secret dal server); se lancia un errore la copia risulta fallita.
		 */
		value: string | (() => string | Promise<string>);
		/** Nome accessibile, per esempio "Copia token". */
		label?: string;
		variant?: ButtonVariant;
		size?: ButtonSize;
		iconSize?: number;
		class?: string;
		tutorialDescription?: string;
	} = $props();

	let copied = $state(false);
	let failed = $state(false);
	let busy = $state(false);
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		if (busy) return;
		clearTimeout(resetTimer);
		busy = true;
		try {
			const text = typeof value === 'function' ? await value() : value;
			await navigator.clipboard.writeText(text);
			copied = true;
			failed = false;
		} catch {
			copied = false;
			failed = true;
		} finally {
			busy = false;
		}
		resetTimer = setTimeout(() => {
			copied = false;
			failed = false;
		}, 2000);
	}

	onDestroy(() => clearTimeout(resetTimer));
</script>

<Button
	type="button"
	{variant}
	{size}
	class={className}
	onclick={copy}
	aria-busy={busy || undefined}
	aria-label={copied ? `${label}: copiato` : label}
	title={failed ? 'Copia non riuscita: seleziona il testo e copialo a mano' : label}
	data-tutorial-title={label}
	data-tutorial-description={tutorialDescription}
>
	{#if copied}
		<Check size={iconSize} aria-hidden="true" />
	{:else}
		<Copy size={iconSize} aria-hidden="true" />
	{/if}
</Button>
<span class="sr-only" aria-live="polite">
	{copied ? 'Copiato negli appunti' : failed ? 'Copia non riuscita' : ''}
</span>
