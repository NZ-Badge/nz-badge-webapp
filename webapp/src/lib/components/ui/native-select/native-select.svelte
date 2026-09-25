<script lang="ts">
	import type { HTMLSelectAttributes } from 'svelte/elements';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn, type WithElementRef } from '$lib/utils/ui.js';

	type Props = WithElementRef<HTMLSelectAttributes, HTMLSelectElement> & {
		/** Classi del contenitore: usale per la larghezza (es. `w-full`, `w-40`). */
		class?: string;
		/** Classi dell'elemento `<select>`. */
		selectClass?: string;
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		selectClass,
		children,
		...restProps
	}: Props = $props();
</script>

<div
	data-slot="native-select-wrapper"
	class={cn('group/native-select relative w-fit has-[select:disabled]:opacity-50', className)}
>
	<select
		bind:this={ref}
		bind:value
		data-slot="native-select"
		class={cn(
			'border-input bg-background selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground h-9 w-full min-w-0 appearance-none rounded-md border py-1 pr-9 pl-3 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm',
			'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
			'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
			selectClass
		)}
		{...restProps}
	>
		{@render children?.()}
	</select>
	<ChevronDownIcon
		class="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 select-none"
		aria-hidden="true"
	/>
</div>
