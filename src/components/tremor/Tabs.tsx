// Ported for FrictionLab's Funnel investigation workspace.
// Uses @radix-ui/react-tabs (already a dependency) for accessible tab semantics.
// Content panels are force-mounted so e2e assertions and screen readers can
// always reach their text and controls, even while a panel is visually hidden.

import * as TabsPrimitives from '@radix-ui/react-tabs';
import React from 'react';

import { cx, focusRing } from '@/components/tremor/lib/utils';

const Tabs = TabsPrimitives.Root;
Tabs.displayName = 'Tabs';

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitives.List>, React.ComponentPropsWithoutRef<typeof TabsPrimitives.List>>(
  ({ className, ...props }, forwardedRef) => (
    <TabsPrimitives.List
      ref={forwardedRef}
      className={cx('flex items-center gap-1 overflow-x-auto', className)}
      {...props}
    />
  )
);
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<React.ElementRef<typeof TabsPrimitives.Trigger>, React.ComponentPropsWithoutRef<typeof TabsPrimitives.Trigger>>(
  ({ className, ...props }, forwardedRef) => (
    <TabsPrimitives.Trigger
      ref={forwardedRef}
      className={cx(
        'fl-tab shrink-0 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-[var(--fl-text-subtle)] transition-colors',
        'hover:text-[var(--fl-text)]',
        'data-[state=active]:border-[var(--fl-amber)] data-[state=active]:text-[var(--fl-text)]',
        focusRing,
        className
      )}
      {...props}
    />
  )
);
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitives.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitives.Content> & { forceMount?: boolean }
>(({ className, forceMount = true, ...props }, forwardedRef) => (
  <TabsPrimitives.Content
    ref={forwardedRef}
    forceMount={forceMount}
    className={cx('outline-none data-[state=inactive]:hidden', className)}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsContent, TabsList, TabsTrigger };
