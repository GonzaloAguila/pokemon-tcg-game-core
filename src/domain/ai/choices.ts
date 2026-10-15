/**
 * Which Pokémon comes up: the AI's own promotion and the opponent's Pokémon its attack drags
 * up (Whirlwind, Lure...). Views where the AI is "player" (knowledgeView: public info only).
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { getRetreatCost } from "@/lib/gameState";
import { swapSides } from "@/domain/board";
import { knowledgeView } from "./knowledge";
import { isTrainerInPlay } from "@/domain/cards";
import { attackReadiness, bestThreat, damageValue, energyUnits, hpLeft, knockOutValue, nextTurnExtra, pokemonWorth } from "./evaluate";

/** A Pokémon that can't pay its Retreat Cost is stuck as the Active. */
function stuckness(v: GameState, p: PokemonInPlay, bench: PokemonInPlay[]): number {
  if (isTrainerInPlay(p.pokemon)) return 4;
  return Math.max(0, getRetreatCost(p, bench, v) - energyUnits(p));
}

/**
 * Bench index of the Pokémon to promote. `ourTurnNext`: the promoting side moves next (it
 * promotes after the other side Knocked Out its Active), so its own attack weighs more.
 */
export function choosePromotion(v: GameState, ourTurnNext: boolean): number {
  const bench = v.playerBench;
  if (bench.length <= 1) return 0;
  const theirs = v.opponentActivePokemon;
  let best = 0;
  let bestScore = -Infinity;
  bench.forEach((candidate, index) => {
    let score = hpLeft(v, candidate) * 0.2 - pokemonWorth(v, candidate) * 0.05;
    if (isTrainerInPlay(candidate.pokemon)) score -= 80;
    if (theirs) {
      const mine = bestThreat(v, "player", candidate, theirs, nextTurnExtra(v, "player"));
      score += (mine.ko * knockOutValue(v, theirs) + (1 - mine.ko) * damageValue(v, theirs, mine.expected)) * (ourTurnNext ? 1 : 0.4);
      const answer = bestThreat(v, "opponent", theirs, candidate, nextTurnExtra(v, "opponent"), attackReadiness(theirs, !ourTurnNext));
      // If it Knocks Out first, their answer only matters when the Knock Out fails
      score -= answer.ko * knockOutValue(v, candidate) * (ourTurnNext ? 0.9 * (1 - mine.ko * 0.7) : 0.9) + damageValue(v, candidate, answer.expected) * 0.6;
    }
    score -= stuckness(v, candidate, bench) * 4;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/**
 * The engine's automatic promotion of the Defending side after an attack Knocked Out its Active
 * (executeAttack without skipDefenderPromotion: single-player, where the defender is the AI).
 * `state` is the attacker's view; the defender moves next. Bench index of the defender.
 */
export function chooseAutoPromotion(state: GameState): number {
  if (state.opponentBench.length <= 1) return 0;
  const index = choosePromotion(knowledgeView(swapSides(state)), true);
  return index >= 0 && index < state.opponentBench.length ? index : 0;
}

/**
 * Bench index of the opponent's Pokémon to drag up with the AI's attack (their turn comes
 * next): one that can't hurt the AI's Active, that the AI can Knock Out, and that is stuck.
 */
export function chooseForcedSwitch(v: GameState): number {
  const bench = v.opponentBench;
  const mine = v.playerActivePokemon;
  if (bench.length <= 1 || !mine) return 0;
  let best = 0;
  let bestScore = -Infinity;
  bench.forEach((candidate, index) => {
    const threat = bestThreat(v, "opponent", candidate, mine, nextTurnExtra(v, "opponent"));
    const ours = bestThreat(v, "player", mine, candidate, nextTurnExtra(v, "player"));
    const score =
      ours.ko * knockOutValue(v, candidate) * 0.7 +
      damageValue(v, candidate, ours.expected) * 0.3 -
      threat.ko * knockOutValue(v, mine) * 0.9 -
      damageValue(v, mine, threat.expected) * 0.6 +
      stuckness(v, candidate, bench) * 12;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}
