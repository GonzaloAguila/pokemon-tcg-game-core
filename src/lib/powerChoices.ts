/**
 * Pending power choices — Pokémon Powers that trigger "when you play <it> from your hand"
 * (PokemonPowerType.OnPlayFromHand), keyed by power name:
 *
 * | Power | Card | Step (chooser: the power's owner) | Answer (option ids) |
 * |---|---|---|---|
 * | Invocar Secuaces (Summon Minions) | Dark Dragonite | up to 2 Basic Pokémon of the deck (Bench room), 0 allowed | deck card ids → Bench, deck shuffled |
 * | Ataque Furtivo (Sneak Attack) | Dark Golbat | 1 of the opponent's Pokémon, or none ("may") | its id → 10 damage, Weakness/Resistance applied |
 * | Recoger (Reel In) | Dark Slowbro | up to 3 Basic Pokémon / Evolution cards of the discard pile, 0 allowed | discard ids → hand |
 *
 * The trigger runs when the card is played from the hand: evolving (evolvePokemonCard),
 * Pokémon Breeder, or putting a Basic onto the Bench during the game (playBasicPokemon). It
 * does NOT run for cards put into play from the deck (Rapid Evolution, Summon Minions' own
 * Basics) or during setup. The power must work then (isPowerActive: Toxic Gas, Goop Gas
 * Attack stop it). When there is nothing to choose the power resolves at once.
 *
 * While `state.pendingPowerChoice` is set nothing else can happen (getTurnActionBlocker,
 * endTurn). It always belongs to the side whose turn it is ("player"): answer it with
 * `resolvePowerChoice(state, selection)` on that side's view.
 */

import type { SelectionStep } from "@/domain/effects/types";
import { checkSelection } from "@/domain/effects/validate";
import { isPokemonCard } from "@/domain/cards";
import { CardKind, PokemonPowerType, PokemonStage } from "@/domain/constants";
import { getEffectivePokemonCard, isPowerActive } from "@/domain/powers";
import { IllegalActionError } from "@/shared/errors";
import type { GameCard, GameState, PokemonInPlay } from "./gameState";
import { checkKnockouts, createGameEvent, shuffle } from "./gameState";

/** A choice left by a power played from the hand (see the table above). */
export type PendingPowerChoice = {
  /** Id of the Pokémon in play whose power triggered */
  pokemonId: string;
  powerName: string;
  /** The question for the power's owner (the side whose turn it is) */
  step: SelectionStep;
};

export type OnPlayPowerDef = {
  /** The question, or null when there is nothing to choose (resolve runs with []) */
  step(state: GameState, pokemon: PokemonInPlay): SelectionStep | null;
  resolve(state: GameState, pokemon: PokemonInPlay, selection: string[]): GameState;
};

const MAX_BENCH = 5;

const log = (state: GameState, message: string): GameState => ({
  ...state,
  events: [...state.events, createGameEvent(message, "action")],
});

const powerName = (pokemon: PokemonInPlay) => (isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.power?.name ?? "" : "");
const powerAmount = (pokemon: PokemonInPlay, fallback: number) =>
  isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.power?.amount ?? fallback : fallback;

const isBasicPokemonCard = (c: GameCard) => c.kind === CardKind.Pokemon && c.stage === PokemonStage.Basic;
/** "Basic Pokémon and/or Evolution cards": Pokémon cards (a Mysterious Fossil is a Trainer there) */
const isPokemonCardOutOfPlay = (c: GameCard) => c.kind === CardKind.Pokemon;

function opponentTargets(state: GameState): { pokemon: PokemonInPlay; label: string }[] {
  const targets: { pokemon: PokemonInPlay; label: string }[] = [];
  if (state.opponentActivePokemon) targets.push({ pokemon: state.opponentActivePokemon, label: "Activo rival" });
  for (const p of state.opponentBench) targets.push({ pokemon: p, label: "Banca rival" });
  return targets;
}

/** Damage by a Pokémon Power (not an attack) with Weakness and Resistance: Sneak Attack. */
function powerDamageWithWeakness(state: GameState, source: PokemonInPlay, target: PokemonInPlay, amount: number): number {
  const sourceType = source.shiftedType ?? getEffectivePokemonCard(state, source)?.types[0];
  const targetCard = getEffectivePokemonCard(state, target);
  const weaknesses = target.modifiedWeakness ? [target.modifiedWeakness] : targetCard?.weaknesses ?? [];
  const resistances = target.modifiedResistance ? [target.modifiedResistance] : targetCard?.resistances ?? [];
  let damage = amount;
  if (sourceType && weaknesses.includes(sourceType)) damage *= 2;
  if (sourceType && resistances.includes(sourceType)) damage = Math.max(0, damage - 30);
  return damage;
}

/** Replace one of the opponent's Pokémon (by id). */
function replaceOpponent(state: GameState, pokemonId: string, updated: PokemonInPlay): GameState {
  if (state.opponentActivePokemon?.pokemon.id === pokemonId) return { ...state, opponentActivePokemon: updated };
  return { ...state, opponentBench: state.opponentBench.map((p) => (p.pokemon.id === pokemonId ? updated : p)) };
}

export const ON_PLAY_POWERS: Record<string, OnPlayPowerDef> = {
  "Invocar Secuaces": {
    step: (state, pokemon) => {
      const room = MAX_BENCH - state.playerBench.length;
      const basics = state.playerDeck.filter(isBasicPokemonCard);
      if (room <= 0 || basics.length === 0) return null;
      const max = Math.min(powerAmount(pokemon, 2), room, basics.length);
      return {
        title: powerName(pokemon),
        description: `Elige hasta ${max} Pokémon Básico${max === 1 ? "" : "s"} de tu mazo para ponerlos en tu Banca`,
        options: basics.map((c) => ({ id: c.id, label: c.name })),
        maxSelections: max,
        minSelections: 0,
        cards: basics,
        chooser: "self",
      };
    },
    resolve: (state, pokemon, selection) => {
      const chosen = state.playerDeck.filter((c) => selection.includes(c.id));
      const benched: PokemonInPlay[] = chosen.map((card) => ({
        pokemon: card,
        attachedEnergy: [],
        attachedTrainers: [],
        previousEvolutions: [],
        currentDamage: 0,
        statusConditions: [],
        playedOnTurn: state.turnNumber,
      }));
      const next: GameState = {
        ...state,
        playerDeck: shuffle(state.playerDeck.filter((c) => !selection.includes(c.id))),
        playerBench: [...state.playerBench, ...benched],
      };
      return log(
        next,
        chosen.length === 0
          ? `${powerName(pokemon)}: no puso Pokémon en la Banca. Se mezcló el mazo`
          : `${powerName(pokemon)}: puso ${chosen.map((c) => c.name).join(", ")} en la Banca. Se mezcló el mazo`
      );
    },
  },

  "Ataque Furtivo": {
    step: (state, pokemon) => {
      const targets = opponentTargets(state);
      if (targets.length === 0) return null;
      return {
        title: powerName(pokemon),
        description: `Puedes elegir 1 de los Pokémon de tu rival: ${pokemon.pokemon.name} le hace ${powerAmount(pokemon, 10)} de daño (se aplican Debilidad y Resistencia)`,
        options: targets.map(({ pokemon: p, label }) => ({ id: p.pokemon.id, label: `${p.pokemon.name} (${label})` })),
        maxSelections: 1,
        minSelections: 0,
        thumbnails: targets.map(({ pokemon: p }) => p.pokemon),
        disableAutoSelect: true,
        chooser: "self",
      };
    },
    resolve: (state, pokemon, selection) => {
      const target = opponentTargets(state).find((t) => t.pokemon.pokemon.id === selection[0])?.pokemon;
      if (!target) return log(state, `${powerName(pokemon)}: no se usó`);
      const damage = powerDamageWithWeakness(state, pokemon, target, powerAmount(pokemon, 10));
      const next = replaceOpponent(state, target.pokemon.id, { ...target, currentDamage: (target.currentDamage ?? 0) + damage });
      return log(next, `${powerName(pokemon)}: ${pokemon.pokemon.name} le hizo ${damage} de daño a ${target.pokemon.name}`);
    },
  },

  "Recoger": {
    step: (state, pokemon) => {
      const cards = state.playerDiscard.filter(isPokemonCardOutOfPlay);
      if (cards.length === 0) return null;
      const max = Math.min(powerAmount(pokemon, 3), cards.length);
      return {
        title: powerName(pokemon),
        description: `Elige hasta ${max} cartas de Pokémon Básico o de Evolución de tu pila de descartes para tu mano`,
        options: cards.map((c) => ({ id: c.id, label: c.name })),
        maxSelections: max,
        minSelections: 0,
        cards,
        chooser: "self",
      };
    },
    resolve: (state, pokemon, selection) => {
      const taken = state.playerDiscard.filter((c) => selection.includes(c.id));
      const next: GameState = {
        ...state,
        playerDiscard: state.playerDiscard.filter((c) => !selection.includes(c.id)),
        playerHand: [...taken, ...state.playerHand],
      };
      return log(next, taken.length === 0 ? `${powerName(pokemon)}: no tomó cartas` : `${powerName(pokemon)}: puso ${taken.map((c) => c.name).join(", ")} en la mano`);
    },
  },
};

function ownPokemon(state: GameState, pokemonId: string): PokemonInPlay | undefined {
  if (state.playerActivePokemon?.pokemon.id === pokemonId) return state.playerActivePokemon;
  return state.playerBench.find((p) => p.pokemon.id === pokemonId);
}

/**
 * The player's Pokémon `pokemonId` was just played from the hand (evolved, Breeder, benched):
 * run its "when you play it from your hand" power if it has a working one. Returns the same
 * state when nothing triggers.
 */
export function triggerOnPlayPower(state: GameState, pokemonId: string): GameState {
  if (state.gameResult !== null) return state;
  const pokemon = ownPokemon(state, pokemonId);
  if (!pokemon || !isPokemonCard(pokemon.pokemon)) return state;
  const power = pokemon.pokemon.power;
  if (power?.type !== PokemonPowerType.OnPlayFromHand) return state;
  const def = ON_PLAY_POWERS[power.name];
  if (!def) return state;
  if (!isPowerActive(state, pokemon)) {
    return { ...state, events: [...state.events, createGameEvent(`${power.name} de ${pokemon.pokemon.name} no funciona en este momento`, "info")] };
  }
  const step = def.step(state, pokemon);
  if (!step) return checkKnockouts(def.resolve(state, pokemon, []));
  return {
    ...state,
    pendingPowerChoice: { pokemonId, powerName: power.name, step },
    events: [...state.events, createGameEvent(`${power.name} de ${pokemon.pokemon.name}: ${step.description}`, "info")],
  };
}

/**
 * Answer the pending power choice (`state.pendingPowerChoice.step`) on the view of the side
 * whose turn it is. `selection` are option ids, checked like a Trainer step (throws
 * IllegalActionError otherwise). Knock Outs are checked afterwards; the turn goes on.
 */
export function resolvePowerChoice(state: GameState, selection: string[]): GameState {
  const pending = state.pendingPowerChoice;
  if (!pending) throw new IllegalActionError("No hay ninguna elección de Poder Pokémon pendiente");
  checkSelection(pending.step, selection);
  const def = ON_PLAY_POWERS[pending.powerName];
  const pokemon = ownPokemon(state, pending.pokemonId);
  const cleared: GameState = { ...state, pendingPowerChoice: undefined };
  if (!def || !pokemon) return cleared;
  return checkKnockouts(def.resolve(cleared, pokemon, selection));
}
