/**
 * Effects that show hidden cards can't be dropped once they did (player report: "Master Ball: you
 * see the 7 cards, cancel, and nothing happens — the card isn't spent and the deck isn't
 * shuffled"). The engine never holds a half-answered Trainer / power: the consumer runs the steps
 * and may cancel before resolving, so every step that shows hidden cards says so —
 * `commitsOnShow` (the chooser's own deck: every deck search, the top N cards) or `reveals` (the
 * other player's cards, own Prizes) — and `stepCommitsEffect(step)` is the consumer's cancel rule:
 * an optional step (min 0) is closed by answering it with nothing (the card is still spent and
 * the deck shuffled), a required one must be answered.
 */
import { describe, it, expect } from "vitest";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import {
  TRAINER_EFFECTS,
  POWER_EFFECTS,
  canPlayTrainerCard,
  getTrainerCoinFlips,
  getTrainerSteps,
  playTrainerCard,
  canUsePokemonPower,
  getPowerCoinFlips,
  getPowerSteps,
  usePokemonPower,
  stepCommitsEffect,
  minSelectionsOf,
  type SelectionStep,
} from "@/domain/effects";
import { answerStepForAI } from "@/domain/ai/pending";
import { decideOpponentTurn, executeAIAction, type AIAction } from "@/domain/ai";
import { ALL_CARDS } from "@/domain/catalog";
import { toInPlayCard, isPokemonCard } from "@/domain/cards";
import { EnergyType } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, energy, names, deepFreeze, takeable, type SetName } from "./helpers/state";

const { Fire, Water, Grass, Psychic, Lightning } = EnergyType;
const H = "heads" as const;
type Coin = "heads" | "tails";

// ============================================================================
// Audit: every Trainer and activated power, walked step by step on a crowded board
// ============================================================================

const c = (name: string, set?: SetName) => gameCard(name, set);

/** Every zone holds cards of every kind, so as many effects as possible are playable. */
function crowdedState(hand: GameCard[], opts: { basicsInHand?: boolean } = {}): GameState {
  const basicsInHand = opts.basicsInHand ?? true;
  return makeState({
    turnNumber: 6,
    player: {
      active: inPlay("Abra", { set: "base", energy: [Psychic, Psychic], damage: 20 }),
      bench: [
        inPlay("Brock's Sandshrew", { set: "gym-heroes", energy: [Grass] }),
        inPlay("Erika's Oddish", { set: "gym-heroes", energy: [Grass], damage: 10 }),
        inPlay("Charmander", { set: "base", energy: [Fire] }),
      ],
      hand: [
        ...hand,
        ...(basicsInHand ? [c("Machop", "base"), c("Pikachu", "base")] : []),
        c("Kadabra", "base"),
        c("Charizard", "base"),
        energy(Water),
        energy(Fire),
        energy(Psychic),
        c("Potion", "base"),
        c("Bill", "base"),
      ],
      deck: [
        c("Abra", "base"),
        c("Charmeleon", "base"),
        c("Dark Charmeleon", "rocket"),
        c("Brock's Vulpix", "gym-heroes"),
        c("Erika's Gloom", "gym-heroes"),
        c("Giovanni", "gym-challenge"),
        energy(Water),
        energy(Water),
        energy(Fire),
        energy(Psychic),
        c("Bill", "base"),
        c("Dratini", "base"),
        energy(Grass),
      ],
      prizes: [c("Onix", "base"), c("Potion", "base"), energy(Lightning), c("Magikarp", "base"), c("Switch", "base"), c("Gastly", "base")],
      discard: [c("Potion", "base"), c("Abra", "base"), energy(Water), energy(Fire), c("Bill", "base")],
    },
    opponent: {
      active: inPlay("Machop", { set: "base", energy: [Fire, Fire], damage: 10 }),
      bench: [inPlay("Pikachu", { set: "base", energy: [Lightning], damage: 10 }), inPlay("Onix", { set: "base" })],
      hand: [c("Potion", "base"), c("Abra", "base"), energy(Fire), c("Switch", "base")],
      deck: [c("Bill", "base"), c("Abra", "base"), energy(Grass), energy(Fire), c("Gust of Wind", "base"), c("Machop", "base")],
      prizes: [c("Pikachu", "base"), energy(Fire), c("Bill", "base"), c("Onix", "base"), c("Potion", "base"), c("Abra", "base")],
      discard: [c("Potion", "base"), c("Machop", "base"), energy(Fire)],
    },
  });
}

type Engine = {
  canUse: (state: GameState, id: string) => string | null;
  coins: (state: GameState, id: string, selections: string[][]) => number | "untilTails";
  steps: (state: GameState, id: string, selections: string[][], coins?: Coin[]) => SelectionStep | null;
};
const TRAINER: Engine = { canUse: canPlayTrainerCard, coins: getTrainerCoinFlips, steps: getTrainerSteps };
const POWER: Engine = { canUse: canUsePokemonPower, coins: getPowerCoinFlips, steps: getPowerSteps };

/** Ids of every card a player can't see now: own deck / Prizes, the other player's hand / deck / Prizes. */
const hiddenIds = (state: GameState) =>
  new Set([...state.playerDeck, ...state.playerPrizes, ...state.opponentHand, ...state.opponentDeck, ...state.opponentPrizes].map((card) => card.id));

/**
 * Walks the effect answering like the AI does, with every coin `coin`. Returns the steps that
 * showed hidden cards and fails on one that did without being a point of no return.
 */
function walk(engine: Engine, state: GameState, sourceId: string, coin: Coin, label: string): SelectionStep[] {
  if (engine.canUse(state, sourceId)) return [];
  const requirement = engine.coins(state, sourceId, []);
  const coins: Coin[] = requirement === "untilTails" ? ["tails"] : Array.from({ length: requirement }, () => coin);
  const hidden = hiddenIds(state);
  const shown: SelectionStep[] = [];
  const selections: string[][] = [];
  for (let i = 0; i < 8; i++) {
    let step: SelectionStep | null;
    try {
      step = engine.steps(state, sourceId, selections, coins);
    } catch {
      break;
    }
    if (!step) break;
    const cards = [...(step.cards ?? []), ...(step.orderingCards ?? [])];
    if (cards.some((card) => hidden.has(card.id))) {
      expect(stepCommitsEffect(step), `${label}, step ${i} ("${step.description}") shows hidden cards`).toBe(true);
      shown.push(step);
    }
    selections.push(answerStepForAI(step));
  }
  return shown;
}

/** A Pokémon in play with this activated power (the first catalog card that has it). */
function withPower(powerName: string): PokemonInPlay | null {
  const card = ALL_CARDS.find((card) => isPokemonCard(card) && card.power?.name === powerName);
  if (!card) return null;
  return { ...inPlay("Abra", { set: "base" }), pokemon: toInPlayCard({ ...structuredClone(card), id: `${card.id}#power` } as GameCard) };
}

describe("audit: every step that shows hidden cards is a point of no return", () => {
  const trainerNames = Object.keys(TRAINER_EFFECTS);

  it("Trainers (both coin results; with and without Basics in the hand)", () => {
    const showing = new Set<string>();
    for (const name of trainerNames) {
      const catalog = ALL_CARDS.find((card) => card.name === name);
      if (!catalog) continue;
      for (const basicsInHand of [true, false]) {
        for (const coin of [H, "tails"] as const) {
          const trainer = { ...structuredClone(catalog), id: `${catalog.id}#audit` } as GameCard;
          const state = crowdedState([trainer], { basicsInHand });
          if (walk(TRAINER, state, trainer.id, coin, name).length > 0) showing.add(name);
        }
      }
    }
    // The cards this audit must keep reaching (a new one showing hidden cards is checked too)
    expect([...showing].sort()).toEqual(
      expect.arrayContaining([
        "Challenge!",
        "Computer Search",
        "Energy Search",
        "Erika's Maids",
        "Erika's Perfume",
        "Good Manners",
        "Brock's Training Method",
        "Master Ball",
        "Misty's Tears",
        "Misty's Wish",
        "Misty's Wrath",
        "Poké Ball",
        "Pokédex",
        "Pokémon Trader",
        "Rocket's Secret Experiment",
        "Rocket's Sneak Attack",
        "Secret Mission",
        "The Boss's Way",
      ])
    );
  });

  it("activated powers (from the Bench and as the Active)", () => {
    const showing = new Set<string>();
    for (const powerName of Object.keys(POWER_EFFECTS)) {
      const pokemon = withPower(powerName);
      if (!pokemon) continue;
      for (const where of ["bench", "active"] as const) {
        for (const coin of [H, "tails"] as const) {
          const base = crowdedState([]);
          const state: GameState =
            where === "bench"
              ? { ...base, playerBench: [...base.playerBench, pokemon] }
              : { ...base, playerActivePokemon: { ...pokemon, attachedEnergy: base.playerActivePokemon!.attachedEnergy } };
          if (walk(POWER, state, pokemon.pokemon.id, coin, powerName).length > 0) showing.add(powerName);
        }
      }
    }
    expect([...showing]).toEqual(expect.arrayContaining(["Luz Evolutiva"]));
  });
});

// ============================================================================
// Card scenarios
// ============================================================================

const withHand = (hand: GameCard[], deck: GameCard[], extra: { discard?: GameCard[] } = {}) =>
  deepFreeze(
    makeState({
      player: { active: inPlay("Machop", { set: "base" }), hand, deck, ...extra },
      opponent: { active: inPlay("Onix", { set: "base" }) },
    })
  );

const shuffledLine = (before: GameState, after: GameState) => after.events.slice(before.events.length).some((e) => e.message === "Se mezcló el mazo");
const sameCards = (a: GameCard[], b: GameCard[]) => expect(a.map((card) => card.id).sort()).toEqual(b.map((card) => card.id).sort());

/** A step the player must answer: no empty answer, and it is a point of no return. */
function expectRequired(step: SelectionStep | null) {
  expect(step).toBeTruthy();
  expect(stepCommitsEffect(step!)).toBe(true);
  expect(minSelectionsOf(step!)).toBeGreaterThan(0);
}

/** An optional step past the point of no return ("Cancelar" answers it with nothing). */
function expectOptional(step: SelectionStep | null) {
  expect(step).toBeTruthy();
  expect(stepCommitsEffect(step!)).toBe(true);
  expect(minSelectionsOf(step!)).toBe(0);
}

/** Own hidden cards are answered on the player's own view: not a step the multiplayer server builds. */
function expectClientStep(step: SelectionStep | null) {
  expect(step!.commitsOnShow).toBe(true);
  expect(step!.reveals).toBeUndefined();
  expect(step!.chooser ?? "self").toBe("self");
}

describe("Master Ball (the reported card): \"you may choose\" — taking nothing still spends it and shuffles", () => {
  it("the look is optional and commits; nothing taken: Master Ball discarded, deck shuffled with the same cards", () => {
    const ball = c("Master Ball", "gym-challenge");
    const deck = [energy(Fire), c("Pikachu", "base"), energy(Water), energy(Grass), c("Bill", "base"), energy(Fire), energy(Psychic), c("Abra", "base")];
    const state = withHand([ball], deck);
    const step = getTrainerSteps(state, ball.id, []);
    expectOptional(step);
    expectClientStep(step);
    const next = playTrainerCard(state, ball.id, [[]]);
    expect(names(next.playerDiscard)).toEqual(["Master Ball"]);
    expect(next.playerHand).toEqual([]);
    sameCards(next.playerDeck, deck);
    expect(shuffledLine(state, next)).toBe(true);
    expect(next.events.some((e) => e.message === "Master Ball: no se tomó ninguna carta")).toBe(true);
  });

  it("no Pokémon among the 7: still a point of no return, answered with nothing", () => {
    const ball = c("Master Ball", "gym-challenge");
    const state = withHand([ball], [energy(Fire), energy(Water)]);
    const step = getTrainerSteps(state, ball.id, [])!;
    expectOptional(step);
    expect(step.maxSelections).toBe(0);
    expect(names(playTrainerCard(state, ball.id, [[]]).playerDiscard)).toEqual(["Master Ball"]);
  });
});

describe("required looks can't be skipped", () => {
  it("Misty's Wrath: \"choose 2\" of the top 7 — an empty answer is refused", () => {
    const wrath = c("Misty's Wrath", "gym-heroes");
    const deck = Array.from({ length: 8 }, () => energy(Water));
    const state = withHand([wrath], deck);
    const step = getTrainerSteps(state, wrath.id, []);
    expectRequired(step);
    expectClientStep(step);
    expect(() => playTrainerCard(state, wrath.id, [[]])).toThrow(IllegalActionError);
    const next = playTrainerCard(state, wrath.id, [[deck[0].id, deck[3].id]]);
    expect(next.playerHand).toHaveLength(2);
    expect(names(next.playerDiscard)).toContain("Misty's Wrath");
  });

  it("Pokédex: the top 5 must be put back in an order (keeping it is an answer)", () => {
    const dex = c("Pokédex", "base");
    const state = withHand([dex], Array.from({ length: 6 }, () => energy(Fire)));
    const step = getTrainerSteps(state, dex.id, []);
    expectRequired(step);
    expectClientStep(step);
    expect(() => playTrainerCard(state, dex.id, [[]])).toThrow(IllegalActionError);
    expect(names(playTrainerCard(state, dex.id, [["0", "1", "2", "3", "4"]]).playerDiscard)).toEqual(["Pokédex"]);
  });

  it("Computer Search: the discard step comes before the look; the search is required, the discards stay paid", () => {
    const search = c("Computer Search", "base");
    const potion = c("Potion", "base");
    const bill = c("Bill", "base");
    const deck = [energy(Fire), c("Abra", "base")];
    const state = withHand([search, potion, bill], deck);
    const discardStep = getTrainerSteps(state, search.id, [])!;
    expect(stepCommitsEffect(discardStep)).toBe(false);
    const look = getTrainerSteps(state, search.id, [[potion.id, bill.id]]);
    expectRequired(look);
    expectClientStep(look);
    expect(() => playTrainerCard(state, search.id, [[potion.id, bill.id], []])).toThrow(IllegalActionError);
    const next = playTrainerCard(state, search.id, [[potion.id, bill.id], [deck[1].id]]);
    expect(names(next.playerHand)).toEqual(["Abra"]);
    expect(names(next.playerDiscard).sort()).toEqual(["Bill", "Computer Search", "Potion"]);
  });

  it.each([
    ["Pokémon Trader", "base", [c("Kadabra", "base")]],
    ["Energy Search", "fossil", []],
    ["The Boss's Way", "rocket", []],
    ["Brock's Training Method", "gym-heroes", []],
    ["Good Manners", "gym-heroes", []],
  ] as const)("%s: a deck search for a specific card is required (no \"you may\")", (name, set, extraHand) => {
    const trainer = c(name, set as SetName);
    const deck = [energy(Fire), c("Abra", "base"), c("Dark Charmeleon", "rocket"), c("Brock's Vulpix", "gym-heroes"), c("Charmeleon", "base")];
    const state = withHand([trainer, ...extraHand], deck);
    expect(canPlayTrainerCard(state, trainer.id)).toBeNull();
    const before = extraHand.length > 0 ? [[extraHand[0].id]] : [];
    const step = getTrainerSteps(state, trainer.id, before);
    expectRequired(step);
    expectClientStep(step);
    expect(() => playTrainerCard(state, trainer.id, [...before, []])).toThrow(IllegalActionError);
    const pick = takeable(step!)[0];
    const next = playTrainerCard(state, trainer.id, [...before, [pick.id]]);
    expect(names(next.playerDiscard)).toContain(name);
    expect(next.playerHand.some((card) => card.id === pick.id)).toBe(true);
  });

  it("Rocket's Secret Experiment (heads): the whole deck, deck-search style; required", () => {
    const experiment = c("Rocket's Secret Experiment", "gym-challenge");
    const deck = [energy(Fire), c("Abra", "base"), c("Bill", "base")];
    const state = withHand([experiment], deck);
    const step = getTrainerSteps(state, experiment.id, [], [H]);
    expectRequired(step);
    expectClientStep(step);
    expect(takeable(step!)).toHaveLength(3);
    expect(() => playTrainerCard(state, experiment.id, [[]], { coinResults: [H] })).toThrow(IllegalActionError);
  });
});

describe("optional searches past the point of no return resolve taking nothing", () => {
  it("Erika's Maids: \"up to 2\" — nothing taken: the 2 hand cards are still traded into the deck, shuffled", () => {
    const maids = c("Erika's Maids", "gym-heroes");
    const a = c("Potion", "base");
    const b = c("Bill", "base");
    const deck = [c("Erika's Gloom", "gym-heroes"), energy(Grass)];
    const state = withHand([maids, a, b], deck);
    expect(stepCommitsEffect(getTrainerSteps(state, maids.id, [])!)).toBe(false);
    const look = getTrainerSteps(state, maids.id, [[a.id, b.id]]);
    expectOptional(look);
    expectClientStep(look);
    const next = playTrainerCard(state, maids.id, [[a.id, b.id], []]);
    expect(next.playerHand).toEqual([]);
    expect(names(next.playerDiscard)).toEqual(["Erika's Maids"]);
    sameCards(next.playerDeck, [...deck, a, b]);
  });

  it("Misty's Tears: \"up to 2\" Water Energy — nothing taken: the discard cost stays paid, deck shuffled", () => {
    const tears = c("Misty's Tears", "gym-challenge");
    const cost = c("Potion", "base");
    const deck = [energy(Water), energy(Fire), energy(Water)];
    const state = withHand([tears, cost], deck);
    const look = getTrainerSteps(state, tears.id, [[cost.id]]);
    expectOptional(look);
    expectClientStep(look);
    const next = playTrainerCard(state, tears.id, [[cost.id], []]);
    expect(names(next.playerDiscard).sort()).toEqual(["Misty's Tears", "Potion"]);
    sameCards(next.playerDeck, deck);
    expect(shuffledLine(state, next)).toBe(true);
  });

  it("Poké Ball (heads): \"you may search\" — nothing taken: discarded, deck shuffled", () => {
    const ball = c("Poké Ball", "jungle");
    const deck = [c("Abra", "base"), energy(Fire)];
    const state = withHand([ball], deck);
    const look = getTrainerSteps(state, ball.id, [], [H]);
    expectOptional(look);
    expectClientStep(look);
    const next = playTrainerCard(state, ball.id, [[]], { coinResults: [H] });
    expect(names(next.playerDiscard)).toEqual(["Poké Ball"]);
    sameCards(next.playerDeck, deck);
  });
});

describe("other hidden cards (`reveals`) count as points of no return too", () => {
  it("Secret Mission's look at the opponent's hand; Misty's Wish's look at a Prize (not the Prize position step before it)", () => {
    const mission = c("Secret Mission", "gym-heroes");
    const state = makeState({
      player: { active: inPlay("Machop", { set: "base" }), hand: [mission, c("Bill", "base")] },
      opponent: { active: inPlay("Onix", { set: "base" }), hand: [c("Potion", "base")] },
    });
    expect(stepCommitsEffect(getTrainerSteps(state, mission.id, [])!)).toBe(true);

    const wish = c("Misty's Wish", "gym-challenge");
    const wishState = makeState({ player: { active: inPlay("Machop", { set: "base" }), hand: [wish, c("Bill", "base")] }, opponent: { active: inPlay("Onix", { set: "base" }) } });
    expect(stepCommitsEffect(getTrainerSteps(wishState, wish.id, [])!)).toBe(false);
    expect(stepCommitsEffect(getTrainerSteps(wishState, wish.id, [["0"]])!)).toBe(true);
  });
});

describe("activated power: Evolutionary Light (Dark Dragonair)", () => {
  it("its deck search is a required point of no return; the power is marked used once answered", () => {
    const dragonair = inPlay("Dark Dragonair", { set: "rocket" });
    const deck = [energy(Psychic), c("Charmeleon", "base")];
    const state = deepFreeze(makeState({ player: { active: inPlay("Charmander", { set: "base" }), bench: [dragonair], deck }, opponent: { active: inPlay("Onix", { set: "base" }) } }));
    const step = getPowerSteps(state, dragonair.pokemon.id, []);
    expectRequired(step);
    expectClientStep(step);
    expect(() => usePokemonPower(state, dragonair.pokemon.id, [[]])).toThrow(IllegalActionError);
    const next = usePokemonPower(state, dragonair.pokemon.id, [[deck[1].id]]);
    expect(names(next.playerHand)).toEqual(["Charmeleon"]);
    expect(canUsePokemonPower(next, dragonair.pokemon.id)).not.toBeNull();
  });
});

describe("the AI still plays and answers them", () => {
  const run = (state: GameState, plan: AIAction[]) => plan.reduce((s, action) => executeAIAction(s, action), state);

  it("Master Ball: the AI plays it and takes a Pokémon among the 7 (deck shuffled)", () => {
    const ball = c("Master Ball", "gym-challenge");
    const deck = [energy(Fire), c("Charmeleon", "base"), energy(Fire), energy(Fire), energy(Fire), energy(Fire), energy(Fire), energy(Fire)];
    const state = makeState({
      turnNumber: 6,
      isPlayerTurn: false,
      player: { active: inPlay("Onix", { set: "base" }) },
      opponent: { active: inPlay("Charmander", { set: "base" }), hand: [ball], deck },
    });
    const plan = decideOpponentTurn(state);
    expect(plan.flatMap((a) => (a.type === "playTrainer" ? [a.trainerName] : []))).toEqual(["Master Ball"]);
    const after = run(state, plan);
    expect(names(after.opponentHand)).toEqual(["Charmeleon"]);
    expect(names(after.opponentDiscard)).toEqual(["Master Ball"]);
    expect(after.opponentDeck).toHaveLength(deck.length - 1);
  });

  it("the AI's generic answer to an optional look takes a card when it can, to a required one the count asked", () => {
    const ball = c("Master Ball", "gym-challenge");
    const pikachu = c("Pikachu", "base");
    const step = getTrainerSteps(withHand([ball], [energy(Fire), pikachu]), ball.id, [])!;
    expect(answerStepForAI(step)).toEqual([pikachu.id]);
    const wrath = c("Misty's Wrath", "gym-heroes");
    const wrathStep = getTrainerSteps(withHand([wrath], Array.from({ length: 7 }, () => energy(Water))), wrath.id, [])!;
    expect(answerStepForAI(wrathStep)).toHaveLength(2);
  });
});
