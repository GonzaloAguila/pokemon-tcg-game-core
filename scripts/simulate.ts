/**
 * Bot simulator: plays seeded headless games and reports invariant violations.
 *
 *   npm run simulate -- --games 200 --seed 1 --sets base-set,jungle --policy greedy|random|mixed|all [--stats [--coverage fossil]]
 *   npm run simulate -- --games 3000 --policy explore,explore:greedy,explore:random --decks random-mix --stats
 *
 * --policy: greedy | random | explore | mixed (greedy vs random) | A:B (e.g. explore:greedy),
 *   several separated by commas; all = greedy,random,mixed (default).
 * --decks random (default: 1-2 Energy types) | random-mix (featured evolution lines of any set
 *   and type, every set's Trainers and special Energy; see buildMixDeck) | lucky-duel (Lucky Duel
 *   tables: a random Basic and deck per side from every set; --sets ignored).
 * explore and random-mix are adaptive: they steer toward what the batch has used least, so a
 *   game depends on the games before it (replay: same --seed, --games up to the failing one).
 * --stop-on-fail stops a batch at its first failure; --check-mutation also fails an action that
 *   changes the state it was given (about 3x slower).
 * --stats prints how often each kind of action ran and a coverage report (Trainers, activated
 * powers, on-play powers and attacks of the --coverage sets, default the --sets, never used by
 * the bots; passive powers never seen in play / never working). With several policies, a last
 * "all policies" report merges them.
 *
 * Game i uses seed (seed + i); replay a failure with `--games 1 --seed <seed>`.
 * Exit code 1 when any game failed.
 */

import { runBatch, allSetIds, isAdaptiveBatch, isPassivePower, isPolicyPair, type DeckMode, type GameOutcome, type PolicyPair } from "../src/domain/simulation";
import { getSet, type CardSetId } from "../src/domain/catalog";
import { ACTIVATED_POWER_TYPES } from "../src/domain/effects";
import { PokemonPowerType } from "../src/domain/constants";

/**
 * What the chosen sets offer that the bots should exercise: every Trainer (played, or put
 * into play as a Basic), every activated Pokémon Power and every attack ("Pokémon: Attack").
 */
function coverageTargets(setIds: CardSetId[]): { trainers: string[]; powers: string[]; onPlayPowers: string[]; attacks: string[]; passivePowers: string[] } {
  const cards = setIds.flatMap((id) => getSet(id)?.cards ?? []);
  const unique = (items: string[]) => [...new Set(items)].sort();
  return {
    trainers: unique(cards.flatMap((c) => (c.kind === "trainer" ? [c.playsAsBasic ? `benchTrainer ${c.name}` : `playTrainer ${c.name}`] : []))),
    powers: unique(
      cards.flatMap((c) => (c.kind === "pokemon" && c.power && ACTIVATED_POWER_TYPES.includes(c.power.type) ? [`usePower ${c.power.name}`] : []))
    ),
    // "When you play it from your hand" powers (answered as a pending power choice)
    onPlayPowers: unique(
      cards.flatMap((c) => (c.kind === "pokemon" && c.power?.type === PokemonPowerType.OnPlayFromHand ? [`powerChoice ${c.power.name}`] : []))
    ),
    attacks: unique(cards.flatMap((c) => (c.kind === "pokemon" ? c.attacks.map((a) => `attack ${c.name}: ${a.name}`) : []))),
    // Passive powers: counted per game seen in play ("passive X") and working ("passive working X")
    passivePowers: unique(cards.flatMap((c) => (c.kind === "pokemon" && c.power && isPassivePower(c.power.type) ? [c.power.name] : []))),
  };
}

/** Action counts of a batch plus the passive powers per game ("passive X", "passive working X") */
function totalsOf(outcomes: GameOutcome[]): Record<string, number> {
  const totals: Record<string, number> = {};
  const bump = (kind: string, count = 1) => (totals[kind] = (totals[kind] ?? 0) + count);
  for (const outcome of outcomes) {
    for (const [kind, count] of Object.entries(outcome.actionCounts)) bump(kind, count);
    outcome.passivePowers.inPlay.forEach((name) => bump(`passive ${name}`));
    outcome.passivePowers.working.forEach((name) => bump(`passive working ${name}`));
  }
  return totals;
}

function printCoverage(label: string, totals: Record<string, number>, coverageSets: CardSetId[]): void {
  const targets = coverageTargets(coverageSets);
  for (const [group, names] of Object.entries(targets)) {
    if (group === "passivePowers") {
      const notInPlay = names.filter((name) => !totals[`passive ${name}`]);
      const notWorking = names.filter((name) => !totals[`passive working ${name}`]);
      console.log(
        `  ${label}passivePowers (in play): ${names.length - notInPlay.length}/${names.length}` +
          `${notInPlay.length ? ` — never in play: ${notInPlay.join(", ")}` : ""}` +
          `${notWorking.length ? ` — never working: ${notWorking.join(", ")}` : ""}`
      );
      continue;
    }
    const missing = names.filter((name) => !totals[name]);
    console.log(`  ${label}${group}: ${names.length - missing.length}/${names.length}${missing.length ? ` — never used: ${missing.join(", ")}` : ""}`);
  }
}

function argValue(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const games = Number(argValue("games", "200"));
const seed = Number(argValue("seed", "1"));
const sets = argValue("sets", allSetIds().join(",")).split(",") as CardSetId[];
const policyArg = argValue("policy", "all");
const maxTurns = Number(argValue("max-turns", "300"));
const decks = argValue("decks", "random") as DeckMode;
const stopOnFailure = process.argv.includes("--stop-on-fail");
const checkMutation = process.argv.includes("--check-mutation");
const pairs = (policyArg === "all" ? "greedy,random,mixed" : policyArg).split(",");
for (const pair of pairs) {
  if (!isPolicyPair(pair)) throw new Error(`Unknown --policy "${pair}" (greedy = smart, legacy, random, explore, mixed, A:B or all)`);
}
if (decks !== "random" && decks !== "random-mix" && decks !== "theme" && decks !== "lucky-duel") throw new Error(`Unknown --decks "${decks}" (random, random-mix, theme or lucky-duel)`);
const coverageSets = argValue("coverage", sets.join(",")).split(",") as CardSetId[];

let failed = false;
const allOutcomes: GameOutcome[] = [];
for (const policy of pairs as PolicyPair[]) {
  const started = Date.now();
  const result = runBatch({ games, seed, sets, policy, maxTurns, decks, stopOnFailure, checkMutation });
  allOutcomes.push(...result.outcomes);
  const adaptive = isAdaptiveBatch(policy, decks);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const wins = { A: 0, B: 0, draw: 0 };
  const reasons: Record<string, number> = {};
  let turns = 0;
  for (const outcome of result.outcomes) {
    wins[outcome.winner ?? "draw"]++;
    reasons[outcome.reason] = (reasons[outcome.reason] ?? 0) + 1;
    turns += outcome.turns;
  }
  const average = result.outcomes.length ? (turns / result.outcomes.length).toFixed(1) : "-";
  console.log(
    `[${policy}${decks === "random" ? "" : ` ${decks}`}] ${games} games (seeds ${seed}..${seed + games - 1}, sets ${sets.join(",")}) in ${seconds}s: ` +
      `${result.failures.length} failed; wins A ${wins.A} / B ${wins.B}${wins.draw ? ` / draws ${wins.draw}` : ""}; ` +
      `ends ${Object.entries(reasons).map(([r, n]) => `${r} ${n}`).join(", ")}; avg ${average} turns`
  );
  if (process.argv.includes("--stats")) {
    const totals = totalsOf(result.outcomes);
    // Attacks of a lower stage used through Recall ("attack X: Y (Recall: Z)"), as one line
    const recalled = Object.entries(totals).filter(([kind]) => kind.startsWith("attack ") && kind.includes(" (Recall: "));
    const recallLine: [string, number][] = recalled.length > 0 ? [["attack through Recall", recalled.reduce((sum, [, n]) => sum + n, 0)]] : [];
    console.log(
      [...Object.entries(totals), ...recallLine]
        .filter(([kind]) => kind === "attack through Recall" || (!kind.startsWith("attack ") && !kind.startsWith("passive ")))
        .sort((a, b) => b[1] - a[1])
        .map(([kind, count]) => `    ${kind}: ${count}`)
        .join("\n")
    );
    printCoverage("coverage ", totals, coverageSets);
  }
  for (const failure of result.failures) {
    failed = true;
    console.log(`\n  FAIL game ${failure.gameIndex} seed ${failure.seed} turn ${failure.turn}`);
    if (adaptive) {
      console.log(
        `  replay:  --seed ${seed} --games ${failure.gameIndex + 1} --policy ${policy} --decks ${decks} --sets ${sets.join(",")} --stop-on-fail` +
          " (adaptive batch: the game depends on the earlier ones)"
      );
    }
    console.log(`  problem: ${failure.problem}`);
    console.log(`  action:  ${failure.action}`);
    console.log(`  last events:\n    ${failure.lastEvents.join("\n    ")}`);
  }
}
if (process.argv.includes("--stats") && pairs.length > 1) {
  console.log(`[all policies] ${allOutcomes.length} games`);
  printCoverage("coverage ", totalsOf(allOutcomes), coverageSets);
}
process.exit(failed ? 1 : 0);
