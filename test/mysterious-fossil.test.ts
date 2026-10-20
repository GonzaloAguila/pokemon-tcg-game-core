/**
 * Mysterious Fossil (FO #62) — and Clefairy Doll (BS #70), same rules:
 * "Play Mysterious Fossil as if it were a Basic Pokémon. While in play, Mysterious Fossil
 * counts as a Pokémon (instead of a Trainer card). Mysterious Fossil has no attacks, can't
 * retreat, and can't be Asleep, Confused, Paralyzed, or Poisoned. If Mysterious Fossil is
 * Knocked Out, it doesn't count as a Knocked Out Pokémon. (Discard it anyway.) At any time
 * during your turn before your attack, you may discard Mysterious Fossil from play."
 */
import { describe, it, expect } from "vitest";
import {
  canPlayBasicPokemon,
  playBasicPokemon,
  canEvolve,
  evolvePokemonCard,
  canDiscardFromPlay,
  discardFromPlay,
} from "@/domain/board";
import {
  applyStatusCondition,
  canExecuteAttack,
  promoteActivePokemon,
  canRetreat,
  executeAttack,
  hasBasicPokemon,
  processBenchKnockouts,
} from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { isPlayableAsBasic, isTrainerInPlay } from "@/domain/cards";
import { GamePhase, EnergyType, StatusCondition } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, energy, deepFreeze, names, armedFor, attackIndex } from "./helpers/state";

const { Water, Grass } = EnergyType;

describe("Mysterious Fossil: played as a Basic Pokémon", () => {
  it("counts as a Basic for the mulligan and goes into play in setup as a 10 HP Pokémon", () => {
    const fossil = gameCard("Mysterious Fossil", "fossil");
    expect(isPlayableAsBasic(fossil)).toBe(true);
    expect(hasBasicPokemon([fossil, energy(Water)])).toBe(true);

    const state = deepFreeze(makeState({ gamePhase: GamePhase.Setup, turnNumber: 0, player: { hand: [fossil] } }));
    const next = playBasicPokemon(state, fossil.id, "active");
    const card = next.playerActivePokemon!.pokemon;
    expect(card.id).toBe(fossil.id);
    expect(card.kind).toBe("pokemon");
    expect(isTrainerInPlay(card)).toBe(true);
    if (card.kind !== "pokemon") throw new Error("not a Pokémon");
    expect([card.stage, card.hp, card.attacks.length, card.types.length]).toEqual(["basic", 10, 0, 0]);
  });

  it("goes to the bench during the turn; it is never played through the Trainer flow", () => {
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [fossil] } });
    expect(canPlayTrainerCard(state, fossil.id)).toMatch(/Pokémon Básico/);
    expect(canPlayBasicPokemon(state, fossil.id, "bench")).toBeNull();
    expect(playBasicPokemon(state, fossil.id, "bench").playerBench[0].pokemon.name).toBe("Mysterious Fossil");
  });

  it("has no attacks, can't retreat and can't be Asleep, Confused, Paralyzed or Poisoned", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil", energy: [Water, Water] });
    const state = makeState({ player: { active: fossil, bench: [inPlay("Machop")] }, opponent: { active: inPlay("Machop") } });
    expect(canExecuteAttack(state, 0)).not.toBeNull();
    expect(canRetreat(fossil, 1, false)).toBe(false);
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed, StatusCondition.Poisoned]) {
      expect(applyStatusCondition(fossil, status, 3).statusConditions).toEqual([]);
    }
  });

  it("an attack's special condition doesn't stick (Ekans Spit Poison, heads)", () => {
    const ekans = armedFor(inPlay("Ekans", { set: "fossil" }), "Escupir Veneno");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const state = makeState({ player: { active: ekans }, opponent: { active: fossil, bench: [inPlay("Machop")] } });
    const next = executeAttack(state, attackIndex(ekans, "Escupir Veneno"), { coinResults: ["heads"], skipEndTurn: true });
    expect(next.opponentActivePokemon!.statusConditions).toEqual([]);
  });

  it("Knocked Out as the Defending Pokémon: discarded as the Trainer card, no Prize", () => {
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil", energy: [Water] });
    const state = deepFreeze(makeState({ player: { active: machop }, opponent: { active: fossil, bench: [inPlay("Abra")] } }));
    const next = executeAttack(state, 0, { coinResults: [], skipEndTurn: true, skipDefenderPromotion: true });
    expect(next.playerCanTakePrize).toBe(false);
    expect(next.playerPrizes).toHaveLength(6);
    expect(next.opponentNeedsToPromote).toBe(true);
    const discarded = next.opponentDiscard.find((c) => c.id === fossil.pokemon.id)!;
    expect(discarded.kind).toBe("trainer");
    expect(names(next.opponentDiscard).sort()).toEqual(["Mysterious Fossil", "Water Energy"]);
  });

  it("Knocked Out on the bench: no Prize either", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil", damage: 10 });
    const state = makeState({ player: { active: inPlay("Machop") }, opponent: { active: inPlay("Abra"), bench: [fossil] } });
    const next = processBenchKnockouts(state);
    expect(next.opponentBench).toEqual([]);
    expect(next.playerPrizes).toHaveLength(6);
    expect(next.opponentDiscard[0].kind).toBe("trainer");
  });

  it("the last Pokémon in play being a Knocked Out Fossil still loses the game", () => {
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const state = makeState({ player: { active: machop }, opponent: { active: inPlay("Mysterious Fossil", { set: "fossil" }) } });
    const next = executeAttack(state, 0, { coinResults: [] });
    expect(next.gameResult).toBe("victory");
  });
});

describe("Mysterious Fossil: evolution", () => {
  it("Kabuto evolves from it; the Fossil goes under Kabuto and back to the discard as a Trainer, Kabuto gives a Prize", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const kabuto = gameCard("Kabuto", "fossil");
    const state = makeState({ turnNumber: 4, player: { active: fossil, hand: [kabuto] }, opponent: { active: inPlay("Machop") } });
    expect(canEvolve(state, kabuto.id, fossil.pokemon.id)).toBeNull();
    const evolved = evolvePokemonCard(state, kabuto.id, fossil.pokemon.id);
    expect(evolved.playerActivePokemon!.pokemon.name).toBe("Kabuto");
    expect(evolved.playerActivePokemon!.previousEvolutions!.map((c) => c.name)).toEqual(["Mysterious Fossil"]);

    // Opponent's Machop Knocks Out the Kabuto (30 HP, 30 damage counters already)
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const attack = makeState({
      player: { active: machop },
      opponent: { active: { ...evolved.playerActivePokemon!, currentDamage: 20 }, bench: [inPlay("Abra")] },
    });
    const next = executeAttack(attack, 0, { coinResults: [], skipEndTurn: true, skipDefenderPromotion: true });
    expect(next.playerCanTakePrize).toBe(true);
    const discardedFossil = next.opponentDiscard.find((c) => c.name === "Mysterious Fossil")!;
    expect(discardedFossil.kind).toBe("trainer");
  });

  it("Scoop Up on Kabuto returns the Fossil (its 'Basic') to the hand as a Trainer", () => {
    const kabuto = inPlay("Kabuto", { set: "fossil", evolvedFrom: ["Mysterious Fossil"] });
    const scoop = gameCard("Scoop Up");
    const state = makeState({ player: { active: inPlay("Machop"), bench: [kabuto], hand: [scoop] }, opponent: { active: inPlay("Abra") } });
    const next = playTrainerCard(state, scoop.id, [[kabuto.pokemon.id]]);
    const back = next.playerHand.find((c) => c.name === "Mysterious Fossil")!;
    expect(back.kind).toBe("trainer");
    expect(names(next.playerDiscard).sort()).toEqual(["Kabuto", "Scoop Up"]);
  });
});

describe("Mysterious Fossil: other cards see a Trainer outside play", () => {
  it("Poké Ball can't find it in the deck; Item Finder can take it from the discard; Revive can't", () => {
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const ball = gameCard("Poké Ball");
    const finder = gameCard("Item Finder");
    const revive = gameCard("Revive");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [ball, finder, revive, energy(Water), energy(Water)], deck: [fossil, gameCard("Abra")], discard: [{ ...fossil, id: "fossil-in-discard" }] },
    });
    expect(getTrainerSteps(state, ball.id, [], ["heads"])!.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Abra"]);
    expect(getTrainerSteps(state, finder.id, [[state.playerHand[3].id, state.playerHand[4].id]])!.options.map((o) => o.label)).toEqual([
      "Mysterious Fossil",
    ]);
    expect(canPlayTrainerCard(state, revive.id)).toMatch(/Básicos/);
  });
});

describe("Mysterious Fossil: discard from play", () => {
  it("a benched Fossil is discarded (with its Energy) during your turn, no Prize for anyone", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil", energy: [Grass] });
    const state = deepFreeze(makeState({ player: { active: inPlay("Machop"), bench: [fossil] }, opponent: { active: inPlay("Abra") } }));
    expect(canDiscardFromPlay(state, fossil.pokemon.id)).toBeNull();
    const next = discardFromPlay(state, fossil.pokemon.id);
    expect(next.playerBench).toEqual([]);
    expect(names(next.playerDiscard).sort()).toEqual(["Grass Energy", "Mysterious Fossil"]);
    expect(next.playerDiscard.every((c) => c.kind !== "pokemon")).toBe(true);
    expect(next.opponentPrizes).toHaveLength(6);
  });

  it("an Active Fossil: the player then promotes a benched Pokémon (like Scoop Up) and keeps playing", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: fossil, bench: [inPlay("Machop"), abra] }, opponent: { active: inPlay("Abra") } });
    const discarded = discardFromPlay(state, fossil.pokemon.id);
    expect(discarded.playerActivePokemon).toBeNull();
    expect(discarded.playerNeedsToPromote).toBe(true);
    expect(canDiscardFromPlay(discarded, abra.pokemon.id)).toMatch(/activo/);
    const next = promoteActivePokemon(discarded, 1, true);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(names(next.playerBench.map((p) => p.pokemon))).toEqual(["Machop"]);
    expect(next.isPlayerTurn).toBe(true);
    expect(() => discardFromPlay(next, abra.pokemon.id)).toThrow(IllegalActionError);
  });

  it("is refused when it is your only Pokémon, after attacking, on the opponent's turn, or for a real Pokémon", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const machop = inPlay("Machop");
    const only = makeState({ player: { active: fossil }, opponent: { active: inPlay("Abra") } });
    expect(canDiscardFromPlay(only, fossil.pokemon.id)).toMatch(/único/);
    const withBench = makeState({ player: { active: machop, bench: [fossil] }, opponent: { active: inPlay("Abra") } });
    expect(canDiscardFromPlay({ ...withBench, attackedThisTurn: true }, fossil.pokemon.id)).not.toBeNull();
    expect(canDiscardFromPlay({ ...withBench, isPlayerTurn: false }, fossil.pokemon.id)).not.toBeNull();
    expect(canDiscardFromPlay(withBench, machop.pokemon.id)).not.toBeNull();
  });
});

describe("Clefairy Doll uses the same rules", () => {
  it("is played as a 10 HP Basic and gives no Prize", () => {
    const doll = gameCard("Clefairy Doll");
    expect(isPlayableAsBasic(doll)).toBe(true);
    const state = makeState({ player: { active: inPlay("Machop"), hand: [doll] } });
    const next = playBasicPokemon(state, doll.id, "bench");
    const card = next.playerBench[0].pokemon;
    expect(card.kind === "pokemon" && card.hp).toBe(10);
  });
});
