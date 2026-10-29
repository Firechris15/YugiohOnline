import { describe, expect, it } from 'vitest';
import { cdbToCards, parseLflist, parseSetnames, type CdbRow } from './cdb';

const row = (r: Partial<CdbRow> & { id: number; name: string }): CdbRow => ({ ot: 3, alias: 0, setcode: 0, type: 0x11, atk: 0, def: 0, level: 4, race: 1, attribute: 0x20, desc: '', ...r });

describe('EDOPro card database conversion', () => {
  it('maps types, stats, archetypes, banlists and alternate artworks', () => {
    const setnames = parseSetnames('!setname 0x10a2 Dark Magician\n!setname 0xa2 Magician Girl');
    const tcg = parseLflist('#[2026.10 TCG]\n!2026.10 TCG\n55144522 0 --Pot of Greed\n!2025 TCG\n1 1');
    expect(tcg.name).toBe('2026.10 TCG');
    expect(tcg.limits.size).toBe(1);
    const cards = cdbToCards(
      [
        row({ id: 46986414, name: 'Dark Magician', atk: 2500, def: 2100, level: 7, race: 0x2, setcode: '4258', desc: 'The ultimate wizard.' }),
        row({ id: 46986415, name: 'Dark Magician', alias: 46986414 }),
        row({ id: 55144522, name: 'Pot of Greed', type: 0x2, desc: 'Draw 2 cards.' }),
        row({ id: 1861629, name: 'Decode Talker', type: 0x4000021, atk: 2300, def: 0x2a, level: 3, race: 0x1000000 }),
        row({ id: 16178681, name: 'Odd-Eyes Pendulum Dragon', type: 0x1000021, level: 0x04040007, race: 0x2000, attribute: 0x20 }),
        row({ id: 1, name: 'Anime card', ot: 4 }),
      ],
      { setnames, banlists: { tcg }, german: new Map([[55144522, { name: 'Topf der Gier', desc: 'Ziehe 2 Karten.' }]]) },
    );
    expect(cards.map((c) => c.n)).toEqual(['Dark Magician', 'Pot of Greed', 'Decode Talker', 'Odd-Eyes Pendulum Dragon']);
    const [dm, pot, decode, odd] = cards;
    expect(dm).toMatchObject({ f: 'normal', r: 'Spellcaster', at: 'DARK', a: 2500, df: 2100, l: 7, ar: 'Dark Magician', im: [46986415] });
    expect(pot).toMatchObject({ f: 'spell', r: 'Normal', nd: 'Topf der Gier', dd: 'Ziehe 2 Karten.', b: { tcg: 'Banned' } });
    expect(decode).toMatchObject({ f: 'link', lv: 3, r: 'Cyberse', lm: ['Left', 'Right', 'Bottom'] });
    expect(odd).toMatchObject({ f: 'effect_pendulum', sc: 4, l: 7 });
  });
});
