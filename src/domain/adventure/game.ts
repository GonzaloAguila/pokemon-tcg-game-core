/**
 * An adventure battle's starting state (spec §3.1): the human is "player", the rival (the AI seat)
 * is "opponent". Standard rules (`gameMode` untouched); the adventure's rules, the run's passives
 * and the battle's modifiers are applied here and through the engine hooks they set on the state.
 */

import type { Deck } from "@/domain/decks";
import type { GameState } from "@/lib/gameState";
import { createGameEvent, initializeMultiplayerGame, startGame } from "@/lib/gameState";
import { deckFromCardEntries } from "./deck";
import {
  applyBattleModifiersToOptions,
  opponentPassivesFromModifiers,
  placeOpponentSetup,
  setupRulesFromModifiers,
  tableRulesFromModifiers,
  type BattleModifier,
} from "./modifiers";
import { setupOptionsForPassives } from "./passives";
import type { AdventurePassive, BattlePassives, CardEntry } from "./types";

export type AdventureGameConfig = {
  /** The run's deck (the human) */
  playerDeck: CardEntry[];
  /** The rival's deck for this battle (hard mode: the one for the run's starter) */
  opponentDeck: CardEntry[];
  /** The adventure's `rules.prizeCount` (before modifiers and passives) */
  prizeCount: number;
  /** The adventure's `rules.openingHand` (before modifiers and passives) */
  openingHand: number;
  /** The run's passives (`extra_heart` is accepted and ignored) */
  playerPassives: AdventurePassive[];
  /** The battle's `modifiers` (spec §3.5) */
  modifiers: BattleModifier[];
};

const NO_DECK: Deck = { id: "adventure", name: "Aventura", image: "", cards: [] };

/**
 * The MULLIGAN-phase state of an adventure battle. Order: decks (opaque ids `p1-n` / `p2-n`) →
 * `opponentSetup` (the rival's preset board, out of its deck before the deal) → startGame with the
 * rules' Prize count / opening hand, then the `prizeCount` / `openingHand` modifiers, then the
 * passives (`prize_minus_one`, `opening_hand_plus_1`; the rival's from `opponentPassives`) → `passives`,
 * `tableRules` (`noPrizeFor`) and `setupRules` (`bonusCards`, dealt at the both-ready transition)
 * on the state. Shuffles and ids use Math.random: call it inside the caller's `withRandom`.
 * Throws IllegalActionError for an unknown card id or an impossible `opponentSetup`.
 */
export function createAdventureGame(config: AdventureGameConfig): GameState {
  const initial = initializeMultiplayerGame(NO_DECK, NO_DECK);
  let state: GameState = {
    ...initial,
    selectedDeckId: null,
    playerDeck: deckFromCardEntries(config.playerDeck, "p1"),
    opponentDeck: deckFromCardEntries(config.opponentDeck, "p2"),
    events: [createGameEvent("Batalla de aventura inicializada", "system")],
  };

  for (const modifier of config.modifiers) {
    if (modifier.type === "opponentSetup") state = placeOpponentSetup(state, modifier);
  }

  const opponentPassives = opponentPassivesFromModifiers(config.modifiers);
  const options = setupOptionsForPassives({
    ...applyBattleModifiersToOptions({ prizeCount: config.prizeCount, openingHand: config.openingHand }, config.modifiers),
    playerPassives: config.playerPassives,
    opponentPassives,
  });

  // startGame deals from the decks and clears the board: the preset rival board goes back after
  const { opponentActivePokemon, opponentBench } = state;
  const dealt = startGame(state, options);

  const passives: BattlePassives = {
    ...(config.playerPassives.length > 0 && { player: [...config.playerPassives] }),
    ...(opponentPassives.length > 0 && { opponent: opponentPassives }),
  };
  const tableRules = tableRulesFromModifiers(config.modifiers);
  const setupRules = setupRulesFromModifiers(config.modifiers);
  return {
    ...dealt,
    opponentActivePokemon,
    opponentBench,
    ...(Object.keys(passives).length > 0 && { passives }),
    ...(tableRules && { tableRules }),
    ...(setupRules && { setupRules }),
  };
}
