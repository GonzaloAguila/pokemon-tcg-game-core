/**
 * Lt. Surge's Secret Plan (Gym Challenge): a card of the hand face down on the Bench.
 *
 * "Put 1 card from your hand face down onto your Bench. Treat that card as a Basic Pokémon while
 * it is face down. Flip it over if any player needs to know what it is to use an attack, a
 * Pokémon Power or a Trainer card, or if it ever attacks, uses a Pokémon Power, evolves,
 * retreats, is damaged by an attack or is affected by an attack in any other way. At any time
 * during your turn, you may flip it over. When you flip it over, if it isn't a Basic Pokémon,
 * discard it and all cards attached to it."
 *
 * Ruling (docs/card-doubts.md → Gym Challenge): no HP, attacks, powers or Retreat Cost; Energy
 * can be attached; it flips when its owner chooses (own turn, `flipFaceDown` in domain/board),
 * when it would become the Active, or when anything other than its owner's Energy attachment
 * affects it; a Basic Pokémon card stays as that Pokémon (not "played from the hand": no on-play
 * power, no Minefield Gym); anything else is discarded with its cards, no Prize.
 *
 * Shape: `PokemonInPlay.pokemon` is a placeholder PokemonCard (`FACE_DOWN_NAME`, Basic, hp 0, no
 * type / attacks / Weakness / Resistance, retreat 0, an opaque id `face-down-N`) that keeps the
 * real card in `faceDownCard` (and the ids of its owner's Energy in `faceDownEnergyIds`). Every
 * rule reads the placeholder, never the real card; every exit (cardOutOfPlay / cardsLeavingPlay)
 * gives back the real card. The flip rules are state-based: `revealFaceDownCards` runs first in
 * checkKnockouts (after every attack, Trainer, power, promotion and retreat) and flips any
 * face-down card that is an Active or was touched (damage, a condition, attached Trainers, a
 * modifier, any effect field, Energy its owner didn't attach).
 *
 * Hidden information: consumers send each player `maskFaceDownFor(state, viewer)` (the other
 * side's `faceDownCard` replaced by a hidden Basic, `HIDDEN_FACE_DOWN_NAME`); the AI's knowledge
 * view does the same.
 */

import type { Card, PokemonCard } from "@/domain/cards/types";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { createGameEvent } from "@/lib/gameState";
import { cardsLeavingPlay, isFaceDownCard } from "@/domain/cards/in-play";
import { CardKind, CardRarity, CardSet, PokemonStage } from "@/domain/constants";

export const SECRET_PLAN = "Lt. Surge's Secret Plan";
/** Name of a face-down card's in-play placeholder. */
export const FACE_DOWN_NAME = "Carta boca abajo";
/** Name of the hidden card that replaces `faceDownCard` in a masked view. */
export const HIDDEN_FACE_DOWN_NAME = "Carta oculta";

type Side = "player" | "opponent";

const keys = (side: Side) =>
  side === "player"
    ? { active: "playerActivePokemon", bench: "playerBench", discard: "playerDiscard", promote: "playerNeedsToPromote" } as const
    : { active: "opponentActivePokemon", bench: "opponentBench", discard: "opponentDiscard", promote: "opponentNeedsToPromote" } as const;

/** Is this Pokémon in play a face-down card? */
export function isFaceDown(pokemon: PokemonInPlay | null | undefined): pokemon is PokemonInPlay & { pokemon: PokemonCard & { faceDownCard: Card } } {
  return !!pokemon && isFaceDownCard(pokemon.pokemon);
}

function placeholder(real: Card, id: string, energyIds: string[]): PokemonCard {
  return {
    id,
    name: FACE_DOWN_NAME,
    number: 0,
    set: CardSet.GymChallenge,
    rarity: CardRarity.Common,
    kind: CardKind.Pokemon,
    stage: PokemonStage.Basic,
    hp: 0,
    types: [],
    attacks: [],
    retreatCost: 0,
    weaknesses: [],
    resistances: [],
    faceDownCard: real,
    faceDownEnergyIds: energyIds,
  };
}

/**
 * Secret Plan's effect (the acting side = "player"): the Trainer to the discard pile, `hiddenId`
 * from the hand face down onto the Bench. The log never names the hidden card.
 */
export function putFaceDownOnBench(state: GameState, secretPlanId: string, hiddenId: string): GameState {
  const plan = state.playerHand.find((c) => c.id === secretPlanId);
  const hidden = state.playerHand.find((c) => c.id === hiddenId);
  if (!plan || !hidden || hidden.id === plan.id) return state;
  const count = (state.faceDownCount ?? 0) + 1;
  const faceDown: PokemonInPlay = {
    pokemon: placeholder(hidden, `face-down-${count}`, []) as GameCard,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: [],
    currentDamage: 0,
    statusConditions: [],
    playedOnTurn: state.turnNumber,
  };
  return {
    ...state,
    playerHand: state.playerHand.filter((c) => c.id !== secretPlanId && c.id !== hiddenId),
    playerDiscard: [...state.playerDiscard, plan],
    playerBench: [...state.playerBench, faceDown],
    faceDownCount: count,
    events: [
      ...state.events,
      createGameEvent(`Jugaste ${SECRET_PLAN}`, "action"),
      createGameEvent(`${SECRET_PLAN}: una carta boca abajo pasa a la Banca`, "action"),
    ],
  };
}

/**
 * Flip `side`'s face-down card `pokemonId` (any view): a Basic Pokémon card stays in play as
 * that Pokémon (damage, Energy and playedOnTurn kept); anything else goes to its owner's discard
 * pile with every attached card (no Prize; an Active leaves its owner promoting). Returns the
 * same state when it isn't a face-down card of that side. Doesn't end the game by itself: callers
 * run checkKnockouts (endGameIfNoPokemonLeft) after it.
 */
export function revealFaceDown(state: GameState, side: Side, pokemonId: string): GameState {
  const k = keys(side);
  const active = state[k.active];
  const bench = state[k.bench];
  const isActive = isFaceDown(active) && active.pokemon.id === pokemonId;
  const target = isActive ? active : bench.find((p) => isFaceDown(p) && p.pokemon.id === pokemonId);
  if (!isFaceDown(target)) return state;
  const real = target.pokemon.faceDownCard as GameCard;
  if (real.kind === CardKind.Pokemon && real.stage === PokemonStage.Basic) {
    const revealed: PokemonInPlay = { ...target, pokemon: real };
    return {
      ...state,
      ...(isActive ? { [k.active]: revealed } : { [k.bench]: bench.map((p) => (p === target ? revealed : p)) }),
      events: [...state.events, createGameEvent(`Se dio vuelta una carta boca abajo: es ${real.name} y se queda en juego`, "action")],
    };
  }
  const rest = isActive ? bench : bench.filter((p) => p !== target);
  return {
    ...state,
    [k.active]: isActive ? null : active,
    [k.bench]: rest,
    [k.discard]: [...state[k.discard], ...cardsLeavingPlay(target)],
    ...(isActive && { [k.promote]: rest.length > 0 }),
    events: [
      ...state.events,
      createGameEvent(`Se dio vuelta una carta boca abajo: es ${real.name}, no es un Pokémon Básico y se descarta con todas sus cartas`, "action"),
      ...(isActive && rest.length > 0 ? [createGameEvent(`El dueño de ${real.name} debe elegir un nuevo Pokémon activo`, "info")] : []),
    ],
  };
}

/** PokemonInPlay fields a face-down card may have without being "affected". */
const UNTOUCHED_FIELDS: ReadonlySet<string> = new Set([
  "pokemon", "attachedEnergy", "attachedTrainers", "previousEvolutions", "currentDamage", "statusConditions", "playedOnTurn",
]);

const isSet = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== false && !(Array.isArray(value) && value.length === 0);

/** Has anything but its owner's Energy attachment touched this face-down card? */
function wasAffected(state: GameState, p: PokemonInPlay & { pokemon: PokemonCard }): boolean {
  if ((p.currentDamage ?? 0) > 0 || (p.statusConditions?.length ?? 0) > 0) return true;
  if ((p.attachedTrainers?.length ?? 0) > 0 || (p.previousEvolutions?.length ?? 0) > 0) return true;
  const own = p.pokemon.faceDownEnergyIds ?? [];
  const now = p.attachedEnergy.map((e) => e.id);
  if (own.length !== now.length || now.some((id, i) => id !== own[i])) return true;
  if (state.activeModifiers.some((m) => m.targetPokemonId === p.pokemon.id)) return true;
  if (state.powersSuppressed?.some((s) => s.pokemonId === p.pokemon.id)) return true;
  return Object.entries(p).some(([key, value]) => !UNTOUCHED_FIELDS.has(key) && isSet(value));
}

/**
 * The state-based flip rules (both sides): every face-down Active, and every face-down Benched
 * card something other than its owner's Energy attachment affected, is flipped (revealFaceDown).
 * Same state when there is nothing to flip. Run first in checkKnockouts.
 */
export function revealFaceDownCards(state: GameState): GameState {
  let next = state;
  for (const side of ["player", "opponent"] as const) {
    const k = keys(side);
    const active = next[k.active];
    if (isFaceDown(active)) next = revealFaceDown(next, side, active.pokemon.id);
    const flagged = next[k.bench].filter((p) => isFaceDown(p) && wasAffected(next, p)).map((p) => p.pokemon.id);
    for (const id of flagged) next = revealFaceDown(next, side, id);
  }
  return next;
}

/** A face-down card after its owner attached `energyIds` to it (the Energy it may hold untouched). */
export function withOwnerEnergy(p: PokemonInPlay): PokemonInPlay {
  if (!isFaceDown(p)) return p;
  return { ...p, pokemon: { ...p.pokemon, faceDownEnergyIds: p.attachedEnergy.map((e) => e.id) } };
}

function hiddenCard(placeholderId: string): GameCard {
  // A plain Basic (a guess the AI may simulate a flip with); says nothing about the real card
  return {
    id: `hidden-${placeholderId}`,
    name: HIDDEN_FACE_DOWN_NAME,
    number: 0,
    set: CardSet.GymChallenge,
    rarity: CardRarity.Common,
    kind: CardKind.Pokemon,
    stage: PokemonStage.Basic,
    hp: 60,
    types: [],
    attacks: [],
    retreatCost: 1,
    weaknesses: [],
    resistances: [],
  } as GameCard;
}

/**
 * `state` as `viewer` may see it: the other side's face-down cards keep their placeholder
 * (`FACE_DOWN_NAME`, id, Energy) but `faceDownCard` becomes a hidden Basic
 * (`HIDDEN_FACE_DOWN_NAME`, id `hidden-<placeholder id>`). The viewer's own face-down cards stay
 * readable. Same state object when the other side has none. Never feed a masked view back as
 * the real state.
 */
export function maskFaceDownFor(state: GameState, viewer: Side): GameState {
  const k = keys(viewer === "player" ? "opponent" : "player");
  const mask = (p: PokemonInPlay | null): PokemonInPlay | null =>
    isFaceDown(p) ? { ...p, pokemon: { ...p.pokemon, faceDownCard: hiddenCard(p.pokemon.id) } } : p;
  const active = state[k.active];
  const bench = state[k.bench];
  if (!isFaceDown(active) && !bench.some(isFaceDown)) return state;
  return { ...state, [k.active]: mask(active), [k.bench]: bench.map((p) => mask(p)!) };
}
