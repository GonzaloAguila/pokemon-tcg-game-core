/**
 * Headless simulation: bots play complete games to fuzz the engine.
 * See scripts/simulate.ts (`npm run simulate -- --games 200 --seed 1 --sets base-set,jungle --policy mixed`).
 */

import type { CardSetId } from "@/domain/catalog";
import { buildMixDeck, buildRandomDeck, buildThemeDeck } from "./decks";
import { ExploreMemory, createExplorePolicy } from "./explore";
import { playAIGame, playLuckyDuelAIGame, SimulationFailure, type GameOutcome } from "./game";
import { createGreedyPolicy, randomLegalPolicy, type Policy } from "./policies";
import { mulberry32 } from "./rng";

export { playAIGame, playLuckyDuelAIGame, SimulationFailure, actionKind, isPassivePower, stalemateTurn } from "./game";
export type { GameOptions, GameOutcome, SideId } from "./game";
export { randomLegalPolicy, createGreedyPolicy, legalActions, randomAnswer, firstAnswer, retreatTo } from "./policies";
export type { Policy, ViewAction } from "./policies";
export { buildRandomDeck, buildMixDeck, buildThemeDeck, DECK_SIZE, allSetIds } from "./decks";
export { ExploreMemory, createExplorePolicy, exploreKeys, cardRarity } from "./explore";
export { checkInvariants, ownedCardIds } from "./invariants";
export { mulberry32, withRandom, createSeededRng, hashSeed } from "./rng";
export type { Rng, SeededRng } from "./rng";
export { swapSides } from "@/domain/board";
export { adventureBattleConfig, rivalDeckFor } from "./adventure";
export type { AdventureContentLike, AdventureDifficulty } from "./adventure";

/** greedy = smart = the single-player AI; legacy = the greedy script it replaced (baseline) */
export type PolicyName = "greedy" | "smart" | "legacy" | "random" | "explore";
/** "mixed" = greedy (A) vs random (B); "A:B" = any two policies (e.g. "smart:legacy") */
export type PolicyPair = PolicyName | "mixed" | `${PolicyName}:${PolicyName}`;
/** "random": 1-2 Energy types and lines that fit them (default); "random-mix": see buildMixDeck; "theme": the theme decks */
export type DeckMode = "random" | "random-mix" | "theme" | "lucky-duel";

const POLICY_NAMES: readonly PolicyName[] = ["greedy", "smart", "legacy", "random", "explore"];

export function isPolicyPair(value: string): value is PolicyPair {
  if (value === "mixed") return true;
  const parts = value.split(":");
  return parts.length <= 2 && parts.every((p) => (POLICY_NAMES as readonly string[]).includes(p));
}

/** The two policies of a pair; explore policies read (and the batch feeds) `memory` */
export function policyPair(pair: PolicyPair, memory: ExploreMemory = new ExploreMemory()): [Policy, Policy] {
  const make = (name: PolicyName) =>
    name === "greedy" || name === "smart"
      ? createGreedyPolicy("smart", name)
      : name === "legacy"
        ? createGreedyPolicy("legacy")
        : name === "explore"
          ? createExplorePolicy(memory)
          : randomLegalPolicy;
  if (pair === "mixed") return [make("greedy"), make("random")];
  const [a, b = a] = pair.split(":") as PolicyName[];
  return [make(a), make(b)];
}

/** Whether games of the batch depend on the earlier ones (explore policy or random-mix decks) */
export function isAdaptiveBatch(policy: PolicyPair, decks: DeckMode = "random"): boolean {
  return decks === "random-mix" || policy.split(":").includes("explore");
}

export type BatchFailure = {
  gameIndex: number;
  seed: number;
  problem: string;
  action: string;
  turn: number;
  lastEvents: string[];
};

export type BatchResult = {
  games: number;
  outcomes: GameOutcome[];
  failures: BatchFailure[];
};

export type BatchOptions = {
  games: number;
  seed: number;
  sets: CardSetId[];
  policy: PolicyPair;
  maxTurns?: number;
  /** Default "random" */
  decks?: DeckMode;
  /** Stop at the first failing game */
  stopOnFailure?: boolean;
  /** Fail when an action mutates its input state (slower) */
  checkMutation?: boolean;
};

/**
 * Run `games` seeded games: game i uses seed `seed + i` for both its decks and its play,
 * so any failure replays with `--games 1 --seed <reported seed>`. Adaptive batches (explore
 * policy, random-mix decks) share an ExploreMemory across games: game i also depends on the
 * games before it, so it replays with the batch's first seed and `--games i + 1`.
 */
export function runBatch(options: BatchOptions): BatchResult {
  const outcomes: GameOutcome[] = [];
  const failures: BatchFailure[] = [];
  const decks = options.decks ?? "random";
  const memory = new ExploreMemory();
  const adaptive = isAdaptiveBatch(options.policy, decks);
  const buildDeck = decks === "random-mix" ? buildMixDeck : decks === "theme" ? buildThemeDeck : buildRandomDeck;
  for (let gameIndex = 0; gameIndex < options.games; gameIndex++) {
    const seed = options.seed + gameIndex;
    const rng = mulberry32(seed);
    const [policyA, policyB] = policyPair(options.policy, memory);
    try {
      if (decks === "lucky-duel") {
        // Lucky Duel: each side's Basic and deck come from the seeded rng (every set; --sets ignored)
        outcomes.push(
          playLuckyDuelAIGame({
            rng,
            policyA,
            policyB,
            maxTurns: options.maxTurns ?? 300,
            checkMutation: options.checkMutation ?? false,
            onAction: adaptive ? (kind) => memory.bump(kind) : undefined,
          })
        );
        continue;
      }
      const deckA = buildDeck(rng, options.sets, "A", memory);
      const deckB = buildDeck(rng, options.sets, "B", memory);
      outcomes.push(
        playAIGame(deckA, deckB, {
          rng,
          policyA,
          policyB,
          maxTurns: options.maxTurns ?? 300,
          checkMutation: options.checkMutation ?? false,
          onAction: adaptive ? (kind) => memory.bump(kind) : undefined,
        })
      );
    } catch (error) {
      if (error instanceof SimulationFailure) {
        failures.push({ gameIndex, seed, problem: error.problem, action: error.action, turn: error.turn, lastEvents: error.lastEvents });
      } else {
        failures.push({ gameIndex, seed, problem: `setup exception: ${String(error)}`, action: "-", turn: 0, lastEvents: [] });
      }
      if (options.stopOnFailure) break;
    }
  }
  return { games: options.games, outcomes, failures };
}
