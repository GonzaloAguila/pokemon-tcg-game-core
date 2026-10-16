/**
 * The smart single-player AI (domain/ai/smart.ts): key decisions, and fair play (its plan
 * never depends on hidden information or on future coin results).
 */
import { describe, it, expect } from "vitest";
import {
  choosePromotion,
  decideOpponentPromotion,
  decideOpponentTurn,
  decideOpponentTurnLegacy as decideOpponentLegacyTurnForTest,
  executeAIAction,
  knowledgeView,
  type AIAction,
} from "@/domain/ai";
import { executeAttack, flipAttackCoins, getAttackCoinPlan, type GameCard, type GameState } from "@/lib/gameState";
import { swapSides } from "@/domain/board";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { createGreedyPolicy, mulberry32, buildRandomDeck, allSetIds, playAIGame, type Policy } from "@/domain/simulation";
import { makeState, inPlay, gameCard, energy, energies, attackIndex, armedFor } from "./helpers/state";

type InPlay = ReturnType<typeof inPlay>;

/** Human = "player", AI = "opponent", the AI's turn. */
function aiTurn(setup: {
  ai: InPlay;
  human: InPlay;
  aiBench?: InPlay[];
  humanBench?: InPlay[];
  aiHand?: GameCard[];
  humanPrizes?: number;
  aiPrizes?: number;
}): GameState {
  return makeState({
    isPlayerTurn: false,
    player: {
      active: setup.human,
      bench: setup.humanBench ?? [],
      prizes: setup.humanPrizes !== undefined ? energies(...Array(setup.humanPrizes).fill(EnergyType.Water)) : undefined,
    },
    opponent: {
      active: setup.ai,
      bench: setup.aiBench ?? [],
      hand: setup.aiHand ?? [],
      prizes: setup.aiPrizes !== undefined ? energies(...Array(setup.aiPrizes).fill(EnergyType.Water)) : undefined,
    },
  });
}

const attackOf = (plan: AIAction[]) => plan.find((a): a is Extract<AIAction, { type: "attack" }> => a.type === "attack");
const trainersOf = (plan: AIAction[]) => plan.filter((a): a is Extract<AIAction, { type: "playTrainer" }> => a.type === "playTrainer");

/** Run a plan on the consumer's state, like the frontend loop. */
const run = (state: GameState, plan: AIAction[]) => plan.reduce(executeAIAction, state);

describe("smart AI: Energy", () => {
  it("attaches by type: a Fire Energy goes to the Benched Charmander, not to the Active Bulbasaur that can't use it", () => {
    const bulbasaur = inPlay("Bulbasaur", { set: "base" });
    const charmander = inPlay("Charmander", { set: "base" });
    const fire = energy(EnergyType.Fire);
    const state = aiTurn({ ai: bulbasaur, human: inPlay("Machop", { set: "base" }), aiBench: [charmander], aiHand: [fire] });
    const attach = decideOpponentTurn(state).find((a) => a.type === "attachEnergy");
    expect(attach).toEqual(expect.objectContaining({ energyCardId: fire.id, targetPokemonId: charmander.pokemon.id }));
    // The old AI gave it to the Active because it was missing Energy
    const legacy = decideOpponentLegacyTurnForTest(state).find((a) => a.type === "attachEnergy");
    expect(legacy).toEqual(expect.objectContaining({ targetPokemonId: bulbasaur.pokemon.id }));
  });

  it("powers up the Active it is building when the Energy completes its attack", () => {
    const charmander = inPlay("Charmander", { set: "base", energy: [EnergyType.Fire] });
    const water = energy(EnergyType.Water);
    const state = aiTurn({ ai: charmander, human: inPlay("Bulbasaur", { set: "base" }), aiBench: [inPlay("Squirtle", { set: "base" })], aiHand: [water] });
    const plan = decideOpponentTurn(state);
    // Water pays Ember's Colorless: Ember (30, doubled by Bulbasaur's Weakness) Knocks it Out now
    expect(plan.find((a) => a.type === "attachEnergy")).toEqual(expect.objectContaining({ targetPokemonId: charmander.pokemon.id }));
    expect(attackOf(plan)?.attackIndex).toBe(attackIndex(charmander, "Ascuas"));
  });
});

describe("smart AI: attacks", () => {
  it("picks the Knock Out that Weakness gives it, without paying Flamethrower's discard", () => {
    const charmeleon = inPlay("Charmeleon", { set: "base", energy: [EnergyType.Fire, EnergyType.Fire, EnergyType.Fire] });
    // Slash does 30, 60 against Bulbasaur's Fire Weakness: a Knock Out (40 HP)
    const state = aiTurn({ ai: charmeleon, human: inPlay("Bulbasaur", { set: "base" }), humanBench: [inPlay("Machop", { set: "base" })] });
    const plan = decideOpponentTurn(state);
    expect(attackOf(plan)?.attackIndex).toBe(attackIndex(charmeleon, "Cuchillada"));
    const after = run(state, plan);
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentActivePokemon!.attachedEnergy).toHaveLength(3);
  });

  it("still attacks a Pokémon whose owner may answer mid-attack (Flee): the attack waits for the human's answer", () => {
    const machop = inPlay("Machop", { set: "base", energy: [EnergyType.Fighting] });
    const state = aiTurn({ ai: machop, human: inPlay("Misty's Tentacruel", { set: "gym-heroes" }), humanBench: [inPlay("Abra", { set: "base" })] });
    const plan = decideOpponentTurn(state);
    expect(attackOf(plan)?.attackIndex).toBe(attackIndex(machop, "Patada baja"));
    const after = run(state, plan);
    expect(after.pendingAttackChoice?.reaction).toBeDefined();
    expect(after.pendingAttackChoice?.step.chooser).toBe("opponent");
  });

  it("doesn't hand over the last Prize: no Selfdestruct when its own Knock Out loses the game", () => {
    const magneton = inPlay("Magneton", { set: "base", energy: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning] });
    const state = aiTurn({ ai: magneton, human: inPlay("Machop", { set: "base" }), humanBench: [inPlay("Rattata", { set: "base" })], humanPrizes: 1, aiPrizes: 3 });
    const plan = decideOpponentTurn(state);
    expect(attackOf(plan)?.attackIndex).toBe(attackIndex(magneton, "Onda Trueno"));
    // The old AI took the Knock Out and lost
    expect(attackOf(decideOpponentLegacyTurnForTest(state))?.attackIndex).toBe(attackIndex(magneton, "Autodestrucción"));
  });
});

describe("smart AI: retreat and Switch", () => {
  it("plays Switch to get a Paralyzed Active out and attacks with the Benched attacker", () => {
    const rattata = inPlay("Rattata", { set: "base", statuses: [StatusCondition.Paralyzed], paralyzedOnTurn: 2 });
    const electabuzz = inPlay("Electabuzz", { set: "base", energy: [EnergyType.Lightning, EnergyType.Lightning] });
    const switchCard = gameCard("Switch", "base");
    const state = aiTurn({ ai: rattata, human: inPlay("Squirtle", { set: "base" }), aiBench: [electabuzz], aiHand: [switchCard] });
    const plan = decideOpponentTurn(state);
    expect(trainersOf(plan)).toEqual([expect.objectContaining({ trainerName: "Switch", selections: [[electabuzz.pokemon.id]] })]);
    expect(attackOf(plan)).toBeDefined();
    expect(run(state, plan).opponentActivePokemon!.pokemon.name).toBe("Electabuzz");
  });

  it("retreats an Active that would be Knocked Out and attacks with a powered Benched Pokémon", () => {
    // Magneton: 10 HP left, Machop's Low Kick does 40 to it (Weakness); Thunder Wave is 1 Energy short
    const magneton = inPlay("Magneton", { set: "base", damage: 50, energy: [EnergyType.Lightning, EnergyType.Lightning] });
    const electabuzz = inPlay("Electabuzz", { set: "base", energy: [EnergyType.Lightning, EnergyType.Lightning] });
    const state = aiTurn({ ai: magneton, human: inPlay("Machop", { set: "base", energy: [EnergyType.Fighting] }), aiBench: [electabuzz] });
    const plan = decideOpponentTurn(state);
    expect(plan[0]).toEqual(expect.objectContaining({ type: "retreat", benchIndex: 0 }));
    expect(attackOf(plan)).toBeDefined();
    const after = run(state, plan);
    expect(after.opponentBench.map((p) => p.pokemon.name)).toContain("Magneton");
    expect(after.playerActivePokemon!.currentDamage).toBeGreaterThan(0);
  });
});

describe("smart AI: Gust of Wind and Energy Removal", () => {
  it("gusts up a Benched Pokémon it can Knock Out", () => {
    const electabuzz = inPlay("Electabuzz", { set: "base", energy: [EnergyType.Lightning, EnergyType.Lightning] });
    const squirtle = inPlay("Squirtle", { set: "base" });
    const gust = gameCard("Gust of Wind", "base");
    const state = aiTurn({ ai: electabuzz, human: inPlay("Onix", { set: "base" }), humanBench: [inPlay("Machop", { set: "base" }), squirtle], aiHand: [gust] });
    const plan = decideOpponentTurn(state);
    expect(trainersOf(plan)).toEqual([expect.objectContaining({ trainerName: "Gust of Wind", selections: [[squirtle.pokemon.id]] })]);
    const after = run(state, plan);
    expect(after.playerDiscard.some((c) => c.name === "Squirtle")).toBe(true);
  });

  it("removes the Energy that would let the Defending Pokémon Knock Out its Active", () => {
    // Machop needs its Fighting Energy for Low Kick (40 to Magneton: Weakness); the AI's Magneton has 30 HP left
    const machop = inPlay("Machop", { set: "base", energy: [EnergyType.Fighting] });
    const magneton = inPlay("Magneton", { set: "base", damage: 30, energy: [EnergyType.Lightning] });
    const removal = gameCard("Energy Removal", "base");
    const state = aiTurn({ ai: magneton, human: machop, aiHand: [removal] });
    const plan = decideOpponentTurn(state);
    expect(trainersOf(plan)).toEqual([expect.objectContaining({ trainerName: "Energy Removal", selections: [[machop.attachedEnergy[0].id]] })]);
  });
});

describe("smart AI: promotion", () => {
  it("promotes the Pokémon that can fight, not the first one of the Bench", () => {
    const weak = inPlay("Rattata", { set: "base", damage: 20 });
    const electabuzz = inPlay("Electabuzz", { set: "base", energy: [EnergyType.Lightning, EnergyType.Lightning] });
    const view = makeState({ player: { active: null, bench: [weak, electabuzz] }, opponent: { active: inPlay("Squirtle", { set: "base" }) } });
    expect(choosePromotion(knowledgeView(view), true)).toBe(1);
  });

  it("the engine's automatic promotion (single-player: the human Knocks Out the AI's Active) uses it", () => {
    const machop = armedFor(inPlay("Machop", { set: "base" }), "Patada baja");
    const weak = inPlay("Rattata", { set: "base", damage: 20 });
    const electabuzz = inPlay("Electabuzz", { set: "base", energy: [EnergyType.Lightning, EnergyType.Lightning] });
    // Human's turn: Low Kick Knocks Out the AI's 20-HP-left Pikachu
    const state = makeState({
      player: { active: machop },
      opponent: { active: inPlay("Pikachu", { set: "base", damage: 30 }), bench: [weak, electabuzz] },
    });
    const index = attackIndex(machop, "Patada baja");
    const after = executeAttack(state, index, { coinResults: flipAttackCoins(getAttackCoinPlan(state, index), () => "heads") });
    expect(after.opponentActivePokemon!.pokemon.name).toBe("Electabuzz");
    expect(decideOpponentPromotion({ ...state, opponentActivePokemon: null })).toBe(1);
  });
});

// ============================================================================
// Fair play
// ============================================================================

/** The same game with every hidden card moved around / replaced (what the AI must not see). */
function shuffleHiddenInfo(state: GameState, seed: number): GameState {
  const rng = mulberry32(seed);
  const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  // The AI ("opponent") knows its deck + Prizes as a whole, not their order nor which are Prizes
  const unknown = shuffle([...state.opponentDeck, ...state.opponentPrizes]);
  // The human's hand, deck and Prizes are replaced by other cards (same counts)
  const filler = (count: number) => Array.from({ length: count }, (_, i) => (i % 2 ? gameCard("Gust of Wind", "base") : energy(EnergyType.Fighting)));
  return {
    ...state,
    opponentDeck: unknown.slice(0, state.opponentDeck.length),
    opponentPrizes: unknown.slice(state.opponentDeck.length),
    playerHand: filler(state.playerHand.length),
    playerDeck: shuffle(filler(state.playerDeck.length)),
    playerPrizes: filler(state.playerPrizes.length),
  };
}

/** Plans of the AI at the start of each of its turns in a few simulated games (consumer perspective). */
function collectAiTurns(games: number): GameState[] {
  const states: GameState[] = [];
  for (let seed = 1; seed <= games; seed++) {
    const rng = mulberry32(seed);
    const smart = createGreedyPolicy("smart");
    const recorder: Policy = {
      ...smart,
      nextAction(view, r, n) {
        // view: the AI as "player"; the AI plays as "opponent" in single-player
        if (n === 0 && !view.prizesFaceUp) states.push(swapSides(view));
        return smart.nextAction(view, r, n);
      },
    };
    playAIGame(buildRandomDeck(rng, allSetIds()), buildRandomDeck(rng, allSetIds()), { rng, policyA: recorder, policyB: createGreedyPolicy("legacy") });
  }
  return states;
}

describe("smart AI: fair play", () => {
  it("plans the same turn whatever the hidden cards are and whatever the coins will be", () => {
    // Seeded random decks (their pool follows the playable Trainers): enough games for 20+ turns
    const states = collectAiTurns(5);
    expect(states.length).toBeGreaterThan(20);
    for (const state of states) {
      const plan = decideOpponentTurn(state);
      const random = Math.random;
      try {
        // Another hidden layout, and another random sequence for the engine (shuffles, coins)
        const rng = mulberry32(99);
        Math.random = rng;
        expect(decideOpponentTurn(shuffleHiddenInfo(state, 7))).toEqual(plan);
        Math.random = mulberry32(12345);
        expect(decideOpponentTurn(shuffleHiddenInfo(state, 8))).toEqual(plan);
      } finally {
        Math.random = random;
      }
    }
  });

  it("the knowledge view hides the human's hand, deck and Prizes, and its own deck order / Prizes", () => {
    const state = aiTurn({
      ai: inPlay("Electabuzz", { set: "base" }),
      human: inPlay("Machop", { set: "base" }),
      aiHand: [energy(EnergyType.Lightning)],
    });
    const human = { ...state, playerHand: [gameCard("Gust of Wind", "base")] };
    const view = knowledgeView(swapSides(human));
    expect(view.opponentHand.map((c) => c.name)).toEqual(["Carta oculta"]);
    expect(view.opponentDeck.every((c) => c.name === "Carta oculta")).toBe(true);
    expect(view.opponentPrizes.every((c) => c.name === "Carta oculta")).toBe(true);
    expect(view.playerHand).toEqual(human.opponentHand);
    // Deck + Prizes keep their cards (the decklist is known), in a canonical order
    const ids = (cards: GameCard[]) => cards.map((c) => c.id).sort();
    expect(ids([...view.playerDeck, ...view.playerPrizes])).toEqual(ids([...human.opponentDeck, ...human.opponentPrizes]));
    expect(knowledgeView(swapSides(shuffleHiddenInfo(human, 3)))).toEqual(view);
  });
});
