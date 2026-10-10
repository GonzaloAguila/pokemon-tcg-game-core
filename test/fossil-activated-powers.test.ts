/**
 * Fossil activated Pokémon Powers through the effect registry: Step In (Dragonite),
 * Curse (Gengar), Strange Behavior (Slowbro), Cowardice (Tentacool).
 */
import { describe, it, expect } from "vitest";
import { POWER_EFFECTS, canUsePokemonPower, getPowerSteps, usePokemonPower } from "@/domain/effects";
import { promoteActivePokemon } from "@/lib/gameState";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, deepFreeze, names } from "./helpers/state";

const { Water, Psychic } = EnergyType;

describe("Step In (Dragonite): once per turn, switch it from the Bench with the Active", () => {
  it("switches; the old Active loses its Special Conditions; only once per turn; not from the Active spot", () => {
    const dragonite = inPlay("Dragonite", { set: "fossil" });
    const machop = inPlay("Machop", { statuses: [StatusCondition.Poisoned] });
    const state = deepFreeze(makeState({ player: { active: machop, bench: [dragonite] }, opponent: { active: inPlay("Abra") } }));
    expect(POWER_EFFECTS["Entrada"]).toBeDefined();
    expect(canUsePokemonPower(state, dragonite.pokemon.id)).toBeNull();
    expect(getPowerSteps(state, dragonite.pokemon.id, [])).toBeNull();

    const next = usePokemonPower(state, dragonite.pokemon.id);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Dragonite");
    expect(next.playerBench[0].pokemon.name).toBe("Machop");
    expect(next.playerBench[0].statusConditions).toEqual([]);
    expect(next.retreatedThisTurn).toBe(false);
    expect(canUsePokemonPower(next, dragonite.pokemon.id)).not.toBeNull();
  });
});

describe("Curse (Gengar): move 1 damage counter between the opponent's Pokémon, even to a Knock Out", () => {
  it("moves one counter from one opponent's Pokémon to another; once per turn", () => {
    const gengar = inPlay("Gengar", { set: "fossil" });
    const damaged = inPlay("Machop", { damage: 30 });
    const target = inPlay("Abra");
    const state = makeState({ player: { active: gengar }, opponent: { active: damaged, bench: [target] } });
    const first = getPowerSteps(state, gengar.pokemon.id, [])!;
    expect(first.options.map((o) => o.id)).toEqual([damaged.pokemon.id]);
    const second = getPowerSteps(state, gengar.pokemon.id, [[damaged.pokemon.id]])!;
    expect(second.options.map((o) => o.id)).toEqual([target.pokemon.id]);

    const next = usePokemonPower(state, gengar.pokemon.id, [[damaged.pokemon.id], [target.pokemon.id]]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(20);
    expect(next.opponentBench[0].currentDamage).toBe(10);
    expect(canUsePokemonPower(next, gengar.pokemon.id)).toMatch(/ya fue usado/);
  });

  it("can Knock Out a benched Pokémon: the player takes a Prize", () => {
    const gengar = inPlay("Gengar", { set: "fossil" });
    const damaged = inPlay("Machop", { damage: 30 });
    const target = inPlay("Abra", { damage: 20 });
    const state = makeState({ player: { active: gengar }, opponent: { active: damaged, bench: [target] } });
    const next = usePokemonPower(state, gengar.pokemon.id, [[damaged.pokemon.id], [target.pokemon.id]]);
    expect(next.opponentBench).toEqual([]);
    expect(next.playerPrizes).toHaveLength(5);
    expect(names(next.opponentDiscard)).toEqual(["Abra"]);
  });

  it("can Knock Out the Defending Pokémon: Prize taken, the opponent promotes, then the turn goes on", () => {
    const gengar = inPlay("Gengar", { set: "fossil" });
    const benched = inPlay("Machop", { damage: 10 });
    const active = inPlay("Abra", { damage: 20 });
    const state = makeState({ player: { active: gengar }, opponent: { active: active, bench: [benched, inPlay("Pikachu")] } });
    const next = usePokemonPower(state, gengar.pokemon.id, [[benched.pokemon.id], [active.pokemon.id]]);
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.opponentNeedsToPromote).toBe(true);
    expect(next.playerPrizes).toHaveLength(5);
    expect(next.isPlayerTurn).toBe(true);
    const promoted = promoteActivePokemon(next, 0, false);
    expect(promoted.opponentActivePokemon!.pokemon.name).toBe("Machop");
    expect(promoted.opponentNeedsToPromote).toBe(false);
  });

  it("a Knock Out that takes the player's last Prize wins the game", () => {
    const gengar = inPlay("Gengar", { set: "fossil" });
    const state = makeState({
      player: { active: gengar, prizes: [inPlay("Abra").pokemon] },
      opponent: { active: inPlay("Abra", { damage: 20 }), bench: [inPlay("Pikachu", { damage: 10 })] },
    });
    const next = usePokemonPower(state, gengar.pokemon.id, [[state.opponentBench[0].pokemon.id], [state.opponentActivePokemon!.pokemon.id]]);
    expect(next.gameResult).toBe("victory");
    expect(next.gamePhase).toBe("GAME_OVER");
    expect(next.opponentNeedsToPromote).toBe(false);
  });

  it("needs a damaged opponent's Pokémon and somewhere to move it", () => {
    const gengar = inPlay("Gengar", { set: "fossil" });
    expect(canUsePokemonPower(makeState({ player: { active: gengar }, opponent: { active: inPlay("Abra"), bench: [inPlay("Machop")] } }), gengar.pokemon.id)).not.toBeNull();
    expect(canUsePokemonPower(makeState({ player: { active: gengar }, opponent: { active: inPlay("Abra", { damage: 10 }) } }), gengar.pokemon.id)).not.toBeNull();
  });
});

describe("Strange Behavior (Slowbro): move counters from your Pokémon onto Slowbro, never to a Knock Out", () => {
  it("moves one counter per use, as often as you like, stopping before Slowbro would be Knocked Out", () => {
    const slowbro = inPlay("Slowbro", { set: "fossil", damage: 30 });
    const machop = inPlay("Machop", { damage: 40 });
    let state = makeState({ player: { active: machop, bench: [slowbro] }, opponent: { active: inPlay("Abra") } });
    expect(getPowerSteps(state, slowbro.pokemon.id, [])!.options.map((o) => o.id)).toEqual([machop.pokemon.id]);
    state = usePokemonPower(state, slowbro.pokemon.id, [[machop.pokemon.id]]);
    state = usePokemonPower(state, slowbro.pokemon.id, [[machop.pokemon.id]]);
    expect(state.playerBench[0].currentDamage).toBe(50);
    expect(state.playerActivePokemon!.currentDamage).toBe(20);
    // 60 HP: one more counter would Knock it Out
    expect(canUsePokemonPower(state, slowbro.pokemon.id)).not.toBeNull();
  });
});

describe("Cowardice (Tentacool): return it to the hand, discarding the attached cards", () => {
  it("returns Tentacool to the hand and discards its Energy", () => {
    const tentacool = inPlay("Tentacool", { set: "fossil", energy: [Water], playedOnTurn: 1 });
    const state = makeState({ turnNumber: 3, player: { active: inPlay("Machop"), bench: [tentacool] }, opponent: { active: inPlay("Abra") } });
    const next = usePokemonPower(state, tentacool.pokemon.id);
    expect(next.playerBench).toEqual([]);
    expect(names(next.playerHand)).toEqual(["Tentacool"]);
    expect(names(next.playerDiscard)).toEqual(["Water Energy"]);
  });

  it("not the turn it was put into play; an Active Tentacool leaves a promotion pending", () => {
    const fresh = inPlay("Tentacool", { set: "fossil", playedOnTurn: 3 });
    const state = makeState({ turnNumber: 3, player: { active: inPlay("Machop"), bench: [fresh] }, opponent: { active: inPlay("Abra") } });
    expect(canUsePokemonPower(state, fresh.pokemon.id)).toMatch(/turno/);

    const active = inPlay("Tentacool", { set: "fossil", playedOnTurn: 0, energy: [Psychic] });
    const withBench = makeState({ turnNumber: 3, player: { active, bench: [inPlay("Machop")] }, opponent: { active: inPlay("Abra") } });
    const next = usePokemonPower(withBench, active.pokemon.id);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);

    const alone = makeState({ turnNumber: 3, player: { active }, opponent: { active: inPlay("Abra") } });
    expect(canUsePokemonPower(alone, active.pokemon.id)).toMatch(/único/);
  });
});
