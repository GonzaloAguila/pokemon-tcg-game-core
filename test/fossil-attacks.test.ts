/**
 * Fossil attack effects, card by card (texts in data/pokemontcg/fossil.txt).
 */
import { describe, it, expect } from "vitest";
import {
  canExecuteAttack,
  endTurn,
  executeAttack,
  executeMetronome,
  flipAttackCoins,
  getAttackCoinFlipCount,
  getAttackCoinPlan,
  resolveAttackChoice,
} from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { canPlayBasicPokemon } from "@/domain/board";
import { canPlayTrainerCard } from "@/domain/effects";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Water, Fire, Psychic, Fighting, Grass } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
type Coin = typeof H | typeof T;

/** Attack by name with these coins, without ending the turn. */
function attack(state: GameState, name: string, coins: Coin[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
const fossil = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "fossil", ...opts });
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });

describe("coin plans: until tails (Stone Barrage) and one coin per Benched Pokémon (Thunderstorm)", () => {
  it("Stone Barrage flips until tails: 10 × heads; the coins must be a run ending with the first tails", () => {
    const state = vs(armedFor(fossil("Geodude"), "Lluvia de Piedras"), inPlay("Machamp"));
    expect(getAttackCoinPlan(state, 0)).toEqual({ smokescreen: 0, attack: "untilTails", defender: 0 });
    expect(attack(state, "Lluvia de Piedras", [H, H, H, T]).opponentActivePokemon!.currentDamage).toBe(30);
    expect(attack(state, "Lluvia de Piedras", [T]).opponentActivePokemon!.currentDamage).toBe(0);
    expect(() => attack(state, "Lluvia de Piedras", [H, H])).toThrow(/coin/);
    expect(() => attack(state, "Lluvia de Piedras", [T, H])).toThrow(/coin/);
    let flips = 0;
    const coins = flipAttackCoins(getAttackCoinPlan(state, 0), () => (++flips < 3 ? H : T));
    expect(coins).toEqual([H, H, T]);
  });

  it("Thunderstorm: one coin per opponent's Benched Pokémon; heads = 20 to that one; Zapdos takes 10 per tails", () => {
    const bench = [inPlay("Abra"), inPlay("Machop"), inPlay("Pikachu")];
    const state = vs(armedFor(fossil("Zapdos"), "Tormenta Eléctrica"), inPlay("Onix"), { opponent: { bench } });
    expect(getAttackCoinFlipCount(state, 0)).toBe(3);
    const next = attack(state, "Tormenta Eléctrica", [H, T, H]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(40);
    expect(next.opponentBench.map((p) => p.currentDamage)).toEqual([20, 0, 20]);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("Thunderstorm with an empty bench flips nothing", () => {
    const state = vs(armedFor(fossil("Zapdos"), "Tormenta Eléctrica"), inPlay("Onix"));
    expect(getAttackCoinFlipCount(state, 0)).toBe(0);
    expect(attack(state, "Tormenta Eléctrica", []).playerActivePokemon!.currentDamage).toBe(0);
  });
});

describe("bench damage", () => {
  it("Blizzard: heads 10 to each opponent's Benched Pokémon, tails 10 to each of your own", () => {
    const state = vs(armedFor(fossil("Articuno"), "Ventisca"), inPlay("Onix"), {
      player: { bench: [inPlay("Machop")] },
      opponent: { bench: [inPlay("Machop"), inPlay("Pikachu")] },
    });
    const heads = attack(state, "Ventisca", [H]);
    expect(heads.opponentBench.map((p) => p.currentDamage)).toEqual([10, 10]);
    expect(heads.playerBench[0].currentDamage).toBe(0);
    const tails = attack(state, "Ventisca", [T]);
    expect(tails.opponentBench.map((p) => p.currentDamage)).toEqual([0, 0]);
    expect(tails.playerBench[0].currentDamage).toBe(10);
  });

  it("Gigashock: all of them when there are 3 or fewer; exactly 3 chosen when there are more", () => {
    const three = vs(armedFor(fossil("Raichu"), "Gigadescarga"), inPlay("Onix"), { opponent: { bench: [inPlay("Machop"), inPlay("Machop"), inPlay("Onix")] } });
    const auto = attack(three, "Gigadescarga");
    expect(auto.pendingBenchDamageSelection).toBeUndefined();
    expect(auto.opponentBench.map((p) => p.currentDamage)).toEqual([10, 10, 10]);

    const four = vs(armedFor(fossil("Raichu"), "Gigadescarga"), inPlay("Onix"), {
      opponent: { bench: [inPlay("Machop"), inPlay("Machop"), inPlay("Onix"), inPlay("Onix")] },
    });
    const pending = attack(four, "Gigadescarga");
    expect(pending.pendingBenchDamageSelection).toMatchObject({ maxTargets: 3, minTargets: 3 });
  });

  it("Dark Mind / Stretch Kick: choose 1 Benched Pokémon (Stretch Kick does nothing to the Defending Pokémon)", () => {
    const state = vs(armedFor(fossil("Hitmonlee"), "Patada Estirada"), inPlay("Onix"), { opponent: { bench: [inPlay("Machop"), inPlay("Abra")] } });
    const next = attack(state, "Patada Estirada");
    expect(next.pendingBenchDamageSelection).toMatchObject({ damageAmount: 20, maxTargets: 1 });
    expect(next.opponentActivePokemon!.currentDamage).toBe(0);
  });

  it("Selfdestruct (Golem): 20 to every Benched Pokémon, 100 to itself (Golem is Knocked Out, the opponent takes a Prize)", () => {
    const state = vs(armedFor(fossil("Golem"), "Autodestrucción"), fossil("Dragonite"), {
      player: { bench: [inPlay("Machop")] },
      opponent: { bench: [inPlay("Machop")] },
    });
    const next = attack(state, "Autodestrucción");
    expect(next.opponentActivePokemon!.currentDamage).toBe(70); // Dragonite resists Fighting
    expect(next.playerBench[0].currentDamage).toBe(20);
    expect(next.opponentBench[0].currentDamage).toBe(20);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.opponentPrizes).toHaveLength(5);
  });
});

describe("damage modifiers and coin outcomes", () => {
  it("Sonicboom ignores Weakness and Resistance", () => {
    const weak = attack(vs(armedFor(fossil("Magneton"), "Bomba Sónica"), inPlay("Squirtle")), "Bomba Sónica");
    expect(weak.opponentActivePokemon!.currentDamage).toBe(20);
    const resistant = attack(vs(armedFor(fossil("Magneton"), "Bomba Sónica"), inPlay("Dugtrio")), "Bomba Sónica");
    expect(resistant.opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("Dive Bomb: tails = the attack does nothing; heads = 80", () => {
    const state = vs(armedFor(fossil("Moltres"), "Bomba en Picado"), inPlay("Blastoise"));
    const tails = attack(state, "Bomba en Picado", [T]);
    expect(tails.opponentActivePokemon!.currentDamage).toBe(0);
    expect(tails.attackedThisTurn).toBe(true);
    expect(attack(state, "Bomba en Picado", [H]).opponentActivePokemon!.currentDamage).toBe(80);
  });

  it("Clamp: heads = 30 and Paralyzed; tails = nothing, not even damage", () => {
    const state = vs(armedFor(fossil("Cloyster"), "Tenaza"), inPlay("Blastoise"));
    const heads = attack(state, "Tenaza", [H]);
    expect(heads.opponentActivePokemon!.currentDamage).toBe(30);
    expect(heads.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Paralyzed);
    const tails = attack(state, "Tenaza", [T]);
    expect(tails.opponentActivePokemon!.currentDamage).toBe(0);
    expect(tails.opponentActivePokemon!.statusConditions).toEqual([]);
  });

  it("Water Gun adds 10 per extra Water Energy, at most 20 (Lapras with 4 Water: 30)", () => {
    const lapras = fossil("Lapras", { energy: [Water, Water, Water, Water] });
    expect(attack(vs(lapras, inPlay("Blastoise")), "Pistola de Agua").opponentActivePokemon!.currentDamage).toBe(30);
  });

  it("Flail (Kingler): 10 × its damage counters", () => {
    const kingler = fossil("Kingler", { damage: 30, energy: [Water] });
    expect(attack(vs(kingler, inPlay("Blastoise")), "Azote").opponentActivePokemon!.currentDamage).toBe(30);
  });
});

describe("healing from damage done", () => {
  it("Absorb: half the damage done after W/R, rounded UP to 10", () => {
    // 40 vs Blastoise → heal 20
    const kabutops = fossil("Kabutops", { damage: 50 });
    expect(attack(vs(kabutops, inPlay("Blastoise")), "Absorber").playerActivePokemon!.currentDamage).toBe(30);
    // 40 - 30 (Pidgeotto resists Fighting) = 10 → heal 5 → rounded up 10
    const pidgey = attack(vs(fossil("Kabutops", { damage: 50 }), inPlay("Pidgeotto")), "Absorber");
    expect(pidgey.playerActivePokemon!.currentDamage).toBe(40);
  });

  it("Leech Life: as many counters as the damage done (after W/R), no more than it has", () => {
    // Zubat 10 vs Machop (weak to Psychic, not Grass): 10 → heal 10
    expect(attack(vs(fossil("Zubat", { damage: 30 }), inPlay("Machop")), "Chupavidas").playerActivePokemon!.currentDamage).toBe(20);
    // Golbat 20 vs Onix (weak to Grass): 40 → heals all 30
    expect(attack(vs(fossil("Golbat", { damage: 30 }), inPlay("Onix")), "Chupavidas").playerActivePokemon!.currentDamage).toBe(0);
  });

  it("Leech Life heals nothing when the damage is prevented", () => {
    const protectedOnix = inPlay("Onix", { protection: { type: "damageOnly", expiresAfterTurn: 9 } });
    expect(attack(vs(fossil("Zubat", { damage: 30 }), protectedOnix), "Chupavidas").playerActivePokemon!.currentDamage).toBe(30);
  });

  it("Venonat's Leech Life (Jungle) heals the damage done too, not a fixed 10", () => {
    const venonat = inPlay("Venonat", { set: "jungle", damage: 30 });
    // 10 ×2 vs Onix (weak to Grass): 20 → heal 20
    expect(attack(vs(venonat, inPlay("Onix")), "Leech Life").playerActivePokemon!.currentDamage).toBe(10);
  });

  it("Spacing Out: only with damage counters; heads removes one", () => {
    const fresh = vs(armedFor(fossil("Slowpoke"), "Despiste"), inPlay("Blastoise"));
    expect(canExecuteAttack(fresh, 0)).toMatch(/requisito|contadores/);
    const hurt = vs(armedFor(fossil("Slowpoke", { damage: 20 }), "Despiste"), inPlay("Blastoise"));
    expect(canExecuteAttack(hurt, 0)).toBeNull();
    expect(attack(hurt, "Despiste", [H]).playerActivePokemon!.currentDamage).toBe(10);
    expect(attack(hurt, "Despiste", [T]).playerActivePokemon!.currentDamage).toBe(20);
  });
});

describe("Headache: the opponent can't play Trainer cards during his or her next turn", () => {
  it("blocks Trainers (and Mysterious Fossil) on the next turn only", () => {
    const bill = gameCard("Bill");
    const fossilCard = gameCard("Mysterious Fossil", "fossil");
    const state = vs(armedFor(fossil("Psyduck"), "Dolor de Cabeza"), inPlay("Machop"), { opponent: { hand: [bill, fossilCard] } });
    const afterAttack = attack(state, "Dolor de Cabeza");
    const next = endTurn(afterAttack);
    // the opponent's turn, from its own perspective
    const theirView = { ...next, playerHand: next.opponentHand, playerActivePokemon: next.opponentActivePokemon, opponentActivePokemon: next.playerActivePokemon, isPlayerTurn: true };
    expect(canPlayTrainerCard(theirView, bill.id)).toMatch(/Entrenador/);
    expect(canPlayBasicPokemon(theirView, fossilCard.id, "bench")).toMatch(/Entrenador/);
    const turnAfter = endTurn(endTurn(next));
    expect(canPlayTrainerCard({ ...turnAfter, isPlayerTurn: true, playerHand: [bill] }, bill.id)).toBeNull();
  });
});

describe("pending attack choices (generic): answered with resolveAttackChoice", () => {
  it("Hyper Beam (Golduck): the attacker chooses 1 Energy of the Defending Pokémon to discard", () => {
    const machamp = inPlay("Machamp", { energy: [Fighting, Water] });
    const state = vs(armedFor(fossil("Golduck"), "Híper Rayo"), machamp);
    const pending = attack(state, "Híper Rayo");
    const choice = pending.pendingAttackChoice!;
    expect(choice.step.chooser).toBe("self");
    expect(choice.step.options.map((o) => o.id)).toEqual(machamp.attachedEnergy.map((e) => e.id));
    expect(endTurn(pending)).toBe(pending);
    expect(() => resolveAttackChoice(pending, ["nope"])).toThrow(IllegalActionError);
    const done = resolveAttackChoice(pending, [machamp.attachedEnergy[1].id], { skipEndTurn: true });
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(names(done.opponentActivePokemon!.attachedEnergy)).toEqual(["Fighting Energy"]);
    expect(names(done.opponentDiscard)).toEqual(["Water Energy"]);
    // without skipEndTurn the turn passes
    expect(resolveAttackChoice(pending, [machamp.attachedEnergy[1].id]).isPlayerTurn).toBe(false);
  });

  it("Hyper Beam (Dragonair, Base Set) uses the same choice; no choice when the defender has no Energy", () => {
    const machamp = inPlay("Machamp", { energy: [Fighting] });
    const pending = attack(vs(inPlay("Dragonair"), machamp), "Híper Rayo");
    expect(pending.pendingAttackChoice?.step.options).toHaveLength(1);
    const none = attack(vs(inPlay("Dragonair"), inPlay("Machamp")), "Híper Rayo");
    expect(none.pendingAttackChoice).toBeUndefined();
  });

  it("Terror Strike: heads → the OPPONENT chooses which Benched Pokémon replaces the Defending one; tails → nothing", () => {
    const abra = inPlay("Abra");
    const state = vs(armedFor(fossil("Arbok"), "Golpe Terrorífico"), inPlay("Machamp"), { opponent: { bench: [inPlay("Machop"), abra] } });
    const heads = attack(state, "Golpe Terrorífico", [H]);
    expect(heads.opponentActivePokemon!.currentDamage).toBe(10);
    expect(heads.pendingAttackChoice!.step.chooser).toBe("opponent");
    const switched = resolveAttackChoice(heads, [abra.pokemon.id], { skipEndTurn: true });
    expect(switched.opponentActivePokemon!.pokemon.name).toBe("Abra");
    expect(names(switched.opponentBench.map((p) => p.pokemon))).toEqual(["Machop", "Machamp"]);
    expect(attack(state, "Golpe Terrorífico", [T]).pendingAttackChoice).toBeUndefined();
  });

  it("Prophecy: choose a deck, then the new order of its top 3 cards", () => {
    const top = [gameCard("Abra"), gameCard("Bill"), gameCard("Machop"), gameCard("Onix")];
    const state = vs(armedFor(fossil("Hypno"), "Profecía"), inPlay("Machamp"), { opponent: { deck: top } });
    const first = attack(state, "Profecía");
    expect(first.pendingAttackChoice!.step.options.map((o) => o.id)).toEqual(["player", "opponent"]);
    const second = resolveAttackChoice(first, ["opponent"], { skipEndTurn: true });
    const step = second.pendingAttackChoice!.step;
    expect(names(step.orderingCards!)).toEqual(["Abra", "Bill", "Machop"]);
    const done = resolveAttackChoice(second, ["2", "0", "1"], { skipEndTurn: true });
    expect(names(done.opponentDeck)).toEqual(["Machop", "Abra", "Bill", "Onix"]);
    expect(done.pendingAttackChoice).toBeUndefined();
  });

  it("Wildfire: discard any number of Fire Energy (0 allowed), then that many cards from the top of the opponent's deck", () => {
    const moltres = fossil("Moltres", { energy: [Fire, Fire, Fire] });
    const state = vs(moltres, inPlay("Machamp"));
    const pending = attack(state, "Fuego Salvaje");
    const step = pending.pendingAttackChoice!.step;
    expect([step.minSelections, step.maxSelections, step.options.length]).toEqual([0, 3, 3]);
    const done = resolveAttackChoice(pending, [moltres.attachedEnergy[0].id, moltres.attachedEnergy[1].id], { skipEndTurn: true });
    expect(done.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(done.opponentDeck).toHaveLength(8);
    expect(done.opponentDiscard).toHaveLength(2);
    const none = resolveAttackChoice(pending, [], { skipEndTurn: true });
    expect(none.opponentDeck).toHaveLength(10);
  });

  it("Energy Conversion: up to 2 Energy cards from the discard pile to the hand, then 10 damage to Gastly", () => {
    const discard = [energy(Psychic), energy(Water), energy(Grass), gameCard("Bill")];
    const state = vs(armedFor(fossil("Gastly"), "Conversión de Energía"), inPlay("Machamp"), { player: { discard } });
    const pending = attack(state, "Conversión de Energía");
    expect(pending.playerActivePokemon!.currentDamage).toBe(10);
    const step = pending.pendingAttackChoice!.step;
    expect([step.minSelections, step.maxSelections, step.options.length]).toEqual([0, 2, 3]);
    const done = resolveAttackChoice(pending, [discard[0].id, discard[2].id], { skipEndTurn: true });
    expect(names(done.playerHand).sort()).toEqual(["Grass Energy", "Psychic Energy"]);
  });

  it("Scavenge: discard 1 Psychic Energy from Slowpoke to use it, then a Trainer from the discard pile to the hand", () => {
    const slowpoke = fossil("Slowpoke", { energy: [Psychic, Psychic] });
    const bill = gameCard("Bill");
    const state = vs(slowpoke, inPlay("Machamp"), { player: { discard: [bill, energy(Water)] } });
    const pending = attack(state, "Rebuscar");
    expect(pending.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(pending.pendingAttackChoice!.step.options.map((o) => o.id)).toEqual([bill.id]);
    const done = resolveAttackChoice(pending, [bill.id], { skipEndTurn: true });
    expect(names(done.playerHand)).toEqual(["Bill"]);
    expect(names(done.playerDiscard)).toEqual(["Water Energy", "Psychic Energy"]);
  });

  it("Call for Family (Krabby) uses the deck search for a Krabby", () => {
    const state = vs(fossil("Krabby", { energy: [Water] }), inPlay("Machamp"), { player: { deck: [gameCard("Krabby", "fossil")] } });
    expect(attack(state, "Llamar a la Familia").pendingDeckSearch?.filter.names).toEqual(["Krabby"]);
  });
});

describe("Transparency (Haunter): the Defending side flips; heads prevents everything the attack does to Haunter", () => {
  const haunter = () => fossil("Haunter");

  it("adds one coin, LAST in coinResults, only when the attack can do something to Haunter", () => {
    const state = vs(armedFor(fossil("Ekans"), "Constricción"), haunter());
    expect(getAttackCoinPlan(state, attackIndex(state.playerActivePokemon!, "Constricción"))).toEqual({ smokescreen: 0, attack: 1, defender: 1 });
    const prophecy = vs(armedFor(fossil("Hypno"), "Profecía"), haunter());
    expect(getAttackCoinPlan(prophecy, 0)).toEqual({ smokescreen: 0, attack: 0, defender: 0 });
  });

  it("heads: no damage and no Special Condition; tails: normal", () => {
    const state = vs(armedFor(fossil("Ekans"), "Constricción"), haunter());
    const prevented = attack(state, "Constricción", [H, H]);
    expect(prevented.opponentActivePokemon!.currentDamage).toBe(0);
    expect(prevented.opponentActivePokemon!.statusConditions).toEqual([]);
    const hit = attack(state, "Constricción", [H, T]);
    expect(hit.opponentActivePokemon!.currentDamage).toBe(20);
    expect(hit.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Paralyzed);
  });

  it("doesn't work while Haunter is Asleep", () => {
    const state = vs(armedFor(fossil("Ekans"), "Constricción"), fossil("Haunter", { statuses: [StatusCondition.Asleep] }));
    expect(getAttackCoinPlan(state, attackIndex(state.playerActivePokemon!, "Constricción")).defender).toBe(0);
  });
});

describe("protection attacks", () => {
  it("Hide in Shell (heads): damage prevented during the opponent's next turn", () => {
    const shellder = attack(vs(armedFor(fossil("Shellder"), "Esconderse en el Caparazón"), inPlay("Machamp")), "Esconderse en el Caparazón", [H]);
    expect(shellder.playerActivePokemon!.protection?.type).toBe("damageOnly");
  });

  it("Harden (Graveler): 30 or less is prevented", () => {
    const graveler = attack(vs(armedFor(fossil("Graveler"), "Endurecimiento"), inPlay("Machamp")), "Endurecimiento");
    expect(graveler.playerActivePokemon!.protection).toMatchObject({ type: "damageOnly", threshold: 30 });
  });

  it("Smokescreen: the Defending Pokémon must flip to attack next turn", () => {
    const next = attack(vs(armedFor(fossil("Horsea"), "Pantalla de Humo"), inPlay("Machamp")), "Pantalla de Humo");
    expect(next.opponentActivePokemon!.mustFlipToAttack).toBe(true);
  });
});

describe("Metronome copying a Fossil attack", () => {
  it("Clefairy copies Stone Barrage: the copied attack's until-tails plan", () => {
    const clefairy = armedFor(inPlay("Clefairy"), "Metrónomo");
    const geodude = fossil("Geodude");
    const state = deepFreeze(vs(clefairy, geodude));
    if (geodude.pokemon.kind !== "pokemon") throw new Error("not a Pokémon");
    const stoneBarrage = geodude.pokemon.attacks[0];
    expect(getAttackCoinPlan(state, stoneBarrage).attack).toBe("untilTails");
    const next = executeMetronome(state, stoneBarrage, { coinResults: [H, T], skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage).toBe(10);
  });
});
