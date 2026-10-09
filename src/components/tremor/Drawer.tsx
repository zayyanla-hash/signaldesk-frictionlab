// Ported from Tremor Raw / Tremor Insights template (MIT License).
// Source: src/components/Drawer.tsx, https://github.com/tremorlabs/tremor-insights

import * as DrawerPrimitives from '@radix-ui/react-dialog';
import { RiCloseLine } from '@remixicon/react';
import * as React from 'react';

import { cx, focusRing } from '@/components/tremor/lib/utils';
import { Button } from '@/components/tremor/Button';

const Drawer = (props: React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Root>) => <DrawerPrimitives.Root {...props} />;
Drawer.displayName = 'Drawer';

const DrawerTrigger = React.forwardRef<React.ElementRef<typeof DrawerPrimitives.Trigger>, React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Trigger>>(
  ({ className, ...props }, ref) => <DrawerPrimitives.Trigger ref={ref} className={cx(className)} {...props} />
);
DrawerTrigger.displayName = 'Drawer.Trigger';

const DrawerClose = React.forwardRef<React.ElementRef<typeof DrawerPrimitives.Close>, React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Close>>(
  ({ className, ...props }, ref) => <DrawerPrimitives.Close ref={ref} className={cx(className)} {...props} />
);
DrawerClose.displayName = 'Drawer.Close';

const DrawerPortal = DrawerPrimitives.Portal;

const DrawerOverlay = React.forwardRef<React.ElementRef<typeof DrawerPrimitives.Overlay>, React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Overlay>>(
  ({ className, ...props }, forwardedRef) => (
    <DrawerPrimitives.Overlay ref={forwardedRef} className={cx('fixed inset-0 z-50 overflow-y-auto', 'bg-black/30 dark:bg-black/60', className)} {...props} />
  )
);
DrawerOverlay.displayName = 'DrawerOverlay';

interface DrawerContentProps extends React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Content> {
  side?: 'left' | 'right';
}

const DrawerContent = React.forwardRef<React.ElementRef<typeof DrawerPrimitives.Content>, DrawerContentProps>(
  ({ className, side = 'right', ...props }, forwardedRef) => (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitives.Content
        ref={forwardedRef}
        className={cx(
          'fixed inset-y-0 z-50 flex h-full w-[90vw] max-w-md flex-1 flex-col overflow-y-auto p-4 shadow-xl focus:outline-none sm:p-6',
          side === 'left' ? 'left-0 border-r' : 'right-0 border-l',
          'border-gray-200 dark:border-gray-900',
          'bg-white dark:bg-[#090E1A]',
          focusRing,
          className
        )}
        {...props}
      />
    </DrawerPortal>
  )
);
DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(({ children, className, ...props }, ref) => (
  <div ref={ref} className="-mx-6 flex items-start justify-between gap-x-4 border-b border-gray-200 px-6 pb-4 dark:border-gray-900" {...props}>
    <div className={cx('mt-1 flex flex-col gap-y-1', className)}>{children}</div>
    <DrawerPrimitives.Close asChild>
      <Button variant="ghost" className="aspect-square p-1 text-gray-500 hover:bg-gray-100 hover:dark:bg-gray-400/10">
        <RiCloseLine className="size-6" aria-hidden="true" />
      </Button>
    </DrawerPrimitives.Close>
  </div>
));
DrawerHeader.displayName = 'Drawer.Header';

const DrawerTitle = React.forwardRef<React.ElementRef<typeof DrawerPrimitives.Title>, React.ComponentPropsWithoutRef<typeof DrawerPrimitives.Title>>(
  ({ className, ...props }, forwardedRef) => (
    <DrawerPrimitives.Title ref={forwardedRef} className={cx('text-base font-semibold', 'text-gray-900 dark:text-gray-50', className)} {...props} />
  )
);
DrawerTitle.displayName = 'DrawerTitle';

const DrawerBody = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cx('flex-1 py-4', className)} {...props} />
));
DrawerBody.displayName = 'Drawer.Body';

export { Drawer, DrawerBody, DrawerClose, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger };
