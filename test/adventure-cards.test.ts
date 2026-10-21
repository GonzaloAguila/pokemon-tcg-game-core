/**
 * The Base Set cards of Adventure 1 (spec §8) against the printed cards: name, number, stage, HP,
 * types, Weakness, Resistance and retreat cost. Literals from api.pokemontcg.io set `base1`
 * (fetched 2026-10-21; retreat null = 0).
 */
import { describe, expect, it } from "vitest";
import { findCardById, isAdventureCardAllowed } from "../src";
import type { Card } from "../src/domain/cards";

type Printed = [id: string, name: string, kind: string, hp: number | null, types: string[], weaknesses: string[], resistances: string[], retreat: number | null];

const PRINTED: Printed[] = [
  ["base-set-002-blastoise", "Blastoise", "Stage 2", 100, ["water"], ["lightning"], [], 3],
  ["base-set-004-charizard", "Charizard", "Stage 2", 120, ["fire"], ["water"], ["fighting"], 3],
  ["base-set-015-venusaur", "Venusaur", "Stage 2", 100, ["grass"], ["fire"], [], 2],
  ["base-set-017-beedrill", "Beedrill", "Stage 2", 80, ["grass"], ["fire"], ["fighting"], null],
  ["base-set-019-dugtrio", "Dugtrio", "Stage 1", 70, ["fighting"], ["grass"], ["lightning"], 2],
  ["base-set-022-pidgeotto", "Pidgeotto", "Stage 1", 60, ["colorless"], ["lightning"], ["fighting"], 1],
  ["base-set-024-charmeleon", "Charmeleon", "Stage 1", 80, ["fire"], ["water"], [], 1],
  ["base-set-030-ivysaur", "Ivysaur", "Stage 1", 60, ["grass"], ["fire"], [], 1],
  ["base-set-033-kakuna", "Kakuna", "Stage 1", 80, ["grass"], ["fire"], [], 2],
  ["base-set-034-machoke", "Machoke", "Stage 1", 80, ["fighting"], ["psychic"], [], 3],
  ["base-set-035-magikarp", "Magikarp", "Basic", 30, ["water"], ["lightning"], [], 1],
  ["base-set-038-poliwhirl", "Poliwhirl", "Stage 1", 60, ["water"], ["grass"], [], 1],
  ["base-set-040-raticate", "Raticate", "Stage 1", 60, ["colorless"], ["fighting"], ["psychic"], 1],
  ["base-set-042-wartortle", "Wartortle", "Stage 1", 70, ["water"], ["lightning"], [], 1],
  ["base-set-044-bulbasaur", "Bulbasaur", "Basic", 40, ["grass"], ["fire"], [], 1],
  ["base-set-045-caterpie", "Caterpie", "Basic", 40, ["grass"], ["fire"], [], 1],
  ["base-set-046-charmander", "Charmander", "Basic", 50, ["fire"], ["water"], [], 1],
  ["base-set-047-diglett", "Diglett", "Basic", 30, ["fighting"], ["grass"], ["lightning"], null],
  ["base-set-048-doduo", "Doduo", "Basic", 50, ["colorless"], ["lightning"], ["fighting"], null],
  ["base-set-052-machop", "Machop", "Basic", 50, ["fighting"], ["psychic"], [], 1],
  ["base-set-053-magnemite", "Magnemite", "Basic", 40, ["lightning"], ["fighting"], [], 1],
  ["base-set-054-metapod", "Metapod", "Stage 1", 70, ["grass"], ["fire"], [], 2],
  ["base-set-056-onix", "Onix", "Basic", 90, ["fighting"], ["grass"], [], 3],
  ["base-set-057-pidgey", "Pidgey", "Basic", 40, ["colorless"], ["lightning"], ["fighting"], 1],
  ["base-set-058-pikachu", "Pikachu", "Basic", 40, ["lightning"], ["fighting"], [], 1],
  ["base-set-059-poliwag", "Poliwag", "Basic", 40, ["water"], ["grass"], [], 1],
  ["base-set-061-rattata", "Rattata", "Basic", 30, ["colorless"], ["fighting"], ["psychic"], null],
  ["base-set-062-sandshrew", "Sandshrew", "Basic", 40, ["fighting"], ["grass"], ["lightning"], 1],
  ["base-set-063-squirtle", "Squirtle", "Basic", 40, ["water"], ["lightning"], [], 1],
  ["base-set-065-staryu", "Staryu", "Basic", 40, ["water"], ["lightning"], [], 1],
  ["base-set-067-voltorb", "Voltorb", "Basic", 40, ["lightning"], ["fighting"], [], 1],
  ["base-set-069-weedle", "Weedle", "Basic", 40, ["grass"], ["fire"], [], 1],
  ["base-set-071-computer-search", "Computer Search", "Trainer", null, [], [], [], null],
  ["base-set-080-defender", "Defender", "Trainer", null, [], [], [], null],
  ["base-set-084-pluspower", "PlusPower", "Trainer", null, [], [], [], null],
  ["base-set-086-pokemon-flute", "Pokémon Flute", "Trainer", null, [], [], [], null],
  ["base-set-088-professor-oak", "Professor Oak", "Trainer", null, [], [], [], null],
  ["base-set-090-super-potion", "Super Potion", "Trainer", null, [], [], [], null],
  ["base-set-091-bill", "Bill", "Trainer", null, [], [], [], null],
  ["base-set-092-energy-removal", "Energy Removal", "Trainer", null, [], [], [], null],
  ["base-set-093-gust-of-wind", "Gust of Wind", "Trainer", null, [], [], [], null],
  ["base-set-094-potion", "Potion", "Trainer", null, [], [], [], null],
  ["base-set-095-switch", "Switch", "Trainer", null, [], [], [], null],
  ["base-set-096-double-colorless-energy", "Double Colorless Energy", "Energy", null, [], [], [], null],
  ["base-set-097-fighting-energy", "Fighting Energy", "Energy", null, [], [], [], null],
  ["base-set-098-fire-energy", "Fire Energy", "Energy", null, [], [], [], null],
  ["base-set-099-grass-energy", "Grass Energy", "Energy", null, [], [], [], null],
  ["base-set-100-lightning-energy", "Lightning Energy", "Energy", null, [], [], [], null],
  ["base-set-102-water-energy", "Water Energy", "Energy", null, [], [], [], null],
];

const STAGES: Record<string, string> = { Basic: "basic", "Stage 1": "stage-1", "Stage 2": "stage-2" };

function printedNumber(id: string): number {
  return Number(id.split("-")[2]);
}

describe("Adventure 1 cards match the printed Base Set cards", () => {
  it("lists the 49 cards of spec §8", () => {
    expect(PRINTED).toHaveLength(49);
  });

  it.each(PRINTED)("%s", (id, name, kind, hp, types, weaknesses, resistances, retreat) => {
    const card = findCardById(id) as Card | undefined;
    expect(card, id).toBeDefined();
    if (!card) return;
    expect(card.name).toBe(name);
    expect(card.number).toBe(printedNumber(id));
    expect(isAdventureCardAllowed(card)).toBe(true);
    if (kind === "Trainer") return expect(card.kind).toBe("trainer");
    if (kind === "Energy") return expect(card.kind).toBe("energy");
    if (card.kind !== "pokemon") throw new Error(`${id} is not a Pokémon`);
    expect(card.stage).toBe(STAGES[kind]);
    expect(card.hp).toBe(hp);
    expect(card.types).toEqual(types);
    expect(card.weaknesses ?? []).toEqual(weaknesses);
    expect(card.resistances ?? []).toEqual(resistances);
    expect(card.retreatCost).toBe(retreat ?? 0);
  });
});
