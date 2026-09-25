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
		/** Testo da copiare; una funzione viene valutata solo al clic. */
		value: string | (() => string);
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
	let resetTimer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		clearTimeout(resetTimer);
		try {
			await navigator.clipboard.writeText(typeof value === 'function' ? value() : value);
			copied = true;
			failed = false;
		} catch {
			copied = false;
			failed = true;
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
