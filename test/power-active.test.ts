import { describe, it, expect } from "vitest";
import { isPowerActive, isDamageBlocked, hasStatusImmunity, getDamageReaction, getRetreatCostReduction } from "@/domain/powers";
import { canUsePokemonPower } from "@/domain/effects";
import { endTurn, executeAttack, getRetreatCost } from "@/lib/gameState";
import type { GameState } from "@/lib/gameState";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, attackIndex } from "./helpers/state";

const suppressAll = (state: GameState, expiresAfterTurn = state.turnNumber + 1): GameState => ({
  ...state,
  powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn }],
});

describe("isPowerActive", () => {
  it("needs a power, no Asleep/Confused/Paralyzed (Poison is fine), no suppression", () => {
    const state = makeState();
    expect(isPowerActive(state, inPlay("Machop"))).toBe(false);
    expect(isPowerActive(state, inPlay("Machamp"))).toBe(true);
    expect(isPowerActive(state, inPlay("Machamp", { statuses: [StatusCondition.Poisoned] }))).toBe(true);
    expect(isPowerActive(state, inPlay("Machamp", { statuses: [StatusCondition.Paralyzed] }))).toBe(false);
    expect(isPowerActive(suppressAll(state), inPlay("Machamp"))).toBe(false);
  });

  it("a suppression can target a single Pokémon", () => {
    const target = inPlay("Machamp");
    const other = inPlay("Machamp");
    const state: GameState = { ...makeState(), powersSuppressed: [{ source: "Stare", pokemonId: target.pokemon.id, expiresAfterTurn: 9 }] };
    expect(isPowerActive(state, target)).toBe(false);
    expect(isPowerActive(state, other)).toBe(true);
  });

  it("Thick Skinned works while healthy, not while already statused or suppressed", () => {
    const snorlax = inPlay("Snorlax", { set: "jungle" });
    expect(hasStatusImmunity(snorlax, makeState())).toBe(true);
    expect(hasStatusImmunity({ ...snorlax, statusConditions: [StatusCondition.Confused] }, makeState())).toBe(false);
    expect(hasStatusImmunity(snorlax, suppressAll(makeState()))).toBe(false);
  });
});

describe("passive powers go through isPowerActive", () => {
  it("Invisible Wall stops blocking while suppressed", () => {
    const mrMime = inPlay("Mr. Mime", { set: "jungle" });
    expect(isDamageBlocked(mrMime, 40, makeState())).toBe(true);
    expect(isDamageBlocked(mrMime, 40, suppressAll(makeState()))).toBe(false);

    const machamp = inPlay("Machamp", { energy: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting] });
    const state = suppressAll(makeState({ player: { active: machamp }, opponent: { active: mrMime } }));
    const after = executeAttack(state, attackIndex(machamp, "Lanzamiento Sísmico"), { skipEndTurn: true });
    expect(after.opponentDiscard.some((c) => c.name === "Mr. Mime")).toBe(true); // 60 damage, 40 HP
  });

  it("Strikes Back and Retreat Aid stop while suppressed", () => {
    const machamp = inPlay("Machamp");
    expect(getDamageReaction(machamp, true, makeState())).not.toBeNull();
    expect(getDamageReaction(machamp, true, suppressAll(makeState()))).toBeNull();

    const dodrio = inPlay("Dodrio", { set: "jungle" });
    const active = inPlay("Machop");
    expect(getRetreatCostReduction([dodrio], makeState())).toBe(1);
    expect(getRetreatCostReduction([dodrio], suppressAll(makeState()))).toBe(0);
    expect(getRetreatCost(active, [dodrio], suppressAll(makeState()))).toBe(1);
  });

  it("activated powers can't be used while suppressed; the suppression wears off after its turn", () => {
    const charizard = inPlay("Charizard", { energy: [EnergyType.Water] });
    const state = suppressAll(makeState({ turnNumber: 3, player: { active: charizard } }), 4);
    expect(canUsePokemonPower(state, charizard.pokemon.id)).toMatch(/no funciona/);

    const nextTurn = endTurn(state); // turn 4: still suppressed
    expect(nextTurn.powersSuppressed).toHaveLength(1);
    const turnAfter = endTurn(nextTurn); // turn 5: gone
    expect(turnAfter.powersSuppressed).toBeUndefined();
  });
});
