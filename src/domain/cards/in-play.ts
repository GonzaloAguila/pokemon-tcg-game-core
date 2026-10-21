/**
 * Trainers played as Basic Pokémon (Mysterious Fossil, Clefairy Doll — `playsAsBasic`).
 *
 * In play the card IS a Pokémon: `PokemonInPlay.pokemon` holds its in-play form, a
 * PokemonCard (Basic, the printed HP, no type, no attacks, no Weakness/Resistance, retreat 0
 * but it can't retreat) that keeps the original Trainer in `trainerCard`. Every engine rule
 * that reads Pokémon data works unchanged; the Trainer-specific rules ask isTrainerInPlay.
 * As soon as the card leaves play (Knock Out, Scoop Up, Mr. Fuji, discard...) it is that
 * Trainer card again: every exit goes through cardOutOfPlay / cardsLeavingPlay.
 *
 * Pure and dependency-free (types only), so the engine can import it anywhere.
 */

import type { Card, PokemonCard, TrainerCard } from "./types";
import { CardKind, PokemonStage } from "@/domain/constants";
import type { TableRules } from "@/domain/adventure/types";

/** The in-play form of a card put into play as a Basic (identity for real Pokémon). */
export function toInPlayCard<T extends Card>(card: T): T | (PokemonCard & Omit<T, keyof PokemonCard>) {
  if (card.kind !== CardKind.Trainer || !card.playsAsBasic) return card;
  const trainer = card as TrainerCard;
  const inPlay: PokemonCard = {
    id: trainer.id,
    name: trainer.name,
    number: trainer.number,
    set: trainer.set,
    rarity: trainer.rarity,
    ...(trainer.imageSetVersion && { imageSetVersion: trainer.imageSetVersion }),
    kind: CardKind.Pokemon,
    stage: PokemonStage.Basic,
    hp: trainer.playsAsBasic!.hp,
    types: [],
    attacks: [],
    retreatCost: 0,
    weaknesses: [],
    resistances: [],
    trainerCard: trainer,
  };
  return inPlay as PokemonCard & Omit<T, keyof PokemonCard>;
}

/** Is this in-play card a Trainer played as a Basic (Mysterious Fossil, Clefairy Doll)? */
export function isTrainerInPlay(card: Card): card is PokemonCard & { trainerCard: TrainerCard } {
  return card.kind === CardKind.Pokemon && !!card.trainerCard;
}

/** Is this in-play card the placeholder of a face-down card (Lt. Surge's Secret Plan)? */
export function isFaceDownCard(card: Card): card is PokemonCard & { faceDownCard: Card } {
  return card.kind === CardKind.Pokemon && !!card.faceDownCard;
}

/** The card as it is outside play (the Trainer again for a Mysterious Fossil, the real card for a face-down one). */
export function cardOutOfPlay<T extends Card>(card: T): T {
  if (isFaceDownCard(card)) return card.faceDownCard as T;
  return isTrainerInPlay(card) ? ({ ...card.trainerCard, id: card.id } as unknown as T) : card;
}

/** Every card of a Pokémon in play, as they are once they leave play (Pokémon card first). */
export function cardsLeavingPlay<T extends Card>(pokemon: {
  pokemon: T;
  attachedEnergy: T[];
  attachedTrainers?: T[];
  previousEvolutions?: T[];
}): T[] {
  return [
    pokemon.pokemon,
    ...pokemon.attachedEnergy,
    ...(pokemon.attachedTrainers ?? []),
    ...(pokemon.previousEvolutions ?? []),
  ].map(cardOutOfPlay);
}

/** What the table rules need from a state (structural: no engine import here). */
export type PrizeRuleView = {
  tableRules?: TableRules;
  playerActivePokemon: { pokemon: { id: string } } | null;
  playerBench: readonly ({ pokemon: { id: string } } | null)[];
};

/**
 * Adventure battle modifier `noPrizeFor`: is this Pokémon (of `owner`; omitted = found on the
 * board by id, else "opponent") one whose Knock Out gives no Prize at this table? Matched on the
 * name of the card in play (`pokemon.pokemon.name`).
 */
export function noPrizeByTableRule(pokemon: { pokemon: Card }, state?: PrizeRuleView, owner?: "player" | "opponent"): boolean {
  const rule = state?.tableRules?.noPrizeFor;
  if (!rule) return false;
  const id = pokemon.pokemon.id;
  const side =
    owner ?? (state.playerActivePokemon?.pokemon.id === id || state.playerBench.some((p) => p?.pokemon.id === id) ? "player" : "opponent");
  return rule[side]?.includes(pokemon.pokemon.name) ?? false;
}

/**
 * Does Knocking Out this Pokémon give a Prize? Not for a Trainer played as a Basic ("it
 * doesn't count as a Knocked Out Pokémon"), a face-down card, nor — with the state — a Pokémon
 * the table's `noPrizeFor` rule names for its owner (`owner`; omitted: found on the board).
 */
export function givesPrizeWhenKnockedOut(pokemon: { pokemon: Card }, state?: PrizeRuleView, owner?: "player" | "opponent"): boolean {
  return !isTrainerInPlay(pokemon.pokemon) && !isFaceDownCard(pokemon.pokemon) && !noPrizeByTableRule(pokemon, state, owner);
}
