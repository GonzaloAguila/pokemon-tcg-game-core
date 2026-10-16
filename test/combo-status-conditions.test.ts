/**
 * Special Conditions across sets: Toxic vs normal Poison, what clears them (Full Heal, Full Heal
 * Energy, evolving, the Bench, Scoop Up), exclusive conditions (Asleep / Confused / Paralyzed
 * replace each other, Poison stacks), Long-Distance Hypnosis / Pollen Stench on your own Active,
 * self-Confusion attacks and Pokémon Powers that stop while their owner is Asleep / Confused /
 * Paralyzed (but not Poisoned).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  applyStatusCondition,
  canExecuteAttack,
  endTurn,
  canExecuteMetronome,
  executeAttack,
  executeMetronome,
  executeRetreat,
  resolveConfusionFlip,
} from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { attachEnergyCard, canEvolve, evolvePokemonCard } from "@/domain/board";
import { canPlayTrainerCard, canUsePokemonPower, playTrainerCard, usePokemonPower } from "@/domain/effects";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, armedFor, attackIndex, deepFreeze } from "./helpers/state";

const { Poisoned, Asleep, Confused, Paralyzed, CannotAttack } = StatusCondition;
const { Fighting, Water } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}

/** The other side's view of the same game (its Active becomes "player"). */
function asOpponent(state: GameState): GameState {
  return {
    ...state,
    playerActivePokemon: state.opponentActivePokemon,
    opponentActivePokemon: state.playerActivePokemon,
    playerBench: state.opponentBench,
    opponentBench: state.playerBench,
    playerHand: state.opponentHand,
    opponentHand: state.playerHand,
    playerDeck: state.opponentDeck,
    opponentDeck: state.playerDeck,
    playerPrizes: state.opponentPrizes,
    opponentPrizes: state.playerPrizes,
    playerDiscard: state.opponentDiscard,
    opponentDiscard: state.playerDiscard,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("Toxic (Nidoking) and normal Poison", () => {
  it("Toxic on an already Poisoned Pokémon makes it take 20 (\"even if it was already Poisoned\")", () => {
    const chansey = inPlay("Chansey", { statuses: [Poisoned] });
    const state = makeState({ player: { active: inPlay("Nidoking") }, opponent: { active: chansey } });
    const hit = attack(state, "Tóxico");
    expect(hit.opponentActivePokemon!.statusConditions).toEqual([Poisoned]);
    expect(hit.opponentActivePokemon!.poisonDamage).toBe(20);
    const before = hit.opponentActivePokemon!.currentDamage ?? 0;
    const after = endTurn(hit);
    expect(after.opponentActivePokemon!.currentDamage! - before).toBe(20);
  });

  it("Toxic then Full Heal Energy: no more Poison, and a later normal Poison (Ivysaur) does 10", () => {
    const fullHealEnergy = gameCard("Full Heal Energy", "rocket");
    const chansey = inPlay("Chansey", { statuses: [Poisoned], poisonDamage: 20 });
    const own = makeState({ player: { active: chansey, hand: [fullHealEnergy] }, opponent: { active: inPlay("Ivysaur") } });
    const healed = attachEnergyCard(own, fullHealEnergy.id, chansey.pokemon.id);
    expect(healed.playerActivePokemon!.statusConditions).toEqual([]);
    expect(healed.playerActivePokemon!.poisonDamage).toBeUndefined();
    const poisoned = attack(asOpponent(healed), "Polvo Veneno");
    expect(poisoned.opponentActivePokemon!.poisonDamage).toBeUndefined();
    const damage = poisoned.opponentActivePokemon!.currentDamage ?? 0;
    expect(endTurn(poisoned).opponentActivePokemon!.currentDamage! - damage).toBe(10);
  });

  it("Toxic-poisoned Charmander evolves into Dark Charmeleon: no Poison, no damage at the checkup", () => {
    const charmander = inPlay("Charmander", { statuses: [Poisoned], poisonDamage: 20, damage: 20 });
    const darkCharmeleon = gameCard("Dark Charmeleon", "rocket");
    const state = makeState({ player: { active: charmander, hand: [darkCharmeleon] }, opponent: { active: inPlay("Chansey") } });
    const evolved = evolvePokemonCard(state, darkCharmeleon.id, charmander.pokemon.id);
    expect(evolved.playerActivePokemon!.statusConditions).toEqual([]);
    expect(evolved.playerActivePokemon!.poisonDamage).toBeUndefined();
    expect(endTurn(evolved).playerActivePokemon!.currentDamage).toBe(20);
  });

  it("Scoop Up on a Toxic-poisoned Machoke: Machop back to the hand, the promoted Pokémon isn't poisoned", () => {
    const scoopUp = gameCard("Scoop Up", "base");
    const machoke = inPlay("Machoke", { statuses: [Poisoned, Confused], poisonDamage: 20, evolvedFrom: ["Machop"] });
    const state = makeState({ player: { active: machoke, bench: [inPlay("Abra")], hand: [scoopUp] }, opponent: { active: inPlay("Chansey") } });
    const next = playTrainerCard(state, scoopUp.id, [[machoke.pokemon.id]]);
    expect(next.playerHand.map((c) => c.name)).toEqual(["Machop"]);
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.playerDiscard.map((c) => c.name).sort()).toEqual(["Machoke", "Scoop Up"]);
  });

  it("Switch removes Toxic: back in the Active spot later, the Pokémon takes no Poison damage", () => {
    const sw = gameCard("Switch", "base");
    const machop = inPlay("Machop", { statuses: [Poisoned], poisonDamage: 20 });
    const state = makeState({ player: { active: machop, bench: [inPlay("Abra")], hand: [sw] }, opponent: { active: inPlay("Chansey") } });
    const switched = playTrainerCard(state, sw.id, [[state.playerBench[0].pokemon.id]]);
    const benched = switched.playerBench.find((p) => p.pokemon.name === "Machop")!;
    expect(benched.statusConditions).toEqual([]);
    expect(benched.poisonDamage).toBeUndefined();
  });
});

describe("exclusive conditions: Asleep / Confused / Paralyzed replace each other, Poison stays", () => {
  it("Gloom's Foul Odor on an Asleep and Poisoned defender: Confused replaces Asleep, Poison stays; Gloom keeps its own Poison", () => {
    const gloom = inPlay("Gloom", { statuses: [Poisoned] });
    const defender = inPlay("Chansey", { statuses: [Poisoned, Asleep] });
    const next = attack(makeState({ player: { active: gloom }, opponent: { active: defender } }), "Foul Odor");
    expect([...next.opponentActivePokemon!.statusConditions ?? []].sort()).toEqual([Confused, Poisoned].sort());
    expect([...next.playerActivePokemon!.statusConditions ?? []].sort()).toEqual([Confused, Poisoned].sort());
  });

  it("Haunter's Hypnosis on a Paralyzed defender: Asleep replaces Paralyzed (no paralysis turn left behind)", () => {
    const defender = applyStatusCondition(inPlay("Chansey"), Paralyzed, 2);
    const next = attack(makeState({ player: { active: inPlay("Haunter", { set: "base" }) }, opponent: { active: defender } }), "Hipnosis");
    expect(next.opponentActivePokemon!.statusConditions).toEqual([Asleep]);
    expect(next.opponentActivePokemon!.paralyzedOnTurn).toBeUndefined();
  });

  it("Poison on a Paralyzed Pokémon keeps its paralysis turn (the paralysis still wears off)", () => {
    const paralyzed = applyStatusCondition(inPlay("Chansey"), Paralyzed, 2);
    const poisoned = applyStatusCondition(paralyzed, Poisoned, 3);
    expect([...poisoned.statusConditions ?? []].sort()).toEqual([Paralyzed, Poisoned].sort());
    expect(poisoned.paralyzedOnTurn).toBe(2);
  });

  it("Pollen Stench (Dark Gloom) heads on an Asleep, Poisoned Defending Pokémon: Confused + Poisoned", () => {
    const gloom = rocket("Dark Gloom");
    const defender = inPlay("Chansey", { statuses: [Asleep, Poisoned] });
    const state = makeState({ player: { active: gloom }, opponent: { active: defender } });
    const next = usePokemonPower(state, gloom.pokemon.id, [], { coinResults: [H] });
    expect([...next.opponentActivePokemon!.statusConditions ?? []].sort()).toEqual([Confused, Poisoned].sort());
  });

  it("Dark Primeape's Frenzied Attack confuses it; next turn, heads: 40 + 30 (Frenzy)", () => {
    const primeape = rocket("Dark Primeape", { energy: [Fighting, Fighting] });
    const hit = attack(makeState({ player: { active: primeape }, opponent: { active: inPlay("Chansey") } }), "Ataque Frenético");
    expect(hit.playerActivePokemon!.statusConditions).toEqual([Confused]);
    // Chansey: Fighting Weakness → (40) × 2 the first time
    expect(hit.opponentActivePokemon!.currentDamage).toBe(80);
    const confused = makeState({ player: { active: hit.playerActivePokemon! }, opponent: { active: inPlay("Onix") } });
    const { state: flipped, canAttack } = resolveConfusionFlip(confused, true, true);
    expect(canAttack).toBe(true);
    // Onix has no Weakness to Fighting: 40 + 30
    expect(attack(flipped, "Ataque Frenético").opponentActivePokemon!.currentDamage).toBe(70);
  });
});

describe("Long-Distance Hypnosis (Drowzee) tails: your own Active falls Asleep", () => {
  it("an Active Drowzee puts itself to sleep: it can't attack nor retreat this turn", () => {
    const drowzee = rocket("Drowzee", { energy: [EnergyType.Psychic, EnergyType.Psychic] });
    const state = makeState({ player: { active: drowzee, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Chansey") } });
    const next = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [T] });
    expect(next.playerActivePokemon!.statusConditions).toEqual([Asleep]);
    expect(canExecuteAttack(next, attackIndex(drowzee, "Pesadilla"))).toMatch(/dormido/);
    const retreat = executeRetreat(next, [drowzee.attachedEnergy[0].id], 0, { coinResults: [] });
    expect(retreat.playerActivePokemon!.pokemon.name).toBe("Drowzee");
    // Asleep, its own power stops too
    expect(canUsePokemonPower({ ...next, usedPowersThisTurn: [] }, drowzee.pokemon.id)).not.toBeNull();
  });

  it("on a Paralyzed own Active: Asleep replaces Paralyzed", () => {
    const drowzee = rocket("Drowzee");
    const machop = applyStatusCondition(inPlay("Machop"), Paralyzed, 2);
    const state = makeState({ player: { active: machop, bench: [drowzee] }, opponent: { active: inPlay("Chansey") } });
    const next = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [T] });
    expect(next.playerActivePokemon!.statusConditions).toEqual([Asleep]);
    expect(next.playerActivePokemon!.paralyzedOnTurn).toBeUndefined();
  });

  it("on your own transformed Ditto: it stops copying, its 50 HP can't hold 60 damage → Knocked Out (Prize for the opponent)", () => {
    const drowzee = rocket("Drowzee");
    const ditto = inPlay("Ditto", { set: "fossil", damage: 60 });
    const state = makeState({ player: { active: ditto, bench: [drowzee] }, opponent: { active: inPlay("Chansey") } });
    const next = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [T] });
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(5);
    expect(next.playerDiscard.map((c) => c.name)).toContain("Ditto");
  });

  it("Pollen Stench heads on the opponent's transformed Ditto: Knocked Out, Prize for the player", () => {
    const gloom = rocket("Dark Gloom");
    const ditto = inPlay("Ditto", { set: "fossil", damage: 50 });
    const state = makeState({ player: { active: gloom }, opponent: { active: ditto, bench: [inPlay("Abra")] } });
    const next = usePokemonPower(state, gloom.pokemon.id, [], { coinResults: [H] });
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.opponentNeedsToPromote).toBe(true);
    expect(next.playerPrizes).toHaveLength(5);
  });
});

describe("Full Heal and Full Heal Energy against conditions that stop other actions", () => {
  it("Full Heal on a Paralyzed, Poisoned Active: no conditions, and it can attack this turn", () => {
    const fullHeal = gameCard("Full Heal", "base");
    const machop = applyStatusCondition(inPlay("Machop", { statuses: [Poisoned], energy: [Fighting] }), Paralyzed, 2);
    const state = makeState({ player: { active: machop, hand: [fullHeal] }, opponent: { active: inPlay("Chansey") } });
    expect(canExecuteAttack(state, 0)).toMatch(/paralizado/);
    const healed = playTrainerCard(state, fullHeal.id, []);
    expect(healed.playerActivePokemon!.statusConditions).toEqual([]);
    expect(canExecuteAttack(healed, 0)).toBeNull();
  });

  it("Full Heal Energy on an Asleep Active: it can retreat right away, paying with that Energy", () => {
    const fhe = gameCard("Full Heal Energy", "rocket");
    const machop = inPlay("Machop", { statuses: [Asleep] });
    const state = makeState({ player: { active: machop, bench: [inPlay("Abra")], hand: [fhe] }, opponent: { active: inPlay("Chansey") } });
    expect(executeRetreat(state, [], 0, { coinResults: [] }).playerActivePokemon!.pokemon.name).toBe("Machop");
    const healed = attachEnergyCard(state, fhe.id, machop.pokemon.id);
    const retreated = executeRetreat(healed, [fhe.id], 0, { coinResults: [] });
    expect(retreated.playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(retreated.playerDiscard.map((c) => c.name)).toEqual(["Full Heal Energy"]);
  });

  it("Full Heal Energy keeps Leer's \"can't attack\" (not a Special Condition)", () => {
    const fhe = gameCard("Full Heal Energy", "rocket");
    const machop = inPlay("Machop", { statuses: [CannotAttack, Asleep] });
    const state = makeState({ player: { active: machop, hand: [fhe] }, opponent: { active: inPlay("Chansey") } });
    const healed = attachEnergyCard(state, fhe.id, machop.pokemon.id);
    expect(healed.playerActivePokemon!.statusConditions).toEqual([CannotAttack]);
  });
});

describe("Pokémon Powers stop while Asleep, Confused or Paralyzed — never because of Poison", () => {
  it("a Poisoned Aerodactyl still stops evolution; a Confused one doesn't", () => {
    const charmeleon = gameCard("Charmeleon", "base");
    const charmander = inPlay("Charmander");
    const withAero = (statuses: StatusCondition[]) =>
      makeState({ player: { active: charmander, hand: [charmeleon] }, opponent: { active: inPlay("Aerodactyl", { set: "fossil", statuses }) } });
    expect(canEvolve(withAero([Poisoned]), charmeleon.id, charmander.pokemon.id)).toMatch(/Prehist/);
    expect(canEvolve(withAero([Confused, Poisoned]), charmeleon.id, charmander.pokemon.id)).toBeNull();
  });

  it("Toxic Gas stops Pollen Stench until Muk is Asleep", () => {
    const gloom = rocket("Dark Gloom");
    const withMuk = (statuses: StatusCondition[]) =>
      makeState({ player: { active: gloom }, opponent: { active: inPlay("Muk", { set: "fossil", statuses }) } });
    expect(canUsePokemonPower(withMuk([]), gloom.pokemon.id)).not.toBeNull();
    expect(canUsePokemonPower(withMuk([Poisoned]), gloom.pokemon.id)).not.toBeNull();
    expect(canUsePokemonPower(withMuk([Asleep]), gloom.pokemon.id)).toBeNull();
  });

  it("a Paralyzed Blastoise can't Rain Dance: the second Water Energy needs the turn's attachment", () => {
    const blastoise = applyStatusCondition(inPlay("Blastoise"), Paralyzed, 2);
    const [w1, w2] = [gameCard("Water Energy", "base"), gameCard("Water Energy", "base")];
    const state = makeState({ player: { active: blastoise, hand: [w1, w2] }, opponent: { active: inPlay("Chansey") } });
    const once = attachEnergyCard(state, w1.id, blastoise.pokemon.id);
    expect(once.energyAttachedThisTurn).toBe(true);
    expect(() => attachEnergyCard(once, w2.id, blastoise.pokemon.id)).toThrow();
    // Poisoned only: Rain Dance works
    const poisoned = makeState({ player: { active: inPlay("Blastoise", { statuses: [Poisoned] }), hand: [w1, w2] }, opponent: { active: inPlay("Chansey") } });
    const p1 = attachEnergyCard(poisoned, w1.id, poisoned.playerActivePokemon!.pokemon.id);
    const p2 = attachEnergyCard(p1, w2.id, poisoned.playerActivePokemon!.pokemon.id);
    expect(p2.playerActivePokemon!.attachedEnergy).toHaveLength(2);
    expect(p2.energyAttachedThisTurn).toBe(false);
  });
});

describe("Mysterious Fossil / Clefairy Doll and Special Conditions", () => {
  it("Long-Distance Hypnosis tails with an Active Clefairy Doll: nothing happens", () => {
    const drowzee = rocket("Drowzee");
    const doll = inPlay("Clefairy Doll", { set: "base" });
    const state = deepFreeze(makeState({ player: { active: doll, bench: [drowzee] }, opponent: { active: inPlay("Chansey") } }));
    const next = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [T] });
    expect(next.playerActivePokemon!.statusConditions).toEqual([]);
  });
});

describe("between turns: Sleep and Paralysis on both sides", () => {
  it("both Actives Asleep: both flip between turns; heads wakes up (Poison stays), tails stays Asleep", () => {
    const state = makeState({
      player: { active: inPlay("Machop", { statuses: [Asleep, Poisoned] }) },
      opponent: { active: inPlay("Chansey", { statuses: [Asleep] }) },
    });
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const heads = endTurn(state);
    expect(heads.playerActivePokemon!.statusConditions).toEqual([Poisoned]);
    expect(heads.playerActivePokemon!.currentDamage).toBe(10);
    expect(heads.opponentActivePokemon!.statusConditions).toEqual([]);
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const tails = endTurn(state);
    expect([...tails.playerActivePokemon!.statusConditions ?? []].sort()).toEqual([Asleep, Poisoned].sort());
    expect(tails.opponentActivePokemon!.statusConditions).toEqual([Asleep]);
  });

  it("Paralyzed during the attacker's turn 3: still Paralyzed on its owner's turn 4, gone when turn 4 ends", () => {
    const paralyzed: PokemonInPlay = applyStatusCondition(inPlay("Chansey", { energy: [Water] }), Paralyzed, 3);
    const state = makeState({ turnNumber: 3, player: { active: inPlay("Machop") }, opponent: { active: paralyzed } });
    const turn4 = endTurn(state);
    expect(turn4.isPlayerTurn).toBe(false);
    expect(turn4.opponentActivePokemon!.statusConditions).toEqual([Paralyzed]);
    const turn5 = endTurn(turn4);
    expect(turn5.opponentActivePokemon!.statusConditions).toEqual([]);
  });
});

describe("Confused attackers using Metronome / Mirror Move", () => {
  const nidokingAttack = (name: string) => (inPlay("Nidoking").pokemon as { attacks: { name: string }[] }).attacks.find((a) => a.name === name)!;

  it("Clefairy's Metronome copying Toxic on an already Poisoned Nidoking: 20 Poison damage from then on", () => {
    const clefairy = armedFor(inPlay("Clefairy"), "Metrónomo");
    const nidoking = inPlay("Nidoking", { statuses: [Poisoned] });
    const state = makeState({ player: { active: clefairy }, opponent: { active: nidoking } });
    const toxic = nidokingAttack("Tóxico") as Parameters<typeof executeMetronome>[1];
    const next = executeMetronome(state, toxic, { coinResults: [], skipEndTurn: true });
    expect(next.opponentActivePokemon!.poisonDamage).toBe(20);
  });

  it("a Confused Clefairy that flips tails can't use Metronome afterwards (the attack is over)", () => {
    const clefairy = armedFor(inPlay("Clefairy", { statuses: [Confused] }), "Metrónomo");
    const state = makeState({ player: { active: clefairy }, opponent: { active: inPlay("Nidoking") } });
    const toxic = nidokingAttack("Tóxico") as Parameters<typeof executeMetronome>[1];
    expect(canExecuteMetronome(state, toxic)).toBeNull();
    const { state: hurt, canAttack } = resolveConfusionFlip(state, false, true);
    expect(canAttack).toBe(false);
    expect(hurt.playerActivePokemon!.currentDamage).toBe(20);
    expect(canExecuteMetronome(hurt, toxic)).not.toBeNull();
  });

  it("a Confused Pidgeotto: tails hurts itself and the turn passes, so the Mirror Move damage it remembered is gone", () => {
    const pidgeotto: PokemonInPlay = { ...armedFor(inPlay("Pidgeotto", { statuses: [Confused] }), "Movimiento Espejo"), lastDamageReceived: 30 };
    const state = makeState({ player: { active: pidgeotto }, opponent: { active: inPlay("Chansey") } });
    const { state: passed } = resolveConfusionFlip(state, false);
    expect(passed.isPlayerTurn).toBe(false);
    expect(passed.playerActivePokemon!.currentDamage).toBe(20);
    expect(passed.playerActivePokemon!.lastDamageReceived).toBeUndefined();
    const { state: flipped, canAttack } = resolveConfusionFlip(state, true, true);
    expect(canAttack).toBe(true);
    const mirrored = executeAttack(flipped, attackIndex(pidgeotto, "Movimiento Espejo"), { coinResults: [], skipEndTurn: true });
    expect(mirrored.opponentActivePokemon!.currentDamage).toBe(30);
  });
});

describe("self-Confusion attacks turn their own Pokémon Power off", () => {
  it("Dark Vileplume's Petal Whirlwind with 2+ heads confuses it: Hay Fever stops and Trainers can be played again", () => {
    const vileplume = rocket("Dark Vileplume");
    const bill = gameCard("Bill", "base");
    const state = makeState({ player: { active: vileplume }, opponent: { active: inPlay("Chansey"), hand: [bill] } });
    const oneHead = attack(state, "Torbellino de Pétalos", ["heads", "tails", "tails"]);
    expect(oneHead.playerActivePokemon!.statusConditions).toEqual([]);
    expect(oneHead.opponentActivePokemon!.currentDamage).toBe(30);
    const twoHeads = attack(state, "Torbellino de Pétalos", ["heads", "heads", "tails"]);
    expect(twoHeads.playerActivePokemon!.statusConditions).toEqual([Confused]);
    // The opponent's next turn (its view): Hay Fever no longer works
    const theirTurn = (s: GameState) => ({ ...asOpponent(s), attackedThisTurn: undefined, turnNumber: s.turnNumber + 1 });
    expect(canPlayTrainerCard(theirTurn(oneHead), bill.id)).not.toBeNull();
    expect(canPlayTrainerCard(theirTurn(twoHeads), bill.id)).toBeNull();
  });

  it("Dark Weezing's paralyzing gas: heads Poisoned, tails Paralyzed (replacing Asleep, keeping Poison)", () => {
    const weezing = rocket("Dark Weezing");
    const defender = inPlay("Chansey", { statuses: [Asleep, Poisoned] });
    const state = makeState({ player: { active: weezing }, opponent: { active: defender } });
    const tails = attack(state, "Gas Paralizante", ["tails"]);
    expect([...tails.opponentActivePokemon!.statusConditions ?? []].sort()).toEqual([Paralyzed, Poisoned].sort());
    expect(tails.opponentActivePokemon!.paralyzedOnTurn).toBe(state.turnNumber);
    const heads = attack(state, "Gas Paralizante", ["heads"]);
    expect([...heads.opponentActivePokemon!.statusConditions ?? []].sort()).toEqual([Asleep, Poisoned].sort());
  });
});
