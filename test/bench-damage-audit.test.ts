/**
 * Audit of EVERY attack in the catalog that damages Benched Pokémon (bench damage to either or
 * both Benches, chosen targets, damage to every named Pokémon, damage counters on damaged ones):
 * each one is used on a crowded board where every Pokémon in play has 10 HP left, with all-heads
 * and all-tails coins, its choices answered, and the attack resolution rules are checked:
 *
 * - one Knock Out check: no Pokémon with damage >= its HP is left in play;
 * - Prizes: each player is owed exactly one Prize per opposing Pokémon Knocked Out (never more
 *   than the Prizes left) and none is taken behind its back — unless the game ended, when the
 *   winner took them all (prize-out) or a side ran out of Pokémon;
 * - at least one coin variant Knocks Out 2+ Pokémon (multi Knock Outs), except the attacks that
 *   can only ever hit one Pokémon (listed).
 *
 * New cards are covered automatically (the list comes from the catalog).
 */
import { describe, it, expect } from "vitest";
import {
  executeAttack,
  executeBenchDamage,
  flipAttackCoins,
  getAttackCoinPlan,

  prizesOwed,
  resolveAttackChoice,
  type GameCard,
  type GameState,
  type PokemonInPlay,
} from "@/lib/gameState";
import { ALL_CARDS } from "@/domain/catalog";
import { isPokemonCard, toInPlayCard, type Attack, type PokemonCard } from "@/domain/cards";
import { AttackEffectType } from "@/domain/constants";
import { getEffectiveHp } from "@/domain/powers";
import { answerStepForAI } from "@/domain/ai/pending";
import { makeState, inPlay, energy, type SetName } from "./helpers/state";

const BENCH_EFFECTS = new Set<string>([
  AttackEffectType.BenchDamage,
  AttackEffectType.ChooseTargetDamage,
  AttackEffectType.DamageNamedInPlay,
  AttackEffectType.DamageCountersOnDamaged,
]);

/**
 * Attacks that can only ever damage ONE Pokémon: a single chosen target and no other damage
 * (Stretch Kick, Stare, Flitter, Dig Under, Coin Hurl, Drag Off / Fly Trap: the target becomes the
 * Defending Pokémon, Lucky Shot, Elastic Vine, Flamethrower, Shadow Attack, Magic Darts).
 */
const SINGLE_TARGET_ONLY = new Set<string>([
  "fossil-007-hitmonlee:Patada Estirada",
  "team-rocket-002-dark-arbok:Mirada",
  "team-rocket-007-dark-golbat:Revoloteo",
  "team-rocket-040-dark-machoke:Arrastrar",
  "team-rocket-052-diglett:Cavar",
  "team-rocket-062-meowth:Lanzamonedas",
  "gym-heroes-038-brocks-geodude:Tiro de Suerte",
  "gym-heroes-048-erikas-weepinbell:Atrapamoscas",
  "gym-heroes-079-erikas-tangela:Enredadera Elástica",
  "gym-challenge-002-blaines-charizard:Chorro de Llamas",
  "gym-challenge-038-erikas-bellsprout:Enredadera Elástica",
  "gym-challenge-055-sabrinas-haunter:Ataque Sombra",
  "gym-challenge-059-sabrinas-mr-mime:Dardos Mágicos",
]);
/** Mud Grab (Koga's Grimer): a switch, no damage at all. */
const NO_DAMAGE = new Set<string>(["gym-challenge-078-kogas-grimer:Agarre de Lodo"]);

const benchAttacks: { card: PokemonCard; attack: Attack; index: number }[] = [];
for (const card of ALL_CARDS) {
  if (!isPokemonCard(card)) continue;
  card.attacks.forEach((attack, index) => {
    if ((attack.effects ?? []).some((e) => BENCH_EFFECTS.has(e.type))) benchAttacks.push({ card, attack, index });
  });
}

/** 10 HP left: anything Knocks it Out. */
function weak(name: string, set?: SetName): PokemonInPlay {
  const p = inPlay(name, set ? { set } : {});
  return { ...p, currentDamage: (isPokemonCard(p.pokemon) ? p.pokemon.hp : 0) - 10 };
}

function attackerFor(card: PokemonCard, attack: Attack): PokemonInPlay {
  const pokemon = toInPlayCard({ ...structuredClone(card), id: `${card.id}#audit` } as GameCard);
  // The cost, plus 3 Energy of its type (Fire Spin-like discards, Energy-count attacks)
  const ownType = card.types[0] === "colorless" ? "fire" : card.types[0];
  const cost = attack.cost.map((t) => (t === "colorless" ? ownType : t));
  return {
    ...inPlay("Abra", { set: "base" }),
    pokemon,
    attachedEnergy: [...cost, ownType, ownType, ownType].map((t) => energy(t as Parameters<typeof energy>[0])),
    playedOnTurn: 1,
  };
}

/** Every Pokémon has 10 HP left; types cover the type-filtered attacks (Grass, Water, Fire, named Koffing). */
function board(card: PokemonCard, attack: Attack): GameState {
  return makeState({
    turnNumber: 6,
    player: {
      active: attackerFor(card, attack),
      bench: [weak("Koffing", "base"), weak("Weedle", "base"), weak("Magikarp", "base")],
    },
    opponent: {
      active: weak("Bulbasaur", "base"),
      bench: [weak("Koffing", "base"), weak("Oddish", "jungle"), weak("Squirtle", "base"), weak("Charmander", "base"), weak("Abra", "base")],
    },
  });
}

/** Answers every choice the attack left (bench targets: as many as allowed; others like the AI). */
function finish(state: GameState): GameState {
  let next = state;
  for (let i = 0; i < 8; i++) {
    const bench = next.pendingBenchDamageSelection;
    if (bench) {
      const side = bench.targetSide === "player" ? next.playerBench : next.opponentBench;
      const targets = side
        .filter((p) => !bench.matchDefenderType || (isPokemonCard(p.pokemon) && p.pokemon.types.some((t) => bench.defenderTypes?.includes(t))))
        .slice(0, bench.maxTargets)
        .map((p) => p.pokemon.id);
      next = executeBenchDamage(next, targets, { skipEndTurn: true });
      continue;
    }
    const choice = next.pendingAttackChoice;
    if (choice) {
      // Prefer a Benched target when the step offers one (more Knock Outs)
      const benched = choice.step.options.filter((o) => !o.disabled && next.opponentBench.some((p) => p.pokemon.id === o.id)).map((o) => o.id);
      const answer = benched.length > 0 && choice.step.maxSelections > 0 ? benched.slice(0, choice.step.maxSelections) : answerStepForAI(choice.step);
      next = resolveAttackChoice(next, answer, { skipEndTurn: true });
      continue;
    }
    break;
  }
  return next;
}

const inPlayIds = (state: GameState, side: "player" | "opponent") =>
  (side === "player" ? [state.playerActivePokemon, ...state.playerBench] : [state.opponentActivePokemon, ...state.opponentBench])
    .filter((p): p is PokemonInPlay => !!p)
    .map((p) => p.pokemon.id);

type Outcome = { opponentKOs: number; ownKOs: number; owedPlayer: number; owedOpponent: number; result: GameState["gameResult"] };

function run(card: PokemonCard, attack: Attack, index: number, coin: "heads" | "tails"): Outcome | null {
  const state = board(card, attack);
  let after: GameState;
  try {
    const plan = getAttackCoinPlan(state, index);
    after = finish(executeAttack(state, index, { coinResults: flipAttackCoins(plan, () => coin), skipEndTurn: true, skipDefenderPromotion: true }));
  } catch {
    return null; // not usable on this board (requirements)
  }
  const before = { player: inPlayIds(state, "player"), opponent: inPlayIds(state, "opponent") };
  const now = { player: new Set(inPlayIds(after, "player")), opponent: new Set(inPlayIds(after, "opponent")) };
  // Pokémon of the board that left play (Knocked Out; these attacks move nothing else out of play)
  const opponentKOs = before.opponent.filter((id) => !now.opponent.has(id)).length;
  const ownKOs = before.player.filter((id) => !now.player.has(id)).length;

  // One Knock Out check: nothing Knocked Out is still in play
  for (const p of [after.playerActivePokemon, ...after.playerBench, after.opponentActivePokemon, ...after.opponentBench]) {
    if (!p || !isPokemonCard(p.pokemon)) continue;
    expect((p.currentDamage ?? 0) < getEffectiveHp(after, p), `${card.name} ${attack.name} (${coin}): ${p.pokemon.name} still in play Knocked Out`).toBe(true);
  }
  const owedPlayer = prizesOwed(after, "player");
  const owedOpponent = prizesOwed(after, "opponent");
  const label = `${card.name} · ${attack.name} (${coin})`;
  if (after.gameResult === null) {
    // One Prize per opposing Knock Out, owed (picked by hand), never taken automatically
    expect(after.playerPrizes, label).toHaveLength(6);
    expect(after.opponentPrizes, label).toHaveLength(6);
    expect(owedPlayer, `${label}: Prizes owed to the attacker`).toBe(Math.min(6, opponentKOs));
    expect(owedOpponent, `${label}: Prizes owed to the defender`).toBe(Math.min(6, ownKOs));
  } else {
    expect([owedPlayer, owedOpponent, after.playerNeedsToPromote, after.opponentNeedsToPromote], label).toEqual([0, 0, false, false]);
  }
  return { opponentKOs, ownKOs, owedPlayer, owedOpponent, result: after.gameResult };
}

describe("every attack that damages Benched Pokémon resolves Knock Outs and Prizes by the one process", () => {
  it("the catalog list is not empty", () => {
    expect(benchAttacks.length).toBeGreaterThan(40);
  });

  it.each(benchAttacks.map((a) => [`${a.card.id} · ${a.attack.name}`, a] as const))("%s", (_label, { card, attack, index }) => {
    const outcomes = (["heads", "tails"] as const).map((coin) => run(card, attack, index, coin));
    const usable = outcomes.filter((o): o is Outcome => o !== null);
    expect(usable.length, `${card.name} ${attack.name} couldn't be used on the audit board`).toBeGreaterThan(0);
    const mostKOs = Math.max(...usable.map((o) => o.opponentKOs + o.ownKOs));
    if (NO_DAMAGE.has(`${card.id}:${attack.name}`)) expect(mostKOs).toBe(0);
    else if (SINGLE_TARGET_ONLY.has(`${card.id}:${attack.name}`)) expect(mostKOs).toBe(1);
    else expect(mostKOs, `${card.name} ${attack.name}: a multi Knock Out case`).toBeGreaterThanOrEqual(2);
  });
});
