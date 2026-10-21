import { prizesOwed } from "@/lib/gameState";
/**
 * Evolution across the four sets: every Dark Evolution card only goes on the exact name it
 * evolves from (data-driven over the catalog) and no other Evolution card goes on a Dark
 * Pokémon; Mysterious Fossil lines (incl. Pokémon Breeder); timing (turns 1–2, the turn it was
 * played or evolved); evolving removes Special Conditions and attack effects (also the cure for
 * your own Long-Distance Hypnosis); Rapid Evolution and Evolutionary Light vs Prehistoric Power.
 */
import { describe, it, expect } from "vitest";
import { ALL_CARDS } from "@/domain/catalog";
import type { Card, PokemonCard } from "@/domain/cards";
import { isPokemonCard } from "@/domain/cards";
import { applyProtection, canExecuteAttack, executeAttack, resolveConfusionFlip } from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { resolveAttackChoice } from "@/lib/attackChoices";
import { canEvolve, evolvePokemonCard, playBasicPokemon } from "@/domain/board";
import { canUsePokemonPower, getPowerSteps, getTrainerSteps, playTrainerCard, usePokemonPower } from "@/domain/effects";
import { EnergyType, PokemonStage, ProtectionType, StatusCondition } from "@/domain/constants";
import { canPlayPokemonBreeder } from "@/domain/trainers";
import { makeState, inPlay, gameCard, armedFor, attackIndex, names } from "./helpers/state";

const { Asleep, Confused, Poisoned, Paralyzed, CannotAttack } = StatusCondition;
const T = "tails" as const;
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const opponent = { active: inPlay("Chansey") };

const pokemonCards = (ALL_CARDS as Card[]).filter(isPokemonCard) as PokemonCard[];
const evolutionCards = pokemonCards.filter((c) => c.stage !== PokemonStage.Basic);
const isDark = (c: { name: string }) => c.name.startsWith("Dark ");
/** One in-play Pokémon per distinct name that can be evolved (Basics and Stage 1), from its first catalog card. */
const evolvableNames = [...new Set(pokemonCards.filter((c) => c.stage !== PokemonStage.Stage2).map((c) => c.name))];

function canGoOn(evolution: PokemonCard, target: PokemonInPlay): boolean {
  const card = { ...structuredClone(evolution), id: `${evolution.id}#hand` };
  const state = makeState({ player: { active: target, hand: [card] }, opponent });
  return canEvolve(state, card.id, target.pokemon.id) === null;
}

describe("Dark evolution lines (data-driven over the catalog)", () => {
  const darkEvolutions = evolutionCards.filter(isDark);
  const targets = evolvableNames.map((name) => inPlay(name));

  it("the Team Rocket catalog has the Dark Evolution cards this test is about", () => {
    expect(darkEvolutions.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        "Dark Charmeleon", "Dark Charizard", "Dark Dragonair", "Dark Dragonite", "Dark Kadabra", "Dark Alakazam",
        "Dark Machoke", "Dark Machamp", "Dark Gloom", "Dark Vileplume", "Dark Wartortle", "Dark Blastoise",
        "Dark Electrode", "Dark Golduck", "Dark Arbok", "Dark Dugtrio", "Dark Golbat", "Dark Gyarados", "Dark Hypno",
        "Dark Magneton", "Dark Muk", "Dark Persian", "Dark Primeape", "Dark Rapidash", "Dark Raticate", "Dark Slowbro",
        "Dark Vaporeon", "Dark Flareon", "Dark Jolteon", "Dark Weezing", "Dark Raichu",
      ])
    );
  });

  it.each(darkEvolutions.map((c) => [c.name, c] as const))("%s only goes on its exact evolvesFrom name", (_name, evolution) => {
    const accepted = targets.filter((t) => canGoOn(evolution, t)).map((t) => t.pokemon.name);
    expect(accepted).toEqual([evolution.evolvesFrom]);
  });

  it("no non-Dark Evolution card goes on a Dark Pokémon", () => {
    const darkInPlay = evolvableNames.filter((n) => isDark({ name: n })).map((n) => inPlay(n));
    expect(darkInPlay.length).toBeGreaterThanOrEqual(5);
    const wrong: string[] = [];
    for (const evolution of evolutionCards.filter((c) => !isDark(c))) {
      for (const target of darkInPlay) if (canGoOn(evolution, target)) wrong.push(`${evolution.name} on ${target.pokemon.name}`);
    }
    expect(wrong).toEqual([]);
  });

  it("every Evolution card evolves from a name that exists in the catalog with the stage below", () => {
    const below: Record<string, string> = { [PokemonStage.Stage1]: PokemonStage.Basic, [PokemonStage.Stage2]: PokemonStage.Stage1 };
    const broken = evolutionCards.filter((evolution) => {
      const bases = (ALL_CARDS as Card[]).filter((c) => c.name === evolution.evolvesFrom);
      // Mysterious Fossil is a Trainer played as a Basic
      return !bases.some((b) => (isPokemonCard(b) ? b.stage === below[evolution.stage] : b.kind === "trainer" && !!b.playsAsBasic));
    });
    expect(broken.map((c) => c.name)).toEqual([]);
  });
});

describe("Mysterious Fossil lines", () => {
  it("Kabuto, Omanyte and Aerodactyl go on Mysterious Fossil; Kabutops and Omastar don't", () => {
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const byName = (n: string) => evolutionCards.find((c) => c.name === n)!;
    expect(["Kabuto", "Omanyte", "Aerodactyl"].filter((n) => canGoOn(byName(n), fossil))).toEqual(["Kabuto", "Omanyte", "Aerodactyl"]);
    expect(["Kabutops", "Omastar"].filter((n) => canGoOn(byName(n), fossil))).toEqual([]);
  });

  it("Pokémon Breeder puts Kabutops straight on Mysterious Fossil (assumed legal: the Fossil is played as a Basic)", () => {
    const breeder = gameCard("Pokémon Breeder", "base");
    const kabutops = gameCard("Kabutops", "fossil");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const state = makeState({ player: { active: inPlay("Machop"), bench: [fossil], hand: [breeder, kabutops] }, opponent });
    expect(getTrainerSteps(state, breeder.id, [])?.options.map((o) => o.id)).toEqual([kabutops.id]);
    const next = playTrainerCard(state, breeder.id, [[kabutops.id], [fossil.pokemon.id]]);
    expect(next.playerBench[0].pokemon.name).toBe("Kabutops");
    expect(names(next.playerBench[0].previousEvolutions ?? [])).toEqual(["Mysterious Fossil"]);
  });

  it("once Aerodactyl evolves from the Fossil, its Prehistoric Power stops its owner's Kabuto → Kabutops too", () => {
    const aerodactyl = gameCard("Aerodactyl", "fossil");
    const kabutops = gameCard("Kabutops", "fossil");
    const fossil = inPlay("Mysterious Fossil", { set: "fossil" });
    const kabuto = inPlay("Kabuto", { set: "fossil", evolvedFrom: ["Mysterious Fossil"] });
    const state = makeState({ player: { active: fossil, bench: [kabuto], hand: [aerodactyl, kabutops] }, opponent });
    expect(canEvolve(state, kabutops.id, kabuto.pokemon.id)).toBeNull();
    const evolved = evolvePokemonCard(state, aerodactyl.id, fossil.pokemon.id);
    expect(canEvolve(evolved, kabutops.id, kabuto.pokemon.id)).toMatch(/Prehist/);
  });
});

describe("evolution timing", () => {
  it("not on turn 1 or 2 (either player's first turn), even for a Pokémon placed during setup", () => {
    const charmeleon = gameCard("Charmeleon", "base");
    const charmander = inPlay("Charmander", { playedOnTurn: 0 });
    for (const turnNumber of [1, 2]) {
      const state = makeState({ turnNumber, player: { active: charmander, hand: [charmeleon] }, opponent });
      expect(canEvolve(state, charmeleon.id, charmander.pokemon.id), `turn ${turnNumber}`).toMatch(/primer turno/);
    }
    const turn3 = makeState({ turnNumber: 3, player: { active: charmander, hand: [charmeleon] }, opponent });
    expect(canEvolve(turn3, charmeleon.id, charmander.pokemon.id)).toBeNull();
  });

  it("not the turn the Basic was played; yes on the player's next turn", () => {
    const [charmander, darkCharmeleon] = [gameCard("Charmander", "rocket"), gameCard("Dark Charmeleon", "rocket")];
    const state = makeState({ turnNumber: 5, player: { active: inPlay("Machop"), hand: [charmander, darkCharmeleon] }, opponent });
    const played = playBasicPokemon(state, charmander.id, "bench");
    expect(canEvolve(played, darkCharmeleon.id, charmander.id)).toMatch(/este turno/);
    expect(canEvolve({ ...played, turnNumber: 7 }, darkCharmeleon.id, charmander.id)).toBeNull();
  });

  it("Stage 1 and Stage 2 on the same Pokémon in one turn: the second is refused", () => {
    const [darkCharmeleon, darkCharizard] = [gameCard("Dark Charmeleon", "rocket"), gameCard("Dark Charizard", "rocket")];
    const charmander = inPlay("Charmander");
    const state = makeState({ player: { active: charmander, hand: [darkCharmeleon, darkCharizard] }, opponent });
    const once = evolvePokemonCard(state, darkCharmeleon.id, charmander.pokemon.id);
    expect(canEvolve(once, darkCharizard.id, darkCharmeleon.id)).toMatch(/este turno/);
    expect(canEvolve({ ...once, turnNumber: 5 }, darkCharizard.id, darkCharmeleon.id)).toBeNull();
  });

  it("evolving isn't a Trainer: legal under Dark Vileplume's Hay Fever and Psyduck's Headache", () => {
    const darkMachoke = gameCard("Dark Machoke", "rocket");
    const machop = inPlay("Machop");
    const state = makeState({ noTrainersOnTurn: 3, player: { active: machop, hand: [darkMachoke] }, opponent: { active: rocket("Dark Vileplume") } });
    expect(canEvolve(state, darkMachoke.id, machop.pokemon.id)).toBeNull();
  });
});

describe("evolving removes Special Conditions and every effect of attacks", () => {
  it("Dark Machoke on a Poisoned, Confused Machop under Leer, Smokescreen, Acid, Conversion and protection: all gone; damage and Energy stay", () => {
    const darkMachoke = gameCard("Dark Machoke", "rocket");
    const machop: PokemonInPlay = {
      ...applyProtection(inPlay("Machop", { damage: 30, energy: [EnergyType.Fighting], statuses: [Poisoned, Confused, CannotAttack] }), ProtectionType.DamageOnly, 2),
      poisonDamage: 20,
      mustFlipToAttack: true,
      mustFlipToAttackTurn: 2,
      retreatPrevented: true,
      retreatPreventedOnTurn: 2,
      modifiedWeakness: EnergyType.Water,
      nextTurnDamageReduction: 20,
      nextTurnEffectAppliedOnTurn: 2,
    };
    const state = makeState({ player: { active: machop, hand: [darkMachoke] }, opponent });
    const evolved = evolvePokemonCard(state, darkMachoke.id, machop.pokemon.id).playerActivePokemon!;
    expect(evolved.statusConditions).toEqual([]);
    expect([evolved.poisonDamage, evolved.mustFlipToAttack, evolved.retreatPrevented, evolved.modifiedWeakness, evolved.protection, evolved.nextTurnDamageReduction])
      .toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
    expect(evolved.currentDamage).toBe(30);
    expect(evolved.attachedEnergy).toHaveLength(1);
  });

  it("Long-Distance Hypnosis tails put your own Machop to sleep: evolving it wakes it up and it can attack", () => {
    const drowzee = rocket("Drowzee");
    const darkMachoke = gameCard("Dark Machoke", "rocket");
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const state = makeState({ player: { active: machop, bench: [drowzee], hand: [darkMachoke] }, opponent: { active: inPlay("Chansey"), bench: [inPlay("Abra")] } });
    const asleep = usePokemonPower(state, drowzee.pokemon.id, [], { coinResults: [T] });
    expect(canExecuteAttack(asleep, 0)).toMatch(/dormido/);
    const evolved = evolvePokemonCard(asleep, darkMachoke.id, machop.pokemon.id);
    expect(evolved.playerActivePokemon!.statusConditions).toEqual([]);
    expect(canExecuteAttack(armedForState(evolved), 0)).toBeNull();
  });

  it("Rapid Evolution on a Confused, Paralysis-free Magikarp played this turn on turn 1 (heads): Dark Gyarados without Confusion", () => {
    const magikarp = rocket("Magikarp", { statuses: [Confused, Poisoned], playedOnTurn: 1 });
    const deck = [gameCard("Dark Gyarados", "rocket"), gameCard("Abra", "base")];
    const state = makeState({ turnNumber: 1, player: { active: armedFor(magikarp, "Evolución Rápida"), deck }, opponent });
    const { state: flipped, canAttack } = resolveConfusionFlip(state, true, true);
    expect(canAttack).toBe(true);
    const attacked = executeAttack(flipped, attackIndex(magikarp, "Evolución Rápida"), { coinResults: [], skipEndTurn: true });
    const done = resolveAttackChoice(attacked, [attacked.pendingAttackChoice!.step.options[0].id], { skipEndTurn: true });
    expect(done.playerActivePokemon!.pokemon.name).toBe("Dark Gyarados");
    expect(done.playerActivePokemon!.statusConditions).toEqual([]);
  });
});

describe("Evolutionary Light and Prehistoric Power", () => {
  it("Dark Dragonair can still search an Evolution card while Aerodactyl is in play, but it can't be played", () => {
    const dragonair = rocket("Dark Dragonair");
    const dratini = inPlay("Dratini");
    const deck = [gameCard("Dark Dragonite", "rocket"), gameCard("Abra", "base")];
    const state = makeState({ player: { active: dragonair, bench: [dratini], deck }, opponent: { active: inPlay("Aerodactyl", { set: "fossil" }) } });
    expect(canUsePokemonPower(state, dragonair.pokemon.id)).toBeNull();
    const step = getPowerSteps(state, dragonair.pokemon.id, [])!;
    const next = usePokemonPower(state, dragonair.pokemon.id, [[step.options[0].id]]);
    expect(names(next.playerHand)).toEqual(["Dark Dragonite"]);
    expect(canEvolve(next, next.playerHand[0].id, dragonair.pokemon.id)).toMatch(/Prehist/);
  });

  it("an Asleep Dark Dragonair can't use it", () => {
    const dragonair = rocket("Dark Dragonair", { statuses: [Asleep] });
    const state = makeState({ player: { active: dragonair, deck: [gameCard("Dark Dragonite", "rocket")] }, opponent });
    expect(canUsePokemonPower(state, dragonair.pokemon.id)).not.toBeNull();
    const paralyzedOk = makeState({ player: { active: inPlay("Machop", { statuses: [Paralyzed] }), bench: [rocket("Dark Dragonair")], deck: [gameCard("Dark Dragonite", "rocket")] }, opponent });
    expect(canUsePokemonPower(paralyzedOk, paralyzedOk.playerBench[0].pokemon.id)).toBeNull();
  });
});

/** The Active with Energy for its first attack (after evolving, the card and its attacks changed). */
function armedForState(state: GameState): GameState {
  const active = state.playerActivePokemon!;
  const card = active.pokemon as PokemonCard;
  return { ...state, playerActivePokemon: armedFor(active, card.attacks[0].name) };
}

describe("evolution changes and a transformed Ditto", () => {
  it("Devolution Spray turns the player's Charizard into Charmeleon: the opponent's Ditto (90 damage) now has 80 HP → Knocked Out, Prize taken", () => {
    const spray = gameCard("Devolution Spray", "base");
    const charizard = inPlay("Charizard", { evolvedFrom: ["Charmander", "Charmeleon"] });
    const ditto = inPlay("Ditto", { set: "fossil", damage: 90 });
    const state = makeState({ player: { active: charizard, hand: [spray] }, opponent: { active: ditto, bench: [inPlay("Abra")] } });
    const next = playTrainerCard(state, spray.id, [[charizard.pokemon.id]]);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Charmeleon");
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.opponentNeedsToPromote).toBe(true);
    expect(prizesOwed(next, "player")).toBe(1);
  });

  it("evolving the player's Active only raises the opponent's Ditto's HP: no Knock Out, no Prize", () => {
    const darkCharmeleon = gameCard("Dark Charmeleon", "rocket");
    const charmander = inPlay("Charmander");
    const ditto = inPlay("Ditto", { set: "fossil", damage: 40 });
    const state = makeState({ player: { active: charmander, hand: [darkCharmeleon] }, opponent: { active: ditto, bench: [inPlay("Abra")] } });
    const evolved = evolvePokemonCard(state, darkCharmeleon.id, charmander.pokemon.id);
    expect(evolved.opponentActivePokemon!.pokemon.name).toBe("Ditto");
    expect(evolved.playerPrizes).toHaveLength(6);
  });
});

describe("Pokémon Breeder over every Stage 2 of the catalog", () => {
  const basicNames = [...new Set(pokemonCards.filter((c) => c.stage === PokemonStage.Basic).map((c) => c.name)), "Mysterious Fossil"];
  const stage1 = (name: string) => evolutionCards.find((c) => c.name === name);
  const stage2s = evolutionCards.filter((c) => c.stage === PokemonStage.Stage2);

  it.each(stage2s.map((c) => [`${c.name} (${c.id})`, c] as const))("%s goes only on the Basic two stages below", (_label, stage2) => {
    const expected = stage1(stage2.evolvesFrom!)!.evolvesFrom;
    const breeder = gameCard("Pokémon Breeder", "base");
    const card = { ...structuredClone(stage2), id: `${stage2.id}#hand` };
    const accepted = basicNames.filter((name) => {
      const target = inPlay(name, name === "Mysterious Fossil" ? { set: "fossil" } : {});
      const state = makeState({ player: { active: target, hand: [breeder, card] }, opponent });
      return canPlayPokemonBreeder(state, breeder.id, card.id, -1);
    });
    expect(accepted).toEqual([expected]);
  });
});
