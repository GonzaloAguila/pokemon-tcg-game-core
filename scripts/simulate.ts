/**
 * Bot simulator: plays seeded headless games and reports invariant violations.
 *
 *   npm run simulate -- --games 200 --seed 1 --sets base-set,jungle --policy greedy|random|mixed|all
 *
 * Game i uses seed (seed + i); replay a failure with `--games 1 --seed <seed>`.
 * Exit code 1 when any game failed.
 */

import { runBatch, allSetIds, type PolicyPair } from "../src/domain/simulation";
import type { CardSetId } from "../src/domain/catalog";

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const games = Number(argValue("games", "200"));
const seed = Number(argValue("seed", "1"));
const sets = argValue("sets", allSetIds().join(",")).split(",") as CardSetId[];
const policyArg = argValue("policy", "all");
const maxTurns = Number(argValue("max-turns", "300"));
const pairs: PolicyPair[] = policyArg === "all" ? ["greedy", "random", "mixed"] : [policyArg as PolicyPair];

let failed = false;
for (const policy of pairs) {
  const started = Date.now();
  const result = runBatch({ games, seed, sets, policy, maxTurns });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const wins = { A: 0, B: 0 };
  const reasons: Record<string, number> = {};
  let turns = 0;
  for (const outcome of result.outcomes) {
    wins[outcome.winner]++;
    reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
    turns += outcome.turns;
  }
  const average = result.outcomes.length ? (turns / result.outcomes.length).toFixed(1) : "-";
  console.log(
    `[${policy}] ${games} games (seeds ${seed}..${seed + games - 1}, sets ${sets.join(",")}) in ${seconds}s: ` +
      `${result.failures.length} failed; wins A ${wins.A} / B ${wins.B}; ` +
      `ends ${Object.entries(reasons).map(([r, n]) => `${r} ${n}`).join(", ")}; avg ${average} turns`
  );
  if (process.argv.includes("--stats")) {
    const totals: Record<string, number> = {};
    for (const outcome of result.outcomes) {
      for (const [kind, count] of Object.entries(outcome.actionCounts)) totals[kind] = (totals[kind] ?? 0) + count;
    }
    console.log(
      Object.entries(totals)
        .sort((a, b) => b[1] - a[1])
        .map(([kind, count]) => `    ${kind}: ${count}`)
        .join("\n")
    );
  }
  for (const failure of result.failures) {
    failed = true;
    console.log(`\n  FAIL game ${failure.gameIndex} seed ${failure.seed} turn ${failure.turn}`);
    console.log(`  problem: ${failure.problem}`);
    console.log(`  action:  ${failure.action}`);
    console.log(`  last events:\n    ${failure.lastEvents.join("\n    ")}`);
  }
}
process.exit(failed ? 1 : 0);
