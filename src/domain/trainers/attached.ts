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
 * | Brock's Protection (GC) | a Pokémon with Brock in its name | the opponent's attacks and Trainers can't take its attached Energy cards off it (energyRemovalBlocked) | stays (until it leaves play) |
 * | Koga's Ninja Trick (GC) | the Active with Koga in its name | when the opponent attacks, its owner may switch it with a Benched Pokémon first (executeAttack asks, "preAttack"); then discarded | stays; discarded as soon as its Pokémon is on the Bench (checkKnockouts' sweep) |
 *
 * Pure and type-only on the engine side, so lib/gameState.ts can import it.
 */

import type { GameCard, PokemonInPlay } from "@/lib/gameState";

export const CHARITY = "Charity";
export const SABRINAS_ESP = "Sabrina's ESP";
export const BROCKS_PROTECTION = "Brock's Protection";
export const KOGAS_NINJA_TRICK = "Koga's Ninja Trick";

/**
 * How long an attached Trainer stays: until the end of its owner's turn (Charity, ESP), until its
 * Pokémon leaves play (Brock's Protection), or while its Pokémon is the Active (Koga's Ninja Trick).
 */
export type AttachedTrainerExpiry = "endOfTurn" | "untilLeavesPlay" | "whileActive";

/** Attached Trainers that stay until their Pokémon leaves play, and those discarded once it is Benched. */
const UNTIL_LEAVES_PLAY: ReadonlySet<string> = new Set([BROCKS_PROTECTION]);
const WHILE_ACTIVE: ReadonlySet<string> = new Set([KOGAS_NINJA_TRICK]);

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
  const known = expires === "endOfTurn" ? !!AT_END_OF_TURN[card.name] : (expires === "whileActive" ? WHILE_ACTIVE : UNTIL_LEAVES_PLAY).has(card.name);
  if (!known) {
    throw new Error(`attachTrainer: ${card.name} has no "${expires}" rule (domain/trainers/attached.ts)`);
  }
  return { ...pokemon, attachedTrainers: [...(pokemon.attachedTrainers ?? []), card] };
}

/** The first Trainer named `name` attached to `pokemon`, if any. */
export function attachedTrainerNamed(pokemon: PokemonInPlay | null | undefined, name: string): GameCard | undefined {
  return pokemon?.attachedTrainers?.find((c) => c.name === name);
}

/** The attached Trainers a Benched Pokémon can't keep (Koga's Ninja Trick: discarded once its Pokémon is on the Bench). */
export function benchedLeavers(pokemon: PokemonInPlay): GameCard[] {
  return (pokemon.attachedTrainers ?? []).filter((c) => WHILE_ACTIVE.has(c.name));
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
