import { describe, it, expect } from "vitest";
import { canUseAttack, executeAttack } from "@/lib/gameState";
import { estimateAttackDamage, getUsableAttacks } from "@/domain/ai/actions";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, attackIndex } from "./helpers/state";

const { Psychic, Fighting, Colorless } = EnergyType;

describe("Haunter's Dream Eater: only usable if the Defending Pokémon is Asleep", () => {
  const haunter = () => inPlay("Haunter", { energy: [Psychic, Psychic] });

  it("canUseAttack refuses it against an awake defender and allows it against an asleep one", () => {
    const h = haunter();
    const idx = attackIndex(h, "Comesueños");

    expect(canUseAttack(h, idx, inPlay("Onix"))).toBe(false);
    expect(canUseAttack(h, idx, inPlay("Onix", { statuses: [StatusCondition.Asleep] }))).toBe(true);
  });

  it("executeAttack does nothing (and keeps the turn) against an awake defender", () => {
    const h = haunter();
    const state = makeState({ player: { active: h }, opponent: { active: inPlay("Onix") } });

    const after = executeAttack(state, attackIndex(h, "Comesueños"));

    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(true);
    expect(after.turnNumber).toBe(state.turnNumber);
  });

  it("executeAttack deals 50 to an asleep defender", () => {
    const h = haunter();
    const state = makeState({
      player: { active: h },
      opponent: { active: inPlay("Onix", { statuses: [StatusCondition.Asleep] }) },
    });

    const after = executeAttack(state, attackIndex(h, "Comesueños"));

    expect(after.opponentActivePokemon?.currentDamage).toBe(50);
  });

  it("the AI does not consider Dream Eater against an awake defender", () => {
    const h = haunter();
    const state = makeState({ opponent: { active: h }, player: { active: inPlay("Onix") } });

    const usable = getUsableAttacks(state, "opponent").map((a) => a.index);

    expect(usable).toContain(attackIndex(h, "Hipnosis"));
    expect(usable).not.toContain(attackIndex(h, "Comesueños"));
  });
});

describe("Machoke's Karate Chop: 50 minus 10 for each damage counter on Machoke", () => {
  const machoke = (damage: number) => inPlay("Machoke", { damage, energy: [Fighting, Fighting, Colorless] });

  it("does 20 with 3 damage counters", () => {
    const m = machoke(30);
    const state = makeState({ player: { active: m }, opponent: { active: inPlay("Onix") } });

    const after = executeAttack(state, attackIndex(m, "Golpe Karate"));

    expect(after.opponentActivePokemon?.currentDamage).toBe(20);
  });

  it("never goes below 0 (6 damage counters)", () => {
    const m = machoke(60);
    const state = makeState({ player: { active: m }, opponent: { active: inPlay("Onix") } });

    const after = executeAttack(state, attackIndex(m, "Golpe Karate"));

    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
  });

  it("applies the reduction before weakness: (50 - 20) x 2 = 60 vs Fighting-weak Chansey", () => {
    const m = machoke(20);
    const state = makeState({ player: { active: m }, opponent: { active: inPlay("Chansey") } });

    const after = executeAttack(state, attackIndex(m, "Golpe Karate"));

    expect(after.opponentActivePokemon?.currentDamage).toBe(60);
  });

  it("the AI estimates the reduced damage", () => {
    const m = machoke(30);
    const state = makeState({ opponent: { active: m }, player: { active: inPlay("Onix") } });

    expect(estimateAttackDamage(state, "opponent", attackIndex(m, "Golpe Karate"))).toBe(20);
  });
});
