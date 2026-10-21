# Adventure mode — game-core engine API (0.10.0)

For the API's adventure rooms (and the frontend's deck editor). Everything below is exported from
`@gonzaloaguila/game-core` (pack: `D:/Proyectos/pokemon-tcg-packs/gonzaloaguila-game-core-0.10.0.tgz`).
Spec: `docs/superpowers/specs/2026-10-21-adventure-mode-design.md`. Perspective: the state is always
the human's view ("player" = human = room seat `player1`, "opponent" = the AI seat `player2`).

## Content types

```ts
type CardEntry = { cardId: string; qty: number };          // catalog ids: "base-set-046-charmander"
type SidePair = { player: number; opponent: number };
type TableSide = "player" | "opponent";

type AdventurePassive = "lucky_coin" | "start_attached_energy" | "opening_hand_plus_1" | "prize_minus_one" | "extra_heart";
const ADVENTURE_PASSIVES: readonly AdventurePassive[];

type BattleModifier =
  | { type: "prizeCount"; player?: number; opponent?: number }
  | { type: "openingHand"; player?: number; opponent?: number }
  | { type: "noPrizeFor"; side: TableSide; names: string[] }
  | { type: "bonusCards"; side: TableSide; cards: CardEntry[]; to: "hand" }
  | { type: "opponentSetup"; active: string[]; bench: string[][] }   // card ids, each chain Basic first
  | { type: "opponentPassives"; passives: AdventurePassive[] };
type BattleModifierType = BattleModifier["type"];
const ADVENTURE_MODIFIER_TYPES: readonly BattleModifierType[];
```

## Deck rules (shared by API and frontend)

```ts
type DeckRules = { minSize: number; maxSize: number; maxCopies: number | null };   // null = no copy limit (adventure)
function validateDeckEntries(entries: readonly CardEntry[], rules: DeckRules): string | null;   // Spanish reason or null
function deckFromCardEntries(entries: readonly CardEntry[], idPrefix?: string): GameCard[];   // throws IllegalActionError "Carta desconocida: <id>"
function isAdventureCardAllowed(card: Card): boolean;   // in the catalog, set released, Trainer implemented
```

- `validateDeckEntries`: unknown id → `"Carta desconocida: <id>"`; qty < 1 or not an integer → error; size out of range; copies counted by card **name** across sets, basic Energy unlimited, DCE limited (only when `maxCopies` is a number).
- `deckFromCardEntries` ids are opaque (`<idPrefix>-<n>`, n a random permutation drawn with `Math.random`): deterministic inside `withRandom`, never name the card.

## Creating a battle

```ts
type AdventureGameConfig = {
  playerDeck: CardEntry[];          // the run's deck
  opponentDeck: CardEntry[];        // the battle's rival deck (battle 10 hard: by the run's starter)
  prizeCount: number;               // adventure rules.prizeCount (before modifiers / passives)
  openingHand: number;              // adventure rules.openingHand
  playerPassives: AdventurePassive[];   // the run's passives (extra_heart accepted, ignored)
  modifiers: BattleModifier[];      // the battle's modifiers
};
function createAdventureGame(config: AdventureGameConfig): GameState;   // MULLIGAN phase
```

- Call it **inside** `withRandom(room.rng.next, () => …)` (shuffles and card ids use `Math.random`).
- Order: decks (`p1-n` / `p2-n` ids) → `opponentSetup` (preset rival board, out of its deck before the deal) → deal with `prizeCount`/`openingHand`, then the `prizeCount`/`openingHand` modifiers, then the passives (`prize_minus_one`: that side −1 Prize, min 1; `opening_hand_plus_1`: +1 card; the rival's from `opponentPassives`).
- Sets on the state: `passives`, `tableRules` (`noPrizeFor`), `setupRules` (`bonusCards`), `openingHandSize` (when not 7/7). All public; `swapSides` swaps them.
- Throws `IllegalActionError` for an unknown card id or an `opponentSetup` whose cards aren't in the rival deck / don't evolve by name.
- Helpers it uses (exported if needed): `setupOptionsForPassives`, `applyBattleModifiersToOptions`, `tableRulesFromModifiers`, `setupRulesFromModifiers`, `opponentPassivesFromModifiers`, `placeOpponentSetup(state, { active, bench })`.

New `GameState` fields (all optional):

```ts
openingHandSize?: SidePair;   // mulligans redraw this many
passives?: { player?: AdventurePassive[]; opponent?: AdventurePassive[]; luckyCoinUsed?: { player?: boolean; opponent?: boolean } };
tableRules?: { noPrizeFor?: { player?: string[]; opponent?: string[] } };
setupRules?: { bonusCards?: { player?: CardEntry[]; opponent?: CardEntry[] } };   // consumed at the both-ready transition
```

### The opening

- MP rooms stay in `MULLIGAN` until both are ready (no `SETUP`); the driver handles that: it mulligans the AI while its hand has no Basic (and it has no preset Active), then places its Basics (`decideOpponentSetup`; with a preset board only Bench additions) and calls `setPlayerReady(state, false)`.
- When both are ready the **room** flips the starting coin and calls `startPlayingPhase(state, coin)` as today. `startPlayingPhase` now applies `applySetupRules` first: `start_attached_energy` (each side that has it) and the `bonusCards` into the hands; then the first draw. Nothing else to call.
- `startGame(state, { prizeCount: number | SidePair, openingHand: number | SidePair })` also accepts per-side values now (defaults unchanged: 6 Prizes, 7 cards).

## Seeded randomness

```ts
type Rng = () => number;
type SeededRng = { next: Rng; state(): number };
function createSeededRng(seed: number, state?: number): SeededRng;   // mulberry32; createSeededRng(seed, saved.state()) continues the sequence (seed ignored then)
function hashSeed(text: string): number;                               // FNV-1a 32-bit: hashSeed(`${run.seed}:${battleIndex}:${attempt}`)
function withRandom<T>(rng: Rng, fn: () => T): T;                      // swaps Math.random synchronously, restores it (also on throw)
```

- Persist `rng.state()` (a uint32) with the snapshot; rebuild with `createSeededRng(seed, savedState)`.
- **Determinism:** with the same seed and the same human actions the game is identical, card ids, Pokémon ids and every log message included. Only `events[].id`, `events[].timestamp` and PlusPower/Defender modifier ids differ between runs (they embed `Date.now()`): compare states without them.

## Lucky coin

```ts
function takeLuckyCoin(state: GameState, side: TableSide): { state: GameState; coin: "heads" } | null;
```

- The room's coin source calls it for the **first coin of a human-initiated action** (attack incl. Confusion, Trainer / power `requestCoinFlip`, retreat): `takeLuckyCoin(state, "player")` → use `"heads"` and keep the returned state (passive marked used, a log line "Moneda de la suerte: la moneda sale cara"); `null` → flip normally. Never for the opening coin, the Sleep checkup or the AI's coins.

## AI executor coin source

```ts
type AICoinPurpose = "attack" | "confusion" | "trainer" | "power" | "retreat" | "stadium" | "playBasic";
type AICoinRecord = { purpose: AICoinPurpose; label: string; results: CoinFlipResult[]; flippedBy: ("self" | "opponent")[] };   // flippedBy relative to the AI
type AIExecutionOptions = { flip?: () => CoinFlipResult; onCoins?: (record: AICoinRecord) => void };

function executeAIAction(state: GameState, action: AIAction, options?: AIExecutionOptions): GameState;
function finishAIAttackAfterReaction(state: GameState, eventsBefore?: number, options?: AIExecutionOptions): GameState;
function answerOpponentTrainerStep(state: GameState, selection: string[], options?: AIExecutionOptions): GameState;
function answerChaosGymOfferForAI(state: GameState, options?: AIExecutionOptions): GameState;
function attackCoinFlippers(plan: AttackCoinPlan, results: CoinFlipResult[]): ("self" | "opponent")[];   // relative to the attacker
```

Every coin the executor flips comes from `flip` (default `Math.random`), reported once per batch (`label`: attack / Trainer / power / Stadium name, `"Confusión"`, `"Retirada"`). `flippedBy[i] === "opponent"` means the human flips that coin (Knock Down's coins, a Defending Haunter's Transparency...): caption it "Tu moneda" for the human.

## Headless AI driver

```ts
type AIPlanState = {   // plain JSON — persist it in the snapshot (aiPlan)
  turnNumber: number; queue: AIAction[]; plans: number; eventsAtPlan: number | null;
  finishedMarker?: number; mulligans?: number; endTurnTriedAt?: number;
};
type AIStep =
  | { kind: "mulligan"; delay: number }
  | { kind: "setup"; delay: number }
  | { kind: "takePrize"; delay: number }
  | { kind: "promote"; benchIndex: number; delay: number }
  | { kind: "answerAttackChoice"; delay: number }
  | { kind: "finishAttack"; eventsBefore: number; delay: number }
  | { kind: "trimBench"; delay: number }
  | { kind: "answerChaosOffer"; delay: number }
  | { kind: "duelPick"; delay: number }
  | { kind: "powerChoice"; delay: number }
  | { kind: "action"; action: AIAction; delay: number }
  | { kind: "endTurn"; forced: boolean; delay: number };
type AIStepKind = AIStep["kind"];
type AIStepOptions = AIExecutionOptions;

function nextAIStep(state: GameState, plan: AIPlanState | null, options?: DecideOpponentTurnOptions): { step: AIStep; plan: AIPlanState | null } | null;
function applyAIStep(state: GameState, step: AIStep, options?: AIStepOptions): GameState;
function aiStepActionType(step: AIStep): string;   // action steps: action.type ("attack", "playTrainer"...); else step.kind
const MAX_AI_PLANS_PER_TURN = 20;
const MAX_AI_MULLIGANS = 500;
```

Room loop (after every applied human action, and at the start):

```ts
let next = nextAIStep(state, aiPlan);
while (next) {
  await sleep(next.step.delay);                       // never await inside withRandom
  state = withRandom(rng.next, () => applyAIStep(state, next.step, { flip: roomCoin, onCoins }));
  aiPlan = next.plan;
  // broadcast gameState (+ showCoinFlip from onCoins), snapshot { state, rngState: rng.state(), aiPlan }
  if (bothReadyInMulligan(state)) state = withRandom(rng.next, () => startPlayingPhase(state, roomCoin()));
  next = withRandom(rng.next, () => nextAIStep(state, aiPlan));   // nextAIStep plans with the AI (may use Math.random)
}
```

- `nextAIStep` is pure and returns **null** when the human must act (their turn with nothing the AI owes, their promotion or Prize, a step they answer, Misty's Duel pick, both ready and the starting coin to flip) or the game is over. Asking twice without applying gives the same step.
- Order: opening (mulligan → setup + ready) → the AI's Prize (`takePrize(state, 0, false, endTurn = AI's turn)`) → its promotion (`decideOpponentPromotion`) → on the human's turn only what it owes (Bench trim, Chaos Gym offer, a choice of the human's attack with `chooser: "opponent"` — Ninja Trick's coins flipped through `flip`, reported with `flippedBy` from the AI's side —, duel pick) → on its turn: finishing an attack the human answered, its own pending power choice, then the planned actions (a plan that ends without `attack`/`endTurn` is followed by a new one; a plan that changed nothing or the 20th plan ends the turn; a refused forced `endTurn` is not repeated: null).
- The driver takes the AI's Prizes and promotes it: the room must **not** do either for player2.
- `options` defaults to `{ otherPlayerAnswersByHuman: true, otherPlayerDuels: true }` (the human answers the AI's Erika / Treaty / Quiz steps and duels — none in Adventure 1's cards).

### Human answers during the AI's turn

- **A choice of the AI's attack** (`state.pendingAttackChoice` on the AI's turn; the human answers, `chooser: "opponent"`; show it with `stepForAnswerer`): resolve on the **AI's view** with `skipEndTurn` and swap back:
  ```ts
  const aiView = swapSides(state);
  const coinPlan = getAttackChoiceCoinPlan(aiView, selection);          // ESP-style answers that need coins
  const coinResults = coinPlan ? flipAttackCoins(coinPlan, roomCoin) : undefined;
  state = swapSides(resolveAttackChoice(aiView, selection, { skipEndTurn: true, ...(coinResults && { coinResults }) }));
  ```
  Then run the driver loop: its next step is `finishAttack` (finishAIAttackAfterReaction: the AI's own choices, its promotion, the log reworded, the turn ended unless a Prize / promotion is pending). Do **not** call `finishAIAttackAfterReaction` yourself.
- **A step of the AI's Trainer** (`state.pendingOpponentTrainerStep`): `answerOpponentTrainerStep(state, selection, { flip, onCoins })`, then the driver loop.
- The human's own promotion / Prize: the existing room actions, then the driver loop.

### Events

Lines written by AI steps are already in the human's view ("player" = human: "Rival jugó …", "Tomaste un premio"): neutralize them like player1's view (`aiEventsSpeakFor: "human"`).

## Table rules in play (nothing to call)

- `noPrizeFor`: every Prize site checks `givesPrizeWhenKnockedOut(pokemon, state, owner)`; a denied Prize logs `"<Pokémon> no da premio en esta mesa"`. A side left without Pokémon still loses.
- `bonusCards`: new instances (`bonus-player-n`) in the hand at `startPlayingPhase`; they never touch the run deck.
- `opponentSetup` Pokémon start with `playedOnTurn: 0` (they can evolve on the rival's first turn).

## Simulator

`npm run simulate -- --adventure <path to the adventure JSON> --games N --seed S` (game-core repo): every starter × every battle (battle 10 normal and hard per starter) with the battle's modifiers; prints win rate, average turns and deck-out rate per pairing.
