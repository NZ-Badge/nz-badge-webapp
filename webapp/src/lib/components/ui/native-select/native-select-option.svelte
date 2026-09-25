<script lang="ts">
	import type { HTMLOptionAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils/ui.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLOptionAttributes, HTMLOptionElement> = $props();
</script>

<option bind:this={ref} data-slot="native-select-option" class={cn(className)} {...restProps}>
	{@render children?.()}
</option>
