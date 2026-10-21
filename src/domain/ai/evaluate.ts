/**
 * AI evaluation: damage estimates (expected value over every coin outcome, never a peeked
 * coin), next-turn threats and a heuristic board score.
 *
 * Everything works on a view where the AI is "player" (a knowledgeView, see knowledge.ts), and
 * only reads public information: the board, discard piles, card counts and the AI's own hand.
 */

import type { GameState, PokemonInPlay, GameCard } from "@/lib/gameState";
import {
  calculateBaseDamage,
  coinFlipCountFor,
  energyProvidesType,
  getEnergyValue,
  getRetreatCost,
  hasStatusCondition,
  protectionBlocksDamage,
  resolveCoinFlipEffects,
  canUseAttack,
  getAvailableAttacks,
} from "@/lib/gameState";
import { attackBonusFromModifiers, defenderReduction as modifierDefenderReduction } from "@/lib/modifiers";
import type { Attack, PokemonCard } from "@/domain/cards";
import { givesPrizeWhenKnockedOut, isEnergyCard, isPokemonCard, isTrainerInPlay } from "@/domain/cards";
import { AttackEffectType, EnergyType, PokemonPowerType, StatusCondition, type CoinFlipResult } from "@/domain/constants";
import { swapSides } from "@/domain/board";
import { resistanceAmount, stadiumIgnoresResistance, stadiumIgnoresWeakness } from "@/domain/stadiums/rules";
import { isLuckyDuel } from "@/domain/lucky-duel/mode";
import {
  applyAttackDamageReductions,
  getConfusedDamageBonus,
  getEffectiveHp,
  getEffectivePokemonCard,
  isDamageBlocked,
  isPowerActive,
} from "@/domain/powers";

export type Rel = "player" | "opponent";

/** Score of one Prize card (the unit of the board score). */
export const PRIZE = 100;
/** Score of a won / lost game. */
export const GAME_WON = 100000;
/**
 * Lucky Duel: what a whole Active's HP is worth (a Knock Out is the game, so chip damage counts
 * much more than a share of one Prize), and what a draw is worth to the AI (it never aims for one:
 * worse than any ordinary position, better than a loss).
 */
const LUCKY_DUEL_HP_VALUE = 1200;
const LUCKY_DUEL_DRAW = -GAME_WON / 4;

// ============================================================================
// Board reading
// ============================================================================

export const activeOf = (v: GameState, side: Rel): PokemonInPlay | null =>
  side === "player" ? v.playerActivePokemon : v.opponentActivePokemon;
export const benchOf = (v: GameState, side: Rel): PokemonInPlay[] => (side === "player" ? v.playerBench : v.opponentBench);
export const inPlayOf = (v: GameState, side: Rel): PokemonInPlay[] =>
  [activeOf(v, side), ...benchOf(v, side)].filter((p): p is PokemonInPlay => p != null);
export const other = (side: Rel): Rel => (side === "player" ? "opponent" : "player");

/** The view with `side` as "player" (engine helpers assume the attacker is "player"). */
export const asPlayer = (v: GameState, side: Rel): GameState => (side === "player" ? v : swapSides(v));

export function cardOf(v: GameState, p: PokemonInPlay): PokemonCard | undefined {
  return getEffectivePokemonCard(v, p);
}

export function hpLeft(v: GameState, p: PokemonInPlay): number {
  return Math.max(0, getEffectiveHp(v, p) - (p.currentDamage ?? 0));
}

export function energyUnits(p: PokemonInPlay): number {
  return p.attachedEnergy.reduce((sum, e) => sum + getEnergyValue(e), 0);
}

/** Prize cards the other player takes when this Pokémon is Knocked Out (`v`: the table's noPrizeFor rule too). */
export function prizesFor(p: PokemonInPlay, v?: GameState): number {
  return givesPrizeWhenKnockedOut(p, v) ? 1 : 0;
}

// ============================================================================
// Energy
// ============================================================================

let basicTypes: EnergyType[] | null = null;

/** Basic Energy types an Energy card can pay (Rainbow: every type; DCE: none). */
function providedTypes(card: GameCard): EnergyType[] {
  basicTypes ??= [EnergyType.Grass, EnergyType.Fire, EnergyType.Water, EnergyType.Lightning, EnergyType.Psychic, EnergyType.Fighting];
  const types: EnergyType[] = [];
  for (const type of basicTypes) {
    if (energyProvidesType(card, type)) types.push(type);
  }
  return types;
}

/**
 * Energy units still missing to pay `cost` with `energies` (0 = payable). Typed costs take the
 * most specific card first; what's left (DCE counts 2) pays Colorless.
 */
export function missingForCost(cost: readonly EnergyType[], energies: readonly GameCard[]): number {
  const pool = energies.map((card) => ({ types: providedTypes(card), units: getEnergyValue(card), used: false }));
  pool.sort((a, b) => (a.types.length || 99) - (b.types.length || 99));
  let missing = 0;
  for (const type of cost) {
    if (type === EnergyType.Colorless) continue;
    const slot = pool.find((e) => !e.used && e.types.includes(type));
    if (slot) {
      slot.used = true;
      slot.units -= 1;
    } else missing++;
  }
  const colorless = cost.filter((t) => t === EnergyType.Colorless).length;
  const leftover = pool.reduce((sum, e) => sum + (e.used ? Math.max(0, e.units) : e.units), 0);
  return missing + Math.max(0, colorless - leftover);
}

/** Energy missing for attack `index` of `p` (0 when the engine says it is payable now). */
export function missingEnergy(v: GameState, side: Rel, p: PokemonInPlay, index: number): number {
  const w = asPlayer(v, side);
  const card = cardOf(w, p);
  // getAvailableAttacks indices (Recall's attacks follow the own ones)
  const attack = getAvailableAttacks(w, p)[index]?.attack;
  if (!card || !attack) return 99;
  if (canUseAttack(p, index, undefined, w)) return 0;
  return Math.max(1, missingForCost(attack.cost, p.attachedEnergy));
}

// ============================================================================
// Damage
// ============================================================================

export type DamageOutcome = { p: number; damage: number };

const COIN_LIMIT = 8;

/** Coin outcomes of an attack's own coins, by number of heads (heads first). */
function coinOutcomes(count: number | "untilTails"): { p: number; coins: CoinFlipResult[] }[] {
  if (count === "untilTails") {
    const outcomes: { p: number; coins: CoinFlipResult[] }[] = [];
    for (let heads = 0; heads <= 6; heads++) {
      outcomes.push({ p: heads === 6 ? Math.pow(0.5, 6) : Math.pow(0.5, heads + 1), coins: [...Array(heads).fill("heads"), "tails"] });
    }
    return outcomes;
  }
  const n = Math.min(count, COIN_LIMIT);
  if (n === 0) return [{ p: 1, coins: [] }];
  const outcomes: { p: number; coins: CoinFlipResult[] }[] = [];
  let combinations = 1;
  for (let heads = 0; heads <= n; heads++) {
    if (heads > 0) combinations = (combinations * (n - heads + 1)) / heads;
    outcomes.push({ p: combinations / Math.pow(2, n), coins: [...Array(heads).fill("heads"), ...Array(n - heads).fill("tails")] });
  }
  return outcomes;
}

const hasEffect = (attack: Attack, type: string) => (attack.effects ?? []).some((e) => e.type === type);

/** A Defending Haunter with a working Transparency: heads prevents everything (½). */
function transparencyChance(w: GameState, defender: PokemonInPlay): number {
  const power = isPokemonCard(defender.pokemon) ? defender.pokemon.power : undefined;
  return power?.type === PokemonPowerType.PreventAttackOnFlip && isPowerActive(w, defender) ? 0.5 : 0;
}

/**
 * Damage `attack` of `attacker` (side `side`) does to `defender`, as a distribution over coin
 * outcomes: base damage (coins, bonuses), Weakness / Resistance, PlusPower (+ `extraPlusPower`),
 * Defender, next-turn reductions, Kabuto Armor, protection and damage barriers. Mirrors the
 * damage step of executeAttack; other effects (status, bench damage) are not included.
 */
export function attackDamage(
  v: GameState,
  side: Rel,
  attacker: PokemonInPlay,
  attack: Attack,
  defender: PokemonInPlay,
  extraPlusPower = 0
): DamageOutcome[] {
  if (!threatCache) return computeAttackDamage(v, side, attacker, attack, defender, extraPlusPower);
  const key = `dmg|${side}|${boardKey(v)}|${signature(attacker)}|${attack.name}|${signature(defender)}|${extraPlusPower}`;
  const cached = damageCache.get(key);
  if (cached) return cached;
  const outcomes = computeAttackDamage(v, side, attacker, attack, defender, extraPlusPower);
  damageCache.set(key, outcomes);
  return outcomes;
}

function computeAttackDamage(
  v: GameState,
  side: Rel,
  attacker: PokemonInPlay,
  attack: Attack,
  defender: PokemonInPlay,
  extraPlusPower: number
): DamageOutcome[] {
  const w = asPlayer(v, side);
  const attackerCard = cardOf(w, attacker);
  const defenderCard = cardOf(w, defender);
  if (!attackerCard || !defenderCard) return [{ p: 1, damage: 0 }];
  // Drag Off / Stare...: the damage goes to a chosen target, not through the normal damage step
  if (hasEffect(attack, AttackEffectType.ChooseTargetDamage)) return [{ p: 1, damage: 0 }];

  const outcomes = new Map<number, number>();
  const add = (p: number, damage: number) => outcomes.set(damage, (outcomes.get(damage) ?? 0) + p);
  // Sand-attack / Smokescreen and Transparency: the attack does nothing half of the time
  let doesSomething = attacker.mustFlipToAttack ? 0.5 : 1;
  doesSomething *= 1 - transparencyChance(w, defender);
  if (doesSomething < 1) add(1 - doesSomething, 0);

  const mirrorMove = hasEffect(attack, AttackEffectType.MirrorMove);
  const ignoresDefender = hasEffect(attack, AttackEffectType.IgnoreDefenderEffects);
  const ignoresWR = mirrorMove || (attack.effects ?? []).some((e) => e.type === AttackEffectType.IgnoreWeaknessResistance && !e.resistanceOnly);
  // Hook Shot: no Resistance
  const ignoresResistance = stadiumIgnoresResistance(w, attacker) || hasEffect(attack, AttackEffectType.IgnoreWeaknessResistance);
  const attackerType = attacker.shiftedType ?? attackerCard.types[0];
  const weaknesses = defender.modifiedWeakness ? [defender.modifiedWeakness] : defenderCard.weaknesses ?? [];
  const resistances = defender.modifiedResistance ? [defender.modifiedResistance] : defenderCard.resistances ?? [];
  const plusPower =
    attackBonusFromModifiers(w, attacker) + extraPlusPower * 10;
  const defenderMinus = modifierDefenderReduction(w, defender);
  const attackerView = { ...attacker, pokemon: attackerCard };
  const defenderView = { ...defender, pokemon: defenderCard };

  for (const outcome of coinOutcomes(coinFlipCountFor(attacker, attack, w))) {
    let damage: number;
    if (mirrorMove) {
      damage = attacker.lastDamageReceived ?? 0;
    } else {
      const resolved = attack.effects?.some((e) => e.coinFlip)
        ? { ...attack, effects: resolveCoinFlipEffects(attack.effects ?? [], outcome.coins).effects }
        : attack;
      // Dive Bomb / Clamp: tails = nothing at all
      if (outcome.coins.length > 0 && (attack.effects ?? []).some((e) => e.type === AttackEffectType.AttackFails && e.coinFlip)) {
        const fails = !(resolved.effects ?? []).every((e) => e.type !== AttackEffectType.AttackFails);
        if (fails) {
          add(outcome.p * doesSomething, 0);
          continue;
        }
      }
      damage = calculateBaseDamage(attackerView, defenderView, resolved, w.playerBench, w.opponentBench).damage;
      // Focus Energy (Lt. Surge's Raticate): this turn the attack's base damage is doubled
      if (attacker.doubledAttack?.onTurn === w.turnNumber && attacker.doubledAttack.name === attack.name) damage *= 2;
      if (damage > 0) damage += getConfusedDamageBonus(w, attacker) + (attacker.nextTurnBonusDamage ?? 0);
    }
    if (!ignoresWR && damage > 0 && attackerType) {
      if (weaknesses.includes(attackerType) && !stadiumIgnoresWeakness(w, attackerType, defender)) damage *= 2;
      if (resistances.includes(attackerType) && !ignoresResistance) damage = Math.max(0, damage - resistanceAmount(w));
    }
    if (plusPower > 0 && damage > 0) damage += plusPower;
    if (defenderMinus > 0) damage = Math.max(0, damage - defenderMinus);
    if (defender.nextTurnDamageReduction && damage > 0) damage = Math.max(0, damage - defender.nextTurnDamageReduction);
    // Kabuto Armor / Deflector, Shell Armor, Strange Barrier (Swift ignores them all)
    if (!ignoresDefender) damage = applyAttackDamageReductions(defender, damage, w, attacker);
    if (protectionBlocksDamage(defender, damage) || isDamageBlocked(defender, damage, w)) damage = 0;
    add(outcome.p * doesSomething, damage);
  }
  return [...outcomes.entries()].map(([damage, p]) => ({ p, damage }));
}

export const expectedDamage = (outcomes: DamageOutcome[]) => outcomes.reduce((sum, o) => sum + o.p * o.damage, 0);
export const knockOutChance = (outcomes: DamageOutcome[], hp: number) =>
  hp <= 0 ? 1 : outcomes.reduce((sum, o) => sum + (o.damage >= hp ? o.p : 0), 0);

export type Threat = { attackIndex: number; ko: number; expected: number };
const NO_THREAT: Threat = { attackIndex: -1, ko: 0, expected: 0 };

/** Chance that `p` can attack at all on its owner's next turn (statuses). */
export function attackReadiness(p: PokemonInPlay, nextTurnOfOwner: boolean): number {
  if (hasStatusCondition(p, StatusCondition.Paralyzed)) return 0;
  // Leer / Tail Wag style "can't attack during your next turn"
  if (hasStatusCondition(p, StatusCondition.CannotAttack)) return nextTurnOfOwner ? 0 : 1;
  let chance = 1;
  if (hasStatusCondition(p, StatusCondition.Asleep)) chance *= 0.5;
  if (hasStatusCondition(p, StatusCondition.Confused)) chance *= 0.5;
  return chance;
}

/**
 * Energy a side may attach before its next attack: the AI knows its own Energy cards; for the
 * other side only the hand size is public, so a needed Energy is there with some odds.
 */
export type Extra = { units: number; odds: number; cards?: GameCard[] };
export const NO_EXTRA: Extra = { units: 0, odds: 1 };

/** Chance that one card of the other side's hand (or its next draw) is the Energy it needs. */
const ENERGY_PER_CARD = 0.15;

export function nextTurnExtra(v: GameState, side: Rel): Extra {
  if (side === "player") {
    const cards = v.playerHand.filter(isEnergyCard);
    return cards.length > 0 ? { units: 1, odds: 1, cards } : NO_EXTRA;
  }
  const cards = v.opponentHand.length + (v.opponentDeck.length > 0 ? 1 : 0);
  return cards > 0 ? { units: 1, odds: 1 - Math.pow(1 - ENERGY_PER_CARD, cards) } : NO_EXTRA;
}

/**
 * Best attack `attacker` (of `side`) can use against `defender` with its Energy plus one
 * more attachment (`extra`): KO chance and expected damage, scaled by the odds of having that
 * Energy and by `readiness` (statuses).
 */
export function bestThreat(v: GameState, side: Rel, attacker: PokemonInPlay, defender: PokemonInPlay, extra: Extra, readiness = 1): Threat {
  if (readiness <= 0 || isTrainerInPlay(attacker.pokemon)) return NO_THREAT;
  if (threatCache) {
    const key = `${side}|${boardKey(v)}|${signature(attacker)}|${signature(defender)}|${extraKey(extra)}|${readiness}`;
    const cached = threatCache.get(key);
    if (cached) return cached;
    const threat = computeThreat(v, side, attacker, defender, extra, readiness);
    threatCache.set(key, threat);
    return threat;
  }
  return computeThreat(v, side, attacker, defender, extra, readiness);
}

/** What a Pokémon in play is, for the caches (identity, damage, Energy, statuses, protection). */
const signatures = new WeakMap<PokemonInPlay, string>();

function signature(p: PokemonInPlay): string {
  let sig = signatures.get(p);
  if (sig === undefined) {
    sig = computeSignature(p);
    signatures.set(p, sig);
  }
  return sig;
}

function computeSignature(p: PokemonInPlay): string {
  return `${p.pokemon.id}:${p.currentDamage ?? 0}:${p.attachedEnergy.map((e) => e.id).join(",")}:${(p.statusConditions ?? []).join(",")}:${p.protection?.type ?? ""}:${p.mustFlipToAttack ? 1 : 0}`;
}

const extraKeys = new WeakMap<Extra, string>();

function extraKey(extra: Extra): string {
  let key = extraKeys.get(extra);
  if (key === undefined) {
    key = `${extra.units}:${extra.odds}:${extra.cards?.map((c) => c.id).join(",") ?? "-"}`;
    extraKeys.set(extra, key);
  }
  return key;
}

/** What else on the board changes damage: PlusPower / Defender in play, Bench sizes (bonus damage). */
const boardKeys = new WeakMap<GameState, string>();

function boardKey(v: GameState): string {
  let key = boardKeys.get(v);
  if (key === undefined) {
    key = `${v.playerBench.length}/${v.opponentBench.length}/${v.activeModifiers.map((m) => m.id).join(",")}`;
    boardKeys.set(v, key);
  }
  return key;
}

let threatCache: Map<string, Threat> | null = null;
const damageCache = new Map<string, DamageOutcome[]>();
const readinessCache = new Map<string, number>();

/**
 * Run `fn` with bestThreat / attackDamage / attack readiness memoized (by the Pokémon as they
 * are and boardKey): one AI decision scores many variations of the same board.
 */
export function withThreatCache<T>(fn: () => T): T {
  if (threatCache) return fn();
  threatCache = new Map();
  try {
    return fn();
  } finally {
    threatCache = null;
    damageCache.clear();
    readinessCache.clear();
  }
}

function computeThreat(v: GameState, side: Rel, attacker: PokemonInPlay, defender: PokemonInPlay, extra: Extra, readiness: number): Threat {
  const w = asPlayer(v, side);
  const card = cardOf(w, attacker);
  if (!card) return NO_THREAT;
  const hp = hpLeft(w, defender);
  let best = NO_THREAT;
  card.attacks.forEach((attack, index) => {
    if (hasEffect(attack, AttackEffectType.CopyAttack)) return;
    const missing = missingEnergy(w, "player", attacker, index);
    if (missing > extra.units) return;
    // Cost with the extra attachment, and requirements (Dream Eater: Asleep...) on the current board
    let powered: PokemonInPlay | undefined = attacker;
    let odds = 1;
    if (missing > 0) {
      const candidates = extra.cards ?? EXTRA_ENERGY.slice(0, extra.units);
      powered = candidates
        .map((e) => ({ ...attacker, attachedEnergy: [...attacker.attachedEnergy, e] }))
        .find((p) => canUseAttack(p, index, defender, w));
      odds = extra.cards ? 1 : extra.odds;
    } else if (!canUseAttack(attacker, index, defender, w)) powered = undefined;
    if (!powered) return;
    const outcomes = attackDamage(w, "player", powered, attack, defender);
    const scale = readiness * odds;
    const threat = { attackIndex: index, ko: knockOutChance(outcomes, hp) * scale, expected: expectedDamage(outcomes) * scale };
    if (threat.ko * 1000 + threat.expected > best.ko * 1000 + best.expected) best = threat;
  });
  return best;
}

/** Placeholder Energy for "one more attachment" requirement checks (Rainbow: any basic type). */
const EXTRA_ENERGY: GameCard[] = [0, 1].map(
  (i) =>
    ({
      id: `ai-extra-energy-${i}`,
      kind: "energy",
      name: "Rainbow Energy",
      number: 0,
      set: "team-rocket",
      rarity: "rare",
      energyType: EnergyType.Colorless,
      isBasic: false,
      providesAllTypes: true,
      provides: 1,
    }) as unknown as GameCard
);

// ============================================================================
// Board score
// ============================================================================

/**
 * Share of a Prize already "given away" by damage: damage is rarely healed in this format, so a
 * Pokémon at half HP is worth about 30% of a Prize less (chip damage counts toward a Knock Out).
 */
const HP_PRIZE_SHARE = 0.6;

/** Value of each HP point of `p` (what 10 damage costs its owner, divided by 10). */
function hpPointValue(v: GameState, p: PokemonInPlay): number {
  const maxHp = Math.max(10, getEffectiveHp(v, p));
  if (isLuckyDuel(v)) return LUCKY_DUEL_HP_VALUE / maxHp + 0.15;
  return (PRIZE * prizesFor(p, v) * HP_PRIZE_SHARE) / maxHp + 0.15;
}

/** Nominal strength of an attack (damage, + a bit for effects). */
export function attackPower(attack: Attack): number {
  let damage = 0;
  if (typeof attack.damage === "number") damage = attack.damage;
  else if (typeof attack.damage === "string") {
    const n = parseInt(attack.damage, 10) || 0;
    damage = attack.damage.endsWith("x") ? n * 1.5 : n;
  }
  const extras = (attack.effects ?? []).filter((e) =>
    [AttackEffectType.ApplyStatus, AttackEffectType.BenchDamage, AttackEffectType.ForceSwitch, AttackEffectType.Protection, AttackEffectType.ChooseTargetDamage].includes(e.type as never)
  ).length;
  return damage + extras * 10;
}

/** Nominal power of `attack` of `card` (of `side`) against the other side's Active (Weakness / Resistance). */
export function powerAgainst(v: GameState, side: Rel, card: PokemonCard, attack: Attack): number {
  let power = attackPower(attack);
  const target = activeOf(v, other(side));
  const defender = target ? cardOf(v, target) : undefined;
  const type = card.types[0];
  if (defender && type && power > 0) {
    if ((defender.weaknesses ?? []).includes(type) && !(target && stadiumIgnoresWeakness(v, type, target))) power *= 1.6;
    // Pewter City Gym: no Resistance against Pokémon with Brock in their names
    if ((defender.resistances ?? []).includes(type) && !stadiumIgnoresResistance(v, { pokemon: card })) power = Math.max(5, power - 25);
  }
  return power;
}

const sideOf = (v: GameState, p: PokemonInPlay): Rel =>
  v.opponentActivePokemon === p || v.opponentBench.includes(p) || v.opponentActivePokemon?.pokemon.id === p.pokemon.id || v.opponentBench.some((b) => b.pokemon.id === p.pokemon.id)
    ? "opponent"
    : "player";

/**
 * What the Energy attached to `p` is worth as attacking power: its best attack's power, scaled
 * by how much of the cost is already paid (an attacker 2 Energy short of a 60-damage attack is
 * worth much less than one ready to use it).
 */
export function attackReadinessValue(v: GameState, p: PokemonInPlay): number {
  if (!threatCache) return computeReadinessValue(v, p);
  const target = activeOf(v, other(sideOf(v, p)));
  const key = `${boardKey(v)}|${signature(p)}|${target ? signature(target) : "-"}`;
  const cached = readinessCache.get(key);
  if (cached !== undefined) return cached;
  const value = computeReadinessValue(v, p);
  readinessCache.set(key, value);
  return value;
}

function computeReadinessValue(v: GameState, p: PokemonInPlay): number {
  const side = sideOf(v, p);
  const card = cardOf(v, p);
  if (!card) return 0;
  let best = 0;
  card.attacks.forEach((attack, index) => {
    if (hasEffect(attack, AttackEffectType.CopyAttack)) return;
    const units = attack.cost.length;
    const missing = units === 0 ? 0 : missingEnergy(v, side, p, index);
    best = Math.max(best, powerAgainst(v, side, card, attack) * (1 - Math.min(missing, units) / (units + 1)));
  });
  return best;
}

/** Value of each card a Pokémon in play is made of (Basic + evolutions): a Prize matters more. */
const CARD_WORTH = 25;

/** Value of a Pokémon in play for its owner: cards invested, Energy (and what it can pay for) and HP left. */
export function pokemonWorth(v: GameState, p: PokemonInPlay): number {
  if (isTrainerInPlay(p.pokemon)) return 10;
  const cards = 1 + (p.previousEvolutions?.length ?? 0);
  return CARD_WORTH * cards + 12 * energyUnits(p) + 0.6 * attackReadinessValue(v, p) + hpLeft(v, p) * hpPointValue(v, p);
}

/** What `p` taking `damage` (without being Knocked Out) costs its owner. */
export function damageValue(v: GameState, p: PokemonInPlay, damage: number): number {
  return Math.min(Math.max(0, damage), hpLeft(v, p)) * hpPointValue(v, p);
}

/** What `p` being Knocked Out costs its owner: the Prize and everything it is worth. */
export function knockOutValue(v: GameState, p: PokemonInPlay): number {
  // Lucky Duel: the Knock Out of an Active ends the game
  if (isLuckyDuel(v)) return GAME_WON / 20;
  return PRIZE * prizesFor(p, v) + pokemonWorth(v, p);
}

/**
 * The Pokémon `side` would send in when it must promote: the one with the best threat
 * against the other side's Active (the human chooses well; the AI uses the same rule).
 */
export function bestPromotion(v: GameState, side: Rel): PokemonInPlay | null {
  const bench = benchOf(v, side);
  if (bench.length === 0) return null;
  const target = activeOf(v, other(side));
  let best = bench[0];
  let bestScore = -Infinity;
  for (const candidate of bench) {
    const threat = target ? bestThreat(v, side, candidate, target, nextTurnExtra(v, side)) : NO_THREAT;
    const score = threat.ko * 200 + threat.expected + hpLeft(v, candidate) * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/** Pending between-turns damage of a Pokémon (Poison). */
function poisonDamage(p: PokemonInPlay): number {
  return hasStatusCondition(p, StatusCondition.Poisoned) ? p.poisonDamage ?? 10 : 0;
}

/** Deck size under which every card drawn brings the deck-out loss closer (Lucky Duel). */
const LUCKY_DUEL_DECK_RESERVE = 10;

/**
 * evaluateBoard for a Lucky Duel: no Prizes, no Bench — the game is won by Knocking Out the other
 * Active (or by the other deck running out) and lost the same way. Scores the two Actives (cards,
 * Energy, attack readiness, HP left at a Knock-Out-is-the-game rate), both next-turn Knock Out
 * threats at the game's value, the hands, and how close each deck is to running out.
 */
function evaluateLuckyDuel(v: GameState): number {
  const mine = v.playerActivePokemon;
  const theirs = v.opponentActivePokemon;
  if (!theirs) return GAME_WON / 2;
  if (!mine) return -GAME_WON / 2;

  let score = pokemonWorth(v, mine) - pokemonWorth(v, theirs);
  score += 5 * Math.min(v.playerHand.length, 10) - 3 * Math.min(v.opponentHand.length, 10);
  // Decks: running out loses at the next draw; below the reserve every card counts
  if (v.playerDeck.length === 0) score -= 3000;
  score -= Math.max(0, LUCKY_DUEL_DECK_RESERVE - v.playerDeck.length) * 60;
  score += Math.max(0, LUCKY_DUEL_DECK_RESERVE - v.opponentDeck.length) * 20;

  // Their next turn: a Knock Out of my Active is the game
  const poison = poisonDamage(mine);
  const mineAfterPoison = poison > 0 ? { ...mine, currentDamage: (mine.currentDamage ?? 0) + poison } : mine;
  const threat = hpLeft(v, mine) - poison <= 0
    ? { attackIndex: -1, ko: 1, expected: 0 }
    : bestThreat(v, "opponent", theirs, mineAfterPoison, nextTurnExtra(v, "opponent"), attackReadiness(theirs, true));
  score -= threat.ko * (GAME_WON / 20) * 0.9;
  score -= (1 - threat.ko) * damageValue(v, mine, threat.expected) * 0.8;
  score -= damageValue(v, mine, poison);

  // My next turn (they move first, weighted lower)
  const myThreat = bestThreat(v, "player", mine, theirs, nextTurnExtra(v, "player"), attackReadiness(mine, true));
  score += myThreat.ko * (GAME_WON / 40) * 0.35 * (1 - threat.ko * 0.7);
  score += damageValue(v, theirs, myThreat.expected) * 0.15;
  score += damageValue(v, theirs, poisonDamage(theirs));

  if (hasStatusCondition(mine, StatusCondition.Paralyzed)) score -= 10;
  if (hasStatusCondition(mine, StatusCondition.Asleep)) score -= 8;
  if (hasStatusCondition(mine, StatusCondition.Confused)) score -= 10;
  if (hasStatusCondition(theirs, StatusCondition.Paralyzed)) score += 10;
  if (hasStatusCondition(theirs, StatusCondition.Asleep)) score += 8;
  if (hasStatusCondition(theirs, StatusCondition.Confused)) score += 10;
  return score;
}

/**
 * Heuristic score of a position at the END of the AI's turn (the human moves next), from the
 * AI's side ("player"). Higher is better for the AI.
 */
export function evaluateBoard(v: GameState): number {
  if (v.gameResult === "victory") return GAME_WON;
  if (v.gameResult === "defeat") return -GAME_WON;
  if (v.gameResult === "draw") return isLuckyDuel(v) ? LUCKY_DUEL_DRAW : 0;
  if (isLuckyDuel(v)) return evaluateLuckyDuel(v);

  const myPrizesLeft = v.playerPrizes.length - (v.playerCanTakePrize ? 1 : 0);
  const theirPrizesLeft = v.opponentPrizes.length - (v.opponentCanTakePrize ? 1 : 0);
  if (myPrizesLeft <= 0) return GAME_WON / 2;
  const theirSide = inPlayOf(v, "opponent");
  if (theirSide.length === 0) return GAME_WON / 2;
  const mySide = inPlayOf(v, "player");
  if (mySide.length === 0) return -GAME_WON / 2;

  let score = PRIZE * ((6 - myPrizesLeft) - (6 - theirPrizesLeft));
  // Each Prize matters more as the end gets closer
  score += 25 * (Math.max(0, 4 - myPrizesLeft) - Math.max(0, 4 - theirPrizesLeft));

  for (const p of mySide) score += pokemonWorth(v, p);
  for (const p of theirSide) score -= pokemonWorth(v, p);

  // Bench insurance: without Benched Pokémon a Knock Out of the Active loses the game
  const myBench = v.playerBench.length;
  const theirBench = v.opponentBench.length;
  score += myBench === 0 ? -60 : myBench === 1 ? -20 : 0;
  score -= theirBench === 0 ? -40 : theirBench === 1 ? -12 : 0;

  // Hands (resources); an empty deck loses at the next draw
  score += 5 * Math.min(v.playerHand.length, 10) - 3 * Math.min(v.opponentHand.length, 10);
  if (v.playerDeck.length === 0) score -= 3000;

  const mine = v.playerActivePokemon ?? bestPromotion(v, "player");
  const theirs = v.opponentActivePokemon ?? bestPromotion(v, "opponent");
  if (!mine || !theirs) return score;

  // --- Their next turn: can their Active (or a Benched attacker brought up) Knock Out mine?
  const poison = v.playerActivePokemon ? poisonDamage(mine) : 0;
  const mineHp = hpLeft(v, mine) - poison;
  const theirEnergy = nextTurnExtra(v, "opponent");
  const ready = v.opponentActivePokemon ? attackReadiness(theirs, true) : 1;
  const mineAfterPoison = poison > 0 ? { ...mine, currentDamage: (mine.currentDamage ?? 0) + poison } : mine;
  let threat = mineHp <= 0 ? { attackIndex: -1, ko: 1, expected: 0 } : bestThreat(v, "opponent", theirs, mineAfterPoison, theirEnergy, ready);
  // A Benched attacker may come up instead (retreat / Switch): weighted lower
  for (const benched of v.opponentBench) {
    if (benched === theirs) continue;
    const alt = bestThreat(v, "opponent", benched, mineAfterPoison, theirEnergy);
    if (alt.ko * 0.5 > threat.ko) threat = { attackIndex: alt.attackIndex, ko: alt.ko * 0.5, expected: Math.max(threat.expected, alt.expected * 0.5) };
  }
  const losesGame = myBench === 0 || theirPrizesLeft <= prizesFor(mine, v);
  score -= threat.ko * (losesGame ? GAME_WON / 20 : knockOutValue(v, mine)) * 0.9;
  score -= (1 - threat.ko) * damageValue(v, mine, threat.expected) * 0.8;
  score -= damageValue(v, mine, poison);

  // --- My next turn: can my Active Knock Out theirs? (they move first, so weighted lower)
  const myReady = attackReadiness(mine, true);
  const myThreat = bestThreat(v, "player", mine, theirs, nextTurnExtra(v, "player"), myReady);
  const winsGame = theirBench === 0 || myPrizesLeft <= prizesFor(theirs, v);
  score += myThreat.ko * (winsGame ? GAME_WON / 40 : knockOutValue(v, theirs)) * 0.35 * (1 - threat.ko * 0.7);
  score += damageValue(v, theirs, myThreat.expected) * 0.15;

  // Status of the Actives (beyond their effect on the threats above)
  if (hasStatusCondition(mine, StatusCondition.Paralyzed)) score -= 10;
  if (hasStatusCondition(mine, StatusCondition.Asleep)) score -= 8;
  if (hasStatusCondition(mine, StatusCondition.Confused)) score -= 10;
  if (hasStatusCondition(theirs, StatusCondition.Paralyzed)) score += 10;
  if (hasStatusCondition(theirs, StatusCondition.Asleep)) score += 8;
  if (hasStatusCondition(theirs, StatusCondition.Confused)) score += 10;
  if (v.opponentActivePokemon) score += damageValue(v, theirs, poisonDamage(theirs));

  // Retreat flexibility of my Active (a stuck, expensive Active is a liability)
  if (v.playerActivePokemon && !isTrainerInPlay(mine.pokemon)) score -= Math.max(0, getRetreatCost(mine, v.playerBench, v) - energyUnits(mine)) * 3;

  return score;
}
