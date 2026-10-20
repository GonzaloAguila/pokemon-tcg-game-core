/**
 * The AI with Gym Challenge (Task 11): it plays a Stadium that helps it, never the excluded
 * Trainers (Chaos Gym, Lt. Surge's Secret Plan), uses Soak Up / Emerge, Fuchsia and Saffron City
 * Gym, keeps weak Basics off the Bench under Rocket's Minefield Gym, accepts a Chaos Gym offer only
 * when its own planners would play the card, and answers every opponent step of the human's
 * Gym Challenge Trainers with an offered option.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerChaosGymOfferForAI, answerOpponentTrainerStepForAI, decideOpponentTurn, executeAIAction, type AIAction } from "@/domain/ai";
import { getTrainerSteps, playTrainerCard, canPlayTrainerCard } from "@/domain/effects";
import { stepForAnswerer } from "@/domain/effects/validate";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy } from "./helpers/state";

const { Grass, Psychic, Fire } = EnergyType;
const gc = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-challenge", ...opts });
const card = (name: string) => gameCard(name, "gym-challenge");
const stadium = (name: string, playedBy: "player" | "opponent" = "opponent") => ({ card: card(name), playedBy });
type Side = { active: PokemonInPlay; bench?: PokemonInPlay[]; hand?: GameCard[]; deck?: GameCard[] };

/** Human = "player", AI = "opponent", the AI's turn (the consumer's view). */
function aiTurn(ai: Side, human: Side, extra: Partial<GameState> = {}): GameState {
  return makeState({
    isPlayerTurn: false,
    player: { active: human.active, bench: human.bench ?? [], hand: human.hand ?? [] },
    opponent: { active: ai.active, bench: ai.bench ?? [], hand: ai.hand ?? [], ...(ai.deck && { deck: ai.deck }) },
    ...extra,
  });
}
const plays = (plan: AIAction[], name: string) => plan.some((a) => a.type === "playTrainer" && a.trainerName === name);
const pikachu = () => inPlay("Pikachu", { set: "base" });

afterEach(() => vi.restoreAllMocks());

describe("Stadiums and excluded Trainers", () => {
  it("plays Viridian City Gym with Giovanni's Pokémon in play (alone: the turn is planned again)", () => {
    const viridian = card("Viridian City Gym");
    const state = aiTurn({ active: gc("Giovanni's Machop"), bench: [gc("Giovanni's Meowth")], hand: [viridian] }, { active: pikachu() });
    expect(decideOpponentTurn(state)).toEqual([expect.objectContaining({ type: "playTrainer", trainerName: "Viridian City Gym" })]);
  });

  it("never plays Chaos Gym nor Lt. Surge's Secret Plan", () => {
    const hand = [card("Chaos Gym"), card("Lt. Surge's Secret Plan"), gameCard("Giovanni's Machop", "gym-challenge")];
    const plan = decideOpponentTurn(aiTurn({ active: gc("Giovanni's Pinsir"), hand }, { active: pikachu() }));
    expect(plays(plan, "Chaos Gym")).toBe(false);
    expect(plays(plan, "Lt. Surge's Secret Plan")).toBe(false);
  });
});

describe("Activated powers", () => {
  it("uses Soak Up onto an Active Erika's Bellsprout that can't attack yet", () => {
    const bellsprout = gc("Erika's Bellsprout");
    const state = aiTurn({ active: bellsprout, bench: [inPlay("Bulbasaur", { set: "base", energy: [Grass, Grass] })] }, { active: pikachu() });
    expect(decideOpponentTurn(state)).toContainEqual(expect.objectContaining({ type: "usePower", pokemonId: bellsprout.pokemon.id }));
  });

  it("uses Emerge with Koga's Kakuna", () => {
    const kakuna = gc("Koga's Kakuna");
    const state = aiTurn({ active: kakuna, deck: [card("Koga's Beedrill"), energy(Grass), energy(Grass)] }, { active: pikachu() });
    expect(decideOpponentTurn(state)).toContainEqual(expect.objectContaining({ type: "usePower", pokemonId: kakuna.pokemon.id }));
  });
});

describe("Stadium actions", () => {
  it("Fuchsia City Gym: shuffles a doomed Benched Koga's Pokémon into the deck (heads)", () => {
    const ekans = gc("Koga's Ekans", { damage: 30 });
    const state = aiTurn({ active: gc("Koga's Grimer", { energy: [Grass] }), bench: [ekans] }, { active: pikachu() }, { stadium: stadium("Fuchsia City Gym") });
    const plan = decideOpponentTurn(state);
    expect(plan).toEqual([expect.objectContaining({ type: "useStadium", stadiumName: "Fuchsia City Gym", selections: [[ekans.pokemon.id]] })]);
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads
    const after = executeAIAction(state, plan[0]);
    expect(after.opponentBench).toHaveLength(0);
    expect(after.opponentDeck.some((c) => c.id === ekans.pokemon.id)).toBe(true);
  });

  it("Fuchsia City Gym: an Active that can't attack goes back too, and the AI promotes", () => {
    const weedle = gc("Koga's Weedle", { damage: 30 });
    const grimer = gc("Koga's Grimer");
    const state = aiTurn({ active: weedle, bench: [grimer] }, { active: pikachu() }, { stadium: stadium("Fuchsia City Gym") });
    const plan = decideOpponentTurn(state);
    expect(plan[0]).toMatchObject({ type: "useStadium", selections: [[weedle.pokemon.id]] });
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const after = executeAIAction(state, plan[0]);
    expect(after.opponentActivePokemon?.pokemon.id).toBe(grimer.pokemon.id);
    expect(after.opponentNeedsToPromote).toBe(false);
  });

  it("Fuchsia City Gym: tails uses it up without a pick", () => {
    const ekans = gc("Koga's Ekans", { damage: 30 });
    const state = aiTurn({ active: gc("Koga's Grimer", { energy: [Grass] }), bench: [ekans] }, { active: pikachu() }, { stadium: stadium("Fuchsia City Gym") });
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const after = executeAIAction(state, decideOpponentTurn(state)[0]);
    expect(after.opponentBench).toHaveLength(1);
    expect(after.fuchsiaCityGymUsedOnTurn).toBe(state.turnNumber);
  });

  it("Saffron City Gym: takes back a spare Energy another Pokémon needs (none in hand)", () => {
    const jynx = gc("Sabrina's Jynx", { energy: [Psychic, Psychic, Psychic] });
    const drowzee = gc("Sabrina's Drowzee");
    const state = aiTurn({ active: jynx, bench: [drowzee] }, { active: pikachu() }, { stadium: stadium("Saffron City Gym") });
    const action = decideOpponentTurn(state).find((a) => a.type === "useStadium");
    expect(action).toMatchObject({ stadiumName: "Saffron City Gym", selections: [[jynx.pokemon.id], [expect.any(String)]] });
    const after = executeAIAction(state, action!);
    expect(after.opponentActivePokemon!.attachedEnergy).toHaveLength(2);
    expect(after.opponentHand).toHaveLength(1);
  });

  it("Saffron City Gym: not with an Energy card in hand", () => {
    const jynx = gc("Sabrina's Jynx", { energy: [Psychic, Psychic, Psychic] });
    const state = aiTurn({ active: jynx, bench: [gc("Sabrina's Drowzee")], hand: [energy(Psychic)] }, { active: pikachu() }, { stadium: stadium("Saffron City Gym") });
    expect(decideOpponentTurn(state).some((a) => a.type === "useStadium")).toBe(false);
  });
});

describe("Rocket's Minefield Gym", () => {
  it("doesn't put a 30 HP Basic onto a Bench that already has a Pokémon (it does without the Stadium)", () => {
    const magikarp = gameCard("Giovanni's Magikarp", "gym-challenge");
    const side = { active: gc("Giovanni's Pinsir"), bench: [gc("Giovanni's Machop")], hand: [magikarp] };
    const benches = (plan: AIAction[]) => plan.some((a) => a.type === "playBasicToBench" && a.cardId === magikarp.id);
    expect(benches(decideOpponentTurn(aiTurn(side, { active: pikachu() })))).toBe(true);
    expect(benches(decideOpponentTurn(aiTurn(side, { active: pikachu() }, { stadium: stadium("Rocket's Minefield Gym", "player") })))).toBe(false);
  });
});

describe("Chaos Gym offers", () => {
  /** The human (player, its turn) plays `name` under Chaos Gym and gets tails: the AI is offered it. */
  function offered(name: string, aiHand: GameCard[] = []): GameState {
    const trainer = gameCard(name);
    const state = makeState({
      player: { active: pikachu(), hand: [trainer] },
      opponent: { active: gc("Giovanni's Pinsir"), hand: aiHand },
      stadium: stadium("Chaos Gym", "player"),
    });
    const failed = playTrainerCard(state, trainer.id, [], { coinResults: ["tails"] });
    expect(failed.pendingChaosOffer).toMatchObject({ cardName: name, offeredTo: "opponent" });
    return failed;
  }

  it("accepts a card its own planners would play (Bill) and plays it at once", () => {
    const state = offered("Bill");
    const after = answerChaosGymOfferForAI(state);
    expect(after.pendingChaosOffer).toBeUndefined();
    expect(after.opponentHand).toHaveLength(2);
    expect(after.playerDiscard.map((c) => c.name)).toEqual(["Bill"]);
    expect(after.isPlayerTurn).toBe(true);
  });

  it("declines one it wouldn't play (Energy Search with an Energy card in hand)", () => {
    const state = offered("Energy Search", [energy(Fire)]);
    const after = answerChaosGymOfferForAI(state);
    expect(after.pendingChaosOffer).toBeUndefined();
    expect(after.opponentHand).toHaveLength(1);
  });
});

describe("Opponent steps of the human's Gym Challenge Trainers", () => {
  /** Walk the Trainer's steps: the human answers its own with the first options, the AI the opponent ones. */
  function playWithAIAnswers(state: GameState, cardId: string): GameState {
    const selections: string[][] = [];
    for (let guard = 0; guard < 8; guard++) {
      const step = getTrainerSteps(state, cardId, selections);
      if (!step) break;
      const enabled = step.options.filter((o) => !o.disabled).map((o) => o.id);
      const answer =
        step.chooser === "opponent"
          ? answerOpponentTrainerStepForAI(state, cardId, stepForAnswerer(step))
          : enabled.slice(0, Math.max(step.minSelections ?? 1, Math.min(1, step.maxSelections)));
      if (step.chooser === "opponent") for (const id of answer) expect(enabled).toContain(id);
      selections.push(answer);
    }
    return playTrainerCard(state, cardId, selections);
  }

  it.each(["Warp Point", "Blaine's Quiz #2", "Blaine's Quiz #3", "Misty's Wish"])("%s", (name) => {
    const trainer = card(name);
    const state = makeState({
      player: { active: pikachu(), bench: [inPlay("Rattata", { set: "base" })], hand: [trainer, gameCard("Charmander", "base"), energy(Fire)] },
      opponent: { active: gc("Giovanni's Pinsir"), bench: [gc("Giovanni's Machop"), gc("Giovanni's Meowth", { damage: 10 })] },
    });
    expect(canPlayTrainerCard(state, trainer.id)).toBeNull();
    const after = playWithAIAnswers(state, trainer.id);
    expect(after.playerDiscard.some((c) => c.id === trainer.id)).toBe(true);
  });
});
