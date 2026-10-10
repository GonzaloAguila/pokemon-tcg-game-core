/**
 * Pending attack choices — one generic mechanism for every decision an attack leaves to a
 * player after it resolved (Fossil and later sets):
 *
 * | Effect (data) | Cards | Chooser | Answer (selection = option ids) |
 * |---|---|---|---|
 * | `Discard` target Defender | Hyper Beam (Golduck, Dragonair) | self | 1 Energy card of the Defending Pokémon |
 * | `ForceSwitch` + `switchChosenBy: "opponent"` | Terror Strike (Arbok) | opponent | 1 of the opponent's Benched Pokémon |
 * | `ReorderDeckTop` | Prophecy (Hypno) | self | step 1: "player" / "opponent" (deck); step 2: new order "0".."n-1" of its top cards |
 * | `DiscardEnergyForMill` | Wildfire (Moltres) | self | 0..all attached Fire Energy cards |
 * | `RecoverFromDiscard` | Energy Conversion (Gastly), Scavenge (Slowpoke) | self | cards of the discard pile (up to `amount`) |
 *
 * executeAttack sets `state.pendingAttackChoice` (a SelectionStep with `chooser`) when one of
 * these effects has something to choose; the turn can't end and no other action is allowed
 * until it is answered with `resolveAttackChoice(state, selection)`. The state passed is
 * ALWAYS the attacking side's view ("player" = attacker, the side whose turn it is), even when
 * `step.chooser === "opponent"` (the other player picks; the caller relays the answer).
 * Several choices of one attack are asked one after another (`queue`).
 */

import type { AttackEffect } from "@/domain/cards";
import type { SelectionStep } from "@/domain/effects/types";
import { checkSelection } from "@/domain/effects/validate";
import { AttackEffectType, AttackTarget, CardKind } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import type { GameCard, GameState, PendingAttackChoice, PendingResolutionOptions, PokemonInPlay } from "./gameState";
import { checkKnockouts, clearStatusConditionsOnRetreat, createGameEvent, endTurn, getEnergyTypeInSpanish } from "./gameState";

/** What the attack left behind for its choices (captured when it resolved). */
export type AttackChoiceContext = {
  attackName: string;
  /** Id of the attacking Pokémon */
  attackerId: string;
  /** Id of the Defending Pokémon when the attack was used */
  defenderId: string;
  /** The attack Knocked Out the Defending Pokémon (effects on it no longer happen) */
  defenderKnockedOut: boolean;
  /** Everything the attack did to the Defending Pokémon was prevented (Agility, Transparency...) */
  defenderBlocksEffects: boolean;
  /** Ids of the cards in the attacker's discard pile before the attack (RecoverFromDiscard) */
  discardIdsBefore: string[];
};

/** Effects whose outcome is chosen by a player after the attack (see the table above). */
export function isAttackChoiceEffect(effect: AttackEffect): boolean {
  switch (effect.type) {
    case AttackEffectType.ReorderDeckTop:
    case AttackEffectType.DiscardEnergyForMill:
    case AttackEffectType.RecoverFromDiscard:
      return true;
    case AttackEffectType.Discard:
      return effect.target === AttackTarget.Defender;
    case AttackEffectType.ForceSwitch:
      return effect.switchChosenBy === "opponent";
    default:
      return false;
  }
}

function attackerOf(state: GameState, context: AttackChoiceContext): PokemonInPlay | null {
  const active = state.playerActivePokemon;
  return active && active.pokemon.id === context.attackerId ? active : null;
}

/** The Defending Pokémon, if it is still the opponent's Active and the attack can still affect it. */
function defenderOf(state: GameState, context: AttackChoiceContext): PokemonInPlay | null {
  if (context.defenderKnockedOut || context.defenderBlocksEffects) return null;
  const active = state.opponentActivePokemon;
  return active && active.pokemon.id === context.defenderId ? active : null;
}

const energyLabel = (card: GameCard) => (card.kind === CardKind.Energy ? `Energía ${getEnergyTypeInSpanish(card.energyType)}` : card.name);

/** The question for one choice effect, or null when there is nothing to choose (skipped). */
function stepFor(state: GameState, effect: AttackEffect, context: AttackChoiceContext, deck?: "player" | "opponent"): SelectionStep | null {
  const title = context.attackName;
  switch (effect.type) {
    case AttackEffectType.Discard: {
      const defender = defenderOf(state, context);
      const energies = defender?.attachedEnergy ?? [];
      if (energies.length === 0) return null;
      const count = Math.min(effect.amount ?? 1, energies.length);
      return {
        title,
        description: `Elige ${count === 1 ? "1 Energía" : `${count} Energías`} de ${defender!.pokemon.name} para descartar`,
        options: energies.map((e) => ({ id: e.id, label: energyLabel(e) })),
        maxSelections: count,
        minSelections: count,
        thumbnails: energies,
        chooser: "self",
      };
    }
    case AttackEffectType.ForceSwitch: {
      const defender = defenderOf(state, context);
      if (!defender || state.opponentBench.length === 0) return null;
      return {
        title,
        description: `Tu rival elige el Pokémon de su Banca que cambia por ${defender.pokemon.name}`,
        options: state.opponentBench.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name })),
        maxSelections: 1,
        thumbnails: state.opponentBench.map((p) => p.pokemon),
        disableAutoSelect: true,
        chooser: "opponent",
      };
    }
    case AttackEffectType.ReorderDeckTop: {
      if (!deck) {
        const decks = [
          { id: "player", label: "Tu mazo", size: state.playerDeck.length },
          { id: "opponent", label: "El mazo de tu rival", size: state.opponentDeck.length },
        ].filter((d) => d.size > 0);
        if (decks.length === 0) return null;
        return {
          title,
          description: `Elige el mazo cuyas ${effect.amount ?? 3} cartas superiores quieres mirar y ordenar`,
          options: decks.map(({ id, label }) => ({ id, label })),
          maxSelections: 1,
          disableAutoSelect: true,
          chooser: "self",
        };
      }
      const top = (deck === "player" ? state.playerDeck : state.opponentDeck).slice(0, effect.amount ?? 3);
      if (top.length === 0) return null;
      return {
        title,
        description: `Ordena las ${top.length} cartas superiores ${deck === "player" ? "de tu mazo" : "del mazo de tu rival"} (la primera queda arriba)`,
        options: top.map((c, i) => ({ id: String(i), label: c.name })),
        maxSelections: top.length,
        orderingCards: top,
        chooser: "self",
      };
    }
    case AttackEffectType.DiscardEnergyForMill: {
      const attacker = attackerOf(state, context);
      const energies = (attacker?.attachedEnergy ?? []).filter(
        (e) => e.kind === CardKind.Energy && (!effect.energyType || e.energyType === effect.energyType)
      );
      if (energies.length === 0) return null;
      return {
        title,
        description: `Elige cuántas Energías ${effect.energyType ? getEnergyTypeInSpanish(effect.energyType) + " " : ""}descartar: se descarta la misma cantidad de cartas de la parte superior del mazo rival`,
        options: energies.map((e) => ({ id: e.id, label: energyLabel(e) })),
        maxSelections: energies.length,
        minSelections: 0,
        thumbnails: energies,
        disableAutoSelect: true,
        chooser: "self",
      };
    }
    case AttackEffectType.RecoverFromDiscard: {
      const kind = effect.recoverCardKind === "trainer" ? CardKind.Trainer : CardKind.Energy;
      const cards = state.playerDiscard.filter((c) => c.kind === kind && context.discardIdsBefore.includes(c.id));
      if (cards.length === 0) return null;
      const max = Math.min(effect.amount ?? 1, cards.length);
      return {
        title,
        description: kind === CardKind.Trainer
          ? `Elige ${max === 1 ? "1 carta" : `hasta ${max} cartas`} de Entrenador de tu pila de descartes para tu mano`
          : `Elige hasta ${max} cartas de Energía de tu pila de descartes para tu mano`,
        options: cards.map((c) => ({ id: c.id, label: kind === CardKind.Energy ? energyLabel(c) : c.name })),
        maxSelections: max,
        minSelections: Math.min(effect.minAmount ?? 0, max),
        cards,
        chooser: "self",
      };
    }
    default:
      return null;
  }
}

/** First choice among `effects` that has something to ask, as a pending choice (or none). */
function nextChoice(state: GameState, effects: AttackEffect[], context: AttackChoiceContext): PendingAttackChoice | undefined {
  for (let i = 0; i < effects.length; i++) {
    const step = stepFor(state, effects[i], context);
    if (step) return { effect: effects[i], step, context, queue: effects.slice(i + 1) };
  }
  return undefined;
}

/**
 * Set the first pending choice of an attack's choice effects (called by executeAttack after
 * everything else the attack did). Returns the same state when nothing needs a choice.
 */
export function startAttackChoices(state: GameState, effects: AttackEffect[], context: AttackChoiceContext): GameState {
  const pending = nextChoice(state, effects.filter(isAttackChoiceEffect), context);
  if (!pending) return state;
  const who = pending.step.chooser === "opponent" ? "Tu rival debe elegir" : "Debes elegir";
  return {
    ...state,
    pendingAttackChoice: pending,
    events: [...state.events, createGameEvent(`${context.attackName}: ${who}. ${pending.step.description}`, "info")],
  };
}

/** Apply one answer. Returns the new state and, for multi-step effects, the follow-up question. */
function applyChoice(state: GameState, pending: PendingAttackChoice, selection: string[]): { state: GameState; next?: PendingAttackChoice } {
  const { effect, context } = pending;
  const name = context.attackName;
  const log = (s: GameState, message: string): GameState => ({ ...s, events: [...s.events, createGameEvent(message, "action")] });

  switch (effect.type) {
    case AttackEffectType.Discard: {
      const defender = state.opponentActivePokemon!;
      const discarded = defender.attachedEnergy.filter((e) => selection.includes(e.id));
      const next: GameState = {
        ...state,
        opponentActivePokemon: { ...defender, attachedEnergy: defender.attachedEnergy.filter((e) => !selection.includes(e.id)) },
        opponentDiscard: [...state.opponentDiscard, ...discarded],
      };
      return { state: log(next, `${name}: se descartó ${discarded.map(energyLabel).join(", ")} de ${defender.pokemon.name}`) };
    }
    case AttackEffectType.ForceSwitch: {
      const oldActive = state.opponentActivePokemon!;
      const index = state.opponentBench.findIndex((p) => p.pokemon.id === selection[0]);
      const incoming = state.opponentBench[index];
      const toBench: PokemonInPlay = { ...clearStatusConditionsOnRetreat(oldActive), modifiedWeakness: undefined, modifiedResistance: undefined };
      const next: GameState = {
        ...state,
        opponentActivePokemon: incoming,
        opponentBench: [...state.opponentBench.filter((_, i) => i !== index), toBench],
      };
      return { state: log(next, `${name}: ${incoming.pokemon.name} pasa a ser el Pokémon activo del rival`) };
    }
    case AttackEffectType.ReorderDeckTop: {
      if (!pending.deck) {
        const deck = selection[0] as "player" | "opponent";
        const step = stepFor(state, effect, context, deck);
        const chosen = log(state, `${name}: mira las cartas superiores del ${deck === "player" ? "propio mazo" : "mazo rival"}`);
        return { state: chosen, next: step ? { ...pending, deck, step } : undefined };
      }
      const deckKey = pending.deck === "player" ? "playerDeck" : "opponentDeck";
      const deck = state[deckKey];
      const count = selection.length;
      const reordered = [...selection.map((i) => deck[Number(i)]), ...deck.slice(count)];
      return { state: log({ ...state, [deckKey]: reordered }, `${name}: se reordenaron ${count} cartas`) };
    }
    case AttackEffectType.DiscardEnergyForMill: {
      const attacker = state.playerActivePokemon!;
      const discarded = attacker.attachedEnergy.filter((e) => selection.includes(e.id));
      const milled = state.opponentDeck.slice(0, discarded.length);
      const next: GameState = {
        ...state,
        playerActivePokemon: { ...attacker, attachedEnergy: attacker.attachedEnergy.filter((e) => !selection.includes(e.id)) },
        playerDiscard: [...state.playerDiscard, ...discarded],
        opponentDeck: state.opponentDeck.slice(discarded.length),
        opponentDiscard: [...state.opponentDiscard, ...milled],
      };
      return {
        state: log(
          next,
          discarded.length === 0
            ? `${name}: no se descartó ninguna Energía`
            : `${name}: descartó ${discarded.length} Energía(s) y ${milled.length} carta(s) del mazo rival`
        ),
      };
    }
    case AttackEffectType.RecoverFromDiscard: {
      const taken = state.playerDiscard.filter((c) => selection.includes(c.id));
      const next: GameState = {
        ...state,
        playerDiscard: state.playerDiscard.filter((c) => !selection.includes(c.id)),
        playerHand: [...taken, ...state.playerHand],
      };
      return {
        state: log(next, taken.length === 0 ? `${name}: no tomó cartas` : `${name}: puso ${taken.map((c) => c.name).join(", ")} en la mano`),
      };
    }
    default:
      return { state };
  }
}

/**
 * Answer the pending attack choice (`state.pendingAttackChoice.step`): `selection` are option
 * ids, validated like a Trainer step (throws IllegalActionError otherwise). Call it on the
 * attacking side's view even when the opponent chose. When the attack has no more choices,
 * Knock Outs are checked and the turn ends (endTurn) unless `skipEndTurn`.
 */
export function resolveAttackChoice(state: GameState, selection: string[], options: PendingResolutionOptions = {}): GameState {
  const pending = state.pendingAttackChoice;
  if (!pending) throw new IllegalActionError("No hay ninguna elección de ataque pendiente");
  checkSelection(pending.step, selection);
  const applied = applyChoice({ ...state, pendingAttackChoice: undefined }, pending, selection);
  const next = applied.next ?? nextChoice(applied.state, pending.queue, pending.context);
  if (next) return { ...applied.state, pendingAttackChoice: next };
  const done = checkKnockouts(applied.state);
  return options.skipEndTurn || done.gameResult !== null ? done : endTurn(done);
}
