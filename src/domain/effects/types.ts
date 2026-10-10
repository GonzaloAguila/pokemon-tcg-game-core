/**
 * Card effect registry types: one contract for Trainer cards and activated Pokémon Powers.
 * UI-agnostic (no React): a SelectionStep describes what to ask; the UI decides how.
 */

import type { GameCard, GameState } from "@/lib/gameState";
import type { CoinFlipResult } from "@/domain/constants";

export type SelectionOption = {
  /** What goes into the selections array when chosen (a card / Pokémon id, an index, a type...) */
  id: string;
  label: string;
  sublabel?: string;
  /** Shown but not choosable */
  disabled?: boolean;
};

/**
 * One question to answer before the effect resolves. The chosen option ids form one entry
 * of the `selections: string[][]` array (step i → selections[i]).
 */
export type SelectionStep = {
  title: string;
  description: string;
  options: SelectionOption[];
  /** Most options that can be chosen */
  maxSelections: number;
  /** Fewest options that must be chosen (default: maxSelections, i.e. exactly that many) */
  minSelections?: number;
  /** Options are cards in the chooser's hand (the UI can pick them in the hand) */
  source?: "hand";
  /** Options are these cards (search a deck / discard pile with a card grid) */
  cards?: GameCard[];
  /** Thumbnails for the options, matched by option id (Pokémon / Energy in play) */
  thumbnails?: GameCard[];
  /** Reorder these cards: the selection is the new order as option ids ("0".."n-1") */
  orderingCards?: GameCard[];
  /** Don't auto-select when there is a single option */
  disableAutoSelect?: boolean;
  /** Who answers: the card's owner (default) or the opponent ("he or she chooses") */
  chooser?: "self" | "opponent";
  /**
   * The step shows hidden information of the other player to the chooser: "opponentHand" =
   * `cards` is the opponent's whole hand (Rocket's Sneak Attack). In multiplayer the server
   * must build this step from the real (unmasked) state.
   */
  reveals?: "opponentHand";
};

/** Coins the caller must flip: a fixed number, or flip until tails (sequence ending in tails). */
export type CoinFlipRequirement = number | "untilTails";

export type CardEffectContext = {
  /** Coins flipped by the caller (server in multiplayer), as requested by `coinFlips` */
  coinResults?: CoinFlipResult[];
};

/**
 * Behavior of one Trainer card (sourceId = the card's id in the hand) or one activated
 * Pokémon Power (sourceId = the id of the Pokémon in play using it). Always for "player".
 *
 * Flow: canUse → (coinFlips → caller flips) → getSteps until null (answering each step) →
 * resolve. Coins, when needed, are requested before the first step (selections = []) and
 * passed to every later getSteps / resolve call.
 */
export interface CardEffectDef {
  /** null when it can be used now, otherwise the Spanish reason */
  canUse(state: GameState, sourceId: string): string | null;
  /** Next question given the answers so far (selections[i] answers step i), or null when done */
  getSteps(state: GameState, sourceId: string, selections: string[][], coinResults?: CoinFlipResult[]): SelectionStep | null;
  /** Coins to flip before the first step (0 / omitted = none) */
  coinFlips?(state: GameState, sourceId: string, selections: string[][]): CoinFlipRequirement;
  /**
   * Apply the effect. Called by the generic entry points (playTrainerCard / usePokemonPower)
   * only after canUse passed and every selection was checked against its step's options.
   */
  resolve(state: GameState, sourceId: string, selections: string[][], context: CardEffectContext): GameState;
}
