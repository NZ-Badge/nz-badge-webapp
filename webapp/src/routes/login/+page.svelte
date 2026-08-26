<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Eye, EyeOff } from '@lucide/svelte';

	let { form } = $props();
	let showPassword = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-gray-50">
	<div class="w-full max-w-sm space-y-6 rounded-lg bg-white p-8 shadow">
		<h1 class="text-center text-2xl font-bold">Accesso staff</h1>

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
