/**
 * Misty's Duel (Gym Heroes #123): "You and your opponent play a game of Rock-Paper-Scissors. The
 * winner shuffles his or her hand into his or her deck and draws a new hand of 5 cards." A real
 * Rock-Paper-Scissors (owner decision), not the printed coin fallback.
 *
 * Playing the card sets `state.pendingDuel` (round 1, no picks). Each side picks once per round
 * with `submitDuelPick(state, side, pick)` — on any view, off-turn included; the round resolves
 * when both picks are in: a tie replays it (`round + 1`, `lastRound` keeps the tied picks for the
 * UI), otherwise the winner shuffles its hand into its deck and draws 5 (fewer when the deck is
 * shorter: no loss, only the draw at the start of the turn loses) and `pendingDuel` is cleared.
 * While it is set nothing else can happen (getTurnActionBlocker, endTurn refuses).
 *
 * Who played it is the side whose turn it is (`isPlayerTurn`: relative, flipped by every swap;
 * the duel can't outlive the turn). The picks are relative too: every perspective swap flips them
 * (`swapPendingDuel`: board swapSides and the AI executor's views). Hidden information: a side
 * must not see the other's pick before both are in — consumers send each player
 * `maskDuelFor(view, "player")` (MP), and the AI's knowledge view hides it.
 *
 * Consumers:
 * - Single-player: whenever `pendingDuel` is set (the human or the AI played it), show the duel
 *   to the human; on their pick call `submitDuelPickVsAI(state, pick)` (= the human's pick, then
 *   the AI's `aiDuelPick()`). The AI plays the card only with `decideOpponentTurn(state,
 *   { otherPlayerDuels: true })`; after the duel the AI's turn goes on (ask decideOpponentTurn
 *   again, as after any hand change).
 * - Multiplayer: each player's `duelPick` → `submitDuelPick(state, thatPlayersSide, pick)`; send
 *   each player its view masked with `maskDuelFor`. The final picks of a decisive round are in
 *   the log ("Misty's Duel: piedra contra tijera") and known to the server.
 *
 * Log lines are perspective-free: "Misty's Duel: <pick of whoever played it> contra <the other's>",
 * then "Misty's Duel: empate, se juega otra vez" or "Gana quien eligió <pick>: …".
 */

import type { GameState } from "@/lib/gameState";
import { createGameEvent, drawCard, shuffle } from "@/lib/gameState";
import { GamePhase } from "@/domain/constants";
import { assertLegal } from "@/shared/errors";

export const MISTYS_DUEL = "Misty's Duel";

export type RpsChoice = "rock" | "paper" | "scissors";

export const RPS_CHOICES: readonly RpsChoice[] = ["rock", "paper", "scissors"];

/** Spanish names for the log and the UI. */
export const RPS_LABELS: Readonly<Record<RpsChoice, string>> = { rock: "piedra", paper: "papel", scissors: "tijera" };

/** The size of the winner's new hand. */
export const DUEL_HAND_SIZE = 5;

export type PendingDuel = {
  round: number;
  playerPick: RpsChoice | null;
  opponentPick: RpsChoice | null;
  /** The previous round's picks (a tie), for the UI */
  lastRound?: { playerPick: RpsChoice; opponentPick: RpsChoice };
};

type Side = "player" | "opponent";

const BEATS: Readonly<Record<RpsChoice, RpsChoice>> = { rock: "scissors", scissors: "paper", paper: "rock" };

/** "a" when `a` beats `b`, "b" when `b` beats `a`, "tie" for the same pick. */
export function rpsWinner(a: RpsChoice, b: RpsChoice): "a" | "b" | "tie" {
  if (a === b) return "tie";
  return BEATS[a] === b ? "a" : "b";
}

/** The AI's pick: uniform over the three (the simulator passes its seeded RNG). */
export function aiDuelPick(random: () => number = Math.random): RpsChoice {
  return RPS_CHOICES[Math.min(RPS_CHOICES.length - 1, Math.floor(random() * RPS_CHOICES.length))];
}

/** Misty's Duel was just played: round 1, no picks. */
export function startDuel(state: GameState): GameState {
  return {
    ...state,
    pendingDuel: { round: 1, playerPick: null, opponentPick: null },
    events: [...state.events, createGameEvent("Misty's Duel: piedra, papel o tijera", "info")],
  };
}

/** The same duel seen from the other side (swapSides). Absent stays absent. */
export function swapPendingDuel(duel: PendingDuel | undefined): PendingDuel | undefined {
  if (!duel) return duel;
  return {
    round: duel.round,
    playerPick: duel.opponentPick,
    opponentPick: duel.playerPick,
    ...(duel.lastRound && { lastRound: { playerPick: duel.lastRound.opponentPick, opponentPick: duel.lastRound.playerPick } }),
  };
}

/**
 * `state` as `viewer` may see it: the other side's pick of the current round hidden (null) until
 * both are in (in practice always: a round resolves as soon as both picked). `lastRound` stays.
 */
export function maskDuelFor(state: GameState, viewer: Side): GameState {
  const duel = state.pendingDuel;
  if (!duel) return state;
  const hidden = viewer === "player" ? "opponentPick" : "playerPick";
  if (duel[hidden] === null || (duel.playerPick !== null && duel.opponentPick !== null)) return state;
  return { ...state, pendingDuel: { ...duel, [hidden]: null } };
}

/** null when `side` can pick now, else the Spanish reason. */
export function canSubmitDuelPick(state: GameState, side: Side): string | null {
  if (state.gamePhase === GamePhase.GameOver || state.gameResult !== null) return "La partida terminó";
  const duel = state.pendingDuel;
  if (!duel) return "No hay un duelo pendiente";
  if ((side === "player" ? duel.playerPick : duel.opponentPick) !== null) return "Ya elegiste en esta ronda";
  return null;
}

/**
 * `side`'s pick for the current round (any view; off-turn included). When both picks are in the
 * round resolves (see the module comment). Throws IllegalActionError when canSubmitDuelPick says
 * no or `pick` isn't rock / paper / scissors.
 */
export function submitDuelPick(state: GameState, side: Side, pick: RpsChoice): GameState {
  assertLegal(canSubmitDuelPick(state, side));
  assertLegal(RPS_CHOICES.includes(pick) ? null : "Elige piedra, papel o tijera");
  const duel = { ...state.pendingDuel!, [side === "player" ? "playerPick" : "opponentPick"]: pick };
  if (duel.playerPick === null || duel.opponentPick === null) return { ...state, pendingDuel: duel };
  return resolveRound(state, duel.playerPick, duel.opponentPick, duel.round);
}

/** Single-player: the human's ("player") pick, then the AI's (`aiDuelPick(random)`). */
export function submitDuelPickVsAI(state: GameState, pick: RpsChoice, random: () => number = Math.random): GameState {
  const mine = submitDuelPick(state, "player", pick);
  return mine.pendingDuel ? submitDuelPick(mine, "opponent", aiDuelPick(random)) : mine;
}

function resolveRound(state: GameState, playerPick: RpsChoice, opponentPick: RpsChoice, round: number): GameState {
  // Whoever played it (the side whose turn it is) is named first
  const [first, second] = state.isPlayerTurn ? [playerPick, opponentPick] : [opponentPick, playerPick];
  const events = [...state.events, createGameEvent(`Misty's Duel: ${RPS_LABELS[first]} contra ${RPS_LABELS[second]}`, "info")];
  const result = rpsWinner(playerPick, opponentPick);
  if (result === "tie") {
    return {
      ...state,
      pendingDuel: { round: round + 1, playerPick: null, opponentPick: null, lastRound: { playerPick, opponentPick } },
      events: [...events, createGameEvent("Misty's Duel: empate, se juega otra vez", "info")],
    };
  }
  const winner: Side = result === "a" ? "player" : "opponent";
  const { hand, deck } = newHand(winner === "player" ? state.playerHand : state.opponentHand, winner === "player" ? state.playerDeck : state.opponentDeck);
  const drawn = hand.length === 0 ? "no roba cartas" : `roba una mano nueva de ${hand.length} carta${hand.length === 1 ? "" : "s"}`;
  const { pendingDuel: _done, ...rest } = state;
  return {
    ...rest,
    ...(winner === "player" ? { playerHand: hand, playerDeck: deck } : { opponentHand: hand, opponentDeck: deck }),
    events: [
      ...events,
      createGameEvent(`Gana quien eligió ${RPS_LABELS[winner === "player" ? playerPick : opponentPick]}: baraja su mano en su mazo y ${drawn}`, "action"),
    ],
  };
}

/** The hand shuffled into the deck, then up to DUEL_HAND_SIZE cards drawn. */
function newHand(oldHand: GameState["playerHand"], oldDeck: GameState["playerDeck"]): { hand: GameState["playerHand"]; deck: GameState["playerDeck"] } {
  let deck = shuffle([...oldDeck, ...oldHand]);
  let hand: GameState["playerHand"] = [];
  for (let i = 0; i < DUEL_HAND_SIZE; i++) {
    const result = drawCard(deck, hand);
    if (!result.success) break;
    deck = result.newDeck;
    hand = result.newHand;
  }
  return { hand, deck };
}
