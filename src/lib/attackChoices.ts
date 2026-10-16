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
 * | `SelfSwitch` + `optional` | Teleport Blast (Dark Alakazam) | self | 0–1 of your Benched Pokémon |
 * | `ChooseTargetDamage` | Stare, Flitter, Dig Under, Coin Hurl (heads) | self | 1 of the opponent's Pokémon (Active or Benched): it takes `amount` |
 * | `ChooseTargetDamage` + `switchWithDefender` | Drag Off (Dark Machoke) | self | 1 of the opponent's Benched Pokémon: switched in, then takes `amount` (W/R) |
 * | `ChooseTargetDamage` + `optionalEnergyDiscard` | Flame Pillar (Dark Rapidash) | self | step 1: 0–1 Fire Energy card to discard; step 2 (if discarded): 1 of the opponent's Benched Pokémon |
 * | `MoveDefenderEnergyToBench` | Magnetic Lines (Dark Magneton) | self | step 1: 1 basic Energy of the Defending Pokémon; step 2: 1 of the opponent's Benched Pokémon |
 * | `MoveAllEnergyToBench` | Energy Bomb (Dark Electrode); with `energyType` + `amount`: Electric Current (Lt. Surge's Electabuzz) | self | one step per attached Energy card to move (the first one each time): 1 of your Benched Pokémon |
 * | `DiscardEnergyToDraw` | Third Eye (Dark Golduck) | self | step 1: 1 attached Energy card; step 2: how many cards to draw, "0".."3" |
 * | `EvolveFromDeck` | Rapid Evolution (Magikarp) | self | 1 Gyarados / Dark Gyarados card of the deck |
 * | `AttachEnergyFromDeck` | Afternoon Nap (Slowpoke) | self | 1 basic Psychic Energy card of the deck |
 * | `AttachEnergyFromDiscard` | Charge (Lt. Surge's Electabuzz / Pikachu) | self | `minAmount`..`amount` basic Energy cards of `energyType` in the discard pile |
 * | `ReturnPokemonToHand` | Fairy Power (Erika's Clefable) | self | any of your Pokémon in play (the Active only offered with a Bench) |
 * | `SearchDeckChoice` | Moonwatching, Jellyfish Pod, Call for Friend (Gym Heroes) | self | deck cards matching `deckFilter` (to the hand or the Bench; the deck is shuffled) |
 * | `SearchDeckChoice` + `putBackFromHand` | Sleight of Hand (Sabrina's Mr. Mime) | self | step 1: 0..N cards of the hand (on top of the deck); step 2: that many basic Energy cards of the deck |
 *
 * Damage done by a choice (ChooseTargetDamage) is attack damage: PlusPower and Defender when the
 * target is the Defending Pokémon, Kabuto Armor, protection / Invisible Wall, Strikes Back,
 * Mirror Shell, Destiny Bond and Final Beam all apply (dealChosenTargetDamage).
 *
 * executeAttack sets `state.pendingAttackChoice` (a SelectionStep with `chooser`) when one of
 * these effects has something to choose; the turn can't end and no other action is allowed
 * until it is answered with `resolveAttackChoice(state, selection)`. The state passed is
 * ALWAYS the attacking side's view ("player" = attacker, the side whose turn it is), even when
 * `step.chooser === "opponent"` (the other player picks; the caller relays the answer).
 * Several choices of one attack are asked one after another (`queue`).
 */

import type { AttackEffect } from "@/domain/cards";
import { cardsLeavingPlay, isEnergyCard, isPokemonCard, type DeckCardFilter } from "@/domain/cards";
import type { SelectionStep } from "@/domain/effects/types";
import { checkSelection } from "@/domain/effects/validate";
import { AttackEffectType, AttackTarget, CardKind, GamePhase, PokemonStage, type CoinFlipResult } from "@/domain/constants";
import {
  applyDamageHalving,
  getDamageReaction,
  getEffectivePokemonCard,
  getEffectiveHp,
  getKnockOutRetaliation,
  isDamageBlocked,
} from "@/domain/powers";
import { evolvePokemonInPlay, getEvolutionBlocker, maxBenchSize } from "@/domain/board";
import { stadiumIgnoresResistance } from "@/domain/stadiums/rules";
import { IllegalActionError } from "@/shared/errors";
import { modifierAppliesTo } from "./modifiers";
import type { GameCard, GameState, PendingAttackChoice, PendingResolutionOptions, PokemonInPlay } from "./gameState";
import {
  activeCounterAttack,
  checkKnockouts,
  clearStatusConditionsOnRetreat,
  counterAttackDamage,
  createGameEvent,
  drawCard,
  endTurn,
  energyCardLabel,
  energyProvidesType,
  energyToMove,
  getEnergyTypeInSpanish,
  knockOutPlayerActive,
  knockOutRetaliationDamage,
  protectionBlocksDamage,
  shuffle,
} from "./gameState";

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
  /** Final Beam's coin (the attack's defender coin) when the Defending Pokémon is a Dark Gyarados */
  finalBeamCoin?: CoinFlipResult;
  /** Crosscounter's coin (the attack's defender coin) when the Defending Pokémon used it last turn */
  counterAttackCoin?: CoinFlipResult;
  /** Shadow Images' coin (the attack's defender coin, flipped by the attacker): tails = no damage to it */
  evadeCoin?: CoinFlipResult;
};

/** Effects whose outcome is chosen by a player after the attack (see the table above). */
export function isAttackChoiceEffect(effect: AttackEffect): boolean {
  switch (effect.type) {
    case AttackEffectType.SearchDeckChoice:
    case AttackEffectType.ReorderDeckTop:
    case AttackEffectType.DiscardEnergyForMill:
    case AttackEffectType.RecoverFromDiscard:
    case AttackEffectType.ChooseTargetDamage:
    case AttackEffectType.MoveDefenderEnergyToBench:
    case AttackEffectType.MoveAllEnergyToBench:
    case AttackEffectType.DiscardEnergyToDraw:
    case AttackEffectType.EvolveFromDeck:
    case AttackEffectType.AttachEnergyFromDeck:
    case AttackEffectType.AttachEnergyFromDiscard:
    case AttackEffectType.ReturnPokemonToHand:
      return true;
    case AttackEffectType.SelfSwitch:
      return !!effect.optional;
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

const energyLabel = (card: GameCard) => energyCardLabel(card);

type Where = "Activo" | "Banca" | "Activo rival" | "Banca rival";
const pokemonChoice = (p: PokemonInPlay, where: Where) => ({ id: p.pokemon.id, label: `${p.pokemon.name} (${where})` });

/** The opponent's Pokémon a ChooseTargetDamage effect can hit. */
function chooseTargets(state: GameState, effect: AttackEffect): { pokemon: PokemonInPlay; where: Where }[] {
  const bench = state.opponentBench.map((pokemon) => ({ pokemon, where: "Banca rival" as const }));
  if (effect.targetScope === "opponentBench") return bench;
  return state.opponentActivePokemon ? [{ pokemon: state.opponentActivePokemon, where: "Activo rival" as const }, ...bench] : bench;
}

/** Whether a deck card can be taken by a SearchDeckChoice filter. */
export function matchesDeckCardFilter(card: GameCard, filter: DeckCardFilter = {}): boolean {
  if (filter.basicEnergy && !(isEnergyCard(card) && card.isBasic)) return false;
  if (filter.basicPokemon && !(isPokemonCard(card) && card.stage === PokemonStage.Basic)) return false;
  if (filter.names && !filter.names.includes(card.name)) return false;
  if (filter.nameIncludes && !(isPokemonCard(card) && card.name.includes(filter.nameIncludes))) return false;
  return true;
}

/** The deck cards a SearchDeckChoice can take now (none for the Bench when it is full). */
function searchableCards(state: GameState, effect: AttackEffect): GameCard[] {
  if (effect.destination === "bench" && state.playerBench.length >= maxBenchSize(state, "player")) return [];
  return state.playerDeck.filter((c) => matchesDeckCardFilter(c, effect.deckFilter));
}

/** The question for one choice effect, or null when there is nothing to choose (skipped). */
function stepFor(
  state: GameState,
  effect: AttackEffect,
  context: AttackChoiceContext,
  deck?: "player" | "opponent",
  picked?: string[]
): SelectionStep | null {
  const title = context.attackName;
  switch (effect.type) {
    case AttackEffectType.SelfSwitch: {
      const attacker = attackerOf(state, context);
      if (!attacker || state.playerBench.length === 0) return null;
      return {
        title,
        description: `Puedes cambiar a ${attacker.pokemon.name} por 1 de tus Pokémon en la Banca`,
        options: state.playerBench.map((p) => pokemonChoice(p, "Banca")),
        maxSelections: 1,
        minSelections: 0,
        thumbnails: state.playerBench.map((p) => p.pokemon),
        disableAutoSelect: true,
        chooser: "self",
      };
    }
    case AttackEffectType.ChooseTargetDamage: {
      const attacker = attackerOf(state, context);
      if (!attacker) return null;
      if (effect.optionalEnergyDiscard && !picked) {
        const type = effect.optionalEnergyDiscard;
        const energies = attacker.attachedEnergy.filter((e) => energyProvidesType(e, type));
        if (energies.length === 0) return null;
        return {
          title,
          description: `Puedes descartar 1 Energía ${getEnergyTypeInSpanish(type)} de ${attacker.pokemon.name}: si lo haces, este ataque hace ${effect.amount ?? 0} de daño a 1 Pokémon en la Banca de tu rival`,
          options: energies.map((e) => ({ id: e.id, label: energyLabel(e) })),
          maxSelections: 1,
          minSelections: 0,
          thumbnails: energies,
          disableAutoSelect: true,
          chooser: "self",
        };
      }
      const targets = chooseTargets(state, effect);
      if (targets.length === 0) return null;
      return {
        title,
        description: effect.switchWithDefender
          ? `Elige el Pokémon de la Banca de tu rival que pasa a ser el Pokémon Defensor: recibe ${effect.amount ?? 0} de daño`
          : `Elige 1 de los Pokémon de tu rival: recibe ${effect.amount ?? 0} de daño`,
        options: targets.map(({ pokemon, where }) => pokemonChoice(pokemon, where)),
        maxSelections: 1,
        thumbnails: targets.map(({ pokemon }) => pokemon.pokemon),
        disableAutoSelect: true,
        chooser: "self",
      };
    }
    case AttackEffectType.MoveDefenderEnergyToBench: {
      const defender = defenderOf(state, context);
      if (!defender || state.opponentBench.length === 0) return null;
      if (!picked) {
        const basics = defender.attachedEnergy.filter((e) => isEnergyCard(e) && e.isBasic);
        if (basics.length === 0) return null;
        return {
          title,
          description: `Elige 1 Energía básica de ${defender.pokemon.name} para moverla a un Pokémon en la Banca de tu rival`,
          options: basics.map((e) => ({ id: e.id, label: energyLabel(e) })),
          maxSelections: 1,
          thumbnails: basics,
          chooser: "self",
        };
      }
      return {
        title,
        description: "Elige el Pokémon en la Banca de tu rival que recibe esa Energía",
        options: state.opponentBench.map((p) => pokemonChoice(p, "Banca rival")),
        maxSelections: 1,
        thumbnails: state.opponentBench.map((p) => p.pokemon),
        chooser: "self",
      };
    }
    case AttackEffectType.MoveAllEnergyToBench: {
      const attacker = attackerOf(state, context);
      const left = attacker ? energyToMove(attacker, effect, picked?.length ?? 0) : [];
      const next = left[0];
      if (!attacker || !next || state.playerBench.length === 0) return null;
      return {
        title,
        description: `¿A cuál de tus Pokémon en la Banca va ${energyLabel(next)}? (quedan ${left.length})`,
        options: state.playerBench.map((p) => pokemonChoice(p, "Banca")),
        maxSelections: 1,
        thumbnails: state.playerBench.map((p) => p.pokemon),
        chooser: "self",
      };
    }
    case AttackEffectType.DiscardEnergyToDraw: {
      const attacker = attackerOf(state, context);
      if (!attacker) return null;
      if (!picked) {
        const energies = attacker.attachedEnergy;
        if (energies.length === 0) return null;
        return {
          title,
          description: `Elige 1 carta de Energía de ${attacker.pokemon.name} para descartar y robar hasta ${effect.amount ?? 3} cartas`,
          options: energies.map((e) => ({ id: e.id, label: energyLabel(e) })),
          maxSelections: 1,
          thumbnails: energies,
          chooser: "self",
        };
      }
      const most = Math.min(effect.amount ?? 3, state.playerDeck.length);
      if (most === 0) return null;
      return {
        title,
        description: `¿Cuántas cartas robas? (hasta ${most})`,
        options: Array.from({ length: most + 1 }, (_, n) => ({ id: String(n), label: `${n} carta${n === 1 ? "" : "s"}` })),
        maxSelections: 1,
        disableAutoSelect: true,
        chooser: "self",
      };
    }
    case AttackEffectType.EvolveFromDeck: {
      const attacker = attackerOf(state, context);
      if (!attacker || getEvolutionBlocker(state)) return null;
      const cards = state.playerDeck.filter(
        (c) => isPokemonCard(c) && !!effect.searchPokemonNames?.includes(c.name) && c.evolvesFrom === attacker.pokemon.name
      );
      if (cards.length === 0) return null;
      return {
        title,
        description: `Elige la carta de Evolución de tu mazo que pones sobre ${attacker.pokemon.name}`,
        options: cards.map((c) => ({ id: c.id, label: c.name })),
        maxSelections: 1,
        cards,
        chooser: "self",
      };
    }
    case AttackEffectType.AttachEnergyFromDeck: {
      const attacker = attackerOf(state, context);
      const cards = state.playerDeck.filter((c) => isEnergyCard(c) && c.isBasic && c.energyType === effect.energyType);
      if (!attacker || cards.length === 0) return null;
      return {
        title,
        description: `Elige una carta de Energía ${getEnergyTypeInSpanish(effect.energyType ?? "")} de tu mazo para unirla a ${attacker.pokemon.name}`,
        options: cards.map((c) => ({ id: c.id, label: energyLabel(c) })),
        maxSelections: 1,
        cards,
        chooser: "self",
      };
    }
    case AttackEffectType.AttachEnergyFromDiscard: {
      const attacker = attackerOf(state, context);
      const cards = state.playerDiscard.filter((c) => isEnergyCard(c) && c.isBasic && c.energyType === effect.energyType);
      if (!attacker || cards.length === 0) return null;
      const max = Math.min(effect.amount ?? 1, cards.length);
      const typeName = getEnergyTypeInSpanish(effect.energyType ?? "");
      return {
        title,
        description: `Elige ${max === 1 ? "1 carta" : `hasta ${max} cartas`} de Energía ${typeName} de tu pila de descartes para unirlas a ${attacker.pokemon.name}`,
        options: cards.map((c) => ({ id: c.id, label: energyLabel(c) })),
        maxSelections: max,
        minSelections: Math.min(effect.minAmount ?? 0, max),
        cards,
        chooser: "self",
      };
    }
    case AttackEffectType.SearchDeckChoice: {
      if (effect.putBackFromHand && !picked) {
        const max = Math.min(effect.putBackFromHand, state.playerHand.length);
        if (max === 0) return null;
        return {
          title,
          description: `Elige hasta ${max} cartas de tu mano para ponerlas encima de tu mazo: después buscas en tu mazo esa misma cantidad de cartas`,
          options: state.playerHand.map((c) => ({ id: c.id, label: c.name })),
          maxSelections: max,
          minSelections: 0,
          source: "hand",
          disableAutoSelect: true,
          chooser: "self",
        };
      }
      const cards = searchableCards(state, effect);
      if (cards.length === 0) return null;
      const room = effect.destination === "bench" ? maxBenchSize(state, "player") - state.playerBench.length : Infinity;
      const wanted = picked ? picked.length : effect.amount ?? cards.length;
      const max = Math.min(wanted, cards.length, room);
      // After putting cards back, take that many (as many as there are)
      const min = picked ? max : Math.min(effect.minAmount ?? 0, max);
      return {
        title,
        description: effect.destination === "bench"
          ? `Elige ${max === 1 ? "1 Pokémon" : `hasta ${max} Pokémon`} de tu mazo para ponerlos en tu Banca`
          : `Elige ${min === max ? max : `hasta ${max}`} carta${max === 1 ? "" : "s"} de tu mazo para tu mano`,
        options: cards.map((c) => ({ id: c.id, label: isEnergyCard(c) ? energyLabel(c) : c.name })),
        maxSelections: max,
        minSelections: min,
        cards,
        chooser: "self",
      };
    }
    case AttackEffectType.ReturnPokemonToHand: {
      // The most damaged Benched Pokémon first; the Active last, and only with a Bench (else the game is lost)
      const bench = [...state.playerBench].sort((a, b) => (b.currentDamage ?? 0) - (a.currentDamage ?? 0));
      const active = state.playerActivePokemon && bench.length > 0 ? [state.playerActivePokemon] : [];
      const choices = [...bench.map((p) => pokemonChoice(p, "Banca")), ...active.map((p) => pokemonChoice(p, "Activo"))];
      if (choices.length === 0) return null;
      return {
        title,
        description: "Puedes devolver a tu mano cualquier cantidad de tus Pokémon en juego y todas las cartas unidas a ellos",
        options: choices,
        maxSelections: choices.length,
        minSelections: 0,
        thumbnails: [...bench, ...active].map((p) => p.pokemon),
        disableAutoSelect: true,
        chooser: "self",
      };
    }
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
        answererDescription: `Tu rival usó ${context.attackName}: elige el Pokémon de tu Banca que cambia por ${defender.pokemon.name}`,
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
        (e) => e.kind === CardKind.Energy && (!effect.energyType || energyProvidesType(e, effect.energyType))
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
  // Perspective-free: the step itself (not its description) goes to whoever answers
  const who = pending.step.chooser === "opponent" ? "el defensor debe elegir" : "el atacante debe elegir";
  return {
    ...state,
    pendingAttackChoice: pending,
    events: [...state.events, createGameEvent(`${context.attackName}: ${who}`, "info")],
  };
}

/** Apply one answer. Returns the new state and, for multi-step effects, the follow-up question. */
function applyChoice(state: GameState, pending: PendingAttackChoice, selection: string[]): { state: GameState; next?: PendingAttackChoice } {
  const { effect, context } = pending;
  const name = context.attackName;
  const log = (s: GameState, message: string): GameState => ({ ...s, events: [...s.events, createGameEvent(message, "action")] });
  /** Same effect, a follow-up step after `picked` (null when there's nothing left to ask). */
  const followUp = (s: GameState, picked: string[]): PendingAttackChoice | undefined => {
    const step = stepFor(s, effect, context, undefined, picked);
    return step ? { ...pending, picked, step } : undefined;
  };

  switch (effect.type) {
    case AttackEffectType.SelfSwitch: {
      if (selection.length === 0) return { state: log(state, `${name}: no se cambió`) };
      const oldActive = state.playerActivePokemon!;
      const index = state.playerBench.findIndex((p) => p.pokemon.id === selection[0]);
      const incoming = state.playerBench[index];
      const toBench: PokemonInPlay = { ...clearStatusConditionsOnRetreat(oldActive), modifiedWeakness: undefined, modifiedResistance: undefined };
      const next: GameState = { ...state, playerActivePokemon: incoming, playerBench: [...state.playerBench.filter((_, i) => i !== index), toBench] };
      return { state: log(next, `${name}: ${oldActive.pokemon.name} se cambió con ${incoming.pokemon.name}`) };
    }
    case AttackEffectType.ChooseTargetDamage: {
      if (effect.optionalEnergyDiscard && !pending.picked) {
        if (selection.length === 0) return { state: log(state, `${name}: no se descartó Energía`) };
        const attacker = state.playerActivePokemon!;
        const discarded = attacker.attachedEnergy.filter((e) => selection.includes(e.id));
        const next = log(
          {
            ...state,
            playerActivePokemon: { ...attacker, attachedEnergy: attacker.attachedEnergy.filter((e) => !selection.includes(e.id)) },
            playerDiscard: [...state.playerDiscard, ...discarded],
          },
          `${name}: descartó ${discarded.map(energyLabel).join(", ")}`
        );
        return { state: next, next: followUp(next, selection) };
      }
      let next = state;
      if (effect.switchWithDefender) {
        const oldActive = state.opponentActivePokemon!;
        const index = state.opponentBench.findIndex((p) => p.pokemon.id === selection[0]);
        const incoming = state.opponentBench[index];
        const toBench: PokemonInPlay = { ...clearStatusConditionsOnRetreat(oldActive), modifiedWeakness: undefined, modifiedResistance: undefined };
        next = log(
          { ...state, opponentActivePokemon: incoming, opponentBench: [...state.opponentBench.filter((_, i) => i !== index), toBench] },
          `${name}: ${incoming.pokemon.name} pasa a ser el Pokémon activo del rival`
        );
      }
      return { state: dealChosenTargetDamage(next, selection[0], effect, context) };
    }
    case AttackEffectType.MoveDefenderEnergyToBench: {
      if (!pending.picked) return { state, next: followUp(state, selection) };
      const defender = state.opponentActivePokemon!;
      const energy = defender.attachedEnergy.find((e) => e.id === pending.picked![0])!;
      const next: GameState = {
        ...state,
        opponentActivePokemon: { ...defender, attachedEnergy: defender.attachedEnergy.filter((e) => e.id !== energy.id) },
        opponentBench: state.opponentBench.map((p) => (p.pokemon.id === selection[0] ? { ...p, attachedEnergy: [...p.attachedEnergy, energy] } : p)),
      };
      const receiver = state.opponentBench.find((p) => p.pokemon.id === selection[0])!;
      return { state: log(next, `${name}: ${energyLabel(energy)} pasó de ${defender.pokemon.name} a ${receiver.pokemon.name}`) };
    }
    case AttackEffectType.MoveAllEnergyToBench: {
      const attacker = state.playerActivePokemon!;
      const energy = energyToMove(attacker, effect, pending.picked?.length ?? 0)[0];
      const moved = [...(pending.picked ?? []), energy.id];
      const receiver = state.playerBench.find((p) => p.pokemon.id === selection[0])!;
      const next = log(
        {
          ...state,
          playerActivePokemon: { ...attacker, attachedEnergy: attacker.attachedEnergy.filter((e) => e.id !== energy.id) },
          playerBench: state.playerBench.map((p) => (p.pokemon.id === receiver.pokemon.id ? { ...p, attachedEnergy: [...p.attachedEnergy, energy] } : p)),
        },
        `${name}: ${energyLabel(energy)} pasó a ${receiver.pokemon.name}`
      );
      const step = stepFor(next, effect, context, undefined, moved);
      return { state: next, next: step ? { ...pending, step, picked: moved } : undefined };
    }
    case AttackEffectType.DiscardEnergyToDraw: {
      if (!pending.picked) {
        const attacker = state.playerActivePokemon!;
        const discarded = attacker.attachedEnergy.filter((e) => selection.includes(e.id));
        const next = log(
          {
            ...state,
            playerActivePokemon: { ...attacker, attachedEnergy: attacker.attachedEnergy.filter((e) => !selection.includes(e.id)) },
            playerDiscard: [...state.playerDiscard, ...discarded],
          },
          `${name}: descartó ${discarded.map(energyLabel).join(", ")}`
        );
        return { state: next, next: followUp(next, selection) };
      }
      let deck = state.playerDeck;
      let hand = state.playerHand;
      const count = Number(selection[0]);
      for (let i = 0; i < count; i++) {
        const drawn = drawCard(deck, hand);
        if (!drawn.success) break;
        deck = drawn.newDeck;
        hand = drawn.newHand;
      }
      return { state: log({ ...state, playerDeck: deck, playerHand: hand }, `${name}: robó ${count} carta${count === 1 ? "" : "s"}`) };
    }
    case AttackEffectType.EvolveFromDeck: {
      const attacker = state.playerActivePokemon!;
      const card = state.playerDeck.find((c) => c.id === selection[0])!;
      const evolved = evolvePokemonInPlay(attacker, card, state.turnNumber);
      const next: GameState = {
        ...state,
        playerActivePokemon: evolved,
        playerDeck: shuffle(state.playerDeck.filter((c) => c.id !== card.id)),
      };
      return { state: log(next, `${name}: ${attacker.pokemon.name} evolucionó a ${card.name}. Se mezcló el mazo`) };
    }
    case AttackEffectType.AttachEnergyFromDeck: {
      const attacker = state.playerActivePokemon!;
      const card = state.playerDeck.find((c) => c.id === selection[0])!;
      const next: GameState = {
        ...state,
        playerActivePokemon: { ...attacker, attachedEnergy: [...attacker.attachedEnergy, card] },
        playerDeck: shuffle(state.playerDeck.filter((c) => c.id !== card.id)),
      };
      return { state: log(next, `${name}: unió ${energyLabel(card)} a ${attacker.pokemon.name}. Se mezcló el mazo`) };
    }
    case AttackEffectType.SearchDeckChoice: {
      if (effect.putBackFromHand && !pending.picked) {
        const back = selection.map((id) => state.playerHand.find((c) => c.id === id)!);
        const next: GameState = {
          ...state,
          playerHand: state.playerHand.filter((c) => !selection.includes(c.id)),
          playerDeck: [...back, ...state.playerDeck],
        };
        if (selection.length === 0) return { state: log(next, `${name}: no se puso ninguna carta encima del mazo`) };
        const after = log(next, `${name}: ${selection.length} carta${selection.length === 1 ? "" : "s"} de la mano encima del mazo`);
        const follow = followUp(after, selection);
        return follow ? { state: after, next: follow } : { state: log({ ...after, playerDeck: shuffle(after.playerDeck) }, `${name}: no se encontró nada. Se mezcló el mazo`) };
      }
      const found = selection.map((id) => state.playerDeck.find((c) => c.id === id)!);
      const deck = shuffle(state.playerDeck.filter((c) => !selection.includes(c.id)));
      const toBench = effect.destination === "bench";
      const next: GameState = {
        ...state,
        playerDeck: deck,
        ...(toBench
          ? {
              playerBench: [
                ...state.playerBench,
                ...found.map((card): PokemonInPlay => ({
                  pokemon: card,
                  attachedEnergy: [],
                  attachedTrainers: [],
                  previousEvolutions: [],
                  statusConditions: [],
                  currentDamage: 0,
                  playedOnTurn: state.turnNumber,
                })),
              ],
            }
          : { playerHand: [...state.playerHand, ...found] }),
      };
      const what = found.map((c) => (isEnergyCard(c) ? energyLabel(c) : c.name)).join(", ");
      return {
        state: log(
          next,
          found.length === 0
            ? `${name}: no se tomó ninguna carta. Se mezcló el mazo`
            : `${name}: ${what} ${toBench ? "a la Banca" : "a la mano"}. Se mezcló el mazo`
        ),
      };
    }
    case AttackEffectType.ReturnPokemonToHand: {
      if (selection.length === 0) return { state: log(state, `${name}: no se devolvió ningún Pokémon`) };
      const active = state.playerActivePokemon;
      const returned = [...(active ? [active] : []), ...state.playerBench].filter((p) => selection.includes(p.pokemon.id));
      const activeReturned = !!active && selection.includes(active.pokemon.id);
      const bench = state.playerBench.filter((p) => !selection.includes(p.pokemon.id));
      let next: GameState = log(
        {
          ...state,
          playerActivePokemon: activeReturned ? null : active,
          playerBench: bench,
          playerHand: [...state.playerHand, ...returned.flatMap((p) => cardsLeavingPlay(p))],
        },
        `${name}: ${returned.map((p) => p.pokemon.name).join(", ")} ${returned.length === 1 ? "volvió" : "volvieron"} a la mano con todas sus cartas`
      );
      if (activeReturned && bench.length > 0) {
        next = { ...next, playerNeedsToPromote: true, events: [...next.events, createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")] };
      } else if (activeReturned) {
        next = { ...next, gameResult: "defeat", gamePhase: GamePhase.GameOver };
      }
      return { state: next };
    }
    case AttackEffectType.AttachEnergyFromDiscard: {
      if (selection.length === 0) return { state: log(state, `${name}: no se unió ninguna Energía`) };
      const attacker = state.playerActivePokemon!;
      const taken = state.playerDiscard.filter((c) => selection.includes(c.id));
      const next: GameState = {
        ...state,
        playerActivePokemon: { ...attacker, attachedEnergy: [...attacker.attachedEnergy, ...taken] },
        playerDiscard: state.playerDiscard.filter((c) => !selection.includes(c.id)),
      };
      return { state: log(next, `${name}: unió ${taken.map(energyLabel).join(", ")} de la pila de descartes a ${attacker.pokemon.name}`) };
    }
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
      return { state: log(next, `${name}: ${incoming.pokemon.name} pasa a ser el Pokémon activo`) };
    }
    case AttackEffectType.ReorderDeckTop: {
      if (!pending.deck) {
        const deck = selection[0] as "player" | "opponent";
        const step = stepFor(state, effect, context, deck);
        const chosen = log(state, `${name}: mira las cartas superiores del mazo del ${deck === "player" ? "atacante" : "defensor"}`);
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
            : `${name}: descartó ${discarded.length} Energía(s) y ${milled.length} carta(s) del mazo del defensor`
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
 * Attack damage done to the opponent's Pokémon `targetId` by a choice (ChooseTargetDamage):
 * Weakness/Resistance only with `applyWeaknessResistance`; PlusPower, Defender and Minimize
 * only on the Active; Kabuto Armor; protection and Invisible Wall; Transparency / Agility on
 * the original Defending Pokémon stop it (and Stare's power stop). Then Strikes Back, Mirror
 * Shell, Destiny Bond and Final Beam on the attacker, and Knock Outs (Prizes taken at once).
 */
export function dealChosenTargetDamage(state: GameState, targetId: string, effect: AttackEffect, context: AttackChoiceContext): GameState {
  const attacker = attackerOf(state, context);
  const isActive = state.opponentActivePokemon?.pokemon.id === targetId;
  const target = isActive ? state.opponentActivePokemon! : state.opponentBench.find((p) => p.pokemon.id === targetId);
  if (!attacker || !target) return state;
  const name = context.attackName;
  const events = [...state.events];
  const isOriginalDefender = targetId === context.defenderId;
  if (isOriginalDefender && (context.defenderBlocksEffects || context.defenderKnockedOut)) {
    events.push(createGameEvent(`${name}: ${target.pokemon.name} evitó todos los efectos del ataque`, "action"));
    return { ...state, events };
  }

  const attackerCard = getEffectivePokemonCard(state, attacker);
  const targetCard = getEffectivePokemonCard(state, target);
  let damage = effect.amount ?? 0;
  if (effect.applyWeaknessResistance && attackerCard && targetCard) {
    const type = attacker.shiftedType ?? attackerCard.types[0];
    const weaknesses = target.modifiedWeakness ? [target.modifiedWeakness] : targetCard.weaknesses ?? [];
    const resistances = target.modifiedResistance ? [target.modifiedResistance] : targetCard.resistances ?? [];
    if (type && weaknesses.includes(type)) damage *= 2;
    if (type && resistances.includes(type) && !stadiumIgnoresResistance(state, attacker)) damage = Math.max(0, damage - 30);
  }
  let consumedReduction = false;
  if (isActive) {
    const plusPower = state.activeModifiers.filter((m) => m.source === "plusPower" && m.playerId === "player" && modifierAppliesTo(m, attacker)).reduce((sum, m) => sum + m.amount, 0);
    if (damage > 0) damage += plusPower;
  }
  const defenderReduction = state.activeModifiers
    .filter((m) => m.source === "defender" && modifierAppliesTo(m, target))
    .reduce((sum, m) => sum + Math.abs(m.amount), 0);
  damage = Math.max(0, damage - defenderReduction);
  if (isActive && target.nextTurnDamageReduction && damage > 0) {
    damage = Math.max(0, damage - target.nextTurnDamageReduction);
    consumedReduction = true;
  }
  damage = applyDamageHalving(target, damage, state);
  if ((isActive && protectionBlocksDamage(target, damage) && damage > 0) || isDamageBlocked(target, damage, state)) {
    events.push(createGameEvent(`${name}: el daño a ${target.pokemon.name} fue prevenido`, "action"));
    damage = 0;
  }
  // Shadow Images (the coin was flipped for the original Defending Pokémon)
  if (isOriginalDefender && target.evadeOnFlip && context.evadeCoin) {
    events.push(createGameEvent(`${target.evadeOnFlip.attackName} de ${target.pokemon.name} - Moneda: [coin:${context.evadeCoin}]`, "info"));
    if (context.evadeCoin === "tails" && damage > 0) {
      events.push(createGameEvent(`${name}: ${target.pokemon.name} no recibió daño (${target.evadeOnFlip.attackName})`, "action"));
      damage = 0;
    }
  }

  const blockedEffects = isActive && target.protection?.type === "damageAndEffects";
  let hit: PokemonInPlay = {
    ...target,
    currentDamage: (target.currentDamage ?? 0) + damage,
    ...(isActive && damage > 0 && { lastDamageReceived: damage }),
    ...(consumedReduction && { nextTurnDamageReduction: undefined }),
    ...(damage > 0 && { evadeOnFlip: undefined }),
  };
  if (damage > 0) events.push(createGameEvent(`${name}: ${target.pokemon.name} recibió ${damage} de daño`, "action"));
  const knockedOut = (hit.currentDamage ?? 0) >= getEffectiveHp(state, hit);

  // Stare: the chosen Pokémon's power stops until the end of the opponent's next turn
  let powersSuppressed = state.powersSuppressed;
  if (effect.suppressTargetPower && !blockedEffects && !knockedOut && isPokemonCard(target.pokemon) && target.pokemon.power) {
    powersSuppressed = [...(powersSuppressed ?? []), { source: name, pokemonId: targetId, expiresAfterTurn: state.turnNumber + 1 }];
    events.push(createGameEvent(`${name}: ${target.pokemon.power.name} de ${target.pokemon.name} deja de funcionar hasta el final del siguiente turno`, "action"));
  }
  if (!knockedOut) hit = { ...hit };

  // Reactions of the damaged Pokémon on the attacker
  let retaliation = 0;
  if (damage > 0) {
    const reaction = getDamageReaction(target, isActive, state);
    if (reaction) {
      retaliation += reaction.reactionDamage;
      events.push(createGameEvent(`¡${reaction.powerName}! ${target.pokemon.name} contraataca con ${reaction.reactionDamage} de daño`, "action"));
    }
    if (isActive && target.mirrorShellOnTurn === state.turnNumber - 1) {
      retaliation += damage;
      events.push(createGameEvent(`¡Caparazón Espejo! ${target.pokemon.name} le devuelve ${damage} de daño a ${attacker.pokemon.name}`, "action"));
    }
    // Crosscounter / Fire Wall (its coin is the attack's defender coin, for the original Defending Pokémon)
    const counter = isActive ? activeCounterAttack(state, target) : undefined;
    if (counter) {
      const coin = isOriginalDefender ? context.counterAttackCoin : undefined;
      if (counter.retaliationCoin && coin) events.push(createGameEvent(`${counter.attackName} de ${target.pokemon.name} - Moneda: [coin:${coin}]`, "info"));
      const back = counterAttackDamage(state, target, damage, attacker, coin);
      retaliation += back;
      if (back > 0) events.push(createGameEvent(`¡${counter.attackName}! ${target.pokemon.name} le hizo ${back} de daño a ${attacker.pokemon.name}`, "action"));
    }
    if (knockedOut && isOriginalDefender && context.finalBeamCoin && getKnockOutRetaliation(state, target)) {
      const powerName = isPokemonCard(target.pokemon) ? target.pokemon.power?.name ?? "Rayo Final" : "Rayo Final";
      events.push(createGameEvent(`${powerName} de ${target.pokemon.name} - Moneda: [coin:${context.finalBeamCoin}]`, "info"));
      if (context.finalBeamCoin === "heads") {
        const beam = knockOutRetaliationDamage(state, target, attacker);
        retaliation += beam;
        if (beam > 0) events.push(createGameEvent(`¡${powerName}! ${target.pokemon.name} le hizo ${beam} de daño a ${attacker.pokemon.name}`, "action"));
      }
    }
  }
  const destinyBond = knockedOut && damage > 0 && isActive && !!target.destinyBondActive;

  let next: GameState = {
    ...state,
    ...(isActive ? { opponentActivePokemon: hit } : { opponentBench: state.opponentBench.map((p) => (p.pokemon.id === targetId ? hit : p)) }),
    playerActivePokemon: retaliation > 0 ? { ...attacker, currentDamage: (attacker.currentDamage ?? 0) + retaliation } : attacker,
    powersSuppressed,
    events,
  };
  next = checkKnockouts(next);
  if (destinyBond && next.gameResult === null && next.playerActivePokemon?.pokemon.id === attacker.pokemon.id) {
    next = knockOutPlayerActive(
      { ...next, events: [...next.events, createGameEvent(`¡Unión de Destino! ${target.pokemon.name} se lleva a ${attacker.pokemon.name} consigo`, "action")] },
      "El rival tomó un premio por Unión de Destino"
    );
  }
  return next;
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
