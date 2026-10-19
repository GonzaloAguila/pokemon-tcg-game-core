/**
 * Lucky Duel decks and setup: a random Basic Pokémon from the whole catalog, a 60-card deck built
 * around it (its line, 6 extra Pokémon of its two colours that can never enter play, 24 basic
 * Energy in those two colours, Trainers from the Lucky Duel pool) and the initial state with both
 * Actives already placed face down.
 *
 * Randomness only comes from the `rng` parameter (the server's RNG; a seeded one in tests).
 */

import { ALL_CARDS as CATALOG, isSetInDevelopment } from "@/domain/catalog";
import type { Card, EnergyCard, PokemonCard, TrainerCard } from "@/domain/cards/types";
import { isLimitedInDeck } from "@/domain/cards/guards";
import { EnergyType, GamePhase, PokemonStage } from "@/domain/constants";
import { newPokemonInPlay } from "@/domain/board";
import { canEvolveInto, createGameEvent, type GameCard, type GameState } from "@/lib/gameState";
import { luckyDuelTrainerFitsLine } from "./rules";

export type LuckyDuelDraw = {
  /** The Basic Pokémon the player starts with (a catalog card; also in `deck`). */
  active: PokemonCard;
  /** The 60 cards, the Active included (catalog cards: ids repeat; initializeLuckyDuelGame gives each copy its own id). */
  deck: Card[];
  /** The line in the deck: the Basic (`active`), then its Stage 1 and Stage 2 if drawn. */
  line: PokemonCard[];
  /**
   * The extra Pokémon in the deck (owner request 2026-10-18): 3 of the primary colour, then 3 of the
   * secondary, 1 per name, none of them able to evolve onto the line (see drawExtras). With the
   * Benches locked they never enter play: fodder for Pokémon Trader, Blaine's Quiz #1, discard costs.
   */
  extras: PokemonCard[];
  /** [primary, secondary]: 16 and 8 basic Energy cards. */
  colors: [EnergyType, EnergyType];
};

type Rng = () => number;

export const LUCKY_DUEL_DECK_SIZE = 60;
export const LUCKY_DUEL_PRIMARY_ENERGY = 16;
export const LUCKY_DUEL_SECONDARY_ENERGY = 8;
/** Extra Pokémon per colour (primary and secondary). */
export const LUCKY_DUEL_EXTRAS_PER_COLOR = 3;
const MAX_COPIES = 4;
const HAND_SIZE = 7;

/** The colours a deck can have (Colorless is not a colour). */
const COLORS: readonly EnergyType[] = [
  EnergyType.Grass, EnergyType.Fire, EnergyType.Water, EnergyType.Lightning, EnergyType.Psychic, EnergyType.Fighting,
];

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];

function shuffleWith<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The catalog without the sets still in development (their effects aren't implemented). */
const ALL_CARDS: readonly Card[] = CATALOG.filter((c) => !isSetInDevelopment(c));

const POKEMON: readonly PokemonCard[] = ALL_CARDS.filter((c): c is PokemonCard => c.kind === "pokemon");

/** Every Basic Pokémon printing of the catalog (Trainers played as Basics are not Pokémon). */
export const LUCKY_DUEL_BASICS: readonly PokemonCard[] = POKEMON.filter((c) => c.stage === PokemonStage.Basic);

function basicEnergy(type: EnergyType): EnergyCard {
  const card = ALL_CARDS.find((c): c is EnergyCard => c.kind === "energy" && c.isBasic && c.energyType === type);
  if (!card) throw new Error(`No basic ${type} Energy in the catalog`);
  return card;
}

/** Trainer printings grouped by name, in catalog order. */
const TRAINERS_BY_NAME: ReadonlyMap<string, TrainerCard[]> = (() => {
  const map = new Map<string, TrainerCard[]>();
  for (const c of ALL_CARDS) {
    if (c.kind !== "trainer") continue;
    map.set(c.name, [...(map.get(c.name) ?? []), c]);
  }
  return map;
})();

/**
 * The line of `active`: the Basic, a random Stage 1 that evolves from it (if any) and a random
 * Stage 2 that evolves from that Stage 1 (if any). Matching is the engine's evolution rule
 * (canEvolveInto): owners' Pokémon evolve into the same owner's, Dark Pokémon from the plain ones.
 */
function drawLine(active: PokemonCard, rng: Rng): PokemonCard[] {
  const line = [active];
  const stage1s = POKEMON.filter((p) => p.stage === PokemonStage.Stage1 && canEvolveInto(p, active));
  if (stage1s.length === 0) return line;
  const stage1 = pick(rng, stage1s);
  line.push(stage1);
  const stage2s = POKEMON.filter((p) => p.stage === PokemonStage.Stage2 && canEvolveInto(p, stage1));
  if (stage2s.length > 0) line.push(pick(rng, stage2s));
  return line;
}

/**
 * Primary = the Basic's type (random when it is Colorless). Secondary = a type an attack of the
 * line needs that the primary isn't (random among them), else a random other colour.
 */
function drawColors(line: readonly PokemonCard[], rng: Rng): [EnergyType, EnergyType] {
  const own = line[0].types.find((t) => t !== EnergyType.Colorless);
  const primary = own ?? pick(rng, COLORS);
  const costs = new Set(line.flatMap((p) => p.attacks.flatMap((a) => a.cost)));
  const needed = COLORS.filter((t) => t !== primary && costs.has(t));
  const secondary = pick(rng, needed.length > 0 ? needed : COLORS.filter((t) => t !== primary));
  return [primary, secondary];
}

/**
 * Every Pokémon name that could join the line in play: the line's names and, at any depth, every
 * card that evolves from one of them. The engine's evolution rules are all chains of `evolvesFrom`
 * names: evolving (canEvolveInto), Pokémon Breeder (a Stage 2 onto the Basic its catalog Stage 1
 * evolves from) and Rapid Evolution (`evolvesFrom` = the attacker). So a drawn Charmander also
 * excludes Charmeleon / Dark Charmeleon and every Charizard / Dark Charizard.
 */
function lineFamily(line: readonly PokemonCard[]): Set<string> {
  const names = new Set(line.map((p) => p.name));
  for (let grown = true; grown; ) {
    grown = false;
    for (const p of POKEMON) {
      if (p.evolvesFrom && names.has(p.evolvesFrom) && !names.has(p.name)) {
        names.add(p.name);
        grown = true;
      }
    }
  }
  return names;
}

/**
 * The extra Pokémon: LUCKY_DUEL_EXTRAS_PER_COLOR random printings (any set, any stage) of each
 * colour, 1 per name, never of the line's family (lineFamily). They can't enter play: the Benches
 * are locked (no Basic from the hand, no Bench search, Lt. Surge / Revive / Pokémon Flute / Clefairy
 * Doll / Mysterious Fossil are out of the pool), the Active is given (no setup placement, no
 * mulligan, no promotion) and nothing in the deck evolves onto the line except the line itself.
 */
function drawExtras(line: readonly PokemonCard[], colors: readonly EnergyType[], rng: Rng): PokemonCard[] {
  const taken = lineFamily(line);
  const extras: PokemonCard[] = [];
  for (const color of colors) {
    for (let n = 0; n < LUCKY_DUEL_EXTRAS_PER_COLOR; n++) {
      const open = POKEMON.filter((p) => p.types.includes(color) && !taken.has(p.name));
      if (open.length === 0) break;
      const card = pick(rng, open);
      taken.add(card.name);
      extras.push(card);
    }
  }
  return extras;
}

/** `count` Trainers from the pool that fit the line, at most 4 per name (isLimitedInDeck). */
function drawTrainers(line: readonly PokemonCard[], count: number, rng: Rng): TrainerCard[] {
  const pool = [...TRAINERS_BY_NAME.values()].filter((printings) => luckyDuelTrainerFitsLine(printings[0], line));
  const copies = new Map<string, number>();
  const trainers: TrainerCard[] = [];
  while (trainers.length < count) {
    const open = pool.filter((p) => !isLimitedInDeck(p[0]) || (copies.get(p[0].name) ?? 0) < MAX_COPIES);
    if (open.length === 0) throw new Error("The Lucky Duel Trainer pool is too small for a deck");
    const card = pick(rng, pick(rng, open));
    copies.set(card.name, (copies.get(card.name) ?? 0) + 1);
    trainers.push(card);
  }
  return trainers;
}

/** The Lucky Duel deck built around `active` (a Basic Pokémon card). */
export function buildLuckyDuelDeck(active: PokemonCard, rng: Rng = Math.random): LuckyDuelDraw {
  if (active.kind !== "pokemon" || active.stage !== PokemonStage.Basic) throw new Error(`${active.name} is not a Basic Pokémon`);
  const line = drawLine(active, rng);
  const colors = drawColors(line, rng);
  const energy = [
    ...Array.from({ length: LUCKY_DUEL_PRIMARY_ENERGY }, () => basicEnergy(colors[0])),
    ...Array.from({ length: LUCKY_DUEL_SECONDARY_ENERGY }, () => basicEnergy(colors[1])),
  ];
  const extras = drawExtras(line, colors, rng);
  const trainers = drawTrainers(line, LUCKY_DUEL_DECK_SIZE - line.length - extras.length - energy.length, rng);
  return { active, deck: [...line, ...extras, ...energy, ...trainers], colors, line, extras };
}

/** A random Basic Pokémon (uniform over every printing of every set) and its Lucky Duel deck. */
export function drawLuckyDuel(rng: Rng = Math.random): LuckyDuelDraw {
  return buildLuckyDuelDeck(pick(rng, LUCKY_DUEL_BASICS), rng);
}

/**
 * The initial Lucky Duel state, from player 1's view (player 2 is the "opponent" side), like
 * initializeMultiplayerGame + startGame: phase MULLIGAN, both Actives already in play (face down
 * until the both-ready transition: `luckyDuelRevealed`), no Prizes, 7-card hands, the other 52
 * cards in the deck. No mulligan (the Active is given). Every card gets a random id that says
 * nothing about the card (a face-down Active and hidden hands must not leak through ids).
 * Continue with setPlayerReady for each player and startPlayingPhase (do NOT call startGame).
 */
export function initializeLuckyDuelGame(player1: LuckyDuelDraw, player2: LuckyDuelDraw, rng: Rng = Math.random): GameState {
  const used = new Set<string>();
  const newId = (seat: number): string => {
    for (;;) {
      const id = `ld${seat}-${Math.floor(rng() * 36 ** 8).toString(36).padStart(8, "0")}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
  };
  const deal = (draw: LuckyDuelDraw, seat: number) => {
    const activeIndex = draw.deck.findIndex((c) => c.id === draw.active.id);
    if (activeIndex === -1) throw new Error("The Lucky Duel deck doesn't hold its Active");
    const rest = shuffleWith(rng, draw.deck.filter((_, i) => i !== activeIndex)).map((c): GameCard => ({ ...c, id: newId(seat) }));
    const active: GameCard = { ...draw.active, id: newId(seat) };
    return { active: newPokemonInPlay(active, 0), hand: rest.slice(0, HAND_SIZE), deck: rest.slice(HAND_SIZE) };
  };
  const p1 = deal(player1, 1);
  const p2 = deal(player2, 2);

  return {
    playerDeck: p1.deck,
    playerHand: p1.hand,
    playerPrizes: [],
    playerDiscard: [],
    playerActivePokemon: p1.active,
    playerBench: [],
    opponentDeck: p2.deck,
    opponentHand: p2.hand,
    opponentPrizes: [],
    opponentDiscard: [],
    opponentActivePokemon: p2.active,
    opponentBench: [],
    selectedDeckId: "lucky-duel",
    turnNumber: 0,
    startingPlayer: null,
    isPlayerTurn: false,
    gameStarted: true,
    gamePhase: GamePhase.Mulligan,
    playerReady: false,
    opponentReady: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    prizeCount: 0,
    gameMode: "lucky-duel",
    luckyDuelRevealed: false,
    events: [
      createGameEvent("Lucky Duel: cada jugador recibe un Pokémon Básico al azar boca abajo y un mazo armado a su alrededor", "system"),
      createGameEvent("Sin Banca ni Premios: si un Pokémon activo queda Fuera de Combate, la partida termina", "info"),
      createGameEvent("Pulsa Listo para revelar los Pokémon activos", "info"),
    ],
  };
}
