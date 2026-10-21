/**
 * Adventure passives as engine hooks (spec §3.2). A passive belongs to a side of the table
 * (`state.passives`, relative: swapped by swapSides):
 * - `opening_hand_plus_1` / `prize_minus_one`: setup options (`setupOptionsForPassives`, used by createAdventureGame);
 * - `start_attached_energy`: `applySetupRules` at the both-ready transition (startPlayingPhase);
 * - `lucky_coin`: `takeLuckyCoin`, called by the coin source of the server (the engine never flips);
 * - `extra_heart`: run level (API); the engine ignores it.
 */

import { EnergyType } from "@/domain/constants";
import { isBasicEnergy, isPokemonCard } from "@/domain/cards";
import type { GameState, StartGameOptions } from "@/lib/gameState";
import { createGameEvent, energyCardLabel, getAvailableAttacks, shuffle } from "@/lib/gameState";
import type { AdventurePassive, SidePair, TableSide } from "./types";

export type { AdventurePassive } from "./types";

/** Every passive, for content validation. */
export const ADVENTURE_PASSIVES: readonly AdventurePassive[] = [
  "lucky_coin",
  "start_attached_energy",
  "opening_hand_plus_1",
  "prize_minus_one",
  "extra_heart",
];

function toPair(value: number | SidePair): SidePair {
  return typeof value === "number" ? { player: value, opponent: value } : { ...value };
}

/**
 * The startGame options of a battle: the base Prize count / opening hand (a number or per side)
 * with each side's passives applied — `opening_hand_plus_1`: that side's hand + 1;
 * `prize_minus_one`: that side gets one Prize fewer (minimum 1; owner Q1: dealt, not a separate target).
 */
export function setupOptionsForPassives(input: {
  prizeCount: number | SidePair;
  openingHand: number | SidePair;
  playerPassives: readonly AdventurePassive[];
  opponentPassives?: readonly AdventurePassive[];
}): { prizeCount: SidePair; openingHand: SidePair } & StartGameOptions {
  const prizeCount = toPair(input.prizeCount);
  const openingHand = toPair(input.openingHand);
  const sides: [TableSide, readonly AdventurePassive[]][] = [
    ["player", input.playerPassives],
    ["opponent", input.opponentPassives ?? []],
  ];
  for (const [side, passives] of sides) {
    if (passives.includes("opening_hand_plus_1")) openingHand[side] += 1;
    if (passives.includes("prize_minus_one")) prizeCount[side] = Math.max(1, prizeCount[side] - 1);
  }
  return { prizeCount, openingHand };
}

function sideZones(state: GameState, side: TableSide) {
  return side === "player"
    ? { active: state.playerActivePokemon, deck: state.playerDeck }
    : { active: state.opponentActivePokemon, deck: state.opponentDeck };
}

/**
 * `start_attached_energy` for one side: the first basic Energy card in deck order whose type is in
 * the cost of one of its Active's attacks (only Colorless costs: any basic Energy) is attached to
 * the Active and the deck is shuffled. Nothing usable: unchanged.
 */
function attachStartingEnergy(state: GameState, side: TableSide): GameState {
  const { active, deck } = sideZones(state, side);
  if (!active || !isPokemonCard(active.pokemon)) return state;
  const costTypes = new Set<EnergyType>(
    getAvailableAttacks(state, active).flatMap(({ attack }) => attack.cost).filter((type) => type !== EnergyType.Colorless)
  );
  const card = deck.find((c) => isBasicEnergy(c) && (costTypes.size === 0 || costTypes.has(c.energyType)));
  if (!card) return state;
  const newActive = { ...active, attachedEnergy: [...active.attachedEnergy, card] };
  const newDeck = shuffle(deck.filter((c) => c.id !== card.id));
  const event = createGameEvent(`Arranque rápido: ${active.pokemon.name} recibe ${energyCardLabel(card)}`, "action");
  return side === "player"
    ? { ...state, playerActivePokemon: newActive, playerDeck: newDeck, events: [...state.events, event] }
    : { ...state, opponentActivePokemon: newActive, opponentDeck: newDeck, events: [...state.events, event] };
}

/**
 * The adventure rules applied once both players are ready, before the first draw (startPlayingPhase
 * calls it): `start_attached_energy` for each side that has it. Returns the same state when nothing applies.
 */
export function applySetupRules(state: GameState): GameState {
  let next = state;
  for (const side of ["player", "opponent"] as const) {
    if (state.passives?.[side]?.includes("start_attached_energy")) next = attachStartingEnergy(next, side);
  }
  return next;
}

/**
 * `lucky_coin`: the first coin of that side's own action in the battle comes up heads. The caller's
 * coin source asks before flipping that coin: `{ coin: "heads", state }` (the passive marked used,
 * a log line) once, then null; null for a side without the passive.
 */
export function takeLuckyCoin(state: GameState, side: TableSide): { state: GameState; coin: "heads" } | null {
  const passives = state.passives;
  if (!passives?.[side]?.includes("lucky_coin") || passives.luckyCoinUsed?.[side]) return null;
  return {
    coin: "heads",
    state: {
      ...state,
      passives: { ...passives, luckyCoinUsed: { ...passives.luckyCoinUsed, [side]: true } },
      events: [...state.events, createGameEvent("Moneda de la suerte: la moneda sale cara", "info")],
    },
  };
}
