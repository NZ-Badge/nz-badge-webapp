<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { enhance } from '$app/forms';
	import { toastEnhance } from '$lib/utils/enhance';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import {
		Table,
		TablePanel,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TablePagination,
		TableRow
	} from '$lib/components/ui/table';
	import { formatDateIT } from '$lib/utils/date.js';

	let { data } = $props();

	let uploading = $state(false);

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(d: Date | null | string): string {
		return formatDateIT(d) || '—';
	}
</script>

<div class="space-y-6">
	<PageHeader
		title="Aggiornamenti dispositivi"
		description="Carica il software (firmware) dei lettori e scegli la versione da distribuire. Solo la versione attiva è disponibile per l’aggiornamento."
	/>

	<!-- Upload form -->
	<div class="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
		<h2 class="text-base font-semibold">Carica nuova release</h2>

		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			use:enhance={toastEnhance({
				success: (result) =>
					`Release v${result?.version} caricata. Premi Attiva per distribuirla ai dispositivi.`,
				error: 'Caricamento non riuscito',
				onStart: () => (uploading = true),
				onDone: () => (uploading = false)
			})}
			class="space-y-4"
		>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-1.5">
					<Label for="fw-version">Versione</Label>
					<Input
						id="fw-version"
						name="version"
						placeholder="es. 0.2.0"
						pattern="^\d+\.\d+\.\d+$"
						title="Formato: MAJOR.MINOR.PATCH"
						required
					/>
					<p class="text-xs text-muted-foreground">
						Deve corrispondere a FIRMWARE_VERSION in config.h
					</p>
				</div>

				<div class="space-y-1.5">
					<Label for="fw-file">File .bin</Label>
					<Input
						id="fw-file"
						name="file"
						type="file"
						accept=".bin"
						required
						data-tutorial="field.firmware-file"
					/>
					<p class="text-xs text-muted-foreground">Max 2 MB consigliati</p>
				</div>
			</div>

			<div class="space-y-1.5">
				<Label for="fw-notes">Note di rilascio (opzionale)</Label>
				<Textarea
					id="fw-notes"
					name="notes"
					rows={3}
					placeholder="Descrivi le modifiche in questa versione..."
					class="resize-none"
					data-tutorial="field.release-notes"
				/>
			</div>

			<Button type="submit" disabled={uploading} data-tutorial="firmware.upload">
				{uploading ? 'Caricamento...' : 'Carica'}
			</Button>
		</form>
	</div>

	<!-- Release table -->
	<TablePanel>
		<Table embedded>
			<TableHeader>
				<TableRow>
					<TableHead>Versione</TableHead>
					<TableHead>Data</TableHead>
					<TableHead>Dimensione</TableHead>
					<TableHead>SHA-256</TableHead>
					<TableHead>Stato</TableHead>
					<TableHead>Note</TableHead>
					<TableHead class="w-px text-right">Azioni</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.releases as release (release.id)}
					<TableRow>
						<TableCell class="font-mono font-semibold">{release.version}</TableCell>
						<TableCell class="text-sm text-muted-foreground"
							>{formatDate(release.createdAt)}</TableCell
						>
						<TableCell class="text-sm text-muted-foreground"
							>{formatBytes(release.fileSizeBytes)}</TableCell
						>
						<TableCell class="font-mono text-xs text-muted-foreground"
							>{release.sha256.slice(0, 12)}…</TableCell
						>
						<TableCell>
							{#if release.isActive}
								<Badge variant="positive">Attiva</Badge>
							{:else}
								<Badge variant="secondary">Inattiva</Badge>
							{/if}
						</TableCell>
						<TableCell
							class="text-sm text-muted-foreground max-w-xs truncate"
							title={release.releaseNotes ?? ''}
						>
							{release.releaseNotes || '—'}
						</TableCell>
						<TableCell class="w-px whitespace-nowrap text-right">
							<div class="flex items-center justify-end gap-1">
								{#if !release.isActive}
									<form
										method="POST"
										action="?/activate"
										use:enhance={toastEnhance({
											success: `Firmware ${release.version} attivato`,
											error: 'Attivazione non riuscita'
										})}
									>
										<input type="hidden" name="id" value={release.id} />
										<Button
											type="submit"
											size="sm"
											variant="positive-ghost"
											data-tutorial="firmware.activate"
										>
											Attiva
										</Button>
									</form>
								{:else}
									<form
										method="POST"
										action="?/deactivate"
										use:enhance={toastEnhance({
											success: `Firmware ${release.version} ritirato`,
											error: 'Operazione non riuscita'
										})}
									>
										<input type="hidden" name="id" value={release.id} />
										<Button
											type="submit"
											size="sm"
											variant="warning-ghost"
											data-tutorial="firmware.retire"
										>
											Ritira
										</Button>
									</form>
								{/if}
							</div>
						</TableCell>
					</TableRow>
				{:else}
					<TableRow>
						<TableCell colspan={7} data-empty>Nessuna release caricata.</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
		<TablePagination page={1} totalPages={1} total={data.releases.length} />
	</TablePanel>

	<p class="text-xs text-muted-foreground">
		Solo una release può essere attiva per tipo di device. Attivarne una disattiva automaticamente
		le altre. Un device non scarica aggiornamenti se nessuna release è attiva.
	</p>
</div>
