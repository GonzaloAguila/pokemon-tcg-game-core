/**
 * Gym Heroes #116 Recall (printed text, data/pokemontcg/gym1.json): "For your attack this turn,
 * your Active Pokémon can use any attack from its Basic Pokémon card or any Evolution card
 * attached to it. (You still have to pay for that attack's Energy cost.)"
 *
 * Indexing: getAvailableAttacks(state, pokemon) lists the Active's own attacks first (indices
 * 0..n-1, unchanged), then — only while Recall is in effect this turn — the attacks of the cards
 * under it (previousEvolutions order: the Basic first), indices n, n+1, ... Every entry point that
 * takes an attack index (canExecuteAttack, getAttackCoinPlan, executeAttack and the resume of a
 * paused attack) reads the same list.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  canExecuteAttack,
  canPlayTrainerCard,
  endTurn,
  executeAttack,
  flipAttackCoins,
  getAttackChoiceCoinPlan,
  getAttackCoinPlan,
  getAvailableAttacks,
  IllegalActionError,
  playTrainerCard,
  resolveAttackChoice,
  UNSUPPORTED_TRAINERS,
  type GameState,
  type PokemonInPlay,
} from "@/index";
import { swapSides } from "@/domain/board";
import { decideOpponentTurn, executeAIAction } from "@/domain/ai";
import { attachTrainer } from "@/domain/trainers/attached";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, gameCard, names, deepFreeze } from "./helpers/state";

const { Fighting, Water } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const gym = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-heroes", ...opts });
const recall = () => gameCard("Recall", "gym-heroes");
/** Brock's Graveler (Lanzar Roca: F C C, 3 coins × 20) evolved from Brock's Geodude #38 (Placaje: C, 10; Tiro de Suerte: F C, coin, 30 to a Benched Pokémon). */
const graveler = (opts: Parameters<typeof inPlay>[1] = {}) => gym("Brock's Graveler", { evolvedFrom: ["Brock's Geodude"], ...opts });
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
/** Play Recall from the hand (adds the card to the hand first). */
function withRecall(state: GameState): GameState {
  const card = recall();
  return playTrainerCard({ ...state, playerHand: [...state.playerHand, card] }, card.id, []);
}
const PLACAJE = 1;
const TIRO_DE_SUERTE = 2;

afterEach(() => vi.restoreAllMocks());

describe("Recall: the Active may use the attacks of the cards under it this turn", () => {
  it("is a supported Trainer, always playable, discarded, and marks this turn", () => {
    expect(UNSUPPORTED_TRAINERS).not.toContain("Recall");
    const card = recall();
    const state = deepFreeze(vs(graveler({ energy: [Fighting] }), inPlay("Onix"), { player: { hand: [card] } }));
    expect(canPlayTrainerCard(state, card.id)).toBeNull();
    const played = playTrainerCard(state, card.id, []);
    expect(names(played.playerHand)).toEqual([]);
    expect(names(played.playerDiscard)).toEqual(["Recall"]);
    expect(played.recallActiveOnTurn).toBe(state.turnNumber);
    expect(played.events.map((e) => e.message)).toContain("Jugaste Recall");
  });

  it("getAvailableAttacks: own attacks only without Recall; with it, the Basic's attacks follow (indices after the own ones)", () => {
    const state = deepFreeze(vs(graveler(), inPlay("Onix")));
    expect(getAvailableAttacks(state, state.playerActivePokemon!).map((a) => [a.attack.name, a.fromCard, a.index, a.recalled])).toEqual([
      ["Lanzar Roca", "Brock's Graveler", 0, false],
    ]);
    const recalled = withRecall(state);
    expect(getAvailableAttacks(recalled, recalled.playerActivePokemon!).map((a) => [a.attack.name, a.fromCard, a.index, a.recalled])).toEqual([
      ["Lanzar Roca", "Brock's Graveler", 0, false],
      ["Placaje", "Brock's Geodude", 1, true],
      ["Tiro de Suerte", "Brock's Geodude", 2, true],
    ]);
  });

  it("a Stage 2 lists the Basic's attacks, then the Stage 1's", () => {
    const golem = gym("Brock's Golem", { evolvedFrom: ["Brock's Geodude", "Brock's Graveler"] });
    const state = withRecall(vs(golem, inPlay("Onix")));
    const listed = getAvailableAttacks(state, state.playerActivePokemon!);
    const own = listed.filter((a) => !a.recalled);
    expect(listed.filter((a) => a.recalled).map((a) => [a.attack.name, a.fromCard, a.index])).toEqual([
      ["Placaje", "Brock's Geodude", own.length],
      ["Tiro de Suerte", "Brock's Geodude", own.length + 1],
      ["Lanzar Roca", "Brock's Graveler", own.length + 2],
    ]);
  });

  it("after Recall, Brock's Graveler uses Brock's Geodude's Placaje paying its cost (C)", () => {
    const state = deepFreeze(withRecall(vs(graveler({ energy: [Fighting] }), inPlay("Onix"))));
    expect(canExecuteAttack(state, PLACAJE)).toBeNull();
    const done = executeAttack(state, PLACAJE, { coinResults: [], skipEndTurn: true });
    expect(done.opponentActivePokemon!.currentDamage).toBe(10);
    expect(done.attackedThisTurn).toBe(true);
    expect(done.events.map((e) => e.message).some((m) => m.includes("Placaje"))).toBe(true);
  });

  it("a recalled attack still needs its Energy (Spanish reason; executeAttack throws)", () => {
    const state = deepFreeze(withRecall(vs(graveler(), inPlay("Onix"))));
    expect(canExecuteAttack(state, PLACAJE)).toBe("Brock's Graveler no tiene la energía necesaria para Placaje");
    expect(() => executeAttack(state, PLACAJE, { coinResults: [] })).toThrow(IllegalActionError);
  });

  it("without Recall the lower stage's attacks can't be used (Spanish reason; executeAttack throws)", () => {
    const state = deepFreeze(vs(graveler({ energy: [Fighting] }), inPlay("Onix")));
    expect(canExecuteAttack(state, PLACAJE)).toBe("Para usar los ataques de las cartas que Brock's Graveler tiene debajo debes jugar Recall este turno");
    expect(() => executeAttack(state, PLACAJE, { coinResults: [] })).toThrow(IllegalActionError);
    expect(canExecuteAttack(state, 7)).toBe("Ese ataque no existe");
  });

  it("only the Active of the side whose turn it is: not the Defending Pokémon, not a Benched one", () => {
    const state = withRecall(vs(graveler({ energy: [Fighting] }), graveler(), { player: { bench: [graveler()] } }));
    expect(getAvailableAttacks(state, state.opponentActivePokemon!)).toHaveLength(1);
    expect(getAvailableAttacks(state, state.playerBench[0])).toHaveLength(1);
    // The other side's view of the same turn: Recall is still the acting side's (now "opponent")
    const other = swapSides(state);
    expect(getAvailableAttacks(other, other.opponentActivePokemon!)).toHaveLength(3);
    expect(getAvailableAttacks(other, other.playerActivePokemon!)).toHaveLength(1);
  });

  it("applies to whatever Pokémon is Active when attacking (a Switch after Recall)", () => {
    const switchCard = gameCard("Switch", "base");
    const state = withRecall(vs(inPlay("Machop"), inPlay("Onix"), { player: { bench: [graveler({ energy: [Fighting] })], hand: [switchCard] } }));
    const switched = playTrainerCard(state, switchCard.id, [[state.playerBench[0].pokemon.id]]);
    expect(switched.playerActivePokemon!.pokemon.name).toBe("Brock's Graveler");
    expect(canExecuteAttack(switched, PLACAJE)).toBeNull();
  });

  it("ends with the turn: endTurn clears it and the next turns list the own attacks only", () => {
    const state = withRecall(vs(graveler({ energy: [Fighting] }), inPlay("Onix")));
    const ended = endTurn(state);
    expect(ended.recallActiveOnTurn).toBeUndefined();
    // The same player's next turn
    const back = endTurn(swapSides(ended));
    const view = swapSides(back);
    expect(view.isPlayerTurn).toBe(true);
    expect(getAvailableAttacks(view, view.playerActivePokemon!)).toHaveLength(1);
    expect(canExecuteAttack(view, PLACAJE)).not.toBeNull();
  });

  it("a stale mark from an earlier turn does nothing", () => {
    const state = vs(graveler({ energy: [Fighting] }), inPlay("Onix"), { recallActiveOnTurn: 1, turnNumber: 3 });
    expect(getAvailableAttacks(state, state.playerActivePokemon!)).toHaveLength(1);
  });

  it("a transformed Ditto keeps using the Defending Pokémon's attacks (nothing under Ditto, and not the Defending Pokémon's lower stages)", () => {
    const ditto = inPlay("Ditto", { set: "fossil", energy: [Water, Water, Water] });
    const state = deepFreeze(withRecall(vs(ditto, graveler())));
    const listed = getAvailableAttacks(state, state.playerActivePokemon!);
    expect(listed.map((a) => [a.attack.name, a.index, a.recalled])).toEqual([["Lanzar Roca", 0, false]]);
    expect(canExecuteAttack(state, 0)).toBeNull();
    expect(canExecuteAttack(state, 1)).toBe("Ese ataque no existe");
    expect(getAttackCoinPlan(state, 0)).toEqual({ smokescreen: 0, attack: 3, defender: 0 });
    const done = executeAttack(state, 0, { coinResults: [H, H, T], skipEndTurn: true });
    expect(done.opponentActivePokemon!.currentDamage).toBe(40);
  });
});

describe("Recall: coins, and attacks paused mid-way resume the same recalled attack", () => {
  it("a recalled coin attack: getAttackCoinPlan reads the recalled attack (1 coin, Smokescreen first when under it)", () => {
    const opponentBench = [inPlay("Abra")];
    const state = deepFreeze(withRecall(vs(graveler({ energy: [Fighting, Fighting] }), inPlay("Onix"), { opponent: { bench: opponentBench } })));
    expect(getAttackCoinPlan(state, TIRO_DE_SUERTE)).toEqual({ smokescreen: 0, attack: 1, defender: 0 });
    // Lanzar Roca, the Graveler's own attack, still has its 3 coins
    expect(getAttackCoinPlan(state, 0)).toEqual({ smokescreen: 0, attack: 3, defender: 0 });
    const smoked = { ...state, playerActivePokemon: { ...state.playerActivePokemon!, mustFlipToAttack: true } };
    expect(getAttackCoinPlan(smoked, TIRO_DE_SUERTE)).toEqual({ smokescreen: 1, attack: 1, defender: 0 });

    // Heads: 30 to the chosen Benched Pokémon
    const heads = executeAttack(state, TIRO_DE_SUERTE, { coinResults: flipAttackCoins(getAttackCoinPlan(state, TIRO_DE_SUERTE), () => H), skipEndTurn: true });
    const hit = heads.pendingAttackChoice ? resolveAttackChoice(heads, [opponentBench[0].pokemon.id], { skipEndTurn: true }) : heads;
    expect(hit.opponentBench.find((p) => p.pokemon.name === "Abra")?.currentDamage ?? "KO").toBe("KO");
    expect(names(hit.opponentDiscard)).toContain("Abra");
    // Coins that don't fit the recalled attack's plan are refused (3 coins = Lanzar Roca's plan)
    expect(() => executeAttack(state, TIRO_DE_SUERTE, { coinResults: [H, H, H], skipEndTurn: true })).toThrow();
  });

  it("Charity: the pause resumes the recalled attack (Placaje, 10), not the Graveler's own", () => {
    const attacker = attachTrainer(graveler({ energy: [Fighting] }), gameCard("Charity", "gym-heroes"), "endOfTurn");
    const state = deepFreeze(withRecall(vs(attacker, inPlay("Onix"))));
    const paused = executeAttack(state, PLACAJE, { coinResults: [], skipEndTurn: true });
    const reaction = paused.pendingAttackChoice?.reaction;
    expect(reaction?.answers).toBe("charityReduction");
    expect(reaction?.resume).toMatchObject({ kind: "attack", attackIndex: PLACAJE });
    expect(paused.pendingAttackChoice!.step.options.map((o) => o.id)).toEqual(["0", "10"]);
    const done = resolveAttackChoice(deepFreeze(paused), ["0"], { skipEndTurn: true });
    expect(done.opponentActivePokemon!.currentDamage).toBe(10);
    expect(done.attackedThisTurn).toBe(true);
  });

  it("Flee (Misty's Tentacruel): the defender's answer resumes the recalled attack", () => {
    const abra = inPlay("Abra");
    const state = deepFreeze(withRecall(vs(graveler({ energy: [Fighting] }), gym("Misty's Tentacruel"), { opponent: { bench: [abra] } })));
    const paused = executeAttack(state, PLACAJE, { coinResults: [], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("flee");
    expect(paused.pendingAttackChoice?.reaction?.resume).toMatchObject({ kind: "attack", attackIndex: PLACAJE });
    const fled = resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true });
    expect(fled.opponentActivePokemon!.pokemon.name).toBe("Abra");
    expect(fled.opponentBench.find((p) => p.pokemon.name === "Misty's Tentacruel")!.currentDamage).toBe(10);
  });

  it("Sabrina's ESP's re-flip of a recalled coin attack re-flips that attack's 1 coin and resumes it", () => {
    // (ESP attached directly: the engine reads whatever ESP is attached to the attacker)
    const abra = inPlay("Abra");
    const attacker = attachTrainer(graveler({ energy: [Fighting, Fighting] }), gameCard("Sabrina's ESP", "gym-heroes"), "endOfTurn");
    const state = deepFreeze(withRecall(vs(attacker, inPlay("Onix"), { opponent: { bench: [abra] } })));
    const paused = executeAttack(state, TIRO_DE_SUERTE, { coinResults: [T], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("espReflip");
    expect(paused.pendingAttackChoice?.reaction?.resume).toMatchObject({ kind: "attack", attackIndex: TIRO_DE_SUERTE });
    const plan = getAttackChoiceCoinPlan(paused, ["reflip"])!;
    expect(plan).toEqual({ smokescreen: 0, attack: 1, defender: 0 });
    const resumed = resolveAttackChoice(paused, ["reflip"], { skipEndTurn: true, coinResults: flipAttackCoins(plan, () => H) });
    const hit = resumed.pendingAttackChoice ? resolveAttackChoice(resumed, [abra.pokemon.id], { skipEndTurn: true }) : resumed;
    expect(names(hit.opponentDiscard)).toContain("Abra");
  });
});

describe("Recall: the AI", () => {
  const aiTurn = (aiActive: PokemonInPlay, hand: ReturnType<typeof gameCard>[], defender = inPlay("Onix", { damage: 80 })) =>
    makeState({ isPlayerTurn: false, player: { active: defender }, opponent: { active: aiActive, hand } });

  it("plays Recall when a lower stage's attack is the one that works (Graveler can't pay Lanzar Roca; Placaje Knocks Out)", () => {
    const card = recall();
    const state = aiTurn(graveler({ energy: [Fighting] }), [card]);
    const plan = decideOpponentTurn(state);
    const recallAt = plan.findIndex((a) => a.type === "playTrainer" && a.trainerName === "Recall");
    expect(recallAt).toBeGreaterThanOrEqual(0);
    let after = state;
    for (const action of plan) {
      if (action.type === "attack") {
        expect(action.attackIndex).toBe(PLACAJE);
      }
      after = executeAIAction(after, action);
    }
    expect(names(after.playerDiscard)).toContain("Onix");
  });

  it("doesn't play Recall when there is nothing better under the Active (or nothing under it)", () => {
    // Lanzar Roca (3 coins × 20) beats Placaje (10)
    const paid = decideOpponentTurn(aiTurn(graveler({ energy: [Fighting, Fighting, Fighting] }), [recall()], inPlay("Onix")));
    expect(paid.some((a) => a.type === "playTrainer" && a.trainerName === "Recall")).toBe(false);
    expect(paid.find((a) => a.type === "attack")).toMatchObject({ attackIndex: 0 });
    const basic = decideOpponentTurn(aiTurn(gym("Brock's Geodude", { energy: [Fighting] }), [recall()]));
    expect(basic.some((a) => a.type === "playTrainer" && a.trainerName === "Recall")).toBe(false);
  });
});
