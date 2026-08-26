<script lang="ts">
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
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
		Clock3,
		LogIn
	} from '@lucide/svelte';
	import {
		connection,
		connect,
		disconnect,
		isWebSerialSupported,
		getConnectionStatusFromState,
		getDeviceName
	} from '$lib/stores/webserial.svelte';
	import { onMount } from 'svelte';

	// Props with Svelte 5 runes
	let { data, children } = $props();

	// Local state
	let sidebarOpen = $state(false);
	let isMobile = $state(false);
	let adminSubmenuOpen = $state(false);
	let attendanceSubmenuOpen = $state(false);

	// Navigation links with icons
	const isCollaborator = $derived(data.user.role === 'collaborator');
	const isStaffManager = $derived(data.user.role === 'admin' || data.user.role === 'staff');
	const isUserAdmin = $derived(data.user.role === 'admin');

	const navLinks = $derived([
		{ href: '/dashboard', label: 'Panoramica', icon: LayoutDashboard },
		...(!isCollaborator
			? [
					{ href: '/subscribers', label: 'Iscritti', icon: Users },
					{ href: '/cards', label: 'Tessere', icon: CreditCard }
				]
			: [])
	]);

	const attendanceLinks = $derived([
		...(isStaffManager ? [{ href: '/attendance', label: 'Corsisti', icon: ClipboardList }] : []),
		{ href: '/staff-attendance', label: 'Collaboratori', icon: LogIn }
	]);

	// Admin submenu links (only visible to admin users)
	const adminLinks = $derived([
		...(isUserAdmin
			? [
					{ href: '/card-diagnostics', label: 'Diagnostica card', icon: ScanLine },
					{ href: '/devices', label: 'Dispositivi', icon: Cpu },
					{ href: '/firmware', label: 'Firmware', icon: Microchip },
					{ href: '/settings', label: 'Impostazioni', icon: Settings }
				]
			: []),
		{ href: '/admin/users', label: 'Staff', icon: UserCog }
	]);

	// Check if any admin link is active
	const isAdminActive = $derived(
		adminLinks.some((link) => $page.url.pathname.startsWith(link.href))
	);
	const isAttendanceActive = $derived(
		attendanceLinks.some((link) => $page.url.pathname.startsWith(link.href))
	);

	// Derived state
	const isActiveLink = $derived((href: string) => $page.url.pathname.startsWith(href));
	const connectionStatus = $derived(
		getConnectionStatusFromState(connection.state, connection.error)
	);
	const deviceDisplayName = $derived(
		connection.deviceInfo ? getDeviceName(connection.deviceInfo.vendorId) : null
	);

	// Check for mobile viewport
	onMount(() => {
		const checkMobile = () => {
			isMobile = window.innerWidth < 768;
			if (!isMobile) sidebarOpen = false;
		};

		checkMobile();
		window.addEventListener('resize', checkMobile);

		return () => window.removeEventListener('resize', checkMobile);
	});

	// Close sidebar handler
	function closeSidebar() {
		sidebarOpen = false;
	}

	// Toggle admin submenu
	function toggleAdminSubmenu() {
		adminSubmenuOpen = !adminSubmenuOpen;
	}

	function toggleAttendanceSubmenu() {
		attendanceSubmenuOpen = !attendanceSubmenuOpen;
	}

	// Toggle sidebar handler
	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	// Handle connection with error recovery
	async function handleConnect() {
		await connect();
	}

	// Keyboard shortcut handler for ESC to close sidebar
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && sidebarOpen) {
			closeSidebar();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="flex h-screen overflow-hidden bg-background">
	<!-- Mobile Backdrop -->
	{#if sidebarOpen}
		<div
			class="fixed inset-0 z-20 bg-black/50 backdrop-blur-sm md:hidden transition-opacity"
			onclick={closeSidebar}
			role="presentation"
			aria-hidden="true"
		></div>
	{/if}

	<!-- Sidebar (fissa, non scrolla) -->
	<aside
		class="fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-slate-900 text-white
		       transform transition-transform duration-300 ease-out
		       md:sticky md:top-0 md:z-auto md:h-screen md:translate-x-0 md:overflow-hidden
		       {sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}"
		role="navigation"
		aria-label="Navigazione principale"
	>
		<!-- Logo / Header -->
		<div class="flex h-16 items-center border-b border-slate-700 px-4">
			<div class="flex items-center gap-3">
				<div class="flex h-8 w-8 items-center justify-center rounded bg-blue-600">
					<CreditCard size={18} class="text-white" />
				</div>
				<div class="flex flex-col">
					<span class="text-sm font-semibold text-white">Presenze RFID</span>
					<span class="text-xs text-slate-400">v{data.version}</span>
				</div>
			</div>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 overflow-y-auto px-3 py-4">
			<ul class="space-y-1" role="menubar">
				{#each navLinks as link}
					{@const isActive = isActiveLink(link.href)}
					<li role="none">
						<a
							href={link.href}
							role="menuitem"
							aria-current={isActive ? 'page' : undefined}
							class="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all
							       {isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
							onclick={closeSidebar}
						>
							<link.icon size={18} class="transition-transform group-hover:scale-110" />
							<span>{link.label}</span>
							{#if isActive}
								<span class="sr-only">(pagina corrente)</span>
							{/if}
						</a>
					</li>
				{/each}

				<li role="none" class="pt-2">
					<button
						type="button"
						role="menuitem"
						aria-expanded={attendanceSubmenuOpen}
						class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all
						{isAttendanceActive
							? 'bg-blue-600 text-white'
							: 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
						onclick={toggleAttendanceSubmenu}
					>
						<LogIn size={18} />
						<span class="flex-1 text-left">Ingressi</span>
						<ChevronDown
							size={16}
							class="transition-transform {attendanceSubmenuOpen ? 'rotate-180' : ''}"
						/>
					</button>
					{#if attendanceSubmenuOpen || isAttendanceActive}
						<ul class="mt-1 space-y-1 pl-4" role="menu">
							{#each attendanceLinks as link}
								{@const isActive = isActiveLink(link.href)}
								<li>
									<a
										href={link.href}
										class="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium {isActive
											? 'bg-blue-600/50 text-white'
											: 'text-slate-400 hover:bg-slate-800 hover:text-white'}"
										onclick={closeSidebar}><link.icon size={16} /><span>{link.label}</span></a
									>
								</li>
							{/each}
						</ul>
					{/if}
				</li>

				<li role="none">
					<a
						href="/my-attendance"
						role="menuitem"
						aria-current={isActiveLink('/my-attendance') ? 'page' : undefined}
						class="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all {isActiveLink(
							'/my-attendance'
						)
							? 'bg-blue-600 text-white'
							: 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
						onclick={closeSidebar}
					>
						<Clock3 size={18} /><span>I miei ingressi</span>
					</a>
				</li>

				<!-- Admin submenu: full for admins, Staff only for operators. -->
				{#if isStaffManager}
					<li role="none" class="pt-2">
						<button
							type="button"
							role="menuitem"
							aria-expanded={adminSubmenuOpen}
							aria-haspopup="true"
							class="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all
						       {isAdminActive
								? 'bg-blue-600 text-white'
								: 'text-slate-300 hover:bg-slate-800 hover:text-white'}"
							onclick={toggleAdminSubmenu}
						>
							<Shield size={18} class="transition-transform group-hover:scale-110" />
							<span class="flex-1 text-left">Amministrazione</span>
							<ChevronDown
								size={16}
								class="transition-transform duration-200 {adminSubmenuOpen ? 'rotate-180' : ''}"
							/>
						</button>

						{#if adminSubmenuOpen}
							<ul class="mt-1 space-y-1 pl-4" role="menu">
								{#each adminLinks as link}
									{@const isActive = isActiveLink(link.href)}
									<li role="none">
										<a
											href={link.href}
											role="menuitem"
											aria-current={isActive ? 'page' : undefined}
											class="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all
										       {isActive
												? 'bg-blue-600/50 text-white'
												: 'text-slate-400 hover:bg-slate-800 hover:text-white'}"
											onclick={closeSidebar}
										>
											<link.icon size={16} class="transition-transform group-hover:scale-110" />
											<span>{link.label}</span>
											{#if isActive}
												<span class="sr-only">(pagina corrente)</span>
											{/if}
										</a>
									</li>
								{/each}
							</ul>
						{/if}
					</li>
				{/if}
			</ul>
		</nav>

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
			class="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white/95 backdrop-blur px-4 shadow-sm"
		>
			<div class="flex h-full items-center">
				<!-- Mobile Menu Button -->
				<button
					type="button"
					class="-ml-4 inline-flex h-full items-center justify-center px-4 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 md:hidden"
					onclick={toggleSidebar}
					aria-expanded={sidebarOpen}
					aria-controls="sidebar"
					aria-label={sidebarOpen ? 'Chiudi menu di navigazione' : 'Apri menu di navigazione'}
				>
					{#if sidebarOpen}
						<X size={24} aria-hidden="true" />
					{:else}
						<Menu size={24} aria-hidden="true" />
					{/if}
				</button>

				<!-- Page Title (mobile only) -->
				<h1 class="text-lg font-semibold text-slate-900 md:hidden">Presenze RFID</h1>

				<!-- WebSerial Connection Section (integrato come sezione della toolbar) -->
				{#if !isCollaborator && browser && isWebSerialSupported()}
					<div
						class="-ml-4 flex h-full items-center border-slate-200 bg-slate-50/50 px-4 {connection.state ===
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
								<span class="text-xs font-medium text-slate-700">
									{connectionStatus.label}
								</span>
								{#if deviceDisplayName}
									<span class="hidden text-[10px] text-slate-400 lg:block">
										{deviceDisplayName}
									</span>
								{/if}
							</div>
						</div>

						<!-- Action Button -->
						{#if connectionStatus.canConnect}
							<button
								type="button"
								class="ml-3 -mr-4 flex h-full items-center gap-2 border-l border-slate-200 px-4 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none"
								onclick={handleConnect}
								aria-label="Connetti dispositivo USB"
							>
								<Plug size={16} />
								<span class="hidden sm:inline">Connetti</span>
							</button>
						{:else if connectionStatus.canDisconnect}
							<button
								type="button"
								class="ml-3 -mr-4 flex h-full items-center gap-2 border-l border-r border-slate-200 px-4 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none"
								onclick={disconnect}
								aria-label="Disconnetti dispositivo USB"
							>
								<Usb size={16} />
								<span class="hidden sm:inline">Disconnetti</span>
							</button>
						{/if}
					</div>
				{/if}
			</div>

			<!-- User Section (integrato come sezione della toolbar) -->
			<div class="-mr-4 flex h-full items-center">
				<!-- User Info Section -->
				<div
					class="flex h-full flex-col justify-center border-l border-slate-200 bg-slate-50/50 px-4"
				>
					<p class="text-sm font-medium text-slate-900">{data.user.email}</p>
				</div>

				<!-- Logout Section -->
				<form method="POST" action="/login?/logout" class="m-0 flex h-full">
					<button
						type="submit"
						class="flex h-full items-center gap-2 border-l border-slate-200 px-4 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none"
						aria-label="Esci"
						title="Esci"
					>
						<LogOut size={18} />
					</button>
				</form>
			</div>
		</header>

		<!-- Main Content (scrollabile) -->
		<main class="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" aria-label="Contenuto principale">
			{@render children()}
		</main>
	</div>
</div>

<!-- Error Toast -->
{#if connection.error && connection.state === 'error'}
	<div
		class="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg bg-red-50 p-4 shadow-lg ring-1 ring-red-200"
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
			>
				<X size={16} />
			</button>
		</div>
	</div>
{/if}
