import { describe, expect, it } from "vitest";
import { ownerOf, hasOwner } from "@/domain/cards";
import { findValidEvolutionTargets } from "@/index";
import { inPlay, makeState, gameCard } from "./helpers/state";

describe("owner's Pokémon", () => {
  it("reads the owner from the name", () => {
    expect(ownerOf({ name: "Brock's Onix" })).toBe("Brock");
    expect(ownerOf({ name: "Lt. Surge's Pikachu" })).toBe("Lt. Surge");
    expect(ownerOf({ name: "Rocket's Snorlax" })).toBe("Rocket");
    expect(ownerOf({ name: "Onix" })).toBeNull();
    expect(ownerOf({ name: "Farfetch'd" })).toBeNull();
    expect(hasOwner({ name: "Misty's Seel" }, "Misty")).toBe(true);
  });

  it("evolves only within the same owner, both ways", () => {
    const s = makeState({
      turnNumber: 2,
      player: {
        active: inPlay("Brock's Geodude", { set: "gym-heroes", playedOnTurn: 1 }),
        bench: [inPlay("Geodude", { set: "fossil", playedOnTurn: 1 })],
        hand: [gameCard("Brock's Graveler", "gym-heroes"), gameCard("Graveler", "fossil")],
      },
    });
    const [brocks, plain] = s.playerHand;
    // -1 = the Active Pokémon, otherwise the Bench index
    expect(findValidEvolutionTargets(brocks, s.playerActivePokemon, s.playerBench, s.turnNumber, "player", true)).toEqual([-1]);
    expect(findValidEvolutionTargets(plain, s.playerActivePokemon, s.playerBench, s.turnNumber, "player", true)).toEqual([0]);
  });
});
