import { describe, expect, it } from "vitest";
import {
  applyBattleModifiersToOptions,
  checkKnockouts,
  decideOpponentSetup,
  deckFromCardEntries,
  decks,
  doMulligan,
  endTurn,
  executeAIAction,
  executeAttack,
  initializeMultiplayerGame,
  placeOpponentSetup,
  processBenchKnockouts,
  setupOptionsForPassives,
  setupRulesFromModifiers,
  startGame,
  startPlayingPhase,
  swapSides,
  tableRulesFromModifiers,
  type BattleModifier,
  type CardEntry,
  type GameState,
} from "../src";
import { prizesFor } from "../src/domain/ai/evaluate";
import { GamePhase, StatusCondition } from "../src/domain/constants";
import { IllegalActionError } from "../src/shared/errors";
import { armedFor, attackIndex, deepFreeze, gameCard, inPlay, makeState, names } from "./helpers/state";

const NO_PRIZE_METAPOD = { noPrizeFor: { opponent: ["Metapod"] } };
const NO_PRIZE_LINE = "Metapod no da premio en esta mesa";

const METAPOD_DECK: CardEntry[] = [
  { cardId: "base-set-045-caterpie", qty: 3 },
  { cardId: "base-set-054-metapod", qty: 3 },
  { cardId: "base-set-094-potion", qty: 4 },
  { cardId: "base-set-090-super-potion", qty: 3 },
  { cardId: "base-set-080-defender", qty: 2 },
  { cardId: "base-set-092-energy-removal", qty: 2 },
  { cardId: "base-set-095-switch", qty: 1 },
  { cardId: "base-set-099-grass-energy", qty: 22 },
];

const METAPOD_SETUP = {
  active: ["base-set-045-caterpie", "base-set-054-metapod"],
  bench: [
    ["base-set-045-caterpie", "base-set-054-metapod"],
    ["base-set-045-caterpie", "base-set-054-metapod"],
  ],
};

const hasLine = (state: GameState, line: string) => state.events.some((e) => e.message === line);

describe("noPrizeFor: a Knock Out of a named Pokémon gives no Prize", () => {
  it("by an attack: Metapod gives none (logged), Caterpie gives one", () => {
    const charmander = armedFor(inPlay("Charmander"), "Ascuas");
    const metapodState = makeState({
      player: { active: charmander },
      opponent: { active: inPlay("Metapod", { damage: 20 }), bench: [inPlay("Metapod")] },
      tableRules: NO_PRIZE_METAPOD,
    });
    const afterMetapod = executeAttack(metapodState, attackIndex(charmander, "Ascuas"), { coinResults: [], skipEndTurn: true });
    expect(names(afterMetapod.opponentDiscard)).toContain("Metapod");
    expect(afterMetapod.playerCanTakePrize).toBe(false);
    expect(hasLine(afterMetapod, NO_PRIZE_LINE)).toBe(true);

    const caterpieState = makeState({
      player: { active: charmander },
      opponent: { active: inPlay("Caterpie"), bench: [inPlay("Metapod")] },
      tableRules: NO_PRIZE_METAPOD,
    });
    const afterCaterpie = executeAttack(caterpieState, attackIndex(charmander, "Ascuas"), { coinResults: [], skipEndTurn: true });
    expect(afterCaterpie.playerCanTakePrize).toBe(true);
  });

  it("by bench damage: only the Caterpie gives a Prize", () => {
    const state = makeState({
      player: { active: inPlay("Charmander"), prizes: [gameCard("Fire Energy", "base"), gameCard("Fire Energy", "base")] },
      opponent: { active: inPlay("Metapod"), bench: [inPlay("Metapod", { damage: 70 }), inPlay("Caterpie", { damage: 40 })] },
      tableRules: NO_PRIZE_METAPOD,
    });
    const after = processBenchKnockouts(state);
    expect(after.playerPrizes).toHaveLength(1);
    expect(after.opponentBench).toHaveLength(0);
    expect(hasLine(after, NO_PRIZE_LINE)).toBe(true);
  });

  it("by the between-turns checkup (Poison)", () => {
    const state = makeState({
      player: { active: inPlay("Charmander") },
      opponent: { active: inPlay("Metapod", { damage: 60, statuses: [StatusCondition.Poisoned] }), bench: [inPlay("Metapod")] },
      tableRules: NO_PRIZE_METAPOD,
    });
    const after = endTurn(state);
    expect(names(after.opponentDiscard)).toContain("Metapod");
    expect(after.playerCanTakePrize).toBe(false);
    expect(hasLine(after, NO_PRIZE_LINE)).toBe(true);
  });

  it("the acting side's own Active (self Knock Out path): no automatic Prize for the other side", () => {
    const state = makeState({
      player: { active: inPlay("Metapod", { damage: 70 }), bench: [inPlay("Caterpie")] },
      opponent: { active: inPlay("Charmander") },
      tableRules: { noPrizeFor: { player: ["Metapod"] } },
    });
    const after = checkKnockouts(state);
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentPrizes).toHaveLength(6);
    expect(hasLine(after, NO_PRIZE_LINE)).toBe(true);
  });

  it("follows swapSides", () => {
    const state = makeState({
      player: { active: inPlay("Charmander") },
      opponent: { active: inPlay("Metapod", { damage: 70 }), bench: [inPlay("Caterpie")] },
      tableRules: NO_PRIZE_METAPOD,
    });
    const swapped = swapSides(state);
    expect(swapped.tableRules).toEqual({ noPrizeFor: { player: ["Metapod"] } });
    const after = checkKnockouts(swapped);
    expect(after.opponentPrizes).toHaveLength(6);
    expect(swapSides(after).playerPrizes).toHaveLength(6);
  });

  it("the rival's last Pokémon (a Metapod) Knocked Out still wins the game", () => {
    const state = makeState({
      player: { active: inPlay("Charmander"), prizes: [gameCard("Fire Energy", "base")] },
      opponent: { active: inPlay("Metapod", { damage: 70 }), bench: [] },
      tableRules: NO_PRIZE_METAPOD,
    });
    const after = checkKnockouts(state);
    expect(after.gameResult).toBe("victory");
    expect(after.playerPrizes).toHaveLength(1);
  });

  it("the AI values a Metapod Knock Out at 0 Prizes", () => {
    const metapod = inPlay("Metapod");
    const caterpie = inPlay("Caterpie");
    const view = makeState({ player: { active: inPlay("Charmander") }, opponent: { active: metapod, bench: [caterpie] }, tableRules: NO_PRIZE_METAPOD });
    expect(prizesFor(metapod, view)).toBe(0);
    expect(prizesFor(caterpie, view)).toBe(1);
    expect(prizesFor(metapod)).toBe(1);
    // The AI's own view (swapped): its Metapods are free to lose
    const aiView = swapSides(view);
    expect(prizesFor(metapod, aiView)).toBe(0);
  });
});

describe("bonusCards", () => {
  const bonus: BattleModifier = {
    type: "bonusCards",
    side: "player",
    cards: [
      { cardId: "base-set-086-pokemon-flute", qty: 1 },
      { cardId: "base-set-093-gust-of-wind", qty: 1 },
      { cardId: "base-set-084-pluspower", qty: 1 },
    ],
    to: "hand",
  };

  function readyWithBonus(hand = [gameCard("Fire Energy", "base")]): GameState {
    return makeState({
      turnNumber: 0,
      gamePhase: GamePhase.Setup,
      player: { active: inPlay("Charmander"), hand },
      opponent: { active: inPlay("Metapod") },
      setupRules: setupRulesFromModifiers([bonus]),
    });
  }

  it("arrive in the hand at the both-ready transition (never in the deck) and are consumed", () => {
    const state = deepFreeze(readyWithBonus());
    const deckBefore = state.playerDeck.length;
    const started = startPlayingPhase(state, "tails");
    expect(names(started.playerHand)).toEqual(["Fire Energy", "Pokémon Flute", "Gust of Wind", "PlusPower"]);
    expect(started.playerDeck).toHaveLength(deckBefore);
    expect(started.setupRules).toBeUndefined();
    expect(started.events.some((e) => e.message.startsWith("Reglas de la mesa: Pokémon Flute, Gust of Wind, PlusPower"))).toBe(true);
  });

  it("are not dealt before: a mulligan never sees them", () => {
    const base = initializeMultiplayerGame(decks[0], decks[1]);
    const noBasics = deckFromCardEntries([{ cardId: "base-set-098-fire-energy", qty: 20 }], "p1");
    const dealt = startGame({ ...base, playerDeck: noBasics, setupRules: setupRulesFromModifiers([bonus]) }, { prizeCount: 1 });
    const after = doMulligan(dealt, true);
    expect([...after.playerHand, ...after.playerDeck, ...after.playerPrizes].every((c) => c.name === "Fire Energy")).toBe(true);
    expect(after.setupRules?.bonusCards?.player).toHaveLength(3);
  });

  it("follow swapSides", () => {
    const state = readyWithBonus();
    expect(swapSides(state).setupRules?.bonusCards).toEqual({ opponent: state.setupRules!.bonusCards!.player });
  });
});

describe("opponentSetup", () => {
  function preDeal(): GameState {
    const base = initializeMultiplayerGame(decks[0], decks[1]);
    return {
      ...base,
      playerDeck: deckFromCardEntries([{ cardId: "base-set-046-charmander", qty: 4 }, { cardId: "base-set-098-fire-energy", qty: 20 }], "p1"),
      opponentDeck: deckFromCardEntries(METAPOD_DECK, "p2"),
    };
  }

  it("puts the evolved Metapods in play (Caterpie under each) and shrinks the rival's deck by 6", () => {
    const state = deepFreeze(preDeal());
    const placed = placeOpponentSetup(state, METAPOD_SETUP);
    expect(placed.opponentActivePokemon?.pokemon.name).toBe("Metapod");
    expect(names(placed.opponentActivePokemon!.previousEvolutions!)).toEqual(["Caterpie"]);
    expect(placed.opponentActivePokemon!.playedOnTurn).toBe(0);
    expect(placed.opponentBench.map((p) => p.pokemon.name)).toEqual(["Metapod", "Metapod"]);
    expect(placed.opponentBench.every((p) => names(p.previousEvolutions!).join() === "Caterpie")).toBe(true);
    expect(placed.opponentDeck).toHaveLength(34);
    expect(placed.opponentDeck.some((c) => c.name === "Caterpie" || c.name === "Metapod")).toBe(false);
  });

  it("refuses a chain that doesn't evolve by name and a card missing from the deck", () => {
    const state = preDeal();
    expect(() => placeOpponentSetup(state, { active: ["base-set-069-weedle", "base-set-054-metapod"], bench: [] })).toThrow(IllegalActionError);
    expect(() =>
      placeOpponentSetup(state, { active: ["base-set-045-caterpie", "base-set-054-metapod"], bench: [["base-set-045-caterpie", "base-set-054-metapod"], ["base-set-045-caterpie", "base-set-054-metapod"], ["base-set-045-caterpie"]] })
    ).toThrow(/Caterpie/);
  });

  it("the AI's setup only adds to the Bench (nothing illegal)", () => {
    const placed = placeOpponentSetup(preDeal(), METAPOD_SETUP);
    const { opponentActivePokemon, opponentBench } = placed;
    const dealt = startGame(placed, { prizeCount: 1 });
    const setup: GameState = { ...dealt, opponentActivePokemon, opponentBench, gamePhase: GamePhase.Setup, opponentHand: [...dealt.opponentHand, gameCard("Weedle", "base")] };
    const actions = decideOpponentSetup(setup);
    expect(actions.some((a) => a.type === "playBasicToActive")).toBe(false);
    let next = setup;
    for (const action of actions) next = executeAIAction(next, action);
    expect(next.opponentActivePokemon?.pokemon.name).toBe("Metapod");
    expect(next.opponentBench.map((p) => p.pokemon.name)).toEqual(["Metapod", "Metapod", "Weedle"]);
  });
});

describe("prizeCount / openingHand modifiers", () => {
  it("prizeCount { 1, 1 } with prize_minus_one stays at 1", () => {
    const modified = applyBattleModifiersToOptions({ prizeCount: 3, openingHand: 7 }, [{ type: "prizeCount", player: 1, opponent: 1 }]);
    expect(setupOptionsForPassives({ ...modified, playerPassives: ["prize_minus_one"] }).prizeCount).toEqual({ player: 1, opponent: 1 });
  });

  it("openingHand per side, a side it omits keeps the rules' value", () => {
    expect(applyBattleModifiersToOptions({ prizeCount: 3, openingHand: 7 }, [{ type: "openingHand", opponent: 9 }]).openingHand).toEqual({ player: 7, opponent: 9 });
  });

  it("tableRulesFromModifiers / setupRulesFromModifiers are undefined without such modifiers", () => {
    expect(tableRulesFromModifiers([])).toBeUndefined();
    expect(setupRulesFromModifiers([{ type: "prizeCount", player: 1 }])).toBeUndefined();
    expect(tableRulesFromModifiers([{ type: "noPrizeFor", side: "opponent", names: ["Metapod"] }])).toEqual(NO_PRIZE_METAPOD);
  });
});

describe("the AI executor keeps per-side rules on its attack view", () => {
  it("Transparent Walls on the human's Bench holds against the AI's Selfdestruct", () => {
    const magnemite = armedFor(inPlay("Magnemite"), "Autodestrucción");
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      player: { active: inPlay("Onix"), bench: [inPlay("Rattata")] },
      opponent: { active: magnemite, bench: [inPlay("Pidgey")] },
      benchProtectedUntilTurn: { player: 4 },
    });
    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(magnemite, "Autodestrucción") });
    expect(after.playerBench[0].currentDamage ?? 0).toBe(0);
    expect(after.opponentActivePokemon?.pokemon.name).toBe("Pidgey");
    expect(after.opponentActivePokemon?.currentDamage).toBe(10);
  });
});
