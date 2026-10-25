import * as React from 'react';
import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'outline' | 'destructive' | 'ghost';

export function Button({
  className,
  variant = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  const variantClass = {
    default:
      'bg-blue-600 text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500',
    outline:
      'border border-blue-200 bg-white/90 text-blue-900 shadow-sm hover:bg-blue-50 hover:text-blue-950 focus-visible:ring-blue-500',
    destructive:
      'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500',
    ghost:
      'text-slate-700 hover:bg-blue-50 hover:text-blue-900 focus-visible:ring-blue-500',
  }[variant];

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variantClass,
        className
      )}
      {...props}
    />
  );
}