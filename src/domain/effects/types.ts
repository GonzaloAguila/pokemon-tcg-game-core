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
  /**
   * Who answers: the card's owner (default) or the opponent ("he or she chooses"). `title` and
   * `description` always speak to the card's owner / attacker (the side whose view built the
   * step) — on an opponent step that is what the waiting player reads.
   */
  chooser?: "self" | "opponent";
  /**
   * Only on `chooser: "opponent"` steps: the same question worded for the player who answers
   * it ("Tu rival usó Golpe Terrorífico: elige el Pokémon de tu Banca…"). Omitted = `title` /
   * `description`. Show the step to its answerer with `stepForAnswerer(step)`.
   */
  answererTitle?: string;
  answererDescription?: string;
  /**
   * The step shows hidden information of the other player to the chooser: "opponentHand" =
   * `cards` is the opponent's whole hand (Rocket's Sneak Attack). In multiplayer the server
   * must build this step from the real (unmasked) state.
   */
  reveals?: "opponentHand";
};

/** Coins the caller must flip: a fixed number, or flip until tails (sequence ending in tails). */
export type CoinFlipRequirement = number | "untilTails";

/**
 * Who flips a coin of a Trainer / power, relative to the card's player: "self" = the player
 * who plays it (the side whose view the effect runs on), "opponent" = the other player.
 */
export type CoinFlipper = "self" | "opponent";

export type CardEffectContext = {
  /** Coins flipped by the caller (server in multiplayer), as requested by `coinFlips` */
  coinResults?: CoinFlipResult[];
  /**
   * An effect that ends the turn (Minion of Team Rocket's tails: "your turn ends immediately")
   * calls endTurn itself unless this is set: then it returns the turn over (`attackedThisTurn`,
   * no other action allowed) and the caller ends it — the AI executor does, after swapping back,
   * so the end-of-turn log is written for the right side (like executeAttack's skipEndTurn).
   */
  skipEndTurn?: boolean;
};

/**
 * Behavior of one Trainer card (sourceId = the card's id in the hand) or one activated
 * Pokémon Power (sourceId = the id of the Pokémon in play using it). Always for "player".
 *
 * Flow: canUse → (coinFlips → caller flips) → getSteps until null (answering each step) →
 * resolve. Coins, when needed, are requested before the first step (selections = []) and
 * passed to every later getSteps / resolve call — or, for an effect that flips after its
 * choices (Blaine's Gamble), requested once the steps are answered and passed to resolve.
 */
export interface CardEffectDef {
  /** null when it can be used now, otherwise the Spanish reason */
  canUse(state: GameState, sourceId: string): string | null;
  /** Next question given the answers so far (selections[i] answers step i), or null when done */
  getSteps(state: GameState, sourceId: string, selections: string[][], coinResults?: CoinFlipResult[]): SelectionStep | null;
  /**
   * Coins to flip before the first step (0 / omitted = none). An effect whose coin comes after its
   * choices (Blaine's Gamble) returns 0 for `selections = []` and its coins once every step is
   * answered; callers ask again with the answers (see coinRequirement).
   */
  coinFlips?(state: GameState, sourceId: string, selections: string[][]): CoinFlipRequirement;
  /** Who flips coin `index` (0-based) of `coinFlips` (omitted = always the card's player). Display only. */
  coinFlipper?(index: number): CoinFlipper;
  /**
   * Apply the effect. Called by the generic entry points (playTrainerCard / usePokemonPower)
   * only after canUse passed and every selection was checked against its step's options.
   */
  resolve(state: GameState, sourceId: string, selections: string[][], context: CardEffectContext): GameState;
}
