import { describe, expect, it } from "vitest";
import {
  ALL_CARDS,
  buildLuckyDuelDeck,
  canEvolveInto,
  canExecuteAttack,
  canExecuteMetronome,
  canMulligan,
  canPlayBasicPokemon,
  canPlayTrainerCard,
  canUsePokemonPower,
  getPowerSteps,
  drawLuckyDuel,
  endTurn,
  evolvePokemonCard,
  executeAttack,
  findCardById,
  initializeLuckyDuelGame,
  initializeMultiplayerGame,
  isLimitedInDeck,
  isLuckyDuelTrainerAllowed,
  LUCKY_DUEL_EXCLUDED_TRAINERS,
  maxBenchSize,
  resolveAttackChoice,
  setPlayerReady,
  startPlayingPhase,
  swapSides,
  decks,
} from "../src";
import type { Card, GameState, PokemonCard } from "../src";
import { EnergyType, GamePhase, PokemonStage, StatusCondition } from "../src/domain/constants";
import { mulberry32 } from "../src/domain/simulation/rng";
import { armedFor, attackIndex, deepFreeze, gameCard, inPlay, makeState } from "./helpers/state";

const pokemonCard = (id: string): PokemonCard => {
  const card = findCardById(id);
  if (!card || card.kind !== "pokemon") throw new Error(`${id} is not a Pokémon`);
  return card;
};

const isPokemon = (c: Card): c is PokemonCard => c.kind === "pokemon";
const lineOf = (deck: Card[]) => deck.filter(isPokemon);
const energyCount = (deck: Card[], type: EnergyType) =>
  deck.filter((c) => c.kind === "energy" && c.isBasic && c.energyType === type).length;

/** A Lucky Duel game in the PLAYING phase: no Prizes, no Bench. */
const luckyState = (setup: Parameters<typeof makeState>[0] = {}): GameState => {
  const state = makeState(setup);
  return {
    ...state,
    gameMode: "lucky-duel",
    luckyDuelRevealed: true,
    prizeCount: 0,
    playerPrizes: setup.player?.prizes ?? [],
    opponentPrizes: setup.opponent?.prizes ?? [],
  };
};

describe("Lucky Duel deck (buildLuckyDuelDeck / drawLuckyDuel)", () => {
  const draws = Array.from({ length: 150 }, (_, seed) => drawLuckyDuel(mulberry32(seed + 1)));

  it("builds 60 cards around one random Basic Pokémon: its line, 24 basic Energy, Trainers", () => {
    for (const draw of draws) {
      const { active, deck, colors } = draw;
      expect(deck).toHaveLength(60);
      expect(active.kind).toBe("pokemon");
      expect(active.stage).toBe(PokemonStage.Basic);
      // The Active is in the deck exactly once, and it is the only Basic
      const basics = deck.filter((c) => isPokemon(c) && c.stage === PokemonStage.Basic);
      expect(basics).toHaveLength(1);
      expect(basics[0].id).toBe(active.id);
      // The line: each card evolves from the previous one
      const line = lineOf(deck);
      expect(line.length).toBeGreaterThanOrEqual(1);
      expect(line.length).toBeLessThanOrEqual(3);
      expect(line[0].id).toBe(active.id);
      for (let i = 1; i < line.length; i++) expect(canEvolveInto(line[i], line[i - 1])).toBe(true);
      // Two different, non-Colorless colours: 16 + 8
      const [primary, secondary] = colors;
      expect(primary).not.toBe(EnergyType.Colorless);
      expect(secondary).not.toBe(EnergyType.Colorless);
      expect(primary).not.toBe(secondary);
      expect(energyCount(deck, primary)).toBe(16);
      expect(energyCount(deck, secondary)).toBe(8);
      expect(deck.filter((c) => c.kind === "energy")).toHaveLength(24);
      // Trainers: the rest, from the pool, at most 4 per name
      const trainers = deck.filter((c) => c.kind === "trainer");
      expect(trainers).toHaveLength(60 - 24 - line.length);
      for (const t of trainers) expect(isLuckyDuelTrainerAllowed(t)).toBe(true);
      const byName = new Map<string, number>();
      for (const c of deck) if (isLimitedInDeck(c)) byName.set(c.name, (byName.get(c.name) ?? 0) + 1);
      for (const [, count] of byName) expect(count).toBeLessThanOrEqual(4);
      // Pokémon Breeder only with a Stage 2
      if (trainers.some((t) => t.name === "Pokémon Breeder")) {
        expect(line.some((p) => p.stage === PokemonStage.Stage2)).toBe(true);
      }
    }
  });

  it("draws Basics from every set, the primary colour is the Basic's type", () => {
    expect(new Set(draws.map((d) => d.active.name)).size).toBeGreaterThan(50);
    expect(new Set(draws.map((d) => d.active.set)).size).toBe(5);
    for (const { active, colors } of draws) {
      if (active.types[0] !== EnergyType.Colorless) expect(colors[0]).toBe(active.types[0]);
    }
  });

  it("is deterministic for a seeded rng", () => {
    const a = drawLuckyDuel(mulberry32(42));
    const b = drawLuckyDuel(mulberry32(42));
    expect(b.active.id).toBe(a.active.id);
    expect(b.colors).toEqual(a.colors);
    expect(b.deck.map((c) => c.id)).toEqual(a.deck.map((c) => c.id));
  });

  it("a Basic without evolutions: no other Pokémon, 35 Trainers", () => {
    const draw = buildLuckyDuelDeck(pokemonCard("jungle-005-kangaskhan"), mulberry32(3));
    expect(lineOf(draw.deck).map((c) => c.name)).toEqual(["Kangaskhan"]);
    expect(draw.deck.filter((c) => c.kind === "trainer")).toHaveLength(35);
    expect(draw.deck.some((c) => c.name === "Pokémon Breeder")).toBe(false);
  });

  it("a Basic with a Stage 1 only: exactly one Stage 1 that evolves from it", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const draw = buildLuckyDuelDeck(pokemonCard("base-set-058-pikachu"), mulberry32(seed));
      const line = lineOf(draw.deck);
      expect(line).toHaveLength(2);
      expect(line[1].stage).toBe(PokemonStage.Stage1);
      expect(line[1].evolvesFrom).toBe("Pikachu");
      expect(draw.deck.filter((c) => c.kind === "trainer")).toHaveLength(34);
      expect(draw.deck.some((c) => c.name === "Pokémon Breeder")).toBe(false);
    }
  });

  it("a Stage 2 line: exactly one Stage 1 and one Stage 2 (Dark versions included)", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const line = lineOf(buildLuckyDuelDeck(pokemonCard("base-set-046-charmander"), mulberry32(seed)).deck);
      expect(line).toHaveLength(3);
      expect(line.map((c) => c.stage)).toEqual([PokemonStage.Basic, PokemonStage.Stage1, PokemonStage.Stage2]);
      expect(canEvolveInto(line[1], line[0])).toBe(true);
      expect(canEvolveInto(line[2], line[1])).toBe(true);
      seen.add(line[1].name);
    }
    expect(seen).toEqual(new Set(["Charmeleon", "Dark Charmeleon"]));
  });

  it("an owner's Basic only takes that owner's evolutions (Brock's Sandshrew → Brock's Sandslash)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const line = lineOf(buildLuckyDuelDeck(pokemonCard("gym-heroes-071-brocks-sandshrew"), mulberry32(seed)).deck);
      expect(line.map((c) => c.name)).toEqual(["Brock's Sandshrew", "Brock's Sandslash"]);
    }
  });

  it("the secondary colour pays the line's attacks when it needs another type (Exeggcute → Psychic)", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const draw = buildLuckyDuelDeck(pokemonCard("jungle-052-exeggcute"), mulberry32(seed));
      expect(draw.colors).toEqual([EnergyType.Grass, EnergyType.Psychic]);
    }
    // Over every draw: any non-Colorless cost of the line is one of the two colours when the
    // line needs a single extra type
    for (let seed = 1; seed <= 150; seed++) {
      const { deck, colors } = drawLuckyDuel(mulberry32(seed));
      const extra = new Set(lineOf(deck).flatMap((p) => p.attacks.flatMap((a) => a.cost)).filter((t) => t !== EnergyType.Colorless && t !== colors[0]));
      if (extra.size === 1) expect([...extra][0]).toBe(colors[1]);
      if (extra.size > 1) expect(extra.has(colors[1])).toBe(true);
    }
  });

  it("a Colorless Basic gets two random non-Colorless colours", () => {
    const pairs = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const { colors } = buildLuckyDuelDeck(pokemonCard("jungle-005-kangaskhan"), mulberry32(seed));
      expect(colors).not.toContain(EnergyType.Colorless);
      expect(colors[0]).not.toBe(colors[1]);
      pairs.add(colors.join("/"));
    }
    expect(pairs.size).toBeGreaterThan(5);
  });

  it("an Eevee line takes the Stage 1's colour when the random primary isn't it", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { deck, colors } = buildLuckyDuelDeck(pokemonCard("jungle-051-eevee"), mulberry32(seed));
      const stage1 = lineOf(deck)[1];
      const own = stage1.types[0];
      expect(colors).toContain(own);
    }
  });
});

describe("Lucky Duel Trainer pool", () => {
  it("excludes the Bench / Prize / own-Active Trainers, each with a reason", () => {
    for (const name of [
      "Switch", "Gust of Wind", "Challenge!", "Pokémon Flute", "Revive", "Clefairy Doll", "Mysterious Fossil",
      "Here Comes Team Rocket!", "Scoop Up", "Mr. Fuji", "Lt. Surge's Treaty",
    ]) {
      expect(LUCKY_DUEL_EXCLUDED_TRAINERS[name], name).toBeTruthy();
      const card = ALL_CARDS.find((c) => c.name === name)!;
      expect(isLuckyDuelTrainerAllowed(card)).toBe(false);
    }
    // Every excluded name is a real Trainer of the catalog
    for (const name of Object.keys(LUCKY_DUEL_EXCLUDED_TRAINERS)) {
      expect(ALL_CARDS.some((c) => c.kind === "trainer" && c.name === name), name).toBe(true);
    }
    expect(isLuckyDuelTrainerAllowed(ALL_CARDS.find((c) => c.name === "Bill")!)).toBe(true);
    expect(isLuckyDuelTrainerAllowed(ALL_CARDS.find((c) => c.name === "Pikachu")!)).toBe(false);
  });
});

describe("initializeLuckyDuelGame", () => {
  const p1 = buildLuckyDuelDeck(pokemonCard("base-set-046-charmander"), mulberry32(1));
  const p2 = buildLuckyDuelDeck(pokemonCard("jungle-005-kangaskhan"), mulberry32(2));
  const game = () => initializeLuckyDuelGame(p1, p2, mulberry32(9));

  it("places both Actives face down, no Prizes, 7-card hands, 52-card decks", () => {
    const state = game();
    expect(state.gameMode).toBe("lucky-duel");
    expect(state.luckyDuelRevealed).toBe(false);
    expect(state.gamePhase).toBe(GamePhase.Mulligan);
    expect(state.gameStarted).toBe(true);
    expect(state.gameResult).toBeNull();
    expect(state.playerActivePokemon?.pokemon.name).toBe("Charmander");
    expect(state.opponentActivePokemon?.pokemon.name).toBe("Kangaskhan");
    expect(state.playerActivePokemon?.playedOnTurn).toBe(0);
    for (const side of ["player", "opponent"] as const) {
      expect(state[`${side}Bench`]).toEqual([]);
      expect(state[`${side}Prizes`]).toEqual([]);
      expect(state[`${side}Hand`]).toHaveLength(7);
      expect(state[`${side}Deck`]).toHaveLength(52);
      expect(state[`${side}Discard`]).toEqual([]);
    }
    expect(state.prizeCount).toBe(0);
    expect(maxBenchSize(state, "player")).toBe(0);
    expect(maxBenchSize(state, "opponent")).toBe(0);
    // No mulligan: the Active is given
    expect(canMulligan(state, true)).not.toBeNull();
  });

  it("gives every card a unique id that doesn't name the card (face-down Actives)", () => {
    const state = game();
    const cards = [
      state.playerActivePokemon!.pokemon, state.opponentActivePokemon!.pokemon,
      ...state.playerHand, ...state.playerDeck, ...state.opponentHand, ...state.opponentDeck,
    ];
    expect(cards).toHaveLength(120);
    expect(new Set(cards.map((c) => c.id)).size).toBe(120);
    for (const c of cards) expect(c.id.toLowerCase()).not.toContain(c.name.toLowerCase().slice(0, 4));
    // The events never name the face-down Actives
    for (const e of state.events) {
      expect(e.message).not.toContain("Charmander");
      expect(e.message).not.toContain("Kangaskhan");
    }
  });

  it("is deterministic for a seeded rng and doesn't mutate the draws", () => {
    deepFreeze(p1);
    deepFreeze(p2);
    const a = game();
    const b = game();
    expect(b.playerHand.map((c) => c.id)).toEqual(a.playerHand.map((c) => c.id));
    expect(b.opponentDeck.map((c) => c.name)).toEqual(a.opponentDeck.map((c) => c.name));
  });

  it("reveals both Actives on the both-ready transition to PLAYING", () => {
    let state = setPlayerReady(game(), true);
    state = setPlayerReady(state, false);
    expect(state.luckyDuelRevealed).toBe(false);
    state = startPlayingPhase(state, "heads");
    expect(state.gamePhase).toBe(GamePhase.Playing);
    expect(state.luckyDuelRevealed).toBe(true);
    expect(state.playerHand).toHaveLength(8);
    // swapSides keeps the mode
    expect(swapSides(state).gameMode).toBe("lucky-duel");
    expect(swapSides(state).luckyDuelRevealed).toBe(true);
  });

  it("standard games have no mode and no reveal flag", () => {
    const state = startPlayingPhase(initializeMultiplayerGame(decks[0], decks[1]), "heads");
    expect(state.gameMode).toBeUndefined();
    expect(state.luckyDuelRevealed).toBeUndefined();
    expect(maxBenchSize(state, "player")).toBe(5);
  });
});

describe("Lucky Duel: locked Benches", () => {
  it("a Basic can't go to the Bench", () => {
    const basic = gameCard("Pikachu", "base");
    const state = luckyState({ player: { active: inPlay("Charmander", { set: "base" }), hand: [basic] }, opponent: { active: inPlay("Abra", { set: "base" }) } });
    expect(canPlayBasicPokemon(state, basic.id, "bench")).toMatch(/Lucky Duel/);
  });

  it("Bench-searching attacks can't be used (the Bench counts as full)", () => {
    const bellsprout = armedFor(inPlay("Bellsprout", { set: "jungle" }), "Call for Family");
    const state = luckyState({
      player: { active: bellsprout, deck: [gameCard("Bellsprout", "jungle"), gameCard("Bill")] },
      opponent: { active: inPlay("Abra", { set: "base" }) },
    });
    expect(canExecuteAttack(state, attackIndex(bellsprout, "Call for Family"))).toMatch(/banca está llena/);
  });

  it("Summon Minions (Dark Dragonite) puts nothing on the Bench", () => {
    const dragonite = gameCard("Dark Dragonite", "rocket");
    const state = luckyState({
      turnNumber: 5,
      player: { active: inPlay("Dark Dragonair", { set: "rocket", evolvedFrom: ["Dratini"] }), hand: [dragonite], deck: [gameCard("Dratini", "rocket"), gameCard("Bill")] },
      opponent: { active: inPlay("Abra", { set: "base" }) },
    });
    const next = evolvePokemonCard(state, dragonite.id, state.playerActivePokemon!.pokemon.id);
    expect(next.pendingPowerChoice).toBeUndefined();
    expect(next.playerBench).toEqual([]);
    expect(next.playerDeck.some((c) => c.name === "Dratini")).toBe(true);
  });

  it("Switch, Gust of Wind, Scoop Up, Lt. Surge's Treaty and Challenge! can't be played from the hand", () => {
    for (const name of ["Switch", "Gust of Wind", "Scoop Up", "Lt. Surge's Treaty", "Challenge!"]) {
      const card = gameCard(name);
      const state = luckyState({ player: { active: inPlay("Charmander", { set: "base" }), hand: [card] }, opponent: { active: inPlay("Abra", { set: "base" }) } });
      expect(canPlayTrainerCard(state, card.id), name).not.toBeNull();
    }
    // A pool Trainer is fine
    const bill = gameCard("Bill");
    const state = luckyState({ player: { active: inPlay("Charmander", { set: "base" }), hand: [bill] }, opponent: { active: inPlay("Abra", { set: "base" }) } });
    expect(canPlayTrainerCard(state, bill.id)).toBeNull();
  });
});

describe("Lucky Duel: no removing your only Pokémon", () => {
  it("Cowardice can't be used", () => {
    const tentacool = inPlay("Tentacool", { set: "fossil" });
    const state = luckyState({ player: { active: tentacool }, opponent: { active: inPlay("Abra", { set: "base" }) } });
    expect(canUsePokemonPower(state, tentacool.pokemon.id)).toMatch(/Lucky Duel/);
    // Standard game: usable
    const standard = makeState({ player: { active: tentacool, bench: [inPlay("Abra", { set: "base" })] }, opponent: { active: inPlay("Abra", { set: "base" }) } });
    expect(canUsePokemonPower(standard, tentacool.pokemon.id)).toBeNull();
  });

  it("Peek offers no Prizes to look at", () => {
    const mankey = inPlay("Mankey", { set: "jungle" });
    const state = luckyState({ player: { active: mankey }, opponent: { active: inPlay("Abra", { set: "base" }) } });
    const step = getPowerSteps(state, mankey.pokemon.id, []);
    expect(step?.options.map((o) => o.id)).toEqual(["playerDeck", "opponentDeck", "opponentHand"]);
  });

  it("Vanish (Abra shuffles itself into the deck) can't be used", () => {
    const abra = armedFor(inPlay("Abra", { set: "rocket" }), "Desvanecerse");
    const state = luckyState({ player: { active: abra }, opponent: { active: inPlay("Kangaskhan", { set: "jungle" }) } });
    expect(canExecuteAttack(state, attackIndex(abra, "Desvanecerse"))).toMatch(/Lucky Duel/);
    expect(canExecuteAttack(state, attackIndex(abra, "Psicochoque"))).toBeNull();
  });

  it("Metronome can't copy Vanish either", () => {
    const clefairy = inPlay("Clefairy", { set: "base", energy: [EnergyType.Fire, EnergyType.Fire, EnergyType.Fire] });
    const abra = inPlay("Abra", { set: "rocket" });
    const state = luckyState({ player: { active: clefairy }, opponent: { active: abra } });
    const vanish = (abra.pokemon as PokemonCard).attacks.find((a) => a.name === "Desvanecerse")!;
    expect(canExecuteMetronome(state, vanish)).toMatch(/Lucky Duel/);
  });

  // Owner ruling (2026-10-18): Phoenix Flame works as printed — tails shuffles Blaine's Moltres
  // into the deck and its owner, with no Pokémon left, loses
  it("Phoenix Flame's tails shuffles Blaine's Moltres away: its owner loses", () => {
    const moltres = armedFor(inPlay("Blaine's Moltres", { set: "gym-heroes" }), "Llama Fénix");
    const state = luckyState({ player: { active: moltres }, opponent: { active: inPlay("Chansey", { set: "base" }) } });
    expect(canExecuteAttack(state, 0)).toBeNull();
    const next = executeAttack(state, 0, { coinResults: ["tails"] });
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerDeck.some((c) => c.name === "Blaine's Moltres")).toBe(true);
    expect(next.opponentActivePokemon?.currentDamage).toBe(90);
    expect(next.gameResult).toBe("defeat");
    expect(next.gamePhase).toBe(GamePhase.GameOver);
    expect(swapSides(next).gameResult).toBe("victory");
  });

  it("Phoenix Flame's heads: Blaine's Moltres stays, the game goes on", () => {
    const moltres = armedFor(inPlay("Blaine's Moltres", { set: "gym-heroes" }), "Llama Fénix");
    const state = luckyState({ player: { active: moltres }, opponent: { active: inPlay("Chansey", { set: "base" }) } });
    const next = executeAttack(state, 0, { coinResults: ["heads"], skipEndTurn: true });
    expect(next.playerActivePokemon?.pokemon.name).toBe("Blaine's Moltres");
    expect(next.gameResult).toBeNull();
  });

  it("Phoenix Flame's tails that also Knocks Out the other Active is a draw", () => {
    const moltres = armedFor(inPlay("Blaine's Moltres", { set: "gym-heroes" }), "Llama Fénix");
    const state = luckyState({ player: { active: moltres }, opponent: { active: inPlay("Kangaskhan", { set: "jungle" }) } });
    const next = executeAttack(state, 0, { coinResults: ["tails"] });
    expect(next.playerActivePokemon).toBeNull();
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.gameResult).toBe("draw");
  });
});

describe("Lucky Duel: Knock Outs end the game", () => {
  it("Knocking Out the other Active wins; the other view loses", () => {
    const hitmonchan = armedFor(inPlay("Hitmonchan", { set: "base" }), "Puño Bala");
    const state = luckyState({ player: { active: hitmonchan }, opponent: { active: inPlay("Abra", { set: "base", damage: 10 }) } });
    const next = executeAttack(state, attackIndex(hitmonchan, "Puño Bala"));
    expect(next.gameResult).toBe("victory");
    expect(next.gamePhase).toBe(GamePhase.GameOver);
    expect(next.playerCanTakePrize).toBe(false);
    expect(swapSides(next).gameResult).toBe("defeat");
  });

  it("an attacker that Knocks itself Out alone loses", () => {
    const chansey = armedFor(inPlay("Chansey", { set: "base", damage: 50 }), "Doble Filo");
    const state = luckyState({ player: { active: chansey }, opponent: { active: inPlay("Kangaskhan", { set: "jungle" }) } });
    const next = executeAttack(state, attackIndex(chansey, "Doble Filo"));
    expect(next.gameResult).toBe("defeat");
    expect(next.opponentActivePokemon?.pokemon.name).toBe("Kangaskhan");
  });

  it("Selfdestruct Knocking Out both Actives is a draw", () => {
    const magnemite = armedFor(inPlay("Magnemite", { set: "base" }), "Autodestrucción");
    const state = deepFreeze(luckyState({ player: { active: magnemite }, opponent: { active: inPlay("Abra", { set: "base" }) } }));
    const next = executeAttack(state, attackIndex(magnemite, "Autodestrucción"));
    expect(next.gameResult).toBe("draw");
    expect(next.gamePhase).toBe(GamePhase.GameOver);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.events.some((e) => e.message.includes("Empate"))).toBe(true);
    // The winner / loser lines of the two Knock Outs are replaced by the draw
    expect(next.events.some((e) => /¡Victoria!|¡Derrota!/.test(e.message))).toBe(false);
    expect(swapSides(next).gameResult).toBe("draw");
  });

  it("Destiny Bond taking the attacker too is a draw", () => {
    // Gastly resists Fighting: Charmander scratches it
    const charmander = armedFor(inPlay("Charmander", { set: "base" }), "Arañazo");
    const gastly = inPlay("Gastly", { set: "base", damage: 20, destinyBondActive: true, destinyBondTurn: 2 });
    const state = luckyState({ player: { active: charmander }, opponent: { active: gastly } });
    const next = executeAttack(state, attackIndex(charmander, "Arañazo"));
    expect(next.gameResult).toBe("draw");
  });

  it("Destiny Bond answering a chosen-target attack (Dark Golbat's Flitter) is a draw too", () => {
    const golbat = armedFor(inPlay("Dark Golbat", { set: "rocket" }), "Revoloteo");
    const gastly = inPlay("Gastly", { set: "base", damage: 10, destinyBondActive: true, destinyBondTurn: 2 });
    const state = luckyState({ player: { active: golbat }, opponent: { active: gastly } });
    let next = executeAttack(state, attackIndex(golbat, "Revoloteo"));
    if (next.pendingAttackChoice) next = resolveAttackChoice(next, [gastly.pokemon.id]);
    expect(next.gameResult).toBe("draw");
    expect(next.playerActivePokemon).toBeNull();
  });

  it("both Actives Knocked Out by Poison between turns is a draw", () => {
    const poisoned = (name: string) => inPlay(name, { set: "base", damage: 20, statuses: [StatusCondition.Poisoned] });
    const state = luckyState({ player: { active: poisoned("Abra") }, opponent: { active: poisoned("Gastly") } });
    const next = endTurn(state);
    expect(next.gameResult).toBe("draw");
    expect(next.gamePhase).toBe(GamePhase.GameOver);
    expect(swapSides(next).gameResult).toBe("draw");
  });

  it("only one Active Knocked Out by Poison: its owner loses", () => {
    const state = luckyState({
      player: { active: inPlay("Abra", { set: "base", damage: 20, statuses: [StatusCondition.Poisoned] }) },
      opponent: { active: inPlay("Gastly", { set: "base", statuses: [StatusCondition.Poisoned] }) },
    });
    expect(endTurn(state).gameResult).toBe("defeat");
  });

  it("standard games keep the old double Knock Out results", () => {
    const magnemite = armedFor(inPlay("Magnemite", { set: "base" }), "Autodestrucción");
    const selfdestruct = makeState({ player: { active: magnemite }, opponent: { active: inPlay("Abra", { set: "base" }) } });
    expect(executeAttack(selfdestruct, attackIndex(magnemite, "Autodestrucción")).gameResult).toBe("defeat");
    const poisoned = (name: string) => inPlay(name, { set: "base", damage: 20, statuses: [StatusCondition.Poisoned] });
    const poison = makeState({ player: { active: poisoned("Abra") }, opponent: { active: poisoned("Gastly") } });
    expect(endTurn(poison).gameResult).toBe("defeat");
  });
});
