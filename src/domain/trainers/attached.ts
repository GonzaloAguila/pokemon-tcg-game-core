/**
 * Trainers attached to a Pokémon in play until a trigger (Gym Heroes: Charity, Sabrina's ESP),
 * kept in `PokemonInPlay.attachedTrainers` so they move with the Pokémon (Bench, swapSides, the
 * AI's view) and leave play with it (`cardsLeavingPlay`: a Knock Out sends them to the discard
 * pile; Scoop Up discards them like every other card attached to the Pokémon it returns).
 * PlusPower / Defender are older attached Trainers kept as
 * `GameModifier`s instead (lib/modifiers.ts).
 *
 * | Card | Attached to | Effect (engine) | End of its owner's turn |
 * |---|---|---|---|
 * | Charity | the Active | its attack may do less damage to the Defending Pokémon (executeAttack asks the attacker) | back to the hand (unless Knocked Out: it left play with the Pokémon) |
 * | Sabrina's ESP | a Pokémon with Sabrina in its name | its attack's own coins may be re-flipped once (executeAttack asks the attacker) | discarded |
 *
 * Pure and type-only on the engine side, so lib/gameState.ts can import it.
 */

import type { GameCard, PokemonInPlay } from "@/lib/gameState";

export const CHARITY = "Charity";
export const SABRINAS_ESP = "Sabrina's ESP";

/** How long an attached Trainer stays: every one so far, until the end of its owner's turn. */
export type AttachedTrainerExpiry = "endOfTurn";

/** Where each attached Trainer goes at the end of its owner's turn. */
const AT_END_OF_TURN: Readonly<Record<string, "hand" | "discard">> = {
  [CHARITY]: "hand",
  [SABRINAS_ESP]: "discard",
};

/**
 * `pokemon` with `card` attached (pure). `expires` states the card's duration at the call site;
 * the card must be one this module knows what to do with when it expires (AT_END_OF_TURN).
 */
export function attachTrainer(pokemon: PokemonInPlay, card: GameCard, expires: AttachedTrainerExpiry): PokemonInPlay {
  if (expires === "endOfTurn" && !AT_END_OF_TURN[card.name]) {
    throw new Error(`attachTrainer: ${card.name} has no end-of-turn rule (domain/trainers/attached.ts)`);
  }
  return { ...pokemon, attachedTrainers: [...(pokemon.attachedTrainers ?? []), card] };
}

/** The first Trainer named `name` attached to `pokemon`, if any. */
export function attachedTrainerNamed(pokemon: PokemonInPlay | null | undefined, name: string): GameCard | undefined {
  return pokemon?.attachedTrainers?.find((c) => c.name === name);
}

/** A Trainer that left a Pokémon at the end of the turn, for the log. */
export type ExpiredTrainer = { card: GameCard; pokemonName: string; to: "hand" | "discard" };

/**
 * The end of a player's turn for their Pokémon in play (`pokemon`: Active and Bench, in order):
 * every attached Trainer with an end-of-turn rule leaves (Charity to the hand, Sabrina's ESP to
 * the discard pile). Pure: returns the Pokémon without them and the cards per destination.
 */
export function expireAttachedTrainers(pokemon: PokemonInPlay[]): {
  pokemon: PokemonInPlay[];
  toHand: GameCard[];
  toDiscard: GameCard[];
  expired: ExpiredTrainer[];
} {
  const expired: ExpiredTrainer[] = [];
  const kept = pokemon.map((p) => {
    const attached = p.attachedTrainers ?? [];
    const leaving = attached.filter((c) => AT_END_OF_TURN[c.name]);
    if (leaving.length === 0) return p;
    for (const card of leaving) expired.push({ card, pokemonName: p.pokemon.name, to: AT_END_OF_TURN[card.name] });
    return { ...p, attachedTrainers: attached.filter((c) => !AT_END_OF_TURN[c.name]) };
  });
  return {
    pokemon: kept,
    toHand: expired.filter((e) => e.to === "hand").map((e) => e.card),
    toDiscard: expired.filter((e) => e.to === "discard").map((e) => e.card),
    expired,
  };
}
