import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_SETS, getCardImageUrl, getSetById } from "@/domain/catalog";
import { CardRarity, PokemonStage } from "@/domain/constants";

const STAGE: Record<string, string> = { Basic: PokemonStage.Basic, "Stage 1": PokemonStage.Stage1, "Stage 2": PokemonStage.Stage2 };
const RARITY: Record<string, string> = { "Rare Holo": CardRarity.RareHolo, Rare: CardRarity.Rare, Uncommon: CardRarity.Uncommon, Common: CardRarity.Common };

type Src = { number: string; name: string; supertype: string; subtypes?: string[]; hp?: string; types?: string[];
  evolvesFrom?: string; retreatCost?: string[]; weaknesses?: { type: string }[]; resistances?: { type: string }[];
  rarity?: string; abilities?: { name: string }[]; attacks?: { name: string; cost: string[]; damage: string; text?: string }[] };
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

  it("builds pkmncards image URLs (the dot kept, no set code: checked with npm run check-images)", () => {
    const fearow = set.cards.find((c) => c.number === 7);
    if (!fearow) return;
    expect(getCardImageUrl(fearow)).toBe("https://pkmncards.com/wp-content/uploads/lt.-surges-fearow-gym-heroes-7.jpg");
    expect(getCardImageUrl(set.cards.find((c) => c.number === 94)!)).toBe("https://pkmncards.com/wp-content/uploads/sabrinas-mr.-mime-gym-heroes-94.jpg");
  });

  /** "30×" / "10+" / "40-" / "30" / "" → comparable string ("30x", "10+", "40-", "30", "") */
  const damageOf = (value: string | number | undefined) => String(value ?? "").replace("×", "x");

  describe.skipIf(set.cards.length === 0)("against the source data", () => {
    // Needs the Trainers and Stadiums too (a later task): runs once the set has any Trainer
    it.skipIf(!set.cards.some((c) => c.kind === "trainer"))("has every unique printed card, in number order", () => {
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
      expect(card.attacks.map((a) => [a.cost.map(String), damageOf(a.damage)])).toEqual(
        (s.attacks ?? []).map((a) => [a.cost.map((t) => t.toLowerCase()), damageOf(a.damage)]),
      );
      expect(card.attacks.map((a) => !!a.text)).toEqual((s.attacks ?? []).map((a) => !!a.text));
      expect(card.stage).toBe(STAGE[s.subtypes![0]]);
      expect(card.rarity).toBe(RARITY[s.rarity!]);
      expect(!!card.power).toBe(!!s.abilities?.length);
    });
  });
});
