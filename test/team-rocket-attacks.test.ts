import { prizesOwed } from "@/lib/gameState";
/**
 * Team Rocket attack effects, card by card (texts in data/pokemontcg/rocket.txt).
 */
import { describe, it, expect } from "vitest";
import {
  canExecuteAttack,
  endTurn,
  executeAttack,
  getAttackCoinPlan,
  resolveAttackChoice,
} from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { isPowerActive } from "@/domain/powers";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Water, Fire, Grass, Lightning, Psychic, Fighting } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
type Coin = typeof H | typeof T;

const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const card = (name: string) => gameCard(name, "rocket");

/** Attack by name with these coins, without ending the turn. */
function attack(state: GameState, name: string, coins: Coin[] = [], extra: Record<string, unknown> = {}): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true, ...extra });
}
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const choose = (state: GameState, selection: string[]) => resolveAttackChoice(state, selection, { skipEndTurn: true });
const optionIds = (state: GameState) => state.pendingAttackChoice!.step.options.map((o) => o.id);
const optionLabels = (state: GameState) => state.pendingAttackChoice!.step.options.filter((o) => !o.disabled).map((o) => o.label);

describe("choose 1 of the opponent's Pokémon (Stare, Flitter, Dig Under, Coin Hurl)", () => {
  it("Flitter: 20 to the chosen Pokémon, no Weakness/Resistance", () => {
    // Onix is weak to Grass: no ×2
    const state = deepFreeze(vs(rocket("Dark Golbat"), inPlay("Onix"), { opponent: { bench: [inPlay("Machop")] } }));
    const next = attack(state, "Revoloteo");
    expect(next.pendingAttackChoice!.step.chooser).toBe("self");
    expect(optionLabels(next)).toEqual(["Onix (Activo rival)", "Machop (Banca rival)"]);
    expect(choose(next, [optionIds(next)[0]]).opponentActivePokemon!.currentDamage).toBe(20);
    expect(choose(next, [optionIds(next)[1]]).opponentBench[0].currentDamage).toBe(20);
  });

  it("the Defending Pokémon takes PlusPower and Defender like any attack damage; a benched one doesn't", () => {
    const plusPower = { id: "pp", source: "plusPower" as const, card: gameCard("PlusPower", "base"), amount: 10, expiresAfterTurn: 3, playerId: "player" as const };
    const state = vs(rocket("Diglett"), inPlay("Onix"), { opponent: { bench: [inPlay("Machop")] }, activeModifiers: [plusPower] });
    const next = attack(state, "Cavar");
    expect(choose(next, [optionIds(next)[0]]).opponentActivePokemon!.currentDamage).toBe(20);
    expect(choose(next, [optionIds(next)[1]]).opponentBench[0].currentDamage).toBe(10);
  });

  it("can Knock Out the chosen Pokémon; the Prize is taken and the turn ends after the promotion", () => {
    const state = vs(rocket("Dark Golbat"), inPlay("Abra", { damage: 10 }), { opponent: { bench: [inPlay("Machop", { damage: 40 })] } });
    const next = attack(state, "Revoloteo");
    const benchKo = choose(next, [optionIds(next)[1]]);
    expect(benchKo.opponentBench).toHaveLength(0);
    expect(prizesOwed(benchKo, "player")).toBe(1);
    const activeKo = resolveAttackChoice(next, [optionIds(next)[0]]);
    expect(activeKo.opponentActivePokemon).toBeNull();
    expect(activeKo.opponentNeedsToPromote).toBe(true);
    expect(prizesOwed(activeKo, "player")).toBe(1);
  });

  it("Stare: 10 damage and the chosen Pokémon's power stops until the end of the opponent's next turn", () => {
    const state = vs(rocket("Dark Arbok"), inPlay("Onix"), { opponent: { bench: [inPlay("Venusaur")] } });
    const next = attack(state, "Mirada");
    const done = choose(next, [optionIds(next)[1]]);
    const venusaur = done.opponentBench[0];
    expect(venusaur.currentDamage).toBe(10);
    expect(isPowerActive(done, venusaur)).toBe(false);
    const theirTurn = endTurn(done);
    expect(isPowerActive(theirTurn, theirTurn.opponentBench[0])).toBe(false);
    const afterTheirTurn = endTurn(theirTurn);
    expect(isPowerActive(afterTheirTurn, afterTheirTurn.opponentBench[0])).toBe(true);
  });

  it("Stare can't touch a Defending Pokémon protected by Agility, but a Benched one is fine", () => {
    const raichu = inPlay("Raichu", { protection: { type: "damageAndEffects", expiresAfterTurn: 3 } });
    const state = vs(rocket("Dark Arbok"), raichu, { opponent: { bench: [inPlay("Machop")] } });
    const next = attack(state, "Mirada");
    const done = choose(next, [optionIds(next)[0]]);
    expect(done.opponentActivePokemon!.currentDamage).toBe(0);
    expect(done.powersSuppressed ?? []).toEqual([]);
  });

  it("Coin Hurl: heads → choose and 20; tails → nothing to choose", () => {
    const state = vs(rocket("Meowth"), inPlay("Onix"));
    expect(attack(state, "Lanzamonedas", [T]).pendingAttackChoice).toBeUndefined();
    const heads = attack(state, "Lanzamonedas", [H]);
    expect(choose(heads, [optionIds(heads)[0]]).opponentActivePokemon!.currentDamage).toBe(20);
  });
});

describe("Drag Off, Knock Back, Fascinate, Fling (switching / removing the Defending Pokémon)", () => {
  it("Drag Off: needs an opponent's Bench; the chosen one is switched in first and takes 20 with W/R", () => {
    const machoke = rocket("Dark Machoke");
    expect(canExecuteAttack(vs(armedFor(machoke, "Arrastrar"), inPlay("Onix")), 0)).toMatch(/Banca/);
    // Bellsprout (Grass) is weak to Fire... Dark Machoke is Fighting: use Pikachu (weak to Fighting)
    const state = vs(machoke, inPlay("Onix"), { opponent: { bench: [inPlay("Pikachu", { set: "jungle" })] } });
    const next = attack(state, "Arrastrar");
    expect(next.opponentActivePokemon!.currentDamage).toBe(0);
    const done = choose(next, [optionIds(next)[0]]);
    expect(done.opponentActivePokemon!.pokemon.name).toBe("Pikachu");
    expect(done.opponentActivePokemon!.currentDamage).toBe(40);
    expect(names(done.opponentBench.map((p) => p.pokemon))).toEqual(["Onix"]);
  });

  it("Knock Back: after the damage the opponent chooses the new Defending Pokémon", () => {
    const state = vs(rocket("Dark Machoke"), inPlay("Onix"), { opponent: { bench: [inPlay("Machop")] } });
    const next = attack(state, "Empujón");
    expect(next.opponentActivePokemon!.currentDamage).toBe(30);
    expect(next.pendingAttackChoice!.step.chooser).toBe("opponent");
    expect(choose(next, [optionIds(next)[0]]).opponentActivePokemon!.pokemon.name).toBe("Machop");
  });

  it("Fascinate: heads → the attacker picks a Benched Pokémon to switch in; tails → nothing", () => {
    const state = vs(rocket("Dark Persian"), inPlay("Onix"), { opponent: { bench: [inPlay("Machop")] } });
    expect(attack(state, "Fascinar", [T]).pendingForceSwitch).toBeUndefined();
    expect(attack(state, "Fascinar", [H]).pendingForceSwitch).toBe(true);
  });

  it("Fling: the Defending Pokémon and everything attached go into its owner's deck; it promotes", () => {
    const onix = inPlay("Onix", { energy: [Fighting], damage: 20, evolvedFrom: [] });
    const state = vs(rocket("Dark Machamp"), onix, { opponent: { bench: [inPlay("Machop")], deck: [] } });
    const next = attack(state, "Lanzamiento");
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.opponentNeedsToPromote).toBe(true);
    expect(names(next.opponentDeck).sort()).toEqual(["Fighting Energy", "Onix"]);
    expect(next.opponentDiscard).toEqual([]);
  });
});

describe("coins: flipped by the opponent, per Fire Energy, minimum heads, chained", () => {
  it("Knock Down: the attack's coin is the opponent's (attackFlipper); tails = +20", () => {
    const state = vs(rocket("Dark Dugtrio"), inPlay("Onix"));
    expect(getAttackCoinPlan(state, 0)).toEqual({ smokescreen: 0, attack: 1, defender: 0, attackFlipper: "opponent" });
    expect(attack(state, "Derribar", [T]).opponentActivePokemon!.currentDamage).toBe(40);
    expect(attack(state, "Derribar", [H]).opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("Bench Manipulation: the opponent flips one coin per Benched Pokémon; 20 × tails, no W/R", () => {
    // Abra (Psychic-weak) as the Defending Pokémon: no ×2
    const state = vs(rocket("Dark Hypno"), inPlay("Abra", { set: "base" }), { opponent: { bench: [inPlay("Machop"), inPlay("Machop")] } });
    expect(getAttackCoinPlan(state, 1)).toMatchObject({ attack: 2, attackFlipper: "opponent" });
    expect(attack(state, "Manipulación de Banca", [T, H]).opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("Continuous Fireball: one coin per Fire Energy card; 50 × heads, discards that many Fire Energy", () => {
    const charizard = rocket("Dark Charizard", { energy: [Fire, Fire, Fire, Water] });
    const state = vs(charizard, inPlay("Snorlax", { set: "jungle" }));
    expect(getAttackCoinPlan(state, 1).attack).toBe(3);
    const next = attack(state, "Bola de Fuego Continua", [H, T, T]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(50);
    expect(names(next.playerActivePokemon!.attachedEnergy).sort()).toEqual(["Fire Energy", "Fire Energy", "Water Energy"]);
  });

  it("Petal Whirlwind: 3 coins, 30 × heads; 2 or more heads → Dark Vileplume is Confused", () => {
    const state = vs(rocket("Dark Vileplume"), inPlay("Snorlax", { set: "jungle" }));
    const two = attack(state, "Torbellino de Pétalos", [H, T, H]);
    expect(two.opponentActivePokemon!.currentDamage).toBe(60);
    expect(two.playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
    const one = attack(state, "Torbellino de Pétalos", [H, T, T]);
    expect(one.playerActivePokemon!.statusConditions).not.toContain(StatusCondition.Confused);
  });

  it("Surprise Thunder: heads then heads = 20 to each opponent's Benched Pokémon, heads then tails = 10, tails = none", () => {
    const state = vs(rocket("Dark Raichu"), inPlay("Snorlax", { set: "jungle" }), { opponent: { bench: [inPlay("Machop"), inPlay("Abra", { set: "base" })] } });
    expect(getAttackCoinPlan(state, 0).attack).toBe(2);
    expect(attack(state, "Trueno Sorpresa", [H, H]).opponentBench.map((p) => p.currentDamage)).toEqual([20, 20]);
    expect(attack(state, "Trueno Sorpresa", [H, T]).opponentBench.map((p) => p.currentDamage)).toEqual([10, 10]);
    expect(attack(state, "Trueno Sorpresa", [T, H]).opponentBench.map((p) => p.currentDamage)).toEqual([0, 0]);
  });

  it("Fireball: only with a Fire Energy card attached; heads discards 1, tails does nothing", () => {
    const noFire = { ...rocket("Dark Charmeleon"), attachedEnergy: [gameCard("Rainbow Energy", "rocket"), gameCard("Rainbow Energy", "rocket"), gameCard("Rainbow Energy", "rocket")] };
    // Rainbow Energy counts as Fire in play: the requirement is met
    expect(canExecuteAttack(vs(noFire, inPlay("Onix")), 1)).toBeNull();
    const state = vs(rocket("Dark Charmeleon", { energy: [Fire, Fire, Fire] }), inPlay("Snorlax", { set: "jungle" }));
    const heads = attack(state, "Bola de Fuego", [H]);
    expect(heads.opponentActivePokemon!.currentDamage).toBe(70);
    expect(heads.playerActivePokemon!.attachedEnergy).toHaveLength(2);
    const tails = attack(state, "Bola de Fuego", [T]);
    expect(tails.opponentActivePokemon!.currentDamage).toBe(0);
    expect(tails.playerActivePokemon!.attachedEnergy).toHaveLength(3);
    const ditto = { ...rocket("Dark Charmeleon"), attachedEnergy: [energy(Water), energy(Water), energy(Water)] };
    expect(canExecuteAttack(vs(ditto, inPlay("Onix")), 1)).not.toBeNull();
  });

  it("Playing with Fire: heads → +20 and discard 1 Fire Energy", () => {
    const state = vs(rocket("Dark Flareon", { energy: [Fire, Fire] }), inPlay("Snorlax", { set: "jungle" }));
    const heads = attack(state, "Jugar con Fuego", [H]);
    expect(heads.opponentActivePokemon!.currentDamage).toBe(50);
    expect(heads.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(attack(state, "Jugar con Fuego", [T]).opponentActivePokemon!.currentDamage).toBe(30);
  });
});

describe("bench-counting damage", () => {
  it("Mass Explosion: 20 × Koffing/Weezing/Dark Weezing in play (both sides, W/R), then 20 to each of them", () => {
    const weezing = rocket("Dark Weezing");
    const state = vs(weezing, inPlay("Koffing", { set: "base" }), {
      player: { bench: [rocket("Koffing"), inPlay("Machop")] },
      opponent: { bench: [inPlay("Weezing", { set: "fossil" })] },
    });
    const next = attack(state, "Explosión Masiva");
    // 4 in play → 80; the Defending Koffing (Grass, no Grass weakness) also takes the extra 20 → KO anyway
    expect(next.opponentActivePokemon?.pokemon.name).not.toBe("Koffing");
    expect(next.playerActivePokemon!.currentDamage).toBe(20);
    expect(next.playerBench.map((p) => p.currentDamage)).toEqual([20, 0]);
    expect(next.opponentBench.find((p) => p.pokemon.name === "Weezing")?.currentDamage ?? 20).toBe(20);
  });

  it("Magnetism: +10 per Magnemite, Magneton and Dark Magneton on your Bench", () => {
    const state = vs(rocket("Magnemite"), inPlay("Snorlax", { set: "jungle" }), {
      player: { bench: [inPlay("Magnemite", { set: "base" }), rocket("Dark Magneton"), inPlay("Machop")] },
    });
    expect(attack(state, "Magnetismo").opponentActivePokemon!.currentDamage).toBe(30);
  });
});

describe("attacker choices after the damage", () => {
  it("Teleport Blast: may switch with a Benched Pokémon (or not)", () => {
    const state = vs(rocket("Dark Alakazam"), inPlay("Onix"), { player: { bench: [inPlay("Machop")] } });
    const next = attack(state, "Teletransporte Explosivo");
    expect(next.opponentActivePokemon!.currentDamage).toBe(30);
    expect(next.pendingAttackChoice!.step.minSelections).toBe(0);
    expect(choose(next, [optionIds(next)[0]]).playerActivePokemon!.pokemon.name).toBe("Machop");
    expect(choose(next, []).playerActivePokemon!.pokemon.name).toBe("Dark Alakazam");
  });

  it("Magnetic Lines: a basic Energy of the Defending Pokémon moves to a Benched Pokémon of the opponent", () => {
    const onix = inPlay("Onix", { energy: [Fighting, Fighting] });
    const state = vs(rocket("Dark Magneton"), onix, { opponent: { bench: [inPlay("Machop")] } });
    const next = attack(state, "Líneas Magnéticas");
    const afterEnergy = choose(next, [optionIds(next)[0]]);
    expect(afterEnergy.pendingAttackChoice!.step.options.map((o) => o.label)).toEqual(["Machop (Banca rival)"]);
    const done = choose(afterEnergy, [optionIds(afterEnergy)[0]]);
    expect(done.opponentActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(done.opponentBench[0].attachedEnergy).toHaveLength(1);
    // No Bench: nothing to choose
    expect(attack(vs(rocket("Dark Magneton"), onix), "Líneas Magnéticas").pendingAttackChoice).toBeUndefined();
  });

  it("Energy Bomb: every attached Energy goes to the Bench as chosen; with no Bench they are discarded", () => {
    const electrode = rocket("Dark Electrode", { energy: [Lightning, Lightning] });
    const state = vs(electrode, inPlay("Onix"), { player: { bench: [inPlay("Machop"), inPlay("Abra", { set: "base" })] } });
    let next = attack(state, "Bomba de Energía");
    next = choose(next, [optionIds(next)[0]]);
    next = choose(next, [optionIds(next)[1]]);
    expect(next.pendingAttackChoice).toBeUndefined();
    expect(next.playerActivePokemon!.attachedEnergy).toEqual([]);
    expect(next.playerBench.map((p) => p.attachedEnergy.length)).toEqual([1, 1]);
    const alone = attack(vs(electrode, inPlay("Onix")), "Bomba de Energía");
    expect(alone.playerActivePokemon!.attachedEnergy).toEqual([]);
    expect(alone.playerDiscard).toHaveLength(2);
  });

  it("Third Eye: discard 1 attached Energy card, then draw up to 3", () => {
    const golduck = rocket("Dark Golduck", { energy: [Psychic, Water] });
    const state = vs(golduck, inPlay("Onix"), { player: { deck: [card("Abra"), card("Machop"), card("Zubat"), card("Ekans")] } });
    let next = attack(state, "Tercer Ojo");
    next = choose(next, [golduck.attachedEnergy[1].id]);
    expect(optionIds(next)).toEqual(["0", "1", "2", "3"]);
    next = choose(next, ["2"]);
    expect(next.playerHand).toHaveLength(2);
    expect(names(next.playerDiscard)).toEqual(["Water Energy"]);
  });

  it("Flame Pillar: may discard a Fire Energy; then 10 to a chosen Benched Pokémon (no W/R)", () => {
    const rapidash = rocket("Dark Rapidash", { energy: [Fire, Fire] });
    const state = vs(rapidash, inPlay("Onix"), { opponent: { bench: [inPlay("Bulbasaur", { set: "base" })] } });
    const next = attack(state, "Pilar de Llamas");
    expect(next.opponentActivePokemon!.currentDamage).toBe(30);
    expect(choose(next, []).playerActivePokemon!.attachedEnergy).toHaveLength(2);
    const discarded = choose(next, [optionIds(next)[0]]);
    expect(discarded.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    const done = choose(discarded, [optionIds(discarded)[0]]);
    expect(done.opponentBench[0].currentDamage).toBe(10);
  });

  it("Afternoon Nap: a Psychic Energy card from the deck attached to Slowpoke", () => {
    const slowpoke = rocket("Slowpoke");
    const state = vs(slowpoke, inPlay("Onix"), { player: { deck: [energy(Grass), energy(Psychic), gameCard("Rainbow Energy", "rocket")] } });
    const next = attack(state, "Siesta");
    expect(optionLabels(next)).toEqual(["Energía Psíquica"]);
    const done = choose(next, [optionIds(next)[0]]);
    expect(names(done.playerActivePokemon!.attachedEnergy).slice(-1)).toEqual(["Psychic Energy"]);
    expect(done.playerDeck).toHaveLength(2);
  });

  it("Rapid Evolution: Gyarados or Dark Gyarados from the deck on Magikarp (counts as evolving)", () => {
    const magikarp = rocket("Magikarp", { damage: 10, statuses: [StatusCondition.Poisoned] });
    const state = vs(magikarp, inPlay("Onix"), { player: { deck: [card("Dark Gyarados"), inPlay("Gyarados", { set: "base" }).pokemon, card("Abra")] } });
    const next = attack(state, "Evolución Rápida");
    expect(optionLabels(next)).toEqual(["Dark Gyarados", "Gyarados"]);
    const done = choose(next, [optionIds(next)[0]]);
    const evolved = done.playerActivePokemon!;
    expect(evolved.pokemon.name).toBe("Dark Gyarados");
    expect(names(evolved.previousEvolutions ?? [])).toEqual(["Magikarp"]);
    expect(evolved.currentDamage).toBe(10);
    expect(evolved.statusConditions).toEqual([]);
    expect(done.playerDeck).toHaveLength(2);
    // Prehistoric Power stops it
    const blocked = attack(vs(magikarp, inPlay("Aerodactyl", { set: "fossil" }), { player: { deck: [card("Dark Gyarados")] } }), "Evolución Rápida");
    expect(blocked.pendingAttackChoice).toBeUndefined();
    expect(blocked.playerActivePokemon!.pokemon.name).toBe("Magikarp");
  });
});

describe("other effects", () => {
  it("Mirror Shell: during the opponent's next turn, attack damage to Dark Wartortle is done back to the attacker (even if Knocked Out)", () => {
    const wartortle = rocket("Dark Wartortle", { energy: [Water, Water] });
    const shelled = attack(vs(wartortle, inPlay("Machop")), "Caparazón Espejo");
    expect(shelled.playerActivePokemon!.mirrorShellOnTurn).toBe(shelled.turnNumber);
    // Opponent's turn: Machop punches it
    const theirView: GameState = {
      ...shelled,
      turnNumber: shelled.turnNumber + 1,
      attackedThisTurn: undefined,
      playerActivePokemon: armedFor(shelled.opponentActivePokemon!, "Patada baja"),
      opponentActivePokemon: shelled.playerActivePokemon,
      opponentBench: [inPlay("Abra", { set: "base" })],
    };
    const hit = executeAttack(theirView, 0, { coinResults: [], skipEndTurn: true });
    expect(hit.opponentActivePokemon!.currentDamage).toBe(20);
    expect(hit.playerActivePokemon!.currentDamage).toBe(20);
    const ko = executeAttack({ ...theirView, opponentActivePokemon: { ...theirView.opponentActivePokemon!, currentDamage: 50 } }, 0, { coinResults: [], skipEndTurn: true });
    expect(ko.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("Vanish: Abra goes into the deck, its Energy to the discard pile; the player promotes", () => {
    const abra = rocket("Abra", { energy: [Psychic] });
    const state = vs(abra, inPlay("Onix"), { player: { bench: [inPlay("Machop")], deck: [] } });
    const next = attack(state, "Desvanecerse");
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(names(next.playerDeck)).toEqual(["Abra"]);
    expect(names(next.playerDiscard)).toEqual(["Psychic Energy"]);
    expect(next.opponentPrizes).toHaveLength(6);
  });

  it("Mischief shuffles the opponent's deck; Dizziness draws a card", () => {
    const deck = Array.from({ length: 30 }, (_, i) => ({ ...energy(Grass), id: `g${i}` }));
    const mischief = attack(vs(rocket("Mankey"), inPlay("Onix"), { opponent: { deck } }), "Travesura");
    expect(mischief.opponentDeck.map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
    expect(mischief.opponentDeck.map((c) => c.id)).not.toEqual(deck.map((c) => c.id));
    expect(attack(vs(rocket("Psyduck"), inPlay("Onix")), "Mareo").playerHand).toHaveLength(1);
  });

  it("Conversion 1 (Porygon): the engine changes the Weakness when the caller passes the chosen type", () => {
    const state = vs(rocket("Porygon"), inPlay("Onix"));
    expect(attack(state, "Conversión 1", [], { chosenType: Water }).opponentActivePokemon!.modifiedWeakness).toBe(Water);
    expect(attack(state, "Conversión 1").opponentActivePokemon!.modifiedWeakness).toBeUndefined();
  });
});
