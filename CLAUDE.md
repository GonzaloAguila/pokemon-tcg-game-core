# CLAUDE.md — @gonzaloaguila/game-core

Pure TypeScript engine for **Nostalgic TCG** (classic Pokémon TCG: Base Set 102 + Jungle 48 + Fossil 47 cards; Team Rocket in progress, see `docs/fossil-team-rocket-design.md`). Holds `GameState`, attacks/effects, status conditions, Pokémon Powers, trainers, AI, card catalogs and theme decks. No React, no browser APIs, no Node-only APIs.

## Consumers (sibling repos under `D:/Proyectos/`)

| Repo | How it consumes this package |
|------|------------------------------|
| `pokemon-tcg` (Next.js frontend) | GitHub Packages, exact version. Runs the engine in the browser for single-player vs AI. |
| `pokemon-tcg-api` (Express + Socket.io) | GitHub Packages, exact version. Authoritative for multiplayer. |

Both must pin the SAME version, otherwise single-player and multiplayer run different rules. After changing the engine: build, `npm version patch`, publish, then bump both consumers and redeploy the API.

## Commands

```bash
npm run build      # tsc && tsc-alias → dist/ (rewrites @/ aliases)
npm run dev        # tsc --watch
npx tsc --noEmit   # type check
npm test           # vitest (test/**, card-scenario helpers in test/helpers/state.ts)
npm run typecheck:test
npm run simulate -- --games 500 --seed 1 --sets base-set,jungle --policy all   # bot fuzzer (tsx)
npm run simulate -- --games 1000 --sets base-set,jungle,fossil --stats --coverage fossil   # + action counts and coverage of a set
npm run check-images -- --set fossil   # HEAD every image URL of a set (network)
npm version patch && npm publish   # GitHub Packages; prepublishOnly builds; needs auth with write:packages
```

`npm run lint` is declared but eslint isn't installed. Write a failing card-scenario test first for any rule change (`makeState`, `inPlay`, `deepFreeze`, `armedFor` helpers — attacks are only legal when paid, so give attackers Energy or wrap them in `armedFor`). npm 10 can crash adding devDependencies — use `npx npm@11 install -D …`. After any rule change also run `npm run simulate` (0 failures expected; a failure prints the seed to replay with `--games 1 --seed N`).

Must stay `"module": "CommonJS"` in tsconfig (ESNext output breaks Node with `ERR_UNSUPPORTED_DIR_IMPORT`). `dist/` is gitignored and is the only thing published.

## Layout

- `src/index.ts` — the public API. Anything consumers use must be exported here (also re-exported via `src/domain/match/index.ts` for some engine functions).
- `src/lib/gameState.ts` — the engine (~4.7k lines): `GameState`/`PokemonInPlay` types, setup/mulligan, `executeAttack` (+ coin plans), `endTurn`, retreat, evolution, prizes, Knock Outs (`checkKnockouts`), pending-state resolvers. `src/lib/attackChoices.ts` — the generic pending attack choice (`resolveAttackChoice`).
- `src/domain/cards/` — card types, factories, guards (`isPlayableAsBasic`), `in-play.ts` (Trainers played as Basics: `toInPlayCard`, `cardsLeavingPlay`, `givesPrizeWhenKnockedOut`). `catalog/` — `sets.ts` (**set registry**: `CARD_SETS`, `ALL_CARDS`, `findCardById`, `findCardDefinition(set, number)`, `findCardByName`, `getCardImageUrl`), `base-set.ts`, `jungle.ts`, `fossil.ts`, `image-urls.ts` (pkmncards.com slugs; `scripts/check-images.ts` checks them). `decks/` — theme decks + resolution.
- `src/domain/board/` — engine-owned board actions: `playBasicPokemon`, `attachEnergyCard` (Rain Dance, `ENERGY_ATTACH_EFFECTS` hook), `evolvePokemonCard`, `discardFromPlay` (Mysterious Fossil), their `canX`, `getTurnActionBlocker`, `getEvolutionBlocker` (Prehistoric Power), `getTrainerBlocker` (Headache), `swapSides`, `findInPlay`.
- `src/domain/effects/` — **card effect registry**: `TRAINER_EFFECTS` (by card name) and `POWER_EFFECTS` (by power name) as `CardEffectDef { canUse, getSteps, coinFlips?, resolve }`, generic entry points `canPlayTrainerCard/getTrainerSteps/getTrainerCoinFlips/playTrainerCard` and `canUsePokemonPower/getPowerSteps/getPowerCoinFlips/usePokemonPower`. Selection meanings are tabled at the top of `effects/trainers.ts` and `effects/powers.ts`.
- `src/domain/trainers/index.ts` — the per-trainer `canPlayX` / `playX` the registry wraps. `powers/index.ts` — Pokémon Powers (`isPowerActive`, Toxic Gas `getToxicGasSource`, Transform `getEffectivePokemonCard` / `getEffectiveHp`, `isHandRevealed`, Kabuto Armor `applyDamageHalving`, per-power functions). `status/` — status helpers. `ai/` — `strategy.ts` (decide), `actions.ts` (estimates + board actions through the engine), `executor.ts` (apply; trainers via the registry), `pending.ts` (the AI answers its own attack's choices; `answerStepForAI`).
- `src/domain/simulation/` — headless bot games (`playAIGame`, greedy/randomLegal policies, seeded RNG, random decks, invariants); `scripts/simulate.ts` is the CLI.
- `src/shared/errors.ts` — `IllegalActionError` / `assertLegal`.
- `src/domain/constants/enums.ts` — `as const` enums (`EnergyType`, `AttackEffectType`, `PokemonPowerType`, `GamePhase`, …). `PokemonStage` values are `"basic" | "stage-1" | "stage-2"`.
- `src/domain/match/types.ts` re-exports the `GameState` types of `gameState.ts` (single definition).

## Model and conventions

- State is relative: `player*` fields vs `opponent*` fields, plus `isPlayerTurn`. To act as the other side, callers swap perspective (AI executor and API both do this).
- Every action is `(state, ...args) => newState`. Never mutate the input — copy arrays before `splice`/`push`.
- Validate with `canX()` (returns a Spanish reason or `null`) before calling the action. The newer entry points enforce it themselves and **throw `IllegalActionError`** (with the same reason) when called anyway: board actions, `playTrainerCard`, `usePokemonPower`, `executeAttack` (`canExecuteAttack`: turn, statuses, Leer, Energy cost, requirements, one attack per turn — no first-turn ban, classic 1999 rules) and `executeMetronome` (`canExecuteMetronome`). Older functions (`executeRetreat`, the legacy `playX`) still return the state with an info event.
- Turn bookkeeping: `attackedThisTurn` (set by an attack or a failed confused attack) and `checkupDoneOnTurn` (endTurn paused for a prize/promotion after the between-turns checkup; the next endTurn won't repeat the checkup) both block normal actions and are cleared when the turn passes.
- Card behavior is data in the catalog (`attacks[].effects[]` with `AttackEffectType`); the interpreter is the effects loop in `executeAttack`.
- Coins are flipped by the caller (the server is authoritative in multiplayer) and passed in: `resolveConfusionFlip(state, heads)` before ANY attack (Metronome and Conversion included), `executeAttack(state, i, { coinResults })` with the coins of `getAttackCoinPlan(state, i)` (Metronome: pass the copied `Attack`), built with `flipAttackCoins(plan, flip)`. Layout: [Sand-attack/Smokescreen coin (tails: the attack does nothing)] + the attack's own coins (a fixed number, or `"untilTails"`: a run ending in the first tails, Stone Barrage) + [Transparency coin of the Defending Haunter, LAST]. `getAttackCoinFlipCount` is the total for fixed plans only. All coin effects of one attack share the same coins; coin damage is part of the base damage (before weakness/resistance). Trainers/powers: `getTrainerCoinFlips`/`getPowerCoinFlips` coins are flipped before the first step and passed to `getXSteps` and `playTrainerCard`/`usePokemonPower` as `{ coinResults }`.
- Pokémon Powers: every "does this power work now?" check goes through `isPowerActive(state, pokemon)` (has power, not Asleep/Confused/Paralyzed, not suppressed by `state.powersSuppressed` or a working Toxic Gas; Thick Skinned ignores statuses).
- Transform (Ditto): the engine reads Pokémon data through `getEffectivePokemonCard(state, pokemon)` wherever it matters (attacks, types, W/R, HP, retreat); never store the effective card. HP can drop when the other Active changes, so `checkKnockouts` (state-based Knock Outs, automatic Prizes) runs after attacks, trainers/powers, retreat, evolution, promotion and around the endTurn checkup.
- Trainers played as Basics (`playsAsBasic: { hp }`: Mysterious Fossil, Clefairy Doll) are a Pokémon in play (`toInPlayCard`, `trainerCard` keeps the Trainer) and the Trainer again everywhere else: any code moving in-play cards to a pile must use `cardsLeavingPlay` / `cardOutOfPlay`, and Prizes check `givesPrizeWhenKnockedOut`.
- Multi-step effects set a pending flag (`pendingForceSwitch`, `pendingSelfSwitch`, `pendingDeckSearch`, `pendingBenchDamageSelection`, `pendingAttackChoice`, `pendingTypeShift`, `pendingPeek`); `endTurn()` must refuse to advance while one is set, the UI shows a modal, a resolver clears it (resolvers take `{ skipEndTurn }`), and the AI (`ai/pending.ts`) and the simulator must resolve it. New attack choices use `pendingAttackChoice` (a `SelectionStep` with `chooser`, answered with `resolveAttackChoice` on the attacking side's view), not a new flag. `endTurn` also waits while either side must promote.
- Log meaningful actions to `state.events` via `createGameEvent()`. Event text is Spanish; coin results use `[coin:heads]` / `[coin:tails]` tokens.
- Card IDs: `{set-slug}-{3-digit-number}-{slug-name}` (`base-set-004-charizard`, `jungle-007-nidoqueen`). Source data: api.pokemontcg.io (`base1`, `base2` = Jungle, `base3` = Fossil, `base5` = Team Rocket).
- Any lookup by card must search all sets: use the registry (`ALL_CARDS`, `findCardDefinition`, `findCardByName`), never a hand-written `[...baseSetCards, ...jungleCards]`.

## How to add…

- **A set**: catalog file `src/domain/catalog/<set>.ts` (ids via `makeCardId`), its value in the `CardSet` enum, one entry in `CARD_SETS` (id, code, release date, printed total, image URL builder), image URL check. Everything else (lookups, decks, simulator `--sets`) follows the registry.
- **A Trainer**: a `CardEffectDef` in `TRAINER_EFFECTS` (key = card name): `canUse` (Spanish reason), `getSteps` (one `SelectionStep` per question; `minSelections` for "up to"), `coinFlips` if it flips, `resolve` (trust the selections: the entry point validated them against your steps). Add a scenario test through `playTrainerCard`; the coverage test fails until every catalog Trainer has an entry (or is in `UNSUPPORTED_TRAINERS`).
- **An activated power**: same, in `POWER_EFFECTS` keyed by power name, sourceId = the Pokémon in play (use THAT Pokémon's power); its `PokemonPowerType` goes in `ACTIVATED_POWER_TYPES`; `oncePerTurn` powers call `markPowerAsUsed`. A passive power is a check inside the engine that calls `isPowerActive`.
- **An attack choice** (the attacker or the opponent picks something after the attack): make the effect data recognised by `isAttackChoiceEffect` and add its step (`stepFor`) and its effect (`applyChoice`) in `lib/attackChoices.ts`.
- **A special Energy**: `ENERGY_ATTACH_EFFECTS[name]` for on-attach-from-hand effects.
- **A "play as a Basic" Trainer**: `playsAsBasic: { hp }` on the card data (same rules as Mysterious Fossil); it needs no TRAINER_EFFECTS entry (`isPlayedAsBasic`).

## TCG rules to respect (classic era)

- Damage order: base damage (incl. `Nx`/`N+` coin math and effect bonuses, next-turn bonus) → weakness ×2 → resistance −30 → PlusPower +10 each (only if the attack does damage) → Defender −20 → next-turn reductions → barriers/protection → floor at 0. PlusPower is applied AFTER weakness/resistance.
- Asleep, Confused, Paralyzed replace each other; Poisoned stacks with them. Moving to the bench (retreat, switch) removes ALL special conditions, including Poison.
- Only Asleep, Confused and Paralyzed stop Pokémon Powers; Poison does not.
- Confusion: tails on the attack flip → 20 damage to itself. Sleep: flip between turns, heads wakes. Paralysis: wears off after the owner's next turn. Poison: 10 between turns (20 for Toxic).
- Knockouts must be checked after every damage source, including bench damage and between-turns damage.
- Double Colorless Energy counts as 2 colorless. Leek Slap–style attacks ("can't use this attack again as long as this Pokémon stays in play", incl. benching) are tracked on the Pokémon in play.

## Known issues (2026-10 review — verify before assuming fixed)

Fixed on feature/fossil-team-rocket (unreleased): `findCardByName` searches every set; Breeder on turn 2 / evolution and Devolution Spray resets; Toxic poison surviving Full Heal; attack legality exploit (`canExecuteAttack`); engine-owned Sand-attack; double between-turns checkup; game not ending when bench damage removes a side's last Pokémon; Buzzap losing the card id; no draw on turn 1; the AI's own deck search moving a card to the other side and passing the turn twice; the AI never resolving Spark-style bench choices; endTurn passing the turn while the opponent still had to promote; Dragonair's Hyper Beam doing nothing; Venonat's Leech Life healing a fixed 10; Agility not stopping Hurricane. Clefairy Doll is now playable (same rules as Mysterious Fossil).

Fixed in 0.5.0: bench KOs (`processBenchKnockouts`), endTurn mutation, Flail double count, Leer duration, Poison cleared on bench, Poison no longer blocks powers, Dream Eater / Karate Chop, confusion = 20 (`CONFUSION_SELF_DAMAGE`, `resolveConfusionFlip`), `buildDeckFromEntries` by set, double prize on attacker self-KO, AI re-attacking after a failed confused attack.

Still open:
- Coin-flip attack effects are engine-owned (`executeAttack`/`executeMetronome` with `{ coinResults }`, `getAttackCoinFlipCount`; the AI executor uses it), but the frontend (`useCoinFlipHandler.ts`) and the API (`socket/rooms.ts` `applyCoinFlipEffects`) still call the legacy positional form (which skips coin effects) and re-implement them with rule bugs — see `docs/coin-flip-effects.md`. They must migrate; then the positional form can be removed.
- Conversion 1/2 (Porygon) is still resolved by consumers (no engine resolver). The legacy positional `executeAttack` form doesn't enforce Sand-attack (it has no coins).
- RNG is `Math.random` (shuffle, checkups, IDs, AI flips); the simulator seeds it by replacing `Math.random` during a run. `state.events` grows unbounded.
- AI is greedy: never retreats, never uses powers, only plays Bill/Potion/PlusPower (now through the effect registry).
- Consumers (FE `trainer-registry.ts`, power modals, `useBoardActions`; API `rooms.ts` switches) still have their own copies; they should switch to the board actions and the effect registry (Stage C). They also don't know `pendingAttackChoice` yet (Base Set Dragonair's Hyper Beam now uses it), `discardFromPlay`, `getAttackCoinPlan` (Stone Barrage, Transparency), `isHandRevealed` or `getEffectivePokemonCard` (Ditto's attacks). Card doubts: `docs/card-doubts.md`.
- Haunter's Transparency is modelled for the Defending Haunter only (not a Benched Haunter hit by bench damage).
- Simultaneous prize-outs (sudden death) aren't modelled.
- Jungle cards: only 4/48 verified against the real card text.
