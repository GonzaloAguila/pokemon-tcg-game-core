import { describe, it, expect, vi, afterEach } from "vitest";
import {
  canExecuteAttack,
  canExecuteMetronome,
  executeAttack,
  executeMetronome,
  getAttackCoinFlipCount,
  resolveConfusionFlip,
} from "@/lib/gameState";
import { canPlayTrainerCard } from "@/domain/effects";
import { executeAIAction } from "@/domain/ai";
import { IllegalActionError } from "@/shared/errors";
import { EnergyType, StatusCondition, GamePhase } from "@/domain/constants";
import { makeState, inPlay, attackIndex, armedFor, gameCard } from "./helpers/state";

const { Fighting, Fire, Psychic, Lightning } = EnergyType;

afterEach(() => vi.restoreAllMocks());

const machopState = (opts: Parameters<typeof inPlay>[1] = {}) => {
  const machop = inPlay("Machop", { energy: [Fighting], ...opts });
  return { machop, state: makeState({ player: { active: machop }, opponent: { active: inPlay("Onix") } }) };
};

describe("canExecuteAttack / executeAttack guard (exploit: unpaid or statused attacks)", () => {
  it("a paid, awake Machop can attack", () => {
    const { machop, state } = machopState();
    expect(canExecuteAttack(state, attackIndex(machop, "Patada baja"))).toBeNull();
  });

  it("refuses a Paralyzed Machop with no Energy and throws IllegalActionError", () => {
    const { machop, state } = machopState({ energy: [], statuses: [StatusCondition.Paralyzed] });
    const index = attackIndex(machop, "Patada baja");
    expect(canExecuteAttack(state, index)).toMatch(/paralizado/);
    expect(() => executeAttack(state, index)).toThrow(IllegalActionError);
    expect(() => executeAttack(state, index, true)).toThrow(IllegalActionError); // legacy form too
  });

  it("refuses unpaid, asleep and Leer'd attackers", () => {
    expect(canExecuteAttack(machopState({ energy: [] }).state, 0)).toMatch(/energía/);
    expect(canExecuteAttack(machopState({ statuses: [StatusCondition.Asleep] }).state, 0)).toMatch(/dormido/);
    expect(canExecuteAttack(machopState({ statuses: [StatusCondition.CannotAttack] }).state, 0)).toMatch(/no puede atacar/);
  });

  it("Double Colorless counts as 2 and Energy Burn turns Water into Fire", () => {
    const pidgeotto = inPlay("Pidgeotto", { energy: [EnergyType.Colorless] });
    const s1 = makeState({ player: { active: pidgeotto }, opponent: { active: inPlay("Onix") } });
    expect(canExecuteAttack(s1, attackIndex(pidgeotto, pidgeotto.pokemon.kind === "pokemon" ? pidgeotto.pokemon.attacks[0].name : ""))).toBeNull();
    const charizard = inPlay("Charizard", { energy: [EnergyType.Water, EnergyType.Water, EnergyType.Water, EnergyType.Water] });
    const s2 = makeState({ player: { active: charizard }, opponent: { active: inPlay("Onix") } });
    expect(canExecuteAttack(s2, attackIndex(charizard, "Giro Fuego"))).toBeNull();
  });

  it("refuses outside the player's turn / the PLAYING phase", () => {
    const { state } = machopState();
    expect(canExecuteAttack({ ...state, isPlayerTurn: false }, 0)).toMatch(/turno/);
    expect(canExecuteAttack({ ...state, gamePhase: GamePhase.Setup }, 0)).not.toBeNull();
  });

  it("only one attack per turn: after an attack that keeps the turn (prize pending / skipEndTurn) a second one is refused", () => {
    const { state } = machopState();
    const after = executeAttack(state, 0, { skipEndTurn: true });
    expect(after.attackedThisTurn).toBe(true);
    expect(canExecuteAttack(after, 0)).toMatch(/Ya atacaste/);
    // nor can cards be played after attacking
    const bill = gameCard("Bill");
    expect(canPlayTrainerCard({ ...after, playerHand: [bill] }, bill.id)).toMatch(/Ya atacaste/);
  });

  it("the flag is cleared when the turn passes", () => {
    const { state } = machopState();
    const after = executeAttack(state, 0);
    expect(after.isPlayerTurn).toBe(false);
    expect(after.attackedThisTurn).toBeUndefined();
  });

  it("the starting player may attack on turn 1 (classic 1999 rule)", () => {
    const { state } = machopState();
    expect(canExecuteAttack({ ...state, turnNumber: 1, startingPlayer: "player" }, 0)).toBeNull();
  });

  it("the AI ends its turn instead of attacking illegally", () => {
    const ai = inPlay("Machop", { statuses: [StatusCondition.Paralyzed], energy: [Fighting] });
    const state = makeState({ turnNumber: 4, isPlayerTurn: false, opponent: { active: ai }, player: { active: inPlay("Onix") } });
    const after = executeAIAction(state, { type: "attack", attackIndex: 0 });
    expect(after.playerActivePokemon!.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(true);
  });
});

describe("Metronome legality", () => {
  const metronomeState = (opts: Parameters<typeof inPlay>[1] = {}) => {
    const clefairy = armedFor(inPlay("Clefairy", opts), "Metrónomo");
    const raichu = inPlay("Raichu", { energy: [Lightning, Lightning, Lightning, Lightning] });
    return { clefairy, raichu, state: makeState({ player: { active: clefairy }, opponent: { active: raichu } }) };
  };

  it("checks Clefairy's own Metronome (cost, status) and that the copied attack is the Defending Pokémon's", () => {
    const { raichu, state } = metronomeState();
    const thunder = raichu.pokemon.kind === "pokemon" ? raichu.pokemon.attacks[1] : undefined!;
    expect(canExecuteMetronome(state, thunder)).toBeNull();
    const notTheirs = { name: "Lanzallamas", cost: [], damage: 50 };
    expect(canExecuteMetronome(state, notTheirs)).toMatch(/Defensor/);
    expect(() => executeMetronome(state, notTheirs)).toThrow(IllegalActionError);

    const paralyzed = metronomeState({ statuses: [StatusCondition.Paralyzed] });
    expect(canExecuteMetronome(paralyzed.state, thunder)).toMatch(/paralizado/);
    const unpaid = { ...state, playerActivePokemon: { ...state.playerActivePokemon!, attachedEnergy: [] } };
    expect(canExecuteMetronome(unpaid, thunder)).toMatch(/energía/);
  });

  it("a confused Clefairy flips for confusion first (resolveConfusionFlip covers Metronome): tails, the attack fails", () => {
    const { state } = metronomeState({ statuses: [StatusCondition.Confused] });
    const { state: after, canAttack } = resolveConfusionFlip(state, false, true);
    expect(canAttack).toBe(false);
    expect(after.playerActivePokemon!.currentDamage).toBe(20);
    expect(after.attackedThisTurn).toBe(true);
  });
});

describe("Sand-attack / Smokescreen is engine-owned", () => {
  const sandState = () => {
    const machop = inPlay("Machop", { energy: [Fighting], mustFlipToAttack: true, mustFlipToAttackTurn: 2 });
    return { machop, state: makeState({ player: { active: machop }, opponent: { active: inPlay("Onix") } }) };
  };

  it("adds one coin, first in the list", () => {
    const { state } = sandState();
    expect(getAttackCoinFlipCount(state, 0)).toBe(1);
    expect(() => executeAttack(state, 0, { coinResults: [] })).toThrow(/coin/);
  });

  it("tails: the attack does nothing and the turn ends", () => {
    const { state } = sandState();
    const after = executeAttack(state, 0, { coinResults: ["tails"] });
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(false);
    expect(after.events.some((e) => e.message.includes("no hizo nada"))).toBe(true);
  });

  it("heads: the attack proceeds; the remaining coins go to the attack's own effects", () => {
    const { state } = sandState();
    expect(executeAttack(state, 0, { coinResults: ["heads"], skipEndTurn: true }).opponentActivePokemon!.currentDamage).toBeGreaterThan(0);

    const beedrill = armedFor(inPlay("Beedrill", { mustFlipToAttack: true, mustFlipToAttackTurn: 2 }), "Doble Ataque");
    const s = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Electabuzz") } });
    const index = attackIndex(beedrill, "Doble Ataque");
    expect(getAttackCoinFlipCount(s, index)).toBe(3);
    // first coin is Sand-attack (heads), then Twineedle 2 heads = 60 (Electabuzz has no Grass weakness)
    expect(executeAttack(s, index, { coinResults: ["heads", "heads", "heads"], skipEndTurn: true }).opponentActivePokemon!.currentDamage).toBe(60);
  });

  it("the AI uses the same coin (no separate AI-only rule)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const ai = inPlay("Machop", { energy: [Fighting], mustFlipToAttack: true, mustFlipToAttackTurn: 3 });
    const state = makeState({ turnNumber: 4, isPlayerTurn: false, opponent: { active: ai }, player: { active: inPlay("Onix") } });
    const after = executeAIAction(state, { type: "attack", attackIndex: 0 });
    expect(after.playerActivePokemon!.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(true);
    void Fire;
    void Psychic;
  });
});
