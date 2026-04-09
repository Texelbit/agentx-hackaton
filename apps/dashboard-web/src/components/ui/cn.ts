import { clsx, type ClassValue } from 'clsx';

/** Small wrapper so consumers only import `cn` from one place. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
