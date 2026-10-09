// Ported from Tremor Raw / Tremor Insights template (MIT License).
// Source: src/components/Button.tsx, https://github.com/tremorlabs/tremor-insights

import { Slot } from '@radix-ui/react-slot';
import { RiLoader2Fill } from '@remixicon/react';
import React from 'react';
import { tv, type VariantProps } from 'tailwind-variants';

import { cx, focusRing } from '@/components/tremor/lib/utils';

const buttonVariants = tv({
  base: [
    'relative inline-flex items-center justify-center whitespace-nowrap rounded-md border px-3 py-2 text-center font-medium shadow-sm transition-all duration-100 ease-in-out text-base sm:text-sm',
    'disabled:pointer-events-none disabled:shadow-none',
    focusRing,
  ],
  variants: {
    variant: {
      primary: [
        'border-transparent',
        'text-white dark:text-white',
        'bg-indigo-600 dark:bg-indigo-500',
        'hover:bg-indigo-700 dark:hover:bg-indigo-600',
        'disabled:bg-gray-100 disabled:text-gray-400',
        'disabled:dark:bg-gray-800 disabled:dark:text-gray-600',
      ],
      secondary: [
        'border-gray-300 dark:border-gray-800',
        'text-gray-900 dark:text-gray-50',
        'bg-white dark:bg-gray-900',
        'hover:bg-gray-50 dark:hover:bg-gray-800/30',
        'disabled:text-gray-400',
        'disabled:dark:text-gray-600',
      ],
      light: [
        'shadow-none',
        'border-transparent',
        'text-gray-900 dark:text-gray-50',
        'bg-gray-200 dark:bg-gray-900',
        'hover:bg-gray-300/70 dark:hover:bg-gray-800/80',
        'disabled:bg-gray-100 disabled:text-gray-400',
        'disabled:dark:bg-gray-800 disabled:dark:text-gray-600',
      ],
      ghost: [
        'shadow-none',
        'border-transparent',
        'text-gray-900 dark:text-gray-50',
        'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/80',
        'disabled:text-gray-400',
        'disabled:dark:text-gray-600',
      ],
    },
  },
  defaultVariants: { variant: 'primary' },
});

interface ButtonProps extends React.ComponentPropsWithoutRef<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isLoading?: boolean;
  loadingText?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ asChild, isLoading = false, loadingText, className, disabled, variant, children, ...props }, forwardedRef) => {
    const Component = asChild ? Slot : 'button';
    return (
      <Component ref={forwardedRef} className={cx(buttonVariants({ variant }), className)} disabled={disabled || isLoading} {...props}>
        {isLoading ? (
          <span className="pointer-events-none flex shrink-0 items-center justify-center gap-1.5">
            <RiLoader2Fill className="size-4 shrink-0 animate-spin" aria-hidden="true" />
            <span className="sr-only">{loadingText ? loadingText : 'Loading'}</span>
            {loadingText ? loadingText : children}
          </span>
        ) : (
          children
        )}
      </Component>
    );
  }
);

Button.displayName = 'Button';

export { Button, buttonVariants, type ButtonProps };
