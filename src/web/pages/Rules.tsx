import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useT } from '../i18n';
import { Card } from '../components/Card';
import '../styles/profile.css';

interface Section {
  title: { de: string; en: string };
  body: { de: string[]; en: string[] };
  cards?: string[];
  phases?: boolean;
}

const SECTIONS: Section[] = [
  {
    title: { de: 'Zwei Spielmodi', en: 'Two game modes' },
    body: {
      de: [
        '**Automatisches Duell:** Die Website führt alle Regeln, Ketten und Effekte selbst aus – ideal gegen Bots. Dafür brauchst du Karten mit automatischen Regeln (Format „Automatisch“, rund 850 klassische Karten wie Topf der Gier, Spiegelkraft oder Dunkler Magier).',
        '**Freies Duell:** Wie am echten Tisch (oder auf Dueling Book): Alle 14.000+ Karten sind spielbar. Ihr bewegt Karten per Drag & Drop oder Menü, ändert Lebenspunkte selbst und führt Effekte selbst aus. Dafür gibt es Münze, Würfel, Spielmarken, Zählmarken, Chat und das Duell-Protokoll. Gespielt wird mit TCG-, OCG- oder ohne Banlist.',
      ],
      en: [
        '**Automatic duel:** the site resolves every rule, chain and effect for you – perfect against bots. It needs cards with automated rules (the “Automatic” format, around 850 classic cards such as Pot of Greed, Mirror Force or Dark Magician).',
        '**Free duel:** just like at a real table (or on Dueling Book): all 14,000+ cards are playable. You move cards by drag & drop or menu, change Life Points and resolve effects yourselves – with a coin, a die, tokens, counters, chat and the duel log. Play with the TCG or OCG banlist or without one.',
      ],
    },
  },
  {
    title: { de: 'Ziel des Duells', en: 'Goal of the duel' },
    body: {
      de: [
        'Beide Spieler starten mit **8000 Lebenspunkten (LP)** und ziehen **5 Karten**. Du gewinnst, wenn die LP deines Gegners auf 0 fallen, wenn er eine Karte ziehen müsste, aber sein Deck leer ist, oder wenn er aufgibt.',
        'Ein Deck besteht aus **40–60 Karten** im Hauptdeck und bis zu **15 Fusionsmonstern** im Extra Deck. Von jeder Karte darfst du höchstens 3 Kopien spielen (manche Karten sind limitiert).',
      ],
      en: [
        'Both players start with **8000 Life Points (LP)** and draw **5 cards**. You win when your opponent’s LP reach 0, when they would have to draw from an empty deck, or when they surrender.',
        'A deck has **40–60 cards** in the Main Deck and up to **15 Fusion Monsters** in the Extra Deck. You may play at most 3 copies of a card (some cards are limited).',
      ],
    },
  },
  {
    title: { de: 'Der Spielzug', en: 'The turn' },
    phases: true,
    body: {
      de: [
        'Jeder Zug besteht aus sechs Phasen: In der **Draw Phase** ziehst du 1 Karte (der Startspieler nicht in seinem ersten Zug). In den **Main Phasen** beschwörst du Monster, aktivierst Zauber und setzt Karten. In der **Battle Phase** greifen deine Monster an. In der **End Phase** endet dein Zug – hast du mehr als 6 Karten auf der Hand, wirfst du ab.',
        'Der Startspieler darf in seinem ersten Zug **nicht angreifen**.',
      ],
      en: [
        'Every turn has six phases: in the **Draw Phase** you draw 1 card (the starting player skips this on their first turn). In the **Main Phases** you summon monsters, activate spells and set cards. In the **Battle Phase** your monsters attack. In the **End Phase** your turn ends – if you hold more than 6 cards, you discard down to 6.',
        'The player who goes first **cannot attack** on their first turn.',
      ],
    },
  },
  {
    title: { de: 'Monster beschwören', en: 'Summoning monsters' },
    cards: ['GEN-007', 'GEN-009', 'GEN-010'],
    body: {
      de: [
        'Einmal pro Zug darfst du ein Monster **als Normalbeschwörung** (offen in Angriffsposition) beschwören **oder verdeckt setzen** (Verteidigungsposition).',
        'Monster der **Stufe 5–6** brauchen **1 Tribut**, Monster der **Stufe 7+** brauchen **2 Tribute** – dafür legst du eigene Monster vom Feld auf den Friedhof.',
        'Manche Karten erlauben zusätzliche **Spezialbeschwörungen** (z. B. aus der Hand, dem Friedhof oder per Fusion). Diese verbrauchen deine Normalbeschwörung nicht.',
        'Ein verdeckt gesetztes Monster kannst du ab deinem nächsten Zug per **Flippbeschwörung** aufdecken – dabei werden FLIPP-Effekte aktiv.',
      ],
      en: [
        'Once per turn you may **Normal Summon** a monster (face-up in Attack Position) **or Set** it face-down (Defense Position).',
        '**Level 5–6** monsters require **1 tribute**, **Level 7+** monsters require **2 tributes** – you send your own monsters from the field to the Graveyard.',
        'Some cards allow extra **Special Summons** (e.g. from the hand, the Graveyard or via Fusion). They do not use up your Normal Summon.',
        'A Set monster can be **Flip Summoned** from your next turn on – this activates FLIP effects.',
      ],
    },
  },
  {
    title: { de: 'Zauber & Fallen', en: 'Spells & traps' },
    cards: ['GEN-S03', 'GEN-S04', 'EMB-008', 'GEN-T01', 'GEN-T06'],
    body: {
      de: [
        '**Zauber** aktivierst du in deiner Main Phase aus der Hand. **Schnellzauber** dürfen auch als Reaktion verwendet werden. **Permanente**, **Ausrüstungs-** und **Spielfeldzauber** bleiben auf dem Feld und wirken dauerhaft.',
        '**Fallen** musst du zuerst verdeckt setzen; aktivieren darfst du sie frühestens im nächsten Zug – auch während des gegnerischen Zugs, etwa wenn ein Angriff deklariert wird. **Konterfallen** sind am schnellsten und können nur von anderen Konterfallen beantwortet werden.',
      ],
      en: [
        'You activate **Spells** from your hand during your Main Phase. **Quick-Play Spells** may also be used as a response. **Continuous**, **Equip** and **Field Spells** stay on the field and keep working.',
        '**Traps** must be Set first and can be activated from your next turn on – even during your opponent’s turn, for example when an attack is declared. **Counter Traps** are the fastest and can only be answered by other Counter Traps.',
      ],
    },
  },
  {
    title: { de: 'Kampf', en: 'Battle' },
    body: {
      de: [
        'Jedes offene Monster in Angriffsposition darf einmal pro Battle Phase angreifen. Hat der Gegner keine Monster, ist ein **direkter Angriff** möglich.',
        '**Angriff gegen Angriff:** Das Monster mit weniger ATK wird zerstört, sein Besitzer erleidet die Differenz als Schaden. Bei Gleichstand werden beide zerstört.',
        '**Angriff gegen Verteidigung:** Ist die ATK höher als die DEF, wird der Verteidiger zerstört (ohne Schaden, außer bei Durchschlagsschaden). Ist die DEF höher, erleidet der Angreifer die Differenz.',
      ],
      en: [
        'Every face-up Attack Position monster may attack once per Battle Phase. If your opponent has no monsters, you can make a **direct attack**.',
        '**Attack vs. attack:** the monster with lower ATK is destroyed and its controller takes the difference as damage. On a tie, both are destroyed.',
        '**Attack vs. defense:** if ATK is higher than DEF, the defender is destroyed (no damage unless the attacker inflicts piercing damage). If DEF is higher, the attacker’s controller takes the difference.',
      ],
    },
  },
  {
    title: { de: 'Ketten', en: 'Chains' },
    body: {
      de: [
        'Wird eine Karte aktiviert, darf der Gegner mit einer schnellen Karte **antworten**. So entsteht eine **Kette**, die rückwärts abgehandelt wird: die zuletzt aktivierte Karte zuerst.',
        'Wenn du reagieren kannst, zeigt DuelForge dir das an und hebt passende Karten hervor. Mit „Nicht reagieren“ lässt du die Kette abhandeln.',
      ],
      en: [
        'When a card is activated, the opponent may **respond** with a fast card. This builds a **chain** which resolves backwards: the last activated card first.',
        'Whenever you can respond, DuelForge tells you and highlights the cards you can use. “Don’t respond” lets the chain resolve.',
      ],
    },
  },
  {
    title: { de: 'Fusionen', en: 'Fusions' },
    cards: ['GEN-S01', 'EMB-F01', 'AST-F01'],
    body: {
      de: [
        'Fusionsmonster liegen im Extra Deck. Mit Karten wie **„Arkane Fusion“** legst du die angegebenen Materialien aus Hand oder Feld auf den Friedhof und beschwörst das Fusionsmonster.',
      ],
      en: ['Fusion Monsters wait in the Extra Deck. Cards like **“Arcane Fusion”** send the listed materials from your hand or field to the Graveyard to summon the Fusion Monster.'],
    },
  },
];

function rich(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <b key={i}>{part.slice(2, -2)}</b> : <span key={i}>{part}</span>));
}

export default function RulesPage() {
  const t = useT();
  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>{t('rules.title')}</h1>
          <p>{t('rules.lead')}</p>
        </div>
        <Link to="/play" className="btn btn-primary">
          {t('home.ctaPlay')}
        </Link>
      </div>
      <div className="rules">
        {SECTIONS.map((s, i) => (
          <motion.section key={i} className="panel rule-section" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-40px' }}>
            <span className="rule-num">{i + 1}</span>
            <div>
              <h2>{s.title[t.lang]}</h2>
              {s.phases && (
                <div className="phase-steps">
                  {['draw', 'standby', 'main1', 'battle', 'main2', 'end'].map((p) => (
                    <span key={p}>{t(`duel.phaseName.${p}`)}</span>
                  ))}
                </div>
              )}
              {s.body[t.lang].map((p, k) => (
                <p key={k}>{rich(p)}</p>
              ))}
              {s.cards && (
                <div className="rule-cards">
                  {s.cards.map((c) => (
                    <Card key={c} defId={c} size="sm" holo />
                  ))}
                </div>
              )}
            </div>
          </motion.section>
        ))}
      </div>
    </div>
  );
}
