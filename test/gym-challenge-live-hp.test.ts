import { prizesOwed } from "@/lib/gameState";
/**
 * Gym Challenge Task 4: live HP and card copies.
 *
 * - #97 Sabrina's Gastly, Gaseous Form: "+10 HP for each Psychic Energy card attached to it. This
 *   power works even if Sabrina's Gastly is Asleep, Confused, or Paralyzed."
 * - #10 Koga's Ditto, Giant Growth: "Flip a coin. If heads, Koga's Ditto's maximum HP is now 80 and
 *   Koga's Ditto's Pound attack's base damage is 30 instead of 10. (Benching Koga's Ditto ends this effect.)"
 * - #3 Brock's Ninetales, Shapeshift: attach an Evolution card from the hand, "treat it as if it were
 *   that Pokémon"; discarded when it becomes Asleep / Confused / Paralyzed or by its owner.
 * - #16 Sabrina's Alakazam, Psylink: a copy of every attack of your Psychic Pokémon in play.
 * - #29 Sabrina's Gengar, Dark Wave: "All Pokémon Powers stop working until the end of your opponent's next turn."
 * - #66 Blaine's Vulpix, Call Will-o'-the-wisp: "Flip 3 coins. For each heads, if you have a Fire
 *   Energy card in your discard pile, put it into your hand."
 * - #96 Sabrina's Gastly, Fade Out: 30, then "Return Sabrina's Gastly and all Energy cards attached
 *   to it to your hand. (Discard all other cards attached to Sabrina's Gastly.)"
 * - #2 Blaine's Charizard, Roaring Flames: discard every Fire Energy card attached; 20 + 20 per card.
 *
 * Lowering a Pokémon's HP below its damage Knocks it Out with a Prize (state-based checkKnockouts).
 */
import { describe, it, expect } from "vitest";
import {
  canExecuteAttack,
  canUsePokemonPower,
  checkKnockouts,
  endTurn,
  executeAttack,
  executeRetreat,
  getAvailableAttacks,
  getEffectiveHp,
  getEffectivePokemonCard,
  getPowerSteps,
  playTrainerCard,
  resolveAttackChoice,
  usePokemonPower,
  ALL_CARDS,
  type GameState,
  type PokemonInPlay,
} from "@/index";
import { attachTrainer } from "@/domain/trainers/attached";
import { ownerOf } from "@/domain/cards/owner";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Psychic, Fire, Water } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const gc = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-challenge", ...opts });
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
function gastlyNumber(n: 96 | 97, opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const p = gc("Sabrina's Gastly", opts);
  if (p.pokemon.kind === "pokemon" && p.pokemon.number === n) return p;
  // gameCard returns the first card with the name: build the other one from the catalog
  return { ...p, pokemon: { ...findGastly(n), id: p.pokemon.id } } as PokemonInPlay;
}
function findGastly(n: number) {
  const card = ALL_CARDS.find((c) => c.name === "Sabrina's Gastly" && c.kind === "pokemon" && c.number === n);
  if (!card) throw new Error(`no Sabrina's Gastly #${n}`);
  return card;
}

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}

// ---------------------------------------------------------------------------- Gaseous Form

describe("Gaseous Form (Sabrina's Gastly #97): +10 HP per Psychic Energy card attached", () => {
  it("40 → 60 with 2 Psychic Energy cards; a Rainbow attached counts; works while Asleep", () => {
    const gastly = gastlyNumber(97, { energy: [Psychic, Psychic] });
    const state = vs(inPlay("Machop"), gastly);
    expect(getEffectiveHp(state, gastly)).toBe(60);
    expect(getEffectivePokemonCard(state, gastly)!.hp).toBe(60);
    const rainbow = { ...gastly, attachedEnergy: [...gastly.attachedEnergy, gameCard("Rainbow Energy", "rocket")] };
    expect(getEffectiveHp(state, rainbow)).toBe(70);
    const asleep = { ...gastly, statusConditions: [StatusCondition.Asleep] };
    expect(getEffectiveHp(state, asleep)).toBe(60);
    // Other Energy doesn't count
    expect(getEffectiveHp(state, { ...gastly, attachedEnergy: [energy(Water)] })).toBe(40);
  });

  it("a Benched Gastly with more damage than its printed HP stays in play", () => {
    const gastly = gastlyNumber(97, { energy: [Psychic, Psychic], damage: 50 });
    const state = vs(inPlay("Machop"), inPlay("Onix"), { player: { bench: [gastly] } });
    expect(checkKnockouts(state)).toBe(state);
  });

  it("Energy Removal on it Knocks it Out when its HP drops to its damage (Prize)", () => {
    const gastly = gastlyNumber(97, { energy: [Psychic], damage: 40 });
    const removal = gameCard("Energy Removal", "base");
    const state = deepFreeze(vs(inPlay("Machop"), gastly, { player: { hand: [removal] }, opponent: { bench: [inPlay("Onix")] } }));
    const played = playTrainerCard(state, removal.id, [[gastly.attachedEnergy[0].id]]);
    expect(played.opponentActivePokemon?.pokemon.id).not.toBe(gastly.pokemon.id);
    expect(names(played.opponentDiscard)).toContain("Sabrina's Gastly");
    expect(prizesOwed(played, "player")).toBe(1);
  });

  it("Dark Wave stopping Gaseous Form Knocks it Out (Prize)", () => {
    const gengar = gc("Sabrina's Gengar", { energy: [Psychic, Psychic] });
    const gastly = gastlyNumber(97, { energy: [Psychic, Psychic], damage: 30 });
    const state = deepFreeze(vs(gengar, gastly, { opponent: { bench: [inPlay("Onix")] } }));
    const done = attack(state, "Onda Oscura");
    expect(done.powersSuppressed).toEqual([{ source: "Onda Oscura", expiresAfterTurn: state.turnNumber + 1 }]);
    expect(names(done.opponentDiscard)).toContain("Sabrina's Gastly");
    expect(prizesOwed(done, "player")).toBe(1);
  });
});

// ---------------------------------------------------------------------------- Dark Wave

describe("Dark Wave (Sabrina's Gengar): every Pokémon Power stops until the end of the opponent's next turn", () => {
  it("20 damage; powers stop for both sides; they work again two endTurns later", () => {
    const gengar = gc("Sabrina's Gengar", { energy: [Psychic, Psychic] });
    const alakazam = gc("Sabrina's Alakazam");
    const state = vs(gengar, inPlay("Onix"), { player: { bench: [alakazam, gc("Sabrina's Kadabra")] } });
    // Its own, Gengar's 2 and Kadabra's 2 (Psylink)
    expect(getAvailableAttacks(state, alakazam)).toHaveLength(5);
    const done = attack(state, "Onda Oscura");
    expect(done.opponentActivePokemon!.currentDamage).toBe(20);
    expect(getAvailableAttacks(done, done.playerBench[0])).toHaveLength(1);
    const next = endTurn(done); // the opponent's turn (turn + 1): still stopped
    expect(next.powersSuppressed).toHaveLength(1);
    const after = endTurn(next);
    expect(after.powersSuppressed).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------- Giant Growth

describe("Giant Growth (Koga's Ditto): heads = max HP 80 and Pound 30, until it is Benched", () => {
  it("heads: 80 HP and Pound does 30; tails: nothing", () => {
    const ditto = gc("Koga's Ditto");
    const state = deepFreeze(vs(ditto, inPlay("Onix")));
    const grown = attack(state, "Crecimiento Gigante", [H]);
    const after = grown.playerActivePokemon!;
    expect(getEffectiveHp(grown, after)).toBe(80);
    expect(getEffectivePokemonCard(grown, after)!.attacks.find((a) => a.name === "Destructor")!.damage).toBe(30);
    // The next turn Pound does 30 (Onix: no Weakness to Colorless)
    const nextTurn: GameState = { ...grown, attackedThisTurn: false, turnNumber: grown.turnNumber + 2 };
    const pounded = attack(nextTurn, "Destructor");
    expect(pounded.opponentActivePokemon!.currentDamage).toBe(30);
    const failed = attack(state, "Crecimiento Gigante", [T]);
    expect(getEffectiveHp(failed, failed.playerActivePokemon!)).toBe(40);
  });

  it("Benched with 50 damage, it is back to 40 HP and Knocked Out (the opponent takes a Prize)", () => {
    const ditto = gc("Koga's Ditto", { energy: [Fire], damage: 50, hpOverride: { hp: 80, attackName: "Destructor", damage: 30 } });
    const state = deepFreeze(vs(ditto, inPlay("Onix"), { player: { bench: [inPlay("Machop")] } }));
    expect(getEffectiveHp(state, ditto)).toBe(80);
    const retreated = executeRetreat(state, [ditto.attachedEnergy[0].id], 0);
    expect(retreated.playerBench.map((p) => p.pokemon.name)).not.toContain("Koga's Ditto");
    expect(names(retreated.playerDiscard)).toContain("Koga's Ditto");
    expect(prizesOwed(retreated, "opponent")).toBe(1);
  });
});

// ---------------------------------------------------------------------------- Shapeshift

describe("Shapeshift (Brock's Ninetales): an Evolution card from the hand, treated as that Pokémon", () => {
  const dewgong = () => gameCard("Misty's Dewgong", "gym-challenge");

  it("attaches the card: name, types, HP, Weakness, Retreat Cost and attacks of the copy; keeps its power", () => {
    const card = dewgong();
    const ninetales = gc("Brock's Ninetales");
    const state = deepFreeze(vs(inPlay("Machop"), inPlay("Onix"), { player: { bench: [ninetales], hand: [card] } }));
    expect(canUsePokemonPower(state, ninetales.pokemon.id)).toBeNull();
    const step = getPowerSteps(state, ninetales.pokemon.id, [])!;
    expect(step.options.map((o) => o.id)).toEqual([card.id]);
    const used = usePokemonPower(state, ninetales.pokemon.id, [[card.id]]);
    expect(used.playerHand).toHaveLength(0);
    const after = used.playerBench[0];
    const view = getEffectivePokemonCard(used, after)!;
    expect(view.id).toBe(ninetales.pokemon.id);
    expect(view.name).toBe("Misty's Dewgong");
    expect(ownerOf(view)).toBe("Misty");
    expect(view.types).toEqual([Water]);
    expect(view.hp).toBe(80);
    expect(view.weaknesses).toEqual([EnergyType.Lightning]);
    expect(view.retreatCost).toBe(2);
    expect(view.power?.name).toBe("Cambio de Forma");
    expect(getAvailableAttacks(used, after).map((a) => a.attack.name)).toEqual(["Lanzamiento de Hielo", "Derribo"]);
    // Once per turn
    expect(canUsePokemonPower(used, ninetales.pokemon.id)).not.toBeNull();
  });

  it("Asleep / Confused / Paralyzed discards the card (state-based)", () => {
    const card = dewgong();
    const ninetales = { ...gc("Brock's Ninetales", { statuses: [StatusCondition.Confused] }), attachedTrainers: [card] };
    const state = deepFreeze(vs(ninetales, inPlay("Onix")));
    expect(getEffectivePokemonCard(state, ninetales)!.name).toBe("Brock's Ninetales");
    const swept = checkKnockouts(state);
    expect(swept.playerActivePokemon!.attachedTrainers).toEqual([]);
    expect(names(swept.playerDiscard)).toEqual(["Misty's Dewgong"]);
  });

  it("Dark Wave stops the copy without discarding the card", () => {
    const ninetales = { ...gc("Brock's Ninetales"), attachedTrainers: [dewgong()] };
    const state = vs(ninetales, inPlay("Onix"), { powersSuppressed: [{ source: "Onda Oscura", expiresAfterTurn: 4 }] });
    expect(getEffectivePokemonCard(state, ninetales)!.name).toBe("Brock's Ninetales");
    expect(checkKnockouts(state)).toBe(state);
  });

  it("a lower HP Knocks it Out with a Prize; the attached card leaves play with it", () => {
    const kadabra = gameCard("Kadabra", "base");
    const ninetales = gc("Brock's Ninetales", { damage: 60 });
    const state = deepFreeze(vs(inPlay("Machop"), inPlay("Onix"), { player: { bench: [ninetales], hand: [kadabra] } }));
    const used = usePokemonPower(state, ninetales.pokemon.id, [[kadabra.id]]);
    expect(used.playerBench).toHaveLength(0);
    expect(names(used.playerDiscard).sort()).toEqual(["Brock's Ninetales", "Kadabra"]);
    expect(prizesOwed(used, "opponent")).toBe(1);
  });

  it("its owner may discard the card during the turn", () => {
    const card = dewgong();
    const ninetales = { ...gc("Brock's Ninetales"), attachedTrainers: [card] };
    const state = deepFreeze(vs(ninetales, inPlay("Onix")));
    expect(canUsePokemonPower(state, ninetales.pokemon.id)).toBeNull();
    expect(getPowerSteps(state, ninetales.pokemon.id, [])).toBeNull();
    const done = usePokemonPower(state, ninetales.pokemon.id, []);
    expect(done.playerActivePokemon!.attachedTrainers).toEqual([]);
    expect(names(done.playerDiscard)).toEqual(["Misty's Dewgong"]);
  });
});

// ---------------------------------------------------------------------------- Psylink

describe("Psylink (Sabrina's Alakazam): the attacks of your other Psychic Pokémon in play", () => {
  const setup = (energyTypes: EnergyType[]) => {
    const alakazam = gc("Sabrina's Alakazam", { energy: energyTypes });
    const kadabra = gc("Sabrina's Kadabra");
    return { alakazam, kadabra, state: deepFreeze(vs(alakazam, inPlay("Onix"), { player: { bench: [kadabra, inPlay("Machop")] } })) };
  };

  it("lists a Benched Sabrina's Kadabra's attacks after its own, with stable indices", () => {
    const { alakazam, state } = setup([Psychic]);
    const list = getAvailableAttacks(state, alakazam);
    expect(list.map((a) => [a.attack.name, a.fromCard, a.index, !!a.psylink])).toEqual([
      ["Megaquemadura", "Sabrina's Alakazam", 0, false],
      ["Drenar Vida", "Sabrina's Kadabra", 1, true],
      ["Psicodisparo", "Sabrina's Kadabra", 2, true],
    ]);
    // Asleep: Psylink can't be used
    const asleep = { ...alakazam, statusConditions: [StatusCondition.Asleep] };
    expect(getAvailableAttacks(state, asleep)).toHaveLength(1);
  });

  it("pays the copied attack's cost with Alakazam's Energy", () => {
    expect(canExecuteAttack(setup([Psychic]).state, 2)).not.toBeNull();
    const { state } = setup([Psychic, Psychic, Psychic]);
    expect(canExecuteAttack(state, 2)).toBeNull();
    const done = executeAttack(state, 2, { coinResults: [], skipEndTurn: true });
    expect(done.opponentActivePokemon!.currentDamage).toBe(30);
  });

  it("a paused attack (Sabrina's ESP) resumes with the same index on the untouched state", () => {
    const { state: base } = setup([Psychic]);
    const esp = gameCard("Sabrina's ESP", "gym-heroes");
    const state = deepFreeze({ ...base, playerActivePokemon: attachTrainer(base.playerActivePokemon!, esp, "endOfTurn") });
    const paused = executeAttack(state, 1, { coinResults: [H], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("espReflip");
    expect(paused.opponentActivePokemon).toEqual(state.opponentActivePokemon);
    const done = resolveAttackChoice(paused, ["keep"], { skipEndTurn: true });
    // Life Drain on heads: Onix (90) left with 10 HP
    expect(done.opponentActivePokemon!.currentDamage).toBe(80);
    expect(done.events.some((e) => e.message.includes("Drenar Vida"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------- Fade Out

describe("Fade Out (Sabrina's Gastly #96): 30, then Gastly and its Energy go to the hand", () => {
  it("returns Gastly and its Energy cards; other attached cards are discarded", () => {
    const esp = gameCard("Sabrina's ESP", "gym-heroes");
    const gastly = attachTrainer(gastlyNumber(96, { energy: [Psychic, Psychic] }), esp, "endOfTurn");
    const state = deepFreeze(vs(gastly, inPlay("Onix"), { player: { bench: [inPlay("Abra")] } }));
    const done = attack(state, "Esfumarse");
    expect(done.opponentActivePokemon!.currentDamage).toBe(30);
    expect(done.playerActivePokemon).toBeNull();
    expect(names(done.playerHand).sort()).toEqual(["Psychic Energy", "Psychic Energy", "Sabrina's Gastly"]);
    expect(names(done.playerDiscard)).toEqual(["Sabrina's ESP"]);
    expect(done.playerNeedsToPromote).toBe(true);
  });
});

// ---------------------------------------------------------------------------- Call Will-o'-the-wisp

describe("Call Will-o'-the-wisp (Blaine's Vulpix): a Fire Energy card from the discard pile per heads", () => {
  const discard = () => [energy(Fire), energy(Fire), energy(Water), gameCard("Rainbow Energy", "rocket")];

  it("2 heads: 2 basic Fire Energy cards to the hand (Rainbow isn't one in the discard pile)", () => {
    const pile = discard();
    const state = deepFreeze(vs(gc("Blaine's Vulpix"), inPlay("Onix"), { player: { discard: pile } }));
    const pending = attack(state, "Llamar al Fuego Fatuo", [H, T, H]);
    const step = pending.pendingAttackChoice!.step;
    expect(step.options.map((o) => o.id)).toEqual([pile[0].id, pile[1].id]);
    expect([step.minSelections, step.maxSelections]).toEqual([2, 2]);
    const done = resolveAttackChoice(pending, [pile[0].id, pile[1].id], { skipEndTurn: true });
    expect(names(done.playerHand)).toEqual(["Fire Energy", "Fire Energy"]);
  });

  it("1 heads with 2 Fire Energy cards: only 1; no heads: nothing to choose", () => {
    const pile = discard();
    const state = vs(gc("Blaine's Vulpix"), inPlay("Onix"), { player: { discard: pile } });
    const pending = attack(state, "Llamar al Fuego Fatuo", [T, H, T]);
    expect([pending.pendingAttackChoice!.step.minSelections, pending.pendingAttackChoice!.step.maxSelections]).toEqual([1, 1]);
    const none = attack(state, "Llamar al Fuego Fatuo", [T, T, T]);
    expect(none.pendingAttackChoice).toBeUndefined();
    expect(none.playerHand).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------- Roaring Flames

describe("Roaring Flames (Blaine's Charizard): discard every Fire Energy card, 20 + 20 per card", () => {
  it("3 Fire Energy cards (a Rainbow counts): 80 damage, the Water Energy stays", () => {
    const charizard = gc("Blaine's Charizard", { energy: [Fire, Fire, Water] });
    const withRainbow = { ...charizard, attachedEnergy: [...charizard.attachedEnergy, gameCard("Rainbow Energy", "rocket")] };
    const defender = inPlay("Snorlax");
    const state = deepFreeze(vs(withRainbow, defender));
    const done = attack(state, "Llamas Rugientes");
    expect(done.opponentActivePokemon!.currentDamage).toBe(80);
    expect(names(done.playerActivePokemon!.attachedEnergy)).toEqual(["Water Energy"]);
    expect(done.playerDiscard).toHaveLength(3);
  });
});
