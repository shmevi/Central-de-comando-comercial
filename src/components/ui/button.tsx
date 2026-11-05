import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-display uppercase font-bold tracking-wider transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2',
  {
    variants: {
      variant: {
        primary: 'bg-gold-gradient on-gold shadow-[0_6px_20px_-8px_rgb(var(--gold-300)/.6)] hover:brightness-110',
        secondary: 'border border-gold-300/70 text-gold hover:bg-gold-300/10',
        ghost: 'text-fg hover:bg-surface-2',
        danger: 'border border-danger/60 text-danger hover:bg-danger/10',
      },
      size: { sm: 'h-8 px-3 text-sm rounded-lg', md: 'h-10 px-4 text-[15px] rounded-xl', icon: 'h-9 w-9 rounded-lg' },
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
