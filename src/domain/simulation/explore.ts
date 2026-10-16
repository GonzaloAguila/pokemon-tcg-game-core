/**
 * Exploration bot: steers games toward what the run has exercised least, so rare cards,
 * attacks, powers and combinations show up (`--policy explore`).
 *
 * `ExploreMemory` is shared by a whole batch: the runner feeds it every action kind it
 * applies (both sides, any policy: "attack Pokémon: Attack", "playTrainer X", "usePower X",
 * "powerChoice X"...) and the explore policy adds the options it picks in selection steps.
 * Decisions therefore depend on the earlier games of the batch: a failure replays by running
 * the batch again from its first seed up to that game (the CLI prints the command).
 *
 * Everything still goes through the engine entry points (board actions, the effect registry,
 * executeAttack / executeMetronome with coin plans, executeRetreat): explore only chooses.
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { canExecuteAttack, canUseAttack, energyProvidesType } from "@/lib/gameState";
import { maxBenchSize } from "@/domain/board";
import type { Attack, Card, PokemonCard } from "@/domain/cards";
import { isEnergyCard, isPokemonCard } from "@/domain/cards";
import { EnergyType, PokemonPowerType, PokemonStage } from "@/domain/constants";
import {
  attachEnergyCard,
  canAttachEnergy,
  canPlayBasicPokemon,
  evolvePokemonCard,
  getEvolutionTargets,
  getTurnActionBlocker,
  playBasicPokemon,
} from "@/domain/board";
import { ACTIVATED_POWER_TYPES, minSelectionsOf, type SelectionStep } from "@/domain/effects";
import { getEffectivePokemonCard } from "@/domain/powers";
import { attackAction, attackName, legalActions, retreatTo, type Policy, type ViewAction } from "./policies";
import { pick, randomInt, shuffled, type Rng } from "./rng";

/** Usage counts of a batch, by action kind (same keys as GameOutcome.actionCounts). */
export class ExploreMemory {
  private readonly counts = new Map<string, number>();

  count(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  bump(key: string, by = 1): void {
    this.counts.set(key, this.count(key) + by);
  }

  /** Lowest count among the keys (Infinity for none) */
  min(keys: readonly string[]): number {
    return keys.reduce((low, key) => Math.min(low, this.count(key)), Infinity);
  }
}

/**
 * What a card offers to exercise: its attacks, its activated / on-play power, or the
 * Trainer itself (keys as counted by the runner).
 */
export function exploreKeys(card: Card): string[] {
  if (card.kind === "trainer") return [card.playsAsBasic ? `benchTrainer ${card.name}` : `playTrainer ${card.name}`];
  if (!isPokemonCard(card)) return [];
  const keys = card.attacks.map((a) => `attack ${card.name}: ${a.name}`);
  if (card.power && ACTIVATED_POWER_TYPES.includes(card.power.type)) keys.push(`usePower ${card.power.name}`);
  if (card.power?.type === PokemonPowerType.OnPlayFromHand) keys.push(`powerChoice ${card.power.name}`);
  return keys;
}

/** How little the run has used what this card offers (lower = more interesting). */
export function cardRarity(memory: ExploreMemory, card: Card): number {
  return memory.min(exploreKeys(card));
}

/** Pick the item with the lowest score, random among ties. */
function lowest<T>(rng: Rng, items: readonly T[], score: (item: T) => number): T | undefined {
  let best: T[] = [];
  let bestScore = Infinity;
  for (const item of items) {
    const s = score(item);
    if (s < bestScore) {
      bestScore = s;
      best = [item];
    } else if (s === bestScore) best.push(item);
  }
  return best.length > 0 ? pick(rng, best) : undefined;
}

const OPTIONAL_REPEATS_PER_TURN = 3;

export function createExplorePolicy(memory: ExploreMemory): Policy {
  let turnKey = "";
  let doneWithOptional = false;
  let heldThisTurn = false;
  const usesThisTurn = new Map<string, number>();

  const attackKey = (card: PokemonCard, attack: Attack) => `attack ${card.name}: ${attack.name}`;
  const ownInPlay = (view: GameState) => [view.playerActivePokemon, ...view.playerBench].filter((p): p is PokemonInPlay => p != null);
  const cardOf = (view: GameState, p: PokemonInPlay) => getEffectivePokemonCard(view, p);

  /** Least-used attack this Pokémon could pay now (energy only), as its count */
  const readyRarity = (view: GameState, p: PokemonInPlay): number => {
    const card = cardOf(view, p);
    if (!card) return Infinity;
    let low = Infinity;
    card.attacks.forEach((attack, i) => {
      if (canUseAttack(p, i, undefined, view)) low = Math.min(low, memory.count(attackKey(card, attack)));
    });
    return low;
  };

  /** The least-used attack it can't pay yet (what Energy should go to), or null */
  const unpaidTarget = (view: GameState, p: PokemonInPlay): { attack: Attack; count: number } | null => {
    const card = cardOf(view, p);
    if (!card) return null;
    let best: { attack: Attack; count: number } | null = null;
    card.attacks.forEach((attack, i) => {
      if (canUseAttack(p, i, undefined, view)) return;
      const count = memory.count(attackKey(card, attack));
      if (!best || count < best.count) best = { attack, count };
    });
    return best;
  };

  /** Rarity of the line this card can still become (own hand + deck), for evolving */
  const lineRarity = (view: GameState, card: Card): number => {
    if (!isPokemonCard(card)) return Infinity;
    const own = [...view.playerHand, ...view.playerDeck];
    const seen = new Set<string>();
    const visit = (c: PokemonCard): number => {
      if (seen.has(c.name)) return Infinity;
      seen.add(c.name);
      let low = cardRarity(memory, c);
      for (const next of own) if (isPokemonCard(next) && next.evolvesFrom === c.name) low = Math.min(low, visit(next));
      return low;
    };
    return visit(card);
  };

  /** Energy from the hand to the Pokémon whose least-used attack still needs it */
  const attachAction = (view: GameState, rng: Rng): ViewAction | null => {
    const energies = view.playerHand.filter(isEnergyCard);
    if (energies.length === 0) return null;
    const targets = ownInPlay(view).filter((p) => energies.some((e) => canAttachEnergy(view, e.id, p.pokemon.id) === null));
    if (targets.length === 0) return null;
    const needy = targets
      .map((p) => ({ p, need: unpaidTarget(view, p) }))
      .filter((t): t is { p: PokemonInPlay; need: { attack: Attack; count: number } } => t.need !== null);
    // Ties go to the Active (it is the one that attacks next)
    const focus = lowest(rng, needy, (t) => t.need.count * 2 + (t.p === view.playerActivePokemon ? 0 : 1));
    const target = focus?.p ?? pick(rng, targets);
    const usable = energies.filter((e) => canAttachEnergy(view, e.id, target.pokemon.id) === null);
    if (usable.length === 0) return null;
    const cost = focus?.need.attack.cost ?? [];
    const typed = cost.filter((t) => t !== EnergyType.Colorless);
    const helping = usable.filter((e) => typed.some((t) => energyProvidesType(e, t)));
    const energy = pick(rng, helping.length > 0 ? helping : usable);
    return {
      label: `attach ${energy.name} to ${target.pokemon.name}`,
      run: (v) => attachEnergyCard(v, energy.id, target.pokemon.id),
    };
  };

  const evolveAction = (view: GameState, rng: Rng): ViewAction | null => {
    const options: { label: string; run: ViewAction["run"]; gain: number }[] = [];
    for (const card of view.playerHand) {
      if (!isPokemonCard(card) || card.stage === PokemonStage.Basic) continue;
      for (const targetId of getEvolutionTargets(view, card.id)) {
        const target = ownInPlay(view).find((p) => p.pokemon.id === targetId)!;
        const current = cardRarity(memory, target.pokemon);
        const next = lineRarity(view, card);
        // Evolve when the new line still has something the run used less (or as much)
        if (next <= current) {
          options.push({ label: `evolve into ${card.name}`, run: (v) => evolvePokemonCard(v, card.id, targetId), gain: next });
        }
      }
    }
    const best = lowest(rng, options, (o) => o.gain);
    return best ? { label: best.label, run: best.run } : null;
  };

  const optionalKey = (label: string) => label.replace(/ \(.*\)$/, "");

  /** Trainers, powers, discards from play: the least used one, taken with a novelty probability */
  const optionalAction = (view: GameState, rng: Rng, categories: Record<string, ViewAction[]>): ViewAction | null => {
    if (doneWithOptional) return null;
    const candidates = [
      ...(categories.trainer ?? []),
      ...(categories.power ?? []),
      ...(categories.discardFromPlay ?? []),
      ...(categories.bench ?? []).filter((a) => a.label.startsWith("benchTrainer ")),
    ].filter((a) => (usesThisTurn.get(optionalKey(a.label)) ?? 0) < OPTIONAL_REPEATS_PER_TURN);
    const chosen = lowest(rng, shuffled(rng, candidates), (a) => memory.count(optionalKey(a.label)));
    if (!chosen) return null;
    const count = memory.count(optionalKey(chosen.label));
    const probability = count === 0 ? 1 : Math.max(0.25, 1 / (1 + count / 25));
    if (rng() >= probability) {
      doneWithOptional = true;
      return null;
    }
    const key = optionalKey(chosen.label);
    usesThisTurn.set(key, (usesThisTurn.get(key) ?? 0) + 1);
    return chosen;
  };

  /** Retreat when a Benched Pokémon can pay an attack the run used less than the Active's */
  const retreatAction = (view: GameState, rng: Rng, categories: Record<string, ViewAction[]>): ViewAction | null => {
    if (!categories.retreat || !view.playerActivePokemon) return null;
    const activeReady = readyRarity(view, view.playerActivePokemon);
    const bench = view.playerBench.map((p, index) => ({ index, ready: readyRarity(view, p) }));
    const best = lowest(rng, bench, (b) => b.ready);
    if (!best || best.ready === Infinity || best.ready >= activeReady) return null;
    return retreatTo(view, best.index, rng);
  };

  const attackChoice = (view: GameState, rng: Rng): ViewAction | null => {
    const active = view.playerActivePokemon;
    const card = active ? cardOf(view, active) : undefined;
    if (!active || !card) return null;
    const legal = card.attacks.map((attack, index) => ({ attack, index })).filter(({ index }) => canExecuteAttack(view, index) === null);
    const best = lowest(rng, legal, ({ attack }) => memory.count(attackKey(card, attack)));
    if (!best) return null;
    // Now and then wait a turn for a less-used attack that still needs Energy
    const waiting = unpaidTarget(view, active);
    if (!heldThisTurn && waiting && waiting.count < memory.count(attackKey(card, best.attack)) && rng() < 0.5) {
      heldThisTurn = true;
      return null;
    }
    return attackAction(best.index, rng, attackName(view, best.index));
  };

  const answer = (step: SelectionStep, rng: Rng): string[] | null => {
    const enabled = step.options.filter((o) => !o.disabled);
    const min = minSelectionsOf(step);
    if (enabled.length < min) return null;
    const key = (label: string) => `choice ${step.title}: ${label}`;
    if (step.orderingCards) return shuffled(rng, enabled.map((o) => o.id)).slice(0, step.maxSelections);
    const upper = Math.min(step.maxSelections, enabled.length);
    const lower = Math.min(Math.max(min, Math.min(1, step.maxSelections)), upper);
    const count = lower + randomInt(rng, upper - lower + 1);
    const ranked = shuffled(rng, enabled).sort((a, b) => memory.count(key(a.label)) - memory.count(key(b.label)));
    const chosen = ranked.slice(0, count);
    for (const option of chosen) memory.bump(key(option.label));
    return chosen.map((o) => o.id);
  };

  return {
    name: "explore",
    setup(view, rng) {
      const basics = view.playerHand.filter((c) => canPlayBasicPokemon(view, c.id, "active") === null);
      const active = lowest(rng, shuffled(rng, basics), (c) => cardRarity(memory, c));
      if (!active) return [];
      const rest = basics.filter((c) => c !== active).slice(0, maxBenchSize(view, "player"));
      return [
        { label: `setup active ${active.name}`, run: (v) => playBasicPokemon(v, active.id, "active") },
        ...rest.map((card) => ({ label: `setup bench ${card.name}`, run: (v: GameState) => playBasicPokemon(v, card.id, "bench") })),
      ];
    },
    nextAction(view, rng, actionsThisTurn) {
      const key = `${view.turnNumber}`;
      if (key !== turnKey) {
        turnKey = key;
        doneWithOptional = false;
        heldThisTurn = false;
        usesThisTurn.clear();
      }
      if (getTurnActionBlocker(view)) return null;
      const categories = legalActions(view, rng, (step) => answer(step, rng));
      if (actionsThisTurn >= 40) return attackChoice(view, rng);
      const bench = (categories.bench ?? []).filter((a) => !a.label.startsWith("benchTrainer "));
      if (bench.length > 0) return pick(rng, bench);
      // Something the run never did (a Trainer, a power...) goes first
      const novel = [...(categories.trainer ?? []), ...(categories.power ?? []), ...(categories.discardFromPlay ?? [])].filter(
        (a) => memory.count(optionalKey(a.label)) === 0 && (usesThisTurn.get(optionalKey(a.label)) ?? 0) === 0
      );
      if (novel.length > 0) {
        const chosen = pick(rng, novel);
        usesThisTurn.set(optionalKey(chosen.label), 1);
        return chosen;
      }
      return (
        evolveAction(view, rng) ??
        attachAction(view, rng) ??
        optionalAction(view, rng, categories) ??
        retreatAction(view, rng, categories) ??
        attackChoice(view, rng)
      );
    },
    answer: (step, rng) => answer(step, rng),
    promotion(view, rng) {
      const bench = view.playerBench.map((p, index) => ({ index, ready: readyRarity(view, p), any: cardRarity(memory, p.pokemon) }));
      return lowest(rng, bench, (b) => Math.min(b.ready, b.any + 1))?.index ?? 0;
    },
    prize: (view, rng) => randomInt(rng, view.playerPrizes.length),
  };
}
