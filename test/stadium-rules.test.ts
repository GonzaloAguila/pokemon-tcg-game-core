/**
 * Stadium rules (Gym Heroes) read through src/domain/stadiums/rules.ts:
 * - The Rocket's Training Gym: each player pays Colorless more to retreat (#104).
 * - Cerulean City Gym: Pokémon with Misty in their name retreat for Colorless less (#108).
 * - Pewter City Gym: no Resistance against attacks of Pokémon with Brock in their names (#115).
 * - Narrow Gym: Benches hold 4; when played, each player with 5 returns 1 Benched Pokémon and
 *   its cards to the hand, the opponent of whoever played it first (#124) — pendingBenchTrim.
 * - No Removal Gym: discard 2 cards from the hand to play (Super) Energy Removal (#103).
 *
 * The real Stadium cards arrive with the catalog (Task 9): built here like test/stadium.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  canPlayTrainerCard,
  getTrainerSteps,
  playTrainerCard,
  swapSides,
  endTurn,
  executeAttack,
  canExecuteAttack,
  resolveAttackChoice,
  executeRetreat,
  getRetreatCost,
  hasEnoughEnergyToRetreat,
  maxBenchSize,
  isBenchFull,
  canPlayBasicPokemon,
  getTurnActionBlocker,
  resolveBenchTrim,
  getBenchTrimStep,
  resolveBenchTrimForAI,
  chooseBenchTrim,
  executeAIAction,
  stadiumRetreatModifier,
  stadiumIgnoresResistance,
  stadiumExtraTrainerDiscards,
  type GameCard,
  type PokemonInPlay,
} from "@/index";
import { createTrainerCard } from "@/domain/cards";
import { CardRarity, CardSet, EnergyType, TrainerType } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, deepFreeze, names, armedFor, attackIndex, energy } from "./helpers/state";

const { Water, Fighting } = EnergyType;

let uid = 0;
/** A test-only Stadium (the real ones arrive with the Gym Heroes catalog). */
function stadium(name: string): GameCard {
  uid += 1;
  const card = createTrainerCard({
    id: `test-stadium-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name,
    number: 0,
    set: CardSet.GymHeroes,
    rarity: CardRarity.Rare,
    trainerType: TrainerType.Stadium,
    effect: "Estadio de prueba",
  });
  return { ...card, id: `${card.id}#${uid}` } as GameCard;
}

const inPlayStadium = (name: string, playedBy: "player" | "opponent" = "player") => ({ card: stadium(name), playedBy });

/** A Pokémon in play renamed as an owner's Pokémon ("Misty's Psyduck") — the owner is the name prefix. */
function owned(owner: string, pokemon: PokemonInPlay): PokemonInPlay {
  return { ...pokemon, pokemon: { ...pokemon.pokemon, name: `${owner}'s ${pokemon.pokemon.name}` } as GameCard };
}

const psyduck = (energyTypes: EnergyType[] = []) => inPlay("Psyduck", { set: "fossil", energy: energyTypes }); // Retreat Cost 1

// ============================================================================
// Retreat
// ============================================================================

describe("The Rocket's Training Gym: each player pays Colorless more to retreat", () => {
  it("a Retreat Cost 1 Pokémon needs 2 Energy, for both sides", () => {
    const gym = inPlayStadium("The Rocket's Training Gym");
    const one = makeState({
      player: { active: psyduck([Water]), bench: [inPlay("Abra")] },
      opponent: { active: psyduck([Water]), bench: [inPlay("Abra")] },
      stadium: gym,
    });
    expect(stadiumRetreatModifier(one, one.playerActivePokemon!)).toBe(1);
    expect(getRetreatCost(one.playerActivePokemon!, one.playerBench, one)).toBe(2);
    expect(getRetreatCost(one.opponentActivePokemon!, one.opponentBench, one)).toBe(2);
    expect(hasEnoughEnergyToRetreat(one.playerActivePokemon!, one.playerBench, one)).toBe(false);
    expect(hasEnoughEnergyToRetreat(one.opponentActivePokemon!, one.opponentBench, one)).toBe(false);
    const refused = executeRetreat(one, [one.playerActivePokemon!.attachedEnergy[0].id], 0);
    expect(refused.playerActivePokemon!.pokemon.name).toBe("Psyduck");
    // The opponent on its own turn (its view)
    const theirs = swapSides(one);
    expect(getRetreatCost(theirs.playerActivePokemon!, theirs.playerBench, theirs)).toBe(2);

    const two = makeState({
      player: { active: psyduck([Water, Water]), bench: [inPlay("Abra")] },
      stadium: gym,
    });
    expect(hasEnoughEnergyToRetreat(two.playerActivePokemon!, two.playerBench, two)).toBe(true);
    const retreated = executeRetreat(deepFreeze(two), two.playerActivePokemon!.attachedEnergy.map((e) => e.id), 0);
    expect(retreated.playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(retreated.playerDiscard).toHaveLength(2);
  });

  it("without the Stadium the same Pokémon pays 1", () => {
    const state = makeState({ player: { active: psyduck([Water]), bench: [inPlay("Abra")] } });
    expect(stadiumRetreatModifier(state, state.playerActivePokemon!)).toBe(0);
    expect(getRetreatCost(state.playerActivePokemon!, state.playerBench, state)).toBe(1);
  });
});

describe("Cerulean City Gym: Pokémon with Misty in their name pay Colorless less", () => {
  it("Misty's Psyduck (Retreat Cost 1) retreats for free; a plain Psyduck still pays 1 — both sides", () => {
    const state = makeState({
      player: { active: owned("Misty", psyduck()), bench: [inPlay("Abra")] },
      opponent: { active: psyduck(), bench: [owned("Misty", psyduck())] },
      stadium: inPlayStadium("Cerulean City Gym", "opponent"),
    });
    expect(stadiumRetreatModifier(state, state.playerActivePokemon!)).toBe(-1);
    expect(getRetreatCost(state.playerActivePokemon!, state.playerBench, state)).toBe(0);
    expect(hasEnoughEnergyToRetreat(state.playerActivePokemon!, state.playerBench, state)).toBe(true);
    expect(executeRetreat(state, [], 0).playerActivePokemon!.pokemon.name).toBe("Abra");
    // A plain Psyduck (the opponent's Active) still pays 1
    expect(getRetreatCost(state.opponentActivePokemon!, state.opponentBench, state)).toBe(1);
    // The opponent's Misty's Psyduck, from its own view
    const theirs = swapSides({ ...state, opponentActivePokemon: state.opponentBench[0], opponentBench: [state.opponentActivePokemon!] });
    expect(getRetreatCost(theirs.playerActivePokemon!, theirs.playerBench, theirs)).toBe(0);
  });

  it("never goes below 0", () => {
    const free = owned("Misty", { ...psyduck(), pokemon: { ...psyduck().pokemon, retreatCost: 0 } as GameCard });
    const state = makeState({ player: { active: free, bench: [inPlay("Abra")] }, stadium: inPlayStadium("Cerulean City Gym") });
    expect(getRetreatCost(state.playerActivePokemon!, state.playerBench, state)).toBe(0);
  });
});

// ============================================================================
// Resistance
// ============================================================================

describe("Pewter City Gym: no Resistance against Pokémon with Brock in their names", () => {
  const onix = (owner?: string) => {
    const armed = armedFor(inPlay("Onix", { set: "base" }), "Lanzarrocas"); // 10 Fighting damage
    return owner ? owned(owner, armed) : armed;
  };
  const hit = (attacker: PokemonInPlay, withGym: boolean) => {
    const state = makeState({
      player: { active: attacker },
      opponent: { active: inPlay("Gyarados", { set: "base" }) }, // Resistance: Fighting
      ...(withGym && { stadium: inPlayStadium("Pewter City Gym", "opponent") }),
    });
    return executeAttack(state, attackIndex(attacker, "Lanzarrocas"), { coinResults: [], skipEndTurn: true });
  };

  it("Brock's Onix does its full damage to a Pokémon with Fighting Resistance; a plain Onix gets −30", () => {
    expect(hit(onix("Brock"), true).opponentActivePokemon!.currentDamage).toBe(10);
    expect(hit(onix(), true).opponentActivePokemon!.currentDamage).toBe(0);
    // No Stadium: Resistance applies to Brock's Onix too
    expect(hit(onix("Brock"), false).opponentActivePokemon!.currentDamage).toBe(0);
  });

  it("stadiumIgnoresResistance reads the attacker's name", () => {
    const state = makeState({ stadium: inPlayStadium("Pewter City Gym") });
    expect(stadiumIgnoresResistance(state, onix("Brock"))).toBe(true);
    expect(stadiumIgnoresResistance(state, onix("Misty"))).toBe(false);
    expect(stadiumIgnoresResistance(makeState(), onix("Brock"))).toBe(false);
  });

  it("also for a chosen-target attack that applies Resistance (Drag Off)", () => {
    const machoke = owned("Brock", armedFor(inPlay("Dark Machoke", { set: "rocket" }), "Arrastrar"));
    const gyarados = inPlay("Gyarados", { set: "base" });
    const state = makeState({
      player: { active: machoke },
      opponent: { active: inPlay("Onix"), bench: [gyarados] },
      stadium: inPlayStadium("Pewter City Gym"),
    });
    const attacked = executeAttack(state, attackIndex(machoke, "Arrastrar"), { coinResults: [], skipEndTurn: true });
    const step = attacked.pendingAttackChoice!.step;
    const done = resolveAttackChoice(attacked, [step.options.find((o) => o.id === gyarados.pokemon.id)!.id], { skipEndTurn: true });
    expect(done.opponentActivePokemon!.pokemon.name).toBe("Gyarados");
    expect(done.opponentActivePokemon!.currentDamage).toBe(20);
  });
});

// ============================================================================
// Narrow Gym
// ============================================================================

const benchOf = (count: number, name = "Abra") => Array.from({ length: count }, () => inPlay(name));

describe("Narrow Gym: no player may have more than 4 Pokémon on the Bench", () => {
  it("maxBenchSize is 4 for both sides, whoever played it", () => {
    for (const playedBy of ["player", "opponent"] as const) {
      const state = makeState({
        player: { active: inPlay("Machop"), bench: benchOf(4) },
        opponent: { active: inPlay("Machop"), bench: benchOf(4) },
        stadium: inPlayStadium("Narrow Gym", playedBy),
      });
      expect(maxBenchSize(state, "player")).toBe(4);
      expect(maxBenchSize(state, "opponent")).toBe(4);
      expect(isBenchFull(state, "player")).toBe(true);
      expect(isBenchFull(state, "opponent")).toBe(true);
    }
    const other = makeState({ stadium: inPlayStadium("Pewter City Gym") });
    expect(maxBenchSize(other, "player")).toBe(5);
    expect(maxBenchSize(other, "opponent")).toBe(5);
  });

  it("a 5th Basic can't go on a Bench of 4", () => {
    const abra = gameCard("Abra");
    const state = makeState({
      player: { active: inPlay("Machop"), bench: benchOf(4), hand: [abra] },
      stadium: inPlayStadium("Narrow Gym", "opponent"),
    });
    expect(canPlayBasicPokemon(state, abra.id, "bench")).not.toBeNull();
  });
});

describe("Narrow Gym played with 5 on a Bench: that player returns 1 Benched Pokémon and its cards to the hand", () => {
  function bothFull(hand: GameCard[] = []) {
    const gym = stadium("Narrow Gym");
    const charged = inPlay("Machop", { energy: [Fighting] }); // the opponent's choice
    const evolved = inPlay("Machoke", { evolvedFrom: ["Machop"], energy: [Fighting, Fighting] });
    const state = makeState({
      player: { active: inPlay("Machop"), bench: [...benchOf(4), evolved], hand: [gym, ...hand] },
      opponent: { active: inPlay("Machop"), bench: [...benchOf(4), charged] },
    });
    return { gym, charged, evolved, state };
  }

  it("both players have to: the opponent of whoever played it goes first; everything waits until both resolve", () => {
    const { gym, charged, evolved, state } = bothFull();
    const played = playTrainerCard(deepFreeze(state), gym.id);
    expect(played.stadium?.card.name).toBe("Narrow Gym");
    expect(played.pendingBenchTrim).toEqual([
      { side: "opponent", keep: 4 },
      { side: "player", keep: 4 },
    ]);
    // endTurn and every other action wait
    expect(endTurn(played)).toBe(played);
    expect(getTurnActionBlocker(played)).toMatch(/Banca/);
    expect(canExecuteAttack(played, 0)).toMatch(/Banca/);
    // The opponent's choice comes first: the player's Pokémon and an Active are refused
    expect(() => resolveBenchTrim(played, [evolved.pokemon.id])).toThrow(IllegalActionError);
    expect(() => resolveBenchTrim(played, [played.opponentActivePokemon!.pokemon.id])).toThrow(IllegalActionError);
    expect(() => resolveBenchTrim(played, [])).toThrow(IllegalActionError);

    // The opponent answers (any view: the player's here)
    const step = getBenchTrimStep(played)!;
    expect(step.options.map((o) => o.id)).toEqual(played.opponentBench.map((p) => p.pokemon.id));
    expect(step.maxSelections).toBe(1);
    const first = resolveBenchTrim(deepFreeze(played), [charged.pokemon.id]);
    expect(first.opponentBench).toHaveLength(4);
    expect(names(first.opponentHand)).toEqual(["Machop", "Fighting Energy"]);
    expect(first.pendingBenchTrim).toEqual([{ side: "player", keep: 4 }]);
    expect(endTurn(first)).toBe(first);

    // Then the player: the evolved Pokémon goes back with its Energy and the card under it
    const second = resolveBenchTrim(deepFreeze(first), [evolved.pokemon.id]);
    expect(second.playerBench).toHaveLength(4);
    expect(names(second.playerHand).sort()).toEqual(["Fighting Energy", "Fighting Energy", "Machoke", "Machop"].sort());
    expect(second.pendingBenchTrim).toBeUndefined();
    expect(getTurnActionBlocker(second)).toBeNull();
    expect(endTurn(second).isPlayerTurn).toBe(false);
    expect(() => resolveBenchTrim(second, [])).toThrow(IllegalActionError);
  });

  it("the opponent answers on its own view (the server swaps): same result", () => {
    const { gym, charged, state } = bothFull();
    const played = playTrainerCard(state, gym.id);
    const theirView = swapSides(played);
    expect(theirView.pendingBenchTrim).toEqual([
      { side: "player", keep: 4 },
      { side: "opponent", keep: 4 },
    ]);
    expect(getBenchTrimStep(theirView)!.options.map((o) => o.id)).toContain(charged.pokemon.id);
    const answered = swapSides(resolveBenchTrim(theirView, [charged.pokemon.id]));
    const direct = resolveBenchTrim(played, [charged.pokemon.id]);
    expect(answered.pendingBenchTrim).toEqual(direct.pendingBenchTrim);
    expect(names(answered.opponentHand)).toEqual(names(direct.opponentHand));
    expect(answered.opponentBench.map((p) => p.pokemon.id)).toEqual(direct.opponentBench.map((p) => p.pokemon.id));
  });

  it("swapSides swaps the sides of the queue; twice restores it", () => {
    const state = makeState({ pendingBenchTrim: [{ side: "opponent", keep: 4 }, { side: "player", keep: 4 }] });
    expect(swapSides(state).pendingBenchTrim).toEqual([{ side: "player", keep: 4 }, { side: "opponent", keep: 4 }]);
    expect(swapSides(swapSides(state)).pendingBenchTrim).toEqual(state.pendingBenchTrim);
    expect(swapSides(makeState()).pendingBenchTrim).toBeUndefined();
  });

  it("only the players with 5 Benched have to; nobody with fewer", () => {
    const gym = stadium("Narrow Gym");
    const mine = makeState({
      player: { active: inPlay("Machop"), bench: benchOf(5), hand: [gym] },
      opponent: { active: inPlay("Machop"), bench: benchOf(4) },
    });
    expect(playTrainerCard(mine, gym.id).pendingBenchTrim).toEqual([{ side: "player", keep: 4 }]);
    const neither = makeState({
      player: { active: inPlay("Machop"), bench: benchOf(3), hand: [gym] },
      opponent: { active: inPlay("Machop"), bench: benchOf(4) },
    });
    const played = playTrainerCard(neither, gym.id);
    expect(played.pendingBenchTrim).toBeUndefined();
    expect(getBenchTrimStep(played)).toBeNull();
  });

  it("a Trainer played as a Basic goes back as the Trainer card", () => {
    const gym = stadium("Narrow Gym");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const state = makeState({
      player: { active: inPlay("Machop"), bench: [...benchOf(4), fossil], hand: [gym] },
      opponent: { active: inPlay("Machop") },
    });
    const done = resolveBenchTrim(playTrainerCard(state, gym.id), [fossil.pokemon.id]);
    expect(done.playerHand).toHaveLength(1);
    expect(done.playerHand[0].kind).toBe("trainer");
    expect(done.playerHand[0].name).toBe("Mysterious Fossil");
  });

  it("the AI returns its lowest-value Benched Pokémon", () => {
    const weak = inPlay("Abra");
    const bench = [...Array.from({ length: 4 }, () => inPlay("Machoke", { evolvedFrom: ["Machop"], energy: [Fighting, Fighting] })), weak];
    const view = makeState({ player: { active: inPlay("Machop"), bench }, pendingBenchTrim: [{ side: "player", keep: 4 }] });
    expect(chooseBenchTrim(view)).toEqual([weak.pokemon.id]);
    // The consumer's view: the AI is "opponent" and answers its own entry only
    const consumer = swapSides(view);
    const answered = resolveBenchTrimForAI(consumer);
    expect(answered.opponentBench.map((p) => p.pokemon.id)).not.toContain(weak.pokemon.id);
    expect(answered.pendingBenchTrim).toBeUndefined();
    const humanFirst = { ...consumer, pendingBenchTrim: [{ side: "player" as const, keep: 4 }, { side: "opponent" as const, keep: 4 }] };
    expect(resolveBenchTrimForAI(humanFirst)).toBe(humanFirst);
  });

  it("the AI playing it with only its own Bench at 5 answers right away", () => {
    const gym = stadium("Narrow Gym");
    const state = makeState({
      player: { active: inPlay("Machop"), bench: benchOf(3) },
      opponent: { active: inPlay("Machop"), bench: benchOf(5), hand: [gym] },
      isPlayerTurn: false,
    });
    const next = executeAIAction(state, { type: "playTrainer", cardId: gym.id, trainerName: gym.name, selections: [] } as never);
    expect(next.stadium).toEqual({ card: gym, playedBy: "opponent" });
    expect(next.opponentBench).toHaveLength(4);
    expect(next.opponentHand).toHaveLength(1);
    expect(next.pendingBenchTrim).toBeUndefined();
  });
});

// ============================================================================
// No Removal Gym
// ============================================================================

describe("No Removal Gym: discard 2 cards from the hand to play Energy Removal / Super Energy Removal", () => {
  const target = () => inPlay("Machop", { energy: [Fighting] });

  it("with fewer than 2 other cards in the hand it can't be played", () => {
    const removal = gameCard("Energy Removal");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [removal, gameCard("Abra")] },
      opponent: { active: target() },
      stadium: inPlayStadium("No Removal Gym", "opponent"),
    });
    expect(stadiumExtraTrainerDiscards(state, "Energy Removal")).toBe(2);
    expect(stadiumExtraTrainerDiscards(state, "Super Energy Removal")).toBe(2);
    expect(stadiumExtraTrainerDiscards(state, "Potion")).toBe(0);
    expect(canPlayTrainerCard(state, removal.id)).toBe("Necesitas descartar 2 cartas de tu mano para jugar esta carta");
    expect(canPlayTrainerCard({ ...state, stadium: null }, removal.id)).toBeNull();
  });

  it("with enough cards the 2 discards are asked first, then the card's own steps", () => {
    const removal = gameCard("Energy Removal");
    const abra = gameCard("Abra");
    const bill = gameCard("Bill");
    const defender = target();
    const state = deepFreeze(makeState({
      player: { active: inPlay("Machop"), hand: [removal, abra, bill] },
      opponent: { active: defender },
      stadium: inPlayStadium("No Removal Gym"),
    }));
    expect(canPlayTrainerCard(state, removal.id)).toBeNull();
    const first = getTrainerSteps(state, removal.id, [])!;
    expect(first.source).toBe("hand");
    expect(first.maxSelections).toBe(2);
    expect(first.options.map((o) => o.id)).toEqual([abra.id, bill.id]);
    const second = getTrainerSteps(state, removal.id, [[abra.id, bill.id]])!;
    expect(second.options.map((o) => o.id)).toEqual([defender.attachedEnergy[0].id]);
    expect(getTrainerSteps(state, removal.id, [[abra.id, bill.id], [defender.attachedEnergy[0].id]])).toBeNull();

    // The card's old answers alone are no longer valid
    expect(() => playTrainerCard(state, removal.id, [[defender.attachedEnergy[0].id]])).toThrow(IllegalActionError);
    const next = playTrainerCard(state, removal.id, [[abra.id, bill.id], [defender.attachedEnergy[0].id]]);
    expect(next.playerHand).toEqual([]);
    expect(names(next.playerDiscard).sort()).toEqual(["Abra", "Bill", "Energy Removal"].sort());
    expect(next.opponentActivePokemon!.attachedEnergy).toEqual([]);
    expect(names(next.opponentDiscard)).toEqual(["Fighting Energy"]);
  });

  it("Super Energy Removal asks for the discards first too; other Trainers don't", () => {
    const ser = gameCard("Super Energy Removal");
    const potion = gameCard("Potion");
    const state = makeState({
      player: { active: inPlay("Machop", { energy: [Fighting], damage: 20 }), hand: [ser, potion, gameCard("Abra"), energy(Water)] },
      opponent: { active: target() },
      stadium: inPlayStadium("No Removal Gym"),
    });
    expect(getTrainerSteps(state, ser.id, [])!.source).toBe("hand");
    expect(getTrainerSteps(state, ser.id, [])!.options).toHaveLength(3);
    expect(getTrainerSteps(state, potion.id, [])!.source).toBeUndefined();
  });
});
