/**
 * AI Actions - Generic Side-Agnostic Game Actions
 *
 * Funciones puras para ejecutar acciones del juego independientes del lado.
 * Usadas tanto por el jugador como por la IA.
 */

import type { GameState, GameCard, PokemonInPlay } from "@/domain/match";
import {
  canUseAttack,
  hasEnoughEnergyToRetreat,
  canRetreat,
  getRetreatCost,
  getTotalEnergyValue,
  clearStatusConditionsOnRetreat,
  protectionBlocksDamage,
  calculateBaseDamage,
} from "@/domain/match";
import type { Attack } from "@/domain/cards";
import { isPokemonCard, isEnergyCard, isPlayableAsBasic } from "@/domain/cards";
import { PokemonStage, AttackEffectType } from "@/domain/constants";
import {
  canPlayBasicPokemon,
  playBasicPokemon,
  canAttachEnergy,
  attachEnergyCard,
  canEvolve,
  evolvePokemonCard,
  getEvolutionTargets,
  swapSides,
} from "@/domain/board";
import type { Side } from "./types";
import { resolveOwnPowerChoice } from "./pending";
import { getEffectivePokemonCard } from "@/domain/powers";

/** Getters para acceder al estado según el lado */
function getHand(state: GameState, side: Side): GameCard[] {
  return side === "player" ? state.playerHand : state.opponentHand;
}

function getActivePokemon(state: GameState, side: Side): PokemonInPlay | null {
  return side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
}

function getBench(state: GameState, side: Side): PokemonInPlay[] {
  return side === "player" ? state.playerBench : state.opponentBench;
}

function getDiscard(state: GameState, side: Side): GameCard[] {
  return side === "player" ? state.playerDiscard : state.opponentDiscard;
}

/**
 * Run an engine board action (which always acts for "player") for `side`: swap
 * perspective for the opponent, then rewrite the new log lines from the human's point of
 * view. Illegal actions leave the state unchanged (the AI plans on a simulated state).
 */
export function actAs(
  state: GameState,
  side: Side,
  isLegal: (s: GameState) => string | null,
  action: (s: GameState) => GameState
): GameState {
  const acting = side === "player" ? state : swapSides(state);
  if (isLegal(acting) !== null) return state;
  if (side === "player") return action(acting);
  const result = swapSides(action(acting));
  const before = state.events.length;
  return {
    ...result,
    events: [...result.events.slice(0, before), ...result.events.slice(before).map((event) => ({
      ...event,
      message: toOpponentMessage(event.message),
    }))],
  };
}

/**
 * Log lines of Trainers / retreats written for "player" that name a side, rewritten for the
 * human when the AI played them (most specific first).
 */
const OPPONENT_REWRITES: [RegExp, string][] = [
  [/^Descartaste 2 cartas y buscaste 1 carta de tu mazo$/, "Rival descartó 2 cartas y buscó 1 carta de su mazo"],
  [/^Descartaste 2 cartas y recuperaste (.+) del descarte$/, "Rival descartó 2 cartas y recuperó $1 del descarte"],
  [/^Descartaste (\d+ cartas?) de tu mano$/, "Rival descartó $1 de su mano"],
  [/^Descartaste 1 energía propia y (.+)$/, "Rival descartó 1 energía propia y $1"],
  [/^Descartaste (.+)$/, "Rival descartó $1"],
  [/^Barajaste (\d+ Trainers?) en tu mazo$/, "Rival barajó $1 en su mazo"],
  [/^El rival barajó (\d+ Trainers?) en su mazo$/, "Barajaste $1 en tu mazo"],
  [/^El rival barajó su mano en su mazo y robó (\d+) cartas$/, "Barajaste tu mano en tu mazo y robaste $1 cartas"],
  [/^Barajaste (\d+) cartas en tu mazo$/, "Rival barajó $1 cartas en su mazo"],
  [/^Reordenaste las (\d+) cartas superiores de tu mazo$/, "Rival reordenó las $1 cartas superiores de su mazo"],
  [/^Salió cara — encontraste (.+) en tu mazo$/, "Salió cara — Rival encontró $1 en su mazo"],
  [/^Intercambiaste (.+) por (.+) de tu mazo$/, "Rival intercambió $1 por $2 de su mazo"],
  [/^(.+) es ahora tu Pokémon activo$/, "$1 es ahora el Pokémon activo del rival"],
  [/^(.+) del rival fue forzado a salir como Pokémon activo$/, "Tu $1 fue forzado a salir como Pokémon activo"],
  [/^Se descartó 1 energía de (.+) del rival$/, "Se descartó 1 energía de tu $1"],
];

/** Board-action log lines written for "player", as seen by the human when the AI acts. */
export function toOpponentMessage(message: string): string {
  for (const [pattern, replacement] of OPPONENT_REWRITES) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  if (message.startsWith("Colocaste ")) return `Rival colocó ${message.slice("Colocaste ".length)}`;
  if (message.startsWith("Jugaste ")) return `Rival jugó ${message.slice("Jugaste ".length)}`;
  if (message.startsWith("Robaste ")) return `Rival robó ${message.slice("Robaste ".length)}`;
  if (message.startsWith("Adjuntaste ")) return `Rival adjuntó ${message.slice("Adjuntaste ".length)}`;
  if (message.startsWith("Rain Dance:")) return `Rival usó ${message}`;
  return message;
}

/**
 * Jugar un Pokemon básico como activo (engine rules: only during setup)
 */
export function playBasicToActive(
  state: GameState,
  side: Side,
  cardId: string
): GameState {
  return actAs(
    state,
    side,
    (s) => canPlayBasicPokemon(s, cardId, "active"),
    (s) => playBasicPokemon(s, cardId, "active")
  );
}

/**
 * Jugar un Pokemon básico en la banca (se agrega al final; benchIndex se conserva por compatibilidad)
 */
export function playBasicToBench(
  state: GameState,
  side: Side,
  cardId: string,
  _benchIndex?: number
): GameState {
  return actAs(
    state,
    side,
    (s) => canPlayBasicPokemon(s, cardId, "bench"),
    (s) => playBasicPokemon(s, cardId, "bench")
  );
}

/**
 * Adjuntar una energía a un Pokemon (engine rules: one per turn, Rain Dance)
 */
export function attachEnergy(
  state: GameState,
  side: Side,
  energyCardId: string,
  targetPokemonId: string,
  _isBench?: boolean,
  _benchIndex?: number
): GameState {
  return actAs(
    state,
    side,
    (s) => canAttachEnergy(s, energyCardId, targetPokemonId),
    (s) => attachEnergyCard(s, energyCardId, targetPokemonId)
  );
}

/**
 * Evolucionar un Pokemon
 */
export function evolve(
  state: GameState,
  side: Side,
  evolutionCardId: string,
  targetIndex: number // -1 = activo, 0-4 = banca
): GameState {
  const target = targetIndex === -1 ? getActivePokemon(state, side) : getBench(state, side)[targetIndex];
  if (!target) return state;
  const targetPokemonId = target.pokemon.id;
  return actAs(
    state,
    side,
    (s) => canEvolve(s, evolutionCardId, targetPokemonId),
    // The AI answers its own "when you play it from your hand" power right away
    (s) => resolveOwnPowerChoice(evolvePokemonCard(s, evolutionCardId, targetPokemonId))
  );
}

/**
 * Obtener los básicos en la mano. A Trainer played as a Basic (Mysterious Fossil, Clefairy
 * Doll) is only offered when the hand has no other Basic Pokémon, or holds a Pokémon that
 * evolves from it (Aerodactyl, Kabuto, Omanyte): it has no attacks and can't retreat.
 */
export function getBasicPokemonInHand(state: GameState, side: Side): GameCard[] {
  const hand = getHand(state, side);
  const basics = hand.filter((c) => isPokemonCard(c) && c.stage === PokemonStage.Basic);
  const playedAsBasic = hand.filter(
    (c) =>
      c.kind === "trainer" &&
      isPlayableAsBasic(c) &&
      (basics.length === 0 || hand.some((h) => isPokemonCard(h) && h.evolvesFrom === c.name))
  );
  return [...basics, ...playedAsBasic];
}

/** HP of a card put into play as a Basic (the printed HP of a Mysterious Fossil). */
export function basicHp(card: GameCard): number {
  if (isPokemonCard(card)) return card.hp;
  return card.kind === "trainer" ? card.playsAsBasic?.hp ?? 0 : 0;
}

/**
 * Obtener las energías en la mano
 */
export function getEnergiesInHand(state: GameState, side: Side): GameCard[] {
  const hand = getHand(state, side);
  return hand.filter((c) => isEnergyCard(c));
}

/**
 * Obtener evoluciones jugables en la mano (targets: -1 = activo, 0-4 = banca)
 */
export function getPlayableEvolutions(
  state: GameState,
  side: Side
): Array<{ card: GameCard; targets: number[] }> {
  const acting = side === "player" ? state : swapSides(state);
  const evolutions: Array<{ card: GameCard; targets: number[] }> = [];

  for (const card of acting.playerHand) {
    if (!isPokemonCard(card)) continue;
    if (card.stage !== PokemonStage.Stage1 && card.stage !== PokemonStage.Stage2) continue;

    const targets = getEvolutionTargets(acting, card.id).map((pokemonId) =>
      acting.playerActivePokemon?.pokemon.id === pokemonId
        ? -1
        : acting.playerBench.findIndex((p) => p?.pokemon.id === pokemonId)
    );
    if (targets.length > 0) {
      evolutions.push({ card, targets });
    }
  }

  return evolutions;
}

/**
 * Obtener el primer slot vacío en la banca
 */
export function getFirstEmptyBenchSlot(state: GameState, side: Side): number {
  const bench = getBench(state, side);
  for (let i = 0; i < 5; i++) {
    if (!bench[i]) return i;
  }
  return -1; // Banca llena
}

/**
 * Base damage estimate shared by canKnockOut / estimateAttackDamage.
 * Uses the engine's calculateBaseDamage (Flail, Rage, Meditate, Karate Chop, bench bonuses...).
 * Coin-flip damage attacks are resolved outside the engine, so they keep the nominal
 * per-heads value as a rough estimate.
 */
function estimateBaseDamage(
  state: GameState,
  side: Side,
  attacker: PokemonInPlay,
  defender: PokemonInPlay,
  attack: Attack
): number {
  const hasCoinFlipDamage = attack.effects?.some(e => e.type === AttackEffectType.CoinFlipDamage);
  if (hasCoinFlipDamage) {
    if (typeof attack.damage === "number") return attack.damage;
    const numMatch = typeof attack.damage === "string" ? attack.damage.match(/(\d+)/) : null;
    return numMatch ? parseInt(numMatch[1], 10) : 0;
  }
  return calculateBaseDamage(attacker, defender, attack, getBench(state, side)).damage;
}

/**
 * Verificar si un ataque puede noquear al defensor
 */
export function canKnockOut(
  state: GameState,
  side: Side,
  attackIndex: number
): boolean {
  const attacker = getActivePokemon(state, side);
  const defender = getActivePokemon(state, side === "player" ? "opponent" : "player");

  if (!attacker || !defender) return false;
  // Effective cards: a transformed Ditto is a copy of the other Active
  const attackerCard = getEffectivePokemonCard(state, attacker);
  const defenderCard = getEffectivePokemonCard(state, defender);
  if (!attackerCard || !defenderCard) return false;

  const attack = attackerCard.attacks[attackIndex];
  if (!attack) return false;

  // Check for MirrorMove: damage comes from lastDamageReceived, no weakness/resistance
  const hasMirrorMove = attack.effects?.some(e => e.type === AttackEffectType.MirrorMove);
  if (hasMirrorMove) {
    const mirrorDamage = attacker.lastDamageReceived ?? 0;
    const defenderRemainingHP = defenderCard.hp - (defender.currentDamage || 0);
    return mirrorDamage >= defenderRemainingHP;
  }

  // Calcular daño base
  let damage = estimateBaseDamage(state, side, { ...attacker, pokemon: attackerCard }, { ...defender, pokemon: defenderCard }, attack);

  // Aplicar debilidad
  const hasWeakness = defenderCard.weaknesses?.includes(attackerCard.types[0]) ?? false;
  if (hasWeakness) {
    damage *= 2;
  }

  // Aplicar resistencia
  const hasResistance = defenderCard.resistances?.includes(attackerCard.types[0]) ?? false;
  if (hasResistance) {
    damage = Math.max(0, damage - 30);
  }

  // Check defender protection (full or threshold-based)
  if (protectionBlocksDamage(defender, damage)) {
    return false;
  }

  const defenderRemainingHP = defenderCard.hp - (defender.currentDamage || 0);
  return damage >= defenderRemainingHP;
}

/**
 * Calcular daño estimado de un ataque
 */
export function estimateAttackDamage(
  state: GameState,
  side: Side,
  attackIndex: number
): number {
  const attacker = getActivePokemon(state, side);
  const defender = getActivePokemon(state, side === "player" ? "opponent" : "player");

  if (!attacker || !defender) return 0;
  const attackerCard = getEffectivePokemonCard(state, attacker);
  const defenderCard = getEffectivePokemonCard(state, defender);
  if (!attackerCard || !defenderCard) return 0;

  const attack = attackerCard.attacks[attackIndex];
  if (!attack) return 0;

  // Check for MirrorMove: damage comes from lastDamageReceived, no weakness/resistance
  const hasMirrorMove = attack.effects?.some(e => e.type === AttackEffectType.MirrorMove);
  if (hasMirrorMove) {
    return attacker.lastDamageReceived ?? 0;
  }

  let damage = estimateBaseDamage(state, side, { ...attacker, pokemon: attackerCard }, { ...defender, pokemon: defenderCard }, attack);

  // Debilidad/resistencia
  const hasWeakness = defenderCard.weaknesses?.includes(attackerCard.types[0]) ?? false;
  if (hasWeakness) damage *= 2;

  const hasResistance = defenderCard.resistances?.includes(attackerCard.types[0]) ?? false;
  if (hasResistance) damage = Math.max(0, damage - 30);

  // Check defender protection (full or threshold-based)
  if (protectionBlocksDamage(defender, damage)) {
    return 0;
  }

  return damage;
}

/**
 * Obtener todos los ataques usables del Pokemon activo
 */
export function getUsableAttacks(
  state: GameState,
  side: Side
): Array<{ index: number; damage: number; knocksOut: boolean }> {
  const activePokemon = getActivePokemon(state, side);
  const activeCard = activePokemon ? getEffectivePokemonCard(state, activePokemon) : undefined;
  if (!activePokemon || !activeCard) return [];

  const usableAttacks: Array<{ index: number; damage: number; knocksOut: boolean }> = [];
  // Passing the defender also enforces attack requirements (Dream Eater needs it Asleep)
  const defender = getActivePokemon(state, side === "player" ? "opponent" : "player");

  for (let i = 0; i < activeCard.attacks.length; i++) {
    if (canUseAttack(activePokemon, i, defender, state)) {
      const damage = estimateAttackDamage(state, side, i);
      const knocksOut = canKnockOut(state, side, i);
      usableAttacks.push({ index: i, damage, knocksOut });
    }
  }

  return usableAttacks;
}

/**
 * Determinar la mejor energía para adjuntar a un Pokemon
 */
export function getBestEnergyTarget(
  state: GameState,
  side: Side
): { pokemonId: string; isBench: boolean; benchIndex?: number } | null {
  const activePokemon = getActivePokemon(state, side);
  const bench = getBench(state, side);
  const energies = getEnergiesInHand(state, side);

  if (energies.length === 0) return null;

  // Prioridad 1: Pokemon activo que le falta energía para atacar
  if (activePokemon && isPokemonCard(activePokemon.pokemon)) {
    const attacks = activePokemon.pokemon.attacks;
    for (const attack of attacks) {
      if (!canUseAttack(activePokemon, attacks.indexOf(attack))) {
        // Le falta energía, priorizar el activo
        return { pokemonId: activePokemon.pokemon.id, isBench: false };
      }
    }
  }

  // Prioridad 2: Pokemon en banca que le falta energía
  for (let i = 0; i < bench.length; i++) {
    const benchPokemon = bench[i];
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon)) {
      // Si tiene ataques y no puede usarlos, darle energía
      const attacks = benchPokemon.pokemon.attacks;
      for (const attack of attacks) {
        if (!canUseAttack(benchPokemon, attacks.indexOf(attack))) {
          return { pokemonId: benchPokemon.pokemon.id, isBench: true, benchIndex: i };
        }
      }
    }
  }

  // Prioridad 3: Si el activo puede atacar, igual darle más energía (para ataques futuros)
  if (activePokemon) {
    return { pokemonId: activePokemon.pokemon.id, isBench: false };
  }

  return null;
}
