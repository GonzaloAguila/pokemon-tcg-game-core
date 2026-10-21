# Modo Aventura Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Adventure 1 "De Pueblo Paleta al Bosque Verde": a single-player dungeon run (3 starters, 10 battles vs the AI, 3 hearts, treasures, 2 difficulties, unique rewards, achievements) whose battles are **server-authoritative** (owner decision, option A).

**Architecture:** game-core adds the engine config (per-side Prizes and opening hands, deck rules, decks from card ids), the 5 passives and the battle modifiers ("reglas de jefe": per-side Prizes, no-Prize Pokémon, battle-only bonus cards, preset rival board) as hooks, a seeded RNG + coin source for the AI executor, and a headless AI driver. The API owns the content (JSON + zod), the run state (Prisma), the run endpoints and **adventure rooms**: Socket.io game rooms where seat `player2` is the game-core AI driven by the server. The frontend adds the adventure screens and plays battles on the multiplayer page with an adventure context.

**Tech Stack:** TypeScript, vitest (all three repos), Prisma/Express/Socket.io/zod (API), Next.js 16 + React 19 + Motion (frontend).

**Spec:** `docs/superpowers/specs/2026-10-21-adventure-mode-design.md` (this repo; owner questions with defaults in its §11). Owner source: `docs/adventure/source-spec-v1.txt` + `source-spec-v1-code.txt`. Read them and each repo's `CLAUDE.md` before starting.

## Global Constraints

- Branch `feat/adventure-mode` in every repo. game-core: worktree `D:/Proyectos/pokemon-tcg-game-core-wt-adventure` (from master b7b6e79 = 0.9.0). API: new worktree `D:/Proyectos/pokemon-tcg-api-wt-adventure` from `origin/master`. Frontend: new worktree `D:/Proyectos/pokemon-tcg-wt-adventure` from `origin/main`. Never work in `D:/Proyectos/pokemon-tcg`, `D:/Proyectos/pokemon-tcg-api` or the other worktrees.
- No publish, no deploy, no merge to main/master, no prod DB, no machine-wide config (`~/.npmrc`, env). Consumers use a packed engine: `npm pack` in game-core → copy the `.tgz` to `D:/Proyectos/pokemon-tcg-packs/` → `npm install --no-save <tgz>` in the consumer.
- **Task 0 first:** the owner's answers to the spec's §11 questions; unanswered ones keep their **bold** default. The plan below is written with the defaults.
- Never mutate input state; new engine actions validate and throw `IllegalActionError` with a Spanish reason. Coins are always passed in by the caller; the server flips every adventure coin.
- **Inside `withRandom(room.rng, …)` nothing awaits** (the global `Math.random` swap is only safe synchronously).
- Card ids are catalog ids (`base-set-046-charmander`); every card list goes through `findCardById`.
- Event log lines perspective-free (game-core CLAUDE.md "Event perspective"; `test/event-perspective.test.ts`).
- UI: Spanish (tú, neutral), Nunito only, no coloured border strips, no card sleeves in grids, PokeAPI sprites (never emoji), every new modal takes `isOpen`/`onClose`, warnings in toasts.
- Tests first; each task's tests + `npx tsc --noEmit` green before its commit; game-core tasks also `npm run simulate -- --games 300 --seed 1` with 0 failures.
- Commit after each task, message as given, ending with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_016Hq4baHN3LX1hzbhpHdkeP`.

## Review Focus

1. The client can never decide a battle: no endpoint or socket event accepts a result, coins or a seed from the client; `applyBattleResult` runs once per battle, only from the room's end detection (Tasks 11–12 tests).
2. Determinism: a battle replays identically from `(seed, battleIndex, attempt)` + the logged human actions (Task 1 + Task 12 test); `run.seed` never leaves the server.
3. No `await` inside `withRandom` in the adventure room; the AI loop yields between steps (Task 12 review).
4. Phase guards: deck edit, battle start, treasure choice and abandon only in their phase (409), one active run per user (partial unique index + `lockUsers`), the unique reward once per difficulty (`claimOnce`) (Tasks 10–11).
5. Masking: the rival's hand/deck/Prizes stay hidden in adventure rooms exactly as in MP; the AI plans on `knowledgeView` only (Task 12).
6. Passives and modifiers: `swapSides` swaps `passives`/`openingHandSize`/`tableRules`/`setupRules`; every Prize site goes through the state-aware `givesPrizeWhenKnockedOut` (no ungated `CanTakePrize: true` left); bonus cards never reach the run deck; `start_attached_energy` happens once, at the both-ready transition; lucky coin only on the first coin of the human's own action (Tasks 2–3b, 4b, 12).

---

## Stage 1 — game-core (`D:/Proyectos/pokemon-tcg-game-core-wt-adventure`)

Tasks 1 and 2 can run in parallel (different files: executor/rng vs gameState setup). 3 needs 2; 3b needs 3; 4 needs 3b; 4b needs 4; 5 needs 1 (parallel with 2–4b); 6 needs 4b–5; 7 last.

### Task 0: Owner answers (controller, no subagent)

- [ ] **Step 1:** Read the owner's answers to spec §11; record each changed default in `.superpowers/sdd/2026-10-21-adventure-mode/progress.md` (gitignored ledger, Gym Challenge format).
- [ ] **Step 2:** Patch the affected task briefs (Q1 changes Task 3, Q2 Task 12, Q4 Task 12, Q5 Task 13, Q7 Tasks 11/13, Q14–15 Task 8's battle 7). Already ruled by the owner on 2026-10-21: no copy limit in adventure mode (`rules.maxCopies = null`, Q3 withdrawn) and battle modifiers in v1 (spec §3.5–3.6).

### Task 1: Seeded RNG with state and a coin source for the AI executor

**Files:**
- Modify: `src/domain/simulation/rng.ts` (`createSeededRng`, `hashSeed`), `src/domain/ai/executor.ts` (every `Math.random() < 0.5` coin → `options.flip`; `onCoins` reports), `src/domain/ai/pending.ts` (`resolveOwnAttackPendings` already takes `flip` — thread it), `src/index.ts` (exports)
- Test: `test/adventure-rng.test.ts`, `test/ai-executor-coins.test.ts`

**Interfaces:**
- `createSeededRng(seed: number, state?: number): { next: Rng; state(): number }` — mulberry32 whose internal 32-bit state can be read and restored; `hashSeed(text: string): number` (FNV-1a or similar, documented).
- `executeAIAction(state, action, options?: { flip?: () => CoinFlipResult; onCoins?: (record: AICoinRecord) => void })`, `AICoinRecord = { purpose: "attack" | "confusion" | "trainer" | "power" | "retreat" | "stadium"; label: string; results: CoinFlipResult[]; flippedBy: ("self" | "opponent")[] }` (flippers from `getTrainerCoinFlippers` / `getPowerCoinFlippers` / the attack plan's `attackFlipper` and defender coin). Same for `finishAIAttackAfterReaction`, `answerOpponentTrainerStep`.

- [ ] **Step 1:** Failing tests: `createSeededRng(7)` restored from `state()` continues the same sequence; `hashSeed("a:1") !== hashSeed("a:2")` and is stable (literal value asserted); an AI attack with a coin attack (Doduo's Fury Attack via `makeState`/`armedFor`) uses the provided `flip` (scripted `["heads","heads"]` → 20) and `onCoins` receives `{ purpose: "attack", results: ["heads","heads"] }`; a Confusion flip and a coin Trainer the AI plays (Poké Ball) likewise; without `flip` behaviour is unchanged (existing AI tests green).
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement; replace the executor's coin sites (~l.194, 240, 330, 492, 738) with `options.flip ?? defaultFlip`.
- [ ] **Step 4:** `npx vitest run test/adventure-rng.test.ts test/ai-executor-coins.test.ts test/ai-smart.test.ts`, `npx tsc --noEmit`, `npm run simulate -- --games 300 --seed 1`.
- [ ] **Step 5: Commit** `feat: seeded RNG with state and a coin source for the AI executor`.

### Task 2: Game config — per-side Prizes and opening hands, deck rules, decks from card ids

**Files:**
- Modify: `src/lib/gameState.ts` (`StartGameOptions.prizeCount: number | SidePair`, `openingHand: number | SidePair`, `GameState.openingHandSize?: SidePair`, `doMulligan` reads it), `src/domain/board/index.ts` (`swapSides` swaps `openingHandSize`), `src/domain/match/types.ts` (re-export)
- Create: `src/domain/adventure/deck.ts` (`deckFromCardEntries`, `validateDeckEntries`, `isAdventureCardAllowed`), `src/domain/adventure/types.ts` (`CardEntry = { cardId: string; qty: number }`, `SidePair = { player: number; opponent: number }`), `src/domain/adventure/index.ts`
- Test: `test/adventure-config.test.ts`

**Interfaces:**
- `startGame(state, { prizeCount: 3, openingHand: { player: 8, opponent: 7 } })` → hands 8/7, Prizes 3/3; `{ prizeCount: { player: 2, opponent: 3 } }` → 2/3, win at the last Prize as always; defaults unchanged (7, 6).
- `deckFromCardEntries(entries: CardEntry[]): GameCard[]` (instance ids like `buildDeckFromEntries`; throws `IllegalActionError` "Carta desconocida: <id>").
- `validateDeckEntries(entries, { minSize, maxSize, maxCopies: number | null }): string | null` — Spanish reason or null; copies by name across sets; basic Energy unlimited (`isLimitedInDeck`); `maxCopies: null` = no limit (adventure mode).
- `isAdventureCardAllowed(card): boolean` — in `ALL_CARDS`, set not in development, not in `UNSUPPORTED_TRAINERS`.

- [ ] **Step 1:** Failing tests: the hand/Prize sizes above; a 20-card deck deals 7 + 3 and 10 remain; `doMulligan` with `openingHandSize.player = 8` draws 8; `swapSides` swaps `openingHandSize`; a side with 2 Prizes wins after its 2nd Prize through `takePrize`, through a bench KO (`processBenchKnockouts`) and through `checkKnockouts`; `validateDeckEntries` rejects 19 / 41 cards, and with `maxCopies: 4` rejects 5 Charmander (counting `team-rocket-050-charmander` with `base-set-046-charmander`) and 5 DCE, accepts 30 Fire Energy; with `maxCopies: null` accepts 8 Charmander; `deckFromCardEntries` on an unknown id throws.
- [ ] **Step 2:** Run — fails.
- [ ] **Step 3:** Implement (keep `state.prizeCount` = the larger count; nothing in the engine reads it).
- [ ] **Step 4:** Tests + `test/immutability.test.ts`, `npx tsc --noEmit`, simulate.
- [ ] **Step 5: Commit** `feat: per-side Prizes and opening hands, deck rules and decks from card ids`.

### Task 3: Passives as engine hooks

**Files:**
- Create: `src/domain/adventure/passives.ts` (`AdventurePassive`, `ADVENTURE_PASSIVES`, `applySetupRules`, `takeLuckyCoin`, `setupOptionsForPassives`)
- Modify: `src/lib/gameState.ts` (`GameState.passives?`, `startPlayingPhase` calls `applySetupRules` first), `src/domain/board/index.ts` (`swapSides` swaps `passives`), `src/index.ts`
- Test: `test/adventure-passives.test.ts`

**Interfaces:**
- `GameState.passives?: { player?: AdventurePassive[]; opponent?: AdventurePassive[]; luckyCoinUsed?: { player?: boolean; opponent?: boolean } }`.
- `setupOptionsForPassives({ prizeCount, openingHand, playerPassives }): StartGameOptions` — `opening_hand_plus_1` → player hand + 1; `prize_minus_one` → player Prizes − 1 (owner Q1 default).
- `applySetupRules(state): GameState` — `start_attached_energy`: first basic Energy card in deck order whose type is in the cost of one of the Active's attacks (`getAvailableAttacks`; only Colorless costs → any basic Energy), attached to the Active, deck shuffled, log `"Arranque rápido: <Pokémon> recibe <Energía>"`; none → unchanged; once (it runs only at the both-ready transition).
- `takeLuckyCoin(state, side): { state: GameState; coin: "heads" } | null` — side has `lucky_coin` and hasn't used it.

- [ ] **Step 1:** Failing tests: each behaviour above, incl. Charmander with Grass and Fire Energy in the deck gets the Fire; a Rattata Active (Colorless cost) gets the first basic Energy; no basic Energy → unchanged; an AI-side passive works on a swapped view; `takeLuckyCoin` returns heads once then null; `extra_heart` is accepted and ignored by the engine.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`, simulate.
- [ ] **Step 5: Commit** `feat: adventure passives as engine hooks`.

### Task 3b: Battle modifiers (spec §3.5)

**Files:**
- Create: `src/domain/adventure/modifiers.ts` (`BattleModifier` union, `ADVENTURE_MODIFIER_TYPES`, `applyBattleModifiersToOptions`, `placeOpponentSetup`)
- Modify: `src/domain/cards/in-play.ts` (`givesPrizeWhenKnockedOut(pokemon, state?, owner?)`: also false when the effective name is in `state.tableRules.noPrizeFor[owner]`), every Prize site (`src/lib/gameState.ts` ~l.1908, 1974, 2189, 2738, 2765, 5167; `src/domain/powers/index.ts` Buzzap ~l.1724/1733), `src/domain/ai/evaluate.ts` l.80, `src/lib/gameState.ts` (`GameState.tableRules?`, `GameState.setupRules?: { bonusCards?: { player?: CardEntry[]; opponent?: CardEntry[] } }`), `src/domain/adventure/passives.ts` (`applySetupRules` also deals `bonusCards` to the hand), `src/domain/board/index.ts` (`swapSides` swaps `tableRules` / `setupRules`)
- Test: `test/adventure-modifiers.test.ts`

**Interfaces:**
- `BattleModifier = { type: "prizeCount"; player?: number; opponent?: number } | { type: "openingHand"; player?: number; opponent?: number } | { type: "noPrizeFor"; side: Side; names: string[] } | { type: "bonusCards"; side: Side; cards: CardEntry[]; to: "hand" } | { type: "opponentSetup"; active: string[]; bench: string[][] } | { type: "opponentPassives"; passives: AdventurePassive[] }`.
- `placeOpponentSetup(state, setup)`: removes the chain cards from the rival's deck and puts them in play (Basic first, `previousEvolutions`, `playedOnTurn` 0) before the deal; throws `IllegalActionError` if a card is missing or a chain doesn't evolve by name.

- [ ] **Step 1:** Failing tests: a Metapod Knock Out (attack, bench damage, poison checkup, Buzzap-style self KO paths) gives no Prize under `noPrizeFor { opponent: ["Metapod"] }` and logs it, a Caterpie Knock Out does; the rule follows `swapSides`; Knocking Out the last rival Pokémon (all Metapod) still wins; `bonusCards` arrive in the hand at the both-ready transition, not before a mulligan, and never in the deck; `opponentSetup` puts an evolved Metapod Active (Caterpie under it) and 2 Benched ones, the rival's deck shrinks by 6, the AI's `decideOpponentSetup` adds nothing illegal; `prizeCount { player: 1, opponent: 1 }` + `prize_minus_one` → still 1; AI `evaluateBoard` values a Metapod Knock Out at 0 Prizes.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** Tests + `test/immutability.test.ts`, `test/event-perspective.test.ts`, `npx tsc --noEmit`, simulate.
- [ ] **Step 5: Commit** `feat: adventure battle modifiers as engine hooks`.

### Task 4: `createAdventureGame` and card verification

**Files:**
- Create: `src/domain/adventure/game.ts` (`AdventureGameConfig`, `createAdventureGame`)
- Modify: `src/domain/catalog/base-set.ts` (fixes found), `docs/card-doubts.md` (anything not obvious), `src/index.ts`
- Test: `test/adventure-game.test.ts`, `test/adventure-cards.test.ts`

**Interfaces:**
- `AdventureGameConfig = { playerDeck: CardEntry[]; opponentDeck: CardEntry[]; prizeCount: number; openingHand: number; playerPassives: AdventurePassive[]; modifiers: BattleModifier[] }` → `createAdventureGame(config): GameState` (MULLIGAN phase, perspective: human = `player`; call it inside the caller's `withRandom`). Order: decks → `opponentSetup` → `startGame` with prize / hand options from the rules, then the `prizeCount` / `openingHand` modifiers, then the passives → `tableRules` / `setupRules` / `passives` on the state.

- [ ] **Step 1:** Failing tests: a game from the Charmander starter vs battle 1 deck (lists in the spec §8 / source spec) has the right sizes and passives; with `prize_minus_one` the player has 2 Prizes; the battle 7 config (spec §3.6) starts with the preset board, 1 Prize each and the 3 bonus cards arriving at the both-ready transition; `adventure-cards.test.ts` asserts, for each of the 49 cards of spec §8, name, number, stage, HP, types, weakness and resistance against the printed card (source: api.pokemontcg.io `base1`, fetched once into the test as literals) — **Beedrill's weakness must be Fire**.
- [ ] **Step 2–3:** Run — fails; implement; fix catalog data the test exposes (only data the printed card proves).
- [ ] **Step 4:** Tests, `npx tsc --noEmit`, simulate.
- [ ] **Step 5: Commit** `feat: createAdventureGame; verify the adventure's Base Set cards`.

### Task 4b: The Metapod battle is solvable (spec §3.6)

**Files:**
- Create: `test/adventure-metapod-battle.test.ts` (the battle 7 config as a literal: rival 40 cards, modifiers; one player deck per starter)

- [ ] **Step 1:** Write the tests (engine only, `makeState`-style setup from `createAdventureGame` plus deterministic hands): per starter, a scripted line — Knock Out the Active Metapod (no Prize, Caterpie and Metapod in the rival's discard pile) → Pokémon Flute (Caterpie to the rival's Bench) → Gust of Wind → Ember / Bite / Vine Whip + PlusPower Knocks Out the Caterpie → `gameResult === "victory"`; Pokémon Flute refused (`canPlayTrainerCard` reason) while the rival's discard pile has no Basic; left alone, the Flute's Caterpie is evolved by `decideOpponentTurn` on the AI's next turn; Knocking Out the 3 Metapod without the Flute wins by "no Pokémon".
- [ ] **Step 2:** Run. Any failure is an engine bug or a content problem: fix the engine in this task, or report the content change to the controller (deck list / modifiers live in the API's JSON, Task 8).
- [ ] **Step 3:** `npx tsc --noEmit`, simulate.
- [ ] **Step 4: Commit** `test: the Metapod battle is solvable with every starter`.

### Task 5: Headless AI driver

**Files:**
- Create: `src/domain/ai/driver.ts` (`nextAIStep`, `applyAIStep`, `AIStep`, `AIPlanState`)
- Modify: `src/domain/ai/index.ts`, `src/index.ts`
- Reference (port, don't import): frontend `src/features/game/hooks/useAIOpponent.ts`, `src/features/game/model/ai-setup.ts` (`D:/Proyectos/pokemon-tcg-wt-gym-sets`)
- Test: `test/ai-driver.test.ts`

**Interfaces:**
- `nextAIStep(state, plan: AIPlanState | null, options?: DecideOpponentTurnOptions): { step: AIStep; plan: AIPlanState | null } | null` — AI = `opponent`; null when the human must act or the game is over. Order: mulligan / setup / ready during MULLIGAN–SETUP → Prize to take → promotion (`decideOpponentPromotion`) → pending answers the AI owns (attack choice with `step.chooser` on the AI's side via `answerAttackChoiceForAI` + `resolveAttackChoice`, `pendingTrainerChoice` steps it answers, bench trim, Chaos Gym offer, Misty's Duel pick, own power choice) → its turn (queued `decideOpponentTurn` actions; replan when a plan ends without `attack`/`endTurn`; force `endTurn` when a plan added no events or after 20 plans).
- `applyAIStep(state, step, { flip, onCoins }): GameState`. `AIStep` carries `delay` (ms) for the consumer.
- `AIPlanState` is plain JSON (persistable).

- [ ] **Step 1:** Failing tests: driving a full game with the human side played by `randomLegalPolicy` and the AI by the driver (seeded, `withRandom`) ends with a result in ≤ 300 turns for 20 seeds, starter vs each adventure rival deck; the driver returns null whenever the human must act (their turn, their promotion, a step they answer); after a human attack the driver takes the AI's promotion after a Knock Out and answers a `pendingAttackChoice` whose chooser is the AI (a `makeState` scenario); the plan state survives `JSON.parse(JSON.stringify(plan))` mid-turn and the game continues identically.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`, simulate.
- [ ] **Step 5: Commit** `feat: headless AI driver for server-run AI seats`.

### Task 6: Simulator `--adventure`

**Files:**
- Modify: `src/domain/simulation/game.ts` (`playAIGame(deckA, deckB, options)` accepts `startOptions` and card-entry decks via `createAdventureGame`), `scripts/simulate.ts` (`--adventure <json path>`: for each starter × each battle (hard: per starter), N games, the starter side = greedy policy, the rival = greedy; prints win rate, average turns, deck-out rate per battle; battles with `modifiers` are played with them — the Metapod battle's numbers decide whether an `aiHint: "stall"` is needed, spec §3.6)
- Test: `test/simulation-adventure.test.ts` (an inline 2-battle fixture)

- [ ] **Step 1:** Failing test: the fixture runs 10 games per pairing with 0 failures and reports per-battle stats.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** Tests; once the API content exists (Task 8): `npm run simulate -- --adventure ../pokemon-tcg-api-wt-adventure/content/adventures/pueblo-paleta-bosque-verde.json --games 100 --seed 1` → 0 failures (spec H3). Record the table in the ledger.
- [ ] **Step 5: Commit** `feat: simulator --adventure (per-battle win rates)`.

### Task 7: Docs, exports, version

**Files:** `CLAUDE.md` (Layout: `domain/adventure/`, `ai/driver.ts`; Model: per-side Prizes / hands, `passives`, battle modifiers (`tableRules`, `setupRules`, state-aware `givesPrizeWhenKnockedOut` — "How to add… a battle modifier"), coin source of the AI executor, seeded RNG; Commands: `--adventure`), `src/index.ts`, `package.json` version → **0.10.0** (do NOT publish).

- [ ] **Step 1:** `npm test`, `npm run simulate -- --games 1000 --seed 7 --policy all --decks random-mix`, `npm run build`, `npm pack` → copy the `.tgz` to `D:/Proyectos/pokemon-tcg-packs/`.
- [ ] **Step 2: Commit** `docs: adventure mode engine notes; 0.10.0`.

## Stage 2a — API (`D:/Proyectos/pokemon-tcg-api-wt-adventure`)

Tasks 8, 9 and 10 need only the published 0.9.0 (`findCardById`, `isLimitedInDeck`) and can start **in parallel with Stage 1**; switch to the packed 0.10.0 when Task 7 lands (Task 10's deck rule moves to `validateDeckEntries`; until then Task 10 declares local copies of `AdventureGameConfig` / `BattleModifier` and swaps them for the engine's types). Task 11 needs 9–10; 12 needs Stage 1 + 11; 13 needs 11.

### Task 8: Adventure content + zod schema + startup validation

**Files:**
- Create: `content/adventures/pueblo-paleta-bosque-verde.json` (the full spec content with catalog ids, spec §8; `rules.maxCopies: null`; the spec's starter decks (4 Basics, 2 Rattata); battle 7 = the Metapod battle of spec §3.6 with its `modifiers`), `src/modules/adventure/content/modifiers.ts` (`describeModifier(modifier): string` — Spanish line per §3.5 type, e.g. "Mesa a 1 premio por jugador", "Los Metapod del rival no dan premios", "Empiezas con Pokémon Flute, Gust of Wind y PlusPower en la mano", "El rival empieza con Metapod en juego"), `src/modules/adventure/content/schema.ts` (zod), `src/modules/adventure/content/load.ts` (`loadAdventures(): ReadonlyMap<string, Adventure>`, reads `content/adventures/*.json` once, throws with every problem listed), `src/modules/adventure/content/types.ts`
- Modify: `src/index.ts` (load at boot, before listening), `package.json` `files`/build so `content/` ships (or import the JSON with `resolveJsonModule`)
- Test: `test/adventure-content.test.ts`

Validator checks (beyond zod shape): 10 battles with indices 1–10; rival decks 20–40 and a `hard.byStarter` entry for every starter; starter decks within `rules` (`minDeckSize`, `maxDeckSize`, `maxCopies` — a number or `null`); every card id exists and `isAdventureCardAllowed`; pools reference existing treasures; `starter.*` tokens only in treasures; `modifiers` only of the spec §3.5 types (zod discriminated union), `opponentSetup` chains evolve by name and their cards are in that battle's rival deck, `bonusCards` ids exist, counts ≥ 1; reward types `cosmetic | starter_unlock | card`; achievement conditions known.

- [ ] **Step 1:** Failing tests: the real file validates; broken fixtures (9 battles, a 19-card rival deck, an unknown card id, a pool with a missing treasure, a hard deck missing a starter, an unknown modifier type, an `opponentSetup` Metapod over a Weedle, an `opponentSetup` card missing from the rival deck) each fail with a specific message; `describeModifier` gives a Spanish line for every modifier type.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** `npx vitest run test/adventure-content.test.ts`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: Adventure 1 content and validator`.

### Task 9: Prisma models + migration

**Files:** `prisma/schema.prisma` (`AdventureRun`, `AdventureBattleResult`, `AdventureProgress`, `UserStarterUnlock`, relations on `User` — spec §4), `prisma/migrations/<YYYYMMDDHHMMSS>_adventure_mode/migration.sql` (generated with `npm run db:migrate -- --name adventure_mode` against the local `ptcg-dev-db` only, plus the partial unique index `adventure_runs_one_active` added by hand), `src/modules/economy/claims.ts` (`ClaimKind` + `"adventure"`)

- [ ] **Step 1:** `test/migrations.test.ts` fails on the schema change; add the migration; a test inserting two active runs for one user fails with P2002.
- [ ] **Step 2:** `npm test` (Docker `ptcg-test-db`), `npx tsc --noEmit`.
- [ ] **Step 3: Commit** `feat: adventure run, battle, progress and starter unlock models`.

### Task 10: Run logic (pure)

**Files:**
- Create: `src/modules/adventure/run-logic.ts`, `src/modules/adventure/run-logic.types.ts`
- Test: `test/adventure-run-logic.test.ts`

**Interfaces (pure, no DB):** `newRun(adventure, { difficulty, starterId, seed })`, `editDeck(run, adventure, { remove, energies })`, `generateOffer(run, adventure, battleIndex)`, `chooseTreasure(run, adventure, choice)`, `applyBattleResult(run, adventure, { victory })` → `{ run, events: RunEvent[] }` (`offer`, `heartLost`, `runWon`, `runLost`), `battleConfig(run, adventure)` → game-core `AdventureGameConfig` (run deck, rival deck for `currentBattle` — hard by starter —, rules, passives, the battle's `modifiers`), `markOffType(run, adventure)`, `achievementFacts(run)`. Throws `RunPhaseError` (→ 409) / `RunRuleError` (→ 422).

- [ ] **Step 1:** Failing tests — the spec's key tests: same seed + battle → same offer; defeat −1 heart and same battle, 0 → `lost`; actions outside their phase throw `RunPhaseError`; the deck never < 20 or > 40, a 5th and 6th Charmander are fine (no copy limit), DCE can't be added by edit; `starter.*` tokens resolve per starter; `t1-evolucion` is offerable with the untouched starter deck; hard battle 10 gives the right deck per starter; `battleConfig(run, adventure)` carries the battle's `modifiers`; offers exclude owned passives and treasures that would pass 40 cards, and use the major pool after battle 5; `extra_heart` raises both counters; monotype flag set by a Lightning Energy added before a battle.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: adventure run logic`.

### Task 11: Run service and HTTP endpoints

**Files:**
- Create: `src/modules/adventure/adventure.service.ts`, `src/modules/adventure/adventure.controller.ts` (`adventureRouter`), `src/modules/adventure/index.ts`
- Modify: `src/index.ts` (mount under `/api`, mutating paths in the economy rate-limit list)
- Test: `test/adventure-http.test.ts` (`startHttpApp`, `createUser`)

Endpoints and errors as in spec §5.1; `GET /adventures/:id` and the run payload include the current battle's rules as `describeModifier` lines (beaten battles too, future ones never). Every mutation: `$transaction` + `lockUsers`. `seed` and `battle.state` never serialized. `applyBattleResult(runId, result)` is a service function (no route), used by Task 12: writes `AdventureBattleResult`, updates the run; on battle 10 victory updates `AdventureProgress`, grants the reward with `claimOnce(tx, userId, "adventure", "<adventureId>:<difficulty>")` (card back upsert / `UserStarterUnlock`), then `checkAndUpdateProgress(userId)` after the commit.

- [ ] **Step 1:** Failing tests: create run (409 second active; 404 unknown starter); `GET /adventure/runs/:id` has no `seed`; deck edit 409 outside `pre_battle`, 422 under 20; treasure 422 for an id not offered; abandon; `applyBattleResult` battle 10 twice for the same difficulty grants the card back once; another user's run → 404.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: adventure run endpoints`.

### Task 12: Adventure battle rooms (server-run AI seat)

**Files:**
- Create: `src/socket/adventure-room.ts` (`createAdventureRoom(run)` from `battleConfig` — modifiers included —, AI loop, snapshot / restore, end → `applyBattleResult`)
- Modify: `src/socket/rooms.ts` (room kind `config.mode: "adventure"` + `aiSeat`; per-room coin source hook; after-action hook; skip turn timer / answer clock / kick / forfeit and cleanup timers / `openRoomMatch` / `settleRoomResult` for adventure rooms; restore on `joinRoom` of a missing adventure room), `src/socket/handlers.ts` (`gameStart` carries `adventure` info and the rival's `opponentInfo`; `adventureBattleResult` event), `src/socket/state-masking.ts` (unchanged rules; check `passives` passes through), `src/modules/adventure/adventure.service.ts` (`POST …/battle` creates the room)
- Test: `test/adventure-room.test.ts` (`new GameRoomManager(...)` with a scripted seed, `startSocketServer` for the end-to-end case)

Behaviour: human = `player1`. All engine and AI calls of the room inside `withRandom(room.rng)`, synchronous; coin source = `room.rng`, with `takeLuckyCoin` for the first coin of a human-initiated action (attack incl. Confusion, Trainer/power `requestCoinFlip`, retreat) when the run has `lucky_coin`. After each applied action: loop `nextAIStep` / `applyAIStep` (flip = room coins, `onCoins` → `showCoinFlip` with `flippedBy` per viewer), broadcast `gameState` per step, `setTimeout(step.delay)` between steps (never inside `withRandom`). Snapshot `AdventureRun.battle = { roomId, state (events trimmed to the last 200), rngState, aiPlan, humanActions }` after every human action and AI step (debounced ≤ 1 s, flushed at the end). Event neutralization labels player2 with the rival's name. Game over or surrender → `applyBattleResult` once (`room.resultSettled`) → `adventureBattleResult` → room closes after `FINISHED_ROOM_TTL_MS`. Coins/results/seeds from the client are rejected by the existing schemas (`coinResults: z.undefined`).

- [ ] **Step 1:** Failing tests: a scripted battle (human plays a fixed line, seed fixed) produces the same final state twice; the AI acts within the room without any socket for player2 and never while the human must answer; the human's first attack coin is heads with `lucky_coin` (and the second isn't forced); the opponent's hand is masked in `gameState`; the Metapod battle's room starts with the preset board and the 3 bonus cards reach the player's hand after setup; a Metapod Knock Out in the room gives no Prize; killing the manager mid-battle and rebuilding from the snapshot continues to the same result; game over applies the result exactly once and sends `adventureBattleResult`; a `surrender` costs a heart; no `Match` row is created; a second socket of another user can't join the room.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: server-run adventure battle rooms`.

### Task 13: Achievements and cosmetics

**Files:** `src/modules/achievements/achievements.service.ts` (7 `RAW_DEFS` entries `adventure-1-*`, tiers per owner Q5; checker `adventure` reading `AdventureProgress`; excluded from the meta count per Q5), `src/modules/prizes/catalog.ts` or a new `src/modules/adventure/rewards.ts` (`cardback-bosque-verde` `{ itemId, name: "Bosque Verde", imageUrl: "/card-backs/card-back-bosque-verde.jpg" }`), `src/modules/admin/grantable-cosmetics.ts` (grantable)
- Test: `test/adventure-achievements.test.ts`

- [ ] **Step 1:** Failing tests: for each achievement a hand-built progress/run set that meets it and one that doesn't (spec "Tests clave"); the Legend meta target unchanged; claim works through the existing route; the card back is owned after a normal clear and equippable (`updateCosmetics`).
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** `npm test`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: adventure achievements and the Bosque Verde card back`.

## Stage 2b — frontend (`D:/Proyectos/pokemon-tcg-wt-adventure`)

Tasks 14–18 and 20 need only the API contract (spec §5) and can run **in parallel with Stage 2a** against mocked `apiClient`; Task 19 needs Task 12 and the packed engine. 15–18 depend on 14 and may run in parallel with each other.

### Task 14: Domain types, API client, run hook

**Files:** `src/domain/adventure/types.ts` (Adventure summary/detail, Run, CardEntry, treasure, passive, phase), `src/domain/adventure/passives-ui.ts` (passive → Spanish name, description, PokeAPI item sprite path), `src/infra/http/adventure-api.ts` (`apiClient` calls for every spec §5.1 route), `src/features/adventure/hooks/useAdventureRun.ts`
- Test: `src/infra/http/adventure-api.test.ts`, `src/features/adventure/hooks/useAdventureRun.test.tsx`

- [ ] **Step 1–3:** Failing tests (request shapes, 409 → toast reason), implement.
- [ ] **Step 4:** `npx vitest run src/infra/http/adventure-api.test.ts src/features/adventure`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: adventure types and API client`.

### Task 15: Entry, adventure select and new run screens

**Files:** `src/features/play/ui/PlayModeSelection.tsx` (one `GAME_MODES` entry "Aventura", pixel icon from `public/sprites/ui/`), `src/domain/seo/site.ts` (`/adventure` in `PRIVATE_PATHS`), `app/adventure/page.tsx`, `app/adventure/new/page.tsx` (both `ProtectRoute`), `src/features/adventure/ui/AdventureSelectPage.tsx`, `src/features/adventure/ui/NewRunPage.tsx` (3 starters with their decks as card tiles, `TabStrip` Normal/Difícil, Empezar; "Continuar" when a run is active)
- Test: `src/features/adventure/ui/NewRunPage.test.tsx`

- [ ] **Step 1–3:** Failing tests (starter pick + difficulty → `createRun`; active run → redirect to the map), implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: adventure entry and new run screens`.

### Task 16: Map and run bar

**Files:** `app/adventure/run/page.tsx`, `src/features/adventure/ui/AdventureMap.tsx` (10 nodes by zone, beaten / current (pulsing) / future (silhouette) states, `[image-rendering:pixelated]` sprites of each rival's lead Pokémon), `src/features/adventure/ui/RunBar.tsx` (hearts, "Batalla N/10", passive icons with tooltips, a "Reglas de la mesa" chip when the battle has modifiers (tap → popover with the `describeModifier` lines); compact variant for the phone header), `src/features/adventure/ui/BattleRulesPanel.tsx` (pre-battle panel on the current node: rival, location and the battle's rules), actions Editar mazo / Ver rival / Batallar / Abandonar (confirm `ModalFrame`), `public/sprites/adventure/*` (only the PokeAPI files used; credits in `public/sprites/CREDITS.txt`)
- Test: `src/features/adventure/ui/AdventureMap.test.tsx`

- [ ] **Step 1–3:** Failing tests (node states from the run; the rules panel lists the Metapod battle's 4 rules and is absent for a battle without modifiers; Batallar calls `startBattle` and navigates to `/adventure/battle/<roomId>`), implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`; screenshot desktop + 390 px phone for the owner (`scripts/screenshots.mjs`).
- [ ] **Step 5: Commit** `feat: adventure map and run bar`.

### Task 17: Run deck editor

**Files:** `app/adventure/run/deck/page.tsx`, `src/features/adventure/ui/RunDeckEditor.tsx` (columns from `src/features/draft/model/deck-layout.ts` `groupDeckCards`, `DraftCardTile` with remove only, basic Energy steppers, min/max chip "Faltan N / Sobran N", Guardar → `PATCH …/deck`; validation mirrored with game-core `validateDeckEntries`)
- Test: `src/features/adventure/ui/RunDeckEditor.test.tsx`

- [ ] **Step 1–3:** Failing tests (can't go under 20 or over 40, no copy limit (a 5th Charmander from a treasure is shown fine), can't add DCE, removal is final after save), implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: adventure deck editor`.

### Task 18: Treasure choice, battle result and end of run

**Files:** `app/adventure/run/treasure/page.tsx`, `app/adventure/run/end/page.tsx`, `src/features/adventure/ui/TreasureChoice.tsx` (3 large tiles; major treasures with the `HoloSparkle` overlay; Elegir / Saltar), `src/features/adventure/ui/HeartLostModal.tsx` (Motion heart-break, "Te quedan N corazones"), `src/features/adventure/ui/RunEndPage.tsx` (result, battles won, treasures, newly claimable achievements → profile, reward)
- Test: `src/features/adventure/ui/TreasureChoice.test.tsx`

- [ ] **Step 1–3:** Failing tests, implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: treasure choice and end of run`.

### Task 19: Battle on the multiplayer page

**Files:** `app/adventure/battle/[roomId]/page.tsx`, `src/features/game/ui/MultiplayerGamePage.tsx` (prop `context?: { kind: "adventure"; runId: string }`: no `ChatPanel`, no `TurnTimer`, no kick, no "Sala" chip, no spectator count; `headerExtra` = `RunBar` (with the rules chip) from `gameStart.adventure` (which carries the battle's `describeModifier` lines); exits (leave, `gameClosed`, `ROOM_NOT_FOUND`, GameOver `onExit`) go to `/adventure/run`; `adventureBattleResult` → `HeartLostModal` or the treasure route), install the packed engine 0.10.0
- Test: `src/features/game/ui/MultiplayerGamePage.adventure.test.tsx`

- [ ] **Step 1:** Failing tests: with the adventure context the chat/timer/kick are absent and the run bar with its rules chip is present; a defeat result shows the heart modal; the default (no context) render is unchanged.
- [ ] **Step 2–3:** Run — fails; implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`, `npm run build` (PowerShell if Git Bash crashes with 0xc0000142).
- [ ] **Step 5: Commit** `feat: adventure battles on the multiplayer board`.

### Task 20: Profile — achievements group and card back

**Files:** `src/features/profile/ui/tabs/AchievementsTab.tsx` ("Aventura" group by id prefix `adventure-`), `src/domain/profile/achievements.ts` (fallback definitions), `src/domain/profile/types.ts` (`CARD_BACKS` entry `cardback-bosque-verde`, `source: "adventure"`), `src/features/profile/ui/cosmetics/cosmetic-labels.ts` (label "Aventura"), `public/card-backs/card-back-bosque-verde.jpg` (≤ 500 px wide; owner art or the placeholder per Q6)
- Test: `src/domain/profile/transformers.test.ts` (adventure achievements grouped)

- [ ] **Step 1–3:** Failing tests, implement.
- [ ] **Step 4:** Tests, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: adventure achievements and card back in the profile`.

## Stage 3 — integration

### Task 21: End-to-end verification and hand-off

- [ ] **Step 1:** game-core: `npm test`, Task 6 adventure simulation (100 games per pairing, 0 failures; per-battle win rates and deck-out rates into the ledger for H7), `npm run build`, `npm pack`.
- [ ] **Step 2:** API and frontend on the same packed engine: `npm test`, `npx tsc --noEmit` (both), `npm run build` (frontend).
- [ ] **Step 3:** Local run (API `npm run dev` on the dev DB, frontend `npm run dev`): one full normal run with each starter by Playwright or by hand — lose a battle (heart lost, same battle again), pick a treasure, the major treasure after 5, close the tab mid-battle and resume, restart the API mid-battle and resume, win battle 10 → card back owned, achievements claimable; one hard run reaching battle 10 checks the rival deck per starter.
- [ ] **Step 4:** Hand-off notes: what's done, owner answers still open, the balance table, release order (publish game-core 0.10.0 → pin the SAME version in API and frontend → API migrate deploy with a DB backup → API deploy → frontend push), news post + Discord per the changelog rule — no publish/deploy without the owner's explicit OK.
- [ ] **Step 5: Commit** the hand-off notes in each repo's docs.
