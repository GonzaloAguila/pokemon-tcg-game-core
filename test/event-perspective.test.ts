/**
 * Event wording of Fossil / Team Rocket effects and of choice resolutions.
 *
 * Convention (see CLAUDE.md "Model and conventions"): an engine function writes its events for
 * the view it ran on; the only relative forms are the classic leading ones consumers already
 * rewrite ("Jugaste X", "Robaste N cartas", "Descartaste X", "Debes elegir un Pokémon de tu
 * banca para continuar"). Every other line of these effects is perspective-free: it names the
 * Pokémon / cards and says "el atacante", "el defensor", "quien lo jugó", "el otro jugador"
 * instead of tu / rival, so it reads right whichever side resolved it (the defender answering
 * Terror Strike, the AI's view in single-player, the API's neutral log).
 */
import { describe, it, expect } from "vitest";
import {
  evolvePokemonCard,
  executeAttack,
  playTrainerCard,
  resolveAttackChoice,
  resolvePowerChoice,
  usePokemonPower,
  type GameState,
} from "@/index";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex } from "./helpers/state";
import { EnergyType } from "@/domain/constants";

const H = "heads" as const;
const T = "tails" as const;

const ALLOWED_RELATIVE_LINES = [
  /^Jugaste [^:]*$/, // "Jugaste Mr. Fuji" (nothing relative after it)
  /^Jugaste [^-]+ - Monedas?: (\[coin:(heads|tails)\][ ,]*)+$/,
  /^Robaste \d+ cartas?$/,
  /^Debes elegir un Pokémon de tu banca para continuar$/,
];
const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival|Pusiste|Tomaste|Mostraste|miraste|Barajaste|barajaste|descartaste)\b/;

/** Lines added by `after` that break the convention. */
function badLines(before: GameState, after: GameState): string[] {
  return after.events
    .slice(before.events.length)
    .map((e) => e.message)
    .filter((m) => !ALLOWED_RELATIVE_LINES.some((ok) => ok.test(m)) && RELATIVE.test(m));
}

const lines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}

describe("choice resolutions", () => {
  it("Terror Strike answered by the defender: the log names the new Active without 'rival'", () => {
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: inPlay("Arbok", { set: "fossil" }) }, opponent: { active: inPlay("Machamp"), bench: [abra] } });
    const attacked = attack(state, "Golpe Terrorífico", [H]);
    expect(badLines(state, attacked)).toEqual([]);
    expect(lines(state, attacked).join("\n")).not.toContain(attacked.pendingAttackChoice!.step.description);
    const answered = resolveAttackChoice(attacked, [abra.pokemon.id], { skipEndTurn: true });
    expect(badLines(attacked, answered)).toEqual([]);
    expect(lines(attacked, answered)).toContain("Golpe Terrorífico: Abra pasa a ser el Pokémon activo");
  });

  it("Prophecy and Wildfire name the attacker's / defender's deck", () => {
    const deck = [gameCard("Abra"), gameCard("Bill"), gameCard("Machop")];
    const state = makeState({ player: { active: inPlay("Hypno", { set: "fossil" }) }, opponent: { active: inPlay("Machamp"), deck } });
    const first = attack(state, "Profecía");
    const chose = resolveAttackChoice(first, ["opponent"], { skipEndTurn: true });
    expect(badLines(first, chose)).toEqual([]);
    expect(lines(first, chose).join("\n")).toContain("mazo del defensor");

    const moltres = inPlay("Moltres", { set: "fossil", energy: [EnergyType.Fire, EnergyType.Fire, EnergyType.Fire, EnergyType.Fire] });
    const wild = makeState({ player: { active: moltres }, opponent: { active: inPlay("Machamp"), deck: [gameCard("Abra"), gameCard("Bill")] } });
    const pending = attack(wild, "Fuego Salvaje");
    const fire = moltres.attachedEnergy[0].id;
    const done = resolveAttackChoice(pending, [fire], { skipEndTurn: true });
    expect(badLines(pending, done)).toEqual([]);
  });

  it("Summon Minions: the trigger line doesn't copy the step; nothing mixes 'su' and 'tu'", () => {
    const dragonite = gameCard("Dark Dragonite", "rocket");
    const basics = [gameCard("Abra"), gameCard("Machop")];
    const state = makeState({
      turnNumber: 5,
      player: { active: inPlay("Dark Dragonair", { set: "rocket", playedOnTurn: 1 }), hand: [dragonite], deck: basics },
      opponent: { active: inPlay("Onix") },
    });
    const evolved = evolvePokemonCard(state, dragonite.id, state.playerActivePokemon!.pokemon.id);
    expect(evolved.pendingPowerChoice).toBeDefined();
    expect(badLines(state, evolved)).toEqual([]);
    expect(lines(state, evolved).join("\n")).not.toContain(evolved.pendingPowerChoice!.step.description);
    const resolved = resolvePowerChoice(evolved, [basics[0].id]);
    expect(badLines(evolved, resolved)).toEqual([]);
  });
});

describe("Fossil / Team Rocket Trainers", () => {
  const hand = (cards: ReturnType<typeof gameCard>[], extra: Parameters<typeof makeState>[0] = {}) =>
    makeState({
      ...extra,
      player: { active: inPlay("Machop"), hand: cards, ...(extra.player ?? {}) },
      opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) },
    });

  it("Challenge! accepted and declined", () => {
    const card = gameCard("Challenge!", "rocket");
    const mine = gameCard("Abra");
    const theirs = gameCard("Machop");
    const state = hand([card], { player: { deck: [mine, gameCard("Bill"), gameCard("Bill")] }, opponent: { deck: [theirs] } });
    const accepted = playTrainerCard(state, card.id, [["accept"], [mine.id], [theirs.id]]);
    expect(badLines(state, accepted)).toEqual([]);
    expect(lines(state, accepted)).toEqual(expect.arrayContaining(["Challenge!: Abra a la Banca de quien lo jugó", "Challenge!: Machop a la Banca del otro jugador"]));
    const declined = playTrainerCard(state, card.id, [["decline"]]);
    expect(badLines(state, declined)).toEqual([]);
  });

  it("Digger, Imposter Oak's Revenge, Rocket's Sneak Attack, Goop Gas Attack", () => {
    const digger = gameCard("Digger", "rocket");
    const oak = gameCard("Imposter Oak's Revenge", "rocket");
    const sneak = gameCard("Rocket's Sneak Attack", "rocket");
    const goop = gameCard("Goop Gas Attack", "rocket");
    const bill = gameCard("Bill", "base");
    const theirBill = gameCard("Bill", "base");
    const state = hand([digger, oak, sneak, goop, bill], { opponent: { hand: [theirBill, energy(EnergyType.Fire)], deck: [gameCard("Abra")] } });
    for (const coins of [[T], [H, T]] as const) {
      const next = playTrainerCard(state, digger.id, [], { coinResults: [...coins] });
      expect(badLines(state, next)).toEqual([]);
    }
    expect(badLines(state, playTrainerCard(state, oak.id, [[bill.id]]))).toEqual([]);
    expect(badLines(state, playTrainerCard(state, sneak.id, [[theirBill.id]]))).toEqual([]);
    expect(badLines(state, playTrainerCard(state, goop.id))).toEqual([]);
  });

  it("Mr. Fuji, Energy Search, Gambler, Recycle, The Boss's Way, Nightly Garbage Run", () => {
    const fuji = gameCard("Mr. Fuji", "fossil");
    const search = gameCard("Energy Search", "fossil");
    const gambler = gameCard("Gambler", "fossil");
    const recycle = gameCard("Recycle", "fossil");
    const boss = gameCard("The Boss's Way", "rocket");
    const garbage = gameCard("Nightly Garbage Run", "rocket");
    const fire = energy(EnergyType.Fire);
    const darkWeezing = gameCard("Dark Weezing", "rocket");
    const discarded = gameCard("Abra");
    const benched = inPlay("Abra");
    const state = hand([fuji, search, gambler, recycle, boss, garbage], {
      player: { bench: [benched], deck: [fire, darkWeezing, gameCard("Machop")], discard: [discarded] },
    });
    expect(badLines(state, playTrainerCard(state, fuji.id, [[benched.pokemon.id]]))).toEqual([]);
    expect(badLines(state, playTrainerCard(state, search.id, [[fire.id]]))).toEqual([]);
    expect(badLines(state, playTrainerCard(state, gambler.id, [], { coinResults: [H] }))).toEqual([]);
    expect(badLines(state, playTrainerCard(state, recycle.id, [[discarded.id]], { coinResults: [H] }))).toEqual([]);
    expect(badLines(state, playTrainerCard(state, boss.id, [[darkWeezing.id]]))).toEqual([]);
    expect(badLines(state, playTrainerCard(state, garbage.id, [[discarded.id]]))).toEqual([]);
  });
});

describe("Fossil / Team Rocket powers and attack effects", () => {
  it("Cowardice", () => {
    const tentacool = inPlay("Tentacool", { set: "fossil" });
    const state = makeState({ turnNumber: 5, player: { active: inPlay("Machop"), bench: [tentacool] }, opponent: { active: inPlay("Onix") } });
    expect(badLines(state, usePokemonPower(state, tentacool.pokemon.id))).toEqual([]);
  });

  it("Headache, Mirror Shell, Fling, Vanish, Mischief", () => {
    const cases: [string, string, string, ("heads" | "tails")[]][] = [
      ["Psyduck", "fossil", "Dolor de Cabeza", []],
      ["Dark Wartortle", "rocket", "Caparazón Espejo", []],
      ["Dark Machamp", "rocket", "Lanzamiento", []],
      ["Abra", "rocket", "Desvanecerse", []],
      ["Mankey", "rocket", "Travesura", []],
    ];
    for (const [name, set, attackName] of cases) {
      const state = makeState({
        player: { active: inPlay(name, { set: set as "fossil" | "rocket" }), bench: [inPlay("Machop")] },
        opponent: { active: inPlay("Onix"), bench: [inPlay("Abra")] },
      });
      const after = attack(state, attackName);
      expect({ attackName, bad: badLines(state, after) }).toEqual({ attackName, bad: [] });
    }
  });
});
