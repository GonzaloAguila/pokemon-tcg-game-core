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
npm version patch && npm publish   # GitHub Packages; prepublishOnly builds; needs auth with write:packages
```

`npm run lint` is declared but eslint isn't installed. There is no test runner yet.

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

- Coin-flip effects are skipped in `executeAttack` (`if (effect.coinFlip) continue;`) and re-implemented in the frontend (`useCoinFlipHandler.ts`), in `ai/executor.ts` and in the API (`socket/rooms.ts`). The copies diverge.
- Bench KOs are never processed (`TODO` in `executeAttack`, bench-damage path).
- `endTurn` mutates the caller's `opponentBench` via `splice` when promoting after a between-turns KO.
- `buildDeckFromEntries` ignores `entry.set` and only searches Base Set (Jungle theme-deck entries resolve to wrong cards); consumers have their own copies.
- Rule bugs: Flail double-counts damage; Leer/`CannotAttack` is cleared in the same `endTurn`; retreat/switch keeps Poison; Poison blocks powers; Dream Eater's `RequireStatus` and Karate Chop's `SelfDamageReduction` aren't enforced; confusion self-damage is 30 (frontend + AI).
- `endTurn` blocks on only 4 of the 6 pending flags (`pendingTypeShift`, `pendingPeek` not checked).
- RNG is `Math.random` everywhere (shuffle, checkups, IDs, AI flips) — not seedable, so no deterministic tests or replays. `state.events` grows unbounded.
- AI is greedy: never retreats, never uses powers, only plays Bill/Potion/PlusPower (inline copies). `strategy.ts` has `console.log`s.
- Jungle cards: only 4/48 verified against the real card text.