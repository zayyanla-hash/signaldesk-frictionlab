import type { FeedbackRecord, LabEvent } from './types';
import { SNAPSHOT_ISO } from './types';

/** Deterministic PRNG (mulberry32). Same seed always yields same data. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface GeneratedData {
  events: LabEvent[];
  feedback: FeedbackRecord[];
}

/** Main synthetic scenario: ~170 accounts, fixed snapshot, deterministic seed. */
export function generateMainSample(seed = 42): GeneratedData {
  const rand = mulberry32(seed);
  const events: LabEvent[] = [];
  const feedback: FeedbackRecord[] = [];
  const start = Date.parse('2025-02-05T00:00:00Z');
  const end = Date.parse('2025-04-14T00:00:00Z');
  const N = 170;
  const feedbackTexts = [
    'Could not figure out which data source to use. The options are overwhelming.',
    'Got an error during setup and was not sure what to do next.',
    'Expected to see a dashboard right away. Was not clear what the next step was.',
    'Connected but no data arrived for hours. Gave up for the day.',
    'The setup guide conflicts with the actual screens.',
    'Invite step was confusing; did we need a teammate to continue?',
    'Actually the connection flow was smooth, just slow the first time.',
    'We need SSO before we can proceed further.',
  ];
  let eid = 1;
  let fid = 1;
  for (let i = 1; i <= N; i++) {
    const acct = `acct-${String(i).padStart(3, '0')}`;
    const t0 = start + Math.floor(rand() * (end - start));
    events.push({ event_id: `e${eid++}`, account_id: acct, event_name: 'signed_up', occurred_at: new Date(t0).toISOString(), origin: 'synthetic' });
    const r = rand();
    if (r < 0.68) {
      const t1 = t0 + Math.floor(rand() * 5 * 24 * 3600 * 1000) + 3600 * 1000;
      if (t1 <= Date.parse(SNAPSHOT_ISO)) {
        events.push({ event_id: `e${eid++}`, account_id: acct, event_name: 'connected_data', occurred_at: new Date(t1).toISOString(), origin: 'synthetic' });
        if (rand() < 0.5) {
          const t2 = t1 + Math.floor(rand() * 4 * 24 * 3600 * 1000) + 2 * 3600 * 1000;
          if (t2 <= Date.parse(SNAPSHOT_ISO)) {
            events.push({ event_id: `e${eid++}`, account_id: acct, event_name: 'first_action', occurred_at: new Date(t2).toISOString(), origin: 'synthetic' });
          }
        }
      }
    }
    if (rand() < 0.28) {
      const pick = feedbackTexts[Math.floor(rand() * feedbackTexts.length)];
      // One conflicting/positive record kept deliberately (index 6).
      feedback.push({
        origin: 'synthetic',
        feedback_id: `f${fid++}`,
        account_id: acct,
        text: pick,
        received_at: new Date(Math.min(t0 + 3 * 24 * 3600 * 1000, Date.parse(SNAPSHOT_ISO) - 1000)).toISOString(),
      });
    }
  }
  // Deterministic edge records: duplicates, out-of-order, future, malformed handled in fixtures/tests.
  return { events, feedback };
}

/** Small hand-checkable fixture used by tests and documented in UI. */
export function handFixture(): { events: LabEvent[]; snapshot: string } {
  return {
    snapshot: '2025-03-10T00:00:00Z',
    events: [
      // A: full activation within window (signup Mar 1, connect Mar 2, action Mar 3)
      { event_id: 'h1', account_id: 'A', event_name: 'signed_up', occurred_at: '2025-03-01T10:00:00Z', origin: 'synthetic' },
      { event_id: 'h2', account_id: 'A', event_name: 'connected_data', occurred_at: '2025-03-02T10:00:00Z', origin: 'synthetic' },
      { event_id: 'h3', account_id: 'A', event_name: 'first_action', occurred_at: '2025-03-03T10:00:00Z', origin: 'synthetic' },
      // B: signup only, eligible, drops after step 1
      { event_id: 'h4', account_id: 'B', event_name: 'signed_up', occurred_at: '2025-03-01T11:00:00Z', origin: 'synthetic' },
      // C: signup too recent (Mar 8, window ends Mar 15 > snapshot Mar 10) -> incomplete
      { event_id: 'h5', account_id: 'C', event_name: 'signed_up', occurred_at: '2025-03-08T10:00:00Z', origin: 'synthetic' },
      // D: action before connect (out of order) -> action ignored
      { event_id: 'h6', account_id: 'D', event_name: 'signed_up', occurred_at: '2025-03-01T09:00:00Z', origin: 'synthetic' },
      { event_id: 'h7', account_id: 'D', event_name: 'first_action', occurred_at: '2025-03-01T10:00:00Z', origin: 'synthetic' },
      // E: duplicate event_id (h8 twice) -> second ignored
      { event_id: 'h8', account_id: 'E', event_name: 'signed_up', occurred_at: '2025-03-01T09:00:00Z', origin: 'synthetic' },
      { event_id: 'h8', account_id: 'E', event_name: 'connected_data', occurred_at: '2025-03-02T09:00:00Z', origin: 'synthetic' },
      // F: no signup, only connect -> unjoinable
      { event_id: 'h9', account_id: 'F', event_name: 'connected_data', occurred_at: '2025-03-02T09:00:00Z', origin: 'synthetic' },
      // G: future event after snapshot -> ignored
      { event_id: 'h10', account_id: 'G', event_name: 'signed_up', occurred_at: '2025-03-01T09:00:00Z', origin: 'synthetic' },
      { event_id: 'h11', account_id: 'G', event_name: 'connected_data', occurred_at: '2025-03-20T09:00:00Z', origin: 'synthetic' },
    ],
  };
}

export const SAMPLE_FEEDBACK: FeedbackRecord[] = [
  { feedback_id: 'f-001', account_id: 'acct-003', text: 'Could not figure out which data source to use. The options are overwhelming.', origin: 'synthetic', received_at: '2025-03-04T14:00:00Z' },
  { feedback_id: 'f-002', account_id: 'acct-007', text: 'Got an error during setup and was not sure what to do next.', origin: 'synthetic', received_at: '2025-03-06T09:30:00Z' },
  { feedback_id: 'f-003', account_id: 'acct-012', text: 'Actually the connection flow was smooth, just slow the first time.', origin: 'synthetic', received_at: '2025-03-07T16:00:00Z' },
  { feedback_id: 'f-004', account_id: 'acct-021', text: 'Expected to see a dashboard right away. Was not clear what the next step was.', origin: 'synthetic', received_at: '2025-03-09T11:00:00Z' },
  { feedback_id: 'f-005', account_id: 'acct-003', text: 'Second note from same account: invite step was confusing.', origin: 'synthetic', received_at: '2025-03-10T10:00:00Z' },
  { feedback_id: 'f-006', account_id: 'acct-030', text: 'We need SSO before we can proceed further.', origin: 'synthetic', received_at: '2025-03-11T15:00:00Z' },
];
