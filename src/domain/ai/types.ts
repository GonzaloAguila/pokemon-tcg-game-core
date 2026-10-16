/**
 * AI Module Types
 *
 * Tipos para el sistema de IA del oponente.
 */

import type { GameCard, PokemonInPlay } from "@/domain/match";
import type { EnergyType } from "@/domain/constants";

/** Identificador del lado del tablero */
export type Side = "player" | "opponent";

/** Tipos de acciones que la IA puede tomar */
export type AIActionType =
  | "playBasicToActive"
  | "playBasicToBench"
  | "attachEnergy"
  | "evolve"
  | "attack"
  | "playTrainer"
  | "retreat"
  | "discardFromPlay"
  | "usePower"
  | "useStadium"
  | "endTurn";

/** Acción base de la IA */
interface AIActionBase {
  type: AIActionType;
  delay?: number; // Delay en ms antes de ejecutar (para efectos visuales)
}

/** Jugar un Pokemon básico como activo */
export interface PlayBasicToActiveAction extends AIActionBase {
  type: "playBasicToActive";
  cardId: string;
}

/** Jugar un Pokemon básico en la banca */
export interface PlayBasicToBenchAction extends AIActionBase {
  type: "playBasicToBench";
  cardId: string;
  benchIndex: number;
}

/** Adjuntar una energía */
export interface AttachEnergyAction extends AIActionBase {
  type: "attachEnergy";
  energyCardId: string;
  targetPokemonId: string;
  isBench: boolean;
  benchIndex?: number;
}

/** Evolucionar un Pokemon */
export interface EvolveAction extends AIActionBase {
  type: "evolve";
  evolutionCardId: string;
  targetIndex: number; // -1 = activo, 0-4 = banca
}

/** Atacar */
export interface AttackAction extends AIActionBase {
  type: "attack";
  attackIndex: number;
  /** Metronome-style attacks (CopyAttack): the Defending Pokémon's attack to copy, by name */
  copiedAttackName?: string;
  /** Conversion 1 / 2 (Porygon): the type chosen for the Weakness / Resistance */
  chosenType?: EnergyType;
  /** Vermilion City Gym: the AI flips the Stadium's optional coin with this attack */
  vermilionCoin?: boolean;
}

/** Jugar una carta de entrenador */
export interface PlayTrainerAction extends AIActionBase {
  type: "playTrainer";
  cardId: string;
  trainerName: string;
  selections: string[][];
  /**
   * The executor answers the Trainer's steps itself when it plays it (answers that depend on
   * the deck, the coins or the hand at that moment: Energy Search, Recycle...); `selections`
   * is then ignored. Coins are always flipped by the executor.
   */
  answerAtPlay?: boolean;
}

/** Usar el Poder Pokémon activado de uno de sus Pokémon (respuestas y monedas al ejecutarlo) */
export interface UsePowerAction extends AIActionBase {
  type: "usePower";
  pokemonId: string;
  powerName: string;
  /** Answers planned by the AI (powers without coins: Energy Trans, Damage Swap, Curse); otherwise answered when used */
  selections?: string[][];
}

/** Use the action of the Stadium in play (Celadon City Gym) with the answers planned by the AI */
export interface UseStadiumAction extends AIActionBase {
  type: "useStadium";
  stadiumName: string;
  selections: string[][];
}

/** Retirarse (cambiar Pokemon activo) */
export interface RetreatAction extends AIActionBase {
  type: "retreat";
  energyIdsToDiscard: string[];
  benchIndex: number;
}

/** Terminar el turno */
export interface EndTurnAction extends AIActionBase {
  type: "endTurn";
}

/** Descartar del juego un Fósil Misterioso / Muñeco Clefairy (promueve el primer Pokémon de la banca si era el activo) */
export interface DiscardFromPlayAction extends AIActionBase {
  type: "discardFromPlay";
  pokemonId: string;
}

/** Union de todas las acciones posibles */
export type AIAction =
  | PlayBasicToActiveAction
  | PlayBasicToBenchAction
  | AttachEnergyAction
  | EvolveAction
  | AttackAction
  | PlayTrainerAction
  | RetreatAction
  | DiscardFromPlayAction
  | UsePowerAction
  | UseStadiumAction
  | EndTurnAction;

/** Resultado de la evaluación de un ataque */
export interface AttackEvaluation {
  attackIndex: number;
  canUse: boolean;
  damage: number;
  knocksOut: boolean;
  hasStatusEffect: boolean;
}

/** Estado de evaluación de un Pokemon para decidir jugadas */
export interface PokemonEvaluation {
  pokemon: PokemonInPlay;
  location: "active" | "bench";
  benchIndex?: number;
  canAttack: boolean;
  bestAttack: AttackEvaluation | null;
  missingEnergy: number; // Cuántas energías le faltan para el mejor ataque
  canRetreat: boolean;
  isLowHealth: boolean; // < 50% HP
  canEvolve: boolean;
}
