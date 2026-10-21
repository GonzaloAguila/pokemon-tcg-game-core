/**
 * Energy discards of attacks (player report 0.10.2: "Blaine's Charmander: no te deja descartar
 * energía Fuego, te dice que tiene que ser Colorless"). Gym Heroes Blaine's Charmander's Kindle is
 * "Descarta 1 carta de Energía" — `discardCostRequirement: [Colorless]` means ANY Energy card, but
 * the consumers' picker matched the card's printed type literally (only a Double Colorless could
 * be chosen), and the engine accepted any `selectedEnergyIds` without checking them (in
 * multiplayer a client could skip the cost). Now the engine owns the rule (energyPaysDiscard,
 * checkDiscardSelection; executeAttack throws on a selection that doesn't pay the cost).
 *
 * Audit: every attack with a chosen discard cost (`discardCostRequirement`) and every coin-gated /
 * fixed typed discard the engine picks.
 */
import { describe, it, expect } from "vitest";
import {
  checkDiscardSelection,
  energyPaysDiscard,
  executeAttack,
  flipAttackCoins,
  getAttackCoinPlan,
  getAttackDiscardRequirement,
  type GameCard,
  type GameState,
  type PokemonInPlay,
} from "@/lib/gameState";
import { ALL_CARDS } from "@/domain/catalog";
import { isPokemonCard, toInPlayCard, type Attack, type PokemonCard } from "@/domain/cards";
import { AttackEffectType, EnergyType, PokemonPowerType } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, energy, gameCard, names } from "./helpers/state";

const { Fire, Water, Psychic, Lightning, Colorless } = EnergyType;
type Coin = "heads" | "tails";

function attacker(card: PokemonCard, attached: GameCard[]): PokemonInPlay {
  return { ...inPlay("Abra", { set: "base" }), pokemon: toInPlayCard({ ...structuredClone(card), id: `${card.id}#d` } as GameCard), attachedEnergy: attached };
}
const vs = (active: PokemonInPlay): GameState =>
  makeState({ player: { active, bench: [inPlay("Machop", { set: "base" })] }, opponent: { active: inPlay("Chansey", { set: "base" }), bench: [inPlay("Onix", { set: "base" })] } });
const use = (state: GameState, index: number, selectedEnergyIds?: string[], coin: Coin = "heads") =>
  executeAttack(state, index, { coinResults: flipAttackCoins(getAttackCoinPlan(state, index), () => coin), skipEndTurn: true, selectedEnergyIds });
const rainbow = () => gameCard("Rainbow Energy", "rocket");
const dce = () => energy(Colorless);
const cardsOf = (type: EnergyType, n: number) => Array.from({ length: n }, () => energy(type));

const chosenCosts: { card: PokemonCard; attack: Attack; index: number; required: EnergyType[] }[] = [];
const engineDiscards: { card: PokemonCard; attack: Attack; index: number; type: EnergyType }[] = [];
for (const card of ALL_CARDS) {
  if (!isPokemonCard(card)) continue;
  card.attacks.forEach((attack, index) => {
    for (const e of attack.effects ?? []) {
      if (e.discardCostRequirement?.length && (e.type === AttackEffectType.Discard || e.type === AttackEffectType.Recover)) chosenCosts.push({ card, attack, index, required: e.discardCostRequirement });
      else if (e.type === AttackEffectType.Discard && e.target === "self" && e.energyType && !e.discardAll) engineDiscards.push({ card, attack, index, type: e.energyType });
    }
  });
}

describe("Gym Heroes Blaine's Charmander — Kindle (the reported card): \"discard 1 Energy card\" = any Energy card", () => {
  const charmander = ALL_CARDS.find((c) => c.id === "gym-heroes-061-blaines-charmander") as PokemonCard;

  it("a Fire Energy pays it (it was refused as 'not Colorless'); a Double Colorless or a Water too, as 1 card", () => {
    const fire = energy(Fire);
    const state = vs(attacker(charmander, [fire]));
    expect(getAttackDiscardRequirement(state.playerActivePokemon!, 0, state)).toEqual([Colorless]);
    expect(energyPaysDiscard(fire, Colorless, state.playerActivePokemon!, state)).toBe(true);
    expect(checkDiscardSelection(state.playerActivePokemon!, [Colorless], [fire.id], state)).toBeNull();
    const after = use(state, 0, [fire.id]);
    expect(names(after.playerDiscard)).toEqual(["Fire Energy"]);
    for (const other of [dce(), energy(Water)]) {
      const s = vs(attacker(charmander, [energy(Fire), other]));
      expect(checkDiscardSelection(s.playerActivePokemon!, [Colorless], [other.id], s)).toBeNull();
    }
  });

  it("the cost is exactly 1 card: none extra, no foreign ids", () => {
    const [a, b] = cardsOf(Fire, 2);
    const state = vs(attacker(charmander, [a, b]));
    expect(checkDiscardSelection(state.playerActivePokemon!, [Colorless], [a.id, b.id], state)).toMatch(/1 carta/);
    expect(() => use(state, 0, ["not-attached"])).toThrow(IllegalActionError);
  });
});

describe("Gym Challenge Blaine's Charmander — Fire Tail (the card named in the report): the engine discards a Fire Energy on tails", () => {
  const charmander = ALL_CARDS.find((c) => c.id === "gym-challenge-060-blaines-charmander") as PokemonCard;
  it("tails: 1 Fire Energy card is discarded (never the Water); heads: none", () => {
    const fire = energy(Fire);
    const water = energy(Water);
    const state = vs(attacker(charmander, [water, fire]));
    expect(getAttackDiscardRequirement(state.playerActivePokemon!, 0, state)).toBeNull(); // nothing to choose before the attack
    expect(names(use(state, 0, undefined, "tails").playerDiscard)).toEqual(["Fire Energy"]);
    expect(use(state, 0, undefined, "heads").playerDiscard).toEqual([]);
  });
});

describe("audit: every chosen discard cost (discardCostRequirement)", () => {
  it("the list covers the known cards", () => {
    expect(chosenCosts.map((c) => c.card.id)).toEqual(
      expect.arrayContaining(["base-set-004-charizard", "base-set-012-ninetales", "gym-heroes-061-blaines-charmander", "gym-challenge-001-blaines-arcanine", "gym-heroes-091-sabrinas-abra"])
    );
  });

  it.each(chosenCosts.map((c) => [`${c.card.id} · ${c.attack.name} [${c.required.join(", ")}]`, c] as const))("%s", (_label, { card, attack, index, required }) => {
    const typed = (t: EnergyType) => (t === Colorless ? Fire : t);
    // The attack's cost, paid with its printed types (Colorless with the first type it needs)
    const payType = (attack.cost.find((t) => t !== Colorless) ?? Fire) as EnergyType;
    const costCards = attack.cost.map((t) => energy(t === Colorless ? payType : t));
    // A card of another type than any typed requirement (never pays a typed entry)
    const foreignType = [Water, Psychic, Lightning, Fire].find((t) => !required.includes(t) && !attack.cost.includes(t))!;
    const foreign = energy(foreignType);
    const pokemon = attacker(card, [...costCards, foreign]);
    const state = vs(pokemon);
    expect(getAttackDiscardRequirement(pokemon, index, state)).toEqual(required);

    // Paying it: one matching card per entry
    const pool = [...pokemon.attachedEnergy];
    const pick = required.map((t) => {
      const i = pool.findIndex((c) => energyPaysDiscard(c, t, pokemon, state) && c.id !== foreign.id);
      return pool.splice(i, 1)[0];
    });
    expect(checkDiscardSelection(pokemon, required, pick.map((c) => c.id), state)).toBeNull();
    const after = use(state, index, pick.map((c) => c.id));
    const leftIds = after.playerActivePokemon ? after.playerActivePokemon.attachedEnergy.map((c) => c.id) : [];
    for (const c of pick) expect(leftIds).not.toContain(c.id);

    // Too few cards: refused (the cost counts cards)
    expect(() => use(state, index, pick.slice(1).map((c) => c.id).concat(pick.length === 1 ? ["none"] : []))).toThrow(IllegalActionError);
    // A card of the wrong type for a typed entry: refused
    // Energy Burn (Charizard): every attached Energy is Fire, so any card pays
    const energyBurn = card.power?.type === PokemonPowerType.EnergyConversion;
    if (energyBurn) {
      expect(checkDiscardSelection(pokemon, required, [foreign.id, ...pick.slice(1).map((c) => c.id)], state)).toBeNull();
    } else if (required.some((t) => t !== Colorless)) {
      const wrong = [foreign.id, ...pick.slice(1).map((c) => c.id)];
      expect(checkDiscardSelection(pokemon, required, wrong, state)).not.toBeNull();
      expect(() => use(state, index, wrong)).toThrow(IllegalActionError);
      // Rainbow Energy pays a typed entry
      const rb = rainbow();
      const withRainbow = attacker(card, [...costCards, rb]);
      const rbState = vs(withRainbow);
      const rest = [...withRainbow.attachedEnergy].filter((c) => c.id !== rb.id);
      const firstTyped = required.findIndex((t) => t !== Colorless);
      const others = required.filter((_, i) => i !== firstTyped).map((t) => {
        const i = rest.findIndex((c) => energyPaysDiscard(c, typed(t), withRainbow, rbState));
        return rest.splice(i, 1)[0];
      });
      expect(checkDiscardSelection(withRainbow, required, [rb.id, ...others.map((c) => c.id)], rbState)).toBeNull();
    } else {
      // "Discard N Energy cards": any type
      expect(checkDiscardSelection(pokemon, required, [foreign.id, ...pick.slice(1).map((c) => c.id)], state)).toBeNull();
    }
  });
});

describe("audit: discards the engine picks (coin-gated or fixed, typed): only cards of that type", () => {
  it.each(engineDiscards.map((d) => [`${d.card.id} · ${d.attack.name} (${d.type})`, d] as const))("%s", (_label, { card, attack, index, type }) => {
    const costCards = attack.cost.map((t) => energy(t === Colorless ? type : t));
    const foreignType = [Water, Psychic, Lightning, Fire].find((t) => t !== type)!;
    const pokemon = attacker(card, [...costCards, energy(type), energy(foreignType), dce()]);
    for (const coin of ["heads", "tails"] as const) {
      const state = vs(pokemon);
      const after = use(state, index, undefined, coin);
      const discardedEnergy = after.playerDiscard.filter((c) => c.kind === "energy");
      for (const c of discardedEnergy) expect(energyPaysDiscard(c, type, pokemon, state), `${card.name} ${attack.name} (${coin}) discarded ${c.name}`).toBe(true);
    }
  });
});
