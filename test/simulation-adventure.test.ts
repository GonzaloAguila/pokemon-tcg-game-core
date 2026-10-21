import { describe, expect, it } from "vitest";
import { policyPair, runAdventureBatch, adventurePairings, type AdventureContentLike } from "../src/domain/simulation";

/** A 2-battle adventure: a plain battle and one with every modifier type. */
const FIXTURE: AdventureContentLike = {
  id: "fixture",
  rules: { prizeCount: 3, openingHand: 7 },
  starters: [
    {
      id: "charmander",
      deck: [
        { cardId: "base-set-046-charmander", qty: 4 },
        { cardId: "base-set-024-charmeleon", qty: 2 },
        { cardId: "base-set-061-rattata", qty: 2 },
        { cardId: "base-set-094-potion", qty: 2 },
        { cardId: "base-set-091-bill", qty: 2 },
        { cardId: "base-set-095-switch", qty: 1 },
        { cardId: "base-set-098-fire-energy", qty: 11 },
      ],
    },
  ],
  battles: [
    {
      index: 1,
      id: "plain",
      opponent: {
        name: "Lucas",
        deckByDifficulty: {
          normal: [
            { cardId: "base-set-061-rattata", qty: 4 },
            { cardId: "base-set-057-pidgey", qty: 3 },
            { cardId: "base-set-094-potion", qty: 1 },
            { cardId: "base-set-097-fighting-energy", qty: 12 },
          ],
          hard: {
            byStarter: {
              charmander: [
                { cardId: "base-set-063-squirtle", qty: 4 },
                { cardId: "base-set-042-wartortle", qty: 3 },
                { cardId: "base-set-102-water-energy", qty: 13 },
              ],
            },
          },
        },
      },
      modifiers: [],
    },
    {
      index: 2,
      id: "modifiers",
      opponent: {
        name: "Teo",
        deck: [
          { cardId: "base-set-045-caterpie", qty: 3 },
          { cardId: "base-set-054-metapod", qty: 4 },
          { cardId: "base-set-094-potion", qty: 4 },
          { cardId: "base-set-090-super-potion", qty: 3 },
          { cardId: "base-set-099-grass-energy", qty: 16 },
        ],
      },
      modifiers: [
        { type: "prizeCount", player: 1, opponent: 1 },
        { type: "openingHand", opponent: 8 },
        { type: "noPrizeFor", side: "opponent", names: ["Metapod"] },
        { type: "opponentSetup", active: ["base-set-045-caterpie", "base-set-054-metapod"], bench: [["base-set-045-caterpie", "base-set-054-metapod"]] },
        {
          type: "bonusCards",
          side: "player",
          cards: [
            { cardId: "base-set-086-pokemon-flute", qty: 1 },
            { cardId: "base-set-093-gust-of-wind", qty: 1 },
            { cardId: "base-set-084-pluspower", qty: 1 },
          ],
          to: "hand",
        },
        { type: "opponentPassives", passives: ["start_attached_energy"] },
      ],
    },
  ],
};

describe("simulator: adventure battles", () => {
  it("lists every starter × battle, battle 10-style hard decks included", () => {
    expect(adventurePairings(FIXTURE)).toEqual([
      { starterId: "charmander", battleIndex: 1, difficulty: "normal" },
      { starterId: "charmander", battleIndex: 1, difficulty: "hard" },
      { starterId: "charmander", battleIndex: 2, difficulty: "normal" },
    ]);
  });

  it("plays 10 games per pairing with 0 failures and reports per-battle stats", () => {
    const results = runAdventureBatch({ content: FIXTURE, games: 10, seed: 1, policies: () => policyPair("greedy"), checkMutation: true });
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result.failures, JSON.stringify(result.failures[0] ?? null)).toEqual([]);
      expect(Object.values(result.reasons).reduce((a, b) => a + b, 0)).toBe(10);
      expect(result.wins).toBeGreaterThanOrEqual(0);
      expect(result.averageTurns).toBeGreaterThan(0);
    }
  }, 300_000);

  it("random policies too (the starter's side plays random legal moves)", () => {
    const results = runAdventureBatch({ content: FIXTURE, games: 5, seed: 11, policies: () => policyPair("random:greedy") });
    expect(results.flatMap((r) => r.failures)).toEqual([]);
  }, 300_000);
});
