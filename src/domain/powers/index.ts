/**
 * Pokemon Powers domain
 * Pure functions for using Pokemon Powers
 *
 * Rules:
 * - Powers can be used before attacking (attacking ends the turn)
 * - Multiple different powers can be used in the same turn
 * - Only Asleep, Confused and Paralyzed block power usage (Poisoned and Leer's CannotAttack do not)
 * - Powers work from bench unless they specify "while Active"
 * - If you have 2 Pokemon with the same power, each can use it
 * - Powers can be used the same turn you evolve
 */

import type { GameState, PokemonInPlay, GameCard } from "@/domain/match/types";
import type { PokemonPower, EnergyType, PokemonCard } from "@/domain/cards/types";
import { EnergyType as EnergyTypeEnum, PokemonPowerType, PokemonStage, StatusCondition } from "@/domain/constants";
import { createGameEvent, energyProvidesType } from "@/lib/gameState";
import { isPokemonCard, isEnergyCard, isTrainerInPlay, cardOutOfPlay } from "@/domain/cards";

export * from "./types";

// ============================================================================
// VALIDATION
// ============================================================================

/** Special conditions that stop Pokémon Powers (classic rule). Poison does NOT. */
const POWER_BLOCKING_STATUSES: ReadonlyArray<string> = [
  StatusCondition.Asleep,
  StatusCondition.Confused,
  StatusCondition.Paralyzed,
];

/**
 * Check if a Pokemon has a status condition that blocks powers (Asleep, Confused, Paralyzed)
 */
export function hasBlockingStatus(pokemon: PokemonInPlay): boolean {
  return (pokemon.statusConditions ?? []).some((s) => POWER_BLOCKING_STATUSES.includes(s));
}

/** Every Pokémon in play, both sides (Actives first). */
export function allPokemonInPlay(state: GameState): PokemonInPlay[] {
  return [state.playerActivePokemon, state.opponentActivePokemon, ...state.playerBench, ...state.opponentBench].filter(
    (p): p is PokemonInPlay => p != null
  );
}

/** Timed suppression in the state (Goop Gas Attack, Dark Arbok's Stare...). */
function hasTimedSuppression(state: GameState, pokemon: PokemonInPlay): boolean {
  return (state.powersSuppressed ?? []).some((s) => s.pokemonId === undefined || s.pokemonId === pokemon.pokemon.id);
}

/**
 * A Pokémon whose Toxic Gas (SuppressPowers) is working right now — Active or Benched, either
 * side, not Asleep/Confused/Paralyzed, not stopped by a timed suppression — or undefined.
 * Toxic Gases never stop each other ("ignore all Pokémon Powers other than Toxic Gases").
 */
export function getToxicGasSource(state: GameState | null | undefined): PokemonInPlay | undefined {
  if (!state) return undefined;
  return allPokemonInPlay(state).find(
    (p) =>
      isPokemonCard(p.pokemon) &&
      p.pokemon.power?.type === PokemonPowerType.SuppressPowers &&
      !hasBlockingStatus(p) &&
      !hasTimedSuppression(state, p)
  );
}

/**
 * Is this Pokémon's power suppressed right now? By a timed effect in the state (Goop Gas
 * Attack, Dark Arbok's Stare...) or by a working Toxic Gas in play (Muk), which ignores every
 * power other than Toxic Gas.
 */
export function isPowerSuppressed(state: GameState | null | undefined, pokemon: PokemonInPlay): boolean {
  if (!state) return false;
  if (hasTimedSuppression(state, pokemon)) return true;
  const isToxicGas = isPokemonCard(pokemon.pokemon) && pokemon.pokemon.power?.type === PokemonPowerType.SuppressPowers;
  return !isToxicGas && getToxicGasSource(state) !== undefined;
}

/** Working power of a given type on a Pokémon (has it, not statused, not suppressed). */
function activePowerOfType(state: GameState | null | undefined, pokemon: PokemonInPlay, type: PokemonPowerType): PokemonPower | undefined {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== type) return undefined;
  return isPowerActive(state, pokemon) ? pokemon.pokemon.power : undefined;
}

/**
 * Prehistoric Power (Aerodactyl): while it works, no Evolution cards can be played by either
 * player. Returns the Pokémon whose power blocks evolution, or undefined.
 */
export function getEvolutionBlockingPokemon(state: GameState): PokemonInPlay | undefined {
  return allPokemonInPlay(state).find((p) => activePowerOfType(state, p, PokemonPowerType.PreventEvolution));
}

/**
 * Clairvoyance (Omanyte): is `side`'s hand public? True while the OTHER side has a Pokémon
 * in play (Active or Benched) whose RevealHand power works. Consumers use it to show that
 * hand (the API must not mask it for the other player).
 */
export function isHandRevealed(state: GameState, side: "player" | "opponent"): boolean {
  const otherActive = side === "player" ? state.opponentActivePokemon : state.playerActivePokemon;
  const otherBench = side === "player" ? state.opponentBench : state.playerBench;
  return [otherActive, ...otherBench].some((p) => !!p && !!activePowerOfType(state, p, PokemonPowerType.RevealHand));
}

/**
 * Here Comes Team Rocket!: are `side`'s Prize cards face up? (Both sides, for the rest of the
 * game, once the card was played.) Consumers use it to show the Prizes (the API must not mask
 * them).
 */
export function arePrizesRevealed(state: GameState, _side: "player" | "opponent"): boolean {
  return !!state.prizesFaceUp;
}

/**
 * Hay Fever (Dark Vileplume): while it works, no Trainer cards can be played by either player.
 * Returns the Pokémon whose power blocks Trainers, or undefined.
 */
export function getTrainerBlockingPokemon(state: GameState): PokemonInPlay | undefined {
  return allPokemonInPlay(state).find((p) => activePowerOfType(state, p, PokemonPowerType.PreventTrainers));
}

/** The Active facing `pokemon` when it is an Active Pokémon (either side), else null. */
function opposingActive(state: GameState, pokemon: PokemonInPlay): PokemonInPlay | null {
  const id = pokemon.pokemon.id;
  if (state.playerActivePokemon?.pokemon.id === id) return state.opponentActivePokemon;
  if (state.opponentActivePokemon?.pokemon.id === id) return state.playerActivePokemon;
  return null;
}

/**
 * Sticky Goo (Dark Muk): extra Retreat Cost of `pokemon` (an Active Pokémon) while the
 * opposing Active has a working IncreaseRetreatCost power. 0 otherwise.
 */
export function getRetreatCostIncrease(state: GameState | null | undefined, pokemon: PokemonInPlay): number {
  if (!state) return 0;
  const facing = opposingActive(state, pokemon);
  if (!facing) return 0;
  return activePowerOfType(state, facing, PokemonPowerType.IncreaseRetreatCost)?.amount ?? 0;
}

/**
 * Sinkhole (Dark Dugtrio): the Pokémon of the side that is NOT `retreatingSide` with a working
 * RetreatDamageFlip power (Active or Benched). Each one makes the retreating player flip a coin.
 */
export function getRetreatDamageSources(state: GameState, retreatingSide: "player" | "opponent"): PokemonInPlay[] {
  const other = retreatingSide === "player"
    ? [state.opponentActivePokemon, ...state.opponentBench]
    : [state.playerActivePokemon, ...state.playerBench];
  return other.filter((p): p is PokemonInPlay => !!p && !!activePowerOfType(state, p, PokemonPowerType.RetreatDamageFlip));
}

/** Final Beam (Dark Gyarados): this Pokémon's working KnockOutRetaliation power, or undefined. */
export function getKnockOutRetaliation(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  return activePowerOfType(state, pokemon, PokemonPowerType.KnockOutRetaliation);
}

/**
 * Frenzy (Dark Primeape): extra damage this Pokémon does while it is Confused (its own power,
 * which Confusion doesn't stop; Toxic Gas / Goop Gas Attack do). 0 when not Confused.
 */
export function getConfusedDamageBonus(state: GameState | null | undefined, pokemon: PokemonInPlay): number {
  if (!(pokemon.statusConditions ?? []).includes(StatusCondition.Confused)) return 0;
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.ConfusedDamageBonus) return 0;
  if (!isPowerActive(state, pokemon, { ignoreBlockingStatus: true })) return 0;
  return pokemon.pokemon.power.amount ?? 0;
}

// ============================================================================
// TRANSFORM (Ditto) — derived "effective card"
// ============================================================================

/** The Active Pokémon facing `pokemon` when `pokemon` is an Active, else undefined. */
function facingActive(state: GameState, pokemon: PokemonInPlay): PokemonInPlay | null | undefined {
  const id = pokemon.pokemon.id;
  if (state.playerActivePokemon?.pokemon.id === id) return state.opponentActivePokemon;
  if (state.opponentActivePokemon?.pokemon.id === id) return state.playerActivePokemon;
  return undefined;
}

/**
 * Transform (Ditto): the printed card Ditto is a copy of right now, or undefined. Ditto copies
 * the opposing Active Pokémon while Ditto itself is an Active Pokémon and its power works (not
 * Asleep/Confused/Paralyzed, no Toxic Gas). The copy is always of the printed card (a Ditto
 * facing another Ditto is just a Ditto).
 */
export function getTransformTarget(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonCard | undefined {
  if (!state || !isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.Transform) return undefined;
  const facing = facingActive(state, pokemon);
  if (!facing || !isPokemonCard(facing.pokemon)) return undefined;
  if (!isPowerActive(state, pokemon)) return undefined;
  return facing.pokemon;
}

/**
 * The card the engine uses for a Pokémon in play: its own card, or for a transformed Ditto
 * the Defending Pokémon's card (type, HP, Weakness, Resistance, attacks, Retreat Cost, stage)
 * keeping Ditto's identity (id, name, number, set) and its Transform power, with
 * `transformedFrom` = Ditto's card. Consumers use it to show the attacks / HP of a Ditto.
 * Derived on demand: never store it in the state.
 */
export function getEffectivePokemonCard(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonCard | undefined {
  if (!isPokemonCard(pokemon.pokemon)) return undefined;
  return withLiveHp(state, pokemon, copiedCard(state, pokemon));
}

/** The card a Pokémon is a copy of right now (Shapeshift, Transform), or its own card. */
function copiedCard(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonCard {
  const own = pokemon.pokemon as PokemonCard;
  const shape = getShapeshiftTarget(state, pokemon);
  if (shape) {
    // "Treat it as if it were that Pokémon": its name (owner), types, HP, Weakness / Resistance,
    // Retreat Cost and attacks; it keeps its identity, Stage and its own power (never the copy's)
    return {
      ...shape,
      id: own.id,
      number: own.number,
      set: own.set,
      rarity: own.rarity,
      imageSetVersion: own.imageSetVersion,
      stage: own.stage,
      evolvesFrom: own.evolvesFrom,
      power: own.power,
      trainerCard: undefined,
      transformedFrom: undefined,
      shapeshiftedFrom: own,
    };
  }
  const target = getTransformTarget(state, pokemon);
  if (!target) return own;
  return {
    ...target,
    id: own.id,
    name: own.name,
    number: own.number,
    set: own.set,
    rarity: own.rarity,
    imageSetVersion: own.imageSetVersion,
    power: own.power,
    evolvesFrom: undefined,
    trainerCard: undefined,
    transformedFrom: own,
  };
}

/**
 * Live HP on top of the card: Giant Growth's maximum HP and boosted attack (hpOverride), then
 * Gaseous Form (+`amount` per `energyType` Energy card attached, a Rainbow attached counts; it
 * works while Asleep / Confused / Paralyzed, not while suppressed). Same object when unchanged.
 */
function withLiveHp(state: GameState | null | undefined, pokemon: PokemonInPlay, card: PokemonCard): PokemonCard {
  const override = pokemon.hpOverride;
  const gaseous = gaseousFormBonus(state, pokemon);
  if (!override && gaseous === 0) return card;
  const boosted = override?.attackName && override.damage !== undefined
    ? card.attacks.map((a) => (a.name === override.attackName ? { ...a, damage: override.damage! } : a))
    : card.attacks;
  return { ...card, hp: (override?.hp ?? card.hp) + gaseous, attacks: boosted };
}

function gaseousFormBonus(state: GameState | null | undefined, pokemon: PokemonInPlay): number {
  const power = isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.power : undefined;
  if (power?.type !== PokemonPowerType.HpPerEnergy) return 0;
  if (!isPowerActive(state, pokemon, { ignoreBlockingStatus: true })) return 0;
  const type = power.energyType ?? EnergyTypeEnum.Psychic;
  const cards = pokemon.attachedEnergy.filter((c) => energyProvidesType(c, type, pokemon, state ?? undefined)).length;
  return (power.amount ?? 10) * cards;
}

// ============================================================================
// SHAPESHIFT (Brock's Ninetales)
// ============================================================================

/** The Evolution card attached by Shapeshift (kept in attachedTrainers: it leaves play like them), if any. */
export function getShapeshiftCard(pokemon: PokemonInPlay | null | undefined): PokemonCard | undefined {
  return pokemon?.attachedTrainers?.find((c): c is GameCard & PokemonCard => isPokemonCard(c));
}

/**
 * Shapeshift: the attached Evolution card the Pokémon is treated as right now, or undefined —
 * only while its Shapeshift power works (Toxic Gas / Dark Wave stop the copy, the card stays).
 */
export function getShapeshiftTarget(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonCard | undefined {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.ShapeshiftEvolution) return undefined;
  const card = getShapeshiftCard(pokemon);
  return card && isPowerActive(state, pokemon) ? card : undefined;
}

/**
 * State-based Shapeshift rule: an attached Evolution card is discarded when its Pokémon is
 * Asleep / Confused / Paralyzed, or no longer has Shapeshift (Devolution Spray). Run by
 * checkKnockouts before the HP checks. Same object when nothing changes.
 */
export function discardBrokenShapeshiftCards(state: GameState): GameState {
  const broken = (p: PokemonInPlay | null | undefined): boolean =>
    !!p && !!getShapeshiftCard(p) &&
    (hasBlockingStatus(p) || !isPokemonCard(p.pokemon) || p.pokemon.power?.type !== PokemonPowerType.ShapeshiftEvolution);
  const sides = ["player", "opponent"] as const;
  if (!sides.some((s) => broken(s === "player" ? state.playerActivePokemon : state.opponentActivePokemon) ||
    (s === "player" ? state.playerBench : state.opponentBench).some(broken))) return state;
  const events = [...state.events];
  const next: GameState = { ...state };
  for (const side of sides) {
    const discarded: GameCard[] = [];
    const fix = (p: PokemonInPlay): PokemonInPlay => {
      if (!broken(p)) return p;
      const cards = (p.attachedTrainers ?? []).filter((c) => isPokemonCard(c));
      discarded.push(...cards);
      for (const c of cards) events.push(createGameEvent(`${c.name} unido a ${p.pokemon.name} se descartó`, "info"));
      return { ...p, attachedTrainers: (p.attachedTrainers ?? []).filter((c) => !isPokemonCard(c)) };
    };
    if (side === "player") {
      next.playerActivePokemon = state.playerActivePokemon ? fix(state.playerActivePokemon) : null;
      next.playerBench = state.playerBench.map(fix);
      next.playerDiscard = [...state.playerDiscard, ...discarded];
    } else {
      next.opponentActivePokemon = state.opponentActivePokemon ? fix(state.opponentActivePokemon) : null;
      next.opponentBench = state.opponentBench.map(fix);
      next.opponentDiscard = [...state.opponentDiscard, ...discarded];
    }
  }
  return { ...next, events };
}

/**
 * A Ditto (Transform) Active while the other side has no Active (Knocked Out, waiting for the
 * promotion): it is just a Ditto meanwhile, but it is not Knocked Out for that — the HP check
 * waits for the new Defending Pokémon (checkKnockouts after the promotion).
 */
export function isAwaitingTransformTarget(state: GameState, pokemon: PokemonInPlay): boolean {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.Transform) return false;
  return facingActive(state, pokemon) === null;
}

/**
 * HP of a Pokémon in play right now: the copied card's (Transform, Shapeshift), Giant Growth's
 * maximum HP, plus Gaseous Form. Lower than its damage = Knocked Out (checkKnockouts).
 */
export function getEffectiveHp(state: GameState | null | undefined, pokemon: PokemonInPlay): number {
  return getEffectivePokemonCard(state, pokemon)?.hp ?? 0;
}

/**
 * Kabuto Armor: damage an attack (even your own) does to this Pokémon — Active or Benched,
 * after Weakness and Resistance — is halved, rounded down to the nearest 10. Returns the
 * damage actually done.
 */
export function applyDamageHalving(pokemon: PokemonInPlay, damage: number, state?: GameState): number {
  if (damage <= 0) return damage;
  // Kabuto Armor, or Deflector used on the previous turn ("whenever it takes damage")
  const halves = !!activePowerOfType(state, pokemon, PokemonPowerType.HalveAttackDamage) ||
    (!!state && pokemon.halveDamage?.onTurn === state.turnNumber);
  return halves ? Math.floor(damage / 2 / 10) * 10 : damage;
}

/**
 * Gym Heroes powers that change the damage an attack does to `pokemon` (Active or Benched, after
 * Weakness / Resistance and the modifiers): Shell Armor (ReduceAttackDamage: `amount` less) and
 * Strange Barrier (BasicAttackDamageCap: 20 or more from an attack by a Basic Pokémon — its
 * printed stage, "including your own" — becomes `amount`). `attacker` is the Pokémon whose attack
 * it is. Swift's damage never comes here (executeAttack skips every effect on the defender).
 * Returns the damage and the power that changed it (for the log), if any.
 */
export function applyDamagePowers(
  pokemon: PokemonInPlay,
  damage: number,
  state: GameState | undefined,
  attacker: PokemonInPlay | null | undefined
): { damage: number; power?: PokemonPower } {
  if (damage <= 0) return { damage };
  const armor = activePowerOfType(state, pokemon, PokemonPowerType.ReduceAttackDamage);
  if (armor) return { damage: Math.max(0, damage - (armor.amount ?? 10)), power: armor };
  const barrier = activePowerOfType(state, pokemon, PokemonPowerType.BasicAttackDamageCap);
  const byBasic = !!attacker && isPokemonCard(attacker.pokemon) && attacker.pokemon.stage === PokemonStage.Basic;
  if (barrier && byBasic && damage >= 20) return { damage: Math.min(damage, barrier.amount ?? 10), power: barrier };
  return { damage };
}

/**
 * Every damage-changing effect on `pokemon` for damage done by an attack (Kabuto Armor /
 * Deflector, then Shell Armor / Strange Barrier): the damage actually done.
 */
export function applyAttackDamageReductions(
  pokemon: PokemonInPlay,
  damage: number,
  state: GameState | undefined,
  attacker: PokemonInPlay | null | undefined
): number {
  const reduced = applyDamagePowers(pokemon, applyDamageHalving(pokemon, damage, state), state, attacker).damage;
  // Relaxing Scent (Erika's Ivysaur): every attack damage, last
  return applyRelaxingScent(state, reduced).damage;
}

/**
 * Pollen Defense (Erika's Vileplume): its DamagedStatusFlip power when it works now — Asleep,
 * Confused or Paralyzed don't stop it ("this power works even while..."), Toxic Gas / Goop Gas
 * Attack do. Only the Defending Pokémon's counts (the caller checks the position).
 */
export function getDamagedStatusFlip(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.DamagedStatusFlip) return undefined;
  return isPowerActive(state, pokemon, { ignoreBlockingStatus: true }) ? pokemon.pokemon.power : undefined;
}

// ============================================================================
// Gym Challenge trigger powers (coins: getAttackCoinPlan's power / defender slots)
// ============================================================================

/**
 * Rebellion (Misty's Gyarados): its AttackRebellionFlip power when it works now. "Works even if
 * Confused" (Asleep / Paralyzed can't attack anyway): only Toxic Gas / Dark Wave stop it.
 */
export function getRebellionPower(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.AttackRebellionFlip) return undefined;
  return isPowerActive(state, pokemon, { ignoreBlockingStatus: true }) ? pokemon.pokemon.power : undefined;
}

/**
 * Fortitude (Giovanni's Machamp) / Energy Drain (Koga's Muk): working when the opponent attacks
 * (not "already Asleep, Confused or Paralyzed", no Toxic Gas). `pokemon` as it was before the attack.
 */
export function getSurviveKnockOutPower(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  return activePowerOfType(state, pokemon, PokemonPowerType.SurviveKnockOutFlip);
}
export function getEnergyDrainPower(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  return activePowerOfType(state, pokemon, PokemonPowerType.DamagedDiscardAttackerEnergy);
}

/** Shock Blast (Lt. Surge's Electrode): works while statused ("even if already Asleep..."); Toxic Gas stops it. */
export function getShockBlastPower(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.DamagedActivesDamageFlip) return undefined;
  return isPowerActive(state, pokemon, { ignoreBlockingStatus: true }) ? pokemon.pokemon.power : undefined;
}

/**
 * Scram (Brock's Primeape): a working ShuffleSelfAtHp power with exactly `amount` (10) HP left.
 * checkKnockouts shuffles it into its owner's deck before the Knock Outs.
 */
export function isScramming(state: GameState | null | undefined, pokemon: PokemonInPlay): boolean {
  const power = activePowerOfType(state, pokemon, PokemonPowerType.ShuffleSelfAtHp);
  return !!power && getEffectiveHp(state, pokemon) - (pokemon.currentDamage ?? 0) === (power.amount ?? 10);
}

/**
 * Relaxing Scent (Erika's Ivysaur): while a working Ivysaur is an Active Pokémon (either side),
 * attack damage to any Pokémon (after Weakness / Resistance and the modifiers) is halved, rounded
 * up to the nearest 10 — once per Active Ivysaur. Returns the damage and the power, if any.
 */
export function applyRelaxingScent(state: GameState | null | undefined, damage: number): { damage: number; power?: PokemonPower } {
  if (!state || damage <= 0) return { damage };
  let power: PokemonPower | undefined;
  for (const active of [state.playerActivePokemon, state.opponentActivePokemon]) {
    const scent = active ? activePowerOfType(state, active, PokemonPowerType.HalveAllAttackDamage) : undefined;
    if (!scent) continue;
    power = scent;
    damage = Math.ceil(damage / 2 / 10) * 10;
  }
  return { damage, power };
}

/**
 * Healing Fire (Blaine's Ninetales): a basic Energy card of the power's type (Fire) attached
 * from the hand to it removes 1 damage counter (stops while Asleep / Confused / Paralyzed).
 * `side`'s Pokémon `pokemonId` just received `card`. Returns the same state when nothing happens.
 */
export function healOnEnergyAttach(state: GameState, side: "player" | "opponent", pokemonId: string, card: GameCard): GameState {
  const activeKey = side === "player" ? "playerActivePokemon" : "opponentActivePokemon";
  const benchKey = side === "player" ? "playerBench" : "opponentBench";
  const target = state[activeKey]?.pokemon.id === pokemonId ? state[activeKey] : state[benchKey].find((p) => p.pokemon.id === pokemonId);
  if (!target || (target.currentDamage ?? 0) <= 0) return state;
  const power = activePowerOfType(state, target, PokemonPowerType.HealOnEnergyAttach);
  if (!power || !isEnergyCard(card) || !card.isBasic || card.energyType !== (power.energyType ?? EnergyTypeEnum.Fire)) return state;
  const healed: PokemonInPlay = { ...target, currentDamage: Math.max(0, (target.currentDamage ?? 0) - (power.amount ?? 10)) };
  return {
    ...state,
    ...(state[activeKey] === target
      ? { [activeKey]: healed }
      : { [benchKey]: state[benchKey].map((p) => (p === target ? healed : p)) }),
    events: [...state.events, createGameEvent(`${power.name}: ${target.pokemon.name} se curó ${power.amount ?? 10} de daño`, "action")],
  };
}

/**
 * Restless Sleep (Rocket's Snorlax): damage its AsleepDamageReaction power does to the attacking
 * Pokémon when the opponent's attack damaged it while it was already Asleep (`pokemon` as it was
 * before the attack), or 0. Being Asleep is the condition, so the status doesn't stop it; Toxic
 * Gas does.
 */
export function asleepDamageReaction(state: GameState | null | undefined, pokemon: PokemonInPlay): { damage: number; power: PokemonPower } | null {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.AsleepDamageReaction) return null;
  if (!(pokemon.statusConditions ?? []).includes(StatusCondition.Asleep)) return null;
  if (!isPowerActive(state, pokemon, { ignoreBlockingStatus: true })) return null;
  return { damage: pokemon.pokemon.power.amount ?? 20, power: pokemon.pokemon.power };
}

/**
 * Rebirth (Rocket's Moltres): its ReturnToHandOnKnockOut power if it works at the moment it is
 * Knocked Out (`pokemon` as it was then: not Asleep, Confused or Paralyzed, no Toxic Gas).
 */
export function getRebirthPower(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  return activePowerOfType(state, pokemon, PokemonPowerType.ReturnToHandOnKnockOut);
}

/**
 * Flee (Misty's Tentacruel): its SwitchWhenDamaged power if it works now (it "can't be used if
 * it is already Asleep, Confused or Paralyzed": checked before the attack).
 */
export function getFleePower(state: GameState | null | undefined, pokemon: PokemonInPlay): PokemonPower | undefined {
  return activePowerOfType(state, pokemon, PokemonPowerType.SwitchWhenDamaged);
}

/**
 * Bench Guard (Brock's Rhydon): the first Benched Pokémon of `bench` whose RedirectBenchDamage
 * power works ("as long as it is Benched"), or undefined.
 */
export function getBenchGuard(state: GameState | null | undefined, bench: PokemonInPlay[]): PokemonInPlay | undefined {
  return bench.find((p) => !!activePowerOfType(state, p, PokemonPowerType.RedirectBenchDamage));
}

/**
 * Photosynthesis (Erika's Oddish): the Energy type every Energy card attached to `pokemon`
 * provides instead of its own (EnergyTypeOverride; works while Asleep, Confused or Paralyzed,
 * not under Toxic Gas), or undefined. Without a state only the power is checked.
 */
export function getEnergyTypeOverride(state: GameState | null | undefined, pokemon: PokemonInPlay): EnergyType | undefined {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.EnergyTypeOverride) return undefined;
  if (!isPowerActive(state, pokemon, { ignoreBlockingStatus: true })) return undefined;
  return pokemon.pokemon.power.energyType;
}

/**
 * Single query for "does this Pokémon's power work right now?" — used by every passive power
 * check (Invisible Wall, Strikes Back, Retreat Aid, Thick Skinned) and by activated powers:
 * the Pokémon has a power, is not Asleep/Confused/Paralyzed (Poison doesn't stop powers) and
 * its power is not suppressed. Position (Active vs Bench) is checked by each caller.
 *
 * @param state - optional for legacy callers without a state (no suppression check then)
 * @param options.ignoreBlockingStatus - Snorlax's Thick Skinned keeps working while statused
 *   (current engine behavior: it prevents the conditions in the first place)
 */
export function isPowerActive(
  state: GameState | null | undefined,
  pokemon: PokemonInPlay,
  options: { ignoreBlockingStatus?: boolean } = {}
): boolean {
  if (!isPokemonCard(pokemon.pokemon) || !pokemon.pokemon.power) return false;
  if (!options.ignoreBlockingStatus && hasBlockingStatus(pokemon)) return false;
  return !isPowerSuppressed(state, pokemon);
}

/**
 * Check if a Pokemon can use its power
 * @param pokemon - The Pokemon trying to use the power
 * @param isActive - Whether the Pokemon is the active Pokemon
 * @param usedPowersThisTurn - Set of Pokemon IDs that have already used their power this turn
 * @returns Error message if cannot use, null if can use
 */
export function canUsePower(
  pokemon: PokemonInPlay,
  isActive: boolean,
  usedPowersThisTurn?: string[],
  state?: GameState
): string | null {
  // Must have a power
  if (!isPokemonCard(pokemon.pokemon) || !pokemon.pokemon.power) {
    return "Este Pokémon no tiene un Poder Pokémon";
  }

  const power = pokemon.pokemon.power;

  // Check status conditions
  if (hasBlockingStatus(pokemon)) {
    return `${pokemon.pokemon.name} tiene un estado alterado y no puede usar su poder`;
  }

  if (isPowerSuppressed(state, pokemon)) {
    return `${power.name} no funciona en este momento`;
  }

  // Check if power requires being active
  if (!power.worksFromBench && !isActive) {
    return `${power.name} solo puede usarse mientras ${pokemon.pokemon.name} esté activo`;
  }

  // Check if power was already used this turn (once-per-turn powers like HealFlip)
  if (usedPowersThisTurn && usedPowersThisTurn.includes(pokemon.pokemon.id)) {
    return `${power.name} ya fue usado este turno`;
  }

  return null;
}

/**
 * Check if a power of type unlimitedEnergyAttach can attach to a specific Pokemon
 */
export function canAttachWithPower(
  power: PokemonPower,
  targetPokemon: PokemonInPlay,
  energyCard: GameCard,
  state?: GameState
): string | null {
  if (power.type !== PokemonPowerType.UnlimitedEnergyAttach) {
    return "Este poder no permite adjuntar energía";
  }

  // Check energy type matches
  if (!isEnergyCard(energyCard)) {
    return "La carta seleccionada no es una energía";
  }

  if (power.energyType && energyCard.energyType !== power.energyType) {
    return `Solo puedes adjuntar energía ${power.energyType} con ${power.name}`;
  }

  // Check target Pokemon type
  if (power.targetPokemonTypes && isPokemonCard(targetPokemon.pokemon)) {
    // Its type right now: Shift (Venomoth) or a transformed Ditto's copied type
    const pokemonTypes = targetPokemon.shiftedType
      ? [targetPokemon.shiftedType]
      : ((state ? getEffectivePokemonCard(state, targetPokemon)?.types : undefined) ?? targetPokemon.pokemon.types);
    const hasMatchingType = pokemonTypes.some(t =>
      power.targetPokemonTypes!.includes(t)
    );
    if (!hasMatchingType) {
      return `${power.name} solo puede adjuntar energía a Pokémon de tipo ${power.targetPokemonTypes.join("/")}`;
    }
  }

  return null;
}

// ============================================================================
// RAIN DANCE (Blastoise) - Unlimited Water Energy Attachment
// ============================================================================

/**
 * Check if Rain Dance can be used
 */
export function canUseRainDance(
  state: GameState,
  side: "player" | "opponent"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find all Pokemon with Rain Dance power
  const pokemonWithPower: PokemonInPlay[] = [];

  // Check active
  if (activePokemon && isPokemonCard(activePokemon.pokemon) &&
      activePokemon.pokemon.power?.type === PokemonPowerType.UnlimitedEnergyAttach) {
    const error = canUsePower(activePokemon, true, undefined, state);
    if (!error) {
      pokemonWithPower.push(activePokemon);
    }
  }

  // Check bench
  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) &&
        benchPokemon.pokemon.power?.type === PokemonPowerType.UnlimitedEnergyAttach &&
        benchPokemon.pokemon.power.worksFromBench) {
      const error = canUsePower(benchPokemon, false, undefined, state);
      if (!error) {
        pokemonWithPower.push(benchPokemon);
      }
    }
  }

  if (pokemonWithPower.length === 0) {
    return {
      canUse: false,
      errorMessage: "No tienes Pokémon con Rain Dance disponible",
      pokemonWithPower: []
    };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Attach energy using Rain Dance power (bypasses one-energy-per-turn limit)
 */
export function attachEnergyWithRainDance(
  state: GameState,
  side: "player" | "opponent",
  energyCardId: string,
  targetPokemonId: string
): GameState {
  const hand = side === "player" ? state.playerHand : state.opponentHand;
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Check if Rain Dance can be used
  const { canUse, pokemonWithPower, errorMessage } = canUseRainDance(state, side);
  if (!canUse) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  // Get the power definition from the first Pokemon with the power
  const powerPokemon = pokemonWithPower[0];
  const power = isPokemonCard(powerPokemon.pokemon) ? powerPokemon.pokemon.power : null;
  if (!power) return state;

  // Find energy card in hand
  const energyCard = hand.find(c => c.id === energyCardId);
  if (!energyCard || !isEnergyCard(energyCard)) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró la carta de energía", "info")],
    };
  }

  // Find target Pokemon
  let targetPokemon: PokemonInPlay | null = null;
  let targetIsActive = false;
  let targetBenchIndex = -1;

  if (activePokemon?.pokemon.id === targetPokemonId) {
    targetPokemon = activePokemon;
    targetIsActive = true;
  } else {
    targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      targetPokemon = bench[targetBenchIndex];
    }
  }

  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon objetivo", "info")],
    };
  }

  // Validate attachment
  const attachError = canAttachWithPower(power, targetPokemon, energyCard, state);
  if (attachError) {
    return {
      ...state,
      events: [...state.events, createGameEvent(attachError, "info")],
    };
  }

  // Perform attachment
  const newHand = hand.filter(c => c.id !== energyCardId);
  const updatedPokemon: PokemonInPlay = {
    ...targetPokemon,
    attachedEnergy: [...targetPokemon.attachedEnergy, energyCard],
  };

  const sideName = side === "player" ? "" : "Rival usó ";
  const newEvent = createGameEvent(
    `${sideName}${power.name}: adjuntó energía Water a ${targetPokemon.pokemon.name}`,
    "action"
  );

  if (side === "player") {
    let newState = {
      ...state,
      playerHand: newHand,
      events: [...state.events, newEvent],
    };

    if (targetIsActive) {
      newState.playerActivePokemon = updatedPokemon;
    } else {
      const newBench = [...bench];
      newBench[targetBenchIndex] = updatedPokemon;
      newState.playerBench = newBench;
    }

    return newState;
  } else {
    let newState = {
      ...state,
      opponentHand: newHand,
      events: [...state.events, newEvent],
    };

    if (targetIsActive) {
      newState.opponentActivePokemon = updatedPokemon;
    } else {
      const newBench = [...bench];
      newBench[targetBenchIndex] = updatedPokemon;
      newState.opponentBench = newBench;
    }

    return newState;
  }
}

// ============================================================================
// ENERGY TRANS (Venusaur) - Move Grass Energy
// ============================================================================

/**
 * Check if Energy Trans can be used
 */
export function canUseEnergyTrans(
  state: GameState,
  side: "player" | "opponent"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const pokemonWithPower: PokemonInPlay[] = [];

  // Check active
  if (activePokemon && isPokemonCard(activePokemon.pokemon) &&
      activePokemon.pokemon.power?.type === PokemonPowerType.MoveEnergy) {
    const error = canUsePower(activePokemon, true);
    if (!error) {
      pokemonWithPower.push(activePokemon);
    }
  }

  // Check bench
  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) &&
        benchPokemon.pokemon.power?.type === PokemonPowerType.MoveEnergy &&
        benchPokemon.pokemon.power.worksFromBench) {
      const error = canUsePower(benchPokemon, false);
      if (!error) {
        pokemonWithPower.push(benchPokemon);
      }
    }
  }

  if (pokemonWithPower.length === 0) {
    return {
      canUse: false,
      errorMessage: "No tienes Pokémon con Energy Trans disponible",
      pokemonWithPower: []
    };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Move energy using Energy Trans power
 */
export function moveEnergyWithEnergyTrans(
  state: GameState,
  side: "player" | "opponent",
  sourcePokemonId: string,
  targetPokemonId: string,
  energyCardId: string
): GameState {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Check if Energy Trans can be used
  const { canUse, pokemonWithPower, errorMessage } = canUseEnergyTrans(state, side);
  if (!canUse) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  const powerPokemon = pokemonWithPower[0];
  const power = isPokemonCard(powerPokemon.pokemon) ? powerPokemon.pokemon.power : null;
  if (!power) return state;

  // Find source Pokemon and energy
  let sourcePokemon: PokemonInPlay | null = null;
  let sourceIsActive = false;
  let sourceBenchIndex = -1;

  if (activePokemon?.pokemon.id === sourcePokemonId) {
    sourcePokemon = activePokemon;
    sourceIsActive = true;
  } else {
    sourceBenchIndex = bench.findIndex(p => p?.pokemon.id === sourcePokemonId);
    if (sourceBenchIndex !== -1) {
      sourcePokemon = bench[sourceBenchIndex];
    }
  }

  if (!sourcePokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon origen", "info")],
    };
  }

  // Find the energy card
  const energyCard = sourcePokemon.attachedEnergy.find(e => e.id === energyCardId);
  if (!energyCard || !isEnergyCard(energyCard)) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró la energía a mover", "info")],
    };
  }

  // Check energy type matches power requirement
  if (power.energyType && !energyProvidesType(energyCard, power.energyType)) {
    return {
      ...state,
      events: [...state.events, createGameEvent(
        `${power.name} solo puede mover energía ${power.energyType}`,
        "info"
      )],
    };
  }

  // Find target Pokemon
  let targetPokemon: PokemonInPlay | null = null;
  let targetIsActive = false;
  let targetBenchIndex = -1;

  if (activePokemon?.pokemon.id === targetPokemonId) {
    targetPokemon = activePokemon;
    targetIsActive = true;
  } else {
    targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      targetPokemon = bench[targetBenchIndex];
    }
  }

  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon destino", "info")],
    };
  }

  if (sourcePokemonId === targetPokemonId) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Debes seleccionar un Pokémon diferente", "info")],
    };
  }

  // Move the energy
  const updatedSource: PokemonInPlay = {
    ...sourcePokemon,
    attachedEnergy: sourcePokemon.attachedEnergy.filter(e => e.id !== energyCardId),
  };

  const updatedTarget: PokemonInPlay = {
    ...targetPokemon,
    attachedEnergy: [...targetPokemon.attachedEnergy, energyCard],
  };

  const sideName = side === "player" ? "" : "Rival usó ";
  const newEvent = createGameEvent(
    `${sideName}${power.name}: movió energía Grass de ${sourcePokemon.pokemon.name} a ${targetPokemon.pokemon.name}`,
    "action"
  );

  // Build new state
  let newActivePokemon = activePokemon;
  let newBench = [...bench];

  // Update source
  if (sourceIsActive) {
    newActivePokemon = updatedSource;
  } else {
    newBench[sourceBenchIndex] = updatedSource;
  }

  // Update target
  if (targetIsActive) {
    newActivePokemon = updatedTarget;
  } else {
    newBench[targetBenchIndex] = updatedTarget;
  }

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: newActivePokemon,
      playerBench: newBench,
      events: [...state.events, newEvent],
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: newActivePokemon,
      opponentBench: newBench,
      events: [...state.events, newEvent],
    };
  }
}

// ============================================================================
// DAMAGE SWAP (Alakazam) - Move Damage Counters
// ============================================================================

/**
 * Check if Damage Swap can be used
 */
export function canUseDamageSwap(
  state: GameState,
  side: "player" | "opponent"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const pokemonWithPower: PokemonInPlay[] = [];

  // Check active
  if (activePokemon && isPokemonCard(activePokemon.pokemon) &&
      activePokemon.pokemon.power?.type === PokemonPowerType.MoveDamage) {
    const error = canUsePower(activePokemon, true);
    if (!error) {
      pokemonWithPower.push(activePokemon);
    }
  }

  // Check bench
  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) &&
        benchPokemon.pokemon.power?.type === PokemonPowerType.MoveDamage &&
        benchPokemon.pokemon.power.worksFromBench) {
      const error = canUsePower(benchPokemon, false);
      if (!error) {
        pokemonWithPower.push(benchPokemon);
      }
    }
  }

  if (pokemonWithPower.length === 0) {
    return {
      canUse: false,
      errorMessage: "No tienes Pokémon con Damage Swap disponible",
      pokemonWithPower: []
    };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Move damage counters using Damage Swap power
 */
export function moveDamageWithDamageSwap(
  state: GameState,
  side: "player" | "opponent",
  sourcePokemonId: string,
  targetPokemonId: string,
  amount: number
): GameState {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Check if Damage Swap can be used
  const { canUse, pokemonWithPower, errorMessage } = canUseDamageSwap(state, side);
  if (!canUse) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  const powerPokemon = pokemonWithPower[0];
  const power = isPokemonCard(powerPokemon.pokemon) ? powerPokemon.pokemon.power : null;
  if (!power) return state;

  // Validate amount (must be multiple of 10)
  if (amount <= 0 || amount % 10 !== 0) {
    return {
      ...state,
      events: [...state.events, createGameEvent("La cantidad debe ser múltiplo de 10", "info")],
    };
  }

  // Find source Pokemon
  let sourcePokemon: PokemonInPlay | null = null;
  let sourceIsActive = false;
  let sourceBenchIndex = -1;

  if (activePokemon?.pokemon.id === sourcePokemonId) {
    sourcePokemon = activePokemon;
    sourceIsActive = true;
  } else {
    sourceBenchIndex = bench.findIndex(p => p?.pokemon.id === sourcePokemonId);
    if (sourceBenchIndex !== -1) {
      sourcePokemon = bench[sourceBenchIndex];
    }
  }

  if (!sourcePokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon origen", "info")],
    };
  }

  // Check source has enough damage
  const sourceDamage = sourcePokemon.currentDamage ?? 0;
  if (sourceDamage < amount) {
    return {
      ...state,
      events: [...state.events, createGameEvent(
        `${sourcePokemon.pokemon.name} no tiene suficiente daño para mover`,
        "info"
      )],
    };
  }

  // Find target Pokemon
  let targetPokemon: PokemonInPlay | null = null;
  let targetIsActive = false;
  let targetBenchIndex = -1;

  if (activePokemon?.pokemon.id === targetPokemonId) {
    targetPokemon = activePokemon;
    targetIsActive = true;
  } else {
    targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      targetPokemon = bench[targetBenchIndex];
    }
  }

  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon destino", "info")],
    };
  }

  if (sourcePokemonId === targetPokemonId) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Debes seleccionar un Pokémon diferente", "info")],
    };
  }

  // Check target won't be KO'd (damage cannot exceed HP - 10)
  if (!isPokemonCard(targetPokemon.pokemon)) {
    return state;
  }

  const targetCurrentDamage = targetPokemon.currentDamage ?? 0;
  const targetHP = targetPokemon.pokemon.hp;
  const newTargetDamage = targetCurrentDamage + amount;

  if (newTargetDamage >= targetHP) {
    return {
      ...state,
      events: [...state.events, createGameEvent(
        `No puedes mover daño que noquearía a ${targetPokemon.pokemon.name}`,
        "info"
      )],
    };
  }

  // Move the damage
  const updatedSource: PokemonInPlay = {
    ...sourcePokemon,
    currentDamage: sourceDamage - amount,
  };

  const updatedTarget: PokemonInPlay = {
    ...targetPokemon,
    currentDamage: newTargetDamage,
  };

  const sideName = side === "player" ? "" : "Rival usó ";
  const newEvent = createGameEvent(
    `${sideName}${power.name}: movió ${amount} de daño de ${sourcePokemon.pokemon.name} a ${targetPokemon.pokemon.name}`,
    "action"
  );

  // Build new state
  let newActivePokemon = activePokemon;
  let newBench = [...bench];

  // Update source
  if (sourceIsActive) {
    newActivePokemon = updatedSource;
  } else {
    newBench[sourceBenchIndex] = updatedSource;
  }

  // Update target
  if (targetIsActive) {
    newActivePokemon = updatedTarget;
  } else {
    newBench[targetBenchIndex] = updatedTarget;
  }

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: newActivePokemon,
      playerBench: newBench,
      events: [...state.events, newEvent],
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: newActivePokemon,
      opponentBench: newBench,
      events: [...state.events, newEvent],
    };
  }
}

// ============================================================================
// STATUS IMMUNITY (Snorlax) - Thick Skinned
// ============================================================================

/**
 * Check if a Pokemon has StatusImmunity power active.
 * Thick Skinned: "This power can't be used if Snorlax is already Asleep, Confused, or
 * Paralyzed" (e.g. Confused while Toxic Gas was in play), so those statuses block it too.
 */
export function hasStatusImmunity(pokemon: PokemonInPlay, state?: GameState): boolean {
  if (!isPokemonCard(pokemon.pokemon)) return false;
  // Mysterious Fossil / Clefairy Doll: card rule, not a power (Toxic Gas can't stop it)
  if (isTrainerInPlay(pokemon.pokemon)) return true;
  const power = pokemon.pokemon.power;
  return !!power && power.type === PokemonPowerType.StatusImmunity &&
    isPowerActive(state, pokemon);
}

// ============================================================================
// DAMAGE BARRIER (Mr. Mime) - Invisible Wall
// ============================================================================

/**
 * Check if a Pokemon has DamageBarrier power that blocks the given damage.
 * Blocks attack damage of 30 or more. Only works while active.
 * Blocked by status conditions.
 */
export function isDamageBlocked(pokemon: PokemonInPlay, damage: number, state?: GameState): boolean {
  if (!isPokemonCard(pokemon.pokemon)) return false;
  const power = pokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.DamageBarrier) return false;
  if (!isPowerActive(state, pokemon)) return false;
  return damage >= 30;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get all Pokemon with usable powers for a side
 */
export function getPokemonWithUsablePowers(
  state: GameState,
  side: "player" | "opponent"
): PokemonInPlay[] {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const result: PokemonInPlay[] = [];

  if (activePokemon && isPokemonCard(activePokemon.pokemon) && activePokemon.pokemon.power) {
    const error = canUsePower(activePokemon, true, state.usedPowersThisTurn, state);
    if (!error) {
      result.push(activePokemon);
    }
  }

  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) && benchPokemon.pokemon.power) {
      if (benchPokemon.pokemon.power.worksFromBench) {
        const error = canUsePower(benchPokemon, false, state.usedPowersThisTurn, state);
        if (!error) {
          result.push(benchPokemon);
        }
      }
    }
  }

  return result;
}

/**
 * Check if player has any Pokemon with the Rain Dance power available
 */
export function hasRainDanceAvailable(state: GameState, side: "player" | "opponent"): boolean {
  const { canUse } = canUseRainDance(state, side);
  return canUse;
}

/**
 * Check if an energy card can be attached to a target Pokemon via any UnlimitedEnergyAttach power.
 * Returns the matching power Pokemon if yes, null otherwise.
 * Generic — works for Rain Dance (Water), and any future powers with different energy types.
 */
export function canAutoAttachEnergy(
  state: GameState,
  side: "player" | "opponent",
  energyCard: GameCard,
  targetPokemon: PokemonInPlay
): { powerPokemon: PokemonInPlay } | null {
  const { canUse, pokemonWithPower } = canUseRainDance(state, side);
  if (!canUse) return null;

  // Check if any available UnlimitedEnergyAttach power can handle this energy + target combo
  for (const pp of pokemonWithPower) {
    if (!isPokemonCard(pp.pokemon) || !pp.pokemon.power) continue;
    const error = canAttachWithPower(pp.pokemon.power, targetPokemon, energyCard, state);
    if (!error) {
      return { powerPokemon: pp };
    }
  }
  return null;
}

/**
 * Check if the player has any UnlimitedEnergyAttach power that accepts the given energy type.
 * Used by UI to determine if energy cards should remain selectable in hand.
 */
export function hasUnlimitedAttachForEnergyType(
  state: GameState,
  side: "player" | "opponent",
  energyType: string
): boolean {
  const { canUse, pokemonWithPower } = canUseRainDance(state, side);
  if (!canUse) return false;

  return pokemonWithPower.some(pp => {
    if (!isPokemonCard(pp.pokemon) || !pp.pokemon.power) return false;
    const power = pp.pokemon.power;
    // If power has no energyType restriction, it accepts all types
    if (!power.energyType) return true;
    return power.energyType === energyType;
  });
}

/**
 * Get the list of energy types that can be attached unlimited times via powers.
 * Used by UI to highlight selectable energy cards and valid targets.
 */
export function getUnlimitedEnergyTypes(
  state: GameState,
  side: "player" | "opponent"
): string[] {
  const { canUse, pokemonWithPower } = canUseRainDance(state, side);
  if (!canUse) return [];

  const types = new Set<string>();
  for (const pp of pokemonWithPower) {
    if (!isPokemonCard(pp.pokemon) || !pp.pokemon.power) continue;
    const power = pp.pokemon.power;
    if (power.energyType) {
      types.add(power.energyType);
    }
  }
  return Array.from(types);
}

// ============================================================================
// STRIKES BACK (Machamp) - Damage Reaction
// ============================================================================

/**
 * Check if a Pokemon has a damage reaction power (like Strikes Back)
 */
export function hasDamageReactionPower(pokemon: PokemonInPlay): boolean {
  if (!isPokemonCard(pokemon.pokemon)) return false;
  const power = pokemon.pokemon.power;
  return power?.type === PokemonPowerType.DamageReaction && (power.reactionDamage ?? 0) > 0;
}

/**
 * Apply damage reaction (Strikes Back) after a Pokemon takes damage
 * Returns the damage to apply to the attacker, or 0 if no reaction
 */
export function getDamageReaction(
  damagedPokemon: PokemonInPlay,
  isActive: boolean,
  state?: GameState
): { reactionDamage: number; powerName: string } | null {
  if (!isPokemonCard(damagedPokemon.pokemon)) return null;

  const power = damagedPokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.DamageReaction) return null;

  // Check if power works from current position
  if (!isActive && !power.worksFromBench) return null;

  // Asleep/Confused/Paralyzed or suppressed
  if (!isPowerActive(state, damagedPokemon)) return null;

  const reactionDamage = power.reactionDamage ?? 0;
  if (reactionDamage <= 0) return null;

  return { reactionDamage, powerName: power.name };
}

// ============================================================================
// ENERGY BURN (Charizard) - Energy Conversion
// ============================================================================

/**
 * Check if Energy Burn can be activated
 */
export function canUseEnergyBurn(
  state: GameState,
  side: "player" | "opponent",
  pokemonId?: string
): { canUse: boolean; errorMessage?: string; pokemon: PokemonInPlay | null } {
  const activePokemon = side === "player"
    ? state.playerActivePokemon
    : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find the target Pokemon (by ID or default to active)
  let target: PokemonInPlay | null = null;
  let isActive = false;

  if (pokemonId) {
    if (activePokemon && activePokemon.pokemon.id === pokemonId) {
      target = activePokemon;
      isActive = true;
    } else {
      for (const bp of bench) {
        if (bp && bp.pokemon.id === pokemonId) {
          target = bp;
          break;
        }
      }
    }
  } else {
    target = activePokemon;
    isActive = true;
  }

  if (!target || !isPokemonCard(target.pokemon)) {
    return { canUse: false, errorMessage: "No se encontró el Pokémon", pokemon: null };
  }

  const power = target.pokemon.power;
  if (!power || power.type !== PokemonPowerType.EnergyConversion) {
    return { canUse: false, errorMessage: "Este Pokémon no tiene Energy Burn", pokemon: null };
  }

  // Already active this turn?
  if (target.energyConversionType) {
    return { canUse: false, errorMessage: "Energy Burn ya está activo este turno", pokemon: null };
  }

  const error = canUsePower(target, isActive);
  if (error) {
    return { canUse: false, errorMessage: error, pokemon: null };
  }

  return { canUse: true, pokemon: target };
}

/**
 * Activate Energy Burn - converts all attached energy to the power's energyType
 */
export function activateEnergyBurn(
  state: GameState,
  side: "player" | "opponent",
  pokemonId?: string
): GameState {
  const { canUse, errorMessage, pokemon } = canUseEnergyBurn(state, side, pokemonId);

  if (!canUse || !pokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  const power = (pokemon.pokemon as PokemonCard).power!;
  const targetType = power.energyType;

  if (!targetType) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Energy Burn no tiene tipo de energía configurado", "info")],
    };
  }

  const updatedPokemon: PokemonInPlay = {
    ...pokemon,
    energyConversionType: targetType,
  };

  const event = createGameEvent(
    `${power.name}: Las energías de ${pokemon.pokemon.name} ahora cuentan como ${targetType}`,
    "action"
  );

  // Check if Pokemon is active or on bench
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const benchKey = side === "player" ? "playerBench" : "opponentBench";
  const activeKey = side === "player" ? "playerActivePokemon" : "opponentActivePokemon";

  if (activePokemon && activePokemon.pokemon.id === pokemon.pokemon.id) {
    return {
      ...state,
      [activeKey]: updatedPokemon,
      events: [...state.events, event],
    };
  }

  // Pokemon is on bench
  const bench = state[benchKey] as (PokemonInPlay | null)[];
  const newBench = bench.map(bp =>
    bp && bp.pokemon.id === pokemon.pokemon.id ? updatedPokemon : bp
  );

  return {
    ...state,
    [benchKey]: newBench,
    events: [...state.events, event],
  };
}

// ============================================================================
// BUZZAP (Electrode) - Self Sacrifice
// ============================================================================

/**
 * Check if Buzzap can be used
 */
export function canUseBuzzap(
  state: GameState,
  side: "player" | "opponent",
  electrodePokemonId: string
): { canUse: boolean; errorMessage?: string; pokemon: PokemonInPlay | null; validTargets: PokemonInPlay[] } {
  const activePokemon = side === "player"
    ? state.playerActivePokemon
    : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find the Pokemon
  let pokemon: PokemonInPlay | null = null;
  let isActive = false;

  if (activePokemon?.pokemon.id === electrodePokemonId) {
    pokemon = activePokemon;
    isActive = true;
  } else {
    const found = bench.find(p => p?.pokemon.id === electrodePokemonId);
    if (found) pokemon = found;
  }

  if (!pokemon || !isPokemonCard(pokemon.pokemon)) {
    return { canUse: false, errorMessage: "Pokémon no encontrado", pokemon: null, validTargets: [] };
  }

  const power = pokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.SelfSacrifice) {
    return { canUse: false, errorMessage: "Este Pokémon no tiene Buzzap", pokemon: null, validTargets: [] };
  }

  const error = canUsePower(pokemon, isActive);
  if (error) {
    return { canUse: false, errorMessage: error, pokemon: null, validTargets: [] };
  }

  // Find valid targets (all other Pokemon on our side)
  const validTargets: PokemonInPlay[] = [];

  if (activePokemon && activePokemon.pokemon.id !== electrodePokemonId) {
    validTargets.push(activePokemon);
  }

  for (const benchPokemon of bench) {
    if (benchPokemon && benchPokemon.pokemon.id !== electrodePokemonId) {
      validTargets.push(benchPokemon);
    }
  }

  if (validTargets.length === 0) {
    return {
      canUse: false,
      errorMessage: "No hay otro Pokémon para adjuntar la energía",
      pokemon: null,
      validTargets: []
    };
  }

  return { canUse: true, pokemon, validTargets };
}

// ============================================================================
// RETREAT REDUCTION (Dodrio) - Retreat Aid
// ============================================================================

/**
 * Calculate total retreat cost reduction from benched Pokemon with RetreatReduction power.
 * Each benched Pokemon with this power (and no status conditions) reduces retreat cost by 1.
 */
export function getRetreatCostReduction(bench: PokemonInPlay[], state?: GameState): number {
  let reduction = 0;
  for (const pokemon of bench) {
    if (!pokemon) continue;
    if (!isPokemonCard(pokemon.pokemon)) continue;
    const power = pokemon.pokemon.power;
    if (!power || power.type !== PokemonPowerType.RetreatReduction) continue;
    if (!isPowerActive(state, pokemon)) continue;
    reduction += 1;
  }
  return reduction;
}

/**
 * Execute Buzzap: KO Electrode, opponent takes prize, attach as energy to target
 */
export function executeBuzzap(
  state: GameState,
  side: "player" | "opponent",
  electrodePokemonId: string,
  chosenEnergyType: EnergyType,
  targetPokemonId: string
): GameState {
  const { canUse, errorMessage, pokemon, validTargets } = canUseBuzzap(state, side, electrodePokemonId);

  if (!canUse || !pokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  // Verify target is valid
  const targetPokemon = validTargets.find(p => p.pokemon.id === targetPokemonId);
  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Pokémon destino no válido", "info")],
    };
  }

  const power = (pokemon.pokemon as PokemonCard).power!;
  const energyValue = power.becomesEnergyValue ?? 2;

  // Create the Buzzap energy card
  // Same physical card, same id: it is Energy while attached and an Electrode again
  // wherever it goes next (hand, discard, deck). A new id lost the card's identity.
  const buzzapEnergy: GameCard = {
    ...pokemon.pokemon,
    buzzapSourceId: pokemon.pokemon.id,
    buzzapEnergyType: chosenEnergyType,
  };

  // Attach energy to target
  const updatedTarget: PokemonInPlay = {
    ...targetPokemon,
    attachedEnergy: [...targetPokemon.attachedEnergy, buzzapEnergy],
  };

  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? [...state.playerBench] : [...state.opponentBench];
  const discard = side === "player" ? [...state.playerDiscard] : [...state.opponentDiscard];

  let newActivePokemon = activePokemon;
  let needsPromotion = false;
  const isElectrodeActive = activePokemon?.pokemon.id === electrodePokemonId;

  // Remove Electrode from play
  if (isElectrodeActive) {
    // Add attached energy, attached Trainers (Charity) and previous evolutions to discard
    if (pokemon.attachedEnergy.length > 0) {
      discard.push(...pokemon.attachedEnergy);
    }
    discard.push(...(pokemon.attachedTrainers ?? []).map(cardOutOfPlay));
    if (pokemon.previousEvolutions && pokemon.previousEvolutions.length > 0) {
      discard.push(...pokemon.previousEvolutions.map(cardOutOfPlay));
    }
    // Note: The main Pokemon card becomes energy, not discarded

    newActivePokemon = null;
    needsPromotion = true;
  } else {
    // Remove from bench
    const benchIndex = bench.findIndex(p => p?.pokemon.id === electrodePokemonId);
    if (benchIndex !== -1) {
      const benchPokemon = bench[benchIndex]!;
      if (benchPokemon.attachedEnergy.length > 0) {
        discard.push(...benchPokemon.attachedEnergy);
      }
      discard.push(...(benchPokemon.attachedTrainers ?? []).map(cardOutOfPlay));
      if (benchPokemon.previousEvolutions && benchPokemon.previousEvolutions.length > 0) {
        discard.push(...benchPokemon.previousEvolutions.map(cardOutOfPlay));
      }
      bench[benchIndex] = null as unknown as PokemonInPlay;
    }
  }

  // Update target Pokemon (could be active or bench)
  if (newActivePokemon?.pokemon.id === targetPokemonId) {
    newActivePokemon = updatedTarget;
  } else {
    const targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      bench[targetBenchIndex] = updatedTarget;
    }
  }

  const oppositeSide = side === "player" ? "opponent" : "player";
  const sideName = side === "player" ? "" : "Rival usó ";

  // Filter out null slots left by removing Electrode from bench
  const cleanBench = bench.filter((p): p is PokemonInPlay => p != null);

  const events = [
    ...state.events,
    createGameEvent(
      `${sideName}Buzzap: ${pokemon.pokemon.name} se sacrificó y se convirtió en ${energyValue} energía ${chosenEnergyType}`,
      "action"
    ),
  ];

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: newActivePokemon,
      playerBench: cleanBench,
      playerDiscard: discard,
      playerNeedsToPromote: needsPromotion && cleanBench.length > 0,
      opponentCanTakePrize: true, // Opponent takes a prize for the KO
      events,
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: newActivePokemon,
      opponentBench: cleanBench,
      opponentDiscard: discard,
      playerCanTakePrize: true, // Player takes a prize for the KO
      events,
    };
  }
}

// ============================================================================
// HEAL FLIP (Vileplume) - Heal
// ============================================================================

/**
 * Check if Heal power can be used.
 * Requires: Pokemon with HealFlip power, no blocking status, at least one Pokemon with damage.
 */
export function canUseHealFlip(
  state: GameState,
  side: "player" | "opponent" = "player"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const pokemonWithPower: PokemonInPlay[] = [];

  const allPokemon = active ? [active, ...bench] : [...bench];
  for (const pokemon of allPokemon) {
    if (!isPokemonCard(pokemon.pokemon)) continue;
    const power = pokemon.pokemon.power;
    if (!power || power.type !== PokemonPowerType.HealFlip) continue;

    const isActive = pokemon === active;
    const error = canUsePower(pokemon, isActive);
    if (error) continue;

    pokemonWithPower.push(pokemon);
  }

  if (pokemonWithPower.length === 0) {
    return { canUse: false, errorMessage: "No hay Pokémon con el poder Curación disponible", pokemonWithPower: [] };
  }

  const hasDamagedPokemon = allPokemon.some(p => (p.currentDamage || 0) > 0);
  if (!hasDamagedPokemon) {
    return { canUse: false, errorMessage: "Ningún Pokémon tiene daño para curar", pokemonWithPower: [] };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Execute Heal power: remove 1 damage counter (10 HP) from the target Pokemon.
 * Should only be called after a successful coin flip (heads).
 * @param targetPokemonId - The ID of the Pokemon to heal
 */
export function executeHealFlip(
  state: GameState,
  targetPokemonId: string,
  side: "player" | "opponent" = "player",
  sourcePokemonId?: string
): GameState {
  const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  const events = [...state.events];

  // Find the source Pokemon (Vileplume using the power)
  let sourceId = sourcePokemonId;
  if (!sourceId) {
    // If not provided, try to find a Vileplume with Heal power
    if (active && isPokemonCard(active.pokemon) && active.pokemon.power?.type === PokemonPowerType.HealFlip) {
      sourceId = active.pokemon.id;
    } else {
      for (const p of bench) {
        if (p && isPokemonCard(p.pokemon) && p.pokemon.power?.type === PokemonPowerType.HealFlip) {
          sourceId = p.pokemon.id;
          break;
        }
      }
    }
  }

  // Mark power as used
  const usedPowersThisTurn = [...(state.usedPowersThisTurn || [])];
  if (sourceId) {
    usedPowersThisTurn.push(sourceId);
  }

  // Try healing active Pokemon
  if (active && active.pokemon.id === targetPokemonId && (active.currentDamage || 0) > 0) {
    const healAmount = Math.min(10, active.currentDamage || 0);
    const newActive = {
      ...active,
      currentDamage: (active.currentDamage || 0) - healAmount,
    };
    events.push(
      createGameEvent(`Curación: ${active.pokemon.name} recuperó ${healAmount} HP`, "action")
    );
    return {
      ...state,
      ...(side === "player"
        ? { playerActivePokemon: newActive }
        : { opponentActivePokemon: newActive }),
      events,
      usedPowersThisTurn,
    };
  }

  // Try healing bench Pokemon
  const newBench = [...bench];
  for (let i = 0; i < newBench.length; i++) {
    const pokemon = newBench[i];
    if (pokemon && pokemon.pokemon.id === targetPokemonId && (pokemon.currentDamage || 0) > 0) {
      const healAmount = Math.min(10, pokemon.currentDamage || 0);
      newBench[i] = {
        ...pokemon,
        currentDamage: (pokemon.currentDamage || 0) - healAmount,
      };
      events.push(
        createGameEvent(`Curación: ${pokemon.pokemon.name} recuperó ${healAmount} HP`, "action")
      );
      return {
        ...state,
        ...(side === "player"
          ? { playerBench: newBench }
          : { opponentBench: newBench }),
        events,
        usedPowersThisTurn,
      };
    }
  }

  events.push(createGameEvent("No se pudo curar al Pokémon seleccionado", "info"));
  return { ...state, events, usedPowersThisTurn };
}

/**
 * Mark a Pokemon's power as used this turn (without executing any effect).
 * Used for powers that require coin flips where the power counts as used regardless of outcome.
 * @param pokemonId - The ID of the Pokemon whose power was used
 */
export function markPowerAsUsed(
  state: GameState,
  pokemonId: string
): GameState {
  const usedPowersThisTurn = [...(state.usedPowersThisTurn || [])];
  if (!usedPowersThisTurn.includes(pokemonId)) {
    usedPowersThisTurn.push(pokemonId);
  }
  return {
    ...state,
    usedPowersThisTurn,
  };
}

// ============================================================================
// SHIFT (Venomoth) - Type Shift
// ============================================================================

/**
 * Check if Shift can be used and get available types
 */
export function canUseShift(
  state: GameState,
  side: "player" | "opponent",
  venomothPokemonId: string
): { canUse: boolean; errorMessage?: string; pokemon: PokemonInPlay | null; availableTypes: EnergyType[] } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find Venomoth
  let pokemon: PokemonInPlay | null = null;
  let isActive = false;

  if (activePokemon?.pokemon.id === venomothPokemonId) {
    pokemon = activePokemon;
    isActive = true;
  } else {
    const found = bench.find(p => p?.pokemon.id === venomothPokemonId);
    if (found) pokemon = found;
  }

  if (!pokemon || !isPokemonCard(pokemon.pokemon)) {
    return { canUse: false, errorMessage: "Pokémon no encontrado", pokemon: null, availableTypes: [] };
  }

  const power = pokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.TypeShift) {
    return { canUse: false, errorMessage: "Este Pokémon no tiene Shift", pokemon: null, availableTypes: [] };
  }

  const error = canUsePower(pokemon, isActive, state.usedPowersThisTurn);
  if (error) {
    return { canUse: false, errorMessage: error, pokemon: null, availableTypes: [] };
  }

  // Collect all types from Pokemon in play (both sides, excluding colorless)
  const typesSet = new Set<EnergyType>();

  const allPokemon = [
    state.playerActivePokemon,
    ...state.playerBench,
    state.opponentActivePokemon,
    ...state.opponentBench,
  ].filter((p): p is PokemonInPlay => p != null);

  for (const p of allPokemon) {
    if (p && p.pokemon && isPokemonCard(p.pokemon)) {
      for (const type of p.pokemon.types) {
        if (type !== "colorless") {
          typesSet.add(type);
        }
      }
    }
  }

  const availableTypes = Array.from(typesSet);

  if (availableTypes.length === 0) {
    return {
      canUse: false,
      errorMessage: "No hay tipos disponibles para cambiar",
      pokemon: null,
      availableTypes: []
    };
  }

  return { canUse: true, pokemon, availableTypes };
}

/**
 * Initiate Shift: Set pending state to show type selection modal
 */
export function initiateShift(
  state: GameState,
  side: "player" | "opponent",
  venomothPokemonId: string
): GameState {
  const { canUse, errorMessage, pokemon, availableTypes } = canUseShift(state, side, venomothPokemonId);

  if (!canUse || !pokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  // Set pending state - frontend will show modal
  return {
    ...state,
    pendingTypeShift: {
      pokemonId: venomothPokemonId,
      availableTypes,
    },
  };
}

/**
 * Execute Shift: Apply the chosen type to Venomoth until end of turn
 */
export function executeShift(
  state: GameState,
  side: "player" | "opponent",
  chosenType: EnergyType
): GameState {
  if (!state.pendingTypeShift) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No hay cambio de tipo pendiente", "info")],
    };
  }

  const { pokemonId, availableTypes } = state.pendingTypeShift;

  // Validate chosen type
  if (!availableTypes.includes(chosenType)) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Tipo no válido", "info")],
    };
  }

  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find and update Venomoth
  let updated = false;
  let newActivePokemon = activePokemon;
  let newBench = [...bench];

  if (activePokemon?.pokemon.id === pokemonId) {
    newActivePokemon = {
      ...activePokemon,
      shiftedType: chosenType,
    };
    updated = true;
  } else {
    const benchIndex = bench.findIndex(p => p?.pokemon.id === pokemonId);
    if (benchIndex !== -1 && bench[benchIndex]) {
      newBench[benchIndex] = {
        ...bench[benchIndex]!,
        shiftedType: chosenType,
      };
      updated = true;
    }
  }

  if (!updated) {
    return {
      ...state,
      pendingTypeShift: undefined,
      events: [...state.events, createGameEvent("No se pudo cambiar el tipo", "info")],
    };
  }

  // Mark power as used
  const usedPowersThisTurn = [...(state.usedPowersThisTurn || [])];
  if (!usedPowersThisTurn.includes(pokemonId)) {
    usedPowersThisTurn.push(pokemonId);
  }

  const foundPokemon = activePokemon?.pokemon.id === pokemonId ? activePokemon : bench.find(p => p?.pokemon.id === pokemonId);
  const pokemonName = foundPokemon?.pokemon.name || "Venomoth";
  const event = createGameEvent(
    `Shift: ${pokemonName} cambió su tipo a ${chosenType} hasta el final del turno`,
    "action"
  );

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: newActivePokemon,
      playerBench: newBench,
      pendingTypeShift: undefined,
      usedPowersThisTurn,
      events: [...state.events, event],
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: newActivePokemon,
      opponentBench: newBench,
      pendingTypeShift: undefined,
      usedPowersThisTurn,
      events: [...state.events, event],
    };
  }
}

// ============================================================================
// PEEK (Mankey) - Peek at cards
// ============================================================================

/**
 * Check if Peek can be used
 */
export function canUsePeek(
  state: GameState,
  side: "player" | "opponent",
  mankeyPokemonId: string
): { canUse: boolean; errorMessage?: string; pokemon: PokemonInPlay | null } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find Mankey
  let pokemon: PokemonInPlay | null = null;
  let isActive = false;

  if (activePokemon?.pokemon.id === mankeyPokemonId) {
    pokemon = activePokemon;
    isActive = true;
  } else {
    const found = bench.find(p => p?.pokemon.id === mankeyPokemonId);
    if (found) pokemon = found;
  }

  if (!pokemon || !isPokemonCard(pokemon.pokemon)) {
    return { canUse: false, errorMessage: "Pokémon no encontrado", pokemon: null };
  }

  const power = pokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.Peek) {
    return { canUse: false, errorMessage: "Este Pokémon no tiene Peek", pokemon: null };
  }

  const error = canUsePower(pokemon, isActive, state.usedPowersThisTurn);
  if (error) {
    return { canUse: false, errorMessage: error, pokemon: null };
  }

  return { canUse: true, pokemon };
}

/**
 * Execute Peek: Reveal a card based on the chosen option
 * @param peekType - What to peek at
 */
export function executePeek(
  state: GameState,
  side: "player" | "opponent",
  mankeyPokemonId: string,
  peekType: "playerDeck" | "opponentDeck" | "opponentHand" | "playerPrize" | "opponentPrize"
): GameState {
  const { canUse, errorMessage, pokemon } = canUsePeek(state, side, mankeyPokemonId);

  if (!canUse || !pokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  let revealedCards: GameCard[] = [];
  let peekDescription = "";

  switch (peekType) {
    case "playerDeck":
      if (state.playerDeck.length > 0) {
        revealedCards = [state.playerDeck[0]];
        peekDescription = "la carta superior del mazo del jugador";
      } else {
        peekDescription = "el mazo del jugador (vacío)";
      }
      break;

    case "opponentDeck":
      if (state.opponentDeck.length > 0) {
        revealedCards = [state.opponentDeck[0]];
        peekDescription = "la carta superior del mazo del rival";
      } else {
        peekDescription = "el mazo del rival (vacío)";
      }
      break;

    case "opponentHand":
      if (state.opponentHand.length > 0) {
        // Pick a random card from opponent's hand
        const randomIndex = Math.floor(Math.random() * state.opponentHand.length);
        revealedCards = [state.opponentHand[randomIndex]];
        peekDescription = "una carta aleatoria de la mano del rival";
      } else {
        peekDescription = "la mano del rival (vacía)";
      }
      break;

    case "playerPrize":
      if (state.playerPrizes.length > 0) {
        // Pick a random prize
        const randomIndex = Math.floor(Math.random() * state.playerPrizes.length);
        revealedCards = [state.playerPrizes[randomIndex]];
        peekDescription = "uno de los premios del jugador";
      } else {
        peekDescription = "los premios del jugador (ninguno restante)";
      }
      break;

    case "opponentPrize":
      if (state.opponentPrizes.length > 0) {
        // Pick a random prize
        const randomIndex = Math.floor(Math.random() * state.opponentPrizes.length);
        revealedCards = [state.opponentPrizes[randomIndex]];
        peekDescription = "uno de los premios del rival";
      } else {
        peekDescription = "los premios del rival (ninguno restante)";
      }
      break;
  }

  // Mark power as used
  const usedPowersThisTurn = [...(state.usedPowersThisTurn || [])];
  if (!usedPowersThisTurn.includes(mankeyPokemonId)) {
    usedPowersThisTurn.push(mankeyPokemonId);
  }

  const event = createGameEvent(
    `Peek: ${pokemon.pokemon.name} miró ${peekDescription}`,
    "action"
  );

  return {
    ...state,
    pendingPeek: {
      peekType,
      revealedCards,
    },
    usedPowersThisTurn,
    events: [...state.events, event],
  };
}

/**
 * Clear pending peek (after player has seen the revealed cards)
 */
export function clearPendingPeek(state: GameState): GameState {
  return {
    ...state,
    pendingPeek: undefined,
  };
}
