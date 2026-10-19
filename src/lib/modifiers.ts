/**
 * Trainers attached to a Pokémon that the engine keeps as `GameModifier`s (PlusPower attached
 * to the Active, Defender attached to any own Pokémon). They stay with that Pokémon: it keeps
 * them when it evolves (the card named by `targetPokemonId` is then under it) or devolves
 * (Devolution Spray moves the target to the new top card), and they leave play with it
 * (Scoop Up, Mr. Fuji). A modifier without `targetPokemonId` (older states) applies to every
 * Pokémon of its player. Misty (Gym Heroes) is a turn-long modifier of the same list without a
 * target (attackBonusFromModifiers); it holds no card (modifierHoldsCard).
 */
import type { GameModifier, GameState, PokemonInPlay } from "./gameState";
import { hasOwner } from "@/domain/cards/owner";

/** Is `modifier` attached to `pokemon` (its card or any card under it)? */
export function modifierAppliesTo(modifier: GameModifier, pokemon: PokemonInPlay | null | undefined): boolean {
  if (!modifier.targetPokemonId) return true;
  if (!pokemon) return false;
  const id = modifier.targetPokemonId;
  return pokemon.pokemon.id === id || (pokemon.previousEvolutions ?? []).some((card) => card.id === id);
}

/**
 * Does the modifier keep its Trainer card out of the piles (PlusPower / Defender attached to a
 * Pokémon: the card goes to the discard pile when it expires or leaves play)? Misty's
 * modifier only remembers the played card, which is already in the discard pile.
 */
export function modifierHoldsCard(modifier: GameModifier): boolean {
  return modifier.source === "plusPower" || modifier.source === "defender";
}

/** Koga (Gym Challenge) played this turn by the attacking side ("player") and `attacker` has Koga in its name. */
export function kogaPoisons(state: GameState, attacker: PokemonInPlay): boolean {
  return hasOwner(attacker.pokemon, "Koga") && state.activeModifiers.some((m) => m.source === "koga" && m.playerId === "player");
}

/**
 * Damage the modifiers of the attacking side ("player") add to `attacker`'s attack on the
 * Defending Pokémon, after Weakness and Resistance and only when the attack does damage there:
 * PlusPower attached to it, +20 per Misty played this turn when it has Misty in its name.
 */
export function attackBonusFromModifiers(state: GameState, attacker: PokemonInPlay): number {
  const misty = hasOwner(attacker.pokemon, "Misty");
  return state.activeModifiers
    .filter((m) => m.playerId === "player" && ((m.source === "plusPower" && modifierAppliesTo(m, attacker)) || (m.source === "misty" && misty)))
    .reduce((sum, m) => sum + m.amount, 0);
}

/** Defender: damage done by attacks to `pokemon` (Active or Benched) is reduced by 20 per attached Defender. */
export function defenderReduction(state: GameState, pokemon: PokemonInPlay): number {
  return state.activeModifiers
    .filter((m) => m.source === "defender" && !!m.targetPokemonId && modifierAppliesTo(m, pokemon))
    .reduce((sum, m) => sum + Math.abs(m.amount), 0);
}

/**
 * Attached Trainers kept as modifiers whose Pokémon is no longer in play (Knocked Out, returned
 * to the hand, discarded...) go to their player's discard pile, so they never follow that card
 * back into play. Same state when there is nothing to release.
 */
export function releaseOrphanModifiers(state: GameState): GameState {
  const inPlay = [state.playerActivePokemon, ...state.playerBench, state.opponentActivePokemon, ...state.opponentBench]
    .filter((p): p is PokemonInPlay => !!p);
  const orphans = (state.activeModifiers ?? []).filter((m) => !!m.targetPokemonId && !inPlay.some((p) => modifierAppliesTo(m, p)));
  if (orphans.length === 0) return state;
  const cardsOf = (side: GameModifier["playerId"]) => orphans.filter((m) => m.playerId === side).map((m) => m.card);
  return {
    ...state,
    activeModifiers: state.activeModifiers.filter((m) => !orphans.includes(m)),
    playerDiscard: [...state.playerDiscard, ...cardsOf("player")],
    opponentDiscard: [...state.opponentDiscard, ...cardsOf("opponent")],
  };
}

/** Splits the modifiers into the ones attached to `pokemon` (they leave play with it) and the rest. */
export function modifiersAttachedTo(state: GameState, pokemon: PokemonInPlay): { attached: GameModifier[]; rest: GameModifier[] } {
  const attached = state.activeModifiers.filter((m) => !!m.targetPokemonId && modifierAppliesTo(m, pokemon));
  return { attached, rest: state.activeModifiers.filter((m) => !attached.includes(m)) };
}
