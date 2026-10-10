import { describe, it, expect } from "vitest";
import { buildDeckFromEntries } from "@/lib/gameState";
import { decks } from "@/domain/decks";
import { CardSet } from "@/domain/constants";

describe("buildDeckFromEntries resolves cards by (set, number)", () => {
  it("a Jungle entry #7 is Nidoqueen, not Base Set #7 (Hitmonchan)", () => {
    const deck = buildDeckFromEntries([
      { cardNumber: 7, quantity: 1, set: CardSet.Jungle },
      { cardNumber: 7, quantity: 1 }, // no set = Base Set
    ]);

    expect(deck.map((c) => `${c.set}:${c.name}`)).toEqual(["Jungle:Nidoqueen", "Base Set:Hitmonchan"]);
  });

  it("the Overgrowth theme deck gets its Jungle Nidoran line and 60 cards", () => {
    const overgrowth = decks.find((d) => d.id === "overgrowth")!;

    const deck = buildDeckFromEntries(overgrowth.cards);
    const count = (name: string) => deck.filter((c) => c.name === name && c.set === CardSet.Jungle).length;

    expect(deck).toHaveLength(60);
    expect(count("Nidoqueen")).toBe(1);
    expect(count("Nidorina")).toBe(2);
    expect(count("Nidoran♀")).toBe(4);
  });

  it("gives every card instance a unique id", () => {
    const deck = buildDeckFromEntries([{ cardNumber: 57, quantity: 4, set: CardSet.Jungle }]);

    expect(new Set(deck.map((c) => c.id)).size).toBe(4);
  });
});
