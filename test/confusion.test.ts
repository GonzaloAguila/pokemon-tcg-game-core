import { describe, it, expect, vi, afterEach } from "vitest";
import { CONFUSION_SELF_DAMAGE, resolveConfusionFlip, executeAttack } from "@/index";
import { executeAIAction } from "@/domain/ai/executor";
import { EnergyType, GamePhase, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, attackIndex, deepFreeze, names, energies } from "./helpers/state";

const { Confused } = StatusCondition;
const { Psychic, Fighting, Lightning } = EnergyType;

afterEach(() => vi.restoreAllMocks());

describe("Confusion (Base Set rule): tails on the attack flip -> 20 damage to itself", () => {
  it("exports the rule value for consumers", () => {
    expect(CONFUSION_SELF_DAMAGE).toBe(20);
  });

  it("a confused AI Machop that flips tails takes 20 damage, does not attack, and the turn passes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const machop = inPlay("Machop", { energy: [Fighting], statuses: [Confused] });
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: machop },
      player: { active: inPlay("Onix") },
    });

    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(machop, "Patada baja"), delay: 0 });

    expect(after.opponentActivePokemon?.currentDamage).toBe(20);
    expect(after.playerActivePokemon?.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(true);
    expect(after.turnNumber).toBe(5);
  });

  it("a confused AI Machop that flips heads attacks normally", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads
    const machop = inPlay("Machop", { energy: [Fighting], statuses: [Confused] });
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: machop },
      player: { active: inPlay("Onix") },
    });

    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(machop, "Patada baja"), delay: 0 });

    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
    expect(after.playerActivePokemon?.currentDamage).toBe(20);
    expect(after.isPlayerTurn).toBe(true);
  });

  it("a confused AI Pokémon knocked out by confusion: the human gets one prize, the AI promotes, the turn passes", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const abra = inPlay("Abra", { damage: 10, energy: [Psychic], statuses: [Confused] });
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: abra, bench: [inPlay("Machop")] },
      player: { active: inPlay("Onix") },
    });

    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(abra, "Psicochoque"), delay: 0 });

    expect(names(after.opponentDiscard)).toEqual(expect.arrayContaining(["Abra", "Psychic Energy"]));
    expect(after.playerPrizes).toHaveLength(5);
    expect(after.playerCanTakePrize).toBe(false);
    expect(after.opponentActivePokemon?.pokemon.name).toBe("Machop");
    expect(after.isPlayerTurn).toBe(true);
  });
});

describe("resolveConfusionFlip", () => {
  const confusedState = (activeOpts: Parameters<typeof inPlay>[1] = {}, extra: Parameters<typeof makeState>[0] = {}) =>
    makeState({
      player: { active: inPlay("Abra", { energy: [Psychic], statuses: [Confused], ...activeOpts }), bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Onix") },
      ...extra,
    });

  it("is a no-op when the active Pokémon is not Confused", () => {
    const state = makeState({ player: { active: inPlay("Abra") }, opponent: { active: inPlay("Onix") } });

    const result = resolveConfusionFlip(state, false);

    expect(result.canAttack).toBe(true);
    expect(result.state).toBe(state);
  });

  it("heads: the attack proceeds and only a coin event is added", () => {
    const state = deepFreeze(confusedState());

    const result = resolveConfusionFlip(state, true);

    expect(result.canAttack).toBe(true);
    expect(result.state.playerActivePokemon).toBe(state.playerActivePokemon);
    expect(result.state.isPlayerTurn).toBe(true);
    expect(result.state.turnNumber).toBe(state.turnNumber);
    expect(result.state.events.length).toBeGreaterThan(state.events.length);
    expect(result.state.events.some((e) => e.message.includes("[coin:heads]"))).toBe(true);
  });

  it("tails: 20 damage to itself without weakness (Psychic Abra is Psychic-weak) and the turn ends", () => {
    const state = deepFreeze(confusedState());

    const result = resolveConfusionFlip(state, false);

    expect(result.canAttack).toBe(false);
    expect(result.state.events.some((e) => e.message.includes("[coin:tails]"))).toBe(true);
    // turn passed: Abra is now on the non-acting side
    expect(result.state.isPlayerTurn).toBe(false);
    expect(result.state.turnNumber).toBe(state.turnNumber + 1);
    expect(result.state.playerActivePokemon?.currentDamage).toBe(20);
    expect(result.state.opponentActivePokemon?.currentDamage).toBe(0);
  });

  it("tails with skipEndTurn: damage applied, turn left to the caller", () => {
    const state = confusedState();

    const result = resolveConfusionFlip(state, false, true);

    expect(result.state.playerActivePokemon?.currentDamage).toBe(20);
    expect(result.state.isPlayerTurn).toBe(true);
    expect(result.state.turnNumber).toBe(state.turnNumber);
  });

  it("tails KO: discard with attached cards and evolutions, exactly one prize to the opponent, promotion required", () => {
    const kadabra = inPlay("Kadabra", { damage: 40, energy: [Psychic, Psychic], statuses: [Confused], evolvedFrom: ["Abra"] });
    const state = deepFreeze(
      makeState({
        player: { active: kadabra, bench: [inPlay("Machop")] },
        opponent: { active: inPlay("Onix") },
      }),
    );

    const result = resolveConfusionFlip(state, false);

    expect(result.canAttack).toBe(false);
    expect(result.state.playerActivePokemon).toBeNull();
    expect(names(result.state.playerDiscard)).toEqual(["Kadabra", "Psychic Energy", "Psychic Energy", "Abra"]);
    expect(result.state.opponentPrizes).toHaveLength(5);
    expect(result.state.opponentHand).toHaveLength(1);
    expect(result.state.opponentCanTakePrize).toBe(false);
    expect(result.state.playerNeedsToPromote).toBe(true);
    // Same as an attacker self-KO in executeAttack: the turn waits for the promotion
    expect(result.state.isPlayerTurn).toBe(true);
    expect(result.state.gameResult).toBeNull();
  });

  it("tails KO with an empty bench: defeat", () => {
    const state = makeState({
      player: { active: inPlay("Abra", { damage: 10, statuses: [Confused] }) },
      opponent: { active: inPlay("Onix") },
    });

    const result = resolveConfusionFlip(state, false);

    expect(result.state.gameResult).toBe("defeat");
    expect(result.state.gamePhase).toBe(GamePhase.GameOver);
    expect(result.state.playerNeedsToPromote).toBe(false);
  });

  it("tails KO that gives the opponent its last prize: defeat", () => {
    const state = makeState({
      player: { active: inPlay("Abra", { damage: 10, statuses: [Confused] }), bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Onix"), prizes: energies(Psychic) },
    });

    const result = resolveConfusionFlip(state, false);

    expect(result.state.opponentPrizes).toHaveLength(0);
    expect(result.state.gameResult).toBe("defeat");
    expect(result.state.gamePhase).toBe(GamePhase.GameOver);
  });
});

describe("attacker self-KO prize-out (shared KO path)", () => {
  it("Magneton's Selfdestruct giving the opponent its last prize ends the game", () => {
    const magneton = inPlay("Magneton", { energy: [Lightning, Lightning, Lightning, Lightning] });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), prizes: energies(Psychic) },
    });

    const after = executeAttack(state, attackIndex(magneton, "Autodestrucción"));

    expect(after.opponentPrizes).toHaveLength(0);
    expect(after.gameResult).toBe("defeat");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
  });
});
