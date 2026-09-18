<script lang="ts">
	import { DatePicker as DatePickerPrimitive } from 'bits-ui';
	import { parseDate, today, type DateValue } from '@internationalized/date';
	import { untrack } from 'svelte';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { cn } from '$lib/utils/ui.js';
	import { TIMEZONE } from '$lib/utils/date.js';
	import { Input } from '$lib/components/ui/input/index.js';

	const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

	type Props = {
		value?: string;
		name?: string;
		id?: string;
		withTime?: boolean;
		disabled?: boolean;
		required?: boolean;
		class?: string;
		'aria-invalid'?: boolean | 'true' | 'false' | undefined;
		'aria-describedby'?: string;
		'data-tutorial-title'?: string;
		'data-tutorial-description'?: string;
	};

	let {
		value = $bindable(''),
		name,
		id,
		withTime = false,
		disabled = false,
		required = false,
		class: className,
		'aria-invalid': ariaInvalid,
		'aria-describedby': ariaDescribedby,
		'data-tutorial-title': tutorialTitle,
		'data-tutorial-description': tutorialDescription
	}: Props = $props();

	function parseParts(iso: string): { date?: DateValue; time: string } {
		const [datePart = '', timePart = ''] = (iso ?? '').split('T');
		let date: DateValue | undefined;
		try {
			if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) date = parseDate(datePart);
		} catch {
			// Una data impossibile non deve essere corretta silenziosamente.
		}
		return {
			date,
			time: TIME_PATTERN.test(timePart) ? timePart : ''
		};
	}

	function toISO(date: DateValue | undefined, time: string): string {
		if (!date) return '';
		const iso = date.toString();
		if (!withTime) return iso;
		return TIME_PATTERN.test(time) ? `${iso}T${time}` : '';
	}

	const initial = parseParts(value);
	let dateValue = $state<DateValue | undefined>(initial.date);
	let timeText = $state(initial.time);
	let lastPublished = value;
	const uid = $props.id();
	const inputId = $derived(id ?? uid);
	let fieldElement = $state<HTMLDivElement | null>(null);

	function focusDate() {
		fieldElement?.querySelector<HTMLElement>('[data-segment="day"]')?.focus();
	}

	// Sincronizza lo stato interno quando il valore cambia dall'esterno
	// (es. reset dei dialog o dati caricati dal server).
	$effect.pre(() => {
		const externalValue = value;
		untrack(() => {
			if (externalValue === lastPublished) return;
			lastPublished = externalValue;
			const parsed = parseParts(externalValue);
			dateValue = parsed.date;
			timeText = parsed.time;
		});
	});

	function commit(date: DateValue | undefined, time: string) {
		const iso = toISO(date, time);
		lastPublished = iso;
		if (iso !== value) value = iso;
	}

	function handleDateChange(next: DateValue | undefined) {
		if (withTime && next && !timeText) timeText = '00:00';
		commit(next, timeText);
	}

	function handleTimeInput(event: Event) {
		const digits = (event.currentTarget as HTMLInputElement).value.replace(/\D/g, '').slice(0, 4);
		timeText = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
		commit(dateValue, timeText);
	}
</script>

<div
	data-slot="date-picker"
	class={cn('flex items-center gap-2', className)}
	data-tutorial-title={tutorialTitle ?? 'Seleziona data'}
	data-tutorial-description={tutorialDescription ??
		'Inserisci giorno, mese e anno nel formato gg/mm/aaaa oppure scegli il giorno dal calendario. Usa le frecce per cambiare mese e Canc per svuotare un segmento. Gli orari, se presenti, sono riferiti a Europe/Rome.'}
>
	<DatePickerPrimitive.Root
		bind:value={dateValue}
		onValueChange={handleDateChange}
		locale="it-IT"
		weekStartsOn={1}
		weekdayFormat="short"
		calendarLabel="Calendario"
		placeholder={initial.date ?? today(TIMEZONE)}
		{disabled}
		{required}
	>
		<div
			class={cn(
				'border-input bg-background ring-offset-background flex h-9 w-full min-w-0 items-center rounded-md border px-3 py-1 text-base shadow-xs transition-[color,box-shadow] md:text-sm',
				'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
				(ariaInvalid === true || ariaInvalid === 'true') &&
					'border-destructive ring-destructive/20 dark:ring-destructive/40',
				disabled && 'cursor-not-allowed opacity-50'
			)}
		>
			<DatePickerPrimitive.Input
				id={`${inputId}-field`}
				bind:ref={fieldElement}
				aria-invalid={ariaInvalid}
				aria-describedby={ariaDescribedby}
				class="flex flex-1 items-center outline-none"
			>
				{#snippet child({ props, segments })}
					<div
						{...props}
						aria-label={tutorialTitle ?? 'Data (gg/mm/aaaa)'}
						aria-invalid={ariaInvalid}
						aria-describedby={ariaDescribedby}
					>
						{#each segments as { part, value: segmentValue }, i (`${part}-${i}`)}
							<DatePickerPrimitive.Segment
								{part}
								class="rounded-xs px-0.5 tabular-nums outline-none focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[placeholder]:text-muted-foreground"
							>
								{segmentValue}
							</DatePickerPrimitive.Segment>
						{/each}
					</div>
				{/snippet}
			</DatePickerPrimitive.Input>
			<DatePickerPrimitive.Trigger
				{disabled}
				class="text-muted-foreground hover:text-foreground rounded-xs p-1 outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none"
				aria-label="Apri calendario"
				data-tutorial-title="Apri calendario"
				data-tutorial-description="Apre il calendario per scegliere una data; il campo la mostra nel formato gg/mm/aaaa."
			>
				<CalendarIcon class="size-4" />
			</DatePickerPrimitive.Trigger>
		</div>
		<DatePickerPrimitive.Content
			sideOffset={4}
			class="bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 z-50 rounded-md border p-3 shadow-md outline-none"
		>
			<DatePickerPrimitive.Calendar class="flex flex-col gap-3">
				{#snippet children({ months, weekdays })}
					<DatePickerPrimitive.Header class="flex items-center justify-between gap-2">
						<DatePickerPrimitive.PrevButton
							class="hover:bg-accent hover:text-accent-foreground rounded-xs inline-flex size-7 items-center justify-center outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
							aria-label="Mese precedente"
							data-tutorial-title="Mese precedente"
							data-tutorial-description="Mostra il mese precedente senza modificare la data selezionata. Scegli un giorno per confermare."
						>
							{#snippet child({ props })}
								<button {...props} aria-label="Mese precedente"
									><ChevronLeftIcon class="size-4" /></button
								>
							{/snippet}
						</DatePickerPrimitive.PrevButton>
						<DatePickerPrimitive.Heading class="text-sm font-medium capitalize" />
						<DatePickerPrimitive.NextButton
							class="hover:bg-accent hover:text-accent-foreground rounded-xs inline-flex size-7 items-center justify-center outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50"
							aria-label="Mese successivo"
							data-tutorial-title="Mese successivo"
							data-tutorial-description="Mostra il mese successivo senza modificare la data selezionata. Scegli un giorno per confermare."
						>
							{#snippet child({ props })}
								<button {...props} aria-label="Mese successivo"
									><ChevronRightIcon class="size-4" /></button
								>
							{/snippet}
						</DatePickerPrimitive.NextButton>
					</DatePickerPrimitive.Header>
					{#each months as month (month.value.toString())}
						<DatePickerPrimitive.Grid class="w-full border-collapse">
							<DatePickerPrimitive.GridHead>
								<DatePickerPrimitive.GridRow>
									{#each weekdays as weekday, weekdayIndex (weekdayIndex)}
										<DatePickerPrimitive.HeadCell
											class="text-muted-foreground w-8 pb-1 text-center text-xs font-normal capitalize"
										>
											{weekday}
										</DatePickerPrimitive.HeadCell>
									{/each}
								</DatePickerPrimitive.GridRow>
							</DatePickerPrimitive.GridHead>
							<DatePickerPrimitive.GridBody>
								{#each month.weeks as weekDates, weekIndex (weekIndex)}
									<DatePickerPrimitive.GridRow>
										{#each weekDates as date (date.toString())}
											<DatePickerPrimitive.Cell
												{date}
												month={month.value}
												class="p-0.5 text-center"
											>
												<DatePickerPrimitive.Day
													data-tutorial-title="Scegli giorno"
													data-tutorial-description="Seleziona questo giorno come data del campo. Il calendario si chiude e puoi completare o modificare l’orario, se previsto."
													class="hover:bg-accent hover:text-accent-foreground data-[selected]:bg-primary data-[selected]:text-primary-foreground data-[outside-month]:text-muted-foreground data-[disabled]:text-muted-foreground inline-flex size-8 items-center justify-center rounded-xs text-sm tabular-nums outline-none focus-visible:ring-ring/50 focus-visible:ring-[3px] data-[disabled]:pointer-events-none data-[outside-month]:opacity-50 data-[disabled]:opacity-50 data-[unavailable]:line-through"
												/>
											</DatePickerPrimitive.Cell>
										{/each}
									</DatePickerPrimitive.GridRow>
								{/each}
							</DatePickerPrimitive.GridBody>
						</DatePickerPrimitive.Grid>
					{/each}
				{/snippet}
			</DatePickerPrimitive.Calendar>
		</DatePickerPrimitive.Content>
	</DatePickerPrimitive.Root>
	{#if withTime}
		<Input
			type="text"
			inputmode="numeric"
			placeholder="HH:mm"
			maxlength={5}
			bind:value={timeText}
			oninput={handleTimeInput}
			pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
			{disabled}
			{required}
			aria-label="Ora (formato 24 ore)"
			class="w-20 shrink-0 text-center tabular-nums"
		/>
	{/if}
	<!-- Input validabile: mantiene invio ISO, required e focus dalle label esterne. -->
	<input
		id={inputId}
		type="text"
		class="sr-only"
		tabindex={-1}
		aria-hidden="true"
		{name}
		value={toISO(dateValue, timeText)}
		{disabled}
		{required}
		onfocus={focusDate}
	/>
</div>
