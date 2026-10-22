/**
 * Attack costs that were mistyped in the catalog, checked against the printed cards.
 */
import { describe, it, expect } from "vitest";
import { baseSetCards, jungleCards } from "@/domain/catalog";
import type { PokemonCard } from "@/domain/cards";
import { EnergyType } from "@/domain/constants";

const attack = (cards: readonly unknown[], number: number, index: number) =>
  (cards as PokemonCard[]).find((c) => c.number === number)!.attacks[index];

describe("printed attack costs", () => {
  it("Base Set Voltorb — Tackle costs one Colorless", () => {
    expect(attack(baseSetCards, 67, 0).cost).toEqual([EnergyType.Colorless]);
  });

  it("Jungle Electrode — Chain Lightning costs three Lightning", () => {
    expect(attack(jungleCards, 2, 1).cost).toEqual([EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning]);
  });
});
