/**
 * Tickling Machine (Gym Heroes #119), printed text: "Flip a coin. If heads, your opponent sets
 * aside all the cards in his or her hand face down. Nobody may look at those cards. At the end of
 * your opponent's next turn, your opponent puts those cards back into his or her hand. If tails,
 * your turn ends immediately (you can't attack this turn)."
 *
 * Engine model: `state.setAsideHands` (one entry per side, swapped by every perspective swap),
 * filled by the Trainer, emptied by endTurn at the end of the owner's turn number
 * `returnsAfterTurn` (before the between-turns checkup, like the attached Trainers).
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { canExecuteAttack, endTurn, type GameState } from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerCoinFlips, getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { swapSides } from "@/domain/board";
import { decideOpponentTurn, executeAIAction, type AIAction } from "@/domain/ai";
import { knowledgeView } from "@/domain/ai/knowledge";
import { ownedCardIds } from "@/domain/simulation/invariants";
import { setAsideCards } from "@/domain/trainers/set-aside";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, names, deepFreeze, armedFor } from "./helpers/state";

const { Fire, Fighting } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const card = (name: string) => gameCard(name, "gym-heroes");
type Setup = NonNullable<Parameters<typeof makeState>[0]>;

const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival|Pusiste|Tomaste|Mostraste|miraste|Barajaste|barajaste|descartaste)\b/;
const ALLOWED = [/^Jugaste [^:]*$/, /^Jugaste [^-]+ - Monedas?: (\[coin:(heads|tails)\][ ,]*)+$/, /^Robaste \d+ cartas?$/, /^Descartaste [^:]*$/];
const newLines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);
const badLines = (before: GameState, after: GameState) => newLines(before, after).filter((m) => !ALLOWED.some((ok) => ok.test(m)) && RELATIVE.test(m));

/** The opponent's hand: three recognisable cards whose names must never reach the log. */
const secretHand = () => [gameCard("Abra", "base"), card("Brock"), gameCard("Gastly", "base")];
const SECRET_NAMES = ["Abra", "Brock", "Gastly"];
const namesSecret = (lines: string[]) => lines.filter((m) => SECRET_NAMES.some((n) => m.includes(n)));

function setup(extra: Setup = {}) {
  const machine = card("Tickling Machine");
  const hidden = secretHand();
  const state = makeState({
    ...extra,
    player: { active: inPlay("Machop"), hand: [machine], ...(extra.player ?? {}) },
    opponent: { active: inPlay("Onix"), hand: hidden, ...(extra.opponent ?? {}) },
  });
  return { machine, hidden, state };
}

describe("Tickling Machine: heads", () => {
  it("flips 1 coin, asks nothing; heads sets the opponent's whole hand aside face down and the turn goes on", () => {
    const { machine, hidden, state } = setup();
    expect(canPlayTrainerCard(state, machine.id)).toBeNull();
    expect(getTrainerCoinFlips(state, machine.id)).toBe(1);
    expect(getTrainerSteps(state, machine.id, [], [H])).toBeNull();
    const next = playTrainerCard(deepFreeze(state), machine.id, [], { coinResults: [H] });
    expect(next.opponentHand).toEqual([]);
    expect(next.setAsideHands).toEqual([{ side: "opponent", cards: hidden, returnsAfterTurn: state.turnNumber + 1 }]);
    expect(setAsideCards(next, "opponent")).toEqual(hidden);
    expect(setAsideCards(next, "player")).toEqual([]);
    expect(names(next.playerDiscard)).toEqual(["Tickling Machine"]);
    expect(next.isPlayerTurn).toBe(true);
    expect(next.attackedThisTurn).toBeFalsy();
    expect(badLines(state, next)).toEqual([]);
    expect(namesSecret(newLines(state, next))).toEqual([]);
  });

  it("the opponent's next turn starts with only the card they draw; the cards come back at the end of that turn", () => {
    const { machine, hidden, state } = setup();
    const played = playTrainerCard(state, machine.id, [], { coinResults: [H] });
    // End of the player's turn: the cards stay aside
    const theirTurn = endTurn(played);
    expect(theirTurn.isPlayerTurn).toBe(false);
    expect(theirTurn.opponentHand).toHaveLength(1);
    expect(names(theirTurn.opponentHand)).toEqual(["Grass Energy"]);
    expect(setAsideCards(theirTurn, "opponent")).toEqual(hidden);
    // End of the opponent's turn: back into their hand (with what they drew)
    const back = endTurn(theirTurn);
    expect(back.isPlayerTurn).toBe(true);
    expect(back.setAsideHands).toBeUndefined();
    expect(names(back.opponentHand).sort()).toEqual(["Abra", "Brock", "Gastly", "Grass Energy"]);
    expect(badLines(theirTurn, back).filter((m) => m.startsWith("Tickling Machine"))).toEqual([]);
    expect(newLines(theirTurn, back)).toContain("Tickling Machine: las 3 cartas apartadas vuelven a la mano de quien las apartó");
    expect(namesSecret(newLines(state, back))).toEqual([]);
  });

  it("the cards are back before the between-turns checkup, so a pause for a Prize already has them in the hand", () => {
    const { machine, hidden, state } = setup({ opponent: { active: inPlay("Onix"), bench: [inPlay("Onix")], hand: secretHand() } });
    const theirTurn = endTurn(playTrainerCard(state, machine.id, [], { coinResults: [H] }));
    // During their turn their Active became a Poisoned Abra with 20 damage (30 HP): the checkup Knocks it Out
    const poisoned = { ...theirTurn, opponentActivePokemon: inPlay("Abra", { damage: 20, statuses: [StatusCondition.Poisoned] }) };
    const paused = endTurn(poisoned);
    expect(paused.playerCanTakePrize).toBe(true);
    expect(paused.isPlayerTurn).toBe(false); // paused for the Prize
    expect(names(paused.opponentHand).sort()).toEqual([...names(hidden), "Grass Energy"].sort());
    expect(paused.setAsideHands).toBeUndefined();
    // endTurn again after the Prize: nothing comes back twice
    const again = endTurn({ ...paused, playerCanTakePrize: false });
    expect(again.isPlayerTurn).toBe(true);
    expect(again.opponentHand).toHaveLength(paused.opponentHand.length);
  });

  it("a second Tickling Machine the same turn stacks the new hand onto the same pile", () => {
    const { machine, hidden, state } = setup();
    const second = card("Tickling Machine");
    const first = playTrainerCard({ ...state, playerHand: [machine, second] }, machine.id, [], { coinResults: [H] });
    const returned = gameCard("Kadabra", "base"); // e.g. a Pokémon sent back by Minion of Team Rocket
    const next = playTrainerCard({ ...first, opponentHand: [returned] }, second.id, [], { coinResults: [H] });
    expect(next.setAsideHands).toEqual([{ side: "opponent", cards: [...hidden, returned], returnsAfterTurn: state.turnNumber + 1 }]);
    expect(next.opponentHand).toEqual([]);
  });

  it("an empty hand: playable, heads sets nothing aside (no empty pile)", () => {
    const { machine, state } = setup({ opponent: { active: inPlay("Onix"), hand: [] } });
    const next = playTrainerCard(state, machine.id, [], { coinResults: [H] });
    expect(next.setAsideHands).toBeUndefined();
    // Never "0 cartas"
    expect(newLines(state, next)).toContain("Tickling Machine: el otro jugador no tiene cartas en la mano");
    expect(newLines(state, next).filter((m) => m.includes("0 cartas"))).toEqual([]);
  });

  it("the opponent may set the player's hand aside on their turn while their own is aside: each comes back at its owner's turn end", () => {
    const { machine, hidden, state } = setup({ player: { active: inPlay("Machop"), hand: [card("Tickling Machine"), gameCard("Kadabra", "base")] } });
    const played = playTrainerCard(state, state.playerHand[0].id, [], { coinResults: [H] });
    const theirMachine = card("Tickling Machine");
    const theirTurn = endTurn({ ...played, opponentDeck: [theirMachine, ...played.opponentDeck] });
    // The opponent plays it from their view (board swapSides), heads
    const asThem = playTrainerCard(swapSides(theirTurn), theirMachine.id, [], { coinResults: [H] });
    const both = swapSides(asThem);
    expect(both.playerHand).toEqual([]);
    expect(setAsideCards(both, "player").map((c) => c.name)).toEqual(["Kadabra"]);
    expect(setAsideCards(both, "opponent")).toEqual(hidden);
    // End of the opponent's turn: theirs come back, the player's stay until the end of the player's turn
    const playerTurn = endTurn(both);
    expect(names(playerTurn.opponentHand).sort()).toEqual(["Abra", "Brock", "Gastly"]);
    expect(names(playerTurn.playerHand)).toEqual(["Grass Energy"]);
    expect(setAsideCards(playerTurn, "player").map((c) => c.name)).toEqual(["Kadabra"]);
    const after = endTurn(playerTurn);
    expect(names(after.playerHand).sort()).toEqual(["Grass Energy", "Kadabra"]);
    expect(after.setAsideHands).toBeUndefined();
  });
});

describe("Tickling Machine: tails", () => {
  it("the turn ends immediately; the opponent's hand is untouched", () => {
    const { machine, hidden, state } = setup();
    const next = playTrainerCard(state, machine.id, [], { coinResults: [T] });
    expect(next.isPlayerTurn).toBe(false);
    expect(next.turnNumber).toBe(state.turnNumber + 1);
    expect(next.setAsideHands).toBeUndefined();
    expect(names(next.opponentHand).sort()).toEqual([...names(hidden), "Grass Energy"].sort());
    expect(names(next.playerDiscard)).toEqual(["Tickling Machine"]);
  });

  it("skipEndTurn (swapped views): the turn is over (no attack, no action) and the caller ends it", () => {
    const { state } = setup({ player: { active: armedFor(inPlay("Machop"), "Patada baja"), hand: [card("Tickling Machine"), card("Brock")] } });
    const next = playTrainerCard(state, state.playerHand[0].id, [], { coinResults: [T], skipEndTurn: true });
    expect(next.isPlayerTurn).toBe(true);
    expect(next.attackedThisTurn).toBe(true);
    expect(canPlayTrainerCard(next, next.playerHand[0].id)).not.toBeNull();
    expect(canExecuteAttack(next, 0)).not.toBeNull(); // "you can't attack this turn"
    expect(badLines(state, next)).toEqual([]);
    expect(endTurn(next).isPlayerTurn).toBe(false);
  });
});

describe("Tickling Machine: perspective swaps", () => {
  const withAside = (from = setup()): GameState => playTrainerCard(from.state, from.machine.id, [], { coinResults: [H] });

  it("board swapSides flips the side of each set-aside pile, and swapping twice gives the same state", () => {
    const state = withAside();
    const swapped = swapSides(state);
    expect(swapped.setAsideHands).toEqual([{ ...state.setAsideHands![0], side: "player" }]);
    expect(setAsideCards(swapped, "player")).toEqual(setAsideCards(state, "opponent"));
    expect(swapSides(swapped)).toEqual(state);
    // Absent stays absent
    expect("setAsideHands" in swapSides(makeState())).toBe(false);
  });

  it("conservation: the set-aside cards still belong to their owner", () => {
    const start = setup();
    const { state } = start;
    const after = withAside(start);
    expect([...ownedCardIds(after, "opponent")].sort()).toEqual([...ownedCardIds(state, "opponent")].sort());
  });

  it("deck-out with cards set aside: the game ends, the cards stay counted", () => {
    const { machine, state } = setup({ opponent: { active: inPlay("Onix"), hand: secretHand(), deck: [] } });
    const played = playTrainerCard(state, machine.id, [], { coinResults: [H] });
    const over = endTurn(played);
    expect(over.gameResult).toBe("victory");
    expect([...ownedCardIds(over, "opponent")].sort()).toEqual([...ownedCardIds(state, "opponent")].sort());
  });
});

describe("Tickling Machine: effects that read the hand only see the current hand", () => {
  const aside = (hand: ReturnType<typeof card>[]) => {
    const { state } = setup({ player: { active: inPlay("Machop"), hand: [card("Tickling Machine"), ...hand] } });
    return playTrainerCard(state, state.playerHand[0].id, [], { coinResults: [H] });
  };

  it("Erika's Perfume and Secret Mission have nothing to look at", () => {
    const perfume = card("Erika's Perfume");
    const mission = card("Secret Mission");
    const state = aside([perfume, mission]);
    expect(getTrainerSteps(state, perfume.id, [])).toBeNull();
    const step = getTrainerSteps(state, mission.id, []);
    expect(step?.reveals).toBeUndefined();
    const next = playTrainerCard(state, perfume.id, []);
    expect(next.opponentBench).toEqual([]);
    expect(next.setAsideHands).toEqual(state.setAsideHands);
  });

  it("The Rocket's Trap and Sabrina's Gaze leave the set-aside cards alone", () => {
    const trap = card("The Rocket's Trap");
    const gaze = card("Sabrina's Gaze");
    const state = aside([trap, gaze]);
    const trapped = playTrainerCard(state, trap.id, [], { coinResults: [H] });
    expect(trapped.setAsideHands).toEqual(state.setAsideHands);
    expect(trapped.opponentDeck).toHaveLength(state.opponentDeck.length);
    const gazed = playTrainerCard(trapped, gaze.id, []);
    expect(gazed.opponentHand).toEqual([]);
    expect(gazed.setAsideHands).toEqual(state.setAsideHands);
  });
});

describe("Tickling Machine and the AI", () => {
  afterEach(() => vi.restoreAllMocks());
  const aiTurn = (ai: Setup["opponent"], human: Setup["player"] = { active: inPlay("Onix") }, extra: Setup = {}) =>
    makeState({ turnNumber: 6, isPlayerTurn: false, ...extra, player: human, opponent: ai });
  const run = (state: GameState, plan: AIAction[]) => plan.reduce((s, action) => executeAIAction(s, action), state);
  const play = (cardId: string): AIAction => ({ type: "playTrainer", cardId, trainerName: "Tickling Machine", selections: [], answerAtPlay: true, delay: 0 });

  it("the AI's heads sets the human's hand aside (side 'player' in the human's view) and its turn goes on", () => {
    const machine = card("Tickling Machine");
    const hidden = secretHand();
    const state = aiTurn({ active: inPlay("Machop"), hand: [machine] }, { active: inPlay("Onix"), hand: hidden });
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads
    const after = executeAIAction(state, play(machine.id));
    expect(after.isPlayerTurn).toBe(false);
    expect(after.playerHand).toEqual([]);
    expect(after.setAsideHands).toEqual([{ side: "player", cards: hidden, returnsAfterTurn: 7 }]);
    expect(namesSecret(newLines(state, after))).toEqual([]);
    const humanTurn = executeAIAction(after, { type: "endTurn", delay: 0 });
    expect(names(humanTurn.playerHand)).toEqual(["Grass Energy"]);
    expect(names(endTurn(humanTurn).playerHand).sort()).toEqual(["Abra", "Brock", "Gastly", "Grass Energy"]);
  });

  it("the AI's tails ends its turn", () => {
    const machine = card("Tickling Machine");
    const state = aiTurn({ active: inPlay("Machop"), hand: [machine] }, { active: inPlay("Onix"), hand: secretHand() });
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const after = executeAIAction(state, play(machine.id));
    expect(after.isPlayerTurn).toBe(true);
    expect(after.turnNumber).toBe(7);
    expect(after.setAsideHands).toBeUndefined();
  });

  it("the AI's attack keeps each pile on its side (the attack view swaps in and back symmetrically)", () => {
    const aiCards = [gameCard("Kadabra", "base")];
    const humanCards = secretHand();
    const state = aiTurn(
      { active: armedFor(inPlay("Machop"), "Patada baja"), hand: [] },
      { active: inPlay("Onix"), bench: [inPlay("Abra")] },
      { setAsideHands: [{ side: "opponent", cards: aiCards, returnsAfterTurn: 8 }, { side: "player", cards: humanCards, returnsAfterTurn: 7 }] }
    );
    const after = executeAIAction(state, { type: "attack", attackIndex: 0, delay: 0 } as AIAction);
    expect(after.isPlayerTurn).toBe(true);
    expect(setAsideCards(after, "opponent")).toEqual(aiCards);
    expect(setAsideCards(after, "player")).toEqual(humanCards);
  });

  it("the AI's confused attack (its own swap) keeps each pile on its side; its own pile comes back at its turn end", () => {
    const aiCards = [gameCard("Kadabra", "base")];
    const state = aiTurn(
      { active: armedFor(inPlay("Machop", { statuses: [StatusCondition.Confused] }), "Patada baja"), hand: [] },
      { active: inPlay("Onix") },
      { setAsideHands: [{ side: "opponent", cards: aiCards, returnsAfterTurn: 6 }, { side: "player", cards: secretHand(), returnsAfterTurn: 7 }] }
    );
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails: the attack fails, the turn ends
    const after = executeAIAction(state, { type: "attack", attackIndex: 0, delay: 0 } as AIAction);
    expect(after.isPlayerTurn).toBe(true);
    expect(names(after.opponentHand)).toEqual(["Kadabra"]);
    expect(setAsideCards(after, "opponent")).toEqual([]);
    expect(names(setAsideCards(after, "player"))).toEqual(SECRET_NAMES);
  });

  it("the AI never sees set-aside cards, not even its own nor under Clairvoyance", () => {
    const view = makeState({
      player: { active: inPlay("Machop"), bench: [inPlay("Omanyte", { set: "fossil" })] },
      opponent: { active: inPlay("Onix"), hand: [energy(Fire)] },
      setAsideHands: [{ side: "player", cards: [gameCard("Kadabra", "base")], returnsAfterTurn: 4 }, { side: "opponent", cards: secretHand(), returnsAfterTurn: 3 }],
    });
    const known = knowledgeView(view);
    expect(names(known.opponentHand)).toEqual(["Fire Energy"]); // Clairvoyance: the current hand
    expect(setAsideCards(known, "player").map((c) => c.name)).toEqual(["Carta oculta"]);
    expect(setAsideCards(known, "opponent").map((c) => c.name)).toEqual(["Carta oculta", "Carta oculta", "Carta oculta"]);
    expect(known.setAsideHands!.map((p) => [p.side, p.returnsAfterTurn])).toEqual([["player", 4], ["opponent", 3]]);
  });

  it("plays it as the last action of a turn without an attack when the human holds 3+ cards", () => {
    const machine = card("Tickling Machine");
    const state = aiTurn({ active: inPlay("Machop"), hand: [machine] }, { active: inPlay("Onix"), hand: secretHand() });
    const plan = decideOpponentTurn(state);
    expect(plan.at(-1)).toMatchObject({ type: "playTrainer", trainerName: "Tickling Machine" });
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const after = run(state, plan);
    expect(after.isPlayerTurn).toBe(true);
  });

  it("doesn't play it when it can attack, nor when the human holds fewer than 3 cards", () => {
    const machine = card("Tickling Machine");
    const attacking = aiTurn({ active: armedFor(inPlay("Machop"), "Patada baja"), hand: [machine], deck: Array.from({ length: 10 }, () => energy(Fighting)) }, { active: inPlay("Onix"), hand: secretHand() });
    expect(decideOpponentTurn(attacking).some((a) => a.type === "playTrainer" && a.trainerName === "Tickling Machine")).toBe(false);
    const few = aiTurn({ active: inPlay("Machop"), hand: [machine] }, { active: inPlay("Onix"), hand: secretHand().slice(0, 2) });
    expect(decideOpponentTurn(few).some((a) => a.type === "playTrainer" && a.trainerName === "Tickling Machine")).toBe(false);
  });
});
