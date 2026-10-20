/**
 * Gym Challenge Trainers the opponent answers or that use hidden cards (Task 8): Blaine's Quiz #2,
 * Blaine's Quiz #3, Misty's Wish and Sabrina's Psychic Control, from the printed text and the
 * accepted defaults of docs/card-doubts.md → "Gym Challenge".
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { endTurn, type GameState } from "@/lib/gameState";
import {
  canPlayTrainerCard,
  declineBorrowedTrainer,
  getTrainerCoinFlips,
  getTrainerSteps,
  playTrainerCard,
  stepForAnswerer,
  UNSUPPORTED_TRAINERS,
} from "@/domain/effects";
import { swapSides } from "@/domain/board";
import { quizCardNameOptions } from "@/domain/catalog";
import { IllegalActionError } from "@/shared/errors";
import {
  answerOpponentTrainerStep,
  answerOpponentTrainerStepForAI,
  decideOpponentTurn,
  executeAIAction,
  knowledgeView,
} from "@/domain/ai";
import { makeState, inPlay, gameCard, names, deepFreeze } from "./helpers/state";

const H = "heads" as const;
const T = "tails" as const;
const card = (name: string) => gameCard(name, "gym-challenge");
const fill = (n: number, name = "Grass Energy") => Array.from({ length: n }, () => gameCard(name, "base"));
type Setup = NonNullable<Parameters<typeof makeState>[0]>;

function withHand(hand: ReturnType<typeof gameCard>[], extra: Setup = {}): GameState {
  return makeState({
    ...extra,
    player: { active: inPlay("Machop"), hand, ...(extra.player ?? {}) },
    opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) },
  });
}

const newMessages = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);

afterEach(() => vi.restoreAllMocks());

describe("Task 8 Trainers are playable", () => {
  it("none of them is unsupported any more", () => {
    for (const name of ["Blaine's Quiz #2", "Blaine's Quiz #3", "Misty's Wish", "Sabrina's Psychic Control"]) {
      expect(UNSUPPORTED_TRAINERS).not.toContain(name);
    }
  });
});

// ============================================================================
// Blaine's Quiz #2
// ============================================================================

describe("Blaine's Quiz #2", () => {
  const QUIZ = "Blaine's Quiz #2";

  it("asks for a hand card, then the opponent guesses Pokémon / Trainer / Energy (default: the first option)", () => {
    const quiz = card(QUIZ);
    const hidden = gameCard("Abra", "base");
    const state = withHand([quiz, hidden]);
    const pick = getTrainerSteps(state, quiz.id, [])!;
    expect(pick.source).toBe("hand");
    expect(pick.chooser ?? "self").toBe("self");
    expect(pick.options.map((o) => o.id)).toEqual([hidden.id]);

    const guess = getTrainerSteps(state, quiz.id, [[hidden.id]])!;
    expect(guess.chooser).toBe("opponent");
    expect(guess.options.map((o) => o.id)).toEqual(["pokemon", "trainer", "energy"]);
    expect(guess.defaultSelection).toEqual(["pokemon"]);
    expect(guess.answererTitle).toBe(QUIZ);
    expect(guess.answererDescription).toMatch(/Tu rival jugó Blaine's Quiz #2/);
    // The face-down card never reaches the step
    expect(JSON.stringify(guess)).not.toContain("Abra");
    expect(JSON.stringify(stepForAnswerer(guess))).not.toContain(hidden.id);
    expect(getTrainerSteps(state, quiz.id, [[hidden.id], ["pokemon"]])).toBeNull();
  });

  it("right guess: the opponent draws 2; the card goes back to the hand", () => {
    const quiz = card(QUIZ);
    const hidden = gameCard("Abra", "base");
    const state = deepFreeze(withHand([quiz, hidden]));
    const next = playTrainerCard(state, quiz.id, [[hidden.id], ["pokemon"]]);
    expect(next.opponentHand).toHaveLength(state.opponentHand.length + 2);
    expect(next.playerHand.map((c) => c.id)).toEqual([hidden.id]);
    expect(names(next.playerDiscard)).toEqual([QUIZ]);
    // The log says the guess and the result, never the card
    const lines = newMessages(state, next);
    expect(lines.join(" ")).toMatch(/acertó/);
    expect(lines.join(" ")).not.toContain("Abra");
  });

  it("wrong guess: the player draws 2 (Mysterious Fossil counts as a Trainer)", () => {
    const quiz = card(QUIZ);
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const state = withHand([quiz, fossil]);
    const wrong = playTrainerCard(state, quiz.id, [[fossil.id], ["pokemon"]]);
    expect(wrong.playerHand).toHaveLength(1 + 2);
    expect(wrong.opponentHand).toHaveLength(state.opponentHand.length);
    expect(newMessages(state, wrong).join(" ")).not.toContain("Mysterious Fossil");
    const right = playTrainerCard(state, quiz.id, [[fossil.id], ["trainer"]]);
    expect(right.opponentHand).toHaveLength(state.opponentHand.length + 2);
    const energyCard = gameCard("Fire Energy", "base");
    const withEnergy = withHand([quiz, energyCard]);
    expect(playTrainerCard(withEnergy, quiz.id, [[energyCard.id], ["energy"]]).opponentHand).toHaveLength(withEnergy.opponentHand.length + 2);
  });

  it("needs another card in the hand", () => {
    const quiz = card(QUIZ);
    expect(canPlayTrainerCard(withHand([quiz]), quiz.id)).not.toBeNull();
  });
});

// ============================================================================
// Blaine's Quiz #3
// ============================================================================

describe("Blaine's Quiz #3", () => {
  const QUIZ = "Blaine's Quiz #3";

  it("quizCardNameOptions: 4 different names, the right one included, deterministic and sorted", () => {
    const abra = gameCard("Abra", "base");
    const attack = abra.kind === "pokemon" ? abra.attacks[0].name : "";
    const options = quizCardNameOptions(abra, attack);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain("Abra");
    expect(options).toEqual([...options].sort((a, b) => a.localeCompare(b)));
    expect(quizCardNameOptions(gameCard("Abra", "base"), attack)).toEqual(options);
  });

  it("the player picks a Pokémon card and one of its attacks; the opponent picks its name among 4", () => {
    const quiz = card(QUIZ);
    const machop = gameCard("Machop", "base");
    const state = withHand([quiz, machop, gameCard("Fire Energy", "base")]);
    const pick = getTrainerSteps(state, quiz.id, [])!;
    expect(pick.options.map((o) => o.id)).toEqual([machop.id]);
    const attackStep = getTrainerSteps(state, quiz.id, [[machop.id]])!;
    const attackName = machop.kind === "pokemon" ? machop.attacks[0].name : "";
    expect(attackStep.options.map((o) => o.label)).toEqual(machop.kind === "pokemon" ? machop.attacks.map((a) => a.name) : []);
    const guess = getTrainerSteps(state, quiz.id, [[machop.id], ["0"]])!;
    expect(guess.chooser).toBe("opponent");
    expect(guess.options.map((o) => o.id)).toEqual(quizCardNameOptions(machop, attackName));
    expect(guess.defaultSelection).toEqual([guess.options[0].id]);
    expect(guess.answererDescription).toContain(attackName);
    expect(guess.answererDescription).not.toContain("Machop");
    expect(guess.description).not.toContain("Machop");
  });

  it("right guess: the opponent draws 3; wrong: the player draws 3; the card stays in the hand", () => {
    const quiz = card(QUIZ);
    const machop = gameCard("Machop", "base");
    const state = deepFreeze(withHand([quiz, machop]));
    const right = playTrainerCard(state, quiz.id, [[machop.id], ["0"], ["Machop"]]);
    expect(right.opponentHand).toHaveLength(state.opponentHand.length + 3);
    expect(right.playerHand.map((c) => c.id)).toEqual([machop.id]);
    const attackName = machop.kind === "pokemon" ? machop.attacks[0].name : "";
    const wrongName = quizCardNameOptions(machop, attackName).find((n) => n !== "Machop")!;
    const wrong = playTrainerCard(state, quiz.id, [[machop.id], ["0"], [wrongName]]);
    expect(wrong.playerHand).toHaveLength(1 + 3);
    expect(names(wrong.playerDiscard)).toEqual([QUIZ]);
    expect(newMessages(state, wrong).join(" ")).not.toMatch(/\bMachop\b/);
  });

  it("needs a Pokémon card in the hand", () => {
    const quiz = card(QUIZ);
    expect(canPlayTrainerCard(withHand([quiz, gameCard("Fire Energy", "base")]), quiz.id)).not.toBeNull();
  });
});

// ============================================================================
// Misty's Wish
// ============================================================================

describe("Misty's Wish", () => {
  const WISH = "Misty's Wish";
  const prizes = () => [gameCard("Gastly", "base"), gameCard("Haunter", "base"), gameCard("Abra", "base")];

  it("steps: a Prize position, a look at it, the hand card offered, then the opponent accepts or declines (default decline)", () => {
    const wish = card(WISH);
    const offered = gameCard("Fire Energy", "base");
    const state = withHand([wish, offered], { player: { active: inPlay("Machop"), hand: [wish, offered], prizes: prizes() } });
    const position = getTrainerSteps(state, wish.id, [])!;
    expect(position.options.map((o) => o.id)).toEqual(["0", "1", "2"]);
    expect(JSON.stringify(position)).not.toContain("Haunter");
    const look = getTrainerSteps(state, wish.id, [["1"]])!;
    expect(look.maxSelections).toBe(0);
    expect(look.reveals).toBe("ownPrizes");
    expect(names(look.cards ?? [])).toEqual(["Haunter"]);
    const offer = getTrainerSteps(state, wish.id, [["1"], []])!;
    expect(offer.source).toBe("hand");
    expect(offer.options.map((o) => o.id)).toEqual([offered.id]);
    const ask = getTrainerSteps(state, wish.id, [["1"], [], [offered.id]])!;
    expect(ask.chooser).toBe("opponent");
    expect(ask.options.map((o) => o.id)).toEqual(["accept", "decline"]);
    expect(ask.defaultSelection).toEqual(["decline"]);
    expect(ask.answererDescription).toMatch(/Tu rival jugó Misty's Wish/);
    expect(JSON.stringify(ask)).not.toContain("Haunter");
    expect(JSON.stringify(ask)).not.toContain(offered.id);
  });

  it("accept: the Prize and the offered card change places; decline: draw 1", () => {
    const wish = card(WISH);
    const offered = gameCard("Fire Energy", "base");
    const state = deepFreeze(withHand([], { player: { active: inPlay("Machop"), hand: [wish, offered], prizes: prizes() } }));
    const accepted = playTrainerCard(state, wish.id, [["1"], [], [offered.id], ["accept"]]);
    expect(names(accepted.playerHand)).toEqual(["Haunter"]);
    expect(accepted.playerPrizes.map((c) => c.id)).toEqual([state.playerPrizes[0].id, offered.id, state.playerPrizes[2].id]);
    expect(names(accepted.playerDiscard)).toEqual([WISH]);
    const lines = newMessages(state, accepted).join(" ");
    expect(lines).not.toContain("Haunter");
    expect(lines).not.toContain("Fire Energy");

    const declined = playTrainerCard(state, wish.id, [["1"], [], [offered.id], ["decline"]]);
    expect(declined.playerPrizes.map((c) => c.id)).toEqual(state.playerPrizes.map((c) => c.id));
    expect(declined.playerHand).toHaveLength(2);
    expect(declined.playerHand.map((c) => c.id)).toContain(offered.id);
  });

  it("with no other card in the hand there is no offer and accepting does nothing", () => {
    const wish = card(WISH);
    const state = withHand([wish], { player: { active: inPlay("Machop"), hand: [wish], prizes: prizes() } });
    const ask = getTrainerSteps(state, wish.id, [["0"], []])!;
    expect(ask.chooser).toBe("opponent");
    const accepted = playTrainerCard(state, wish.id, [["0"], [], ["accept"]]);
    expect(accepted.playerHand).toHaveLength(0);
    expect(accepted.playerPrizes.map((c) => c.id)).toEqual(state.playerPrizes.map((c) => c.id));
    const declined = playTrainerCard(state, wish.id, [["0"], [], ["decline"]]);
    expect(declined.playerHand).toHaveLength(1);
  });

  it("needs a Prize card left", () => {
    const wish = card(WISH);
    expect(canPlayTrainerCard(withHand([wish], { player: { active: inPlay("Machop"), hand: [wish], prizes: [] } }), wish.id)).not.toBeNull();
  });
});

// ============================================================================
// Sabrina's Psychic Control
// ============================================================================

describe("Sabrina's Psychic Control", () => {
  const CONTROL = "Sabrina's Psychic Control";

  it("needs a Trainer that doesn't stay in play in the opponent's discard pile", () => {
    const control = card(CONTROL);
    const stayers = [gameCard("PlusPower", "base"), gameCard("Mysterious Fossil", "fossil"), gameCard("Pewter City Gym", "gym-heroes"), gameCard("Defender", "base")];
    expect(canPlayTrainerCard(withHand([control], { opponent: { active: inPlay("Onix"), discard: stayers } }), control.id)).not.toBeNull();
    expect(canPlayTrainerCard(withHand([control]), control.id)).not.toBeNull();
  });

  it("tails: nothing happens; it goes to the discard pile", () => {
    const control = card(CONTROL);
    const potion = gameCard("Potion", "base");
    const state = withHand([control], { player: { active: inPlay("Machop", { damage: 30 }), hand: [control] }, opponent: { active: inPlay("Onix"), discard: [potion] } });
    expect(getTrainerCoinFlips(state, control.id)).toBe(1);
    expect(getTrainerSteps(state, control.id, [], [T])).toBeNull();
    const next = playTrainerCard(state, control.id, [], { coinResults: [T] });
    expect(next.pendingBorrowedTrainer).toBeUndefined();
    expect(names(next.playerDiscard)).toEqual([CONTROL]);
  });

  it("heads with Potion: the borrowed Potion is played as if from the hand and stays in the opponent's discard pile", () => {
    const control = card(CONTROL);
    const potion = gameCard("Potion", "base");
    const plus = gameCard("PlusPower", "base");
    const other = gameCard("Bill", "base");
    const state = deepFreeze(withHand([control, other], {
      player: { active: inPlay("Machop", { damage: 30 }), hand: [control, other] },
      opponent: { active: inPlay("Onix"), discard: [plus, potion] },
    }));
    const choose = getTrainerSteps(state, control.id, [], [H])!;
    expect(choose.options.map((o) => o.id)).toEqual([potion.id]);
    const chosen = playTrainerCard(state, control.id, [[potion.id]], { coinResults: [H] });
    expect(chosen.pendingBorrowedTrainer).toMatchObject({ cardId: potion.id, cardName: "Potion" });
    expect(names(chosen.playerDiscard)).toEqual([CONTROL]);
    // Nothing else until it is played or declined
    expect(canPlayTrainerCard(chosen, other.id)).toMatch(/Potion/);
    expect(canPlayTrainerCard(chosen, potion.id)).toBeNull();

    const step = getTrainerSteps(chosen, potion.id, [])!;
    const active = chosen.playerActivePokemon!.pokemon.id;
    expect(step.options.map((o) => o.id)).toContain(active);
    const healed = playTrainerCard(chosen, potion.id, [[active]], { borrowedFromOpponentDiscard: true });
    expect(healed.playerActivePokemon!.currentDamage).toBe(10);
    expect(healed.pendingBorrowedTrainer).toBeUndefined();
    expect(names(healed.opponentDiscard)).toEqual(["PlusPower", "Potion"]);
    expect(names(healed.playerDiscard)).toEqual([CONTROL]);
    expect(healed.playerHand.map((c) => c.id)).toEqual([other.id]);
    expect(canPlayTrainerCard(healed, other.id)).toBeNull();
  });

  it("heads with a Trainer that needs discards (Computer Search): the costs come from the player's hand", () => {
    const control = card(CONTROL);
    const search = gameCard("Computer Search", "base");
    const a = gameCard("Fire Energy", "base");
    const b = gameCard("Water Energy", "base");
    const target = gameCard("Abra", "base");
    const state = withHand([control, a, b], {
      player: { active: inPlay("Machop"), hand: [control, a, b], deck: [target, ...fill(5)] },
      opponent: { active: inPlay("Onix"), discard: [search] },
    });
    const chosen = playTrainerCard(state, control.id, [[search.id]], { coinResults: [H] });
    const discardStep = getTrainerSteps(chosen, search.id, [])!;
    expect(discardStep.options.map((o) => o.id).sort()).toEqual([a.id, b.id].sort());
    const selections: string[][] = [[a.id, b.id]];
    const deckStep = getTrainerSteps(chosen, search.id, selections)!;
    expect(deckStep.options.map((o) => o.id)).toContain(target.id);
    selections.push([target.id]);
    const next = playTrainerCard(chosen, search.id, selections, { borrowedFromOpponentDiscard: true });
    expect(names(next.playerHand)).toEqual(["Abra"]);
    expect(names(next.playerDiscard).sort()).toEqual([CONTROL, "Fire Energy", "Water Energy"].sort());
    expect(names(next.opponentDiscard)).toEqual(["Computer Search"]);
  });

  it("the borrowed card can only be the one chosen, and declining (or ending the turn) gives it up", () => {
    const control = card(CONTROL);
    const potion = gameCard("Potion", "base");
    const bill = gameCard("Bill", "base");
    const state = withHand([control], {
      player: { active: inPlay("Machop", { damage: 30 }), hand: [control] },
      opponent: { active: inPlay("Onix"), discard: [potion, bill] },
    });
    const chosen = playTrainerCard(state, control.id, [[potion.id]], { coinResults: [H] });
    expect(() => playTrainerCard(chosen, bill.id, [], { borrowedFromOpponentDiscard: true })).toThrow(IllegalActionError);
    expect(() => playTrainerCard(state, potion.id, [[state.playerActivePokemon!.pokemon.id]], { borrowedFromOpponentDiscard: true })).toThrow(IllegalActionError);
    const declined = declineBorrowedTrainer(chosen);
    expect(declined.pendingBorrowedTrainer).toBeUndefined();
    expect(names(declined.opponentDiscard)).toEqual(["Potion", "Bill"]);
    expect(endTurn(chosen).pendingBorrowedTrainer).toBeUndefined();
  });

  it("Sabrina's Psychic Control itself may be chosen", () => {
    const control = card(CONTROL);
    const theirs = card(CONTROL);
    const potion = gameCard("Potion", "base");
    const state = withHand([control], {
      player: { active: inPlay("Machop", { damage: 30 }), hand: [control] },
      opponent: { active: inPlay("Onix"), discard: [theirs, potion] },
    });
    const ids = getTrainerSteps(state, control.id, [], [H])!.options.filter((o) => !o.disabled).map((o) => o.id);
    expect(ids).toEqual([theirs.id, potion.id]);
    const first = playTrainerCard(state, control.id, [[theirs.id]], { coinResults: [H] });
    const second = playTrainerCard(first, theirs.id, [[potion.id]], { coinResults: [H], borrowedFromOpponentDiscard: true });
    expect(second.pendingBorrowedTrainer).toMatchObject({ cardId: potion.id });
    const third = playTrainerCard(second, potion.id, [[state.playerActivePokemon!.pokemon.id]], { borrowedFromOpponentDiscard: true });
    expect(third.playerActivePokemon!.currentDamage).toBe(10);
    expect(names(third.opponentDiscard)).toEqual([CONTROL, "Potion"]);
    expect(names(third.playerDiscard)).toEqual([CONTROL]);
  });
});

// ============================================================================
// AI and hidden information
// ============================================================================

describe("AI", () => {
  /** AI = "opponent" in the consumer's state. */
  function aiTurn(hand: ReturnType<typeof gameCard>[], extra: { humanDiscard?: ReturnType<typeof gameCard>[]; aiPrizes?: ReturnType<typeof gameCard>[] } = {}): GameState {
    return swapSides(
      makeState({
        turnNumber: 6,
        player: { active: inPlay("Machop"), hand, deck: fill(30), ...(extra.aiPrizes && { prizes: extra.aiPrizes }) },
        opponent: { active: inPlay("Onix"), deck: fill(30), hand: fill(5), discard: extra.humanDiscard ?? [] },
      })
    );
  }
  const humans = { otherPlayerAnswersByHuman: true };

  it("answers the human's Quiz #2 / #3 with an offered option and declines Misty's Wish", () => {
    const quiz2 = card("Blaine's Quiz #2");
    const abra = gameCard("Abra", "base");
    const state = withHand([quiz2, abra]);
    const step2 = getTrainerSteps(state, quiz2.id, [[abra.id]])!;
    expect(step2.options.map((o) => o.id)).toContain(answerOpponentTrainerStepForAI(state, quiz2.id, step2)[0]);

    const quiz3 = card("Blaine's Quiz #3");
    const state3 = withHand([quiz3, abra]);
    const step3 = getTrainerSteps(state3, quiz3.id, [[abra.id], ["0"]])!;
    expect(step3.options.map((o) => o.id)).toContain(answerOpponentTrainerStepForAI(state3, quiz3.id, step3)[0]);

    const wish = card("Misty's Wish");
    const stateW = withHand([wish, abra]);
    const stepW = getTrainerSteps(stateW, wish.id, [["0"], [], [abra.id]])!;
    expect(answerOpponentTrainerStepForAI(stateW, wish.id, stepW)).toEqual(["decline"]);
  });

  it("vs a human: plays Quiz #2 and waits for the human's guess, without showing the card", () => {
    const state = aiTurn([card("Blaine's Quiz #2"), gameCard("Kadabra", "base")]);
    const action = decideOpponentTurn(state, humans).find((a) => a.type === "playTrainer" && a.trainerName === "Blaine's Quiz #2");
    expect(action).toMatchObject({ waitsForOtherPlayer: true });
    const waiting = executeAIAction(state, action!);
    const step = waiting.pendingOpponentTrainerStep!.step;
    expect(step.chooser).toBe("opponent");
    expect(JSON.stringify(stepForAnswerer(step))).not.toContain("Kadabra");
    const after = answerOpponentTrainerStep(waiting, ["energy"]);
    expect(after.pendingOpponentTrainerStep).toBeUndefined();
    expect(after.opponentHand.length).toBe(1 + 2); // wrong guess: the AI drew 2, Kadabra back in its hand
  });

  it("vs a human: Misty's Wish's Prize never reaches the human's step", () => {
    const prizes = [gameCard("Gastly", "base"), gameCard("Haunter", "base")];
    const state = aiTurn([card("Misty's Wish"), gameCard("Fire Energy", "base")], { aiPrizes: prizes });
    const action = decideOpponentTurn(state, humans).find((a) => a.type === "playTrainer" && a.trainerName === "Misty's Wish");
    expect(action).toMatchObject({ waitsForOtherPlayer: true });
    const waiting = executeAIAction(state, action!);
    const step = waiting.pendingOpponentTrainerStep!.step;
    expect(step.options.map((o) => o.id)).toEqual(["accept", "decline"]);
    expect(JSON.stringify(step)).not.toMatch(/Gastly|Haunter/);
  });

  it("the human's Misty's Wish swap stays hidden in the AI's knowledge view", () => {
    const wish = card("Misty's Wish");
    const offered = gameCard("Fire Energy", "base");
    const human = withHand([wish, offered], { player: { active: inPlay("Machop"), hand: [wish, offered], prizes: [gameCard("Gastly", "base"), gameCard("Haunter", "base")] } });
    const after = playTrainerCard(human, wish.id, [["1"], [], [offered.id], ["accept"]]);
    const aiView = knowledgeView(swapSides(after));
    expect(names(aiView.opponentPrizes).every((n) => n === "Carta oculta")).toBe(true);
    expect(aiView.opponentPrizes.map((c) => c.id)).not.toContain(offered.id);
    expect(names(aiView.opponentHand).every((n) => n === "Carta oculta")).toBe(true);
  });

  it("plays Sabrina's Psychic Control for a Trainer it would play from its hand (Bill), never for one that stays in play", () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // heads
    const bill = gameCard("Bill", "base");
    const state = aiTurn([card("Sabrina's Psychic Control")], { humanDiscard: [gameCard("PlusPower", "base"), bill] });
    const action = decideOpponentTurn(state).find((a) => a.type === "playTrainer" && a.trainerName === "Sabrina's Psychic Control");
    expect(action).toBeDefined();
    const after = executeAIAction(state, action!);
    expect(after.pendingBorrowedTrainer).toBeUndefined();
    expect(after.opponentHand).toHaveLength(2); // Bill's 2 cards
    expect(names(after.opponentDiscard)).toEqual(["Sabrina's Psychic Control"]);
    expect(names(after.playerDiscard)).toEqual(["PlusPower", "Bill"]);

    const nothing = aiTurn([card("Sabrina's Psychic Control")], { humanDiscard: [gameCard("PlusPower", "base")] });
    expect(decideOpponentTurn(nothing).some((a) => a.type === "playTrainer" && a.trainerName === "Sabrina's Psychic Control")).toBe(false);
  });
});
