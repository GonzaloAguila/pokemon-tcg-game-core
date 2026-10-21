import { prizesOwed } from "@/lib/gameState";
/**
 * Gym Heroes Pokémon Powers, one block per power, from the printed text (data/pokemontcg/gym1.json):
 *
 * | # | Card | Power | Kind |
 * |---|---|---|---|
 * | 2 | Brock's Rhydon | Bench Guard (Guardia de Banca) | reaction: the Benched damage choice of its owner |
 * | 5 | Erika's Vileplume | Pollen Defense (Defensa de Polen) | the attack's defender coin |
 * | 8 | Lt. Surge's Magneton | Energy Charge (Carga de Energía) | activated, as often as you like |
 * | 10 | Misty's Tentacruel | Flee (Huida) | reaction: the attack pauses for its owner's choice |
 * | 12 | Rocket's Moltres | Rebirth (Renacer) | on Knock Out |
 * | 26 | Erika's Victreebel | Fragrance Trap (Trampa Aromática) | activated, once per turn, 1 coin |
 * | 29 | Misty's Cloyster | Shell Armor (Armadura Caparazón) | attack damage −10 |
 * | 33 | Rocket's Snorlax | Restless Sleep (Sueño Inquieto) | damage back while Asleep |
 * | 42 | Erika's Dratini | Strange Barrier (Barrera Extraña) | a Basic's 20+ becomes 10 |
 * | 47 | Erika's Oddish | Photosynthesis (Fotosíntesis) | every Energy attached provides Grass |
 * | 65 | Blaine's Vulpix | Natural Healing (Curación Natural) | activated, once per turn |
 */
import { describe, it, expect } from "vitest";
import {
  canExecuteAttack,
  canUseAttack,
  energyProvidesType,
  executeAttack,
  executeBenchDamage,
  executeMetronome,
  getAttackCoinPlan,
  resolveAttackChoice,
} from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { ACTIVATED_POWER_TYPES, POWER_EFFECTS, canUsePokemonPower, getPowerCoinFlips, getPowerSteps, usePokemonPower } from "@/domain/effects";
import { isPokemonCard } from "@/domain/cards";
import { EnergyType, PokemonPowerType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

const { Water, Fire, Grass, Lightning, Fighting } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const gym = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-heroes", ...opts });
const muk = () => inPlay("Muk", { set: "fossil" });
const goop = { powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: 9 }] };

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const powerOf = (p: PokemonInPlay) => (isPokemonCard(p.pokemon) ? p.pokemon.power : undefined);
const attacksOf = (p: PokemonInPlay) => (isPokemonCard(p.pokemon) ? p.pokemon.attacks : []);

describe("catalog: the 11 powers", () => {
  it("activated ones are in POWER_EFFECTS with their types activated; the passive ones are not", () => {
    for (const name of ["Lt. Surge's Magneton", "Erika's Victreebel", "Blaine's Vulpix"]) {
      const power = powerOf(gym(name))!;
      expect(POWER_EFFECTS[power.name]).toBeDefined();
      expect(ACTIVATED_POWER_TYPES).toContain(power.type);
    }
    for (const type of [
      PokemonPowerType.RedirectBenchDamage,
      PokemonPowerType.DamagedStatusFlip,
      PokemonPowerType.SwitchWhenDamaged,
      PokemonPowerType.ReturnToHandOnKnockOut,
      PokemonPowerType.ReduceAttackDamage,
      PokemonPowerType.AsleepDamageReaction,
      PokemonPowerType.BasicAttackDamageCap,
      PokemonPowerType.EnergyTypeOverride,
    ]) {
      expect(ACTIVATED_POWER_TYPES).not.toContain(type);
    }
    expect(powerOf(gym("Erika's Oddish"))?.type).toBe(PokemonPowerType.EnergyTypeOverride);
  });
});

// ---------------------------------------------------------------------------- #2 Bench Guard

describe("Bench Guard (Brock's Rhydon): while Benched, may take 10 of the damage done to each other Benched Pokémon", () => {
  const setup = (rhydon = gym("Brock's Rhydon"), extra: Parameters<typeof makeState>[0] = {}) => {
    const abra = inPlay("Abra");
    const machop = inPlay("Machop");
    // Dark Arbok's Poison Vapor: 10 to the Defending Pokémon (Poisoned) and 10 to each Benched Pokémon of the opponent
    const state = vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Machop"), { ...extra, opponent: { bench: [abra, rhydon, machop] } });
    return { state, abra, machop, rhydon };
  };

  it("the attack waits for the defending player's answer before its damage is done (one choice for every Benched Pokémon hit)", () => {
    const { state, abra, machop, rhydon } = setup();
    const paused = attack(deepFreeze(state), "Vapor Venenoso");
    const pending = paused.pendingAttackChoice!;
    expect(pending.step.chooser).toBe("opponent");
    expect(pending.step.minSelections).toBe(0);
    expect(pending.step.options.map((o) => o.id)).toEqual([abra.pokemon.id, machop.pokemon.id]);
    expect(pending.step.answererDescription).toBeTruthy();
    // Nothing happened yet
    expect(paused.opponentActivePokemon!.currentDamage).toBe(0);
    expect(paused.opponentBench.map((p) => p.currentDamage)).toEqual([0, 0, 0]);
    expect(paused.attackedThisTurn).toBeFalsy();
    expect(canExecuteAttack(paused, 1)).not.toBeNull();

    const guarded = resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true });
    expect(guarded.pendingAttackChoice).toBeUndefined();
    expect(guarded.attackedThisTurn).toBe(true);
    expect(guarded.opponentActivePokemon!.currentDamage).toBe(10);
    expect(guarded.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Poisoned);
    const bench = (s: GameState, p: PokemonInPlay) => s.opponentBench.find((b) => b.pokemon.id === p.pokemon.id)!.currentDamage;
    expect(bench(guarded, abra)).toBe(0);
    expect(bench(guarded, machop)).toBe(10);
    // Its own 10 plus the 10 it took for Abra
    expect(bench(guarded, rhydon)).toBe(20);

    const declined = resolveAttackChoice(paused, [], { skipEndTurn: true });
    expect(bench(declined, abra)).toBe(10);
    expect(bench(declined, rhydon)).toBe(10);
  });

  it("can save a Benched Pokémon from a Knock Out (checked after the redirect)", () => {
    const { state, abra } = setup();
    const hurt = { ...state, opponentBench: state.opponentBench.map((p) => (p.pokemon.id === abra.pokemon.id ? { ...p, currentDamage: 20 } : p)) };
    const paused = attack(hurt, "Vapor Venenoso");
    const saved = resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true });
    expect(saved.opponentBench.some((p) => p.pokemon.id === abra.pokemon.id)).toBe(true);
    const lost = resolveAttackChoice(paused, [], { skipEndTurn: true });
    expect(lost.opponentBench.some((p) => p.pokemon.id === abra.pokemon.id)).toBe(false);
    expect(prizesOwed(lost, "player")).toBe(1);
  });

  it("damage chosen by the attacker (Hitmonlee's Stretch Kick) waits for the answer too", () => {
    const abra = inPlay("Abra");
    const rhydon = gym("Brock's Rhydon");
    const state = vs(inPlay("Hitmonlee", { set: "fossil" }), inPlay("Onix"), { opponent: { bench: [abra, rhydon] } });
    const chosen = attack(state, "Patada Estirada");
    expect(chosen.pendingBenchDamageSelection).toBeDefined();
    const paused = executeBenchDamage(chosen, [abra.pokemon.id], { skipEndTurn: true });
    expect(paused.pendingAttackChoice?.step.chooser).toBe("opponent");
    expect(paused.pendingBenchDamageSelection).toBeUndefined();
    expect(paused.opponentBench[0].currentDamage).toBe(0);
    const guarded = resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true });
    expect(guarded.opponentBench.map((p) => p.currentDamage)).toEqual([10, 10]);
  });

  it("a chosen-target attack on a Benched Pokémon (Dark Arbok's Stare) waits for the answer", () => {
    const abra = inPlay("Abra");
    const rhydon = gym("Brock's Rhydon");
    const state = vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Machop"), { opponent: { bench: [abra, rhydon] } });
    const choosing = attack(state, "Mirada");
    expect(choosing.pendingAttackChoice?.step.chooser).toBe("self");
    const paused = resolveAttackChoice(choosing, [abra.pokemon.id], { skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.powerType).toBe(PokemonPowerType.RedirectBenchDamage);
    expect(paused.opponentBench[0].currentDamage).toBe(0);
    const guarded = resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true });
    expect(guarded.pendingAttackChoice).toBeUndefined();
    expect(guarded.opponentBench.map((p) => p.currentDamage)).toEqual([0, 10]);
    const declined = resolveAttackChoice(paused, [], { skipEndTurn: true });
    expect(declined.opponentBench.map((p) => p.currentDamage)).toEqual([10, 0]);
  });

  it("on the attacker's own Bench (Fossil Magneton's Selfdestruct) the attacker chooses; both Benches can ask", () => {
    const ownAbra = inPlay("Abra");
    const ownRhydon = gym("Brock's Rhydon");
    const theirAbra = inPlay("Abra");
    const theirRhydon = gym("Brock's Rhydon");
    const state = vs(inPlay("Magneton", { set: "fossil" }), inPlay("Chansey"), {
      player: { bench: [ownAbra, ownRhydon] },
      opponent: { bench: [theirAbra, theirRhydon] },
    });
    const first = attack(state, "Autodestrucción");
    expect(first.pendingAttackChoice?.step.chooser).toBe("opponent");
    const second = resolveAttackChoice(first, [theirAbra.pokemon.id], { skipEndTurn: true });
    expect(second.pendingAttackChoice?.step.chooser).toBe("self");
    expect(second.playerBench.map((p) => p.currentDamage)).toEqual([0, 0]);
    const done = resolveAttackChoice(second, [ownAbra.pokemon.id], { skipEndTurn: true });
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.opponentBench.map((p) => p.currentDamage)).toEqual([10, 30]);
    expect(done.playerBench.map((p) => p.currentDamage)).toEqual([10, 30]);
  });

  it("doesn't work from the Active spot, nor under Goop Gas Attack / Toxic Gas", () => {
    const abra = inPlay("Abra");
    const active = vs(inPlay("Dark Arbok", { set: "rocket" }), gym("Brock's Rhydon"), { opponent: { bench: [abra] } });
    const hit = attack(active, "Vapor Venenoso");
    expect(hit.pendingAttackChoice).toBeUndefined();
    expect(hit.opponentBench[0].currentDamage).toBe(10);

    const suppressed = setup(gym("Brock's Rhydon"), goop).state;
    expect(attack(suppressed, "Vapor Venenoso").pendingAttackChoice).toBeUndefined();
    const toxic = setup().state;
    const withMuk = { ...toxic, playerBench: [muk()] };
    expect(attack(withMuk, "Vapor Venenoso").pendingAttackChoice).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------- #5 Pollen Defense

describe("Pollen Defense (Erika's Vileplume): damaged by an attack as the Active → flip; heads = the attacker is Confused", () => {
  it("is the attack's defender coin (flipped by Vileplume's owner); heads confuses the attacking Pokémon", () => {
    const state = vs(inPlay("Machop", { energy: [Fighting] }), gym("Erika's Vileplume"));
    const plan = getAttackCoinPlan(state, 0);
    expect(plan).toEqual({ smokescreen: 0, attack: 0, defender: 1 });
    const heads = attack(state, "Patada baja", [H]);
    expect(heads.opponentActivePokemon!.currentDamage).toBe(20);
    expect(heads.playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
    expect(heads.events.map((e) => e.message).join("\n")).toContain("Defensa de Polen");
    const tails = attack(state, "Patada baja", [T]);
    expect(tails.playerActivePokemon!.statusConditions).toEqual([]);
  });

  it("works even if Vileplume is Knocked Out, and while it is Asleep, Confused or Paralyzed", () => {
    const ko = attack(vs(inPlay("Machop", { energy: [Fighting] }), gym("Erika's Vileplume", { damage: 70 })), "Patada baja", [H]);
    expect(ko.opponentDiscard.some((c) => c.name === "Erika's Vileplume")).toBe(true);
    expect(ko.playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const state = vs(inPlay("Machop", { energy: [Fighting] }), gym("Erika's Vileplume", { statuses: [status] }));
      expect(getAttackCoinPlan(state, 0).defender).toBe(1);
      expect(attack(state, "Patada baja", [H]).playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
    }
  });

  it("a chosen-target attack (Dark Arbok's Stare) on the Active Vileplume uses the same coin", () => {
    const state = vs(inPlay("Dark Arbok", { set: "rocket" }), gym("Erika's Vileplume"), { opponent: { bench: [inPlay("Abra")] } });
    const stare = attackIndex(state.playerActivePokemon!, "Mirada");
    expect(getAttackCoinPlan(state, stare).defender).toBe(1);
    const choosing = attack(state, "Mirada", [H]);
    const onVileplume = resolveAttackChoice(choosing, [state.opponentActivePokemon!.pokemon.id], { skipEndTurn: true });
    expect(onVileplume.opponentActivePokemon!.currentDamage).toBe(10);
    expect(onVileplume.playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
    const onAbra = resolveAttackChoice(choosing, [state.opponentBench[0].pokemon.id], { skipEndTurn: true });
    expect(onAbra.playerActivePokemon!.statusConditions).toEqual([]);
  });

  it("no coin under Toxic Gas / Goop Gas Attack, on the Bench, or for an attack that can't damage it", () => {
    const machop = () => inPlay("Machop", { energy: [Fighting] });
    expect(getAttackCoinPlan(vs(machop(), gym("Erika's Vileplume"), { player: { bench: [muk()] } }), 0).defender).toBe(0);
    expect(getAttackCoinPlan(vs(machop(), gym("Erika's Vileplume"), goop), 0).defender).toBe(0);
    const benched = vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Onix"), { opponent: { bench: [gym("Erika's Vileplume")] } });
    expect(getAttackCoinPlan(benched, attackIndex(benched.playerActivePokemon!, "Vapor Venenoso")).defender).toBe(0);
    const noDamage = vs(inPlay("Onix"), gym("Erika's Vileplume"));
    expect(getAttackCoinPlan(noDamage, attackIndex(noDamage.playerActivePokemon!, "Endurecimiento")).defender).toBe(0);
  });
});

// ---------------------------------------------------------------------------- #8 Energy Charge

describe("Energy Charge (Lt. Surge's Magneton): as often as you like, while Active, a Lightning Energy card from your Pokémon to it", () => {
  const setup = (magneton = gym("Lt. Surge's Magneton"), extra: Parameters<typeof makeState>[0] = {}) => {
    const pikachu = inPlay("Pikachu", { energy: [Lightning, Lightning, Fire] });
    return { state: makeState({ ...extra, player: { active: magneton, bench: [pikachu] }, opponent: { active: inPlay("Onix") } }), pikachu, magneton };
  };

  it("moves a Lightning Energy card, again and again (not once per turn); only Lightning cards are offered", () => {
    const { state, pikachu, magneton } = setup();
    expect(canUsePokemonPower(deepFreeze(state), magneton.pokemon.id)).toBeNull();
    const step = getPowerSteps(state, magneton.pokemon.id, [])!;
    expect(step.options.map((o) => o.id)).toEqual(pikachu.attachedEnergy.slice(0, 2).map((e) => e.id));
    const once = usePokemonPower(state, magneton.pokemon.id, [[pikachu.attachedEnergy[0].id]]);
    expect(once.playerActivePokemon!.attachedEnergy.map((e) => e.id)).toEqual([pikachu.attachedEnergy[0].id]);
    expect(canUsePokemonPower(once, magneton.pokemon.id)).toBeNull();
    const twice = usePokemonPower(once, magneton.pokemon.id, [[pikachu.attachedEnergy[1].id]]);
    expect(twice.playerActivePokemon!.attachedEnergy).toHaveLength(2);
    expect(names(twice.playerBench[0].attachedEnergy)).toEqual(["Fire Energy"]);
    expect(canUsePokemonPower(twice, magneton.pokemon.id)).toMatch(/Eléctrica/);
  });

  it("can't be used from the Bench, while Asleep/Confused/Paralyzed, or under Toxic Gas", () => {
    const benched = makeState({
      player: { active: inPlay("Pikachu", { energy: [Lightning] }), bench: [gym("Lt. Surge's Magneton")] },
      opponent: { active: inPlay("Onix") },
    });
    expect(canUsePokemonPower(benched, benched.playerBench[0].pokemon.id)).not.toBeNull();
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const { state, magneton } = setup(gym("Lt. Surge's Magneton", { statuses: [status] }));
      expect(canUsePokemonPower(state, magneton.pokemon.id)).not.toBeNull();
    }
    const { state, magneton } = setup();
    expect(canUsePokemonPower({ ...state, opponentBench: [muk()] }, magneton.pokemon.id)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------- #10 Flee

describe("Flee (Misty's Tentacruel): damaged by an attack as the Active → may switch with a Benched Pokémon, preventing the attack's other effects on it", () => {
  // Nidoking's Toxic: 20 damage and Poisoned (20 per checkup)
  const setup = (tentacruel = gym("Misty's Tentacruel"), extra: Parameters<typeof makeState>[0] = {}) => {
    const abra = inPlay("Abra");
    return { state: vs(inPlay("Nidoking"), tentacruel, { ...extra, opponent: { bench: [abra] } }), abra, tentacruel };
  };

  it("the attack waits for the defending player; fleeing keeps the damage but prevents the Poison, and brings the chosen Pokémon up", () => {
    const { state, abra } = setup();
    const paused = attack(deepFreeze(state), "Tóxico");
    const step = paused.pendingAttackChoice!.step;
    expect(step.chooser).toBe("opponent");
    expect(step.minSelections).toBe(0);
    expect(step.options.map((o) => o.id)).toEqual([abra.pokemon.id]);
    expect(paused.opponentActivePokemon!.currentDamage).toBe(0);

    const fled = resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true });
    expect(fled.opponentActivePokemon!.pokemon.name).toBe("Abra");
    const tentacruel = fled.opponentBench.find((p) => p.pokemon.name === "Misty's Tentacruel")!;
    expect(tentacruel.currentDamage).toBe(20);
    expect(tentacruel.statusConditions).toEqual([]);
    expect(fled.opponentActivePokemon!.statusConditions).toEqual([]);
    expect(fled.attackedThisTurn).toBe(true);

    const stayed = resolveAttackChoice(paused, [], { skipEndTurn: true });
    expect(stayed.opponentActivePokemon!.pokemon.name).toBe("Misty's Tentacruel");
    expect(stayed.opponentActivePokemon!.currentDamage).toBe(20);
    expect(stayed.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Poisoned);
  });

  it("Metronome waits too, and is used again with the answer (same coins)", () => {
    const abra = inPlay("Abra");
    const clefairy = inPlay("Clefairy", { energy: [Fire, Fire, Fire] });
    const state = vs(clefairy, gym("Misty's Tentacruel"), { opponent: { bench: [abra] } });
    const copied = attacksOf(state.opponentActivePokemon!)[0];
    const paused = executeMetronome(state, copied, { coinResults: [H], skipEndTurn: true });
    expect(paused.pendingAttackChoice?.reaction?.resume).toMatchObject({ kind: "attack", copiedAttack: { name: copied.name } });
    expect(attacksOf(paused.playerActivePokemon!)).toEqual(attacksOf(clefairy));
    expect(paused.opponentActivePokemon!.currentDamage).toBe(0);
    const stayed = resolveAttackChoice(paused, [], { skipEndTurn: true });
    expect(stayed.opponentActivePokemon!.currentDamage).toBe(30);
    expect(stayed.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Poisoned);
    const fled = resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true });
    expect(fled.opponentActivePokemon!.pokemon.name).toBe("Abra");
    expect(fled.opponentBench[0].currentDamage).toBe(30);
    expect(fled.opponentBench[0].statusConditions).toEqual([]);
    expect(attacksOf(fled.playerActivePokemon!).map((a) => a.name)).toContain("Metrónomo");
  });

  it("the turn ends after the answer when the caller doesn't skip it", () => {
    const { state, abra } = setup();
    const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, "Tóxico") };
    const paused = executeAttack(armed, attackIndex(armed.playerActivePokemon!, "Tóxico"), { coinResults: [] });
    expect(paused.turnNumber).toBe(state.turnNumber);
    const fled = resolveAttackChoice(paused, [abra.pokemon.id]);
    expect(fled.turnNumber).toBe(state.turnNumber + 1);
  });

  it("isn't offered when it is already Asleep/Confused/Paralyzed, under Toxic Gas, Knocked Out, or without a Bench", () => {
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const { state } = setup(gym("Misty's Tentacruel", { statuses: [status] }));
      expect(attack(state, "Tóxico").pendingAttackChoice).toBeUndefined();
    }
    expect(attack({ ...setup().state, playerBench: [muk()] }, "Tóxico").pendingAttackChoice).toBeUndefined();
    const ko = attack(setup(gym("Misty's Tentacruel", { damage: 60 })).state, "Tóxico");
    expect(ko.pendingAttackChoice).toBeUndefined();
    expect(names(ko.opponentDiscard)).toContain("Misty's Tentacruel");
    const alone = attack(vs(inPlay("Nidoking"), gym("Misty's Tentacruel")), "Tóxico");
    expect(alone.pendingAttackChoice).toBeUndefined();
    expect(alone.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Poisoned);
  });
});

// ---------------------------------------------------------------------------- #12 Rebirth

describe("Rebirth (Rocket's Moltres): Knocked Out → back to the hand after discarding it", () => {
  it("Knocked Out by an attack: the Prize is still taken; Moltres goes to the hand, its Energy to the discard pile", () => {
    const moltres = gym("Rocket's Moltres", { damage: 40, energy: [Fire] });
    const next = attack(vs(inPlay("Electabuzz"), moltres, { opponent: { bench: [inPlay("Abra")] } }), "Puño-trueno", [T]);
    expect(next.playerCanTakePrize).toBe(true);
    expect(names(next.opponentHand)).toContain("Rocket's Moltres");
    expect(names(next.opponentDiscard)).toEqual(["Fire Energy"]);
  });

  it("Knocked Out on the Bench: the Prize is taken automatically and Moltres goes to the hand", () => {
    const moltres = gym("Rocket's Moltres", { damage: 50 });
    const next = attack(vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Onix"), { opponent: { bench: [moltres] } }), "Vapor Venenoso");
    expect(next.opponentBench).toEqual([]);
    expect(prizesOwed(next, "player")).toBe(1);
    expect(names(next.opponentHand)).toContain("Rocket's Moltres");
    expect(names(next.opponentDiscard)).not.toContain("Rocket's Moltres");
  });

  it("can't be used if Moltres is Asleep/Confused/Paralyzed when Knocked Out, nor under Toxic Gas", () => {
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const moltres = gym("Rocket's Moltres", { damage: 40, statuses: [status] });
      const next = attack(vs(inPlay("Electabuzz"), moltres, { opponent: { bench: [inPlay("Abra")] } }), "Puño-trueno", [T]);
      expect(names(next.opponentDiscard)).toContain("Rocket's Moltres");
      expect(names(next.opponentHand)).not.toContain("Rocket's Moltres");
    }
    const moltres = gym("Rocket's Moltres", { damage: 40 });
    const next = attack(vs(inPlay("Electabuzz"), moltres, { opponent: { bench: [inPlay("Abra"), muk()] } }), "Puño-trueno", [T]);
    expect(names(next.opponentDiscard)).toContain("Rocket's Moltres");
  });
});

// ---------------------------------------------------------------------------- #26 Fragrance Trap

describe("Fragrance Trap (Erika's Victreebel): once per turn flip; heads = switch 1 of the opponent's Benched Pokémon with their Active", () => {
  const setup = (victreebel = gym("Erika's Victreebel"), extra: Parameters<typeof makeState>[0] = {}) => {
    const abra = inPlay("Abra");
    const machop = inPlay("Machop", { statuses: [StatusCondition.Poisoned] });
    return { state: makeState({ ...extra, player: { active: inPlay("Onix"), bench: [victreebel] }, opponent: { active: machop, bench: [abra] } }), abra, victreebel };
  };

  it("heads: the chosen Benched Pokémon becomes the opponent's Active (from the Bench too); once per turn", () => {
    const { state, abra, victreebel } = setup();
    const id = victreebel.pokemon.id;
    expect(canUsePokemonPower(deepFreeze(state), id)).toBeNull();
    expect(getPowerCoinFlips(state, id)).toBe(1);
    expect(getPowerSteps(state, id, [], [T])).toBeNull();
    expect(getPowerSteps(state, id, [], [H])!.options.map((o) => o.id)).toEqual([abra.pokemon.id]);
    const heads = usePokemonPower(state, id, [[abra.pokemon.id]], { coinResults: [H] });
    expect(heads.opponentActivePokemon!.pokemon.name).toBe("Abra");
    expect(heads.opponentBench[0].pokemon.name).toBe("Machop");
    expect(heads.opponentBench[0].statusConditions).toEqual([]);
    expect(canUsePokemonPower(heads, id)).toMatch(/ya fue usado/);

    const tails = usePokemonPower(state, id, [], { coinResults: [T] });
    expect(tails.opponentActivePokemon!.pokemon.name).toBe("Machop");
    expect(canUsePokemonPower(tails, id)).toMatch(/ya fue usado/);
  });

  it("can't be used while Asleep/Confused/Paralyzed (as the Active) or under Goop Gas Attack", () => {
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const victreebel = gym("Erika's Victreebel", { statuses: [status] });
      const state = makeState({ player: { active: victreebel }, opponent: { active: inPlay("Machop"), bench: [inPlay("Abra")] } });
      expect(canUsePokemonPower(state, victreebel.pokemon.id)).not.toBeNull();
    }
    const { state, victreebel } = setup(gym("Erika's Victreebel"), goop);
    expect(canUsePokemonPower(state, victreebel.pokemon.id)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------- #29 Shell Armor

describe("Shell Armor (Misty's Cloyster): damage done to it by attacks is 10 less (after Weakness and Resistance)", () => {
  it("Electabuzz's 30 doubled by Weakness is 50; bench damage too", () => {
    const hit = attack(vs(inPlay("Electabuzz"), gym("Misty's Cloyster")), "Puño-trueno", [T]);
    expect(hit.opponentActivePokemon!.currentDamage).toBe(50);
    const bench = attack(vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Onix"), { opponent: { bench: [gym("Misty's Cloyster")] } }), "Vapor Venenoso");
    expect(bench.opponentBench[0].currentDamage).toBe(0);
  });

  it("doesn't work while Asleep/Confused/Paralyzed or under Toxic Gas; Swift ignores it", () => {
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const hit = attack(vs(inPlay("Electabuzz"), gym("Misty's Cloyster", { statuses: [status] })), "Puño-trueno", [T]);
      expect(hit.opponentActivePokemon!.currentDamage).toBe(60);
    }
    expect(attack(vs(inPlay("Electabuzz"), gym("Misty's Cloyster"), { player: { bench: [muk()] } }), "Puño-trueno", [T]).opponentActivePokemon!.currentDamage).toBe(60);
    const swift = attack(vs(gym("Misty's Staryu"), gym("Misty's Cloyster")), "Rapidez");
    expect(swift.opponentActivePokemon!.currentDamage).toBe(20);
  });
});

// ---------------------------------------------------------------------------- #33 Restless Sleep

describe("Restless Sleep (Rocket's Snorlax): the opponent's attack damages it while it is Asleep → 20 damage to the attacker", () => {
  it("does 20 to the attacking Pokémon, even when Snorlax is Knocked Out", () => {
    const asleep = gym("Rocket's Snorlax", { statuses: [StatusCondition.Asleep] });
    const hit = attack(vs(inPlay("Machop"), asleep), "Patada baja");
    expect(hit.opponentActivePokemon!.currentDamage).toBe(40);
    expect(hit.playerActivePokemon!.currentDamage).toBe(20);
    const ko = attack(vs(inPlay("Machop"), gym("Rocket's Snorlax", { statuses: [StatusCondition.Asleep], damage: 60 })), "Patada baja");
    expect(ko.opponentActivePokemon).toBeNull();
    expect(ko.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("nothing when Snorlax isn't Asleep, under Toxic Gas, or when the attack does no damage", () => {
    expect(attack(vs(inPlay("Machop"), gym("Rocket's Snorlax")), "Patada baja").playerActivePokemon!.currentDamage).toBe(0);
    const asleep = () => gym("Rocket's Snorlax", { statuses: [StatusCondition.Asleep] });
    expect(attack(vs(inPlay("Machop"), asleep(), { player: { bench: [muk()] } }), "Patada baja").playerActivePokemon!.currentDamage).toBe(0);
    expect(attack(vs(inPlay("Onix"), asleep()), "Endurecimiento").playerActivePokemon!.currentDamage).toBe(0);
  });
});

// ---------------------------------------------------------------------------- #42 Strange Barrier

describe("Strange Barrier (Erika's Dratini): 20 or more damage from a Basic Pokémon's attack is reduced to 10", () => {
  it("a Basic's 20 becomes 10; an Evolved Pokémon's 20 stays; 10 stays 10; bench damage too", () => {
    expect(attack(vs(inPlay("Hitmonchan"), gym("Erika's Dratini")), "Puño Bala").opponentActivePokemon!.currentDamage).toBe(10);
    expect(attack(vs(inPlay("Raichu"), gym("Erika's Dratini")), "Agilidad", [T]).opponentActivePokemon!.currentDamage).toBe(20);
    expect(attack(vs(inPlay("Pikachu"), gym("Erika's Dratini")), "Roer").opponentActivePokemon!.currentDamage).toBe(10);
    const tunnel = attack(vs(gym("Brock's Onix"), inPlay("Abra"), { opponent: { bench: [gym("Erika's Dratini")] } }), "Túnel");
    const dratini = tunnel.opponentBench[0];
    const done = executeBenchDamage(tunnel, [dratini.pokemon.id], { skipEndTurn: true });
    expect(done.opponentBench[0].currentDamage).toBe(10);
  });

  it("stops while Asleep/Confused/Paralyzed or under Goop Gas Attack; Swift ignores it", () => {
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      expect(attack(vs(inPlay("Hitmonchan"), gym("Erika's Dratini", { statuses: [status] })), "Puño Bala").opponentActivePokemon!.currentDamage).toBe(20);
    }
    expect(attack(vs(inPlay("Hitmonchan"), gym("Erika's Dratini"), goop), "Puño Bala").opponentActivePokemon!.currentDamage).toBe(20);
    expect(attack(vs(gym("Misty's Staryu"), gym("Erika's Dratini")), "Rapidez").opponentActivePokemon!.currentDamage).toBe(20);
  });
});

// ---------------------------------------------------------------------------- #47 Photosynthesis

describe("Photosynthesis (Erika's Oddish): every Energy card attached provides Grass Energy instead (works while statused)", () => {
  it("Water and Fire Energy pay its Grass cost and provide only Grass while on it", () => {
    const oddish = gym("Erika's Oddish", { energy: [Water, Fire] });
    const state = vs(oddish, inPlay("Machop"));
    expect(canExecuteAttack(state, 0)).toBeNull();
    expect(energyProvidesType(oddish.attachedEnergy[0], Grass, oddish, state)).toBe(true);
    expect(energyProvidesType(oddish.attachedEnergy[0], Water, oddish, state)).toBe(false);
    // Off Oddish the card is a Water Energy again
    expect(energyProvidesType(oddish.attachedEnergy[0], Water)).toBe(true);
    const hit = attack(state, "Polvo Veneno", [H]);
    expect(hit.opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("works while Asleep/Confused/Paralyzed; not under Toxic Gas", () => {
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const oddish = gym("Erika's Oddish", { energy: [Water, Fire], statuses: [status] });
      const state = vs(oddish, inPlay("Machop"));
      expect(canUseAttack(oddish, 0, undefined, state)).toBe(true);
      expect(energyProvidesType(oddish.attachedEnergy[0], Grass, oddish, state)).toBe(true);
    }
    const oddish = gym("Erika's Oddish", { energy: [Water, Fire] });
    const toxic = vs(oddish, inPlay("Machop"), { opponent: { bench: [muk()] } });
    expect(canUseAttack(oddish, 0, undefined, toxic)).toBe(false);
    expect(energyProvidesType(oddish.attachedEnergy[0], Grass, oddish, toxic)).toBe(false);
  });
});

// ---------------------------------------------------------------------------- #65 Natural Healing

describe("Natural Healing (Blaine's Vulpix): once per turn, remove 1 damage counter from itself", () => {
  it("removes 10 (from the Bench too); once per turn; needs damage", () => {
    const vulpix = gym("Blaine's Vulpix", { damage: 20 });
    const state = deepFreeze(makeState({ player: { active: inPlay("Onix"), bench: [vulpix] }, opponent: { active: inPlay("Machop") } }));
    expect(canUsePokemonPower(state, vulpix.pokemon.id)).toBeNull();
    expect(getPowerSteps(state, vulpix.pokemon.id, [])).toBeNull();
    const healed = usePokemonPower(state, vulpix.pokemon.id);
    expect(healed.playerBench[0].currentDamage).toBe(10);
    expect(canUsePokemonPower(healed, vulpix.pokemon.id)).toMatch(/ya fue usado/);
    const unhurt = makeState({ player: { active: gym("Blaine's Vulpix") }, opponent: { active: inPlay("Machop") } });
    expect(canUsePokemonPower(unhurt, unhurt.playerActivePokemon!.pokemon.id)).not.toBeNull();
  });

  it("can't be used while Asleep/Confused/Paralyzed or under Toxic Gas", () => {
    for (const status of [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed]) {
      const vulpix = gym("Blaine's Vulpix", { damage: 20, statuses: [status] });
      const state = makeState({ player: { active: vulpix }, opponent: { active: inPlay("Machop") } });
      expect(canUsePokemonPower(state, vulpix.pokemon.id)).not.toBeNull();
    }
    const vulpix = gym("Blaine's Vulpix", { damage: 20 });
    const state = makeState({ player: { active: vulpix }, opponent: { active: inPlay("Machop"), bench: [muk()] } });
    expect(canUsePokemonPower(state, vulpix.pokemon.id)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------- log wording

describe("log lines of the powers are perspective-free (CLAUDE.md event convention)", () => {
  const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival)\b/;
  const newLines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);

  it("Flee, Bench Guard, Pollen Defense, Rebirth, Restless Sleep, Shell Armor, Fragrance Trap, Energy Charge, Natural Healing", () => {
    const lines: string[] = [];
    const abra = inPlay("Abra");
    const flee = vs(inPlay("Nidoking"), gym("Misty's Tentacruel"), { opponent: { bench: [abra] } });
    const paused = attack(flee, "Tóxico");
    lines.push(...newLines(flee, paused), ...newLines(paused, resolveAttackChoice(paused, [abra.pokemon.id], { skipEndTurn: true })));

    const guard = vs(inPlay("Dark Arbok", { set: "rocket" }), inPlay("Machop"), { opponent: { bench: [inPlay("Abra"), gym("Brock's Rhydon")] } });
    const guardPaused = attack(guard, "Vapor Venenoso");
    lines.push(...newLines(guard, guardPaused), ...newLines(guardPaused, resolveAttackChoice(guardPaused, [guard.opponentBench[0].pokemon.id], { skipEndTurn: true })));

    const pollen = vs(inPlay("Machop", { energy: [Fighting] }), gym("Erika's Vileplume"));
    lines.push(...newLines(pollen, attack(pollen, "Patada baja", [H])));
    const rebirth = vs(inPlay("Electabuzz"), gym("Rocket's Moltres", { damage: 40 }), { opponent: { bench: [inPlay("Abra")] } });
    lines.push(...newLines(rebirth, attack(rebirth, "Puño-trueno", [T])));
    const restless = vs(inPlay("Machop"), gym("Rocket's Snorlax", { statuses: [StatusCondition.Asleep] }));
    lines.push(...newLines(restless, attack(restless, "Patada baja")));
    const armor = vs(inPlay("Electabuzz"), gym("Misty's Cloyster"));
    lines.push(...newLines(armor, attack(armor, "Puño-trueno", [T])));

    const victreebel = gym("Erika's Victreebel");
    const trap = makeState({ player: { active: inPlay("Onix"), bench: [victreebel] }, opponent: { active: inPlay("Machop"), bench: [inPlay("Abra")] } });
    lines.push(...newLines(trap, usePokemonPower(trap, victreebel.pokemon.id, [[trap.opponentBench[0].pokemon.id]], { coinResults: [H] })));
    const magneton = gym("Lt. Surge's Magneton");
    const charge = makeState({ player: { active: magneton, bench: [inPlay("Pikachu", { energy: [Lightning] })] }, opponent: { active: inPlay("Onix") } });
    lines.push(...newLines(charge, usePokemonPower(charge, magneton.pokemon.id, [[charge.playerBench[0].attachedEnergy[0].id]])));
    const vulpix = gym("Blaine's Vulpix", { damage: 20 });
    const heal = makeState({ player: { active: vulpix }, opponent: { active: inPlay("Onix") } });
    lines.push(...newLines(heal, usePokemonPower(heal, vulpix.pokemon.id)));

    expect(lines.length).toBeGreaterThan(10);
    // (the Base Set bench damage and automatic promotion lines keep their old relative wording)
    const LEGACY = /del rival recibió \d+ de daño$|pasa a ser el Pokémon activo del rival$/;
    expect(lines.filter((m) => RELATIVE.test(m) && !LEGACY.test(m))).toEqual([]);
  });
});
