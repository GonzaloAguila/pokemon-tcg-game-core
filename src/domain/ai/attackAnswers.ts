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
 * | Flee (reaction, AI defends) | switch when, without it, the Defending Pokémon would be left with ≤ 30 HP or a new Special Condition; to the Benched Pokémon it would promote (choosePromotion, its turn next) |
 * | Bench Guard (reaction) | while the guard keeps > 30 HP: the hit Benched Pokémon, least HP left first |
 * | ForceSwitch chosen by the defender (Terror Strike, AI defends) | the Benched Pokémon it would promote (its turn next) |
 * | Fairy Power | its Pokémon with ≤ 20 HP left (the Active only while another Pokémon stays in play) |
 * | Magic Pollen | Paralyzed, Asleep, Confused, Poisoned (in that order; a Paralyzed Defending Pokémon gets Poisoned) |
 * | Sleight of Hand | step 1: the cards of the hand it values ≤ 15 (no more than the basic Energy it may find); step 2: needed Energy first |
 * | anything else | answerStepForAI (the first options) |
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { hasStatusCondition, resolveAttackChoice } from "@/lib/gameState";
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
    }
  }
  if (step.chooser === "opponent") {
    // Terror Strike: the defender picks the Benched Pokémon that comes up (it moves next)
    if (pending.effect?.type === AttackEffectType.ForceSwitch) return promotionAnswer(answererView, step) ?? answerStepForAI(step);
    return answerStepForAI(step);
  }
  switch (pending.effect?.type) {
    case AttackEffectType.ReturnPokemonToHand:
      return answerFairyPower(answererView, step);
    case AttackEffectType.ChooseStatus:
      return answerChooseStatus(answererView, step);
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
