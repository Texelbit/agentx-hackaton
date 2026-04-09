/**
 * Inline gradient mesh background for the report-web pages. Kept in JS
 * because Vite's CSS parser chokes on `radial-gradient` commas.
 */
const meshStyle: React.CSSProperties = {
  backgroundColor: '#0b0b10',
  backgroundImage: [
    'radial-gradient(circle at 20% 30%, rgba(99, 102, 241, 0.14), transparent 50%)',
    'radial-gradient(circle at 80% 70%, rgba(168, 85, 247, 0.12), transparent 50%)',
  ].join(', '),
};

export function GradientMesh() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10"
      style={meshStyle}
    />
  );
}
