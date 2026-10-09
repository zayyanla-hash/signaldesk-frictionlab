import { parseStrictTimestamp } from '../lib/datetime';
import { ACTIVATION_WINDOW_DAYS, EARLIEST_SIGNUP_ISO, SNAPSHOT_ISO, type LabEvent } from './types';

export type QuarantineUnit = 'events' | 'accounts';

export interface QuarantineEntry {
  reason: string;
  count: number;
  unit: QuarantineUnit;
}

export interface FunnelResult {
  eligible: number;
  incomplete: number;
  stepCounts: Record<'signed_up' | 'connected_data' | 'first_action', number>;
  rates: { signupToConnect: number; connectToAction: number; signupToAction: number };
  medianTTVHours: number | null;
  ttvDenominator: number;
  quarantined: QuarantineEntry[];
  accountSteps: { account_id: string; signedUp: string | null; connected: string | null; action: string | null; eligible: boolean }[];
}

const VALID = new Set(['signed_up', 'connected_data', 'first_action']);

export function computeFunnel(events: LabEvent[], snapshotISO = SNAPSHOT_ISO): FunnelResult {
  const snapshot = Date.parse(snapshotISO);
  const earliest = Date.parse(EARLIEST_SIGNUP_ISO);
  const counts = new Map<string, { count: number; unit: QuarantineUnit }>();
  const q = (reason: string, unit: QuarantineUnit, n = 1) => {
    const e = counts.get(reason) ?? { count: 0, unit };
    e.count += n;
    counts.set(reason, e);
  };

  // Phase 1: validate every raw event BEFORE it can reserve an ID, so an
  // invalid event never suppresses a later valid event with the same ID.
  const seenIds = new Set<string>();
  const byAccount = new Map<string, LabEvent[]>();

  for (const e of events) {
    if (!e.event_id || !e.account_id || !e.event_name || !e.occurred_at) {
      q('Missing field (event_id, account_id, event_name, or occurred_at)', 'events');
      continue;
    }
    if (!VALID.has(e.event_name)) {
      q(`Unknown event_name "${e.event_name}"`, 'events');
      continue;
    }
    const t = parseStrictTimestamp(e.occurred_at);
    if (!t.ok) {
      q(`Invalid timestamp: ${t.error}`, 'events');
      continue;
    }
    if (t.ms > snapshot) {
      q('Event after snapshot cutoff (future event ignored)', 'events');
      continue;
    }
    if (seenIds.has(e.event_id)) {
      q('Duplicate event_id (later copy ignored)', 'events');
      continue;
    }
    seenIds.add(e.event_id);
    if (!byAccount.has(e.account_id)) byAccount.set(e.account_id, []);
    byAccount.get(e.account_id)!.push({ ...e, occurred_at: t.iso });
  }

  const windowMs = ACTIVATION_WINDOW_DAYS * 24 * 3600 * 1000;
  const accountSteps: FunnelResult['accountSteps'] = [];
  const ttvHours: number[] = [];
  let eligible = 0;
  let incomplete = 0;
  let cConnect = 0;
  let cAction = 0;

  for (const [accountId, evts] of byAccount) {
    evts.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
    const early = evts.filter((e) => e.event_name === 'signed_up' && Date.parse(e.occurred_at) < earliest);
    if (early.length > 0) {
      q(`Signup before the earliest valid signup ${EARLIEST_SIGNUP_ISO.slice(0, 10)}`, 'events', early.length);
    }
    const signups = evts.filter((e) => e.event_name === 'signed_up' && Date.parse(e.occurred_at) >= earliest);
    if (signups.length === 0) {
      q('No valid signup for this account (unjoinable)', 'accounts');
      continue;
    }
    const signedUp = signups[0].occurred_at;
    const t0 = Date.parse(signedUp);
    if (t0 + windowMs > snapshot) {
      incomplete++;
      accountSteps.push({ account_id: accountId, signedUp, connected: null, action: null, eligible: false });
      continue;
    }
    eligible++;

    // Sequential steps only: downstream must follow its prerequisite within the window.
    const inWindow = (ms: number) => ms > t0 && ms <= t0 + windowMs;
    const connects = evts.filter((e) => e.event_name === 'connected_data' && inWindow(Date.parse(e.occurred_at)));
    const strayConnects = evts.filter((e) => e.event_name === 'connected_data' && !inWindow(Date.parse(e.occurred_at)));
    if (strayConnects.length > 0) {
      q('connected_data out of order or outside the 7-day window', 'events', strayConnects.length);
    }
    const connected = connects.length > 0 ? connects[0].occurred_at : null;

    let action: string | null = null;
    const actions = evts.filter((e) => e.event_name === 'first_action');
    if (connected) {
      const tc = Date.parse(connected);
      const good = actions.filter((e) => {
        const ms = Date.parse(e.occurred_at);
        return ms > tc && ms <= t0 + windowMs;
      });
      const stray = actions.length - good.length;
      if (stray > 0) q('first_action out of order or outside the 7-day window', 'events', stray);
      if (good.length > 0) action = good[0].occurred_at;
    } else if (actions.length > 0) {
      q('first_action without a preceding connected_data', 'events', actions.length);
    }
    if (connected) cConnect++;
    if (action) {
      cAction++;
      ttvHours.push((Date.parse(action) - t0) / 3600000);
    }
    accountSteps.push({ account_id: accountId, signedUp, connected, action, eligible: true });
  }

  const stepCounts = { signed_up: eligible, connected_data: cConnect, first_action: cAction };
  const rates = {
    signupToConnect: eligible ? round1((cConnect / eligible) * 100) : 0,
    connectToAction: cConnect ? round1((cAction / cConnect) * 100) : 0,
    signupToAction: eligible ? round1((cAction / eligible) * 100) : 0,
  };
  ttvHours.sort((a, b) => a - b);
  const medianTTVHours = ttvHours.length === 0 ? null : median(ttvHours);

  return {
    eligible,
    incomplete,
    stepCounts,
    rates,
    medianTTVHours,
    ttvDenominator: ttvHours.length,
    quarantined: [...counts.entries()].map(([reason, e]) => ({ reason, count: e.count, unit: e.unit })),
    accountSteps,
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface FunnelStepView {
  key: 'signed_up' | 'connected_data' | 'first_action';
  stepNum: number;
  label: string;
  sub: string;
  entered: number;
  converted: number;
  dropped: number;
  /** Step-over-step drop percentage: the single canonical drop number shown
   * everywhere (Funnel chart, Decision rail, exports). Never derive a second
   * "percent of starting cohort" drop figure elsewhere. */
  dropPct: number;
  fromPrev: number;
  fromStart: number;
}

/** Canonical per-step funnel view. Every screen that shows drop numbers must
 * derive them from this, so the Funnel chart and the Decision rail always agree. */
export function funnelSteps(funnel: FunnelResult): FunnelStepView[] {
  return [
    {
      key: 'signed_up',
      stepNum: 1,
      label: 'Signed up',
      sub: 'Account created',
      entered: funnel.stepCounts.signed_up,
      converted: funnel.stepCounts.signed_up,
      dropped: 0,
      dropPct: 0,
      fromPrev: 100,
      fromStart: 100,
    },
    {
      key: 'connected_data',
      stepNum: 2,
      label: 'Connected data',
      sub: 'Data source connected',
      entered: funnel.stepCounts.signed_up,
      converted: funnel.stepCounts.connected_data,
      dropped: funnel.stepCounts.signed_up - funnel.stepCounts.connected_data,
      dropPct: round1(100 - funnel.rates.signupToConnect),
      fromPrev: funnel.rates.signupToConnect,
      fromStart: funnel.rates.signupToConnect,
    },
    {
      key: 'first_action',
      stepNum: 3,
      label: 'First useful action',
      sub: 'Query run or view created',
      entered: funnel.stepCounts.connected_data,
      converted: funnel.stepCounts.first_action,
      dropped: funnel.stepCounts.connected_data - funnel.stepCounts.first_action,
      dropPct: round1(100 - funnel.rates.connectToAction),
      fromPrev: funnel.rates.connectToAction,
      fromStart: funnel.rates.signupToAction,
    },
  ];
}

export interface DateRange {
  startISO: string;
  endISO: string;
}

/** Signup date range for the eligible cohort only (the window Funnel reports on). */
export function eligibleSignupRange(funnel: FunnelResult): DateRange | null {
  const ms = funnel.accountSteps.filter((a) => a.eligible && a.signedUp).map((a) => Date.parse(a.signedUp!));
  if (ms.length === 0) return null;
  return { startISO: new Date(Math.min(...ms)).toISOString(), endISO: new Date(Math.max(...ms)).toISOString() };
}

/** Human label for a date range, e.g. "Feb 5 – Apr 14, 2025". Recomputed from
 * whatever data is currently loaded, never a hardcoded string. */
export function formatDateRangeLabel(range: DateRange | null): string {
  if (!range) return 'No eligible cohort yet';
  const fmt = (iso: string) => {
    const d = new Date(iso);
    const month = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${month} ${d.getUTCDate()}`;
  };
  const endYear = new Date(range.endISO).getUTCFullYear();
  return `${fmt(range.startISO)} – ${fmt(range.endISO)}, ${endYear}`;
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return Math.round(sorted[mid] * 10) / 10;
  return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

/** Validate raw CSV rows for events import. Returns clean events + quarantine notes. */
export function validateEventsRows(
  rows: Record<string, string>[],
  rowStarts?: number[]
): { events: LabEvent[]; quarantined: { row: number; reason: string }[]; skippedEmpty: number } {
  const events: LabEvent[] = [];
  const quarantined: { row: number; reason: string }[] = [];
  let skippedEmpty = 0;
  rows.forEach((r, i) => {
    const row = rowStarts?.[i] ?? i + 2;
    const e: LabEvent = {
      event_id: (r['event_id'] ?? '').trim(),
      account_id: (r['account_id'] ?? '').trim(),
      event_name: (r['event_name'] ?? '').trim(),
      occurred_at: (r['occurred_at'] ?? '').trim(),
      origin: 'user-provided',
    };
    if (!e.event_id && !e.account_id && !e.event_name && !e.occurred_at) {
      skippedEmpty++;
      return;
    }
    if (!e.event_id || !e.account_id || !e.event_name || !e.occurred_at) {
      quarantined.push({ row, reason: 'Missing required field (event_id, account_id, event_name, occurred_at).' });
      return;
    }
    const t = parseStrictTimestamp(e.occurred_at);
    if (!t.ok) {
      quarantined.push({ row, reason: `Bad timestamp: ${t.error}` });
      return;
    }
    events.push({ ...e, occurred_at: t.iso });
  });
  return { events, quarantined, skippedEmpty };
}
