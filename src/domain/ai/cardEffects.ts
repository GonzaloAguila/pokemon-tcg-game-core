/**
 * AI heuristics for Trainer cards and activated Pokémon Powers.
 *
 * Everything here works on the AI's VIEW (AI = "player", see board `swapSides`) and only plans
 * what the engine allows right now (canPlayTrainerCard / canUsePokemonPower: Hay Fever,
 * Headache, Goop Gas...). Answers to the effects' steps are given when the action is executed
 * (`answerTrainerStepForAI` / `answerPowerStepForAI`), when the deck, the coins and the hand
 * are known (a search shows the deck). Before playing, "the deck has X" is judged on the deck +
 * Prizes (`unknownOwnCards`: the AI knows its list, not which cards are Prizes).
 * The smart AI (smart.ts) adds Computer Search, Poké Ball, Energy Retrieval, Professor Oak and
 * the Base Set Trainers it judges by evaluation; their answers are here too (spare the cards of
 * least value, `handCardValue`; search what `wantedFromDeck` lists).
 *
 * | Card / power | When |
 * |---|---|
 * | Bill | deck > 6; with `saveDeck` (smart AI) only when 2 more draws can't lose the deck-out race (hand change: played alone, the turn is planned again) |
 * | Energy Search | no Energy card in hand, none attached this turn (hand change) |
 * | The Boss's Way | the deck has a Dark evolution of a Pokémon in play, none in hand (hand change) |
 * | Gambler | at most 1 other card in hand, deck ≥ 10 (hand change) |
 * | Evolutionary Light (power) | the deck has an evolution of a Pokémon in play, none in hand (hand change) |
 * | Matter Exchange (power) | a card it can spare (`spareCard`), deck ≥ 5 (hand change) |
 * | Step In (power) | the Active can't attack and the Benched Dragonite can |
 * | Gather Fire (power) | Charmander is the Active and can't attack yet |
 * | Strange Behavior (power) | moves the Active's damage to a Benched Slowbro, leaving it ≥ 20 HP |
 * | Energy Charge (power) | Lt. Surge's Magneton is the Active and can't attack yet (one Lightning Energy card per use, from the Pokémon with the most Energy) |
 * | Natural Healing (power) | Blaine's Vulpix has damage counters |
 * | Recycle | the discard pile has an Energy or a Pokémon card |
 * | Nightly Garbage Run | deck ≤ 8 |
 * | Mr. Fuji | a Benched Pokémon without Energy has lost half its HP (2+ Benched) |
 * | Imposter Oak's Revenge | the opponent holds 6+ cards and the AI can spare one |
 * | Rocket's Sneak Attack | the opponent holds 3+ cards |
 * | Goop Gas Attack | it will attack and an opposing Pokémon has a working passive power |
 * | Sleep! | the Defending Pokémon isn't Asleep / Paralyzed and can be affected |
 * | Challenge!, Digger, Here Comes Team Rocket! | never (`AI_NEVER_PLAYS`) |
 * | Blaine's Last Resort (GH) | its hand holds nothing else, deck > 7 and 5 draws can't lose the deck-out race (hand change) |
 * | Misty's Wrath (GH) | hand of 4 or fewer, deck ≥ 15 (hand change) |
 * | Brock's Training Method, Erika's Maids (GH) | the deck has that owner's Pokémon that evolves one in play or a Basic with room on the Bench (Maids: 2 cards it can spare) (hand change) |
 * | Good Manners (GH) | no Basic in hand, room on the Bench, the deck has a Basic (hand change) |
 * | Secret Mission (GH) | a card it can spare (value ≤ 15) and deck > 6: discards those, draws as many (hand change) |
 * | Blaine's Gamble (GH) | 2+ cards of little value (≤ 12) and deck ≥ 10: discards those (hand change) |
 * | Sabrina's Gaze (GH) | the opponent holds 6+ cards and the AI's other cards are of little value (hand change) |
 * | Energy Flow (GH) | an Active that can't attack and is about to be Knocked Out (≤ 20 HP left) with 2+ Energy cards and a Bench: its Energy cards back to the hand (hand change) |
 * | Brock (GH) | 2+ damaged Pokémon, or a damaged Active with ≤ 30 HP left |
 * | The Rocket's Trap (GH) | the opponent holds 4+ cards |
 * | Misty (GH) | it will attack with an Active with Misty in its name and can spare 2 cards (value ≤ 25) |
 * | Erika's Perfume (GH) | the opponent holds 3+ cards and has room on the Bench: its Basics with ≤ 50 HP go there (easy Prizes) |
 * | Lt. Surge (GH) | the Active can't attack and is Asleep / Confused / Paralyzed or has ≤ 20 HP left: the Basic in hand with the most HP takes its place (played alone, before benching) |
 * | Trash Exchange (GH) | the discard pile holds more useful cards (needed Energy, evolutions of Pokémon in play) than the deck, proportionally |
 * | Minion of Team Rocket (GH) | last action of a turn without an attack (a tails ends the turn): the opponent has an evolved Benched Pokémon or one with 2+ Energy |
 * | Celadon City Gym (Stadium action) | its Active is Asleep / Confused / Paralyzed and keeps an attack it can pay after discarding the Energy card |
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { canUseAttack, energyProvidesType, getEnergyValue, hasStatusCondition } from "@/lib/gameState";
import { isBenchFull } from "@/domain/board";
import { isBasicEnergy, isEnergyCard, isPokemonCard, isTrainerCard, isTrainerInPlay } from "@/domain/cards";
import { hasOwner, type PokemonOwner } from "@/domain/cards/owner";
import { EnergyType, PokemonStage, StatusCondition } from "@/domain/constants";
import {
  ACTIVATED_POWER_TYPES,
  canPlayTrainerCard,
  canUsePokemonPower,
  canUseStadiumAction,
  getStadiumActionSteps,
  getTrainerSteps,
  type SelectionStep,
} from "@/domain/effects";
import { getEffectivePokemonCard, hasStatusImmunity, isPowerActive } from "@/domain/powers";
import { minSelectionsOf } from "@/domain/effects/validate";
import { answerStepForAI } from "./pending";
import { unknownOwnCards } from "./knowledge";
import type { AIAction } from "./types";

/**
 * Trainers the AI never plays. Challenge!: its questions go to the human, and consumers only
 * relay a Trainer's opponent steps when the human plays it (no flow answers a Trainer step the
 * AI created). Digger: either Active may take the damage. Here Comes Team Rocket!: no gain.
 */
export const AI_NEVER_PLAYS: ReadonlySet<string> = new Set(["Challenge!", "Digger", "Here Comes Team Rocket!"]);


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
  if (isBenchFull(view, "player")) {
    return hand.find(
      (c) => isPokemonCard(c) && c.stage === PokemonStage.Basic && !hand.some((e) => isPokemonCard(e) && e.evolvesFrom === c.name)
    );
  }
  return undefined;
}

/** Drawing `count` extra cards now doesn't risk losing the deck-out race (public deck counts). */
export function canAffordDraws(view: GameState, count: number): boolean {
  const left = view.playerDeck.length - count;
  return left >= 20 || left > view.opponentDeck.length + 4;
}

/** How much the AI wants to keep a card of its hand (low = can be discarded). */
export function handCardValue(view: GameState, card: GameCard): number {
  const hand = view.playerHand;
  if (isTrainerCard(card)) {
    if (AI_NEVER_PLAYS.has(card.name)) return 0;
    return ["Computer Search", "Gust of Wind", "Professor Oak", "Pokémon Breeder", "Super Potion", "Switch"].includes(card.name) ? 40 : 25;
  }
  if (isEnergyCard(card)) {
    const energies = hand.filter(isEnergyCard).length;
    const needed = neededEnergyTypes(view);
    const useful = !isBasicEnergy(card) || needed.length === 0 || needed.includes(card.energyType);
    return useful ? (energies >= 3 ? 20 : 50) : 12;
  }
  if (isPokemonCard(card)) {
    if (card.stage === PokemonStage.Basic) return isBenchFull(view, "player") ? 8 : 38;
    if (evolvesFromInPlay(view, card)) return 90;
    // An evolution of something still in the hand / deck
    const lower = card.evolvesFrom;
    return hand.some((c) => c.name === lower) ? 45 : 15;
  }
  return 20;
}

/** `count` cards the AI can spare (lowest value first), or null when it would hurt. */
export function spareHandCards(view: GameState, exceptId: string, count: number, maxValue = 35): GameCard[] | null {
  const hand = view.playerHand.filter((c) => c.id !== exceptId);
  if (hand.length < count) return null;
  const chosen = [...hand].sort((a, b) => handCardValue(view, a) - handCardValue(view, b)).slice(0, count);
  return chosen.every((c) => handCardValue(view, c) <= maxValue) ? chosen : null;
}

/** What the AI would like to find in its deck now (Computer Search, Poké Ball), best first. */
export function wantedFromDeck(view: GameState): ((card: GameCard | undefined) => boolean)[] {
  const wants: ((card: GameCard | undefined) => boolean)[] = [];
  const hand = view.playerHand;
  const isBasic = (c: GameCard | undefined) => !!c && isPokemonCard(c) && c.stage === PokemonStage.Basic;
  if (view.playerBench.length === 0 && !hand.some(isBasic)) wants.push(isBasic);
  if (!view.energyAttachedThisTurn && !hand.some(isEnergyCard)) wants.push(isNeededEnergy(view));
  if (!hand.some((c) => evolvesFromInPlay(view, c))) wants.push((c) => evolvesFromInPlay(view, c));
  if (view.playerBench.length < 3 && !hand.some(isBasic)) wants.push(isBasic);
  return wants;
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
export function planHandChange(view: GameState, options: { saveDeck?: boolean } = {}): AIAction | null {
  if (!view.playerActivePokemon) return null;
  const deck = view.playerDeck;
  const hand = view.playerHand;

  // saveDeck (smart AI): in a long game don't draw toward a deck-out the other side won't suffer first
  const bill = playable(view, "Bill");
  if (bill && deck.length > 6 && (!options.saveDeck || canAffordDraws(view, 2))) return playTrainer(bill);

  // What may still be in the deck: deck + Prizes (the AI knows its list, not where each card is)
  const pool = unknownOwnCards(view);

  const search = playable(view, "Energy Search");
  if (search && !view.energyAttachedThisTurn && !hand.some(isEnergyCard) && deck.length > 3 && pool.some(isBasicEnergy)) {
    return playTrainer(search);
  }

  const boss = playable(view, "The Boss's Way");
  if (boss && !hand.some((c) => evolvesFromInPlay(view, c))) {
    const darkEvolution = pool.some((c) => isPokemonCard(c) && c.name.startsWith("Dark ") && evolvesFromInPlay(view, c));
    if (darkEvolution) return playTrainer(boss);
  }

  const gambler = playable(view, "Gambler");
  if (gambler && hand.length <= 2 && deck.length >= 10) return playTrainer(gambler);

  const [light] = withUsablePower(view, "Luz Evolutiva");
  if (light && !hand.some((c) => evolvesFromInPlay(view, c)) && pool.some((c) => evolvesFromInPlay(view, c))) return usePower(light);

  const [exchange] = withUsablePower(view, "Intercambio de Materia");
  if (exchange && deck.length >= 5 && spareCard(view)) return usePower(exchange);

  return planGymHeroesHandChange(view, options);
}

// ---------------------------------------------------------------------------- Gym Heroes

/** A Pokémon card of `owner` worth searching: it evolves one in play, or a Basic with room on the Bench. */
function wantedOwnersPokemon(view: GameState, owner: PokemonOwner) {
  return (c: GameCard | undefined) =>
    !!c && isPokemonCard(c) && hasOwner(c, owner) &&
    (evolvesFromInPlay(view, c) || (c.stage === PokemonStage.Basic && !isBenchFull(view, "player")));
}

/** Cards of the hand the AI gives away for free (Secret Mission, Blaine's Gamble): value ≤ maxValue. */
function lowValueCards(view: GameState, exceptId: string, maxValue: number): GameCard[] {
  return view.playerHand.filter((c) => c.id !== exceptId && handCardValue(view, c) <= maxValue);
}

/** Its Active can't attack and will be Knocked Out soon: Energy Flow saves its Energy cards. */
function activeAboutToFall(view: GameState): boolean {
  const active = view.playerActivePokemon;
  if (!active || view.playerBench.length === 0 || activeCanAttack(view)) return false;
  const energyCards = active.attachedEnergy.filter((e) => isEnergyCard(e) || !!e.buzzapEnergyType);
  return energyCards.length >= 2 && remainingHp(active) <= 20;
}

/** Gym Heroes Trainers that change the AI's hand (played alone, the turn is planned again). */
function planGymHeroesHandChange(view: GameState, options: { saveDeck?: boolean }): AIAction | null {
  const deck = view.playerDeck;
  const hand = view.playerHand;
  const pool = unknownOwnCards(view);
  const affords = (count: number) => !options.saveDeck || canAffordDraws(view, count);

  const lastResort = playable(view, "Blaine's Last Resort");
  if (lastResort && deck.length > 7 && affords(5)) return playTrainer(lastResort);

  const wrath = playable(view, "Misty's Wrath");
  if (wrath && hand.length <= 4 && deck.length >= 15 && affords(7)) return playTrainer(wrath);

  const method = playable(view, "Brock's Training Method");
  if (method && deck.length > 3 && pool.some(wantedOwnersPokemon(view, "Brock")) && !hand.some(wantedOwnersPokemon(view, "Brock"))) {
    return playTrainer(method);
  }

  const maids = playable(view, "Erika's Maids");
  if (maids && pool.some(wantedOwnersPokemon(view, "Erika")) && spareHandCards(view, maids.id, 2)) return playTrainer(maids);

  const manners = playable(view, "Good Manners");
  if (manners && deck.length > 3 && !isBenchFull(view, "player") && pool.some((c) => isPokemonCard(c) && c.stage === PokemonStage.Basic)) {
    return playTrainer(manners);
  }

  const mission = playable(view, "Secret Mission");
  if (mission && deck.length > 6 && lowValueCards(view, mission.id, 15).length > 0) return playTrainer(mission);

  const gamble = playable(view, "Blaine's Gamble");
  if (gamble && deck.length >= 10 && lowValueCards(view, gamble.id, 12).length >= 2) return playTrainer(gamble);

  const gaze = playable(view, "Sabrina's Gaze");
  if (gaze && view.opponentHand.length >= 6 && hand.filter((c) => c.id !== gaze.id).every((c) => handCardValue(view, c) <= 25)) {
    return playTrainer(gaze);
  }

  // Lt. Surge: a Basic from the hand takes the place of a stuck Active (Asleep / Confused /
  // Paralyzed) or one about to fall, before the Basics are benched
  const surge = playable(view, "Lt. Surge");
  const active = view.playerActivePokemon!;
  if (surge && !activeCanAttack(view)) {
    const stuck = [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed].some((c) => hasStatusCondition(active, c));
    if (stuck || remainingHp(active) <= 20) return playTrainer(surge);
  }

  const flow = playable(view, "Energy Flow");
  if (flow && activeAboutToFall(view)) return playTrainer(flow);

  return null;
}

/** Share of the cards the AI wants (needed basic Energy, evolutions of its Pokémon in play). */
function usefulShare(view: GameState, cards: GameCard[]): number {
  if (cards.length === 0) return 0;
  const needed = isNeededEnergy(view);
  return cards.filter((c) => needed(c) || evolvesFromInPlay(view, c)).length / cards.length;
}

/** The opposing Benched Pokémon worth sending back to the hand (Minion of Team Rocket): evolved or with 2+ Energy. */
function minionTarget(view: GameState): PokemonInPlay | undefined {
  const worth = (p: PokemonInPlay) => (p.previousEvolutions?.length ?? 0) * 2 + p.attachedEnergy.length;
  return [...view.opponentBench]
    .filter((p) => !isTrainerInPlay(p.pokemon) && ((p.previousEvolutions?.length ?? 0) > 0 || p.attachedEnergy.length >= 2))
    .sort((a, b) => worth(b) - worth(a))[0];
}

/**
 * Minion of Team Rocket, as the LAST action of a turn without an attack: a tails ends the turn
 * (the executor ends it), two heads send an evolved / powered-up Benched Pokémon back to the
 * other player's hand (then the turn is planned again).
 */
export function planMinion(view: GameState): AIAction | null {
  const minion = playable(view, "Minion of Team Rocket");
  return minion && minionTarget(view) ? playTrainer(minion) : null;
}

/** Step In: the Benched Dragonite takes the place of an Active that can't attack. */
export function planStepIn(view: GameState): AIAction | null {
  if (activeCanAttack(view) || !view.opponentActivePokemon) return null;
  const dragonite = withUsablePower(view, "Entrada").find((p) => canAttackWith(view, p));
  return dragonite ? usePower(dragonite) : null;
}

/**
 * The Stadium action (Celadon City Gym: discard an Energy card from a Pokémon with Erika in its
 * name to cure it): when the Active is Asleep, Confused or Paralyzed, is offered by the action's
 * first step, and has a spare Energy card — one it can discard and still pay an attack.
 * Answers: the Active, then the spare Energy card worth the least.
 */
export function planStadiumAction(view: GameState): AIAction | null {
  const active = view.playerActivePokemon;
  if (!active || !view.stadium || !view.opponentActivePokemon) return null;
  const stopped = [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed].some((c) => hasStatusCondition(active, c));
  if (!stopped || canUseStadiumAction(view) !== null) return null;
  const first = getStadiumActionSteps(view, []);
  if (!first?.options.some((o) => o.id === active.pokemon.id && !o.disabled)) return null;
  const second = getStadiumActionSteps(view, [[active.pokemon.id]]);
  const offered = new Set(second?.options.filter((o) => !o.disabled).map((o) => o.id) ?? []);
  const spare = active.attachedEnergy
    .filter((e) => offered.has(e.id))
    .sort((a, b) => getEnergyValue(a) - getEnergyValue(b))
    .find((e) => canAttackWith(view, { ...active, attachedEnergy: active.attachedEnergy.filter((x) => x.id !== e.id) }));
  if (!spare) return null;
  return { type: "useStadium", stadiumName: view.stadium.card.name, selections: [[active.pokemon.id], [spare.id]], delay: 800 };
}

/** Gather Fire / Strange Behavior uses worth making now (in order). */
export function planSupportPowers(view: GameState): AIAction[] {
  const actions: AIAction[] = [];
  const active = view.playerActivePokemon;
  if (!active) return actions;

  // Natural Healing: whenever Vulpix has damage counters
  for (const vulpix of withUsablePower(view, "Curación Natural")) actions.push(usePower(vulpix));

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

  // Energy Charge: Lightning Energy onto an Active Magneton that can't attack yet (repeatable; last:
  // a use the engine refuses ends the list)
  const charger = withUsablePower(view, "Carga de Energía").find((p) => p.pokemon.id === active.pokemon.id);
  if (charger && !activeCanAttack(view)) {
    const lightning = ownPokemon(view)
      .filter((p) => p.pokemon.id !== active.pokemon.id)
      .reduce((n, p) => n + p.attachedEnergy.filter((e) => energyProvidesType(e, EnergyType.Lightning, p, view)).length, 0);
    for (let i = 0; i < Math.min(lightning, 3); i++) actions.push(usePower(charger));
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

  // Gym Heroes
  const active = view.playerActivePokemon;
  const damaged = ownPokemon(view).filter((p) => (p.currentDamage ?? 0) > 0);
  add("Brock", () => damaged.length >= 2 || (!!active && (active.currentDamage ?? 0) > 0 && remainingHp(active) <= 30));
  add("The Rocket's Trap", () => view.opponentHand.length >= 4);
  add("Misty", (card) => options.willAttack && !!active && hasOwner(active.pokemon, "Misty") && spareHandCards(view, card.id, 2, 25) !== null);
  add("Erika's Perfume", () => view.opponentHand.length >= 3 && !isBenchFull(view, "opponent"));
  add("Trash Exchange", () => view.playerDiscard.length >= 4 && usefulShare(view, view.playerDiscard) > usefulShare(view, unknownOwnCards(view)) + 0.2);
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
    case "Computer Search":
    case "Item Finder":
    case "Energy Retrieval": {
      // Hand step: the cards the AI can best spare
      if (step.source === "hand") {
        const options = new Set(enabledIds(step));
        const spare = view.playerHand
          .filter((c) => options.has(c.id) && c.id !== cardId)
          .sort((a, b) => handCardValue(view, a) - handCardValue(view, b))
          .slice(0, step.maxSelections)
          .map((c) => c.id);
        return spare.length >= minSelectionsOf(step) ? spare : answerStepForAI(step);
      }
      if (name === "Energy Retrieval") {
        const needed = isNeededEnergy(view);
        const ids = enabledIds(step);
        const ordered = [...ids.filter((id) => needed(cardById(view, id))), ...ids.filter((id) => !needed(cardById(view, id)))];
        return ordered.slice(0, step.maxSelections);
      }
      if (name === "Item Finder") {
        const best = ["Computer Search", "Gust of Wind", "Professor Oak", "Super Potion", "Pokémon Breeder", "Switch", "Energy Removal", "Super Energy Removal", "PlusPower", "Bill"];
        return prefer(view, step, best.map((wanted) => (c: GameCard | undefined) => c?.name === wanted));
      }
      return prefer(view, step, [
        ...wantedFromDeck(view),
        (c) => evolvesFromInPlay(view, c),
        isNeededEnergy(view),
        (c) => !!c && isPokemonCard(c) && c.stage === PokemonStage.Basic,
      ]);
    }
    case "Poké Ball":
    case "Good Manners":
      return prefer(view, step, [
        ...wantedFromDeck(view),
        (c) => evolvesFromInPlay(view, c),
        (c) => !!c && isPokemonCard(c) && c.stage === PokemonStage.Basic,
      ]);
    default:
      return answerGymHeroesStep(view, cardId, name, step);
  }
}

/** Enabled option ids ordered by `score` (highest first). */
function bestIds(view: GameState, step: SelectionStep, score: (card: GameCard | undefined, id: string) => number): string[] {
  return enabledIds(step).sort((a, b) => score(cardById(view, b), b) - score(cardById(view, a), a));
}

/** The AI's answers to the Gym Heroes Trainers' steps (AI view). */
function answerGymHeroesStep(view: GameState, cardId: string, name: string, step: SelectionStep): string[] {
  const hpOf = (c: GameCard | undefined) => (c && isPokemonCard(c) ? c.hp : 0);
  switch (name) {
    case "Lt. Surge":
      return bestIds(view, step, hpOf).slice(0, 1);
    case "Misty":
    case "Erika's Maids":
      if (step.source === "hand") {
        const spare = spareHandCards(view, cardId, step.maxSelections, 100)?.map((c) => c.id) ?? [];
        const ids = new Set(enabledIds(step));
        return spare.every((id) => ids.has(id)) && spare.length >= minSelectionsOf(step) ? spare : answerStepForAI(step);
      }
      // Erika's Maids, the deck: evolutions of Pokémon in play first, then Basics
      return bestIds(view, step, (c) => (evolvesFromInPlay(view, c) ? 2 : c && isPokemonCard(c) && c.stage === PokemonStage.Basic ? 1 : 0)).slice(0, step.maxSelections);
    case "Brock's Training Method":
      return prefer(view, step, [(c) => evolvesFromInPlay(view, c), (c) => !!c && isPokemonCard(c) && c.stage === PokemonStage.Basic]);
    case "Erika's Perfume": {
      // Weak Basics only: easy Prizes on that Bench
      const weak = enabledIds(step).filter((id) => hpOf(cardById(view, id)) <= 50);
      return weak.slice(0, step.maxSelections);
    }
    case "Minion of Team Rocket": {
      const target = minionTarget(view);
      return prefer(view, step, [(_c, id) => id === target?.pokemon.id]);
    }
    case "Misty's Wrath":
      return bestIds(view, step, (c) => (c ? handCardValue(view, c) : 0)).slice(0, step.maxSelections);
    case "Secret Mission":
    case "Blaine's Gamble": {
      if (step.source !== "hand") return [];
      const low = new Set(lowValueCards(view, cardId, name === "Secret Mission" ? 15 : 12).map((c) => c.id));
      return enabledIds(step).filter((id) => low.has(id)).slice(0, step.maxSelections);
    }
    case "Energy Flow": {
      const active = view.playerActivePokemon;
      const own = new Set(active?.attachedEnergy.map((e) => e.id) ?? []);
      return enabledIds(step).filter((id) => own.has(id)).slice(0, step.maxSelections);
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
    case "Reunir Fuego":
    case "Carga de Energía": {
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

