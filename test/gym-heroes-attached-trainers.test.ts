/**
 * Gym Heroes attached Trainers (printed text, data/pokemontcg/gym1.json):
 *
 * - #99 Charity: "Attach Charity to your Active Pokémon. Unless that Pokémon gets Knocked Out,
 *   return Charity to your hand at the end of your turn. If that Pokémon attacks and does damage
 *   to the Defending Pokémon, you may reduce that damage by any amount (rounded to the nearest 10)."
 * - #117 Sabrina's ESP: "Attach Sabrina's ESP to 1 of your Pokémon with Sabrina in its name. At
 *   the end of your turn, discard Sabrina's ESP. If that Pokémon uses an attack that involves
 *   flipping coins, Sabrina's ESP lets you re-flip those coins once. If you do, re-flip all the coins."
 *
 * Both questions are asked in the middle of the attack (pendingAttackChoice.reaction, chooser
 * "self"): the attack returns its input untouched and resolveAttackChoice runs it again with the
 * answer — ESP's re-flip coins are flipped by the caller (getAttackChoiceCoinPlan).
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  canPlayTrainerCard,
  endTurn,
  executeAttack,
  flipAttackCoins,
  getAttackChoiceCoinPlan,
  getTrainerSteps,
  playTrainerCard,
  resolveAttackChoice,
  UNSUPPORTED_TRAINERS,
  usePokemonPower,
  type GameState,
  type PokemonInPlay,
} from "@/index";
import { swapSides } from "@/domain/board";
import { decideOpponentTurn, executeAIAction } from "@/domain/ai";
import { attachTrainer, attachedTrainerNamed } from "@/domain/trainers/attached";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Psychic, Fighting, Lightning } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const gym = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-heroes", ...opts });
const charity = () => gameCard("Charity", "gym-heroes");
const esp = () => gameCard("Sabrina's ESP", "gym-heroes");
const withTrainer = (pokemon: PokemonInPlay, card = charity()) => attachTrainer(pokemon, card, "endOfTurn");
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
/** The board without the log and the question: what a paused attack must leave untouched. */
const board = ({ events: _e, pendingAttackChoice: _p, ...rest }: GameState) => rest;

afterEach(() => vi.restoreAllMocks());

describe("registry", () => {
  it("Charity and Sabrina's ESP are supported Trainers now", () => {
    expect(UNSUPPORTED_TRAINERS).not.toContain("Charity");
    expect(UNSUPPORTED_TRAINERS).not.toContain("Sabrina's ESP");
  });
});

// ---------------------------------------------------------------------------- Charity

describe("Charity: attached to the Active, back to the hand at the end of the turn, may reduce its attack's damage", () => {
  it("is attached to the Active Pokémon when played (not discarded)", () => {
    const card = charity();
    const machop = inPlay("Machop");
    const state = deepFreeze(vs(machop, inPlay("Onix"), { player: { hand: [card] } }));
    expect(canPlayTrainerCard(state, card.id)).toBeNull();
    expect(getTrainerSteps(state, card.id, [])).toBeNull();
    const played = playTrainerCard(state, card.id, []);
    expect(played.playerHand).toHaveLength(0);
    expect(names(played.playerDiscard)).not.toContain("Charity");
    expect(names(played.playerActivePokemon!.attachedTrainers ?? [])).toEqual(["Charity"]);
    expect(attachedTrainerNamed(played.playerActivePokemon, "Charity")?.id).toBe(card.id);
  });

  it("returns to its owner's hand at the end of the turn (even from the Bench after a retreat)", () => {
    const machop = withTrainer(inPlay("Machop"));
    const ended = endTurn(deepFreeze(vs(inPlay("Abra"), inPlay("Onix"), { player: { bench: [machop] } })));
    expect(names(ended.playerHand)).toContain("Charity");
    expect(ended.playerBench[0].attachedTrainers ?? []).toEqual([]);
    expect(names(ended.playerDiscard)).not.toContain("Charity");
  });

  it("only the side whose turn ends gives its attached Trainers back (the AI's turn: its hand)", () => {
    const state = makeState({ isPlayerTurn: false, player: { active: inPlay("Onix") }, opponent: { active: withTrainer(inPlay("Machop")) } });
    const ended = endTurn(state);
    expect(names(ended.opponentHand)).toContain("Charity");
    expect(names(ended.playerHand)).not.toContain("Charity");
  });

  it("returns before the between-turns checkup: a Poison Knock Out there doesn't take it", () => {
    const machop = withTrainer(inPlay("Machop", { damage: 40, statuses: [StatusCondition.Poisoned] }));
    const ended = endTurn(vs(machop, inPlay("Onix"), { player: { bench: [inPlay("Abra")] } }));
    expect(names(ended.playerDiscard)).toContain("Machop");
    expect(names(ended.playerDiscard)).not.toContain("Charity");
    expect(names(ended.playerHand)).toContain("Charity");
  });

  it("asks the attacker how much to reduce the damage (multiples of 10 up to the damage, after Weakness); nothing happens before the answer", () => {
    // Machop's Low Kick: 20, ×2 against Pikachu's Fighting Weakness = 40 (its whole HP)
    const state = deepFreeze(vs(withTrainer(inPlay("Machop", { energy: [Fighting] })), inPlay("Pikachu")));
    const paused = attack(state, "Patada baja");
    const pending = paused.pendingAttackChoice!;
    expect(pending.reaction?.answers).toBe("charityReduction");
    expect(pending.step.chooser).toBe("self");
    expect(pending.step.options.map((o) => o.id)).toEqual(["0", "10", "20", "30", "40"]);
    expect(board(paused)).toEqual(board(state));
    expect(paused.attackedThisTurn).toBeFalsy();

    const reduced = resolveAttackChoice(deepFreeze(paused), ["10"], { skipEndTurn: true });
    expect(reduced.opponentActivePokemon!.currentDamage).toBe(30);
    expect(reduced.opponentActivePokemon!.lastDamageReceived).toBe(30);
    expect(reduced.attackedThisTurn).toBe(true);
    expect(reduced.events.map((e) => e.message)).toContain("Charity: el atacante redujo el daño en 10");

    const full = resolveAttackChoice(paused, ["0"], { skipEndTurn: true });
    expect(full.opponentActivePokemon).toBeNull();
    expect(names(full.opponentDiscard)).toContain("Pikachu");
  });

  it("the reduction comes after PlusPower too; reducing it all does no damage", () => {
    const plusPower = gameCard("PlusPower", "base");
    const machop = withTrainer(inPlay("Machop", { energy: [Fighting] }));
    const state = vs(machop, inPlay("Onix"), {
      activeModifiers: [{ id: "pp", source: "plusPower", card: plusPower, amount: 10, expiresAfterTurn: 3, playerId: "player" }],
    });
    const paused = attack(state, "Patada baja");
    expect(paused.pendingAttackChoice!.step.options.map((o) => o.id)).toEqual(["0", "10", "20", "30"]);
    const none = resolveAttackChoice(paused, ["30"], { skipEndTurn: true });
    expect(none.opponentActivePokemon!.currentDamage).toBe(0);
    expect(none.events.map((e) => e.message)).toContain("Machop usó Patada baja e hizo 0 de daño (Charity)");
  });

  it("isn't asked when the attack does no damage to the Defending Pokémon", () => {
    const drowzee = withTrainer(gym("Sabrina's Drowzee", { energy: [Psychic] }));
    const done = attack(vs(drowzee, inPlay("Onix")), "Sugestión", [H]);
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.attackedThisTurn).toBe(true);
  });

  it("is discarded with its Pokémon when that Pokémon is Knocked Out (Selfdestruct), and not returned at the end of the turn", () => {
    const magneton = withTrainer(inPlay("Magneton", { set: "fossil", energy: [Lightning, Lightning, Lightning, Lightning] }));
    const state = vs(magneton, inPlay("Onix", { damage: 0 }), { player: { bench: [inPlay("Abra")] } });
    const paused = attack(state, "Autodestrucción");
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("charityReduction");
    const done = resolveAttackChoice(paused, ["0"], { skipEndTurn: true });
    expect(names(done.playerDiscard)).toEqual(expect.arrayContaining(["Magneton", "Charity"]));
    expect(names(done.playerHand)).not.toContain("Charity");
  });

  it("is discarded when its Electrode is Knocked Out by Buzzap", () => {
    const electrode = withTrainer(inPlay("Electrode", { evolvedFrom: ["Voltorb"] }));
    const pikachu = inPlay("Pikachu", { set: "base" });
    const state = makeState({ player: { active: electrode, bench: [pikachu] } });
    const next = usePokemonPower(state, electrode.pokemon.id, [[Lightning], [pikachu.pokemon.id]]);
    expect(names(next.playerDiscard)).toEqual(expect.arrayContaining(["Charity", "Voltorb"]));
  });

  it("is kept on its Pokémon through swapSides (the AI's view)", () => {
    const state = vs(withTrainer(inPlay("Machop")), inPlay("Onix"));
    const swapped = swapSides(state);
    expect(names(swapped.opponentActivePokemon!.attachedTrainers ?? [])).toEqual(["Charity"]);
    expect(swapSides(swapped).playerActivePokemon!.attachedTrainers).toEqual(state.playerActivePokemon!.attachedTrainers);
  });
});

// ---------------------------------------------------------------------------- Sabrina's ESP

describe("Sabrina's ESP: attached to a Pokémon with Sabrina in its name, re-flips all of its attack's coins once, discarded at the end of the turn", () => {
  /** Sabrina's Haunter (Night Spirits: 30× heads, a coin per Sabrina's Gastly/Haunter/Gengar in play) + a Benched Gastly = 2 coins */
  const setup = (card = esp()) => {
    const haunter = gym("Sabrina's Haunter", { energy: [Psychic, Psychic] });
    const gastly = gym("Sabrina's Gastly");
    return { card, haunter, gastly, state: vs(haunter, inPlay("Onix"), { player: { hand: [card], bench: [gastly] } }) };
  };

  it("needs a Pokémon with Sabrina in its name; the step lists them (Active first)", () => {
    const { card, state, haunter, gastly } = setup();
    expect(canPlayTrainerCard(state, card.id)).toBeNull();
    const step = getTrainerSteps(state, card.id, [])!;
    expect(step.options.map((o) => o.id)).toEqual([haunter.pokemon.id, gastly.pokemon.id]);
    const without = vs(inPlay("Machop"), inPlay("Onix"), { player: { hand: [card], bench: [inPlay("Abra")] } });
    expect(canPlayTrainerCard(without, card.id)).toMatch(/Sabrina/);
  });

  it("is attached to the chosen Pokémon, and discarded at the end of the turn", () => {
    const { card, state, gastly } = setup();
    const played = playTrainerCard(deepFreeze(state), card.id, [[gastly.pokemon.id]]);
    expect(names(played.playerBench[0].attachedTrainers ?? [])).toEqual(["Sabrina's ESP"]);
    expect(names(played.playerDiscard)).not.toContain("Sabrina's ESP");
    const ended = endTurn(played);
    expect(ended.playerBench[0].attachedTrainers ?? []).toEqual([]);
    expect(names(ended.playerDiscard)).toContain("Sabrina's ESP");
    expect(names(ended.playerHand)).not.toContain("Sabrina's ESP");
  });

  it("after the attack's coins, asks whether to re-flip them; nothing happens before the answer", () => {
    const { card, state, haunter } = setup();
    const played = playTrainerCard(state, card.id, [[haunter.pokemon.id]]);
    const paused = attack(deepFreeze(played), "Espíritus Nocturnos", [T, T]);
    const pending = paused.pendingAttackChoice!;
    expect(pending.reaction?.answers).toBe("espReflip");
    expect(pending.step.title).toBe("¿Volver a lanzar las monedas?");
    expect(pending.step.chooser).toBe("self");
    expect(pending.step.options.map((o) => o.id)).toEqual(["keep", "reflip"]);
    expect(board(paused)).toEqual(board(played));
    expect(paused.attackedThisTurn).toBeFalsy();
    // The coins the "reflip" answer needs: the attack's own 2 coins, flipped by the caller
    expect(getAttackChoiceCoinPlan(paused, ["reflip"])).toEqual({ smokescreen: 0, attack: 2, defender: 0 });
    expect(getAttackChoiceCoinPlan(paused, ["keep"])).toBeNull();
  });

  it("the re-flip replaces every coin of the attack and changes the outcome; keeping them doesn't", () => {
    const { card, state, haunter } = setup();
    const played = playTrainerCard(state, card.id, [[haunter.pokemon.id]]);
    const paused = attack(played, "Espíritus Nocturnos", [T, T]);

    const kept = resolveAttackChoice(paused, ["keep"], { skipEndTurn: true });
    expect(kept.opponentActivePokemon!.currentDamage).toBe(0);
    expect(kept.attackedThisTurn).toBe(true);

    const reflipped = resolveAttackChoice(deepFreeze(paused), ["reflip"], { skipEndTurn: true, coinResults: [H, H] });
    expect(reflipped.pendingAttackChoice).toBeUndefined();
    expect(reflipped.opponentActivePokemon!.currentDamage).toBe(60);
    const log = reflipped.events.map((e) => e.message);
    expect(log).toContain("Sabrina's ESP: se vuelven a lanzar todas las monedas de Espíritus Nocturnos");
    expect(log).toContain("Monedas: [coin:heads] [coin:heads]");
  });

  it("the re-flip coins come from the caller and must fit the attack's coins", () => {
    const { card, state, haunter } = setup();
    const paused = attack(playTrainerCard(state, card.id, [[haunter.pokemon.id]]), "Espíritus Nocturnos", [T, T]);
    expect(() => resolveAttackChoice(paused, ["reflip"], { skipEndTurn: true })).toThrow();
    expect(() => resolveAttackChoice(paused, ["reflip"], { skipEndTurn: true, coinResults: [H] })).toThrow();
    const coins = flipAttackCoins(getAttackChoiceCoinPlan(paused, ["reflip"])!, () => H);
    expect(resolveAttackChoice(paused, ["reflip"], { skipEndTurn: true, coinResults: coins }).opponentActivePokemon!.currentDamage).toBe(60);
  });

  it("only the attack's own coins are re-flipped (Smokescreen's coin stays)", () => {
    const { card, state, haunter } = setup();
    const smoked = { ...state, playerActivePokemon: { ...haunter, mustFlipToAttack: true, mustFlipToAttackTurn: 2 } };
    const played = playTrainerCard(smoked, card.id, [[haunter.pokemon.id]]);
    // Smokescreen heads, then the attack's 2 coins
    const paused = attack(played, "Espíritus Nocturnos", [H, T, T]);
    expect(getAttackChoiceCoinPlan(paused, ["reflip"])).toEqual({ smokescreen: 0, attack: 2, defender: 0 });
    const done = resolveAttackChoice(paused, ["reflip"], { skipEndTurn: true, coinResults: [H, T] });
    expect(done.opponentActivePokemon!.currentDamage).toBe(30);
    // Smokescreen tails: the attack does nothing, nothing to re-flip
    const failed = attack(played, "Espíritus Nocturnos", [T, H, H]);
    expect(failed.pendingAttackChoice).toBeUndefined();
    expect(failed.attackedThisTurn).toBe(true);
  });

  it("isn't offered when the attack flips no coins", () => {
    const jynx = gym("Sabrina's Jynx", { energy: [Psychic] });
    const card = esp();
    const played = playTrainerCard(vs(jynx, inPlay("Onix"), { player: { hand: [card] } }), card.id, [[jynx.pokemon.id]]);
    const done = attack(played, "Buenas Noches");
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.opponentActivePokemon!.currentDamage).toBe(10);
  });

  it("isn't offered for a Pokémon without ESP attached (the one on the Bench doesn't count)", () => {
    const { card, state, gastly } = setup();
    const played = playTrainerCard(state, card.id, [[gastly.pokemon.id]]);
    expect(attack(played, "Espíritus Nocturnos", [T, T]).pendingAttackChoice).toBeUndefined();
  });

  it("is used once: after the re-flip the attack goes on (no second question)", () => {
    const { card, state, haunter } = setup();
    const played = playTrainerCard(state, card.id, [[haunter.pokemon.id]]);
    const paused = attack(played, "Espíritus Nocturnos", [T, T]);
    const done = resolveAttackChoice(paused, ["reflip"], { skipEndTurn: true, coinResults: [T, T] });
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.opponentActivePokemon!.currentDamage).toBe(0);
  });

  it("with Charity too: ESP first, then Charity on the re-flipped damage", () => {
    const { card, state, haunter } = setup();
    const both = playTrainerCard({ ...state, playerActivePokemon: withTrainer(haunter) }, card.id, [[haunter.pokemon.id]]);
    const espAsked = attack(both, "Espíritus Nocturnos", [T, T]);
    expect(espAsked.pendingAttackChoice?.reaction?.answers).toBe("espReflip");
    const charityAsked = resolveAttackChoice(espAsked, ["reflip"], { skipEndTurn: true, coinResults: [H, H] });
    expect(charityAsked.pendingAttackChoice?.reaction?.answers).toBe("charityReduction");
    expect(charityAsked.pendingAttackChoice!.step.options.map((o) => o.id)).toEqual(["0", "10", "20", "30", "40", "50", "60"]);
    const done = resolveAttackChoice(charityAsked, ["20"], { skipEndTurn: true });
    expect(done.opponentActivePokemon!.currentDamage).toBe(40);
  });
});

describe("log", () => {
  it("every new line is perspective-free (the AI's view and the API's neutral log read it right)", () => {
    const relative = /(tu|tus|Tu|Tus|te|rival|Rival)/;
    const card = esp();
    const haunter = gym("Sabrina's Haunter", { energy: [Psychic, Psychic] });
    const start = vs(withTrainer(haunter), inPlay("Onix"), { player: { hand: [card], bench: [gym("Sabrina's Gastly")] } });
    const played = playTrainerCard(start, card.id, [[haunter.pokemon.id]]);
    const reflipped = resolveAttackChoice(attack(played, "Espíritus Nocturnos", [T, T]), ["reflip"], { skipEndTurn: true, coinResults: [H, T] });
    const done = endTurn(resolveAttackChoice(reflipped, ["10"], { skipEndTurn: true }));
    const lines = done.events.map((e) => e.message).filter((m) => !/^Jugaste [^:]*$/.test(m) && !/^Turno d+|^Fin de tu turno|robó una carta/.test(m));
    expect(lines.filter((m) => relative.test(m))).toEqual([]);
    expect(lines).toEqual(expect.arrayContaining([
      "Sabrina's ESP se unió a Sabrina's Haunter",
      "Charity: el atacante redujo el daño en 10",
      "Charity (unida a Sabrina's Haunter) vuelve a la mano",
      "Sabrina's ESP (unida a Sabrina's Haunter) se descarta",
    ]));
  });
});

// ---------------------------------------------------------------------------- AI

describe("AI", () => {
  /** The AI's turn (human = "player", AI = "opponent"). */
  const aiTurn = (aiActive: PokemonInPlay, extra: { hand?: ReturnType<typeof gameCard>[]; bench?: PokemonInPlay[] } = {}) =>
    makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Onix") },
      opponent: { active: aiActive, hand: extra.hand ?? [], bench: extra.bench ?? [] },
    });

  it("plays Sabrina's ESP on its Sabrina's Active before an attack that flips coins", () => {
    const card = esp();
    const haunter = gym("Sabrina's Haunter", { energy: [Psychic, Psychic] });
    const plan = decideOpponentTurn(aiTurn(haunter, { hand: [card] }));
    const espAt = plan.findIndex((a) => a.type === "playTrainer" && a.trainerName === "Sabrina's ESP");
    const attackAt = plan.findIndex((a) => a.type === "attack");
    expect(espAt).toBeGreaterThanOrEqual(0);
    expect(attackAt).toBeGreaterThan(espAt);
    expect(plan[espAt]).toMatchObject({ selections: [[haunter.pokemon.id]] });
  });

  it("doesn't play Sabrina's ESP before an attack without coins, nor Charity at all", () => {
    const jynx = gym("Sabrina's Jynx", { energy: [Psychic] });
    const plan = decideOpponentTurn(aiTurn(jynx, { hand: [esp(), charity()] }));
    expect(plan.some((a) => a.type === "playTrainer")).toBe(false);
  });

  it("re-flips its own bad coins (fewer heads than tails) with its own flips, and the turn passes", () => {
    const card = esp();
    const haunter = gym("Sabrina's Haunter", { energy: [Psychic, Psychic] });
    let state = aiTurn(haunter, { hand: [card], bench: [gym("Sabrina's Gastly")] });
    state = executeAIAction(state, { type: "playTrainer", cardId: card.id, trainerName: "Sabrina's ESP", selections: [[haunter.pokemon.id]], delay: 0 });
    expect(names(state.opponentActivePokemon!.attachedTrainers ?? [])).toEqual(["Sabrina's ESP"]);
    // The attack's 2 coins: tails, tails; the re-flip: heads, heads
    const flips = [0.9, 0.9, 0.1, 0.1];
    vi.spyOn(Math, "random").mockImplementation(() => flips.shift() ?? 0.1);
    const done = executeAIAction(state, { type: "attack", attackIndex: 0, delay: 0 });
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.playerActivePokemon!.currentDamage).toBe(60);
    expect(done.isPlayerTurn).toBe(true);
    expect(names(done.opponentDiscard)).toContain("Sabrina's ESP");
  });

  it("keeps good coins", () => {
    const card = esp();
    const haunter = gym("Sabrina's Haunter", { energy: [Psychic, Psychic] });
    let state = aiTurn(haunter, { hand: [card], bench: [gym("Sabrina's Gastly")] });
    state = executeAIAction(state, { type: "playTrainer", cardId: card.id, trainerName: "Sabrina's ESP", selections: [[haunter.pokemon.id]], delay: 0 });
    const flips = [0.1, 0.9, 0.9, 0.9];
    vi.spyOn(Math, "random").mockImplementation(() => flips.shift() ?? 0.9);
    const done = executeAIAction(state, { type: "attack", attackIndex: 0, delay: 0 });
    expect(done.playerActivePokemon!.currentDamage).toBe(30);
  });

  it("an AI attacker with Charity (from a test state) never reduces its damage", () => {
    const machop = withTrainer(inPlay("Machop", { energy: [Fighting] }));
    const done = executeAIAction(aiTurn(machop), { type: "attack", attackIndex: attackIndex(machop, "Patada baja"), delay: 0 });
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.playerActivePokemon!.currentDamage).toBe(20);
    expect(names(done.opponentHand)).toContain("Charity");
  });
});
