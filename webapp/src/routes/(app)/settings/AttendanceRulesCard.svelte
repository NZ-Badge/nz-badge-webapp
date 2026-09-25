<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Switch } from '$lib/components/ui/switch';

	let {
		resetEntryTypeDaily = $bindable(),
		enforceCourseDateRange = $bindable(),
		minSwipeIntervalMinutes = $bindable()
	}: {
		resetEntryTypeDaily: boolean;
		enforceCourseDateRange: boolean;
		minSwipeIntervalMinutes: number;
	} = $props();
</script>

<Card>
	<CardHeader>
		<CardTitle>Regole Presenze</CardTitle>
		<CardDescription>Configura come vengono gestite le strisciate delle card</CardDescription>
	</CardHeader>
	<CardContent class="space-y-6">
		<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
			<div class="flex-1 space-y-1">
				<Label for="reset-entry-type" class="text-base font-medium">
					Azzera tipo ingresso ogni giorno
				</Label>
				<p class="text-sm text-gray-500">
					Se abilitato, la prima strisciata del giorno viene sempre segnata come ingresso (entry),
					indipendentemente dallo stato precedente. Se disabilitato, la logica entry/exit continua
					dal giorno precedente.
				</p>
			</div>
			<Switch id="reset-entry-type" bind:checked={resetEntryTypeDaily} />
		</div>

		<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
			<div class="flex-1 space-y-1">
				<Label for="enforce-course-date-range" class="text-base font-medium">
					Valida le date del corso
				</Label>
				<p class="text-sm text-gray-500">
					Se abilitato, le strisciate dei corsisti sono accettate solo quando la data rientra
					nell'intervallo di almeno una loro iscrizione. La regola non si applica allo staff.
				</p>
			</div>
			<Switch id="enforce-course-date-range" bind:checked={enforceCourseDateRange} />
		</div>

		<div class="space-y-3 rounded-lg border p-4">
			<div class="space-y-1">
				<Label for="min-interval" class="text-base font-medium">
					Intervallo minimo tra strisciate
				</Label>
				<p class="text-sm text-gray-500">
					Determina l'intervallo minimo (in minuti) tra due strisciate per la stessa card. Se un
					utente striscia due volte entro questo intervallo, la seconda strisciata viene ignorata.
				</p>
			</div>
			<div class="flex items-center gap-3">
				<Input
					id="min-interval"
					type="number"
					min={1}
					max={1440}
					bind:value={minSwipeIntervalMinutes}
					class="w-24"
				/>
				<span class="text-sm text-gray-600">minuti</span>
			</div>
		</div>
	</CardContent>
</Card>
