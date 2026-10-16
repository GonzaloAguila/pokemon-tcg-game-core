/**
 * The AI with Gym Heroes: it plays a Stadium that helps it (never replacing its own Stadium with a
 * worse one), pays No Removal Gym's cost for Energy Removal only with cards it can spare, and
 * answers the attack choices of Gym Heroes sensibly (answerAttackChoiceForAI: its own attack's
 * choices — Fairy Power, Magic Pollen, Sleight of Hand, ESP, Charity — and, as the defender,
 * Flee, Bench Guard and a forced switch).
 */
import { describe, it, expect } from "vitest";
import { answerAttackChoiceForAI, decideOpponentTurn, executeAIAction, stadiumValue, type AIAction } from "@/domain/ai";
import { executeAttack, resolveAttackChoice, type GameCard, type GameState, type PokemonInPlay } from "@/lib/gameState";
import { swapSides } from "@/domain/board";
import { attachTrainer } from "@/domain/trainers/attached";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, armedFor, attackIndex, energies } from "./helpers/state";

const { Psychic, Fighting, Fire, Lightning } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const gym = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-heroes", ...opts });
const card = (name: string) => gameCard(name, "gym-heroes");
type Side = { active: PokemonInPlay; bench?: PokemonInPlay[]; hand?: GameCard[] };

/** Human = "player", AI = "opponent", the AI's turn (the consumer's view). */
function aiTurn(ai: Side, human: Side, stadium?: { card: GameCard; playedBy: "player" | "opponent" }): GameState {
  const state = makeState({
    isPlayerTurn: false,
    player: { active: human.active, bench: human.bench ?? [], hand: human.hand ?? [] },
    opponent: { active: ai.active, bench: ai.bench ?? [], hand: ai.hand ?? [] },
  });
  return stadium ? { ...state, stadium } : state;
}
const trainersOf = (plan: AIAction[]) => plan.filter((a) => a.type === "playTrainer");
const playsTrainer = (plan: AIAction[], name: string) => trainersOf(plan).some((a) => a.type === "playTrainer" && a.trainerName === name);

/** The attacking side ("player") attacks by name with these coins, without ending the turn. */
function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });

// ============================================================================
// Stadiums
// ============================================================================

describe("Stadiums", () => {
  it("plays Pewter City Gym when it has Brock's Pokémon and the human has none (alone: the turn is planned again)", () => {
    const pewter = card("Pewter City Gym");
    const state = aiTurn({ active: gym("Brock's Onix"), bench: [gym("Brock's Geodude")], hand: [pewter] }, { active: inPlay("Pikachu") });
    const plan = decideOpponentTurn(state);
    expect(plan).toEqual([expect.objectContaining({ type: "playTrainer", trainerName: "Pewter City Gym" })]);
    const after = executeAIAction(state, plan[0]);
    expect(after.stadium?.card.name).toBe("Pewter City Gym");
    expect(after.stadium?.playedBy).toBe("opponent");
  });

  it("never plays a Stadium that only helps the human (Cerulean City Gym vs Misty's Pokémon)", () => {
    const cerulean = card("Cerulean City Gym");
    const state = aiTurn({ active: inPlay("Machop"), hand: [cerulean] }, { active: gym("Misty's Seadra"), bench: [gym("Misty's Tentacruel")] });
    expect(playsTrainer(decideOpponentTurn(state), "Cerulean City Gym")).toBe(false);
  });

  it("never replaces its own Stadium with a worse one, but replaces the human's harmful one", () => {
    const vermilion = card("Vermilion City Gym");
    const pewter = card("Pewter City Gym");
    // Its own Pewter City Gym helps 2 Brock's Pokémon; Vermilion City Gym would help 1 Lt. Surge's Pokémon
    const ai = { active: gym("Brock's Onix"), bench: [gym("Brock's Geodude"), gym("Lt. Surge's Pikachu")], hand: [vermilion] };
    const own = aiTurn(ai, { active: inPlay("Pikachu") }, { card: pewter, playedBy: "opponent" });
    expect(playsTrainer(decideOpponentTurn(own), "Vermilion City Gym")).toBe(false);
    // The human's Pewter City Gym, with the human's Brock's Pokémon: replaced
    const theirs = aiTurn(
      { active: gym("Lt. Surge's Pikachu"), hand: [vermilion] },
      { active: gym("Brock's Onix"), bench: [gym("Brock's Geodude")] },
      { card: pewter, playedBy: "player" }
    );
    expect(playsTrainer(decideOpponentTurn(theirs), "Vermilion City Gym")).toBe(true);
  });

  it("values each Stadium by its rule on the AI's view (AI = player)", () => {
    const view = swapSides(aiTurn({ active: gym("Brock's Onix"), bench: [gym("Lt. Surge's Pikachu")] }, { active: gym("Misty's Seadra"), bench: [gym("Misty's Tentacruel")] }));
    expect(stadiumValue(view, card("Pewter City Gym"))).toBeGreaterThan(0);
    expect(stadiumValue(view, card("Vermilion City Gym"))).toBeGreaterThan(0);
    expect(stadiumValue(view, card("Cerulean City Gym"))).toBeLessThan(0);
  });

  it("plays Narrow Gym when the human's Bench is over 4 and its own isn't; the human must trim", () => {
    const narrow = card("Narrow Gym");
    const humanBench = ["Abra", "Machop", "Pikachu", "Rattata", "Squirtle"].map((n) => inPlay(n));
    const state = aiTurn({ active: inPlay("Onix"), bench: [inPlay("Geodude")], hand: [narrow] }, { active: inPlay("Machop"), bench: humanBench });
    const plan = decideOpponentTurn(state);
    expect(plan).toEqual([expect.objectContaining({ trainerName: "Narrow Gym" })]);
    const after = executeAIAction(state, plan[0]);
    expect(after.pendingBenchTrim?.[0]).toEqual(expect.objectContaining({ side: "player", keep: 4 }));
  });

  it("doesn't play Narrow Gym when its own Bench is the one over 4", () => {
    const narrow = card("Narrow Gym");
    const aiBench = ["Abra", "Machop", "Pikachu", "Rattata", "Squirtle"].map((n) => inPlay(n));
    const state = aiTurn({ active: inPlay("Onix"), bench: aiBench, hand: [narrow] }, { active: inPlay("Machop") });
    expect(playsTrainer(decideOpponentTurn(state), "Narrow Gym")).toBe(false);
  });
});

// ============================================================================
// No Removal Gym
// ============================================================================

describe("No Removal Gym and Energy Removal", () => {
  // The existing smart-AI case: Machop needs its Fighting Energy for Low Kick (40 to Magneton:
  // Weakness); the AI's Magneton has 30 HP left — removing it is worth a lot
  const setup = (hand: GameCard[]) => {
    const machop = inPlay("Machop", { set: "base", energy: [Fighting] });
    const magneton = inPlay("Magneton", { set: "base", damage: 30, energy: [Lightning] });
    const noRemoval = { card: card("No Removal Gym"), playedBy: "player" as const };
    return { machop, state: aiTurn({ active: magneton, hand }, { active: machop }, noRemoval) };
  };

  it("never plays Energy Removal when it can't pay the 2 extra cards", () => {
    const removal = gameCard("Energy Removal", "base");
    const { state } = setup([removal, gameCard("Computer Search", "base")]);
    expect(playsTrainer(decideOpponentTurn(state), "Energy Removal")).toBe(false);
  });

  it("pays with 2 cards it can spare (lowest value) and removes the Energy", () => {
    const removal = gameCard("Energy Removal", "base");
    const spare = [card("Charity"), gameCard("Challenge!", "rocket")];
    const { state, machop } = setup([removal, ...spare]);
    const plan = decideOpponentTurn(state);
    const played = trainersOf(plan).find((a) => a.type === "playTrainer" && a.trainerName === "Energy Removal");
    expect(played).toEqual(expect.objectContaining({ selections: [expect.arrayContaining(spare.map((c) => c.id)), [machop.attachedEnergy[0].id]] }));
  });
});

// ============================================================================
// Attack choices (answerAttackChoiceForAI on the attacking side's view)
// ============================================================================

describe("its own attack's choices", () => {
  it("Fairy Power returns only a Pokémon about to be Knocked Out (none when all are healthy)", () => {
    const abra = inPlay("Abra", { damage: 20 });
    const machop = inPlay("Machop");
    const paused = attack(vs(gym("Erika's Clefable"), inPlay("Onix"), { player: { bench: [abra, machop] } }), "Poder Hada", [H]);
    expect(paused.pendingAttackChoice?.step.chooser).toBe("self");
    expect(answerAttackChoiceForAI(paused)).toEqual([abra.pokemon.id]);

    const healthy = attack(vs(gym("Erika's Clefable"), inPlay("Onix"), { player: { bench: [inPlay("Abra"), machop] } }), "Poder Hada", [H]);
    expect(answerAttackChoiceForAI(healthy)).toEqual([]);
  });

  it("Magic Pollen paralyzes; a Paralyzed Defending Pokémon gets Poisoned instead", () => {
    const paused = attack(vs(gym("Erika's Gloom"), inPlay("Onix")), "Polen Mágico", [H]);
    expect(paused.pendingAttackChoice?.effect?.type).toBe("chooseStatus");
    expect(answerAttackChoiceForAI(paused)).toEqual([StatusCondition.Paralyzed]);
    const stuck = attack(vs(gym("Erika's Gloom"), inPlay("Onix", { statuses: [StatusCondition.Paralyzed] })), "Polen Mágico", [H]);
    expect(answerAttackChoiceForAI(stuck)).toEqual([StatusCondition.Poisoned]);
  });

  it("Sleight of Hand puts back only cards of little value and takes the Energy its attacks need", () => {
    const challenge = gameCard("Challenge!", "rocket");
    const mime = gym("Sabrina's Mr. Mime");
    const evolution = gameCard("Machoke", "base");
    const deck = [...energies(Fire, Fire, Psychic, Fire), gameCard("Bill", "base")];
    const state = vs(mime, inPlay("Onix"), { player: { hand: [challenge, evolution], bench: [inPlay("Machop")], deck } });
    const paused = attack(state, "Juego de Manos");
    expect(paused.pendingAttackChoice?.step.source).toBe("hand");
    expect(answerAttackChoiceForAI(paused)).toEqual([challenge.id]);
    const second = resolveAttackChoice(paused, [challenge.id], { skipEndTurn: true });
    const psychic = deck.find((c) => c.name === "Psychic Energy")!;
    expect(answerAttackChoiceForAI(second)).toEqual([psychic.id]);
  });

  it("Sabrina's ESP re-flips fewer than half heads; Charity reduces nothing", () => {
    const esp = gameCard("Sabrina's ESP", "gym-heroes");
    const haunter = attachTrainer(gym("Sabrina's Haunter", { energy: [Psychic, Psychic] }), esp, "endOfTurn");
    const state = vs(haunter, inPlay("Onix"), { player: { bench: [gym("Sabrina's Gastly")] } });
    expect(answerAttackChoiceForAI(attack(state, "Espíritus Nocturnos", [T, T]))).toEqual(["reflip"]);
    expect(answerAttackChoiceForAI(attack(state, "Espíritus Nocturnos", [H, T]))).toEqual(["keep"]);

    const charity = attachTrainer(inPlay("Machop", { energy: [Fighting] }), gameCard("Charity", "gym-heroes"), "endOfTurn");
    const asked = attack(vs(charity, inPlay("Onix")), "Patada baja");
    expect(asked.pendingAttackChoice?.reaction?.answers).toBe("charityReduction");
    expect(answerAttackChoiceForAI(asked)).toEqual(["0"]);
  });
});

describe("as the defender (the other side attacked)", () => {
  it("Flee: switches a Tentacruel left Poisoned or low for the Pokémon that fights best; stays when barely hurt", () => {
    const rattata = inPlay("Rattata");
    const electabuzz = inPlay("Electabuzz", { energy: [Lightning, Lightning] });
    // Nidoking's Toxic: 20 damage and Poisoned
    const toxic = attack(vs(inPlay("Nidoking"), gym("Misty's Tentacruel"), { opponent: { bench: [rattata, electabuzz] } }), "Tóxico");
    expect(toxic.pendingAttackChoice?.reaction?.answers).toBe("flee");
    expect(answerAttackChoiceForAI(toxic)).toEqual([electabuzz.pokemon.id]);
    // Machop's Low Kick: 20 damage, 50 HP left, nothing else
    const kick = attack(vs(inPlay("Machop"), gym("Misty's Tentacruel"), { opponent: { bench: [rattata, electabuzz] } }), "Patada baja");
    expect(kick.pendingAttackChoice?.reaction?.answers).toBe("flee");
    expect(answerAttackChoiceForAI(kick)).toEqual([]);
  });

  it("Bench Guard: the healthy guard takes the damage for the weakest first; a worn-out guard takes none", () => {
    const abra = inPlay("Abra", { damage: 10 });
    const machop = inPlay("Machop");
    const paused = attack(vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Onix"), { opponent: { bench: [machop, gym("Brock's Rhydon"), abra] } }), "Vapor Venenoso");
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("benchGuard");
    expect(answerAttackChoiceForAI(paused)).toEqual([abra.pokemon.id, machop.pokemon.id]);
    const worn = attack(
      vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Onix"), { opponent: { bench: [machop, gym("Brock's Rhydon", { damage: 50 }), abra] } }),
      "Vapor Venenoso"
    );
    expect(answerAttackChoiceForAI(worn)).toEqual([]);
  });

  it("a forced switch it chooses (Terror Strike) brings up the Pokémon that fights best, not the first one", () => {
    const rattata = inPlay("Rattata", { damage: 20 });
    const electabuzz = inPlay("Electabuzz", { energy: [Lightning, Lightning] });
    const paused = attack(vs(inPlay("Arbok", { set: "fossil" }), inPlay("Machamp"), { opponent: { bench: [rattata, electabuzz] } }), "Golpe Terrorífico", [H]);
    expect(paused.pendingAttackChoice?.step.chooser).toBe("opponent");
    expect(answerAttackChoiceForAI(paused)).toEqual([electabuzz.pokemon.id]);
  });
});

