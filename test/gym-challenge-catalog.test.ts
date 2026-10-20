import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALL_CARDS, CARD_SETS, getCardImageUrl, getSetById, isSetInDevelopment } from "@/domain/catalog";
import { ownerOf } from "@/domain/cards";
import { CardRarity, PokemonStage, TrainerType } from "@/domain/constants";
import { allSetIds } from "@/domain/simulation";
import { LUCKY_DUEL_BASICS } from "@/domain/lucky-duel/deck";

const STAGE: Record<string, string> = { Basic: PokemonStage.Basic, "Stage 1": PokemonStage.Stage1, "Stage 2": PokemonStage.Stage2 };
const RARITY: Record<string, string> = { "Rare Holo": CardRarity.RareHolo, Rare: CardRarity.Rare, Uncommon: CardRarity.Uncommon, Common: CardRarity.Common };

type Src = { number: string; name: string; supertype: string; subtypes?: string[]; hp?: string; types?: string[];
  evolvesFrom?: string; retreatCost?: string[]; weaknesses?: { type: string }[]; resistances?: { type: string }[];
  rarity?: string; abilities?: { name: string }[]; attacks?: { name: string; cost: string[]; damage: string; text?: string }[] };
const src: Src[] = JSON.parse(readFileSync("data/pokemontcg/gym2.json", "utf8")).data;
// Non-holo reprints of the holo leader Trainers #17-20 (Blaine #100, Giovanni #104, Koga #106,
// Sabrina #110), and the 6 basic Energy (#127-132, the Base Set ones). Checked against gym2.json.
const EXCLUDED = new Set(["100", "104", "106", "110", "127", "128", "129", "130", "131", "132"]);

/** "30×" / "10+" / "40-" / "30" / "" → comparable string ("30x", "10+", "40-", "30", "") */
const damageOf = (value: string | number | undefined) => String(value ?? "").replace("×", "x");

describe("Gym Challenge catalog", () => {
  const set = getSetById("gym-challenge")!;

  it("is registered and released (0.9.0)", () => {
    expect(set.code).toBe("G2");
    expect(set.totalCards).toBe(132);
    expect(set.releaseDate).toBe("2000-10-16");
    expect(set.inDevelopment).toBeFalsy();
    expect(CARD_SETS.map((s) => s.id)).toContain("gym-challenge");
  });

  it("is in the random pools (simulator default sets, Lucky Duel)", () => {
    expect(allSetIds()).toContain("gym-challenge");
    expect(set.cards.some((c) => isSetInDevelopment(c))).toBe(false);
    expect(LUCKY_DUEL_BASICS.some((c) => c.set === set.cards[0].set)).toBe(true);
  });

  it("builds pkmncards image URLs (the dot kept, no set code, ♀ → female: checked with npm run check-images)", () => {
    const at = (n: number) => getCardImageUrl(set.cards.find((c) => c.number === n)!);
    expect(at(11)).toBe("https://pkmncards.com/wp-content/uploads/lt.-surges-raichu-gym-challenge-11.jpg");
    expect(at(59)).toBe("https://pkmncards.com/wp-content/uploads/sabrinas-mr.-mime-gym-challenge-59.jpg");
    expect(at(75)).toBe("https://pkmncards.com/wp-content/uploads/giovannis-nidoran-female-gym-challenge-75.jpg");
    expect(at(111)).toBe("https://pkmncards.com/wp-content/uploads/blaines-quiz-2-gym-challenge-111.jpg");
  });

  it("has every unique printed card, in number order, with unique ids", () => {
    const expected = src.filter((c) => !EXCLUDED.has(c.number)).map((c) => Number(c.number));
    expect(set.cards.map((c) => c.number)).toEqual(expected);
    expect(set.cards).toHaveLength(122);
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads Giovanni and Koga as owners", () => {
    expect(ownerOf({ name: "Giovanni's Machamp" })).toBe("Giovanni");
    expect(ownerOf({ name: "Koga's Beedrill" })).toBe("Koga");
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

  it.each(src.filter((c) => !EXCLUDED.has(c.number) && c.supertype === "Trainer"))("#$number $name is a Trainer with Spanish text", (s) => {
    const card = set.cards.find((c) => c.number === Number(s.number))!;
    expect(card.kind).toBe("trainer");
    if (card.kind !== "trainer") return;
    expect(card.name).toBe(s.name);
    expect(card.rarity).toBe(RARITY[s.rarity!]);
    expect(card.trainerType === TrainerType.Stadium).toBe(!!s.subtypes?.includes("Stadium"));
    expect(card.effect.length).toBeGreaterThan(20);
  });

  it("gives one Spanish name per English attack name", () => {
    const names = new Map<string, Set<string>>();
    for (const s of src.filter((c) => !EXCLUDED.has(c.number) && c.supertype === "Pokémon")) {
      const card = set.cards.find((c) => c.number === Number(s.number))!;
      if (card.kind !== "pokemon") continue;
      (s.attacks ?? []).forEach((a, i) => names.set(a.name, new Set([...(names.get(a.name) ?? []), card.attacks[i].name])));
    }
    for (const [english, spanish] of names) expect([...spanish], english).toHaveLength(1);
  });
});
