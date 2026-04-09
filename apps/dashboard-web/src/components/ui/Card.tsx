import { motion, type HTMLMotionProps } from 'framer-motion';
import { forwardRef } from 'react';
import { cn } from './cn';

interface CardProps extends HTMLMotionProps<'div'> {
  hover?: boolean;
  glow?: boolean;
}

/**
 * Raised surface for the dark theme. Solid `bg-zinc-900` so it always reads
 * as a card on top of the page background, regardless of what's behind.
 * Translucent variants caused readability issues over the gradient mesh.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ hover, glow, className, children, ...props }, ref) => {
    return (
      <motion.div
        ref={ref}
        className={cn(
          'relative rounded-2xl border border-zinc-800 bg-zinc-900',
          'shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-12px_rgba(0,0,0,0.6)]',
          hover && 'transition-colors hover:border-zinc-700 hover:bg-zinc-900',
          glow && 'shadow-[0_0_60px_-15px_rgba(99,102,241,0.45)]',
          className,
        )}
        {...props}
      >
        {children}
      </motion.div>
    );
  },
);
Card.displayName = 'Card';

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between border-b border-zinc-800 px-6 py-4',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold tracking-tight text-zinc-100">
      {children}
    </h3>
  );
}

export function CardDescription({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-xs text-zinc-500">{children}</p>;
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('p-6', className)}>{children}</div>;
}
