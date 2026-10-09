/**
 * FrictionLab mark: a 28px rounded-square tile with a funnel built from
 * three stacked horizontal bars of decreasing width, the narrowest picked
 * out in amber. Purely decorative — the visible wordmark text beside it is
 * the accessible name, so the mark itself is aria-hidden.
 */
export function FrictionLabLogo() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={28} height={28} rx={7} fill="#5B6CF0" />
      <rect x={6} y={9} width={16} height={3} rx={1.5} fill="#FFFFFF" />
      <rect x={8.5} y={13.5} width={11} height={3} rx={1.5} fill="#FFFFFF" />
      <rect x={11} y={18} width={6} height={3} rx={1.5} fill="#F2A93B" />
    </svg>
  );
}
