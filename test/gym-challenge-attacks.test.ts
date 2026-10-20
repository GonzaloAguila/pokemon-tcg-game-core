/**
 * Gym Challenge attack effects (texts in data/pokemontcg/gym2.json; rulings in
 * docs/card-doubts.md → "Gym Challenge").
 *
 * Task 1 of docs/superpowers/plans/2026-10-19-gym-challenge.md: the attacks that fit the
 * existing AttackEffectType vocabulary (data only). Attacks without text (plain damage) need no
 * effect and are checked in the last table.
 *
 * | # | Card | Attack | Effect data |
 * |---|---|---|---|
 * | 1 | Blaine's Arcanine | Heat Tackle | SelfDamage |
 * | 1 | Blaine's Arcanine | Firestorm | Discard cost `[Fire, Fire, Fire]` |
 * | 2 | Blaine's Charizard | Flame Jet | ChooseTargetDamage any opponent's Pokémon (coin, no W/R) |
 * | 4 | Erika's Venusaur | Wide Solarbeam | BenchDamage opponent, exactly 2 chosen (`exactBenchTargets`) |
 * | 5 | Giovanni's Gyarados | Dragon Tornado | ForceSwitch (attacker chooses; not after a Knock Out) |
 * | 6 | Giovanni's Machamp | Hurricane Punch | CoinFlipDamage ×4 |
 * | 7 | Giovanni's Nidoking | Tumbling Attack | CoinFlipDamage (+30) |
 * | 8 | Giovanni's Persian | Ambush | CoinFlipDamage (+20) |
 * | 9 | Koga's Beedrill | Nerve Poison | ApplyStatus Paralyzed + `additionalStatuses` Poisoned (coin) |
 * | 9 | Koga's Beedrill | Hyper Needle | AttackFails `defenderOnly` onTails + UseOnce |
 * | 11 | Lt. Surge's Raichu | Thundertackle | ApplyStatus Paralyzed (heads) + SelfDamage (tails) |
 * | 12 | Misty's Golduck | Electro Beam | Discard Self `discardAll` onTails |
 * | 14 | Rocket's Mewtwo | Hypnoblast | ApplyStatus Asleep (coin) |
 * | 15 | Rocket's Zapdos | Plasma | AttachEnergyFromDiscard (1 Lightning) |
 * | 16 | Sabrina's Alakazam | Mega Burn | CantAttackNextTurn `thisAttackOnly` |
 * | 22 | Brock's Dugtrio | Lie Low | ReduceDamage 20 |
 * | 24 | Giovanni's Pinsir | Snapping Pincers | CoinFlipDamage (+10) |
 * | 24 | Giovanni's Pinsir | Aerial Toss | BenchDamage own, 1 chosen, onTails |
 * | 25 | Koga's Arbok | Poison Buildup | ApplyStatus Self Poisoned |
 * | 27 | Koga's Pidgeotto | Quick Turn | CoinFlipDamage ×2 |
 * | 27 | Koga's Pidgeotto | Aerial Acrobatics | CoinFlipDamage (+30) + Protection damageAndEffects (same coin) |
 * | 28 | Lt. Surge's Jolteon | High Voltage | BlockTrainers (coin) |
 * | 28 | Lt. Surge's Jolteon | Thunder Flare | DamagePerCounter Self + SelfDamage onTails |
 * | 29 | Sabrina's Gengar | Shadow Bind | PreventRetreat |
 * | 30 | Sabrina's Golduck | Water Spray | CoinFlipDamage (+20) |
 * | 32 | Blaine's Dodrio | Mega Peck | AttackFails onTails |
 * | 33 | Blaine's Rapidash | Stamp | CoinFlipDamage (+10) + BenchDamage opponent (heads) |
 * | 36 | Brock's Sandslash | Swift | IgnoreDefenderEffects |
 * | 36 | Brock's Sandslash | Needle Ball | ApplyStatus Poisoned (coin) |
 * | 37 | Brock's Vulpix | Hypnotic Eyes | ApplyStatus Asleep |
 * | 37 | Brock's Vulpix | Fire Ring | BenchDamage opponent, 1 chosen |
 * | 38 | Erika's Bellsprout | Stretch Vine | BenchDamage opponent, 1 chosen |
 * | 39 | Erika's Bulbasaur | Sleep Seed | ApplyStatus Asleep |
 * | 41 | Erika's Ivysaur | Double Razor Leaf | CoinFlipDamage ×2 |
 * | 42 | Giovanni's Machoke | Headlock | CoinFlipDamage (+20) + ApplyStatus Paralyzed (same coin) |
 * | 43 | Giovanni's Meowth | Double Scratch | CoinFlipDamage ×2 |
 * | 44 | Giovanni's Nidorina | Poison Tackle | SelfDamage + ApplyStatus Poisoned (coin) |
 * | 44, 62 | Giovanni's Nidorina, Blaine's Growlithe | Body Slam | ApplyStatus Paralyzed (coin) |
 * | 46 | Koga's Golbat | Sonic Scream | ApplyStatus Confused (coin) |
 * | 47 | Koga's Kakuna | Toxic Secretion | ApplyStatus Poisoned `poisonDamage: 20` (coin) |
 * | 48 | Koga's Koffing | Smokescreen | SandAttack |
 * | 48 | Koga's Koffing | Obscuring Gas | ShuffleSelfIntoDeck `withAttachedCards` (heads) |
 * | 50 | Koga's Weezing | Spontaneous Explosion | CoinFlipDamage (+30) + SelfDamage (heads) |
 * | 50 | Koga's Weezing | Toxic Cloud | ApplyStatus Poisoned `poisonDamage: 20` (coin) |
 * | 52 | Lt. Surge's Electrode | Power Ball | CoinFlipDamage +10 per heads, 3 coins |
 * | 53, 54, 75 | Raticate, Dewgong, Nidoran ♀ | Double-edge / Take Down | SelfDamage |
 * | 55 | Sabrina's Haunter | Nightmare | ApplyStatus Asleep |
 * | 55 | Sabrina's Haunter | Shadow Attack | ChooseTargetDamage Bench (coin) |
 * | 57 | Sabrina's Jynx | Hug | PreventRetreat (coin) |
 * | 60 | Blaine's Charmander | Fire Tail Slap | RequireAttachedEnergy Fire + Discard 1 Fire onTails |
 * | 61 | Blaine's Doduo | Wild Kick | AttackFails onTails |
 * | 61 | Blaine's Doduo | Retaliate | DamagePerCounter Self |
 * | 62 | Blaine's Growlithe | Stoke | AttachEnergyFromDeck Fire |
 * | 63 | Blaine's Mankey | Fury Swipes | CoinFlipDamage ×3 |
 * | 64 | Blaine's Ponyta | Hind Kick | SelfSwitch (heads) |
 * | 65 | Blaine's Rhyhorn | Horn Attack | AttackFails onTails |
 * | 65 | Blaine's Rhyhorn | Trample | ChooseTargetDamage Bench (coin) |
 * | 67 | Brock's Diglett | Surprise Attack | AttackFails onTails |
 * | 67 | Brock's Diglett | Earthquake | BenchDamage own |
 * | 68 | Brock's Geodude | Rock Throw | CoinFlipDamage ×3 |
 * | 70 | Erika's Oddish | Strange Powder | ApplyStatus heads Confused / tails Asleep |
 * | 71 | Erika's Paras | Poison Spore | ApplyStatus Poisoned + BenchDamage opponent (heads) |
 * | 72 | Giovanni's Machop | Fury Punch | DamagePerCounter Self 20 (heads) |
 * | 73 | Giovanni's Magikarp | Lunge | AttackFails `defenderOnly` onTails + UseOnce |
 * | 73 | Giovanni's Magikarp | Flail Around | CoinFlipDamage ×3 |
 * | 74 | Giovanni's Meowth | Cat Flea | ApplyStatus Confused (coin) |
 * | 75 | Giovanni's Nidoran ♀ | Horn Rush | AttackFails onTails |
 * | 76 | Giovanni's Nidoran ♂ | Double Kick | CoinFlipDamage ×2 |
 * | 79 | Koga's Koffing | Foul Gas | BenchDamage both (heads) |
 * | 80, 91 | Koga's Pidgey, Misty's Seel | Sand-attack, Mirage | SandAttack |
 * | 81 | Koga's Tangela | Sleep Powder | ApplyStatus Asleep |
 * | 81 | Koga's Tangela | Grasping Vine | Draw 2 (heads) |
 * | 82 | Koga's Weedle | Sharp Stinger | ApplyStatus heads Poisoned / tails Paralyzed |
 * | 84, 85, 94 | Pikachu, Rattata, Abra | Quick Attack | CoinFlipDamage (+20) |
 * | 85 | Lt. Surge's Rattata | Focus Energy | BonusDamage Self 10 next turn (Quick Attack base 10 → 20) |
 * | 86 | Lt. Surge's Voltorb | Bouncing Ball | SelfDamage onTails |
 * | 88 | Misty's Magikarp | Play Dead | Protection damageAndEffects (coin) |
 * | 89 | Misty's Poliwag | Bubbles | CantAttackNextTurn `thisAttackOnly` onTails |
 * | 91 | Misty's Seel | Freeze | PreventRetreat |
 * | 95 | Sabrina's Drowzee | Energy Support | SearchDeckChoice (1 Psychic Energy → hand) |
 * | 95 | Sabrina's Drowzee | Mind Shock | IgnoreWeaknessResistance |
 * | 96 | Sabrina's Gastly | Lick | ApplyStatus Paralyzed (coin) |
 * | 98 | Sabrina's Porygon | Barrier Attack | ReduceDamage 10 |
 */
import { describe, it, expect } from "vitest";
import { canUseAttack, endTurn, executeAttack, getAttackCoinPlan, resolveAttackChoice } from "@/lib/gameState";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { gymChallengeCards } from "@/domain/catalog";
import type { PokemonCard } from "@/domain/cards";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze, takeable } from "./helpers/state";

const { Water, Fire, Lightning, Psychic } = EnergyType;
const { Asleep, Confused, Paralyzed, Poisoned } = StatusCondition;
const H = "heads" as const;
const T = "tails" as const;
type Coin = typeof H | typeof T;

const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const choose = (state: GameState, selection: string[]) => resolveAttackChoice(state, selection, { skipEndTurn: true });

let uid = 0;
/** A Gym Challenge card in play, by printed number (several cards share a name). */
function gym(number: number, opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const card = structuredClone(gymChallengeCards.find((c) => c.number === number)!);
  uid += 1;
  return { ...inPlay("Abra", opts), pokemon: { ...card, id: `${card.id}#g${uid}` } as GameCard };
}
/** A 120 HP Defending Pokémon without Weakness, Resistance or power (Chansey without W/R). */
function dummy(opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const p = inPlay("Chansey", opts);
  return { ...p, pokemon: { ...(p.pokemon as PokemonCard), weaknesses: [], resistances: [] } };
}
/** The state with the attacker armed for `name` (attacks are only legal when paid). */
function armedState(state: GameState, name: string): GameState {
  return { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
}
/** Attack by name with these coins (the attacker gets the Energy it needs), without ending the turn. */
function attack(state: GameState, name: string, coins: Coin[] = []): GameState {
  const armed = armedState(state, name);
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
const dmg = (state: GameState) => state.opponentActivePokemon!.currentDamage;
const statuses = (state: GameState) => [...(state.opponentActivePokemon!.statusConditions ?? [])].sort();
const selfDmg = (state: GameState) => state.playerActivePokemon!.currentDamage;
const benchDmg = (bench: PokemonInPlay[]) => bench.map((p) => p.currentDamage);

describe("Gym Challenge attacks on the existing effect vocabulary", () => {
  it.each([
    [14, "Hipnoexplosión", 20, Asleep],
    [36, "Bola Aguja", 30, Poisoned],
    [44, "Golpe Cuerpo", 20, Paralyzed],
    [46, "Grito Sónico", 30, Confused],
    [62, "Golpe Cuerpo", 20, Paralyzed],
    [74, "Pulgas de Gato", 0, Confused],
    [96, "Lengüetazo", 10, Paralyzed],
  ] as const)("#%i %s: %i damage; heads = %s", (number, name, damage, condition) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    const heads = attack(state, name, [H]);
    expect([dmg(heads), statuses(heads)]).toEqual([damage, [condition]]);
    const tails = attack(state, name, [T]);
    expect([dmg(tails), statuses(tails)]).toEqual([damage, []]);
  });

  it.each([
    [70, "Polvo Extraño", 10, Confused, Asleep],
    [82, "Aguijón Afilado", 10, Poisoned, Paralyzed],
  ] as const)("#%i %s: %i damage; heads = %s, tails = %s", (number, name, damage, onHeads, onTails) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    const heads = attack(state, name, [H]);
    expect([dmg(heads), statuses(heads)]).toEqual([damage, [onHeads]]);
    expect(statuses(attack(state, name, [T]))).toEqual([onTails]);
  });

  it.each([
    [37, "Ojos Hipnóticos", 0],
    [39, "Semilla Somnífera", 10],
    [55, "Pesadilla", 20],
    [81, "Somnífero", 10],
  ] as const)("#%i %s: %i damage, the Defending Pokémon is Asleep", (number, name, damage) => {
    const next = attack(deepFreeze(vs(gym(number), dummy())), name);
    expect([dmg(next), statuses(next)]).toEqual([damage, [Asleep]]);
  });

  it.each([
    [6, "Puño Huracán", [H, T, H, H], 90],
    [27, "Giro Rápido", [H, H], 60],
    // #41 Doble Hoja Afilada (Erika's Ivysaur): its own Relaxing Scent halves it (gym-challenge-powers.test.ts)
    [43, "Doble Arañazo", [T, T], 0],
    [52, "Bola Potente", [H, T, H], 50],
    [63, "Golpes Furia", [H, H, T], 20],
    [68, "Lanzar Roca", [H, H, H], 30],
    [73, "Agitarse", [T, H, T], 10],
    [76, "Doble Patada", [H, H], 20],
  ] as const)("#%i %s: coins %j → %i damage", (number, name, coins, damage) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    expect(getAttackCoinPlan(armedState(state, name), attackIndex(state.playerActivePokemon!, name)).attack).toBe(coins.length);
    expect(dmg(attack(state, name, [...coins]))).toBe(damage);
  });

  it.each([
    [7, "Ataque Voltereta", 40, 30],
    [8, "Emboscada", 20, 20],
    [24, "Pinzas Cortantes", 10, 10],
    [30, "Rociada de Agua", 20, 20],
    [84, "Ataque Rápido", 10, 20],
    [85, "Ataque Rápido", 10, 20],
    [94, "Ataque Rápido", 10, 20],
  ] as const)("#%i %s: %i, +%i on heads", (number, name, base, bonus) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    expect([dmg(attack(state, name, [H])), dmg(attack(state, name, [T]))]).toEqual([base + bonus, base]);
  });

  it.each([
    [32, "Megapicotazo", 50],
    [61, "Patada Salvaje", 20],
    [65, "Carga Cuerno", 30],
    [67, "Ataque Sorpresa", 20],
    [75, "Embestida de Cuerno", 20],
  ] as const)("#%i %s: %i, tails = nothing", (number, name, damage) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    expect([dmg(attack(state, name, [H])), dmg(attack(state, name, [T]))]).toEqual([damage, 0]);
  });

  it.each([
    [1, "Placaje Calor", 40, 10],
    [53, "Doble Filo", 40, 20],
    [54, "Derribo", 60, 20],
    [75, "Doble Filo", 30, 20],
  ] as const)("#%i %s: %i damage and %i to itself", (number, name, damage, self) => {
    const next = attack(deepFreeze(vs(gym(number), dummy())), name);
    expect([dmg(next), selfDmg(next)]).toEqual([damage, self]);
  });

  it("#11 Placaje Trueno: 40; heads = Paralyzed, tails = 20 to itself; #86 Bola Rebotadora: 30, tails = 10 to itself", () => {
    const raichu = deepFreeze(vs(gym(11), dummy()));
    const heads = attack(raichu, "Placaje Trueno", [H]);
    expect([dmg(heads), statuses(heads), selfDmg(heads)]).toEqual([40, [Paralyzed], 0]);
    const tails = attack(raichu, "Placaje Trueno", [T]);
    expect([dmg(tails), statuses(tails), selfDmg(tails)]).toEqual([40, [], 20]);
    const voltorb = deepFreeze(vs(gym(86), dummy()));
    expect([dmg(attack(voltorb, "Bola Rebotadora", [H])), selfDmg(attack(voltorb, "Bola Rebotadora", [H]))]).toEqual([30, 0]);
    expect([dmg(attack(voltorb, "Bola Rebotadora", [T])), selfDmg(attack(voltorb, "Bola Rebotadora", [T]))]).toEqual([30, 10]);
  });

  it("can't retreat next turn: #29 Atadura Sombría, #91 Congelación; #57 Abrazo on heads", () => {
    for (const [number, name, damage] of [[29, "Atadura Sombría", 40], [91, "Congelación", 10]] as const) {
      const next = attack(vs(gym(number), dummy()), name);
      expect([dmg(next), next.opponentActivePokemon!.retreatPrevented]).toEqual([damage, true]);
    }
    const hug = deepFreeze(vs(gym(57), dummy()));
    const heads = attack(hug, "Abrazo", [H]);
    expect([dmg(heads), heads.opponentActivePokemon!.retreatPrevented]).toEqual([20, true]);
    expect(attack(hug, "Abrazo", [T]).opponentActivePokemon!.retreatPrevented).toBeFalsy();
  });

  it("Smokescreen: #48 Pantalla de Humo, #80 Ataque Arena, #91 Espejismo", () => {
    for (const [number, name, damage] of [[48, "Pantalla de Humo", 10], [80, "Ataque Arena", 20], [91, "Espejismo", 10]] as const) {
      const next = attack(vs(gym(number), dummy()), name);
      expect([dmg(next), next.opponentActivePokemon!.mustFlipToAttack]).toEqual([damage, true]);
    }
  });

  it("#1 Tormenta de Fuego: 120, discarding 3 of the Fire Energy cards attached", () => {
    // A 200 HP Defending Pokémon (not Knocked Out by 120)
    const tank = dummy();
    const next = attack(deepFreeze(vs(gym(1), { ...tank, pokemon: { ...(tank.pokemon as PokemonCard), hp: 200 } })), "Tormenta de Fuego");
    expect([dmg(next), names(next.playerDiscard), names(next.playerActivePokemon!.attachedEnergy)]).toEqual([
      120,
      ["Fire Energy", "Fire Energy", "Fire Energy"],
      ["Fire Energy"],
    ]);
  });

  it("#2 Chorro de Llamas: heads = 40 to the chosen opponent's Pokémon (Active or Benched), no Weakness; tails = nothing", () => {
    // Ivysaur is weak to Fire: still 40
    const bulbasaur = inPlay("Ivysaur");
    const machop = inPlay("Machop");
    const state = deepFreeze(vs(gym(2), bulbasaur, { opponent: { bench: [machop] } }));
    const tails = attack(state, "Chorro de Llamas", [T]);
    expect([tails.pendingAttackChoice, dmg(tails)]).toEqual([undefined, 0]);
    const heads = attack(state, "Chorro de Llamas", [H]);
    expect(heads.pendingAttackChoice!.step.options.map((o) => o.id).sort()).toEqual([bulbasaur.pokemon.id, machop.pokemon.id].sort());
    expect(dmg(choose(heads, [bulbasaur.pokemon.id]))).toBe(40);
    expect(benchDmg(choose(heads, [machop.pokemon.id]).opponentBench)).toEqual([40]);
  });

  it("#4 Rayo Solar Amplio: 20 and 20 to exactly 2 chosen Benched Pokémon (the only one with 1)", () => {
    const three = attack(vs(gym(4), dummy(), { opponent: { bench: [inPlay("Machop"), inPlay("Abra"), inPlay("Onix")] } }), "Rayo Solar Amplio");
    const pending = three.pendingBenchDamageSelection!;
    expect([dmg(three), pending.damageAmount, pending.minTargets, pending.maxTargets]).toEqual([20, 20, 2, 2]);
    const one = attack(vs(gym(4), dummy(), { opponent: { bench: [inPlay("Machop")] } }), "Rayo Solar Amplio");
    expect([one.pendingBenchDamageSelection, benchDmg(one.opponentBench)]).toEqual([undefined, [20]]);
  });

  it("#5 Tornado Dragón: 40, then the attacker switches the Defending Pokémon (unless it was Knocked Out)", () => {
    const bench = { opponent: { bench: [inPlay("Machop")] } };
    const next = attack(vs(gym(5), dummy(), bench), "Tornado Dragón");
    expect([dmg(next), next.pendingForceSwitch]).toEqual([40, true]);
    const knockedOut = attack(vs(gym(5), dummy({ damage: 100 }), bench), "Tornado Dragón");
    // The Knocked Out Pokémon is replaced as usual (Machop promoted), nothing more to switch
    expect([knockedOut.opponentActivePokemon!.pokemon.name, knockedOut.opponentBench, knockedOut.pendingForceSwitch]).toEqual(["Machop", [], undefined]);
  });

  it("#9 Veneno Nervioso: 20; heads = Paralyzed and Poisoned", () => {
    const state = deepFreeze(vs(gym(9), dummy()));
    expect(statuses(attack(state, "Veneno Nervioso", [H]))).toEqual([Paralyzed, Poisoned].sort());
    expect(statuses(attack(state, "Veneno Nervioso", [T]))).toEqual([]);
  });

  it.each([
    [9, "Híper Aguja", 70],
    [73, "Memoria Ancestral", 40],
  ] as const)("#%i %s: %i, tails = nothing; either way it can't be used again", (number, name, damage) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    for (const [coin, expected] of [[H, damage], [T, 0]] as const) {
      const next = attack(state, name, [coin]);
      expect([dmg(next), next.playerActivePokemon!.usedOnceAttacks]).toEqual([expected, [name]]);
      expect(canUseAttack(next.playerActivePokemon!, attackIndex(next.playerActivePokemon!, name))).toBe(false);
    }
  });

  it("#12 Electrorrayo: 40; tails = every Energy card attached is discarded", () => {
    const state = deepFreeze(vs(gym(12), dummy()));
    expect(attack(state, "Electrorrayo", [H]).playerActivePokemon!.attachedEnergy).toHaveLength(2);
    const tails = attack(state, "Electrorrayo", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.attachedEnergy, tails.playerDiscard.length]).toEqual([40, [], 2]);
  });

  it("#15 Plasma: 20 and 1 Lightning Energy card from the discard pile onto Rocket's Zapdos", () => {
    const discard = [energy(Water), energy(Lightning), energy(Lightning)];
    const next = attack(deepFreeze(vs(gym(15), dummy(), { player: { discard } })), "Plasma");
    const step = next.pendingAttackChoice!.step;
    expect([dmg(next), step.minSelections, step.maxSelections]).toEqual([20, 1, 1]);
    const done = choose(next, [discard[1].id]);
    expect(names(done.playerActivePokemon!.attachedEnergy)).toEqual(["Lightning Energy", "Lightning Energy"]);
    expect(names(done.playerDiscard)).toEqual(["Water Energy", "Lightning Energy"]);
  });

  it("#16 Megaquemadura: 60, not usable during your next turn; #89 Burbujas: tails = the same lock", () => {
    const state = vs(gym(16), dummy());
    const burn = attack(state, "Megaquemadura");
    expect([dmg(burn), burn.playerActivePokemon!.attackLock]).toEqual([60, { onTurn: state.turnNumber + 2, attackName: "Megaquemadura" }]);
    const poliwag = vs(gym(89), dummy());
    expect(attack(poliwag, "Burbujas", [H]).playerActivePokemon!.attackLock).toBeUndefined();
    const tails = attack(poliwag, "Burbujas", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.attackLock]).toEqual([20, { onTurn: poliwag.turnNumber + 2, attackName: "Burbujas" }]);
  });

  it("damage reduced next turn: #22 Agazaparse (20), #98 Ataque Barrera (10, after 20 damage)", () => {
    const lie = attack(vs(gym(22), dummy()), "Agazaparse");
    expect([dmg(lie), lie.playerActivePokemon!.nextTurnDamageReduction]).toEqual([0, 20]);
    const barrier = attack(vs(gym(98), dummy()), "Ataque Barrera");
    expect([dmg(barrier), barrier.playerActivePokemon!.nextTurnDamageReduction]).toEqual([20, 10]);
  });

  it("#24 Lanzamiento Aéreo: 40; tails = 20 to one of your Benched Pokémon (you choose with 2 or more)", () => {
    const one = deepFreeze(vs(gym(24), dummy(), { player: { bench: [inPlay("Abra")] } }));
    expect(benchDmg(attack(one, "Lanzamiento Aéreo", [H]).playerBench)).toEqual([0]);
    const tails = attack(one, "Lanzamiento Aéreo", [T]);
    expect([dmg(tails), benchDmg(tails.playerBench)]).toEqual([40, [20]]);
    const two = attack(vs(gym(24), dummy(), { player: { bench: [inPlay("Abra"), inPlay("Machop")] } }), "Lanzamiento Aéreo", [T]);
    expect([two.pendingBenchDamageSelection?.targetSide, two.pendingBenchDamageSelection?.maxTargets, two.pendingBenchDamageSelection?.damageAmount]).toEqual(["player", 1, 20]);
  });

  it("#25 Acumular Veneno: Koga's Arbok is now Poisoned", () => {
    expect(attack(vs(gym(25), dummy()), "Acumular Veneno").playerActivePokemon!.statusConditions).toEqual([Poisoned]);
  });

  it("#27 Maniobras Aéreas: heads = 40 and no effects of attacks next turn; tails = 10", () => {
    const state = deepFreeze(vs(gym(27), dummy()));
    const heads = attack(state, "Maniobras Aéreas", [H]);
    expect([dmg(heads), heads.playerActivePokemon!.protection?.type]).toEqual([40, "damageAndEffects"]);
    const tails = attack(state, "Maniobras Aéreas", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.protection]).toEqual([10, undefined]);
  });

  it("#28 Alto Voltaje: 20; heads = no Trainer cards for the opponent next turn", () => {
    const state = deepFreeze(vs(gym(28), dummy()));
    const heads = attack(state, "Alto Voltaje", [H]);
    expect([dmg(heads), heads.noTrainersOnTurn]).toEqual([20, state.turnNumber + 1]);
    expect(attack(state, "Alto Voltaje", [T]).noTrainersOnTurn).toBe(state.noTrainersOnTurn);
  });

  it("#28 Destello Trueno: 30 + 10 per damage counter on Jolteon; tails = 30 to itself", () => {
    const state = deepFreeze(vs(gym(28, { damage: 20 }), dummy()));
    const heads = attack(state, "Destello Trueno", [H]);
    expect([dmg(heads), selfDmg(heads)]).toEqual([50, 20]);
    const tails = attack(state, "Destello Trueno", [T]);
    expect([dmg(tails), selfDmg(tails)]).toEqual([50, 50]);
  });

  it("#33 Estampida: heads = 40 and 10 to each of the opponent's Benched Pokémon; tails = 30", () => {
    const state = deepFreeze(vs(gym(33), dummy(), { opponent: { bench: [inPlay("Machop"), inPlay("Abra")] } }));
    const heads = attack(state, "Estampida", [H]);
    expect([dmg(heads), benchDmg(heads.opponentBench)]).toEqual([40, [10, 10]]);
    const tails = attack(state, "Estampida", [T]);
    expect([dmg(tails), benchDmg(tails.opponentBench)]).toEqual([30, [0, 0]]);
  });

  it("#36 Rapidez: 20 whatever the Defending Pokémon's Weakness; #95 Choque Mental: 20, no Weakness", () => {
    // Electabuzz is weak to Fighting, Machop to Psychic
    expect(dmg(attack(vs(gym(36), inPlay("Electabuzz")), "Rapidez"))).toBe(20);
    expect(dmg(attack(vs(gym(95), inPlay("Machop")), "Choque Mental"))).toBe(20);
  });

  it("choose 1 Benched Pokémon: #37 Anillo de Fuego (20 + 10), #38 Enredadera Elástica (10)", () => {
    const bench = () => ({ opponent: { bench: [inPlay("Machop"), inPlay("Abra")] } });
    for (const [number, name, damage] of [[37, "Anillo de Fuego", 20], [38, "Enredadera Elástica", 0]] as const) {
      const next = attack(vs(gym(number), dummy(), bench()), name);
      expect([dmg(next), next.pendingBenchDamageSelection!.maxTargets, next.pendingBenchDamageSelection!.damageAmount]).toEqual([damage, 1, 10]);
    }
  });

  it("#42 Llave de Cabeza: heads = 40 and Paralyzed; tails = 20", () => {
    const state = deepFreeze(vs(gym(42), dummy()));
    const heads = attack(state, "Llave de Cabeza", [H]);
    expect([dmg(heads), statuses(heads)]).toEqual([40, [Paralyzed]]);
    const tails = attack(state, "Llave de Cabeza", [T]);
    expect([dmg(tails), statuses(tails)]).toEqual([20, []]);
  });

  it("#44 Placaje Venenoso: 30 and 20 to itself; heads = Poisoned", () => {
    const state = deepFreeze(vs(gym(44), dummy()));
    const heads = attack(state, "Placaje Venenoso", [H]);
    expect([dmg(heads), selfDmg(heads), statuses(heads)]).toEqual([30, 20, [Poisoned]]);
    const tails = attack(state, "Placaje Venenoso", [T]);
    expect([selfDmg(tails), statuses(tails)]).toEqual([20, []]);
  });

  it.each([
    [47, "Secreción Tóxica", 0],
    [50, "Nube Tóxica", 20],
  ] as const)("#%i %s: %i; heads = Poisoned for 20, even if it already was", (number, name, damage) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    const heads = attack(state, name, [H]);
    expect([dmg(heads), statuses(heads), heads.opponentActivePokemon!.poisonDamage]).toEqual([damage, [Poisoned], 20]);
    const tails = attack(state, name, [T]);
    expect([statuses(tails), tails.opponentActivePokemon!.poisonDamage]).toEqual([[], undefined]);
    const already = attack(vs(gym(number), dummy({ statuses: [Poisoned] })), name, [H]);
    expect(already.opponentActivePokemon!.poisonDamage).toBe(20);
  });

  it("#48 Gas Ofuscante: 30; heads = Koga's Koffing and its cards into the deck (after the damage)", () => {
    const state = deepFreeze(vs(gym(48), dummy(), { player: { bench: [inPlay("Abra")], deck: [] } }));
    expect(attack(state, "Gas Ofuscante", [T]).playerActivePokemon!.pokemon.name).toBe("Koga's Koffing");
    const heads = attack(state, "Gas Ofuscante", [H]);
    expect([dmg(heads), heads.playerActivePokemon, heads.playerNeedsToPromote, names(heads.playerDeck).sort()]).toEqual([
      30,
      null,
      true,
      ["Grass Energy", "Grass Energy", "Koga's Koffing"],
    ]);
  });

  it("#50 Explosión Espontánea: heads = 40 and 30 to itself; tails = 10", () => {
    const state = deepFreeze(vs(gym(50), dummy()));
    const heads = attack(state, "Explosión Espontánea", [H]);
    expect([dmg(heads), selfDmg(heads)]).toEqual([40, 30]);
    const tails = attack(state, "Explosión Espontánea", [T]);
    expect([dmg(tails), selfDmg(tails)]).toEqual([10, 0]);
  });

  it("heads = damage to 1 chosen Benched Pokémon: #55 Ataque Sombra (30), #65 Arrollar (20 + 20)", () => {
    for (const [number, name, damage, bench] of [[55, "Ataque Sombra", 0, 30], [65, "Arrollar", 20, 20]] as const) {
      const machop = inPlay("Machop");
      const state = deepFreeze(vs(gym(number), dummy(), { opponent: { bench: [machop] } }));
      expect(attack(state, name, [T]).pendingAttackChoice).toBeUndefined();
      const heads = attack(state, name, [H]);
      expect(dmg(heads)).toBe(damage);
      expect(benchDmg(choose(heads, [machop.pokemon.id]).opponentBench)).toEqual([bench]);
    }
  });

  it("#60 Coletazo de Fuego: needs a Fire Energy card attached; 20, tails = 1 of them discarded", () => {
    const state = deepFreeze(vs(gym(60), dummy()));
    expect(canUseAttack({ ...state.playerActivePokemon!, attachedEnergy: [energy(EnergyType.Colorless)] }, 0)).toBe(false);
    expect(attack(state, "Coletazo de Fuego", [H]).playerActivePokemon!.attachedEnergy).toHaveLength(1);
    const tails = attack(state, "Coletazo de Fuego", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.attachedEnergy, names(tails.playerDiscard)]).toEqual([20, [], ["Fire Energy"]]);
  });

  it("damage per counter on the attacker: #61 Represalia (10 each), #72 Puño Furia (20 each on heads)", () => {
    expect(dmg(attack(vs(gym(61, { damage: 30 }), dummy()), "Represalia"))).toBe(30);
    const machop = deepFreeze(vs(gym(72, { damage: 20 }), dummy()));
    expect([dmg(attack(machop, "Puño Furia", [H])), dmg(attack(machop, "Puño Furia", [T]))]).toEqual([40, 0]);
  });

  it("#62 Avivar: a Fire Energy card from the deck attached to Blaine's Growlithe", () => {
    const deck = [energy(Water), energy(Fire), gameCard("Abra")];
    const next = attack(deepFreeze(vs(gym(62), dummy(), { player: { deck } })), "Avivar");
    const options = next.pendingAttackChoice!.step.options.filter((o) => !o.disabled);
    expect(options.map((o) => o.label)).toEqual(["Energía Fuego"]);
    const done = choose(next, [options[0].id]);
    expect(names(done.playerActivePokemon!.attachedEnergy).slice(-1)).toEqual(["Fire Energy"]);
    expect(done.playerDeck).toHaveLength(2);
  });

  it("#64 Patada Trasera: 20; heads = switch with a Benched Pokémon", () => {
    const state = deepFreeze(vs(gym(64), dummy(), { player: { bench: [inPlay("Abra")] } }));
    const heads = attack(state, "Patada Trasera", [H]);
    expect([dmg(heads), heads.pendingSelfSwitch]).toEqual([20, true]);
    expect(attack(state, "Patada Trasera", [T]).pendingSelfSwitch).toBeFalsy();
  });

  it("#67 Temblor: 40 and 10 to each of your own Benched Pokémon", () => {
    const next = attack(vs(gym(67), dummy(), { player: { bench: [inPlay("Abra"), inPlay("Machop")] }, opponent: { bench: [inPlay("Onix")] } }), "Temblor");
    expect([dmg(next), benchDmg(next.playerBench), benchDmg(next.opponentBench)]).toEqual([40, [10, 10], [0]]);
  });

  it("#71 Espora Venenosa: heads = Poisoned and 10 to each of the opponent's Benched Pokémon; tails = nothing", () => {
    const state = deepFreeze(vs(gym(71), dummy(), { opponent: { bench: [inPlay("Machop")] } }));
    const heads = attack(state, "Espora Venenosa", [H]);
    expect([dmg(heads), statuses(heads), benchDmg(heads.opponentBench)]).toEqual([0, [Poisoned], [10]]);
    const tails = attack(state, "Espora Venenosa", [T]);
    expect([statuses(tails), benchDmg(tails.opponentBench)]).toEqual([[], [0]]);
  });

  it("#79 Gas Maloliente: 10; heads = 10 to each Benched Pokémon of both players", () => {
    const state = deepFreeze(vs(gym(79), dummy(), { player: { bench: [inPlay("Abra")] }, opponent: { bench: [inPlay("Machop")] } }));
    const heads = attack(state, "Gas Maloliente", [H]);
    expect([dmg(heads), benchDmg(heads.playerBench), benchDmg(heads.opponentBench)]).toEqual([10, [10], [10]]);
    const tails = attack(state, "Gas Maloliente", [T]);
    expect([dmg(tails), benchDmg(tails.playerBench), benchDmg(tails.opponentBench)]).toEqual([10, [0], [0]]);
  });

  it("#81 Enredadera Prensil: heads = draw 2 cards", () => {
    const state = deepFreeze(vs(gym(81), dummy(), { player: { hand: [], deck: [energy(Water), energy(Water), energy(Water)] } }));
    expect([attack(state, "Enredadera Prensil", [H]).playerHand.length, attack(state, "Enredadera Prensil", [T]).playerHand.length]).toEqual([2, 0]);
  });

  it("#85 Foco Energía: during your next turn Ataque Rápido does 20, +20 on heads", () => {
    const rattata = armedFor(armedFor(gym(85), "Foco Energía"), "Ataque Rápido");
    const focus = executeAttack(vs(rattata, dummy()), 0, { coinResults: [] });
    const back = endTurn(focus);
    expect(dmg(executeAttack(back, 1, { coinResults: [H], skipEndTurn: true }))).toBe(40);
    expect(dmg(executeAttack(back, 1, { coinResults: [T], skipEndTurn: true }))).toBe(20);
  });

  it("#88 Hacerse el Muerto: heads = no effects of attacks, damage included, next turn", () => {
    const state = deepFreeze(vs(gym(88), dummy()));
    expect(attack(state, "Hacerse el Muerto", [H]).playerActivePokemon!.protection?.type).toBe("damageAndEffects");
    expect(attack(state, "Hacerse el Muerto", [T]).playerActivePokemon!.protection).toBeUndefined();
  });

  it("#95 Apoyo de Energía: a Psychic Energy card from the deck to the hand", () => {
    const deck = [energy(Water), energy(Psychic), gameCard("Abra")];
    const next = attack(deepFreeze(vs(gym(95), dummy(), { player: { deck } })), "Apoyo de Energía");
    expect(names(takeable(next.pendingAttackChoice!.step))).toEqual(["Psychic Energy"]);
    const done = choose(next, [deck[1].id]);
    expect(names(done.playerHand)).toEqual(["Psychic Energy"]);
    expect(done.playerDeck).toHaveLength(2);
  });

  it.each([
    [3, "Fuego Fatuo", 30],
    // #13 Maremoto (Misty's Gyarados): Rebellion's coins come first (gym-challenge-powers.test.ts)
    [14, "Psicoquemadura", 60],
    [33, "Crin de Fuego", 20],
    [46, "Mordisco", 20],
    [49, "Ataque Ala", 20],
    [51, "Arañazo", 20],
    [58, "Psicodisparo", 30],
    [66, "Mordisco", 10],
    [71, "Agarre Férreo", 10],
    [74, "Patada Felina", 30],
    [80, "Picotazo", 10],
    [82, "Aguijón", 10],
    [88, "Salto", 10],
    [93, "Destructor", 10],
    [99, "Arañazo", 10],
  ] as const)("#%i %s: %i damage, no effect", (number, name, damage) => {
    const next = attack(deepFreeze(vs(gym(number), dummy())), name);
    expect([dmg(next), statuses(next), selfDmg(next)]).toEqual([damage, [], 0]);
  });
});
