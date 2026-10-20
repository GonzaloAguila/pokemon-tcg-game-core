/**
 * Team Rocket Pokémon Powers: passive / triggered (Hay Fever, Sticky Goo, Sinkhole, Final
 * Beam, Frenzy) and activated (Trickery, Evolutionary Light, Matter Exchange, Gather Fire,
 * Long-Distance Hypnosis, Pollen Stench).
 */
import { describe, it, expect } from "vitest";
import {
  executeAttack,
  executeRetreat,
  getAttackCoinPlan,
  getRetreatCoinFlips,
  getRetreatCost,
  hasEnoughEnergyToRetreat,
  resolveConfusionFlip,
} from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { canPlayBasicPokemon } from "@/domain/board";
import { canPlayTrainerCard, canUsePokemonPower, getPowerCoinFlips, getPowerSteps, usePokemonPower } from "@/domain/effects";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Water, Fire, Grass, Fighting, Psychic } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const card = (name: string) => gameCard(name, "rocket");

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });

describe("Hay Fever (Dark Vileplume)", () => {
  it("no Trainer cards can be played by either player while it works (Bench too)", () => {
    const bill = gameCard("Bill", "base");
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const own = makeState({ player: { active: inPlay("Machop"), bench: [rocket("Dark Vileplume")], hand: [bill, fossil] }, opponent: { active: inPlay("Onix") } });
    expect(canPlayTrainerCard(own, bill.id)).toMatch(/Fiebre del Heno/);
    expect(canPlayBasicPokemon(own, fossil.id, "bench")).toMatch(/Fiebre del Heno/);
    const theirs = makeState({ player: { active: inPlay("Machop"), hand: [bill] }, opponent: { active: inPlay("Onix"), bench: [rocket("Dark Vileplume")] } });
    expect(canPlayTrainerCard(theirs, bill.id)).toMatch(/Fiebre del Heno/);
  });

  it("stops while Dark Vileplume is Asleep, or under Goop Gas Attack", () => {
    const bill = gameCard("Bill", "base");
    const asleep = makeState({ player: { active: rocket("Dark Vileplume", { statuses: [StatusCondition.Asleep] }), hand: [bill] }, opponent: { active: inPlay("Onix") } });
    expect(canPlayTrainerCard(asleep, bill.id)).toBeNull();
    const goop = makeState({
      player: { active: rocket("Dark Vileplume"), hand: [bill] },
      opponent: { active: inPlay("Onix") },
      powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: 4 }],
    });
    expect(canPlayTrainerCard(goop, bill.id)).toBeNull();
  });
});

describe("Sticky Goo (Dark Muk)", () => {
  it("the opponent's Active pays 2 more to retreat while Dark Muk is the Active", () => {
    const machop = inPlay("Machop", { energy: [Fighting, Fighting] });
    const state = makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: rocket("Dark Muk") } });
    expect(getRetreatCost(machop, state.playerBench, state)).toBe(3);
    expect(hasEnoughEnergyToRetreat(machop, state.playerBench, state)).toBe(false);
    const benched = makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Onix"), bench: [rocket("Dark Muk")] } });
    expect(getRetreatCost(machop, benched.playerBench, benched)).toBe(1);
    const asleep = makeState({ player: { active: machop }, opponent: { active: rocket("Dark Muk", { statuses: [StatusCondition.Asleep] }) } });
    expect(getRetreatCost(machop, [], asleep)).toBe(1);
  });

  it("executeRetreat requires the extra Energy", () => {
    const machop = inPlay("Machop", { energy: [Fighting] });
    const state = makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: rocket("Dark Muk") } });
    const next = executeRetreat(state, machop.attachedEnergy.map((e) => e.id), 0);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Machop");
  });
});

describe("Sinkhole (Dark Dugtrio)", () => {
  const setup = (opponentBench = [rocket("Dark Dugtrio")]) => {
    const machop = inPlay("Machop", { energy: [Fighting], damage: 20 });
    return makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Onix"), bench: opponentBench } });
  };

  it("the retreating player flips one coin per working Sinkhole; tails = 20 damage (no W/R) to the Pokémon that retreated", () => {
    const state = deepFreeze(setup());
    expect(getRetreatCoinFlips(state)).toBe(1);
    const ids = state.playerActivePokemon!.attachedEnergy.map((e) => e.id);
    const tails = executeRetreat(state, ids, 0, { coinResults: [T] });
    expect(tails.playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(tails.playerBench[0].pokemon.name).toBe("Machop");
    expect(tails.playerBench[0].currentDamage).toBe(40);
    const heads = executeRetreat(state, ids, 0, { coinResults: [H] });
    expect(heads.playerBench[0].currentDamage).toBe(20);
    expect(() => executeRetreat(state, ids, 0, { coinResults: [] })).toThrow(/coin/);
  });

  it("can Knock Out the Pokémon on the Bench (Prize for the Dugtrio's owner)", () => {
    const state = setup();
    const machop = state.playerActivePokemon!;
    const hurt = { ...state, playerActivePokemon: { ...machop, currentDamage: 40 } };
    const next = executeRetreat(hurt, machop.attachedEnergy.map((e) => e.id), 0, { coinResults: [T] });
    expect(next.playerBench).toHaveLength(0);
    expect(next.opponentPrizes).toHaveLength(5);
  });

  it("no coin when Dark Dugtrio is Asleep or is the retreating player's own", () => {
    expect(getRetreatCoinFlips(setup([rocket("Dark Dugtrio", { statuses: [StatusCondition.Asleep] })]))).toBe(0);
    const own = makeState({ player: { active: inPlay("Machop"), bench: [rocket("Dark Dugtrio")] }, opponent: { active: inPlay("Onix") } });
    expect(getRetreatCoinFlips(own)).toBe(0);
  });
});

describe("Final Beam (Dark Gyarados)", () => {
  it("is the defender coin of the attack's plan; heads on a Knock Out = 20 × Water Energy to the attacker, with W/R", () => {
    const gyarados = rocket("Dark Gyarados", { energy: [Water, Water], damage: 40 });
    const attacker = inPlay("Electabuzz", { energy: [Psychic, Psychic] }); // 70 HP, Lightning: no Water weakness
    const state = vs(attacker, gyarados);
    expect(getAttackCoinPlan(state, 1)).toEqual({ smokescreen: 0, attack: 1, defender: 1 });
    // Thunderpunch 30 (+10 on heads) Knocks Out Dark Gyarados (70 HP, 40 damage)
    const heads = attack(state, "Puño-trueno", [T, H]);
    expect(heads.opponentActivePokemon?.pokemon.name).not.toBe("Dark Gyarados");
    expect(heads.playerActivePokemon!.currentDamage).toBe(10 + 40);
    const tails = attack(state, "Puño-trueno", [T, T]);
    expect(tails.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("applies Weakness (Charmander takes double) and can Knock Out the attacker", () => {
    const gyarados = rocket("Dark Gyarados", { energy: [Water], damage: 60 });
    const charmander = rocket("Charmander", { energy: [Fire] });
    const state = vs(charmander, gyarados, { player: { bench: [inPlay("Abra")] } });
    const next = attack(state, "Cola Ígnea", [H]);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(5);
  });

  it("doesn't work when the attack doesn't Knock it Out, or while Asleep", () => {
    const gyarados = rocket("Dark Gyarados", { energy: [Water] });
    const state = vs(rocket("Charmander", { energy: [Fire] }), gyarados);
    expect(attack(state, "Cola Ígnea", [H]).playerActivePokemon!.currentDamage).toBe(0);
    const asleep = vs(rocket("Charmander", { energy: [Fire] }), rocket("Dark Gyarados", { statuses: [StatusCondition.Asleep] }));
    expect(getAttackCoinPlan(asleep, 0).defender).toBe(0);
  });
});

describe("Frenzy (Dark Primeape)", () => {
  it("+30 damage while Confused (attack damage, before Weakness)", () => {
    const primeape = rocket("Dark Primeape", { energy: [Fighting, Fighting], statuses: [StatusCondition.Confused] });
    const next = attack(vs(primeape, inPlay("Onix")), "Ataque Frenético");
    expect(next.opponentActivePokemon!.currentDamage).toBe(70);
    const calm = attack(vs(rocket("Dark Primeape", { energy: [Fighting, Fighting] }), inPlay("Onix")), "Ataque Frenético");
    expect(calm.opponentActivePokemon!.currentDamage).toBe(40);
    expect(calm.playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
  });

  it("confusion damage to itself is 20 + 30", () => {
    const primeape = rocket("Dark Primeape", { statuses: [StatusCondition.Confused] });
    const { state } = resolveConfusionFlip(vs(primeape, inPlay("Onix")), false, true);
    expect(state.playerActivePokemon!.currentDamage).toBe(50);
  });
});

describe("activated powers", () => {
  it("Trickery (Rattata): switch 1 Prize (by position, face down) with the top card of the deck, once per turn", () => {
    const rattata = rocket("Rattata");
    const prizes = [energy(Water), card("Abra"), energy(Water)];
    const deck = [card("Machop"), energy(Grass)];
    const state = deepFreeze(makeState({ player: { active: rattata, prizes, deck }, opponent: { active: inPlay("Onix") } }));
    const step = getPowerSteps(state, rattata.pokemon.id, [])!;
    expect(step.options.map((o) => o.label)).toEqual(["Premio 1", "Premio 2", "Premio 3"]);
    const next = usePokemonPower(state, rattata.pokemon.id, [["1"]]);
    expect(names(next.playerPrizes)).toEqual(["Water Energy", "Machop", "Water Energy"]);
    expect(names(next.playerDeck)).toEqual(["Abra", "Grass Energy"]);
    expect(canUsePokemonPower(next, rattata.pokemon.id)).toMatch(/ya fue usado/);
  });

  it("Evolutionary Light (Dark Dragonair): an Evolution card from the deck into the hand", () => {
    const dragonair = rocket("Dark Dragonair");
    const deck = [card("Abra"), card("Dark Golbat"), energy(Fire), card("Dark Dragonite")];
    const state = makeState({ player: { active: dragonair, deck }, opponent: { active: inPlay("Onix") } });
    const step = getPowerSteps(state, dragonair.pokemon.id, [])!;
    expect(step.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Dark Golbat", "Dark Dragonite"]);
    const next = usePokemonPower(state, dragonair.pokemon.id, [[step.options[1].id]]);
    expect(names(next.playerHand)).toEqual(["Dark Dragonite"]);
    expect(next.playerDeck).toHaveLength(3);
  });

  it("Matter Exchange (Dark Kadabra): discard a card from the hand to draw one", () => {
    const kadabra = rocket("Dark Kadabra");
    const bill = gameCard("Bill", "base");
    const state = makeState({ player: { active: kadabra, hand: [bill], deck: [card("Abra")] }, opponent: { active: inPlay("Onix") } });
    const next = usePokemonPower(state, kadabra.pokemon.id, [[bill.id]]);
    expect(names(next.playerHand)).toEqual(["Abra"]);
    expect(names(next.playerDiscard)).toEqual(["Bill"]);
    const empty = makeState({ player: { active: kadabra, hand: [] }, opponent: { active: inPlay("Onix") } });
    expect(canUsePokemonPower(empty, kadabra.pokemon.id)).not.toBeNull();
  });

  it("Gather Fire (Charmander): a Fire Energy card from another own Pokémon onto Charmander", () => {
    const charmander = rocket("Charmander");
    const ponyta = rocket("Ponyta", { energy: [Fire, Water] });
    const state = makeState({ player: { active: ponyta, bench: [charmander] }, opponent: { active: inPlay("Onix") } });
    const step = getPowerSteps(state, charmander.pokemon.id, [])!;
    expect(step.options.map((o) => o.label)).toEqual(["Energía Fuego (Ponyta)"]);
    const next = usePokemonPower(state, charmander.pokemon.id, [[step.options[0].id]]);
    expect(next.playerBench[0].attachedEnergy.map((e) => e.name)).toEqual(["Fire Energy"]);
    expect(next.playerActivePokemon!.attachedEnergy.map((e) => e.name)).toEqual(["Water Energy"]);
    const none = makeState({ player: { active: charmander, bench: [rocket("Ponyta", { energy: [Water] })] }, opponent: { active: inPlay("Onix") } });
    expect(canUsePokemonPower(none, charmander.pokemon.id)).not.toBeNull();
  });

  it("Long-Distance Hypnosis (Drowzee): heads Defending Asleep, tails your own Active Asleep", () => {
    const drowzee = rocket("Drowzee");
    const state = makeState({ player: { active: inPlay("Machop"), bench: [drowzee] }, opponent: { active: inPlay("Onix") } });
    expect(getPowerCoinFlips(state, drowzee.pokemon.id)).toBe(1);
    const heads = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [H] });
    expect(heads.opponentActivePokemon!.statusConditions).toEqual([StatusCondition.Asleep]);
    const tails = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [T] });
    expect(tails.playerActivePokemon!.statusConditions).toEqual([StatusCondition.Asleep]);
    expect(canUsePokemonPower(tails, drowzee.pokemon.id)).toMatch(/ya fue usado/);
  });

  it("Pollen Stench (Dark Gloom): Confused instead; Snorlax's Thick Skinned stops it on the Defending side", () => {
    const gloom = rocket("Dark Gloom");
    const state = makeState({ player: { active: gloom }, opponent: { active: inPlay("Snorlax") } });
    const heads = usePokemonPower(state, gloom.pokemon.id, [], { coinResults: [H] });
    expect(heads.opponentActivePokemon!.statusConditions).toEqual([]);
    const tails = usePokemonPower(state, gloom.pokemon.id, [], { coinResults: [T] });
    expect(tails.playerActivePokemon!.statusConditions).toEqual([StatusCondition.Confused]);
  });
});
