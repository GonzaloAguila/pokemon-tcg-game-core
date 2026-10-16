/**
 * What the AI is allowed to know (fair play).
 *
 * The planner never reads the real state: it plans on `knowledgeView(view)`, a copy where every
 * piece of hidden information is replaced by something that does not depend on it:
 *
 * - the other player's hand (unless Clairvoyance reveals it), deck and Prize cards (unless
 *   Here Comes Team Rocket! put them face up) become placeholder cards (same counts);
 * - hands set aside by Tickling Machine (both sides: nobody may look at them) too;
 * - the other player's Misty's Duel pick of the current round (maskDuelFor);
 * - the AI's own deck and Prize cards are merged and re-split in a canonical order: a player
 *   knows the decklist (deck + Prizes as a multiset) but neither the order nor which cards are
 *   Prizes;
 * - the event log is dropped (the planner never reads it; it also keeps clones cheap).
 *
 * Anything simulated on this view (draws, deck searches, shuffles) therefore cannot depend on
 * hidden cards. Coins are never peeked either: the planner evaluates coin attacks by expected
 * value over every outcome (evaluate.ts), and real coins are flipped by the executor.
 *
 * View convention: AI = "player" (board `swapSides` of the consumer's state).
 */

import type { GameCard, GameState } from "@/lib/gameState";
import { CardKind, CardSet, CardRarity, TrainerType } from "@/domain/constants";
import { arePrizesRevealed, isHandRevealed } from "@/domain/powers";
import { maskDuelFor } from "@/domain/duel/rps";

/** A face-down card of the other player (no name, no effect). */
function hiddenCard(id: string): GameCard {
  return {
    id,
    kind: CardKind.Trainer,
    name: "Carta oculta",
    number: 0,
    set: CardSet.BaseSet,
    rarity: CardRarity.Common,
    trainerType: TrainerType.Item,
    effect: "",
  } as unknown as GameCard;
}

function hiddenPile(prefix: string, count: number): GameCard[] {
  return Array.from({ length: count }, (_, i) => hiddenCard(`hidden-${prefix}-${i}`));
}

const byId = (a: GameCard, b: GameCard) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The AI's view with every hidden card replaced (see the module comment). AI = "player". */
export function knowledgeView(view: GameState): GameState {
  const prizesKnown = arePrizesRevealed(view, "player");
  // Own deck + Prizes: a known multiset in a canonical order (face-up Prizes stay where they are)
  const unknown = prizesKnown ? [...view.playerDeck].sort(byId) : [...view.playerDeck, ...view.playerPrizes].sort(byId);
  const playerDeck = unknown.slice(0, view.playerDeck.length);
  const playerPrizes = prizesKnown ? view.playerPrizes : unknown.slice(view.playerDeck.length);

  return {
    ...maskDuelFor(view, "player"),
    playerDeck,
    playerPrizes,
    opponentHand: isHandRevealed(view, "opponent") ? view.opponentHand : hiddenPile("hand", view.opponentHand.length),
    opponentDeck: hiddenPile("deck", view.opponentDeck.length),
    opponentPrizes: arePrizesRevealed(view, "opponent") ? view.opponentPrizes : hiddenPile("prize", view.opponentPrizes.length),
    // Tickling Machine: nobody may look at a set-aside hand, its owner included (counts only)
    ...(view.setAsideHands && {
      setAsideHands: view.setAsideHands.map((p) => ({ ...p, cards: hiddenPile(`aside-${p.side}`, p.cards.length) })),
    }),
    events: [],
  };
}

/**
 * Cards the AI may still find in its deck (deck + Prizes: it knows the multiset, not where each
 * card is). Use this, never `playerDeck` alone, for "is it worth searching for X?".
 */
export function unknownOwnCards(view: GameState): GameCard[] {
  return arePrizesRevealed(view, "player") ? view.playerDeck : [...view.playerDeck, ...view.playerPrizes];
}
