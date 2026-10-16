/**
 * `SelectionStep.defaultSelection`: the answer the multiplayer server gives for a player whose
 * answer clock ran out. Every step another player answers (and every mid-attack question) names
 * one; it must be a valid selection of its step and harmless to the absent player.
 */
import { describe, it, expect } from "vitest";
import { executeAttack, resolveAttackChoice, type GameCard, type GameState, type PokemonInPlay } from "@/lib/gameState";
import { getTrainerSteps, playTrainerCard, type SelectionStep } from "@/domain/effects";
import { checkSelection } from "@/domain/effects/validate";
import { attachTrainer } from "@/domain/trainers/attached";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, gameCard, armedFor, attackIndex } from "./helpers/state";

const { Psychic } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const gym = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-heroes", ...opts });
const card = (name: string) => gameCard(name, "gym-heroes");
const fill = (n: number) => Array.from({ length: n }, () => gameCard("Grass Energy", "base"));
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}

/** The step's default, checked against the step (checkSelection throws on an invalid one). */
function validDefault(step: SelectionStep | null | undefined): string[] {
  expect(step).toBeTruthy();
  const chosen = step!.defaultSelection;
  expect(chosen).toBeDefined();
  expect(() => checkSelection(step!, chosen!)).not.toThrow();
  return chosen!;
}

function trainerState(name: string, opts: { hand?: GameCard[]; opponentDeck?: GameCard[]; set?: "rocket" } = {}) {
  const trainer = opts.set ? gameCard(name, opts.set) : card(name);
  const state = makeState({
    player: { active: inPlay("Machop"), hand: [trainer, ...(opts.hand ?? [])] },
    opponent: { active: inPlay("Onix"), deck: opts.opponentDeck ?? fill(10) },
  });
  return { trainer, state };
}

describe("Trainers the other player answers (Gym Heroes, Team Rocket's Challenge!)", () => {
  it("Erika: the opponent's draw defaults to 0 (the player's own count has no default to need)", () => {
    const { trainer, state } = trainerState("Erika");
    const asked = getTrainerSteps(state, trainer.id, [["1"]]);
    expect(asked?.chooser).toBe("opponent");
    expect(validDefault(asked)).toEqual(["0"]);
  });

  it("Erika: 0 stays valid when the opponent's deck is empty (higher counts disabled)", () => {
    const { trainer, state } = trainerState("Erika", { opponentDeck: [] });
    expect(validDefault(getTrainerSteps(state, trainer.id, [["1"]]))).toEqual(["0"]);
  });

  it("Lt. Surge's Treaty: the opponent's choice defaults to 'draw' (also when 'prizes' is disabled), its Prize to the first position", () => {
    const { trainer, state } = trainerState("Lt. Surge's Treaty");
    expect(validDefault(getTrainerSteps(state, trainer.id, []))).toEqual(["draw"]);
    const opponentPrize = getTrainerSteps(state, trainer.id, [["prizes"], ["2"]]);
    expect(opponentPrize?.chooser).toBe("opponent");
    expect(validDefault(opponentPrize)).toEqual(["0"]);

    const lastPrizes = { ...state, playerPrizes: state.playerPrizes.slice(0, 1), opponentPrizes: state.opponentPrizes.slice(0, 1) };
    const blocked = getTrainerSteps(lastPrizes, trainer.id, []);
    expect(blocked!.options.find((o) => o.id === "prizes")?.disabled).toBe(true);
    expect(validDefault(blocked)).toEqual(["draw"]);
  });

  it("Challenge!: declines by default; on accept, the opponent's Bench step defaults to no Basics", () => {
    const basics = Array.from({ length: 3 }, () => gameCard("Abra", "base"));
    const { trainer, state } = trainerState("Challenge!", { opponentDeck: [...basics, ...fill(5)], set: "rocket" });
    const first = getTrainerSteps(state, trainer.id, []);
    expect(first?.chooser).toBe("opponent");
    expect(validDefault(first)).toEqual(["decline"]);
    const theirBench = getTrainerSteps(state, trainer.id, [["accept"], []]);
    expect(theirBench?.chooser).toBe("opponent");
    expect(validDefault(theirBench)).toEqual([]);
    // The default really declines: the player draws 2, nobody benches anything
    const played = playTrainerCard(state, trainer.id, [first!.defaultSelection!]);
    expect(played.opponentBench).toHaveLength(0);
  });

  it("Blaine's Quiz #1: the guess defaults to the first length offered", () => {
    const named = gameCard("Abra", "base");
    const { trainer, state } = trainerState("Blaine's Quiz #1", { hand: [named] });
    const guess = getTrainerSteps(state, trainer.id, [[named.id]]);
    expect(guess?.chooser).toBe("opponent");
    expect(validDefault(guess)).toEqual([guess!.options[0].id]);
  });
});

describe("mid-attack questions", () => {
  it("Flee: no switch by default", () => {
    const abra = inPlay("Abra");
    const paused = attack(vs(inPlay("Nidoking"), gym("Misty's Tentacruel"), { opponent: { bench: [abra] } }), "Tóxico");
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("flee");
    expect(validDefault(paused.pendingAttackChoice!.step)).toEqual([]);
  });

  it("Bench Guard: no Benched Pokémon guarded by default", () => {
    const state = vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Machop"), { opponent: { bench: [inPlay("Abra"), gym("Brock's Rhydon"), inPlay("Machop")] } });
    const paused = attack(state, "Vapor Venenoso");
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("benchGuard");
    expect(validDefault(paused.pendingAttackChoice!.step)).toEqual([]);
  });

  it("Sabrina's ESP keeps the coins and Charity reduces nothing by default", () => {
    const esp = gameCard("Sabrina's ESP", "gym-heroes");
    const charity = gameCard("Charity", "gym-heroes");
    const haunter = attachTrainer(attachTrainer(gym("Sabrina's Haunter", { energy: [Psychic, Psychic] }), esp, "endOfTurn"), charity, "endOfTurn");
    const state = vs(haunter, inPlay("Onix"), { player: { bench: [gym("Sabrina's Gastly")] } });
    const espAsked = attack(state, "Espíritus Nocturnos", [T, H]);
    expect(espAsked.pendingAttackChoice?.reaction?.answers).toBe("espReflip");
    expect(validDefault(espAsked.pendingAttackChoice!.step)).toEqual(["keep"]);
    const charityAsked = resolveAttackChoice(espAsked, ["keep"], { skipEndTurn: true });
    expect(charityAsked.pendingAttackChoice?.reaction?.answers).toBe("charityReduction");
    expect(validDefault(charityAsked.pendingAttackChoice!.step)).toEqual(["0"]);
  });

  it("Terror Strike: the defender's switch defaults to its first Benched Pokémon", () => {
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: inPlay("Arbok", { set: "fossil" }) }, opponent: { active: inPlay("Machamp"), bench: [abra, inPlay("Machop")] } });
    const paused = attack(state, "Golpe Terrorífico", [H]);
    expect(paused.pendingAttackChoice?.step.chooser).toBe("opponent");
    expect(validDefault(paused.pendingAttackChoice!.step)).toEqual([abra.pokemon.id]);
  });
});
