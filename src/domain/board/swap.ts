/**
 * Perspective swap: the engine always acts for "player" (the side whose turn it is).
 * To act for the other side, swap, call the engine, swap back.
 */

import type { GameState } from "@/lib/gameState";
import { swapStadium } from "./stadium";
import { swapBenchTrim } from "./bench";
import { swapSetAsideHands } from "@/domain/trainers/set-aside";
import { swapLastDuel, swapPendingDuel } from "@/domain/duel/rps";
import { swapSideTurns } from "@/domain/trainers/side-marks";
import type { BattlePassives, SetupRules, TableRules } from "@/domain/adventure/types";

/** A pair of per-side values seen from the other side (absent sides stay absent). */
function swapPair<T>(pair: { player?: T; opponent?: T }): { player?: T; opponent?: T } {
  return {
    ...(pair.opponent !== undefined && { player: pair.opponent }),
    ...(pair.player !== undefined && { opponent: pair.player }),
  };
}

/**
 * The per-side rules of a state seen from the other side: adventure `openingHandSize`, `passives`,
 * `tableRules`, `setupRules`, and the Gym Challenge side marks (`trainerLockUntilTurn`,
 * `benchProtectedUntilTurn`). Spread into every perspective swap (swapSides, the AI executor's
 * attack view and its swap back) so each side's rules follow it.
 */
export function swapSideRules(state: GameState): Partial<GameState> {
  return {
    // Prizes owed (counts; the CanTakePrize flags are swapped by every caller)
    ...((state.playerPrizesOwed !== undefined || state.opponentPrizesOwed !== undefined) && {
      playerPrizesOwed: state.opponentPrizesOwed,
      opponentPrizesOwed: state.playerPrizesOwed,
    }),
    ...(state.openingHandSize !== undefined && { openingHandSize: { player: state.openingHandSize.opponent, opponent: state.openingHandSize.player } }),
    ...(state.passives !== undefined && { passives: swapPassives(state.passives) }),
    ...(state.tableRules !== undefined && { tableRules: swapTableRules(state.tableRules) }),
    ...(state.setupRules !== undefined && { setupRules: swapSetupRules(state.setupRules) }),
    ...(state.trainerLockUntilTurn !== undefined && { trainerLockUntilTurn: swapSideTurns(state.trainerLockUntilTurn) }),
    ...(state.benchProtectedUntilTurn !== undefined && { benchProtectedUntilTurn: swapSideTurns(state.benchProtectedUntilTurn) }),
  };
}

function swapTableRules(rules: TableRules): TableRules {
  return { ...rules, ...(rules.noPrizeFor !== undefined && { noPrizeFor: swapPair(rules.noPrizeFor) }) };
}

function swapSetupRules(rules: SetupRules): SetupRules {
  return { ...rules, ...(rules.bonusCards !== undefined && { bonusCards: swapPair(rules.bonusCards) }) };
}

/** The adventure passives seen from the other side (each side's list and lucky coin mark). */
function swapPassives(passives: BattlePassives): BattlePassives {
  const { player, opponent, luckyCoinUsed } = passives;
  return {
    ...(opponent !== undefined && { player: opponent }),
    ...(player !== undefined && { opponent: player }),
    ...(luckyCoinUsed !== undefined && {
      luckyCoinUsed: {
        ...(luckyCoinUsed.opponent !== undefined && { player: luckyCoinUsed.opponent }),
        ...(luckyCoinUsed.player !== undefined && { opponent: luckyCoinUsed.player }),
      },
    }),
  };
}

/**
 * Swap the "player"/"opponent" sides of a state: zones, ready/prize/promotion flags, turn
 * ownership, PlusPower/Defender owner, starting player, who played the Stadium, whose Bench
 * must be trimmed (pendingBenchTrim), whose hand is set aside (setAsideHands), the Misty's Duel
 * picks (pendingDuel) and result (lastDuel), the Gym Challenge side marks (trainerLockUntilTurn,
 * benchProtectedUntilTurn), the adventure rules (swapSideRules), Chaos Gym's offer (pendingChaosOffer's owner / offeredTo), and the game result. Swapping twice
 * returns an equal state. Pending attack flags (pendingForceSwitch...) and power prompts are
 * NOT swapped: they belong to the acting side and must be resolved in that perspective.
 */
export function swapSides(state: GameState): GameState {
  return {
    ...state,
    playerActivePokemon: state.opponentActivePokemon,
    playerBench: state.opponentBench,
    playerHand: state.opponentHand,
    playerDeck: state.opponentDeck,
    playerDiscard: state.opponentDiscard,
    playerPrizes: state.opponentPrizes,
    playerReady: state.opponentReady,
    playerCanTakePrize: state.opponentCanTakePrize,
    playerNeedsToPromote: state.opponentNeedsToPromote,
    opponentActivePokemon: state.playerActivePokemon,
    opponentBench: state.playerBench,
    opponentHand: state.playerHand,
    opponentDeck: state.playerDeck,
    opponentDiscard: state.playerDiscard,
    opponentPrizes: state.playerPrizes,
    opponentReady: state.playerReady,
    opponentCanTakePrize: state.playerCanTakePrize,
    opponentNeedsToPromote: state.playerNeedsToPromote,
    isPlayerTurn: !state.isPlayerTurn,
    startingPlayer: state.startingPlayer === "player" ? "opponent" : state.startingPlayer === "opponent" ? "player" : state.startingPlayer,
    activeModifiers: state.activeModifiers.map((modifier) => ({
      ...modifier,
      playerId: modifier.playerId === "player" ? ("opponent" as const) : ("player" as const),
    })),
    gameResult: state.gameResult === "victory" ? "defeat" : state.gameResult === "defeat" ? "victory" : state.gameResult,
    ...(state.stadium !== undefined && { stadium: swapStadium(state.stadium) }),
    ...(state.pendingBenchTrim !== undefined && { pendingBenchTrim: swapBenchTrim(state.pendingBenchTrim) }),
    ...(state.setAsideHands !== undefined && { setAsideHands: swapSetAsideHands(state.setAsideHands) }),
    ...(state.pendingDuel !== undefined && { pendingDuel: swapPendingDuel(state.pendingDuel) }),
    ...(state.lastDuel !== undefined && { lastDuel: swapLastDuel(state.lastDuel) }),
    ...swapSideRules(state),
    ...(state.pendingChaosOffer !== undefined && {
      pendingChaosOffer: {
        ...state.pendingChaosOffer,
        owner: state.pendingChaosOffer.owner === "player" ? ("opponent" as const) : ("player" as const),
        offeredTo: state.pendingChaosOffer.offeredTo === "player" ? ("opponent" as const) : ("player" as const),
      },
    }),
  };
}
