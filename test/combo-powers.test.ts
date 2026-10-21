import { prizesOwed } from "@/lib/gameState";
/**
 * Pokémon Power combinations across Base Set, Jungle, Fossil and Team Rocket: suppressors
 * (Toxic Gas, Goop Gas Attack, Stare, Special Conditions) against every activated power, and
 * activated / passive / on-play powers crossing each other and other sets' cards.
 */
import { describe, it, expect } from "vitest";
import {
  canExecuteAttack,
  endTurn,
  executeAttack,
  getAttackCoinPlan,
  getRetreatCoinFlips,
  resolveAttackChoice,
  resolveConfusionFlip,
  resolvePowerChoice,
} from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { canPlayTrainerCard, canUsePokemonPower, getPowerSteps, playTrainerCard, usePokemonPower } from "@/domain/effects";
import {
  attachEnergyCard,
  canAttachEnergy,
  canEvolve,
  evolvePokemonCard,
  getEvolutionBlocker,
  getTrainerBlocker,
  playBasicPokemon,
} from "@/domain/board";
import { hasStatusImmunity, isHandRevealed } from "@/domain/powers";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Water, Fire, Grass, Fighting, Lightning } = EnergyType;
const { Asleep, Confused, Paralyzed, Poisoned } = StatusCondition;
const H = "heads" as const;
const T = "tails" as const;

const fossil = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "fossil", ...opts });
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const jungle = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "jungle", ...opts });
const muk = (opts: Parameters<typeof inPlay>[1] = {}) => fossil("Muk", opts);
const goopGas = (state: GameState): GameState => ({
  ...state,
  powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: state.turnNumber + 1 }],
});
const withStatus = (pokemon: PokemonInPlay, status: StatusCondition): PokemonInPlay => ({ ...pokemon, statusConditions: [status] });

// ============================================================================
// Every activated power × every suppressor
// ============================================================================

type PowerCase = { power: string; build: (status?: StatusCondition) => { state: GameState; id: string } };

/** The power's Pokémon is the player's Active (Step In: on the Bench) and the power is usable. */
const ACTIVATED: PowerCase[] = [
  { power: "Rain Dance", build: (s) => one(inPlay("Blastoise"), s, { hand: [energy(Water)] }) },
  { power: "Energy Trans", build: (s) => one(inPlay("Venusaur", { energy: [Grass] }), s, { bench: [inPlay("Bulbasaur")] }) },
  { power: "Damage Swap", build: (s) => one(inPlay("Alakazam", { damage: 20 }), s, { bench: [inPlay("Machop")] }) },
  { power: "Energy Burn", build: (s) => one(inPlay("Charizard", { energy: [Water] }), s) },
  { power: "Buzzap", build: (s) => one(inPlay("Electrode"), s, { bench: [inPlay("Machop")] }) },
  { power: "Heal", build: (s) => one(jungle("Vileplume", { damage: 20 }), s) },
  { power: "Shift", build: (s) => one(jungle("Venomoth"), s) },
  { power: "Peek", build: (s) => one(jungle("Mankey"), s) },
  { power: "Curse", build: (s) => one(fossil("Gengar"), s, {}, { active: inPlay("Onix", { damage: 10 }), bench: [inPlay("Abra")] }) },
  { power: "Strange Behavior", build: (s) => one(fossil("Slowbro"), s, { bench: [inPlay("Machop", { damage: 20 })] }) },
  { power: "Cowardice", build: (s) => one(fossil("Tentacool", { playedOnTurn: 1 }), s, { bench: [inPlay("Machop")] }) },
  { power: "Trickery", build: (s) => one(rocket("Rattata"), s) },
  { power: "Evolutionary Light", build: (s) => one(rocket("Dark Dragonair"), s) },
  { power: "Matter Exchange", build: (s) => one(rocket("Dark Kadabra"), s, { hand: [gameCard("Bill", "base")] }) },
  { power: "Gather Fire", build: (s) => one(rocket("Charmander"), s, { bench: [rocket("Ponyta", { energy: [Fire] })] }) },
  { power: "Long-Distance Hypnosis", build: (s) => one(rocket("Drowzee"), s) },
  { power: "Pollen Stench", build: (s) => one(rocket("Dark Gloom"), s) },
];

function one(
  pokemon: PokemonInPlay,
  status: StatusCondition | undefined,
  player: { hand?: ReturnType<typeof gameCard>[]; bench?: PokemonInPlay[] } = {},
  opponent: { active?: PokemonInPlay; bench?: PokemonInPlay[] } = {}
): { state: GameState; id: string } {
  const active = status ? withStatus(pokemon, status) : pokemon;
  const state = makeState({
    turnNumber: 3,
    player: { active, bench: player.bench ?? [], hand: player.hand ?? [] },
    opponent: { active: opponent.active ?? inPlay("Onix"), bench: opponent.bench ?? [] },
  });
  return { state, id: pokemon.pokemon.id };
}

describe("every activated power stops under Toxic Gas, Goop Gas Attack and Asleep/Confused/Paralyzed (not Poison)", () => {
  it.each(ACTIVATED.map((c, i) => [c.power, c, [Asleep, Confused, Paralyzed][i % 3]] as const))(
    "%s",
    (_name, { build }, status) => {
      const { state, id } = build();
      expect(canUsePokemonPower(state, id)).toBeNull();
      // Muk on the OPPONENT's Bench: Toxic Gas affects both players
      const gassed = { ...state, opponentBench: [...state.opponentBench, muk()] };
      expect(canUsePokemonPower(gassed, id)).toMatch(/no funciona/);
      expect(canUsePokemonPower(goopGas(state), id)).toMatch(/no funciona/);
      // ...but a Toxic Gas that is itself Asleep / under Goop Gas doesn't count
      expect(canUsePokemonPower({ ...state, opponentBench: [...state.opponentBench, muk({ statuses: [Asleep] })] }, id)).toBeNull();
      // Special Conditions on the power's owner (Poison doesn't stop powers)
      const statused = build(status);
      expect(canUsePokemonPower(statused.state, statused.id)).toMatch(/estado alterado/);
      const poisoned = build(Poisoned);
      expect(canUsePokemonPower(poisoned.state, poisoned.id)).toBeNull();
    }
  );

  it("Step In (Dragonite works from the Bench, where it has no conditions): Toxic Gas and Goop Gas stop it", () => {
    const dragonite = fossil("Dragonite");
    const state = makeState({ player: { active: inPlay("Machop", { statuses: [Paralyzed] }), bench: [dragonite] }, opponent: { active: inPlay("Onix") } });
    expect(canUsePokemonPower(state, dragonite.pokemon.id)).toBeNull();
    expect(canUsePokemonPower({ ...state, opponentBench: [muk()] }, dragonite.pokemon.id)).toMatch(/no funciona/);
    expect(canUsePokemonPower(goopGas(state), dragonite.pokemon.id)).toMatch(/no funciona/);
  });
});

// ============================================================================
// Suppressors switching each other (and passive powers) off
// ============================================================================

describe("suppressors against suppressors", () => {
  it("Muk vs Muk: a Confused Muk's Toxic Gas stops, another working Muk still ignores every power", () => {
    const omanyte = fossil("Omanyte");
    const one = makeState({ player: { active: muk({ statuses: [Confused] }), bench: [omanyte] }, opponent: { active: inPlay("Onix") } });
    expect(isHandRevealed(one, "opponent")).toBe(true);
    const two = { ...one, opponentBench: [muk()] };
    expect(isHandRevealed(two, "opponent")).toBe(false);
  });

  it("Stare on Muk lifts Toxic Gas until the end of the opponent's next turn", () => {
    const arbok = armedFor(rocket("Dark Arbok"), "Mirada");
    const gasMuk = muk();
    let state = makeState({ player: { active: arbok, bench: [fossil("Omanyte")] }, opponent: { active: inPlay("Onix"), bench: [gasMuk] } });
    expect(isHandRevealed(state, "opponent")).toBe(false);
    state = executeAttack(state, attackIndex(arbok, "Mirada"), { skipEndTurn: true });
    state = resolveAttackChoice(state, [gasMuk.pokemon.id], { skipEndTurn: true });
    expect(isHandRevealed(state, "opponent")).toBe(true);
    const theirTurn = endTurn(state);
    expect(isHandRevealed(theirTurn, "opponent")).toBe(true);
    expect(isHandRevealed(endTurn(theirTurn), "opponent")).toBe(false);
  });

  it("a Ditto copying an Asleep Muk gets its HP but not Toxic Gas (Transform keeps only Transform)", () => {
    const state = makeState({
      player: { active: fossil("Ditto"), bench: [fossil("Omanyte")] },
      opponent: { active: muk({ statuses: [Asleep] }) },
    });
    expect(isHandRevealed(state, "opponent")).toBe(true);
  });

  it("Toxic Gas turns Prehistoric Power off: a Mysterious Fossil may evolve into Aerodactyl, which then blocks nothing", () => {
    const mysterious = fossil("Mysterious Fossil");
    const aerodactyl = gameCard("Aerodactyl", "fossil");
    const blocked = makeState({ player: { active: mysterious, hand: [aerodactyl] }, opponent: { active: fossil("Aerodactyl") } });
    expect(canEvolve(blocked, aerodactyl.id, mysterious.pokemon.id)).toMatch(/Prehistórico/);
    const gassed = { ...blocked, opponentBench: [muk()] };
    expect(canEvolve(gassed, aerodactyl.id, mysterious.pokemon.id)).toBeNull();
    const evolved = evolvePokemonCard(gassed, aerodactyl.id, mysterious.pokemon.id);
    expect(evolved.playerActivePokemon!.pokemon.name).toBe("Aerodactyl");
    expect(getEvolutionBlocker(evolved)).toBeNull();
  });

  it("Long-Distance Hypnosis heads puts the Defending Aerodactyl to sleep: evolving is legal again", () => {
    const drowzee = rocket("Drowzee");
    const charmander = inPlay("Charmander", { set: "base" });
    const charmeleon = gameCard("Charmeleon", "base");
    const state = makeState({ player: { active: charmander, bench: [drowzee], hand: [charmeleon] }, opponent: { active: fossil("Aerodactyl") } });
    expect(canEvolve(state, charmeleon.id, charmander.pokemon.id)).toMatch(/Prehistórico/);
    const asleep = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [H] });
    expect(canEvolve(asleep, charmeleon.id, charmander.pokemon.id)).toBeNull();
  });

  it("Long-Distance Hypnosis tails puts your own Active Dark Vileplume to sleep: Trainers can be played", () => {
    const drowzee = rocket("Drowzee");
    const bill = gameCard("Bill", "base");
    const state = makeState({ player: { active: rocket("Dark Vileplume"), bench: [drowzee], hand: [bill] }, opponent: { active: inPlay("Onix") } });
    expect(canPlayTrainerCard(state, bill.id)).toMatch(/Fiebre del Heno/);
    const tails = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [T] });
    expect(tails.playerActivePokemon!.statusConditions).toEqual([Asleep]);
    expect(canPlayTrainerCard(tails, bill.id)).toBeNull();
  });

  it("an Asleep Dark Gloom evolving into Dark Vileplume wakes up (evolution cures): Hay Fever works at once", () => {
    const gloom = rocket("Dark Gloom", { statuses: [Asleep] });
    const vileplume = gameCard("Dark Vileplume", "rocket");
    const state = makeState({ player: { active: gloom, hand: [vileplume] }, opponent: { active: inPlay("Onix") } });
    expect(getTrainerBlocker(state)).toBeNull();
    expect(getTrainerBlocker(evolvePokemonCard(state, vileplume.id, gloom.pokemon.id))).toMatch(/Fiebre del Heno/);
  });

  it("Stare on Dark Gloom ends when it evolves: Dark Vileplume's Hay Fever works", () => {
    const gloom = rocket("Dark Gloom");
    const vileplume = gameCard("Dark Vileplume", "rocket");
    const state = makeState({
      player: { active: gloom, hand: [vileplume] },
      opponent: { active: inPlay("Onix") },
      powersSuppressed: [{ source: "Mirada", pokemonId: gloom.pokemon.id, expiresAfterTurn: 3 }],
    });
    expect(canUsePokemonPower(state, gloom.pokemon.id)).toMatch(/no funciona/);
    expect(getTrainerBlocker(evolvePokemonCard(state, vileplume.id, gloom.pokemon.id))).toMatch(/Fiebre del Heno/);
  });

  it("Hay Fever + Goop Gas Attack: Goop Gas can't be played under Hay Fever; played first, a new Dark Vileplume blocks nothing until it expires", () => {
    const goop = gameCard("Goop Gas Attack", "rocket");
    const blocked = makeState({ player: { active: inPlay("Machop"), hand: [goop] }, opponent: { active: rocket("Dark Vileplume") } });
    expect(canPlayTrainerCard(blocked, goop.id)).toMatch(/Fiebre del Heno/);

    const vileplume = gameCard("Dark Vileplume", "rocket");
    const bill = gameCard("Bill", "base");
    const gloom = rocket("Dark Gloom");
    let state = makeState({ turnNumber: 3, player: { active: gloom, hand: [goop, vileplume, bill] }, opponent: { active: inPlay("Onix") } });
    state = playTrainerCard(state, goop.id);
    state = evolvePokemonCard(state, vileplume.id, gloom.pokemon.id);
    expect(canPlayTrainerCard(state, bill.id)).toBeNull();
    const turn4 = endTurn(state);
    expect(getTrainerBlocker(turn4)).toBeNull(); // the opponent's next turn: still suppressed
    const turn5 = endTurn(turn4);
    expect(getTrainerBlocker(turn5)).toMatch(/Fiebre del Heno/);
  });

  it("Pokémon Breeder under an Asleep Aerodactyl: Dark Dragonite is played and Summon Minions triggers; under Toxic Gas it doesn't", () => {
    const setup = (opponentBench: PokemonInPlay[]) => {
      const breeder = gameCard("Pokémon Breeder", "base");
      const dragonite = gameCard("Dark Dragonite", "rocket");
      const dratini = rocket("Dratini");
      const state = makeState({
        player: { active: dratini, hand: [breeder, dragonite], deck: [gameCard("Abra", "base"), energy(Water)] },
        opponent: { active: fossil("Aerodactyl", { statuses: [Asleep] }), bench: opponentBench },
      });
      return playTrainerCard(state, breeder.id, [[dragonite.id], [dratini.pokemon.id]]);
    };
    const asleep = setup([]);
    expect(asleep.playerActivePokemon!.pokemon.name).toBe("Dark Dragonite");
    expect(asleep.pendingPowerChoice).toBeDefined();
    const gassed = setup([muk()]);
    expect(gassed.playerActivePokemon!.pokemon.name).toBe("Dark Dragonite");
    expect(gassed.pendingPowerChoice).toBeUndefined();
  });

  it("Sinkhole: a Dark Dugtrio under Stare flips no coin, the other one still does", () => {
    const first = rocket("Dark Dugtrio");
    const stared = rocket("Dark Dugtrio");
    const state = makeState({
      player: { active: inPlay("Machop", { energy: [Fighting] }), bench: [inPlay("Abra")] },
      opponent: { active: first, bench: [stared] },
    });
    expect(getRetreatCoinFlips(state)).toBe(2);
    expect(getRetreatCoinFlips({ ...state, powersSuppressed: [{ source: "Mirada", pokemonId: stared.pokemon.id, expiresAfterTurn: 9 }] })).toBe(1);
  });

  it("Thick Skinned is off under Toxic Gas: Snorlax can be affected by Special Conditions", () => {
    const snorlax = jungle("Snorlax");
    expect(hasStatusImmunity(snorlax, makeState({ player: { active: snorlax }, opponent: { active: inPlay("Onix") } }))).toBe(true);
    expect(hasStatusImmunity(snorlax, makeState({ player: { active: snorlax }, opponent: { active: muk() } }))).toBe(false);
  });

  // Card text: "This power can't be used if Snorlax is already Asleep, Confused, or Paralyzed."
  it("Thick Skinned doesn't work while Snorlax is already Confused (e.g. confused under Toxic Gas, Muk gone)", () => {
    const snorlax = jungle("Snorlax", { statuses: [Confused] });
    expect(hasStatusImmunity(snorlax, makeState({ player: { active: snorlax }, opponent: { active: inPlay("Onix") } }))).toBe(false);
  });

  it("Frenzy (Dark Primeape) is a power: under Toxic Gas a Confused Dark Primeape does no extra damage", () => {
    const primeape = rocket("Dark Primeape", { energy: [Fighting, Fighting], statuses: [Confused] });
    const state = makeState({ player: { active: primeape }, opponent: { active: inPlay("Onix"), bench: [muk()] } });
    expect(executeAttack(state, 0, { skipEndTurn: true }).opponentActivePokemon!.currentDamage).toBe(40);
  });

  it("Final Beam doesn't flip under Toxic Gas; Transparency neither", () => {
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const gyarados = makeState({ player: { active: machop }, opponent: { active: rocket("Dark Gyarados"), bench: [muk()] } });
    expect(getAttackCoinPlan(gyarados, 0).defender).toBe(0);
    const haunter = makeState({ player: { active: machop }, opponent: { active: fossil("Haunter"), bench: [muk()] } });
    expect(getAttackCoinPlan(haunter, 0).defender).toBe(0);
  });
});

// ============================================================================
// Activated powers crossing other cards
// ============================================================================

describe("Damage Swap / Curse / Strange Behavior: moving damage counters", () => {
  it("Damage Swap can't Knock Out a transformed Ditto: the room is the copied HP (Abra: 30)", () => {
    const ditto = fossil("Ditto");
    const alakazam = inPlay("Alakazam", { damage: 40 });
    const state = deepFreeze(makeState({ player: { active: ditto, bench: [alakazam] }, opponent: { active: inPlay("Abra", { set: "base" }) } }));
    const amounts = getPowerSteps(state, alakazam.pokemon.id, [[alakazam.pokemon.id], [ditto.pokemon.id]])!.options.map((o) => o.id);
    expect(amounts).toEqual(["10", "20"]);
    expect(() => usePokemonPower(state, alakazam.pokemon.id, [[alakazam.pokemon.id], [ditto.pokemon.id], ["30"]])).toThrow();
    const moved = usePokemonPower(state, alakazam.pokemon.id, [[alakazam.pokemon.id], [ditto.pokemon.id], ["20"]]);
    expect(moved.playerActivePokemon!.pokemon.name).toBe("Ditto");
    expect(moved.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("Damage Swap may put 30 or more onto Mr. Mime: Invisible Wall only stops attacks", () => {
    const alakazam = inPlay("Alakazam", { damage: 30 });
    const mrMime = jungle("Mr. Mime");
    const state = makeState({ player: { active: alakazam, bench: [mrMime] }, opponent: { active: inPlay("Onix") } });
    const next = usePokemonPower(state, alakazam.pokemon.id, [[alakazam.pokemon.id], [mrMime.pokemon.id], ["30"]]);
    expect(next.playerBench[0].currentDamage).toBe(30);
  });

  it("Curse onto a Clefairy Doll Knocks it Out without a Prize", () => {
    const gengar = fossil("Gengar");
    const doll = inPlay("Clefairy Doll", { set: "base" });
    const state = makeState({ player: { active: gengar }, opponent: { active: inPlay("Machop", { damage: 10 }), bench: [doll] } });
    const next = usePokemonPower(state, gengar.pokemon.id, [[state.opponentActivePokemon!.pokemon.id], [doll.pokemon.id]]);
    expect(next.opponentBench).toEqual([]);
    expect(names(next.opponentDiscard)).toEqual(["Clefairy Doll"]);
    expect(next.playerPrizes).toHaveLength(6);
  });

  it("Curse isn't an attack: a Knocked Out Dark Gyarados has no Final Beam, a damaged Machamp no Strikes Back", () => {
    const gengar = fossil("Gengar");
    const gyarados = rocket("Dark Gyarados", { damage: 60, energy: [Water, Water] });
    const ko = makeState({ player: { active: gengar }, opponent: { active: gyarados, bench: [inPlay("Machop", { damage: 10 })] } });
    const afterKo = usePokemonPower(ko, gengar.pokemon.id, [[ko.opponentBench[0].pokemon.id], [gyarados.pokemon.id]]);
    expect(afterKo.opponentActivePokemon).toBeNull();
    expect(prizesOwed(afterKo, "player")).toBe(1);
    expect(afterKo.playerActivePokemon!.currentDamage).toBe(0);

    const machamp = makeState({ player: { active: gengar }, opponent: { active: inPlay("Machamp"), bench: [inPlay("Machop", { damage: 10 })] } });
    const afterMachamp = usePokemonPower(machamp, gengar.pokemon.id, [[machamp.opponentBench[0].pokemon.id], [machamp.opponentActivePokemon!.pokemon.id]]);
    expect(afterMachamp.opponentActivePokemon!.currentDamage).toBe(10);
    expect(afterMachamp.playerActivePokemon!.currentDamage).toBe(0);
  });
});

describe("on-play powers crossing reactions", () => {
  function sneakAttack(opponentActive: PokemonInPlay, opponentBench: PokemonInPlay[]) {
    const golbat = gameCard("Dark Golbat", "rocket");
    const zubat = rocket("Zubat");
    const state = makeState({ player: { active: zubat, hand: [golbat] }, opponent: { active: opponentActive, bench: opponentBench } });
    return evolvePokemonCard(state, golbat.id, zubat.pokemon.id);
  }

  it("Sneak Attack isn't an attack: no Strikes Back from Machamp, no Final Beam from a Knocked Out Dark Gyarados", () => {
    const gyarados = rocket("Dark Gyarados", { damage: 60, energy: [Water, Water] });
    const machamp = inPlay("Machamp");
    const pending = sneakAttack(gyarados, [machamp]);
    const hitMachamp = resolvePowerChoice(pending, [machamp.pokemon.id]);
    expect(hitMachamp.opponentBench[0].currentDamage).toBe(10);
    expect(hitMachamp.playerActivePokemon!.currentDamage).toBe(0);
    const koGyarados = resolvePowerChoice(pending, [gyarados.pokemon.id]);
    expect(koGyarados.opponentActivePokemon).toBeNull();
    expect(koGyarados.opponentNeedsToPromote).toBe(true);
    expect(prizesOwed(koGyarados, "player")).toBe(1);
    expect(koGyarados.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("Sneak Attack Knocks Out a Benched Mysterious Fossil without a Prize", () => {
    const mysterious = fossil("Mysterious Fossil");
    const pending = sneakAttack(inPlay("Onix"), [mysterious]);
    const next = resolvePowerChoice(pending, [mysterious.pokemon.id]);
    expect(next.opponentBench).toEqual([]);
    expect(names(next.opponentDiscard)).toEqual(["Mysterious Fossil"]);
    expect(next.playerPrizes).toHaveLength(6);
  });
});

describe("switching powers", () => {
  it("Step In takes a Paralyzed Active out: no Sticky Goo cost, no Sinkhole coin, conditions removed", () => {
    const dragonite = fossil("Dragonite");
    const state = deepFreeze(makeState({
      player: { active: inPlay("Machop", { statuses: [Paralyzed, Poisoned] }), bench: [dragonite] },
      opponent: { active: rocket("Dark Muk"), bench: [rocket("Dark Dugtrio")] },
    }));
    const next = usePokemonPower(state, dragonite.pokemon.id); // no coinResults: Sinkhole isn't asked
    expect(next.playerActivePokemon!.pokemon.name).toBe("Dragonite");
    expect(next.playerBench[0].pokemon.name).toBe("Machop");
    expect(next.playerBench[0].currentDamage).toBe(0);
    expect(next.playerBench[0].statusConditions).toEqual([]);
  });

  it("Cowardice: a Tentacool put back into play the same turn can't use it again", () => {
    const tentacool = fossil("Tentacool", { playedOnTurn: 1 });
    let state = makeState({ turnNumber: 3, player: { active: inPlay("Machop"), bench: [tentacool] }, opponent: { active: inPlay("Onix") } });
    state = usePokemonPower(state, tentacool.pokemon.id);
    state = playBasicPokemon(state, tentacool.pokemon.id, "bench");
    expect(canUsePokemonPower(state, tentacool.pokemon.id)).toMatch(/turno en que pusiste/);
  });
});

describe("status and type powers on your own Pokémon", () => {
  it("Pollen Stench tails confuses your own Dark Primeape: Frenzy adds 30", () => {
    const gloom = rocket("Dark Gloom");
    const primeape = rocket("Dark Primeape", { energy: [Fighting, Fighting] });
    let state = makeState({ player: { active: primeape, bench: [gloom] }, opponent: { active: inPlay("Onix") } });
    state = usePokemonPower(state, gloom.pokemon.id, [], { coinResults: [T] });
    expect(state.playerActivePokemon!.statusConditions).toEqual([Confused]);
    const { state: attacking } = resolveConfusionFlip(state, true);
    expect(executeAttack(attacking, 0, { skipEndTurn: true }).opponentActivePokemon!.currentDamage).toBe(70);
  });

  it("two Rattata each use Trickery once in the same turn", () => {
    const first = rocket("Rattata");
    const second = rocket("Rattata");
    const state = usePokemonPower(makeState({ player: { active: first, bench: [second] }, opponent: { active: inPlay("Onix") } }), first.pokemon.id, [["0"]]);
    expect(canUsePokemonPower(state, first.pokemon.id)).toMatch(/ya fue usado/);
    expect(canUsePokemonPower(state, second.pokemon.id)).toBeNull();
  });

  it("Shift to Fire: Venomoth's attack hits a Fire-weak Pokémon for double", () => {
    const venomoth = jungle("Venomoth", { energy: [Grass, Grass] });
    let state = makeState({ player: { active: venomoth }, opponent: { active: inPlay("Bulbasaur"), bench: [inPlay("Charmander")] } });
    state = usePokemonPower(state, venomoth.pokemon.id, [[Fire]]);
    expect(executeAttack(state, 0, { coinResults: [T], skipEndTurn: true }).opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("Shift: a Mysterious Fossil offers no type; Venomoth can take a Team Rocket Pokémon's type", () => {
    const venomoth = jungle("Venomoth");
    const state = makeState({ player: { active: venomoth, bench: [fossil("Mysterious Fossil")] }, opponent: { active: rocket("Dark Kadabra") } });
    expect(getPowerSteps(state, venomoth.pokemon.id, [])!.options.map((o) => o.id).sort()).toEqual([Grass, EnergyType.Psychic].sort());
  });

  it("Rain Dance can attach to a Venomoth shifted to Water (it is a Water Pokémon this turn)", () => {
    const venomoth = jungle("Venomoth");
    const [water1, water2] = [energy(Water), energy(Water)];
    let state = makeState({ player: { active: venomoth, bench: [inPlay("Blastoise")], hand: [water1, water2] }, opponent: { active: inPlay("Squirtle") } });
    expect(canAttachEnergy({ ...state, energyAttachedThisTurn: true }, water1.id, venomoth.pokemon.id)).not.toBeNull();
    state = usePokemonPower(state, venomoth.pokemon.id, [[Water]]);
    state = attachEnergyCard(state, water1.id, venomoth.pokemon.id);
    expect(state.energyAttachedThisTurn).toBe(false); // Rain Dance, not the attachment of the turn
    state = attachEnergyCard(state, water2.id, venomoth.pokemon.id);
    expect(state.playerActivePokemon!.attachedEnergy).toHaveLength(2);
  });

  it("Rain Dance can attach to a Ditto copying a Water Pokémon (Transform copies the type)", () => {
    const ditto = fossil("Ditto");
    const water = energy(Water);
    const state = makeState({
      player: { active: ditto, bench: [inPlay("Blastoise")], hand: [water] },
      opponent: { active: inPlay("Squirtle") },
      energyAttachedThisTurn: true,
    });
    expect(canAttachEnergy(state, water.id, ditto.pokemon.id)).toBeNull();
    const asleepDitto = { ...state, playerActivePokemon: withStatus(ditto, Asleep) }; // a plain Colorless Ditto
    expect(canAttachEnergy(asleepDitto, water.id, ditto.pokemon.id)).not.toBeNull();
  });
});

describe("Energy Burn and Buzzap with other Energy", () => {
  it("Energy Burn used on the Bench ends with the turn (it can be used again next turn; Water isn't Fire under Toxic Gas)", () => {
    const charizard = inPlay("Charizard", { energy: [Water, Water, Water, Water] });
    const machop = inPlay("Machop");
    let state = makeState({ turnNumber: 3, player: { active: machop, bench: [charizard] }, opponent: { active: inPlay("Onix") } });
    state = usePokemonPower(state, charizard.pokemon.id);
    expect(state.playerBench[0].energyConversionType).toBe(Fire);
    const myNextTurn = endTurn(endTurn(state));
    expect(myNextTurn.turnNumber).toBe(5);
    expect(myNextTurn.playerBench[0].energyConversionType).toBeUndefined();
    expect(canUsePokemonPower(myNextTurn, charizard.pokemon.id)).toBeNull();
    // Charizard now Active facing Toxic Gas: its Water is Water
    const gassed: GameState = { ...myNextTurn, playerActivePokemon: myNextTurn.playerBench[0], playerBench: [myNextTurn.playerActivePokemon!], opponentBench: [muk()] };
    expect(canExecuteAttack(gassed, 0)).toMatch(/energía necesaria/);
  });

  it("Energy Burn turns Full Heal Energy and Potion Energy into Fire too; not under Toxic Gas", () => {
    const charizard: PokemonInPlay = {
      ...inPlay("Charizard"),
      attachedEnergy: [energy(Fire), energy(Fire), gameCard("Full Heal Energy", "rocket"), gameCard("Potion Energy", "rocket")],
    };
    const state = makeState({ player: { active: charizard }, opponent: { active: inPlay("Onix") } });
    expect(canExecuteAttack(state, 0)).toBeNull();
    expect(canExecuteAttack({ ...state, opponentBench: [muk()] }, 0)).toMatch(/energía necesaria/);
  });

  it("Buzzap Energy pays attack costs: 2 Energy of the chosen type (Machop, Dark Primeape)", () => {
    const buzzapOnto = (active: PokemonInPlay, type: EnergyType) => {
      const state = makeState({ player: { active, bench: [inPlay("Electrode")] }, opponent: { active: inPlay("Onix") } });
      return usePokemonPower(state, state.playerBench[0].pokemon.id, [[type], [active.pokemon.id]]);
    };
    const machop = buzzapOnto(inPlay("Machop"), Fighting);
    expect(canExecuteAttack(machop, 0)).toBeNull();
    expect(executeAttack(machop, 0, { skipEndTurn: true }).opponentActivePokemon!.currentDamage).toBe(20);
    const primeape = buzzapOnto(rocket("Dark Primeape"), Fighting); // Fighting Fighting
    expect(canExecuteAttack(primeape, 0)).toBeNull();
    const wrongType = buzzapOnto(inPlay("Machop"), Lightning);
    expect(canExecuteAttack(wrongType, 0)).toMatch(/energía necesaria/);
  });

  it("Buzzap Energy on Charizard counts as Fire with Energy Burn (Fire Spin), not under Toxic Gas", () => {
    const charizard = inPlay("Charizard", { energy: [Fire, Fire] });
    const state = makeState({ player: { active: charizard, bench: [inPlay("Electrode")] }, opponent: { active: inPlay("Onix") } });
    const next = usePokemonPower(state, state.playerBench[0].pokemon.id, [[Lightning], [charizard.pokemon.id]]);
    expect(canExecuteAttack(next, 0)).toBeNull();
    expect(canExecuteAttack({ ...next, opponentBench: [muk()] }, 0)).toMatch(/energía necesaria/);
  });

  it("Gather Fire can't take an Energy-Burned Water Energy: it is still a Water Energy card", () => {
    const charmander = rocket("Charmander");
    const charizard = inPlay("Charizard", { energy: [Water, Water] });
    const state = usePokemonPower(makeState({ player: { active: charizard, bench: [charmander] }, opponent: { active: inPlay("Onix") } }), charizard.pokemon.id);
    expect(canUsePokemonPower(state, charmander.pokemon.id)).toMatch(/Energía Fuego/);
  });
});

describe("powers against a transformed Ditto / a Mr. Mime attacker", () => {
  it("Stare on a transformed Ditto: its power stops, it falls back to 50 HP and is Knocked Out (Prize)", () => {
    const arbok = armedFor(rocket("Dark Arbok"), "Mirada");
    const ditto = fossil("Ditto", { damage: 40 }); // a 60 HP Dark Arbok copy
    let state = makeState({ player: { active: arbok }, opponent: { active: ditto, bench: [inPlay("Abra")] } });
    state = executeAttack(state, attackIndex(arbok, "Mirada"), { skipEndTurn: true });
    const next = resolveAttackChoice(state, [ditto.pokemon.id], { skipEndTurn: true });
    expect(next.opponentActivePokemon).toBeNull();
    expect(names(next.opponentDiscard)).toContain("Ditto");
    expect(prizesOwed(next, "player")).toBe(1);
    expect(next.opponentNeedsToPromote).toBe(true);
  });

  it("Final Beam is a power, not an attack: Invisible Wall doesn't stop its 40 on a Mr. Mime attacker", () => {
    const mrMime = armedFor(jungle("Mr. Mime"), "Meditar");
    const gyarados = rocket("Dark Gyarados", { damage: 60, energy: [Water, Water] });
    const state = makeState({ player: { active: mrMime, bench: [inPlay("Abra")] }, opponent: { active: gyarados, bench: [inPlay("Onix")] } });
    expect(getAttackCoinPlan(state, 0)).toEqual({ smokescreen: 0, attack: 0, defender: 1 });
    const next = executeAttack(state, 0, { coinResults: [H], skipEndTurn: true });
    expect(next.playerActivePokemon).toBeNull();
    expect(names(next.playerDiscard)).toContain("Mr. Mime");
  });
});
