import { prizesOwed } from "@/lib/gameState";
/**
 * Gym Challenge attacks that need new engine code (Task 2 of
 * docs/superpowers/plans/2026-10-19-gym-challenge.md; rulings in docs/card-doubts.md →
 * "Gym Challenge"). Amnesia (#89) needs a choice of the Defending Pokémon's attack: Task 3.
 *
 * | # | Card | Attack | Effect data |
 * |---|---|---|---|
 * | 5 | Giovanni's Gyarados | Summon Storm | AttackFails on any tails (`minHits` 1 of 2) + BonusDamage 20 + BenchDamage both 20, no W/R |
 * | 7 | Giovanni's Nidoking | Intimidate | IntimidateLock `maxHp` 50 (`intimidatedBy`, the opponent's next turn) |
 * | 11 | Lt. Surge's Raichu | Kerzap | coinBonus 30 + Discard all Lightning (heads) |
 * | 14 | Rocket's Mewtwo | Juxtapose | SwapDamageCounters (heads) |
 * | 15 | Rocket's Zapdos | Electroburn | SelfDamage 10 `perEnergyType` Lightning |
 * | 21 | Blaine's Ninetales | Burn Up | Discard all Fire (tails) |
 * | 22 | Brock's Dugtrio | Earthdrill | RequireLastAttack Lie Low (`lastAttack`, its owner's previous turn) |
 * | 23 | Giovanni's Nidoqueen | Love Lariat | AttackFails tails + BonusDamage 50 `bonusOnce` if Giovanni's Nidoking is Benched |
 * | 25 | Koga's Arbok | Poison Power | BonusDamage 20 + Poisoned, both `onlyIfSelfStatus` Poisoned |
 * | 30 | Sabrina's Golduck | Damage Shift | MoveDamageCountersToDefender |
 * | 31 | Blaine's Charmeleon | Bonfire | 3 coins: Discard 1 Fire / 10 to the Defending / 10 to each Benched, per heads, no W/R |
 * | 34 | Brock's Graveler | Detonate | BenchDamage both 10 + SelfDamage 50 + DiscardStadium |
 * | 35 | Brock's Primeape | Mega Thrash | SelfDamage 20 + DiscardStadium |
 * | 39 | Erika's Bulbasaur | Errand-Running | SearchDeckChoice `deckFilter.trainer` (heads) |
 * | 42 | Giovanni's Machoke | Risky Attack | AttackFails `defenderOnly` + SelfDamage 100 (tails) |
 * | 45 | Giovanni's Nidorino | Rend | BonusDamage 20 `defenderDamaged` |
 * | 53 | Lt. Surge's Raticate | Focus Energy | DoubleAttackNextTurn Double-edge (base and self damage) |
 * | 54 | Misty's Dewgong | Ice Throw | BonusDamage 20 `defenderType` Fighting |
 * | 56 | Sabrina's Hypno | Pendulum Curse | CoinFlipDamage 20, one coin per damage counter on the Defending Pokémon |
 * | 58 | Sabrina's Kadabra | Life Drain | SetRemainingHp 10 (heads) |
 * | 59 | Sabrina's Mr. Mime | Magic Darts | ChooseTargetDamage 10 × heads (3 coins) |
 * | 69 | Erika's Jigglypuff | Group Therapy / Pulled Punch | Heal 10 `healBothSides` / BonusDamage −30 `defenderDamaged` |
 * | 76 | Giovanni's Nidoran ♂ | Retaliation | RequireDamageCounters `amount` 2 |
 * | 77 | Koga's Ekans | Fast-Acting Poison | ApplyStatus Confused + Poisoned, `minHits` 2 of 2 |
 * | 78 | Koga's Grimer | Sludge Grip | ChooseTargetDamage `switchWithDefender` 0 + `status` Poisoned (heads) |
 * | 87 | Misty's Horsea | Ink Spurt | SandAttack `lasting` (heads) |
 * | 92 | Misty's Staryu | Star Boomerang | ReturnToHand Self (heads) |
 * | 93 | Sabrina's Abra | Synchronize | RequireEqualEnergyCards |
 * | 99 | Sabrina's Psyduck | Random ESP | Confused (heads) / AttackFails `defenderOnly` + self Confused (tails) |
 */
import { describe, it, expect } from "vitest";
import { canExecuteAttack, endTurn, executeAttack, getAttackCoinPlan, resolveAttackChoice } from "@/lib/gameState";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { gymChallengeCards } from "@/domain/catalog";
import type { PokemonCard } from "@/domain/cards";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze, takeable } from "./helpers/state";

const { Fire, Lightning, Psychic, Grass, Water } = EnergyType;
const { Confused, Poisoned } = StatusCondition;
const H = "heads" as const;
const T = "tails" as const;
type Coin = typeof H | typeof T;

const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const choose = (state: GameState, selection: string[]) => resolveAttackChoice(state, selection, { skipEndTurn: true });

let uid = 0;
function gym(number: number, opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const card = structuredClone(gymChallengeCards.find((c) => c.number === number)!);
  uid += 1;
  return { ...inPlay("Abra", opts), pokemon: { ...card, id: `${card.id}#e${uid}` } as GameCard };
}
function dummy(opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const p = inPlay("Chansey", opts);
  uid += 1;
  return { ...p, pokemon: { ...(p.pokemon as PokemonCard), id: `chansey#${uid}`, weaknesses: [], resistances: [] } };
}
function armedState(state: GameState, name: string): GameState {
  return { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
}
function attack(state: GameState, name: string, coins: Coin[] = []): GameState {
  const armed = armedState(state, name);
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
const blocker = (state: GameState, name: string) => canExecuteAttack(state, attackIndex(state.playerActivePokemon!, name));
const coinsFor = (state: GameState, name: string) => getAttackCoinPlan(armedState(state, name), attackIndex(state.playerActivePokemon!, name)).attack;
const dmg = (state: GameState) => state.opponentActivePokemon!.currentDamage;
const selfDmg = (state: GameState) => state.playerActivePokemon!.currentDamage;
const statuses = (p: PokemonInPlay | null) => [...(p?.statusConditions ?? [])].sort();
const benchDmg = (bench: PokemonInPlay[]) => bench.map((p) => p.currentDamage);

describe("Gym Challenge attack effects that need new engine code", () => {
  it("#5 Summon Storm: both heads → 20 to each other Pokémon (even your own), no W/R; any tails → nothing", () => {
    const weak = { ...dummy(), pokemon: { ...(dummy().pokemon as PokemonCard), weaknesses: [Water] } } as PokemonInPlay;
    const state = deepFreeze(vs(gym(5), weak, { player: { bench: [dummy()] }, opponent: { bench: [dummy(), dummy()] } }));
    expect(coinsFor(state, "Invocar Tormenta")).toBe(2);
    const storm = attack(state, "Invocar Tormenta", [H, H]);
    expect([dmg(storm), selfDmg(storm), benchDmg(storm.playerBench), benchDmg(storm.opponentBench)]).toEqual([20, 0, [20], [20, 20]]);
    const calm = attack(state, "Invocar Tormenta", [H, T]);
    expect([dmg(calm), benchDmg(calm.playerBench), benchDmg(calm.opponentBench)]).toEqual([0, [0], [0, 0]]);
  });

  it("#7 Intimidate: a Defending Pokémon with 50 HP or less can't attack Giovanni's Nidoking during the opponent's next turn", () => {
    const nidoking = gym(7);
    const small = gym(93); // Sabrina's Abra, 40 HP
    const marked = attack(deepFreeze(vs(nidoking, small)), "Intimidar").opponentActivePokemon!;
    expect(marked.intimidatedBy).toEqual({ pokemonId: nidoking.pokemon.id, onTurn: 4, attackName: "Intimidar" });
    expect(attack(vs(gym(7), dummy()), "Intimidar").opponentActivePokemon!.intimidatedBy).toBeUndefined();
    // The opponent's next turn (T+1), seen from its side
    const theirTurn = (turnNumber: number, defender: PokemonInPlay = nidoking) =>
      armedState(vs(marked, defender, { turnNumber }), "Destructor");
    expect(blocker(theirTurn(4), "Destructor")).toMatch(/Intimidar/);
    expect(blocker(theirTurn(4, gym(7)), "Destructor")).toBeNull(); // another Pokémon is Defending
    expect(blocker(theirTurn(6), "Destructor")).toBeNull();
  });

  it("#11 Kerzap: heads → 50 and every Lightning Energy card discarded; tails → 20", () => {
    const state = deepFreeze(vs(gym(11, { energy: [Lightning, Lightning, Lightning] }), dummy()));
    const heads = attack(state, "Kerzap", [H]);
    expect([dmg(heads), heads.playerActivePokemon!.attachedEnergy.length, heads.playerDiscard.length]).toEqual([50, 0, 3]);
    const tails = attack(state, "Kerzap", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.attachedEnergy.length]).toEqual([20, 3]);
  });

  it("#14 Juxtapose: heads swaps the damage counters (Knock Outs either way)", () => {
    const state = deepFreeze(vs(gym(14, { damage: 30 }), dummy({ damage: 60 })));
    const heads = attack(state, "Yuxtaposición", [H]);
    expect([selfDmg(heads), dmg(heads)]).toEqual([60, 30]);
    const tails = attack(state, "Yuxtaposición", [T]);
    expect([selfDmg(tails), dmg(tails)]).toEqual([30, 60]);
    // The defender gets Mewtwo's 50: Sabrina's Abra (40 HP) is Knocked Out, Mewtwo heals
    const ko = attack(deepFreeze(vs(gym(14, { damage: 50 }), gym(93), { opponent: { bench: [dummy()] } })), "Yuxtaposición", [H]);
    expect([ko.playerCanTakePrize, names(ko.opponentDiscard), selfDmg(ko)]).toEqual([true, ["Sabrina's Abra"], 0]);
    // Mewtwo (70 HP) gets 70: Knocked Out, the opponent takes a Prize
    const selfKo = attack(deepFreeze(vs(gym(14), dummy({ damage: 70 }), { player: { bench: [dummy()] } })), "Yuxtaposición", [H]);
    expect([selfKo.playerActivePokemon, prizesOwed(selfKo, "opponent"), dmg(selfKo)]).toEqual([null, 1, 0]);
  });

  it("#15 Electroburn: 70, and 10 to itself per Lightning Energy card attached", () => {
    const next = attack(deepFreeze(vs(gym(15), dummy())), "Electroquemadura");
    expect([dmg(next), selfDmg(next)]).toEqual([70, 40]);
  });

  it("#21 Burn Up: tails discards every Fire Energy card; heads keeps them", () => {
    const state = deepFreeze(vs(gym(21, { energy: [Fire, Fire, Fire] }), dummy()));
    const tails = attack(state, "Quemar", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.attachedEnergy.length]).toEqual([50, 0]);
    expect(attack(state, "Quemar", [H]).playerActivePokemon!.attachedEnergy.length).toBe(3);
  });

  it("#22 Earthdrill: only if Brock's Dugtrio used Lie Low during its owner's previous turn", () => {
    const dugtrio = gym(22);
    const state = armedState(vs(dugtrio, dummy()), "Taladro Terrestre");
    expect(blocker(state, "Taladro Terrestre")).toMatch(/Agazaparse/);
    const lowered = attack(deepFreeze(vs(dugtrio, dummy())), "Agazaparse").playerActivePokemon!;
    expect(lowered.lastAttack).toEqual({ name: "Agazaparse", turn: 3 });
    const next = (turnNumber: number) => armedState(vs(lowered, dummy(), { turnNumber }), "Taladro Terrestre");
    expect(blocker(next(5), "Taladro Terrestre")).toBeNull();
    expect(blocker(next(7), "Taladro Terrestre")).toMatch(/Agazaparse/);
    expect(dmg(attack(next(5), "Taladro Terrestre"))).toBe(60);
  });

  it("#23 Love Lariat: heads → 50, +50 with at least 1 Giovanni's Nidoking on the Bench; tails → nothing", () => {
    const alone = deepFreeze(vs(gym(23), dummy()));
    expect(dmg(attack(alone, "Lariat del Amor", [H]))).toBe(50);
    expect(dmg(attack(alone, "Lariat del Amor", [T]))).toBe(0);
    const withKings = deepFreeze(vs(gym(23), dummy(), { player: { bench: [gym(7), gym(7)] } }));
    expect(dmg(attack(withKings, "Lariat del Amor", [H]))).toBe(100);
  });

  it("#25 Poison Power: 20; while Koga's Arbok is Poisoned, 40 and the Defending Pokémon is Poisoned", () => {
    const healthy = attack(deepFreeze(vs(gym(25), dummy())), "Poder Venenoso");
    expect([dmg(healthy), statuses(healthy.opponentActivePokemon)]).toEqual([20, []]);
    const poisoned = attack(deepFreeze(vs(gym(25, { statuses: [Poisoned] }), dummy())), "Poder Venenoso");
    expect([dmg(poisoned), statuses(poisoned.opponentActivePokemon)]).toEqual([40, [Poisoned]]);
  });

  it("#30 Damage Shift: 1 damage counter from each of your damaged Pokémon to the Defending Pokémon", () => {
    const state = deepFreeze(vs(gym(30, { damage: 20 }), dummy({ damage: 10 }), { player: { bench: [dummy({ damage: 30 }), dummy()] } }));
    const next = attack(state, "Desplazar Daño");
    expect([selfDmg(next), benchDmg(next.playerBench), dmg(next)]).toEqual([10, [20, 0], 30]);
  });

  it("#31 Bonfire: 1 Fire Energy card discarded and 10 to each opposing Pokémon per heads, no W/R", () => {
    const fireWeak = { ...dummy(), pokemon: { ...(dummy().pokemon as PokemonCard), weaknesses: [Fire] } } as PokemonInPlay;
    const state = deepFreeze(vs(gym(31, { energy: [Fire] }), fireWeak, { opponent: { bench: [dummy(), dummy()] } }));
    expect(coinsFor(state, "Hoguera")).toBe(3);
    const next = attack(state, "Hoguera", [H, T, H]);
    expect([dmg(next), benchDmg(next.opponentBench), next.playerActivePokemon!.attachedEnergy.length]).toEqual([20, [20, 20], 2]);
    const none = attack(state, "Hoguera", [T, T, T]);
    expect([dmg(none), benchDmg(none.opponentBench), none.playerActivePokemon!.attachedEnergy.length]).toEqual([0, [0, 0], 4]);
  });

  it.each([
    [34, "Detonar", 50, 50, [10]],
    [35, "Megapaliza", 60, 20, []],
  ] as const)("#%i %s: %i damage, %i to itself, the Stadium in play is discarded", (number, name, damage, self, bench) => {
    const stadium = gameCard("Resistance Gym", "gym-challenge");
    const state = deepFreeze(vs(gym(number), dummy(), {
      player: { bench: bench.length ? [dummy()] : [] },
      opponent: { bench: bench.length ? [dummy()] : [] },
      stadium: { card: stadium, playedBy: "opponent" },
    }));
    const next = attack(state, name);
    expect([dmg(next), selfDmg(next), next.stadium ?? null, names(next.opponentDiscard)]).toEqual([damage, self, null, ["Resistance Gym"]]);
    expect([benchDmg(next.playerBench), benchDmg(next.opponentBench)]).toEqual([[...bench], [...bench]]);
    expect(attack(deepFreeze(vs(gym(number), dummy())), name).stadium ?? null).toBeNull();
  });

  it("#39 Errand-Running: heads → you may take a Trainer card from your deck into your hand", () => {
    const deck = [gameCard("Potion", "base"), energy(Grass), gameCard("Bill", "base")];
    const state = deepFreeze(vs(gym(39), dummy(), { player: { deck } }));
    const heads = attack(state, "Hacer Recados", [H]);
    expect(names(takeable(heads.pendingAttackChoice!.step)).sort()).toEqual(["Bill", "Potion"]);
    const done = choose(heads, [heads.pendingAttackChoice!.step.options.find((o) => o.label === "Bill")!.id]);
    expect([names(done.playerHand), done.playerDeck.length]).toEqual([["Bill"], 2]);
    expect(attack(state, "Hacer Recados", [T]).pendingAttackChoice).toBeUndefined();
  });

  it("#42 Risky Attack: heads → 60; tails → nothing to the Defending Pokémon and 100 to itself", () => {
    const state = deepFreeze(vs(gym(42), dummy(), { player: { bench: [dummy()] } }));
    const heads = attack(state, "Ataque Arriesgado", [H]);
    expect([dmg(heads), selfDmg(heads)]).toEqual([60, 0]);
    const tails = attack(state, "Ataque Arriesgado", [T]);
    expect([dmg(tails), tails.playerActivePokemon, names(tails.playerDiscard)]).toEqual([0, null, expect.arrayContaining(["Giovanni's Machoke"])]);
  });

  it.each([
    [45, "Desgarro", 20, 40],
    [69, "Puño Contenido", 40, 10],
  ] as const)("#%i %s: %i against an undamaged Defending Pokémon, %i against a damaged one", (number, name, clean, damaged) => {
    expect(dmg(attack(deepFreeze(vs(gym(number), dummy())), name))).toBe(clean);
    expect(dmg(attack(deepFreeze(vs(gym(number), dummy({ damage: 10 }))), name)) - 10).toBe(damaged);
  });

  it("#53 Focus Energy: during your next turn Double-edge's damage and self damage are doubled", () => {
    const focused = attack(deepFreeze(vs(gym(53), dummy())), "Foco Energía").playerActivePokemon!;
    expect(focused.doubledAttack).toEqual({ name: "Doble Filo", onTurn: 5 });
    const later = (turnNumber: number) => deepFreeze(vs(focused, dummy(), { turnNumber }));
    const doubled = attack(later(5), "Doble Filo");
    expect([dmg(doubled), selfDmg(doubled)]).toEqual([80, 40]);
    const plain = attack(later(7), "Doble Filo");
    expect([dmg(plain), selfDmg(plain)]).toEqual([40, 20]);
  });

  it("#54 Ice Throw: base damage doubled against a Fighting Pokémon", () => {
    expect(dmg(attack(deepFreeze(vs(gym(54), dummy())), "Lanzamiento de Hielo"))).toBe(20);
    const fighting = gym(72); // Giovanni's Machop
    expect(dmg(attack(deepFreeze(vs(gym(54), fighting)), "Lanzamiento de Hielo"))).toBe(40);
  });

  it("#56 Pendulum Curse: a coin per damage counter on the Defending Pokémon, 20 per heads", () => {
    const state = deepFreeze(vs(gym(56), dummy({ damage: 30 })));
    expect(coinsFor(state, "Maldición Péndulo")).toBe(3);
    expect(dmg(attack(state, "Maldición Péndulo", [H, T, H]))).toBe(70);
    const clean = deepFreeze(vs(gym(56), dummy()));
    expect(coinsFor(clean, "Maldición Péndulo")).toBe(0);
    expect(dmg(attack(clean, "Maldición Péndulo", []))).toBe(0);
  });

  it("#58 Life Drain: heads → damage counters until the Defending Pokémon has 10 HP left", () => {
    const state = deepFreeze(vs(gym(58), dummy({ damage: 30 })));
    expect(dmg(attack(state, "Drenar Vida", [H]))).toBe(110);
    expect(dmg(attack(state, "Drenar Vida", [T]))).toBe(30);
    expect(dmg(attack(deepFreeze(vs(gym(58), dummy({ damage: 115 }))), "Drenar Vida", [H]))).toBe(115);
  });

  it("#59 Magic Darts: choose 1 of the opponent's Pokémon, 10 per heads, no W/R", () => {
    const benched = dummy();
    const state = deepFreeze(vs(gym(59), dummy(), { opponent: { bench: [benched] } }));
    expect(coinsFor(state, "Dardos Mágicos")).toBe(3);
    const next = attack(state, "Dardos Mágicos", [H, H, T]);
    expect(next.pendingAttackChoice!.step.options).toHaveLength(2);
    expect(benchDmg(choose(next, [benched.pokemon.id]).opponentBench)).toEqual([20]);
    expect(attack(state, "Dardos Mágicos", [T, T, T]).pendingAttackChoice).toBeUndefined();
  });

  it("#69 Group Therapy: both players remove 1 damage counter from each of their damaged Pokémon", () => {
    const state = deepFreeze(vs(gym(69, { damage: 20 }), dummy({ damage: 10 }), {
      player: { bench: [dummy({ damage: 10 }), dummy()] },
      opponent: { bench: [dummy({ damage: 30 })] },
    }));
    const next = attack(state, "Terapia de Grupo");
    expect([selfDmg(next), benchDmg(next.playerBench), dmg(next), benchDmg(next.opponentBench)]).toEqual([10, [0, 0], 0, [20]]);
  });

  it("#76 Retaliation: needs 2 or more damage counters on Giovanni's Nidoran ♂", () => {
    const at = (damage: number) => armedState(vs(gym(76, { damage }), dummy()), "Venganza");
    expect(blocker(at(10), "Venganza")).toMatch(/contadores/);
    expect(blocker(at(20), "Venganza")).toBeNull();
    expect(dmg(attack(at(20), "Venganza"))).toBe(30);
  });

  it("#77 Fast-Acting Poison: both heads → Confused and Poisoned", () => {
    const state = deepFreeze(vs(gym(77), dummy()));
    const both = attack(state, "Veneno Fulminante", [H, H]);
    expect([dmg(both), statuses(both.opponentActivePokemon)]).toEqual([10, [Confused, Poisoned]]);
    expect(statuses(attack(state, "Veneno Fulminante", [H, T]).opponentActivePokemon)).toEqual([]);
  });

  it("#78 Sludge Grip: heads → a Benched Pokémon you choose becomes the Defending Pokémon and is Poisoned", () => {
    const old = dummy();
    const benched = dummy();
    const state = deepFreeze(vs(gym(78), old, { opponent: { bench: [benched] } }));
    const heads = attack(state, "Agarre de Lodo", [H]);
    const done = choose(heads, [benched.pokemon.id]);
    expect(done.opponentActivePokemon!.pokemon.id).toBe(benched.pokemon.id);
    expect([statuses(done.opponentActivePokemon), done.opponentActivePokemon!.currentDamage]).toEqual([[Poisoned], 0]);
    expect(done.opponentBench.map((p) => p.pokemon.id)).toEqual([old.pokemon.id]);
    expect(attack(state, "Agarre de Lodo", [T]).pendingAttackChoice).toBeUndefined();
  });

  it("#87 Ink Spurt: heads → the Defending Pokémon flips to attack until it evolves or is Benched", () => {
    const state = deepFreeze(vs(gym(87), dummy()));
    const heads = attack(state, "Chorro de Tinta", [H]);
    expect([dmg(heads), heads.opponentActivePokemon!.mustFlipToAttack]).toEqual([20, true]);
    const later = endTurn(endTurn(endTurn(heads)));
    expect(later.opponentActivePokemon!.mustFlipToAttack).toBe(true);
    expect(attack(state, "Chorro de Tinta", [T]).opponentActivePokemon!.mustFlipToAttack).toBeFalsy();
  });

  it("#92 Star Boomerang: heads → 20, then Misty's Staryu and its cards go back to your hand", () => {
    const state = deepFreeze(vs(gym(92), dummy(), { player: { bench: [dummy()] } }));
    const heads = attack(state, "Bumerán Estelar", [H]);
    expect([dmg(heads), heads.playerActivePokemon, names(heads.playerHand).sort()]).toEqual([20, null, ["Misty's Staryu", "Water Energy"]]);
    expect(heads.playerNeedsToPromote).toBe(true);
    const tails = attack(state, "Bumerán Estelar", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.pokemon.name]).toEqual([20, "Misty's Staryu"]);
  });

  it("#93 Synchronize: only with as many Energy cards attached as the Defending Pokémon", () => {
    const abra = armedFor(gym(93), "Sincronizar"); // 2 Energy cards
    expect(blocker(vs(abra, dummy({ energy: [Psychic, Psychic] })), "Sincronizar")).toBeNull();
    expect(blocker(vs(abra, dummy({ energy: [Psychic] })), "Sincronizar")).toMatch(/Energía/);
  });

  it("#99 Random ESP: heads → 20 and Confused; tails → nothing to the Defending Pokémon, Sabrina's Psyduck is Confused", () => {
    const state = deepFreeze(vs(gym(99), dummy()));
    const heads = attack(state, "Percepción Aleatoria", [H]);
    expect([dmg(heads), statuses(heads.opponentActivePokemon), statuses(heads.playerActivePokemon)]).toEqual([20, [Confused], []]);
    const tails = attack(state, "Percepción Aleatoria", [T]);
    expect([dmg(tails), statuses(tails.opponentActivePokemon), statuses(tails.playerActivePokemon)]).toEqual([0, [], [Confused]]);
  });
});
