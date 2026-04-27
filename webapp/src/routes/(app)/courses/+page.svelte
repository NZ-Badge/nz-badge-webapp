<script lang="ts">
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
	import { RefreshCw, ExternalLink, ChevronRight } from '@lucide/svelte';

	let { data } = $props();

	let syncing = $state(false);
	let syncError = $state<string | null>(null);
	let syncResult = $state<{ enrollmentsCreated: number; subscribersCreated: number } | null>(null);

	async function handleSync() {
		syncing = true;
		syncError = null;
		syncResult = null;
		try {
			const res = await fetch('/api/v1/courses/sync', {
				method: 'POST',
				credentials: 'include'
			});
			if (!res.ok) {
				const json = await res.json().catch(() => ({}));
				syncError = json.error ?? `Errore server (${res.status})`;
				return;
			}
			const json = await res.json();
			syncResult = json.data ?? json;
			location.reload();
		} catch (err) {
			syncError = err instanceof Error ? err.message : 'Errore sconosciuto';
		} finally {
			syncing = false;
		}
	}

	const statusVariant = (status: string) =>
		status === 'COMPLETED' ? 'default' : status === 'SUBMITTED' ? 'secondary' : 'outline';

	const statusLabel = (status: string) =>
		status === 'COMPLETED'
			? 'Completato'
			: status === 'SUBMITTED'
				? 'Inviato'
				: status === 'PENDING'
					? 'In attesa'
					: status;

	function formatDate(d: Date | string | null): string {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('it-IT');
	}

	function toDateKey(d: Date | string): string {
		if (d instanceof Date) {
			const y = d.getFullYear();
			const m = String(d.getMonth() + 1).padStart(2, '0');
			const day = String(d.getDate()).padStart(2, '0');
			return `${y}-${m}-${day}`;
		}
		return String(d).slice(0, 10);
	}

	function formatDateLong(d: Date | string): string {
		const date = d instanceof Date ? d : new Date(String(d) + 'T00:00:00');
		return date.toLocaleDateString('it-IT', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	}

	type Enrollment = (typeof data.enrollments)[number];

	type CourseGroup = {
		productTitle: string;
		variantTitle: string | null;
		enrollments: Enrollment[];
	};

	type DateGroup = {
		dateKey: string;
		dateLabel: string;
		courses: CourseGroup[];
		courseCount: number;
		enrollmentCount: number;
	};

	function groupEnrollments(items: Enrollment[]): DateGroup[] {
		const map = new Map<string, Omit<DateGroup, 'courseCount' | 'enrollmentCount'>>();

		for (const e of items) {
			const dateKey = e.preferredDate ? toDateKey(e.preferredDate) : '__no_date__';
			const dateLabel = e.preferredDate ? formatDateLong(e.preferredDate) : 'Senza data';

			if (!map.has(dateKey)) {
				map.set(dateKey, { dateKey, dateLabel, courses: [] });
			}

			const dateGroup = map.get(dateKey)!;
			const courseKey = `${e.productTitle ?? ''}||${e.variantTitle ?? ''}`;
			let courseGroup = dateGroup.courses.find(
				(c) => `${c.productTitle}||${c.variantTitle ?? ''}` === courseKey
			);

			if (!courseGroup) {
				courseGroup = {
					productTitle: e.productTitle ?? '—',
					variantTitle: e.variantTitle ?? null,
					enrollments: []
				};
				dateGroup.courses.push(courseGroup);
			}

			courseGroup.enrollments.push(e);
		}

		return Array.from(map.values()).map((group) => ({
			...group,
			courseCount: group.courses.length,
			enrollmentCount: group.courses.reduce((total, course) => total + course.enrollments.length, 0)
		}));
	}

	const grouped = $derived(groupEnrollments(data.enrollments));
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold">Corsi</h1>
			{#if data.lastSync}
				<p class="text-muted-foreground text-sm">
					Ultimo aggiornamento: {formatDate(data.lastSync.completedAt ?? data.lastSync.startedAt)}
					{#if data.lastSync.status === 'success'}
						— {data.lastSync.enrollmentsCreated} nuove iscrizioni, {data.lastSync
							.subscribersCreated} iscritti creati
					{:else if data.lastSync.status === 'error'}
						— <span class="text-red-600">errore</span>
					{/if}
				</p>
			{/if}
		</div>
		<Button onclick={handleSync} disabled={syncing}>
			<RefreshCw size={16} class="mr-2 {syncing ? 'animate-spin' : ''}" />
			{syncing ? 'Aggiornamento...' : 'Aggiorna corsi'}
		</Button>
	</div>

	{#if syncError}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700 ring-1 ring-red-200">
			{syncError}
		</div>
	{/if}

	<!-- Filtri -->
	<form method="GET" class="flex flex-wrap items-center gap-3">
		<Input name="q" placeholder="Cerca email, nome, corso..." value={data.q} class="max-w-xs" />
		<select name="status" class="rounded border px-2 py-1 text-sm">
			<option value="">Tutti gli stati</option>
			{#each ['PENDING', 'SUBMITTED', 'COMPLETED'] as opt}
				<option value={opt} selected={data.status === opt}>{statusLabel(opt)}</option>
			{/each}
		</select>
		<label class="flex cursor-pointer items-center gap-2 text-sm">
			<input type="checkbox" name="showPast" value="1" checked={data.showPast} />
			Mostra passati
		</label>
		<Button type="submit" variant="outline">Filtra</Button>
	</form>

	<!-- Raggruppati per data e corso -->
	{#if grouped.length === 0}
		<div class="text-muted-foreground py-12 text-center text-sm">
			Nessun corso trovato. Premi "Aggiorna corsi" per importare i dati.
		</div>
	{:else}
		<div class="space-y-4">
			{#each grouped as dateGroup}
				<details data-day-group class="group rounded-xl border bg-white">
					<summary
						class="flex cursor-pointer list-none items-center gap-3 px-4 py-4 [&::-webkit-details-marker]:hidden"
					>
						<div
							class="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full"
						>
							<ChevronRight size={16} class="day-chevron transition-transform duration-200" />
						</div>
						<div class="min-w-0 flex-1">
							<h2 class="text-lg font-semibold capitalize">{dateGroup.dateLabel}</h2>
							<p class="text-muted-foreground text-sm">
								{dateGroup.courseCount}
								{dateGroup.courseCount === 1 ? ' corso' : ' corsi'}
								·
								{dateGroup.enrollmentCount}
								{dateGroup.enrollmentCount === 1 ? ' iscritto' : ' iscritti'}
							</p>
						</div>
						<Badge variant="outline" class="shrink-0 text-xs">
							{dateGroup.dateKey === '__no_date__' ? 'Senza data' : dateGroup.dateKey}
						</Badge>
					</summary>

					<div class="space-y-4 border-t px-4 py-4">
						{#each dateGroup.courses as courseGroup}
							<div class="overflow-hidden rounded-lg border">
								<div class="bg-muted/40 flex items-center gap-2 border-b px-4 py-3">
									<div class="min-w-0">
										<div class="truncate font-medium" title={courseGroup.productTitle}>
											{courseGroup.productTitle}
										</div>
										{#if courseGroup.variantTitle}
											<div
												class="text-muted-foreground truncate text-sm"
												title={courseGroup.variantTitle}
											>
												{courseGroup.variantTitle}
											</div>
										{/if}
									</div>
									<Badge variant="outline" class="ml-auto shrink-0 text-xs">
										{courseGroup.enrollments.length}
										{courseGroup.enrollments.length === 1 ? ' iscritto' : ' iscritti'}
									</Badge>
								</div>
								<Table class="min-w-[68rem] table-fixed">
									<colgroup>
										<col class="w-40" />
										<col class="w-56" />
										<col class="w-56" />
										<col class="w-64" />
										<col class="w-32" />
									</colgroup>
									<TableHeader>
										<TableRow>
											<TableHead>Ordine</TableHead>
											<TableHead>Cliente</TableHead>
											<TableHead>Partecipante</TableHead>
											<TableHead>Email</TableHead>
											<TableHead>Stato</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{#each courseGroup.enrollments as enrollment}
											<TableRow>
												<TableCell
													class="font-mono text-xs"
													title={enrollment.orderName ?? undefined}
												>
													<span class="block truncate">{enrollment.orderName ?? '—'}</span>
												</TableCell>
												<TableCell title={enrollment.customerDisplayName ?? undefined}>
													{#if enrollment.customerDisplayName}
														<span class="block truncate">
															{enrollment.customerDisplayName}
														</span>
													{:else}
														<span class="text-muted-foreground">—</span>
													{/if}
												</TableCell>
												<TableCell>
													{#if enrollment.subscriberId}
														<a
															href="/subscribers/{enrollment.subscriberId}"
															class="inline-flex max-w-full items-center gap-1 overflow-hidden text-sm text-blue-600 hover:underline"
															title={`${enrollment.subscriberFirstName ?? ''} ${enrollment.subscriberLastName ?? ''}`.trim()}
														>
															<span class="truncate">
																{`${enrollment.subscriberFirstName ?? ''} ${enrollment.subscriberLastName ?? ''}`.trim()}
															</span>
															<ExternalLink size={12} class="shrink-0" />
														</a>
													{:else}
														<span class="text-muted-foreground text-sm">—</span>
													{/if}
												</TableCell>
												<TableCell class="text-sm" title={enrollment.customerEmail}>
													<span class="block truncate">{enrollment.customerEmail}</span>
												</TableCell>
												<TableCell>
													<Badge variant={statusVariant(enrollment.status)}
														>{statusLabel(enrollment.status)}</Badge
													>
												</TableCell>
											</TableRow>
										{/each}
									</TableBody>
								</Table>
							</div>
						{/each}
					</div>
				</details>
			{/each}
		</div>
	{/if}
</div>

<style>
	details[data-day-group][open] :global(.day-chevron) {
		transform: rotate(90deg);
	}
</style>
