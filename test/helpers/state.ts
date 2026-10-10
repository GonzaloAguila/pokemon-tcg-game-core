/**
 * Test helpers: build minimal GameStates from real catalog cards so tests read
 * like card scenarios ("Magneton active with 4 energy, Abra on the bench with 20 damage").
 *
 * Perspective follows the engine: "player" is the side whose turn it is (the attacker
 * in executeAttack), "opponent" is the other side.
 */
import { baseSetCards, jungleCards } from "@/domain/catalog";
import type { Card } from "@/domain/cards";
import { GamePhase, StatusCondition, EnergyType } from "@/domain/constants";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";

export type SetName = "base" | "jungle";

let uid = 0;

function findCatalogCard(name: string, set?: SetName): Card {
  const pools: Card[][] =
    set === "base" ? [baseSetCards] : set === "jungle" ? [jungleCards] : [baseSetCards, jungleCards];
  for (const pool of pools) {
    const found = pool.find((c) => c.name === name);
    if (found) return found;
  }
  throw new Error(`Card "${name}" not found in ${set ?? "any set"}`);
}

/** A unique in-game instance of a catalog card (deep-cloned so tests can freeze it safely). */
export function gameCard(name: string, set?: SetName): GameCard {
  const card = structuredClone(findCatalogCard(name, set));
  uid += 1;
  return { ...card, id: `${card.id}#${uid}` } as GameCard;
}

const ENERGY_NAMES: Record<string, string> = {
  [EnergyType.Fire]: "Fire Energy",
  [EnergyType.Water]: "Water Energy",
  [EnergyType.Grass]: "Grass Energy",
  [EnergyType.Lightning]: "Lightning Energy",
  [EnergyType.Psychic]: "Psychic Energy",
  [EnergyType.Fighting]: "Fighting Energy",
  [EnergyType.Colorless]: "Double Colorless Energy",
};

/** A basic energy card instance ("colorless" gives a Double Colorless Energy). */
export function energy(type: EnergyType): GameCard {
  return gameCard(ENERGY_NAMES[type], "base");
}

export function energies(...types: EnergyType[]): GameCard[] {
  return types.map(energy);
}

export type InPlayOptions = {
  set?: SetName;
  damage?: number;
  energy?: EnergyType[];
  statuses?: StatusCondition[];
  /** Names of the lower stages under this Pokémon (e.g. ["Magnemite"] under Magneton) */
  evolvedFrom?: string[];
} & Partial<Omit<PokemonInPlay, "pokemon" | "attachedEnergy" | "currentDamage" | "statusConditions">>;

/** A Pokémon in play built from a catalog card. */
export function inPlay(name: string, opts: InPlayOptions = {}): PokemonInPlay {
  const { set, damage, energy: energyTypes, statuses, evolvedFrom, ...rest } = opts;
  return {
    pokemon: gameCard(name, set),
    attachedEnergy: (energyTypes ?? []).map(energy),
    attachedTrainers: [],
    previousEvolutions: (evolvedFrom ?? []).map((n) => gameCard(n, set)),
    currentDamage: damage ?? 0,
    statusConditions: statuses ?? [],
    playedOnTurn: 1,
    ...rest,
  };
}

export type SideSetup = {
  active?: PokemonInPlay | null;
  bench?: PokemonInPlay[];
  hand?: GameCard[];
  /** Defaults to 10 energies so endTurn can draw */
  deck?: GameCard[];
  /** Defaults to 6 prize cards */
  prizes?: GameCard[];
  discard?: GameCard[];
};

export type StateSetup = {
  player?: SideSetup;
  opponent?: SideSetup;
  turnNumber?: number;
  isPlayerTurn?: boolean;
} & Partial<Omit<GameState, "turnNumber" | "isPlayerTurn">>;

function filler(count: number, type: EnergyType): GameCard[] {
  return Array.from({ length: count }, () => energy(type));
}

/** Build a GameState in the PLAYING phase. */
export function makeState(setup: StateSetup = {}): GameState {
  const { player = {}, opponent = {}, turnNumber = 3, isPlayerTurn = true, ...overrides } = setup;
  return {
    playerDeck: player.deck ?? filler(10, EnergyType.Grass),
    playerHand: player.hand ?? [],
    playerPrizes: player.prizes ?? filler(6, EnergyType.Water),
    playerDiscard: player.discard ?? [],
    playerActivePokemon: player.active === undefined ? null : player.active,
    playerBench: player.bench ?? [],
    opponentDeck: opponent.deck ?? filler(10, EnergyType.Grass),
    opponentHand: opponent.hand ?? [],
    opponentPrizes: opponent.prizes ?? filler(6, EnergyType.Water),
    opponentDiscard: opponent.discard ?? [],
    opponentActivePokemon: opponent.active === undefined ? null : opponent.active,
    opponentBench: opponent.bench ?? [],
    selectedDeckId: null,
    turnNumber,
    startingPlayer: "player",
    isPlayerTurn,
    gameStarted: true,
    gamePhase: GamePhase.Playing,
    playerReady: true,
    opponentReady: true,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    events: [],
    ...overrides,
  };
}

/** Recursively Object.freeze a value (used to prove functions don't mutate their input). */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}

/** Index of the attack with the given name on a Pokémon in play. */
export function attackIndex(pokemon: PokemonInPlay, attackName: string): number {
  const card = pokemon.pokemon;
  if (card.kind !== "pokemon") throw new Error(`${card.name} is not a Pokémon`);
  const idx = card.attacks.findIndex((a) => a.name === attackName);
  if (idx === -1) {
    throw new Error(`${card.name} has no attack "${attackName}" (has: ${card.attacks.map((a) => a.name).join(", ")})`);
  }
  return idx;
}

/** Names of the cards in a pile, for readable assertions. */
export function names(cards: GameCard[]): string[] {
  return cards.map((c) => c.name);
}
