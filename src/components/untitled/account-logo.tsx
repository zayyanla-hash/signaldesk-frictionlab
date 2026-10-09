/**
 * Adapted from Untitled UI React (MIT) — components/base/avatar/avatar.tsx
 * (square "company logo" tile variant) combined with simple-icons (CC0)
 * brand SVG paths for real, recognizable account marks.
 * https://github.com/untitleduico/react, https://github.com/simple-icons/simple-icons
 */
import * as simpleIcons from 'simple-icons';
import { cn } from '@/lib/utils';

type SimpleIcon = { path: string; hex: string };

/** Known research-dataset domains mapped to a simple-icons export. Domains
 * without a maintained mark (or any synthetic/.example domain) fall back to
 * initials — never a guessed or invented logo. */
const DOMAIN_ICON: Record<string, SimpleIcon> = {
  'stripe.com': simpleIcons.siStripe,
  'github.com': simpleIcons.siGithub,
  'hubspot.com': simpleIcons.siHubspot,
  'shopify.com': simpleIcons.siShopify,
  'notion.so': simpleIcons.siNotion,
  'linear.app': simpleIcons.siLinear,
  'intercom.com': simpleIcons.siIntercom,
  'zendesk.com': simpleIcons.siZendesk,
  'asana.com': simpleIcons.siAsana,
  'atlassian.com': simpleIcons.siAtlassian,
};

function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Deterministic, purely decorative tint so initials tiles aren't all one color. */
function tintIndex(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 5;
}

const TINTS = [
  'bg-utility-blue-50 text-utility-blue-700',
  'bg-utility-green-50 text-utility-green-700',
  'bg-utility-yellow-50 text-utility-yellow-800',
  'bg-utility-neutral-100 text-utility-neutral-700',
  'bg-utility-red-50 text-utility-red-700',
];

export function AccountLogo({ company, domain, size = 32 }: { company: string; domain: string; size?: number }) {
  const icon = DOMAIN_ICON[domain.toLowerCase()];
  if (icon) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-md bg-primary ring-1 ring-secondary"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill={`#${icon.hex}`} role="img">
          <path d={icon.path} />
        </svg>
      </span>
    );
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-md text-xs font-semibold', TINTS[tintIndex(company)])}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initialsOf(company)}
    </span>
  );
}
