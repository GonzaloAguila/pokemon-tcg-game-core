/**
 * Stadium cards (Gym Heroes). Every Stadium is played the same way: it stays in play
 * (`state.stadium`), a new Stadium replaces it and the old one goes to the discard pile of
 * whoever played it, and a Stadium with the same name as the one in play can't be played.
 * Each player may play only one Stadium per turn (`state.stadiumPlayedThisTurn`, cleared by endTurn).
 *
 * Any card with `trainerType === TrainerType.Stadium` without its own TRAINER_EFFECTS entry is
 * played with `playStadium` (see trainerDef in ./index.ts). A Stadium with an on-play effect
 * gets an entry in STADIUM_EFFECTS (merged into TRAINER_EFFECTS) that wraps `playStadium`.
 * Continuous rules live in domain/stadiums/rules.ts; `withHandDiscardCost` applies No Removal
 * Gym's cost to the Trainers it names. A Stadium the player whose turn it is may use (Celadon
 * City Gym) has a STADIUM_ACTIONS entry, run by the Stadium action entry points (./index.ts).
 */

import { createGameEvent, energyCardLabel, type GameState, type PokemonInPlay } from "@/lib/gameState";
import { allOwnPokemon, requireBenchTrims } from "@/domain/board";
import { cardOutOfPlay, isEnergyCard } from "@/domain/cards";
import { hasOwner } from "@/domain/cards/owner";
import { StatusCondition } from "@/domain/constants";
import { NARROW_GYM_BENCH_SIZE } from "@/domain/stadiums/rules";
import type { CardEffectDef } from "./types";

const discardPileOf = (side: "player" | "opponent") => (side === "player" ? "playerDiscard" : "opponentDiscard");

/** Any Stadium: one per turn; it stays in play; a new one replaces it (to its player's discard pile); never two of the same name. */
export const playStadium: CardEffectDef = {
  canUse(state, cardId) {
    const card = state.playerHand.find((c) => c.id === cardId);
    if (!card) return "Esa carta no está en tu mano";
    if (state.stadiumPlayedThisTurn) return "Solo puedes jugar un Estadio por turno";
    if (state.stadium && state.stadium.card.name === card.name) return "Ya hay un Estadio con ese nombre en juego";
    return null;
  },
  getSteps: () => null,
  resolve(state, cardId) {
    const card = state.playerHand.find((c) => c.id === cardId)!;
    const previous = state.stadium ?? null;
    const next: GameState = {
      ...state,
      playerHand: state.playerHand.filter((c) => c.id !== cardId),
      stadium: { card, playedBy: "player" },
      stadiumPlayedThisTurn: true,
      events: [...state.events, createGameEvent(`Jugaste ${card.name}: el Estadio queda en juego`, "action")],
    };
    if (!previous) return next;
    const pile = discardPileOf(previous.playedBy);
    return {
      ...next,
      [pile]: [...next[pile], previous.card],
      events: [...next.events, createGameEvent(`${previous.card.name} se descarta`, "info")],
    };
  },
};

/**
 * Stadiums with an effect when played (key = card name).
 *
 * | Stadium | selections |
 * |---|---|
 * | Narrow Gym | [] — then each player with 5 Benched returns 1 (pendingBenchTrim, resolveBenchTrim) |
 */
export const STADIUM_EFFECTS: Record<string, CardEffectDef> = {
  "Narrow Gym": {
    ...playStadium,
    resolve(state, cardId, selections, context) {
      return requireBenchTrims(playStadium.resolve(state, cardId, selections, context), NARROW_GYM_BENCH_SIZE);
    },
  },
};

/**
 * `def` with a cost of `count` cards discarded from the hand before playing it (No Removal Gym
 * on Energy Removal / Super Energy Removal): one more step first (the cards, from the hand), the
 * card's own steps after it, and the cards go to the discard pile before its effect.
 */
export function withHandDiscardCost(def: CardEffectDef, count: number): CardEffectDef {
  const otherCards = (state: GameState, cardId: string) => state.playerHand.filter((c) => c.id !== cardId);
  return {
    ...def,
    canUse(state, cardId) {
      if (otherCards(state, cardId).length < count) return `Necesitas descartar ${count} cartas de tu mano para jugar esta carta`;
      return def.canUse(state, cardId);
    },
    getSteps(state, cardId, selections, coinResults) {
      if (selections.length === 0) {
        return {
          title: state.stadium?.card.name ?? "Coste",
          description: `Selecciona ${count} cartas de tu mano para descartar`,
          options: otherCards(state, cardId).map((c) => ({ id: c.id, label: c.name })),
          maxSelections: count,
          source: "hand",
        };
      }
      return def.getSteps(state, cardId, selections.slice(1), coinResults);
    },
    ...(def.coinFlips && {
      coinFlips: (state: GameState, cardId: string, selections: string[][]) => def.coinFlips!(state, cardId, selections.slice(1)),
    }),
    resolve(state, cardId, selections, context) {
      const discarded = state.playerHand.filter((c) => selections[0].includes(c.id));
      const paid: GameState = {
        ...state,
        playerHand: state.playerHand.filter((c) => !selections[0].includes(c.id)),
        playerDiscard: [...state.playerDiscard, ...discarded],
        events: [
          ...state.events,
          createGameEvent(`Descartaste ${discarded.map((c) => c.name).join(" y ")} (${state.stadium?.card.name ?? "coste"})`, "action"),
        ],
      };
      return def.resolve(paid, cardId, selections.slice(1), context);
    },
  };
}

// ============================================================================
// Stadium actions: what the player whose turn it is may do with the Stadium in play
// ============================================================================

const CURED_CONDITIONS: readonly StatusCondition[] = [
  StatusCondition.Asleep,
  StatusCondition.Confused,
  StatusCondition.Paralyzed,
  StatusCondition.Poisoned,
];

const hasSpecialCondition = (pokemon: PokemonInPlay) => (pokemon.statusConditions ?? []).some((c) => CURED_CONDITIONS.includes(c));
const attachedEnergyCards = (pokemon: PokemonInPlay) => pokemon.attachedEnergy.filter((e) => isEnergyCard(e) || !!e.buzzapEnergyType);

/** Celadon City Gym: the player's Pokémon with Erika in its name, a Special Condition and an Energy card. */
function celadonTargets(state: GameState): PokemonInPlay[] {
  return allOwnPokemon(state, "player").filter(
    (p) => hasOwner(p.pokemon, "Erika") && hasSpecialCondition(p) && attachedEnergyCards(p).length > 0
  );
}

/** The same Pokémon (by id) replaced on the player's side. */
function replaceOwn(state: GameState, pokemonId: string, next: PokemonInPlay): GameState {
  const swap = (p: PokemonInPlay) => (p.pokemon.id === pokemonId ? next : p);
  return {
    ...state,
    playerActivePokemon: state.playerActivePokemon && swap(state.playerActivePokemon),
    playerBench: state.playerBench.map(swap),
  };
}

/**
 * Stadiums with an action the player whose turn it is may take (key = card name; sourceId = the
 * Stadium card's id). Played through the generic entry points in ./index.ts (getStadiumActions,
 * canUseStadiumAction, getStadiumActionSteps, useStadiumAction), whoever played the Stadium.
 *
 * | Stadium | selections |
 * |---|---|
 * | Celadon City Gym | [[pokemonId with Erika in its name], [energyCardId attached to it]] — discards it; that Pokémon is no longer Asleep, Confused, Paralyzed or Poisoned. No per-turn limit. |
 */
export const STADIUM_ACTIONS: Record<string, CardEffectDef> = {
  "Celadon City Gym": {
    canUse(state) {
      return celadonTargets(state).length > 0
        ? null
        : "Necesitas un Pokémon con Erika en su nombre afectado por una Condición Especial y con una carta de Energía unida";
    },
    getSteps(state, _sourceId, selections) {
      if (selections.length === 0) {
        const targets = celadonTargets(state);
        return {
          title: "Celadon City Gym",
          description: "Selecciona un Pokémon con Erika en su nombre para curarle las Condiciones Especiales",
          options: targets.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name })),
          maxSelections: 1,
          thumbnails: targets.map((p) => p.pokemon),
        };
      }
      if (selections.length === 1) {
        const target = celadonTargets(state).find((p) => p.pokemon.id === selections[0][0]);
        const energies = target ? attachedEnergyCards(target) : [];
        return {
          title: "Celadon City Gym",
          description: `Selecciona la carta de Energía de ${target?.pokemon.name ?? "ese Pokémon"} que quieres descartar`,
          options: energies.map((e) => ({ id: e.id, label: energyCardLabel(e) })),
          maxSelections: 1,
          thumbnails: energies,
        };
      }
      return null;
    },
    resolve(state, _sourceId, selections) {
      const target = celadonTargets(state).find((p) => p.pokemon.id === selections[0][0])!;
      const energy = target.attachedEnergy.find((e) => e.id === selections[1][0])!;
      const cured: PokemonInPlay = {
        ...target,
        attachedEnergy: target.attachedEnergy.filter((e) => e.id !== energy.id),
        statusConditions: (target.statusConditions ?? []).filter((c) => !CURED_CONDITIONS.includes(c)),
        paralyzedOnTurn: undefined,
        // Toxic's 20-damage poison ends with the condition
        poisonDamage: undefined,
      };
      const stadiumName = state.stadium?.card.name ?? "Celadon City Gym";
      const next = replaceOwn(state, target.pokemon.id, cured);
      return {
        ...next,
        playerDiscard: [...state.playerDiscard, cardOutOfPlay(energy)],
        events: [
          ...state.events,
          createGameEvent(`Descartaste ${energyCardLabel(energy)} de ${target.pokemon.name} (${stadiumName})`, "action"),
          createGameEvent(`${target.pokemon.name} ya no está Dormido, Confundido, Paralizado ni Envenenado`, "info"),
        ],
      };
    },
  },
};
