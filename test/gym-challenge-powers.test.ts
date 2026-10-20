/**
 * Gym Challenge Task 5: trigger powers and the remaining powers.
 *
 * - #6 Giovanni's Machamp, Fortitude: would be Knocked Out by an opponent's attack → flip; heads = 10 HP left.
 * - #8 Misty's Gyarados, Rebellion: whenever it attacks, flip 2; both tails = the attack does nothing,
 *   Gyarados and its cards are shuffled into the deck (works while Confused).
 * - #24 Giovanni's Persian, Call the Boss: when played from the hand, may search the deck for Giovanni.
 * - #13 Blaine's Ninetales, Healing Fire: attaching a Fire Energy card from the hand to it heals 10.
 * - #21 Koga's Muk, Energy Drain: damaged by an opponent's attack → flip; heads = its owner discards
 *   1 Energy card of the attacker.
 * - #55 Brock's Primeape, Scram: exactly 10 HP left → shuffled into the deck with its cards (no Prize).
 * - #64 Erika's Bellsprout, Soak Up: move up to 2 Grass Energy cards from your other Pokémon to it.
 * - #36 Erika's Ivysaur, Relaxing Scent: while Active, attack damage to any Pokémon is halved (rounded up).
 * - #74 Koga's Kakuna, Emerge: flip; heads = evolve into Koga's Beedrill from the deck.
 * - #52 Lt. Surge's Electrode, Shock Blast: damaged while Active → flip; tails = 20 to each Active.
 */
import { describe, it, expect } from "vitest";
import {
  attachEnergyCard,
  canUsePokemonPower,
  evolvePokemonCard,
  executeAttack,
  getAttackCoinPlan,
  resolveAttackChoice,
  resolveConfusionFlip,
  resolvePowerChoice,
  usePokemonPower,
  type GameState,
  type PokemonInPlay,
} from "@/index";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Fighting, Grass, Fire, Lightning, Water } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const gc = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-challenge", ...opts });
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const hitmonchan = (opts: Parameters<typeof inPlay>[1] = {}) => armedFor(inPlay("Hitmonchan", { set: "base", ...opts }), "Puño Bala");
const jab = (state: GameState, coins: ("heads" | "tails")[]) =>
  executeAttack(state, attackIndex(state.playerActivePokemon!, "Puño Bala"), { coinResults: coins, skipEndTurn: true });
const toxicGasMuk = () => inPlay("Muk", { set: "fossil" });

describe("Rebellion (Misty's Gyarados)", () => {
  const gyarados = () => armedFor(gc("Misty's Gyarados"), "Maremoto");
  const surf = (state: GameState, coins: ("heads" | "tails")[]) =>
    executeAttack(state, attackIndex(state.playerActivePokemon!, "Maremoto"), { coinResults: coins, skipEndTurn: true });

  it("adds 2 power coins after Smokescreen's, before the attack's own", () => {
    const state = vs(gyarados(), inPlay("Hitmonchan", { set: "base" }));
    expect(getAttackCoinPlan(state, 0)).toMatchObject({ smokescreen: 0, power: 2, attack: 0, defender: 0 });
    const smokescreened = vs({ ...gyarados(), mustFlipToAttack: true }, inPlay("Hitmonchan", { set: "base" }));
    expect(getAttackCoinPlan(smokescreened, 0)).toMatchObject({ smokescreen: 1, power: 2 });
  });

  it("both tails: the attack does nothing, Gyarados and its cards go into the deck, no Prize, its owner promotes", () => {
    const bench = gc("Misty's Magikarp");
    const state = deepFreeze(vs(gyarados(), inPlay("Hitmonchan", { set: "base" }), { player: { bench: [bench] } }));
    const next = surf(state, [T, T]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(0);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.playerDeck.length).toBe(state.playerDeck.length + 5); // Gyarados + 4 Water
    expect(names(next.playerDeck)).toContain("Misty's Gyarados");
    expect(next.opponentPrizes.length).toBe(6);
    expect(next.attackedThisTurn).toBe(true);
  });

  it("#13 Maremoto with both heads: 70 damage, no effect", () => {
    const next = surf(vs(gyarados(), inPlay("Chansey", { set: "base" })), [H, H]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(70);
  });

  it("one heads: the attack happens normally", () => {
    const next = surf(vs(gyarados(), inPlay("Chansey", { set: "base" })), [H, T]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(70);
    expect(next.playerActivePokemon?.pokemon.name).toBe("Misty's Gyarados");
  });

  it("works while Confused (after the Confusion flip)", () => {
    const state = vs({ ...gyarados(), statusConditions: [StatusCondition.Confused] }, inPlay("Hitmonchan", { set: "base" }), {
      player: { bench: [gc("Misty's Magikarp")] },
    });
    const { state: flipped, canAttack } = resolveConfusionFlip(state, true, true);
    expect(canAttack).toBe(true);
    expect(getAttackCoinPlan(flipped, 0).power).toBe(2);
    const next = surf(flipped, [T, T]);
    expect(next.playerActivePokemon).toBeNull();
  });

  it("Toxic Gas stops it (no power coins)", () => {
    const state = vs(gyarados(), toxicGasMuk());
    expect(getAttackCoinPlan(state, 0).power ?? 0).toBe(0);
  });
});

describe("Fortitude (Giovanni's Machamp)", () => {
  const machamp = (opts: Parameters<typeof inPlay>[1] = {}) => gc("Giovanni's Machamp", { damage: 80, ...opts });

  it("a defender coin; heads: not Knocked Out, 10 HP left, no Prize", () => {
    const state = deepFreeze(vs(hitmonchan(), machamp()));
    expect(getAttackCoinPlan(state, 0)).toMatchObject({ attack: 0, defender: 1 });
    const next = jab(state, [H]);
    expect(next.opponentActivePokemon?.pokemon.name).toBe("Giovanni's Machamp");
    expect(next.opponentActivePokemon!.currentDamage).toBe(90);
    expect(next.playerCanTakePrize).toBe(false);
  });

  it("tails: Knocked Out", () => {
    const next = jab(vs(hitmonchan(), machamp(), { opponent: { bench: [inPlay("Rattata", { set: "base" })] } }), [T]);
    expect(names(next.opponentDiscard)).toContain("Giovanni's Machamp");
  });

  it("can't be used if it is already Asleep, nor under Toxic Gas", () => {
    const asleep = vs(hitmonchan(), machamp({ statuses: [StatusCondition.Asleep] }));
    expect(getAttackCoinPlan(asleep, 0).defender).toBe(0);
    const gassed = vs(hitmonchan(), machamp(), { player: { bench: [toxicGasMuk()] } });
    expect(getAttackCoinPlan(gassed, 0).defender).toBe(0);
  });
});

describe("Energy Drain (Koga's Muk)", () => {
  it("heads: Muk's owner picks 1 Energy card of the attacker to discard", () => {
    const attacker = { ...hitmonchan(), attachedEnergy: [energy(Fighting), energy(EnergyType.Colorless)] };
    const state = deepFreeze(vs(attacker, gc("Koga's Muk")));
    expect(getAttackCoinPlan(state, 0).defender).toBe(1);
    const next = jab(state, [H]);
    const step = next.pendingAttackChoice?.step;
    expect(step?.chooser).toBe("opponent");
    expect(step?.options.map((o) => o.id)).toEqual(attacker.attachedEnergy.map((e) => e.id));
    expect(step?.defaultSelection).toBeDefined();
    const dce = attacker.attachedEnergy[1].id;
    const done = resolveAttackChoice(next, [dce], { skipEndTurn: true });
    expect(done.playerActivePokemon!.attachedEnergy.map((e) => e.id)).toEqual([attacker.attachedEnergy[0].id]);
    expect(done.playerDiscard.map((c) => c.id)).toContain(dce);
  });

  it("heads: still discards from the attacker after it went to the Bench (a self switch resolved first)", () => {
    const attacker = { ...hitmonchan(), attachedEnergy: [energy(Fighting), energy(Fighting)] };
    const benchMate = inPlay("Rattata", { set: "base" });
    const next = jab(vs(attacker, gc("Koga's Muk"), { player: { bench: [benchMate] } }), [H]);
    const switched: GameState = { ...next, playerActivePokemon: next.playerBench[0], playerBench: [next.playerActivePokemon!] };
    const picked = attacker.attachedEnergy[0].id;
    const done = resolveAttackChoice(switched, [picked], { skipEndTurn: true });
    expect(done.playerBench[0].attachedEnergy.map((e) => e.id)).toEqual([attacker.attachedEnergy[1].id]);
    expect(done.playerDiscard.map((c) => c.id)).toContain(picked);
  });

  it("tails: nothing", () => {
    const next = jab(vs(hitmonchan(), gc("Koga's Muk")), [T]);
    expect(next.pendingAttackChoice).toBeUndefined();
    expect(next.playerActivePokemon!.attachedEnergy).toHaveLength(1);
  });

  it("also when the attack Knocks Muk Out", () => {
    const next = jab(vs(hitmonchan(), gc("Koga's Muk", { damage: 70 }), { opponent: { bench: [inPlay("Rattata", { set: "base" })] } }), [H]);
    expect(next.pendingAttackChoice?.step.chooser).toBe("opponent");
  });

  it("can't be used if Muk is already Asleep", () => {
    expect(getAttackCoinPlan(vs(hitmonchan(), gc("Koga's Muk", { statuses: [StatusCondition.Asleep] })), 0).defender).toBe(0);
  });
});

describe("Shock Blast (Lt. Surge's Electrode)", () => {
  it("tails: 20 damage to each Active Pokémon (no Weakness / Resistance)", () => {
    const state = deepFreeze(vs(hitmonchan(), gc("Lt. Surge's Electrode")));
    expect(getAttackCoinPlan(state, 0).defender).toBe(1);
    const next = jab(state, [T]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(40 + 20); // Jab x2 (Fighting Weakness) + 20
    expect(next.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("heads: nothing more", () => {
    const next = jab(vs(hitmonchan(), gc("Lt. Surge's Electrode")), [H]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(40);
    expect(next.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("works while Asleep; Knock Outs happen together", () => {
    const state = vs(hitmonchan({ damage: 80 }), gc("Lt. Surge's Electrode", { statuses: [StatusCondition.Asleep] }), {
      player: { bench: [inPlay("Rattata", { set: "base" })] },
      opponent: { bench: [inPlay("Rattata", { set: "base" })] },
    });
    const next = jab(state, [T]);
    expect(names(next.playerDiscard)).toContain("Hitmonchan");
    expect(next.opponentPrizes.length).toBe(5);
  });
});

describe("Scram (Brock's Primeape)", () => {
  it("left with exactly 10 HP: shuffled into the deck with its cards, no Prize, promotion", () => {
    const primeape = gc("Brock's Primeape", { damage: 40, energy: [Fighting] });
    const rattata = inPlay("Rattata", { set: "base" });
    const state = deepFreeze(vs(hitmonchan(), primeape, { opponent: { bench: [rattata] } }));
    const next = jab(state, []);
    expect(next.opponentActivePokemon?.pokemon.id).not.toBe(primeape.pokemon.id);
    expect(names(next.opponentDeck)).toContain("Brock's Primeape");
    expect(next.opponentDeck.length).toBe(state.opponentDeck.length + 2);
    expect(next.playerPrizes.length).toBe(6);
    expect(next.playerCanTakePrize).toBe(false);
  });

  it("stays while Asleep", () => {
    const next = jab(vs(hitmonchan(), gc("Brock's Primeape", { damage: 40, statuses: [StatusCondition.Asleep] })), []);
    expect(next.opponentActivePokemon?.pokemon.name).toBe("Brock's Primeape");
  });
});

describe("Relaxing Scent (Erika's Ivysaur)", () => {
  it("halves attack damage to any Pokémon, rounded up, the attacker's self damage too", () => {
    const electabuzz = armedFor(inPlay("Electabuzz", { set: "base" }), "Puño-trueno");
    const state = deepFreeze(vs(electabuzz, gc("Erika's Ivysaur")));
    const punch = attackIndex(electabuzz, "Puño-trueno");
    // tails: 30 → 15 → 20; 10 self damage → 5 → 10
    const next = executeAttack(state, punch, { coinResults: [T], skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage).toBe(20);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("halves Ivysaur's own attack too (#41 Doble Hoja Afilada: heads, tails = 40 → 20)", () => {
    const ivysaur = armedFor(gc("Erika's Ivysaur"), "Doble Hoja Afilada");
    const state = vs(ivysaur, inPlay("Chansey", { set: "base" }));
    const next = executeAttack(state, attackIndex(ivysaur, "Doble Hoja Afilada"), { coinResults: [H, T], skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("stops while Ivysaur is Asleep", () => {
    const electabuzz = armedFor(inPlay("Electabuzz", { set: "base" }), "Puño-trueno");
    const state = vs(electabuzz, gc("Erika's Ivysaur", { statuses: [StatusCondition.Asleep] }));
    const next = executeAttack(state, attackIndex(electabuzz, "Puño-trueno"), { coinResults: [H], skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage).toBe(40);
  });
});

describe("Healing Fire (Blaine's Ninetales)", () => {
  it("attaching a Fire Energy card from the hand removes 1 damage counter", () => {
    const ninetales = gc("Blaine's Ninetales", { damage: 30 });
    const fire = energy(Fire);
    const state = deepFreeze(makeState({ player: { active: ninetales, hand: [fire] }, opponent: { active: inPlay("Rattata", { set: "base" }) } }));
    const next = attachEnergyCard(state, fire.id, ninetales.pokemon.id);
    expect(next.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("not with other Energy, nor while Asleep", () => {
    const water = energy(Water);
    const ninetales = gc("Blaine's Ninetales", { damage: 30 });
    const state = makeState({ player: { active: ninetales, hand: [water] }, opponent: { active: inPlay("Rattata", { set: "base" }) } });
    expect(attachEnergyCard(state, water.id, ninetales.pokemon.id).playerActivePokemon!.currentDamage).toBe(30);
    const fire = energy(Fire);
    const asleep = gc("Blaine's Ninetales", { damage: 30, statuses: [StatusCondition.Asleep] });
    const s2 = makeState({ player: { active: asleep, hand: [fire] }, opponent: { active: inPlay("Rattata", { set: "base" }) } });
    expect(attachEnergyCard(s2, fire.id, asleep.pokemon.id).playerActivePokemon!.currentDamage).toBe(30);
  });
});

describe("Soak Up (Erika's Bellsprout)", () => {
  it("moves up to 2 Grass Energy cards from the other Pokémon to it, once per turn", () => {
    const bellsprout = gc("Erika's Bellsprout");
    const holder = inPlay("Bulbasaur", { set: "base", energy: [Grass, Grass, Grass] });
    const state = deepFreeze(makeState({ player: { active: bellsprout, bench: [holder] }, opponent: { active: inPlay("Rattata", { set: "base" }) } }));
    expect(canUsePokemonPower(state, bellsprout.pokemon.id)).toBeNull();
    const ids = holder.attachedEnergy.slice(0, 2).map((e) => e.id);
    const next = usePokemonPower(state, bellsprout.pokemon.id, [ids]);
    expect(next.playerActivePokemon!.attachedEnergy.map((e) => e.id)).toEqual(ids);
    expect(next.playerBench[0].attachedEnergy).toHaveLength(1);
    expect(canUsePokemonPower(next, bellsprout.pokemon.id)).not.toBeNull();
  });

  it("not while Asleep, nor without Grass Energy elsewhere", () => {
    const asleep = gc("Erika's Bellsprout", { statuses: [StatusCondition.Asleep] });
    const holder = inPlay("Bulbasaur", { set: "base", energy: [Grass] });
    expect(canUsePokemonPower(makeState({ player: { active: asleep, bench: [holder] }, opponent: { active: inPlay("Rattata", { set: "base" }) } }), asleep.pokemon.id)).not.toBeNull();
    const alone = gc("Erika's Bellsprout");
    expect(canUsePokemonPower(makeState({ player: { active: alone }, opponent: { active: inPlay("Rattata", { set: "base" }) } }), alone.pokemon.id)).not.toBeNull();
  });
});

describe("Emerge (Koga's Kakuna)", () => {
  const setup = () => {
    const kakuna = gc("Koga's Kakuna", { playedOnTurn: 3, damage: 20 });
    const beedrill = gameCard("Koga's Beedrill", "gym-challenge");
    return { kakuna, beedrill, state: makeState({ player: { active: kakuna, deck: [energy(Grass), beedrill] }, opponent: { active: inPlay("Rattata", { set: "base" }) } }) };
  };

  it("heads: evolves into Koga's Beedrill from the deck (even the turn it was played)", () => {
    const { kakuna, beedrill, state } = setup();
    expect(canUsePokemonPower(state, kakuna.pokemon.id)).toBeNull();
    const next = usePokemonPower(deepFreeze(state), kakuna.pokemon.id, [], { coinResults: [H] });
    expect(next.playerActivePokemon!.pokemon.id).toBe(beedrill.id);
    expect(next.playerActivePokemon!.currentDamage).toBe(20);
    expect(names(next.playerActivePokemon!.previousEvolutions ?? [])).toContain("Koga's Kakuna");
    expect(next.playerDeck).toHaveLength(1);
  });

  it("tails: nothing (used for the turn)", () => {
    const { kakuna, state } = setup();
    const next = usePokemonPower(state, kakuna.pokemon.id, [], { coinResults: [T] });
    expect(next.playerActivePokemon!.pokemon.name).toBe("Koga's Kakuna");
    expect(canUsePokemonPower(next, kakuna.pokemon.id)).not.toBeNull();
  });
});

describe("Call the Boss (Giovanni's Persian)", () => {
  it("evolving from the hand offers Giovanni from the deck", () => {
    const meowth = gc("Giovanni's Meowth", { playedOnTurn: 1 });
    const persian = gameCard("Giovanni's Persian", "gym-challenge");
    const giovanni = gameCard("Giovanni", "gym-challenge");
    const state = makeState({ player: { active: meowth, hand: [persian], deck: [energy(Lightning), giovanni] }, opponent: { active: inPlay("Rattata", { set: "base" }) } });
    const evolved = evolvePokemonCard(state, persian.id, meowth.pokemon.id);
    expect(evolved.pendingPowerChoice?.step.options.map((o) => o.id)).toEqual([giovanni.id]);
    const done = resolvePowerChoice(evolved, [giovanni.id]);
    expect(done.playerHand.map((c) => c.id)).toContain(giovanni.id);
    expect(done.playerDeck).toHaveLength(1);
  });

  it("without Giovanni in the deck: nothing to choose, the deck is shuffled", () => {
    const meowth = gc("Giovanni's Meowth", { playedOnTurn: 1 });
    const persian = gameCard("Giovanni's Persian", "gym-challenge");
    const state = makeState({ player: { active: meowth, hand: [persian] }, opponent: { active: inPlay("Rattata", { set: "base" }) } });
    const evolved = evolvePokemonCard(state, persian.id, meowth.pokemon.id);
    expect(evolved.pendingPowerChoice).toBeUndefined();
    expect(evolved.playerDeck).toHaveLength(10);
  });
});
