/**
 * Lucky Duel rules that are tables of cards: the Trainers left out of the pool, the Trainers that
 * only go into a deck whose line can use them, and the powers / attacks that would take the only
 * Pokémon a player has out of play.
 *
 * Audit (2026-10-18) of every Trainer of Base Set, Jungle, Fossil, Team Rocket and Gym Heroes, and of
 * every Pokémon Power / attack effect that moves your own Active or needs a Bench or Prizes:
 * - Bench-searching attacks (Call for Family, Sprout, Call for Friend, Jellyfish Pod...) can't be
 *   used: their own text says "can't be used if your Bench is full", and a locked Bench counts as
 *   full (canExecuteAttack's existing check through maxBenchSize = 0).
 * - Summon Minions (Dark Dragonite) puts nothing on the Bench (no room). Force / self switches
 *   (Whirlwind, Lure, Teleport, Teleport Blast, Fragrance Trap, Flee, Step In), bench damage,
 *   Bench Guard, Retreat Aid, Dark Electrode's Energy Bomb / Lt. Surge's Electabuzz (no Bench:
 *   the Energy is discarded, as printed) and Fairy Power (the Active is only offered with a
 *   Bench) need no change: with no Bench they do nothing for that part. Attacks that require a
 *   Bench (Fling, Fascinate, Drag Off, Fly Swatter, Lucky Throw, Alert) can't be used.
 * - Retreat is impossible (no Benched Pokémon to switch with: canRetreat's existing check).
 * - Trickery (Rattata) and Peek's Prize options need Prizes: the existing "no Prizes" checks cover
 *   them.
 * - Pidgeot's Hurricane and Sabrina's Gengar's Call of the Night remove the OTHER player's Active:
 *   that player has no Pokémon left and loses, as in a standard game without a Bench.
 * - Blocked here: Cowardice (Tentacool) and Buzzap (Electrode) — the player's only Pokémon would
 *   leave play; Vanish (Abra) and Take Away (Erika's Dragonair) — unconditional "shuffle this
 *   Pokémon into your deck". Phoenix Flame (Blaine's Moltres, its only attack) stays usable and works
 *   as printed (owner ruling): on tails Blaine's Moltres is shuffled into the deck and its owner, with
 *   no Pokémon left, loses (a draw if that attack also Knocked Out the other Active).
 */

import type { Attack, Card, PokemonCard } from "@/domain/cards/types";
import { ownerOf, type PokemonOwner } from "@/domain/cards/owner";
import { AttackEffectType, AttackTarget, PokemonPowerType, PokemonStage } from "@/domain/constants";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { isLuckyDuel } from "./mode";

/**
 * Trainers that are never in a Lucky Duel deck (and can't be played in a Lucky Duel), by card
 * name, with the reason shown to the player.
 */
export const LUCKY_DUEL_EXCLUDED_TRAINERS: Readonly<Record<string, string>> = {
  // Need a Benched Pokémon (yours or the other player's)
  "Switch": "necesita un Pokémon en tu Banca",
  "Gust of Wind": "necesita un Pokémon en la Banca del rival",
  "Mr. Fuji": "necesita un Pokémon en tu Banca",
  "Minion of Team Rocket": "necesita un Pokémon en la Banca del rival",
  "Lt. Surge": "pone tu Pokémon activo en la Banca",
  // Put Pokémon on a Bench
  "Challenge!": "pone Pokémon en la Banca",
  "Pokémon Flute": "pone un Pokémon en la Banca del rival",
  "Revive": "pone un Pokémon en tu Banca",
  "Erika's Perfume": "pone Pokémon en la Banca del rival",
  "Clefairy Doll": "se juega como un Pokémon Básico en la Banca",
  "Mysterious Fossil": "se juega como un Pokémon Básico en la Banca",
  "Good Manners": "busca un Pokémon Básico, que no se puede poner en juego",
  // Change the Bench limit or the Retreat cost: no Bench, no Retreat
  "Narrow Gym": "cambia el límite de la Banca",
  "The Rocket's Training Gym": "cambia el coste de retirada y no se puede retirar",
  "Cerulean City Gym": "cambia el coste de retirada y no se puede retirar",
  // Need Prize cards (there are none; with 0 Prizes Treaty would end the game)
  "Here Comes Team Rocket!": "necesita cartas de Premio",
  "Lt. Surge's Treaty": "necesita cartas de Premio",
  // Take your only Pokémon out of play
  "Scoop Up": "devolvería a la mano tu único Pokémon",
};

/** The card may be in a Lucky Duel deck: a Trainer that is not in LUCKY_DUEL_EXCLUDED_TRAINERS. */
export function isLuckyDuelTrainerAllowed(card: Card): boolean {
  return card.kind === "trainer" && !(card.name in LUCKY_DUEL_EXCLUDED_TRAINERS);
}

const lineHasOwner = (line: readonly PokemonCard[], owner: PokemonOwner) =>
  line.some((p) => ownerOf(p) === owner);
const hasEvolution = (line: readonly PokemonCard[]) => line.length > 1;

/**
 * Pool Trainers that only go into a deck whose line (the Basic + its evolutions) can use them —
 * otherwise they could never be played or would do nothing. The spec's Pokémon Breeder rule,
 * extended to the other cards that depend on the line.
 *
 * Since 2026-10-18 every deck also holds 6 extra Pokémon that never enter play (deck.ts
 * drawExtras). That makes Blaine's Quiz #1 (a Pokémon card from the hand) playable in every deck,
 * so it left this table. Pokémon Trader stays tied to an evolution: it now trades an extra for the
 * line's Stage 1 / Stage 2, but with no evolution it could only swap one dead card for another. The
 * owner searches stay tied to the line's evolutions: an extra with that owner in its name found by
 * them could never be played.
 */
const LINE_DEPENDENT_TRAINERS: Readonly<Record<string, (line: readonly PokemonCard[]) => boolean>> = {
  "Pokémon Breeder": (line) => line.some((p) => p.stage === PokemonStage.Stage2),
  // Need an Evolution card (in play, or in the deck to trade an extra for)
  "Devolution Spray": hasEvolution,
  "Pokémon Trader": hasEvolution,
  "Recall": hasEvolution,
  "The Boss's Way": (line) => line.slice(1).some((p) => p.name.startsWith("Dark ")),
  // Search the deck for an owner's Pokémon (only the evolutions are in the deck)
  "Brock's Training Method": (line) => lineHasOwner(line.slice(1), "Brock"),
  "Erika's Maids": (line) => lineHasOwner(line.slice(1), "Erika"),
  // Only for an owner's Pokémon
  "Misty": (line) => lineHasOwner(line, "Misty"),
  "Sabrina's ESP": (line) => lineHasOwner(line, "Sabrina"),
  "Celadon City Gym": (line) => lineHasOwner(line, "Erika"),
  "Pewter City Gym": (line) => lineHasOwner(line, "Brock"),
  "Vermilion City Gym": (line) => lineHasOwner(line, "Lt. Surge"),
};

/** The pool Trainer `card` goes into a deck built around `line` (Basic first). */
export function luckyDuelTrainerFitsLine(card: Card, line: readonly PokemonCard[]): boolean {
  if (!isLuckyDuelTrainerAllowed(card)) return false;
  const fits = LINE_DEPENDENT_TRAINERS[card.name];
  return !fits || fits(line);
}

/** Why `card` can't be played in this game (a Lucky Duel and an excluded Trainer), or null. */
export function getLuckyDuelTrainerBlocker(state: GameState, card: Card | undefined): string | null {
  if (!card || !isLuckyDuel(state) || card.kind !== "trainer") return null;
  const reason = LUCKY_DUEL_EXCLUDED_TRAINERS[card.name];
  return reason ? `En Lucky Duel no se puede jugar ${card.name}: ${reason}` : null;
}

/** Powers that take the Pokémon itself out of play (Cowardice → hand, Buzzap → Knocked Out). */
const SELF_REMOVING_POWERS: ReadonlySet<string> = new Set([PokemonPowerType.ReturnSelfToHand, PokemonPowerType.SelfSacrifice]);

/** Why `pokemon`'s power can't be used in this game (a Lucky Duel and it would leave the player without Pokémon), or null. */
export function getLuckyDuelPowerBlocker(state: GameState, pokemon: PokemonInPlay): string | null {
  if (!isLuckyDuel(state)) return null;
  const card = pokemon.pokemon;
  if (card.kind !== "pokemon" || !card.power || !SELF_REMOVING_POWERS.has(card.power.type)) return null;
  return `En Lucky Duel no se puede usar ${card.power.name}: ${card.name} es tu único Pokémon`;
}

/** The attack always takes the attacker out of play (Vanish, Take Away). Coin-dependent ones (Phoenix Flame) are not. */
function alwaysRemovesAttacker(attack: Attack): boolean {
  return (attack.effects ?? []).some((e) => e.type === AttackEffectType.ShuffleSelfIntoDeck && e.target === AttackTarget.Self && !e.coinFlip);
}

/** Why `attack` can't be used in this game (a Lucky Duel and it takes the attacker out of play), or null. */
export function getLuckyDuelAttackBlocker(state: GameState, attack: Attack): string | null {
  if (!isLuckyDuel(state) || !alwaysRemovesAttacker(attack)) return null;
  return `En Lucky Duel no se puede usar ${attack.name}: sacaría del juego a tu único Pokémon`;
}
