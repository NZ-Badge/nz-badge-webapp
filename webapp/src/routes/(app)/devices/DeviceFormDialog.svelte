<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import {
		Dialog,
		DialogContent,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect, NativeSelectOption } from '$lib/components/ui/native-select';

	type EditableDevice = {
		id: number;
		deviceId: string;
		location: string | null;
		active: boolean | null;
	};

	let {
		open = $bindable(false),
		device = null,
		error = null
	}: {
		open?: boolean;
		/** `null` per registrare un nuovo dispositivo. */
		device?: EditableDevice | null;
		/** Errore restituito dall'azione corrispondente. */
		error?: string | null;
	} = $props();

	const isEdit = $derived(device !== null);
	const prefix = $derived(isEdit ? 'edit-device' : 'create-device');
	let active = $derived(device ? Boolean(device.active) : true);
</script>

<Dialog bind:open>
	<DialogContent class="sm:max-w-md">
		<DialogHeader>
			<DialogTitle>{isEdit ? 'Modifica dispositivo' : 'Registra nuovo dispositivo'}</DialogTitle>
		</DialogHeader>
		<form
			method="POST"
			action={isEdit ? '?/update' : '?/create'}
			class="space-y-4"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					if (result.type === 'success') open = false;
				}}
		>
			{#if device}
				<input type="hidden" name="id" value={device.id} />
			{/if}

			<div class="space-y-2">
				<Label for="{prefix}-id">ID dispositivo</Label>
				{#if device}
					<Input
						id="{prefix}-id"
						value={device.deviceId}
						disabled
						class="bg-muted"
						aria-describedby="{prefix}-id-help"
					/>
					<p id="{prefix}-id-help" class="text-xs text-muted-foreground">
						L’ID dispositivo non può essere modificato.
					</p>
				{:else}
					<Input
						id="{prefix}-id"
						name="deviceId"
						placeholder="es. reader_entrata"
						required
						pattern="[a-zA-Z0-9_-]+"
						title="Sono consentiti solo lettere, numeri, underscore e trattini"
						aria-describedby="{prefix}-id-help"
						data-tutorial-description="Identificatore univoco che il dispositivo userà per autenticarsi. Usa solo lettere, numeri, underscore e trattini."
					/>
					<p id="{prefix}-id-help" class="text-xs text-muted-foreground">
						Identificatore univoco. Usa solo lettere, numeri, underscore e trattini.
					</p>
				{/if}
			</div>

			{#if !device}
				<div class="space-y-2">
					<Label for="{prefix}-type">Tipo dispositivo</Label>
					<NativeSelect id="{prefix}-type" name="deviceType" value="reader" class="w-full">
						<NativeSelectOption value="reader">Reader (rilevazione presenze)</NativeSelectOption>
						<NativeSelectOption value="writer">Writer (programmazione card)</NativeSelectOption>
					</NativeSelect>
				</div>
			{/if}

			<div class="space-y-2">
				<Label for="{prefix}-location">{device ? 'Posizione' : 'Posizione (opzionale)'}</Label>
				<Input
					id="{prefix}-location"
					name="location"
					placeholder="es. Ingresso principale"
					value={device?.location ?? ''}
				/>
			</div>

			{#if device}
				<div class="flex items-center gap-2">
					<Checkbox
						id="{prefix}-active"
						name="active"
						value="true"
						bind:checked={active}
						data-tutorial-title="Dispositivo attivo"
						data-tutorial-description="Se disattivi il dispositivo, le sue richieste vengono rifiutate finché non lo riattivi. Il token resta valido."
					/>
					<Label for="{prefix}-active">Dispositivo attivo</Label>
				</div>
			{/if}

			{#if error}
				<p class="text-sm text-red-600" role="alert">{error}</p>
			{/if}

			<DialogFooter>
				<Button
					type="button"
					variant="outline"
					onclick={() => (open = false)}
					data-tutorial="dialog.cancel">Annulla</Button
				>
				<Button type="submit" data-tutorial={isEdit ? 'form.save' : 'device.create'}>
					{isEdit ? 'Salva modifiche' : 'Registra dispositivo'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
