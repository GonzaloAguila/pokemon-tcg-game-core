/**
 * Copied attacks and copied Pokémon in the damage pipeline: Metronome (Clefairy / Clefable)
 * copying Fossil / Team Rocket attacks, Ditto's Transform facing Dark and Fossil Pokémon,
 * Mirror Move against Kabuto Armor, and attacks that depend on the attacker's damage counters.
 */
import { describe, it, expect } from "vitest";
import { executeAttack, executeMetronome, resolveAttackChoice } from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import type { Attack } from "@/domain/cards";
import { isPokemonCard } from "@/domain/cards";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, armedFor, attackIndex, names } from "./helpers/state";
import { evolvePokemonCard } from "@/domain/board";

const { Water, Fighting, Colorless } = EnergyType;
type Coin = "heads" | "tails";

function attack(state: GameState, name: string, coins: Coin[] = [], extra: Record<string, unknown> = {}): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true, ...extra });
}
const attackOf = (pokemon: PokemonInPlay, name: string): Attack => {
  if (!isPokemonCard(pokemon.pokemon)) throw new Error("not a Pokémon");
  return pokemon.pokemon.attacks[attackIndex(pokemon, name)];
};
const clefable = (opts: Parameters<typeof inPlay>[1] = {}) => inPlay("Clefable", { set: "jungle", energy: [Colorless], ...opts });
const metronome = (state: GameState, copied: Attack, coins: Coin[] = [], extra: Record<string, unknown> = {}) =>
  executeMetronome(state, copied, { coinResults: coins, skipEndTurn: true, ...extra });

describe("Metronome copying attacks of other sets", () => {
  it("Clefable copies Golem's Selfdestruct: Knocked Out, and the card in the discard pile is the real Clefable", () => {
    const golem = inPlay("Golem", { set: "fossil" });
    const user = clefable();
    const state = makeState({ player: { active: user, bench: [inPlay("Machop")] }, opponent: { active: golem, bench: [inPlay("Abra")] } });
    const after = metronome(state, attackOf(golem, "Autodestrucción"), [], { skipDefenderPromotion: true });
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentActivePokemon).toBeNull(); // 100 to Golem (80 HP)
    const discarded = after.playerDiscard.find((c) => c.id === user.pokemon.id)!;
    expect(discarded).toBeDefined();
    expect(isPokemonCard(discarded) && discarded.attacks.map((a) => a.name)).toEqual(["Metrónomo", "Minimizar"]);
    // Bench damage on both sides (Abra 30 HP − 20 survives? 20 < 30)
    expect(after.playerBench[0].currentDamage).toBe(20);
    expect(after.opponentBench[0].currentDamage).toBe(20);
  });

  it("a Strikes Back Knock Out after Metronome also leaves the real card in the discard pile", () => {
    const machamp = inPlay("Machamp");
    const user = clefable({ damage: 60 });
    const state = makeState({ player: { active: user, bench: [inPlay("Machop")] }, opponent: { active: machamp } });
    const after = metronome(state, attackOf(machamp, "Lanzamiento Sísmico"));
    expect(after.opponentActivePokemon!.currentDamage).toBe(60);
    expect(after.playerActivePokemon).toBeNull();
    const discarded = after.playerDiscard.find((c) => c.id === user.pokemon.id)!;
    expect(isPokemonCard(discarded) && discarded.attacks.map((a) => a.name)).toEqual(["Metrónomo", "Minimizar"]);
  });

  it("Metronome keeps Clefable's Colorless type: Meditate copied from a Psychic-weak Mr. Mime isn't doubled", () => {
    const mime = inPlay("Mr. Mime", { set: "jungle", damage: 10 });
    const state = makeState({ player: { active: clefable() }, opponent: { active: mime } });
    // Meditate: 10 + 10 per counter on the Defending Pokémon = 20 more (10 + 20 = 30), no Psychic Weakness
    expect(metronome(state, attackOf(mime, "Meditar")).opponentActivePokemon!.currentDamage).toBe(30);
  });

  it("Metronome copying Rage counts Clefable's own damage counters", () => {
    const cubone = inPlay("Cubone", { set: "jungle" });
    const state = makeState({ player: { active: clefable({ damage: 30 }) }, opponent: { active: cubone } });
    // Rage 10 + 30 = 40 vs Cubone (40 HP): Knocked Out
    const after = metronome(state, attackOf(cubone, "Rage"), [], { skipDefenderPromotion: true });
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.playerCanTakePrize).toBe(true);
  });

  it("Metronome copying Dark Primeape's Frenzied Attack: 40, Clefable is Confused, no Frenzy bonus (not its power)", () => {
    const primeape = inPlay("Dark Primeape", { set: "rocket" });
    const state = makeState({ player: { active: clefable({ statuses: [StatusCondition.Confused] }) }, opponent: { active: primeape } });
    const after = metronome(state, attackOf(primeape, "Ataque Frenético"));
    expect(after.opponentActivePokemon!.currentDamage).toBe(40);
    expect(after.playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
  });

  it("Metronome copying Flitter (Dark Golbat): the chosen Benched Pokémon takes 20; Clefable keeps its attacks", () => {
    const golbat = inPlay("Dark Golbat", { set: "rocket" });
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: clefable() }, opponent: { active: golbat, bench: [abra] } });
    const pending = metronome(state, attackOf(golbat, "Revoloteo"));
    const done = resolveAttackChoice(pending, [abra.pokemon.id], { skipEndTurn: true });
    expect(done.opponentBench[0].currentDamage).toBe(20);
    const card = done.playerActivePokemon!.pokemon;
    expect(isPokemonCard(card) && card.attacks.map((a) => a.name)).toEqual(["Metrónomo", "Minimizar"]);
  });
});

describe("Transform (Ditto) facing Dark and Fossil Pokémon", () => {
  it("Ditto copying Dark Gyarados has its 70 HP but not Final Beam: Knocked Out, no coin, no damage back", () => {
    // Ditto (50 damage) faces a Dark Gyarados with 3 Water: as a copy it has 70 HP
    const ditto = inPlay("Ditto", { set: "fossil", damage: 50 });
    const state = makeState({
      player: { active: inPlay("Dark Gyarados", { set: "rocket", energy: [Water, Water, Water] }), bench: [inPlay("Abra")] },
      opponent: { active: ditto, bench: [inPlay("Onix")] },
    });
    // Ice Beam 30 (tails: no Paralysis): 80 ≥ 70 → KO; the coin plan has no defender coin for Ditto
    const after = attack(state, "Rayo Hielo", ["tails"], { skipDefenderPromotion: true });
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.playerActivePokemon!.currentDamage).toBe(0);
    expect(after.playerCanTakePrize).toBe(true);
  });

  it("Ditto copying Machamp doesn't strike back; copying Kabuto doesn't halve damage", () => {
    // Machamp's Seismic Toss vs Ditto-as-Machamp (100 HP): 60, and nothing comes back to Machamp
    const machamp = inPlay("Machamp", { energy: [Fighting, Fighting, Fighting, Fighting] });
    const vsMachamp = makeState({ player: { active: machamp }, opponent: { active: inPlay("Ditto", { set: "fossil" }) } });
    const tossed = attack(vsMachamp, "Lanzamiento Sísmico");
    expect(tossed.opponentActivePokemon!.currentDamage).toBe(60);
    expect(tossed.playerActivePokemon!.currentDamage).toBe(0);
    const kabutoVsDitto = makeState({ player: { active: inPlay("Kabuto", { set: "fossil" }) }, opponent: { active: inPlay("Ditto", { set: "fossil" }) } });
    // Kabuto's Scratch 10 vs Ditto-as-Kabuto (Grass-weak, no armor for Ditto): 10
    expect(attack(kabutoVsDitto, "Arañazo").opponentActivePokemon!.currentDamage).toBe(10);
  });

  it("Ditto copies a Dark Pokémon's attack and pays it with any Energy: Frenzied Attack 40 and Ditto is Confused", () => {
    const ditto = inPlay("Ditto", { set: "fossil", energy: [Water, Water] });
    const state = makeState({ player: { active: ditto }, opponent: { active: inPlay("Dark Primeape", { set: "rocket" }) } });
    // Copy of Dark Primeape: Fighting attack vs Dark Primeape (Psychic-weak): 40
    const after = executeAttack(state, 0, { coinResults: [], skipEndTurn: true });
    expect(after.opponentActivePokemon!.currentDamage).toBe(40);
    expect(after.playerActivePokemon!.statusConditions).toContain(StatusCondition.Confused);
  });

  it("Ditto copying Dark Primeape doesn't get Frenzy: a confused Ditto is a plain Ditto anyway (50 HP)", () => {
    const ditto = inPlay("Ditto", { set: "fossil", damage: 40, statuses: [StatusCondition.Confused] });
    const state = makeState({ player: { active: inPlay("Machop") }, opponent: { active: ditto, bench: [inPlay("Abra")] } });
    // Confused Ditto is plain Ditto (Fighting-weak): Low Kick 20 × 2 = 40 → 80 ≥ 50
    const after = attack(state, "Patada baja", [], { skipDefenderPromotion: true });
    expect(after.opponentActivePokemon).toBeNull();
    expect(names(after.opponentDiscard)).toContain("Ditto");
  });
});

describe("Mirror Move and Kabuto Armor", () => {
  it("Pidgeotto's Mirror Move copies the final damage (no W/R) and Kabuto Armor halves it", () => {
    const pidgeotto = inPlay("Pidgeotto", { lastDamageReceived: 20 });
    const state = makeState({ player: { active: pidgeotto }, opponent: { active: inPlay("Kabuto", { set: "fossil" }) } });
    expect(attack(state, "Movimiento Espejo").opponentActivePokemon!.currentDamage).toBe(10);
  });

  it("a PlusPowered attack resisted to 0 leaves nothing for Mirror Move to copy", () => {
    // Pidgeotto resists Fighting: Low Kick 20 − 30 = 0 → nothing to mirror, PlusPower doesn't add
    const plus = { id: "pp", source: "plusPower" as const, card: inPlay("Machop").pokemon, amount: 10, expiresAfterTurn: 3, playerId: "player" as const };
    const state = makeState({ player: { active: inPlay("Machop") }, opponent: { active: inPlay("Pidgeotto") }, activeModifiers: [plus] });
    const after = attack(state, "Patada baja");
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
    expect(after.opponentActivePokemon!.lastDamageReceived).toBeUndefined();
  });
});


describe("Metronome and \"can't use this attack again\" (Leek Slap)", () => {
  it("Clefable can copy Farfetch'd's Leek Slap on two turns: the limit is Farfetch'd's, not Clefable's", () => {
    const farfetchd = inPlay("Farfetch'd");
    const state = makeState({ player: { active: clefable() }, opponent: { active: farfetchd, bench: [inPlay("Abra")] } });
    const first = metronome(state, attackOf(farfetchd, "Bofetada Puerro"), ["heads"]);
    expect(first.opponentActivePokemon!.currentDamage).toBe(30);
    const nextTurn = { ...first, attackedThisTurn: false, turnNumber: first.turnNumber + 2 };
    // 30 + 30 = 60 ≥ 50 HP: the second copy is legal and Knocks Farfetch'd Out
    const second = metronome(nextTurn, attackOf(farfetchd, "Bofetada Puerro"), ["heads"], { skipDefenderPromotion: true });
    expect(second.opponentActivePokemon).toBeNull();
    expect(names(second.opponentDiscard)).toContain("Farfetch'd");
  });
});

describe("Transform under Toxic Gas", () => {
  it("Muk evolving on the other side turns a damaged Ditto back into a 50 HP Ditto: Knocked Out at once, Prize taken", () => {
    const muk = gameCard("Muk", "fossil");
    const grimer = inPlay("Grimer", { set: "fossil" });
    const ditto = inPlay("Ditto", { set: "fossil", damage: 60 });
    const state = makeState({
      player: { active: inPlay("Machamp"), bench: [grimer], hand: [muk] },
      opponent: { active: ditto, bench: [inPlay("Abra")] },
    });
    const next = evolvePokemonCard(state, muk.id, grimer.pokemon.id);
    expect(next.opponentActivePokemon).toBeNull();
    expect(names(next.opponentDiscard)).toContain("Ditto");
    expect(next.playerPrizes).toHaveLength(5);
    expect(next.opponentNeedsToPromote).toBe(true);
  });
});
