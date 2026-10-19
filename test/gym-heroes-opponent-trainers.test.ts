/**
 * Gym Heroes Trainers the opponent answers (`chooser: "opponent"` steps), from the printed texts:
 * - #16 Erika: "You may draw up to 3 cards, then your opponent may draw up to 3 cards."
 * - #112 Lt. Surge's Treaty: "Your opponent chooses 1 of the following: everyone chooses 1 of his
 *   or her own Prizes and put it into his or her hand, or you draw a card."
 * - #97 Blaine's Quiz #1: the player names a Pokémon card of the hand, the opponent guesses its
 *   length; right: the opponent draws 2, wrong: the player draws 2; the card goes back to the hand.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import type { GameState } from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerSteps, playTrainerCard, stepForAnswerer, type SelectionStep } from "@/domain/effects";
import { ALL_CARDS } from "@/domain/catalog";
import { GamePhase } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { swapSides } from "@/domain/board";
import { decideOpponentTurn, executeAIAction, answerOpponentTrainerStep, answerOpponentTrainerStepForAI } from "@/domain/ai";
import {
  POKEDEX_HEIGHTS,
  pokedexSpecies,
  pokedexHeight,
  heightInInches,
  quizLengthOptions,
} from "@/index";
import { makeState, inPlay, gameCard, names, deepFreeze } from "./helpers/state";

const card = (name: string) => gameCard(name, "gym-heroes");
type Setup = NonNullable<Parameters<typeof makeState>[0]>;
const fill = (n: number, name = "Grass Energy") => Array.from({ length: n }, () => gameCard(name, "base"));

function withHand(hand: ReturnType<typeof gameCard>[], extra: Setup = {}): GameState {
  return makeState({
    ...extra,
    player: { active: inPlay("Machop"), hand, ...(extra.player ?? {}) },
    opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) },
  });
}

const ids = (step: SelectionStep | null) => step!.options.map((o) => o.id);
const enabledIds = (step: SelectionStep | null) => step!.options.filter((o) => !o.disabled).map((o) => o.id);

/** Log lines added by `after` that name a side (only the classic leading forms are allowed; see event-perspective.test.ts). */
const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival|Pusiste|Tomaste|Mostraste|miraste|Barajaste|barajaste|descartaste)\b/;
const ALLOWED = [/^Jugaste [^:]*$/, /^Robaste \d+ cartas?$/, /^Descartaste [^:]*$/];
function badLines(before: GameState, after: GameState): string[] {
  return after.events
    .slice(before.events.length)
    .map((e) => e.message)
    .filter((m) => !ALLOWED.some((ok) => ok.test(m)) && RELATIVE.test(m));
}
const newLines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);

afterEach(() => vi.restoreAllMocks());

// ============================================================================
// Erika
// ============================================================================

describe("Erika", () => {
  it("the player's step then the opponent's step: options 0–3, single choice, the opponent's worded for them", () => {
    const erika = card("Erika");
    const state = withHand([erika]);
    expect(canPlayTrainerCard(state, erika.id)).toBeNull();

    const mine = getTrainerSteps(state, erika.id, [])!;
    expect(ids(mine)).toEqual(["0", "1", "2", "3"]);
    expect(mine.options.map((o) => o.label)).toEqual(["0", "1", "2", "3"]);
    expect(mine.maxSelections).toBe(1);
    expect(mine.minSelections).toBe(1);
    expect(mine.chooser ?? "self").toBe("self");
    expect(mine.description).toMatch(/¿Cuántas cartas quieres robar\?/);

    const theirs = getTrainerSteps(state, erika.id, [["2"]])!;
    expect(ids(theirs)).toEqual(["0", "1", "2", "3"]);
    expect(theirs.chooser).toBe("opponent");
    expect(theirs.maxSelections).toBe(1);
    expect(theirs.minSelections).toBe(1);
    expect(theirs.description).toMatch(/Tu rival/);
    const asked = stepForAnswerer(theirs);
    expect(asked.description).toMatch(/¿cuántas cartas quieres robar\?/i);
    expect(asked.description).toMatch(/Tu rival jugó Erika/);
    expect(getTrainerSteps(state, erika.id, [["2"], ["3"]])).toBeNull();
  });

  it("each side draws what it chose; the Trainer is discarded; no mutation; perspective-free log", () => {
    const erika = card("Erika");
    const state = deepFreeze(withHand([erika], { player: { deck: fill(10) }, opponent: { deck: fill(10) } }));
    const next = playTrainerCard(state, erika.id, [["2"], ["3"]]);
    expect(next.playerHand).toHaveLength(2);
    expect(next.playerDeck).toHaveLength(8);
    expect(next.opponentHand).toHaveLength(3);
    expect(next.opponentDeck).toHaveLength(7);
    expect(names(next.playerDiscard)).toEqual(["Erika"]);
    expect(newLines(state, next)).toEqual(["Jugaste Erika", "Robaste 2 cartas", "Erika: el otro jugador robó 3 cartas"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("drawing 0 is allowed on both sides", () => {
    const erika = card("Erika");
    const state = withHand([erika]);
    const next = playTrainerCard(state, erika.id, [["0"], ["0"]]);
    expect(next.playerHand).toHaveLength(0);
    expect(next.opponentHand).toHaveLength(0);
  });

  it("counts above a deck's size are disabled (0 always offered) and refused", () => {
    const erika = card("Erika");
    const state = withHand([erika], { player: { deck: fill(1) }, opponent: { deck: [] } });
    expect(enabledIds(getTrainerSteps(state, erika.id, []))).toEqual(["0", "1"]);
    expect(enabledIds(getTrainerSteps(state, erika.id, [["1"]]))).toEqual(["0"]);
    expect(() => playTrainerCard(state, erika.id, [["2"], ["0"]])).toThrow(IllegalActionError);
    expect(() => playTrainerCard(state, erika.id, [["1"], ["1"]])).toThrow(IllegalActionError);
    const next = playTrainerCard(state, erika.id, [["1"], ["0"]]);
    expect(next.playerDeck).toHaveLength(0);
    expect(next.gameResult).toBeNull();
  });

  it("the AI as the opponent draws as many as it can without emptying its deck", () => {
    const erika = card("Erika");
    const roomy = withHand([erika], { opponent: { deck: fill(10) } });
    expect(answerOpponentTrainerStepForAI(roomy, erika.id, getTrainerSteps(roomy, erika.id, [["0"]])!)).toEqual(["3"]);
    const short = withHand([erika], { opponent: { deck: fill(3) } });
    expect(answerOpponentTrainerStepForAI(short, erika.id, getTrainerSteps(short, erika.id, [["0"]])!)).toEqual(["2"]);
    const empty = withHand([erika], { opponent: { deck: [] } });
    expect(answerOpponentTrainerStepForAI(empty, erika.id, getTrainerSteps(empty, erika.id, [["0"]])!)).toEqual(["0"]);
  });
});

// ============================================================================
// Lt. Surge's Treaty
// ============================================================================

describe("Lt. Surge's Treaty", () => {
  const TREATY = "Lt. Surge's Treaty";

  it("the opponent chooses one of the two printed options", () => {
    const treaty = card(TREATY);
    const state = withHand([treaty]);
    const first = getTrainerSteps(state, treaty.id, [])!;
    expect(first.chooser).toBe("opponent");
    expect(ids(first)).toEqual(["prizes", "draw"]);
    expect(first.maxSelections).toBe(1);
    expect(stepForAnswerer(first).description).toMatch(/Tu rival jugó Lt\. Surge's Treaty/);
    expect(getTrainerSteps(state, treaty.id, [["draw"]])).toBeNull();
  });

  it("draw: the Trainer's player draws a card", () => {
    const treaty = card(TREATY);
    const state = deepFreeze(withHand([treaty]));
    const next = playTrainerCard(state, treaty.id, [["draw"]]);
    expect(next.playerHand).toHaveLength(1);
    expect(next.playerDeck).toHaveLength(9);
    expect(next.playerPrizes).toHaveLength(6);
    expect(next.opponentPrizes).toHaveLength(6);
    expect(names(next.playerDiscard)).toEqual([TREATY]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("prizes: the player picks one of their face-down Prizes, then the opponent one of theirs", () => {
    const treaty = card(TREATY);
    const myPrizes = [gameCard("Bill", "base"), gameCard("Potion", "base"), gameCard("Switch", "base")];
    const theirPrizes = [gameCard("Pikachu", "base"), gameCard("Abra", "base")];
    const state = deepFreeze(withHand([treaty], { player: { prizes: myPrizes }, opponent: { prizes: theirPrizes } }));

    const mine = getTrainerSteps(state, treaty.id, [["prizes"]])!;
    expect(mine.chooser ?? "self").toBe("self");
    expect(ids(mine)).toEqual(["0", "1", "2"]);
    // Face down: no card names
    expect(mine.options.map((o) => o.label)).toEqual(["Premio 1", "Premio 2", "Premio 3"]);
    expect(mine.cards).toBeUndefined();

    const theirs = getTrainerSteps(state, treaty.id, [["prizes"], ["1"]])!;
    expect(theirs.chooser).toBe("opponent");
    expect(ids(theirs)).toEqual(["0", "1"]);
    expect(theirs.options.map((o) => o.label)).toEqual(["Premio 1", "Premio 2"]);
    expect(stepForAnswerer(theirs).description).toMatch(/tus Premios/);
    expect(getTrainerSteps(state, treaty.id, [["prizes"], ["1"], ["0"]])).toBeNull();

    const next = playTrainerCard(state, treaty.id, [["prizes"], ["1"], ["0"]]);
    expect(names(next.playerHand)).toEqual(["Potion"]);
    expect(names(next.playerPrizes)).toEqual(["Bill", "Switch"]);
    expect(names(next.opponentHand)).toEqual(["Pikachu"]);
    expect(names(next.opponentPrizes)).toEqual(["Abra"]);
    expect(next.gameResult).toBeNull();
    expect(badLines(state, next)).toEqual([]);
    // The log never names the hidden Prizes
    expect(newLines(state, next).join(" ")).not.toMatch(/Potion|Pikachu/);
  });

  it("face-up Prizes (Here Comes Team Rocket!) are named in the options", () => {
    const treaty = card(TREATY);
    const state = withHand([treaty], { prizesFaceUp: true, player: { prizes: [gameCard("Bill", "base")] } });
    expect(getTrainerSteps(state, treaty.id, [["prizes"]])!.options.map((o) => o.label)).toEqual(["Premio 1: Bill"]);
  });

  it("taking a last Prize wins the game", () => {
    const treaty = card(TREATY);
    const state = withHand([treaty], { player: { prizes: [gameCard("Bill", "base"), gameCard("Bill", "base")] }, opponent: { prizes: [gameCard("Abra", "base")] } });
    const next = playTrainerCard(state, treaty.id, [["prizes"], ["0"], ["0"]]);
    expect(next.opponentPrizes).toHaveLength(0);
    expect(next.gameResult).toBe("defeat");
    expect(next.gamePhase).toBe(GamePhase.GameOver);
  });

  it("both sides on their last Prize: the Prize option is disabled (sudden death isn't modelled)", () => {
    const treaty = card(TREATY);
    const state = withHand([treaty], { player: { prizes: [gameCard("Bill", "base")] }, opponent: { prizes: [gameCard("Abra", "base")] } });
    expect(enabledIds(getTrainerSteps(state, treaty.id, []))).toEqual(["draw"]);
    expect(() => playTrainerCard(state, treaty.id, [["prizes"], ["0"], ["0"]])).toThrow(IllegalActionError);
  });

  it("the AI as the opponent picks the option worse for the Trainer's player", () => {
    const treaty = card(TREATY);
    const prizes = (n: number) => fill(n, "Water Energy");
    // The AI is ahead (fewer Prizes left): the Prize option helps it more
    const ahead = withHand([treaty], { player: { prizes: prizes(4) }, opponent: { prizes: prizes(2) } });
    expect(answerOpponentTrainerStepForAI(ahead, treaty.id, getTrainerSteps(ahead, treaty.id, [])!)).toEqual(["prizes"]);
    // Behind: the Trainer's player would get closer to winning; let it draw 1 instead
    const behind = withHand([treaty], { player: { prizes: prizes(2) }, opponent: { prizes: prizes(4) } });
    expect(answerOpponentTrainerStepForAI(behind, treaty.id, getTrainerSteps(behind, treaty.id, [])!)).toEqual(["draw"]);
    // Its own Prize: any position (face down)
    const step = getTrainerSteps(ahead, treaty.id, [["prizes"], ["0"]])!;
    expect(enabledIds(step)).toContain(answerOpponentTrainerStepForAI(ahead, treaty.id, step)[0]);
  });
});

// ============================================================================
// Blaine's Quiz #1
// ============================================================================

describe("Pokédex lengths (Blaine's Quiz #1)", () => {
  it("cover every Pokémon card in ALL_CARDS (owner / Dark prefixes stripped)", () => {
    const missing = ALL_CARDS.filter((c) => c.kind === "pokemon" && !pokedexHeight(c)).map((c) => c.name);
    expect(missing).toEqual([]);
    expect(pokedexSpecies("Brock's Onix")).toBe("Onix");
    expect(pokedexSpecies("Dark Charizard")).toBe("Charizard");
    expect(pokedexSpecies("Rocket's Zapdos")).toBe("Zapdos");
    expect(pokedexSpecies("Lt. Surge's Pikachu")).toBe("Pikachu");
    expect(pokedexHeight({ name: "Brock's Onix" })).toBe(`28' 10"`);
    expect(pokedexHeight({ name: "Dark Charizard" })).toBe(`5' 7"`);
    expect(pokedexHeight({ name: "Diglett" })).toBe(`0' 8"`);
    // Base Set's "Nidoran" is the male one
    expect(pokedexHeight({ name: "Nidoran" })).toBe(`1' 8"`);
    expect(pokedexHeight({ name: "Nidoran♀" })).toBe(`1' 4"`);
    expect(pokedexHeight({ name: "Mysterious Fossil" })).toBeUndefined();
    expect(Object.keys(POKEDEX_HEIGHTS).length).toBeGreaterThanOrEqual(150);
    expect(heightInInches(`5' 11"`)).toBe(71);
  });

  it("offer 4 distinct lengths per species: the right one + 3 of other species, sorted, deterministic", () => {
    const all = new Set(Object.values(POKEDEX_HEIGHTS));
    for (const species of Object.keys(POKEDEX_HEIGHTS)) {
      const options = quizLengthOptions(species);
      expect(options).toHaveLength(4);
      expect(new Set(options).size).toBe(4);
      expect(options).toContain(POKEDEX_HEIGHTS[species]);
      for (const o of options) expect(all.has(o)).toBe(true);
      const inches = options.map(heightInInches);
      expect(inches).toEqual([...inches].sort((a, b) => a - b));
      expect(quizLengthOptions(species)).toEqual(options);
    }
    // The right answer isn't always in the same place
    const places = new Set(Object.keys(POKEDEX_HEIGHTS).map((s) => quizLengthOptions(s).indexOf(POKEDEX_HEIGHTS[s])));
    expect(places.size).toBeGreaterThanOrEqual(3);
  });
});

describe("Blaine's Quiz #1", () => {
  const QUIZ = "Blaine's Quiz #1";

  it("needs a Basic Pokémon or Evolution card in the hand", () => {
    const quiz = card(QUIZ);
    expect(canPlayTrainerCard(withHand([quiz, gameCard("Bill", "base"), gameCard("Mysterious Fossil", "fossil")]), quiz.id)).not.toBeNull();
    expect(canPlayTrainerCard(withHand([quiz, card("Brock's Onix")]), quiz.id)).toBeNull();
  });

  it("the player picks the card from the hand; the opponent gets its name and 4 lengths", () => {
    const quiz = card(QUIZ);
    const onix = card("Brock's Onix");
    const state = withHand([quiz, onix, gameCard("Bill", "base"), gameCard("Mysterious Fossil", "fossil")]);
    const pick = getTrainerSteps(state, quiz.id, [])!;
    expect(pick.chooser ?? "self").toBe("self");
    expect(pick.source).toBe("hand");
    expect(ids(pick)).toEqual([onix.id]);

    const guess = getTrainerSteps(state, quiz.id, [[onix.id]])!;
    expect(guess.chooser).toBe("opponent");
    expect(guess.maxSelections).toBe(1);
    expect(guess.options.map((o) => o.label)).toEqual(quizLengthOptions("Onix"));
    expect(ids(guess)).toEqual(quizLengthOptions("Onix").map((l) => String(heightInInches(l))));
    // Face down: the card itself isn't shown to the guesser (it prints its length)
    expect(guess.cards).toBeUndefined();
    const asked = stepForAnswerer(guess);
    expect(asked.description).toMatch(/Tu rival jugó Blaine's Quiz #1/);
    expect(asked.description).toMatch(/Brock's Onix/);
    expect(getTrainerSteps(state, quiz.id, [[onix.id], ["346"]])).toBeNull();
  });

  it("right guess: the opponent draws 2; the card goes back to the hand", () => {
    const quiz = card(QUIZ);
    const onix = card("Brock's Onix");
    const state = deepFreeze(withHand([quiz, onix]));
    const next = playTrainerCard(state, quiz.id, [[onix.id], ["346"]]);
    expect(names(next.playerHand)).toEqual(["Brock's Onix"]);
    expect(next.playerDeck).toHaveLength(10);
    expect(next.opponentHand).toHaveLength(2);
    expect(next.opponentDeck).toHaveLength(8);
    expect(names(next.playerDiscard)).toEqual([QUIZ]);
    expect(newLines(state, next).join("\n")).toMatch(/28' 10"/);
    expect(newLines(state, next).join("\n")).toMatch(/acertó/);
    expect(badLines(state, next)).toEqual([]);
  });

  it("wrong guess: the player draws 2", () => {
    const quiz = card(QUIZ);
    const onix = card("Brock's Onix");
    const state = deepFreeze(withHand([quiz, onix]));
    const wrong = quizLengthOptions("Onix").map((l) => String(heightInInches(l))).find((id) => id !== "346")!;
    const next = playTrainerCard(state, quiz.id, [[onix.id], [wrong]]);
    expect(next.playerHand).toHaveLength(3);
    expect(names(next.playerHand)).toContain("Brock's Onix");
    expect(next.opponentHand).toHaveLength(0);
    expect(newLines(state, next).join("\n")).toMatch(/falló/);
    expect(newLines(state, next)).toContain("Robaste 2 cartas");
    expect(badLines(state, next)).toEqual([]);
  });

  it("a length that isn't offered is refused", () => {
    const quiz = card(QUIZ);
    const onix = gameCard("Onix", "base");
    const state = withHand([quiz, onix]);
    expect(() => playTrainerCard(state, quiz.id, [[onix.id], ["1"]])).toThrow(IllegalActionError);
  });

  it("the AI as the guesser picks one of the offered lengths (at random)", () => {
    const quiz = card(QUIZ);
    const onix = card("Brock's Onix");
    const state = withHand([quiz, onix]);
    const step = getTrainerSteps(state, quiz.id, [[onix.id]])!;
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(answerOpponentTrainerStepForAI(state, quiz.id, step)).toEqual([step.options[3].id]);
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(answerOpponentTrainerStepForAI(state, quiz.id, step)).toEqual([step.options[0].id]);
  });
});

// ============================================================================
// The AI plays them (only when the other player's answers are given by an AI too)
// ============================================================================

describe("AI", () => {
  /** AI = "opponent" in the consumer's state; its hand is `hand`. */
  function aiTurn(hand: ReturnType<typeof gameCard>[], extra: { aiDeck?: number; aiPrizes?: number; humanPrizes?: number } = {}): GameState {
    return swapSides(
      makeState({
        turnNumber: 6,
        player: {
          active: inPlay("Machop"),
          hand,
          deck: fill(extra.aiDeck ?? 30),
          prizes: fill(extra.aiPrizes ?? 6, "Water Energy"),
        },
        opponent: { active: inPlay("Onix"), deck: fill(30), prizes: fill(extra.humanPrizes ?? 6, "Water Energy"), hand: fill(5) },
      })
    );
  }
  const plannedTrainers = (state: GameState, options?: Parameters<typeof decideOpponentTurn>[1]) =>
    decideOpponentTurn(state, options).flatMap((a) => (a.type === "playTrainer" ? [a.trainerName] : []));

  it("doesn't play them for a human opponent (no flow relays the human's answer)", () => {
    expect(plannedTrainers(aiTurn([card("Erika")]))).not.toContain("Erika");
    expect(plannedTrainers(aiTurn([card("Blaine's Quiz #1"), card("Brock's Onix")]))).not.toContain("Blaine's Quiz #1");
    expect(plannedTrainers(aiTurn([card("Lt. Surge's Treaty")], { aiPrizes: 2, humanPrizes: 4 }))).not.toContain("Lt. Surge's Treaty");
  });

  it("plays them when the other side's answers come from an AI (simulator), answering both sides' steps", () => {
    const bots = { otherPlayerAnswersByAI: true };
    const erikaState = aiTurn([card("Erika")]);
    const erikaPlan = decideOpponentTurn(erikaState, bots);
    expect(erikaPlan.map((a) => (a.type === "playTrainer" ? a.trainerName : a.type))).toContain("Erika");
    const action = erikaPlan.find((a) => a.type === "playTrainer")!;
    const after = executeAIAction(erikaState, action);
    expect(after.opponentHand).toHaveLength(3); // AI drew 3
    expect(after.playerHand).toHaveLength(5 + 3); // the other side drew 3 too

    expect(plannedTrainers(aiTurn([card("Blaine's Quiz #1"), card("Brock's Onix")]), bots)).toContain("Blaine's Quiz #1");
    expect(plannedTrainers(aiTurn([card("Lt. Surge's Treaty")], { aiPrizes: 2, humanPrizes: 4 }), bots)).toContain("Lt. Surge's Treaty");
  });

  describe("AI vs a human (single-player): the human answers the AI's Trainer step", () => {
    const humans = { otherPlayerAnswersByHuman: true };

    it("Erika stops at pendingOpponentTrainerStep, then plays with the human's answer", () => {
      const erikaState = aiTurn([card("Erika")]);
      const action = decideOpponentTurn(erikaState, humans).find((a) => a.type === "playTrainer");
      expect(action).toMatchObject({ trainerName: "Erika", waitsForOtherPlayer: true });

      const waiting = executeAIAction(erikaState, action!);
      expect(waiting.pendingOpponentTrainerStep).toMatchObject({ trainerName: "Erika", step: { chooser: "opponent" } });
      expect(waiting.opponentHand).toHaveLength(1); // Erika still in the AI's hand
      expect(waiting.playerHand).toHaveLength(5);

      const after = answerOpponentTrainerStep(waiting, ["2"]);
      expect(after.pendingOpponentTrainerStep).toBeUndefined();
      expect(after.opponentHand).toHaveLength(3); // the AI drew 3
      expect(after.playerHand).toHaveLength(5 + 2); // the human drew the 2 they chose
      expect(after.isPlayerTurn).toBe(false);
    });

    it("an answer the step doesn't allow keeps it waiting", () => {
      const erikaState = aiTurn([card("Erika")]);
      const action = decideOpponentTurn(erikaState, humans).find((a) => a.type === "playTrainer")!;
      const waiting = executeAIAction(erikaState, action);
      const rejected = answerOpponentTrainerStep(waiting, ["9"]);
      expect(rejected.pendingOpponentTrainerStep).toBeDefined();
      expect(rejected.opponentHand).toHaveLength(1);
    });

    it("plans Treaty and Quiz for a human too", () => {
      expect(plannedTrainers(aiTurn([card("Blaine's Quiz #1"), card("Brock's Onix")]), humans)).toContain("Blaine's Quiz #1");
      expect(plannedTrainers(aiTurn([card("Lt. Surge's Treaty")], { aiPrizes: 2, humanPrizes: 4 }), humans)).toContain("Lt. Surge's Treaty");
    });
  });
});
