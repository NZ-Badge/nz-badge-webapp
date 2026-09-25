<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { AlertCircle, Key, RefreshCw } from '@lucide/svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { Alert, AlertDescription } from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { Label } from '$lib/components/ui/label';
	import { Switch } from '$lib/components/ui/switch';
	import type { MaskedMifareKeyConfig } from '$lib/services/settings-view';
	import { callAction } from '$lib/utils/enhance';
	import { errorMessage } from '$lib/utils/http';

	let {
		useMifare = $bindable(),
		useSingleMifareKey = $bindable(),
		mifareKeys = $bindable(),
		showSingleKeyWarning = $bindable(false),
		savedUseSingleMifareKey,
		activeCardsCount
	}: {
		useMifare: boolean;
		useSingleMifareKey: boolean;
		mifareKeys: MaskedMifareKeyConfig;
		showSingleKeyWarning?: boolean;
		/** Valore salvato della modalità chiave unica, per il ripristino in caso di errore. */
		savedUseSingleMifareKey: boolean;
		activeCardsCount: number;
	} = $props();

	let togglingMifare = $state(false);
	let regenerateOpen = $state(false);

	// Il toggle MIFARE si salva subito, senza attendere "Salva impostazioni".
	async function toggleUseMifare(next: boolean) {
		const previous = useMifare;
		useMifare = next;
		if (!next) useSingleMifareKey = false;
		togglingMifare = true;
		try {
			const result = await callAction(
				'?/setMifare',
				{ use_mifare: next },
				{ invalidate: false, error: 'Impossibile salvare l’impostazione' }
			);
			if (result?.mifareKeys) mifareKeys = result.mifareKeys as MaskedMifareKeyConfig;
			toast.success(next ? 'MIFARE abilitato' : 'MIFARE disabilitato');
		} catch (err) {
			useMifare = previous;
			if (previous) useSingleMifareKey = savedUseSingleMifareKey;
			toast.error(errorMessage(err, 'Impossibile salvare l’impostazione'));
		} finally {
			togglingMifare = false;
		}
	}

	async function regenerateKeys() {
		const result = await callAction(
			'?/regenerateMifareKeys',
			{},
			{ invalidate: false, error: 'Impossibile rigenerare le chiavi' }
		);
		if (result?.mifareKeys) mifareKeys = result.mifareKeys as MaskedMifareKeyConfig;
		toast.success('Chiavi MIFARE rigenerate');
	}

	function dismissSingleKeyWarning() {
		showSingleKeyWarning = false;
		useSingleMifareKey = false;
	}
</script>

<Card>
	<CardHeader>
		<div class="flex items-center gap-2">
			<Key size={20} class="text-gray-700" />
			<CardTitle>Gestione Chiavi MIFARE</CardTitle>
		</div>
		<CardDescription>Configura le chiavi di accesso per le card RFID</CardDescription>
	</CardHeader>
	<CardContent class="space-y-6">
		<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
			<div class="flex-1 space-y-1">
				<Label for="use-mifare" class="text-base font-medium">Usa MIFARE</Label>
				<p class="text-sm text-gray-500">
					Abilita la scrittura e cancellazione dei settori MIFARE. Se disabilitato, le card vengono
					registrate solo tramite UID. La modifica viene salvata subito.
				</p>
			</div>
			<Switch
				id="use-mifare"
				checked={useMifare}
				disabled={togglingMifare}
				onCheckedChange={toggleUseMifare}
			/>
		</div>

		{#if useMifare}
			<div class="flex items-start justify-between gap-4 rounded-lg border p-4">
				<div class="flex-1 space-y-1">
					<Label for="use-single-key" class="text-base font-medium">
						Usa chiave unica per tutte le card
					</Label>
					<p class="text-sm text-gray-500">
						Se abilitato, tutte le card RFID utilizzeranno la stessa coppia di chiavi MIFARE. Questo
						semplifica la gestione ma riduce la sicurezza. Se disabilitato, ogni card avrà una
						coppia di chiavi univoca generata automaticamente.
					</p>
				</div>
				<Switch id="use-single-key" bind:checked={useSingleMifareKey} />
			</div>

			{#if showSingleKeyWarning}
				<Alert class="border-red-200 bg-red-50">
					<div class="flex items-start gap-3">
						<AlertCircle size={20} class="mt-0.5 shrink-0 text-red-600" />
						<div class="flex-1 space-y-2">
							<AlertDescription class="font-medium text-red-900">
								Impossibile abilitare la modalità chiave unica
							</AlertDescription>
							<p class="text-sm text-red-800">
								Esistono <strong>{activeCardsCount}</strong> card attive nel sistema. Tutte le card devono
								essere disattivate o cancellate prima di attivare questa opzione.
							</p>
							<p class="text-sm text-red-700">
								<strong>Nota:</strong> Una volta attivata la modalità chiave unica, le card esistenti
								non funzioneranno più e dovranno essere riscritte.
							</p>
							<div class="pt-2">
								<Button onclick={dismissSingleKeyWarning} variant="secondary" size="sm">
									Ho capito, annulla
								</Button>
								<Button href="/cards" variant="warning" size="sm" class="ml-2">Vai alle card</Button
								>
							</div>
						</div>
					</div>
				</Alert>
			{/if}

			{#if useSingleMifareKey && mifareKeys.hasKeys}
				<div class="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
					<h4 class="font-medium text-amber-900">Chiavi MIFARE Globali</h4>
					<p class="text-sm text-amber-700">
						Le chiavi globali sono configurate e verranno utilizzate per tutte le nuove card
						scritte. Per sicurezza non vengono mostrate nel pannello.
					</p>
					<div class="pt-2">
						<Button
							onclick={() => (regenerateOpen = true)}
							variant="warning"
							size="sm"
							data-tutorial-title="Rigenera chiavi MIFARE"
							data-tutorial-description="Apre la conferma per generare una nuova coppia di chiavi globali. Le card già scritte potrebbero non essere più leggibili."
						>
							<RefreshCw size={14} class="mr-2" />
							Rigenera chiavi
						</Button>
					</div>
				</div>
			{:else if useSingleMifareKey && !mifareKeys.hasKeys}
				<div class="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
					<p class="text-sm text-yellow-800">
						Le chiavi globali verranno generate automaticamente al primo utilizzo.
					</p>
				</div>
			{/if}
		{/if}
	</CardContent>
</Card>

<ConfirmDialog
	bind:open={regenerateOpen}
	title="Rigenera chiavi MIFARE"
	description="Sei sicuro di voler rigenerare le chiavi MIFARE? Le card già scritte con le chiavi precedenti potrebbero non essere più leggibili."
	confirmLabel="Rigenera chiavi"
	busyLabel="Generazione…"
	variant="warning"
	onConfirm={regenerateKeys}
/>
