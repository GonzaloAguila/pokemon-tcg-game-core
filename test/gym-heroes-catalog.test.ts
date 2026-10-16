import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_SETS, getSetById } from "@/domain/catalog";

type Src = { number: string; name: string; supertype: string; subtypes?: string[]; hp?: string; types?: string[];
  evolvesFrom?: string; retreatCost?: string[]; weaknesses?: { type: string }[]; resistances?: { type: string }[];
  attacks?: { name: string; cost: string[]; damage: string }[] };
const src: Src[] = JSON.parse(readFileSync("data/pokemontcg/gym1.json", "utf8")).data;
// Non-holo reprints of the holo leader Trainers #15-18 (Brock #98, Erika #100, Lt. Surge #101, Misty #102),
// and the 6 basic Energy (#127-132, the Base Set ones). Checked against gym1.json.
const EXCLUDED = new Set(["98", "100", "101", "102", "127", "128", "129", "130", "131", "132"]);

describe("Gym Heroes catalog", () => {
  const set = getSetById("gym-heroes")!;
  it("is registered", () => {
    expect(set.code).toBe("G1");
    expect(set.totalCards).toBe(132);
    expect(set.releaseDate).toBe("2000-08-14");
    expect(CARD_SETS.map((s) => s.id)).toContain("gym-heroes");
  });

  // Task 7 removes the skip once the catalog holds its Pokémon and Trainers
  describe.skipIf(set.cards.length === 0)("against the source data", () => {
    it("has every unique printed card, in number order", () => {
      const expected = src.filter((c) => !EXCLUDED.has(c.number)).map((c) => Number(c.number));
      expect(set.cards.map((c) => c.number)).toEqual(expected);
    });
    it.each(src.filter((c) => !EXCLUDED.has(c.number) && c.supertype === "Pokémon"))("#$number $name matches the printed card", (s) => {
      const card = set.cards.find((c) => c.number === Number(s.number))!;
      expect(card.kind).toBe("pokemon");
      if (card.kind !== "pokemon") return;
      expect(card.name).toBe(s.name);
      expect(card.hp).toBe(Number(s.hp));
      expect(card.types.map(String)).toEqual((s.types ?? []).map((t) => t.toLowerCase()));
      expect(card.evolvesFrom ?? null).toBe(s.evolvesFrom ?? null);
      expect(card.retreatCost).toBe(s.retreatCost?.length ?? 0);
      expect((card.weaknesses ?? []).map(String)).toEqual((s.weaknesses ?? []).map((w) => w.type.toLowerCase()));
      expect((card.resistances ?? []).map(String)).toEqual((s.resistances ?? []).map((r) => r.type.toLowerCase()));
      expect(card.attacks.map((a) => [a.cost.map(String), a.damage ?? 0])).toEqual(
        (s.attacks ?? []).map((a) => [a.cost.map((t) => t.toLowerCase()), Number.parseInt(a.damage || "0", 10) || 0]),
      );
    });
  });
});
