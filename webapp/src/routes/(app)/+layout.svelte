<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { MediaQuery } from 'svelte/reactivity';
	import {
		LayoutDashboard,
		Users,
		CreditCard,
		ClipboardList,
		Menu,
		X,
		ScanLine,
		Cpu,
		Settings,
		Microchip,
		Shield,
		ChevronDown,
		Usb,
		LogOut,
		Plug,
		UserCog,
		DatabaseBackup,
		Clock3,
		LogIn,
		CircleHelp
	} from '@lucide/svelte';
	import TutorialGuide from '$lib/components/TutorialGuide.svelte';
	import { PAGE_DESCRIPTIONS, type TutorialId } from '$lib/tutorial/copy';
	import {
		connection,
		connect,
		disconnect,
		isWebSerialSupported,
		getConnectionStatusFromState,
		getDeviceName
	} from '$lib/stores/webserial.svelte';

	let { data, children } = $props();

	// ─── Configurazione del menu ────────────────────────────────────────────────

	type NavLink = {
		href: string;
		label: string;
		icon: typeof Users;
		/** Spiegazione mostrata dalla guida Tutorial. */
		tutorial: string;
	};

	type NavGroup = {
		id: string;
		label: string;
		icon: NavLink['icon'];
		tone: 'operations' | 'administration';
		tutorialId: TutorialId;
		links: NavLink[];
	};

	type NavEntry = ({ kind: 'link' } & NavLink) | ({ kind: 'group' } & NavGroup);

	const TUTORIAL_STORAGE_KEY = 'nzbadge-tutorial-enabled';

	const link = (href: string, label: string, icon: NavLink['icon'], tutorial?: string) =>
		({
			kind: 'link',
			href,
			label,
			icon,
			tutorial: tutorial ?? PAGE_DESCRIPTIONS[href] ?? `Apre la sezione ${label.toLowerCase()}.`
		}) satisfies NavEntry;

	const isCollaborator = $derived(data.user.role === 'collaborator');
	const isStaffManager = $derived(data.user.role === 'admin' || data.user.role === 'staff');
	const isUserAdmin = $derived(data.user.role === 'admin');

	const attendanceGroup = $derived<NavGroup>({
		id: 'attendance',
		label: 'Ingressi',
		icon: LogIn,
		tone: 'operations',
		tutorialId: 'nav.toggle-attendance',
		links: [
			link('/today', 'Attesi oggi', Users),
			link(
				'/new-students',
				'Nuovi corsisti',
				Users,
				'Mostra chi deve iniziare un corso nell’intervallo di date selezionato, con esportazione CSV.'
			),
			...(isStaffManager
				? [
						link('/attendance', 'Corsisti', ClipboardList),
						link('/staff-attendance', 'Collaboratori', LogIn)
					]
				: [])
		]
	});

	const adminGroup = $derived<NavGroup>({
		id: 'admin',
		label: 'Amministrazione',
		icon: Shield,
		tone: 'administration',
		tutorialId: 'nav.toggle-admin',
		links: [
			link(
				'/admin/users',
				'Staff e accessi',
				UserCog,
				'Apre la gestione dello staff, dei ruoli e degli accessi.'
			),
			...(isUserAdmin
				? [
						link('/card-diagnostics', 'Verifica tessera', ScanLine),
						link('/devices', 'Dispositivi', Cpu),
						link('/firmware', 'Aggiornamenti', Microchip),
						link('/settings', 'Impostazioni', Settings),
						link('/admin/maintenance', 'Manutenzione', DatabaseBackup)
					]
				: [])
		]
	});

	const navEntries = $derived<NavEntry[]>([
		link('/dashboard', 'Panoramica', LayoutDashboard),
		...(!isCollaborator
			? [link('/subscribers', 'Iscritti', Users), link('/cards', 'Tessere', CreditCard)]
			: []),
		{ kind: 'group', ...attendanceGroup },
		link('/my-attendance', 'I miei ingressi', Clock3),
		...(isStaffManager ? [{ kind: 'group', ...adminGroup } satisfies NavEntry] : [])
	]);

	// ─── Stato ──────────────────────────────────────────────────────────────────

	const pathname = $derived(page.url.pathname);
	const isActiveLink = (href: string) => pathname.startsWith(href);
	const isGroupActive = (group: NavGroup) => group.links.some((l) => isActiveLink(l.href));
	const isAdminActive = $derived(isGroupActive(adminGroup));

	// I gruppi si aprono sulla sezione corrente; l'utente può poi chiuderli o aprirli a mano
	// finché non cambia pagina.
	let openGroups = $derived<Record<string, boolean>>({
		attendance: isGroupActive(attendanceGroup),
		admin: isGroupActive(adminGroup)
	});

	function toggleGroup(id: string) {
		openGroups = { ...openGroups, [id]: !openGroups[id] };
	}

	const desktop = new MediaQuery('min-width: 768px');
	// Il menu mobile si chiude cambiando pagina o passando alla vista desktop.
	let sidebarOpen = $derived.by(() => {
		void desktop.current;
		void pathname;
		return false;
	});

	let tutorialEnabled = $state(false);

	// Letta dopo l'idratazione: il server non conosce la preferenza salvata nel browser.
	onMount(() => {
		try {
			tutorialEnabled = window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
		} catch {
			tutorialEnabled = false;
		}
	});

	function setTutorialEnabled(enabled: boolean) {
		tutorialEnabled = enabled;
		try {
			window.localStorage.setItem(TUTORIAL_STORAGE_KEY, String(enabled));
		} catch {
			// Preferenza non persistente (es. storage disabilitato): resta valida per la sessione.
		}
	}

	const connectionStatus = $derived(
		getConnectionStatusFromState(connection.state, connection.error)
	);
	const deviceDisplayName = $derived(
		connection.deviceInfo ? getDeviceName(connection.deviceInfo.vendorId) : null
	);

	function closeSidebar() {
		sidebarOpen = false;
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && sidebarOpen) closeSidebar();
	}

	const navItemBase =
		'group flex items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all';
	const toneActive = {
		operations: { top: 'bg-blue-600 text-white', sub: 'bg-blue-600/50 text-white' },
		administration: { top: 'bg-violet-700 text-white', sub: 'bg-violet-700/50 text-white' }
	} as const;
</script>

{#snippet navItem(item: NavLink, tone: NavGroup['tone'], nested: boolean)}
	{@const active = isActiveLink(item.href)}
	<li>
		<a
			href={item.href}
			aria-current={active ? 'page' : undefined}
			data-tutorial-title={item.label}
			data-tutorial-description={item.tutorial}
			class="{navItemBase} {nested ? 'py-2' : 'py-2.5'} {active
				? toneActive[tone][nested ? 'sub' : 'top']
				: nested
					? 'text-slate-400 hover:bg-slate-800 hover:text-white'
					: 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
			onclick={closeSidebar}
		>
			<item.icon
				size={nested ? 16 : 18}
				class="transition-transform group-hover:scale-110"
				aria-hidden="true"
			/>
			<span>{item.label}</span>
		</a>
	</li>
{/snippet}

{#snippet navGroup(group: NavGroup)}
	{@const open = openGroups[group.id] ?? false}
	{@const listId = `nav-group-${group.id}`}
	<li>
		<button
			type="button"
			aria-expanded={open}
			aria-controls={open ? listId : undefined}
			data-tutorial={group.tutorialId}
			class="{navItemBase} w-full py-2.5 {isGroupActive(group)
				? toneActive[group.tone].top
				: 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
			onclick={() => toggleGroup(group.id)}
		>
			<group.icon size={18} class="transition-transform group-hover:scale-110" aria-hidden="true" />
			<span class="flex-1 text-left">{group.label}</span>
			<ChevronDown
				size={16}
				class="transition-transform duration-200 {open ? 'rotate-180' : ''}"
				aria-hidden="true"
			/>
		</button>
		{#if open}
			<ul id={listId} class="sidebar-nav-list sidebar-nav-sublist">
				{#each group.links as item (item.href)}
					{@render navItem(item, group.tone, true)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-dvh overflow-hidden bg-background">
	<!-- Mobile Backdrop -->
	{#if sidebarOpen}
		<div
			class="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm transition-opacity md:hidden"
			onclick={closeSidebar}
			role="presentation"
			aria-hidden="true"
		></div>
	{/if}

	<!-- Sidebar (fissa, non scrolla) -->
	<aside
		id="sidebar"
		class="fixed inset-y-0 left-0 z-30 flex w-64 transform flex-col bg-slate-900 text-white transition-transform duration-300 ease-out md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:overflow-hidden
		       {sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}"
	>
		<!-- Logo / Header -->
		<div class="flex h-16 items-center border-b border-slate-700 px-4">
			<div class="flex items-center gap-3">
				<div class="flex h-8 w-8 items-center justify-center rounded bg-blue-600">
					<CreditCard size={18} class="text-white" aria-hidden="true" />
				</div>
				<div class="flex flex-col">
					<span class="text-sm font-semibold text-white">NZBadge</span>
					<span class="text-xs text-slate-400">v{data.version}</span>
				</div>
			</div>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto px-3 py-4" aria-label="Navigazione principale">
			<p class="mb-3 px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
				Gestione quotidiana
			</p>
			<ul class="sidebar-nav-list">
				{#each navEntries as entry (entry.kind === 'link' ? entry.href : entry.id)}
					{#if entry.kind === 'link'}
						{@render navItem(entry, 'operations', false)}
					{:else if entry.links.length > 0}
						{@render navGroup(entry)}
					{/if}
				{/each}
			</ul>
		</nav>

		<!-- Tutorial mode -->
		<div class="border-t border-slate-700 px-3 py-3" data-tutorial-ignore>
			<button
				type="button"
				class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors {tutorialEnabled
					? 'bg-amber-400 text-slate-950 hover:bg-amber-500'
					: 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
				onclick={() => setTutorialEnabled(!tutorialEnabled)}
				aria-pressed={tutorialEnabled}
				aria-label={tutorialEnabled ? 'Disattiva modalità Tutorial' : 'Attiva modalità Tutorial'}
			>
				<CircleHelp size={18} aria-hidden="true" />
				<span class="flex-1 text-left">Tutorial</span>
				<span class="text-[10px] font-semibold tracking-wide uppercase">
					{tutorialEnabled ? 'Attivo' : 'Avvia'}
				</span>
			</button>
		</div>

		<!-- Sidebar Footer -->
		<div class="border-t border-slate-700 p-4">
			<div class="text-xs text-slate-400">
				<p>Accesso effettuato come</p>
				<p class="truncate font-medium text-slate-200" title={data.user.name || data.user.email}>
					{data.user.name || data.user.email}
				</p>
			</div>
			<div class="mt-3 border-t border-slate-700/50 pt-3">
				<a
					href="/copyrights"
					class="inline-flex items-center gap-1.5 text-xs text-slate-500 transition-colors hover:text-slate-300"
				>
					<span>© {new Date().getFullYear()} Copyright e licenze</span>
				</a>
			</div>
		</div>
	</aside>

	<!-- Main Content Area -->
	<div class="flex min-w-0 flex-1 flex-col">
		<!-- Header -->
		<header
			class="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background/95 px-4 shadow-sm backdrop-blur"
		>
			<div class="flex h-full items-center">
				<!-- Mobile Menu Button -->
				<button
					type="button"
					class="-ml-4 inline-flex h-full items-center justify-center px-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:ring-2 focus:ring-blue-500 focus:outline-none focus:ring-inset md:hidden"
					onclick={() => (sidebarOpen = !sidebarOpen)}
					aria-expanded={sidebarOpen}
					aria-controls="sidebar"
					aria-label={sidebarOpen ? 'Chiudi menu di navigazione' : 'Apri menu di navigazione'}
					data-tutorial={sidebarOpen ? 'nav.close-menu' : 'nav.open-menu'}
				>
					{#if sidebarOpen}
						<X size={24} aria-hidden="true" />
					{:else}
						<Menu size={24} aria-hidden="true" />
					{/if}
				</button>

				<!-- Page Title (mobile only) -->
				<span class="mr-4 hidden text-sm font-semibold text-foreground sm:block md:hidden"
					>NZBadge</span
				>

				<!-- WebSerial Connection Section (integrato come sezione della toolbar) -->
				{#if !isCollaborator && browser && isWebSerialSupported()}
					<div
						class="flex h-full items-center bg-muted/50 px-4 md:-ml-4 {connection.state ===
						'connected'
							? 'border-l'
							: 'border-x'}"
						role="region"
						aria-label="Connessione dispositivo USB"
					>
						<!-- Connection Status -->
						<div class="flex items-center gap-3">
							<span class="relative flex h-2 w-2" aria-hidden="true">
								{#if connectionStatus.color === 'green'}
									<span
										class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"
									></span>
									<span class="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
								{:else if connectionStatus.color === 'yellow'}
									<span
										class="relative inline-flex h-2 w-2 animate-pulse rounded-full bg-yellow-500"
									></span>
								{:else if connectionStatus.color === 'red'}
									<span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
								{:else}
									<span class="relative inline-flex h-2 w-2 rounded-full bg-slate-400"></span>
								{/if}
							</span>
							<div class="flex flex-col">
								<span class="text-xs font-medium text-foreground">
									{connectionStatus.label}
								</span>
								{#if deviceDisplayName}
									<span class="hidden text-[10px] text-muted-foreground lg:block">
										{deviceDisplayName}
									</span>
								{/if}
							</div>
						</div>

						<!-- Action Button -->
						{#if connectionStatus.canConnect}
							<button
								type="button"
								class="-mr-4 ml-3 flex h-full items-center gap-2 border-l px-4 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-50 hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-500"
								onclick={connect}
								aria-label="Connetti dispositivo USB"
								data-tutorial="serial.connect"
							>
								<Plug size={16} aria-hidden="true" />
								<span class="hidden sm:inline">Connetti</span>
							</button>
						{:else if connectionStatus.canDisconnect}
							<button
								type="button"
								class="-mr-4 ml-3 flex h-full items-center gap-2 border-r border-l px-4 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 hover:text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-inset"
								onclick={disconnect}
								aria-label="Disconnetti dispositivo USB"
								data-tutorial="serial.disconnect"
							>
								<Usb size={16} aria-hidden="true" />
								<span class="hidden sm:inline">Disconnetti</span>
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- User Section (integrato come sezione della toolbar) -->
			<div class="-mr-4 flex h-full items-center">
				<div
					class="hidden h-full max-w-64 flex-col justify-center border-l bg-muted/50 px-4 lg:flex"
				>
					<p class="truncate text-sm font-medium text-foreground">{data.user.email}</p>
				</div>

				<form method="POST" action="/login?/logout" class="m-0 flex h-full">
					<button
						type="submit"
						class="flex h-full items-center gap-2 border-l px-4 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-inset"
						aria-label="Esci"
						title="Esci"
						data-tutorial="session.logout"
					>
						<LogOut size={18} aria-hidden="true" />
					</button>
				</form>
			</div>
		</header>

		<!-- Main Content (scrollabile) -->
		<main
			class="app-workspace flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8"
			data-area={isAdminActive ? 'administration' : 'operations'}
			aria-label="Contenuto principale"
		>
			<div class="mx-auto w-full max-w-screen-2xl">
				<div class="area-label mb-4">
					{#if isAdminActive}<Shield size={15} aria-hidden="true" />{:else}<LayoutDashboard
							size={15}
							aria-hidden="true"
						/>{/if}
					{isAdminActive ? 'Amministrazione · Configurazione e accessi' : 'Gestione quotidiana'}
				</div>
				{@render children()}
			</div>
		</main>
	</div>
</div>

<!-- Error Toast -->
{#if connection.error && connection.state === 'error'}
	<div
		class="fixed right-4 bottom-4 z-50 max-w-sm rounded-lg bg-red-50 p-4 shadow-lg ring-1 ring-red-200"
		role="alert"
		aria-live="polite"
	>
		<div class="flex items-start gap-3">
			<div class="flex-shrink-0">
				<svg
					class="h-5 w-5 text-red-400"
					viewBox="0 0 20 20"
					fill="currentColor"
					aria-hidden="true"
				>
					<path
						fill-rule="evenodd"
						d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
						clip-rule="evenodd"
					/>
				</svg>
			</div>
			<div class="flex-1">
				<h3 class="text-sm font-medium text-red-800">Errore di connessione</h3>
				<p class="mt-1 text-sm text-red-700">{connection.error}</p>
			</div>
			<button
				type="button"
				class="flex-shrink-0 text-red-400 hover:text-red-600"
				onclick={() => (connection.error = null)}
				aria-label="Chiudi errore"
				data-tutorial="serial.dismiss-error"
			>
				<X size={16} aria-hidden="true" />
			</button>
		</div>
	</div>
{/if}

<TutorialGuide enabled={tutorialEnabled} onDisable={() => setTutorialEnabled(false)} />
