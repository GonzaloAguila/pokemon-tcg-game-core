/**
 * Adventure content for the simulator (`npm run simulate -- --adventure <json>`): the parts of the
 * API's adventure JSON (content/adventures/<id>.json, spec §5.4) the engine needs to play its
 * battles. The API owns and validates the content; this only reads it.
 */

import type { AdventurePassive, BattleModifier, CardEntry } from "@/domain/adventure";
import type { AdventureGameConfig } from "@/domain/adventure/game";
import { playAdventureAIGame, SimulationFailure, type GameOutcome } from "./game";
import type { Policy } from "./policies";
import { mulberry32 } from "./rng";

export type AdventureDifficulty = "normal" | "hard";

/** The subset of the adventure JSON the simulator reads. */
export type AdventureContentLike = {
  id?: string;
  rules: { prizeCount: number; openingHand: number };
  starters: { id: string; deck: CardEntry[] }[];
  battles: {
    index: number;
    id: string;
    opponent: {
      name: string;
      deck?: CardEntry[];
      deckByDifficulty?: { normal: CardEntry[]; hard: { byStarter: Record<string, CardEntry[]> } };
    };
    modifiers?: BattleModifier[];
  }[];
};

/** The rival deck of a battle for a run (battle 10: by difficulty, hard by the run's starter). */
export function rivalDeckFor(content: AdventureContentLike, battleIndex: number, difficulty: AdventureDifficulty, starterId: string): CardEntry[] {
  const battle = content.battles.find((b) => b.index === battleIndex);
  if (!battle) throw new Error(`Adventure has no battle ${battleIndex}`);
  const { deck, deckByDifficulty } = battle.opponent;
  if (deck) return deck;
  if (!deckByDifficulty) throw new Error(`Battle ${battleIndex} has no rival deck`);
  if (difficulty === "normal") return deckByDifficulty.normal;
  const hard = deckByDifficulty.hard.byStarter[starterId];
  if (!hard) throw new Error(`Battle ${battleIndex} has no hard deck for ${starterId}`);
  return hard;
}

/**
 * The createAdventureGame config of a battle with a starter's deck (the untouched starter deck
 * unless `playerDeck` is given) and the battle's modifiers.
 */
export function adventureBattleConfig(
  content: AdventureContentLike,
  starterId: string,
  battleIndex: number,
  options: { difficulty?: AdventureDifficulty; playerDeck?: CardEntry[]; playerPassives?: AdventurePassive[] } = {}
): AdventureGameConfig {
  const starter = content.starters.find((s) => s.id === starterId);
  if (!starter) throw new Error(`Adventure has no starter ${starterId}`);
  const battle = content.battles.find((b) => b.index === battleIndex);
  if (!battle) throw new Error(`Adventure has no battle ${battleIndex}`);
  return {
    playerDeck: options.playerDeck ?? starter.deck,
    opponentDeck: rivalDeckFor(content, battleIndex, options.difficulty ?? "normal", starterId),
    prizeCount: content.rules.prizeCount,
    openingHand: content.rules.openingHand,
    playerPassives: options.playerPassives ?? [],
    modifiers: battle.modifiers ?? [],
  };
}

/** One starter against one battle's rival deck. */
export type AdventurePairing = { starterId: string; battleIndex: number; difficulty: AdventureDifficulty };

/**
 * Every starter against every battle: battles 1–10 in normal mode, plus battle 10 in hard mode
 * (its rival deck by starter) when the content has it. `filter`: only that starter / battle.
 */
export function adventurePairings(content: AdventureContentLike, filter: { starterId?: string; battleIndex?: number } = {}): AdventurePairing[] {
  const pairings: AdventurePairing[] = [];
  for (const starter of content.starters) {
    if (filter.starterId && starter.id !== filter.starterId) continue;
    for (const battle of [...content.battles].sort((a, b) => a.index - b.index)) {
      if (filter.battleIndex !== undefined && battle.index !== filter.battleIndex) continue;
      pairings.push({ starterId: starter.id, battleIndex: battle.index, difficulty: "normal" });
      if (battle.opponent.deckByDifficulty?.hard.byStarter[starter.id]) {
        pairings.push({ starterId: starter.id, battleIndex: battle.index, difficulty: "hard" });
      }
    }
  }
  return pairings;
}

export type AdventurePairingResult = AdventurePairing & {
  games: number;
  /** Games won by the starter's side (A) */
  wins: number;
  /** Games lost because the starter's deck ran out */
  starterDeckOuts: number;
  /** Games lost by the rival because its deck ran out */
  rivalDeckOuts: number;
  reasons: Record<string, number>;
  averageTurns: number;
  failures: { seed: number; problem: string; action: string; turn: number; lastEvents: string[] }[];
};

export type AdventureBatchOptions = {
  content: AdventureContentLike;
  /** Games per pairing; game i of each pairing uses seed (seed + i) */
  games: number;
  seed: number;
  /** [starter's side, rival] */
  policies: () => [Policy, Policy];
  maxTurns?: number;
  checkMutation?: boolean;
  starterId?: string;
  battleIndex?: number;
  /** Called after each pairing (progress) */
  onPairing?: (result: AdventurePairingResult) => void;
};

/**
 * The adventure's battles played by bots (spec H3 / H7): every pairing `games` times with the
 * battle's rules and modifiers (the starter's untouched deck, no passives). Failures (invariants,
 * exceptions, turn cap) are collected with their seed.
 */
export function runAdventureBatch(options: AdventureBatchOptions): AdventurePairingResult[] {
  const results: AdventurePairingResult[] = [];
  for (const pairing of adventurePairings(options.content, { starterId: options.starterId, battleIndex: options.battleIndex })) {
    const config = adventureBattleConfig(options.content, pairing.starterId, pairing.battleIndex, { difficulty: pairing.difficulty });
    const result: AdventurePairingResult = { ...pairing, games: options.games, wins: 0, starterDeckOuts: 0, rivalDeckOuts: 0, reasons: {}, averageTurns: 0, failures: [] };
    let turns = 0;
    const outcomes: GameOutcome[] = [];
    for (let i = 0; i < options.games; i++) {
      const seed = options.seed + i;
      const [policyA, policyB] = options.policies();
      try {
        const outcome = playAdventureAIGame(config, {
          rng: mulberry32(seed),
          policyA,
          policyB,
          maxTurns: options.maxTurns ?? 300,
          checkMutation: options.checkMutation ?? false,
        });
        outcomes.push(outcome);
        turns += outcome.turns;
        if (outcome.winner === "A") result.wins++;
        if (outcome.reason === "deck-out") {
          if (outcome.winner === "B") result.starterDeckOuts++;
          else result.rivalDeckOuts++;
        }
        result.reasons[outcome.reason] = (result.reasons[outcome.reason] ?? 0) + 1;
      } catch (error) {
        if (error instanceof SimulationFailure) {
          result.failures.push({ seed, problem: error.problem, action: error.action, turn: error.turn, lastEvents: error.lastEvents });
        } else {
          result.failures.push({ seed, problem: `setup exception: ${String(error)}`, action: "-", turn: 0, lastEvents: [] });
        }
      }
    }
    result.averageTurns = outcomes.length > 0 ? turns / outcomes.length : 0;
    options.onPairing?.(result);
    results.push(result);
  }
  return results;
}
