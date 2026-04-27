<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow
	} from '$lib/components/ui/table';

	let { data, form } = $props();

	let version  = $state('');
	let notes    = $state('');
	let fileInput = $state<HTMLInputElement | null>(null);
	let uploading = $state(false);

	function formatBytes(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}

	function formatDate(d: Date | null | string): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('it-IT', {
			day: '2-digit', month: '2-digit', year: 'numeric'
		});
	}

	$effect(() => {
		if (form?.action === 'upload' && form?.success) {
			version = '';
			notes   = '';
			if (fileInput) fileInput.value = '';
		}
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Firmware OTA</h1>
			<p class="text-sm text-gray-500 mt-1">Gestione release firmware per reader-station</p>
		</div>
	</div>

	<!-- Upload form -->
	<div class="rounded-lg border bg-white p-5 shadow-sm space-y-4">
		<h2 class="text-base font-semibold">Carica nuova release</h2>

		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			use:enhance={() => {
				uploading = true;
				return ({ update }) => {
					uploading = false;
					update();
				};
			}}
			class="space-y-4"
		>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-1.5">
					<label for="fw-version" class="text-sm font-medium">Versione</label>
					<Input
						id="fw-version"
						name="version"
						placeholder="es. 0.2.0"
						pattern="^\d+\.\d+\.\d+$"
						title="Formato: MAJOR.MINOR.PATCH"
						bind:value={version}
						required
					/>
					<p class="text-xs text-gray-500">Deve corrispondere a FIRMWARE_VERSION in config.h</p>
				</div>

				<div class="space-y-1.5">
					<label for="fw-file" class="text-sm font-medium">File .bin</label>
					<input
						id="fw-file"
						name="file"
						type="file"
						accept=".bin"
						bind:this={fileInput}
						required
						class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					/>
					<p class="text-xs text-gray-500">Max 2 MB consigliati</p>
				</div>
			</div>

			<div class="space-y-1.5">
				<label for="fw-notes" class="text-sm font-medium">Note di rilascio (opzionale)</label>
				<textarea
					id="fw-notes"
					name="notes"
					rows={3}
					bind:value={notes}
					placeholder="Descrivi le modifiche in questa versione..."
					class="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
				></textarea>
			</div>

			{#if form?.action === 'upload' && form?.error}
				<p class="text-sm text-red-600">{form.error}</p>
			{/if}
			{#if form?.action === 'upload' && form?.success}
				<p class="text-sm text-green-700">Release v{form.version} caricata. Clicca <strong>Attiva</strong> per distribuirla ai device.</p>
			{/if}

			<Button type="submit" disabled={uploading}>
				{uploading ? 'Caricamento...' : 'Carica'}
			</Button>
		</form>
	</div>

	<!-- Release table -->
	<div class="rounded-lg border bg-white shadow-sm">
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Versione</TableHead>
					<TableHead>Data</TableHead>
					<TableHead>Dimensione</TableHead>
					<TableHead>SHA-256</TableHead>
					<TableHead>Stato</TableHead>
					<TableHead>Note</TableHead>
					<TableHead></TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{#each data.releases as release}
					<TableRow>
						<TableCell class="font-mono font-semibold">{release.version}</TableCell>
						<TableCell class="text-sm text-gray-600">{formatDate(release.createdAt)}</TableCell>
						<TableCell class="text-sm text-gray-600">{formatBytes(release.fileSizeBytes)}</TableCell>
						<TableCell class="font-mono text-xs text-gray-500">{release.sha256.slice(0, 12)}…</TableCell>
						<TableCell>
							{#if release.isActive}
								<Badge variant="default" class="bg-green-600">Attiva</Badge>
							{:else}
								<Badge variant="secondary">Inattiva</Badge>
							{/if}
						</TableCell>
						<TableCell class="text-sm text-gray-600 max-w-xs truncate" title={release.releaseNotes ?? ''}>
							{release.releaseNotes || '—'}
						</TableCell>
						<TableCell>
							<div class="flex gap-2">
								{#if !release.isActive}
									<form method="POST" action="?/activate" use:enhance>
										<input type="hidden" name="id" value={release.id} />
										<Button type="submit" size="sm" variant="outline">Attiva</Button>
									</form>
								{:else}
									<form method="POST" action="?/deactivate" use:enhance>
										<input type="hidden" name="id" value={release.id} />
										<Button type="submit" size="sm" variant="ghost" class="text-orange-600 hover:text-orange-700">
											Ritira
										</Button>
									</form>
								{/if}
							</div>
						</TableCell>
					</TableRow>
				{:else}
					<TableRow>
						<TableCell colspan={7} class="py-8 text-center text-gray-500">
							Nessuna release caricata.
						</TableCell>
					</TableRow>
				{/each}
			</TableBody>
		</Table>
	</div>

	<p class="text-xs text-gray-400">
		Solo una release può essere attiva per tipo di device. Attivarne una disattiva automaticamente le altre.
		Un device non scarica aggiornamenti se nessuna release è attiva.
	</p>
</div>
