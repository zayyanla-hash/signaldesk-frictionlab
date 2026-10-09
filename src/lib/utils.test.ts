import { describe, expect, it } from 'vitest';
import { csvSafe, toCSV } from './utils';

describe('export guards', () => {
  it('neutralizes formula injection in csv exports', () => {
    expect(csvSafe('=CMD(1)')).toBe("'=CMD(1)");
    expect(csvSafe('+123')).toBe("'+123");
    expect(csvSafe('-2+3')).toBe("'-2+3");
    expect(csvSafe('@evil')).toBe("'@evil");
    expect(csvSafe('Acme')).toBe('Acme');
  });

  it('quotes fields containing commas', () => {
    const csv = toCSV([['a', 'b,c']]);
    expect(csv).toBe('a,"b,c"');
  });
});
