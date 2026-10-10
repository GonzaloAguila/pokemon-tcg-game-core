/**
 * Fossil catalog checked against the source data (data/pokemontcg/base3.json): every
 * number that matters for play (HP, types, stage, weakness, resistance, retreat, attack
 * costs and damage) is compared programmatically; names through the translation tables.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_CARDS, fossilCards, getSetById } from "@/domain/catalog";
import type { Card, PokemonCard } from "@/domain/cards";
import { CardRarity, PokemonStage } from "@/domain/constants";

type JsonAttack = { name: string; cost?: string[]; damage: string; text: string };
type JsonCard = {
  name: string;
  number: string;
  supertype: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  rarity: string;
  abilities?: { name: string; type: string }[];
  attacks?: JsonAttack[];
  weaknesses?: { type: string }[];
  resistances?: { type: string }[];
  convertedRetreatCost?: number;
};

const source: JsonCard[] = JSON.parse(readFileSync(join(process.cwd(), "data/pokemontcg/base3.json"), "utf8")).data;
const sourceByNumber = new Map(source.map((c) => [Number(c.number), c]));

const STAGE: Record<string, string> = { Basic: PokemonStage.Basic, "Stage 1": PokemonStage.Stage1, "Stage 2": PokemonStage.Stage2 };
const RARITY: Record<string, string> = { "Rare Holo": CardRarity.RareHolo, Rare: CardRarity.Rare, Uncommon: CardRarity.Uncommon, Common: CardRarity.Common };
const lower = (types: string[] | undefined) => (types ?? []).map((t) => t.toLowerCase());
/** "40×" / "10+" / "30" / "" → comparable string ("40x", "10+", "30", "") */
const damageOf = (value: string | number | undefined) => String(value ?? "").replace("×", "x");

/** English attack / power names → the Spanish names used in the catalogs */
const ATTACK_NAMES: Record<string, string> = {
  "Wing Attack": "Ataque Ala",
  "Freeze Dry": "Liofilización",
  Blizzard: "Ventisca",
  Slam: "Portazo",
  "Dark Mind": "Mente Oscura",
  Nightmare: "Pesadilla",
  "Stretch Kick": "Patada Estirada",
  "High Jump Kick": "Patada Salto Alta",
  Prophecy: "Profecía",
  "Sharp Sickle": "Hoz Afilada",
  Absorb: "Absorber",
  "Water Gun": "Pistola de Agua",
  "Confuse Ray": "Rayo Confuso",
  Sonicboom: "Bomba Sónica",
  Selfdestruct: "Autodestrucción",
  Wildfire: "Fuego Salvaje",
  "Dive Bomb": "Bomba en Picado",
  Sludge: "Residuos",
  Gigashock: "Gigadescarga",
  Thunderstorm: "Tormenta Eléctrica",
  "Terror Strike": "Golpe Terrorífico",
  "Poison Fang": "Colmillo Veneno",
  Clamp: "Tenaza",
  "Spike Cannon": "Clavo Cañón",
  Lick: "Lengüetazo",
  "Energy Conversion": "Conversión de Energía",
  "Leech Life": "Chupavidas",
  Psyshock: "Psicochoque",
  "Hyper Beam": "Híper Rayo",
  Avalanche: "Alud",
  Harden: "Endurecimiento",
  "Rock Throw": "Lanzarrocas",
  Flail: "Azote",
  Crabhammer: "Martillazo",
  Smokescreen: "Pantalla de Humo",
  Smog: "Polución",
  Slash: "Cuchillada",
  "Fury Swipes": "Golpes Furia",
  Agility: "Agilidad",
  Supersonic: "Supersónico",
  "Jellyfish Sting": "Picadura de Medusa",
  "Spit Poison": "Escupir Veneno",
  Wrap: "Constricción",
  "Stone Barrage": "Lluvia de Piedras",
  "Nasty Goo": "Baba Asquerosa",
  Minimize: "Minimizar",
  Scratch: "Arañazo",
  "Call for Family": "Llamar a la Familia",
  Irongrip: "Agarre Férreo",
  Headache: "Dolor de Cabeza",
  "Hide in Shell": "Esconderse en el Caparazón",
  "Spacing Out": "Despiste",
  Scavenge: "Rebuscar",
  Acid: "Ácido",
};
const POWER_NAMES: Record<string, string> = {
  "Prehistoric Power": "Poder Prehistórico",
  Transform: "Transformación",
  "Step In": "Entrada",
  Curse: "Maldición",
  Transparency: "Transparencia",
  "Toxic Gas": "Gas Tóxico",
  "Strange Behavior": "Comportamiento Extraño",
  "Kabuto Armor": "Armadura Kabuto",
  Clairvoyance: "Clarividencia",
  Cowardice: "Cobardía",
};

const isPokemon = (c: Card): c is PokemonCard => c.kind === "pokemon";

describe("Fossil catalog", () => {
  it("has the 47 unique cards (non-holo duplicates #16–30 excluded) with unique fossil- ids", () => {
    expect(fossilCards).toHaveLength(47);
    expect(getSetById("fossil")?.cards).toBe(fossilCards);
    const numbers = fossilCards.map((c) => c.number);
    expect(numbers.filter((n) => n >= 16 && n <= 30)).toEqual([]);
    expect(new Set(numbers).size).toBe(47);
    const ids = fossilCards.map((c) => c.id);
    expect(new Set(ids).size).toBe(47);
    expect(ids.every((id) => /^fossil-\d{3}-[a-z0-9-]+$/.test(id))).toBe(true);
    expect(fossilCards.find((c) => c.number === 58)?.id).toBe("fossil-058-mr-fuji");
  });

  it("every evolvesFrom names a card in the registry (Aerodactyl, Kabuto, Omanyte from Mysterious Fossil)", () => {
    const names = new Set(ALL_CARDS.map((c) => c.name));
    for (const card of fossilCards.filter(isPokemon)) {
      if (card.evolvesFrom) expect(names.has(card.evolvesFrom), `${card.name} evolves from ${card.evolvesFrom}`).toBe(true);
    }
    const fromFossil = fossilCards.filter((c) => isPokemon(c) && c.evolvesFrom === "Mysterious Fossil").map((c) => c.name);
    expect(fromFossil.sort()).toEqual(["Aerodactyl", "Kabuto", "Omanyte"]);
  });

  it("matches base3.json: name, kind, rarity, HP, types, stage, evolution, weakness, resistance, retreat", () => {
    for (const card of fossilCards) {
      const json = sourceByNumber.get(card.number)!;
      const where = `#${card.number} ${card.name}`;
      expect(json, where).toBeDefined();
      expect(card.name, where).toBe(json.name);
      expect(card.kind, where).toBe(json.supertype === "Pokémon" ? "pokemon" : "trainer");
      expect(card.rarity, where).toBe(RARITY[json.rarity]);
      if (!isPokemon(card)) continue;
      expect(card.hp, where).toBe(Number(json.hp));
      expect(card.types, where).toEqual(lower(json.types));
      expect(card.stage, where).toBe(STAGE[json.subtypes![0]]);
      expect(card.evolvesFrom, where).toBe(json.evolvesFrom);
      expect(card.weaknesses ?? [], where).toEqual(lower(json.weaknesses?.map((w) => w.type)));
      expect(card.resistances ?? [], where).toEqual(lower(json.resistances?.map((r) => r.type)));
      expect(card.retreatCost, where).toBe(json.convertedRetreatCost ?? 0);
    }
  });

  it("matches base3.json: attacks (cost, damage, translated name) and powers", () => {
    const attackTranslations = new Map<string, Set<string>>();
    for (const card of fossilCards.filter(isPokemon)) {
      const json = sourceByNumber.get(card.number)!;
      const where = `#${card.number} ${card.name}`;
      const attacks = json.attacks ?? [];
      expect(card.attacks.map((a) => a.name), where).toEqual(attacks.map((a) => ATTACK_NAMES[a.name]));
      attacks.forEach((attack, i) => {
        const ours = card.attacks[i];
        expect(ours.cost, `${where} ${attack.name} cost`).toEqual(lower(attack.cost));
        expect(damageOf(ours.damage), `${where} ${attack.name} damage`).toBe(damageOf(attack.damage));
        expect(ours.text ?? "", `${where} ${attack.name} has a Spanish text when printed text exists`).toBe(
          attack.text ? ours.text : ""
        );
        if (!attackTranslations.has(attack.name)) attackTranslations.set(attack.name, new Set());
        attackTranslations.get(attack.name)!.add(ours.name);
      });
      const power = json.abilities?.find((a) => a.type === "Pokémon Power");
      expect(card.power?.name, where).toBe(power ? POWER_NAMES[power.name] : undefined);
    }
    // One Spanish name per English attack name
    for (const [english, spanish] of attackTranslations) expect([...spanish], english).toHaveLength(1);
  });

  it("repeated attacks reuse the Spanish names of Base Set / Jungle", () => {
    const earlier = ALL_CARDS.filter((c) => c.set !== "Fossil" && isPokemon(c)).flatMap((c) => (c as PokemonCard).attacks.map((a) => a.name));
    for (const name of ["Ataque Ala", "Portazo", "Rayo Confuso", "Autodestrucción", "Psicochoque", "Híper Rayo", "Endurecimiento", "Lanzarrocas", "Azote", "Cuchillada", "Agilidad", "Minimizar", "Arañazo", "Agarre Férreo", "Ácido", "Pistola de Agua"]) {
      expect(earlier, name).toContain(name);
    }
  });
});
