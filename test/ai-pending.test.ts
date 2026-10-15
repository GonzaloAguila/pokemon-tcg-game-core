/**
 * The single-player AI resolves the choices its own attacks leave pending and plays
 * Mysterious Fossil only when it makes sense.
 */
import { describe, it, expect } from "vitest";
import { executeAIAction, decideOpponentSetup } from "@/domain/ai";
import { getBasicPokemonInHand } from "@/domain/ai/actions";
import { ownedCardIds } from "@/domain/simulation";
import { EnergyType, GamePhase } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names } from "./helpers/state";

const { Water, Lightning } = EnergyType;

describe("AI pending attack choices", () => {
  it("Call for Family (Krabby): the AI puts a Krabby from its deck on its bench; no card changes sides, the turn passes once", () => {
    const krabby = armedFor(inPlay("Krabby", { set: "fossil" }), "Llamar a la Familia");
    const state = makeState({
      turnNumber: 3,
      isPlayerTurn: false,
      opponent: { active: krabby, deck: [gameCard("Krabby", "fossil"), energy(Water), energy(Water)] },
      player: { active: inPlay("Machop"), deck: [energy(Water), energy(Water)] },
    });
    const before = { player: ownedCardIds(state, "player").sort(), opponent: ownedCardIds(state, "opponent").sort() };

    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(krabby, "Llamar a la Familia"), delay: 0 });

    expect(names(after.opponentBench.map((p) => p.pokemon))).toEqual(["Krabby"]);
    expect(ownedCardIds(after, "player").sort()).toEqual(before.player);
    expect(ownedCardIds(after, "opponent").sort()).toEqual(before.opponent);
    expect(after.turnNumber).toBe(4);
    expect(after.isPlayerTurn).toBe(true);
    expect(after.playerHand).toHaveLength(1);
  });

  it("Spark (choose 1 benched Pokémon): the AI picks the weakest one and the turn passes", () => {
    const pikachu = armedFor(inPlay("Pikachu", { set: "jungle", energy: [Lightning, Lightning] }), "Spark");
    const healthy = inPlay("Machop");
    const weak = inPlay("Abra", { damage: 10 });
    const state = makeState({
      turnNumber: 3,
      isPlayerTurn: false,
      opponent: { active: pikachu },
      player: { active: inPlay("Onix"), bench: [healthy, weak] },
    });
    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(pikachu, "Spark"), delay: 0 });
    expect(after.pendingBenchDamageSelection).toBeUndefined();
    expect(after.playerBench.find((p) => p.pokemon.id === weak.pokemon.id)!.currentDamage).toBe(20);
    expect(after.playerBench.find((p) => p.pokemon.id === healthy.pokemon.id)!.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(true);
  });
});

describe("AI and Mysterious Fossil", () => {
  it("holds it back while it has other Basics and nothing that evolves from it", () => {
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const state = makeState({ isPlayerTurn: false, opponent: { active: inPlay("Machop"), hand: [fossil, gameCard("Abra")] } });
    expect(names(getBasicPokemonInHand(state, "opponent"))).toEqual(["Abra"]);
  });

  it("plays it when it holds Kabuto / Omanyte / Aerodactyl, or has no other Basic", () => {
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const withKabuto = makeState({ isPlayerTurn: false, opponent: { active: inPlay("Machop"), hand: [fossil, gameCard("Abra"), gameCard("Kabuto", "fossil")] } });
    expect(names(getBasicPokemonInHand(withKabuto, "opponent"))).toEqual(["Abra", "Mysterious Fossil"]);

    const onlyFossil = makeState({ gamePhase: GamePhase.Setup, turnNumber: 0, isPlayerTurn: false, opponent: { hand: [fossil, energy(Water)] } });
    const setup = decideOpponentSetup(onlyFossil);
    expect(setup).toEqual([expect.objectContaining({ type: "playBasicToActive", cardId: fossil.id })]);
  });
});

describe("AI discards an Active Mysterious Fossil it can't use", () => {
  it("plans discardFromPlay first and promotes its benched Pokémon; keeps it with a Kabuto in hand", async () => {
    const { decideOpponentTurn } = await import("@/domain/ai");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    // Machop can attack once it gets the Fighting Energy in hand
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: fossil, bench: [inPlay("Machop")], hand: [energy(EnergyType.Fighting)] },
      player: { active: inPlay("Abra") },
    });
    const plan = decideOpponentTurn(state);
    expect(plan[0]).toEqual(expect.objectContaining({ type: "discardFromPlay", pokemonId: fossil.pokemon.id }));
    const after = executeAIAction(state, plan[0]);
    expect(after.opponentActivePokemon!.pokemon.name).toBe("Machop");
    expect(names(after.opponentDiscard)).toEqual(["Mysterious Fossil"]);

    const withKabuto = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: fossil, bench: [inPlay("Machop")], hand: [gameCard("Kabuto", "fossil")] },
      player: { active: inPlay("Abra") },
    });
    const planWithKabuto = decideOpponentTurn(withKabuto);
    expect(planWithKabuto.some((a) => a.type === "discardFromPlay")).toBe(false);
    expect(planWithKabuto.some((a) => a.type === "evolve")).toBe(true);
  }, 30_000);

  it("keeps it as a wall (no Prize when Knocked Out) while the only benched Pokémon can't attack soon", async () => {
    const { decideOpponentTurn } = await import("@/domain/ai");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const state = makeState({ turnNumber: 4, isPlayerTurn: false, opponent: { active: fossil, bench: [inPlay("Machop")] }, player: { active: inPlay("Abra") } });
    expect(decideOpponentTurn(state).some((a) => a.type === "discardFromPlay")).toBe(false);
  }, 30_000);
});
