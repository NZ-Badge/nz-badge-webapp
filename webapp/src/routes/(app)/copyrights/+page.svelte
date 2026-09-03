<script lang="ts">
	import {
		Card,
		CardContent,
		CardDescription,
		CardHeader,
		CardTitle
	} from '$lib/components/ui/card';
	import { openSourceLibraryGroups } from '$lib/data/open-source-libraries';
	import { Copyright, Github, FileText, ExternalLink } from '@lucide/svelte';

	const currentYear = new Date().getFullYear();
</script>

<div class="mx-auto max-w-3xl space-y-6">
	<div class="flex items-center gap-3">
		<Copyright size={28} class="text-slate-600" />
		<h1 class="text-2xl font-bold">Copyright e licenze</h1>
	</div>

	<Card>
		<CardHeader>
			<CardTitle>NZBadge</CardTitle>
			<CardDescription>Copyright © {currentYear} - Licenza MIT</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<p class="text-sm text-slate-600">
				NZBadge è un sistema open source per la gestione delle presenze tramite badge RFID. Supporta
				la registrazione degli ingressi e delle uscite di corsisti e collaboratori; i collaboratori
				possono inoltre accedere con il proprio account e timbrare direttamente via web. Il progetto
				comprende l'applicazione web, il firmware per i dispositivi embedded e hardware dedicato
				aperto, dal progetto del PCB al case stampabile con una stampante 3D.
			</p>

			<div class="mt-4 rounded-lg bg-slate-50 p-4">
				<div class="flex items-center gap-2 text-sm font-medium text-slate-700">
					<span>Autore</span>
				</div>
				<p class="mt-1 text-sm text-slate-600">Nicola Tomassoni</p>
				<a
					href="https://www.nicolatomassoni.it"
					target="_blank"
					rel="noopener noreferrer"
					class="block text-sm text-blue-600 hover:text-blue-700"
				>
					www.nicolatomassoni.it
				</a>
				<a href="mailto:io@nicolatomassoni.it" class="text-sm text-blue-600 hover:text-blue-700">
					io@nicolatomassoni.it
				</a>
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<FileText size={20} />
				Librerie Open Source
			</CardTitle>
			<CardDescription>
				Dipendenze dirette open source dell'applicazione web e del firmware
			</CardDescription>
		</CardHeader>
		<CardContent>
			<div class="space-y-6">
				{#each openSourceLibraryGroups as group}
					<section class="space-y-2">
						<h3 class="text-sm font-semibold text-slate-700">{group.name}</h3>
						{#each group.libraries as lib}
							<div
								class="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 transition-colors hover:bg-slate-50"
							>
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-medium text-slate-700">{lib.name}</span>
									<span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
										{lib.license}
									</span>
								</div>
								<a
									href={lib.url}
									target="_blank"
									rel="noopener noreferrer"
									class="inline-flex shrink-0 items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
								>
									<span class="hidden sm:inline">Sito web</span>
									<ExternalLink size={14} />
								</a>
							</div>
						{/each}
					</section>
				{/each}
			</div>
		</CardContent>
	</Card>

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Github size={20} />
				Repository
			</CardTitle>
		</CardHeader>
		<CardContent>
			<p class="text-sm text-slate-600">
				Il codice sorgente è disponibile su GitHub. Per segnalazioni bug o contributi, consulta la
				repository ufficiale.
			</p>
			<div class="mt-4">
				<a
					href="https://github.com/NZ-Badge"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
				>
					<Github size={16} />
					github.com/NZ-Badge
				</a>
			</div>
		</CardContent>
	</Card>
</div>
