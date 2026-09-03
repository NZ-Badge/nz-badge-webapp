<script lang="ts">
	import { Input } from '$lib/components/ui/input';

	export type EmailAutocompleteOption = {
		id?: number;
		name: string;
		email: string;
	};

	let {
		id,
		value = $bindable(''),
		options,
		placeholder = 'Digita nome o email…',
		disabled = false,
		onselect
	}: {
		id: string;
		value?: string;
		options: EmailAutocompleteOption[];
		placeholder?: string;
		disabled?: boolean;
		onselect?: (option: EmailAutocompleteOption | null) => void;
	} = $props();

	let resultsOpen = $state(false);
	let activeIndex = $state(0);

	const filteredOptions = $derived.by(() => {
		const query = value.trim().toLocaleLowerCase();
		const matches = query
			? options.filter((option) =>
					`${option.name} ${option.email}`.toLocaleLowerCase().includes(query)
				)
			: options;
		return matches.slice(0, 50);
	});

	function choose(option: EmailAutocompleteOption) {
		value = option.email;
		resultsOpen = false;
		activeIndex = 0;
		onselect?.(option);
	}

	function handleInput(event: Event) {
		value = (event.currentTarget as HTMLInputElement).value;
		resultsOpen = true;
		activeIndex = 0;
		onselect?.(null);
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			resultsOpen = true;
			activeIndex = Math.min(activeIndex + 1, Math.max(filteredOptions.length - 1, 0));
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			resultsOpen = true;
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (event.key === 'Enter' && resultsOpen && filteredOptions[activeIndex]) {
			event.preventDefault();
			choose(filteredOptions[activeIndex]);
		} else if (event.key === 'Escape') {
			resultsOpen = false;
		} else if (event.key === 'Tab') {
			resultsOpen = false;
		}
	}

	function handleBlur() {
		window.setTimeout(() => (resultsOpen = false), 100);
	}
</script>

<div class="relative">
	<Input
		{id}
		type="text"
		role="combobox"
		autocomplete="off"
		aria-autocomplete="list"
		aria-expanded={resultsOpen}
		aria-controls={`${id}-results`}
		aria-activedescendant={resultsOpen && filteredOptions[activeIndex]
			? `${id}-option-${activeIndex}`
			: undefined}
		{placeholder}
		{disabled}
		{value}
		oninput={handleInput}
		onfocus={() => (resultsOpen = true)}
		onblur={handleBlur}
		onkeydown={handleKeydown}
	/>

	{#if resultsOpen}
		<div
			id={`${id}-results`}
			role="listbox"
			class="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
		>
			{#if filteredOptions.length === 0}
				<p class="px-3 py-2 text-sm text-muted-foreground">Nessun risultato.</p>
			{:else}
				{#each filteredOptions as option, index}
					<button
						id={`${id}-option-${index}`}
						type="button"
						role="option"
						aria-selected={index === activeIndex}
						tabindex="-1"
						class="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent aria-selected:bg-accent"
						onmousedown={(event) => event.preventDefault()}
						onmouseenter={() => (activeIndex = index)}
						onclick={() => choose(option)}
					>
						<span class="block font-medium">{option.name}</span>
						<span class="block text-xs text-muted-foreground">{option.email}</span>
					</button>
				{/each}
			{/if}
		</div>
	{/if}
</div>
