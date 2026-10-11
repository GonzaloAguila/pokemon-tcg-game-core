/**
 * Retreating and switching across sets: Sticky Goo (Dark Muk) + Retreat Aid (Dodrio) + Toxic
 * Gas (Muk), Sinkhole (Dark Dugtrio), paying with Double Colorless / Rainbow Energy, Asleep /
 * Paralyzed / Acid (can't retreat, but Switch works), and Trainers played as Basics (can't
 * retreat, but can be switched or gusted).
 */
import { describe, it, expect } from "vitest";
import {
  applyForceSwitch,
  applyStatusCondition,
  executeAttack,
  executeRetreat,
  getRetreatCoinFlips,
  getRetreatCost,
} from "@/lib/gameState";
import type { GameState } from "@/lib/gameState";
import { canPlayTrainerCard, playTrainerCard } from "@/domain/effects";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, deepFreeze } from "./helpers/state";

const { Fighting, Colorless, Grass } = EnergyType;
const { Paralyzed, Asleep, Confused, Poisoned } = StatusCondition;
const H = "heads" as const;
const T = "tails" as const;
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const dodrio = () => inPlay("Dodrio", { set: "jungle" });
const ids = (state: GameState) => state.playerActivePokemon!.attachedEnergy.map((e) => e.id);

describe("Sticky Goo + Retreat Aid + Toxic Gas", () => {
  it("Machop (1) with Dodrio on the Bench facing Dark Muk: max(0, 1 − 1) + 2 = 2, paid with one Double Colorless Energy", () => {
    const machop = inPlay("Machop", { energy: [Colorless] });
    const state = makeState({ player: { active: machop, bench: [dodrio()] }, opponent: { active: rocket("Dark Muk") } });
    expect(getRetreatCost(machop, state.playerBench, state)).toBe(2);
    const next = executeRetreat(state, ids(state), 0, { coinResults: [] });
    expect(next.playerActivePokemon!.pokemon.name).toBe("Dodrio");
    expect(next.playerDiscard.map((c) => c.name)).toEqual(["Double Colorless Energy"]);
  });

  it("two Dodrio stack: Machamp (3) facing Dark Muk pays max(0, 3 − 2) + 2 = 3 (Rainbow + Fighting + Fighting)", () => {
    const rainbow = gameCard("Rainbow Energy", "rocket");
    const machamp = { ...inPlay("Machamp", { energy: [Fighting, Fighting] }), attachedEnergy: [rainbow, energy(Fighting), energy(Fighting)] };
    const state = makeState({ player: { active: machamp, bench: [dodrio(), dodrio()] }, opponent: { active: rocket("Dark Muk") } });
    expect(getRetreatCost(machamp, state.playerBench, state)).toBe(3);
    const short = executeRetreat(state, [rainbow.id, machamp.attachedEnergy[1].id], 0, { coinResults: [] });
    expect(short.playerActivePokemon!.pokemon.name).toBe("Machamp");
    const paid = executeRetreat(state, ids(state), 0, { coinResults: [] });
    expect(paid.playerActivePokemon!.pokemon.name).toBe("Dodrio");
  });

  it("Muk's Toxic Gas (either side) turns both off: Machop pays its printed 1", () => {
    const machop = inPlay("Machop", { energy: [Fighting] });
    const state = makeState({
      player: { active: machop, bench: [dodrio(), inPlay("Muk", { set: "fossil" })] },
      opponent: { active: rocket("Dark Muk") },
    });
    expect(getRetreatCost(machop, state.playerBench, state)).toBe(1);
  });

  it("a Confused Dark Muk doesn't add anything; a Poisoned one still does", () => {
    const machop = inPlay("Machop", { energy: [Fighting] });
    const facing = (statuses: StatusCondition[]) =>
      makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: rocket("Dark Muk", { statuses }) } });
    expect(getRetreatCost(machop, [], facing([Confused]))).toBe(1);
    expect(getRetreatCost(machop, [], facing([Poisoned]))).toBe(3);
  });
});

describe("Sinkhole (Dark Dugtrio) with other retreat effects", () => {
  it("Dark Muk Active + Dark Dugtrio Benched: pay 2 more, then flip; tails = 20 to the Pokémon that retreated", () => {
    const machop = inPlay("Machop", { energy: [Fighting, Fighting, Fighting] });
    const state = deepFreeze(makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: rocket("Dark Muk"), bench: [rocket("Dark Dugtrio")] } }));
    expect(getRetreatCoinFlips(state)).toBe(1);
    const next = executeRetreat(state, ids(state), 0, { coinResults: [T] });
    expect(next.playerBench[0].pokemon.name).toBe("Machop");
    expect(next.playerBench[0].currentDamage).toBe(20);
    expect(next.playerBench[0].attachedEnergy).toHaveLength(0);
  });

  it("two Dark Dugtrio: two coins, 20 for each tails", () => {
    const machop = inPlay("Machop", { energy: [Fighting] });
    const state = makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: rocket("Dark Dugtrio"), bench: [rocket("Dark Dugtrio")] } });
    expect(getRetreatCoinFlips(state)).toBe(2);
    expect(executeRetreat(state, ids(state), 0, { coinResults: [T, T] }).playerBench[0].currentDamage).toBe(40);
    expect(executeRetreat(state, ids(state), 0, { coinResults: [H, T] }).playerBench[0].currentDamage).toBe(20);
  });

  it("Switch is not a retreat: no Sinkhole coin, and the turn's retreat is still available", () => {
    const sw = gameCard("Switch", "base");
    const machop = inPlay("Machop", { energy: [Fighting] });
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: machop, bench: [abra], hand: [sw] }, opponent: { active: rocket("Dark Dugtrio") } });
    const switched = playTrainerCard(state, sw.id, [[abra.pokemon.id]]);
    expect(switched.playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(switched.playerBench[0].currentDamage).toBe(0);
    expect(switched.retreatedThisTurn).toBe(false);
  });
});

describe("conditions and effects that stop retreating — Switch still works", () => {
  it.each([[Asleep], [Paralyzed]])("%s: retreat refused (Energy kept); Switch moves it and clears the condition", (status) => {
    const sw = gameCard("Switch", "base");
    const machop = applyStatusCondition(inPlay("Machop", { energy: [Fighting] }), status, 2);
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: machop, bench: [abra], hand: [sw] }, opponent: { active: inPlay("Chansey") } });
    const refused = executeRetreat(state, ids(state), 0, { coinResults: [] });
    expect(refused.playerActivePokemon!.pokemon.name).toBe("Machop");
    expect(refused.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(refused.retreatedThisTurn).toBe(false);
    const switched = playTrainerCard(state, sw.id, [[abra.pokemon.id]]);
    const benched = switched.playerBench.find((p) => p.pokemon.name === "Machop")!;
    expect(benched.statusConditions).toEqual([]);
    expect(benched.paralyzedOnTurn).toBeUndefined();
  });

  it("Victreebel's Acid (heads): the Defending Pokémon can't retreat next turn, but Switch takes it out and ends the effect", () => {
    const victreebel = armedFor(inPlay("Victreebel", { set: "jungle" }), "Ácido");
    const machop = inPlay("Machop", { energy: [Fighting] });
    const state = makeState({ player: { active: victreebel }, opponent: { active: machop, bench: [inPlay("Abra")] } });
    const acid = executeAttack(state, attackIndex(victreebel, "Ácido"), { coinResults: [H], skipEndTurn: true });
    expect(acid.opponentActivePokemon!.retreatPrevented).toBe(true);
    // The opponent's turn (its view)
    const sw = gameCard("Switch", "base");
    const view = makeState({
      turnNumber: 4,
      player: { active: acid.opponentActivePokemon!, bench: acid.opponentBench, hand: [sw] },
      opponent: { active: acid.playerActivePokemon! },
    });
    expect(executeRetreat(view, ids(view), 0, { coinResults: [] }).playerActivePokemon!.pokemon.name).toBe("Machop");
    const switched = playTrainerCard(view, sw.id, [[view.playerBench[0].pokemon.id]]);
    expect(switched.playerBench[0].retreatPrevented).toBeUndefined();
  });

  it("no retreat after attacking, while the turn waits for a Prize / promotion, or on the other player's turn", () => {
    const machop = inPlay("Machop", { energy: [Fighting] });
    const base = makeState({ player: { active: machop, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Chansey"), bench: [inPlay("Rattata")] } });
    const blocked: Partial<GameState>[] = [
      { attackedThisTurn: true },
      { playerCanTakePrize: true },
      { opponentNeedsToPromote: true },
      { checkupDoneOnTurn: base.turnNumber },
      { isPlayerTurn: false },
    ];
    for (const extra of blocked) {
      const next = executeRetreat({ ...base, ...extra }, ids(base), 0, { coinResults: [] });
      expect(next.playerActivePokemon!.pokemon.name, JSON.stringify(extra)).toBe("Machop");
      expect(next.playerDiscard, JSON.stringify(extra)).toEqual([]);
    }
    expect(executeRetreat(base, ids(base), 0, { coinResults: [] }).playerActivePokemon!.pokemon.name).toBe("Abra");
  });

  it("only one retreat per turn, even with free retreat (Retreat Aid on Abra)", () => {
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: abra, bench: [dodrio(), inPlay("Machop")] }, opponent: { active: inPlay("Chansey") } });
    const once = executeRetreat(state, [], 0, { coinResults: [] });
    expect(once.playerActivePokemon!.pokemon.name).toBe("Dodrio");
    const twice = executeRetreat(once, [], 0, { coinResults: [] });
    expect(twice.playerActivePokemon!.pokemon.name).toBe("Dodrio");
  });
});

describe("Mysterious Fossil / Clefairy Doll: can't retreat, but can be switched or gusted", () => {
  it.each([["Mysterious Fossil", "fossil"], ["Clefairy Doll", "base"]] as const)("%s as the Active: retreat refused even at cost 0; Switch works", (name, set) => {
    const sw = gameCard("Switch", "base");
    const doll = inPlay(name, { set });
    const machop = inPlay("Machop");
    const state = makeState({ player: { active: doll, bench: [machop], hand: [sw] }, opponent: { active: inPlay("Chansey") } });
    expect(executeRetreat(state, [], 0, { coinResults: [] }).playerActivePokemon!.pokemon.name).toBe(name);
    const switched = playTrainerCard(state, sw.id, [[machop.pokemon.id]]);
    expect(switched.playerActivePokemon!.pokemon.name).toBe("Machop");
    expect(switched.playerBench[0].pokemon.name).toBe(name);
  });

  it("Gust of Wind brings the opponent's benched Mysterious Fossil to the Active spot; it then can't retreat", () => {
    const gust = gameCard("Gust of Wind", "base");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const state = makeState({ player: { active: inPlay("Machop"), hand: [gust] }, opponent: { active: inPlay("Chansey"), bench: [fossil] } });
    expect(canPlayTrainerCard(state, gust.id)).toBeNull();
    const gusted = playTrainerCard(state, gust.id, [[fossil.pokemon.id]]);
    expect(gusted.opponentActivePokemon!.pokemon.name).toBe("Mysterious Fossil");
    const theirTurn = makeState({ player: { active: gusted.opponentActivePokemon!, bench: gusted.opponentBench }, opponent: { active: gusted.playerActivePokemon! } });
    expect(executeRetreat(theirTurn, [], 0, { coinResults: [] }).playerActivePokemon!.pokemon.name).toBe("Mysterious Fossil");
  });

  it("Pidgeotto's Whirlwind can bring a benched Clefairy Doll in; the Poisoned Chansey sent to the Bench is cured", () => {
    const pidgeotto = armedFor(inPlay("Pidgeotto"), "Torbellino / Remolino");
    const doll = inPlay("Clefairy Doll", { set: "base" });
    const state = makeState({ player: { active: pidgeotto }, opponent: { active: inPlay("Chansey", { energy: [Grass], statuses: [Poisoned] }), bench: [doll] } });
    const hit = executeAttack(state, attackIndex(pidgeotto, "Torbellino / Remolino"), { coinResults: [], skipEndTurn: true });
    expect(hit.pendingForceSwitch).toBe(true);
    const switched = applyForceSwitch(hit, 0, { skipEndTurn: true });
    expect(switched.opponentActivePokemon!.pokemon.name).toBe("Clefairy Doll");
    expect(switched.opponentBench[0].statusConditions).toEqual([]);
  });
});
