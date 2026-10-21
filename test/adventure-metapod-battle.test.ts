/**
 * Battle 7 of Adventure 1 (spec §3.6, "el muro de Metapod"): its real config (rival deck and
 * modifiers from the content fixture) is solvable with every starter. Engine only: the line is
 * scripted on the state createAdventureGame builds, through the both-ready transition (the bonus
 * cards arrive there); the turns in between are the rival's (its AI's choices are not part of the line).
 */
import { describe, expect, it } from "vitest";
import {
  adventureBattleConfig,
  canPlayTrainerCard,
  createAdventureGame,
  createSeededRng,
  decideOpponentTurn,
  endTurn,
  executeAIAction,
  executeAttack,
  playTrainerCard,
  setPlayerReady,
  startPlayingPhase,
  takePrize,
  withRandom,
  type AdventureContentLike,
  type GameCard,
  type GameState,
  type PokemonInPlay,
} from "../src";
import { EnergyType } from "../src/domain/constants";
import adventureJson from "./fixtures/adventure-1.json";
import { armedFor, attackIndex, energy, gameCard, inPlay, names } from "./helpers/state";

const ADVENTURE = adventureJson as unknown as AdventureContentLike;

type Line = { starter: string; attacker: () => PokemonInPlay; attack: string; energyType: EnergyType; plusPower: boolean };

const LINES: Line[] = [
  // Ember 30 x2 (Weakness Fire) = 60; discards a Fire Energy: one attached per turn keeps it armed
  { starter: "charmander", attacker: () => armedFor(inPlay("Charmander", { set: "base" }), "Ascuas"), attack: "Ascuas", energyType: EnergyType.Fire, plusPower: false },
  // Wartortle's Bite 40 (no Weakness to Water)
  { starter: "squirtle", attacker: () => armedFor(inPlay("Wartortle", { set: "base", evolvedFrom: ["Squirtle"] }), "Mordisco"), attack: "Mordisco", energyType: EnergyType.Water, plusPower: false },
  // Ivysaur's Vine Whip 30 + the bonus PlusPower = 40
  { starter: "bulbasaur", attacker: () => armedFor(inPlay("Ivysaur", { set: "base", evolvedFrom: ["Bulbasaur"] }), "Látigo Cepa"), attack: "Látigo Cepa", energyType: EnergyType.Grass, plusPower: true },
];

/**
 * The battle after the both-ready transition: the human's Active is `attacker` (with a backup on
 * the Bench), the rival's preset board as dealt; the human starts (turn 1). `metapodDamage`: damage
 * already on the rival's Active Metapod (earlier turns).
 */
function battleStart(line: Line, metapodDamage: number, seed = 7): GameState {
  return withRandom(createSeededRng(seed).next, () => {
    const created = createAdventureGame(adventureBattleConfig(ADVENTURE, line.starter, 7));
    const ready: GameState = {
      ...created,
      playerActivePokemon: line.attacker(),
      playerBench: [inPlay("Rattata", { set: "base", playedOnTurn: 0 })],
      playerHand: [energy(line.energyType), energy(line.energyType)],
      opponentActivePokemon: { ...created.opponentActivePokemon!, currentDamage: metapodDamage },
    };
    return startPlayingPhase(setPlayerReady(setPlayerReady(ready, true), false), "heads");
  });
}

const card = (state: GameState, name: string): GameCard => {
  const found = state.playerHand.find((c) => c.name === name);
  if (!found) throw new Error(`${name} not in hand: ${names(state.playerHand).join(", ")}`);
  return found;
};

function attack(state: GameState, name: string): GameState {
  const index = attackIndex(state.playerActivePokemon!, name);
  return executeAttack(state, index, { coinResults: [] });
}

/** The rival's turn passes without it doing anything (its own choices are not part of the line). */
function rivalPasses(state: GameState): GameState {
  return state.isPlayerTurn ? state : endTurn(state);
}

function attachFromHand(state: GameState, type: EnergyType): GameState {
  const active = state.playerActivePokemon!;
  const e = state.playerHand.find((c) => c.kind === "energy" && c.name === energy(type).name);
  if (!e) return state;
  return {
    ...state,
    playerHand: state.playerHand.filter((c) => c.id !== e.id),
    playerActivePokemon: { ...active, attachedEnergy: [...active.attachedEnergy, e] },
  };
}

describe("the Metapod battle (battle 7) is solvable with every starter", () => {
  it.each(LINES)("$starter: Metapod Knocked Out (no Prize) → Flute → Gust of Wind → the Caterpie's Knock Out wins", (line) => {
    let state = battleStart(line, 40);
    expect(names(state.playerHand)).toEqual(expect.arrayContaining(["Pokémon Flute", "Gust of Wind", "PlusPower"]));
    expect(state.playerPrizes).toHaveLength(1);
    expect(state.opponentPrizes).toHaveLength(1);

    // Turn 1: Flute refused (no Basic in the rival's discard pile yet); the Active Metapod is Knocked Out
    expect(canPlayTrainerCard(state, card(state, "Pokémon Flute").id)).toBe("No hay Pokémon Básicos en la pila de descartes rival");
    state = attack(state, line.attack);
    expect(state.playerCanTakePrize).toBe(false);
    expect(state.events.some((e) => e.message === "Metapod no da premio en esta mesa")).toBe(true);
    expect(names(state.opponentDiscard)).toEqual(expect.arrayContaining(["Metapod", "Caterpie"]));
    expect(state.opponentActivePokemon?.pokemon.name).toBe("Metapod");
    expect(state.gameResult).toBeNull();

    // The rival's turn, then turn 3: Flute → Gust of Wind → (PlusPower) → the Caterpie's Knock Out
    state = rivalPasses(state);
    expect(state.isPlayerTurn).toBe(true);
    state = attachFromHand(state, line.energyType);
    const caterpie = state.opponentDiscard.find((c) => c.name === "Caterpie")!;
    state = playTrainerCard(state, card(state, "Pokémon Flute").id, [[caterpie.id]]);
    expect(state.opponentBench.map((p) => p.pokemon.name)).toContain("Caterpie");
    state = playTrainerCard(state, card(state, "Gust of Wind").id, [[caterpie.id]]);
    expect(state.opponentActivePokemon?.pokemon.name).toBe("Caterpie");
    if (line.plusPower) state = playTrainerCard(state, card(state, "PlusPower").id, []);
    state = attack(state, line.attack);
    // The last Prize is taken automatically (0.10.1)
    expect(state.playerPrizes).toHaveLength(0);
    expect(state.gameResult).toBe("victory");
  });

  it("Knocking Out the 3 Metapod without the Flute wins by \"no Pokémon\"", () => {
    const line = LINES[0];
    let state = battleStart(line, 40);
    for (let ko = 0; ko < 3; ko++) {
      state = { ...state, opponentActivePokemon: { ...state.opponentActivePokemon!, currentDamage: 40 } };
      state = attack(state, line.attack);
      if (ko < 2) {
        expect(state.gameResult).toBeNull();
        state = attachFromHand(rivalPasses(state), line.energyType);
        state = { ...state, playerHand: [...state.playerHand, energy(line.energyType)] };
      }
    }
    expect(state.gameResult).toBe("victory");
    expect(state.playerPrizes).toHaveLength(1);
  });

  it("left alone, a Caterpie on the rival's Bench is evolved by the AI on its next turn (with a Metapod in its hand)", () => {
    const line = LINES[0];
    let state = attack(battleStart(line, 40), line.attack);
    state = rivalPasses(state);
    const caterpie = state.opponentDiscard.find((c) => c.name === "Caterpie")!;
    state = playTrainerCard(state, card(state, "Pokémon Flute").id, [[caterpie.id]]);
    state = endTurn(state);
    expect(state.isPlayerTurn).toBe(false);
    // The rival's deck as written has all 3 Metapod in play from the start: give it one in the hand
    state = { ...state, opponentHand: [...state.opponentHand, gameCard("Metapod", "base")] };
    for (const action of decideOpponentTurn(state)) {
      if (action.type === "attack" || action.type === "endTurn") break;
      state = executeAIAction(state, action);
    }
    expect(state.opponentBench.find((p) => p.previousEvolutions?.some((c) => c.name === "Caterpie") && p.pokemon.name === "Metapod" && p.playedOnTurn === state.turnNumber)).toBeDefined();
  });
});
