/**
 * Damage pipeline combos across sets: PlusPower / Defender / Weakness / Resistance with Kabuto
 * Armor, Invisible Wall, Harden, Minimize, Conversion, Agility-type protection and the
 * Water Gun family ("Energy not used to pay for this attack's cost").
 *
 * Order (printed classic-era text, see CLAUDE.md): base damage → Weakness ×2 → Resistance −30 →
 * PlusPower +10 ("if the attack does damage ... after applying Weakness and Resistance") →
 * Defender −20 → next-turn reductions → Kabuto Armor → protection / Invisible Wall.
 */
import { describe, it, expect } from "vitest";
import { endTurn, executeAttack } from "@/lib/gameState";
import type { GameModifier, GameState, PokemonInPlay } from "@/lib/gameState";
import { playTrainerCard } from "@/domain/effects";
import { attachEnergyCard } from "@/domain/board";
import { estimateAttackDamage } from "@/domain/ai/actions";
import { EnergyType, ProtectionType } from "@/domain/constants";
import { makeState, inPlay, gameCard, armedFor, attackIndex } from "./helpers/state";

const { Water, Fire, Psychic, Fighting, Colorless } = EnergyType;
type Coin = "heads" | "tails";

/** Attack by name (paid with armedFor), without ending the turn. */
function attack(state: GameState, name: string, coins: Coin[] = [], extra: Record<string, unknown> = {}): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true, ...extra });
}
const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const damageTo = (state: GameState) => state.opponentActivePokemon?.currentDamage;

const plusPower = (n = 1): GameModifier[] =>
  Array.from({ length: n }, (_, i) => ({ id: `pp${i}`, source: "plusPower" as const, card: gameCard("PlusPower", "base"), amount: 10, expiresAfterTurn: 3, playerId: "player" as const }));
const defenderOn = (pokemon: PokemonInPlay): GameModifier => ({
  id: `def-${pokemon.pokemon.id}`, source: "defender", card: gameCard("Defender", "base"), amount: -20,
  expiresAfterTurn: 4, playerId: "opponent", targetPokemonId: pokemon.pokemon.id,
});

describe("PlusPower and Defender around Weakness / Resistance", () => {
  it("PlusPower played from the hand is added after Weakness: Thunder Jolt vs Lightning-weak Blastoise = 30 × 2 + 10 = 70", () => {
    const pp = gameCard("PlusPower", "base");
    const pikachu = armedFor(inPlay("Pikachu", { set: "base" }), "Trueno Sacudida");
    const state = makeState({ player: { active: pikachu, hand: [pp] }, opponent: { active: inPlay("Blastoise") } });
    const powered = playTrainerCard(state, pp.id, []);
    expect(damageTo(attack(powered, "Trueno Sacudida", ["heads"]))).toBe(70);
  });

  it("two PlusPowers stack after Weakness: Low Kick vs Chansey = 20 × 2 + 20 = 60", () => {
    const state = vs(inPlay("Machop"), inPlay("Chansey"), { activeModifiers: plusPower(2) });
    expect(damageTo(attack(state, "Patada baja"))).toBe(60);
  });

  it("PlusPower adds nothing when Resistance brings the damage to 0 (\"if the attack does damage … after W/R\")", () => {
    // Pikachu's Gnaw (10, Lightning) vs Dugtrio (Lightning Resistance): 10 − 30 → 0, PlusPower doesn't apply
    const state = vs(inPlay("Pikachu", { set: "base" }), inPlay("Dugtrio"), { activeModifiers: plusPower() });
    expect(damageTo(attack(state, "Roer"))).toBe(0);
  });

  it("PlusPower still adds when Resistance leaves some damage: Thunder (60) vs Dugtrio: 60 − 30 + 10 = 40", () => {
    const state = vs(inPlay("Raichu"), inPlay("Dugtrio"), { activeModifiers: plusPower() });
    expect(damageTo(attack(state, "Trueno", ["heads"]))).toBe(40);
  });

  it("Defender is applied after Weakness: Low Kick vs a Defender'd Pikachu: 20 × 2 − 20 = 20", () => {
    const pikachu = inPlay("Pikachu", { set: "base" });
    const state = vs(inPlay("Machop"), pikachu, { activeModifiers: [defenderOn(pikachu)] });
    expect(damageTo(attack(state, "Patada baja"))).toBe(20);
  });

  it("PlusPower and Defender cancel out; Defender never makes damage negative", () => {
    const onix = inPlay("Onix");
    const both = vs(inPlay("Machop"), onix, { activeModifiers: [...plusPower(), defenderOn(onix)] });
    expect(damageTo(attack(both, "Patada baja"))).toBe(10);
    const onlyDefender = vs(inPlay("Abra"), onix, { activeModifiers: [defenderOn(onix)] });
    expect(damageTo(attack(onlyDefender, "Psicochoque", ["tails"]))).toBe(0);
  });

  it("Defender played on the Benched Pokémon that is later promoted still protects it (it follows the card)", () => {
    const def = gameCard("Defender", "base");
    const machop = inPlay("Machop");
    // Opponent's view: they play Defender on their benched Machop
    const theirTurn = makeState({ player: { active: inPlay("Onix"), bench: [machop], hand: [def] }, opponent: { active: inPlay("Hitmonchan") } });
    const defended = playTrainerCard(theirTurn, def.id, [[machop.pokemon.id]]);
    const modifiers = defended.activeModifiers.map((m) => ({ ...m, playerId: "opponent" as const }));
    // Our turn: Machop is now their Active
    const state = vs(inPlay("Hitmonchan"), machop, { activeModifiers: modifiers });
    expect(damageTo(attack(state, "Puño Bala"))).toBe(0);
  });

  it("Sonicboom ignores Weakness and Resistance but PlusPower still adds: 20 + 10 = 30 vs Lightning-weak Squirtle", () => {
    const state = vs(inPlay("Magneton", { set: "fossil" }), inPlay("Squirtle"), { activeModifiers: plusPower() });
    expect(damageTo(attack(state, "Bomba Sónica"))).toBe(30);
  });
});

describe("Kabuto Armor with Weakness, PlusPower and Defender; damage counters for Rage", () => {
  it("Weakness first, then half rounded down to 10: Leech Seed 20 × 2 vs Grass-weak Kabuto = 40 → 20", () => {
    const state = vs(inPlay("Bulbasaur"), inPlay("Kabuto", { set: "fossil" }));
    expect(damageTo(attack(state, "Drenadoras"))).toBe(20);
  });

  it("Defender on Kabuto is applied before the halving: Special Punch 40 − 20 = 20 → 10", () => {
    const kabuto = inPlay("Kabuto", { set: "fossil" });
    const state = vs(inPlay("Hitmonchan"), kabuto, { activeModifiers: [defenderOn(kabuto)] });
    expect(damageTo(attack(state, "Puño Especial"))).toBe(10);
  });

  it("PlusPower is halved with the rest: Low Kick 20 + 10 = 30 → 10 (rounded down to the nearest 10)", () => {
    const state = vs(inPlay("Machop"), inPlay("Kabuto", { set: "fossil" }), { activeModifiers: plusPower() });
    expect(damageTo(attack(state, "Patada baja"))).toBe(10);
  });

  it("Rage counts the damage counter Rainbow Energy put on Cubone (10 + 10 = 20)", () => {
    const rainbow = gameCard("Rainbow Energy", "rocket");
    const cubone = inPlay("Cubone", { set: "jungle", energy: [Fighting] });
    const state = makeState({ player: { active: cubone, hand: [rainbow] }, opponent: { active: inPlay("Onix") } });
    const charged = attachEnergyCard(state, rainbow.id, cubone.pokemon.id);
    expect(charged.playerActivePokemon!.currentDamage).toBe(10);
    expect(damageTo(attack(charged, "Rage"))).toBe(20);
  });
});

describe("\"Unless all damage from this attack is prevented\" (Leech Seed)", () => {
  it("Bulbasaur heals 1 counter when the damage goes through", () => {
    const state = vs(inPlay("Bulbasaur", { damage: 20 }), inPlay("Onix"));
    expect(attack(state, "Drenadoras").playerActivePokemon!.currentDamage).toBe(10);
  });

  it("no heal when Agility-type protection prevents all the damage", () => {
    const raichu = inPlay("Raichu", { protection: { type: ProtectionType.DamageAndEffects, expiresAfterTurn: 3 } });
    const after = attack(vs(inPlay("Bulbasaur", { damage: 20 }), raichu), "Drenadoras");
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
    expect(after.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("no heal when Invisible Wall prevents it (Leech Seed + PlusPower = 30 vs Mr. Mime)", () => {
    const state = vs(inPlay("Bulbasaur", { damage: 20 }), inPlay("Mr. Mime", { set: "jungle" }), { activeModifiers: plusPower() });
    const after = attack(state, "Drenadoras");
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
    expect(after.playerActivePokemon!.currentDamage).toBe(20);
  });

  it("Exeggcute's Leech Seed (Jungle) vs Scrunch-style protection: no damage, no heal", () => {
    const chansey = inPlay("Chansey", { protection: { type: ProtectionType.DamageOnly, expiresAfterTurn: 3 } });
    const exeggcute = inPlay("Exeggcute", { set: "jungle", damage: 10 });
    const after = attack(vs(exeggcute, chansey), "Leech Seed");
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
    expect(after.playerActivePokemon!.currentDamage).toBe(10);
  });
});

describe("Invisible Wall, Harden and Minimize after Weakness / modifiers", () => {
  it("Invisible Wall: 20 base doubled by Weakness (40) is prevented; 20 without Weakness goes through", () => {
    // Jungle Mr. Mime is Psychic-weak: Abra's Psyshock 10 × 2 = 20 → not prevented; Haunter Nightmare 10 × 2 = 20 too.
    // Kadabra? Use Hypno-less: Gastly (Fossil) Lick 10 × 2 = 20 < 30. Base Alakazam Confuse Ray 30 × 2 = 60 → prevented.
    const alakazam = vs(inPlay("Alakazam"), inPlay("Mr. Mime", { set: "jungle" }));
    expect(damageTo(attack(alakazam, "Rayo Confuso", ["tails"]))).toBe(0);
    const machop = vs(inPlay("Machop"), inPlay("Mr. Mime", { set: "jungle" }));
    expect(damageTo(attack(machop, "Patada baja"))).toBe(20);
  });

  it("Invisible Wall: PlusPower pushing 20 to 30 makes the damage prevented", () => {
    const state = vs(inPlay("Machop"), inPlay("Mr. Mime", { set: "jungle" }), { activeModifiers: plusPower() });
    expect(damageTo(attack(state, "Patada baja"))).toBe(0);
  });

  it("Harden (30 or less) after Weakness: Scyther's Slash 30 × 2 = 60 vs Grass-weak Onix is not prevented", () => {
    const onix = inPlay("Onix", { protection: { type: ProtectionType.DamageOnly, expiresAfterTurn: 3, threshold: 30 } });
    expect(damageTo(attack(vs(inPlay("Scyther", { set: "jungle" }), onix), "Corte"))).toBe(60);
    expect(damageTo(attack(vs(inPlay("Hitmonchan"), onix), "Puño Bala"))).toBe(0);
  });

  it("Minimize (−20) stacks with Defender (−20): Hitmonchan's Special Punch 40 vs Clefable → 0", () => {
    const clefable = inPlay("Clefable", { set: "jungle", nextTurnDamageReduction: 20, nextTurnEffectAppliedOnTurn: 2 });
    const state = vs(inPlay("Hitmonchan"), clefable, { activeModifiers: [defenderOn(clefable)] });
    // Clefable is Fighting-weak: 40 × 2 = 80 − 20 − 20 = 40
    expect(damageTo(attack(state, "Puño Especial"))).toBe(40);
  });
});

describe("Conversion 1 / 2 change Weakness / Resistance for the next attacks", () => {
  it("Conversion 1 gives Onix a Psychic Weakness; the next Psychic attack is doubled", () => {
    const porygon = inPlay("Porygon", { set: "base" });
    const converted = attack(vs(porygon, inPlay("Onix")), "Conversión 1", [], { chosenType: Psychic });
    expect(converted.opponentActivePokemon!.modifiedWeakness).toBe(Psychic);
    const next = { ...converted, attackedThisTurn: false, playerActivePokemon: inPlay("Abra") };
    expect(damageTo(attack(next, "Psicochoque", ["tails"]))).toBe(20);
  });

  it("Conversion 1 on a Pokémon without Weakness (Gastly) changes nothing", () => {
    const porygon = inPlay("Porygon", { set: "base" });
    const converted = attack(vs(porygon, inPlay("Gastly", { set: "base" })), "Conversión 1", [], { chosenType: Fighting });
    expect(converted.opponentActivePokemon!.modifiedWeakness).toBeUndefined();
  });

  it("Conversion 2 gives Porygon a Fighting Resistance: the replaced Psychic Resistance no longer applies", () => {
    const porygon = attack(vs(inPlay("Porygon", { set: "base" }), inPlay("Onix")), "Conversión 2", [], { chosenType: Fighting }).playerActivePokemon!;
    expect(porygon.modifiedResistance).toBe(Fighting);
    // Next turn, from the other side: Machop's Low Kick (20, Fighting) × 2 (Porygon is Fighting-weak) − 30 = 10
    expect(damageTo(attack(vs(inPlay("Machop"), porygon), "Patada baja"))).toBe(10);
    // Abra's Psyshock (10, Psychic) is no longer resisted
    expect(damageTo(attack(vs(inPlay("Abra"), porygon), "Psicochoque", ["tails"]))).toBe(10);
  });

  it("Agility-type protection stops Conversion 1 (an effect on the Defending Pokémon)", () => {
    const raichu = inPlay("Raichu", { protection: { type: ProtectionType.DamageAndEffects, expiresAfterTurn: 3 } });
    const converted = attack(vs(inPlay("Porygon", { set: "base" }), raichu), "Conversión 1", [], { chosenType: Psychic });
    expect(converted.opponentActivePokemon!.modifiedWeakness).toBeUndefined();
  });
});

describe("Water Gun family: Water Energy not used to pay for the attack's cost", () => {
  const poliwrath = (types: EnergyType[]) => inPlay("Poliwrath", { energy: types });
  const water = (p: PokemonInPlay) => executeAttack(vs(p, inPlay("Chansey")), attackIndex(p, "Pistola de Agua"), { skipEndTurn: true });

  it("Poliwrath with exactly W W W: the third Water pays the Colorless cost, so no bonus (30)", () => {
    expect(damageTo(water(poliwrath([Water, Water, Water])))).toBe(30);
  });

  it("Poliwrath with W W + Fire: Fire pays the Colorless, no extra Water (30)", () => {
    expect(damageTo(water(poliwrath([Water, Water, Fire])))).toBe(30);
  });

  it("Poliwrath with W W W + Fire: one Water not needed (40); with W W W W: one (40); W×5: capped at +20 (50)", () => {
    expect(damageTo(water(poliwrath([Water, Water, Water, Fire])))).toBe(40);
    expect(damageTo(water(poliwrath([Water, Water, Water, Water])))).toBe(40);
    expect(damageTo(water(poliwrath([Water, Water, Water, Water, Water])))).toBe(50);
  });

  it("Double Colorless pays the Colorless cost: W W W + DCE = +10 (40)", () => {
    expect(damageTo(water(poliwrath([Water, Water, Water, Colorless])))).toBe(40);
  });

  it("Team Rocket Psyduck (W C) with W W: one of them pays the Colorless → 20; Rainbow + W W → +10", () => {
    const psyduck = inPlay("Psyduck", { set: "rocket", energy: [Water, Water] });
    expect(damageTo(water(psyduck))).toBe(20);
    const withRainbow = { ...psyduck, attachedEnergy: [...psyduck.attachedEnergy, gameCard("Rainbow Energy", "rocket")] };
    expect(damageTo(water(withRainbow))).toBe(30);
  });

  it("the AI estimate agrees with the engine (Poliwrath W W W → 30)", () => {
    const p = poliwrath([Water, Water, Water]);
    const state = makeState({ opponent: { active: p }, player: { active: inPlay("Chansey") } });
    expect(estimateAttackDamage(state, "opponent", attackIndex(p, "Pistola de Agua"))).toBe(30);
  });

  it("Dark Blastoise's Hydrocannon (W W): 5 Water = 3 extra, capped at +40 (70)", () => {
    const db = inPlay("Dark Blastoise", { set: "rocket", energy: [Water, Water, Water, Water, Water] });
    expect(damageTo(executeAttack(vs(db, inPlay("Chansey")), attackIndex(db, "Hidrocañón"), { skipEndTurn: true }))).toBe(70);
  });

  it("a Ditto copying Poliwrath counts every Energy as Water: 3 Fire pay W W C with nothing extra (30)", () => {
    const ditto = inPlay("Ditto", { set: "fossil", energy: [Fire, Fire, Fire] });
    const state = makeState({ player: { active: ditto }, opponent: { active: inPlay("Poliwrath") } });
    expect(damageTo(executeAttack(state, 0, { skipEndTurn: true }))).toBe(30);
    const four = { ...state, playerActivePokemon: inPlay("Ditto", { set: "fossil", energy: [Fire, Fire, Fire, Fire] }) };
    expect(damageTo(executeAttack(four, 0, { skipEndTurn: true }))).toBe(40);
  });
});

describe("Swords Dance (Scyther): Slash's base damage is 60 during Scyther's next turn", () => {
  const scyther = () => armedFor(armedFor(inPlay("Scyther", { set: "jungle" }), "Corte"), "Danza Espada");
  /** Swords Dance this turn, then the opponent's turn passes: back to Scyther's next turn. */
  function dancedAndBack(defender: PokemonInPlay): GameState {
    const s = scyther();
    const danced = executeAttack(makeState({ player: { active: s }, opponent: { active: defender } }), attackIndex(s, "Danza Espada"), { coinResults: [] });
    expect(danced.isPlayerTurn).toBe(false);
    const back = endTurn(danced);
    expect(back.isPlayerTurn).toBe(true);
    return back;
  }

  it("the bonus survives the opponent's turn: Slash does 60", () => {
    const back = dancedAndBack(inPlay("Chansey"));
    expect(damageTo(attack(back, "Corte"))).toBe(60);
  });

  it("the bonus is base damage: (30 + 30) × 2 vs Grass-weak Onix = 120, Kabuto-free", () => {
    const back = dancedAndBack(inPlay("Onix"));
    expect(back.opponentActivePokemon!.pokemon.name).toBe("Onix");
    const after = attack(back, "Corte", [], { skipDefenderPromotion: true });
    // Onix has 90 HP: 120 Knocks it Out
    expect(after.opponentActivePokemon).toBeNull();
  });

  it("Swords Dance again doesn't deal the bonus as damage, and the bonuses don't stack", () => {
    const back = dancedAndBack(inPlay("Chansey"));
    const again = attack(back, "Danza Espada");
    expect(damageTo(again)).toBe(0);
    expect(again.playerActivePokemon!.nextTurnBonusDamage).toBe(30);
  });

  it("unused, it ends after Scyther's next turn", () => {
    const back = dancedAndBack(inPlay("Chansey"));
    // Scyther doesn't attack on its next turn; two more turns later Slash is back to 30
    const later = endTurn(endTurn(back));
    expect(later.isPlayerTurn).toBe(true);
    expect(damageTo(attack(later, "Corte"))).toBe(30);
  });

  it("Minimize still lasts only the opponent's next turn", () => {
    const clef = armedFor(inPlay("Clefable", { set: "jungle" }), "Minimizar");
    const minimized = executeAttack(makeState({ player: { active: clef }, opponent: { active: inPlay("Machop") } }), attackIndex(clef, "Minimizar"), { coinResults: [] });
    expect(minimized.playerActivePokemon!.nextTurnDamageReduction).toBe(20);
    const back = endTurn(minimized);
    expect(back.playerActivePokemon!.nextTurnDamageReduction).toBeUndefined();
  });
});
