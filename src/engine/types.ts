// Core type definitions for the DuelForge rules engine.
// The engine is pure TypeScript and runs both in the browser (bot duels)
// and on the server (online duels). All GameState data is plain JSON so it
// can be cloned, serialized and sent over the wire.

export type PlayerId = 0 | 1;

export type Attribute = 'LIGHT' | 'DARK' | 'FIRE' | 'WATER' | 'EARTH' | 'WIND' | 'DIVINE';

// Monster types ("races"), e.g. 'Dragon', 'Spellcaster', 'Beast-Warrior'.
// Real cards bring many more (Dinosaur, Psychic, Cyberse, ...), so this is open.
export type Race = string;

export type CardKind = 'monster' | 'spell' | 'trap';
export type MonsterFrame = 'normal' | 'effect' | 'fusion' | 'ritual' | 'synchro' | 'xyz' | 'link' | 'token';
export type SpellType = 'normal' | 'quickplay' | 'continuous' | 'equip' | 'field' | 'ritual';
export type TrapType = 'normal' | 'continuous' | 'counter';
export type Rarity = 'common' | 'rare' | 'super' | 'ultra' | 'secret';

export type Zone = 'deck' | 'hand' | 'mzone' | 'szone' | 'fzone' | 'gy' | 'banished' | 'extra' | 'void';

export type Phase = 'draw' | 'standby' | 'main1' | 'battle' | 'main2' | 'end';

export type Position = 'atk' | 'def';

export type Ability =
  | 'piercing'
  | 'directAttack'
  | 'doubleAttack'
  | 'indestructibleBattle'
  | 'indestructibleEffect'
  | 'untargetable'
  | 'cannotAttack'
  | 'unattackable';

export interface LocalizedText {
  en: string;
  de: string;
}

// ---------------------------------------------------------------------------
// Card filters & selectors (data driven, used by effects and deck search)
// ---------------------------------------------------------------------------

export interface CardFilter {
  kind?: CardKind | CardKind[];
  frame?: MonsterFrame | MonsterFrame[];
  attribute?: Attribute | Attribute[];
  race?: Race | Race[];
  archetype?: string;
  name?: string | string[]; // card definition id(s)
  levelMin?: number;
  levelMax?: number;
  atkMin?: number;
  atkMax?: number;
  defMin?: number;
  defMax?: number;
  spellType?: SpellType | SpellType[];
  trapType?: TrapType | TrapType[];
  faceUp?: boolean;
  faceDown?: boolean;
  position?: Position;
  notSelf?: boolean;
  notToken?: boolean;
  exclude?: string; // card definition id to exclude
  custom?: (g: GameState, uid: string, ctx: EffectContext) => boolean;
}

export type Controller = 'self' | 'opp' | 'any';

export interface Query {
  zones: Zone[];
  controller: Controller;
  filter?: CardFilter;
}

export type Selector =
  | 'targets'
  | 'self'
  | 'equipTarget'
  | 'attacker'
  | 'battleTarget'
  | 'eventCards'
  | 'chosen'
  | { query: Query };

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

export type EffectKind =
  | 'activate' // Spell/Trap card activation
  | 'ignition' // Monster or continuous S/T effect, own main phase, open state
  | 'quick' // Spell speed 2 monster/continuous effect
  | 'trigger' // Activates in response to an event
  | 'continuous' // Always-on aura / ability while face-up
  | 'specialProc'; // "You can Special Summon this card from your hand ..."

export type TriggerEvent =
  | 'summoned' // this card was Summoned (any method)
  | 'normalSummoned'
  | 'tributeSummoned'
  | 'specialSummoned'
  | 'fusionSummoned'
  | 'flipped' // FLIP effects
  | 'destroyedByBattle'
  | 'destroyed' // by battle or effect
  | 'sentToGY' // from anywhere
  | 'sentToGYFromField'
  | 'sentToGYAsMaterial'
  | 'destroysByBattle' // this card destroyed a monster by battle
  | 'inflictsBattleDamage'
  | 'ownStandby' // controller's standby phase (card face-up on field)
  | 'ownEndPhase'
  | 'oppEndPhase'
  | 'oppSummon'; // opponent summons a monster (card face-up on field)

export interface Cost {
  lp?: number;
  discard?: { count: number; filter?: CardFilter };
  tribute?: { count: number; filter?: CardFilter };
  banishSelfFromGY?: boolean;
  sendSelfToGY?: boolean;
  banishFromGY?: { count: number; filter?: CardFilter };
}

export interface TargetSpec {
  min: number;
  max: number;
  zones: Zone[];
  controller: Controller;
  filter?: CardFilter;
}

export type Who = 'self' | 'opp' | 'both';

type NumOrFn = number | ((g: GameState, ctx: EffectContext) => number);

export type OpBody =
  | { op: 'draw'; who: Who; n: NumOrFn }
  | { op: 'damage'; who: Who; n: NumOrFn }
  | { op: 'gainLp'; who: Who; n: NumOrFn }
  | { op: 'destroy'; sel: Selector }
  | { op: 'banish'; sel: Selector }
  | { op: 'bounce'; sel: Selector }
  | { op: 'addToHand'; sel: Selector }
  | { op: 'toGY'; sel: Selector }
  | { op: 'search'; from: 'deck' | 'gy'; filter: CardFilter; n: number; optional?: boolean }
  | {
      op: 'specialSummon';
      from: 'hand' | 'gy' | 'deck' | 'banished' | 'targets' | 'self' | 'eventCards';
      filter?: CardFilter;
      n?: number;
      position?: Position | 'choose';
      optional?: boolean;
      anyGY?: boolean; // revive from either player's GY
    }
  | { op: 'token'; tokenId: string; n: number; position?: Position }
  | { op: 'modify'; sel: Selector; atk?: number; def?: number; untilEndOfTurn?: boolean }
  | { op: 'grant'; sel: Selector; ability: Ability; untilEndOfTurn?: boolean }
  | { op: 'negateAttack'; endBattle?: boolean }
  | { op: 'negateActivation'; destroy?: boolean }
  | { op: 'changePosition'; sel: Selector; to?: Position }
  | { op: 'discard'; who: Who; n: number; random?: boolean }
  | { op: 'mill'; who: Who; n: number }
  | { op: 'fusionSummon'; from: ('hand' | 'mzone' | 'gy')[]; filter?: CardFilter }
  | { op: 'equip' }
  | { op: 'takeControl'; sel: Selector; untilEndOfTurn?: boolean }
  | { op: 'toDeck'; sel: Selector; top?: boolean }
  | { op: 'ritualSummon'; filter?: CardFilter }
  | { op: 'custom'; run: (g: GameState, ctx: EffectContext) => void };

// Every op can be guarded by a condition evaluated at resolution time.
export type Op = OpBody & { when?: (g: GameState, ctx: EffectContext) => boolean };

export interface Aura {
  // Who is affected
  target: { controller: Controller; filter?: CardFilter; selfOnly?: boolean; equipped?: boolean };
  atk?: number | ((g: GameState, sourceUid: string, targetUid: string) => number);
  def?: number | ((g: GameState, sourceUid: string, targetUid: string) => number);
  abilities?: Ability[];
  // Optional condition on the source card / game
  when?: (g: GameState, sourceUid: string) => boolean;
}

export interface EffectDef {
  kind: EffectKind;
  event?: TriggerEvent;
  optional?: boolean;
  oncePerTurn?: boolean;
  speed?: 1 | 2 | 3;
  from?: Zone[]; // zones where an ignition/quick effect can be used from (default: mzone/szone face-up)
  condition?: (g: GameState, ctx: EffectContext) => boolean;
  cost?: Cost;
  target?: TargetSpec;
  ops?: Op[];
  aura?: Aura;
  // Activation timing windows (for traps / quick effects). If omitted any window is fine.
  window?: WindowType[];
  // Specific to specialProc: the card is summoned from the hand
  position?: Position | 'choose';
  // Hint for bots
  ai?: AiHint;
}

export type AiHint = 'removal' | 'draw' | 'burn' | 'heal' | 'buff' | 'summon' | 'protect' | 'negate' | 'search';

export interface FusionMaterial {
  name?: string; // card id
  filter?: CardFilter;
}

export interface CardDef {
  id: string;
  name: LocalizedText;
  kind: CardKind;
  frame?: MonsterFrame;
  attribute?: Attribute;
  race?: Race;
  level?: number;
  atk?: number;
  def?: number;
  spellType?: SpellType;
  trapType?: TrapType;
  archetype?: string;
  rarity: Rarity;
  text: LocalizedText;
  flavor?: LocalizedText;
  effects?: EffectDef[];
  materials?: FusionMaterial[];
  limit?: 0 | 1 | 2 | 3;
  token?: boolean;
  system?: boolean; // internal placeholder (used by bots), never shown
  // Real Yu-Gi-Oh! cards (data from the YGOPRODeck card database)
  real?: boolean;
  passcode?: number;
  typeLine?: LocalizedText; // e.g. "Spellcaster / Effect"
  pendulum?: boolean;
  scale?: number;
  linkVal?: number;
  linkMarkers?: string[];
  // Rules for automatic duels are implemented for this card
  auto?: boolean;
  // Copies allowed by the TCG / OCG / Goat-era lists (only present when restricted)
  bans?: { tcg?: number; ocg?: number; goat?: number };
  // A Normal Spell/Trap that stays on the field after resolving (e.g. lasting effects)
  remainsOnField?: boolean;
  // Holding all of these cards (English names) in hand wins the duel
  handWinSet?: string[];
  art?: { seed?: number; hue?: number; motif?: string };
}

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export interface Modifier {
  atk?: number;
  def?: number;
  ability?: Ability;
  untilTurn?: number; // expires at the end of this turn number
  source?: string;
}

export interface CardInstance {
  uid: string;
  defId: string;
  owner: PlayerId;
  controller: PlayerId;
  zone: Zone;
  slot: number; // slot index for mzone/szone
  faceUp: boolean;
  position: Position;
  turnPlaced: number;
  summonedTurn: number;
  attacks: number;
  positionChangedTurn: number;
  attackedTurn: number;
  modifiers: Modifier[];
  equippedTo?: string;
  controlReturnTurn?: number; // control returns to the owner at the end of this turn
  opt: Record<number, number>; // effect index -> turn last used
  revealedTo?: PlayerId[];
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  lp: number;
  deck: string[];
  hand: string[];
  gy: string[];
  banished: string[];
  extra: string[];
  mzone: (string | null)[];
  szone: (string | null)[];
  fzone: string | null;
  normalSummonUsed: boolean;
}

export interface ChainLink {
  id: number;
  player: PlayerId;
  source: string;
  effectIdx: number;
  targets: string[];
  eventCards: string[];
  negated: boolean;
  speed: number;
  isCardActivation: boolean; // a Spell/Trap card activation (vs. monster effect)
}

export type WindowType =
  | 'open'
  | 'chain'
  | 'attackDeclared'
  | 'summoned'
  | 'phaseBattle'
  | 'phaseEnd'
  | 'trigger';

export interface WindowCtx {
  type: WindowType;
  player?: PlayerId; // player who caused the event
  cards?: string[];
  attacker?: string;
  target?: string | null;
  method?: SummonMethod;
}

export type SummonMethod = 'normal' | 'tribute' | 'flip' | 'special' | 'fusion' | 'set';

export interface BattleState {
  attacker: string;
  target: string | null;
  negated: boolean;
  attackerPlayer: PlayerId;
}

export interface PendingTrigger {
  uid: string;
  effectIdx: number;
  player: PlayerId;
  eventCards: string[];
}

export type PromptKind = 'selectCards' | 'yesNo' | 'position' | 'option';

export interface Prompt {
  id: number;
  player: PlayerId;
  kind: PromptKind;
  title: LocalizedText;
  options?: string[]; // uids for selectCards
  labels?: LocalizedText[]; // for option prompts
  min?: number;
  max?: number;
  source?: string;
  uid?: string; // card for position prompt
  reveal?: boolean; // the cards in options are revealed to the chooser
}

export type Task =
  | { t: 'chainWindow' }
  | { t: 'resolveChain' }
  | { t: 'triggers'; windowFor?: PlayerId; stage?: 'confirm' | 'target' }
  | { t: 'response'; player: PlayerId; window: WindowCtx }
  | { t: 'damageStep' }
  | { t: 'startTurn' }
  | { t: 'enterPhase'; phase: Phase }
  | { t: 'endPhaseCleanup' }
  | { t: 'handLimit' };

export interface ResolvingState {
  linkId: number;
  opIndex: number;
  chosen: string[];
  validTargets: string[];
  // per op scratch (e.g. multi step prompts)
  step: number;
  scratch: Record<string, string | number | string[]>;
}

export type Pending =
  | { kind: 'action'; player: PlayerId }
  | { kind: 'response'; player: PlayerId; window: WindowCtx }
  | { kind: 'prompt'; player: PlayerId; prompt: Prompt }
  | { kind: 'none' };

export interface GameEvent {
  seq: number;
  type: string;
  player?: PlayerId;
  uid?: string;
  uids?: string[];
  target?: string | null;
  amount?: number;
  from?: Zone;
  to?: Zone;
  defId?: string;
  phase?: Phase;
  text?: string;
  hidden?: boolean;
}

export interface LogEntry {
  turn: number;
  player?: PlayerId;
  key: string;
  params?: Record<string, string | number>;
}

export interface GameState {
  version: number;
  rng: number;
  turn: number;
  turnPlayer: PlayerId;
  firstPlayer: PlayerId;
  phase: Phase;
  players: [PlayerState, PlayerState];
  cards: Record<string, CardInstance>;
  chain: ChainLink[];
  chainCounter: number;
  stack: Task[];
  resolving: ResolvingState | null;
  pending: Pending;
  pendingTriggers: PendingTrigger[];
  triggerWindowFor?: PlayerId;
  battle: BattleState | null;
  window: WindowCtx | null;
  prompt: Prompt | null;
  promptCounter: number;
  tokenCounter: number;
  winner: PlayerId | 'draw' | null;
  winReason: string | null;
  events: GameEvent[];
  eventSeq: number;
  log: LogEntry[];
  // Answer for the prompt raised by the task currently on top of the stack
  taskAnswer?: string[] | boolean | number | Position;
  endBattle?: boolean;
  rules: { startLp: number; handSize: number };
}

// ---------------------------------------------------------------------------
// Actions & options
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'normalSummon'; uid: string; tributes?: string[] }
  | { type: 'setMonster'; uid: string; tributes?: string[] }
  | { type: 'flipSummon'; uid: string }
  | { type: 'changePosition'; uid: string }
  | { type: 'specialProc'; uid: string; effectIdx: number; costs?: string[] }
  | { type: 'setSpellTrap'; uid: string }
  | { type: 'activate'; uid: string; effectIdx: number; targets?: string[]; costs?: string[] }
  | { type: 'attack'; uid: string; target: string | null }
  | { type: 'phase'; to: 'battle' | 'main2' | 'end' }
  | { type: 'pass' }
  | { type: 'answer'; choice: string[] | boolean | number | Position }
  | { type: 'surrender' };

export type Requirement =
  | { kind: 'tributes'; count: number; options: string[] }
  | { kind: 'targets'; min: number; max: number; options: string[] }
  | { kind: 'costs'; count: number; options: string[]; what: 'discard' | 'tribute' | 'banish' };

export interface ActionOption {
  action: Action;
  label: string; // i18n key
  uid?: string;
  requirements: Requirement[];
}

export interface EffectContext {
  player: PlayerId; // controller of the effect
  source: string; // uid of the source card
  effectIdx: number;
  targets: string[];
  eventCards: string[];
  chosen: string[];
  link?: ChainLink;
}

export interface DeckList {
  main: string[];
  extra: string[];
}
