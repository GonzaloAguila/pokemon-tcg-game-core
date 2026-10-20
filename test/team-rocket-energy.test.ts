/**
 * Team Rocket special Energy: Rainbow Energy, Full Heal Energy, Potion Energy.
 */
import { describe, it, expect } from "vitest";
import { canUseAttack, executeAttack, getEnergyValue, energyProvidesType, executeRetreat, canRetreat, hasEnoughEnergyToRetreat } from "@/lib/gameState";
import type { GameState } from "@/lib/gameState";
import { attachEnergyCard, canAttachEnergy } from "@/domain/board";
import { canPlayTrainerCard, getTrainerSteps, getPowerSteps, canUsePokemonPower } from "@/domain/effects";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { isBasicEnergy } from "@/domain/cards";
import { makeState, inPlay, gameCard, energy, attackIndex, deepFreeze } from "./helpers/state";

const { Fire, Water, Grass, Psychic, Colorless } = EnergyType;
const rainbow = () => gameCard("Rainbow Energy", "rocket");
const fullHeal = () => gameCard("Full Heal Energy", "rocket");
const potion = () => gameCard("Potion Energy", "rocket");
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });

function attachTo(state: GameState, cardId: string, pokemonId: string): GameState {
  return attachEnergyCard(state, cardId, pokemonId);
}

describe("Rainbow Energy", () => {
  it("does 10 damage (no Weakness/Resistance) to the Pokémon it is attached to from the hand", () => {
    const card = rainbow();
    const machop = inPlay("Machop");
    const state = deepFreeze(makeState({ player: { active: machop, hand: [card] }, opponent: { active: inPlay("Onix") } }));
    const next = attachTo(state, card.id, machop.pokemon.id);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    expect(next.playerActivePokemon!.attachedEnergy.map((e) => e.name)).toEqual(["Rainbow Energy"]);
    expect(next.energyAttachedThisTurn).toBe(true);
  });

  it("can Knock Out the Pokémon: the opponent takes a Prize and the player promotes", () => {
    const card = rainbow();
    const active = inPlay("Abra", { damage: 30 });
    const state = makeState({ player: { active, bench: [inPlay("Machop")], hand: [card] }, opponent: { active: inPlay("Onix") } });
    const next = attachTo(state, card.id, active.pokemon.id);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(5);
    expect(next.playerDiscard.map((c) => c.name)).toEqual(expect.arrayContaining(["Abra", "Rainbow Energy"]));
  });

  it("counts as every basic type in play, but only 1 Energy at a time", () => {
    const charmeleon = rocket("Dark Charmeleon", { energy: [Fire, Fire] });
    const withRainbow = { ...charmeleon, attachedEnergy: [...charmeleon.attachedEnergy, rainbow()] };
    expect(canUseAttack(withRainbow, attackIndex(withRainbow, "Bola de Fuego"))).toBe(true);
    // Rainbow alone pays one Fire, never two
    const onlyRainbow = { ...charmeleon, attachedEnergy: [energy(Fire), rainbow()] };
    expect(canUseAttack(onlyRainbow, attackIndex(onlyRainbow, "Bola de Fuego"))).toBe(false);
    expect(getEnergyValue(rainbow())).toBe(1);
    expect(energyProvidesType(rainbow(), Water)).toBe(true);
    expect(energyProvidesType(rainbow(), Psychic)).toBe(true);
    expect(energyProvidesType(energy(Fire), Water)).toBe(false);
  });

  it("pays a discard cost of a type (Ponyta's Ember discards it as the Fire Energy)", () => {
    const ponyta = { ...rocket("Ponyta"), attachedEnergy: [rainbow(), energy(Water)] };
    const state = makeState({ player: { active: ponyta }, opponent: { active: inPlay("Onix") } });
    expect(canUseAttack(ponyta, 0)).toBe(true);
    const next = executeAttack(state, 0, { skipEndTurn: true });
    expect(next.playerActivePokemon!.attachedEnergy.map((e) => e.name)).toEqual(["Water Energy"]);
    expect(next.playerDiscard.map((c) => c.name)).toContain("Rainbow Energy");
  });

  it("is not a basic Energy card outside play (Energy Search / Energy Retrieval don't see it)", () => {
    expect(isBasicEnergy(rainbow())).toBe(false);
    const search = gameCard("Energy Search", "fossil");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [search], deck: [rainbow(), energy(Fire)] }, opponent: { active: inPlay("Onix") } });
    expect(getTrainerSteps(state, search.id, [])!.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Energía Fuego"]);
    const retrieval = gameCard("Energy Retrieval", "base");
    const noBasics = makeState({
      player: { active: inPlay("Machop"), hand: [retrieval, gameCard("Bill", "base")], discard: [rainbow()] },
      opponent: { active: inPlay("Onix") },
    });
    expect(canPlayTrainerCard(noBasics, retrieval.id)).toMatch(/energías básicas/);
  });

  it("Rain Dance can't attach it (it is not a Water Energy card in the hand)", () => {
    const card = rainbow();
    const squirtle = inPlay("Squirtle");
    const state = makeState({
      player: { active: squirtle, bench: [inPlay("Blastoise")], hand: [card] },
      opponent: { active: inPlay("Onix") },
      energyAttachedThisTurn: true,
    });
    expect(canAttachEnergy(state, card.id, squirtle.pokemon.id)).toMatch(/una energía por turno/);
  });

  it("is only damaged when attached from the hand (Energy Trans moving it does nothing)", () => {
    const bulbasaur = { ...inPlay("Bulbasaur"), attachedEnergy: [rainbow()] };
    const venusaur = inPlay("Venusaur");
    const state = makeState({ player: { active: venusaur, bench: [bulbasaur] }, opponent: { active: inPlay("Onix") } });
    expect(canUsePokemonPower(state, venusaur.pokemon.id)).toBeNull();
    const step = getPowerSteps(state, venusaur.pokemon.id, [[bulbasaur.pokemon.id]]);
    expect(step!.options.map((o) => o.label)).toEqual(["Rainbow Energy"]);
  });

  it("retreat: it provides 1 Energy", () => {
    const machoke = { ...rocket("Dark Machoke"), attachedEnergy: [rainbow()] };
    expect(hasEnoughEnergyToRetreat(machoke)).toBe(false);
    const ok = { ...machoke, attachedEnergy: [rainbow(), rainbow()] };
    expect(hasEnoughEnergyToRetreat(ok)).toBe(true);
    expect(canRetreat(ok, 1, false)).toBe(true);
    const state = makeState({ player: { active: ok, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Onix") } });
    const next = executeRetreat(state, ok.attachedEnergy.map((e) => e.id), 0);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Abra");
  });
});

describe("Full Heal Energy and Potion Energy", () => {
  it("Full Heal Energy from the hand: no longer Asleep, Confused, Paralyzed or Poisoned", () => {
    const card = fullHeal();
    const active = inPlay("Machop", { statuses: [StatusCondition.Paralyzed, StatusCondition.Poisoned], poisonDamage: 20 });
    const state = makeState({ player: { active, hand: [card] }, opponent: { active: inPlay("Onix") } });
    const next = attachTo(state, card.id, active.pokemon.id);
    expect(next.playerActivePokemon!.statusConditions).toEqual([]);
    expect(next.playerActivePokemon!.poisonDamage).toBeUndefined();
  });

  it("Full Heal Energy keeps Leer's \"can't attack\" (not a Special Condition)", () => {
    const card = fullHeal();
    const active = inPlay("Machop", { statuses: [StatusCondition.CannotAttack, StatusCondition.Asleep] });
    const state = makeState({ player: { active, hand: [card] }, opponent: { active: inPlay("Onix") } });
    expect(attachTo(state, card.id, active.pokemon.id).playerActivePokemon!.statusConditions).toEqual([StatusCondition.CannotAttack]);
  });

  it("Potion Energy from the hand removes 1 damage counter (if any)", () => {
    const card = potion();
    const benched = inPlay("Abra", { damage: 30 });
    const state = makeState({ player: { active: inPlay("Machop"), bench: [benched], hand: [card] }, opponent: { active: inPlay("Onix") } });
    expect(attachTo(state, card.id, benched.pokemon.id).playerBench[0].currentDamage).toBe(20);
    const healthy = potion();
    const fresh = makeState({ player: { active: inPlay("Machop"), hand: [healthy] }, opponent: { active: inPlay("Onix") } });
    expect(attachTo(fresh, healthy.id, fresh.playerActivePokemon!.pokemon.id).playerActivePokemon!.currentDamage).toBe(0);
  });

  it("both provide 1 Colorless Energy (not 2 like Double Colorless)", () => {
    expect(getEnergyValue(fullHeal())).toBe(1);
    expect(getEnergyValue(potion())).toBe(1);
    expect(getEnergyValue(energy(Colorless))).toBe(2);
    const rattata = { ...rocket("Dark Raticate"), attachedEnergy: [potion()] };
    expect(canUseAttack(rattata, 0)).toBe(false);
    expect(canUseAttack({ ...rattata, attachedEnergy: [potion(), fullHeal()] }, 0)).toBe(true);
    expect(energyProvidesType(potion(), Grass)).toBe(false);
  });
});
