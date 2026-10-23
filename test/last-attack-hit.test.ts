/**
 * GameState.lastAttackHit: the last attack damage that landed on a Pokémon, final damage after
 * Weakness / Resistance and modifiers, before the HP cap (the API's challenge achievements read it:
 * the biggest hit, the Pokémon that dealt the winning Knock Out).
 */
import { describe, it, expect } from "vitest";
import { executeAttack, resolveAttackChoice } from "@/lib/gameState";
import { swapSides } from "@/domain/board/swap";
import { makeState, inPlay, armedFor, attackIndex, names } from "./helpers/state";

describe("lastAttackHit", () => {
  it("records the final damage of an attack, Weakness included", () => {
    const hitmonchan = armedFor(inPlay("Hitmonchan", { set: "base" }), "Puño Bala");
    const state = makeState({
      turnNumber: 4,
      player: { active: hitmonchan },
      opponent: { active: inPlay("Electabuzz", { set: "base" }) },
      lastAttackHit: { attackerSide: "opponent", attackerName: "Pikachu", attackName: "Roer", damage: 10, turn: 3, seq: 4 },
    });
    const next = executeAttack(state, attackIndex(hitmonchan, "Puño Bala"), { skipEndTurn: true });
    expect(next.opponentActivePokemon?.currentDamage).toBe(40);
    expect(next.lastAttackHit).toEqual({ attackerSide: "player", attackerName: "Hitmonchan", attackName: "Puño Bala", damage: 40, turn: 4, seq: 5 });
  });

  it("records the full damage when the hit Knocks Out the defender", () => {
    const machamp = armedFor(inPlay("Machamp", { set: "base" }), "Lanzamiento Sísmico");
    const state = makeState({
      player: { active: machamp },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [inPlay("Electabuzz", { set: "base" })] },
    });
    const next = executeAttack(state, attackIndex(machamp, "Lanzamiento Sísmico"), { skipEndTurn: true });
    expect(names(next.opponentDiscard)).toContain("Pikachu");
    expect(next.lastAttackHit).toMatchObject({ attackerSide: "player", attackerName: "Machamp", damage: 120, seq: 1 });
  });

  it("flips attackerSide with swapSides", () => {
    const state = makeState({ lastAttackHit: { attackerSide: "player", attackerName: "Machamp", attackName: "Lanzamiento Sísmico", damage: 60, turn: 3, seq: 1 } });
    expect(swapSides(state).lastAttackHit?.attackerSide).toBe("opponent");
    expect(swapSides(swapSides(state)).lastAttackHit?.attackerSide).toBe("player");
  });

  it("records a chosen-target hit", () => {
    const charizard = armedFor(inPlay("Blaine's Charizard", { set: "gym-challenge" }), "Chorro de Llamas");
    const benched = inPlay("Electabuzz", { set: "base" });
    const state = makeState({
      player: { active: charizard },
      opponent: { active: inPlay("Hitmonchan", { set: "base" }), bench: [benched] },
    });
    const asked = executeAttack(state, attackIndex(charizard, "Chorro de Llamas"), { skipEndTurn: true, coinResults: ["heads"] });
    expect(asked.pendingAttackChoice).toBeDefined();
    const next = resolveAttackChoice(asked, [benched.pokemon.id], { skipEndTurn: true });
    expect(next.opponentBench[0].currentDamage).toBe(40);
    expect(next.lastAttackHit).toMatchObject({ attackerSide: "player", attackerName: "Blaine's Charizard", attackName: "Chorro de Llamas", damage: 40, seq: 1 });
  });
});
