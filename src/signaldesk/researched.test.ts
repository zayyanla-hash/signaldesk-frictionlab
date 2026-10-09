import { describe, expect, it } from 'vitest';
import { buildResearchedAccounts, getResearchPacket, isResearchPacket } from './researched';
import { isAccount } from './types';

/** Expected fit = round(100 * documented-capability-count / 6), from fitResearch.json. */
const EXPECTED_FIT: Record<string, number> = {
  'stripe.com': 100,
  'twilio.com': 83,
  'slack.com': 67,
  'github.com': 83,
  'hubspot.com': 50,
  'shopify.com': 83,
  'notion.so': 50,
  'linear.app': 50,
  'intercom.com': 50,
  'zendesk.com': 67,
  'asana.com': 67,
  'atlassian.com': 50,
};

describe('researched dataset', () => {
  it('validates the bundled packet and builds twelve cautious accounts', () => {
    expect(isResearchPacket(getResearchPacket())).toBe(true);
    const accounts = buildResearchedAccounts(getResearchPacket());
    expect(accounts).toHaveLength(12);
    accounts.forEach((a) => {
      expect(isAccount(a)).toBe(true);
      expect(a.reviewState).toBe('in-review');
      expect(a.employees).toBe('Unknown');
      expect(a.industry).toBe('Unknown');
      expect(a.headquarters).toBe('Unknown');
      expect(a.scores.intent).toBe(0);
      expect(a.scores.engagement).toBe(0);
      expect(a.scores.timing).toBe(0);
      expect(a.scoreOrigin).toBe('analyst-heuristic');
      expect(a.dataset).toBe('researched');
    });
  });

  it('sets fit to the share of 6 webhook capabilities documented in official docs', () => {
    const accounts = buildResearchedAccounts(getResearchPacket());
    accounts.forEach((a) => {
      expect(a.scores.fit).toBe(EXPECTED_FIT[a.domain]);
    });
    expect(accounts.find((a) => a.domain === 'stripe.com')!.scores.fit).toBe(100);
    expect(accounts.find((a) => a.domain === 'hubspot.com')!.scores.fit).toBe(50);
  });

  it('cites every documented-capability fact signal with an https source and a retrieval date', () => {
    const accounts = buildResearchedAccounts(getResearchPacket());
    accounts.forEach((a) => {
      const capFacts = a.signals.filter((s) => s.kind === 'fact' && s.id.includes('-cap-'));
      capFacts.forEach((s) => {
        expect(s.provenance.sourceUrl).toMatch(/^https:\/\//);
        expect(s.provenance.sourceUrl).toMatch(new RegExp(a.domain.split('.')[0]));
        expect(s.provenance.retrievalDate).toBe('2026-10-09');
      });
    });
  });

  it('keeps publication dates unknown and records collection separately', () => {
    const accounts = buildResearchedAccounts(getResearchPacket());
    accounts.forEach((a) => {
      const fact = a.signals.find((s) => s.kind === 'fact')!;
      expect(fact.provenance.publicationDate).toBeNull();
      expect(fact.provenance.retrievalDate).toBe('2026-10-07');
      expect(fact.provenance.sourceUrl).toMatch(/^https:\/\//);
    });
  });

  it('marks Shopify and Asana explicitly needs-review with packet rationale', () => {
    const accounts = buildResearchedAccounts(getResearchPacket());
    const shopify = accounts.find((a) => a.domain === 'shopify.com')!;
    const asana = accounts.find((a) => a.domain === 'asana.com')!;
    expect(shopify.evidenceQuality).toBe('needs-review');
    expect(asana.evidenceQuality).toBe('needs-review');
    expect(shopify.reviewNote).toMatch(/partner/i);
    expect(asana.reviewNote).toMatch(/polling/i);
  });

  it('rejects malformed packets without inventing anything', () => {
    expect(() => buildResearchedAccounts({} as never)).toThrow(/validation/);
    expect(() => buildResearchedAccounts({ records: [] } as never)).toThrow(/validation/);
  });
});
