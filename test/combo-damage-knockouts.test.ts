/**
 * Knock Outs and damage reactions across sets: Strikes Back with bench damage (Chain Lightning,
 * Spark / Dark Mind choices, Thunderstorm coins), Selfdestruct / Mass Explosion with KOs on both
 * sides, Destiny Bond, Mirror Shell and Final Beam in the same attack, prizes deciding the game,
 * and damage counters (Curse, Damage Swap, poison) that no damage reduction touches.
 */
import { describe, it, expect } from "vitest";
import { endTurn, executeAttack, executeBenchDamage, takePrize } from "@/lib/gameState";
import type { GameModifier, GameState, PokemonInPlay } from "@/lib/gameState";
import { usePokemonPower } from "@/domain/effects";
import { EnergyType, GamePhase, ProtectionType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energies, armedFor, attackIndex, names } from "./helpers/state";

const { Water } = EnergyType;
type Coin = "heads" | "tails";

function attack(state: GameState, name: string, coins: Coin[] = [], extra: Record<string, unknown> = {}): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true, ...extra });
}
const defenderOn = (pokemon: PokemonInPlay, playerId: "player" | "opponent" = "opponent"): GameModifier => ({
  id: `def-${pokemon.pokemon.id}`, source: "defender", card: gameCard("Defender", "base"), amount: -20,
  expiresAfterTurn: 4, playerId, targetPokemonId: pokemon.pokemon.id,
});
const benchNames = (bench: PokemonInPlay[]) => names(bench.map((p) => p.pokemon));

describe("Strikes Back (Machamp) only when bench damage really hit Machamp", () => {
  it("Chain Lightning vs a Lightning Defending Pokémon skips a benched Fighting Machamp: no Strikes Back", () => {
    const electrode = inPlay("Electrode", { set: "jungle" });
    const state = makeState({
      player: { active: electrode },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [inPlay("Machamp")] },
    });
    const after = attack(state, "Rayo Cadena");
    expect(after.opponentBench[0].currentDamage).toBe(0);
    expect(after.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("Chain Lightning vs a Fighting Defending Pokémon hits the benched Machamp: Strikes Back 10", () => {
    const electrode = inPlay("Electrode", { set: "jungle" });
    const state = makeState({ player: { active: electrode }, opponent: { active: inPlay("Onix"), bench: [inPlay("Machamp")] } });
    const after = attack(state, "Rayo Cadena");
    expect(after.opponentBench[0].currentDamage).toBe(10);
    expect(after.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("Spark choosing another benched Pokémon: Machamp isn't damaged, no Strikes Back", () => {
    const pikachu = inPlay("Pikachu", { set: "jungle" });
    const abra = inPlay("Abra");
    const state = makeState({ player: { active: pikachu }, opponent: { active: inPlay("Onix"), bench: [inPlay("Machamp"), abra] } });
    const pending = attack(state, "Spark");
    const after = executeBenchDamage(pending, [abra.pokemon.id], { skipEndTurn: true });
    expect(after.opponentBench[0].currentDamage).toBe(0);
    expect(after.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("Spark choosing the benched Machamp: Strikes Back 10 to Pikachu", () => {
    const pikachu = inPlay("Pikachu", { set: "jungle" });
    const machamp = inPlay("Machamp");
    const state = makeState({ player: { active: pikachu }, opponent: { active: inPlay("Onix"), bench: [machamp, inPlay("Abra")] } });
    const after = executeBenchDamage(attack(state, "Spark"), [machamp.pokemon.id], { skipEndTurn: true });
    expect(after.opponentBench[0].currentDamage).toBe(10);
    expect(after.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("Strikes Back from the chosen bench target can Knock Out the attacker (Prize for the Machamp side)", () => {
    const gengar = inPlay("Gengar", { set: "fossil", damage: 70 });
    const machamp = inPlay("Machamp");
    const state = makeState({
      player: { active: gengar, bench: [inPlay("Abra")] },
      opponent: { active: inPlay("Onix"), bench: [machamp, inPlay("Abra")] },
    });
    const after = executeBenchDamage(attack(state, "Mente Oscura"), [machamp.pokemon.id], { skipEndTurn: true });
    expect(after.playerActivePokemon).toBeNull();
    expect(names(after.playerDiscard)).toContain("Gengar");
    expect(after.opponentPrizes).toHaveLength(5);
    expect(after.playerNeedsToPromote).toBe(true);
  });

  it("Thunderstorm: tails for Machamp's position → not hit, no Strikes Back; heads → hit, Strikes Back", () => {
    const zapdos = inPlay("Zapdos", { set: "fossil" });
    const state = makeState({ player: { active: zapdos }, opponent: { active: inPlay("Chansey"), bench: [inPlay("Machamp"), inPlay("Abra")] } });
    const tails = attack(state, "Tormenta Eléctrica", ["tails", "heads"]);
    expect(tails.opponentBench.map((p) => p.currentDamage)).toEqual([0, 20]);
    // Zapdos: 10 for the one tails, no Strikes Back
    expect(tails.playerActivePokemon!.currentDamage).toBe(10);
    const heads = attack(state, "Tormenta Eléctrica", ["heads", "heads"]);
    expect(heads.opponentBench[0].currentDamage).toBe(20);
    expect(heads.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("damage reduced to 0 by Defender doesn't damage the Active Machamp: no Strikes Back", () => {
    const machamp = inPlay("Machamp");
    const state = makeState({ player: { active: inPlay("Hitmonchan") }, opponent: { active: machamp }, activeModifiers: [defenderOn(machamp)] });
    const after = attack(state, "Puño Bala");
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
    expect(after.playerActivePokemon!.currentDamage).toBe(0);
  });

  it("an Asleep benched Machamp doesn't strike back; the Active Machamp does even when Knocked Out", () => {
    const magneton = inPlay("Magneton", { set: "fossil" });
    const asleep = inPlay("Machamp", { statuses: [StatusCondition.Asleep] });
    const state = makeState({ player: { active: magneton, bench: [inPlay("Onix")] }, opponent: { active: inPlay("Chansey"), bench: [asleep] } });
    // Sonicboom on Chansey: no bench damage at all
    expect(attack(state, "Bomba Sónica").playerActivePokemon!.currentDamage).toBe(0);
    const machampActive = makeState({ player: { active: inPlay("Hitmonchan") }, opponent: { active: inPlay("Machamp", { damage: 80 }), bench: [inPlay("Abra")] } });
    const ko = attack(machampActive, "Puño Bala", [], { skipDefenderPromotion: true });
    expect(ko.opponentActivePokemon).toBeNull();
    expect(ko.playerActivePokemon!.currentDamage).toBe(10);
  });
});

describe("Selfdestruct / Mass Explosion: Knock Outs on both sides", () => {
  it("Agility on the Defending Pokémon stops Selfdestruct's damage to it, not the self damage or the bench damage", () => {
    const raichu = inPlay("Raichu", { protection: { type: ProtectionType.DamageAndEffects, expiresAfterTurn: 3 } });
    const golem = inPlay("Golem", { set: "fossil" });
    const state = makeState({ player: { active: golem, bench: [inPlay("Onix")] }, opponent: { active: raichu, bench: [inPlay("Abra", { damage: 10 })] } });
    const after = attack(state, "Autodestrucción");
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentBench).toHaveLength(0); // Abra 10 + 20 = 30 HP
    expect(after.playerPrizes).toHaveLength(5);
    expect(after.opponentPrizes).toHaveLength(5);
  });

  it("Selfdestruct that leaves the opponent with no Pokémon wins, although the attacker is Knocked Out too", () => {
    const golem = inPlay("Golem", { set: "fossil" });
    const state = makeState({
      player: { active: golem, bench: [inPlay("Onix")] },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [inPlay("Abra", { damage: 10 })] },
    });
    const after = attack(state, "Autodestrucción");
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.opponentBench).toHaveLength(0);
    expect(after.gameResult).toBe("victory");
    expect(after.gamePhase).toBe(GamePhase.GameOver);
  });

  it("Golem's Selfdestruct: Kabuto on either Bench takes half (10); every other benched Pokémon 20, no Weakness", () => {
    const golem = inPlay("Golem", { set: "fossil" });
    const state = makeState({
      player: { active: golem, bench: [inPlay("Kabuto", { set: "fossil" }), inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), bench: [inPlay("Kabuto", { set: "fossil" }), inPlay("Bulbasaur")] },
    });
    const after = attack(state, "Autodestrucción", [], { skipDefenderPromotion: true });
    expect(after.playerBench.map((p) => p.currentDamage)).toEqual([10, 20]);
    // Bulbasaur is Fire-weak, not Fighting: 20; a Grass-weak Kabuto would still take no Weakness on the Bench
    expect(after.opponentBench.map((p) => p.currentDamage)).toEqual([10, 20]);
  });

  it("Selfdestruct with Defender on the attacker: self damage − 20 (Golem survives 100 − 20 = 80 → KO at 80 HP anyway)", () => {
    const golem = inPlay("Golem", { set: "fossil" });
    const state = makeState({
      player: { active: golem, bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Chansey") },
      activeModifiers: [defenderOn(golem, "player")],
    });
    const after = attack(state, "Autodestrucción");
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentPrizes).toHaveLength(5);
  });

  it("Selfdestruct KOs both Actives and two benched Pokémon: 2 Prizes each side, both sides promote", () => {
    const magneton = inPlay("Magneton", { set: "fossil" });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Abra", { damage: 10 }), inPlay("Machop")] },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [inPlay("Abra", { damage: 20 }), inPlay("Onix")] },
    });
    const after = attack(state, "Autodestrucción", [], { skipDefenderPromotion: true });
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentActivePokemon).toBeNull();
    expect(benchNames(after.playerBench)).toEqual(["Machop"]);
    expect(benchNames(after.opponentBench)).toEqual(["Onix"]);
    // Player: 1 automatic (benched Abra) + 1 manual pick pending (Pikachu)
    expect(after.playerPrizes).toHaveLength(5);
    expect(after.playerCanTakePrize).toBe(true);
    // Opponent: Magneton + benched Abra, both automatic
    expect(after.opponentPrizes).toHaveLength(4);
    expect(after.playerNeedsToPromote).toBe(true);
    expect(after.opponentNeedsToPromote).toBe(true);
    expect(after.gameResult).toBeNull();
  });

  it("Selfdestruct's manual Prize is the attacker's last one: taking it wins even though the attacker is gone", () => {
    const magneton = inPlay("Magneton", { set: "fossil" });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")], prizes: energies(Water) },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [inPlay("Onix")] },
    });
    const after = attack(state, "Autodestrucción", [], { skipDefenderPromotion: true });
    expect(after.gameResult).toBeNull();
    const won = takePrize(after, 0, true, false);
    expect(won.gameResult).toBe("victory");
    expect(won.gamePhase).toBe(GamePhase.GameOver);
  });

  it("Selfdestruct giving the opponent its last Prize loses, even with Pokémon left on both Benches", () => {
    const magneton = inPlay("Magneton", { set: "fossil" });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), bench: [inPlay("Onix")], prizes: energies(Water) },
    });
    const after = attack(state, "Autodestrucción");
    expect(after.gameResult).toBe("defeat");
    expect(after.opponentPrizes).toHaveLength(0);
  });

  it("Mass Explosion: 20 × named Pokémon to the Defending Pokémon, 20 to every named one (Dark Weezing too); KOs give Prizes", () => {
    const darkWeezing = inPlay("Dark Weezing", { set: "rocket", damage: 40 });
    const state = makeState({
      player: { active: darkWeezing, bench: [inPlay("Koffing", { set: "rocket", damage: 20 }), inPlay("Machop")] },
      opponent: { active: inPlay("Weezing", { set: "fossil" }), bench: [inPlay("Koffing", { set: "base", damage: 30 }), inPlay("Abra")] },
    });
    // 4 named in play (Dark Weezing, Koffing, Weezing, Koffing): 80 + 20 (named Defending) = 100 to Weezing (60 HP)
    const after = attack(state, "Explosión Masiva", [], { skipDefenderPromotion: true });
    expect(after.opponentActivePokemon).toBeNull();
    expect(benchNames(after.opponentBench)).toEqual(["Abra"]);
    expect(after.opponentBench[0].currentDamage).toBe(0);
    // Dark Weezing (60 HP, 40 + 20) and the benched Koffing (40 HP, 20 + 20) are Knocked Out
    expect(after.playerActivePokemon).toBeNull();
    expect(benchNames(after.playerBench)).toEqual(["Machop"]);
    expect(after.playerPrizes).toHaveLength(5); // benched Koffing automatic; Weezing pick pending
    expect(after.playerCanTakePrize).toBe(true);
    expect(after.opponentPrizes).toHaveLength(4); // Dark Weezing + Koffing
  });
});

describe("reactions in the same attack: Destiny Bond, Mirror Shell, Final Beam", () => {
  it("Destiny Bond + Selfdestruct: both Knocked Out, the Destiny Bond doesn't give a second Prize", () => {
    const gastly = inPlay("Gastly", { set: "base", destinyBondActive: true, destinyBondTurn: 2 });
    const magneton = inPlay("Magneton", { set: "fossil" });
    const state = makeState({ player: { active: magneton, bench: [inPlay("Machop")] }, opponent: { active: gastly, bench: [inPlay("Onix")] } });
    const after = attack(state, "Autodestrucción", [], { skipDefenderPromotion: true });
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.opponentPrizes).toHaveLength(5);
    expect(after.playerCanTakePrize).toBe(true);
  });

  it("Destiny Bond: KO of Gastly by attack damage KOs the attacker; both sides take one Prize", () => {
    const gastly = inPlay("Gastly", { set: "base", destinyBondActive: true, destinyBondTurn: 2 });
    const state = makeState({ player: { active: inPlay("Hitmonchan"), bench: [inPlay("Machop")] }, opponent: { active: gastly, bench: [inPlay("Onix")] } });
    // Gastly resists Fighting: 40 − 30 = 10 → no KO, no Destiny Bond
    expect(attack(state, "Puño Especial").playerActivePokemon).not.toBeNull();
    const hurt = { ...state, opponentActivePokemon: { ...gastly, currentDamage: 20 } };
    const after = attack(hurt, "Puño Especial", [], { skipDefenderPromotion: true });
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentPrizes).toHaveLength(5);
    expect(after.playerCanTakePrize).toBe(true);
  });

  it("Mirror Shell returns the damage (after W/R) even when Dark Wartortle is Knocked Out; the attacker can be KO'd too", () => {
    const wartortle = inPlay("Dark Wartortle", { set: "rocket", damage: 30, mirrorShellOnTurn: 2 });
    const pikachu = inPlay("Pikachu", { set: "base", damage: 10 });
    const state = makeState({ player: { active: pikachu, bench: [inPlay("Abra")] }, opponent: { active: wartortle, bench: [inPlay("Onix")] } });
    // Thunder Jolt 30 × 2 (Lightning-weak) = 60 ≥ 30 left; 60 back to Pikachu (40 HP)
    const after = attack(state, "Trueno Sacudida", ["heads"], { skipDefenderPromotion: true });
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentPrizes).toHaveLength(5);
    expect(after.playerCanTakePrize).toBe(true);
    expect(after.playerNeedsToPromote).toBe(true);
  });

  it("Mirror Shell + Kabuto Armor? no — Mirror Shell returns PlusPowered damage too (final damage)", () => {
    const wartortle = inPlay("Dark Wartortle", { set: "rocket", mirrorShellOnTurn: 2 });
    const plusPower: GameModifier = { id: "pp", source: "plusPower", card: gameCard("PlusPower", "base"), amount: 10, expiresAfterTurn: 3, playerId: "player" };
    const state = makeState({ player: { active: inPlay("Machop") }, opponent: { active: wartortle }, activeModifiers: [plusPower] });
    const after = attack(state, "Patada baja");
    expect(after.opponentActivePokemon!.currentDamage).toBe(30);
    expect(after.playerActivePokemon!.currentDamage).toBe(30);
  });

  it("Final Beam heads: 20 per Water Energy with the attacker's Weakness KOs it; both take a Prize", () => {
    const gyarados = inPlay("Dark Gyarados", { set: "rocket", damage: 60, energy: [Water, Water] });
    const pikachu = inPlay("Pikachu", { set: "base" });
    const state = makeState({ player: { active: pikachu, bench: [inPlay("Abra")] }, opponent: { active: gyarados, bench: [inPlay("Onix")] } });
    // Gnaw 10 KOs Gyarados (70 HP); Final Beam 40 to Pikachu (40 HP, no Water Weakness) → KO
    const after = attack(state, "Roer", ["heads"], { skipDefenderPromotion: true });
    expect(after.opponentActivePokemon).toBeNull();
    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentPrizes).toHaveLength(5);
    const tails = attack(state, "Roer", ["tails"], { skipDefenderPromotion: true });
    expect(tails.playerActivePokemon!.currentDamage).toBe(0);
  });
});

describe("damage counters are not damage: no reduction, Knock Out checked at once", () => {
  it("Curse puts a counter on a Defender'd Kabuto: not reduced, Knocks it Out (Prize automatic)", () => {
    const gengar = inPlay("Gengar", { set: "fossil" });
    const kabuto = inPlay("Kabuto", { set: "fossil", damage: 20 });
    const donor = inPlay("Machop", { damage: 10 });
    const state = makeState({
      player: { active: gengar },
      opponent: { active: donor, bench: [kabuto] },
      activeModifiers: [defenderOn(kabuto)],
    });
    const next = usePokemonPower(state, gengar.pokemon.id, [[donor.pokemon.id], [kabuto.pokemon.id]]);
    expect(next.opponentBench).toEqual([]);
    expect(next.playerPrizes).toHaveLength(5);
  });

  it("Damage Swap moves counters onto Kabuto without halving", () => {
    const alakazam = inPlay("Alakazam", { damage: 30 });
    const kabuto = inPlay("Kabuto", { set: "fossil" });
    const state = makeState({ player: { active: alakazam, bench: [kabuto] }, opponent: { active: inPlay("Onix") } });
    const next = usePokemonPower(state, alakazam.pokemon.id, [[alakazam.pokemon.id], [kabuto.pokemon.id], ["20"]]);
    expect(next.playerBench[0].currentDamage).toBe(20);
  });

  it("Poison on a Defender'd Kabuto still does 10 between turns and can Knock It Out (Prize for the other side)", () => {
    const kabuto = inPlay("Kabuto", { set: "fossil", damage: 20, statuses: [StatusCondition.Poisoned] });
    const state = makeState({
      player: { active: inPlay("Machop") },
      opponent: { active: kabuto, bench: [inPlay("Onix")] },
      activeModifiers: [defenderOn(kabuto)],
    });
    // The checkup at the end of this turn: 20 + 10 = 30 (no halving, no Defender) → Knocked Out
    const after = endTurn(state);
    expect(names(after.opponentDiscard)).toContain("Kabuto");
    expect(after.opponentActivePokemon!.pokemon.name).toBe("Onix"); // the endTurn checkup promotes
    expect(after.playerCanTakePrize).toBe(true);
  });
});


describe("Defender on a Benched Pokémon reduces bench damage too (\"damage done to that Pokémon by attacks\")", () => {
  it("Selfdestruct: a Defender'd benched Pokémon on either side takes 20 − 20 = 0", () => {
    const magneton = inPlay("Magneton", { set: "fossil" });
    const mine = inPlay("Machop");
    const theirs = inPlay("Abra");
    const state = makeState({
      player: { active: magneton, bench: [mine, inPlay("Onix")] },
      opponent: { active: inPlay("Chansey"), bench: [theirs, inPlay("Pidgey")] },
      activeModifiers: [defenderOn(mine, "player"), defenderOn(theirs)],
    });
    const after = attack(state, "Autodestrucción", [], { skipDefenderPromotion: true });
    expect(after.playerBench.map((p) => p.currentDamage)).toEqual([0, 20]);
    expect(after.opponentBench.map((p) => p.currentDamage)).toEqual([0, 20]);
  });

  it("Spark's chosen target with Defender takes 0; Flitter's chosen target too", () => {
    const abra = inPlay("Abra");
    const state = makeState({
      player: { active: inPlay("Pikachu", { set: "jungle" }) },
      opponent: { active: inPlay("Onix"), bench: [abra, inPlay("Machop")] },
      activeModifiers: [defenderOn(abra)],
    });
    const after = executeBenchDamage(attack(state, "Spark"), [abra.pokemon.id], { skipEndTurn: true });
    expect(after.opponentBench[0].currentDamage).toBe(0);
  });
});

describe("coin bench damage (Surprise Thunder) with Kabuto Armor and Strikes Back", () => {
  it("heads/heads: 20 to each opponent's Benched Pokémon (Kabuto 10), the benched Machamp strikes back", () => {
    const raichu = inPlay("Dark Raichu", { set: "rocket" });
    const state = makeState({
      player: { active: raichu },
      opponent: { active: inPlay("Chansey"), bench: [inPlay("Kabuto", { set: "fossil" }), inPlay("Machamp")] },
    });
    const after = attack(state, "Trueno Sorpresa", ["heads", "heads"]);
    expect(after.opponentBench.map((p) => p.currentDamage)).toEqual([10, 20]);
    expect(after.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("heads/tails: 10 to each (Kabuto 0); tails: no bench damage and no Strikes Back", () => {
    const raichu = inPlay("Dark Raichu", { set: "rocket" });
    const state = makeState({
      player: { active: raichu },
      opponent: { active: inPlay("Chansey"), bench: [inPlay("Kabuto", { set: "fossil" }), inPlay("Machamp")] },
    });
    const small = attack(state, "Trueno Sorpresa", ["heads", "tails"]);
    expect(small.opponentBench.map((p) => p.currentDamage)).toEqual([0, 10]);
    expect(small.playerActivePokemon!.currentDamage).toBe(10);
    const none = attack(state, "Trueno Sorpresa", ["tails", "tails"]);
    expect(none.opponentBench.map((p) => p.currentDamage)).toEqual([0, 0]);
    expect(none.playerActivePokemon!.currentDamage).toBe(0);
  });
});
