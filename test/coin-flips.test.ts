import { describe, it, expect } from "vitest";
import { executeAttack as engineExecuteAttack, executeMetronome as engineExecuteMetronome, getAttackCoinFlipCount } from "@/index";
import type { Attack, GameModifier, GameState, PokemonInPlay } from "@/index";
import { EnergyType, ProtectionType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, attackIndex, deepFreeze, gameCard, names, armedFor } from "./helpers/state";

const { Grass, Lightning, Colorless, Psychic, Water, Fire } = EnergyType;
const { Paralyzed, Poisoned, Confused, CannotAttack } = StatusCondition;
const H = "heads" as const;
const T = "tails" as const;

// These scenarios are about effect resolution: the attacker gets the Energy its attack costs
// (executeAttack refuses unpaid attacks), without changing Energy it can already pay with.
function armActive(state: GameState, attackName: (attacker: PokemonInPlay) => string): GameState {
  const active = state.playerActivePokemon;
  if (!active || active.pokemon.kind !== "pokemon") return state;
  return { ...state, playerActivePokemon: armedFor(active, attackName(active)) };
}
const nameAt = (index: number) => (p: PokemonInPlay) => (p.pokemon.kind === "pokemon" ? p.pokemon.attacks[index].name : "");
const metronomeName = (p: PokemonInPlay) =>
  p.pokemon.kind === "pokemon" ? (p.pokemon.attacks.find((a) => a.name.startsWith("Metr"))?.name ?? "") : "";
const executeAttack = ((state: GameState, index: number, ...rest: unknown[]) =>
  (engineExecuteAttack as (...args: unknown[]) => GameState)(armActive(state, nameAt(index)), index, ...rest)) as typeof engineExecuteAttack;
const executeMetronome = ((state: GameState, attack: Attack, ...rest: unknown[]) =>
  (engineExecuteMetronome as (...args: unknown[]) => GameState)(armActive(state, metronomeName), attack, ...rest)) as typeof engineExecuteMetronome;

function plusPower(): GameModifier {
  return { id: "pp", source: "plusPower", card: gameCard("PlusPower", "base"), amount: 10, expiresAfterTurn: 3, playerId: "player" };
}

function defenderOn(pokemon: PokemonInPlay): GameModifier {
  return {
    id: "def",
    source: "defender",
    card: gameCard("Defender", "base"),
    targetPokemonId: pokemon.pokemon.id,
    amount: -20,
    expiresAfterTurn: 4,
    playerId: "opponent",
  };
}

/** Attack by name with the given coins, without ending the turn (so the result can be inspected). */
function attack(state: GameState, name: string, coinResults: ("heads" | "tails")[]): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults, skipEndTurn: true });
}

function lastMessages(state: GameState, count = 8): string[] {
  return state.events.slice(-count).map((e) => e.message);
}

describe("getAttackCoinFlipCount", () => {
  it("is 0 for an attack without coin effects and for a missing attack", () => {
    const state = makeState({ player: { active: inPlay("Magikarp") }, opponent: { active: inPlay("Onix") } });
    expect(getAttackCoinFlipCount(state, 0)).toBe(0);
    expect(getAttackCoinFlipCount(state, 7)).toBe(0);
    expect(getAttackCoinFlipCount(makeState(), 0)).toBe(0);
  });

  it("counts the printed coins (Twineedle 2, Pin Missile 4, Petal Dance 3)", () => {
    const opp = { active: inPlay("Onix") };
    const beedrill = inPlay("Beedrill");
    const jolteon = inPlay("Jolteon");
    const vileplume = inPlay("Vileplume");
    expect(getAttackCoinFlipCount(makeState({ player: { active: beedrill }, opponent: opp }), attackIndex(beedrill, "Doble Ataque"))).toBe(2);
    expect(getAttackCoinFlipCount(makeState({ player: { active: jolteon }, opponent: opp }), attackIndex(jolteon, "Misil Aguja"))).toBe(4);
    expect(getAttackCoinFlipCount(makeState({ player: { active: vileplume }, opponent: opp }), attackIndex(vileplume, "Danza Pétalo"))).toBe(3);
  });

  it("Thrash flips ONE coin shared by the bonus damage and the self damage", () => {
    const nidoking = inPlay("Nidoking");
    const state = makeState({ player: { active: nidoking }, opponent: { active: inPlay("Onix") } });
    expect(getAttackCoinFlipCount(state, attackIndex(nidoking, "Golpe"))).toBe(1);
  });

  it("Big Eggsplosion flips one coin per Energy attached (Double Colorless counts as 2)", () => {
    const exeggutor = inPlay("Exeggutor", { energy: [Grass, Grass, Colorless] });
    const state = makeState({ player: { active: exeggutor }, opponent: { active: inPlay("Onix") } });
    expect(getAttackCoinFlipCount(state, attackIndex(exeggutor, "Big Eggsplosion"))).toBe(4);
  });

  it("accepts an Attack (Metronome): Big Eggsplosion copied by Clefairy counts Clefairy's Energy", () => {
    const exeggutor = inPlay("Exeggutor", { energy: [Grass] });
    const clefairy = inPlay("Clefairy", { energy: [Psychic, Water, Fire] });
    const state = makeState({ player: { active: clefairy }, opponent: { active: exeggutor } });
    const copied = (exeggutor.pokemon as { attacks: Attack[] }).attacks[attackIndex(exeggutor, "Big Eggsplosion")];
    expect(getAttackCoinFlipCount(state, copied)).toBe(3);
  });
});

describe("executeAttack with coinResults: contract", () => {
  it("throws when a coin attack is called with the options form but without coins", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Machamp") } });
    expect(() => executeAttack(state, attackIndex(beedrill, "Doble Ataque"), {})).toThrow(/coin/i);
  });

  it("throws when the number of coins does not match getAttackCoinFlipCount", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Machamp") } });
    expect(() => executeAttack(state, attackIndex(beedrill, "Doble Ataque"), { coinResults: [H] })).toThrow(/2/);
    const magikarp = inPlay("Magikarp");
    const s2 = makeState({ player: { active: magikarp }, opponent: { active: inPlay("Onix") } });
    expect(() => executeAttack(s2, 0, { coinResults: [H] })).toThrow();
  });

  it("works for attacks without coins with the options form (no coinResults or an empty list)", () => {
    const magikarp = inPlay("Magikarp");
    const state = makeState({ player: { active: magikarp }, opponent: { active: inPlay("Onix") } });
    const a = executeAttack(state, attackIndex(magikarp, "Placaje"), { skipEndTurn: true });
    const b = executeAttack(state, attackIndex(magikarp, "Placaje"), { coinResults: [], skipEndTurn: true });
    expect(a.opponentActivePokemon?.currentDamage).toBe(10);
    expect(b.opponentActivePokemon?.currentDamage).toBe(10);
    expect(a.isPlayerTurn).toBe(true);
  });

  it("the legacy positional signature still skips coin effects (consumers not migrated yet)", () => {
    const electabuzz = inPlay("Electabuzz", { energy: [Lightning] });
    const state = makeState({ player: { active: electabuzz }, opponent: { active: inPlay("Machamp") } });
    const after = executeAttack(state, attackIndex(electabuzz, "Impactrueno"), true);
    expect(after.opponentActivePokemon?.currentDamage).toBe(10);
    expect(after.opponentActivePokemon?.statusConditions).toEqual([]);
  });

  it("logs the coins before the attack message", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Machamp") } });
    const after = attack(state, "Doble Ataque", [H, T]);
    const msgs = after.events.map((e) => e.message);
    const coinIdx = msgs.indexOf("Monedas: [coin:heads] [coin:tails]");
    const attackIdx = msgs.findIndex((m) => m.startsWith("Beedrill usó Doble Ataque"));
    expect(coinIdx).toBeGreaterThanOrEqual(0);
    expect(attackIdx).toBeGreaterThan(coinIdx);
  });

  it("ends the turn like any attack when skipEndTurn is not set", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Machamp") } });
    const after = executeAttack(state, attackIndex(beedrill, "Doble Ataque"), { coinResults: [H, H] });
    expect(after.opponentActivePokemon?.currentDamage).toBe(60);
    expect(after.isPlayerTurn).toBe(false);
  });

  it("does not mutate the input state", () => {
    const venomoth = inPlay("Venomoth", { energy: [Grass, Grass] });
    const nidoking = inPlay("Nidoking", { damage: 80 });
    const s1 = deepFreeze(makeState({ player: { active: venomoth }, opponent: { active: inPlay("Machamp") } }));
    const s2 = deepFreeze(makeState({ player: { active: nidoking, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Onix") } }));
    const beedrill = inPlay("Beedrill");
    const s3 = deepFreeze(makeState({ player: { active: beedrill }, opponent: { active: inPlay("Pikachu"), bench: [inPlay("Abra")] } }));
    expect(() => executeAttack(s1, 0, { coinResults: [H] })).not.toThrow();
    expect(() => executeAttack(s2, attackIndex(nidoking, "Golpe"), { coinResults: [T] })).not.toThrow();
    expect(() => executeAttack(s3, attackIndex(beedrill, "Doble Ataque"), { coinResults: [H, H] })).not.toThrow();
    expect(s2.playerActivePokemon?.currentDamage).toBe(80);
  });
});

describe("Coin damage: one damage value, then weakness/resistance/PlusPower/Defender/protection", () => {
  it("Twineedle: 30 per heads, nothing on two tails", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Machamp") } });
    expect(attack(state, "Doble Ataque", [H, H]).opponentActivePokemon?.currentDamage).toBe(60);
    expect(attack(state, "Doble Ataque", [H, T]).opponentActivePokemon?.currentDamage).toBe(30);
    const none = attack(state, "Doble Ataque", [T, T]);
    expect(none.opponentActivePokemon?.currentDamage).toBe(0);
    expect(lastMessages(none).some((m) => m.includes("no hizo daño"))).toBe(true);
  });

  it("Bonemerang (\"30x\") and Fury Swipes (\"20x\")", () => {
    const marowak = inPlay("Marowak");
    const primeape = inPlay("Primeape");
    const sMarowak = makeState({ player: { active: marowak }, opponent: { active: inPlay("Machamp") } });
    const sPrimeape = makeState({ player: { active: primeape }, opponent: { active: inPlay("Onix") } });
    expect(attack(sMarowak, "Bonemerang", [H, H]).opponentActivePokemon?.currentDamage).toBe(60);
    expect(attack(sPrimeape, "Fury Swipes", [H, T, H]).opponentActivePokemon?.currentDamage).toBe(40);
  });

  it("Thrash heads vs a Grass-weak Onix: (30 + 10) x 2 = 80", () => {
    const nidoking = inPlay("Nidoking");
    const state = makeState({ player: { active: nidoking }, opponent: { active: inPlay("Onix") } });
    const after = attack(state, "Golpe", [H]);
    expect(after.opponentActivePokemon?.currentDamage).toBe(80);
    expect(after.playerActivePokemon?.currentDamage).toBe(0);
  });

  it("Thrash tails: 30 x 2 to Onix and 10 to Nidoking", () => {
    const nidoking = inPlay("Nidoking");
    const state = makeState({ player: { active: nidoking }, opponent: { active: inPlay("Onix") } });
    const after = attack(state, "Golpe", [T]);
    expect(after.opponentActivePokemon?.currentDamage).toBe(60);
    expect(after.playerActivePokemon?.currentDamage).toBe(10);
  });

  it("Thunderpunch heads vs a Lightning-resistant Dugtrio: resistance applies ONCE (30 + 10 - 30 = 10)", () => {
    const electabuzz = inPlay("Electabuzz");
    const state = makeState({ player: { active: electabuzz }, opponent: { active: inPlay("Dugtrio") } });
    const heads = attack(state, "Puño-trueno", [H]);
    expect(heads.opponentActivePokemon?.currentDamage).toBe(10);
    expect(heads.playerActivePokemon?.currentDamage).toBe(0);
    const tails = attack(state, "Puño-trueno", [T]);
    expect(tails.opponentActivePokemon?.currentDamage).toBe(0);
    expect(tails.playerActivePokemon?.currentDamage).toBe(10);
  });

  it("Conversion-modified resistance applies to coin damage too", () => {
    const nidoking = inPlay("Nidoking");
    const state = makeState({ player: { active: nidoking }, opponent: { active: inPlay("Machamp", { modifiedResistance: Grass }) } });
    expect(attack(state, "Golpe", [H]).opponentActivePokemon?.currentDamage).toBe(10);
  });

  it("PlusPower is added AFTER weakness on coin damage (Bonemerang 1 heads vs Raichu: 30 x 2 + 10 = 70)", () => {
    const marowak = inPlay("Marowak");
    const state = makeState({
      player: { active: marowak },
      opponent: { active: inPlay("Raichu") },
      activeModifiers: [plusPower()],
    });
    const after = attack(state, "Bonemerang", [H, T]);
    expect(after.opponentActivePokemon?.currentDamage).toBe(70);
  });

  it("PlusPower adds nothing when every coin is tails (the attack does no damage)", () => {
    const marowak = inPlay("Marowak");
    const state = makeState({ player: { active: marowak }, opponent: { active: inPlay("Machamp") }, activeModifiers: [plusPower()] });
    expect(attack(state, "Bonemerang", [T, T]).opponentActivePokemon?.currentDamage).toBe(0);
  });

  it("Defender reduces the total coin damage by 20", () => {
    const beedrill = inPlay("Beedrill");
    const machamp = inPlay("Machamp");
    const state = makeState({ player: { active: beedrill }, opponent: { active: machamp }, activeModifiers: [defenderOn(machamp)] });
    expect(attack(state, "Doble Ataque", [H, H]).opponentActivePokemon?.currentDamage).toBe(40);
  });

  it("Harden (blocks 30 or less) is checked on the total: Thunderpunch heads deals the full 40 to Onix", () => {
    const electabuzz = inPlay("Electabuzz");
    const onix = inPlay("Onix", { protection: { type: ProtectionType.DamageOnly, expiresAfterTurn: 3, threshold: 30 } });
    const state = makeState({ player: { active: electabuzz }, opponent: { active: onix } });
    expect(attack(state, "Puño-trueno", [H]).opponentActivePokemon?.currentDamage).toBe(40);
    expect(attack(state, "Puño-trueno", [T]).opponentActivePokemon?.currentDamage).toBe(0);
  });

  it("Invisible Wall is checked on the total: Stomp heads (20 + 10 = 30) is blocked by Mr. Mime", () => {
    const tauros = inPlay("Tauros");
    const state = makeState({ player: { active: tauros }, opponent: { active: inPlay("Mr. Mime") } });
    expect(attack(state, "Stomp", [H]).opponentActivePokemon?.currentDamage).toBe(0);
    expect(attack(state, "Stomp", [T]).opponentActivePokemon?.currentDamage).toBe(20);
  });

  it("Scrunch-style protection prevents coin damage", () => {
    const beedrill = inPlay("Beedrill");
    const chansey = inPlay("Chansey", { protection: { type: ProtectionType.DamageOnly, expiresAfterTurn: 3 } });
    const state = makeState({ player: { active: beedrill }, opponent: { active: chansey } });
    expect(attack(state, "Doble Ataque", [H, H]).opponentActivePokemon?.currentDamage).toBe(0);
  });

  it("Big Eggsplosion: 20 per heads over one coin per Energy", () => {
    const exeggutor = inPlay("Exeggutor", { energy: [Grass, Grass, Grass] });
    const state = makeState({ player: { active: exeggutor }, opponent: { active: inPlay("Machamp") } });
    expect(attack(state, "Big Eggsplosion", [H, T, H]).opponentActivePokemon?.currentDamage).toBe(40);
  });

  it("a coin-damage KO goes through the normal KO flow (discard, prize, chosen promotion)", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Pikachu"), bench: [inPlay("Abra")] } });
    const after = executeAttack(state, attackIndex(beedrill, "Doble Ataque"), {
      coinResults: [H, H],
      skipEndTurn: true,
      skipDefenderPromotion: true,
    });
    expect(after.opponentActivePokemon).toBeNull();
    expect(names(after.opponentDiscard)).toContain("Pikachu");
    expect(after.playerCanTakePrize).toBe(true);
    expect(after.opponentNeedsToPromote).toBe(true);
  });

  it("coin damage triggers Strikes Back and is remembered for Mirror Move", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: beedrill }, opponent: { active: inPlay("Machamp") } });
    const after = attack(state, "Doble Ataque", [H, T]);
    expect(after.playerActivePokemon?.currentDamage).toBe(10);
    expect(after.opponentActivePokemon?.lastDamageReceived).toBe(30);
  });

  it("Leek Slap tails does nothing but still counts as used", () => {
    const farfetchd = inPlay("Farfetch'd");
    const state = makeState({ player: { active: farfetchd }, opponent: { active: inPlay("Machamp") } });
    const after = attack(state, "Bofetada Puerro", [T]);
    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
    expect(after.playerActivePokemon?.usedOnceAttacks).toEqual(["Bofetada Puerro"]);
  });
});

describe("Self damage on tails", () => {
  it("Raichu's Thunder: tails 30 to itself, heads nothing", () => {
    const raichu = inPlay("Raichu");
    const state = makeState({ player: { active: raichu }, opponent: { active: inPlay("Onix") } });
    expect(attack(state, "Trueno", [T]).playerActivePokemon?.currentDamage).toBe(30);
    expect(attack(state, "Trueno", [H]).playerActivePokemon?.currentDamage).toBe(0);
    expect(attack(state, "Trueno", [H]).opponentActivePokemon?.currentDamage).toBe(60);
  });

  it("Defender on the attacker reduces its own coin self damage (Thunder Jolt 10 - 20 = 0)", () => {
    const pikachu = inPlay("Pikachu", { set: "base" });
    const state = makeState({ player: { active: pikachu }, opponent: { active: inPlay("Onix") }, activeModifiers: [defenderOn(pikachu)] });
    expect(attack(state, "Trueno Sacudida", [T]).playerActivePokemon?.currentDamage).toBe(0);
  });

  it("a self-KO on tails gives the opponent exactly one prize and asks for a promotion", () => {
    const zapdos = inPlay("Zapdos", { damage: 70 });
    const state = makeState({ player: { active: zapdos, bench: [inPlay("Abra")] }, opponent: { active: inPlay("Onix") } });
    const after = attack(state, "Trueno", [T]);
    expect(after.playerActivePokemon).toBeNull();
    expect(names(after.playerDiscard)).toContain("Zapdos");
    expect(after.opponentPrizes).toHaveLength(5);
    expect(after.opponentHand).toHaveLength(1);
    expect(after.opponentCanTakePrize).toBe(false);
    expect(after.playerNeedsToPromote).toBe(true);
  });
});

describe("Status on heads/tails", () => {
  it("Thundershock: heads paralyzes, tails does not", () => {
    const electabuzz = inPlay("Electabuzz");
    const state = makeState({ player: { active: electabuzz }, opponent: { active: inPlay("Machamp") } });
    expect(attack(state, "Impactrueno", [H]).opponentActivePokemon?.statusConditions).toEqual([Paralyzed]);
    expect(attack(state, "Impactrueno", [T]).opponentActivePokemon?.statusConditions).toEqual([]);
  });

  it("Foul Gas: heads poisons, tails confuses", () => {
    const koffing = inPlay("Koffing");
    const state = makeState({ player: { active: koffing }, opponent: { active: inPlay("Machamp") } });
    expect(attack(state, "Gas pestilente", [H]).opponentActivePokemon?.statusConditions).toEqual([Poisoned]);
    expect(attack(state, "Gas pestilente", [T]).opponentActivePokemon?.statusConditions).toEqual([Confused]);
  });

  it("Venom Powder heads: Confused and Poisoned, and the poison ticks at the end of this turn", () => {
    const venomoth = inPlay("Venomoth");
    const state = makeState({ player: { active: venomoth }, opponent: { active: inPlay("Machamp") } });
    const after = executeAttack(state, 0, { coinResults: [H] });
    expect(after.isPlayerTurn).toBe(false);
    expect(after.opponentActivePokemon?.statusConditions).toEqual(expect.arrayContaining([Confused, Poisoned]));
    // 10 from the attack + 10 poison between turns (endTurn ran after the status was applied)
    expect(after.opponentActivePokemon?.currentDamage).toBe(20);
  });

  it("Tantrum tails confuses Primeape itself (after doing damage); heads does not", () => {
    const primeape = inPlay("Primeape");
    const state = makeState({ player: { active: primeape }, opponent: { active: inPlay("Onix") } });
    const tails = attack(state, "Tantrum", [T]);
    expect(tails.playerActivePokemon?.statusConditions).toEqual([Confused]);
    expect(tails.opponentActivePokemon?.currentDamage).toBe(50);
    expect(attack(state, "Tantrum", [H]).playerActivePokemon?.statusConditions).toEqual([]);
  });

  it("Rampage: damage per counter plus self confusion on tails", () => {
    const tauros = inPlay("Tauros", { damage: 20 });
    const state = makeState({ player: { active: tauros }, opponent: { active: inPlay("Onix") } });
    const after = attack(state, "Rampage", [T]);
    expect(after.opponentActivePokemon?.currentDamage).toBe(40);
    expect(after.playerActivePokemon?.statusConditions).toEqual([Confused]);
  });

  it("Leer heads: the Defending Pokémon can't attack next turn", () => {
    const rhyhorn = inPlay("Rhyhorn");
    const state = makeState({ player: { active: rhyhorn }, opponent: { active: inPlay("Machamp") } });
    expect(attack(state, "Leer", [H]).opponentActivePokemon?.statusConditions).toEqual([CannotAttack]);
    expect(attack(state, "Leer", [T]).opponentActivePokemon?.statusConditions).toEqual([]);
  });

  it("Agility-type protection on the defender blocks coin statuses", () => {
    const electabuzz = inPlay("Electabuzz");
    const raichu = inPlay("Raichu", { protection: { type: ProtectionType.DamageAndEffects, expiresAfterTurn: 3 } });
    const state = makeState({ player: { active: electabuzz }, opponent: { active: raichu } });
    expect(attack(state, "Impactrueno", [H]).opponentActivePokemon?.statusConditions).toEqual([]);
  });

  it("Thick Skinned blocks special conditions but not Leer", () => {
    const electabuzz = inPlay("Electabuzz");
    const rhyhorn = inPlay("Rhyhorn");
    const s1 = makeState({ player: { active: electabuzz }, opponent: { active: inPlay("Snorlax") } });
    const s2 = makeState({ player: { active: rhyhorn }, opponent: { active: inPlay("Snorlax") } });
    expect(attack(s1, "Impactrueno", [H]).opponentActivePokemon?.statusConditions).toEqual([]);
    expect(attack(s2, "Leer", [H]).opponentActivePokemon?.statusConditions).toEqual([CannotAttack]);
  });

  it("a knocked-out defender is not paralyzed and the status never moves to its replacement", () => {
    const electabuzz = inPlay("Electabuzz");
    const state = makeState({ player: { active: electabuzz }, opponent: { active: inPlay("Abra", { damage: 20 }), bench: [inPlay("Machop")] } });
    const after = attack(state, "Impactrueno", [H]);
    expect(after.opponentActivePokemon?.pokemon.name).toBe("Machop");
    expect(after.opponentActivePokemon?.statusConditions).toEqual([]);
  });
});

describe("Protection, prevent retreat and draw on heads", () => {
  it("Scrunch heads protects Chansey from damage during the next turn; tails does not", () => {
    const chansey = inPlay("Chansey");
    const state = makeState({ turnNumber: 5, player: { active: chansey }, opponent: { active: inPlay("Machamp") } });
    expect(attack(state, "Acurruque", [H]).playerActivePokemon?.protection).toEqual({ type: ProtectionType.DamageOnly, expiresAfterTurn: 6 });
    const tails = attack(state, "Acurruque", [T]);
    expect(tails.playerActivePokemon?.protection).toBeUndefined();
    expect(lastMessages(tails).some((m) => m.includes("no logró protegerse"))).toBe(true);
  });

  it("Agility heads: damage-and-effects protection, plus the attack's damage", () => {
    const raichu = inPlay("Raichu");
    const state = makeState({ player: { active: raichu }, opponent: { active: inPlay("Machamp") } });
    const after = attack(state, "Agilidad", [H]);
    expect(after.playerActivePokemon?.protection?.type).toBe(ProtectionType.DamageAndEffects);
    expect(after.opponentActivePokemon?.currentDamage).toBe(20);
  });

  it("Acid heads: the defender can't retreat; tails: it can; Agility-type protection blocks it", () => {
    const victreebel = inPlay("Victreebel");
    const s = makeState({ player: { active: victreebel }, opponent: { active: inPlay("Machamp") } });
    expect(attack(s, "Ácido", [H]).opponentActivePokemon?.retreatPrevented).toBe(true);
    expect(attack(s, "Ácido", [T]).opponentActivePokemon?.retreatPrevented).toBeUndefined();
    const protectedRaichu = inPlay("Raichu", { protection: { type: ProtectionType.DamageAndEffects, expiresAfterTurn: 3 } });
    const s2 = makeState({ player: { active: victreebel }, opponent: { active: protectedRaichu } });
    expect(attack(s2, "Ácido", [H]).opponentActivePokemon?.retreatPrevented).toBeUndefined();
  });

  it("Pay Day heads draws 1 card (and never damages Meowth); tails draws nothing", () => {
    const meowth = inPlay("Meowth");
    const state = makeState({ player: { active: meowth }, opponent: { active: inPlay("Onix") } });
    const heads = attack(state, "Pay Day", [H]);
    expect(heads.playerHand).toHaveLength(1);
    expect(heads.playerDeck).toHaveLength(9);
    expect(heads.playerActivePokemon?.currentDamage).toBe(0);
    expect(heads.opponentActivePokemon?.currentDamage).toBe(10);
    expect(attack(state, "Pay Day", [T]).playerHand).toHaveLength(0);
  });
});

describe("Metronome copying a coin attack", () => {
  function copiedAttack(pokemon: PokemonInPlay, name: string): Attack {
    return (pokemon.pokemon as { attacks: Attack[] }).attacks[attackIndex(pokemon, name)];
  }

  it("Clefairy copies Twineedle: coin damage resolved with Clefairy's Colorless type", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: inPlay("Clefairy") }, opponent: { active: beedrill } });
    const after = executeMetronome(state, copiedAttack(beedrill, "Doble Ataque"), { coinResults: [H, H], skipEndTurn: true });
    expect(after.opponentActivePokemon?.currentDamage).toBe(60);
    expect(after.playerActivePokemon?.pokemon.name).toBe("Clefairy");
  });

  it("Clefairy copies Raichu's Thunder: tails damages Clefairy", () => {
    const raichu = inPlay("Raichu");
    const state = makeState({ player: { active: inPlay("Clefairy") }, opponent: { active: raichu } });
    const after = executeMetronome(state, copiedAttack(raichu, "Trueno"), { coinResults: [T], skipEndTurn: true });
    expect(after.playerActivePokemon?.currentDamage).toBe(30);
    expect(after.opponentActivePokemon?.currentDamage).toBe(60);
  });

  it("Clefable copies Thundershock: heads paralyzes; and the turn ends without skipEndTurn", () => {
    const electabuzz = inPlay("Electabuzz");
    const state = makeState({ player: { active: inPlay("Clefable") }, opponent: { active: electabuzz } });
    const after = executeMetronome(state, copiedAttack(electabuzz, "Impactrueno"), { coinResults: [H] });
    expect(after.isPlayerTurn).toBe(false);
    expect(after.opponentActivePokemon?.statusConditions).toEqual([Paralyzed]);
  });

  it("Metronome still accepts the legacy positional booleans", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: inPlay("Clefairy") }, opponent: { active: beedrill } });
    const after = executeMetronome(state, copiedAttack(beedrill, "Doble Ataque"), true, true);
    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
    expect(after.isPlayerTurn).toBe(true);
  });

  it("throws when the copied attack needs coins and none are given in the options form", () => {
    const beedrill = inPlay("Beedrill");
    const state = makeState({ player: { active: inPlay("Clefairy") }, opponent: { active: beedrill } });
    expect(() => executeMetronome(state, copiedAttack(beedrill, "Doble Ataque"), {})).toThrow(/coin/i);
  });
});

