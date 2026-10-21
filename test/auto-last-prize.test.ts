import { prizesOwed } from "@/lib/gameState";
/**
 * The last Prize is taken automatically (owner decision, 0.10.1): a Knock Out that leaves a side
 * owing a Prize when it has exactly ONE Prize card left takes it and ends the game at once
 * (GAME_OVER + result), whatever caused it (attack, between-turns checkup, Buzzap, a bench Knock
 * Out plus the Active's). With 2+ Prizes left the pick stays manual (`playerCanTakePrize`).
 */
import { describe, expect, it } from "vitest";
import { endTurn, executeAttack } from "@/lib/gameState";
import { usePokemonPower } from "@/domain/effects";
import { executeAIAction } from "@/domain/ai/executor";
import { EnergyType, GamePhase, StatusCondition } from "@/domain/constants";
import { armedFor, attackIndex, energies, gameCard, inPlay, makeState } from "./helpers/state";

const { Lightning, Water } = EnergyType;
const { Poisoned } = StatusCondition;

const lastPrize = () => [gameCard("Bill", "base")];
// Machop's Patada baja does 20: a Rattata (30 HP) with 10 damage is Knocked Out
const machop = () => armedFor(inPlay("Machop"), "Patada baja");
const koSetup = (playerPrizes = lastPrize(), extra: Parameters<typeof makeState>[0] = {}) => {
  const attacker = machop();
  const state = makeState({
    player: { active: attacker, bench: [inPlay("Abra")], prizes: playerPrizes },
    opponent: { active: inPlay("Rattata", { damage: 10 }), bench: [inPlay("Pidgey")] },
    ...extra,
  });
  return { state, index: attackIndex(attacker, "Patada baja") };
};

describe("the last Prize is taken automatically", () => {
  it("an attack Knocks Out the Defending Pokémon with 1 Prize left: taken, victory, nobody promotes", () => {
    const { state, index } = koSetup();
    const after = executeAttack(state, index);

    expect(after.gameResult).toBe("victory");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
    expect(after.playerPrizes).toHaveLength(0);
    expect(after.playerHand.map((c) => c.id)).toContain(state.playerPrizes[0].id);
    expect(after.playerCanTakePrize).toBe(false);
    expect(after.opponentNeedsToPromote).toBe(false);
    // The game is over: the turn doesn't pass
    expect(after.isPlayerTurn).toBe(true);
    expect(after.events.map((e) => e.message)).toContain("¡Victoria! Has tomado todos tus premios");
  });

  it("the same with skipDefenderPromotion (multiplayer): no promotion left pending", () => {
    const { state, index } = koSetup();
    const after = executeAttack(state, index, { skipDefenderPromotion: true });

    expect(after.gameResult).toBe("victory");
    expect(after.opponentNeedsToPromote).toBe(false);
    expect(after.opponentActivePokemon).toBeNull();
  });

  it("with 2 Prizes left the pick stays manual", () => {
    const { state, index } = koSetup(energies(Water, Water));
    const after = executeAttack(state, index);

    expect(after.gameResult).toBeNull();
    expect(after.playerCanTakePrize).toBe(true);
    expect(after.playerPrizes).toHaveLength(2);
  });

  it("a bench Knock Out takes the second-to-last Prize and the Active's Knock Out the last one: victory", () => {
    // Magneton's Selfdestruct: 80 to Pidgey (Knocked Out), 20 to each Benched Pokémon (Abra Knocked
    // Out), 80 to itself: the 2 Prizes owed are the attacker's last 2, taken at once (victory)
    const magneton = inPlay("Magneton", { energy: [Lightning, Lightning, Lightning, Lightning] });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")], prizes: energies(Water, Water) },
      opponent: { active: inPlay("Pidgey"), bench: [inPlay("Abra", { damage: 10 }), inPlay("Rattata")] },
    });
    const after = executeAttack(state, attackIndex(magneton, "Autodestrucción"));

    expect(after.gameResult).toBe("victory");
    expect(after.playerPrizes).toHaveLength(0);
    // The game is over: the Prize owed to the opponent for Magneton is dropped
    expect(prizesOwed(after, "opponent")).toBe(0);
    expect(after.opponentPrizes).toHaveLength(6);
    expect(after.playerCanTakePrize).toBe(false);
  });

  it("the Active's Knock Out ends the game before a chosen bench damage (Spark): nothing left to answer", () => {
    const pikachu = inPlay("Pikachu", { set: "jungle", energy: [Lightning, Lightning] });
    const state = makeState({
      player: { active: pikachu, prizes: lastPrize() },
      opponent: { active: inPlay("Abra", { damage: 20 }), bench: [inPlay("Abra"), inPlay("Machop")] },
    });
    const after = executeAttack(state, attackIndex(pikachu, "Spark"));

    expect(after.gameResult).toBe("victory");
    expect(after.pendingBenchDamageSelection).toBeUndefined();
    expect(after.opponentNeedsToPromote).toBe(false);
  });

  it("simultaneous last Prizes (the attacker Knocks itself Out too): the player whose turn it is wins (Sudden Death not modelled)", () => {
    const magneton = inPlay("Magneton", { energy: [Lightning, Lightning, Lightning, Lightning] });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")], prizes: lastPrize() },
      opponent: { active: inPlay("Pidgey"), bench: [inPlay("Rattata")], prizes: lastPrize() },
    });
    const after = executeAttack(state, attackIndex(magneton, "Autodestrucción"));

    expect(after.gameResult).toBe("victory");
    expect(after.playerPrizes).toHaveLength(0);
    expect(after.opponentPrizes).toHaveLength(1);
  });

  it("a Poison Knock Out between turns gives the player its last Prize: victory at endTurn", () => {
    const state = makeState({
      player: { active: inPlay("Abra"), prizes: lastPrize() },
      opponent: { active: inPlay("Machop", { damage: 40, statuses: [Poisoned] }), bench: [inPlay("Rattata")] },
    });
    const after = endTurn(state);

    expect(after.gameResult).toBe("victory");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
    expect(after.playerPrizes).toHaveLength(0);
    expect(after.playerCanTakePrize).toBe(false);
  });

  it("the player's own Poison Knock Out gives the opponent its last Prize: defeat at endTurn", () => {
    const state = makeState({
      player: { active: inPlay("Machop", { damage: 40, statuses: [Poisoned] }), bench: [inPlay("Abra")] },
      opponent: { active: inPlay("Rattata"), prizes: lastPrize() },
    });
    const after = endTurn(state);

    expect(after.gameResult).toBe("defeat");
    expect(after.opponentPrizes).toHaveLength(0);
    expect(after.opponentCanTakePrize).toBe(false);
    expect(after.playerNeedsToPromote).toBe(false);
    expect(after.events.map((e) => e.message)).toContain("¡Derrota! El rival tomó todos sus premios");
  });

  it("both Actives Knocked Out by Poison with 1 Prize each: the player side is settled first (victory)", () => {
    const state = makeState({
      player: { active: inPlay("Machop", { damage: 40, statuses: [Poisoned] }), bench: [inPlay("Abra")], prizes: lastPrize() },
      opponent: { active: inPlay("Machop", { damage: 40, statuses: [Poisoned] }), bench: [inPlay("Rattata")], prizes: lastPrize() },
    });
    const after = endTurn(state);

    expect(after.gameResult).toBe("victory");
    expect(after.playerPrizes).toHaveLength(0);
    expect(after.opponentPrizes).toHaveLength(1);
  });

  it("Buzzap gives the opponent its last Prize: defeat", () => {
    const electrode = inPlay("Electrode", { evolvedFrom: ["Voltorb"] });
    const pikachu = inPlay("Pikachu", { set: "base" });
    const state = makeState({ player: { active: pikachu, bench: [electrode] }, opponent: { active: inPlay("Rattata"), prizes: lastPrize() } });
    const after = usePokemonPower(state, electrode.pokemon.id, [[Lightning], [pikachu.pokemon.id]]);

    expect(after.gameResult).toBe("defeat");
    expect(after.opponentPrizes).toHaveLength(0);
    expect(after.opponentCanTakePrize).toBe(false);
  });

  it("the AI's attack takes its own last Prize: defeat for the human, log in the human's words", () => {
    const aiMachop = machop();
    const state = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Rattata", { damage: 10 }), bench: [inPlay("Pidgey")] },
      opponent: { active: aiMachop, bench: [inPlay("Abra")], prizes: lastPrize() },
    });
    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(aiMachop, "Patada baja") });

    expect(after.gameResult).toBe("defeat");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
    expect(after.opponentPrizes).toHaveLength(0);
    expect(after.opponentCanTakePrize).toBe(false);
    expect(after.playerNeedsToPromote).toBe(false);
    const log = after.events.map((e) => e.message);
    expect(log).toContain("El rival tomó un premio");
    expect(log).toContain("¡Derrota! El rival tomó todos sus premios");
    expect(log).not.toContain("Tomaste un premio");
    expect(log).not.toContain("¡Victoria! Has tomado todos tus premios");
  });
});
