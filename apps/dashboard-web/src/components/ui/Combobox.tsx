import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import {
  KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from './cn';

export interface ComboboxOption {
  value: string;
  label: string;
  /** Optional sub-label shown right of the main label (e.g. "default") */
  hint?: string;
  /** Optional group label — consecutive options with the same group are bundled */
  group?: string;
}

interface ComboboxProps {
  value: string;
  options: ComboboxOption[];
  onChange: (next: string) => void;
  placeholder?: string;
  /**
   * When true, allows the user to type and submit a value that isn't in
   * `options`. Used for the "custom branch name" path in the branch picker.
   */
  allowCustom?: boolean;
  /** Visual tone of the trigger when a value is set. */
  tone?: 'neutral' | 'brand' | 'emerald' | 'amber';
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  /** Extra content rendered at the bottom of the dropdown (e.g. footer hint). */
  footer?: React.ReactNode;
}

const TONE_CLASSES: Record<NonNullable<ComboboxProps['tone']>, string> = {
  neutral: 'border-zinc-800 bg-zinc-950 text-zinc-400',
  brand:
    'border-brand-500/40 bg-brand-500/10 text-brand-300 ring-1 ring-brand-500/20',
  emerald:
    'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20',
  amber:
    'border-amber-500/40 bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20',
};

/**
 * Searchable combobox. Click the trigger to open a popover with a search
 * box at the top and a scrollable list below. Keyboard-navigable:
 *
 *   ↑/↓     — move highlight
 *   Enter   — select highlighted option (or commit typed custom value)
 *   Esc     — close
 *   Type    — filter
 *
 * Rendered as a plain div-based popover (no portal) so it inherits the
 * dashboard's theme tokens naturally. Click-outside closes it.
 */
export function Combobox({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  allowCustom = false,
  tone = 'neutral',
  emptyLabel = 'No results',
  disabled,
  className,
  footer,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset query/highlight when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightIndex(0);
      // Focus the search input on next tick so the popover is mounted
      const id = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [open]);

  // Click outside → close
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e: MouseEvent): void => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Clamp highlight index whenever the filtered list shrinks
  useEffect(() => {
    if (highlightIndex >= filteredOptions.length) {
      setHighlightIndex(Math.max(0, filteredOptions.length - 1));
    }
  }, [filteredOptions.length, highlightIndex]);

  const selected = options.find((o) => o.value === value);
  const triggerLabel =
    selected?.label ?? (value ? value : placeholder);

  const commit = useCallback(
    (nextValue: string): void => {
      onChange(nextValue);
      setOpen(false);
    },
    [onChange],
  );

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((i) =>
        Math.min(i + 1, filteredOptions.length - 1),
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = filteredOptions[highlightIndex];
      if (picked) commit(picked.value);
      else if (allowCustom && query.trim()) commit(query.trim());
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  // Group the filtered options by their `group` field (consecutive only)
  const grouped = useMemo(() => {
    const out: { group: string | undefined; items: ComboboxOption[] }[] = [];
    for (const opt of filteredOptions) {
      const last = out[out.length - 1];
      if (last && last.group === opt.group) {
        last.items.push(opt);
      } else {
        out.push({ group: opt.group, items: [opt] });
      }
    }
    return out;
  }, [filteredOptions]);

  const isValueSet = value !== '' && value !== undefined;

  return (
    <div
      ref={rootRef}
      className={cn('relative inline-block min-w-[180px]', className)}
    >
      {/* Trigger */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-9 w-full items-center justify-between gap-2 rounded-lg border px-3 text-[12px] font-medium transition',
          'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isValueSet ? TONE_CLASSES[tone] : TONE_CLASSES.neutral,
        )}
      >
        <span
          className={cn(
            'truncate font-mono',
            !isValueSet && 'text-zinc-500',
          )}
        >
          {triggerLabel}
        </span>
        <div className="flex shrink-0 items-center gap-1 text-zinc-500">
          {isValueSet && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                commit('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  commit('');
                }
              }}
              className="rounded p-0.5 hover:bg-zinc-800 hover:text-zinc-300"
              title="Clear"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform',
              open && 'rotate-180',
            )}
          />
        </div>
      </button>

      {/* Popover */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.6)]"
            style={{ minWidth: '260px' }}
          >
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-zinc-800 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-zinc-600" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search…"
                className="flex-1 bg-transparent text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="rounded text-zinc-600 hover:text-zinc-300"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Options */}
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredOptions.length === 0 ? (
                allowCustom && query.trim() ? (
                  <button
                    type="button"
                    onClick={() => commit(query.trim())}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-amber-300 hover:bg-amber-500/5"
                  >
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                      custom
                    </span>
                    Use "{query.trim()}"
                  </button>
                ) : (
                  <div className="px-3 py-6 text-center text-[11px] text-zinc-600">
                    {emptyLabel}
                  </div>
                )
              ) : (
                (() => {
                  let runningIndex = 0;
                  return grouped.map((g, gi) => (
                    <div key={gi}>
                      {g.group && (
                        <div className="px-3 pb-1 pt-2 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                          {g.group}
                        </div>
                      )}
                      {g.items.map((opt) => {
                        const idx = runningIndex++;
                        const highlighted = idx === highlightIndex;
                        const isSelected = opt.value === value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onMouseEnter={() => setHighlightIndex(idx)}
                            onClick={() => commit(opt.value)}
                            className={cn(
                              'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] transition',
                              highlighted
                                ? 'bg-brand-500/10 text-brand-200'
                                : 'text-zinc-300',
                            )}
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-mono">
                                {opt.label}
                              </span>
                              {opt.hint && (
                                <span className="shrink-0 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">
                                  {opt.hint}
                                </span>
                              )}
                            </span>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-brand-400" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ));
                })()
              )}
            </div>

            {footer && (
              <div className="border-t border-zinc-800 px-3 py-2 text-[10px] text-zinc-600">
                {footer}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
