/**
 * The attack resolution process (CLAUDE.md "Attack resolution"): every Knock Out is found by ONE
 * check of all the Pokémon in play once the attack's damage and after-effects are done, and each
 * player is owed one Prize per opposing Pokémon Knocked Out — a COUNT (`playerPrizesOwed` /
 * `opponentPrizesOwed`, `playerCanTakePrize` = owed > 0) the owed player picks one by one with
 * takePrize. Prizes are only taken automatically when the owed count covers every Prize left (the
 * game is won). Player reports (0.10.2): "maté a 3 con el ataque que hace daño a la banca y no me
 * dejó robar premio" / "maté a 2 y solo me dejó levantar un premio" — Benched Knock Outs took
 * their Prizes silently from the top and the Active's gave a single pick.
 */
import { describe, it, expect } from "vitest";
import { endTurn, executeAttack, takePrize, prizesOwed, checkKnockouts } from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { usePokemonPower } from "@/domain/effects";
import { swapSides } from "@/domain/board";
import { EnergyType, GamePhase, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, energies, armedFor, attackIndex, names, deepFreeze, type SetName } from "./helpers/state";

const { Water } = EnergyType;

function attack(state: GameState, name = "Autodestrucción", extra: Record<string, unknown> = {}): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(deepFreeze(armed), attackIndex(armed.playerActivePokemon!, name), { coinResults: [], ...extra });
}
const benchNames = (bench: PokemonInPlay[]) => names(bench.map((p) => p.pokemon));
/** 10 HP left: any bench damage Knocks it Out. */
const weak = (name: string, set?: SetName) => {
  const p = inPlay(name, set ? { set } : {});
  return { ...p, currentDamage: (p.pokemon.kind === "pokemon" ? p.pokemon.hp : 0) - 10 };
};
const magneton = () => inPlay("Magneton", { set: "base" }); // Selfdestruct 80, 20 to each Benched Pokémon, 80 to itself (60 HP)
const takeAll = (state: GameState, side: "player" | "opponent") => {
  let next = state;
  while (prizesOwed(next, side) > 0) next = takePrize(next, 0, side === "player", false);
  return next;
};

describe("Base Set Magneton's Selfdestruct (the reported attack)", () => {
  it("Active + 2 Benched Knocked Out: 3 Prizes owed to the attacker, picked one by one; Magneton's Prize owed to the defender", () => {
    const state = makeState({
      player: { active: magneton(), bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [weak("Abra"), weak("Abra"), inPlay("Onix")] },
    });
    const after = attack(state, "Autodestrucción", { skipDefenderPromotion: true });
    expect(after.playerPrizes).toHaveLength(6); // nothing taken behind the player's back
    expect(prizesOwed(after, "player")).toBe(3);
    expect(after.playerCanTakePrize).toBe(true);
    expect(prizesOwed(after, "opponent")).toBe(1);
    expect(after.opponentCanTakePrize).toBe(true);
    expect(after.opponentPrizes).toHaveLength(6);
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentActivePokemon).toBeNull();
    expect(benchNames(after.opponentBench)).toEqual(["Onix"]);
    expect(after.playerNeedsToPromote).toBe(true);
    expect(after.opponentNeedsToPromote).toBe(true);
    expect(after.gameResult).toBeNull();

    const one = takePrize(after, 2, true, false);
    expect(one.playerPrizes).toHaveLength(5);
    expect(prizesOwed(one, "player")).toBe(2);
    expect(one.playerCanTakePrize).toBe(true);
    const all = takeAll(one, "player");
    expect(all.playerPrizes).toHaveLength(3);
    expect(all.playerCanTakePrize).toBe(false);
    const both = takeAll(all, "opponent");
    expect(both.opponentPrizes).toHaveLength(5);
    expect(both.opponentCanTakePrize).toBe(false);
  });

  it("3 Benched Knocked Out (the Defending Pokémon survives): 3 Prizes to pick, none taken automatically", () => {
    const state = makeState({
      player: { active: magneton(), bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), bench: [weak("Abra"), weak("Abra"), weak("Abra"), inPlay("Onix")] },
    });
    const after = attack(state);
    expect(after.playerPrizes).toHaveLength(6);
    expect(prizesOwed(after, "player")).toBe(3);
    expect(benchNames(after.opponentBench)).toEqual(["Onix"]);
    expect(after.opponentActivePokemon?.pokemon.name).toBe("Chansey");
  });

  it("Knock Outs covering every Prize left: taken automatically, the game is won", () => {
    const state = makeState({
      player: { active: magneton(), bench: [inPlay("Machop")], prizes: energies(Water, Water) },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [weak("Abra"), weak("Abra"), inPlay("Onix")] },
    });
    const after = attack(state, "Autodestrucción", { skipDefenderPromotion: true });
    expect(after.playerPrizes).toHaveLength(0);
    expect(after.gameResult).toBe("victory");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
    expect(after.playerCanTakePrize).toBe(false);
    expect(after.opponentCanTakePrize).toBe(false);
  });

  it("Magneton's own Knock Out gives the defender its last Prize (the attacker isn't prized out): defeat", () => {
    const state = makeState({
      player: { active: magneton(), bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), bench: [inPlay("Onix")], prizes: energies(Water) },
    });
    const after = attack(state);
    expect(after.gameResult).toBe("defeat");
    expect(after.opponentPrizes).toHaveLength(0);
  });

  it("both players win at once (last Prizes on both sides): the player whose turn it is wins (Sudden Death not modelled)", () => {
    const state = makeState({
      player: { active: magneton(), bench: [inPlay("Machop")], prizes: energies(Water) },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [inPlay("Onix")], prizes: energies(Water) },
    });
    const after = attack(state, "Autodestrucción", { skipDefenderPromotion: true });
    expect(after.gameResult).toBe("victory");
    expect(after.playerPrizes).toHaveLength(0);
  });

  it("no Pokémon left on either side: the player whose turn it is wins (same rule)", () => {
    const state = makeState({
      player: { active: magneton() },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [weak("Abra")] },
    });
    expect(attack(state, "Autodestrucción", { skipDefenderPromotion: true }).gameResult).toBe("victory");
  });

  it("the attacker left with no Pokémon while the opponent still has some (no prize-out): defeat", () => {
    const state = makeState({
      player: { active: magneton() },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [weak("Abra"), inPlay("Onix")] },
    });
    const after = attack(state, "Autodestrucción", { skipDefenderPromotion: true });
    expect(after.gameResult).toBe("defeat");
  });
});

describe("taking owed Prizes", () => {
  it("after an attack the turn ends once the LAST owed Prize is taken (not after the first)", () => {
    const state = makeState({
      player: { active: inPlay("Magneton", { set: "fossil" }), bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), bench: [weak("Abra"), weak("Abra"), inPlay("Onix")] },
    });
    // Fossil Magneton: 100 to Chansey (120 HP) survives, 2 Benched Abra Knocked Out, Magneton (100 HP) Knocked Out by its 100
    const after = attack(state);
    expect(prizesOwed(after, "player")).toBe(2);
    const first = takePrize(takeAll(after, "opponent"), 0, true, true);
    expect(first.isPlayerTurn).toBe(true);
    expect(first.playerCanTakePrize).toBe(true);
  });

  it("a Prize owed in the middle of the turn (Curse) doesn't end the turn when taken", () => {
    const gengar = inPlay("Gengar", { set: "fossil" });
    const state = makeState({
      player: { active: inPlay("Machop"), bench: [gengar] },
      opponent: { active: inPlay("Onix", { damage: 10 }), bench: [weak("Abra")] },
    });
    const abraId = state.opponentBench[0].pokemon.id;
    const cursed = usePokemonPower(state, gengar.pokemon.id, [[state.opponentActivePokemon!.pokemon.id], [abraId]]);
    expect(prizesOwed(cursed, "player")).toBe(1);
    expect(cursed.playerPrizes).toHaveLength(6);
    const taken = takePrize(cursed, 0, true);
    expect(taken.playerPrizes).toHaveLength(5);
    expect(taken.isPlayerTurn).toBe(true);
    expect(taken.turnNumber).toBe(state.turnNumber);
  });

  it("the between-turns checkup Knock Out owes a Prize (count 1), like before", () => {
    const poisoned = { ...inPlay("Abra", { damage: 20 }), statusConditions: [StatusCondition.Poisoned] };
    const state = makeState({ player: { active: inPlay("Machop") }, opponent: { active: poisoned, bench: [inPlay("Onix")] } });
    const after = endTurn(state);
    expect(prizesOwed(after, "player")).toBe(1);
  });

  it("owed counts are swapped with the sides; states that only set the old flag count as 1", () => {
    const state = { ...makeState(), playerPrizesOwed: 3, playerCanTakePrize: true };
    const swapped = swapSides(state);
    expect(prizesOwed(swapped, "opponent")).toBe(3);
    expect(prizesOwed(swapped, "player")).toBe(0);
    expect(prizesOwed({ ...makeState(), opponentCanTakePrize: true }, "opponent")).toBe(1);
  });

  it("an owed count never exceeds the Prizes left", () => {
    const state = makeState({ player: { active: inPlay("Machop"), prizes: energies(Water, Water, Water) }, opponent: { active: inPlay("Onix"), bench: [weak("Abra"), weak("Abra")] } });
    const hit: GameState = { ...state, opponentBench: state.opponentBench.map((p) => ({ ...p, currentDamage: 999 })) };
    const swept = checkKnockouts(hit);
    expect(prizesOwed(swept, "player")).toBe(2);
    expect(swept.playerPrizes).toHaveLength(3);
  });
});
