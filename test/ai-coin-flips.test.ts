import { describe, it, expect, vi, afterEach } from "vitest";
import { executeAIAction } from "@/domain/ai/executor";
import { EnergyType, ProtectionType, StatusCondition } from "@/domain/constants";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { makeState, inPlay, attackIndex, deepFreeze, names, armedFor } from "./helpers/state";

const { Grass, Lightning } = EnergyType;
const { Confused, Poisoned } = StatusCondition;

afterEach(() => vi.restoreAllMocks());

const HEADS = 0.1;
const TAILS = 0.9;

/** The AI ("opponent") uses `name` against the human's active. Math.random decides the coins. */
function aiAttack(ai: PokemonInPlay, human: PokemonInPlay, name: string, random: number, extra: Partial<Parameters<typeof makeState>[0]> = {}): GameState {
  vi.spyOn(Math, "random").mockReturnValue(random);
  const state = makeState({
    turnNumber: 4,
    isPlayerTurn: false,
    ...extra,
    opponent: { active: armedFor(ai, name), ...(extra.opponent ?? {}) },
    player: { active: human, ...(extra.player ?? {}) },
  });
  return executeAIAction(state, { type: "attack", attackIndex: attackIndex(ai, name), delay: 0 });
}

describe("AI attacks resolve coin effects through the engine", () => {
  it("Thunderpunch heads vs a Lightning-resistant Dugtrio: resistance applies once (10 damage)", () => {
    const after = aiAttack(inPlay("Electabuzz", { energy: [Lightning, Lightning] }), inPlay("Dugtrio"), "Puño-trueno", HEADS);
    expect(after.playerActivePokemon?.currentDamage).toBe(10);
    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(true);
  });

  it("Thunderpunch tails: Electabuzz damages itself (the second coin effect is not ignored)", () => {
    const after = aiAttack(inPlay("Electabuzz"), inPlay("Onix"), "Puño-trueno", TAILS);
    expect(after.playerActivePokemon?.currentDamage).toBe(30);
    expect(after.opponentActivePokemon?.currentDamage).toBe(10);
  });

  it("Big Eggsplosion flips one coin per Energy", () => {
    const after = aiAttack(inPlay("Exeggutor", { energy: [Grass, Grass, Grass] }), inPlay("Machamp"), "Big Eggsplosion", HEADS);
    expect(after.playerActivePokemon?.currentDamage).toBe(60);
  });

  it("protection on the human's active prevents coin damage", () => {
    const chansey = inPlay("Chansey", { protection: { type: ProtectionType.DamageOnly, expiresAfterTurn: 4 } });
    const after = aiAttack(inPlay("Beedrill"), chansey, "Doble Ataque", HEADS);
    expect(after.playerActivePokemon?.currentDamage).toBe(0);
  });

  it("Pay Day heads: the AI draws a card", () => {
    const after = aiAttack(inPlay("Meowth"), inPlay("Onix"), "Pay Day", HEADS);
    expect(after.opponentHand).toHaveLength(1);
    expect(after.opponentDeck).toHaveLength(9);
  });

  it("Venom Powder heads: the human's active is Confused and Poisoned and takes poison at the end of the AI's turn", () => {
    const after = aiAttack(inPlay("Venomoth"), inPlay("Machamp"), "Polvo Veneno", HEADS);
    expect(after.playerActivePokemon?.statusConditions).toEqual(expect.arrayContaining([Confused, Poisoned]));
    expect(after.playerActivePokemon?.currentDamage).toBe(20);
    expect(after.isPlayerTurn).toBe(true);
  });

  it("Zapdos knocks itself out with Thunder on tails: the human gets one prize, the AI promotes, the turn passes", () => {
    const zapdos = inPlay("Zapdos", { damage: 70 });
    const after = aiAttack(zapdos, inPlay("Onix"), "Trueno", TAILS, { opponent: { bench: [inPlay("Machop")] } });
    expect(names(after.opponentDiscard)).toContain("Zapdos");
    expect(after.opponentActivePokemon?.pokemon.name).toBe("Machop");
    expect(after.playerPrizes).toHaveLength(5);
    expect(after.playerActivePokemon?.currentDamage).toBe(60);
    expect(after.isPlayerTurn).toBe(true);
  });

  it("does not mutate the input state", () => {
    vi.spyOn(Math, "random").mockReturnValue(TAILS);
    const nidoking = armedFor(inPlay("Nidoking"), "Golpe");
    const state = deepFreeze(makeState({ turnNumber: 4, isPlayerTurn: false, opponent: { active: nidoking }, player: { active: inPlay("Onix") } }));
    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(nidoking, "Golpe"), delay: 0 });
    expect(after.opponentActivePokemon?.currentDamage).toBe(10);
    expect(after.playerActivePokemon?.currentDamage).toBe(60);
    expect(state.opponentActivePokemon?.currentDamage).toBe(0);
  });
});
