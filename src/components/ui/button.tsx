import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-semibold transition-all active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2',
  {
    variants: {
      variant: {
        // Dourado só na ação principal da tela.
        primary: 'bg-gold-gradient on-gold shadow-[0_8px_24px_-12px_rgb(var(--gold-300)/.7)] hover:brightness-[1.06]',
        secondary: 'border border-border bg-surface-2/70 text-fg hover:border-gold-300/40 hover:bg-surface-3',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border border-danger/40 text-danger hover:bg-danger/10',
      },
      size: { sm: 'h-8 px-3 text-xs rounded-lg', md: 'h-10 px-4 rounded-xl', icon: 'h-9 w-9 rounded-lg' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, type, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} type={asChild ? undefined : (type ?? 'button')} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';
