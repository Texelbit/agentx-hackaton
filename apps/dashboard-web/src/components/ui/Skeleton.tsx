import { cn } from './cn';

/**
 * Shimmer skeleton loader. Inline gradient bypasses Vite's CSS parser bug
 * where `linear-gradient(...)` inside `.css` files trips sucrase.
 */
const skeletonStyle: React.CSSProperties = {
  backgroundColor: '#18181b',
  backgroundImage:
    'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.05) 50%, transparent 100%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 2s linear infinite',
};

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-md', className)} style={skeletonStyle} />
  );
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3">
      <Skeleton className="h-8 w-8 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2 w-1/4" />
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-zinc-800/60 bg-zinc-900/40 p-5">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-10 w-20" />
    </div>
  );
}
