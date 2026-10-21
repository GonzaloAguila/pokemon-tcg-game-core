/**
 * Adventure decks: decks from catalog card ids and the deck-building rule shared by the API and
 * the frontend (`validateDeckEntries`).
 */

import type { Card } from "@/domain/cards";
import { isLimitedInDeck } from "@/domain/cards/guards";
import { findCardById, isSetInDevelopment } from "@/domain/catalog";
import { UNSUPPORTED_TRAINERS } from "@/domain/effects/trainers";
import type { GameCard } from "@/lib/gameState";
import { IllegalActionError } from "@/shared/errors";
import type { CardEntry } from "./types";

/**
 * The cards of a deck list (one instance per copy, in entry order). Ids are opaque and unique
 * (`<idPrefix>-<n>`, n a random permutation of 0..size-1 drawn with Math.random — inside a
 * caller's `withRandom` they are deterministic): a masked card shows only its id, which never
 * names the card nor its place in the list. Use a different `idPrefix` per side. Throws
 * IllegalActionError "Carta desconocida: <id>" for an id missing from the catalog.
 */
export function deckFromCardEntries(entries: readonly CardEntry[], idPrefix: string = "card"): GameCard[] {
  const cards: Card[] = [];
  for (const entry of entries) {
    const card = findCardById(entry.cardId);
    if (!card) throw new IllegalActionError(`Carta desconocida: ${entry.cardId}`);
    for (let i = 0; i < entry.qty; i++) cards.push(card);
  }
  const numbers = cards.map((_, i) => i);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return cards.map((card, i) => ({ ...card, id: `${idPrefix}-${numbers[i]}` }) as GameCard);
}

/** Deck-building rules: size range and copies per card name (`maxCopies: null` = no limit, adventure mode). */
export type DeckRules = { minSize: number; maxSize: number; maxCopies: number | null };

/**
 * Why the deck list breaks the rules (Spanish), or null. Copies are counted by card NAME across
 * sets (Base Set and Team Rocket Charmander together); basic Energy is unlimited
 * (`isLimitedInDeck`), Double Colorless Energy is not. Unknown ids and quantities below 1 are errors.
 */
export function validateDeckEntries(entries: readonly CardEntry[], rules: DeckRules): string | null {
  let size = 0;
  const copies = new Map<string, number>();
  for (const entry of entries) {
    const card = findCardById(entry.cardId);
    if (!card) return `Carta desconocida: ${entry.cardId}`;
    if (!Number.isInteger(entry.qty) || entry.qty < 1) return `Cantidad inválida de ${card.name}: ${entry.qty}`;
    size += entry.qty;
    if (isLimitedInDeck(card)) copies.set(card.name, (copies.get(card.name) ?? 0) + entry.qty);
  }
  if (size < rules.minSize) return `El mazo debe tener al menos ${rules.minSize} cartas (tiene ${size})`;
  if (size > rules.maxSize) return `El mazo puede tener como máximo ${rules.maxSize} cartas (tiene ${size})`;
  if (rules.maxCopies !== null) {
    for (const [name, count] of copies) {
      if (count > rules.maxCopies) return `Máximo ${rules.maxCopies} copias de ${name} (hay ${count})`;
    }
  }
  return null;
}

/**
 * May the card appear in adventure content (starter / rival decks, treasures, bonus cards)? In the
 * catalog, its set released (not `inDevelopment`), and — a Trainer — playable (not in
 * UNSUPPORTED_TRAINERS).
 */
export function isAdventureCardAllowed(card: Card): boolean {
  if (findCardById(card.id) === undefined) return false;
  if (isSetInDevelopment(card)) return false;
  return !(card.kind === "trainer" && UNSUPPORTED_TRAINERS.includes(card.name));
}
