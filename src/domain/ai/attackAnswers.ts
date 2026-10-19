/**
 * The AI's answer to a pending attack choice (`state.pendingAttackChoice`), whichever side answers
 * it: its own attack's choices (the AI attacks, `chooser: "self"`) and the defender's questions
 * when the other side attacks (`chooser: "opponent"`: Flee, Bench Guard, a forced switch it
 * chooses). Always called on the ATTACKING side's view, where the engine keeps the choice (the AI
 * may be either side of it). Fair: it reads the board, the step and the coins already flipped.
 *
 * | Choice | Answer |
 * |---|---|
 * | Sabrina's ESP (reaction) | re-flip when fewer than half of the attack's own coins came up heads (`wantsEspReflip`; the caller flips the new coins) |
 * | Charity (reaction) | "0": never reduces its damage |
 * | Koga's Ninja Trick (pre-attack reaction, AI defends) | switch when staying (attacker's coins heads, its own coin tails) leaves its Active Knocked Out, with ≤ 30 HP or a new Special Condition, to a Benched Pokémon that ends the attack with more HP left (the one it would promote first) |
 * | Flee (reaction, AI defends) | switch when, without it, the Defending Pokémon would be left with ≤ 30 HP or a new Special Condition; to the Benched Pokémon it would promote (choosePromotion, its turn next) |
 * | Bench Guard (reaction) | while the guard keeps > 30 HP: the hit Benched Pokémon, least HP left first |
 * | ForceSwitch chosen by the defender (Terror Strike, AI defends) | the Benched Pokémon it would promote (its turn next) |
 * | Energy Drain (its Koga's Muk, AI defends) | the attacker's Energy card worth the most (getEnergyValue) |
 * | Fairy Power | its Pokémon with ≤ 20 HP left (the Active only while another Pokémon stays in play) |
 * | Magic Pollen | Paralyzed, Asleep, Confused, Poisoned (in that order; a Paralyzed Defending Pokémon gets Poisoned) |
 * | Sleight of Hand | step 1: the cards of the hand it values ≤ 15 (no more than the basic Energy it may find); step 2: needed Energy first |
 * | Group Attack's search (reaction), Growth | as many as allowed |
 * | Helping Hand's count | every counter (the most cards) |
 * | Amnesia, ESP's copy | the Defending Pokémon's attack with the most printed damage |
 * | Invigorate | the first option (its own discard pile is listed first) |
 * | anything else | answerStepForAI (the first options) |
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { getAttackChoiceCoinPlan, getEnergyValue, hasStatusCondition, resolveAttackChoice, type AttackCoinPlan } from "@/lib/gameState";
import type { CoinFlipResult } from "@/domain/constants";
import { isBasicEnergy } from "@/domain/cards";
import { AttackEffectType, StatusCondition } from "@/domain/constants";
import { swapSides } from "@/domain/board";
import type { SelectionStep } from "@/domain/effects/types";
import { handCardValue, neededEnergyTypes } from "./cardEffects";
import { choosePromotion } from "./choices";
import { hpLeft } from "./evaluate";
import { knowledgeView, unknownOwnCards } from "./knowledge";
import { answerStepForAI, wantsEspReflip } from "./pending";

const NO_END = { skipEndTurn: true } as const;
const SPECIAL_CONDITIONS = [StatusCondition.Paralyzed, StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Poisoned];

const enabledIds = (step: SelectionStep) => step.options.filter((o) => !o.disabled).map((o) => o.id);

/** The answer for the side that answers the pending attack choice of `attackerView` (see the table). */
export function answerAttackChoiceForAI(attackerView: GameState): string[] {
  const pending = attackerView.pendingAttackChoice;
  if (!pending) return [];
  const step = pending.step;
  const reaction = pending.reaction;
  // The answerer's view (AI = "player")
  const answererView = step.chooser === "opponent" ? swapSides(attackerView) : attackerView;

  if (reaction) {
    switch (reaction.answers) {
      case "espReflip":
        return pending.reflip && wantsEspReflip(pending.reflip.coins) ? [pending.reflip.option] : ["keep"];
      case "charityReduction":
        return ["0"];
      case "flee":
        return answerFlee(attackerView, answererView, reaction.pokemonId, step);
      case "benchGuard":
        return answerBenchGuard(answererView, reaction.pokemonId, step);
      case "beforeDamageSearch":
        return enabledIds(step).slice(0, step.maxSelections);
      case "preAttack":
        return answerNinjaTrick(attackerView, answererView, reaction.pokemonId, step);
    }
  }
  if (step.chooser === "opponent") {
    // Terror Strike: the defender picks the Benched Pokémon that comes up (it moves next)
    if (pending.effect?.type === AttackEffectType.ForceSwitch) return promotionAnswer(answererView, step) ?? answerStepForAI(step);
    // Energy Drain (its Koga's Muk): the attacker's Energy card worth the most
    if (pending.effect?.type === AttackEffectType.DiscardAttackerEnergy) {
      const attacker = attackerView.playerActivePokemon;
      const ids = enabledIds(step);
      const best = attacker?.attachedEnergy.filter((e) => ids.includes(e.id)).sort((a, b) => getEnergyValue(b) - getEnergyValue(a))[0];
      return best ? [best.id] : answerStepForAI(step);
    }
    return answerStepForAI(step);
  }
  switch (pending.effect?.type) {
    case AttackEffectType.ReturnPokemonToHand:
      return answerFairyPower(answererView, step);
    case AttackEffectType.ChooseStatus:
      return answerChooseStatus(answererView, step);
    case AttackEffectType.AttachEnergyFromHand:
      return enabledIds(step).slice(0, step.maxSelections);
    case AttackEffectType.HealOpponentToDraw:
      // Step 2 (how many counters): all of them
      return pending.picked ? [enabledIds(step).at(-1) ?? "0"] : answerStepForAI(step);
    case AttackEffectType.LockDefenderAttack:
    case AttackEffectType.CopyDefenderAttackChoice:
      return answerStrongestAttack(answererView, step);
    case AttackEffectType.SearchDeckChoice:
      if (pending.effect.putBackFromHand) return answerSleightOfHand(answererView, step, !pending.picked);
      return answerStepForAI(step);
    default:
      return answerStepForAI(step);
  }
}

/** The Benched Pokémon (an option of `step`) it would promote now, its turn next; null if not offered. */
function promotionAnswer(view: GameState, step: SelectionStep): string[] | null {
  if (view.playerBench.length === 0) return null;
  const id = view.playerBench[choosePromotion(knowledgeView(view), true)]?.pokemon.id;
  return id !== undefined && enabledIds(step).includes(id) ? [id] : null;
}

/**
 * The attack resumed without this answer (and any later question answered with its default):
 * what the Defending Pokémon would be left with. Null when the engine refuses.
 */
function withoutAnswer(attackerView: GameState): GameState | null {
  try {
    let state = resolveAttackChoice(attackerView, [], NO_END);
    for (let guard = 0; guard < 4 && state.pendingAttackChoice?.reaction; guard++) {
      state = resolveAttackChoice(state, state.pendingAttackChoice.step.defaultSelection ?? [], NO_END);
    }
    return state;
  } catch {
    return null;
  }
}

/** The coins worst for the defender: the attacker's all heads (a run of 3 for "until tails"), the defender's tails. */
function worstCoinsForDefender(plan: AttackCoinPlan): CoinFlipResult[] {
  const n = (k: number, c: CoinFlipResult) => Array.from({ length: k }, () => c);
  const own = plan.attack === "untilTails" ? (["heads", "heads", "tails"] as CoinFlipResult[]) : n(plan.attack, "heads");
  return [...n(plan.smokescreen, "heads"), ...n(plan.power ?? 0, "heads"), ...own, ...n(plan.stadium ?? 0, "heads"), ...n(plan.defender, "tails")];
}

/**
 * Koga's Ninja Trick: what `pokemonId` is left with once the attack runs after the answer
 * `selection` (worst coins; later questions with their defaults), or null when the engine refuses.
 */
function afterPreAttack(attackerView: GameState, selection: string[], pokemonId: string): { state: GameState; pokemon?: PokemonInPlay } | null {
  try {
    const plan = getAttackChoiceCoinPlan(attackerView, selection);
    let state = resolveAttackChoice(attackerView, selection, { ...NO_END, ...(plan && { coinResults: worstCoinsForDefender(plan) }) });
    for (let guard = 0; guard < 4 && state.pendingAttackChoice?.reaction; guard++) {
      state = resolveAttackChoice(state, state.pendingAttackChoice.step.defaultSelection ?? [], NO_END);
    }
    const pokemon = [state.opponentActivePokemon, ...state.opponentBench].find((p): p is PokemonInPlay => p?.pokemon.id === pokemonId);
    return { state, pokemon };
  } catch {
    return null;
  }
}

/** Koga's Ninja Trick: switch only when staying costs much and the Pokémon sent in ends the attack better off. */
function answerNinjaTrick(attackerView: GameState, defenderView: GameState, kogaId: string, step: SelectionStep): string[] {
  const before = defenderView.playerActivePokemon;
  const stayed = afterPreAttack(attackerView, [], kogaId);
  if (!before || !stayed) return [];
  const koga = stayed.pokemon;
  const left = koga ? hpLeft(stayed.state, koga) : 0;
  const newCondition = !!koga && SPECIAL_CONDITIONS.some((c) => hasStatusCondition(koga, c) && !hasStatusCondition(before, c));
  if (left > 30 && !newCondition) return [];
  const preferred = promotionAnswer(defenderView, step)?.[0];
  const ids = enabledIds(step).sort((a, b) => (b === preferred ? 1 : 0) - (a === preferred ? 1 : 0));
  for (const id of ids) {
    const switched = afterPreAttack(attackerView, [id], id);
    if (switched?.pokemon && hpLeft(switched.state, switched.pokemon) > Math.max(left, 30)) return [id];
  }
  return [];
}

/** Flee: leave when staying costs much (≤ 30 HP left, or a new Special Condition). */
function answerFlee(attackerView: GameState, defenderView: GameState, defenderId: string, step: SelectionStep): string[] {
  const before = defenderView.playerActivePokemon;
  const after = withoutAnswer(attackerView);
  if (!before || !after) return [];
  const stayed = [after.opponentActivePokemon, ...after.opponentBench].find((p): p is PokemonInPlay => p?.pokemon.id === defenderId);
  const newCondition = !!stayed && SPECIAL_CONDITIONS.some((c) => hasStatusCondition(stayed, c) && !hasStatusCondition(before, c));
  const low = !stayed || hpLeft(after, stayed) <= 30;
  if (!newCondition && !low) return [];
  return promotionAnswer(defenderView, step) ?? [];
}

/** Bench Guard: the guard takes the damage while it keeps > 30 HP, for the Pokémon with the least HP left first. */
function answerBenchGuard(view: GameState, guardId: string, step: SelectionStep): string[] {
  const guard = [view.playerActivePokemon, ...view.playerBench].find((p): p is PokemonInPlay => p?.pokemon.id === guardId);
  if (!guard) return [];
  const amount = (guard.pokemon.kind === "pokemon" && guard.pokemon.power?.amount) || 10;
  const hit = enabledIds(step)
    .map((id) => view.playerBench.find((p) => p.pokemon.id === id))
    .filter((p): p is PokemonInPlay => !!p)
    .sort((a, b) => hpLeft(view, a) - hpLeft(view, b));
  const chosen: string[] = [];
  for (const p of hit) {
    if (hpLeft(view, guard) - amount * (chosen.length + 1) <= 30) break;
    chosen.push(p.pokemon.id);
  }
  return chosen;
}

/** Fairy Power: back to the hand only what is about to be Knocked Out (≤ 20 HP left). */
function answerFairyPower(view: GameState, step: SelectionStep): string[] {
  const offered = new Set(enabledIds(step));
  const inPlay = [view.playerActivePokemon, ...view.playerBench].filter((p): p is PokemonInPlay => p != null);
  const chosen = inPlay.filter((p) => offered.has(p.pokemon.id) && (p.currentDamage ?? 0) > 0 && hpLeft(view, p) <= 20).map((p) => p.pokemon.id);
  // Never everything: the Active goes back only while another Pokémon stays in play
  if (chosen.length >= inPlay.length) return chosen.filter((id) => id !== view.playerActivePokemon?.pokemon.id);
  return chosen.slice(0, step.maxSelections);
}

/** Amnesia / ESP's copy: the offered attack of the Defending Pokémon with the most printed damage. */
function answerStrongestAttack(view: GameState, step: SelectionStep): string[] {
  const card = view.opponentActivePokemon?.pokemon;
  const attacks = card && card.kind === "pokemon" ? card.attacks : [];
  const printed = (id: string) => parseInt(String(attacks.find((a) => a.name === id)?.damage ?? 0), 10) || 0;
  const best = [...enabledIds(step)].sort((a, b) => printed(b) - printed(a))[0];
  return best ? [best] : answerStepForAI(step);
}

/** Magic Pollen: the strongest Special Condition the Defending Pokémon doesn't have (Poisoned stacks). */
function answerChooseStatus(view: GameState, step: SelectionStep): string[] {
  const offered = enabledIds(step);
  const defender = view.opponentActivePokemon;
  const order: StatusCondition[] =
    defender && hasStatusCondition(defender, StatusCondition.Paralyzed) ? [StatusCondition.Poisoned, ...SPECIAL_CONDITIONS] : SPECIAL_CONDITIONS;
  const pick = order.find((c) => offered.includes(c) && !(defender && hasStatusCondition(defender, c)));
  return pick ? [pick] : answerStepForAI(step);
}

/** Sleight of Hand: put back the cards it values least (≤ 15), then take the Energy its attacks need first. */
function answerSleightOfHand(view: GameState, step: SelectionStep, putBack: boolean): string[] {
  if (putBack) {
    // Fair: what the deck may hold is judged on deck + Prizes (it doesn't know where each card is)
    const findable = unknownOwnCards(view).filter(isBasicEnergy).length;
    const offered = new Set(enabledIds(step));
    return view.playerHand
      .filter((c) => offered.has(c.id) && handCardValue(view, c) <= 15)
      .sort((a, b) => handCardValue(view, a) - handCardValue(view, b))
      .slice(0, Math.min(step.maxSelections, findable))
      .map((c) => c.id);
  }
  const needed = neededEnergyTypes(view);
  const cards = step.cards ?? [];
  const score = (id: string) => {
    const card = cards.find((c) => c.id === id);
    return card && isBasicEnergy(card) && needed.includes(card.energyType) ? 1 : 0;
  };
  return enabledIds(step).sort((a, b) => score(b) - score(a)).slice(0, step.maxSelections);
}
