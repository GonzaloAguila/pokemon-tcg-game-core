/**
 * Transform (Ditto, FO #3): "If Ditto is your Active Pokémon, treat it as if it were the same
 * card as the Defending Pokémon, including type, Hit Points, Weakness, and so on, except Ditto
 * can't evolve, always has this Pokémon Power, and you may treat any Energy attached to Ditto
 * as Energy of any type. Ditto isn't a copy of any other Pokémon while Ditto is Asleep,
 * Confused, or Paralyzed."
 */
import { describe, it, expect } from "vitest";
import { getEffectivePokemonCard, getEffectiveHp, getTransformTarget } from "@/domain/powers";
import {
  canExecuteAttack,
  endTurn,
  executeAttack,
  getRetreatCost,
  hasEnoughEnergyToRetreat,
  promoteActivePokemon,
} from "@/lib/gameState";
import { playTrainerCard } from "@/domain/effects";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, attackIndex, armedFor } from "./helpers/state";

const { Fire, Water, Fighting, Psychic } = EnergyType;

const ditto = (opts: Parameters<typeof inPlay>[1] = {}) => inPlay("Ditto", { set: "fossil", ...opts });

describe("Transform: Ditto as the Active is a copy of the Defending Pokémon", () => {
  it("copies HP, type, Weakness, Resistance, attacks and Retreat Cost; keeps its identity and power", () => {
    const d = ditto();
    const machamp = inPlay("Machamp");
    const state = makeState({ player: { active: d }, opponent: { active: machamp } });
    const card = getEffectivePokemonCard(state, d)!;
    expect(getTransformTarget(state, d)?.name).toBe("Machamp");
    expect([card.hp, card.types, card.weaknesses, card.retreatCost]).toEqual([100, [Fighting], [Psychic], 3]);
    expect(card.attacks.map((a) => a.name)).toEqual(["Lanzamiento Sísmico"]);
    expect([card.id, card.name, card.power?.name]).toEqual([d.pokemon.id, "Ditto", "Transformación"]);
    expect(getEffectiveHp(state, d)).toBe(100);
  });

  it("is plain Ditto on the Bench, or while Asleep / Confused / Paralyzed", () => {
    const benched = ditto();
    const state = makeState({ player: { active: inPlay("Machop"), bench: [benched] }, opponent: { active: inPlay("Machamp") } });
    expect(getEffectivePokemonCard(state, benched)!.hp).toBe(50);
    const asleep = ditto({ statuses: [StatusCondition.Asleep] });
    const s2 = makeState({ player: { active: asleep }, opponent: { active: inPlay("Machamp") } });
    expect(getTransformTarget(s2, asleep)).toBeUndefined();
    expect(getEffectivePokemonCard(s2, asleep)!.attacks).toEqual([]);
  });

  it("uses the copied attack paying with Energy of any type (Seismic Toss: 4 Fighting paid with Water)", () => {
    const d = ditto({ energy: [Water, Water, Water, Water] });
    const machamp = inPlay("Machamp");
    const state = makeState({ player: { active: d }, opponent: { active: machamp } });
    expect(canExecuteAttack(state, 0)).toBeNull();
    const next = executeAttack(state, 0, { coinResults: [], skipEndTurn: true });
    // Fighting vs Machamp (no Weakness to Fighting): 60 damage
    expect(next.opponentActivePokemon!.currentDamage).toBe(60);
    // Machamp's Strikes Back hits Ditto for 10
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("not enough Energy is still not enough", () => {
    const d = ditto({ energy: [Water, Water] });
    const state = makeState({ player: { active: d }, opponent: { active: inPlay("Machamp") } });
    expect(canExecuteAttack(state, 0)).toMatch(/energía/);
  });

  it("takes damage with the copied HP and Weakness (Ditto copying Abra: 30 HP, weak to Psychic)", () => {
    const d = ditto({ damage: 20 });
    const abra = armedFor(inPlay("Abra"), "Psicochoque");
    // Abra attacks Ditto (Ditto copies Abra: 30 HP, Psychic Weakness)
    const state = makeState({ player: { active: abra }, opponent: { active: d, bench: [inPlay("Machop")] } });
    const next = executeAttack(state, attackIndex(abra, "Psicochoque"), { coinResults: ["tails"], skipEndTurn: true });
    // Psyshock 10 ×2 (Abra is weak to Psychic) = 20; 20 + 20 = 40 ≥ 30 HP → Knocked Out
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Machop");
    expect(next.opponentDiscard.some((c) => c.name === "Ditto")).toBe(true);
  });

  it("copies the Retreat Cost", () => {
    const d = ditto({ energy: [Fire] });
    const state = makeState({ player: { active: d, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Machamp") } });
    expect(getRetreatCost(d, state.playerBench, state)).toBe(3);
    expect(hasEnoughEnergyToRetreat(d, state.playerBench, state)).toBe(false);
  });
});

describe("Transform: Knock Out when the copy's HP drops below Ditto's damage", () => {
  it("the opponent promotes a lower-HP Pokémon: Ditto (60 damage) is Knocked Out", () => {
    const d = ditto({ damage: 60 });
    const state = makeState({
      player: { active: d, bench: [inPlay("Abra")] },
      opponent: { active: null, bench: [inPlay("Machop")] },
      opponentNeedsToPromote: true,
    });
    const next = promoteActivePokemon(state, 0, false);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(5);
  });

  it("Gust of Wind brings a benched Ditto up: it is now a copy of the new Defending Pokémon", () => {
    const d = ditto({ damage: 40 });
    const gust = gameCard("Gust of Wind");
    const state = makeState({
      player: { active: inPlay("Machamp"), hand: [gust] },
      opponent: { active: inPlay("Abra"), bench: [d] },
    });
    // Ditto is benched (50 HP printed): bring it up; it copies Machamp (100 HP) and survives
    const gusted = playTrainerCard(state, gust.id, [[d.pokemon.id]]);
    expect(gusted.opponentActivePokemon!.pokemon.name).toBe("Ditto");
    expect(getEffectiveHp(gusted, gusted.opponentActivePokemon!)).toBe(100);
  });

  it("the checkup auto-promotes a Mysterious Fossil: the player's Ditto now copies 10 HP and is Knocked Out before the turn passes", () => {
    const d = ditto({ damage: 20 });
    const golduck = inPlay("Golduck", { set: "fossil", damage: 60, statuses: [StatusCondition.Poisoned] });
    const state = makeState({
      player: { active: d, bench: [inPlay("Abra")] },
      opponent: { active: golduck, bench: [inPlay("Mysterious Fossil", { set: "fossil" })] },
    });
    const next = endTurn(state);
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Mysterious Fossil");
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerDiscard.some((c) => c.name === "Ditto")).toBe(true);
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.isPlayerTurn).toBe(true);
  });

  it("endTurn knocks out a transformed Ditto whose copy no longer fits (asleep → 50 HP)", () => {
    const d = ditto({ damage: 60, statuses: [StatusCondition.Asleep] });
    const state = makeState({ player: { active: inPlay("Machamp") }, opponent: { active: d, bench: [inPlay("Abra")] } });
    const next = endTurn(state);
    expect(next.opponentActivePokemon?.pokemon.name).not.toBe("Ditto");
    expect(next.opponentDiscard.some((c) => c.name === "Ditto")).toBe(true);
  });
});

describe("Transform while the other side has no Active", () => {
  it("is not Knocked Out while waiting for the new Defending Pokémon; the HP check happens after the promotion", async () => {
    const { resolveConfusionFlip } = await import("@/lib/gameState");
    const lapras = inPlay("Lapras", { set: "fossil", damage: 70, statuses: [StatusCondition.Confused] });
    const d = ditto({ damage: 70 });
    const state = makeState({ player: { active: lapras, bench: [inPlay("Abra")] }, opponent: { active: d } });
    const flipped = resolveConfusionFlip(state, false).state; // tails: Lapras Knocks itself Out
    expect(flipped.playerActivePokemon).toBeNull();
    expect(flipped.opponentActivePokemon!.pokemon.name).toBe("Ditto");
    const promoted = promoteActivePokemon(flipped, 0, true); // Abra (30 HP) is the new copy
    expect(promoted.opponentActivePokemon).toBeNull();
    expect(promoted.opponentDiscard.some((c) => c.name === "Ditto")).toBe(true);
  });
});
