/**
 * Deck searches show the whole deck (classic TCG rule: when you search your deck you look at
 * all of it). Every Trainer / power / attack step that picks cards from its player's deck lists
 * every card of that deck: the ones it can take first (in deck order), then the others as
 * disabled options, sorted by name so the step never tells the order of the rest of the deck.
 * The step's min/max selections don't change; checkSelection (and the AI, the simulator) only
 * take enabled options. The deck is the chooser's own: never use this for the other player's deck.
 */

import { energyCardLabel, type GameCard } from "@/lib/gameState";
import type { SelectionOption } from "./types";

/** Default label of a deck card: "Energía Fuego" for basic Energy, else its name. */
export const deckCardOption = (card: GameCard): SelectionOption => ({ id: card.id, label: energyCardLabel(card) });

/**
 * The `options` and `cards` of a deck search step over the whole `deck`: `canTake` decides which
 * cards are choosable; `option` labels each card (default `deckCardOption`). The step shows the
 * deck, so it is a point of no return (`commitsOnShow`).
 */
export function wholeDeckChoice(
  deck: readonly GameCard[],
  canTake: (card: GameCard) => boolean,
  option: (card: GameCard) => SelectionOption = deckCardOption
): { options: SelectionOption[]; cards: GameCard[]; commitsOnShow: true } {
  const takeable = deck.filter(canTake);
  const rest = deck.filter((card) => !canTake(card)).sort((a, b) => a.name.localeCompare(b.name));
  return {
    cards: [...takeable, ...rest],
    options: [...takeable.map(option), ...rest.map((card) => ({ ...option(card), disabled: true }))],
    commitsOnShow: true,
  };
}
