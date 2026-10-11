import { describe, it, expect } from "vitest";
import {
  runBatch,
  buildMixDeck,
  checkInvariants,
  ownedCardIds,
  mulberry32,
  withRandom,
  ExploreMemory,
  cardRarity,
  DECK_SIZE,
  isPolicyPair,
  policyPair,
} from "@/domain/simulation";
import { cardIdentities } from "@/domain/simulation/invariants";
import { GameRules } from "@/domain/simulation/rules";
import { buildDeckFromEntries, hasBasicPokemon, type GameState } from "@/lib/gameState";
import { findCardByName, getSet } from "@/domain/catalog";
import { StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard } from "./helpers/state";

const ALL_SETS = ["base-set", "jungle", "fossil", "team-rocket"] as const;

const report = (result: ReturnType<typeof runBatch>) =>
  result.failures.map((f) => `seed ${f.seed}: ${f.problem} after "${f.action}"\n  ${f.lastEvents.slice(-8).join("\n  ")}`);

describe("policy pairs", () => {
  it("accept single names, mixed and A:B pairs", () => {
    for (const pair of ["greedy", "random", "explore", "mixed", "explore:greedy", "random:explore"]) expect(isPolicyPair(pair)).toBe(true);
    for (const pair of ["all", "explore:", "foo", "greedy:random:explore"]) expect(isPolicyPair(pair)).toBe(false);
    expect(policyPair("explore:greedy").map((p) => p.name)).toEqual(["explore", "greedy"]);
  });
});

describe("random-mix decks", () => {
  it("are legal 60-card decks with a Basic, max 4 copies by name, mixing the sets", () => {
    const sets = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed);
      const deck = buildMixDeck(rng, [...ALL_SETS]);
      const cards = withRandom(rng, () => buildDeckFromEntries(deck.cards));
      expect(cards).toHaveLength(DECK_SIZE);
      expect(hasBasicPokemon(cards)).toBe(true);
      const counts = new Map<string, number>();
      for (const card of cards) if (card.kind !== "energy" || !card.isBasic) counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(4);
      cards.forEach((c) => sets.add(c.set));
    }
    expect(sets.size).toBe(4);
  });

  it("feature the cards the run used least", () => {
    const memory = new ExploreMemory();
    const charizard = findCardByName("Dark Charizard")!;
    expect(cardRarity(memory, charizard)).toBe(0);
    // Every other Pokémon's attacks and powers used once: Dark Charizard's line must be featured
    const pool = ALL_SETS.flatMap((id) => getSet(id)?.cards ?? []);
    for (const card of pool) {
      if (card.kind === "pokemon" && card.name !== "Dark Charizard") for (const a of card.attacks) memory.bump(`attack ${card.name}: ${a.name}`);
      if (card.kind === "pokemon" && card.power) memory.bump(`usePower ${card.power.name}`);
      if (card.kind === "pokemon" && card.power) memory.bump(`powerChoice ${card.power.name}`);
    }
    for (let seed = 1; seed <= 5; seed++) {
      const r = mulberry32(seed);
      const cards = withRandom(r, () => buildDeckFromEntries(buildMixDeck(r, [...ALL_SETS], "A", memory).cards));
      expect(cards.map((c) => c.name)).toContain("Dark Charizard");
      expect(cards.map((c) => c.name)).toContain("Dark Charmeleon");
      expect(cards.map((c) => c.name)).toContain("Charmander");
    }
  });
});

describe("explore policy", () => {
  it("is deterministic for a batch seed", () => {
    const run = () => runBatch({ games: 6, seed: 77, sets: [...ALL_SETS], policy: "explore", decks: "random-mix" });
    expect(run()).toEqual(run());
  }, 120_000);

  it.each(["explore", "explore:greedy", "explore:random"] as const)(
    "40 random-mix games (%s) finish without invariant violations",
    (policy) => {
      const result = runBatch({ games: 40, seed: 4000, sets: [...ALL_SETS], policy, decks: "random-mix" });
      expect(report(result)).toEqual([]);
      expect(result.outcomes).toHaveLength(40);
    },
    120_000
  );

  it("reaches attacks, Trainers and powers the greedy AI never plays", () => {
    const result = runBatch({ games: 120, seed: 1, sets: [...ALL_SETS], policy: "explore", decks: "random-mix" });
    expect(report(result)).toEqual([]);
    const used = new Set(result.outcomes.flatMap((o) => Object.keys(o.actionCounts)));
    for (const kind of ["playTrainer Challenge!", "playTrainer Digger", "playTrainer Here Comes Team Rocket!", "usePower Buzzap"]) {
      expect(used, kind).toContain(kind);
    }
    const attacks = [...used].filter((k) => k.startsWith("attack ")).length;
    expect(attacks).toBeGreaterThan(250);
  }, 120_000);

  it("a batch can check that no action mutates its input", () => {
    const result = runBatch({ games: 5, seed: 9, sets: [...ALL_SETS], policy: "explore:random", decks: "random-mix", checkMutation: true });
    expect(report(result)).toEqual([]);
  }, 120_000);
});

describe("invariants added for exploration", () => {
  const context = (state: GameState) => ({
    initialIds: { player: [...ownedCardIds(state, "player")].sort(), opponent: [...ownedCardIds(state, "opponent")].sort() },
    before: state,
    initialCards: cardIdentities(state),
  });

  it("flag Special Conditions on the Bench and Asleep + Paralyzed together", () => {
    const state = makeState({
      player: { active: inPlay("Machop", { statuses: [StatusCondition.Asleep, StatusCondition.Paralyzed] }), bench: [inPlay("Onix", { statuses: [StatusCondition.Poisoned] })] },
      opponent: { active: inPlay("Onix") },
    });
    const problems = checkInvariants(state, context(state)).join("\n");
    expect(problems).toMatch(/Onix is poisoned on the Bench/);
    expect(problems).toMatch(/Machop is asleep\+paralyzed/);
  });

  it("flag a Paralysis that would never wear off or outlived its turn", () => {
    const never = makeState({ player: { active: inPlay("Machop", { statuses: [StatusCondition.Paralyzed] }) }, opponent: { active: inPlay("Onix") } });
    expect(checkInvariants(never, context(never)).join("\n")).toMatch(/no paralyzedOnTurn/);
    const stale = { ...never, turnNumber: 9, playerActivePokemon: { ...never.playerActivePokemon!, paralyzedOnTurn: 5 } };
    expect(checkInvariants(stale, context(stale)).join("\n")).toMatch(/still Paralyzed on turn 9/);
  });

  it("flag a card that changed identity outside play and a prize count that grew", () => {
    const fossil = gameCard("Mysterious Fossil");
    const state = makeState({ player: { active: inPlay("Machop"), discard: [fossil] }, opponent: { active: inPlay("Onix") } });
    const ctx = context(state);
    const asPokemon = { ...state, playerDiscard: [{ ...fossil, kind: "pokemon" } as typeof fossil] };
    expect(checkInvariants(asPokemon, ctx).join("\n")).toMatch(/Mysterious Fossil \(pokemon\) was Mysterious Fossil \(trainer\)/);
    const fewer = { ...state, playerPrizes: state.playerPrizes.slice(1) };
    expect(checkInvariants(state, { ...context(fewer), before: fewer }).join("\n")).toMatch(/player prizes went from 5 to 6/);
  });
});

describe("game rules followed across a game", () => {
  const machop = () => inPlay("Machop");

  it("prizes must match Knock Outs", () => {
    const rules = new GameRules();
    const start = makeState({ player: { active: machop() }, opponent: { active: inPlay("Onix"), bench: [inPlay("Geodude")] } });
    expect(rules.check(start, start, "player", "noop")).toEqual([]);
    // A Prize taken without any Knock Out
    const free = { ...start, playerPrizes: start.playerPrizes.slice(1) };
    expect(rules.check(start, free, "player", "playTrainer X").join("\n")).toMatch(/player took 1 Prizes for 0 Knock Outs/);
  });

  it("a Knock Out (the Pokémon's cards to the discard pile) owes exactly one Prize", () => {
    const rules = new GameRules();
    const onix = inPlay("Onix");
    const start = makeState({ player: { active: machop() }, opponent: { active: onix, bench: [inPlay("Geodude")] } });
    rules.check(start, start, "player", "noop");
    const knockedOut = { ...start, opponentActivePokemon: null, opponentDiscard: [onix.pokemon], opponentNeedsToPromote: true };
    expect(rules.check(start, knockedOut, "player", "attack Machop: Low Kick").join("\n")).toMatch(/player took 0 Prizes for 1 Knock Outs/);
    const paid = { ...knockedOut, playerPrizes: knockedOut.playerPrizes.slice(1) };
    expect(rules.check(knockedOut, paid, "player", "take prize #0")).toEqual([]);
  });

  it("a Pokémon devolved to Mysterious Fossil and Knocked Out owes no Prize (seed 200555 false alarm)", () => {
    const rules = new GameRules();
    const kabuto = inPlay("Kabuto", { evolvedFrom: ["Mysterious Fossil"] });
    const start = makeState({ player: { active: kabuto, bench: [machop()] }, opponent: { active: inPlay("Onix") } });
    rules.check(start, start, "player", "noop");
    const fossil = kabuto.previousEvolutions![0];
    const after = {
      ...start,
      playerActivePokemon: null,
      playerNeedsToPromote: true,
      playerHand: [...start.playerHand, kabuto.pokemon],
      playerDiscard: [{ ...fossil, kind: "trainer" } as typeof fossil],
    };
    expect(rules.check(start, after, "player", "playTrainer Devolution Spray")).toEqual([]);
  });

  it("the between-turns checkup only adds Poison damage to Poisoned Actives", () => {
    const rules = new GameRules();
    const poisoned = inPlay("Machop", { statuses: [StatusCondition.Poisoned] });
    const before = makeState({ player: { active: poisoned }, opponent: { active: inPlay("Onix") } });
    const good = { ...before, turnNumber: before.turnNumber + 1, isPlayerTurn: false, playerActivePokemon: { ...poisoned, currentDamage: 10 } };
    expect(rules.check(before, good, "player", "end turn")).toEqual([]);
    const rules2 = new GameRules();
    const bad = { ...good, opponentActivePokemon: { ...before.opponentActivePokemon!, currentDamage: 10 } };
    expect(rules2.check(before, bad, "player", "end turn").join("\n")).toMatch(/opponent Active Onix took 10 damage \(expected 0\)/);
  });
});
