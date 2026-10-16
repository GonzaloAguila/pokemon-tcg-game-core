# Gym Heroes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Gym Heroes set (128 unique cards) to Nostalgic TCG, fully playable in single-player and multiplayer, with owner's Pokémon, Stadiums, the new Trainers (including a real Rock-Paper-Scissors for Misty's Duel) and AI support.

**Architecture:** Engine first in `pokemon-tcg-game-core` (catalog through the set registry, new rules as engine-owned hooks and registry entries, a test per card with an effect, the bot simulator clean), then the API (`pokemon-tcg-api`) and the frontend (`pokemon-tcg`) consume it generically. Every behavior is a function of `GameState` in the engine; consumers only render steps and send answers.

**Tech Stack:** TypeScript, vitest (all three repos), Prisma/Express/Socket.io (API), Next.js 16 + React 19 (frontend).

**Spec:** `docs/superpowers/specs/2026-10-16-gym-heroes-design.md` (this repo). Read it and `CLAUDE.md` of each repo before starting.

## Global Constraints

- Branch `feat/gym-heroes` in every repo. Work in the `-news` worktrees for the consumers: API `D:/Proyectos/pokemon-tcg-api-news`, frontend `D:/Proyectos/pokemon-tcg-news`; game-core `D:/Proyectos/pokemon-tcg-game-core`. Never touch `D:/Proyectos/pokemon-tcg` or `D:/Proyectos/pokemon-tcg-api`.
- No publish, no deploy, no merge to main/master, no prod DB. Consumers use a packed engine: `npm pack` in game-core, then `npm install --no-save <path-to.tgz>` in the consumer.
- Card IDs `{set-slug}-{3-digit-number}-{slug-name}` via `makeCardId(CardSet.GymHeroes, n, name)`; set slug `gym-heroes`, code `G1`, release date `2000-08-14`, printed total 132.
- Text: Pokémon names in English ("Brock's Onix"), attack/power names and all rule text in Spanish, tú voice, same terms as Base Set/Jungle (Energía, Banca, Pokémon Activo, Premios, Estadio).
- Event log lines perspective-free (see game-core CLAUDE.md "Event perspective"); `test/event-perspective.test.ts` must stay green.
- Never mutate input state; actions validate with `canX` and throw `IllegalActionError`.
- Coins are always passed in by the caller (server in MP); the Rock-Paper-Scissors picks too.
- UI: Spanish, Nunito only, no colored border strips, pixel sprites as is; every new modal takes `isOpen`/`onClose`.
- Commit after each task with the attribution lines:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_011zKUoTtqfCLqmwCGy7qe2Y`.

## Review Focus

1. A Stadium played while the other player's same-named Stadium is in play → refused with a Spanish reason (Task 4 test).
2. Narrow Gym played when both players have 5 benched → both must discard down to 4 before anything else, the opponent's choice answered off-turn (Task 5 test).
3. Misty's Duel tie → the round replays; in MP a player never sees the rival's pick before both picked (Task 14 + Task 17 tests).
4. "Brock's Geodude" can't become "Graveler" and "Geodude" can't become "Brock's Graveler" (Task 2 test).
5. A Stadium in play when the side swap happens (AI turn, MP perspective) keeps who played it (Task 4 test on `swapSides`).

---

## Stage 1 — game-core (`D:/Proyectos/pokemon-tcg-game-core`, branch `feat/gym-heroes`)

### Task 1: Set registry entry and catalog skeleton checked against the source data

**Files:**
- Modify: `src/domain/constants/enums.ts` (`CardSet`)
- Modify: `src/domain/catalog/sets.ts` (`CardSetId`, `CARD_SETS`)
- Modify: `src/domain/catalog/image-urls.ts` (add `getGymHeroesImageUrl`)
- Create: `src/domain/catalog/gym-heroes.ts`
- Modify: `test/helpers/state.ts` (`SetName` accepts `"gym-heroes"`)
- Create: `test/gym-heroes-catalog.test.ts`

**Interfaces:**
- Produces: `CardSet.GymHeroes = "Gym Heroes"`, `gymHeroesCards: Card[]`, `getGymHeroesImageUrl(card)`, registry entry `{ id: "gym-heroes", code: "G1" }`.

- [ ] **Step 1: Write the failing cross-check test.** It reads `data/pokemontcg/gym1.json` and checks every catalog card against it, so later tasks can't drift from the printed cards.

```ts
// test/gym-heroes-catalog.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_SETS, getSetById } from "@/domain/catalog";

type Src = { number: string; name: string; supertype: string; subtypes?: string[]; hp?: string; types?: string[];
  evolvesFrom?: string; retreatCost?: string[]; weaknesses?: { type: string }[]; resistances?: { type: string }[];
  attacks?: { name: string; cost: string[]; damage: string }[] };
const src: Src[] = JSON.parse(readFileSync("data/pokemontcg/gym1.json", "utf8")).data;
// Holo/non-holo reprints kept once (lower number), and the basic Energy that are Base Set cards
const EXCLUDED = new Set(["98", "100", "101", "102", "127", "128", "129", "130", "131", "132"]);

describe("Gym Heroes catalog", () => {
  const set = getSetById("gym-heroes")!;
  it("is registered", () => {
    expect(set.code).toBe("G1");
    expect(set.totalCards).toBe(132);
    expect(CARD_SETS.map((s) => s.id)).toContain("gym-heroes");
  });
  it("has every unique printed card, in number order", () => {
    const expected = src.filter((c) => !EXCLUDED.has(c.number)).map((c) => Number(c.number));
    expect(set.cards.map((c) => c.number)).toEqual(expected);
  });
  it.each(src.filter((c) => !EXCLUDED.has(c.number) && c.supertype === "Pokémon"))("#$number $name matches the printed card", (s) => {
    const card = set.cards.find((c) => c.number === Number(s.number))!;
    expect(card.kind).toBe("pokemon");
    if (card.kind !== "pokemon") return;
    expect(card.name).toBe(s.name);
    expect(card.hp).toBe(Number(s.hp));
    expect(card.types.map(String)).toEqual((s.types ?? []).map((t) => t.toLowerCase()));
    expect(card.evolvesFrom ?? null).toBe(s.evolvesFrom ?? null);
    expect(card.retreatCost).toBe(s.retreatCost?.length ?? 0);
    expect((card.weaknesses ?? []).map(String)).toEqual((s.weaknesses ?? []).map((w) => w.type.toLowerCase()));
    expect((card.resistances ?? []).map(String)).toEqual((s.resistances ?? []).map((r) => r.type.toLowerCase()));
    expect(card.attacks.map((a) => [a.cost.map(String), a.damage ?? 0])).toEqual(
      (s.attacks ?? []).map((a) => [a.cost.map((t) => t.toLowerCase()), Number.parseInt(a.damage || "0", 10) || 0]),
    );
  });
});
```

Check `EXCLUDED` against `gym1.json` before relying on it: confirm which numbers are the non-holo reprints of #15–18 and which are the 6 basic Energy; fix the list if the numbers differ, and say so in the commit message.

- [ ] **Step 2: Run it — it fails** (`getSetById("gym-heroes")` undefined). `npx vitest run test/gym-heroes-catalog.test.ts`
- [ ] **Step 3: Add the enum value, the image URL builder (pkmncards slug `{slug}-gym-heroes-g1-{n}.jpg`, apostrophes and dots dropped, spaces → `-`, lower case), the registry entry, and `gym-heroes.ts` exporting `gymHeroesCards: Card[] = []`.**
- [ ] **Step 4: Run it — "is registered" passes.** Wrap the two data tests in `describe.skipIf(set.cards.length === 0)` so the branch stays green; Task 7 removes the skip once the catalog has its cards.
- [ ] **Step 5: Commit** `feat: register Gym Heroes (set G1) with a catalog checked against the source data`.

### Task 2: Owner's Pokémon

**Files:**
- Create: `src/domain/cards/owner.ts`; export from `src/domain/cards/index.ts` and `src/index.ts`
- Test: `test/gym-heroes-owner.test.ts`

**Interfaces:**
- Produces: `type PokemonOwner = "Brock" | "Misty" | "Erika" | "Lt. Surge" | "Sabrina" | "Blaine" | "Rocket"`; `ownerOf(card: { name: string }): PokemonOwner | null`; `hasOwner(card, owner): boolean`.

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from "vitest";
import { ownerOf, hasOwner } from "@/domain/cards";
import { canEvolvePokemon, findValidEvolutionTargets } from "@/index";
import { inPlay, makeState, gameCard } from "./helpers/state";

describe("owner's Pokémon", () => {
  it("reads the owner from the name", () => {
    expect(ownerOf({ name: "Brock's Onix" })).toBe("Brock");
    expect(ownerOf({ name: "Lt. Surge's Pikachu" })).toBe("Lt. Surge");
    expect(ownerOf({ name: "Rocket's Snorlax" })).toBe("Rocket");
    expect(ownerOf({ name: "Onix" })).toBeNull();
    expect(ownerOf({ name: "Farfetch'd" })).toBeNull();
    expect(hasOwner({ name: "Misty's Seel" }, "Misty")).toBe(true);
  });
  it("evolves only within the same owner, both ways", () => {
    const s = makeState({ player: { active: inPlay("Brock's Geodude", { set: "gym-heroes", playedOnTurn: 1 }), bench: [inPlay("Geodude", { set: "fossil", playedOnTurn: 1 })], hand: [gameCard("Brock's Graveler", "gym-heroes"), gameCard("Graveler", "fossil")] } });
    const brocks = s.playerHand[0], plain = s.playerHand[1];
    expect(findValidEvolutionTargets(brocks, s.playerActivePokemon, s.playerBench, s.turnNumber, "player", true).map((p) => p.pokemon.name)).toEqual(["Brock's Geodude"]);
    expect(findValidEvolutionTargets(plain, s.playerActivePokemon, s.playerBench, s.turnNumber, "player", true).map((p) => p.pokemon.name)).toEqual(["Geodude"]);
  });
});
```

Use the real exported names for `findValidEvolutionTargets` / helpers (grep `src/index.ts`); adjust the call to its signature. The evolution test needs Task 7's Pokémon in the catalog: write it now with `it.skipIf(!findCardByName("Brock's Graveler"))` and unskip in Task 7.

- [ ] **Step 2: Run — `ownerOf` undefined.**
- [ ] **Step 3: Implement**

```ts
// src/domain/cards/owner.ts
/** Gym Heroes / Gym Challenge owners: the name prefix of their Pokémon ("Brock's Onix"). */
export const POKEMON_OWNERS = ["Brock", "Misty", "Erika", "Lt. Surge", "Sabrina", "Blaine", "Rocket"] as const;
export type PokemonOwner = (typeof POKEMON_OWNERS)[number];

/** The owner in a card's name, or null ("Brock's Onix" → "Brock"; "Onix" → null). */
export function ownerOf(card: { name: string }): PokemonOwner | null {
  return POKEMON_OWNERS.find((owner) => card.name.startsWith(`${owner}'s `)) ?? null;
}

/** "a Pokémon with <owner> in its name" */
export function hasOwner(card: { name: string }, owner: PokemonOwner): boolean {
  return ownerOf(card) === owner;
}
```

- [ ] **Step 4: Run — passes (evolution part skipped until Task 7).**
- [ ] **Step 5: Commit** `feat: owner's Pokémon helpers`.

### Task 3: Bench size as a rule (`maxBenchSize`)

**Files:**
- Create: `src/domain/board/bench.ts` (export from `src/domain/board/index.ts` and `src/index.ts`)
- Modify: every hard-coded bench limit: `src/domain/trainers/index.ts:1043,1112`, `src/domain/ai/cardEffects.ts:59,118,146`, and any `>= 5` / `< 5` on a bench found by `grep -rn "Bench.length\s*[<>=]=*\s*5\|MAX_BENCH" src`
- Test: `test/bench-size.test.ts`

**Interfaces:**
- Produces: `maxBenchSize(state: GameState, side: "player" | "opponent"): number` (5, or 4 with Narrow Gym in play — Task 5 adds the Stadium branch), `isBenchFull(state, side): boolean`.

- [ ] **Step 1: Failing test:** `isBenchFull` true at 5, false at 4; `playBasicPokemon` to a full bench throws with the existing Spanish reason.
- [ ] **Step 2: Run — fails (not exported).**
- [ ] **Step 3: Implement** `maxBenchSize` returning 5 (Stadium branch added in Task 5) and replace every hard-coded 5 with it.
- [ ] **Step 4: Run the whole suite** `npm test` — all green (pure refactor + new test).
- [ ] **Step 5: Commit** `refactor: bench size read through maxBenchSize`.

### Task 4: Stadiums in play

**Files:**
- Modify: `src/lib/gameState.ts` (`GameState.stadium`)
- Modify: `src/domain/match/types.ts` if it duplicates state fields (keep in sync)
- Modify: `src/domain/board/swap.ts` (`swapSides` flips `stadium.playedBy`)
- Create: `src/domain/effects/stadiums.ts` (playing a Stadium; registered for every catalog card with `trainerType === TrainerType.Stadium` in `TRAINER_EFFECTS`)
- Modify: `src/domain/effects/index.ts` / `trainers.ts` registration and the coverage test's expectations
- Modify: `src/domain/cards/in-play.ts` / discard helpers so a replaced Stadium goes to its player's discard pile
- Test: `test/stadium.test.ts`

**Interfaces:**
- Produces:
```ts
export type StadiumInPlay = { card: GameCard; playedBy: "player" | "opponent" };
// GameState: stadium?: StadiumInPlay | null;
export function getStadium(state: GameState): StadiumInPlay | null;
export function stadiumNamed(state: GameState, name: string): boolean; // the Stadium in play has this name
```

- [ ] **Step 1: Failing tests** (use a test-only Stadium until Task 9 adds the real ones: build a `createTrainerCard({ trainerType: TrainerType.Stadium, name: "Pewter City Gym", ... })` in the test, and register it the same way the catalog cards will be):
  - playing a Stadium puts it in `state.stadium` with `playedBy: "player"` and removes it from the hand;
  - playing a different Stadium discards the old one to the discard pile of whoever played it (opponent's Stadium → `opponentDiscard`);
  - playing a Stadium with the same name as the one in play → `canPlayTrainerCard` returns `"Ya hay un Estadio con ese nombre en juego"` and `playTrainerCard` throws;
  - `swapSides(state).stadium.playedBy === "opponent"` and swapping twice restores it (Review Focus 5);
  - the event log line is perspective-free: `"Jugaste <name>: el Estadio queda en juego"`.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement**

```ts
// src/domain/effects/stadiums.ts
import { createGameEvent, type GameState } from "@/lib/gameState";
import type { CardEffectDef } from "./types";

const owner = (side: "player" | "opponent") => (side === "player" ? "playerDiscard" : "opponentDiscard") as const;

/** Any Stadium: it stays in play; a new one replaces it (to its player's discard pile); never two of the same name. */
export const playStadium: CardEffectDef = {
  canUse(state, cardId) {
    const card = state.playerHand.find((c) => c.id === cardId);
    if (!card) return "Esa carta no está en tu mano";
    if (state.stadium && state.stadium.card.name === card.name) return "Ya hay un Estadio con ese nombre en juego";
    return null;
  },
  getSteps: () => null,
  resolve(state, cardId) {
    const card = state.playerHand.find((c) => c.id === cardId)!;
    const previous = state.stadium ?? null;
    const next: GameState = {
      ...state,
      playerHand: state.playerHand.filter((c) => c.id !== cardId),
      stadium: { card, playedBy: "player" },
      events: [...state.events, createGameEvent(`Jugaste ${card.name}: el Estadio queda en juego`, "action")],
    };
    if (!previous) return next;
    const pile = owner(previous.playedBy);
    return {
      ...next,
      [pile]: [...next[pile], previous.card],
      events: [...next.events, createGameEvent(`${previous.card.name} se descarta`, "info")],
    };
  },
};
```

Register it for every Stadium: in `TRAINER_EFFECTS` construction, map `ALL_CARDS.filter(isStadium)` names to `playStadium` (Task 5/6 wrap it for Stadiums with an on-play effect). Respect `getTrainerBlocker` (Headache) like any Trainer.

- [ ] **Step 4: Run** `npx vitest run test/stadium.test.ts` and `npm test` — green.
- [ ] **Step 5: Commit** `feat: Stadium cards stay in play, replace each other, never two of the same name`.

### Task 5: Stadium rules (modifiers) and Narrow Gym's discard-down

**Files:**
- Create: `src/domain/stadiums/rules.ts` (export from `src/index.ts`)
- Modify: `src/lib/gameState.ts` retreat (`getRetreatCost` ~line 677 and the duplicate check at ~658), Resistance (~line 2964), `src/domain/board/bench.ts` (`maxBenchSize`), Trainer cost for Energy Removal / Super Energy Removal (`src/domain/effects/trainers.ts` entries)
- Modify: `src/domain/effects/stadiums.ts` (Narrow Gym's on-play)
- Modify: `src/domain/ai/pending.ts` and `src/domain/simulation/*` to answer the new pending discard
- Test: `test/stadium-rules.test.ts`

**Interfaces:**
- Produces:
```ts
export function stadiumRetreatModifier(state: GameState, pokemon: PokemonInPlay): number; // +1 Rocket's Training Gym, −1 Cerulean City Gym for Misty's
export function stadiumIgnoresResistance(state: GameState, attacker: PokemonInPlay): boolean; // Pewter City Gym, Brock's
export function stadiumExtraTrainerDiscards(state: GameState, trainerName: string): number; // 2 for (Super) Energy Removal with No Removal Gym
// GameState: pendingBenchTrim?: { side: "player" | "opponent"; keep: number }[]  — Narrow Gym, answered with resolveBenchTrim
export function resolveBenchTrim(state: GameState, discardIds: string[]): GameState; // acting side = the first entry's side, on that side's view
```
Read the exact Stadium texts in `gym1.json` (#103, #104, #107, #108, #115, #120, #124) before coding each rule; the spec lists them.

- [ ] **Step 1: Failing tests** for each rule with the Stadium in play (build Stadium cards from the catalog once Task 9 lands; until then construct them in the test like Task 4):
  - The Rocket's Training Gym: retreat of a cost-1 Pokémon needs 2 Energy, for both sides.
  - Cerulean City Gym: Misty's Psyduck (cost 1) retreats for free; a plain Psyduck still pays 1.
  - Pewter City Gym: Brock's Onix attacking a Pokémon with Fighting Resistance does full damage; a plain Onix gets −30.
  - Narrow Gym: `maxBenchSize` is 4 for both; with 5 benched on both sides, playing it sets `pendingBenchTrim` for both; `endTurn` and every other action refuse until both resolve; the player picks 1 Pokémon to discard (with its attached cards via `cardsLeavingPlay`), then the opponent (answered on the opponent's view, the AI answers in SP) (Review Focus 2).
  - No Removal Gym: `canPlayTrainerCard(Energy Removal)` with fewer than 2 other cards in hand → `"Necesitas descartar 2 cartas de tu mano para jugar esta carta"`; with enough, `getTrainerSteps` asks for the 2 discards first.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** the four functions in `rules.ts`, called from the existing retreat/Resistance/bench/Trainer code (one call each, no Stadium names outside `rules.ts` and `effects/stadiums.ts`); Narrow Gym's `resolve` sets `pendingBenchTrim` for each side above 4; `resolveBenchTrim` removes the chosen Pokémon, shifts the queue, and runs `checkKnockouts` afterwards (an Active can't be chosen). AI answers: discard the benched Pokémon with the lowest `evaluate.ts` value.
- [ ] **Step 4: Run** the new tests, `npm test`, and `npm run simulate -- --games 300 --seed 1` (0 failures).
- [ ] **Step 5: Commit** `feat: Stadium rules (retreat, Resistance, bench size, Energy Removal cost)`.

### Task 6: Activated Stadiums (Celadon City Gym, Vermilion City Gym)

**Files:**
- Modify: `src/domain/effects/stadiums.ts`, `src/domain/effects/index.ts` (new `STADIUM_ACTIONS` registry: `CardEffectDef` keyed by Stadium name, `sourceId` = the Stadium card id), `src/index.ts`
- Modify: `src/lib/gameState.ts` attack flow for Vermilion's optional coin (an extra coin at the end of the attack's coin plan when the attacker has Lt. Surge in its name and the player opts in)
- Test: `test/stadium-actions.test.ts`

**Interfaces:**
- Produces: `getStadiumActions(state): { name: string; available: string | null }[]`, `canUseStadiumAction(state)`, `getStadiumActionSteps(state, selections)`, `useStadiumAction(state, selections, { coinResults })` — same contract as Trainers/powers so consumers reuse `useCardEffectFlow`.

- [ ] **Step 1: Failing tests** from the exact card texts (#107, #120): Celadon City Gym — discard an Energy from your Pokémon with Erika in its name to remove damage as printed; usable by whoever's turn it is, as often as printed. Vermilion City Gym — when attacking with a Lt. Surge's Pokémon, the coin plan has one optional coin; heads applies the printed bonus, tails nothing; without the opt-in no coin.
- [ ] **Step 2–4: Implement, run, `npm test` green.**
- [ ] **Step 5: Commit** `feat: Stadiums with actions (Celadon City Gym, Vermilion City Gym)`.

### Task 7: Pokémon catalog (#1–96 minus Trainers), attack effects

**Files:**
- Modify: `src/domain/catalog/gym-heroes.ts`
- Modify: `src/lib/gameState.ts` / `src/domain/constants/enums.ts` only for attack effect kinds the existing vocabulary can't express
- Test: `test/gym-heroes-catalog.test.ts` (unskip), `test/gym-heroes-attacks.test.ts`

- [ ] **Step 1:** List every Gym Heroes attack text (`node -e` over `gym1.json`) and map each to an existing `AttackEffectType` (grep the enum and Fossil/Team Rocket catalogs for the same wording). Write the list as a table at the top of `test/gym-heroes-attacks.test.ts` as a comment: card, attack, effect kind (existing or NEW).
- [ ] **Step 2:** For each NEW kind: a failing scenario test through `executeAttack` with explicit `coinResults`, then the effect in the interpreter, then green. One commit per new kind.
- [ ] **Step 3:** Write all Pokémon cards in `gym-heroes.ts` (same shape as `fossil.ts`: `createPokemonCard`, Spanish attack names/texts, `effects` data). Holo rares `CardRarity.RareHolo`, etc. from the source `rarity`.
- [ ] **Step 4:** Unskip the catalog data tests and the owner evolution test (Task 2); add one scenario test per attack with text (damage + effect) in `test/gym-heroes-attacks.test.ts`. Run — green.
- [ ] **Step 5:** `npm run check-images -- --set gym-heroes` — every Pokémon image 200 (misses → fix the slug or log in `docs/card-doubts.md`).
- [ ] **Step 6: Commit** `feat: Gym Heroes Pokémon`.

### Task 8: Pokémon Powers (11)

**Files:**
- Modify: `src/domain/catalog/gym-heroes.ts` (power data), `src/domain/powers/index.ts`, `src/domain/effects/powers.ts` (activated: Energy Charge, Fragrance Trap, Natural Healing), engine trigger points in `src/lib/gameState.ts` (on damaged while Active: Pollen Defense, Flee, Restless Sleep; on Knock Out: Rebirth; bench damage redirect: Bench Guard; damage reduction: Shell Armor, Strange Barrier; Energy typing: Photosynthesis via `energyProvidesType`)
- Test: `test/gym-heroes-powers.test.ts`

- [ ] **Step 1:** One failing test per power from its exact text in `gym1.json` (#2, #5, #8, #10, #12, #26, #29, #33, #42, #47, #65), each also asserting the power does nothing when `isPowerActive` is false (Asleep/Confused/Paralyzed, Toxic Gas) where the text says so.
- [ ] **Step 2–4:** Implement each through `isPowerActive`; trigger points get a single hook each (no card names in the attack loop: dispatch on `PokemonPowerType`). Optional powers ("you may") become a choice for the power's owner: `pendingPowerChoice` for the acting side, or a `pendingAttackChoice` step with `chooser` for the defending side (Flee, Bench Guard). Run, green; `npm run simulate -- --games 300 --sets gym-heroes,base-set` clean.
- [ ] **Step 5: Commit** `feat: Gym Heroes Pokémon Powers`.

### Task 9: Trainer catalog and the simple Trainers

**Files:**
- Modify: `src/domain/catalog/gym-heroes.ts` (all Trainers and Stadiums as `createTrainerCard`; Stadiums `TrainerType.Stadium`; Tickling Machine keeps `subtypes` note in its text)
- Modify: `src/domain/effects/trainers.ts` (+ table at the top), `src/domain/trainers/index.ts` if helpers are needed
- Test: `test/gym-heroes-trainers.test.ts`

Simple Trainers (existing step/coin machinery): Brock, Lt. Surge, Misty, The Rocket's Trap, Blaine's Last Resort, Brock's Training Method, Erika's Maids, Erika's Perfume, Good Manners, Minion of Team Rocket, Misty's Wrath, Secret Mission, Blaine's Gamble, Energy Flow, Sabrina's Gaze, Trash Exchange. (Erika, Lt. Surge's Treaty and Blaine's Quiz #1 are Task 13; Charity, Sabrina's ESP Task 10; Recall Task 11; Tickling Machine Task 12; Misty's Duel Task 14.)

- [ ] **Step 1:** One failing scenario test per Trainer through `playTrainerCard` with the exact printed behavior (read the full `rules` text in `gym1.json`; several are truncated in the spec). Owner filters use `hasOwner`. Misty: discard 2 other cards, then this turn's attack by a Misty's Pokémon gets the printed bonus — store it as a `GameModifier` with a new `source: "misty"` and `expiresAfterTurn: state.turnNumber`.
- [ ] **Step 2–4:** Implement each `CardEffectDef`; coverage test green (no Gym Heroes Trainer missing except the ones later tasks add, listed temporarily in `UNSUPPORTED_TRAINERS` and removed by those tasks).
- [ ] **Step 5: Commit** `feat: Gym Heroes Trainers (simple)`.

### Task 10: Attached Trainers (Charity, Sabrina's ESP)

**Files:**
- Create: `src/domain/trainers/attached.ts` (attach / expire / query helpers over `PokemonInPlay.attachedTrainers`)
- Modify: `src/domain/effects/trainers.ts`, `src/lib/gameState.ts` (end of turn: return Charity to hand unless Knocked Out, discard Sabrina's ESP; attack: Charity's optional damage reduction as an attacker choice; ESP: one re-flip of the attack's coins via a `pendingAttackChoice` step "¿Volver a lanzar las monedas?" before effects apply)
- Test: `test/gym-heroes-attached-trainers.test.ts`

**Interfaces:**
- Produces: `attachTrainer(pokemon, card, expires: "endOfTurn")`, `attachedTrainerNamed(pokemon, name): GameCard | undefined`; cards leaving play with the Pokémon go through `cardsLeavingPlay`.

- [ ] **Step 1:** Failing tests: Charity returns to the hand at the end of the turn; Knocked Out → discarded with the Pokémon; reducing its damage by the chosen amount (printed multiples). ESP only on a Sabrina's Pokémon; re-flip replaces all coins of that attack once; discarded at end of turn; coins are passed in (the re-flip coins too).
- [ ] **Step 2–4:** Implement, green, simulate clean.
- [ ] **Step 5: Commit** `feat: attached Trainers (Charity, Sabrina's ESP)`.

### Task 11: Recall

**Files:**
- Modify: `src/domain/effects/trainers.ts`, `src/lib/gameState.ts` (`getAvailableAttacks(state, pokemon)` includes `previousEvolutions` attacks while a `recallActiveOnTurn === state.turnNumber` flag is set; `executeAttack` accepts an attack index into that list), `src/index.ts`
- Test: `test/gym-heroes-recall.test.ts`

**Interfaces:**
- Produces: `getAvailableAttacks(state: GameState, pokemon: PokemonInPlay): { attack: Attack; fromCard: string; index: number }[]` — consumers list attacks with this instead of `card.attacks`.

- [ ] **Step 1:** Failing tests: after Recall, Brock's Graveler can use Brock's Geodude's attack paying its cost; without Recall it can't; the flag clears at end of turn; Ditto/Transform keeps working (`getEffectivePokemonCard`).
- [ ] **Step 2–5:** Implement, green, commit `feat: Recall`.

### Task 12: Tickling Machine

**Files:**
- Modify: `src/lib/gameState.ts` (`GameState.setAsideHand?: { side: "player" | "opponent"; cards: GameCard[]; returnsAfterTurn: number }`; `swapSides`; `endTurn` returns the cards), `src/domain/effects/trainers.ts`
- Test: `test/gym-heroes-tickling-machine.test.ts`

- [ ] **Step 1:** Failing tests (exact text #119): heads → the opponent's hand is set aside, their hand is empty during their next turn, the cards come back at the end of that turn; tails → the printed tails effect; MP masking: the set-aside cards are hidden from both (`{ id, hidden: true }` in the API's masking — note for Task 19).
- [ ] **Step 2–5:** Implement, green, commit `feat: Tickling Machine`.

### Task 13: Trainers the opponent answers (Erika, Lt. Surge's Treaty, Blaine's Quiz #1)

**Files:**
- Modify: `src/domain/effects/trainers.ts` (steps with `chooser: "opponent"` + `answererTitle`/`answererDescription`), `src/domain/ai/cardEffects.ts` (`answerStepForAI` answers)
- Modify: `src/domain/catalog/gym-heroes.ts` (Pokémon lengths for Blaine's Quiz: `heightText` field from the source `flavorText`/`height` if present; otherwise log the missing ones in `docs/card-doubts.md` and offer the quiz only with Pokémon that have it)
- Test: `test/gym-heroes-opponent-trainers.test.ts`

- [ ] **Step 1:** Failing tests: Erika — the player draws up to 3 (a step "¿Cuántas robas?" 0–3), then the opponent's step 0–3 (`chooser: "opponent"`); Lt. Surge's Treaty — the opponent picks one of the two printed options; Blaine's Quiz #1 — the player picks the Pokémon, the opponent picks a length among 4 options (the right one + 3 distinct wrong ones from other Pokémon), the printed outcome for right/wrong. The AI answers each.
- [ ] **Step 2–5:** Implement, green, commit `feat: Trainers the opponent answers`.

### Task 14: Misty's Duel (Rock-Paper-Scissors)

**Files:**
- Create: `src/domain/duel/rps.ts` (export from `src/index.ts`)
- Modify: `src/lib/gameState.ts` (`GameState.pendingDuel`; `endTurn` and actions blocked while set), `src/domain/board/swap.ts` (swap the picks), `src/domain/effects/trainers.ts` (Misty's Duel starts it), `src/domain/ai/*` (AI picks with the injected RNG), `src/domain/simulation/*`
- Test: `test/gym-heroes-mistys-duel.test.ts`

**Interfaces:**
- Produces:
```ts
export type RpsChoice = "rock" | "paper" | "scissors";
export type PendingDuel = { round: number; playerPick: RpsChoice | null; opponentPick: RpsChoice | null; lastRound?: { playerPick: RpsChoice; opponentPick: RpsChoice } };
export function rpsWinner(a: RpsChoice, b: RpsChoice): "a" | "b" | "tie";
export function submitDuelPick(state: GameState, side: "player" | "opponent", pick: RpsChoice): GameState; // stores; when both are in, resolves the round
export function maskDuelFor(state: GameState, side: "player" | "opponent"): GameState; // hides the other side's pick until both picked (MP/AI views)
```

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { rpsWinner, submitDuelPick, maskDuelFor } from "@/index";
// + build a state where the player plays Misty's Duel (makeState + gameCard("Misty's Duel","gym-heroes") in hand, playTrainerCard)

describe("Misty's Duel", () => {
  it("rock beats scissors, scissors paper, paper rock", () => {
    expect(rpsWinner("rock", "scissors")).toBe("a");
    expect(rpsWinner("paper", "scissors")).toBe("b");
    expect(rpsWinner("paper", "paper")).toBe("tie");
  });
  it("waits for both picks, hides the rival's pick, replays a tie, and the winner redraws 5", () => {
    let s = playDuel(); // helper: plays the Trainer
    expect(s.pendingDuel).toMatchObject({ round: 1, playerPick: null, opponentPick: null });
    s = submitDuelPick(s, "opponent", "rock");
    expect(maskDuelFor(s, "player").pendingDuel!.opponentPick).toBeNull(); // hidden until both picked
    s = submitDuelPick(s, "player", "rock"); // tie
    expect(s.pendingDuel).toMatchObject({ round: 2, playerPick: null, opponentPick: null, lastRound: { playerPick: "rock", opponentPick: "rock" } });
    s = submitDuelPick(s, "player", "paper");
    s = submitDuelPick(s, "opponent", "rock"); // player wins
    expect(s.pendingDuel).toBeUndefined();
    expect(s.playerHand).toHaveLength(5);
  });
  it("blocks endTurn while the duel is pending", () => { /* expect endTurn to throw / refuse */ });
});
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** `rps.ts`; the winner shuffles hand into deck and draws 5 (fewer if the deck runs short: printed behavior + the engine's usual deck-out rule); event lines perspective-free (`"Misty's Duel: piedra contra tijera"`, `"Gana quien eligió piedra y roba una mano nueva de 5 cartas"`).
- [ ] **Step 4: Run, `npm test`, simulate clean** (the simulator picks at random with its seeded RNG).
- [ ] **Step 5: Commit** `feat: Misty's Duel is a real Rock-Paper-Scissors`.

### Task 15: AI, simulator, doubts, version

**Files:**
- Modify: `src/domain/ai/cardEffects.ts`, `src/domain/ai/smart.ts` (value for playing a Stadium: positive when it helps own Pokémon/hurts the opponent's per its rule, never replace own Stadium with a worse one; values for the new Trainers), `src/domain/decks/*` (one Gym Heroes theme deck per leader in the set, used by `--decks theme`)
- Modify: `docs/card-doubts.md` (Gym Heroes section: every judgment call made in Tasks 7–14), `CLAUDE.md` (Gym Heroes notes: owners, Stadiums, duel, Recall, set-aside hand), `package.json` version → next minor (do NOT publish)
- Test: existing AI tests + `test/ai-gym-heroes.test.ts` (AI plays a helpful Stadium, answers each opponent step, picks in a duel)

- [ ] **Step 1–3:** Failing AI tests, implement, green.
- [ ] **Step 4:** `npm run simulate -- --games 2000 --seed 7 --sets base-set,jungle,fossil,team-rocket,gym-heroes --policy all --decks random-mix --stats --coverage gym-heroes` → 0 failures, every Gym Heroes card played at least once (explore policy if needed); `npm run check-images -- --set gym-heroes` all 200; `npm run build`; `npm pack` → keep the `.tgz` path for Stage 2.
- [ ] **Step 5: Commit** `feat: AI and theme decks for Gym Heroes; doubts logged`.

## Stage 2a — API (`D:/Proyectos/pokemon-tcg-api-news`, branch `feat/gym-heroes`)

### Task 16: Gym Heroes in packs, economy and catalog

**Files:** `src/modules/boosters/*` (booster for `gym-heroes`, same slot layout as Fossil/Team Rocket with Gym Heroes' rarity counts), `src/modules/economy/config.ts` (rarity weights / prices like the other sets), any set list not using the engine registry (`grep -rn "team-rocket\|teamRocket" src` and generalize), tests in `test/`.

- [ ] **Step 1:** Install the packed engine (`npm install --no-save <tgz>`), failing tests: opening a Gym Heroes booster yields 11 cards of that set with the slot rarities; the economy config lists the set; the catalog endpoint returns its cards.
- [ ] **Step 2–4:** Implement, `npx tsc --noEmit`, `npx vitest run` green.
- [ ] **Step 5: Commit** `feat: Gym Heroes boosters and catalog`.

### Task 17: Multiplayer: Stadium, bench trim, attached Trainers, Recall, set-aside hand, duel

**Files:** `src/socket/schemas.ts` (actions `stadiumAction {selections}`, `benchTrim {discardIds}`, `duelPick {choice: "rock"|"paper"|"scissors"}`; `attack` accepts the Recall attack index), `src/socket/handlers.ts` / `rooms.ts` (dispatch to the engine on the acting side's view; coins flipped by the server; `pendingBenchTrim` and `pendingDuel` answered off-turn by the right player), state masking (`setAsideHand` cards hidden from both; `maskDuelFor` per recipient), tests with the socket helpers.

- [ ] **Step 1:** Failing socket tests: a Stadium played by A appears in B's state with `playedBy` relative to B; `duelPick` from B before A doesn't reveal B's pick to A; after both, both get both picks and the winner's new hand count; `benchTrim` from the off-turn player works; a forged `duelPick` from a spectator is rejected.
- [ ] **Step 2–4:** Implement, tests green.
- [ ] **Step 5: Commit** `feat: Gym Heroes in multiplayer`.

## Stage 2b — frontend (`D:/Proyectos/pokemon-tcg-news`, branch `feat/gym-heroes`)

### Task 18: Set presentation

**Files:** `src/domain/sets/set-ui.ts` (`SET_UI` entry: name "Gym Heroes", logo, booster id/art, catalog route), `public/sets/gym-heroes/*` (logo, booster art: ask the owner for official art or generate like Fossil/Team Rocket did — log the choice), catalog route `app/<set catalog path>` as the other sets, deck builder works with owner names (4 copies by full name).

- [ ] **Step 1:** Install the packed engine; failing test: `SET_UI_LIST` includes Gym Heroes and every `CARD_SETS` id has a `SET_UI` entry (if such a test doesn't exist, add it).
- [ ] **Step 2–4:** Implement; `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- [ ] **Step 5: Commit** `feat: Gym Heroes set presentation`.

### Task 19: Board: Stadium zone, Stadium actions, bench trim, Recall, set-aside hand (SP and MP)

**Files:** `src/features/game/ui/BattleArea.tsx` / the Stadium zone component (render `state.stadium` card, who played it), `src/features/game/hooks/useCardEffectFlow.ts` (Stadium actions through the same generic flow), a `BenchTrimModal` (choose Pokémon to discard; `canCancel={false}`), attack picker lists `getAvailableAttacks` (Recall), hand area shows "Mano apartada" with the set-aside count, `MultiplayerGamePage.tsx` wiring for each (socket actions from Task 17).

- [ ] **Step 1:** Failing component tests where the repo has them (`GameBoardShell.test.tsx` style): Stadium zone shows the card name; attack picker shows a Recall attack labelled with its source card.
- [ ] **Step 2–4:** Implement SP then MP; build green; Playwright smoke: SP game with Gym Heroes decks playing a Stadium and Recall.
- [ ] **Step 5: Commit** `feat: Stadium, Recall and set-aside hand on the board`.

### Task 20: Misty's Duel modal (SP and MP)

**Files:** Create `src/features/game/ui/MistysDuelModal.tsx`; wire in `GamePage.tsx` (SP: the player's pick → `submitDuelPick(state,"player",pick)`, the AI's pick via the engine RNG → `submitDuelPick(state,"opponent",aiPick)`) and `MultiplayerGamePage.tsx` (`duelPick` socket action; show "Esperando a tu rival…" until the masked state has both picks).

UI: title "Misty's Duel", three large buttons with Fluent-free art — use PokeAPI-style pixel icons if available, otherwise text buttons "Piedra", "Papel", "Tijera" with Phosphor icons (`HandFistIcon`, `HandIcon`, `ScissorsIcon`); after both picks, reveal both choices side by side, "Empate: otra vez" on a tie (next round re-enables the buttons), the winner line, then close. `isOpen`/`onClose` (no-op: blocking).

- [ ] **Step 1:** Failing component test: clicking "Piedra" calls `onPick("rock")`, buttons disable until the next round; a tie shows "Empate".
- [ ] **Step 2–4:** Implement, build green; Playwright: SP Misty's Duel with a tie then a win.
- [ ] **Step 5: Commit** `feat: Misty's Duel Rock-Paper-Scissors modal`.

## Stage 3 — integration

### Task 21: End-to-end verification and hand-off

- [ ] **Step 1:** game-core: `npm test`, simulate (Task 15 command), `npm run build`, `npm pack`.
- [ ] **Step 2:** API and frontend on the same packed engine: full test suites, `npm run build` (frontend), `npx tsc --noEmit` (both).
- [ ] **Step 3:** Local run (API on :5402 with the news DB, frontend build on :3402): Playwright SP game Gym Heroes vs Gym Heroes (Stadium, Recall, Misty's Duel, Narrow Gym trim); MP game with two browser contexts (Stadium visible to both, duel picks hidden until both, bench trim off-turn).
- [ ] **Step 4:** Write the hand-off: what's done, `docs/card-doubts.md` Gym Heroes section for the owner, the release order (publish game-core → bump API + frontend to the same version → API deploy with backup → frontend push) — no publish/deploy without the owner's OK.
- [ ] **Step 5: Commit** the hand-off notes in each repo's docs.
