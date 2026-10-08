/**
 * The goal marker — a colour dot with a ring around it, a bullseye.
 *
 * Plain lists show a bare dot; the ring is what tells a goal apart at a
 * glance, in the sidebar, the preview and the editor's list picker. The colour
 * is always an explicit `var(--color-*)` value resolved by the caller through
 * `paletteVar`, so the marker follows the same palette the dot does.
 */
export function GoalMarker({ color, size = 12 }: { color: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      className="shrink-0"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="3" fill={color} />
      <circle cx="6" cy="6" r="5" fill="none" stroke={color} strokeWidth="1" />
    </svg>
  );
}
