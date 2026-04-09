/**
 * Inline gradient backgrounds — kept in JS rather than CSS because Vite's
 * css plugin (sucrase parser) chokes on `radial-gradient` / `linear-gradient`
 * commas inside `.css` files. Inline `style` props bypass that parser
 * entirely while producing identical CSS at runtime.
 */

const meshStyle: React.CSSProperties = {
  backgroundColor: '#0b0b10',
  backgroundImage: [
    'radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.12), transparent 50%)',
    'radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.10), transparent 50%)',
  ].join(', '),
};

/**
 * Fixed full-screen mesh background. Drop it once at the root of any page
 * to add the subtle indigo/violet glow under the content.
 */
export function GradientMesh() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={meshStyle}
    />
  );
}

/** Same gradient as a style object you can spread on any element. */
export const meshBackground = meshStyle;
