/**
 * The single-player AI ("smart", since 0.7): plans a turn on a fair view of the game
 * (knowledge.ts) with a heuristic evaluator (evaluate.ts) and the engine itself.
 *
 * Turn plan (same shape as before: AIAction[] executed in order by executeAIAction; a plan that
 * changes the AI's hand — Bill, Professor Oak, Computer Search, a power… — has no attack and no
 * endTurn, so the caller asks for a new plan with the new cards, up to ~20 plans per turn):
 *
 * 1. Mysterious Fossil / Clefairy Doll as the Active: discard it (as before).
 * 2. Draw / search cards first (Bill, Computer Search, Poké Ball, Energy Retrieval and the
 *    Fossil / Team Rocket ones of cardEffects.planHandChange).
 * 2b. A Stadium that helps it (cardEffects.planStadium, by its rule; played alone).
 * 3. Bench Basics in order of value; with bench snipers around, weak Basics that would only
 *    give away Prizes stay in the hand once the Bench has 3 Pokémon.
 * 4. Evolve (Pokémon Breeder first), choosing the target with the most Energy / the Active;
 *    then the Stadium's action (Celadon City Gym) on an Active that can't attack
 *    (cardEffects.planStadiumAction).
 * 5. Tactics: every combination of pivot (stay / retreat / Switch), one Energy attachment
 *    (type-aware, toward an attacker that can use it) and Gust of Wind is scored analytically:
 *    this turn's attack (Weakness, Resistance, coins by expected value), the opponent's
 *    Knock Out threat on the next turn, Energy development and costs.
 * 6. Other Trainers (Potion, Super Potion, Defender, Full Heal, Pokémon Center, Energy Removal,
 *    Super Energy Removal, Revive and the Fossil / Team Rocket ones) when the evaluation of the
 *    position after the planned attack improves.
 * 7. Professor Oak / Imposter Professor Oak at the end when worth it (hand change: no attack).
 *    Minion of Team Rocket, else Tickling Machine, last in a turn without an attack
 *    (cardEffects.planMinion / planTicklingMachine: a tails ends the turn).
 * 8. Attack: the attack with the best expected evaluation, simulated with the engine for every
 *    coin outcome (confusion included; Vermilion City Gym's optional coin is one more way to
 *    attack, taken only when its expectation is better); PlusPower only when it raises the Knock Out chance; no
 *    attack when attacking is worse (self Knock Out handing over the last Prize...).
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import {
  canExecuteAttack,
  getAvailableAttacks,
  canExecuteMetronome,
  executeMetronome,
  canRetreat,
  executeAttack,
  getAttackCoinPlan,
  getEnergyValue,
  getRetreatCost,
  hasEnoughEnergyToRetreat,
  hasStatusCondition,
  resolveConfusionFlip,
} from "@/lib/gameState";
import type { Attack, PokemonCard } from "@/domain/cards";
import { isEnergyCard, isPokemonCard, isTrainerCard, isTrainerInPlay } from "@/domain/cards";
import { AttackEffectType, EnergyType, PokemonStage, StatusCondition, type CoinFlipResult } from "@/domain/constants";
import { canAttachEnergy, canPlayBasicPokemon, getEvolutionTargets, getTurnActionBlocker, isBenchFull, maxBenchSize, swapSides } from "@/domain/board";
import { canPlayTrainerCard, canUsePokemonPower } from "@/domain/effects";
import { energyProvidesType as energyProvidesTypeOf, getRetreatCoinFlips } from "@/lib/gameState";
import { executeAIAction } from "./executor";
import { knowledgeView, unknownOwnCards } from "./knowledge";
import {
  PRIZE,
  GAME_WON,
  attackDamage,
  attackReadiness,
  bestPromotion,
  bestThreat,
  cardOf,
  energyUnits,
  evaluateBoard,
  expectedDamage,
  hpLeft,
  knockOutChance,
  missingEnergy,
  missingForCost,
  damageValue,
  knockOutValue,
  nextTurnExtra,
  withThreatCache,
  powerAgainst,
  prizesFor,
  type Threat,
} from "./evaluate";
import { canAffordDraws, planHandChange, planMinion, planTicklingMachine, planStadium, planStadiumAction, planStepIn, planSupportPowers, planTrainers, spareHandCards, wantedFromDeck, AI_NEVER_PLAYS } from "./cardEffects";
import { canUseVermilionCoin, stadiumExtraTrainerDiscards } from "@/domain/stadiums/rules";
import { hasOwner } from "@/domain/cards/owner";
import { isLuckyDuel } from "@/domain/lucky-duel/mode";
import { attachedTrainerNamed, SABRINAS_ESP } from "@/domain/trainers/attached";
import { resolveAttackForEvaluation, resolveOwnAttackPendings } from "./pending";
import { choosePromotion } from "./choices";
import { basicHp, getBasicPokemonInHand } from "./actions";
import type { AIAction } from "./types";


// ============================================================================
// Plan: actions applied to the planning view (AI = "player")
// ============================================================================

class Plan {
  readonly actions: AIAction[] = [];
  constructor(public view: GameState) {}

  /** Apply `action` to the planning view through the executor; keep it if the engine accepted it. */
  tryAdd(action: AIAction): boolean {
    const consumer = swapSides(this.view);
    const after = executeAIAction(consumer, action);
    if (after === consumer || after.events.length === consumer.events.length) return false;
    this.view = { ...swapSides(after), events: [] };
    this.actions.push(action);
    return true;
  }

  /** What `action` would leave (null if refused), without keeping it. */
  peek(action: AIAction): GameState | null {
    const consumer = swapSides(this.view);
    const after = executeAIAction(consumer, action);
    if (after === consumer || after.events.length === consumer.events.length) return null;
    return { ...swapSides(after), events: [] };
  }
}

const trainerAction = (card: GameCard, selections: string[][] = [], answerAtPlay = false): AIAction => ({
  type: "playTrainer",
  cardId: card.id,
  trainerName: card.name,
  selections,
  ...(answerAtPlay && { answerAtPlay: true }),
  delay: 800,
});

const own = (v: GameState): PokemonInPlay[] => [v.playerActivePokemon, ...v.playerBench].filter((p): p is PokemonInPlay => p != null);

/** First card of the hand with that name the AI may play now. */
function playableTrainer(v: GameState, name: string): GameCard | undefined {
  if (AI_NEVER_PLAYS.has(name)) return undefined;
  return v.playerHand.find((c) => isTrainerCard(c) && c.name === name && canPlayTrainerCard(v, c.id) === null);
}

// ============================================================================
// Entry points
// ============================================================================

/**
 * Decide the AI's actions for its turn (state in the consumer's perspective: AI = "opponent").
 * Same contract as before: a list of actions to execute in order; without "attack" / "endTurn"
 * the caller asks again after executing them (the hand changed).
 */
export type DecideOpponentTurnOptions = {
  /**
   * The other player is an AI too (simulator bots): the AI may play Trainers whose steps that
   * player answers (cardEffects.OTHER_PLAYER_ANSWERS: Erika, Lt. Surge's Treaty, Blaine's Quiz #1),
   * and the executor answers those steps for it. Single-player leaves it off (no flow relays them to the human).
   */
  otherPlayerAnswersByAI?: boolean;
  /**
   * The other player can pick in Misty's Duel (`state.pendingDuel`): the consumer shows them the
   * duel (the frontend's duel modal, the simulator's bots). Off by default: the AI never plays it.
   * The executor never picks for the AI: the consumer submits `aiDuelPick()` for it (single-player:
   * `submitDuelPickVsAI` after the human's pick), then asks decideOpponentTurn again.
   */
  otherPlayerDuels?: boolean;
};

export function decideOpponentTurn(state: GameState, options: DecideOpponentTurnOptions = {}): AIAction[] {
  // Threat / damage estimates are memoized for the whole decision (keyed by the Pokémon as they are)
  return withThreatCache(() => planTurn(state, options));
}

function planTurn(state: GameState, options: DecideOpponentTurnOptions): AIAction[] {
  const real = swapSides(state);
  if (getTurnActionBlocker(real)) return [{ type: "endTurn", delay: 500 }];
  const plan = new Plan(knowledgeView(real));

  discardStuckFossil(plan);
  if (!plan.view.playerActivePokemon) return [...plan.actions, { type: "endTurn", delay: 500 }];

  const handChange = planDrawAndSearch(plan.view, options);
  if (handChange) return [...plan.actions, handChange];

  // A Stadium that helps (played alone, the turn is planned again: Narrow Gym may leave a Bench to trim)
  const stadium = planStadium(plan.view);
  if (stadium) return [...plan.actions, stadium];

  benchBasics(plan);
  evolveAll(plan);

  // The Stadium's action (Celadon City Gym) cures an Active that can't attack (evolving cured it already)
  const stadiumAction = planStadiumAction(plan.view);
  if (stadiumAction) plan.tryAdd(stadiumAction);

  const stepIn = planStepIn(plan.view);
  if (stepIn) plan.tryAdd(stepIn);
  for (const power of planSupportPowers(plan.view)) if (!plan.tryAdd(power)) break;
  useEnergyTrans(plan);

  playTactics(plan);
  attachWithRainDance(plan);
  useDamageSwap(plan);
  useHeal(plan);
  playOtherTrainers(plan);

  useCurse(plan);

  const oak = planProfessorOak(plan.view);
  if (oak) {
    plan.tryAdd(oak);
    return plan.actions;
  }

  const tail = finishWithAttack(plan);
  // Minion of Team Rocket, else Tickling Machine: last, in a turn without an attack (a tails ends the turn; heads:
  // no endTurn, the turn is planned again)
  if (tail.every((a) => a.type === "endTurn")) {
    const minion = planMinion(plan.view) ?? planTicklingMachine(plan.view);
    if (minion) return [...plan.actions, minion];
  }
  return [...plan.actions, ...tail];
}

/** Setup: the Active that can start best, then the Bench (fair: only the AI's own hand). */
export function decideOpponentSetup(state: GameState): AIAction[] {
  const view = swapSides(state);
  const basics = getBasicPokemonInHand(view, "player");
  if (basics.length === 0) return [];
  const actions: AIAction[] = [];
  let remaining = basics;
  if (!view.playerActivePokemon) {
    const starter = [...basics].sort((a, b) => starterScore(view, b) - starterScore(view, a))[0];
    actions.push({ type: "playBasicToActive", cardId: starter.id, delay: 500 });
    remaining = basics.filter((c) => c.id !== starter.id);
  }
  const room = maxBenchSize(view, "player") - view.playerBench.length;
  for (const card of [...remaining].sort((a, b) => basicValue(view, b) - basicValue(view, a)).slice(0, room)) {
    actions.push({ type: "playBasicToBench", cardId: card.id, benchIndex: 0, delay: 400 });
  }
  return actions;
}

/**
 * Which Benched Pokémon the AI promotes (consumer perspective: AI = "opponent"); bench index.
 * `ourTurnNext`: the AI moves next (it promotes after the human Knocked Out its Active), so its
 * own attack counts more than the human's answer.
 */
export function decideOpponentPromotion(state: GameState, ourTurnNext = true): number {
  return choosePromotion(knowledgeView(swapSides(state)), ourTurnNext);
}

// ============================================================================
// 1-2. Fossil, draw and search
// ============================================================================

/** A Mysterious Fossil / Clefairy Doll as the Active can't attack or retreat: discard it. */
function discardStuckFossil(plan: Plan): void {
  const v = plan.view;
  const active = v.playerActivePokemon;
  if (!active || !isTrainerInPlay(active.pokemon) || v.playerBench.length === 0) return;
  // Knocked Out it gives no Prize: keep it as a wall unless the Bench is deep or ready to attack
  const ready = v.playerBench.some((p) => (cardOf(v, p)?.attacks ?? []).some((_, i) => missingEnergy(v, "player", p, i) <= (v.playerHand.some(isEnergyCard) ? 1 : 0)));
  if (v.playerBench.length < 2 && !ready) return;
  if (v.playerHand.some((c) => isPokemonCard(c) && c.evolvesFrom === active.pokemon.name)) return;
  plan.tryAdd({ type: "discardFromPlay", pokemonId: active.pokemon.id, delay: 700 });
}

/** Evolution card (in `cards`) of a Pokémon the AI has in play. */
function evolvesSomethingInPlay(v: GameState, card: GameCard): boolean {
  return isPokemonCard(card) && card.stage !== PokemonStage.Basic && !!card.evolvesFrom && own(v).some((p) => p.pokemon.name === card.evolvesFrom);
}

/** A Trainer that draws or searches, worth playing now (played alone: the turn is planned again). */
function planDrawAndSearch(v: GameState, options: DecideOpponentTurnOptions): AIAction | null {
  const pool = unknownOwnCards(v);
  const fromCardEffects = planHandChange(v, { saveDeck: true, otherPlayerAnswersByAI: options.otherPlayerAnswersByAI, otherPlayerDuels: options.otherPlayerDuels });
  if (fromCardEffects) return fromCardEffects;

  const search = playableTrainer(v, "Computer Search");
  if (search && v.playerDeck.length > 0) {
    const wants = wantedFromDeck(v);
    if (wants.some((want) => pool.some(want)) && spareHandCards(v, search.id, 2)) return trainerAction(search, [], true);
  }

  const ball = playableTrainer(v, "Poké Ball");
  if (ball && v.playerDeck.length > 3) {
    const wantsBasic = v.playerBench.length < 3 && pool.some((c) => isPokemonCard(c) && c.stage === PokemonStage.Basic);
    const wantsEvolution = pool.some((c) => evolvesSomethingInPlay(v, c)) && !v.playerHand.some((c) => evolvesSomethingInPlay(v, c));
    if (wantsBasic || wantsEvolution) return trainerAction(ball, [], true);
  }

  const retrieval = playableTrainer(v, "Energy Retrieval");
  if (retrieval && !v.energyAttachedThisTurn && !v.playerHand.some(isEnergyCard) && v.playerDiscard.some((c) => isEnergyCard(c) && c.isBasic)) {
    if (spareHandCards(v, retrieval.id, 1)) return trainerAction(retrieval, [], true);
  }

  // Imposter Professor Oak: the other player shuffles the hand and draws 7 — a win when they can't
  const imposter = playableTrainer(v, "Imposter Professor Oak");
  if (imposter && v.opponentDeck.length + v.opponentHand.length < 7) return trainerAction(imposter);

  return null;
}

/** Professor Oak at the end of the plan: the hand left is weak and the deck can afford 7. */
function planProfessorOak(v: GameState): AIAction | null {
  const oak = playableTrainer(v, "Professor Oak");
  if (!oak || v.playerDeck.length < 14 || !canAffordDraws(v, 7)) return null;
  const rest = v.playerHand.filter((c) => c.id !== oak.id);
  const useful = rest.filter(
    (c) =>
      (isPokemonCard(c) && (c.stage === PokemonStage.Basic ? !isBenchFull(v, "player") : evolvesSomethingInPlay(v, c))) ||
      (isEnergyCard(c) && rest.filter(isEnergyCard).indexOf(c) < 2) ||
      (isTrainerCard(c) && ["Gust of Wind", "Super Potion", "Switch", "PlusPower", "Energy Removal", "Super Energy Removal", "Computer Search", "Pokémon Breeder", "Defender"].includes(c.name))
  );
  return useful.length <= 1 ? trainerAction(oak) : null;
}

// ============================================================================
// 3. Bench
// ============================================================================

/** Does the other side have attacks that hit Benched Pokémon (or Gust of Wind seen in its discard)? */
function opponentSnipes(v: GameState): boolean {
  const theirs = [v.opponentActivePokemon, ...v.opponentBench].filter((p): p is PokemonInPlay => p != null);
  const snipes = theirs.some((p) =>
    (cardOf(v, p)?.attacks ?? []).some((a) =>
      (a.effects ?? []).some(
        (e) =>
          (e.type === AttackEffectType.BenchDamage && e.benchTarget !== "own") ||
          (e.type === AttackEffectType.ChooseTargetDamage) ||
          (e.type === AttackEffectType.ForceSwitch)
      )
    )
  );
  return snipes || v.opponentDiscard.some((c) => c.name === "Gust of Wind");
}

/** How much a Basic in hand is worth having in play. */
function basicValue(v: GameState, card: GameCard): number {
  if (!isPokemonCard(card)) return basicHp(card) * 0.3; // Mysterious Fossil / Clefairy Doll
  const pool = unknownOwnCards(v);
  const evolvesInHand = v.playerHand.some((c) => isPokemonCard(c) && c.evolvesFrom === card.name);
  const evolvesLater = pool.some((c) => isPokemonCard(c) && c.evolvesFrom === card.name);
  const cheapest = Math.min(99, ...card.attacks.map((a) => a.cost.length));
  return card.hp + (evolvesInHand ? 60 : evolvesLater ? 25 : 0) + (cheapest <= 1 ? 15 : 0) + (card.power ? 20 : 0);
}

/** Starter score for the setup Active: survives, attacks early, retreats cheaply. */
function starterScore(v: GameState, card: GameCard): number {
  if (!isPokemonCard(card)) return -100;
  const cheapest = Math.min(99, ...card.attacks.map((a) => a.cost.length));
  const evolvesInHand = v.playerHand.some((c) => isPokemonCard(c) && c.evolvesFrom === card.name);
  return card.hp + (cheapest <= 1 ? 25 : cheapest === 2 ? 10 : 0) - card.retreatCost * 8 - (evolvesInHand ? 15 : 0);
}

function benchBasics(plan: Plan): void {
  const snipers = opponentSnipes(plan.view);
  for (let guard = 0; guard < maxBenchSize(plan.view, "player"); guard++) {
    const v = plan.view;
    if (isBenchFull(v, "player")) return;
    const candidates = getBasicPokemonInHand(v, "player")
      .filter((c) => canPlayBasicPokemon(v, c.id, "bench") === null)
      .sort((a, b) => basicValue(v, b) - basicValue(v, a));
    const card = candidates[0];
    if (!card) return;
    // Bench snipers around: once 3 are benched, a weak Basic with nothing to grow into only gives Prizes away
    const weak = isPokemonCard(card) && card.hp <= 40 && basicValue(v, card) < 70;
    if (snipers && v.playerBench.length >= 3 && weak) return;
    if (!plan.tryAdd({ type: "playBasicToBench", cardId: card.id, benchIndex: v.playerBench.length, delay: 600 })) return;
  }
}

// ============================================================================
// 4. Evolution
// ============================================================================

function evolveAll(plan: Plan): void {
  // Pokémon Breeder: Basic → Stage 2 right away
  const breeder = playableTrainer(plan.view, "Pokémon Breeder");
  if (breeder) {
    const v = plan.view;
    outer: for (const stage2 of v.playerHand.filter((c) => isPokemonCard(c) && c.stage === PokemonStage.Stage2)) {
      for (const target of own(v).sort((a, b) => energyUnits(b) - energyUnits(a))) {
        if (plan.tryAdd(trainerAction(breeder, [[stage2.id], [target.pokemon.id]]))) break outer;
      }
    }
  }
  for (let guard = 0; guard < 12; guard++) {
    const v = plan.view;
    const options: { card: GameCard; target: PokemonInPlay; score: number }[] = [];
    for (const card of v.playerHand) {
      if (!isPokemonCard(card) || card.stage === PokemonStage.Basic) continue;
      for (const targetId of getEvolutionTargets(v, card.id)) {
        const target = own(v).find((p) => p.pokemon.id === targetId);
        if (!target) continue;
        const isActive = v.playerActivePokemon?.pokemon.id === targetId;
        const statusCured = isActive && (target.statusConditions ?? []).length > 0 ? 25 : 0;
        options.push({ card, target, score: energyUnits(target) * 10 + (isActive ? 15 : 0) + (target.currentDamage ?? 0) / 5 + statusCured });
      }
    }
    if (options.length === 0) return;
    const best = options.sort((a, b) => b.score - a.score)[0];
    const index = v.playerActivePokemon?.pokemon.id === best.target.pokemon.id ? -1 : v.playerBench.findIndex((p) => p.pokemon.id === best.target.pokemon.id);
    if (!plan.tryAdd({ type: "evolve", evolutionCardId: best.card.id, targetIndex: index, delay: 800 })) return;
  }
}

// ============================================================================
// 5. Tactics: pivot × Energy × Gust of Wind
// ============================================================================

type Pivot =
  | { kind: "stay" }
  | { kind: "retreat"; benchId: string; discard: string[]; attachFirst: boolean }
  | { kind: "switch"; card: GameCard; benchId: string };
type Combo = { pivot: Pivot; attach: { energy: GameCard; targetId: string } | null; gust: { card: GameCard; targetId: string } | null };

/** Cards `p` can become with the evolutions in hand (its current card first). */
function lineOf(v: GameState, p: PokemonInPlay): { card: PokemonCard; weight: number }[] {
  const current = cardOf(v, p);
  if (!current) return [];
  const line = [{ card: current, weight: 1 }];
  const stage1 = v.playerHand.find((c): c is GameCard & PokemonCard => isPokemonCard(c) && c.evolvesFrom === current.name);
  if (stage1 && isPokemonCard(stage1)) {
    line.push({ card: stage1, weight: 0.8 });
    const stage2 = v.playerHand.find((c) => isPokemonCard(c) && c.evolvesFrom === stage1.name);
    if (stage2 && isPokemonCard(stage2)) line.push({ card: stage2, weight: 0.6 });
  }
  return line;
}

/**
 * How ready `p` is to hit hard with `energies`: its best (future) attack's power, discounted
 * for every Energy still missing.
 */
function readiness(v: GameState, p: PokemonInPlay, energies: GameCard[]): number {
  let best = 0;
  for (const { card, weight } of lineOf(v, p)) {
    for (const attack of card.attacks) {
      if (attack.effects?.some((e) => e.type === AttackEffectType.CopyAttack)) continue;
      const missing = missingForCost(attack.cost, energies);
      best = Math.max(best, powerAgainst(v, "player", card, attack) * weight * Math.pow(0.6, missing));
    }
  }
  return best;
}

/** Value of attaching `energy` to `p`: how much readier it gets (Energy paying nothing new: Retreat Cost only). */
function energyValue(v: GameState, p: PokemonInPlay, energy: GameCard): number {
  if (isTrainerInPlay(p.pokemon)) return -20;
  return (readiness(v, p, [...p.attachedEnergy, energy]) - readiness(v, p, p.attachedEnergy)) * 1.3 + 3;
}

/** Energy cards to discard for a retreat: the least useful to the retreating Pokémon first. */
function retreatPayment(v: GameState, p: PokemonInPlay, cost: number): string[] | null {
  if (cost <= 0) return [];
  const card = cardOf(v, p);
  const usefulness = (e: GameCard) => {
    const without = p.attachedEnergy.filter((x) => x.id !== e.id);
    return (card?.attacks ?? []).reduce((sum, a) => sum + missingForCost(a.cost, without) - missingForCost(a.cost, p.attachedEnergy), 0);
  };
  const sorted = [...p.attachedEnergy].sort((a, b) => usefulness(a) - usefulness(b) || getEnergyValue(a) - getEnergyValue(b));
  const ids: string[] = [];
  let paid = 0;
  for (const e of sorted) {
    if (paid >= cost) break;
    ids.push(e.id);
    paid += getEnergyValue(e);
  }
  return paid >= cost ? ids : null;
}

/** The position a combo would leave before attacking (approximate, built without the engine). */
function applyCombo(v: GameState, combo: Combo): GameState {
  let s: GameState = v;
  const removeFromHand = (id: string) => ({ ...s, playerHand: s.playerHand.filter((c) => c.id !== id) });
  const attachTo = (energy: GameCard, targetId: string) => {
    const add = (p: PokemonInPlay): PokemonInPlay =>
      p.pokemon.id !== targetId
        ? p
        : { ...p, attachedEnergy: [...p.attachedEnergy, energy], currentDamage: (p.currentDamage ?? 0) + (isEnergyCard(energy) && energy.providesAllTypes ? 10 : 0) };
    s = { ...removeFromHand(energy.id), playerActivePokemon: s.playerActivePokemon && add(s.playerActivePokemon), playerBench: s.playerBench.map(add), energyAttachedThisTurn: true };
  };
  const swapActive = (benchId: string, discard: string[]) => {
    const active = s.playerActivePokemon!;
    const incoming = s.playerBench.find((p) => p.pokemon.id === benchId)!;
    const leaving: PokemonInPlay = { ...active, statusConditions: [], attachedEnergy: active.attachedEnergy.filter((e) => !discard.includes(e.id)), protection: undefined };
    s = {
      ...s,
      playerActivePokemon: incoming,
      playerBench: [...s.playerBench.filter((p) => p.pokemon.id !== benchId), leaving],
      playerDiscard: [...s.playerDiscard, ...active.attachedEnergy.filter((e) => discard.includes(e.id))],
    };
  };
  const pivot = combo.pivot;
  if (combo.attach && pivot.kind === "retreat" && pivot.attachFirst) attachTo(combo.attach.energy, combo.attach.targetId);
  if (pivot.kind === "retreat") {
    swapActive(pivot.benchId, pivot.discard);
    s = { ...s, retreatedThisTurn: true };
  } else if (pivot.kind === "switch") {
    s = removeFromHand(pivot.card.id);
    swapActive(pivot.benchId, []);
  }
  if (combo.attach && !(pivot.kind === "retreat" && pivot.attachFirst)) attachTo(combo.attach.energy, combo.attach.targetId);
  if (combo.gust) {
    s = removeFromHand(combo.gust.card.id);
    const target = s.opponentBench.find((p) => p.pokemon.id === combo.gust!.targetId)!;
    const out = s.opponentActivePokemon!;
    s = {
      ...s,
      opponentActivePokemon: target,
      opponentBench: [...s.opponentBench.filter((p) => p.pokemon.id !== target.pokemon.id), { ...out, statusConditions: [], protection: undefined }],
    };
  }
  return s;
}

/** Value of the opponent's best answer next turn against `mine` (KO risk dominates). */
function threatCost(s: GameState, theirs: PokemonInPlay | null, mine: PokemonInPlay, readiness: number): number {
  if (!theirs) return 0;
  const poison = hasStatusCondition(mine, StatusCondition.Poisoned) ? mine.poisonDamage ?? 10 : 0;
  const target = poison > 0 ? { ...mine, currentDamage: (mine.currentDamage ?? 0) + poison } : mine;
  const theirEnergy = nextTurnExtra(s, "opponent");
  let threat: Threat = hpLeft(s, target) <= 0 ? { attackIndex: -1, ko: 1, expected: 0 } : bestThreat(s, "opponent", theirs, target, theirEnergy, readiness);
  for (const benched of s.opponentBench) {
    if (benched.pokemon.id === theirs.pokemon.id) continue;
    const alt = bestThreat(s, "opponent", benched, target, theirEnergy);
    if (alt.ko * 0.5 > threat.ko) threat = { attackIndex: alt.attackIndex, ko: alt.ko * 0.5, expected: alt.expected * 0.5 };
  }
  const theirPrizesLeft = s.opponentPrizes.length;
  const losesGame = s.playerBench.length === 0 || theirPrizesLeft <= prizesFor(mine);
  const loss = losesGame ? GAME_WON / 20 : knockOutValue(s, mine);
  return threat.ko * loss * 0.9 + (1 - threat.ko) * damageValue(s, target, threat.expected) * 0.8 + damageValue(s, mine, poison);
}

/** Analytic score of the position a combo leaves, with the best attack of the (new) Active. */
function comboScore(s: GameState, combo: Combo): number {
  const mine = s.playerActivePokemon;
  const theirs = s.opponentActivePokemon;
  if (!mine || !theirs) return 0;
  let bestGain = 0;
  let bestKo = 0;
  const card = cardOf(s, mine);
  const canAttackNow = !hasStatusCondition(mine, StatusCondition.Asleep) && !hasStatusCondition(mine, StatusCondition.Paralyzed) && !hasStatusCondition(mine, StatusCondition.CannotAttack);
  const confusion = hasStatusCondition(mine, StatusCondition.Confused) ? 0.5 : 1;
  if (card && canAttackNow) {
    const theirHp = hpLeft(s, theirs);
    const lastPrize = s.playerPrizes.length <= prizesFor(theirs) || s.opponentBench.length === 0;
    // Recall's attacks too, when it was played this turn
    getAvailableAttacks(s, mine).forEach(({ attack, index }) => {
      if (missingEnergy(s, "player", mine, index) > 0) return;
      if (attack.effects?.some((e) => e.type === AttackEffectType.CopyAttack)) return;
      const outcomes = attackDamage(s, "player", mine, attack, theirs);
      const ko = knockOutChance(outcomes, theirHp) * confusion;
      const expected = expectedDamage(outcomes) * confusion;
      const reward = lastPrize ? GAME_WON / 10 : knockOutValue(s, theirs);
      let gain = ko * reward + (1 - ko) * damageValue(s, theirs, expected);
      for (const effect of attack.effects ?? []) {
        if (effect.type === AttackEffectType.Discard && effect.target === "self") {
          gain -= (effect.discardAll ? energyUnits(mine) : effect.amount ?? effect.discardCostRequirement?.length ?? 1) * 14 * (effect.coinFlip ? 0.5 : 1);
        }
        if (effect.type === AttackEffectType.SelfDamage) gain -= (effect.amount ?? 0) * 0.4 * (effect.coinFlip ? 0.5 : 1);
        if (effect.type === AttackEffectType.ApplyStatus && effect.target !== "self") gain += (1 - ko) * (effect.coinFlip ? 6 : 12);
      }
      if (gain > bestGain) {
        bestGain = gain;
        bestKo = ko;
      }
    });
  }
  // Their answer next turn: the Defending Pokémon, or (after a Knock Out) their best Benched one
  const promoted = bestKo > 0 ? bestPromotion({ ...s, opponentActivePokemon: null, opponentBench: s.opponentBench }, "opponent") : null;
  const threat =
    (1 - bestKo) * threatCost(s, theirs, mine, attackReadiness(theirs, true)) + (promoted ? bestKo * threatCost(s, promoted, mine, 1) : 0);

  let score = bestGain - threat;
  const pivot = combo.pivot;
  if (pivot.kind !== "stay") score -= 12;
  if (pivot.kind === "switch") score -= 8;
  if (pivot.kind === "retreat") score -= pivot.discard.length * 16;
  if (combo.gust) score -= 8;
  return score;
}

/** Every legal pivot of the Active this turn. */
function pivotOptions(v: GameState, attachCandidates: GameCard[]): Pivot[] {
  const options: Pivot[] = [{ kind: "stay" }];
  const active = v.playerActivePokemon;
  if (!active || v.playerBench.length === 0) return options;
  if (canRetreat(active, v.playerBench.length, v.retreatedThisTurn) && getRetreatCoinFlips(v) === 0) {
    const cost = getRetreatCost(active, v.playerBench, v);
    const payment = hasEnoughEnergyToRetreat(active, v.playerBench, v) ? retreatPayment(v, active, cost) : null;
    for (const benched of v.playerBench) {
      if (payment) options.push({ kind: "retreat", benchId: benched.pokemon.id, discard: payment, attachFirst: false });
      else if (!v.energyAttachedThisTurn) {
        // Attach first, then retreat with it (one more unit)
        for (const energy of attachCandidates) {
          const powered = { ...active, attachedEnergy: [...active.attachedEnergy, energy] };
          const paid = retreatPayment(v, powered, cost);
          if (paid) {
            options.push({ kind: "retreat", benchId: benched.pokemon.id, discard: paid, attachFirst: true });
            break;
          }
        }
      }
    }
  }
  const switchCard = playableTrainer(v, "Switch");
  if (switchCard) for (const benched of v.playerBench) options.push({ kind: "switch", card: switchCard, benchId: benched.pokemon.id });
  return options;
}

/**
 * The best pivot × Energy × Gust combination. Energy on a Benched Pokémon doesn't change the
 * fight this turn, so it is scored as the combination without it plus its development value;
 * only Energy on the (new) Active is scored with the attack.
 */
function bestCombo(v: GameState, energies: GameCard[], gust: GameCard | undefined): { combo: Combo; score: number } | null {
  const activeId = v.playerActivePokemon!.pokemon.id;
  let best: { combo: Combo; score: number } | null = null;
  const consider = (combo: Combo, score: number) => {
    if (!best || score > best.score) best = { combo, score };
  };
  const gusts: Combo["gust"][] = [null, ...(gust ? v.opponentBench.map((p) => ({ card: gust, targetId: p.pokemon.id })) : [])];
  for (const pivot of pivotOptions(v, energies)) {
    const pivoted = applyCombo(v, { pivot, attach: null, gust: null });
    const newActiveId = pivoted.playerActivePokemon!.pokemon.id;
    const attaches: NonNullable<Combo["attach"]>[] = [];
    for (const energy of energies) {
      for (const target of own(pivoted)) {
        if (canAttachEnergy(v, energy.id, target.pokemon.id) !== null) continue;
        // Rainbow Energy does 10 damage: never onto a Pokémon it would Knock Out
        if (isEnergyCard(energy) && energy.providesAllTypes && hpLeft(v, target) <= 10) continue;
        // Attach-then-retreat spends the Energy on the old Active
        if (pivot.kind === "retreat" && pivot.attachFirst && target.pokemon.id !== activeId) continue;
        attaches.push({ energy, targetId: target.pokemon.id });
      }
    }
    // Development value of each attachment (independent of Gust of Wind)
    const development = new Map(
      attaches.map((attach) => [attach, energyValue(pivoted, own(pivoted).find((p) => p.pokemon.id === attach.targetId)!, attach.energy)])
    );
    for (const gustOption of gusts) {
      // Attach-then-retreat needs its attachment
      const base = pivot.kind === "retreat" && pivot.attachFirst ? null : comboScore(applyCombo(v, { pivot, attach: null, gust: gustOption }), { pivot, attach: null, gust: gustOption });
      if (base !== null) consider({ pivot, attach: null, gust: gustOption }, base);
      for (const attach of attaches) {
        const combo: Combo = { pivot, attach, gust: gustOption };
        const spent = pivot.kind === "retreat" && pivot.attachFirst;
        const onActive = attach.targetId === newActiveId && !spent;
        const s = onActive || spent ? applyCombo(v, combo) : null;
        let score = s ? comboScore(s, combo) : base!;
        // The Active attacks, the Bench waits; an Energy that paid the Retreat Cost is spent
        if (!spent) {
          let weight = 0.55;
          if (onActive) {
            const target = s!.playerActivePokemon!;
            weight = threatCost(s!, s!.opponentActivePokemon, target, 1) >= PRIZE ? 0.3 : 1;
          }
          score += development.get(attach)! * weight;
        }
        consider(combo, score);
      }
    }
  }
  return best;
}

function playTactics(plan: Plan): void {
  const v = plan.view;
  if (!v.playerActivePokemon || !v.opponentActivePokemon) return;

  // Distinct Energy cards (by name) that can be attached now
  const energies: GameCard[] = [];
  if (!v.energyAttachedThisTurn) {
    for (const card of v.playerHand) {
      if (isEnergyCard(card) && !energies.some((e) => e.name === card.name)) energies.push(card);
    }
  }
  const gust = playableTrainer(v, "Gust of Wind");

  const best = withThreatCache(() => bestCombo(v, energies, gust));
  if (!best) return;
  const { pivot, attach, gust: gustChoice } = best.combo;

  const attachAction = (targetId: string, energy: GameCard): AIAction => {
    const view = plan.view;
    const isBench = view.playerActivePokemon?.pokemon.id !== targetId;
    const benchIndex = isBench ? view.playerBench.findIndex((p) => p.pokemon.id === targetId) : undefined;
    return { type: "attachEnergy", energyCardId: energy.id, targetPokemonId: targetId, isBench, benchIndex, delay: 700 };
  };
  if (pivot.kind === "retreat") {
    if (pivot.attachFirst && attach) plan.tryAdd(attachAction(attach.targetId, attach.energy));
    const benchIndex = plan.view.playerBench.findIndex((p) => p.pokemon.id === pivot.benchId);
    plan.tryAdd({ type: "retreat", energyIdsToDiscard: pivot.discard, benchIndex, delay: 800 });
  } else if (pivot.kind === "switch") {
    plan.tryAdd(trainerAction(pivot.card, [[pivot.benchId]]));
  }
  if (attach && !(pivot.kind === "retreat" && pivot.attachFirst)) plan.tryAdd(attachAction(attach.targetId, attach.energy));
  if (gustChoice) plan.tryAdd(trainerAction(gustChoice.card, [[gustChoice.targetId]]));
}

// ============================================================================
// Activated powers (Energy Trans, Rain Dance, Damage Swap, Heal, Curse)
// ============================================================================

const powerName = (p: PokemonInPlay): string | undefined => (isPokemonCard(p.pokemon) ? p.pokemon.power?.name : undefined);

/** The AI's Pokémon with that power that may use it now. */
function withPower(v: GameState, name: string): PokemonInPlay[] {
  return own(v).filter((p) => powerName(p) === name && canUsePokemonPower(v, p.pokemon.id) === null);
}

const powerAction = (p: PokemonInPlay, selections?: string[][]): AIAction => ({
  type: "usePower",
  pokemonId: p.pokemon.id,
  powerName: powerName(p) ?? "",
  ...(selections && { selections }),
  delay: 800,
});

/** Readiness weight of a Pokémon: the Active attacks now, the Bench later. */
const roleWeight = (v: GameState, p: PokemonInPlay) => (v.playerActivePokemon?.pokemon.id === p.pokemon.id ? 1 : 0.55);

/** Energy Trans (Venusaur): Grass Energy toward the Pokémon that can use it best (the Active first). */
function useEnergyTrans(plan: Plan): void {
  for (let guard = 0; guard < 8; guard++) {
    const v = plan.view;
    const [venusaur] = withPower(v, "Energy Trans");
    if (!venusaur) return;
    let best: { action: AIAction; gain: number } | null = null;
    for (const source of own(v)) {
      for (const energy of source.attachedEnergy.filter((e) => energyProvidesTypeOf(e, EnergyType.Grass))) {
        const without = source.attachedEnergy.filter((e) => e.id !== energy.id);
        const loss = (readiness(v, source, source.attachedEnergy) - readiness(v, source, without)) * roleWeight(v, source);
        for (const target of own(v)) {
          if (target.pokemon.id === source.pokemon.id || isTrainerInPlay(target.pokemon)) continue;
          const gain = (readiness(v, target, [...target.attachedEnergy, energy]) - readiness(v, target, target.attachedEnergy)) * roleWeight(v, target) - loss;
          if (gain > 2 && (!best || gain > best.gain)) best = { action: powerAction(venusaur, [[source.pokemon.id], [energy.id], [target.pokemon.id]]), gain };
        }
      }
    }
    if (!best || !plan.tryAdd(best.action)) return;
  }
}

/** Rain Dance (Blastoise): the Water Energy left in hand onto the Pokémon that use them best. */
function attachWithRainDance(plan: Plan): void {
  for (let guard = 0; guard < 10; guard++) {
    const v = plan.view;
    if (!v.energyAttachedThisTurn) return;
    let best: { energy: GameCard; target: PokemonInPlay; value: number } | null = null;
    for (const energy of v.playerHand.filter(isEnergyCard)) {
      for (const target of own(v)) {
        if (canAttachEnergy(v, energy.id, target.pokemon.id) !== null) continue;
        const value = energyValue(v, target, energy) * roleWeight(v, target);
        if (value > 6 && (!best || value > best.value)) best = { energy, target, value };
      }
    }
    if (!best) return;
    const isBench = v.playerActivePokemon?.pokemon.id !== best.target.pokemon.id;
    const action: AIAction = {
      type: "attachEnergy",
      energyCardId: best.energy.id,
      targetPokemonId: best.target.pokemon.id,
      isBench,
      benchIndex: isBench ? v.playerBench.findIndex((p) => p.pokemon.id === best!.target.pokemon.id) : undefined,
      delay: 600,
    };
    if (!plan.tryAdd(action)) return;
  }
}

/** Damage Swap (Alakazam): move damage counters while the position gets better (the Active out of KO range...). */
function useDamageSwap(plan: Plan): void {
  for (let guard = 0; guard < 6; guard++) {
    const v = plan.view;
    const [alakazam] = withPower(v, "Damage Swap");
    if (!alakazam) return;
    const current = evaluateBoard(v);
    let best: { action: AIAction; value: number } | null = null;
    // The two most damaged as sources, the two healthiest as targets
    const sources = own(v).filter((p) => (p.currentDamage ?? 0) > 0).sort((a, b) => (b.currentDamage ?? 0) - (a.currentDamage ?? 0)).slice(0, 2);
    const targets = own(v).filter((p) => hpLeft(v, p) > 10).sort((a, b) => hpLeft(v, b) - hpLeft(v, a)).slice(0, 3);
    for (const source of sources) {
      for (const target of targets) {
        if (target.pokemon.id === source.pokemon.id) continue;
        const action = powerAction(alakazam, [[source.pokemon.id], [target.pokemon.id], ["10"]]);
        const after = plan.peek(action);
        if (!after) continue;
        const value = evaluateBoard(after);
        if (value > current + 1 && (!best || value > best.value)) best = { action, value };
      }
    }
    if (!best || !plan.tryAdd(best.action)) return;
  }
}

/** Heal (Vileplume): a free coin to heal 10 (the executor answers: the Active first). */
function useHeal(plan: Plan): void {
  for (const vileplume of withPower(plan.view, "Heal")) {
    if (!own(plan.view).some((p) => (p.currentDamage ?? 0) > 0)) return;
    plan.tryAdd(powerAction(vileplume));
  }
}

/** Curse (Gengar): one opposing damage counter where it helps most (never a Knock Out mid-turn: the Prize would stop the plan). */
function useCurse(plan: Plan): void {
  const v = plan.view;
  const [gengar] = withPower(v, "Maldición");
  if (!gengar) return;
  const theirs = [v.opponentActivePokemon, ...v.opponentBench].filter((p): p is PokemonInPlay => p != null);
  const current = bestAttack(v).value;
  let best: { action: AIAction; value: number } | null = null;
  for (const source of theirs.filter((p) => (p.currentDamage ?? 0) > 0)) {
    for (const target of theirs) {
      if (target.pokemon.id === source.pokemon.id || hpLeft(v, target) <= 10) continue;
      const action = powerAction(gengar, [[source.pokemon.id], [target.pokemon.id]]);
      const after = plan.peek(action);
      if (!after) continue;
      const value = bestAttack(after).value;
      if (value > current + 1 && (!best || value > best.value)) best = { action, value };
    }
  }
  if (best) plan.tryAdd(best.action);
}

// ============================================================================
// 6. Other Trainers, judged by the position after the planned attack
// ============================================================================

/**
 * One way to attack this turn: the attack, the copied attack (Metronome) or the chosen type
 * (Conversion), with or without Vermilion City Gym's optional coin.
 */
type AttackChoice = { index: number; copied?: Attack; chosenType?: EnergyType; vermilionCoin?: boolean };

/** Coin lists of an attack's plan with their probability (every outcome, never a peeked coin). */
function coinScenarios(v: GameState, attack: number | Attack, vermilionCoin = false): { p: number; coins: CoinFlipResult[] }[] {
  const plan = getAttackCoinPlan(v, attack, { vermilionCoin });
  let scenarios: { p: number; coins: CoinFlipResult[] }[] = [{ p: 1, coins: [] }];
  const extend = (options: { p: number; coins: CoinFlipResult[] }[]) => {
    scenarios = scenarios.flatMap((s) => options.map((o) => ({ p: s.p * o.p, coins: [...s.coins, ...o.coins] })));
  };
  const oneCoin = [
    { p: 0.5, coins: ["heads" as CoinFlipResult] },
    { p: 0.5, coins: ["tails" as CoinFlipResult] },
  ];
  for (let i = 0; i < plan.smokescreen; i++) extend(oneCoin);
  if (plan.attack === "untilTails") {
    extend([0, 1, 2, 3, 4].map((heads) => ({
      p: heads === 4 ? Math.pow(0.5, 4) : Math.pow(0.5, heads + 1),
      coins: [...Array(heads).fill("heads"), "tails"] as CoinFlipResult[],
    })));
  } else if (plan.attack > 0) {
    // By number of heads (heads first): coin effects count the heads
    const n = Math.min(plan.attack, 8);
    const options: { p: number; coins: CoinFlipResult[] }[] = [];
    let combinations = 1;
    for (let heads = 0; heads <= n; heads++) {
      if (heads > 0) combinations = (combinations * (n - heads + 1)) / heads;
      options.push({ p: combinations / Math.pow(2, n), coins: [...Array(heads).fill("heads"), ...Array(plan.attack - heads).fill("tails")] });
    }
    extend(options);
  }
  for (let i = 0; i < (plan.stadium ?? 0); i++) extend(oneCoin);
  for (let i = 0; i < plan.defender; i++) extend(oneCoin);
  return scenarios;
}

/** Types worth choosing for Conversion 1 (the Defending Pokémon's Weakness) / Conversion 2 (own Resistance). */
function conversionTypes(v: GameState, attack: Attack): EnergyType[] {
  const effects = attack.effects ?? [];
  if (effects.some((e) => e.type === AttackEffectType.ChangeWeakness)) {
    // The types of the AI's attackers
    const types = own(v).map((p) => cardOf(v, p)?.types[0]).filter((t): t is EnergyType => !!t && t !== EnergyType.Colorless);
    return [...new Set(types)];
  }
  if (effects.some((e) => e.type === AttackEffectType.ChangeResistance)) {
    const type = v.opponentActivePokemon ? cardOf(v, v.opponentActivePokemon)?.types[0] : undefined;
    return type && type !== EnergyType.Colorless ? [type] : [];
  }
  return [];
}

/** Every attack the Active can use now. */
function attackChoices(v: GameState): AttackChoice[] {
  const active = v.playerActivePokemon;
  const defender = v.opponentActivePokemon;
  const card = active ? cardOf(v, active) : undefined;
  if (!active || !card || !defender) return [];
  const choices: AttackChoice[] = [];
  // Recall's attacks too (indices after the own ones), when it was played this turn
  getAvailableAttacks(v, active).forEach(({ attack, index }) => {
    if (attack.effects?.some((e) => e.type === AttackEffectType.CopyAttack)) {
      for (const copied of cardOf(v, defender)?.attacks ?? []) {
        if (canExecuteMetronome(v, copied) === null) choices.push({ index, copied });
      }
      return;
    }
    if (canExecuteAttack(v, index) !== null) return;
    const types = conversionTypes(v, attack);
    const own: AttackChoice[] = types.length === 0 ? [{ index }] : types.map((chosenType) => ({ index, chosenType }));
    // Vermilion City Gym: each way also with the Stadium's coin (judged on every outcome like the rest)
    const withCoin = canUseVermilionCoin(v, index) === null ? own.map((c) => ({ ...c, vermilionCoin: true })) : [];
    choices.push(...own, ...withCoin);
  });
  return choices;
}

/**
 * Expected evaluation of attacking with `choice` now (every coin outcome; confusion included), and
 * the chance that the attack loses the game on the spot (self Knock Out / self removal).
 */
function attackOutlook(v: GameState, choice: AttackChoice): { value: number; defeat: number } | null {
  let value = 0;
  let defeat = 0;
  try {
    for (const scenario of coinScenarios(v, choice.copied ?? choice.index, !!choice.vermilionCoin)) {
      const options = { coinResults: scenario.coins, skipEndTurn: true, skipDefenderPromotion: true };
      const after = choice.copied
        ? executeMetronome(v, choice.copied, options)
        : executeAttack(v, choice.index, {
            ...options,
            ...(choice.chosenType && { chosenType: choice.chosenType }),
            ...(choice.vermilionCoin && { vermilionCoin: true }),
          });
      // (Flee / Bench Guard of the other side: judged with a guess at its answer)
      const resolved = resolveAttackForEvaluation(after);
      value += scenario.p * evaluateBoard(resolved);
      if (resolved.gameResult === "defeat") defeat += scenario.p;
    }
  } catch {
    return null;
  }
  if (hasStatusCondition(v.playerActivePokemon!, StatusCondition.Confused)) {
    const failed = resolveConfusionFlip(v, false, true).state;
    value = 0.5 * value + 0.5 * evaluateBoard(failed);
    defeat = 0.5 * defeat + (failed.gameResult === "defeat" ? 0.5 : 0);
  }
  return { value, defeat };
}

/** The best attack now (null: better not to attack) and the value of the resulting position. */
function bestAttack(v: GameState): { choice: AttackChoice | null; value: number } {
  let best: { choice: AttackChoice | null; value: number } = { choice: null, value: evaluateBoard(v) };
  const choices = attackChoices(v);
  const outlooks = choices.map((choice) => attackOutlook(v, choice));
  choices.forEach((choice, i) => {
    const value = outlooks[i]?.value ?? null;
    if (value !== null && value > best.value + 0.5) best = { choice, value };
  });
  // Lucky Duel: a Pokémon whose only attack may take it out of play (Phoenix Flame's tails) would
  // otherwise never attack and lose anyway: it attacks unless the attack surely loses the game
  if (isLuckyDuel(v) && best.choice === null && choices.length > 0 && choices.every((c) => c.index === choices[0].index && !c.copied)) {
    const risky = choices
      .map((choice, i) => ({ choice, outlook: outlooks[i] }))
      .filter((c): c is { choice: AttackChoice; outlook: { value: number; defeat: number } } => !!c.outlook && c.outlook.defeat > 0 && c.outlook.defeat < 1)
      .sort((a, b) => b.outlook.value - a.outlook.value)[0];
    if (risky) best = { choice: risky.choice, value: risky.outlook.value };
  }
  return best;
}

/** Candidate plays (with selections) of the Trainers judged by evaluation. */
function trainerCandidates(v: GameState): AIAction[] {
  const actions: AIAction[] = [];
  const mine = own(v);
  const theirs = [v.opponentActivePokemon, ...v.opponentBench].filter((p): p is PokemonInPlay => p != null);
  // A Stadium cost (No Removal Gym: 2 cards of the hand for Energy Removal / Super Energy Removal)
  // is paid with cards the AI can spare, first step; without them the Trainer isn't played
  const withCost = (card: GameCard, selections: string[][]): string[][] | null => {
    const count = stadiumExtraTrainerDiscards(v, card.name);
    if (count === 0) return selections;
    const spare = spareHandCards(v, card.id, count);
    return spare ? [spare.map((c) => c.id), ...selections] : null;
  };
  const add = (name: string, selections: string[][][]) => {
    const card = playableTrainer(v, name);
    if (!card) return;
    for (const s of selections) {
      const paid = withCost(card, s);
      if (paid) actions.push(trainerAction(card, paid));
    }
  };
  const damaged = mine.filter((p) => (p.currentDamage ?? 0) > 0);
  add("Potion", damaged.filter((p) => (p.currentDamage ?? 0) >= 20).map((p) => [[p.pokemon.id]]));
  add(
    "Super Potion",
    damaged
      .filter((p) => (p.currentDamage ?? 0) >= 30 && p.attachedEnergy.length > 0)
      .map((p) => {
        const payment = retreatPayment(v, p, 1);
        return [[p.pokemon.id], payment ? [payment[0]] : [p.attachedEnergy[0].id]];
      })
  );
  if (v.playerActivePokemon) add("Defender", [[[v.playerActivePokemon.pokemon.id]]]);
  // Recall: judged by the attack it opens up (bestAttack lists the attacks under the Active once played)
  if (v.recallActiveOnTurn !== v.turnNumber && v.playerActivePokemon?.previousEvolutions?.length) add("Recall", [[]]);
  if (v.playerActivePokemon && (v.playerActivePokemon.statusConditions ?? []).some((c) => c !== StatusCondition.CannotAttack)) add("Full Heal", [[]]);
  if (damaged.length > 0) add("Pokémon Center", [[]]);
  // Energy Removal: one Energy card of each kind on each opposing Pokémon
  const removals = theirs.flatMap((p) => {
    const seen = new Set<string>();
    return p.attachedEnergy.filter((e) => !seen.has(e.name) && !!seen.add(e.name));
  });
  add("Energy Removal", removals.map((e) => [[e.id]]));
  const ser = playableTrainer(v, "Super Energy Removal");
  if (ser) {
    const payer = mine
      .filter((p) => p.attachedEnergy.length > 0)
      .map((p) => ({ p, payment: retreatPayment(v, p, 1) }))
      .sort((a, b) => (a.p.pokemon.id === v.playerActivePokemon?.pokemon.id ? 1 : 0) - (b.p.pokemon.id === v.playerActivePokemon?.pokemon.id ? 1 : 0))[0];
    if (payer?.payment) {
      for (const target of theirs.filter((p) => p.attachedEnergy.length > 0)) {
        const removed = [...target.attachedEnergy].sort((a, b) => getEnergyValue(b) - getEnergyValue(a)).slice(0, 2).map((e) => e.id);
        const paid = withCost(ser, [[payer.p.pokemon.id], [payer.payment[0]], [target.pokemon.id], removed]);
        if (paid) actions.push(trainerAction(ser, paid));
      }
    }
  }
  const revive = playableTrainer(v, "Revive");
  if (revive && v.playerBench.length < 3) {
    const basics = v.playerDiscard.filter((c) => isPokemonCard(c) && c.stage === PokemonStage.Basic);
    const bestBasic = basics.sort((a, b) => basicValue(v, b) - basicValue(v, a))[0];
    if (bestBasic) actions.push(trainerAction(revive, [[bestBasic.id]]));
  }
  return actions;
}

/** Margin a Trainer must win by (it is gone afterwards and might help more later). */
const TRAINER_MARGIN = 14;

function playOtherTrainers(plan: Plan): void {
  for (let guard = 0; guard < 6; guard++) {
    const current = bestAttack(plan.view);
    let best: { action: AIAction; value: number } | null = null;
    for (const action of trainerCandidates(plan.view)) {
      const after = plan.peek(action);
      if (!after) continue;
      const value = bestAttack(after).value;
      if (value > current.value + TRAINER_MARGIN && (!best || value > best.value)) best = { action, value };
    }
    if (!best || !plan.tryAdd(best.action)) break;
  }
  // Fossil / Team Rocket Trainers with their own rules (cardEffects)
  const v = plan.view;
  const willAttack = bestAttack(v).choice !== null;
  for (const action of planTrainers(v, { willAttack })) plan.tryAdd(action);
}

// ============================================================================
// 8. Attack
// ============================================================================

function finishWithAttack(plan: Plan): AIAction[] {
  const v = plan.view;
  const { choice } = bestAttack(v);
  if (choice === null) return [{ type: "endTurn", delay: 500 }];

  // PlusPower: only when it makes the Knock Out more likely
  const active = v.playerActivePokemon!;
  const defender = v.opponentActivePokemon!;
  const attack = choice.copied ?? getAvailableAttacks(v, active)[choice.index]?.attack;
  if (attack) {
    const pluses = v.playerHand.filter((c) => isTrainerCard(c) && c.name === "PlusPower" && canPlayTrainerCard(v, c.id) === null);
    const hp = hpLeft(v, defender);
    let used = 0;
    const baseKo = knockOutChance(attackDamage(v, "player", active, attack, defender), hp);
    for (let extra = 1; extra <= pluses.length; extra++) {
      const ko = knockOutChance(attackDamage(v, "player", active, attack, defender, extra), hp);
      if (ko >= baseKo + 0.25) {
        used = extra;
        break;
      }
    }
    for (const card of pluses.slice(0, used)) plan.tryAdd(trainerAction(card));
    // Sabrina's ESP: a second chance for the coins of an attack that flips its own
    const esp = playableTrainer(v, SABRINAS_ESP);
    if (esp && hasOwner(active.pokemon, "Sabrina") && !attachedTrainerNamed(active, SABRINAS_ESP) && getAttackCoinPlan(v, choice.copied ?? choice.index).attack !== 0) {
      plan.tryAdd(trainerAction(esp, [[active.pokemon.id]]));
    }
  }
  return [
    {
      type: "attack",
      attackIndex: choice.index,
      ...(choice.copied && { copiedAttackName: choice.copied.name }),
      ...(choice.chosenType && { chosenType: choice.chosenType }),
      ...(choice.vermilionCoin && { vermilionCoin: true }),
      delay: 1000,
    },
  ];
}
