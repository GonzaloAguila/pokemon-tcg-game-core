/**
 * AI Module Types
 *
 * Tipos para el sistema de IA del oponente.
 */

import type { GameCard, PokemonInPlay } from "@/domain/match";

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
}

/** Jugar una carta de entrenador */
export interface PlayTrainerAction extends AIActionBase {
  type: "playTrainer";
  cardId: string;
  trainerName: string;
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

/** Union de todas las acciones posibles */
export type AIAction =
  | PlayBasicToActiveAction
  | PlayBasicToBenchAction
  | AttachEnergyAction
  | EvolveAction
  | AttackAction
  | PlayTrainerAction
  | RetreatAction
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
