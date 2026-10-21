/**
 * Between turns and win conditions: Poison / Toxic Knock Outs at the checkup (Prizes, promotion,
 * last Prize, last Pokémon, both Actives at once), Kabuto Armor and Transform against Poison,
 * deck-out on the draw, simultaneous Knock Outs during an attack (both sides promote before the
 * turn passes) and Here Comes Team Rocket! lasting for the rest of the game.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { endTurn, executeAttack, promoteActivePokemon, takePrize } from "@/lib/gameState";
import { getTurnActionBlocker } from "@/domain/board";
import { arePrizesRevealed } from "@/domain/powers";
import { playTrainerCard } from "@/domain/effects";
import { EnergyType, GamePhase, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, attackIndex, energy } from "./helpers/state";

const { Poisoned, Asleep } = StatusCondition;
const { Lightning } = EnergyType;
afterEach(() => vi.restoreAllMocks());
// 50 HP Machop, 30 HP Kabuto, 90 HP Chansey...
const poisonedMachop = (damage = 40, extra: Parameters<typeof inPlay>[1] = {}) => inPlay("Machop", { damage, statuses: [Poisoned], ...extra });

describe("Poison Knock Outs between turns", () => {
  it("the opponent's Active (not the side ending its turn): the player takes a Prize, the opponent promotes, then the turn passes", () => {
    const state = makeState({
      player: { active: inPlay("Abra") },
      opponent: { active: poisonedMachop(), bench: [inPlay("Rattata"), inPlay("Pikachu")] },
    });
    const paused = endTurn(state, true);
    expect(paused.isPlayerTurn).toBe(true);
    expect(paused.playerCanTakePrize).toBe(true);
    expect(paused.opponentNeedsToPromote).toBe(true);
    expect(paused.opponentDiscard.map((c) => c.name)).toEqual(["Machop"]);
    const promoted = promoteActivePokemon(paused, 1, false);
    const next = takePrize(promoted, 0, true);
    expect(next.isPlayerTurn).toBe(false);
    expect(next.playerPrizes).toHaveLength(5);
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Pikachu");
  });

  it("Toxic (20) Knocks Out a Pokémon with 20 HP left; 10 HP more wouldn't with normal Poison", () => {
    const toxic = makeState({ player: { active: inPlay("Machop", { damage: 30, statuses: [Poisoned], poisonDamage: 20 }), bench: [inPlay("Abra")] }, opponent: { active: inPlay("Chansey") } });
    expect(endTurn(toxic).playerActivePokemon).toBeNull();
    const normal = makeState({ player: { active: poisonedMachop(30), bench: [inPlay("Abra")] }, opponent: { active: inPlay("Chansey") } });
    expect(endTurn(normal).playerActivePokemon!.currentDamage).toBe(40);
  });

  it("the opponent's Poison Knock Out gives the player its last Prize: taken automatically, victory", () => {
    const state = makeState({
      player: { active: inPlay("Abra"), prizes: [gameCard("Bill", "base")] },
      opponent: { active: poisonedMachop(), bench: [inPlay("Rattata")] },
    });
    const won = endTurn(state);
    expect(won.playerPrizes).toHaveLength(0);
    expect(won.gameResult).toBe("victory");
    expect(won.gamePhase).toBe(GamePhase.GameOver);
  });

  it("the player's own Poison Knock Out gives the opponent its last Prize: taken automatically, defeat", () => {
    const state = makeState({
      player: { active: poisonedMachop(), bench: [inPlay("Abra")] },
      opponent: { active: inPlay("Chansey"), prizes: [gameCard("Bill", "base")] },
    });
    const lost = endTurn(state);
    expect(lost.opponentPrizes).toHaveLength(0);
    expect(lost.opponentCanTakePrize).toBe(false);
    expect(lost.playerNeedsToPromote).toBe(false);
    expect(lost.gameResult).toBe("defeat");
  });

  it("a Poison Knock Out of a side's last Pokémon ends the game at once", () => {
    const own = makeState({ player: { active: poisonedMachop() }, opponent: { active: inPlay("Chansey") } });
    expect(endTurn(own).gameResult).toBe("defeat");
    const theirs = makeState({ player: { active: inPlay("Chansey") }, opponent: { active: poisonedMachop() } });
    expect(endTurn(theirs).gameResult).toBe("victory");
  });

  it("both Actives Knocked Out by Poison, both with a Bench: two Prizes, two promotions, one checkup", () => {
    const state = makeState({
      player: { active: poisonedMachop(), bench: [inPlay("Abra")] },
      opponent: { active: poisonedMachop(), bench: [inPlay("Rattata")] },
    });
    const paused = endTurn(state, true);
    expect([paused.playerCanTakePrize, paused.opponentCanTakePrize]).toEqual([true, true]);
    expect([paused.playerNeedsToPromote, paused.opponentNeedsToPromote]).toEqual([true, true]);
    expect(getTurnActionBlocker(paused)).not.toBeNull();
    let next = takePrize(paused, 0, true);
    next = takePrize(next, 0, false);
    next = promoteActivePokemon(next, 0, true);
    next = promoteActivePokemon(next, 0, false);
    expect(next.isPlayerTurn).toBe(true);
    const passed = endTurn(next);
    expect(passed.isPlayerTurn).toBe(false);
    expect([passed.playerPrizes.length, passed.opponentPrizes.length]).toEqual([5, 5]);
    expect([passed.playerActivePokemon!.currentDamage, passed.opponentActivePokemon!.currentDamage]).toEqual([0, 0]);
  });

  it("both Actives Knocked Out by Poison: the side that still has a Bench wins", () => {
    const playerHasBench = makeState({ player: { active: poisonedMachop(), bench: [inPlay("Abra")] }, opponent: { active: poisonedMachop() } });
    expect(endTurn(playerHasBench).gameResult).toBe("victory");
    const opponentHasBench = makeState({ player: { active: poisonedMachop() }, opponent: { active: poisonedMachop(), bench: [inPlay("Rattata")] } });
    expect(endTurn(opponentHasBench).gameResult).toBe("defeat");
  });

  it.skip("BUG (known, not modelled): both Actives Knocked Out by Poison and neither side has a Bench → Sudden Death / tie, not a defeat for the side ending its turn", () => {
    const state = makeState({ player: { active: poisonedMachop() }, opponent: { active: poisonedMachop() } });
    expect(endTurn(state).gameResult).not.toBe("defeat");
  });

  it("Kabuto Armor doesn't halve Poison (not attack damage): a 30 HP Kabuto with 20 damage is Knocked Out", () => {
    const kabuto = inPlay("Kabuto", { set: "fossil", damage: 20, statuses: [Poisoned], evolvedFrom: ["Mysterious Fossil"] });
    const state = makeState({ player: { active: kabuto, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Chansey") } });
    const paused = endTurn(state);
    expect(paused.playerActivePokemon).toBeNull();
    expect(paused.opponentCanTakePrize).toBe(true);
    // The Fossil under Kabuto goes to the discard pile as the Trainer card
    expect(paused.playerDiscard.map((c) => [c.name, c.kind])).toEqual([["Kabuto", "pokemon"], ["Mysterious Fossil", "trainer"]]);
  });

  it("a Poisoned Ditto copying Chansey uses the copy's 120 HP; Asleep (tails: stays Asleep) it is a 50 HP Ditto", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const ditto = (statuses: StatusCondition[]) => inPlay("Ditto", { set: "fossil", damage: 40, statuses });
    const copy = makeState({ player: { active: ditto([Poisoned]), bench: [inPlay("Abra")] }, opponent: { active: inPlay("Chansey") } });
    expect(endTurn(copy).playerActivePokemon!.currentDamage).toBe(50);
    const plain = makeState({ player: { active: ditto([Poisoned, Asleep]), bench: [inPlay("Abra")] }, opponent: { active: inPlay("Chansey") } });
    expect(endTurn(plain).playerActivePokemon).toBeNull();
  });
});

describe("deck-out on the draw", () => {
  it("the player whose turn starts can't draw: that player loses", () => {
    const theirs = makeState({ player: { active: inPlay("Abra") }, opponent: { active: inPlay("Chansey"), deck: [] } });
    expect(endTurn(theirs).gameResult).toBe("victory");
    const mine = makeState({ isPlayerTurn: false, player: { active: inPlay("Abra"), deck: [] }, opponent: { active: inPlay("Chansey") } });
    expect(endTurn(mine).gameResult).toBe("defeat");
  });

  it("after a checkup Knock Out pause, the turn passes with the Prize and the empty deck still loses", () => {
    const state = makeState({
      player: { active: inPlay("Abra") },
      opponent: { active: poisonedMachop(), bench: [inPlay("Rattata")], deck: [] },
    });
    const paused = endTurn(state);
    expect(paused.gameResult).toBeNull();
    const next = takePrize(paused, 0, true);
    expect(next.gameResult).toBe("victory");
  });
});

describe("simultaneous Knock Outs during an attack", () => {
  it("Magneton's Selfdestruct Knocks Out both Actives: both sides promote before the turn can pass", () => {
    const magneton = inPlay("Magneton", { energy: [Lightning, Lightning, Lightning, Lightning] });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Rattata"), bench: [inPlay("Abra", { damage: 20 }), inPlay("Pikachu")] },
    });
    const after = executeAttack(state, attackIndex(magneton, "Autodestrucción"), { coinResults: [], skipEndTurn: true, skipDefenderPromotion: true });
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.playerNeedsToPromote).toBe(true);
    expect(after.opponentNeedsToPromote).toBe(true);
    // Abra (30 HP, 20 damage) was Knocked Out on the Bench by the 10 bench damage
    expect(after.opponentBench.map((p) => p.pokemon.name)).toEqual(["Pikachu"]);
    // Rattata + Abra owed to the player, Magneton to the opponent: every Prize first
    let next = takePrize(takePrize(after, 0, true, false), 0, true, false);
    expect(endTurn(next).isPlayerTurn).toBe(true);
    next = takePrize(next, 0, false, false);
    expect(endTurn(next).isPlayerTurn).toBe(true);
    next = promoteActivePokemon(next, 0, true);
    expect(endTurn(next).isPlayerTurn).toBe(true);
    next = promoteActivePokemon(next, 0, false);
    const passed = endTurn(next);
    expect(passed.isPlayerTurn).toBe(false);
    expect(passed.playerActivePokemon!.pokemon.name).toBe("Machop");
    expect(passed.opponentActivePokemon!.pokemon.name).toBe("Pikachu");
    // Rattata + Abra for the player, Magneton for the opponent
    expect([passed.playerPrizes.length, passed.opponentPrizes.length]).toEqual([4, 5]);
  });
});

describe("Here Comes Team Rocket!", () => {
  it("Prizes stay face up for both players for the rest of the game (several turns later, either view)", () => {
    const hctr = gameCard("Here Comes Team Rocket!", "rocket");
    const state = makeState({ player: { active: inPlay("Abra"), hand: [hctr] }, opponent: { active: inPlay("Chansey") } });
    let next = playTrainerCard(state, hctr.id, []);
    for (let i = 0; i < 4; i++) next = endTurn(next);
    expect(next.turnNumber).toBe(state.turnNumber + 4);
    expect(arePrizesRevealed(next, "player")).toBe(true);
    expect(arePrizesRevealed(next, "opponent")).toBe(true);
    expect(arePrizesRevealed(state, "player")).toBe(false);
  });

  it("is played even with Prizes already face up, and a Knock Out Prize is still taken by position", () => {
    const hctr = gameCard("Here Comes Team Rocket!", "rocket");
    const prizes = [gameCard("Bill", "base"), energy(Lightning)];
    const state = makeState({ prizesFaceUp: true, player: { active: inPlay("Abra"), hand: [hctr], prizes }, opponent: { active: poisonedMachop(), bench: [inPlay("Rattata")] } });
    const played = playTrainerCard(state, hctr.id, []);
    expect(played.prizesFaceUp).toBe(true);
    const paused = endTurn(played);
    const next = takePrize(paused, 1, true);
    expect(next.playerHand[0].name).toBe("Lightning Energy");
  });
});
