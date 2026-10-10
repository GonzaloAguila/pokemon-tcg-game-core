import { describe, it, expect } from "vitest";
import { canPlayPokemonBreeder, playPokemonBreeder, playFullHeal } from "@/domain/trainers";
import { endTurn, applyStatusCondition } from "@/lib/gameState";
import { StatusCondition, ProtectionType } from "@/domain/constants";
import { makeState, inPlay, gameCard } from "./helpers/state";

describe("Pokémon Breeder counts as evolving", () => {
  const setup = (turnNumber: number) => {
    const breeder = gameCard("Pokémon Breeder");
    const charizard = gameCard("Charizard");
    const charmander = inPlay("Charmander", {
      playedOnTurn: 0,
      statuses: [StatusCondition.Confused],
      retreatPrevented: true,
      retreatPreventedOnTurn: turnNumber - 1,
      protection: { type: ProtectionType.DamageOnly, expiresAfterTurn: turnNumber },
    });
    const state = makeState({ turnNumber, player: { active: charmander, hand: [breeder, charizard] } });
    return { state, breeder, charizard };
  };

  it("can't be used on the second player's first turn (turn 2)", () => {
    const { state, breeder, charizard } = setup(2);
    expect(canPlayPokemonBreeder(state, breeder.id, charizard.id, -1)).toBe(false);
  });

  it("evolving through Breeder removes special conditions and attack effects", () => {
    const { state, breeder, charizard } = setup(3);
    const evolved = playPokemonBreeder(state, breeder.id, charizard.id, -1).playerActivePokemon!;

    expect(evolved.pokemon.name).toBe("Charizard");
    expect(evolved.statusConditions).toEqual([]);
    expect(evolved.retreatPrevented).toBeUndefined();
    expect(evolved.protection).toBeUndefined();
    expect(evolved.playedOnTurn).toBe(3);
  });
});

describe("Full Heal removes Toxic's 20-damage poison for good", () => {
  it("a later normal Poison does 10, not 20", () => {
    const fullHeal = gameCard("Full Heal");
    const machop = inPlay("Machop", { statuses: [StatusCondition.Poisoned], poisonDamage: 20 });
    const healed = playFullHeal(makeState({ player: { active: machop, hand: [fullHeal] } }), fullHeal.id);
    expect(healed.playerActivePokemon!.poisonDamage).toBeUndefined();

    const poisonedAgain = { ...healed, playerActivePokemon: applyStatusCondition(healed.playerActivePokemon!, StatusCondition.Poisoned) };
    const afterTurn = endTurn(poisonedAgain);
    expect(afterTurn.playerActivePokemon!.currentDamage).toBe(10);
  });
});
