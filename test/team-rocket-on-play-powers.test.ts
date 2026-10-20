/**
 * "When you play <it> from your hand" powers: Summon Minions (Dark Dragonite), Sneak Attack
 * (Dark Golbat), Reel In (Dark Slowbro) — the generic pending power choice.
 */
import { describe, it, expect } from "vitest";
import { endTurn, resolvePowerChoice } from "@/lib/gameState";
import type { GameState } from "@/lib/gameState";
import { evolvePokemonCard, canAttachEnergy, getTurnActionBlocker } from "@/domain/board";
import { playTrainerCard } from "@/domain/effects";
import { EnergyType } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, energy, names, deepFreeze } from "./helpers/state";

const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const card = (name: string) => gameCard(name, "rocket");

/** Evolve the player's `targetId` with `cardId` from the hand. */
const evolve = (state: GameState, cardId: string, targetId: string) => evolvePokemonCard(state, cardId, targetId);

describe("Summon Minions (Dark Dragonite)", () => {
  function setup(bench = [rocket("Dratini")], opponentBench: ReturnType<typeof inPlay>[] = []) {
    const deck = [card("Abra"), card("Machop"), gameCard("Bill", "base"), card("Dark Golbat"), card("Zubat")];
    const dragonite = card("Dark Dragonite");
    const dragonair = rocket("Dark Dragonair");
    const state = makeState({ player: { active: dragonair, bench, hand: [dragonite], deck }, opponent: { active: inPlay("Onix"), bench: opponentBench } });
    return { state: deepFreeze(state), dragonite, dragonair };
  }

  it("asks for up to 2 Basic Pokémon of the deck; they go to the Bench and the deck is shuffled", () => {
    const { state, dragonite, dragonair } = setup();
    const next = evolve(state, dragonite.id, dragonair.pokemon.id);
    const pending = next.pendingPowerChoice!;
    expect(pending.powerName).toBe("Invocar Secuaces");
    expect(pending.pokemonId).toBe(dragonite.id);
    expect(pending.step.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Abra", "Machop", "Zubat"]);
    expect(pending.step.maxSelections).toBe(2);
    expect(pending.step.minSelections).toBe(0);
    expect(getTurnActionBlocker(next)).toMatch(/Poder Pokémon/);
    expect(endTurn(next)).toBe(next);

    const abra = pending.step.options[0].id;
    const zubat = pending.step.options[2].id;
    const done = resolvePowerChoice(next, [abra, zubat]);
    expect(done.pendingPowerChoice).toBeUndefined();
    expect(names(done.playerBench.map((p) => p.pokemon))).toEqual(["Dratini", "Abra", "Zubat"]);
    expect(done.playerBench[1].playedOnTurn).toBe(state.turnNumber);
    expect(done.playerDeck).toHaveLength(3);
    expect(getTurnActionBlocker(done)).toBeNull();
  });

  it("no more than the Bench has room for; 0 is allowed; a wrong answer throws", () => {
    const four = [rocket("Dratini"), rocket("Abra"), rocket("Abra"), rocket("Abra")];
    const { state, dragonite, dragonair } = setup(four);
    const next = evolve(state, dragonite.id, dragonair.pokemon.id);
    expect(next.pendingPowerChoice!.step.maxSelections).toBe(1);
    expect(() => resolvePowerChoice(next, next.pendingPowerChoice!.step.options.slice(0, 2).map((o) => o.id))).toThrow(IllegalActionError);
    expect(() => resolvePowerChoice(next, ["nope"])).toThrow(IllegalActionError);
    expect(resolvePowerChoice(next, []).playerBench).toHaveLength(4);
  });

  it("with a full Bench there is nothing to choose: the deck is just searched and shuffled", () => {
    const five = [rocket("Dratini"), rocket("Abra"), rocket("Abra"), rocket("Abra"), rocket("Abra")];
    const { state, dragonite, dragonair } = setup(five);
    const next = evolve(state, dragonite.id, dragonair.pokemon.id);
    expect(next.pendingPowerChoice).toBeUndefined();
    expect(next.events.map((e) => e.message).join("\n")).toMatch(/Invocar Secuaces/);
  });

  it("doesn't trigger under Toxic Gas or Goop Gas Attack", () => {
    const muk = setup([rocket("Dratini")], [inPlay("Muk", { set: "fossil" })]);
    expect(evolve(muk.state, muk.dragonite.id, muk.dragonair.pokemon.id).pendingPowerChoice).toBeUndefined();
    const { state, dragonite, dragonair } = setup();
    const goop = { ...state, powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: state.turnNumber + 1 }] };
    expect(evolve(goop, dragonite.id, dragonair.pokemon.id).pendingPowerChoice).toBeUndefined();
  });

  it("Pokémon Breeder playing Dark Dragonite from the hand triggers it too", () => {
    const dragonite = card("Dark Dragonite");
    const breeder = gameCard("Pokémon Breeder", "base");
    const dratini = rocket("Dratini");
    const state = makeState({
      player: { active: dratini, hand: [dragonite, breeder], deck: [card("Abra")] },
      opponent: { active: inPlay("Onix") },
    });
    const next = playTrainerCard(state, breeder.id, [[dragonite.id], [dratini.pokemon.id]]);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Dark Dragonite");
    expect(next.pendingPowerChoice?.powerName).toBe("Invocar Secuaces");
  });
});

describe("Sneak Attack (Dark Golbat)", () => {
  function setup(opponentActive = inPlay("Onix"), opponentBench = [inPlay("Abra", { damage: 20 })]) {
    const golbat = card("Dark Golbat");
    const zubat = rocket("Zubat");
    const state = makeState({ player: { active: zubat, hand: [golbat] }, opponent: { active: opponentActive, bench: opponentBench } });
    return { next: evolve(state, golbat.id, zubat.pokemon.id), golbat };
  }

  it("may choose 1 of the opponent's Pokémon: 10 damage with Weakness and Resistance", () => {
    const { next } = setup();
    const step = next.pendingPowerChoice!.step;
    expect(step.options.map((o) => o.label)).toEqual(["Onix (Activo rival)", "Abra (Banca rival)"]);
    expect(step.minSelections).toBe(0);
    // Onix is weak to Grass: 10 × 2
    const onix = resolvePowerChoice(next, [next.opponentActivePokemon!.pokemon.id]);
    expect(onix.opponentActivePokemon!.currentDamage).toBe(20);
    const declined = resolvePowerChoice(next, []);
    expect(declined.opponentActivePokemon!.currentDamage).toBe(0);
  });

  it("can Knock Out a Benched Pokémon (the Prize is taken at once)", () => {
    const { next } = setup();
    const done = resolvePowerChoice(next, [next.opponentBench[0].pokemon.id]);
    expect(done.opponentBench).toHaveLength(0);
    expect(done.playerPrizes).toHaveLength(5);
  });

  it("Resistance can bring it to 0 (Fighting-resistant... Grass vs a Fire Pokémon has no effect, Machop is neutral)", () => {
    const { next } = setup(inPlay("Machop"), []);
    expect(resolvePowerChoice(next, [next.opponentActivePokemon!.pokemon.id]).opponentActivePokemon!.currentDamage).toBe(10);
  });
});

describe("Reel In (Dark Slowbro)", () => {
  it("up to 3 Basic Pokémon and/or Evolution cards from the discard pile into the hand", () => {
    const slowbro = card("Dark Slowbro");
    const slowpoke = rocket("Slowpoke");
    const discard = [card("Abra"), gameCard("Bill", "base"), energy(EnergyType.Fire), card("Dark Golbat"), card("Machop"), card("Zubat"), gameCard("Mysterious Fossil", "fossil")];
    const state = makeState({ player: { active: slowpoke, hand: [slowbro], discard }, opponent: { active: inPlay("Onix") } });
    const next = evolve(state, slowbro.id, slowpoke.pokemon.id);
    const step = next.pendingPowerChoice!.step;
    expect(step.options.map((o) => o.label)).toEqual(["Abra", "Dark Golbat", "Machop", "Zubat"]);
    expect(step.maxSelections).toBe(3);
    const done = resolvePowerChoice(next, step.options.slice(0, 3).map((o) => o.id));
    expect(names(done.playerHand).sort()).toEqual(["Abra", "Dark Golbat", "Machop"]);
    expect(names(done.playerDiscard).sort()).toEqual(["Bill", "Fire Energy", "Mysterious Fossil", "Zubat"]);
    expect(canAttachEnergy(done, "x", "y")).not.toMatch(/Poder Pokémon/);
  });
});

describe("AI", () => {
  it("answers its own on-play power when it evolves (takes as many Basics as allowed)", async () => {
    const { executeAIAction } = await import("@/domain/ai");
    const dragonite = card("Dark Dragonite");
    const state = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Onix") },
      opponent: { active: rocket("Dark Dragonair"), hand: [dragonite], deck: [card("Abra"), card("Machop"), card("Zubat")] },
    });
    const next = executeAIAction(state, { type: "evolve", evolutionCardId: dragonite.id, targetIndex: -1 });
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Dark Dragonite");
    expect(next.pendingPowerChoice).toBeUndefined();
    expect(next.opponentBench).toHaveLength(2);
    expect(next.opponentDeck).toHaveLength(1);
    // The first (dynamic) import of the AI module graph can be slow while the suite runs in parallel
  }, 30_000);
});
