// Generic (non-archetype) cards: vanilla monsters, staple spells and traps.
// All names, texts and effects are original to DuelForge.
import type { CardDef } from '../types';
import { normalMonster, spell, trap, tgt, cond } from './helpers';
import { fieldMonsters, freeMonsterZones } from '../core';
import { fusionCandidates } from '../ops';
import { getAtk } from '../stats';

export const GENERIC_CARDS: CardDef[] = [
  // ----------------------------------------------------------------- monsters
  normalMonster('GEN-001', ['Granite Sentinel', 'Granitwächter'], 'EARTH', 'Rock', 4, 1300, 2000, [
    'A watchful statue carved from mountain stone. It has guarded the same pass for a thousand years.',
    'Eine wachsame Statue aus Bergstein. Seit tausend Jahren bewacht sie denselben Pass.',
  ]),
  normalMonster('GEN-002', ['Dusk Prowler', 'Dämmerungspirscher'], 'DARK', 'Beast', 4, 1800, 1000, [
    'It hunts only in the moment between day and night, when shadows are longest.',
    'Er jagt nur im Moment zwischen Tag und Nacht, wenn die Schatten am längsten sind.',
  ]),
  normalMonster('GEN-003', ['Brass Automaton', 'Messing-Automat'], 'EARTH', 'Machine', 4, 1600, 1500, [
    'Wound with a golden key, it marches until its spring runs dry.',
    'Mit einem goldenen Schlüssel aufgezogen, marschiert er, bis seine Feder erschlafft.',
  ]),
  normalMonster('GEN-004', ['Coral Serpent', 'Korallenschlange'], 'WATER', 'Sea Serpent', 4, 1750, 1200, [
    'Its scales shimmer like a reef at noon, hiding razor-sharp fins.',
    'Ihre Schuppen schimmern wie ein Riff zur Mittagszeit und verbergen messerscharfe Flossen.',
  ]),
  normalMonster('GEN-005', ['Skyward Falcon', 'Himmelsfalke'], 'WIND', 'Winged Beast', 4, 1500, 1300, [
    'It dives from the clouds faster than thunder can follow.',
    'Er stürzt aus den Wolken schneller herab, als der Donner folgen kann.',
  ]),
  normalMonster('GEN-006', ['Ember Imp', 'Glutkobold'], 'FIRE', 'Fiend', 3, 1200, 800, [
    'A mischievous spark that sets fire to anything left unattended.',
    'Ein frecher Funke, der alles in Brand setzt, was unbeaufsichtigt bleibt.',
  ]),
  normalMonster('GEN-007', ['Dawnblade Knight', 'Morgenklingen-Ritterin'], 'LIGHT', 'Warrior', 4, 1900, 1200, [
    'A knight sworn to the first light of morning. Her blade has never known rust.',
    'Eine Ritterin, dem ersten Morgenlicht verschworen. Ihre Klinge kennt keinen Rost.',
  ]),
  normalMonster(
    'GEN-008',
    ['Ancient Wyrm', 'Uralter Lindwurm'],
    'FIRE',
    'Dragon',
    7,
    2700,
    2000,
    ['It slept beneath the volcano for an age. Now it is very, very awake.', 'Ein Zeitalter lang schlief er unter dem Vulkan. Nun ist er sehr, sehr wach.'],
    { rarity: 'rare' },
  ),
  normalMonster(
    'GEN-009',
    ['Moonlit Sorceress', 'Mondlicht-Zauberin'],
    'DARK',
    'Spellcaster',
    6,
    2300,
    1700,
    ['She draws her power from the pale moon and weaves it into silver curses.', 'Sie schöpft ihre Kraft aus dem bleichen Mond und webt sie zu silbernen Flüchen.'],
    { rarity: 'rare' },
  ),
  normalMonster(
    'GEN-010',
    ['Titan of the Peaks', 'Titan der Gipfel'],
    'EARTH',
    'Rock',
    8,
    2900,
    2600,
    ['When it stands, mountains are mistaken for its shoulders.', 'Wenn er sich erhebt, hält man Berge für seine Schultern.'],
    { rarity: 'super' },
  ),

  // ------------------------------------------------------------------- spells
  spell(
    'GEN-S01',
    ['Arcane Fusion', 'Arkane Fusion'],
    'normal',
    [
      'Fusion Summon 1 Fusion Monster from your Extra Deck, using monsters from your hand or field as Fusion Material.',
      'Führe eine Fusionsbeschwörung von 1 Fusionsmonster aus deinem Extra Deck durch, indem du Monster aus deiner Hand oder von deiner Spielfeldseite als Fusionsmaterial verwendest.',
    ],
    [
      {
        kind: 'activate',
        condition: (g, ctx) => fusionCandidates(g, ctx.player, ['hand', 'mzone']).length > 0,
        ops: [{ op: 'fusionSummon', from: ['hand', 'mzone'] }],
        ai: 'summon',
      },
    ],
    { rarity: 'super' },
  ),
  spell('GEN-S02', ['Fortune\'s Draft', 'Glückszug'], 'normal', ['Draw 2 cards.', 'Ziehe 2 Karten.'], [
    { kind: 'activate', condition: cond.deckAtLeast(2), ops: [{ op: 'draw', who: 'self', n: 2 }], ai: 'draw' },
  ], { rarity: 'ultra', limit: 1 }),
  spell(
    'GEN-S03',
    ['Shatterbolt', 'Splitterblitz'],
    'normal',
    ['Target 1 monster your opponent controls; destroy it.', 'Wähle 1 Monster, das dein Gegner kontrolliert, als Ziel; zerstöre es.'],
    [{ kind: 'activate', target: tgt.oppMonster(), ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }],
    { rarity: 'super', limit: 1 },
  ),
  spell(
    'GEN-S04',
    ['Cyclone Shard', 'Zyklonsplitter'],
    'quickplay',
    ['Target 1 Spell/Trap on the field; destroy it.', 'Wähle 1 Zauber/Falle auf dem Spielfeld als Ziel; zerstöre sie.'],
    [{ kind: 'activate', target: tgt.anyST(), ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }],
    { rarity: 'rare' },
  ),
  spell(
    'GEN-S05',
    ['Second Dawn', 'Zweite Morgenröte'],
    'normal',
    [
      'Target 1 monster in either GY; Special Summon it to your field.',
      'Wähle 1 Monster in einem beliebigen Friedhof als Ziel; beschwöre es als Spezialbeschwörung auf deine Spielfeldseite.',
    ],
    [
      {
        kind: 'activate',
        condition: cond.freeZone,
        target: tgt.anyGY({ kind: 'monster' }),
        ops: [{ op: 'specialSummon', from: 'targets', position: 'choose' }],
        ai: 'summon',
      },
    ],
    { rarity: 'ultra', limit: 1 },
  ),
  spell(
    'GEN-S06',
    ['Rally Banner', 'Sammelbanner'],
    'equip',
    ['Equip only to a monster. It gains 600 ATK.', 'Nur an ein Monster ausrüsten. Es erhält 600 ATK.'],
    [
      { kind: 'activate', target: tgt.anyFaceUpMonster(), ops: [{ op: 'equip' }], ai: 'buff' },
      { kind: 'continuous', aura: { target: { controller: 'any', equipped: true }, atk: 600 } },
    ],
  ),
  spell('GEN-S07', ['Healing Spring', 'Heilquelle'], 'normal', ['Gain 2000 LP.', 'Erhalte 2000 LP.'], [
    { kind: 'activate', ops: [{ op: 'gainLp', who: 'self', n: 2000 }], ai: 'heal' },
  ]),
  spell(
    'GEN-S08',
    ['Cataclysm', 'Kataklysmus'],
    'normal',
    ['Destroy all monsters on the field.', 'Zerstöre alle Monster auf dem Spielfeld.'],
    [
      {
        kind: 'activate',
        condition: (g) => fieldMonsters(g, 0).length + fieldMonsters(g, 1).length > 0,
        ops: [{ op: 'destroy', sel: { query: { zones: ['mzone'], controller: 'any' } } }],
        ai: 'removal',
      },
    ],
    { rarity: 'secret', limit: 1 },
  ),
  spell('GEN-S09', ['Burning Comet', 'Brennender Komet'], 'normal', ['Inflict 800 damage to your opponent.', 'Füge deinem Gegner 800 Schaden zu.'], [
    { kind: 'activate', ops: [{ op: 'damage', who: 'opp', n: 800 }], ai: 'burn' },
  ]),
  spell(
    'GEN-S10',
    ['Scouting Report', 'Spähbericht'],
    'normal',
    ['Add 1 Level 4 or lower monster from your Deck to your hand.', 'Füge deiner Hand 1 Monster der Stufe 4 oder niedriger aus deinem Deck hinzu.'],
    [
      {
        kind: 'activate',
        condition: cond.inDeck({ kind: 'monster', levelMax: 4 }),
        ops: [{ op: 'search', from: 'deck', filter: { kind: 'monster', levelMax: 4 }, n: 1 }],
        ai: 'search',
      },
    ],
    { rarity: 'rare', limit: 1 },
  ),
  spell(
    'GEN-S11',
    ['Mystic Shield', 'Mystischer Schild'],
    'quickplay',
    [
      'Target 1 face-up monster you control; it cannot be destroyed by battle or card effects this turn.',
      'Wähle 1 offenes Monster, das du kontrollierst, als Ziel; es kann in diesem Spielzug weder durch Kampf noch durch Karteneffekte zerstört werden.',
    ],
    [
      {
        kind: 'activate',
        target: tgt.ownFaceUpMonster(),
        ops: [
          { op: 'grant', sel: 'targets', ability: 'indestructibleBattle', untilEndOfTurn: true },
          { op: 'grant', sel: 'targets', ability: 'indestructibleEffect', untilEndOfTurn: true },
        ],
        ai: 'protect',
      },
    ],
  ),
  spell(
    'GEN-S12',
    ['Battle Fury', 'Kampfrausch'],
    'quickplay',
    [
      'Target 1 face-up monster you control; it gains 800 ATK until the end of this turn.',
      'Wähle 1 offenes Monster, das du kontrollierst, als Ziel; es erhält bis zum Ende dieses Spielzugs 800 ATK.',
    ],
    [{ kind: 'activate', target: tgt.ownFaceUpMonster(), ops: [{ op: 'modify', sel: 'targets', atk: 800, untilEndOfTurn: true }], ai: 'buff' }],
  ),
  spell(
    'GEN-S13',
    ['Card Exchange', 'Kartentausch'],
    'normal',
    ['Discard 1 card; draw 2 cards.', 'Wirf 1 Karte ab; ziehe 2 Karten.'],
    [{ kind: 'activate', condition: cond.deckAtLeast(2), cost: { discard: { count: 1 } }, ops: [{ op: 'draw', who: 'self', n: 2 }], ai: 'draw' }],
    { rarity: 'rare' },
  ),

  // -------------------------------------------------------------------- traps
  trap(
    'GEN-T01',
    ['Ward of Stillness', 'Bann der Stille'],
    'normal',
    [
      "When an opponent's monster declares an attack: Negate the attack, then end the Battle Phase.",
      'Wenn ein Monster deines Gegners einen Angriff deklariert: Annulliere den Angriff und beende danach die Battle Phase.',
    ],
    [{ kind: 'activate', window: ['attackDeclared'], condition: cond.oppAttack, ops: [{ op: 'negateAttack', endBattle: true }], ai: 'negate' }],
    { rarity: 'rare' },
  ),
  trap(
    'GEN-T02',
    ['Pitfall Snare', 'Fallgrubenschlinge'],
    'normal',
    [
      'When your opponent Normal or Flip Summons a monster with 1000 or more ATK: Destroy that monster.',
      'Wenn dein Gegner ein Monster mit 1000 oder mehr ATK als Normal- oder Flippbeschwörung beschwört: Zerstöre dieses Monster.',
    ],
    [
      {
        kind: 'activate',
        window: ['summoned'],
        condition: cond.oppSummoned({ atkMin: 1000 }, ['normal', 'tribute', 'flip']),
        ops: [{ op: 'destroy', sel: 'eventCards' }],
        ai: 'removal',
      },
    ],
  ),
  trap(
    'GEN-T03',
    ['Shattering Retort', 'Zersplitternde Erwiderung'],
    'normal',
    [
      "When an opponent's monster declares an attack: Destroy all Attack Position monsters your opponent controls.",
      'Wenn ein Monster deines Gegners einen Angriff deklariert: Zerstöre alle Monster in Angriffsposition, die dein Gegner kontrolliert.',
    ],
    [
      {
        kind: 'activate',
        window: ['attackDeclared'],
        condition: cond.oppAttack,
        ops: [{ op: 'destroy', sel: { query: { zones: ['mzone'], controller: 'opp', filter: { faceUp: true, position: 'atk' } } } }],
        ai: 'removal',
      },
    ],
    { rarity: 'secret', limit: 1 },
  ),
  trap(
    'GEN-T04',
    ['Severing Chains', 'Durchtrennte Ketten'],
    'normal',
    ['Target 1 Spell/Trap your opponent controls; destroy it.', 'Wähle 1 Zauber/Falle, die dein Gegner kontrolliert, als Ziel; zerstöre sie.'],
    [{ kind: 'activate', target: tgt.oppST(), ops: [{ op: 'destroy', sel: 'targets' }], ai: 'removal' }],
  ),
  trap(
    'GEN-T05',
    ['Phantom Return', 'Phantom-Rückkehr'],
    'normal',
    [
      'Target 1 monster in your GY; Special Summon it in Defense Position.',
      'Wähle 1 Monster in deinem Friedhof als Ziel; beschwöre es als Spezialbeschwörung in Verteidigungsposition.',
    ],
    [
      {
        kind: 'activate',
        condition: (g, ctx) => freeMonsterZones(g, ctx.player) > 0,
        target: tgt.ownGY({ kind: 'monster' }),
        ops: [{ op: 'specialSummon', from: 'targets', position: 'def' }],
        ai: 'summon',
      },
    ],
  ),
  trap(
    'GEN-T06',
    ['Seal of Silence', 'Siegel des Schweigens'],
    'counter',
    [
      'When your opponent activates a Spell or Trap Card: Pay 1500 LP; negate the activation, and if you do, destroy that card.',
      'Wenn dein Gegner eine Zauber- oder Fallenkarte aktiviert: Zahle 1500 LP; annulliere die Aktivierung und falls du dies tust, zerstöre die Karte.',
    ],
    [{ kind: 'activate', window: ['chain'], condition: cond.oppActivated(['spell', 'trap']), cost: { lp: 1500 }, ops: [{ op: 'negateActivation', destroy: true }], ai: 'negate' }],
    { rarity: 'ultra' },
  ),
  trap(
    'GEN-T07',
    ['Draining Shield', 'Zehrender Schild'],
    'normal',
    [
      "When an opponent's monster declares an attack: Negate the attack, and gain LP equal to the attacking monster's ATK.",
      'Wenn ein Monster deines Gegners einen Angriff deklariert: Annulliere den Angriff und erhalte LP in Höhe der ATK des angreifenden Monsters.',
    ],
    [
      {
        kind: 'activate',
        window: ['attackDeclared'],
        condition: cond.oppAttack,
        ops: [
          { op: 'gainLp', who: 'self', n: (g, ctx) => (ctx.eventCards[0] && g.cards[ctx.eventCards[0]].zone === 'mzone' ? getAtk(g, ctx.eventCards[0]) : 0) },
          { op: 'negateAttack' },
        ],
        ai: 'negate',
      },
    ],
  ),
];
