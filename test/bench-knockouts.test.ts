import { prizesOwed } from "@/lib/gameState";
import { describe, it, expect } from "vitest";
import { executeAttack, executeBenchDamage } from "@/lib/gameState";
import { EnergyType, GamePhase } from "@/domain/constants";
import { makeState, inPlay, attackIndex, names, energies } from "./helpers/state";

const { Fighting, Lightning, Psychic } = EnergyType;

describe("bench knockouts (classic rule: check KOs after every damage source)", () => {
  it("Dugtrio's Earthquake knocks out its own damaged benched Abra and the opponent takes a prize", () => {
    const dugtrio = inPlay("Dugtrio", { energy: [Fighting, Fighting, Fighting, Fighting] });
    const abra = inPlay("Abra", { damage: 20, energy: [Psychic] });
    const machop = inPlay("Machop");
    const state = makeState({
      player: { active: dugtrio, bench: [abra, machop] },
      opponent: { active: inPlay("Onix") },
    });

    const after = executeAttack(state, attackIndex(dugtrio, "Terremoto"));

    expect(names(after.playerBench.map((p) => p.pokemon))).toEqual(["Machop"]);
    expect(after.playerBench[0].currentDamage).toBe(10);
    expect(names(after.playerDiscard)).toEqual(expect.arrayContaining(["Abra", "Psychic Energy"]));
    // Owed, picked by the opponent (never taken behind its back)
    expect(prizesOwed(after, "opponent")).toBe(1);
    expect(after.opponentPrizes).toHaveLength(6);
  });

  it("Pikachu's Spark (selected bench target) knocks out a damaged Magneton with its evolution and energy", () => {
    const pikachu = inPlay("Pikachu", { set: "jungle", energy: [Lightning, Lightning] });
    const magneton = inPlay("Magneton", { damage: 50, energy: [Lightning], evolvedFrom: ["Magnemite"] });
    const state = makeState({
      player: { active: pikachu },
      opponent: { active: inPlay("Onix"), bench: [magneton, inPlay("Abra")] },
    });

    const pending = executeAttack(state, attackIndex(pikachu, "Spark"));
    expect(pending.pendingBenchDamageSelection).toBeDefined();

    const after = executeBenchDamage(pending, [magneton.pokemon.id]);

    expect(names(after.opponentBench.map((p) => p.pokemon))).toEqual(["Abra"]);
    expect(names(after.opponentDiscard)).toEqual(
      expect.arrayContaining(["Magneton", "Magnemite", "Lightning Energy"]),
    );
    expect(prizesOwed(after, "player")).toBe(1);
    expect(after.playerPrizes).toHaveLength(6);
  });

  it("Magneton's Selfdestruct sweeps KOs on both benches", () => {
    const magneton = inPlay("Magneton", { energy: [Lightning, Lightning, Lightning, Lightning] });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Abra", { damage: 10 }), inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), bench: [inPlay("Pidgey", { damage: 20 }), inPlay("Rattata")] },
    });

    const after = executeAttack(state, attackIndex(magneton, "Autodestrucción"));

    // Opponent side: Pidgey (40 HP, 20 + 20) is out, Rattata survives with 20
    expect(names(after.opponentBench.map((p) => p.pokemon))).toEqual(["Rattata"]);
    expect(after.opponentBench[0].currentDamage).toBe(20);
    expect(names(after.opponentDiscard)).toContain("Pidgey");
    expect(prizesOwed(after, "player")).toBe(1);

    // Own side: Abra (30 HP, 10 + 20) is out, Machop survives; Magneton knocked itself out
    expect(names(after.playerBench.map((p) => p.pokemon))).toEqual(["Machop"]);
    expect(names(after.playerDiscard)).toEqual(expect.arrayContaining(["Abra", "Magneton"]));
    expect(after.playerActivePokemon).toBeNull();
    expect(after.playerNeedsToPromote).toBe(true);
    // One prize for Magneton (already taken automatically) + one for Abra
    expect(prizesOwed(after, "opponent")).toBe(2);
  });

  it("a bench KO resolves before the defender is replaced, so a KO'd benched Pokémon is never promoted", () => {
    const magneton = inPlay("Magneton", { energy: [Lightning, Lightning, Lightning, Lightning] });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Pidgey"), bench: [inPlay("Abra", { damage: 10 }), inPlay("Rattata")] },
    });

    const after = executeAttack(state, attackIndex(magneton, "Autodestrucción"));

    expect(after.opponentActivePokemon?.pokemon.name).toBe("Rattata");
    expect(after.opponentActivePokemon?.currentDamage).toBe(20);
    expect(after.opponentBench).toHaveLength(0);
    expect(names(after.opponentDiscard)).toEqual(expect.arrayContaining(["Pidgey", "Abra"]));
    // Pidgey (Active) + Abra (Bench): 2 Prizes owed, picked one by one
    expect(after.playerCanTakePrize).toBe(true);
    expect(prizesOwed(after, "player")).toBe(2);
  });

  it("taking the last prize from a bench KO wins the game", () => {
    const pikachu = inPlay("Pikachu", { set: "jungle", energy: [Lightning, Lightning] });
    const abra = inPlay("Abra", { damage: 20 });
    const state = makeState({
      player: { active: pikachu, prizes: energies(Psychic) },
      opponent: { active: inPlay("Onix"), bench: [abra, inPlay("Machop")] },
    });

    const pending = executeAttack(state, attackIndex(pikachu, "Spark"));
    const after = executeBenchDamage(pending, [abra.pokemon.id]);

    expect(after.playerPrizes).toHaveLength(0);
    expect(after.gameResult).toBe("victory");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
    // The turn does not pass once the game is over
    expect(after.isPlayerTurn).toBe(true);
  });
});

describe("bench damage that knocks out the last Pokémon of a side ends the game", () => {
  it("Spark KOs the Active, then the chosen bench target was the opponent's last Pokémon: victory", () => {
    const growlithe = inPlay("Growlithe", { damage: 50 }); // 60 HP
    const state = makeState({
      player: { active: inPlay("Pikachu", { set: "base" }) },
      opponent: { active: null, bench: [growlithe] },
      opponentNeedsToPromote: true,
      playerCanTakePrize: true,
      pendingBenchDamageSelection: { damageAmount: 10, targetSide: "opponent", maxTargets: 1, minTargets: 1 },
    });

    const after = executeBenchDamage(state, [growlithe.pokemon.id]);

    expect(after.opponentBench).toHaveLength(0);
    expect(after.gameResult).toBe("victory");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
    expect(after.opponentNeedsToPromote).toBe(false);
  });
});

describe("an attack that Knocks Out the Defending Pokémon and then damages a chosen benched one", () => {
  const setup = () => {
    const pikachu = inPlay("Pikachu", { set: "jungle", energy: [Lightning, Lightning] });
    const abra = inPlay("Abra");
    const machop = inPlay("Machop");
    const state = makeState({
      player: { active: pikachu },
      opponent: { active: inPlay("Abra", { damage: 20 }), bench: [abra, machop] },
    });
    return { state, pikachu, abra, machop };
  };

  it("promotes the replacement after the bench damage, so every benched Pokémon can be chosen", () => {
    const { state, pikachu, abra, machop } = setup();
    const pending = executeAttack(state, attackIndex(pikachu, "Spark"));
    expect(pending.opponentActivePokemon).toBeNull();
    expect(pending.opponentBench.map((p) => p.pokemon.id)).toEqual([abra.pokemon.id, machop.pokemon.id]);
    expect(pending.pendingBenchDamageSelection?.promoteDefenderAfter).toBe("auto");

    const after = executeBenchDamage(pending, [abra.pokemon.id]);
    const board = [after.opponentActivePokemon!, ...after.opponentBench];
    expect(after.opponentActivePokemon).not.toBeNull();
    expect(after.opponentBench).toHaveLength(1);
    expect(board.find((p) => p.pokemon.id === abra.pokemon.id)?.currentDamage).toBe(10);
    expect(after.pendingBenchDamageSelection).toBeUndefined();
  });

  it("asks the defender to promote only after the bench damage with skipDefenderPromotion", () => {
    const { state, pikachu, machop } = setup();
    const pending = executeAttack(state, attackIndex(pikachu, "Spark"), { skipDefenderPromotion: true });
    expect(pending.opponentNeedsToPromote).toBe(false);
    expect(pending.pendingBenchDamageSelection?.promoteDefenderAfter).toBe("choose");

    const after = executeBenchDamage(pending, [machop.pokemon.id]);
    expect(after.opponentNeedsToPromote).toBe(true);
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.opponentBench.find((p) => p.pokemon.id === machop.pokemon.id)?.currentDamage).toBe(10);
  });
});
