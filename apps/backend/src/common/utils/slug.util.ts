/**
 * Pure helpers for turning free text into branch-name-friendly slugs.
 * Kept side-effect free so they can be unit-tested in isolation.
 */
export class SlugUtil {
  /**
   * Lowercase, hyphen-separated slug.
   *
   * Example: "Cart items not persisting" → "cart-items-not-persisting"
   */
  static toKebab(input: string): string {
    return input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

  /**
   * PascalCase slug, used by the default branch naming pattern.
   *
   * Example: "Fix checkout payment failure" → "FixCheckoutPaymentFailure"
   */
  static toPascal(input: string): string {
    return input
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
      .slice(0, 60);
  }
}
