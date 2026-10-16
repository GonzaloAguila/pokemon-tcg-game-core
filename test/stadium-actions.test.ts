/**
 * Stadiums with an action (Gym Heroes), exact printed texts:
 *
 * - Celadon City Gym (#107): "During each player's turn, that player may choose to discard an
 *   Energy card attached to 1 of his or her Pokémon with Erika in its name. If that player does
 *   so, that Pokémon is no longer Asleep, Confused, Paralyzed, or Poisoned." No per-turn limit;
 *   each use costs one attached Energy card; whoever's turn it is, whoever played the Stadium.
 *   A Stadium action (getStadiumActions / canUseStadiumAction / getStadiumActionSteps /
 *   useStadiumAction): step 1 the Erika's Pokémon, step 2 the Energy card.
 * - Vermilion City Gym (#120): "Whenever a player attacks with a Pokémon with Lt. Surge in its
 *   name, he or she may flip a coin. If heads, and if that Pokémon's attack does damage to the
 *   Defending Pokémon (after applying Weakness and Resistance), that attack does 10 more damage
 *   to the Defending Pokémon. If tails, the attacking Pokémon does 10 damage to itself in
 *   addition to whatever its attack usually does." The opt-in is an attack option
 *   (`vermilionCoin`); its coin goes after the attack's own coins, before the defender coin.
 *
 * The real Stadium cards and owner Pokémon arrive with the catalog (Tasks 7 / 9): built here.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  getStadiumActions,
  canUseStadiumAction,
  getStadiumActionSteps,
  getStadiumActionCoinFlips,
  useStadiumAction,
  canUseVermilionCoin,
  getAttackCoinPlan,
  getAttackCoinFlipCount,
  flipAttackCoins,
  executeAttack,
  swapSides,
  hasStatusCondition,
  decideOpponentTurn,
  executeAIAction,
  type AIAction,
  type GameCard,
  type GameState,
  type PokemonInPlay,
} from "@/index";
import { EnergyType, StatusCondition, type CoinFlipResult } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { legalActions, randomAnswer, actionKind, mulberry32 } from "@/domain/simulation";
import { makeState, inPlay, gameCard, deepFreeze, names } from "./helpers/state";

const { Grass, Lightning } = EnergyType;
const { Asleep, Confused, Paralyzed, Poisoned, CannotAttack } = StatusCondition;
const H: CoinFlipResult = "heads";
const T: CoinFlipResult = "tails";

afterEach(() => vi.restoreAllMocks());

/** A Gym Heroes Stadium card from the catalog (a fresh instance each call). */
const stadium = (name: string): GameCard => gameCard(name, "gym-heroes");
const inPlayStadium = (name: string, playedBy: "player" | "opponent" = "player") => ({ card: stadium(name), playedBy });

/** A Pokémon in play renamed as an owner's Pokémon ("Erika's Bulbasaur") — the owner is the name prefix. */
function owned(owner: string, pokemon: PokemonInPlay): PokemonInPlay {
  return { ...pokemon, pokemon: { ...pokemon.pokemon, name: `${owner}'s ${pokemon.pokemon.name}` } as GameCard };
}

const lines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);

// ============================================================================
// Celadon City Gym
// ============================================================================

const CELADON = "Celadon City Gym";
const erikas = (opts: Parameters<typeof inPlay>[1] = {}) => owned("Erika", inPlay("Bulbasaur", { set: "base", ...opts }));

describe("Celadon City Gym: discard an Energy card from an Erika's Pokémon to cure it", () => {
  it("is listed as the Stadium's action; the steps pick the Pokémon, then the Energy card; it cures every Special Condition", () => {
    const bulbasaur = erikas({ energy: [Grass, Grass], statuses: [Paralyzed, Poisoned, CannotAttack], paralyzedOnTurn: 2, poisonDamage: 20 });
    const state = deepFreeze(makeState({
      player: { active: bulbasaur, bench: [inPlay("Abra")] },
      opponent: { active: inPlay("Machop") },
      stadium: inPlayStadium(CELADON),
    }));
    expect(getStadiumActions(state)).toEqual([{ name: CELADON, available: null }]);
    expect(canUseStadiumAction(state)).toBeNull();
    expect(getStadiumActionCoinFlips(state)).toBe(0);

    const first = getStadiumActionSteps(state, [])!;
    expect(first.options.map((o) => o.id)).toEqual([bulbasaur.pokemon.id]);
    expect(first.maxSelections).toBe(1);
    const second = getStadiumActionSteps(state, [[bulbasaur.pokemon.id]])!;
    expect(second.options.map((o) => o.id)).toEqual(bulbasaur.attachedEnergy.map((e) => e.id));
    expect(second.maxSelections).toBe(1);
    const discarded = bulbasaur.attachedEnergy[1];
    expect(getStadiumActionSteps(state, [[bulbasaur.pokemon.id], [discarded.id]])).toBeNull();

    const next = useStadiumAction(state, [[bulbasaur.pokemon.id], [discarded.id]]);
    const cured = next.playerActivePokemon!;
    expect(cured.attachedEnergy.map((e) => e.id)).toEqual([bulbasaur.attachedEnergy[0].id]);
    expect(next.playerDiscard.map((c) => c.id)).toEqual([discarded.id]);
    // Asleep, Confused, Paralyzed and Poisoned go (Toxic's 20 too); Leer's "can't attack" is no Special Condition
    expect(cured.statusConditions).toEqual([CannotAttack]);
    expect(cured.paralyzedOnTurn).toBeUndefined();
    expect(cured.poisonDamage).toBeUndefined();
    // The Stadium stays; nothing else changes
    expect(next.stadium?.card.name).toBe(CELADON);
    expect(next.isPlayerTurn).toBe(true);
    expect(lines(state, next).some((l) => l.includes(CELADON))).toBe(true);
  });

  it("only Erika's Pokémon with a Special Condition and an Energy card are offered (Active or Bench)", () => {
    const asleep = erikas({ energy: [Grass], statuses: [Asleep] });
    const healthy = erikas({ energy: [Grass] });
    const dry = erikas({ statuses: [Confused] });
    const plain = inPlay("Bulbasaur", { set: "base", energy: [Grass], statuses: [Poisoned] });
    const benchConfused = erikas({ energy: [Grass], statuses: [Confused] });
    const state = makeState({
      player: { active: asleep, bench: [healthy, dry, plain, benchConfused] },
      opponent: { active: inPlay("Machop") },
      stadium: inPlayStadium(CELADON),
    });
    expect(getStadiumActionSteps(state, [])!.options.map((o) => o.id)).toEqual([asleep.pokemon.id, benchConfused.pokemon.id]);
    expect(() => useStadiumAction(state, [[healthy.pokemon.id], [healthy.attachedEnergy[0].id]])).toThrow(IllegalActionError);
    expect(() => useStadiumAction(state, [[asleep.pokemon.id], [benchConfused.attachedEnergy[0].id]])).toThrow(IllegalActionError);
  });

  it("can be used again in the same turn while there is something to cure (each use costs an Energy card)", () => {
    const one = erikas({ energy: [Grass, Grass], statuses: [Confused] });
    const two = erikas({ energy: [Grass], statuses: [Asleep] });
    const state = makeState({ player: { active: one, bench: [two] }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(CELADON) });
    const once = useStadiumAction(state, [[one.pokemon.id], [one.attachedEnergy[0].id]]);
    expect(canUseStadiumAction(once)).toBeNull();
    const twice = useStadiumAction(once, [[two.pokemon.id], [two.attachedEnergy[0].id]]);
    expect(hasStatusCondition(twice.playerBench[0], Asleep)).toBe(false);
    expect(twice.playerDiscard).toHaveLength(2);
    // Nothing left to cure
    expect(canUseStadiumAction(twice)).not.toBeNull();
    expect(getStadiumActions(twice)[0].available).not.toBeNull();
  });

  it("whoever's turn it is may use it, whoever played the Stadium; never off-turn", () => {
    const mine = erikas({ energy: [Grass], statuses: [Paralyzed] });
    const theirs = erikas({ energy: [Grass], statuses: [Asleep] });
    const state = makeState({ player: { active: mine }, opponent: { active: theirs }, stadium: inPlayStadium(CELADON, "opponent") });
    expect(canUseStadiumAction(state)).toBeNull();
    // The other player, on its own turn (its view)
    const otherTurn = swapSides({ ...state, isPlayerTurn: false });
    expect(canUseStadiumAction(otherTurn)).toBeNull();
    const used = useStadiumAction(otherTurn, [[theirs.pokemon.id], [theirs.attachedEnergy[0].id]]);
    expect(hasStatusCondition(used.playerActivePokemon!, Asleep)).toBe(false);
    expect(names(used.playerDiscard)).toEqual(["Grass Energy"]);
    // Off-turn: refused
    expect(canUseStadiumAction({ ...state, isPlayerTurn: false })).not.toBeNull();
    expect(() => useStadiumAction({ ...state, isPlayerTurn: false }, [[mine.pokemon.id], [mine.attachedEnergy[0].id]])).toThrow(IllegalActionError);
  });

  it("not while a pending choice blocks actions, nor after attacking", () => {
    const mine = erikas({ energy: [Grass], statuses: [Paralyzed] });
    const base = makeState({ player: { active: mine }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(CELADON) });
    expect(canUseStadiumAction({ ...base, attackedThisTurn: true })).not.toBeNull();
    expect(canUseStadiumAction({ ...base, opponentNeedsToPromote: true })).not.toBeNull();
  });

  it("no Stadium, or a Stadium without an action: no action listed and a reason", () => {
    const mine = erikas({ energy: [Grass], statuses: [Paralyzed] });
    const none = makeState({ player: { active: mine }, opponent: { active: inPlay("Machop") } });
    expect(getStadiumActions(none)).toEqual([]);
    expect(canUseStadiumAction(none)).not.toBeNull();
    expect(getStadiumActionSteps(none, [])).toBeNull();
    expect(() => useStadiumAction(none, [])).toThrow(IllegalActionError);
    const pewter = { ...none, stadium: inPlayStadium("Pewter City Gym") };
    expect(getStadiumActions(pewter)).toEqual([]);
    expect(canUseStadiumAction(pewter)).not.toBeNull();
  });
});

// ============================================================================
// Vermilion City Gym
// ============================================================================

const VERMILION = "Vermilion City Gym";
const surges = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => owned("Lt. Surge", inPlay(name, { set: "base", ...opts }));
/** Lt. Surge's Pikachu: Gnaw (index 0) 10 for Colorless. */
const pikachu = (opts: Parameters<typeof inPlay>[1] = {}) => surges("Pikachu", { energy: [Lightning], ...opts });
const GNAW = 0;

describe("Vermilion City Gym: an optional coin when a Lt. Surge's Pokémon attacks", () => {
  it("canUseVermilionCoin: only with the Stadium in play and a Lt. Surge's Active", () => {
    const withGym = makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(VERMILION, "opponent") });
    expect(canUseVermilionCoin(withGym, GNAW)).toBeNull();
    expect(canUseVermilionCoin(withGym, 9)).not.toBeNull();
    const plain = makeState({ player: { active: inPlay("Pikachu", { set: "base", energy: [Lightning] }) }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(VERMILION) });
    expect(canUseVermilionCoin(plain, GNAW)).not.toBeNull();
    const noGym = makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Machop") } });
    expect(canUseVermilionCoin(noGym, GNAW)).not.toBeNull();
    const otherGym = { ...noGym, stadium: inPlayStadium("Pewter City Gym") };
    expect(canUseVermilionCoin(otherGym, GNAW)).not.toBeNull();
  });

  it("without the opt-in there is no coin; with it, one coin", () => {
    const state = makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(VERMILION) });
    expect(getAttackCoinPlan(state, GNAW)).toEqual({ smokescreen: 0, attack: 0, defender: 0 });
    expect(getAttackCoinPlan(state, GNAW, { vermilionCoin: true })).toEqual({ smokescreen: 0, attack: 0, stadium: 1, defender: 0 });
    expect(getAttackCoinFlipCount(state, GNAW, { vermilionCoin: true })).toBe(1);
    const plain = executeAttack(state, GNAW, { coinResults: [], skipEndTurn: true });
    expect(plain.opponentActivePokemon!.currentDamage).toBe(10);
    // The opt-in needs its coin
    expect(() => executeAttack(state, GNAW, { coinResults: [], vermilionCoin: true, skipEndTurn: true })).toThrow();
  });

  it("heads: 10 more damage to the Defending Pokémon, after Weakness", () => {
    const state = deepFreeze(makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Squirtle", { set: "base" }) }, stadium: inPlayStadium(VERMILION) }));
    // Gnaw 10 ×2 (Squirtle is weak to Lightning) + 10 = 30, not (10 + 10) × 2
    const next = executeAttack(state, GNAW, { coinResults: [H], vermilionCoin: true, skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage).toBe(30);
    expect(next.playerActivePokemon!.currentDamage ?? 0).toBe(0);
    expect(lines(state, next).some((l) => l.includes(VERMILION) && l.includes("[coin:heads]"))).toBe(true);
  });

  it("heads: nothing more when the attack does no damage after Resistance", () => {
    const state = makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Diglett", { set: "base" }) }, stadium: inPlayStadium(VERMILION) });
    // Gnaw 10 − 30 (Diglett resists Lightning) = 0: no bonus
    const next = executeAttack(state, GNAW, { coinResults: [H], vermilionCoin: true, skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage ?? 0).toBe(0);
  });

  it("tails: the attack as usual and 10 damage to the attacker", () => {
    const state = makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(VERMILION) });
    const next = executeAttack(state, GNAW, { coinResults: [T], vermilionCoin: true, skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage).toBe(10);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    expect(lines(state, next).some((l) => l.includes(VERMILION) && l.includes("[coin:tails]"))).toBe(true);
  });

  it("tails can Knock Out the attacker (the other player takes a Prize)", () => {
    const state = makeState({
      player: { active: pikachu({ damage: 30 }), bench: [inPlay("Abra")] },
      opponent: { active: inPlay("Machop") },
      stadium: inPlayStadium(VERMILION),
    });
    const next = executeAttack(state, GNAW, { coinResults: [T], vermilionCoin: true, skipEndTurn: true, skipDefenderPromotion: true });
    expect(next.playerActivePokemon).toBeNull();
    expect(next.opponentActivePokemon!.currentDamage).toBe(10);
    expect(next.playerDiscard.some((c) => c.name.includes("Pikachu"))).toBe(true);
    expect(next.opponentCanTakePrize || next.opponentPrizes.length < 6 || next.opponentHand.length > 0).toBe(true);
  });

  it("the opt-in is refused without the Stadium or a Lt. Surge's attacker", () => {
    const plain = makeState({ player: { active: inPlay("Pikachu", { set: "base", energy: [Lightning] }) }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(VERMILION) });
    expect(getAttackCoinPlan(plain, GNAW, { vermilionCoin: true })).toEqual({ smokescreen: 0, attack: 0, defender: 0 });
    expect(() => executeAttack(plain, GNAW, { coinResults: [H], vermilionCoin: true, skipEndTurn: true })).toThrow(IllegalActionError);
  });

  it("coin order: the attack's own coins, then the Stadium coin, then the defender coin (Transparency) last", () => {
    // Lt. Surge's Electabuzz: Thundershock (index 0) 10, flip: heads = Paralyzed
    const electabuzz = surges("Electabuzz", { energy: [Lightning] });
    const haunter = inPlay("Haunter", { set: "fossil" }); // Transparency
    const state = makeState({ player: { active: electabuzz }, opponent: { active: haunter }, stadium: inPlayStadium(VERMILION) });
    const plan = getAttackCoinPlan(state, 0, { vermilionCoin: true });
    expect(plan).toEqual({ smokescreen: 0, attack: 1, stadium: 1, defender: 1 });
    const queue: CoinFlipResult[] = [H, T, T];
    expect(flipAttackCoins(plan, () => queue.shift()!)).toEqual([H, T, T]);
    // Paralysis heads, Vermilion tails (10 to Electabuzz), Transparency tails (not prevented)
    const next = executeAttack(state, 0, { coinResults: [H, T, T], vermilionCoin: true, skipEndTurn: true });
    expect(next.opponentActivePokemon!.currentDamage).toBe(10);
    expect(hasStatusCondition(next.opponentActivePokemon!, Paralyzed)).toBe(true);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    // Paralysis tails, Vermilion heads (+10), Transparency tails
    const other = executeAttack(state, 0, { coinResults: [T, H, T], vermilionCoin: true, skipEndTurn: true });
    expect(other.opponentActivePokemon!.currentDamage).toBe(20);
    expect(hasStatusCondition(other.opponentActivePokemon!, Paralyzed)).toBe(false);
    expect(other.playerActivePokemon!.currentDamage ?? 0).toBe(0);
  });
});

// ============================================================================
// AI
// ============================================================================

type Setup = NonNullable<Parameters<typeof makeState>[0]>;
function aiTurn(ai: Setup["opponent"], human: Setup["player"], extra: Setup = {}): GameState {
  return makeState({ turnNumber: 6, isPlayerTurn: false, ...extra, player: human, opponent: ai });
}
const run = (state: GameState, plan: AIAction[]) => plan.reduce((s, action) => executeAIAction(s, action), state);

describe("AI: Celadon City Gym and Vermilion City Gym", () => {
  it("cures its Paralyzed Erika's Active when it has a spare Energy card, then attacks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const bulbasaur = erikas({ energy: [Grass, Grass, Grass], statuses: [Paralyzed], paralyzedOnTurn: 5 });
    const state = aiTurn({ active: bulbasaur }, { active: inPlay("Machop") }, { stadium: inPlayStadium(CELADON, "player") });
    const plan = decideOpponentTurn(state);
    expect(plan.some((a) => a.type === "useStadium")).toBe(true);
    const after = run(state, plan);
    expect(after.opponentDiscard.filter((c) => c.name === "Grass Energy")).toHaveLength(1);
    expect(plan.some((a) => a.type === "attack")).toBe(true);
    expect(after.playerActivePokemon!.currentDamage).toBeGreaterThan(0);
  });

  it("keeps its Energy when discarding one would leave its Active unable to attack", () => {
    const bulbasaur = erikas({ energy: [Grass, Grass], statuses: [Paralyzed], paralyzedOnTurn: 5 });
    const state = aiTurn({ active: bulbasaur }, { active: inPlay("Machop") }, { stadium: inPlayStadium(CELADON) });
    expect(decideOpponentTurn(state).some((a) => a.type === "useStadium")).toBe(false);
  });

  it("opts into Vermilion's coin when heads would Knock Out the Defending Pokémon", () => {
    const state = aiTurn({ active: pikachu() }, { active: inPlay("Machop", { damage: 30 }) }, { stadium: inPlayStadium(VERMILION) });
    const attack = decideOpponentTurn(state).find((a) => a.type === "attack");
    expect(attack).toMatchObject({ type: "attack", vermilionCoin: true });
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads
    const after = run(state, decideOpponentTurn(state));
    expect(after.playerActivePokemon).toBeNull();
  });

  it("doesn't opt in when tails would Knock Out its own attacker for nothing", () => {
    const state = aiTurn({ active: pikachu({ damage: 30 }), bench: [inPlay("Abra")] }, { active: inPlay("Machop") }, { stadium: inPlayStadium(VERMILION) });
    const attack = decideOpponentTurn(state).find((a) => a.type === "attack");
    expect(attack).toBeDefined();
    expect(attack).not.toMatchObject({ vermilionCoin: true });
  });
});


// ============================================================================
// Simulator and log wording
// ============================================================================

describe("the simulator offers both Stadium actions", () => {
  it("legalActions lists Celadon City Gym's action and the attack with Vermilion City Gym's coin; both run", () => {
    const bulbasaur = erikas({ energy: [Grass, Grass], statuses: [Paralyzed] });
    const celadon = makeState({ player: { active: bulbasaur }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(CELADON) });
    const rng = mulberry32(1);
    const [use] = legalActions(celadon, rng, (step) => randomAnswer(step, rng)).stadium ?? [];
    expect(use.label).toBe(`useStadium ${CELADON}`);
    expect(actionKind(use.label)).toBe(`useStadium ${CELADON}`);
    expect(hasStatusCondition(use.run(celadon).playerActivePokemon!, Paralyzed)).toBe(false);

    const vermilion = makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(VERMILION) });
    const attacks = legalActions(vermilion, rng, (step) => randomAnswer(step, rng)).attack ?? [];
    const withCoin = attacks.find((a) => a.label.endsWith("+stadium coin"));
    expect(withCoin).toBeDefined();
    const after = withCoin!.run(vermilion);
    expect(after.events.some((e) => e.message.startsWith(`${VERMILION} - Moneda:`))).toBe(true);
  });
});

describe("log lines are perspective-free (or a leading 'Descartaste')", () => {
  const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival)\b/;
  it("Celadon City Gym and Vermilion City Gym", () => {
    const bulbasaur = erikas({ energy: [Grass], statuses: [Asleep] });
    const celadon = makeState({ player: { active: bulbasaur }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(CELADON) });
    const cured = useStadiumAction(celadon, [[bulbasaur.pokemon.id], [bulbasaur.attachedEnergy[0].id]]);
    expect(lines(celadon, cured)).toEqual([
      `Descartaste Energía Planta de Erika's Bulbasaur (${CELADON})`,
      "Erika's Bulbasaur ya no está Dormido, Confundido, Paralizado ni Envenenado",
    ]);
    const vermilion = makeState({ player: { active: pikachu() }, opponent: { active: inPlay("Machop") }, stadium: inPlayStadium(VERMILION) });
    const attacked = executeAttack(vermilion, GNAW, { coinResults: [T], vermilionCoin: true, skipEndTurn: true });
    expect(lines(vermilion, attacked).filter((l) => RELATIVE.test(l))).toEqual([]);
  });
});
