<script lang="ts">
	import { Mail } from '@lucide/svelte';
	import { Label } from '$lib/components/ui/label';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Switch } from '$lib/components/ui/switch';

	let { enabled = $bindable() }: { enabled: boolean } = $props();
</script>

<Card>
	<CardHeader>
		<div class="flex items-center gap-2">
			<Mail size={20} class="text-foreground" />
			<CardTitle>Riepilogo settimanale presenze</CardTitle>
		</div>
		<CardDescription>
			Abilita l'invio automatico del riepilogo ore agli iscritti con strisciate nella settimana
		</CardDescription>
	</CardHeader>
	<CardContent>
		<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
			<div class="flex-1 space-y-1">
				<Label for="weekly-attendance-summary" class="text-base font-medium">
					Invia riepilogo settimanale
				</Label>
				<p class="text-sm text-muted-foreground">
					Il comando schedulato puo' essere lanciato ogni giorno: inviera' le email solo il sabato,
					per la settimana lunedi-venerdi appena conclusa, e non ripetera' invii gia' registrati.
				</p>
			</div>
			<Switch id="weekly-attendance-summary" bind:checked={enabled} />
		</div>
	</CardContent>
</Card>
