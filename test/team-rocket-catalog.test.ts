/**
 * Team Rocket catalog checked against the source data (data/pokemontcg/base5.json): every
 * number that matters for play (HP, types, stage, weakness, resistance, retreat, attack
 * costs and damage) is compared programmatically; names through the translation tables.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_CARDS, teamRocketCards, getSetById, getCardImageUrl } from "@/domain/catalog";
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

const source: JsonCard[] = JSON.parse(readFileSync(join(process.cwd(), "data/pokemontcg/base5.json"), "utf8")).data;
const sourceByNumber = new Map(source.map((c) => [Number(c.number), c]));

const STAGE: Record<string, string> = { Basic: PokemonStage.Basic, "Stage 1": PokemonStage.Stage1, "Stage 2": PokemonStage.Stage2 };
const RARITY: Record<string, string> = {
  "Rare Holo": CardRarity.RareHolo,
  "Rare Secret": CardRarity.RareHolo,
  Rare: CardRarity.Rare,
  Uncommon: CardRarity.Uncommon,
  Common: CardRarity.Common,
};
const KIND: Record<string, string> = { "Pokémon": "pokemon", Trainer: "trainer", Energy: "energy" };
const lower = (types: string[] | undefined) => (types ?? []).map((t) => t.toLowerCase());
const damageOf = (value: string | number | undefined) => String(value ?? "").replace("×", "x");
const EXCLUDED = [...Array.from({ length: 14 }, (_, i) => 18 + i), 71, 72, 80];

/** English attack / power names → the Spanish names used in the catalog */
const ATTACK_NAMES: Record<string, string> = {
  "Teleport Blast": "Teletransporte Explosivo",
  "Mind Shock": "Choque Mental",
  Stare: "Mirada",
  "Poison Vapor": "Vapor Venenoso",
  Hydrocannon: "Hidrocañón",
  "Rocket Tackle": "Placaje Cohete",
  "Nail Flick": "Golpe de Uña",
  "Continuous Fireball": "Bola de Fuego Continua",
  "Giant Tail": "Cola Gigante",
  "Knock Down": "Derribar",
  Flitter: "Revoloteo",
  "Ice Beam": "Rayo Hielo",
  Psypunch: "Psicopuño",
  "Bench Manipulation": "Manipulación de Banca",
  "Mega Punch": "Mega Puño",
  Fling: "Lanzamiento",
  Sonicboom: "Bomba Sónica",
  "Magnetic Lines": "Líneas Magnéticas",
  "Fickle Attack": "Ataque Caprichoso",
  "Petal Whirlwind": "Torbellino de Pétalos",
  "Mass Explosion": "Explosión Masiva",
  "Stun Gas": "Gas Paralizante",
  "Tail Slap": "Coletazo",
  Fireball: "Bola de Fuego",
  "Tail Strike": "Golpe de Cola",
  "Rolling Tackle": "Placaje Rodante",
  "Energy Bomb": "Bomba de Energía",
  Rage: "Furia",
  "Playing with Fire": "Jugar con Fuego",
  Poisonpowder: "Polvo Veneno",
  "Third Eye": "Tercer Ojo",
  "Super Psy": "Super Psi",
  "Lightning Flash": "Destello Eléctrico",
  "Thunder Attack": "Ataque Trueno",
  "Drag Off": "Arrastrar",
  "Knock Back": "Empujón",
  "Sludge Punch": "Puño Residuo",
  Fascinate: "Fascinar",
  "Poison Claws": "Garras Venenosas",
  "Frenzied Attack": "Ataque Frenético",
  "Rear Kick": "Coz",
  "Flame Pillar": "Pilar de Llamas",
  Bite: "Mordisco",
  Whirlpool: "Torbellino",
  Doubleslap: "Bofetón Doble",
  "Mirror Shell": "Caparazón Espejo",
  Flop: "Salpicadura",
  "Rapid Evolution": "Evolución Rápida",
  "Conversion 1": "Conversión 1",
  Psybeam: "Psicorrayo",
  Vanish: "Desvanecerse",
  Psyshock: "Psicochoque",
  "Fire Tail": "Cola Ígnea",
  Gnaw: "Roer",
  "Hyper Fang": "Hipercolmillo",
  "Dig Under": "Cavar",
  Scratch: "Arañazo",
  Wrap: "Constricción",
  Nightmare: "Pesadilla",
  Tackle: "Placaje",
  "Sand-attack": "Ataque Arena",
  "Poison Sting": "Picotazo Venenoso",
  "Poison Gas": "Gas Venenoso",
  "Sticky Hands": "Manos Pegajosas",
  Punch: "Puñetazo",
  Kick: "Patada",
  Magnetism: "Magnetismo",
  Mischief: "Travesura",
  Anger: "Enfado",
  "Coin Hurl": "Lanzamonedas",
  "Sleep Powder": "Somnífero",
  Ember: "Ascuas",
  Dizziness: "Mareo",
  "Water Gun": "Pistola de Agua",
  "Quick Attack": "Ataque Rápido",
  "Afternoon Nap": "Siesta",
  Headbutt: "Cabezazo",
  "Shell Attack": "Ataque Caparazón",
  "Speed Ball": "Bola Veloz",
  Ram: "Embestida",
  "Surprise Thunder": "Trueno Sorpresa",
};
const POWER_NAMES: Record<string, string> = {
  "Summon Minions": "Invocar Secuaces",
  Sinkhole: "Socavón",
  "Sneak Attack": "Ataque Furtivo",
  "Final Beam": "Rayo Final",
  "Reel In": "Recoger",
  "Hay Fever": "Fiebre del Heno",
  "Evolutionary Light": "Luz Evolutiva",
  "Pollen Stench": "Hedor de Polen",
  "Matter Exchange": "Intercambio de Materia",
  "Sticky Goo": "Baba Pegajosa",
  Frenzy: "Frenesí",
  "Gather Fire": "Reunir Fuego",
  "Long-Distance Hypnosis": "Hipnosis a Distancia",
  Trickery: "Engaño",
};

const isPokemon = (c: Card): c is PokemonCard => c.kind === "pokemon";

describe("Team Rocket catalog", () => {
  it("has the 66 unique cards (non-holo duplicates #18–31, #71, #72, #80 excluded) with unique team-rocket- ids", () => {
    expect(teamRocketCards).toHaveLength(66);
    expect(getSetById("team-rocket")?.cards).toBe(teamRocketCards);
    const numbers = teamRocketCards.map((c) => c.number);
    expect(numbers.filter((n) => EXCLUDED.includes(n))).toEqual([]);
    expect(new Set(numbers).size).toBe(66);
    const expected = source.map((c) => Number(c.number)).filter((n) => !EXCLUDED.includes(n)).sort((a, b) => a - b);
    expect([...numbers].sort((a, b) => a - b)).toEqual(expected);
    const ids = teamRocketCards.map((c) => c.id);
    expect(ids.every((id) => /^team-rocket-\d{3}-[a-z0-9-]+$/.test(id))).toBe(true);
    expect(teamRocketCards.find((c) => c.number === 4)?.id).toBe("team-rocket-004-dark-charizard");
  });

  it("every evolvesFrom names a card in the registry, across sets (Dark Charmeleon from Charmander, Dark Raichu from Pikachu)", () => {
    const names = new Set(ALL_CARDS.map((c) => c.name));
    for (const card of teamRocketCards.filter(isPokemon)) {
      if (card.evolvesFrom) expect(names.has(card.evolvesFrom), `${card.name} evolves from ${card.evolvesFrom}`).toBe(true);
    }
    const raichu = teamRocketCards.find((c) => c.name === "Dark Raichu") as PokemonCard;
    expect(raichu.evolvesFrom).toBe("Pikachu");
    expect(raichu.rarity).toBe(CardRarity.RareHolo);
  });

  it("matches base5.json: name, kind, rarity, HP, types, stage, evolution, weakness, resistance, retreat", () => {
    for (const card of teamRocketCards) {
      const json = sourceByNumber.get(card.number)!;
      const where = `#${card.number} ${card.name}`;
      expect(json, where).toBeDefined();
      expect(card.name, where).toBe(json.name);
      expect(card.kind, where).toBe(KIND[json.supertype]);
      expect(card.rarity, where).toBe(RARITY[json.rarity]);
      if (card.kind === "trainer") {
        expect(card.subtype, where).toBe(json.subtypes?.includes("Rocket's Secret Machine") ? "Rocket's Secret Machine" : undefined);
      }
      if (card.kind === "energy") {
        expect(card.isBasic, where).toBe(false);
        expect(card.provides, where).toBe(1);
      }
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

  it("matches base5.json: attacks (cost, damage, translated name) and powers", () => {
    const attackTranslations = new Map<string, Set<string>>();
    for (const card of teamRocketCards.filter(isPokemon)) {
      const json = sourceByNumber.get(card.number)!;
      const where = `#${card.number} ${card.name}`;
      const attacks = json.attacks ?? [];
      expect(card.attacks.map((a) => a.name), where).toEqual(attacks.map((a) => ATTACK_NAMES[a.name]));
      attacks.forEach((attack, i) => {
        const ours = card.attacks[i];
        expect(ours.cost, `${where} ${attack.name} cost`).toEqual(lower(attack.cost));
        expect(damageOf(ours.damage), `${where} ${attack.name} damage`).toBe(damageOf(attack.damage));
        expect(ours.text ?? "", `${where} ${attack.name} has a Spanish text when printed text exists`).toBe(attack.text ? ours.text : "");
        if (!attackTranslations.has(attack.name)) attackTranslations.set(attack.name, new Set());
        attackTranslations.get(attack.name)!.add(ours.name);
      });
      const power = json.abilities?.find((a) => a.type === "Pokémon Power");
      expect(card.power?.name, where).toBe(power ? POWER_NAMES[power.name] : undefined);
    }
    for (const [english, spanish] of attackTranslations) expect([...spanish], english).toHaveLength(1);
  });

  it("repeated attacks reuse the Spanish names of the earlier sets", () => {
    const earlier = ALL_CARDS.filter((c) => c.set !== "Team Rocket" && isPokemon(c)).flatMap((c) => (c as PokemonCard).attacks.map((a) => a.name));
    for (const name of ["Rayo Hielo", "Mega Puño", "Bomba Sónica", "Polvo Veneno", "Mordisco", "Bofetón Doble", "Conversión 1", "Psicochoque", "Roer", "Arañazo", "Constricción", "Pesadilla", "Placaje", "Ataque Arena", "Picotazo Venenoso", "Ascuas", "Pistola de Agua", "Ataque Rápido", "Cabezazo"]) {
      expect(earlier, name).toContain(name);
    }
  });

  it("image URLs follow pkmncards' team-rocket-tr pattern", () => {
    const url = (name: string) => getCardImageUrl(teamRocketCards.find((c) => c.name === name)!);
    expect(url("Dark Charizard")).toBe("https://pkmncards.com/wp-content/uploads/dark-charizard-team-rocket-tr-4.jpg");
    expect(url("Here Comes Team Rocket!")).toBe("https://pkmncards.com/wp-content/uploads/here-comes-team-rocket-team-rocket-tr-15.jpg");
    expect(url("Rocket's Sneak Attack")).toBe("https://pkmncards.com/wp-content/uploads/rockets-sneak-attack-team-rocket-tr-16.jpg");
    expect(url("Imposter Oak's Revenge")).toBe("https://pkmncards.com/wp-content/uploads/imposter-oaks-revenge-team-rocket-tr-76.jpg");
    expect(url("Challenge!")).toBe("https://pkmncards.com/wp-content/uploads/challenge-team-rocket-tr-74.jpg");
    expect(url("Sleep!")).toBe("https://pkmncards.com/wp-content/uploads/sleep-team-rocket-tr-79.jpg");
    expect(url("Dark Raichu")).toBe("https://pkmncards.com/wp-content/uploads/dark-raichu-team-rocket-tr-83.jpg");
  });
});
