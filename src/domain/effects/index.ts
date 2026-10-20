/**
 * Card effect registry: generic entry points for Trainer cards and activated Pokémon Powers.
 *
 * Consumers (frontend SP/MP, API, AI, simulator) dispatch every Trainer and power through
 * these instead of per-card code:
 *
 *   const reason = canPlayTrainerCard(state, cardId);           // null = playable
 *   const coins = getTrainerCoinFlips(state, cardId);           // flip them (server in MP)
 *   getTrainerCoinFlippers(state, cardId, coins.length);        // who flipped each (captions)
 *   let step = getTrainerSteps(state, cardId, [], coins);       // ask, append answer, repeat
 *   // none flipped before? a coin may come after the choices (Blaine's Gamble: "discard…, then flip")
 *   if (coins.length === 0) coins = flip(getTrainerCoinFlips(state, cardId, selections));
 *   const next = playTrainerCard(state, cardId, selections, { coinResults: coins });
 *
 * Same for powers with the id of the Pokémon in play using it (canUsePokemonPower,
 * getPowerCoinFlips, getPowerCoinFlippers, getPowerSteps, usePokemonPower), and for the action
 * of the Stadium in play (getStadiumActions, canUseStadiumAction, getStadiumActionCoinFlips,
 * getStadiumActionSteps, useStadiumAction: no source id, the Stadium in play is the source). A step with
 * `chooser: "opponent"` is asked to the other player: show it with `stepForAnswerer(step)`.
 *
 * Chaos Gym (Gym Challenge) in play: the same flow first asks one coin for any non-Stadium
 * Trainer (getTrainerCoinFlips = 1, no steps, captions with isChaosGymCoinPending): playTrainerCard
 * with it resolves only the coin. Heads → `state.pendingChaosGymPlay`: run the flow again for that
 * card (its own coins and steps). Tails → the card did nothing and is in its owner's discard pile;
 * for a Trainer that doesn't stay in play, `state.pendingChaosOffer`: the other player answers
 * getChaosGymOfferStep (chooser "opponent") with answerChaosGymOffer; on "accept" it plays the
 * card on its own view with this same flow, out of turn (see the Chaos Gym section below).
 *
 * Errors: canX returns the Spanish reason; playTrainerCard / usePokemonPower throw
 * IllegalActionError when the card/power can't be used, the coins don't match what was
 * requested, or a selection isn't among the offered options (see shared/errors.ts).
 */

import type { ChaosGymOffer, GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { checkKnockouts, createGameEvent } from "@/lib/gameState";
import { TrainerType, type CoinFlipResult } from "@/domain/constants";
import { isPokemonCard } from "@/domain/cards";
import { canUsePower } from "@/domain/powers";
import { findInPlay, getTrainerBlocker, getTurnActionBlocker, swapSides } from "@/domain/board";
import { IllegalActionError, assertLegal } from "@/shared/errors";
import type { CardEffectContext, CardEffectDef, CoinFlipper, CoinFlipRequirement, SelectionStep } from "./types";
import { checkCoins, checkSelections, coinRequirement } from "./validate";
import { TRAINER_EFFECTS, discardPlayed, staysInPlay } from "./trainers";
import { POWER_EFFECTS } from "./powers";
import { playStadium, STADIUM_ACTIONS, withHandDiscardCost } from "./stadiums";
import { stadiumExtraTrainerDiscards, stadiumFlipsTrainers } from "@/domain/stadiums/rules";
import { getLuckyDuelPowerBlocker, getLuckyDuelTrainerBlocker } from "@/domain/lucky-duel/rules";

export type {
  SelectionOption,
  SelectionStep,
  CardEffectDef,
  CardEffectContext,
  CoinFlipRequirement,
  CoinFlipper,
} from "./types";
export { TRAINER_EFFECTS, UNSUPPORTED_TRAINERS, catalogTrainerNames, isPlayedAsBasic, staysInPlay } from "./trainers";
export { POWER_EFFECTS, ACTIVATED_POWER_TYPES } from "./powers";
export { playStadium, STADIUM_EFFECTS, STADIUM_ACTIONS, withHandDiscardCost } from "./stadiums";
export { checkSelection, minSelectionsOf, stepForAnswerer } from "./validate";

// ============================================================================
// Shared runner
// ============================================================================

function runEffect(
  def: CardEffectDef,
  state: GameState,
  sourceId: string,
  selections: string[][],
  context: CardEffectContext
): GameState {
  const coins = context.coinResults ?? [];
  if (!Array.isArray(selections)) throw new IllegalActionError("Selecciones no válidas");
  checkCoins(coinRequirement(def, state, sourceId, selections), coins);
  checkSelections(def, state, sourceId, selections, coins.length > 0 ? coins : undefined);
  const next = def.resolve(state, sourceId, selections, { coinResults: coins, ...(context.skipEndTurn && { skipEndTurn: true }) });
  // The wrapped legacy functions return the same object when their own checks fail
  if (next === state) throw new IllegalActionError("No se pudo aplicar el efecto");
  // State-based Knock Outs (e.g. Gust of Wind changed what a transformed Ditto copies)
  return checkKnockouts(next);
}

// ============================================================================
// Trainers (sourceId = card id in the hand)
// ============================================================================

type TrainerViewKind = "hand" | "borrowed" | "offer";

/**
 * The state every Trainer entry point works on for `cardId`:
 * - Sabrina's Psychic Control's card (`pendingBorrowedTrainer`, in the opponent's discard pile) is
 *   played "as if it were in your hand": a copy of it in the hand, the mark cleared ("borrowed");
 * - Chaos Gym's offer the player accepted (`pendingChaosOffer`, offered to "player", out of turn):
 *   a copy in the hand, the original out of its owner's discard pile, the player's turn for the
 *   duration of the play, the offer cleared ("offer");
 * - Chaos Gym's heads mark (`pendingChaosGymPlay`) for that card is cleared (it would block it).
 */
function trainerView(state: GameState, cardId: string): { view: GameState; kind: TrainerViewKind } {
  const offer = state.pendingChaosOffer;
  if (offer?.accepted && offer.offeredTo === "player" && offer.cardId === cardId) {
    const pile = offer.owner === "player" ? "playerDiscard" : "opponentDiscard";
    const card = state[pile].find((c) => c.id === cardId);
    if (card) {
      return {
        view: {
          ...state,
          [pile]: state[pile].filter((c) => c.id !== cardId),
          playerHand: [...state.playerHand, card],
          isPlayerTurn: true,
          pendingChaosOffer: undefined,
        },
        kind: "offer",
      };
    }
  }
  const base = state.pendingChaosGymPlay?.cardId === cardId ? { ...state, pendingChaosGymPlay: undefined } : state;
  const mark = base.pendingBorrowedTrainer;
  if (!mark || mark.cardId !== cardId || base.playerHand.some((c) => c.id === cardId)) return { view: base, kind: "hand" };
  const card = base.opponentDiscard.find((c) => c.id === cardId);
  if (!card) return { view: base, kind: "hand" };
  return { view: { ...base, playerHand: [...base.playerHand, card], pendingBorrowedTrainer: undefined }, kind: "borrowed" };
}

/** After a borrowed Trainer resolved: its copy leaves the player's piles (the card itself never left the opponent's discard pile). */
function returnBorrowedCard(state: GameState, cardId: string): GameState {
  const without = (cards: GameState["playerHand"]) => (cards.some((c) => c.id === cardId) ? cards.filter((c) => c.id !== cardId) : cards);
  return { ...state, playerHand: without(state.playerHand), playerDiscard: without(state.playerDiscard), playerDeck: without(state.playerDeck) };
}

function trainerDef(state: GameState, cardId: string): { def?: CardEffectDef; reason: string | null } {
  const card = state.playerHand.find((c) => c.id === cardId);
  if (!card) return { reason: "La carta no está en tu mano" };
  if (card.kind !== "trainer") return { reason: "Esa carta no es un Entrenador" };
  if (card.playsAsBasic) return { reason: `${card.name} se juega como un Pokémon Básico: ponlo en tu Banca` };
  // Stadiums without an on-play effect have no entry: they are all played the same way
  const def = TRAINER_EFFECTS[card.name] ?? (card.trainerType === TrainerType.Stadium ? playStadium : undefined);
  if (!def) return { reason: `${card.name} todavía no se puede jugar` };
  // The Stadium in play may require discarding cards from the hand first
  const discards = stadiumExtraTrainerDiscards(state, card.name);
  return { def: discards > 0 ? withHandDiscardCost(def, discards) : def, reason: null };
}

/** null when the Trainer in the hand can be played now, else the Spanish reason. */
export function canPlayTrainerCard(state: GameState, cardId: string): string | null {
  state = trainerView(state, cardId).view;
  if (!state.isPlayerTurn && state.pendingChaosOffer?.offeredTo === "player") {
    return state.pendingChaosOffer.accepted ? `Solo puedes usar ${state.pendingChaosOffer.cardName} (Chaos Gym)` : "Primero responde a Chaos Gym";
  }
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const trainersBlocked = getTrainerBlocker(state);
  if (trainersBlocked) return trainersBlocked;
  // Lucky Duel: the Trainers left out of its pool (Switch, Scoop Up, Lt. Surge's Treaty...)
  const luckyDuel = getLuckyDuelTrainerBlocker(state, state.playerHand.find((c) => c.id === cardId));
  if (luckyDuel) return luckyDuel;
  const { def, reason } = trainerDef(state, cardId);
  if (!def) return reason;
  return def.canUse(state, cardId);
}

/** Next question to ask before playing the Trainer (null when ready to play). */
export function getTrainerSteps(
  state: GameState,
  cardId: string,
  selections: string[][],
  coinResults?: CoinFlipResult[]
): SelectionStep | null {
  // Chaos Gym: nothing is asked before its coin
  if (isChaosGymCoinPending(state, cardId)) return null;
  const { view } = trainerView(state, cardId);
  const { def } = trainerDef(view, cardId);
  return def ? def.getSteps(view, cardId, selections, coinResults) : null;
}

/**
 * Coins to flip before the Trainer's first step (0 = none). With its answers (`selections`, once
 * getTrainerSteps returned null) and no coins before: the coins it flips after its choices
 * (Blaine's Gamble: the player chooses the discards without knowing the coin).
 */
export function getTrainerCoinFlips(state: GameState, cardId: string, selections: string[][] = []): CoinFlipRequirement {
  // Chaos Gym: only its coin; the card's own coins come with pendingChaosGymPlay (heads)
  if (isChaosGymCoinPending(state, cardId)) return selections.length === 0 ? 1 : 0;
  const { view } = trainerView(state, cardId);
  const { def } = trainerDef(view, cardId);
  return def ? coinRequirement(def, view, cardId, selections) : 0;
}

/** Who flipped each of `count` coins of an effect (default: its player). */
function flippersOf(def: CardEffectDef | undefined, count: number): CoinFlipper[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => def?.coinFlipper?.(i) ?? "self");
}

/**
 * Who flips each of the `count` coins of the Trainer `cardId` (its `getTrainerCoinFlips`
 * coins, in order), relative to the Trainer's player: Digger alternates "self", "opponent",
 * "self"…; every other Trainer is "self". For captions only (the caller still flips them all).
 */
export function getTrainerCoinFlippers(state: GameState, cardId: string, count: number): CoinFlipper[] {
  if (isChaosGymCoinPending(state, cardId)) return flippersOf(undefined, count);
  return flippersOf(trainerDef(trainerView(state, cardId).view, cardId).def, count);
}

/**
 * Play a Trainer from the hand with the answers to its steps and the coins it requested. With
 * `borrowedFromOpponentDiscard`: the Trainer of the opponent's discard pile Sabrina's Psychic
 * Control lets the player use (`state.pendingBorrowedTrainer`); it stays in that discard pile.
 */
export function playTrainerCard(
  state: GameState,
  cardId: string,
  selections: string[][] = [],
  context: CardEffectContext = {}
): GameState {
  const chaos = isChaosGymCoinPending(state, cardId);
  const { view, kind } = trainerView(state, cardId);
  if (context.borrowedFromOpponentDiscard && kind !== "borrowed") {
    throw new IllegalActionError("Esa carta no es la que elegiste con Sabrina's Psychic Control");
  }
  assertLegal(canPlayTrainerCard(state, cardId));
  if (chaos) return resolveChaosGymCoin(state, cardId, kind === "borrowed", selections, context.coinResults);
  const { borrowedFromOpponentDiscard: _borrowed, ...effectContext } = context;
  // Chaos Gym's offer is played out of turn: it never ends the turn
  const next = runEffect(trainerDef(view, cardId).def!, view, cardId, selections, kind === "offer" ? { ...effectContext, skipEndTurn: true } : effectContext);
  if (kind === "borrowed") return returnBorrowedCard(next, cardId);
  if (kind === "offer") return finishChaosGymOffer(state, next, state.pendingChaosOffer!);
  return next;
}

// ============================================================================
// Chaos Gym (Gym Challenge)
// ============================================================================
//
// "Whenever a player plays a Trainer card other than a Stadium card, he or she flips a coin. If
// heads, that player plays that card normally. If tails, that player can't play that card. If the
// card is not put into play, that player's opponent may use it instead, if he or she does
// everything required to play it (such as discarding cards). Either way, that card goes to its
// owner's discard pile."
//
// Rulings (docs/card-doubts.md → Gym Challenge): Psychic Control's borrowed card flips too; tails
// never resolves anything for its player (no coins, no steps); the other player may use a card
// that doesn't stay in play (attached Trainers, Trainers played as Basics: board/index.ts) at once,
// as if it were in its own hand, out of turn, with no second Chaos Gym coin; Sabrina's Psychic
// Control is never offered (it would chain another out-of-turn play). The card always ends in its
// owner's discard pile.

const CHAOS_GYM = "Chaos Gym";

/** The Trainer `cardId` the player is about to play (its hand, or Psychic Control's card). */
function cardToPlay(state: GameState, cardId: string): GameCard | undefined {
  return (
    state.playerHand.find((c) => c.id === cardId) ??
    (state.pendingBorrowedTrainer?.cardId === cardId ? state.opponentDiscard.find((c) => c.id === cardId) : undefined)
  );
}

/**
 * Chaos Gym is in play and its coin is still to be flipped for the Trainer `cardId` the player
 * (whose turn it is) is about to play: getTrainerCoinFlips asks that 1 coin (caption it "Chaos
 * Gym") and playTrainerCard resolves only it. False for Stadiums, Trainers played as Basics (their
 * coin is getPlayBasicCoinFlips'), a card that already came up heads and the offered card.
 */
export function isChaosGymCoinPending(state: GameState, cardId: string): boolean {
  if (!stadiumFlipsTrainers(state) || !state.isPlayerTurn) return false;
  if (state.pendingChaosGymPlay?.cardId === cardId || state.pendingChaosOffer?.cardId === cardId) return false;
  const card = cardToPlay(state, cardId);
  return !!card && card.kind === "trainer" && card.trainerType !== TrainerType.Stadium && !card.playsAsBasic;
}

/** Chaos Gym's coin for the Trainer `cardId` (canPlayTrainerCard already passed). */
function resolveChaosGymCoin(
  state: GameState,
  cardId: string,
  borrowed: boolean,
  selections: string[][],
  coinResults: CoinFlipResult[] | undefined
): GameState {
  const coins = coinResults ?? [];
  if (coins.length !== 1) throw new IllegalActionError("Chaos Gym: se esperaba 1 moneda");
  if (selections.length > 0) throw new IllegalActionError("Chaos Gym: primero se lanza su moneda, sin elegir nada");
  const card = cardToPlay(state, cardId)!;
  if (coins[0] === "heads") {
    return {
      ...state,
      pendingChaosGymPlay: { cardId, cardName: card.name },
      events: [...state.events, createGameEvent(`${CHAOS_GYM}: salió cara, ${card.name} se juega con normalidad`, "info")],
    };
  }
  const failed: GameState = borrowed
    ? { ...state, pendingBorrowedTrainer: undefined }
    : { ...state, playerHand: state.playerHand.filter((c) => c.id !== cardId), playerDiscard: [...state.playerDiscard, card] };
  const events = [...state.events, createGameEvent(`${CHAOS_GYM}: salió cruz, ${card.name} no hace nada`, "action")];
  if (staysInPlay(card) || card.name === PSYCHIC_CONTROL) return { ...failed, events };
  const offer: ChaosGymOffer = { cardId, cardName: card.name, owner: borrowed ? "opponent" : "player", offeredTo: "opponent" };
  const usable = canPlayTrainerCard(swapSides({ ...failed, pendingChaosOffer: { ...offer, accepted: true } }), cardId) === null;
  if (!usable) return { ...failed, events: [...events, createGameEvent(`${CHAOS_GYM}: el otro jugador no puede usar ${card.name}`, "info")] };
  return {
    ...failed,
    pendingChaosOffer: offer,
    events: [...events, createGameEvent(`${CHAOS_GYM}: el otro jugador puede usar ${card.name} en su lugar`, "info")],
  };
}

/** After the offered player used the card (`next`, its own view): the copy leaves its piles, the card goes back to its owner's discard pile. */
function finishChaosGymOffer(before: GameState, next: GameState, offer: ChaosGymOffer): GameState {
  const pile = offer.owner === "player" ? "playerDiscard" : "opponentDiscard";
  const card = before[pile].find((c) => c.id === offer.cardId)!;
  const without = (cards: GameCard[]) => (cards.some((c) => c.id === offer.cardId) ? cards.filter((c) => c.id !== offer.cardId) : cards);
  const stripped: GameState = {
    ...next,
    playerHand: without(next.playerHand),
    playerDeck: without(next.playerDeck),
    playerDiscard: without(next.playerDiscard),
    opponentHand: without(next.opponentHand),
    opponentDeck: without(next.opponentDeck),
    opponentDiscard: without(next.opponentDiscard),
  };
  return {
    ...stripped,
    [pile]: [...stripped[pile], card],
    isPlayerTurn: before.isPlayerTurn,
    pendingChaosOffer: undefined,
    events: [...stripped.events, createGameEvent(`${CHAOS_GYM}: ${card.name} va a la pila de descartes de su dueño`, "info")],
  };
}

/**
 * Chaos Gym's offer, read on the view of the side whose turn it is (whose Trainer failed): the
 * other player chooses "accept" (then it plays the card on its own view with the generic Trainer
 * flow) or "decline" (`chooser: "opponent"`: show it with stepForAnswerer; default "decline").
 * Null when nothing is offered or it was already accepted.
 */
export function getChaosGymOfferStep(state: GameState): SelectionStep | null {
  const offer = state.pendingChaosOffer;
  if (!offer || offer.offeredTo !== "opponent" || offer.accepted) return null;
  const pile = offer.owner === "player" ? state.playerDiscard : state.opponentDiscard;
  const card = pile.find((c) => c.id === offer.cardId);
  return {
    title: CHAOS_GYM,
    description: `Salió cruz: tu rival puede usar ${offer.cardName} como si estuviera en su mano`,
    answererDescription: `Salió cruz para ${offer.cardName} de tu rival: ¿quieres usarla como si estuviera en tu mano?`,
    options: [
      { id: "accept", label: `Usar ${offer.cardName}` },
      { id: "decline", label: "No usarla" },
    ],
    maxSelections: 1,
    minSelections: 1,
    chooser: "opponent",
    defaultSelection: ["decline"],
    ...(card && { cards: [card] }),
  };
}

/**
 * The other player's answer to getChaosGymOfferStep (state: the view of the side whose turn it
 * is). "decline": the offer ends; "accept": `pendingChaosOffer.accepted`, the other player now plays
 * the card on its own view (swapSides): canPlayTrainerCard / getTrainerCoinFlips /
 * getTrainerSteps / playTrainerCard with the offer's `cardId`, or declineChaosGymOffer.
 */
export function answerChaosGymOffer(state: GameState, selection: string[]): GameState {
  const offer = state.pendingChaosOffer;
  if (!offer || offer.offeredTo !== "opponent" || offer.accepted) throw new IllegalActionError("No hay una oferta de Chaos Gym que responder");
  const answer = selection[0];
  if (selection.length !== 1 || (answer !== "accept" && answer !== "decline")) throw new IllegalActionError("Respuesta no válida");
  if (answer === "decline") return declineChaosGymOffer(state);
  const accepted: GameState = { ...state, pendingChaosOffer: { ...offer, accepted: true } };
  assertLegal(canPlayTrainerCard(swapSides(accepted), offer.cardId));
  return {
    ...accepted,
    events: [...state.events, createGameEvent(`${CHAOS_GYM}: el otro jugador usará ${offer.cardName}`, "info")],
  };
}

/** Nobody uses Chaos Gym's offered card (either view, before or after accepting); it stays in its owner's discard pile. Unchanged without an offer. */
export function declineChaosGymOffer(state: GameState): GameState {
  const offer = state.pendingChaosOffer;
  if (!offer) return state;
  return {
    ...state,
    pendingChaosOffer: undefined,
    events: [...state.events, createGameEvent(`${CHAOS_GYM}: nadie usó ${offer.cardName}`, "info")],
  };
}

/** Chaos Gym came up heads but the player can't (or won't) finish the card: it is discarded without effect (as endTurn does). Unchanged without one. */
export function forfeitChaosGymPlay(state: GameState): GameState {
  const mark = state.pendingChaosGymPlay;
  if (!mark) return state;
  const inHand = state.playerHand.find((c) => c.id === mark.cardId);
  return {
    ...state,
    pendingChaosGymPlay: undefined,
    ...(state.pendingBorrowedTrainer?.cardId === mark.cardId && { pendingBorrowedTrainer: undefined }),
    ...(inHand && { playerHand: state.playerHand.filter((c) => c.id !== mark.cardId), playerDiscard: [...state.playerDiscard, inHand] }),
    events: [...state.events, createGameEvent(`${CHAOS_GYM}: ${mark.cardName} se descarta sin efecto`, "info")],
  };
}

/** Sabrina's Psychic Control: the player gives up the Trainer it chose (`pendingBorrowedTrainer`); unchanged without one. */
export function declineBorrowedTrainer(state: GameState): GameState {
  const mark = state.pendingBorrowedTrainer;
  if (!mark) return state;
  return {
    ...state,
    pendingBorrowedTrainer: undefined,
    events: [...state.events, createGameEvent(`Sabrina's Psychic Control: no se usó ${mark.cardName}`, "info")],
  };
}

// ============================================================================
// Sabrina's Psychic Control (needs canPlayTrainerCard: registered here, not in trainers.ts)
// ============================================================================

const PSYCHIC_CONTROL = "Sabrina's Psychic Control";

/** The state right after Psychic Control resolved with `chosenId` (the card itself discarded). */
function afterPsychicControl(state: GameState, cardId: string, chosen: { id: string; name: string }): GameState {
  return {
    ...state,
    playerHand: state.playerHand.filter((c) => c.id !== cardId),
    playerDiscard: [...state.playerDiscard, ...state.playerHand.filter((c) => c.id === cardId)],
    pendingBorrowedTrainer: { cardId: chosen.id, cardName: chosen.name },
  };
}

/**
 * Trainers of the opponent's discard pile Psychic Control may choose, with why one can't be played
 * now. Another Psychic Control counts as playable (it may always choose itself: checking it would
 * never end).
 */
function borrowableTrainers(state: GameState, cardId: string): { id: string; name: string; reason: string | null }[] {
  return state.opponentDiscard
    .filter((c) => c.kind === "trainer" && !staysInPlay(c))
    .map((c) => ({ id: c.id, name: c.name, reason: c.name === PSYCHIC_CONTROL ? null : canPlayTrainerCard(afterPsychicControl(state, cardId, c), c.id) }));
}

// "Flip a coin. If heads, look at your opponent's discard pile and choose a Trainer card that
// doesn't stay in play… You may use that card as if it were in your hand, if you do everything
// required to play it (such as discarding cards). The card stays in your opponent's discard pile."
// Heads: one step choosing it; the card is then played with the generic flow (pendingBorrowedTrainer).
TRAINER_EFFECTS[PSYCHIC_CONTROL] = {
  canUse: (state, cardId) =>
    borrowableTrainers(state, cardId).some((c) => c.reason === null)
      ? null
      : "No hay en la pila de descartes de tu rival una carta de Entrenador que puedas usar",
  coinFlips: () => 1,
  getSteps: (state, cardId, selections, coinResults) => {
    if (coinResults?.[0] !== "heads" || selections.length > 0) return null;
    const choices = borrowableTrainers(state, cardId);
    return {
      title: PSYCHIC_CONTROL,
      description: "Elige una carta de Entrenador de la pila de descartes de tu rival: la usarás como si estuviera en tu mano",
      options: choices.map((c) => ({ id: c.id, label: c.name, ...(c.reason && { disabled: true, sublabel: c.reason }) })),
      cards: state.opponentDiscard.filter((c) => choices.some((choice) => choice.id === c.id)),
      maxSelections: 1,
      disableAutoSelect: true,
    };
  },
  resolve: (state, cardId, selections, { coinResults }) => {
    const heads = coinResults?.[0] === "heads";
    const played = discardPlayed(state, cardId, `Jugaste ${PSYCHIC_CONTROL}`);
    if (!heads) return { ...played, events: [...played.events, createGameEvent(`${PSYCHIC_CONTROL}: salió cruz, no pasa nada`, "info")] };
    const chosen = state.opponentDiscard.find((c) => c.id === selections[0][0])!;
    return {
      ...played,
      pendingBorrowedTrainer: { cardId: chosen.id, cardName: chosen.name },
      events: [...played.events, createGameEvent(`${PSYCHIC_CONTROL}: quien lo jugó usará ${chosen.name} de la pila de descartes del otro jugador`, "action")],
    };
  },
};

// ============================================================================
// Pokémon Powers (sourceId = id of the Pokémon in play using it)
// ============================================================================

function powerDef(state: GameState, pokemonId: string): { def?: CardEffectDef; pokemon?: PokemonInPlay; reason: string | null } {
  const found = findInPlay(state, "player", pokemonId);
  if (!found) return { reason: "Debes elegir uno de tus Pokémon en juego" };
  const card = found.pokemon.pokemon;
  if (!isPokemonCard(card) || !card.power) return { reason: "Este Pokémon no tiene un Poder Pokémon" };
  const def = POWER_EFFECTS[card.power.name];
  if (!def) return { reason: `${card.power.name} no se activa: funciona solo` };
  return { def, pokemon: found.pokemon, reason: null };
}

/** null when this Pokémon can use its power now, else the Spanish reason. */
export function canUsePokemonPower(state: GameState, pokemonId: string): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const { def, pokemon, reason } = powerDef(state, pokemonId);
  if (!def || !pokemon) return reason;
  // Lucky Duel: powers that take the only Pokémon out of play (Cowardice, Buzzap)
  const luckyDuel = getLuckyDuelPowerBlocker(state, pokemon);
  if (luckyDuel) return luckyDuel;
  const statusReason = canUsePower(pokemon, state.playerActivePokemon?.pokemon.id === pokemonId, state.usedPowersThisTurn, state);
  if (statusReason) return statusReason;
  return def.canUse(state, pokemonId);
}

export function getPowerSteps(
  state: GameState,
  pokemonId: string,
  selections: string[][],
  coinResults?: CoinFlipResult[]
): SelectionStep | null {
  const { def } = powerDef(state, pokemonId);
  return def ? def.getSteps(state, pokemonId, selections, coinResults) : null;
}

export function getPowerCoinFlips(state: GameState, pokemonId: string, selections: string[][] = []): CoinFlipRequirement {
  const { def } = powerDef(state, pokemonId);
  return def?.coinFlips?.(state, pokemonId, selections) ?? 0;
}

/** Who flips each of the `count` coins of the power of `pokemonId`, relative to its owner (see getTrainerCoinFlippers). */
export function getPowerCoinFlippers(state: GameState, pokemonId: string, count: number): CoinFlipper[] {
  return flippersOf(powerDef(state, pokemonId).def, count);
}

/** Use the power of the player's Pokémon `pokemonId` with its answers and coins. */
export function usePokemonPower(
  state: GameState,
  pokemonId: string,
  selections: string[][] = [],
  context: CardEffectContext = {}
): GameState {
  assertLegal(canUsePokemonPower(state, pokemonId));
  return runEffect(powerDef(state, pokemonId).def!, state, pokemonId, selections, context);
}

/** Ids of the player's Pokémon that can use an activated power right now. */
export function getUsablePowerPokemonIds(state: GameState): string[] {
  const own = [state.playerActivePokemon, ...state.playerBench].filter((p): p is PokemonInPlay => p != null);
  return own.map((p) => p.pokemon.id).filter((id) => canUsePokemonPower(state, id) === null);
}

// ============================================================================
// Stadium actions (sourceId = the id of the Stadium card in play)
// ============================================================================

function stadiumActionDef(state: GameState): { def?: CardEffectDef; sourceId?: string; reason: string | null } {
  const stadium = state.stadium;
  if (!stadium) return { reason: "No hay un Estadio en juego" };
  const def = STADIUM_ACTIONS[stadium.card.name];
  if (!def) return { reason: `${stadium.card.name} no tiene una acción que usar` };
  return { def, sourceId: stadium.card.id, reason: null };
}

/**
 * The actions of the Stadium in play for the player whose turn it is ("player"), whoever played
 * it: `available` is null when it can be used now, else the Spanish reason. Empty when there is
 * no Stadium or it has no action (Celadon City Gym has one).
 */
export function getStadiumActions(state: GameState): { name: string; available: string | null }[] {
  const { def } = stadiumActionDef(state);
  return def && state.stadium ? [{ name: state.stadium.card.name, available: canUseStadiumAction(state) }] : [];
}

/** null when the player whose turn it is can use the Stadium's action now, else the Spanish reason. */
export function canUseStadiumAction(state: GameState): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const { def, sourceId, reason } = stadiumActionDef(state);
  if (!def || !sourceId) return reason;
  return def.canUse(state, sourceId);
}

/** Next question to ask before using the Stadium's action (null when ready, or no action). */
export function getStadiumActionSteps(state: GameState, selections: string[][], coinResults?: CoinFlipResult[]): SelectionStep | null {
  const { def, sourceId } = stadiumActionDef(state);
  return def && sourceId ? def.getSteps(state, sourceId, selections, coinResults) : null;
}

/** Coins to flip before the Stadium action's first step (0 = none; Celadon City Gym flips none). */
export function getStadiumActionCoinFlips(state: GameState, selections: string[][] = []): CoinFlipRequirement {
  const { def, sourceId } = stadiumActionDef(state);
  return def && sourceId ? def.coinFlips?.(state, sourceId, selections) ?? 0 : 0;
}

/** Use the action of the Stadium in play with the answers to its steps (throws IllegalActionError when it can't). */
export function useStadiumAction(state: GameState, selections: string[][] = [], context: CardEffectContext = {}): GameState {
  assertLegal(canUseStadiumAction(state));
  const { def, sourceId } = stadiumActionDef(state);
  return runEffect(def!, state, sourceId!, selections, context);
}
