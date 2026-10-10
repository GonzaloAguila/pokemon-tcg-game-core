/**
 * Special Energy cards that do something when attached FROM THE HAND (attachEnergyCard runs
 * these after attaching, then checks Knock Outs). Moving an attached card later (Energy
 * Trans, Gather Fire, Energy Bomb...) never triggers them.
 *
 * | Card | On attach from the hand |
 * |---|---|
 * | Rainbow Energy (TR) | 10 damage to that Pokémon (no Weakness/Resistance; not attack damage) |
 * | Full Heal Energy (TR) | it is no longer Asleep, Confused, Paralyzed or Poisoned |
 * | Potion Energy (TR) | remove 1 damage counter from it, if it has any |
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { createGameEvent, removeStatusCondition } from "@/lib/gameState";
import { StatusCondition } from "@/domain/constants";
import { findInPlay } from "./locate";

export type OnAttachFromHand = (state: GameState, energyCard: GameCard, targetPokemonId: string) => GameState;

/** Replace the player's Pokémon `pokemonId` with `update(it)` and log `message(it)`. */
function updateOwn(state: GameState, pokemonId: string, update: (p: PokemonInPlay) => PokemonInPlay, message: (p: PokemonInPlay) => string | null): GameState {
  const found = findInPlay(state, "player", pokemonId);
  if (!found) return state;
  const updated = update(found.pokemon);
  const text = message(found.pokemon);
  return {
    ...state,
    ...(found.location === "active"
      ? { playerActivePokemon: updated }
      : { playerBench: state.playerBench.map((p, i) => (i === found.benchIndex ? updated : p)) }),
    events: text ? [...state.events, createGameEvent(text, "action")] : state.events,
  };
}

const HEALED_CONDITIONS: StatusCondition[] = [
  StatusCondition.Asleep,
  StatusCondition.Confused,
  StatusCondition.Paralyzed,
  StatusCondition.Poisoned,
];

export const SPECIAL_ENERGY_ATTACH_EFFECTS: Record<string, OnAttachFromHand> = {
  "Rainbow Energy": (state, card, pokemonId) =>
    updateOwn(
      state,
      pokemonId,
      (p) => ({ ...p, currentDamage: (p.currentDamage ?? 0) + 10 }),
      (p) => `${card.name} le hizo 10 de daño a ${p.pokemon.name}`
    ),

  "Full Heal Energy": (state, card, pokemonId) =>
    updateOwn(
      state,
      pokemonId,
      (p) => {
        let healed = p;
        for (const condition of HEALED_CONDITIONS) healed = removeStatusCondition(healed, condition);
        return healed.statusConditions?.includes(StatusCondition.Poisoned) ? healed : { ...healed, poisonDamage: undefined };
      },
      (p) => ((p.statusConditions ?? []).some((s) => HEALED_CONDITIONS.includes(s)) ? `${card.name}: ${p.pokemon.name} se recuperó de sus estados especiales` : null)
    ),

  "Potion Energy": (state, card, pokemonId) =>
    updateOwn(
      state,
      pokemonId,
      (p) => ({ ...p, currentDamage: Math.max(0, (p.currentDamage ?? 0) - 10) }),
      (p) => ((p.currentDamage ?? 0) > 0 ? `${card.name}: ${p.pokemon.name} se curó 10 de daño` : null)
    ),
};
