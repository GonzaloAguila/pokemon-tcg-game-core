import { describe, it, expect } from "vitest";
import { canUseAttack } from "@/lib/gameState";
import { canUsePower, hasBlockingStatus, isDamageBlocked } from "@/domain/powers";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { inPlay, attackIndex } from "./helpers/state";

const { Poisoned, Asleep, Confused, Paralyzed, CannotAttack } = StatusCondition;
const { Water } = EnergyType;

describe("only Asleep, Confused and Paralyzed stop Pokémon Powers", () => {
  it.each([[Poisoned], [CannotAttack]])("%s does not block a power", (status) => {
    const venusaur = inPlay("Venusaur", { statuses: [status] });

    expect(hasBlockingStatus(venusaur)).toBe(false);
    expect(canUsePower(venusaur, true)).toBeNull();
  });

  it.each([[Asleep], [Confused], [Paralyzed]])("%s blocks a power", (status) => {
    const venusaur = inPlay("Venusaur", { statuses: [status, Poisoned] });

    expect(hasBlockingStatus(venusaur)).toBe(true);
    expect(canUsePower(venusaur, true)).not.toBeNull();
  });

  it("a poisoned Mr. Mime's Invisible Wall still blocks 30+ damage", () => {
    const mrMime = inPlay("Mr. Mime", { set: "jungle", statuses: [Poisoned] });

    expect(isDamageBlocked(mrMime, 30)).toBe(true);
  });

  it("a poisoned Charizard's Energy Burn still turns its Water into Fire for Fire Spin", () => {
    const charizard = inPlay("Charizard", { energy: [Water, Water, Water, Water], statuses: [Poisoned] });

    expect(canUseAttack(charizard, attackIndex(charizard, "Giro Fuego"))).toBe(true);
  });

  it("an asleep Charizard cannot use Energy Burn, so Water stays Water", () => {
    const charizard = inPlay("Charizard", { energy: [Water, Water, Water, Water], statuses: [Asleep] });

    expect(canUseAttack(charizard, attackIndex(charizard, "Giro Fuego"))).toBe(false);
  });
});
