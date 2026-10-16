/**
 * Gym Heroes #123 Misty's Duel: "You and your opponent play a game of Rock-Paper-Scissors. The
 * winner shuffles his or her hand into his or her deck and draws a new hand of 5 cards."
 * Owner decision: a real Rock-Paper-Scissors (not the coin). `state.pendingDuel` holds the round
 * and each side's hidden pick; a tie replays the round.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  rpsWinner,
  submitDuelPick,
  submitDuelPickVsAI,
  maskDuelFor,
  aiDuelPick,
  canSubmitDuelPick,
  RPS_CHOICES,
  playTrainerCard,
  canPlayTrainerCard,
  canExecuteAttack,
  canAttachEnergy,
  getTurnActionBlocker,
  swapSides,
  endTurn,
  decideOpponentTurn,
  executeAIAction,
  finishAIAttackAfterReaction,
  type GameState,
  type PendingDuel,
} from "@/index";
import { knowledgeView } from "@/domain/ai";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, energy, deepFreeze } from "./helpers/state";
import { EnergyType } from "@/domain/constants";

const duelCard = () => gameCard("Misty's Duel", "gym-heroes");
const fill = (n: number, name = "Grass Energy") => Array.from({ length: n }, () => gameCard(name, "base"));
const ids = (cards: { id: string }[]) => cards.map((c) => c.id).sort();

const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival|Pusiste|Tomaste|Mostraste|miraste|Barajaste|barajaste|descartaste)\b/;
const ALLOWED = [/^Jugaste [^:]*$/, /^Robaste \d+ cartas?$/];
const newLines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);
const badLines = (before: GameState, after: GameState) =>
  newLines(before, after).filter((m) => !ALLOWED.some((ok) => ok.test(m)) && RELATIVE.test(m));

afterEach(() => vi.restoreAllMocks());

/** The player's turn with Misty's Duel in hand (+ `otherHand`), decks of `deck` cards each. */
function beforeDuel(otherHand = fill(2, "Fire Energy"), deck = 20, opponentHand = fill(3, "Water Energy")): { state: GameState; cardId: string } {
  const card = duelCard();
  const state = makeState({
    player: { active: inPlay("Machop"), hand: [card, ...otherHand], deck: fill(deck) },
    opponent: { active: inPlay("Onix"), hand: opponentHand, deck: fill(deck, "Psychic Energy") },
  });
  return { state, cardId: card.id };
}

function playDuel(otherHand?: ReturnType<typeof fill>, deck?: number, opponentHand?: ReturnType<typeof fill>): GameState {
  const { state, cardId } = beforeDuel(otherHand, deck, opponentHand);
  return playTrainerCard(state, cardId);
}

describe("Misty's Duel: rules of the game", () => {
  it("rock beats scissors, scissors paper, paper rock", () => {
    expect(rpsWinner("rock", "scissors")).toBe("a");
    expect(rpsWinner("scissors", "paper")).toBe("a");
    expect(rpsWinner("paper", "rock")).toBe("a");
    expect(rpsWinner("paper", "scissors")).toBe("b");
    expect(rpsWinner("rock", "paper")).toBe("b");
    expect(rpsWinner("scissors", "rock")).toBe("b");
    for (const c of RPS_CHOICES) expect(rpsWinner(c, c)).toBe("tie");
  });

  it("the AI's pick comes from the injected random source", () => {
    expect(aiDuelPick(() => 0)).toBe("rock");
    expect(aiDuelPick(() => 0.4)).toBe("paper");
    expect(aiDuelPick(() => 0.99)).toBe("scissors");
    // Seeded: the same source gives the same picks
    const seq = (seed: number) => {
      let x = seed;
      const rng = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      return Array.from({ length: 10 }, () => aiDuelPick(rng));
    };
    expect(seq(7)).toEqual(seq(7));
  });
});

describe("Misty's Duel: playing it", () => {
  it("is playable, goes to the discard pile and starts round 1 with no picks", () => {
    const { state, cardId } = beforeDuel();
    expect(canPlayTrainerCard(state, cardId)).toBeNull();
    const played = playTrainerCard(deepFreeze(state), cardId);
    expect(played.pendingDuel).toEqual({ round: 1, playerPick: null, opponentPick: null });
    expect(played.playerDiscard.map((c) => c.name)).toContain("Misty's Duel");
    expect(played.playerHand.map((c) => c.id)).not.toContain(cardId);
    expect(newLines(state, played)[0]).toBe("Jugaste Misty's Duel");
    expect(badLines(state, played)).toEqual([]);
  });

  it("waits for both picks, hides the rival's pick, replays a tie, and the winner redraws 5", () => {
    let s = playDuel();
    expect(s.pendingDuel).toMatchObject({ round: 1, playerPick: null, opponentPick: null });
    s = submitDuelPick(s, "opponent", "rock");
    expect(s.pendingDuel).toMatchObject({ round: 1, playerPick: null, opponentPick: "rock" });
    expect(maskDuelFor(s, "player").pendingDuel!.opponentPick).toBeNull(); // hidden until both picked
    expect(maskDuelFor(s, "opponent").pendingDuel!.opponentPick).toBe("rock"); // its own pick stays
    const beforeTie = s;
    s = submitDuelPick(s, "player", "rock"); // tie
    expect(s.pendingDuel).toEqual({ round: 2, playerPick: null, opponentPick: null, lastRound: { playerPick: "rock", opponentPick: "rock" } });
    expect(newLines(beforeTie, s)).toEqual(["Misty's Duel: piedra contra piedra", "Misty's Duel: empate, se juega otra vez"]);
    const hand = s.playerHand;
    s = submitDuelPick(s, "player", "paper");
    expect(s.playerHand).toBe(hand); // nothing happens before the other pick
    const beforeWin = s;
    s = submitDuelPick(s, "opponent", "rock"); // player wins
    expect(s.pendingDuel).toBeUndefined();
    expect(s.playerHand).toHaveLength(5);
    expect(s.opponentHand).toHaveLength(3); // the loser keeps its hand
    expect(newLines(beforeWin, s)).toEqual([
      "Misty's Duel: papel contra piedra",
      "Gana quien eligió papel: baraja su mano en su mazo y roba una mano nueva de 5 cartas",
    ]);
    expect(badLines(beforeTie, s)).toEqual([]);
  });

  it("the winner's old hand goes into its deck (card count kept), the other side untouched", () => {
    const otherHand = fill(2, "Fire Energy");
    const before = playDuel(otherHand, 20);
    const after = submitDuelPick(submitDuelPick(before, "player", "scissors"), "opponent", "paper");
    expect(after.playerHand).toHaveLength(5);
    expect(after.playerDeck).toHaveLength(20 + 2 - 5);
    expect(ids([...after.playerHand, ...after.playerDeck])).toEqual(ids([...before.playerHand, ...before.playerDeck]));
    expect(after.opponentHand).toBe(before.opponentHand);
    expect(after.opponentDeck).toBe(before.opponentDeck);
  });

  it("the other player can win: its hand is redrawn", () => {
    const before = playDuel(fill(2, "Fire Energy"), 20, fill(1, "Water Energy"));
    const after = submitDuelPick(submitDuelPick(before, "player", "rock"), "opponent", "paper");
    expect(after.opponentHand).toHaveLength(5);
    expect(after.opponentDeck).toHaveLength(20 + 1 - 5);
    expect(after.playerHand).toBe(before.playerHand);
    expect(newLines(before, after)).toContain("Gana quien eligió papel: baraja su mano en su mazo y roba una mano nueva de 5 cartas");
  });

  it("names the pick of whoever played it first, whichever view resolves the round", () => {
    const before = playDuel();
    // The other player resolves the round from its own view (MP: the second picker)
    const resolved = submitDuelPick(swapSides(submitDuelPick(before, "player", "rock")), "player", "scissors");
    expect(newLines(swapSides(before), resolved)[0]).toBe("Misty's Duel: piedra contra tijera");
    // Back in the original view: the player (who played it, rock) won
    expect(swapSides(resolved).playerHand).toHaveLength(5);
  });

  it("a deck shorter than 5 draws what there is, and the game goes on", () => {
    const before = playDuel(fill(1, "Fire Energy"), 2);
    const after = submitDuelPick(submitDuelPick(before, "player", "rock"), "opponent", "scissors");
    expect(after.playerHand).toHaveLength(3);
    expect(after.playerDeck).toHaveLength(0);
    expect(after.gameResult).toBeNull();
    expect(after.gamePhase).toBe(before.gamePhase);
    expect(newLines(before, after)).toContain("Gana quien eligió piedra: baraja su mano en su mazo y roba una mano nueva de 3 cartas");
  });

  it("an empty hand and deck: the winner draws nothing", () => {
    const before = playDuel([], 0);
    const after = submitDuelPick(submitDuelPick(before, "player", "rock"), "opponent", "scissors");
    expect(after.playerHand).toEqual([]);
    expect(after.pendingDuel).toBeUndefined();
    expect(after.gameResult).toBeNull();
    expect(newLines(before, after)).toContain("Gana quien eligió piedra: baraja su mano en su mazo y no roba cartas");
  });

  it("doesn't mutate its input", () => {
    const before = deepFreeze(playDuel());
    const once = submitDuelPick(before, "player", "rock");
    deepFreeze(once);
    expect(() => submitDuelPick(once, "opponent", "rock")).not.toThrow();
    expect(() => submitDuelPick(deepFreeze(submitDuelPick(before, "player", "rock")), "opponent", "paper")).not.toThrow();
  });
});

describe("Misty's Duel: legality", () => {
  it("blocks endTurn and every other action while the duel is pending", () => {
    const hand = [gameCard("Potion", "base"), energy(EnergyType.Fighting)];
    const s = playDuel(hand);
    expect(getTurnActionBlocker(s)).toBe("Primero hay que terminar Misty's Duel");
    expect(endTurn(s)).toBe(s); // refused
    expect(canPlayTrainerCard(s, hand[0].id)).toBe("Primero hay que terminar Misty's Duel");
    expect(canExecuteAttack(s, 0)).toBe("Primero hay que terminar Misty's Duel");
    expect(canAttachEnergy(s, hand[1].id, s.playerActivePokemon!.pokemon.id)).toBe("Primero hay que terminar Misty's Duel");
    // Also for the other side (its own view)
    expect(getTurnActionBlocker(swapSides(s))).not.toBeNull();
  });

  it("refuses a pick with no duel, a second pick in the same round, a forged choice and a finished game", () => {
    const { state } = beforeDuel();
    expect(canSubmitDuelPick(state, "player")).toBe("No hay un duelo pendiente");
    expect(() => submitDuelPick(state, "player", "rock")).toThrow(IllegalActionError);
    const s = submitDuelPick(playDuel(), "player", "rock");
    expect(canSubmitDuelPick(s, "player")).toBe("Ya elegiste en esta ronda");
    expect(() => submitDuelPick(s, "player", "paper")).toThrow(IllegalActionError);
    expect(canSubmitDuelPick(s, "opponent")).toBeNull();
    expect(() => submitDuelPick(s, "opponent", "lizard" as never)).toThrow(IllegalActionError);
    expect(canSubmitDuelPick({ ...s, gameResult: "victory", gamePhase: "GAME_OVER" } as GameState, "opponent")).toBe("La partida terminó");
  });

  it("the turn goes on after the duel", () => {
    const hand = [energy(EnergyType.Fighting)];
    const s = submitDuelPick(submitDuelPick(playDuel(hand), "player", "rock"), "opponent", "paper");
    expect(getTurnActionBlocker(s)).toBeNull();
    expect(s.isPlayerTurn).toBe(true);
  });
});

describe("Misty's Duel: perspective", () => {
  const duel: PendingDuel = { round: 3, playerPick: "rock", opponentPick: null, lastRound: { playerPick: "paper", opponentPick: "scissors" } };
  const swapped: PendingDuel = { round: 3, playerPick: null, opponentPick: "rock", lastRound: { playerPick: "scissors", opponentPick: "paper" } };

  it("board swapSides swaps the picks and the last round; twice gives the same state", () => {
    const s = { ...playDuel(), pendingDuel: duel };
    expect(swapSides(s).pendingDuel).toEqual(swapped);
    expect(swapSides(swapSides(s)).pendingDuel).toEqual(duel);
  });

  it("maskDuelFor hides only the other side's pick but says whether it picked; the last round stays visible", () => {
    const s = { ...playDuel(), pendingDuel: duel };
    const flags = { playerPicked: true, opponentPicked: false };
    expect(maskDuelFor(s, "player").pendingDuel).toEqual({ ...duel, ...flags });
    expect(maskDuelFor(s, "opponent").pendingDuel).toEqual({ ...duel, ...flags, playerPick: null });
    expect(maskDuelFor(swapSides(s), "player").pendingDuel).toEqual({ ...swapped, opponentPick: null, playerPicked: false, opponentPicked: true });
    const none = playDuel();
    expect(maskDuelFor({ ...none, pendingDuel: undefined }, "player").pendingDuel).toBeUndefined();
    expect(maskDuelFor(none, "player").pendingDuel).toEqual({ round: 1, playerPick: null, opponentPick: null, playerPicked: false, opponentPicked: false });
  });

  it("the rival picked: the masked view shows that it did, not what", () => {
    const s = submitDuelPick(playDuel(), "opponent", "scissors");
    const masked = maskDuelFor(s, "player").pendingDuel!;
    expect(masked.opponentPick).toBeNull();
    expect(masked.opponentPicked).toBe(true);
    expect(masked.playerPicked).toBe(false);
    expect(JSON.stringify(masked)).not.toContain("scissors");
    // The real state never carries the flags; a masked view's flags don't leak back through a pick
    expect(s.pendingDuel).not.toHaveProperty("opponentPicked");
    expect(submitDuelPick({ ...s, pendingDuel: { ...s.pendingDuel!, playerPicked: false } }, "player", "rock").pendingDuel).toBeUndefined();
  });

  it("the AI's knowledge view never shows the other side's pick", () => {
    const s = { ...playDuel(), pendingDuel: { round: 1, playerPick: null, opponentPick: "paper" as const } };
    expect(knowledgeView(s).pendingDuel).toMatchObject({ round: 1, playerPick: null, opponentPick: null, opponentPicked: true });
  });

  it("the AI executor's attack views swap the picks and the result symmetrically (finishAIAttackAfterReaction round trip)", () => {
    // The AI's turn in the human's view, the duel pending with asymmetric picks (pending keeps the turn going)
    const last = { picks: { player: "rock" as const, opponent: "scissors" as const }, winner: "player" as const };
    const s: GameState = { ...swapSides(playDuel()), pendingDuel: duel, lastDuel: last };
    expect(s.isPlayerTurn).toBe(false);
    const after = finishAIAttackAfterReaction(s);
    expect(after.pendingDuel).toEqual(duel);
    expect(after.lastDuel).toEqual(last);
    expect(after.isPlayerTurn).toBe(false); // endTurn refused while pending
  });
});

describe("Misty's Duel: lastDuel", () => {
  it("a decisive round sets both picks and the winner; a tie doesn't", () => {
    const tie = submitDuelPick(submitDuelPick(playDuel(), "player", "rock"), "opponent", "rock");
    expect(tie.lastDuel).toBeUndefined();
    const won = submitDuelPick(submitDuelPick(tie, "player", "paper"), "opponent", "scissors");
    expect(won.lastDuel).toEqual({ picks: { player: "paper", opponent: "scissors" }, winner: "opponent" });
    // Public once resolved: masking leaves it
    expect(maskDuelFor(won, "player").lastDuel).toEqual(won.lastDuel);
  });

  it("relative to the view that resolved it, and swapped by swapSides (twice = same)", () => {
    const before = playDuel();
    // The other player resolves the round on its own view
    const resolved = submitDuelPick(swapSides(submitDuelPick(before, "player", "rock")), "player", "paper");
    expect(resolved.lastDuel).toEqual({ picks: { player: "paper", opponent: "rock" }, winner: "player" });
    expect(swapSides(resolved).lastDuel).toEqual({ picks: { player: "rock", opponent: "paper" }, winner: "opponent" });
    expect(swapSides(swapSides(resolved)).lastDuel).toEqual(resolved.lastDuel);
  });

  it("cleared at the end of the turn and when another duel starts", () => {
    const won = submitDuelPick(submitDuelPick(playDuel(), "player", "rock"), "opponent", "scissors");
    expect(won.lastDuel).toBeDefined();
    const ended = endTurn(won);
    expect(ended.turnNumber).toBe(won.turnNumber + 1);
    expect(ended.lastDuel).toBeUndefined();
    // A second Misty's Duel the same turn
    const card = duelCard();
    const again = playTrainerCard({ ...won, playerHand: [card, ...won.playerHand] }, card.id);
    expect(again.lastDuel).toBeUndefined();
    expect(again.pendingDuel).toEqual({ round: 1, playerPick: null, opponentPick: null });
  });
});

describe("Misty's Duel: single-player", () => {
  it("the human plays it: the human's pick, then the AI's (submitDuelPickVsAI)", () => {
    const before = playDuel(fill(2, "Fire Energy"));
    const after = submitDuelPickVsAI(before, "rock", () => 0.99); // AI: scissors
    expect(after.pendingDuel).toBeUndefined();
    expect(after.playerHand).toHaveLength(5);
    const tie = submitDuelPickVsAI(before, "rock", () => 0); // AI: rock
    expect(tie.pendingDuel).toMatchObject({ round: 2, lastRound: { playerPick: "rock", opponentPick: "rock" } });
  });

  it("the AI plays it through the executor; the human then answers on its own view", () => {
    // The AI's turn (human's view): the AI holds Misty's Duel
    const card = duelCard();
    const human = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Onix"), hand: fill(3, "Water Energy"), deck: fill(20, "Psychic Energy") },
      opponent: { active: inPlay("Machop"), hand: [card], deck: fill(20) },
    });
    const played = executeAIAction(human, { type: "playTrainer", cardId: card.id, trainerName: "Misty's Duel", selections: [], delay: 0 } as never);
    expect(played.pendingDuel).toEqual({ round: 1, playerPick: null, opponentPick: null });
    expect(played.opponentDiscard.map((c) => c.id)).toContain(card.id);
    expect(played.isPlayerTurn).toBe(false);
    // The human picks rock, the AI scissors: the human wins and redraws
    const after = submitDuelPickVsAI(played, "rock", () => 0.99);
    expect(after.playerHand).toHaveLength(5);
    expect(after.opponentHand).toHaveLength(0);
    expect(after.isPlayerTurn).toBe(false); // still the AI's turn
  });

  it("the AI plays Misty's Duel only when the other player can pick (otherPlayerDuels)", () => {
    const card = duelCard();
    // The AI's view: AI = opponent in the human's view; few cards, a big rival hand
    const human = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Onix"), hand: fill(6, "Water Energy"), deck: fill(30, "Psychic Energy") },
      opponent: { active: inPlay("Machop"), hand: [card], deck: fill(30) },
    });
    const plays = (actions: { type: string; cardId?: string }[]) => actions.some((a) => a.type === "playTrainer" && a.cardId === card.id);
    expect(plays(decideOpponentTurn(human))).toBe(false);
    expect(plays(decideOpponentTurn(human, { otherPlayerDuels: true }))).toBe(true);
  });
});
