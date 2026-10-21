/**
 * Lt. Surge's Secret Plan (Gym Challenge): a card of the hand face down on the Bench, from the
 * printed text and the accepted default of docs/card-doubts.md → "Gym Challenge".
 */
import { describe, it, expect } from "vitest";
import { checkKnockouts, executeAttack, promoteActivePokemon, type GameCard, type GameState } from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerCoinFlips, playTrainerCard } from "@/domain/effects";
import { attachEnergyCard, canEvolve, canFlipFaceDown, flipFaceDown, swapSides } from "@/domain/board";
import { EnergyType } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { knowledgeView } from "@/domain/ai";
import { AI_NEVER_PLAYS } from "@/domain/ai/cardEffects";
import { FACE_DOWN_NAME, isFaceDown, maskFaceDownFor } from "@/domain/trainers/secret-plan";
import { cardsLeavingPlay } from "@/domain/cards";
import { makeState, inPlay, gameCard, energy, names, deepFreeze, armedFor, attackIndex } from "./helpers/state";

const { Lightning, Fighting } = EnergyType;
const SECRET_PLAN = "Lt. Surge's Secret Plan";
const card = (name: string) => gameCard(name, "gym-challenge");
type Setup = NonNullable<Parameters<typeof makeState>[0]>;

/** Plays Secret Plan with `hidden` (+ `extraHand`) and returns the state and the face-down id. */
function withFaceDown(hidden: GameCard, extra: Setup = {}, extraHand: GameCard[] = []): { state: GameState; id: string } {
  const plan = card(SECRET_PLAN);
  const before = makeState({
    ...extra,
    player: { active: inPlay("Machop"), ...(extra.player ?? {}), hand: [plan, hidden, ...extraHand] },
    opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) },
  });
  const state = playTrainerCard(before, plan.id, [[hidden.id]]);
  return { state, id: state.playerBench[state.playerBench.length - 1].pokemon.id };
}

/** The same board seen by the other player, whose turn it is. */
const otherSidesTurn = (state: GameState): GameState => ({ ...swapSides(state), isPlayerTurn: true });

describe("Lt. Surge's Secret Plan: playing it", () => {
  it("puts the chosen hand card face down on the Bench: a Basic with no HP, attacks or Retreat Cost", () => {
    const plan = card(SECRET_PLAN);
    const hidden = gameCard("Pikachu", "base");
    const state = deepFreeze(makeState({ player: { active: inPlay("Machop"), hand: [plan, hidden] }, opponent: { active: inPlay("Onix") } }));
    const next = playTrainerCard(state, plan.id, [[hidden.id]]);
    expect(next.playerHand).toEqual([]);
    expect(names(next.playerDiscard)).toEqual([SECRET_PLAN]);
    const fd = next.playerBench[0];
    expect(isFaceDown(fd)).toBe(true);
    expect(fd.pokemon.name).toBe(FACE_DOWN_NAME);
    expect(fd.pokemon.kind).toBe("pokemon");
    expect(fd.pokemon.kind === "pokemon" && [fd.pokemon.hp, fd.pokemon.attacks.length, fd.pokemon.retreatCost, fd.pokemon.types.length]).toEqual([0, 0, 0, 0]);
    expect((fd.pokemon as { faceDownCard?: { id: string } }).faceDownCard?.id).toBe(hidden.id);
    // The in-play id says nothing about the card
    expect(fd.pokemon.id).not.toContain("Pikachu");
    // No line names the hidden card
    expect(next.events.map((e) => e.message).join(" | ")).not.toContain("Pikachu");
  });

  it("needs another card in the hand and room on the Bench (Narrow Gym included)", () => {
    const plan = card(SECRET_PLAN);
    expect(canPlayTrainerCard(makeState({ player: { active: inPlay("Machop"), hand: [plan] } }), plan.id)).toMatch(/otra carta/);
    const full = makeState({
      player: { active: inPlay("Machop"), hand: [plan, energy(Fighting)], bench: ["Abra", "Gastly", "Pikachu", "Onix", "Machop"].map((n) => inPlay(n)) },
    });
    expect(canPlayTrainerCard(full, plan.id)).toMatch(/Banca/);
    const narrow = makeState({
      player: { active: inPlay("Machop"), hand: [plan, energy(Fighting)], bench: ["Abra", "Gastly", "Pikachu", "Onix"].map((n) => inPlay(n)) },
      stadium: { card: gameCard("Narrow Gym", "gym-heroes"), playedBy: "player" },
    } as Setup);
    expect(canPlayTrainerCard(narrow, plan.id)).toMatch(/Banca/);
  });

  it("isn't played from the hand as a Basic: no Minefield Gym coin", () => {
    const plan = card(SECRET_PLAN);
    const hidden = gameCard("Pikachu", "base");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [plan, hidden] },
      stadium: { card: card("Rocket's Minefield Gym"), playedBy: "player" },
    } as Setup);
    expect(getTrainerCoinFlips(state, plan.id)).toBe(0);
    const next = playTrainerCard(state, plan.id, [[hidden.id]]);
    expect(next.playerBench[0].currentDamage).toBe(0);
  });

  it("can't be evolved while face down", () => {
    const evolution = gameCard("Raichu", "base");
    const { state, id } = withFaceDown(gameCard("Pikachu", "base"), {}, [evolution]);
    expect(canEvolve(state, evolution.id, id)).not.toBeNull();
  });

  it("the AI never plays it", () => {
    expect(AI_NEVER_PLAYS.has(SECRET_PLAN)).toBe(true);
  });
});

describe("Lt. Surge's Secret Plan: Energy and flipping by choice", () => {
  it("its owner's Energy attachment doesn't flip it, and the Energy stays when it flips", () => {
    const e = energy(Lightning);
    const { state, id } = withFaceDown(gameCard("Pikachu", "base"), {}, [e]);
    const attached = checkKnockouts(attachEnergyCard(state, e.id, id));
    expect(isFaceDown(attached.playerBench[0])).toBe(true);
    expect(attached.playerBench[0].attachedEnergy.map((c) => c.id)).toEqual([e.id]);
    const flipped = flipFaceDown(attached, id);
    expect(flipped.playerBench[0].pokemon.name).toBe("Pikachu");
    expect(isFaceDown(flipped.playerBench[0])).toBe(false);
    expect(flipped.playerBench[0].attachedEnergy.map((c) => c.id)).toEqual([e.id]);
  });

  it("a card that isn't a Basic Pokémon is discarded with its cards (no Prize)", () => {
    const e = energy(Lightning);
    const hidden = gameCard("Raichu", "base");
    const { state, id } = withFaceDown(hidden, {}, [e]);
    const flipped = deepFreeze(attachEnergyCard(state, e.id, id));
    const next = flipFaceDown(flipped, id);
    expect(next.playerBench).toEqual([]);
    expect(names(next.playerDiscard).sort()).toEqual(["Lightning Energy", SECRET_PLAN, "Raichu"].sort());
    expect(next.playerDiscard.find((c) => c.name === "Raichu")!.id).toBe(hidden.id);
    expect(next.opponentCanTakePrize).toBe(false);
    expect(next.opponentPrizes.length).toBe(6);
  });

  it("Trainers played as Basics and Energy cards are discarded too", () => {
    for (const hidden of [gameCard("Mysterious Fossil", "fossil"), energy(Fighting)]) {
      const { state, id } = withFaceDown(hidden);
      const next = flipFaceDown(state, id);
      expect(next.playerBench).toEqual([]);
      expect(next.playerDiscard.map((c) => c.id)).toContain(hidden.id);
      expect(next.playerDiscard.find((c) => c.id === hidden.id)!.kind).toBe(hidden.kind);
    }
  });

  it("only its owner, only during their turn", () => {
    const { state, id } = withFaceDown(gameCard("Pikachu", "base"));
    expect(canFlipFaceDown(state, id)).toBeNull();
    expect(canFlipFaceDown({ ...state, isPlayerTurn: false }, id)).toMatch(/turno/);
    expect(canFlipFaceDown(state, state.playerActivePokemon!.pokemon.id)).not.toBeNull();
    expect(canFlipFaceDown(otherSidesTurn(state), id)).not.toBeNull();
    expect(() => flipFaceDown({ ...state, isPlayerTurn: false }, id)).toThrow(IllegalActionError);
  });

  it("leaving play by another effect gives back the real card", () => {
    const hidden = gameCard("Pikachu", "base");
    const { state } = withFaceDown(hidden);
    expect(cardsLeavingPlay(state.playerBench[0]).map((c) => c.id)).toEqual([hidden.id]);
  });
});

describe("Lt. Surge's Secret Plan: flipped by the rules", () => {
  it("promoting it flips it: a Basic Pokémon becomes the Active", () => {
    const { state, id } = withFaceDown(gameCard("Pikachu", "base"));
    const needs = { ...state, playerActivePokemon: null, playerNeedsToPromote: true };
    const next = promoteActivePokemon(needs, needs.playerBench.findIndex((p) => p.pokemon.id === id), true);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Pikachu");
    expect(isFaceDown(next.playerActivePokemon)).toBe(false);
    expect(next.playerNeedsToPromote).toBe(false);
  });

  it("promoting a non-Basic discards it and asks for another promotion; with no other Pokémon its owner loses", () => {
    const { state, id } = withFaceDown(energy(Fighting), { player: { bench: [inPlay("Abra")] } });
    const needs = { ...state, playerActivePokemon: null, playerNeedsToPromote: true };
    const next = promoteActivePokemon(needs, needs.playerBench.findIndex((p) => p.pokemon.id === id), true);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.playerBench.map((p) => p.pokemon.name)).toEqual(["Abra"]);

    const alone = withFaceDown(energy(Fighting));
    const lost = promoteActivePokemon({ ...alone.state, playerActivePokemon: null, playerNeedsToPromote: true }, 0, true);
    expect(lost.gameResult).toBe("defeat");
  });

  it("Gust of Wind brings it up and flips it (a non-Basic leaves its owner promoting)", () => {
    const basic = withFaceDown(gameCard("Pikachu", "base"));
    const turn = otherSidesTurn(basic.state);
    const g1 = gameCard("Gust of Wind", "base");
    const s1 = playTrainerCard({ ...turn, playerHand: [g1] }, g1.id, [[basic.id]]);
    expect(s1.opponentActivePokemon!.pokemon.name).toBe("Pikachu");
    expect(s1.opponentBench.map((p) => p.pokemon.name)).toEqual(["Machop"]);

    const other = withFaceDown(energy(Fighting));
    const g2 = gameCard("Gust of Wind", "base");
    const s2 = playTrainerCard({ ...otherSidesTurn(other.state), playerHand: [g2] }, g2.id, [[other.id]]);
    expect(s2.opponentActivePokemon).toBeNull();
    expect(s2.opponentNeedsToPromote).toBe(true);
    expect(s2.playerCanTakePrize).toBe(false);
  });

  it("Energy Removal on it flips it", () => {
    const e = energy(Lightning);
    const { state, id } = withFaceDown(gameCard("Raichu", "base"), {}, [e]);
    const withEnergy = attachEnergyCard(state, e.id, id);
    const removal = gameCard("Energy Removal", "base");
    const next = playTrainerCard({ ...otherSidesTurn(withEnergy), playerHand: [removal] }, removal.id, [[e.id]]);
    expect(next.opponentBench).toEqual([]);
    expect(names(next.opponentDiscard)).toContain("Raichu");
  });

  it("bench damage of an attack flips it: a Basic keeps the damage, anything else goes without a Prize", () => {
    const pikachu = withFaceDown(gameCard("Pikachu", "base"), { player: { active: inPlay("Chansey", { set: "base" }) }, opponent: { bench: [inPlay("Abra")] } });
    const magneton = armedFor(inPlay("Magneton", { damage: 0 }), "Autodestrucción");
    const turn = { ...otherSidesTurn(pikachu.state), playerActivePokemon: magneton };
    const after = executeAttack(turn, attackIndex(magneton, "Autodestrucción"));
    const hit = after.opponentBench.find((p) => p.pokemon.name === "Pikachu")!;
    expect(isFaceDown(hit)).toBe(false);
    expect(hit.currentDamage).toBe(20);

    const fossil = withFaceDown(gameCard("Mysterious Fossil", "fossil"), { player: { active: inPlay("Chansey", { set: "base" }) }, opponent: { bench: [inPlay("Abra")] } });
    const turn2 = { ...otherSidesTurn(fossil.state), playerActivePokemon: magneton };
    const after2 = executeAttack(turn2, attackIndex(magneton, "Autodestrucción"));
    expect(after2.opponentBench).toEqual([]);
    expect(names(after2.opponentDiscard)).toContain("Mysterious Fossil");
    // Magneton Knocks itself Out (the other player takes that Prize); the face-down card gives none
    expect(after2.playerCanTakePrize).toBe(false);
    expect(after2.playerPrizes.length).toBe(6);
  });
});

describe("Lt. Surge's Secret Plan: hidden information", () => {
  it("maskFaceDownFor hides the card from the other player only", () => {
    const { state } = withFaceDown(gameCard("Pikachu", "base"));
    expect(maskFaceDownFor(state, "player")).toBe(state);
    const masked = maskFaceDownFor(state, "opponent");
    const fd = masked.playerBench[0];
    expect(isFaceDown(fd)).toBe(true);
    expect((fd.pokemon as { faceDownCard?: { name: string } }).faceDownCard!.name).not.toBe("Pikachu");
    expect(JSON.stringify(masked.playerBench)).not.toContain("Pikachu");
  });

  it("the AI's knowledge view never sees the other player's face-down card", () => {
    const { state } = withFaceDown(gameCard("Pikachu", "base"));
    const aiView = knowledgeView(swapSides(state));
    expect(JSON.stringify(aiView.opponentBench)).not.toContain("Pikachu");
  });
});
