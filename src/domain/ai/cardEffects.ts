/**
 * AI heuristics for Trainer cards and activated Pokémon Powers.
 *
 * Everything here works on the AI's VIEW (AI = "player", see board `swapSides`) and only plans
 * what the engine allows right now (canPlayTrainerCard / canUsePokemonPower: Hay Fever,
 * Headache, Goop Gas...). Answers to the effects' steps are given when the action is executed
 * (`answerTrainerStepForAI` / `answerPowerStepForAI`), when the deck, the coins and the hand
 * are known.
 *
 * | Card / power | When |
 * |---|---|
 * | Bill | deck > 6 (hand change: played alone, the turn is planned again) |
 * | Energy Search | no Energy card in hand, none attached this turn (hand change) |
 * | The Boss's Way | the deck has a Dark evolution of a Pokémon in play, none in hand (hand change) |
 * | Gambler | at most 1 other card in hand, deck ≥ 10 (hand change) |
 * | Evolutionary Light (power) | the deck has an evolution of a Pokémon in play, none in hand (hand change) |
 * | Matter Exchange (power) | a card it can spare (`spareCard`), deck ≥ 5 (hand change) |
 * | Step In (power) | the Active can't attack and the Benched Dragonite can |
 * | Gather Fire (power) | Charmander is the Active and can't attack yet |
 * | Strange Behavior (power) | moves the Active's damage to a Benched Slowbro, leaving it ≥ 20 HP |
 * | Recycle | the discard pile has an Energy or a Pokémon card |
 * | Nightly Garbage Run | deck ≤ 8 |
 * | Mr. Fuji | a Benched Pokémon without Energy has lost half its HP (2+ Benched) |
 * | Imposter Oak's Revenge | the opponent holds 6+ cards and the AI can spare one |
 * | Rocket's Sneak Attack | the opponent holds 3+ cards |
 * | Goop Gas Attack | it will attack and an opposing Pokémon has a working passive power |
 * | Sleep! | the Defending Pokémon isn't Asleep / Paralyzed and can be affected |
 * | Challenge!, Digger, Here Comes Team Rocket! | never (`AI_NEVER_PLAYS`) |
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { canUseAttack, hasStatusCondition } from "@/lib/gameState";
import { isBasicEnergy, isEnergyCard, isPokemonCard, isTrainerCard, isTrainerInPlay } from "@/domain/cards";
import { EnergyType, PokemonStage, StatusCondition } from "@/domain/constants";
import {
  ACTIVATED_POWER_TYPES,
  canPlayTrainerCard,
  canUsePokemonPower,
  getTrainerSteps,
  type SelectionStep,
} from "@/domain/effects";
import { getEffectivePokemonCard, hasStatusImmunity, isPowerActive } from "@/domain/powers";
import { answerStepForAI } from "./pending";
import type { AIAction } from "./types";

/**
 * Trainers the AI never plays. Challenge!: its questions go to the human, and consumers only
 * relay a Trainer's opponent steps when the human plays it (no flow answers a Trainer step the
 * AI created). Digger: either Active may take the damage. Here Comes Team Rocket!: no gain.
 */
export const AI_NEVER_PLAYS: ReadonlySet<string> = new Set(["Challenge!", "Digger", "Here Comes Team Rocket!"]);

const MAX_BENCH = 5;

// ============================================================================
// Board reading (AI view)
// ============================================================================

function ownPokemon(view: GameState): PokemonInPlay[] {
  return [view.playerActivePokemon, ...view.playerBench].filter((p): p is PokemonInPlay => p != null);
}

function powerNameOf(pokemon: PokemonInPlay): string | undefined {
  return isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.power?.name : undefined;
}

/** An Evolution card that evolves from one of the AI's Pokémon in play. */
function evolvesFromInPlay(view: GameState, card: GameCard | undefined): boolean {
  if (!card || !isPokemonCard(card) || card.stage === PokemonStage.Basic || !card.evolvesFrom) return false;
  return ownPokemon(view).some((p) => p.pokemon.name === card.evolvesFrom);
}

/** Basic Energy types the AI's attacks ask for (Active first, then the Bench). */
function neededEnergyTypes(view: GameState): EnergyType[] {
  const types: EnergyType[] = [];
  for (const pokemon of ownPokemon(view)) {
    const card = getEffectivePokemonCard(view, pokemon);
    for (const attack of card?.attacks ?? []) {
      for (const type of attack.cost) if (type !== EnergyType.Colorless && !types.includes(type)) types.push(type);
    }
  }
  return types;
}

/** The Active can use one of its attacks right now. */
function activeCanAttack(view: GameState): boolean {
  const active = view.playerActivePokemon;
  if (!active || !view.opponentActivePokemon) return false;
  if (hasStatusCondition(active, StatusCondition.Asleep) || hasStatusCondition(active, StatusCondition.Paralyzed)) return false;
  return canAttackWith(view, active);
}

function canAttackWith(view: GameState, pokemon: PokemonInPlay): boolean {
  const card = getEffectivePokemonCard(view, pokemon);
  return (card?.attacks ?? []).some((_, i) => canUseAttack(pokemon, i, view.opponentActivePokemon, view));
}

function remainingHp(pokemon: PokemonInPlay): number {
  return isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.hp - (pokemon.currentDamage ?? 0) : 0;
}

/**
 * A card of the AI's hand it can spare (Matter Exchange, Imposter Oak's Revenge): a Trainer it
 * never plays, a third Energy card, or a Basic Pokémon nothing evolves from when the Bench is full.
 */
export function spareCard(view: GameState, exceptId?: string): GameCard | undefined {
  const hand = view.playerHand.filter((c) => c.id !== exceptId);
  const never = hand.find((c) => isTrainerCard(c) && AI_NEVER_PLAYS.has(c.name));
  if (never) return never;
  const energies = hand.filter(isEnergyCard);
  if (energies.length >= 3) return energies[energies.length - 1];
  if (view.playerBench.length >= MAX_BENCH) {
    return hand.find(
      (c) => isPokemonCard(c) && c.stage === PokemonStage.Basic && !hand.some((e) => isPokemonCard(e) && e.evolvesFrom === c.name)
    );
  }
  return undefined;
}

/** The Benched Pokémon Mr. Fuji would save: no Energy, lost at least half its HP. */
function fujiTarget(view: GameState): PokemonInPlay | undefined {
  if (view.playerBench.length < 2) return undefined;
  return view.playerBench.find(
    (p) => !isTrainerInPlay(p.pokemon) && isPokemonCard(p.pokemon) && p.attachedEnergy.length === 0 && (p.currentDamage ?? 0) * 2 >= p.pokemon.hp
  );
}

// ============================================================================
// Planning
// ============================================================================

const playTrainer = (card: GameCard): AIAction => ({
  type: "playTrainer",
  cardId: card.id,
  trainerName: card.name,
  selections: [],
  answerAtPlay: true,
  delay: 800,
});

const usePower = (pokemon: PokemonInPlay): AIAction => ({
  type: "usePower",
  pokemonId: pokemon.pokemon.id,
  powerName: powerNameOf(pokemon) ?? "",
  delay: 800,
});

/** First card of the hand with that name the AI may play now. */
function playable(view: GameState, name: string): GameCard | undefined {
  return view.playerHand.find((c) => isTrainerCard(c) && c.name === name && canPlayTrainerCard(view, c.id) === null);
}

/** The AI's Pokémon with that power that may use it now. */
function withUsablePower(view: GameState, powerName: string): PokemonInPlay[] {
  return ownPokemon(view).filter((p) => powerNameOf(p) === powerName && canUsePokemonPower(view, p.pokemon.id) === null);
}

/**
 * A Trainer / power that changes the AI's hand, worth playing now (or null). The caller plays
 * it alone and plans the turn again once it resolved, with the new cards.
 */
export function planHandChange(view: GameState): AIAction | null {
  if (!view.playerActivePokemon) return null;
  const deck = view.playerDeck;
  const hand = view.playerHand;

  const bill = playable(view, "Bill");
  if (bill && deck.length > 6) return playTrainer(bill);

  const search = playable(view, "Energy Search");
  if (search && !view.energyAttachedThisTurn && !hand.some(isEnergyCard) && deck.length > 3 && deck.some(isBasicEnergy)) {
    return playTrainer(search);
  }

  const boss = playable(view, "The Boss's Way");
  if (boss && !hand.some((c) => evolvesFromInPlay(view, c))) {
    const step = getTrainerSteps(view, boss.id, []);
    if (step?.cards?.some((c) => evolvesFromInPlay(view, c))) return playTrainer(boss);
  }

  const gambler = playable(view, "Gambler");
  if (gambler && hand.length <= 2 && deck.length >= 10) return playTrainer(gambler);

  const [light] = withUsablePower(view, "Luz Evolutiva");
  if (light && !hand.some((c) => evolvesFromInPlay(view, c)) && deck.some((c) => evolvesFromInPlay(view, c))) return usePower(light);

  const [exchange] = withUsablePower(view, "Intercambio de Materia");
  if (exchange && deck.length >= 5 && spareCard(view)) return usePower(exchange);

  return null;
}

/** Step In: the Benched Dragonite takes the place of an Active that can't attack. */
export function planStepIn(view: GameState): AIAction | null {
  if (activeCanAttack(view) || !view.opponentActivePokemon) return null;
  const dragonite = withUsablePower(view, "Entrada").find((p) => canAttackWith(view, p));
  return dragonite ? usePower(dragonite) : null;
}

/** Gather Fire / Strange Behavior uses worth making now (in order). */
export function planSupportPowers(view: GameState): AIAction[] {
  const actions: AIAction[] = [];
  const active = view.playerActivePokemon;
  if (!active) return actions;

  // Gather Fire: only onto an Active that can't attack yet
  const gatherer = withUsablePower(view, "Reunir Fuego").find((p) => p.pokemon.id === active.pokemon.id);
  if (gatherer && !activeCanAttack(view)) actions.push(usePower(gatherer));

  // Strange Behavior: the Active's damage onto a Benched Slowbro that keeps ≥ 20 HP
  const slowbro = withUsablePower(view, "Comportamiento Extraño").find((p) => p.pokemon.id !== active.pokemon.id);
  if (slowbro && (active.currentDamage ?? 0) > 0) {
    const room = Math.max(0, Math.floor((remainingHp(slowbro) - 20) / 10));
    const moves = Math.min((active.currentDamage ?? 0) / 10, room);
    for (let i = 0; i < moves; i++) actions.push(usePower(slowbro));
  }
  return actions;
}

/** Opposing Pokémon with a working passive power (what Goop Gas Attack would stop). */
function opponentHasPassivePower(view: GameState): boolean {
  return [view.opponentActivePokemon, ...view.opponentBench].some(
    (p) => p != null && isPokemonCard(p.pokemon) && !!p.pokemon.power && !ACTIVATED_POWER_TYPES.includes(p.pokemon.power.type) && isPowerActive(view, p)
  );
}

/** Other Fossil / Team Rocket Trainers worth playing this turn, before attacking. */
export function planTrainers(view: GameState, options: { willAttack: boolean }): AIAction[] {
  const actions: AIAction[] = [];
  const add = (name: string, when: (card: GameCard) => boolean) => {
    const card = playable(view, name);
    if (card && when(card)) actions.push(playTrainer(card));
  };
  const defender = view.opponentActivePokemon;

  add("Recycle", () => view.playerDiscard.some((c) => isEnergyCard(c) || isPokemonCard(c)));
  add("Nightly Garbage Run", (card) => view.playerDeck.length <= 8 && getTrainerSteps(view, card.id, []) !== null);
  add("Mr. Fuji", () => fujiTarget(view) !== undefined);
  add("Imposter Oak's Revenge", (card) => view.opponentHand.length >= 6 && spareCard(view, card.id) !== undefined);
  add("Rocket's Sneak Attack", () => view.opponentHand.length >= 3);
  add("Goop Gas Attack", () => options.willAttack && opponentHasPassivePower(view));
  add(
    "Sleep!",
    () =>
      !!defender &&
      !isTrainerInPlay(defender.pokemon) &&
      !hasStatusCondition(defender, StatusCondition.Asleep) &&
      !hasStatusCondition(defender, StatusCondition.Paralyzed) &&
      !hasStatusImmunity(defender, view)
  );
  return actions;
}

// ============================================================================
// Answers (when the action is executed)
// ============================================================================

function cardById(view: GameState, id: string): GameCard | undefined {
  const piles = [view.playerHand, view.playerDeck, view.playerDiscard, view.opponentHand];
  for (const pile of piles) {
    const found = pile.find((c) => c.id === id);
    if (found) return found;
  }
  for (const pokemon of ownPokemon(view)) {
    if (pokemon.pokemon.id === id) return pokemon.pokemon;
    const energy = pokemon.attachedEnergy.find((e) => e.id === id);
    if (energy) return energy;
  }
  return undefined;
}

const enabledIds = (step: SelectionStep) => step.options.filter((o) => !o.disabled).map((o) => o.id);

/** First enabled option matching the first predicate that matches any (else the default answer). */
function prefer(view: GameState, step: SelectionStep, predicates: ((card: GameCard | undefined, id: string) => boolean)[]): string[] {
  if (step.maxSelections === 0) return [];
  const ids = enabledIds(step);
  for (const predicate of predicates) {
    const id = ids.find((option) => predicate(cardById(view, option), option));
    if (id !== undefined) return [id];
  }
  return answerStepForAI(step);
}

const isNeededEnergy = (view: GameState) => {
  const needed = neededEnergyTypes(view);
  return (card: GameCard | undefined) => !!card && isBasicEnergy(card) && needed.includes(card.energyType);
};

/** The AI's answer to step `selections.length` of the Trainer `cardId` (AI view). */
export function answerTrainerStepForAI(view: GameState, cardId: string, name: string, step: SelectionStep): string[] {
  switch (name) {
    case "Energy Search":
      return prefer(view, step, [isNeededEnergy(view)]);
    case "Recycle":
      return prefer(view, step, [
        (c) => evolvesFromInPlay(view, c),
        isNeededEnergy(view),
        (c) => !!c && isEnergyCard(c),
        (c) => !!c && isPokemonCard(c),
      ]);
    case "The Boss's Way":
      return prefer(view, step, [(c) => evolvesFromInPlay(view, c)]);
    case "Nightly Garbage Run":
      return enabledIds(step).slice(0, step.maxSelections);
    case "Imposter Oak's Revenge": {
      const spare = spareCard(view, cardId);
      return prefer(view, step, [(_c, id) => id === spare?.id]);
    }
    case "Mr. Fuji": {
      const target = fujiTarget(view);
      return prefer(view, step, [(_c, id) => id === target?.pokemon.id]);
    }
    default:
      return answerStepForAI(step);
  }
}

/** The AI's answer to a step of its power (AI view). */
export function answerPowerStepForAI(view: GameState, name: string, step: SelectionStep): string[] {
  switch (name) {
    case "Luz Evolutiva":
      return prefer(view, step, [(c) => evolvesFromInPlay(view, c)]);
    case "Intercambio de Materia": {
      const spare = spareCard(view);
      return prefer(view, step, [(_c, id) => id === spare?.id]);
    }
    case "Comportamiento Extraño":
      return prefer(view, step, [(_c, id) => id === view.playerActivePokemon?.pokemon.id]);
    case "Reunir Fuego": {
      // From the holder with the most Energy attached
      const holderSize = (energyId: string) => ownPokemon(view).find((p) => p.attachedEnergy.some((e) => e.id === energyId))?.attachedEnergy.length ?? 0;
      const ids = enabledIds(step).sort((a, b) => holderSize(b) - holderSize(a));
      return ids.length > 0 ? [ids[0]] : answerStepForAI(step);
    }
    default:
      return answerStepForAI(step);
  }
}

/** Every answer of a Trainer / power, step by step (guarded: effects ask a few questions). */
export function collectAnswers(getStep: (selections: string[][]) => SelectionStep | null, answer: (step: SelectionStep) => string[]): string[][] {
  const selections: string[][] = [];
  for (let guard = 0; guard < 10; guard++) {
    const step = getStep(selections);
    if (!step) return selections;
    selections.push(answer(step));
  }
  return selections;
}

