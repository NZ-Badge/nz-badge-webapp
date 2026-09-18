<script lang="ts" module>
	import { cn, type WithElementRef } from '$lib/utils/ui.js';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { type VariantProps, tv } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: "focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-blue-700 shadow-xs',
				positive:
					'bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-600/30 shadow-xs',
				warning:
					'bg-amber-400 text-slate-950 hover:bg-amber-500 focus-visible:ring-amber-500/40 shadow-xs',
				destructive:
					'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600/30 shadow-xs',
				outline:
					'bg-background hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 border shadow-xs',
				secondary:
					'border border-slate-300 bg-slate-100 text-slate-900 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700 shadow-xs',
				'quick-action':
					'whitespace-normal border border-blue-300 bg-blue-50 text-left font-semibold text-blue-900 shadow-sm hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-100 hover:text-blue-950 hover:shadow-md dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-100 dark:hover:bg-blue-950',
				ghost:
					'text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
				'positive-ghost':
					'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:ring-emerald-600/30 dark:text-emerald-400 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-300',
				'warning-ghost':
					'text-amber-700 hover:bg-amber-50 hover:text-amber-800 focus-visible:ring-amber-500/40 dark:text-amber-400 dark:hover:bg-amber-950/50 dark:hover:text-amber-300',
				'destructive-ghost':
					'text-red-700 hover:bg-red-50 hover:text-red-800 focus-visible:ring-red-600/30 dark:text-red-400 dark:hover:bg-red-950/50 dark:hover:text-red-300',
				link: 'text-blue-700 underline-offset-4 hover:text-blue-800 hover:underline dark:text-blue-300 dark:hover:text-blue-200'
			},
			size: {
				default: 'h-9 px-4 py-2 has-[>svg]:px-3',
				sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
				lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
				icon: 'size-9',
				'icon-sm': 'size-8',
				'icon-lg': 'size-10'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		disabled,
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		href={disabled ? undefined : href}
		aria-disabled={disabled}
		role={disabled ? 'link' : undefined}
		tabindex={disabled ? -1 : undefined}
		{...restProps}
	>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		data-slot="button"
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{disabled}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}
