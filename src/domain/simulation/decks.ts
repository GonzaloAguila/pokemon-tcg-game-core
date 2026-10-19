/**
 * Random but sensible 60-card decks for bots: one or two Energy types, complete evolution
 * lines (Basic → Stage 1 → Stage 2 when the sets have them), some Trainers and matching
 * basic Energy. Basic Energy and Double Colorless come from Base Set whatever the filter
 * (the expansions have no Energy cards).
 */

import type { Card, PokemonCard } from "@/domain/cards";
import { CARD_SETS, getSet, type CardSetId } from "@/domain/catalog";
import { CardKind, CardSet, EnergyType, PokemonStage } from "@/domain/constants";
import { decks as classicThemeDecks, gymLeaderDecks, type Deck, type DeckEntry } from "@/domain/decks";

/** `--decks theme`: the classic theme decks and the Gym Heroes Gym Leader decks */
const themeDecks: Deck[] = [...classicThemeDecks, ...gymLeaderDecks];
import { UNSUPPORTED_TRAINERS } from "@/domain/effects";
import { pick, pickSome, randomInt, shuffled, type Rng } from "./rng";
import { cardRarity, type ExploreMemory } from "./explore";

export const DECK_SIZE = 60;
const MAX_COPIES = 4;

const BASIC_ENERGY_TYPES: EnergyType[] = [
  EnergyType.Grass,
  EnergyType.Fire,
  EnergyType.Water,
  EnergyType.Lightning,
  EnergyType.Psychic,
  EnergyType.Fighting,
];

type Counted = { card: Card; quantity: number };

function key(card: Card): string {
  return `${card.set}#${card.number}`;
}

/** Deck being built: max 4 copies of a non-basic-Energy card by name, never over 60 cards */
function createDeckAccumulator() {
  const entries = new Map<string, Counted>();
  const countByName = new Map<string, number>();
  let total = 0;
  const add = (card: Card, quantity: number): number => {
    const isEnergy = card.kind === CardKind.Energy && card.isBasic;
    const room = isEnergy ? quantity : Math.min(quantity, MAX_COPIES - (countByName.get(card.name) ?? 0));
    const added = Math.max(0, Math.min(room, DECK_SIZE - total));
    if (added === 0) return 0;
    const existing = entries.get(key(card));
    entries.set(key(card), { card, quantity: (existing?.quantity ?? 0) + added });
    countByName.set(card.name, (countByName.get(card.name) ?? 0) + added);
    total += added;
    return added;
  };
  const toDeck = (name: string): Deck => {
    const cards: DeckEntry[] = [...entries.values()].map(({ card, quantity }) => ({
      cardNumber: card.number,
      quantity,
      set: card.set === CardSet.BaseSet ? undefined : card.set,
    }));
    return { id: `sim-${name}`, name, image: "", cards };
  };
  return { entries, add, toDeck, total: () => total };
}

/**
 * Build a random legal deck from the given sets (ids, e.g. ["base-set", "jungle"]).
 * Every deck has at least one Basic Pokémon and exactly 60 cards (max 4 copies of a
 * non-Energy card by name).
 */
export function buildRandomDeck(rng: Rng, setIds: readonly CardSetId[], name = "random"): Deck {
  const sets = setIds.map((id) => getSet(id)).filter((s): s is NonNullable<typeof s> => !!s);
  if (sets.length === 0) throw new Error(`No known set in ${setIds.join(",")}`);
  const pool = sets.flatMap((s) => s.cards);
  const pokemon = pool.filter((c): c is PokemonCard => c.kind === CardKind.Pokemon);
  const trainers = pool.filter((c) => c.kind === CardKind.Trainer && !UNSUPPORTED_TRAINERS.includes(c.name));
  const energySet = getSet("base-set")!.cards;
  const basicEnergyOf = (type: EnergyType) =>
    energySet.find((c) => c.kind === CardKind.Energy && c.isBasic && c.energyType === type)!;
  const doubleColorless = energySet.find((c) => c.kind === CardKind.Energy && !c.isBasic);

  // 1-2 Energy types among those the pool's Basics use (Colorless Pokémon fit any deck)
  const usedTypes = BASIC_ENERGY_TYPES.filter((t) => pokemon.some((p) => p.stage === PokemonStage.Basic && p.types.includes(t)));
  const deckTypes = pickSome(rng, usedTypes.length > 0 ? usedTypes : [EnergyType.Fighting], 1, 2);

  const { entries, add, toDeck, total: deckTotal } = createDeckAccumulator();

  // Evolution lines whose Basic matches the deck types (or is Colorless)
  const fits = (p: PokemonCard) => p.types.some((t) => deckTypes.includes(t) || t === EnergyType.Colorless);
  // Trainers played as Basics with evolutions of the deck types (Mysterious Fossil → Kabuto /
  // Omanyte / Aerodactyl) start lines too
  const fossilRoots = trainers.filter(
    (t) => t.kind === CardKind.Trainer && !!t.playsAsBasic && pokemon.some((p) => p.evolvesFrom === t.name && fits(p))
  );
  const basics: Card[] = shuffled(rng, [...pokemon.filter((p) => p.stage === PokemonStage.Basic && fits(p)), ...fossilRoots]);
  const fallbackBasics = pokemon.filter((p) => p.stage === PokemonStage.Basic);
  const lineCount = 3 + randomInt(rng, 3);
  for (const basic of (basics.some((c) => c.kind === CardKind.Pokemon) ? basics : [...fallbackBasics, ...basics]).slice(0, lineCount)) {
    add(basic, 2 + randomInt(rng, 3));
    const stage1s = pokemon.filter(
      (p) => p.stage === PokemonStage.Stage1 && p.evolvesFrom === basic.name && (basic.kind === CardKind.Pokemon || fits(p))
    );
    if (stage1s.length > 0) {
      const stage1 = pick(rng, stage1s);
      add(stage1, 1 + randomInt(rng, 3));
      const stage2s = pokemon.filter((p) => p.stage === PokemonStage.Stage2 && p.evolvesFrom === stage1.name);
      if (stage2s.length > 0) add(pick(rng, stage2s), 1 + randomInt(rng, 2));
    }
  }

  // Trainers
  const trainerTarget = 8 + randomInt(rng, 9);
  for (let i = 0; i < 40 && deckTotal() < DECK_SIZE && trainers.length > 0 && countTrainers(entries) < trainerTarget; i++) {
    add(pick(rng, trainers), 1 + randomInt(rng, 2));
  }
  if (doubleColorless && rng() < 0.5) add(doubleColorless, 1 + randomInt(rng, 3));
  // Special Energy of the chosen expansions (Rainbow, Full Heal, Potion Energy): limited to 4 like any card
  for (const special of pool.filter((c) => c.kind === CardKind.Energy && !c.isBasic && c.set !== CardSet.BaseSet)) {
    if (rng() < 0.5) add(special, 1 + randomInt(rng, 3));
  }

  // Fill with basic Energy of the deck types
  let typeIndex = 0;
  while (deckTotal() < DECK_SIZE) {
    add(basicEnergyOf(deckTypes[typeIndex % deckTypes.length]), 1);
    typeIndex++;
  }

  return toDeck(name);
}

function countTrainers(entries: Map<string, Counted>): number {
  let count = 0;
  for (const { card, quantity } of entries.values()) if (card.kind === CardKind.Trainer) count += quantity;
  return count;
}

/** `--decks theme`: one of the theme decks (the sets filter doesn't apply), picked at random. */
export function buildThemeDeck(rng: Rng): Deck {
  return pick(rng, themeDecks);
}

/** All set ids known to the registry, but those still in development (pass them with --sets to include them) */
export function allSetIds(): CardSetId[] {
  return CARD_SETS.filter((s) => !s.inDevelopment).map((s) => s.id);
}

/**
 * `--decks random-mix`: a legal random deck mixing every chosen set, built around complete
 * evolution lines of any type (Dark lines, Fossil lines from Mysterious Fossil...), with
 * Trainers and special Energy of all the sets and basic Energy of the types the lines' attacks
 * need. With a memory, the featured lines are those whose attacks / powers the run used least
 * (and the Trainers lean toward the least played), so rare cards keep showing up.
 */
export function buildMixDeck(rng: Rng, setIds: readonly CardSetId[], name = "mix", memory?: ExploreMemory): Deck {
  const sets = setIds.map((id) => getSet(id)).filter((s): s is NonNullable<typeof s> => !!s);
  if (sets.length === 0) throw new Error(`No known set in ${setIds.join(",")}`);
  const pool = sets.flatMap((s) => s.cards);
  const pokemon = pool.filter((c): c is PokemonCard => c.kind === CardKind.Pokemon);
  const trainers = pool.filter((c) => c.kind === CardKind.Trainer && !UNSUPPORTED_TRAINERS.includes(c.name));
  const energySet = getSet("base-set")!.cards;
  const basicEnergyOf = (type: EnergyType) =>
    energySet.find((c) => c.kind === CardKind.Energy && c.isBasic && c.energyType === type)!;
  const specials = [...energySet, ...pool].filter((c, i, all) => c.kind === CardKind.Energy && !c.isBasic && all.indexOf(c) === i);
  const rarity = (card: Card) => (memory ? cardRarity(memory, card) : 0);
  const { entries, add, toDeck, total } = createDeckAccumulator();

  // A line whose earlier stages aren't in the chosen sets takes them from any set (Team
  // Rocket's Dark Raichu evolves from Base Set / Jungle Pikachu)
  const everyCard = CARD_SETS.filter((s) => !s.inDevelopment || setIds.includes(s.id)).flatMap((s) => s.cards);
  const stagesNamed = (from: string, cards: readonly Card[]): Card[] =>
    cards.filter((c) => c.name === from && (c.kind === CardKind.Pokemon || (c.kind === CardKind.Trainer && !!c.playsAsBasic)));
  /** Basic (or Mysterious Fossil) → … → card, picking one card per name at random */
  const lineOf = (top: PokemonCard): Card[] => {
    const line: Card[] = [top];
    let current: Card = top;
    for (let guard = 0; guard < 3 && current.kind === CardKind.Pokemon && current.evolvesFrom; guard++) {
      const from: string = current.evolvesFrom;
      const inPool = stagesNamed(from, pool);
      const previous = inPool.length > 0 ? inPool : stagesNamed(from, everyCard);
      if (previous.length === 0) return [];
      current = pick(rng, previous);
      line.unshift(current);
    }
    return line;
  };
  /** Least-covered cards first (random among ties), then anything */
  const featured = (candidates: PokemonCard[]): PokemonCard | undefined => {
    if (candidates.length === 0) return undefined;
    const low = Math.min(...candidates.map(rarity));
    return pick(rng, candidates.filter((c) => rarity(c) === low));
  };

  const lines: Card[][] = [];
  const used = new Set<string>();
  const addLine = (top: PokemonCard | undefined) => {
    if (!top) return;
    const line = lineOf(top);
    if (line.length === 0 || line.some((c) => used.has(c.name))) return;
    line.forEach((c) => used.add(c.name));
    lines.push(line);
  };
  const withLine = pokemon.filter((p) => lineOf(p).length > 0);
  addLine(featured(withLine));
  addLine(featured(withLine.filter((p) => !used.has(p.name))));
  for (let i = 0, extra = 1 + randomInt(rng, 2); i < extra; i++) addLine(pick(rng, withLine));

  // Lines: 4 Basics, 3 Stage 1, 2-3 Stage 2 (fewer when the name is already at 4)
  for (const line of lines) {
    line.forEach((card, stage) => add(card, stage === 0 ? 4 : stage === 1 ? 3 : 2 + randomInt(rng, 2)));
  }

  // Energy types: what the lines' attacks ask for (then their Pokémon types), at most 3
  const lineCards = lines.flat().filter((c): c is PokemonCard => c.kind === CardKind.Pokemon);
  const wanted = [
    ...lineCards.flatMap((c) => c.attacks.flatMap((a) => a.cost)),
    ...lineCards.flatMap((c) => c.types),
  ].filter((t) => BASIC_ENERGY_TYPES.includes(t));
  const deckTypes = [...new Set(wanted)].slice(0, 3);
  if (deckTypes.length === 0) deckTypes.push(pick(rng, BASIC_ENERGY_TYPES));

  // Trainers (half of the picks favour the least played ones)
  const trainerTarget = 10 + randomInt(rng, 7);
  for (let i = 0; i < 40 && total() < DECK_SIZE - 16 && countTrainers(entries) < trainerTarget; i++) {
    const low = Math.min(...trainers.map(rarity));
    const choice = memory && rng() < 0.5 ? pick(rng, trainers.filter((t) => rarity(t) === low)) : pick(rng, trainers);
    add(choice, 1 + randomInt(rng, 2));
  }
  // Special Energy (Double Colorless, Rainbow, Full Heal, Potion): limited to 4 like any card
  for (const special of specials) if (rng() < 0.4) add(special, 1 + randomInt(rng, 2));

  let typeIndex = 0;
  while (total() < DECK_SIZE) {
    add(basicEnergyOf(deckTypes[typeIndex % deckTypes.length]), 1);
    typeIndex++;
  }
  return toDeck(name);
}
