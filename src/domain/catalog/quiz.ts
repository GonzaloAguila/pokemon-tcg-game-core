/**
 * Blaine's Quiz #3 (Gym Challenge): "tell your opponent the name of 1 of its attacks; your
 * opponent guesses the name of that card". A free-text guess isn't possible in the UI, so the
 * opponent picks among 4 names: the right one and 3 other Pokémon names, preferring cards that
 * have an attack with that name (accepted default, docs/card-doubts.md → "Gym Challenge").
 */

import type { GameCard } from "@/lib/gameState";
import { isPokemonCard } from "@/domain/cards";
import { ALL_CARDS } from "./sets";

function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** A seeded Fisher-Yates (xorshift on the text's hash): the same order everywhere. */
function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = hashOf(seedText) || 1;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

/**
 * The 4 card names Blaine's Quiz #3 offers for `card` and its attack `attackName`: its own name
 * and 3 other Pokémon names — other cards with an attack of that name first, then any other
 * Pokémon — sorted alphabetically. Deterministic (no RNG): the server and every client build the
 * same step. The option ids are the names.
 */
export function quizCardNameOptions(card: GameCard, attackName: string): string[] {
  const others = new Map<string, boolean>();
  for (const c of ALL_CARDS) {
    if (!isPokemonCard(c) || c.name === card.name) continue;
    const sameAttack = c.attacks.some((a) => a.name === attackName);
    others.set(c.name, (others.get(c.name) ?? false) || sameAttack);
  }
  const seed = `${card.name}|${attackName}`;
  const sharing = seededShuffle([...others].filter(([, same]) => same).map(([name]) => name).sort(), seed);
  const rest = seededShuffle([...others].filter(([, same]) => !same).map(([name]) => name).sort(), seed);
  return [card.name, ...[...sharing, ...rest].slice(0, 3)].sort((a, b) => a.localeCompare(b));
}
