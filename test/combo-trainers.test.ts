/**
 * Trainer cards against cards of other sets (Base Set, Jungle, Fossil, Team Rocket):
 * attached Trainers (Defender, PlusPower) through evolving / devolving / switching / leaving
 * play, Pokémon Breeder on Fossil lines and its blockers, Scoop Up / Devolution Spray on
 * Fossil and Dark lines, Trainers played as Basics (Mysterious Fossil, Clefairy Doll) as
 * targets of switching, searching, shuffling and damage effects.
 */
import { describe, it, expect } from "vitest";
import { canRetreat, endTurn, executeAttack, executeBenchDamage, resolvePowerChoice } from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { canPlayBasicPokemon, evolvePokemonCard, playBasicPokemon, swapSides } from "@/domain/board";
import { canPlayTrainerCard, getPowerSteps, getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { isTrainerInPlay } from "@/domain/cards";
import { CardKind, EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, names, armedFor, attackIndex } from "./helpers/state";

const { Fighting, Water, Psychic, Grass } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const base = (name: string) => gameCard(name, "base");
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const fossil = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "fossil", ...opts });

/** Base Set Machop with a Fighting Energy: "Patada baja" does 20. */
const lowKicker = () => armedFor(inPlay("Machop", { set: "base" }), "Patada baja");

/** End the turn and attack with the other side's Active (its first attack). */
function opponentAttacks(state: GameState, attackName?: string): GameState {
  const theirTurn = swapSides(endTurn(state));
  const attacker = theirTurn.playerActivePokemon!;
  const atk = attackName ?? (attacker.pokemon.kind === CardKind.Pokemon ? attacker.pokemon.attacks[0].name : "");
  return swapSides(executeAttack(theirTurn, attackIndex(attacker, atk), { coinResults: [], skipEndTurn: true }));
}

describe("Defender stays with the Pokémon it is attached to", () => {
  it("evolving the Pokémon keeps Defender's −20 (Abra → Kadabra)", () => {
    const defender = base("Defender");
    const kadabra = base("Kadabra");
    const abra = inPlay("Abra", { set: "base" });
    const state = makeState({ player: { active: abra, bench: [inPlay("Machop")], hand: [defender, kadabra] }, opponent: { active: lowKicker() } });
    const protectedAbra = playTrainerCard(state, defender.id, [[abra.pokemon.id]]);
    const evolved = evolvePokemonCard(protectedAbra, kadabra.id, abra.pokemon.id);
    const hit = opponentAttacks(evolved);
    expect(hit.playerActivePokemon!.pokemon.name).toBe("Kadabra");
    expect(hit.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("Pokémon Breeder (Mysterious Fossil → Kabutops) keeps Defender's −20", () => {
    const defender = base("Defender");
    const breeder = base("Pokémon Breeder");
    const kabutops = gameCard("Kabutops", "fossil");
    const fossilInPlay = inPlay("Mysterious Fossil");
    const state = makeState({
      player: { active: fossilInPlay, bench: [inPlay("Machop")], hand: [defender, breeder, kabutops] },
      opponent: { active: armedFor(inPlay("Machop", { set: "base" }), "Patada baja") },
    });
    const protectedFossil = playTrainerCard(state, defender.id, [[fossilInPlay.pokemon.id]]);
    const bred = playTrainerCard(protectedFossil, breeder.id, [[kabutops.id], [fossilInPlay.pokemon.id]]);
    expect(bred.playerActivePokemon!.pokemon.name).toBe("Kabutops");
    const hit = opponentAttacks(bred);
    expect(hit.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("Devolution Spray keeps Defender's −20 on the devolved Pokémon (Kadabra → Abra)", () => {
    const defender = base("Defender");
    const spray = base("Devolution Spray");
    const kadabra = inPlay("Kadabra", { set: "base", evolvedFrom: ["Abra"] });
    const state = makeState({ player: { active: kadabra, bench: [inPlay("Machop")], hand: [defender, spray] }, opponent: { active: lowKicker() } });
    const protectedKadabra = playTrainerCard(state, defender.id, [[kadabra.pokemon.id]]);
    const devolved = playTrainerCard(protectedKadabra, spray.id, [[kadabra.pokemon.id]]);
    expect(devolved.playerActivePokemon!.pokemon.name).toBe("Abra");
    const hit = opponentAttacks(devolved);
    expect(hit.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("Scoop Up discards the attached Defender: the Basic played again isn't protected", () => {
    const defender = base("Defender");
    const scoopUp = base("Scoop Up");
    const abra = inPlay("Abra", { set: "base" });
    const state = makeState({ player: { active: inPlay("Onix"), bench: [abra], hand: [defender, scoopUp] }, opponent: { active: lowKicker() } });
    const protectedAbra = playTrainerCard(state, defender.id, [[abra.pokemon.id]]);
    const scooped = playTrainerCard(protectedAbra, scoopUp.id, [[abra.pokemon.id]]);
    expect(names(scooped.playerDiscard).sort()).toEqual(["Defender", "Scoop Up"]);
    expect(scooped.activeModifiers).toHaveLength(0);
    // Abra goes back into play (same card) and is then dragged out as the Active
    const replayed = playBasicPokemon(scooped, abra.pokemon.id, "bench");
    const swapped = { ...replayed, playerActivePokemon: replayed.playerBench[0], playerBench: [replayed.playerActivePokemon!] };
    const hit = opponentAttacks(swapped);
    expect(hit.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("Mr. Fuji shuffles the attached Defender into the deck with the Pokémon", () => {
    const defender = base("Defender");
    const fuji = gameCard("Mr. Fuji", "fossil");
    const abra = inPlay("Abra", { set: "base" });
    const state = makeState({ player: { active: inPlay("Onix"), bench: [abra], hand: [defender, fuji], deck: [] }, opponent: { active: lowKicker() } });
    const protectedAbra = playTrainerCard(state, defender.id, [[abra.pokemon.id]]);
    const fujied = playTrainerCard(protectedAbra, fuji.id, [[abra.pokemon.id]]);
    expect(names(fujied.playerDeck).sort()).toEqual(["Abra", "Defender"]);
    expect(fujied.activeModifiers).toHaveLength(0);
    expect(names(fujied.playerDiscard)).toEqual(["Mr. Fuji"]);
  });
});

describe("Defender leaves play with its Pokémon", () => {
  it("a Pokémon Knocked Out by Digger discards its Defender at once; Revived, it isn't protected", () => {
    const defender = base("Defender");
    const digger = gameCard("Digger", "rocket");
    const revive = base("Revive");
    const abra = inPlay("Abra", { set: "base", damage: 20 }); // 30 HP
    const state = makeState({ player: { active: abra, bench: [inPlay("Onix")], hand: [defender, digger, revive] }, opponent: { active: lowKicker() } });
    const protectedAbra = playTrainerCard(state, defender.id, [[abra.pokemon.id]]);
    const dug = playTrainerCard(protectedAbra, digger.id, [], { coinResults: [T] });
    expect(dug.activeModifiers).toHaveLength(0);
    expect(names(dug.playerDiscard).sort()).toEqual(["Abra", "Defender", "Digger"]);
    const revived = playTrainerCard({ ...dug, playerActivePokemon: dug.playerBench[0], playerBench: [], playerNeedsToPromote: false }, revive.id, [[abra.pokemon.id]]);
    const asActive = { ...revived, playerActivePokemon: revived.playerBench[0], playerBench: [revived.playerActivePokemon!] };
    const hit = opponentAttacks(asActive);
    // 10 (Revive) + 20 (Low Kick, no Defender) = 30: Abra is Knocked Out again
    expect(hit.playerActivePokemon?.pokemon.id).not.toBe(abra.pokemon.id);
    expect(names(hit.playerDiscard)).toContain("Abra");
  });

  it("Jungle Pidgeot's Hurricane returns the Pokémon to the hand: its Defender doesn't follow the card when it is played again", () => {
    const defender = base("Defender");
    const onix = inPlay("Onix");
    const state = makeState({
      player: { active: onix, bench: [inPlay("Abra")], hand: [defender] },
      opponent: { active: armedFor(inPlay("Pidgeot", { set: "jungle" }), "Huracán") },
    });
    const protectedOnix = playTrainerCard(state, defender.id, [[onix.pokemon.id]]);
    const blown = opponentAttacks(protectedOnix, "Huracán");
    expect(names(blown.playerHand)).toContain("Onix");
    expect(blown.activeModifiers.filter((m) => m.source === "defender")).toHaveLength(0);
  });
});

describe("Defender against bench damage of attacks", () => {
  it("reduces the 10 that Dark Arbok's Poison Vapor does to a Benched Pokémon with Defender", () => {
    const defender = base("Defender");
    const abra = inPlay("Abra", { set: "base" });
    const machop = inPlay("Machop");
    const state = makeState({
      player: { active: inPlay("Onix"), bench: [abra, machop], hand: [defender] },
      opponent: { active: armedFor(rocket("Dark Arbok", { evolvedFrom: ["Ekans"] }), "Vapor Venenoso") },
    });
    const protectedAbra = playTrainerCard(state, defender.id, [[abra.pokemon.id]]);
    const hit = opponentAttacks(protectedAbra, "Vapor Venenoso");
    expect(hit.playerBench.find((p) => p.pokemon.id === abra.pokemon.id)!.currentDamage).toBe(0);
    expect(hit.playerBench.find((p) => p.pokemon.id === machop.pokemon.id)!.currentDamage).toBe(10);
  });

  it("also when the Benched Pokémon is chosen (Jungle Pikachu's Spark)", () => {
    const defender = base("Defender");
    const abra = inPlay("Abra", { set: "base" });
    const state = makeState({
      player: { active: inPlay("Onix"), bench: [abra, inPlay("Machop")], hand: [defender] },
      opponent: { active: armedFor(inPlay("Pikachu", { set: "jungle" }), "Spark") },
    });
    const protectedAbra = playTrainerCard(state, defender.id, [[abra.pokemon.id]]);
    const theirTurn = swapSides(endTurn(protectedAbra));
    const attacked = executeAttack(theirTurn, attackIndex(theirTurn.playerActivePokemon!, "Spark"), { coinResults: [], skipEndTurn: true });
    expect(attacked.pendingBenchDamageSelection).toBeTruthy();
    const chosen = executeBenchDamage(attacked, [abra.pokemon.id], { skipEndTurn: true });
    expect(chosen.opponentBench.find((p) => p.pokemon.id === abra.pokemon.id)!.currentDamage).toBe(0);
  });
});

describe("PlusPower stays with the Active it was attached to", () => {
  it("Scoop Up on the Active discards its PlusPower", () => {
    const plusPower = base("PlusPower");
    const scoopUp = base("Scoop Up");
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: abra, bench: [inPlay("Machop")], hand: [plusPower, scoopUp] }, opponent: { active: inPlay("Onix") } });
    const powered = playTrainerCard(state, plusPower.id);
    const scooped = playTrainerCard(powered, scoopUp.id, [[abra.pokemon.id]]);
    expect(scooped.activeModifiers).toHaveLength(0);
    expect(names(scooped.playerDiscard).sort()).toEqual(["PlusPower", "Scoop Up"]);
  });

  it("after Switch the new Active doesn't get the +10", () => {
    const plusPower = base("PlusPower");
    const switchCard = base("Switch");
    const kicker = lowKicker();
    const state = makeState({ player: { active: inPlay("Abra"), bench: [kicker], hand: [plusPower, switchCard] }, opponent: { active: inPlay("Onix") } });
    const powered = playTrainerCard(state, plusPower.id);
    const switched = playTrainerCard(powered, switchCard.id, [[kicker.pokemon.id]]);
    const after = executeAttack(switched, attackIndex(switched.playerActivePokemon!, "Patada baja"), { coinResults: [], skipEndTurn: true });
    expect(after.opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("the Pokémon it is attached to keeps it after evolving (Abra → Kadabra)", () => {
    const plusPower = base("PlusPower");
    const kadabra = base("Kadabra");
    const abra = inPlay("Abra", { set: "base" });
    const state = makeState({ player: { active: abra, hand: [plusPower, kadabra] }, opponent: { active: inPlay("Onix") } });
    const powered = playTrainerCard(state, plusPower.id);
    const evolved = evolvePokemonCard(powered, kadabra.id, abra.pokemon.id);
    const armed = { ...evolved, playerActivePokemon: armedFor(evolved.playerActivePokemon!, "Psi") };
    const after = executeAttack(armed, attackIndex(armed.playerActivePokemon!, "Psi"), { coinResults: [], skipEndTurn: true });
    expect(after.opponentActivePokemon!.currentDamage).toBe(60);
  });
});

describe("Pokémon Breeder on Fossil lines and its blockers", () => {
  const breederState = (extra: { opponentBench?: PokemonInPlay[]; turnNumber?: number; suppressed?: boolean; fossilTurn?: number } = {}) => {
    const breeder = base("Pokémon Breeder");
    const kabutops = gameCard("Kabutops", "fossil");
    const fossilInPlay = inPlay("Mysterious Fossil", { playedOnTurn: extra.fossilTurn ?? 1 });
    const state = makeState({
      turnNumber: extra.turnNumber ?? 3,
      player: { active: inPlay("Machop"), bench: [fossilInPlay], hand: [breeder, kabutops] },
      opponent: { active: inPlay("Onix"), bench: extra.opponentBench ?? [] },
      ...(extra.suppressed && { powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: 9 }] }),
    });
    return { state, breeder, kabutops, fossilInPlay };
  };
  const aerodactyl = () => fossil("Aerodactyl", { evolvedFrom: ["Mysterious Fossil"] });

  it("puts Kabutops straight onto a Mysterious Fossil (skipping Kabuto)", () => {
    const { state, breeder, kabutops, fossilInPlay } = breederState();
    const bred = playTrainerCard(state, breeder.id, [[kabutops.id], [fossilInPlay.pokemon.id]]);
    const result = bred.playerBench[0];
    expect(result.pokemon.name).toBe("Kabutops");
    expect(isTrainerInPlay(result.pokemon)).toBe(false);
    expect(names(result.previousEvolutions ?? [])).toEqual(["Mysterious Fossil"]);
  });

  it("not on a Fossil put into play this turn, nor on turn 2", () => {
    const sameTurn = breederState({ fossilTurn: 3 });
    expect(canPlayTrainerCard(sameTurn.state, sameTurn.breeder.id)).not.toBeNull();
    const turnTwo = breederState({ turnNumber: 2 });
    expect(canPlayTrainerCard(turnTwo.state, turnTwo.breeder.id)).not.toBeNull();
  });

  it("Aerodactyl's Prehistoric Power (opponent's Bench) stops it; Goop Gas Attack or Muk's Toxic Gas lift the block", () => {
    const blocked = breederState({ opponentBench: [aerodactyl()] });
    expect(canPlayTrainerCard(blocked.state, blocked.breeder.id)).toMatch(/Evolución/);
    const gooped = breederState({ opponentBench: [aerodactyl()], suppressed: true });
    expect(canPlayTrainerCard(gooped.state, gooped.breeder.id)).toBeNull();
    const gassed = breederState({ opponentBench: [aerodactyl(), fossil("Muk", { evolvedFrom: ["Grimer"] })] });
    expect(canPlayTrainerCard(gassed.state, gassed.breeder.id)).toBeNull();
  });

  it("Dark Dragonite bred onto Dratini is played from the hand: Summon Minions triggers (Basics only, no Fossil); not under Goop Gas Attack", () => {
    const breeder = base("Pokémon Breeder");
    const darkDragonite = gameCard("Dark Dragonite", "rocket");
    const dratini = inPlay("Dratini", { set: "base" });
    const abra = gameCard("Abra", "base");
    const machop = gameCard("Machop", "base");
    const deck = [abra, gameCard("Mysterious Fossil", "fossil"), machop, base("Kadabra")];
    const setup = (extra: Partial<GameState> = {}) => ({
      ...makeState({ player: { active: inPlay("Onix"), bench: [dratini], hand: [breeder, darkDragonite], deck }, opponent: { active: inPlay("Onix") } }),
      ...extra,
    });
    const bred = playTrainerCard(setup(), breeder.id, [[darkDragonite.id], [dratini.pokemon.id]]);
    const pending = bred.pendingPowerChoice!;
    expect(pending.step.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Abra", "Machop"]);
    const done = resolvePowerChoice(bred, [abra.id, machop.id]);
    expect(names(done.playerBench.map((p) => p.pokemon))).toEqual(["Dark Dragonite", "Abra", "Machop"]);
    const gooped = playTrainerCard(setup({ powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: 9 }] }), breeder.id, [[darkDragonite.id], [dratini.pokemon.id]]);
    expect(gooped.pendingPowerChoice).toBeUndefined();
  });

  it("Prehistoric Power doesn't stop Devolution Spray, Pokémon Trader or The Boss's Way (no Evolution card is played)", () => {
    const spray = base("Devolution Spray");
    const trader = base("Pokémon Trader");
    const bossWay = gameCard("The Boss's Way", "rocket");
    const state = makeState({
      player: {
        active: inPlay("Kadabra", { evolvedFrom: ["Abra"] }),
        hand: [spray, trader, bossWay, gameCard("Abra", "base")],
        deck: [gameCard("Dark Golbat", "rocket"), gameCard("Zubat")],
      },
      opponent: { active: aerodactyl() },
    });
    expect(canPlayTrainerCard(state, spray.id)).toBeNull();
    expect(canPlayTrainerCard(state, trader.id)).toBeNull();
    expect(canPlayTrainerCard(state, bossWay.id)).toBeNull();
  });
});

describe("Hay Fever (Dark Vileplume) against Trainers", () => {
  const darkVileplume = (opts: Parameters<typeof inPlay>[1] = {}) => rocket("Dark Vileplume", { evolvedFrom: ["Oddish", "Dark Gloom"], ...opts });
  const withVileplume = (vileplume: PokemonInPlay, where: "active" | "bench", extra: Partial<GameState> = {}) => {
    const bill = base("Bill");
    const opponent = where === "active" ? { active: vileplume } : { active: inPlay("Onix"), bench: [vileplume] };
    const state = { ...makeState({ player: { active: inPlay("Machop"), hand: [bill] }, opponent }), ...extra };
    return { state, bill };
  };

  it("blocks the other player's Trainers from the Bench", () => {
    const { state, bill } = withVileplume(darkVileplume(), "bench");
    expect(canPlayTrainerCard(state, bill.id)).toMatch(/Entrenador/);
  });

  it("also blocks its own player's Trainers (The Boss's Way, Mysterious Fossil as a Basic)", () => {
    const bossWay = gameCard("The Boss's Way", "rocket");
    const fossilCard = gameCard("Mysterious Fossil", "fossil");
    const state = makeState({ player: { active: inPlay("Machop"), bench: [darkVileplume()], hand: [bossWay, fossilCard] }, opponent: { active: inPlay("Onix") } });
    expect(canPlayTrainerCard(state, bossWay.id)).toMatch(/Entrenador/);
    expect(canPlayBasicPokemon(state, fossilCard.id, "bench")).not.toBeNull();
  });

  it("Goop Gas Attack (still in effect) or Muk's Toxic Gas switch it off", () => {
    const gooped = withVileplume(darkVileplume(), "bench", { powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: 9 }] });
    expect(canPlayTrainerCard(gooped.state, gooped.bill.id)).toBeNull();
    const gassed: GameState = { ...gooped.state, powersSuppressed: undefined, playerBench: [fossil("Muk", { evolvedFrom: ["Grimer"] })] };
    expect(canPlayTrainerCard(gassed, gooped.bill.id)).toBeNull();
  });

  it("an Asleep Active Dark Vileplume doesn't block; a Poisoned one still does", () => {
    const asleep = withVileplume(darkVileplume({ statuses: [StatusCondition.Asleep] }), "active");
    expect(canPlayTrainerCard(asleep.state, asleep.bill.id)).toBeNull();
    const poisoned = withVileplume(darkVileplume({ statuses: [StatusCondition.Poisoned] }), "active");
    expect(canPlayTrainerCard(poisoned.state, poisoned.bill.id)).not.toBeNull();
  });
});

describe("Scoop Up and Devolution Spray on Fossil and Dark lines", () => {
  it("Scoop Up on an Active Omastar: the Mysterious Fossil returns as a Trainer, the rest is discarded", () => {
    const scoopUp = base("Scoop Up");
    const omastar = fossil("Omastar", { evolvedFrom: ["Mysterious Fossil", "Omanyte"], energy: [Water, Water] });
    const state = makeState({ player: { active: omastar, bench: [inPlay("Machop")], hand: [scoopUp] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, scoopUp.id, [[omastar.pokemon.id]]);
    expect(names(next.playerHand)).toEqual(["Mysterious Fossil"]);
    expect(next.playerHand[0].kind).toBe(CardKind.Trainer);
    expect(names(next.playerDiscard).sort()).toEqual(["Omanyte", "Omastar", "Scoop Up", "Water Energy", "Water Energy"]);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(6);
  });

  it("Scoop Up on a Benched Clefairy Doll: it is a Trainer card in the hand again and can be played again", () => {
    const scoopUp = base("Scoop Up");
    const doll = inPlay("Clefairy Doll");
    const state = makeState({ turnNumber: 5, player: { active: inPlay("Machop"), bench: [doll], hand: [scoopUp] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, scoopUp.id, [[doll.pokemon.id]]);
    expect(next.playerHand[0].kind).toBe(CardKind.Trainer);
    expect(canPlayBasicPokemon(next, doll.pokemon.id, "bench")).toBeNull();
  });

  it("Scoop Up on Dark Blastoise returns Squirtle; both Dark Evolution cards are discarded", () => {
    const scoopUp = base("Scoop Up");
    const darkBlastoise = rocket("Dark Blastoise", { evolvedFrom: ["Squirtle", "Dark Wartortle"] });
    const state = makeState({ player: { active: inPlay("Machop"), bench: [darkBlastoise], hand: [scoopUp] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, scoopUp.id, [[darkBlastoise.pokemon.id]]);
    expect(names(next.playerHand)).toEqual(["Squirtle"]);
    expect(names(next.playerDiscard).sort()).toEqual(["Dark Blastoise", "Dark Wartortle", "Scoop Up"]);
  });

  it("Devolution Spray on Kabutops gives back Kabuto, which keeps the Fossil under it", () => {
    const spray = base("Devolution Spray");
    const kabutops = fossil("Kabutops", { evolvedFrom: ["Mysterious Fossil", "Kabuto"], damage: 20 });
    const state = makeState({ player: { active: kabutops, bench: [inPlay("Machop")], hand: [spray] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, spray.id, [[kabutops.pokemon.id]]);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Kabuto");
    expect(names(next.playerActivePokemon!.previousEvolutions ?? [])).toEqual(["Mysterious Fossil"]);
    expect(names(next.playerHand)).toEqual(["Kabutops"]);
  });

  it("Devolution Spray on a damaged Kabuto: the 10 HP Fossil is Knocked Out, no Prize; it goes to the discard as a Trainer", () => {
    const spray = base("Devolution Spray");
    const kabuto = fossil("Kabuto", { evolvedFrom: ["Mysterious Fossil"], damage: 10 });
    const state = makeState({ player: { active: kabuto, bench: [inPlay("Machop")], hand: [spray] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, spray.id, [[kabuto.pokemon.id]]);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(6);
    expect(names(next.playerHand)).toEqual(["Kabuto"]);
    expect(next.playerDiscard.find((c) => c.name === "Mysterious Fossil")!.kind).toBe(CardKind.Trainer);
  });
});

describe("Switching Trainers and Pokémon that can't retreat", () => {
  it("Gust of Wind drags out a Benched Clefairy Doll, which then can't retreat", () => {
    const gust = base("Gust of Wind");
    const doll = inPlay("Clefairy Doll");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [gust] }, opponent: { active: inPlay("Onix"), bench: [doll] } });
    const next = playTrainerCard(state, gust.id, [[doll.pokemon.id]]);
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Clefairy Doll");
    expect(canRetreat(next.opponentActivePokemon!, next.opponentBench.length, false)).toBe(false);
  });

  it("Switch moves an Active Mysterious Fossil to the Bench (it can't retreat, but it can be switched)", () => {
    const switchCard = base("Switch");
    const machop = inPlay("Machop");
    const state = makeState({ player: { active: inPlay("Mysterious Fossil"), bench: [machop], hand: [switchCard] }, opponent: { active: inPlay("Onix") } });
    expect(canPlayTrainerCard(state, switchCard.id)).toBeNull();
    const switched = playTrainerCard(state, switchCard.id, [[machop.pokemon.id]]);
    expect(switched.playerActivePokemon!.pokemon.name).toBe("Machop");
    expect(names(switched.playerBench.map((p) => p.pokemon))).toEqual(["Mysterious Fossil"]);
  });

  it("Switch isn't a retreat: Dark Dugtrio's Sinkhole does nothing", () => {
    const switchCard = base("Switch");
    const abra = inPlay("Abra");
    const state = makeState({
      player: { active: inPlay("Machop"), bench: [abra], hand: [switchCard] },
      opponent: { active: rocket("Dark Dugtrio", { evolvedFrom: ["Diglett"] }) },
    });
    const next = playTrainerCard(state, switchCard.id, [[abra.pokemon.id]]);
    expect(next.playerBench[0].pokemon.name).toBe("Machop");
    expect(next.playerBench[0].currentDamage).toBe(0);
  });
});

describe("Hand / deck / discard Trainers and Trainers played as Basics", () => {
  const fossilCard = () => gameCard("Mysterious Fossil", "fossil");
  const doll = () => base("Clefairy Doll");

  it("Item Finder takes a Clefairy Doll back from the discard pile (it is a Trainer there)", () => {
    const itemFinder = base("Item Finder");
    const discarded = doll();
    const [a, b] = [energy(Water), energy(Water)];
    const state = makeState({ player: { active: inPlay("Machop"), hand: [itemFinder, a, b], discard: [discarded, gameCard("Abra", "base")] }, opponent: { active: inPlay("Onix") } });
    const step = getTrainerSteps(state, itemFinder.id, [[a.id, b.id]])!;
    expect(step.options.map((o) => o.label)).toEqual(["Clefairy Doll"]);
    const next = playTrainerCard(state, itemFinder.id, [[a.id, b.id], [discarded.id]]);
    expect(names(next.playerHand)).toEqual(["Clefairy Doll"]);
  });

  it("Lass shuffles Mysterious Fossil and Clefairy Doll from both hands into the decks", () => {
    const lass = base("Lass");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [lass, fossilCard(), energy(Water)], deck: [] },
      opponent: { active: inPlay("Onix"), hand: [doll(), gameCard("Abra", "base")], deck: [] },
    });
    const next = playTrainerCard(state, lass.id);
    expect(names(next.playerHand)).toEqual(["Water Energy"]);
    expect(names(next.playerDeck)).toEqual(["Mysterious Fossil"]);
    expect(names(next.opponentHand)).toEqual(["Abra"]);
    expect(names(next.opponentDeck)).toEqual(["Clefairy Doll"]);
  });

  it("Rocket's Sneak Attack can pick a Mysterious Fossil in the opponent's hand", () => {
    const sneak = gameCard("Rocket's Sneak Attack", "rocket");
    const theirFossil = fossilCard();
    const state = makeState({ player: { active: inPlay("Machop"), hand: [sneak] }, opponent: { active: inPlay("Onix"), hand: [theirFossil, gameCard("Abra", "base")], deck: [] } });
    const step = getTrainerSteps(state, sneak.id, [])!;
    expect(step.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Mysterious Fossil"]);
    const next = playTrainerCard(state, sneak.id, [[theirFossil.id]]);
    expect(names(next.opponentDeck)).toEqual(["Mysterious Fossil"]);
  });

  it("Pokémon Trader offers neither a Mysterious Fossil in the hand nor a Clefairy Doll in the deck", () => {
    const trader = base("Pokémon Trader");
    const abra = gameCard("Abra", "base");
    const darkRaichu = gameCard("Dark Raichu", "rocket");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [trader, fossilCard(), abra], deck: [doll(), darkRaichu] }, opponent: { active: inPlay("Onix") } });
    expect(getTrainerSteps(state, trader.id, [])!.options.map((o) => o.label)).toEqual(["Abra"]);
    expect(getTrainerSteps(state, trader.id, [[abra.id]])!.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Dark Raichu"]);
    const next = playTrainerCard(state, trader.id, [[abra.id], [darkRaichu.id]]);
    expect(names(next.playerHand).sort()).toEqual(["Dark Raichu", "Mysterious Fossil"]);
  });

  it("Energy Retrieval and Energy Search don't take Rainbow or Full Heal Energy (not basic Energy)", () => {
    const retrieval = base("Energy Retrieval");
    const search = gameCard("Energy Search", "fossil");
    const rainbow = gameCard("Rainbow Energy", "rocket");
    const fullHeal = gameCard("Full Heal Energy", "rocket");
    const water = energy(Water);
    const filler = gameCard("Abra", "base");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [retrieval, search, filler], discard: [rainbow, water], deck: [fullHeal, gameCard("Rainbow Energy", "rocket")] },
      opponent: { active: inPlay("Onix") },
    });
    expect(getTrainerSteps(state, retrieval.id, [[filler.id]])!.options.map((o) => o.id)).toEqual([water.id]);
    expect(getTrainerSteps(state, search.id, [])).toBeNull();
    const searched = playTrainerCard(state, search.id, []);
    expect(searched.playerDeck).toHaveLength(2);
  });

  it("Nightly Garbage Run takes Pokémon cards and basic Energy, not a Fossil, a Doll, Rainbow or Double Colorless Energy", () => {
    const run = gameCard("Nightly Garbage Run", "rocket");
    const pile = [fossilCard(), doll(), gameCard("Rainbow Energy", "rocket"), energy(EnergyType.Colorless), gameCard("Dark Golbat", "rocket"), gameCard("Kabuto", "fossil"), energy(Psychic)];
    const state = makeState({ player: { active: inPlay("Machop"), hand: [run], discard: pile, deck: [] }, opponent: { active: inPlay("Onix") } });
    const step = getTrainerSteps(state, run.id, [])!;
    expect(step.options.map((o) => o.id)).toEqual([pile[4].id, pile[5].id, pile[6].id]);
  });

  it("The Boss's Way finds Dark Evolution cards only (not Golbat, not a Basic, not a Fossil)", () => {
    const boss = gameCard("The Boss's Way", "rocket");
    const darkGolbat = gameCard("Dark Golbat", "rocket");
    const deck = [base("Kadabra"), gameCard("Golbat", "fossil"), darkGolbat, fossilCard(), gameCard("Dark Alakazam", "rocket")];
    const state = makeState({ player: { active: inPlay("Machop"), hand: [boss], deck }, opponent: { active: inPlay("Onix") } });
    expect(getTrainerSteps(state, boss.id, [])!.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Dark Golbat", "Dark Alakazam"]);
  });

  it("Challenge! never offers a Mysterious Fossil or a Clefairy Doll from the deck (not Basic Pokémon cards)", () => {
    const challenge = gameCard("Challenge!", "rocket");
    const abra = gameCard("Abra", "base");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [challenge], deck: [fossilCard(), doll(), abra, gameCard("Dark Golbat", "rocket")] },
      opponent: { active: inPlay("Onix"), deck: [doll(), gameCard("Machop", "base")] },
    });
    expect(getTrainerSteps(state, challenge.id, [["accept"]])!.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Abra"]);
    expect(getTrainerSteps(state, challenge.id, [["accept"], [abra.id]])!.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Machop"]);
  });

  it("a Basic benched by Challenge! can't be evolved (nor bred) that turn", () => {
    const challenge = gameCard("Challenge!", "rocket");
    const abra = gameCard("Abra", "base");
    const kadabra = base("Kadabra");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [challenge, kadabra], deck: [abra] },
      opponent: { active: inPlay("Onix"), deck: [] },
    });
    const next = playTrainerCard(state, challenge.id, [["accept"], [abra.id], []]);
    expect(names(next.playerBench.map((p) => p.pokemon))).toEqual(["Abra"]);
    expect(() => evolvePokemonCard(next, kadabra.id, abra.id)).toThrow();
  });
});

describe("Damage and status Trainers on Trainers played as Basics", () => {
  it("Digger (tails for you) Knocks Out your own Active Clefairy Doll: no Prize for the opponent", () => {
    const digger = gameCard("Digger", "rocket");
    const state = makeState({ player: { active: inPlay("Clefairy Doll"), bench: [inPlay("Machop")], hand: [digger] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, digger.id, [], { coinResults: [T] });
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(6);
    expect(next.playerDiscard.find((c) => c.name === "Clefairy Doll")!.kind).toBe(CardKind.Trainer);
  });

  it("Digger (tails for the opponent) Knocks Out their Active Mysterious Fossil: no Prize for you", () => {
    const digger = gameCard("Digger", "rocket");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [digger] }, opponent: { active: inPlay("Mysterious Fossil"), bench: [inPlay("Onix")] } });
    const next = playTrainerCard(state, digger.id, [], { coinResults: [H, T] });
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.playerPrizes).toHaveLength(6);
  });

  it("Sleep! heads doesn't put a Mysterious Fossil to sleep", () => {
    const sleep = gameCard("Sleep!", "rocket");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [sleep] }, opponent: { active: inPlay("Mysterious Fossil") } });
    const next = playTrainerCard(state, sleep.id, [], { coinResults: [H] });
    expect(next.opponentActivePokemon!.statusConditions).toEqual([]);
  });

  it("Pokémon Flute + Gust of Wind + Sleep!: the Pokémon put onto the opponent's Bench can be dragged out and put to sleep", () => {
    const flute = base("Pokémon Flute");
    const gust = base("Gust of Wind");
    const sleep = gameCard("Sleep!", "rocket");
    const theirAbra = gameCard("Abra", "rocket");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [flute, gust, sleep] }, opponent: { active: inPlay("Onix"), discard: [theirAbra] } });
    const fluted = playTrainerCard(state, flute.id, [[theirAbra.id]]);
    expect(fluted.opponentBench[0].currentDamage).toBe(0);
    const gusted = playTrainerCard(fluted, gust.id, [[theirAbra.id]]);
    const slept = playTrainerCard(gusted, sleep.id, [], { coinResults: [H] });
    expect(slept.opponentActivePokemon!.statusConditions).toEqual([StatusCondition.Asleep]);
  });

  it("Revive on a Team Rocket Basic: half its HP in damage counters, and it can't evolve that turn", () => {
    const revive = base("Revive");
    const abra = gameCard("Abra", "rocket"); // 40 HP
    const kadabra = base("Kadabra");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [revive, kadabra], discard: [abra] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, revive.id, [[abra.id]]);
    expect(next.playerBench[0].currentDamage).toBe(20);
    expect(() => evolvePokemonCard(next, kadabra.id, abra.id)).toThrow();
  });
});

describe("Here Comes Team Rocket! and Prizes", () => {
  it("Rattata's Trickery shows the Prize names once Here Comes Team Rocket! was played", () => {
    const hctr = gameCard("Here Comes Team Rocket!", "rocket");
    const rattata = rocket("Rattata");
    const prizes = [gameCard("Abra", "base"), energy(Grass)];
    const state = makeState({ player: { active: rattata, hand: [hctr], prizes }, opponent: { active: inPlay("Onix") } });
    const hidden = getPowerSteps(state, rattata.pokemon.id, [])!;
    expect(hidden.options.map((o) => o.label)).toEqual(["Premio 1", "Premio 2"]);
    const revealed = playTrainerCard(state, hctr.id);
    expect(getPowerSteps(revealed, rattata.pokemon.id, [])!.options.map((o) => o.label)).toEqual(["Premio 1: Abra", "Premio 2: Grass Energy"]);
  });
});
