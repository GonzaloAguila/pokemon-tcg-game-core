/**
 * Random but sensible 60-card decks for bots: one or two Energy types, complete evolution
 * lines (Basic → Stage 1 → Stage 2 when the sets have them), some Trainers and matching
 * basic Energy. Basic Energy and Double Colorless come from Base Set whatever the filter
 * (the expansions have no Energy cards).
 */

import type { Card, PokemonCard } from "@/domain/cards";
import { CARD_SETS, getSet, type CardSetId } from "@/domain/catalog";
import { CardKind, CardSet, EnergyType, PokemonStage } from "@/domain/constants";
import type { Deck, DeckEntry } from "@/domain/decks";
import { UNSUPPORTED_TRAINERS } from "@/domain/effects";
import { pick, pickSome, randomInt, shuffled, type Rng } from "./rng";

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
  for (let i = 0; i < 40 && total < DECK_SIZE && trainers.length > 0 && countTrainers(entries) < trainerTarget; i++) {
    add(pick(rng, trainers), 1 + randomInt(rng, 2));
  }
  if (doubleColorless && rng() < 0.5) add(doubleColorless, 1 + randomInt(rng, 3));

  // Fill with basic Energy of the deck types
  let typeIndex = 0;
  while (total < DECK_SIZE) {
    add(basicEnergyOf(deckTypes[typeIndex % deckTypes.length]), 1);
    typeIndex++;
  }

  const cards: DeckEntry[] = [...entries.values()].map(({ card, quantity }) => ({
    cardNumber: card.number,
    quantity,
    set: card.set === CardSet.BaseSet ? undefined : card.set,
  }));
  return { id: `sim-${name}`, name, image: "", cards };
}

function countTrainers(entries: Map<string, Counted>): number {
  let count = 0;
  for (const { card, quantity } of entries.values()) if (card.kind === CardKind.Trainer) count += quantity;
  return count;
}

/** All set ids known to the registry */
export function allSetIds(): CardSetId[] {
  return CARD_SETS.map((s) => s.id);
}
