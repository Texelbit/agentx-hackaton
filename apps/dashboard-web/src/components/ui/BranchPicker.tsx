import { useMemo } from 'react';
import { cn } from './cn';
import { Combobox, ComboboxOption } from './Combobox';

/**
 * Base branch picker for GitOps rules. Wraps the generic `Combobox` with
 * branch-specific behavior:
 *
 *   - An explicit "any branch" sentinel option at the top
 *   - Every real branch from the configured GitHub repo (grouped)
 *   - Free-form custom branch name via `allowCustom` (the combobox shows a
 *     "Use '<query>'" affordance when the search finds no matches)
 *
 * The trigger color reflects the current state:
 *   neutral — no branch set (any)
 *   emerald — matches a real repo branch
 *   amber   — custom / unknown branch name (maybe stale)
 */
export function BranchPicker({
  value,
  branches,
  onChange,
  disabled,
  className,
}: {
  value: string;
  branches: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const ANY_SENTINEL = '__any__';

  const options = useMemo<ComboboxOption[]>(() => {
    const opts: ComboboxOption[] = [
      {
        value: ANY_SENTINEL,
        label: '— any branch —',
        hint: 'no filter',
      },
    ];
    for (const b of branches) {
      opts.push({
        value: b,
        label: b,
        group: 'Repository branches',
        hint:
          b === 'main' || b === 'master'
            ? 'default'
            : undefined,
      });
    }
    return opts;
  }, [branches]);

  // Map "" from parent → ANY_SENTINEL internally so the combobox highlights
  // the "any branch" row when the rule has no baseBranch filter.
  const internalValue = value === '' ? ANY_SENTINEL : value;

  // Determine tone based on whether the value matches a known branch
  const isAny = value === '';
  const isKnown = branches.includes(value);
  const tone: 'neutral' | 'emerald' | 'amber' = isAny
    ? 'neutral'
    : isKnown
      ? 'emerald'
      : 'amber';

  return (
    <Combobox
      value={internalValue}
      options={options}
      onChange={(next) => {
        // Translate sentinel back to empty string for the parent
        onChange(next === ANY_SENTINEL ? '' : next);
      }}
      placeholder="— any branch —"
      allowCustom
      tone={tone}
      emptyLabel="No matching branches"
      disabled={disabled}
      className={cn('min-w-[220px]', className)}
      footer={
        branches.length === 0
          ? 'GitHub returned no branches — check your token.'
          : 'Type to search · Enter to pick · or use a custom name'
      }
    />
  );
}
