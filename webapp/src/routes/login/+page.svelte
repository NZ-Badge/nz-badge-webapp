<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { CreditCard, Eye, EyeOff } from '@lucide/svelte';

	let { form } = $props();
	let showPassword = $state(false);
</script>

<div class="flex min-h-dvh items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
	<div
		class="w-full max-w-sm space-y-6 rounded-xl border border-blue-200 bg-card p-6 shadow-sm sm:p-8 dark:border-blue-900"
	>
		<div class="text-center">
			<div class="mx-auto mb-4 grid size-12 place-items-center rounded-xl bg-blue-600 text-white">
				<CreditCard size={25} aria-hidden="true" />
			</div>
			<p class="mb-1 text-xs font-semibold tracking-widest text-muted-foreground">NZBADGE</p>
			<h1 class="text-2xl font-bold">Accesso staff</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				Accedi con le tue credenziali per gestire tessere e presenze.
			</p>
		</div>

		{#if form?.error}
			<p class="text-center text-sm text-red-600">{form.error}</p>
		{/if}

		<form method="POST" action="?/login" use:enhance class="space-y-4">
			<div class="space-y-1">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" required autocomplete="email" />
			</div>
			<div class="space-y-1">
				<Label for="password">Password</Label>
				<div class="relative">
					<Input
						id="password"
						name="password"
						type={showPassword ? 'text' : 'password'}
						required
						autocomplete="current-password"
						class="pr-10"
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						class="absolute top-1/2 right-1 -translate-y-1/2 text-gray-500 hover:text-gray-900"
						aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
						aria-pressed={showPassword}
						onclick={() => (showPassword = !showPassword)}
					>
						{#if showPassword}
							<EyeOff size={16} />
						{:else}
							<Eye size={16} />
						{/if}
					</Button>
				</div>
			</div>
			<Button type="submit" class="w-full">Accedi</Button>
		</form>
	</div>
</div>
