/**
 * Interactions between the new sets (Fossil, Team Rocket) and Base Set / Jungle cards:
 * Dark evolution lines (an Evolution card only goes onto the exact name it evolves from) and
 * Rainbow / Full Heal / Potion Energy against older Energy and damage effects.
 */
import { describe, it, expect } from "vitest";
import { executeAttack } from "@/lib/gameState";
import { attachEnergyCard, canAttachEnergy, evolvePokemonCard, getEvolutionTargets } from "@/domain/board";
import { getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, names, attackIndex } from "./helpers/state";

const { Water } = EnergyType;
const rainbow = () => gameCard("Rainbow Energy", "rocket");
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });
const opponent = { active: inPlay("Onix") };

describe("Dark evolution lines", () => {
  it("Dark Wartortle evolves into Dark Blastoise, never into Blastoise", () => {
    const darkWartortle = rocket("Dark Wartortle");
    const blastoise = gameCard("Blastoise", "base");
    const darkBlastoise = gameCard("Dark Blastoise", "rocket");
    const state = makeState({ player: { active: darkWartortle, hand: [blastoise, darkBlastoise] }, opponent });
    expect(getEvolutionTargets(state, blastoise.id)).toEqual([]);
    expect(getEvolutionTargets(state, darkBlastoise.id)).toEqual([darkWartortle.pokemon.id]);
    expect(() => evolvePokemonCard(state, blastoise.id, darkWartortle.pokemon.id)).toThrow();
    expect(evolvePokemonCard(state, darkBlastoise.id, darkWartortle.pokemon.id).playerActivePokemon!.pokemon.name).toBe("Dark Blastoise");
  });

  it("Wartortle evolves into Blastoise, never into Dark Blastoise", () => {
    const wartortle = inPlay("Wartortle");
    const blastoise = gameCard("Blastoise", "base");
    const darkBlastoise = gameCard("Dark Blastoise", "rocket");
    const state = makeState({ player: { active: wartortle, hand: [blastoise, darkBlastoise] }, opponent });
    expect(getEvolutionTargets(state, darkBlastoise.id)).toEqual([]);
    expect(getEvolutionTargets(state, blastoise.id)).toEqual([wartortle.pokemon.id]);
  });

  it("the same Basic takes both lines; a Basic from another set counts (same name)", () => {
    const squirtle = inPlay("Squirtle");
    const rocketCharmander = rocket("Charmander");
    const [wartortle, darkWartortle] = [gameCard("Wartortle", "base"), gameCard("Dark Wartortle", "rocket")];
    const [charmeleon, darkCharmeleon] = [gameCard("Charmeleon", "base"), gameCard("Dark Charmeleon", "rocket")];
    const state = makeState({
      player: { active: squirtle, bench: [rocketCharmander], hand: [wartortle, darkWartortle, charmeleon, darkCharmeleon] },
      opponent,
    });
    expect(getEvolutionTargets(state, wartortle.id)).toEqual([squirtle.pokemon.id]);
    expect(getEvolutionTargets(state, darkWartortle.id)).toEqual([squirtle.pokemon.id]);
    expect(getEvolutionTargets(state, charmeleon.id)).toEqual([rocketCharmander.pokemon.id]);
    expect(getEvolutionTargets(state, darkCharmeleon.id)).toEqual([rocketCharmander.pokemon.id]);
  });

  it("Charmeleon can't become Dark Charizard; Raichu can't become Dark Raichu (it evolves from Pikachu)", () => {
    const charmeleon = inPlay("Charmeleon");
    const raichu = inPlay("Raichu");
    const pikachu = inPlay("Pikachu", { set: "jungle" });
    const darkCharizard = gameCard("Dark Charizard", "rocket");
    const darkRaichu = gameCard("Dark Raichu", "rocket");
    const state = makeState({ player: { active: charmeleon, bench: [raichu, pikachu], hand: [darkCharizard, darkRaichu] }, opponent });
    expect(getEvolutionTargets(state, darkCharizard.id)).toEqual([]);
    expect(getEvolutionTargets(state, darkRaichu.id)).toEqual([pikachu.pokemon.id]);
  });

  it("Pokémon Breeder: Squirtle → Dark Blastoise (through Dark Wartortle) is legal; Charmeleon isn't a Basic", () => {
    const breeder = gameCard("Pokémon Breeder", "base");
    const darkBlastoise = gameCard("Dark Blastoise", "rocket");
    const darkCharizard = gameCard("Dark Charizard", "rocket");
    const squirtle = inPlay("Squirtle", { playedOnTurn: 0 });
    const state = makeState({ player: { active: squirtle, hand: [breeder, darkBlastoise, darkCharizard] }, opponent });
    expect(getTrainerSteps(state, breeder.id, [])?.options.map((o) => o.id)).toEqual([darkBlastoise.id]);
    const next = playTrainerCard(state, breeder.id, [[darkBlastoise.id], [squirtle.pokemon.id]]);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Dark Blastoise");
  });

  it("Devolution Spray on Dark Blastoise gives back Dark Wartortle", () => {
    const spray = gameCard("Devolution Spray", "base");
    const darkWartortle = rocket("Dark Wartortle");
    const darkBlastoise = gameCard("Dark Blastoise", "rocket");
    const state = makeState({ player: { active: darkWartortle, hand: [darkBlastoise, spray] }, opponent });
    const evolved = { ...evolvePokemonCard(state, darkBlastoise.id, darkWartortle.pokemon.id), turnNumber: state.turnNumber + 2 };
    const devolved = playTrainerCard(evolved, spray.id, [[evolved.playerActivePokemon!.pokemon.id]]);
    expect(devolved.playerActivePokemon!.pokemon.name).toBe("Dark Wartortle");
    expect(names(devolved.playerHand)).toContain("Dark Blastoise");
  });
});

describe("Rainbow Energy with Base Set / Jungle / Fossil effects", () => {
  it("Energy Removal and Super Energy Removal discard it like any Energy card", () => {
    const removal = gameCard("Energy Removal", "base");
    const ser = gameCard("Super Energy Removal", "base");
    const machop = { ...inPlay("Machop"), attachedEnergy: [rainbow()] };
    const onix = { ...inPlay("Onix"), attachedEnergy: [rainbow(), energy(EnergyType.Fighting)] };
    const state = makeState({ player: { active: machop, hand: [removal, ser] }, opponent: { active: onix } });
    const removed = playTrainerCard(state, removal.id, [[onix.attachedEnergy[0].id]]);
    expect(names(removed.opponentActivePokemon!.attachedEnergy)).toEqual(["Fighting Energy"]);
    expect(names(removed.opponentDiscard)).toContain("Rainbow Energy");
    const superRemoved = playTrainerCard(state, ser.id, [
      [machop.pokemon.id], [machop.attachedEnergy[0].id], [onix.pokemon.id], onix.attachedEnergy.map((e) => e.id),
    ]);
    expect(superRemoved.playerActivePokemon!.attachedEnergy).toHaveLength(0);
    expect(superRemoved.opponentActivePokemon!.attachedEnergy).toHaveLength(0);
  });

  it("Pokémon Center heals the Rainbow damage and discards the Rainbow Energy", () => {
    const center = gameCard("Pokémon Center", "base");
    const card = rainbow();
    const machop = inPlay("Machop");
    const state = makeState({ player: { active: machop, hand: [card, center] }, opponent });
    const next = playTrainerCard(attachEnergyCard(state, card.id, machop.pokemon.id), center.id, []);
    expect(next.playerActivePokemon!.currentDamage).toBe(0);
    expect(next.playerActivePokemon!.attachedEnergy).toHaveLength(0);
    expect(names(next.playerDiscard)).toContain("Rainbow Energy");
  });

  it("its damage counters aren't attack damage: Kabuto Armor and Defender don't reduce them", () => {
    const defender = gameCard("Defender", "base");
    const kabuto = inPlay("Kabuto", { set: "fossil" });
    const machop = inPlay("Machop");
    const [r1, r2] = [rainbow(), rainbow()];
    const state = makeState({ player: { active: kabuto, bench: [machop], hand: [r1, r2, defender] }, opponent });
    expect(attachEnergyCard(state, r1.id, kabuto.pokemon.id).playerActivePokemon!.currentDamage).toBe(10);
    const defended = playTrainerCard(state, defender.id, [[machop.pokemon.id]]);
    expect(attachEnergyCard(defended, r2.id, machop.pokemon.id).playerBench[0].currentDamage).toBe(10);
  });

  it("still damages under Toxic Gas, and can be attached under Dark Vileplume (it isn't a power or a Trainer)", () => {
    const card = rainbow();
    const machop = inPlay("Machop");
    const withMuk = makeState({ player: { active: machop, hand: [card] }, opponent: { active: inPlay("Muk", { set: "fossil" }) } });
    expect(attachEnergyCard(withMuk, card.id, machop.pokemon.id).playerActivePokemon!.currentDamage).toBe(10);
    const withVileplume = makeState({ player: { active: machop, hand: [card] }, opponent: { active: rocket("Dark Vileplume") } });
    expect(canAttachEnergy(withVileplume, card.id, machop.pokemon.id)).toBeNull();
  });

  it("Knocks Out a Mysterious Fossil or a Clefairy Doll: no Prize for the opponent", () => {
    for (const [name, set] of [["Mysterious Fossil", "fossil"], ["Clefairy Doll", "base"]] as const) {
      const card = rainbow();
      const doll = inPlay(name, { set });
      const state = makeState({ player: { active: inPlay("Machop"), bench: [doll], hand: [card] }, opponent });
      expect(canAttachEnergy(state, card.id, doll.pokemon.id), name).toBeNull();
      const next = attachEnergyCard(state, card.id, doll.pokemon.id);
      expect(next.playerBench, name).toEqual([]);
      expect(next.opponentPrizes, name).toHaveLength(6);
    }
  });

  it("Potion Energy next turn heals the Rainbow damage", () => {
    const [r, p] = [rainbow(), gameCard("Potion Energy", "rocket")];
    const machop = inPlay("Machop");
    const state = makeState({ player: { active: machop, hand: [r, p] }, opponent });
    const hurt = attachEnergyCard(state, r.id, machop.pokemon.id);
    const healed = attachEnergyCard({ ...hurt, energyAttachedThisTurn: false }, p.id, machop.pokemon.id);
    expect(healed.playerActivePokemon!.currentDamage).toBe(0);
    expect(names(healed.playerActivePokemon!.attachedEnergy)).toEqual(["Rainbow Energy", "Potion Energy"]);
  });

  it("Blastoise's Hydro Pump counts it as an extra Water Energy", () => {
    const base = inPlay("Blastoise", { energy: [Water, Water, Water] });
    const withRainbow = { ...base, attachedEnergy: [...base.attachedEnergy, rainbow()] };
    const damageWith = (blastoise: typeof base) => {
      const state = makeState({ player: { active: blastoise }, opponent: { active: inPlay("Onix") } });
      return executeAttack(state, attackIndex(blastoise, "Hidro Bomba"), { skipEndTurn: true }).opponentActivePokemon!.currentDamage;
    };
    expect(damageWith(base)).toBe(40);
    expect(damageWith(withRainbow)).toBe(50);
  });
});
