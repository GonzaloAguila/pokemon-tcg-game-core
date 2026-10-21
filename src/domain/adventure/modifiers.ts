/**
 * Adventure battle modifiers ("reglas de jefe", spec §3.5): a closed vocabulary in the content
 * JSON, each entry an engine hook — never an `if` keyed by battle. Sides are relative to the
 * human's view: "player" = the human, "opponent" = the rival.
 *
 * | type | hook |
 * |---|---|
 * | `prizeCount` | startGame per-side Prizes (`applyBattleModifiersToOptions`, before the passives) |
 * | `openingHand` | startGame per-side opening hands (same) |
 * | `noPrizeFor` | `state.tableRules.noPrizeFor` → givesPrizeWhenKnockedOut (every Prize site, the AI's evaluation) |
 * | `bonusCards` | `state.setupRules.bonusCards` → applySetupRules puts them into the hand once both players are ready |
 * | `opponentSetup` | `placeOpponentSetup`: the rival starts with these evolution chains in play (before the deal) |
 * | `opponentPassives` | the §3.2 passives on the rival's side (`state.passives.opponent`) |
 */

import { findCardById } from "@/domain/catalog";
import type { Card } from "@/domain/cards";
import { toInPlayCard } from "@/domain/cards";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { canEvolveInto, createGameEvent } from "@/lib/gameState";
import { IllegalActionError } from "@/shared/errors";
import type { AdventurePassive, CardEntry, SetupRules, SidePair, TableRules, TableSide } from "./types";

export type BattleModifier =
  | { type: "prizeCount"; player?: number; opponent?: number }
  | { type: "openingHand"; player?: number; opponent?: number }
  | { type: "noPrizeFor"; side: TableSide; names: string[] }
  | { type: "bonusCards"; side: TableSide; cards: CardEntry[]; to: "hand" }
  | { type: "opponentSetup"; active: string[]; bench: string[][] }
  | { type: "opponentPassives"; passives: AdventurePassive[] };

export type BattleModifierType = BattleModifier["type"];

/** Every modifier type, for content validation. */
export const ADVENTURE_MODIFIER_TYPES: readonly BattleModifierType[] = [
  "prizeCount",
  "openingHand",
  "noPrizeFor",
  "bonusCards",
  "opponentSetup",
  "opponentPassives",
];

function toPair(value: number | SidePair): SidePair {
  return typeof value === "number" ? { player: value, opponent: value } : { ...value };
}

/**
 * The battle's Prize counts and opening hands: the rules' values with the `prizeCount` /
 * `openingHand` modifiers applied (a side a modifier omits keeps its value). The passives come
 * after (setupOptionsForPassives).
 */
export function applyBattleModifiersToOptions(
  base: { prizeCount: number | SidePair; openingHand: number | SidePair },
  modifiers: readonly BattleModifier[]
): { prizeCount: SidePair; openingHand: SidePair } {
  const prizeCount = toPair(base.prizeCount);
  const openingHand = toPair(base.openingHand);
  for (const modifier of modifiers) {
    const target = modifier.type === "prizeCount" ? prizeCount : modifier.type === "openingHand" ? openingHand : null;
    if (!target || (modifier.type !== "prizeCount" && modifier.type !== "openingHand")) continue;
    if (modifier.player !== undefined) target.player = modifier.player;
    if (modifier.opponent !== undefined) target.opponent = modifier.opponent;
  }
  return { prizeCount, openingHand };
}

/** The rival's extra passives (`opponentPassives` modifiers). */
export function opponentPassivesFromModifiers(modifiers: readonly BattleModifier[]): AdventurePassive[] {
  return modifiers.flatMap((m) => (m.type === "opponentPassives" ? m.passives : []));
}

/** `state.tableRules` from the modifiers (undefined when none applies). */
export function tableRulesFromModifiers(modifiers: readonly BattleModifier[]): TableRules | undefined {
  const noPrizeFor: { player?: string[]; opponent?: string[] } = {};
  for (const m of modifiers) {
    if (m.type === "noPrizeFor") noPrizeFor[m.side] = [...(noPrizeFor[m.side] ?? []), ...m.names];
  }
  return Object.keys(noPrizeFor).length > 0 ? { noPrizeFor } : undefined;
}

/** `state.setupRules` from the modifiers (undefined when none applies). */
export function setupRulesFromModifiers(modifiers: readonly BattleModifier[]): SetupRules | undefined {
  const bonusCards: { player?: CardEntry[]; opponent?: CardEntry[] } = {};
  for (const m of modifiers) {
    if (m.type === "bonusCards") bonusCards[m.side] = [...(bonusCards[m.side] ?? []), ...m.cards.map((c) => ({ ...c }))];
  }
  return Object.keys(bonusCards).length > 0 ? { bonusCards } : undefined;
}

/** The deck card that is a copy of the catalog card `cardId` (same set and number), not already taken. */
function takeFromDeck(deck: GameCard[], cardId: string, taken: Set<string>): GameCard {
  const wanted: Card | undefined = findCardById(cardId);
  if (!wanted) throw new IllegalActionError(`Carta desconocida: ${cardId}`);
  const card = deck.find((c) => !taken.has(c.id) && c.set === wanted.set && c.number === wanted.number);
  if (!card) throw new IllegalActionError(`El mazo del rival no tiene ${wanted.name} (${cardId}) para empezar en juego`);
  taken.add(card.id);
  return card;
}

/** One evolution chain (Basic first) as a Pokémon in play, its lower stages under it. */
function chainInPlay(deck: GameCard[], chain: readonly string[], taken: Set<string>): PokemonInPlay {
  if (chain.length === 0) throw new IllegalActionError("Cadena de evolución vacía");
  const cards = chain.map((id) => takeFromDeck(deck, id, taken));
  for (let i = 1; i < cards.length; i++) {
    if (!canEvolveInto(cards[i], cards[i - 1])) {
      throw new IllegalActionError(`${cards[i].name} no evoluciona de ${cards[i - 1].name}`);
    }
  }
  if (cards[0].kind !== "pokemon" || cards[0].stage !== "basic") throw new IllegalActionError(`${cards[0].name} no es un Pokémon básico`);
  const top = cards[cards.length - 1];
  return {
    pokemon: toInPlayCard(top) as GameCard,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: cards.slice(0, -1).map((c) => toInPlayCard(c) as GameCard),
    currentDamage: 0,
    statusConditions: [],
    playedOnTurn: 0,
  };
}

/**
 * `opponentSetup`: take each chain's cards (catalog ids, Basic first) out of the rival's deck and put
 * them into play — `active` as the Active, `bench` in order — before the deal (startGame), so the
 * rival can't mulligan and its setup only adds to the Bench. Throws IllegalActionError when a card is
 * missing from the deck, a chain doesn't evolve by name or the rival already has Pokémon in play.
 */
export function placeOpponentSetup(state: GameState, setup: { active: readonly string[]; bench: readonly (readonly string[])[] }): GameState {
  if (state.opponentActivePokemon || state.opponentBench.length > 0) throw new IllegalActionError("El rival ya tiene Pokémon en juego");
  const taken = new Set<string>();
  const active = chainInPlay(state.opponentDeck, setup.active, taken);
  const bench = setup.bench.map((chain) => chainInPlay(state.opponentDeck, chain, taken));
  const shown = [active, ...bench].map((p) => p.pokemon.name).join(", ");
  return {
    ...state,
    opponentActivePokemon: active,
    opponentBench: bench,
    opponentDeck: state.opponentDeck.filter((c) => !taken.has(c.id)),
    events: [...state.events, createGameEvent(`Reglas de la mesa: ${shown} empiezan en juego`, "info")],
  };
}
