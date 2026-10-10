/**
 * Fossil passive Pokémon Powers: Toxic Gas (Muk), Prehistoric Power (Aerodactyl),
 * Clairvoyance (Omanyte), Kabuto Armor (Kabuto).
 */
import { describe, it, expect } from "vitest";
import { isPowerActive, isDamageBlocked, getDamageReaction, isHandRevealed } from "@/domain/powers";
import { canUsePokemonPower, canPlayTrainerCard } from "@/domain/effects";
import { canEvolve } from "@/domain/board";
import { executeAttack, executeBenchDamage } from "@/lib/gameState";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex } from "./helpers/state";

const { Water } = EnergyType;

describe("Toxic Gas (Muk): ignore all Pokémon Powers other than Toxic Gases", () => {
  it("stops every other power on both sides, active or benched", () => {
    const muk = inPlay("Muk", { set: "fossil" });
    const mrMime = inPlay("Mr. Mime", { set: "jungle" });
    const machamp = inPlay("Machamp");
    const blastoise = inPlay("Blastoise");
    const state = makeState({
      player: { active: blastoise, hand: [energy(Water)] },
      opponent: { active: mrMime, bench: [muk, machamp] },
    });
    expect(isPowerActive(state, mrMime)).toBe(false);
    expect(isDamageBlocked(mrMime, 40, state)).toBe(false);
    expect(getDamageReaction(machamp, false, state)).toBeNull();
    expect(canUsePokemonPower(state, blastoise.pokemon.id)).toMatch(/no funciona/);
  });

  it("Muk's own Toxic Gas (and another Muk's) keeps working", () => {
    const muk = inPlay("Muk", { set: "fossil" });
    const otherMuk = inPlay("Muk", { set: "fossil" });
    const state = makeState({ player: { active: muk }, opponent: { active: otherMuk } });
    expect(isPowerActive(state, muk)).toBe(true);
    expect(isPowerActive(state, otherMuk)).toBe(true);
  });

  it("stops working while Muk is Asleep, Confused or Paralyzed", () => {
    const muk = inPlay("Muk", { set: "fossil", statuses: [StatusCondition.Asleep] });
    const mrMime = inPlay("Mr. Mime", { set: "jungle" });
    const state = makeState({ player: { active: muk }, opponent: { active: mrMime } });
    expect(isDamageBlocked(mrMime, 40, state)).toBe(true);
  });

  it("doesn't touch Mysterious Fossil's rules (they aren't a power)", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const state = makeState({ player: { active: inPlay("Muk", { set: "fossil" }) }, opponent: { active: fossil } });
    expect(isPowerActive(state, fossil)).toBe(false);
  });
});

describe("Prehistoric Power (Aerodactyl): no more Evolution cards can be played", () => {
  const setup = (aerodactylStatuses: StatusCondition[] = [], extra: { muk?: boolean } = {}) => {
    const charmander = inPlay("Charmander", { playedOnTurn: 1 });
    const charmeleon = gameCard("Charmeleon");
    const breeder = gameCard("Pokémon Breeder");
    const charizard = gameCard("Charizard");
    const aerodactyl = inPlay("Aerodactyl", { set: "fossil", statuses: aerodactylStatuses });
    const state = makeState({
      turnNumber: 5,
      player: { active: charmander, hand: [charmeleon, breeder, charizard], bench: extra.muk ? [inPlay("Muk", { set: "fossil" })] : [] },
      opponent: { active: aerodactyl },
    });
    return { state, charmander, charmeleon, breeder };
  };

  it("blocks evolving and Pokémon Breeder, for both players", () => {
    const { state, charmander, charmeleon, breeder } = setup();
    expect(canEvolve(state, charmeleon.id, charmander.pokemon.id)).toMatch(/Poder Prehistórico/);
    expect(canPlayTrainerCard(state, breeder.id)).toMatch(/Poder Prehistórico/);
  });

  it("stops while Aerodactyl is Paralyzed, or under Toxic Gas", () => {
    const paralyzed = setup([StatusCondition.Paralyzed]);
    expect(canEvolve(paralyzed.state, paralyzed.charmeleon.id, paralyzed.charmander.pokemon.id)).toBeNull();
    const gassed = setup([], { muk: true });
    expect(canEvolve(gassed.state, gassed.charmeleon.id, gassed.charmander.pokemon.id)).toBeNull();
  });
});

describe("Clairvoyance (Omanyte): your opponent plays with his or her hand face up", () => {
  it("reveals the hand of Omanyte's opponent while the power works", () => {
    const omanyte = inPlay("Omanyte", { set: "fossil" });
    const state = makeState({ player: { active: inPlay("Machop"), bench: [omanyte] }, opponent: { active: inPlay("Abra") } });
    expect(isHandRevealed(state, "opponent")).toBe(true);
    expect(isHandRevealed(state, "player")).toBe(false);
    const asleep = makeState({ player: { active: { ...omanyte, statusConditions: [StatusCondition.Asleep] } }, opponent: { active: inPlay("Abra") } });
    expect(isHandRevealed(asleep, "opponent")).toBe(false);
  });
});

describe("Kabuto Armor: attacks do half the damage to Kabuto (rounded down to 10)", () => {
  it("halves damage after Weakness and Resistance (20 → 10, 30 → 10)", () => {
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const kabuto = inPlay("Kabuto", { set: "fossil" });
    const after = executeAttack(makeState({ player: { active: machop }, opponent: { active: kabuto } }), 0, { coinResults: [], skipEndTurn: true });
    expect(after.opponentActivePokemon!.currentDamage).toBe(10);

    const charmeleon = armedFor(inPlay("Charmeleon"), "Cuchillada");
    const slashed = executeAttack(makeState({ player: { active: charmeleon }, opponent: { active: kabuto } }), attackIndex(charmeleon, "Cuchillada"), { coinResults: [], skipEndTurn: true });
    expect(slashed.opponentActivePokemon!.currentDamage).toBe(10);
  });

  it("works on the bench too, even against your own attack (Selfdestruct)", () => {
    const magnemite = armedFor(inPlay("Magnemite"), "Autodestrucción");
    const kabuto = inPlay("Kabuto", { set: "fossil" });
    const state = makeState({ player: { active: magnemite, bench: [kabuto] }, opponent: { active: inPlay("Machamp") } });
    const after = executeAttack(state, attackIndex(magnemite, "Autodestrucción"), { coinResults: [], skipEndTurn: true });
    // 10 to each benched Pokémon, halved to 0 on Kabuto ("rounded down to the nearest 10")
    expect(after.playerBench[0].currentDamage).toBe(0);
  });

  it("chosen bench damage (executeBenchDamage) is halved too; not while Kabuto is Asleep", () => {
    const kabuto = inPlay("Kabuto", { set: "fossil" });
    const pending = makeState({
      player: { active: inPlay("Machop") },
      opponent: { active: inPlay("Abra"), bench: [kabuto] },
      pendingBenchDamageSelection: { damageAmount: 20, targetSide: "opponent", maxTargets: 1 },
    });
    expect(executeBenchDamage(pending, [kabuto.pokemon.id], { skipEndTurn: true }).opponentBench[0].currentDamage).toBe(10);

    const asleep = inPlay("Kabuto", { set: "fossil", statuses: [StatusCondition.Asleep] });
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const after = executeAttack(makeState({ player: { active: machop }, opponent: { active: asleep, bench: [inPlay("Abra")] } }), 0, { coinResults: [], skipEndTurn: true });
    expect(after.opponentActivePokemon!.currentDamage).toBe(20);
  });
});
