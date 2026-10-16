/**
 * Stadium cards (Gym Heroes): a played Stadium stays in play (`state.stadium`), a different
 * one replaces it (the old one goes to the discard pile of whoever played it) and two
 * Stadiums with the same name can never be in play. Played through the generic Trainer entry
 * points: any Stadium without its own TRAINER_EFFECTS entry falls back to `playStadium`.
 */
import { describe, it, expect } from "vitest";
import {
  canPlayTrainerCard,
  getTrainerSteps,
  getTrainerCoinFlips,
  playTrainerCard,
  swapSides,
  getStadium,
  stadiumNamed,
  executeAIAction,
  type GameCard,
  type GameState,
} from "@/index";
import { IllegalActionError } from "@/shared/errors";
import { ownedCardIds } from "@/domain/simulation";
import { makeState, inPlay, gameCard, deepFreeze, names } from "./helpers/state";

/** A Gym Heroes Stadium card from the catalog (a fresh instance each call). */
const stadium = (name: string): GameCard => gameCard(name, "gym-heroes");

const newLines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);

describe("playing a Stadium", () => {
  it("puts it in play for the player and removes it from the hand (no steps, no coins)", () => {
    const gym = stadium("Pewter City Gym");
    const state = deepFreeze(makeState({ player: { active: inPlay("Machop"), hand: [gym] } }));
    expect(getStadium(state)).toBeNull();
    expect(canPlayTrainerCard(state, gym.id)).toBeNull();
    expect(getTrainerSteps(state, gym.id, [])).toBeNull();
    expect(getTrainerCoinFlips(state, gym.id)).toBe(0);

    const next = playTrainerCard(state, gym.id);
    expect(next.stadium).toEqual({ card: gym, playedBy: "player" });
    expect(getStadium(next)).toEqual({ card: gym, playedBy: "player" });
    expect(stadiumNamed(next, "Pewter City Gym")).toBe(true);
    expect(stadiumNamed(next, "Cerulean City Gym")).toBe(false);
    expect(next.playerHand).toEqual([]);
    expect(next.playerDiscard).toEqual([]);
    expect(newLines(state, next)).toEqual(["Jugaste Pewter City Gym: el Estadio queda en juego"]);
  });

  it("a different Stadium replaces the opponent's one: the old one goes to the opponent's discard pile", () => {
    const old = stadium("Pewter City Gym");
    const gym = stadium("Cerulean City Gym");
    const state = deepFreeze(makeState({
      player: { active: inPlay("Machop"), hand: [gym] },
      opponent: { active: inPlay("Abra") },
      stadium: { card: old, playedBy: "opponent" },
    }));
    expect(canPlayTrainerCard(state, gym.id)).toBeNull();
    const next = playTrainerCard(state, gym.id);
    expect(next.stadium).toEqual({ card: gym, playedBy: "player" });
    expect(names(next.opponentDiscard)).toEqual(["Pewter City Gym"]);
    expect(next.playerDiscard).toEqual([]);
    expect(newLines(state, next)).toEqual([
      "Jugaste Cerulean City Gym: el Estadio queda en juego",
      "Pewter City Gym se descarta",
    ]);
  });

  it("replacing your own Stadium sends it to your discard pile", () => {
    const old = stadium("Pewter City Gym");
    const gym = stadium("Cerulean City Gym");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [gym] }, stadium: { card: old, playedBy: "player" } });
    const next = playTrainerCard(state, gym.id);
    expect(names(next.playerDiscard)).toEqual(["Pewter City Gym"]);
    expect(next.opponentDiscard).toEqual([]);
  });

  it("a Stadium with the same name as the one in play can't be played", () => {
    const old = stadium("Pewter City Gym");
    const same = stadium("Pewter City Gym");
    for (const playedBy of ["player", "opponent"] as const) {
      const state = makeState({ player: { active: inPlay("Machop"), hand: [same] }, stadium: { card: old, playedBy } });
      expect(canPlayTrainerCard(state, same.id)).toBe("Ya hay un Estadio con ese nombre en juego");
      expect(() => playTrainerCard(state, same.id)).toThrow(IllegalActionError);
      expect(() => playTrainerCard(state, same.id)).toThrow("Ya hay un Estadio con ese nombre en juego");
    }
  });

  it("respects the Trainer blockers (Headache) and the turn", () => {
    const gym = stadium("Pewter City Gym");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [gym] } });
    expect(canPlayTrainerCard({ ...state, noTrainersOnTurn: state.turnNumber }, gym.id)).toMatch(/Dolor de Cabeza/);
    expect(canPlayTrainerCard({ ...state, isPlayerTurn: false }, gym.id)).toMatch(/turno/);
  });
});

describe("Stadium and perspective", () => {
  it("swapSides flips who played it; swapping twice restores it", () => {
    const gym = stadium("Pewter City Gym");
    const state = deepFreeze(makeState({ stadium: { card: gym, playedBy: "player" } }));
    const swapped = swapSides(state);
    expect(swapped.stadium).toEqual({ card: gym, playedBy: "opponent" });
    expect(swapSides(swapped).stadium).toEqual(state.stadium);
    // No Stadium stays no Stadium
    expect(swapSides(makeState()).stadium ?? null).toBeNull();
    expect(swapSides(makeState({ stadium: null })).stadium).toBeNull();
  });

  it("the simulator counts the Stadium in play as a card of whoever played it", () => {
    const gym = stadium("Pewter City Gym");
    const state = makeState({ stadium: { card: gym, playedBy: "opponent" } });
    expect(ownedCardIds(state, "opponent")).toContain(gym.id);
    expect(ownedCardIds(state, "player")).not.toContain(gym.id);
  });

  it("a Stadium played by the AI is in play for the opponent", () => {
    const gym = stadium("Pewter City Gym");
    const state = makeState({
      player: { active: inPlay("Machop") },
      opponent: { active: inPlay("Abra"), hand: [gym] },
      isPlayerTurn: false,
    });
    const next = executeAIAction(state, { type: "playTrainer", cardId: gym.id, trainerName: gym.name, selections: [] } as never);
    expect(next.stadium).toEqual({ card: gym, playedBy: "opponent" });
    expect(next.opponentHand).toEqual([]);
  });
});
