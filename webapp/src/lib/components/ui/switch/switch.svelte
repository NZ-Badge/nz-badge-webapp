<script lang="ts">
	import { cn } from '$lib/utils/ui.js';

	interface Props {
		ref?: HTMLButtonElement | null;
		checked?: boolean;
		class?: string;
		id?: string;
	}

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className = '',
		id = ''
	}: Props = $props();

	function toggle() {
		checked = !checked;
	}
</script>

<button
	bind:this={ref}
	{id}
	type="button"
	role="switch"
	aria-checked={checked}
	data-slot="switch"
	data-state={checked ? 'checked' : 'unchecked'}
	onclick={toggle}
	class={cn(
		'peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
		className
	)}
>
	<span
		data-slot="switch-thumb"
		data-state={checked ? 'checked' : 'unchecked'}
		class={cn(
			'bg-background pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0'
		)}
	></span>
</button>
