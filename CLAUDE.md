# CLAUDE.md — @gonzaloaguila/game-core

Pure TypeScript engine for **Nostalgic TCG** (classic Pokémon TCG: Base Set 102 + Jungle 48 cards). Holds `GameState`, attacks/effects, status conditions, Pokémon Powers, trainers, AI, card catalogs and theme decks. No React, no browser APIs, no Node-only APIs.

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
npm version patch && npm publish   # GitHub Packages; prepublishOnly builds; needs auth with write:packages
```

`npm run lint` is declared but eslint isn't installed. Write a failing card-scenario test first for any rule change (`makeState`, `inPlay`, `deepFreeze` helpers). npm 10 can crash adding devDependencies — use `npx npm@11 install -D …`.

Must stay `"module": "CommonJS"` in tsconfig (ESNext output breaks Node with `ERR_UNSUPPORTED_DIR_IMPORT`). `dist/` is gitignored and is the only thing published.

## Layout

- `src/index.ts` — the public API. Anything consumers use must be exported here (also re-exported via `src/domain/match/index.ts` for some engine functions).
- `src/lib/gameState.ts` — the engine (~3.6k lines): `GameState`/`PokemonInPlay` types, setup/mulligan, `executeAttack`, `endTurn`, retreat, evolution, prizes, pending-state resolvers.
- `src/domain/cards/` — card types, factories, guards. `catalog/` — `base-set.ts`, `jungle.ts`, `image-urls.ts` (pkmncards.com slugs). `decks/` — theme decks + resolution.
- `src/domain/trainers/index.ts` — `canPlayX` / `playX` per trainer. `powers/index.ts` — Pokémon Powers. `status/` — status helpers. `ai/` — `strategy.ts` (decide), `actions.ts` (estimates), `executor.ts` (apply).
- `src/domain/constants/enums.ts` — `as const` enums (`EnergyType`, `AttackEffectType`, `PokemonPowerType`, `GamePhase`, …). `PokemonStage` values are `"basic" | "stage-1" | "stage-2"`.
- `src/domain/match/types.ts` duplicates the `GameState` types from `gameState.ts` and has drifted; `gameState.ts` is the one the engine uses.

## Model and conventions

- State is relative: `player*` fields vs `opponent*` fields, plus `isPlayerTurn`. To act as the other side, callers swap perspective (AI executor and API both do this).
- Every action is `(state, ...args) => newState`. Never mutate the input — copy arrays before `splice`/`push`.
- Validate with `canX()` before `applyX()`. Note the engine entry points themselves do not re-check turn/phase/legality; callers must.
- Card behavior is data in the catalog (`attacks[].effects[]` with `AttackEffectType`); the interpreter is the effects loop in `executeAttack`.
- Coins are flipped by the caller (the server is authoritative in multiplayer) and passed in: `resolveConfusionFlip(state, heads)`, `executeAttack(state, i, { coinResults })` with `getAttackCoinFlipCount(state, i)` coins (Metronome: pass the copied `Attack`). All coin effects of one attack share the same coins; coin damage is part of the base damage (before weakness/resistance).
- Multi-step effects set a pending flag (`pendingForceSwitch`, `pendingSelfSwitch`, `pendingDeckSearch`, `pendingBenchDamageSelection`, `pendingTypeShift`, `pendingPeek`); `endTurn()` must refuse to advance while one is set, the UI shows a modal, a resolver clears it, and the AI executor must auto-resolve it.
- Log meaningful actions to `state.events` via `createGameEvent()`. Event text is Spanish; coin results use `[coin:heads]` / `[coin:tails]` tokens.
- Card IDs: `{set-slug}-{3-digit-number}-{slug-name}` (`base-set-004-charizard`, `jungle-007-nidoqueen`). Source data: api.pokemontcg.io (`base1`, `base2` = Jungle, `base3` = Fossil, `base5` = Team Rocket).
- Any lookup by card must search all sets (`[...baseSetCards, ...jungleCards]`), never Base Set only.

## TCG rules to respect (classic era)

- Damage order: base damage (incl. `Nx`/`N+` coin math and effect bonuses, next-turn bonus) → weakness ×2 → resistance −30 → PlusPower +10 each (only if the attack does damage) → Defender −20 → next-turn reductions → barriers/protection → floor at 0. PlusPower is applied AFTER weakness/resistance.
- Asleep, Confused, Paralyzed replace each other; Poisoned stacks with them. Moving to the bench (retreat, switch) removes ALL special conditions, including Poison.
- Only Asleep, Confused and Paralyzed stop Pokémon Powers; Poison does not.
- Confusion: tails on the attack flip → 20 damage to itself. Sleep: flip between turns, heads wakes. Paralysis: wears off after the owner's next turn. Poison: 10 between turns (20 for Toxic).
- Knockouts must be checked after every damage source, including bench damage and between-turns damage.
- Double Colorless Energy counts as 2 colorless. Leek Slap–style attacks ("can't use this attack again as long as this Pokémon stays in play", incl. benching) are tracked on the Pokémon in play.

## Known issues (2026-10 review — verify before assuming fixed)

Fixed in 0.5.0: bench KOs (`processBenchKnockouts`), endTurn mutation, Flail double count, Leer duration, Poison cleared on bench, Poison no longer blocks powers, Dream Eater / Karate Chop, confusion = 20 (`CONFUSION_SELF_DAMAGE`, `resolveConfusionFlip`), `buildDeckFromEntries` by set, double prize on attacker self-KO, AI re-attacking after a failed confused attack.

Still open:
- Coin-flip attack effects are engine-owned (`executeAttack`/`executeMetronome` with `{ coinResults }`, `getAttackCoinFlipCount`; the AI executor uses it), but the frontend (`useCoinFlipHandler.ts`) and the API (`socket/rooms.ts` `applyCoinFlipEffects`) still call the legacy positional form (which skips coin effects) and re-implement them with rule bugs — see `docs/coin-flip-effects.md`. They must migrate; then the positional form can be removed.
- Sand-attack/Smokescreen (`mustFlipToAttack`) is only enforced by the AI executor; Conversion 1/2 is resolved by consumers. Both are candidates for engine resolvers.
- `findCardByName` (lib/gameState.ts, domain/match/helpers.ts) searches Base Set only.
- RNG is `Math.random` (shuffle, checkups, IDs, AI flips) — not seedable. `state.events` grows unbounded.
- AI is greedy: never retreats, never uses powers, only plays Bill/Potion/PlusPower. `strategy.ts` has `console.log`s.
- Simultaneous prize-outs (sudden death) aren't modelled.
- Jungle cards: only 4/48 verified against the real card text.
