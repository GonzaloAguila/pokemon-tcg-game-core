import { describe, expect, it } from "vitest";
import {
  checkKnockouts,
  deckFromCardEntries,
  decks,
  doMulligan,
  initializeMultiplayerGame,
  processBenchKnockouts,
  startGame,
  takePrize,
  validateDeckEntries,
  isAdventureCardAllowed,
  findCardById,
  swapSides,
  type CardEntry,
  type GameState,
} from "../src";
import { IllegalActionError } from "../src/shared/errors";
import { deepFreeze, gameCard, inPlay, makeState } from "./helpers/state";

const CHARMANDER_STARTER: CardEntry[] = [
  { cardId: "base-set-046-charmander", qty: 4 },
  { cardId: "base-set-024-charmeleon", qty: 2 },
  { cardId: "base-set-061-rattata", qty: 2 },
  { cardId: "base-set-094-potion", qty: 2 },
  { cardId: "base-set-091-bill", qty: 2 },
  { cardId: "base-set-095-switch", qty: 1 },
  { cardId: "base-set-098-fire-energy", qty: 11 },
];

const BATTLE_1: CardEntry[] = [
  { cardId: "base-set-061-rattata", qty: 4 },
  { cardId: "base-set-057-pidgey", qty: 3 },
  { cardId: "base-set-094-potion", qty: 1 },
  { cardId: "base-set-097-fighting-energy", qty: 12 },
];

/** A MULLIGAN-phase state holding the two card-entry decks (not dealt yet). */
function undealt(player: CardEntry[], opponent: CardEntry[]): GameState {
  const base = initializeMultiplayerGame(decks[0], decks[1]);
  return { ...base, playerDeck: deckFromCardEntries(player, "p1"), opponentDeck: deckFromCardEntries(opponent, "p2") };
}

describe("startGame: per-side Prizes and opening hands", () => {
  it("defaults are unchanged (7 cards, 6 Prizes)", () => {
    const state = startGame(initializeMultiplayerGame(decks[0], decks[1]));
    expect(state.playerHand).toHaveLength(7);
    expect(state.opponentHand).toHaveLength(7);
    expect(state.playerPrizes).toHaveLength(6);
    expect(state.opponentPrizes).toHaveLength(6);
  });

  it("prizeCount 3 and openingHand { player: 8, opponent: 7 }", () => {
    const state = startGame(undealt(CHARMANDER_STARTER, BATTLE_1), { prizeCount: 3, openingHand: { player: 8, opponent: 7 } });
    expect(state.playerHand).toHaveLength(8);
    expect(state.opponentHand).toHaveLength(7);
    expect(state.playerPrizes).toHaveLength(3);
    expect(state.opponentPrizes).toHaveLength(3);
    expect(state.openingHandSize).toEqual({ player: 8, opponent: 7 });
  });

  it("per-side Prizes { player: 2, opponent: 3 }; prizeCount keeps the larger", () => {
    const state = startGame(undealt(CHARMANDER_STARTER, BATTLE_1), { prizeCount: { player: 2, opponent: 3 } });
    expect(state.playerPrizes).toHaveLength(2);
    expect(state.opponentPrizes).toHaveLength(3);
    expect(state.prizeCount).toBe(3);
    expect(state.playerHand.length + state.playerPrizes.length + state.playerDeck.length).toBe(24);
    expect(state.events.some((e) => e.message === "Tú robas 7 cartas y colocas 2 premios")).toBe(true);
    expect(state.events.some((e) => e.message === "Rival roba 7 cartas y coloca 3 premios")).toBe(true);
  });

  it("a 20-card deck deals 7 + 3 and 10 remain", () => {
    const state = startGame(undealt(BATTLE_1, BATTLE_1), { prizeCount: 3 });
    expect(state.opponentHand).toHaveLength(7);
    expect(state.opponentPrizes).toHaveLength(3);
    expect(state.opponentDeck).toHaveLength(10);
  });

  it("doesn't mutate its input", () => {
    const before = deepFreeze(undealt(CHARMANDER_STARTER, BATTLE_1));
    expect(() => startGame(before, { prizeCount: { player: 2, opponent: 3 }, openingHand: 8 })).not.toThrow();
  });
});

describe("doMulligan reads the side's opening hand size", () => {
  const noBasics: CardEntry[] = [
    { cardId: "base-set-094-potion", qty: 4 },
    { cardId: "base-set-098-fire-energy", qty: 16 },
  ];

  it("draws openingHandSize.player cards", () => {
    const dealt = startGame(undealt(noBasics, BATTLE_1), { prizeCount: 3, openingHand: { player: 8, opponent: 7 } });
    const after = doMulligan(dealt, true);
    expect(after.playerHand).toHaveLength(8);
    expect(after.playerHand.length + after.playerDeck.length).toBe(17);
  });

  it("swapSides swaps openingHandSize", () => {
    const dealt = startGame(undealt(CHARMANDER_STARTER, BATTLE_1), { openingHand: { player: 8, opponent: 7 } });
    expect(swapSides(dealt).openingHandSize).toEqual({ player: 7, opponent: 8 });
    expect(swapSides(swapSides(dealt)).openingHandSize).toEqual({ player: 8, opponent: 7 });
  });
});

describe("a side with 2 Prizes wins at its last Prize", () => {
  const twoPrizes = () => [gameCard("Fire Energy", "base"), gameCard("Fire Energy", "base")];

  it("through takePrize", () => {
    const state = makeState({ player: { active: inPlay("Charmander"), prizes: twoPrizes() }, opponent: { active: inPlay("Rattata"), bench: [inPlay("Pidgey")] } });
    const first = takePrize({ ...state, playerCanTakePrize: true }, 0, true, false);
    expect(first.gameResult).toBeNull();
    const second = takePrize({ ...first, playerCanTakePrize: true }, 0, true, false);
    expect(second.gameResult).toBe("victory");
    expect(second.playerPrizes).toHaveLength(0);
  });

  it("through a Bench Knock Out (processBenchKnockouts)", () => {
    const state = makeState({
      player: { active: inPlay("Charmander"), prizes: [gameCard("Fire Energy", "base")] },
      opponent: { active: inPlay("Rattata"), bench: [inPlay("Pidgey", { damage: 40 })] },
    });
    expect(processBenchKnockouts(state).gameResult).toBe("victory");
  });

  it("through checkKnockouts", () => {
    const state = makeState({
      player: { active: inPlay("Charmander"), prizes: [gameCard("Fire Energy", "base")] },
      opponent: { active: inPlay("Rattata", { damage: 30 }), bench: [inPlay("Pidgey")] },
    });
    expect(checkKnockouts(state).gameResult).toBe("victory");
  });
});

describe("validateDeckEntries", () => {
  const rules4 = { minSize: 20, maxSize: 40, maxCopies: 4 };
  const noLimit = { minSize: 20, maxSize: 40, maxCopies: null };
  const fire = (qty: number): CardEntry => ({ cardId: "base-set-098-fire-energy", qty });

  it("accepts the starter deck", () => {
    expect(validateDeckEntries(CHARMANDER_STARTER, rules4)).toBeNull();
  });

  it("rejects 19 and 41 cards", () => {
    expect(validateDeckEntries([fire(19)], rules4)).toMatch(/20/);
    expect(validateDeckEntries([fire(41)], rules4)).toMatch(/40/);
  });

  it("counts copies by name across sets (maxCopies 4)", () => {
    const deck = [
      { cardId: "base-set-046-charmander", qty: 3 },
      { cardId: "team-rocket-050-charmander", qty: 2 },
      fire(20),
    ];
    expect(findCardById("team-rocket-050-charmander")?.name).toBe("Charmander");
    expect(validateDeckEntries(deck, rules4)).toMatch(/Charmander/);
  });

  it("limits Double Colorless Energy, not basic Energy", () => {
    expect(validateDeckEntries([{ cardId: "base-set-096-double-colorless-energy", qty: 5 }, fire(20)], rules4)).toMatch(/Double Colorless/);
    expect(validateDeckEntries([fire(30)], rules4)).toBeNull();
  });

  it("maxCopies null = no copy limit (adventure mode)", () => {
    expect(validateDeckEntries([{ cardId: "base-set-046-charmander", qty: 8 }, fire(16)], noLimit)).toBeNull();
  });

  it("rejects unknown ids and quantities below 1", () => {
    expect(validateDeckEntries([{ cardId: "base-set-999-nope", qty: 1 }, fire(20)], rules4)).toMatch(/base-set-999-nope/);
    expect(validateDeckEntries([{ cardId: "base-set-046-charmander", qty: 0 }, fire(20)], rules4)).not.toBeNull();
  });
});

describe("deckFromCardEntries", () => {
  it("builds one instance per copy with unique ids", () => {
    const deck = deckFromCardEntries(CHARMANDER_STARTER, "p1");
    expect(deck).toHaveLength(24);
    expect(new Set(deck.map((c) => c.id)).size).toBe(24);
    expect(deck.filter((c) => c.name === "Charmander")).toHaveLength(4);
    expect(deck.every((c) => c.id.startsWith("p1-"))).toBe(true);
  });

  it("ids don't name the card (masked hands only show ids)", () => {
    const deck = deckFromCardEntries(CHARMANDER_STARTER, "p1");
    expect(deck.some((c) => c.id.includes("charmander") || c.id.includes("Charmander"))).toBe(false);
  });

  it("throws on an unknown id", () => {
    expect(() => deckFromCardEntries([{ cardId: "base-set-999-nope", qty: 1 }])).toThrow(IllegalActionError);
    expect(() => deckFromCardEntries([{ cardId: "base-set-999-nope", qty: 1 }])).toThrow("Carta desconocida: base-set-999-nope");
  });
});

describe("isAdventureCardAllowed", () => {
  it("allows released catalog cards", () => {
    expect(isAdventureCardAllowed(findCardById("base-set-046-charmander")!)).toBe(true);
    expect(isAdventureCardAllowed(findCardById("base-set-086-pokemon-flute")!)).toBe(true);
  });

  it("refuses cards outside the catalog", () => {
    const fake = { ...findCardById("base-set-046-charmander")!, id: "base-set-999-fake" };
    expect(isAdventureCardAllowed(fake)).toBe(false);
  });
});
