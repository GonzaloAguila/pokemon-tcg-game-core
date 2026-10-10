import { describe, it, expect } from "vitest";
import {
  CARD_SETS,
  ALL_CARDS,
  baseSetCards,
  jungleCards,
  getSetById,
  getSetForCard,
  findCardById,
  findCardDefinition,
  findCardByName,
  getCardImageUrl,
} from "@/domain/catalog";
import { findCardBySetAndNumber } from "@/domain/decks";
import { CardSet } from "@/domain/constants";

describe("set registry", () => {
  it("lists Base Set, Jungle and Fossil with their metadata", () => {
    expect(CARD_SETS.map((s) => [s.id, s.name, s.code, s.releaseDate, s.totalCards])).toEqual([
      ["base-set", CardSet.BaseSet, "BS", "1999-01-09", 102],
      ["jungle", CardSet.Jungle, "JU", "1999-06-16", 64],
      ["fossil", CardSet.Fossil, "FO", "1999-10-10", 62],
    ]);
    expect(getSetById("base-set")?.cards).toBe(baseSetCards);
    expect(getSetById("jungle")?.cards).toHaveLength(48);
  });

  it("every card id is unique across sets and prefixed by its set id", () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const set of CARD_SETS) {
      for (const card of set.cards) {
        expect(card.id.startsWith(`${set.id}-`)).toBe(true);
        expect(card.set).toBe(set.name);
      }
    }
    expect(ALL_CARDS).toHaveLength(CARD_SETS.reduce((n, set) => n + set.cards.length, 0));
    expect(ALL_CARDS.length).toBeGreaterThan(baseSetCards.length + jungleCards.length);
  });

  it("findCardById finds Base Set and Jungle cards", () => {
    expect(findCardById("base-set-004-charizard")?.name).toBe("Charizard");
    expect(findCardById(jungleCards[0].id)?.name).toBe(jungleCards[0].name);
    expect(findCardById("nope")).toBeUndefined();
  });

  it("findCardDefinition disambiguates repeated numbers by set (undefined = Base Set)", () => {
    expect(findCardDefinition(CardSet.Jungle, 1)?.name).toBe("Clefable");
    expect(findCardDefinition("jungle", 1)?.name).toBe("Clefable");
    expect(findCardDefinition(CardSet.BaseSet, 1)?.name).toBe("Alakazam");
    expect(findCardDefinition(undefined, 1)?.name).toBe("Alakazam");
    expect(findCardBySetAndNumber(CardSet.Jungle, 1)?.name).toBe("Clefable");
  });

  it("findCardByName searches every set", () => {
    expect(findCardByName("Clefable")?.set).toBe(CardSet.Jungle);
    expect(findCardByName("Charizard")?.set).toBe(CardSet.BaseSet);
  });

  it("image URLs dispatch by set", () => {
    const clefable = findCardDefinition(CardSet.Jungle, 1)!;
    expect(getCardImageUrl(clefable)).toContain("-jungle-ju-1.jpg");
    expect(getSetForCard(clefable)?.id).toBe("jungle");
    expect(getCardImageUrl(findCardById("base-set-004-charizard")!)).toContain("charizard-base-set-bs-4.jpg");
  });
});
