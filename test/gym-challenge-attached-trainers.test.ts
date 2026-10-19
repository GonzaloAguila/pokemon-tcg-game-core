/**
 * Gym Challenge attached Trainers: Brock's Protection (the opponent's attacks and Trainers can't
 * take its Pokémon's Energy cards) and Koga's Ninja Trick (the pre-attack reaction), from the
 * printed text and the accepted defaults of docs/card-doubts.md → "Gym Challenge":
 * - Ninja Trick is asked after the attacker's Confusion flip and before every other coin of the
 *   attack (Smokescreen included); the switched-in Pokémon is the Defending Pokémon for the whole
 *   attack (its coins are planned for it: Transparency...); Ninja Trick then goes to the discard
 *   pile; only on the Active Koga's Pokémon.
 * - Brock's Protection blocks the opponent's attacks / Trainers removing an attached Energy card;
 *   not Pokémon Powers nor its owner's own effects.
 */
import { describe, it, expect } from "vitest";
import {
  checkKnockouts,
  endTurn,
  executeAttack,
  executeMetronome,
  executeRetreat,
  getAttackChoiceCoinPlan,
  getAttackPreReaction,
  resolveAttackChoice,
  resolveConfusionFlip,
  type GameState,
  type PokemonInPlay,
} from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { attachTrainer } from "@/domain/trainers/attached";
import { answerAttackChoiceForAI, decideOpponentTurn } from "@/domain/ai";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, names, deepFreeze, armedFor, attackIndex } from "./helpers/state";

const { Fighting, Grass, Psychic } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const card = (name: string) => gameCard(name, "gym-challenge");
const gc = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-challenge", ...opts });
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: NonNullable<Parameters<typeof makeState>[0]> = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const ids = (state: GameState, cardId: string, selections: string[][] = []) =>
  getTrainerSteps(state, cardId, selections)!.options.filter((o) => !o.disabled).map((o) => o.id);

const protectedBy = (p: PokemonInPlay) => attachTrainer(p, card("Brock's Protection"), "untilLeavesPlay");
const withTrick = (p: PokemonInPlay) => attachTrainer(p, card("Koga's Ninja Trick"), "whileActive");

// ---------------------------------------------------------------------------- Brock's Protection

describe("Brock's Protection", () => {
  it("attaches to a Pokémon with Brock in its name and stays after the turn", () => {
    const trainer = card("Brock's Protection");
    const geodude = gc("Brock's Geodude", { energy: [Fighting] });
    const state = deepFreeze(makeState({ player: { active: inPlay("Machop"), bench: [geodude], hand: [trainer] }, opponent: { active: inPlay("Onix") } }));
    expect(ids(state, trainer.id)).toEqual([geodude.pokemon.id]);
    const played = playTrainerCard(state, trainer.id, [[geodude.pokemon.id]]);
    expect(names(played.playerBench[0].attachedTrainers ?? [])).toEqual(["Brock's Protection"]);
    expect(played.playerHand).toEqual([]);
    const later = endTurn(played);
    expect(names(later.playerBench[0].attachedTrainers ?? [])).toEqual(["Brock's Protection"]);
  });

  it("needs a Pokémon with Brock in its name", () => {
    const trainer = card("Brock's Protection");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [trainer] }, opponent: { active: inPlay("Onix") } });
    expect(canPlayTrainerCard(state, trainer.id)).toMatch(/Brock/);
  });

  it("Energy Removal can't take its Energy cards (and isn't playable when only they are left)", () => {
    const removal = gameCard("Energy Removal", "base");
    const guarded = protectedBy(gc("Brock's Geodude", { energy: [Fighting] }));
    const machop = inPlay("Machop", { energy: [Fighting] });
    const state = deepFreeze(vs(inPlay("Pikachu"), guarded, { player: { hand: [removal] }, opponent: { bench: [machop] } }));
    expect(ids(state, removal.id)).toEqual([machop.attachedEnergy[0].id]);
    const alone = vs(inPlay("Pikachu"), guarded, { player: { hand: [removal] } });
    expect(canPlayTrainerCard(alone, removal.id)).not.toBeNull();
  });

  it("Super Energy Removal skips it as a target, but its owner may still discard its Energy", () => {
    const ser = gameCard("Super Energy Removal", "base");
    const guardedOwn = protectedBy(gc("Brock's Geodude", { energy: [Fighting] }));
    const guardedTheirs = protectedBy(gc("Brock's Geodude", { energy: [Fighting, Fighting] }));
    const machop = inPlay("Machop", { energy: [Fighting] });
    const state = deepFreeze(vs(guardedOwn, guardedTheirs, { player: { hand: [ser] }, opponent: { bench: [machop] } }));
    expect(ids(state, ser.id)).toEqual([guardedOwn.pokemon.id]);
    const first = [[guardedOwn.pokemon.id], [guardedOwn.attachedEnergy[0].id]];
    expect(ids(state, ser.id, first)).toEqual([machop.pokemon.id]);
  });

  it("Hyper Beam can't discard the Defending Pokémon's Energy (the damage is still done)", () => {
    const dragonair = armedFor(inPlay("Dragonair"), "Híper Rayo");
    const i = attackIndex(dragonair, "Híper Rayo");
    const guarded = protectedBy(gc("Brock's Geodude", { energy: [Fighting] }));
    const done = executeAttack(deepFreeze(vs(dragonair, guarded)), i, { coinResults: [], skipEndTurn: true });
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.opponentActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(done.opponentActivePokemon!.currentDamage).toBeGreaterThan(0);
    // Without it, the attacker picks the Energy card to discard
    const open = executeAttack(vs(dragonair, gc("Brock's Geodude", { energy: [Fighting] })), i, { coinResults: [], skipEndTurn: true });
    expect(open.pendingAttackChoice?.step.options).toHaveLength(1);
  });

  it("goes to the discard pile with its Pokémon when it is Knocked Out", () => {
    const guarded = protectedBy(gc("Brock's Geodude", { energy: [Fighting], damage: 100 }));
    const after = checkKnockouts(vs(inPlay("Machop"), guarded, { opponent: { bench: [inPlay("Onix")] } }));
    expect(names(after.opponentDiscard)).toContain("Brock's Protection");
  });
});

// ---------------------------------------------------------------------------- Koga's Ninja Trick

describe("Koga's Ninja Trick: playing it", () => {
  it("attaches to the Active with Koga in its name", () => {
    const trainer = card("Koga's Ninja Trick");
    const koffing = gc("Koga's Koffing");
    const state = deepFreeze(makeState({ player: { active: koffing, bench: [inPlay("Machop")], hand: [trainer] }, opponent: { active: inPlay("Onix") } }));
    const played = playTrainerCard(state, trainer.id);
    expect(names(played.playerActivePokemon!.attachedTrainers ?? [])).toEqual(["Koga's Ninja Trick"]);
    expect(names(endTurn(played).playerActivePokemon!.attachedTrainers ?? [])).toEqual(["Koga's Ninja Trick"]);
  });

  it("is refused when the Active has no Koga in its name", () => {
    const trainer = card("Koga's Ninja Trick");
    const state = makeState({ player: { active: inPlay("Machop"), bench: [gc("Koga's Koffing")], hand: [trainer] }, opponent: { active: inPlay("Onix") } });
    expect(canPlayTrainerCard(state, trainer.id)).toMatch(/Koga/);
  });

  it("is discarded as soon as its Pokémon goes to the Bench (retreat)", () => {
    const koffing = withTrick(gc("Koga's Koffing", { energy: [Grass, Grass, Grass] }));
    const state = deepFreeze(makeState({ player: { active: koffing, bench: [inPlay("Machop")] }, opponent: { active: inPlay("Onix") } }));
    const cost = (koffing.pokemon as { retreatCost?: unknown[] }).retreatCost?.length ?? 1;
    const retreated = executeRetreat(state, koffing.attachedEnergy.slice(0, cost).map((e) => e.id), 0, { coinResults: [] });
    const benched = retreated.playerBench.find((p) => p.pokemon.id === koffing.pokemon.id)!;
    expect(benched.attachedTrainers ?? []).toEqual([]);
    expect(names(retreated.playerDiscard)).toContain("Koga's Ninja Trick");
  });
});

describe("Koga's Ninja Trick: the pre-attack reaction", () => {
  // Magnemite's Thundershock: 10, 1 coin (heads: Paralyzed). Fossil Haunter: Transparency (a defender coin).
  const magnemite = armedFor(inPlay("Magnemite"), "Onda trueno");
  const i = attackIndex(magnemite, "Onda trueno");
  const haunter = inPlay("Haunter", { set: "fossil" });
  const machop = inPlay("Machop");
  const setup = (extra: { attacker?: PokemonInPlay; koga?: PokemonInPlay; bench?: PokemonInPlay[] } = {}) =>
    deepFreeze(vs(extra.attacker ?? magnemite, extra.koga ?? withTrick(gc("Koga's Koffing")), { opponent: { bench: extra.bench ?? [haunter, machop] } }));

  it("asks the defender before any coin; the attack hasn't happened yet", () => {
    const state = setup();
    const step = getAttackPreReaction(state, i);
    expect(step).toMatchObject({ chooser: "opponent", defaultSelection: [], minSelections: 0, maxSelections: 1 });
    expect(step!.options.map((o) => o.id)).toEqual([haunter.pokemon.id, machop.pokemon.id]);
    expect(step!.answererDescription).toMatch(/Puedes cambiar/);
    // The caller's coins (none flipped yet) are ignored while the question is pending
    const paused = executeAttack(state, i, { coinResults: [], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("preAttack");
    expect(paused.attackedThisTurn).toBeFalsy();
    expect(paused.opponentActivePokemon).toEqual(state.opponentActivePokemon);
    expect(paused.opponentBench).toEqual(state.opponentBench);
  });

  it("plans the coins for the Pokémon that will defend (Transparency only after switching to Haunter)", () => {
    const paused = executeAttack(setup(), i, { coinResults: [], skipEndTurn: true });
    expect(getAttackChoiceCoinPlan(paused, [])).toMatchObject({ smokescreen: 0, attack: 1, defender: 0 });
    expect(getAttackChoiceCoinPlan(paused, [haunter.pokemon.id])).toMatchObject({ smokescreen: 0, attack: 1, defender: 1 });
  });

  it("switch: the new Active takes the whole attack, Ninja Trick goes to the discard pile", () => {
    const paused = executeAttack(setup(), i, { coinResults: [], skipEndTurn: true });
    const done = resolveAttackChoice(paused, [haunter.pokemon.id], { coinResults: [H, T], skipEndTurn: true });
    expect(done.opponentActivePokemon!.pokemon.id).toBe(haunter.pokemon.id);
    expect(done.opponentActivePokemon!.currentDamage).toBe(10);
    expect(done.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Paralyzed);
    const koffing = done.opponentBench.find((p) => p.pokemon.name === "Koga's Koffing")!;
    expect(koffing.currentDamage).toBe(0);
    expect(koffing.attachedTrainers ?? []).toEqual([]);
    expect(names(done.opponentDiscard)).toContain("Koga's Ninja Trick");
    expect(done.attackedThisTurn).toBe(true);
    // Transparency heads on the switched-in Haunter: the whole attack is prevented
    const evaded = resolveAttackChoice(paused, [haunter.pokemon.id], { coinResults: [H, H], skipEndTurn: true });
    expect(evaded.opponentActivePokemon!.currentDamage).toBe(0);
  });

  it("stay: the Koga's Pokémon takes the attack and keeps Ninja Trick; the answer needs the coins", () => {
    const paused = executeAttack(setup(), i, { coinResults: [], skipEndTurn: true });
    expect(() => resolveAttackChoice(paused, [], { skipEndTurn: true })).toThrow();
    const done = resolveAttackChoice(paused, [], { coinResults: [T], skipEndTurn: true });
    expect(done.opponentActivePokemon!.pokemon.name).toBe("Koga's Koffing");
    expect(done.opponentActivePokemon!.currentDamage).toBe(10);
    expect(names(done.opponentActivePokemon!.attachedTrainers ?? [])).toEqual(["Koga's Ninja Trick"]);
  });

  it("isn't asked with an empty Bench", () => {
    const state = setup({ bench: [] });
    expect(getAttackPreReaction(state, i)).toBeNull();
    const done = executeAttack(state, i, { coinResults: [T], skipEndTurn: true });
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.opponentActivePokemon!.currentDamage).toBe(10);
  });

  it("comes before the Smokescreen coin", () => {
    const state = setup({ attacker: { ...magnemite, mustFlipToAttack: true } });
    const paused = executeAttack(state, i, { coinResults: [], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("preAttack");
    expect(getAttackChoiceCoinPlan(paused, [machop.pokemon.id])).toMatchObject({ smokescreen: 1, attack: 1 });
  });

  it("a confused attacker's tails never asks it", () => {
    const state = setup({ attacker: { ...magnemite, statusConditions: [StatusCondition.Confused] } });
    const { state: after, canAttack } = resolveConfusionFlip(state, false, true);
    expect(canAttack).toBe(false);
    expect(after.pendingAttackChoice).toBeUndefined();
  });

  it("Metronome: asked before the copy, which then hits the switched-in Pokémon", () => {
    const clefairy = armedFor(inPlay("Clefairy"), "Metrónomo");
    const koffing = withTrick(gc("Koga's Koffing"));
    const copied = (koffing.pokemon as { attacks: { name: string; damage?: unknown }[] }).attacks.find((a) => a.damage)! as never;
    const state = setup({ attacker: clefairy, koga: koffing, bench: [machop] });
    const paused = executeMetronome(state, copied, { coinResults: [], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("preAttack");
    expect(paused.pendingAttackChoice?.reaction?.resume).toMatchObject({ kind: "attack", copiedAttack: copied });
    const plan = getAttackChoiceCoinPlan(paused, [machop.pokemon.id]);
    const coins = plan ? Array.from({ length: plan.attack as number }, () => H) : undefined;
    const done = resolveAttackChoice(paused, [machop.pokemon.id], { skipEndTurn: true, ...(coins && { coinResults: coins }) });
    expect(done.opponentActivePokemon!.pokemon.id).toBe(machop.pokemon.id);
    expect(done.opponentActivePokemon!.currentDamage).toBeGreaterThan(0);
    expect(done.playerActivePokemon!.pokemon.name).toBe("Clefairy");
  });

  it("Psylink: the paused attack resumes with the same index (Life Drain on the switched-in Pokémon)", () => {
    const alakazam = gc("Sabrina's Alakazam", { energy: [Psychic] });
    const kadabra = gc("Sabrina's Kadabra");
    const onix = inPlay("Onix");
    const state = deepFreeze(vs(alakazam, withTrick(gc("Koga's Koffing")), { player: { bench: [kadabra] }, opponent: { bench: [onix] } }));
    const paused = executeAttack(state, 1, { coinResults: [], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.answers).toBe("preAttack");
    const done = resolveAttackChoice(paused, [onix.pokemon.id], { coinResults: [H], skipEndTurn: true });
    // Life Drain on heads: Onix (90) left with 10 HP
    expect(done.opponentActivePokemon!.pokemon.id).toBe(onix.pokemon.id);
    expect(done.opponentActivePokemon!.currentDamage).toBe(80);
  });

  it("is discarded by the sweep if its Pokémon is Benched another way", () => {
    const koffing = withTrick(gc("Koga's Koffing"));
    const after = checkKnockouts(vs(inPlay("Machop"), inPlay("Onix"), { opponent: { bench: [koffing] } }));
    expect(after.opponentBench[0].attachedTrainers ?? []).toEqual([]);
    expect(names(after.opponentDiscard)).toEqual(["Koga's Ninja Trick"]);
  });
});

describe("Koga's Ninja Trick: the AI", () => {
  it("as the defender, switches a Koga's Pokémon about to be Knocked Out, stays when healthy", () => {
    const zapper = armedFor(inPlay("Magnemite"), "Onda trueno");
    const i = attackIndex(zapper, "Onda trueno");
    const onix = inPlay("Onix");
    const hurt = withTrick(gc("Koga's Koffing", { damage: 40 }));
    const paused = executeAttack(vs(zapper, hurt, { opponent: { bench: [onix] } }), i, { coinResults: [], skipEndTurn: true });
    expect(answerAttackChoiceForAI(paused)).toEqual([onix.pokemon.id]);
    // Machop's Low Kick (20) on a healthy Koga's Arbok: nothing worth a switch
    const machop = armedFor(inPlay("Machop"), "Patada baja");
    const healthy = executeAttack(vs(machop, withTrick(gc("Koga's Arbok")), { opponent: { bench: [onix] } }), 0, { coinResults: [], skipEndTurn: true });
    expect(answerAttackChoiceForAI(healthy)).toEqual([]);
  });

  it("plays Ninja Trick on its Koga's Active and Brock's Protection on a Brock's Pokémon with Energy", () => {
    const trick = card("Koga's Ninja Trick");
    const kogaTurn = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Onix") },
      opponent: { active: gc("Koga's Koffing", { energy: [Grass] }), bench: [inPlay("Machop")], hand: [trick] },
    });
    expect(decideOpponentTurn(kogaTurn).some((a) => a.type === "playTrainer" && a.trainerName === "Koga's Ninja Trick")).toBe(true);
    const protection = card("Brock's Protection");
    const brockTurn = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Onix") },
      opponent: { active: gc("Brock's Geodude", { energy: [Fighting] }), hand: [protection] },
    });
    expect(decideOpponentTurn(brockTurn).some((a) => a.type === "playTrainer" && a.trainerName === "Brock's Protection")).toBe(true);
  });
});

