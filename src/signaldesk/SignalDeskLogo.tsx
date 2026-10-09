/**
 * SignalDesk mark: a 28px rounded-square tile with three vertical "signal
 * bars" of increasing height, the tallest picked out in evidence green.
 * Purely decorative — the visible wordmark text beside it is the
 * accessible name, so the mark itself is aria-hidden.
 */
export function SignalDeskLogo() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width={28} height={28} rx={7} fill="#1E1E2A" />
      <rect x={8} y={16} width={3.2} height={6} rx={1.4} fill="#FFFFFF" />
      <rect x={13.4} y={12} width={3.2} height={10} rx={1.4} fill="#FFFFFF" />
      <rect x={18.8} y={7} width={3.2} height={15} rx={1.4} fill="#2FA36B" />
    </svg>
  );
}
