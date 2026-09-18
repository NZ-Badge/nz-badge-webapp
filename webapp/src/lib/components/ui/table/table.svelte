<script lang="ts">
	import type { HTMLTableAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils/ui.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		embedded = false,
		...restProps
	}: WithElementRef<HTMLTableAttributes> & { embedded?: boolean } = $props();
</script>

<div data-slot="table-container" data-embedded={embedded}>
	<table bind:this={ref} data-slot="table" class={cn(className)} {...restProps}>
		{@render children?.()}
	</table>
</div>
