/**
 * POWER_EFFECTS — every activated Pokémon Power of Base Set and Jungle as a CardEffectDef,
 * keyed by power name (sourceId = id of the Pokémon in play using it; the power used is
 * THAT Pokémon's, never "the first one with the power").
 *
 * | Power | coins | selections |
 * |---|---|---|
 * | Rain Dance (Blastoise) | – | [[waterEnergyIdInHand], [waterPokemonId]] |
 * | Energy Trans (Venusaur) | – | [[sourcePokemonId], [grassEnergyId], [targetPokemonId]] |
 * | Damage Swap (Alakazam) | – | [[sourcePokemonId], [targetPokemonId], [amount "10"/"20"/…]] |
 * | Energy Burn (Charizard) | – | [] |
 * | Buzzap (Electrode) | – | [[energyType], [targetPokemonId]] |
 * | Heal (Vileplume) | 1 | heads: [[damagedPokemonId]]; tails: [] |
 * | Shift (Venomoth) | – | [[energyType]] |
 * | Peek (Mankey) | – | [["playerDeck"|"opponentDeck"|"opponentHand"|"playerPrize"|"opponentPrize"]] |
 *
 * Passive powers (Strikes Back, Invisible Wall, Thick Skinned, Retreat Aid) have no entry:
 * the engine applies them (see isPowerActive).
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { createGameEvent, getEnergyTypeInSpanish } from "@/lib/gameState";
import { isEnergyCard, isPokemonCard, type PokemonPower } from "@/domain/cards";
import { EnergyType, PokemonPowerType } from "@/domain/constants";
import {
  canAttachWithPower,
  canUseEnergyBurn,
  activateEnergyBurn,
  canUseBuzzap,
  executeBuzzap,
  executeHealFlip,
  markPowerAsUsed,
  canUseShift,
  initiateShift,
  executeShift,
  canUsePeek,
  executePeek,
} from "@/domain/powers";
import { allOwnPokemon, findInPlay } from "@/domain/board";
import type { CardEffectDef, SelectionOption } from "./types";
import { energyOption, pokemonOption } from "./trainers";

// ============================================================================
// Helpers
// ============================================================================

function powerOf(state: GameState, pokemonId: string): PokemonPower | undefined {
  const found = findInPlay(state, "player", pokemonId);
  return found && isPokemonCard(found.pokemon.pokemon) ? found.pokemon.pokemon.power : undefined;
}

function ownOption(state: GameState, pokemon: PokemonInPlay, showDamage = false): SelectionOption {
  return pokemonOption(pokemon, state.playerActivePokemon?.pokemon.id === pokemon.pokemon.id ? "Activo" : "Banca", showDamage);
}

/** Replace one of the player's Pokémon (by id) with `updated`. */
function replaceOwn(state: GameState, pokemonId: string, updated: PokemonInPlay): GameState {
  if (state.playerActivePokemon?.pokemon.id === pokemonId) return { ...state, playerActivePokemon: updated };
  return { ...state, playerBench: state.playerBench.map((p) => (p?.pokemon.id === pokemonId ? updated : p)) };
}

function ownPokemonById(state: GameState, pokemonId: string): PokemonInPlay | undefined {
  return findInPlay(state, "player", pokemonId)?.pokemon;
}

const BASIC_ENERGY_TYPES: EnergyType[] = [
  EnergyType.Grass,
  EnergyType.Fire,
  EnergyType.Water,
  EnergyType.Lightning,
  EnergyType.Psychic,
  EnergyType.Fighting,
];

const PEEK_OPTIONS: { id: "playerDeck" | "opponentDeck" | "opponentHand" | "playerPrize" | "opponentPrize"; label: string }[] = [
  { id: "playerDeck", label: "La carta superior de tu mazo" },
  { id: "opponentDeck", label: "La carta superior del mazo rival" },
  { id: "opponentHand", label: "Una carta al azar de la mano rival" },
  { id: "playerPrize", label: "Uno de tus premios" },
  { id: "opponentPrize", label: "Uno de los premios rivales" },
];

// ---------------------------------------------------------------------------- Rain Dance

function rainDanceEnergies(state: GameState, pokemonId: string): GameCard[] {
  const power = powerOf(state, pokemonId);
  return state.playerHand.filter((c) => isEnergyCard(c) && (!power?.energyType || c.energyType === power.energyType));
}

function rainDanceTargets(state: GameState, pokemonId: string, energy: GameCard | undefined): PokemonInPlay[] {
  const power = powerOf(state, pokemonId);
  if (!power || !energy) return [];
  return allOwnPokemon(state).filter((p) => canAttachWithPower(power, p, energy) === null);
}

// ---------------------------------------------------------------------------- Energy Trans

function energyTransEnergies(state: GameState, pokemonId: string, source: PokemonInPlay | undefined): GameCard[] {
  const power = powerOf(state, pokemonId);
  return (source?.attachedEnergy ?? []).filter((e) => isEnergyCard(e) && (!power?.energyType || e.energyType === power.energyType));
}

// ---------------------------------------------------------------------------- Damage Swap

/** Most damage `target` can take without being Knocked Out */
function damageRoom(target: PokemonInPlay): number {
  if (!isPokemonCard(target.pokemon)) return 0;
  return Math.max(0, target.pokemon.hp - (target.currentDamage ?? 0) - 10);
}

function damageSwapTargets(state: GameState, source: PokemonInPlay): PokemonInPlay[] {
  return allOwnPokemon(state).filter((p) => p.pokemon.id !== source.pokemon.id && damageRoom(p) >= 10);
}

// ============================================================================
// Registry
// ============================================================================

export const POWER_EFFECTS: Record<string, CardEffectDef> = {
  "Rain Dance": {
    canUse: (state, pokemonId) => {
      const energies = rainDanceEnergies(state, pokemonId);
      if (energies.length === 0) return "No tienes energías de agua en tu mano";
      return energies.some((e) => rainDanceTargets(state, pokemonId, e).length > 0) ? null : "No tienes Pokémon de agua";
    },
    getSteps: (state, pokemonId, selections) => {
      if (selections.length === 0) {
        const energies = rainDanceEnergies(state, pokemonId);
        return {
          title: "Rain Dance",
          description: "Selecciona una energía de agua de tu mano",
          options: energies.map(energyOption),
          maxSelections: 1,
          source: "hand",
          thumbnails: energies,
        };
      }
      if (selections.length === 1) {
        const energy = state.playerHand.find((c) => c.id === selections[0][0]);
        const targets = rainDanceTargets(state, pokemonId, energy);
        return {
          title: "Rain Dance",
          description: "Selecciona el Pokémon de agua al que unir la energía",
          options: targets.map((p) => ownOption(state, p)),
          maxSelections: 1,
          thumbnails: targets.map((p) => p.pokemon),
        };
      }
      return null;
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const energy = state.playerHand.find((c) => c.id === selections[0][0])!;
      const target = ownPokemonById(state, selections[1][0])!;
      const energyName = isEnergyCard(energy) ? getEnergyTypeInSpanish(energy.energyType) : energy.name;
      const next = replaceOwn(state, target.pokemon.id, { ...target, attachedEnergy: [...target.attachedEnergy, energy] });
      return {
        ...next,
        playerHand: state.playerHand.filter((c) => c.id !== energy.id),
        events: [...state.events, createGameEvent(`${power.name}: adjuntó energía ${energyName} a ${target.pokemon.name}`, "action")],
      };
    },
  },

  "Energy Trans": {
    canUse: (state, pokemonId) => {
      const sources = allOwnPokemon(state).filter((p) => energyTransEnergies(state, pokemonId, p).length > 0);
      if (sources.length === 0) return "No tienes energías de planta para mover";
      return allOwnPokemon(state).length > 1 ? null : "No tienes otro Pokémon al que mover la energía";
    },
    getSteps: (state, pokemonId, selections) => {
      if (selections.length === 0) {
        const sources = allOwnPokemon(state).filter((p) => energyTransEnergies(state, pokemonId, p).length > 0);
        return {
          title: "Energy Trans",
          description: "Selecciona el Pokémon del que mover una energía de planta",
          options: sources.map((p) => ownOption(state, p)),
          maxSelections: 1,
          thumbnails: sources.map((p) => p.pokemon),
        };
      }
      if (selections.length === 1) {
        const energies = energyTransEnergies(state, pokemonId, ownPokemonById(state, selections[0][0]));
        return {
          title: "Energy Trans",
          description: "Selecciona la energía a mover",
          options: energies.map(energyOption),
          maxSelections: 1,
          thumbnails: energies,
        };
      }
      if (selections.length === 2) {
        const targets = allOwnPokemon(state).filter((p) => p.pokemon.id !== selections[0][0]);
        return {
          title: "Energy Trans",
          description: "Selecciona el Pokémon que recibe la energía",
          options: targets.map((p) => ownOption(state, p)),
          maxSelections: 1,
          thumbnails: targets.map((p) => p.pokemon),
        };
      }
      return null;
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const source = ownPokemonById(state, selections[0][0])!;
      const energy = source.attachedEnergy.find((e) => e.id === selections[1][0])!;
      const withoutEnergy = replaceOwn(state, source.pokemon.id, {
        ...source,
        attachedEnergy: source.attachedEnergy.filter((e) => e.id !== energy.id),
      });
      const target = ownPokemonById(withoutEnergy, selections[2][0])!;
      const moved = replaceOwn(withoutEnergy, target.pokemon.id, { ...target, attachedEnergy: [...target.attachedEnergy, energy] });
      const energyName = isEnergyCard(energy) ? getEnergyTypeInSpanish(energy.energyType) : energy.name;
      return {
        ...moved,
        events: [
          ...state.events,
          createGameEvent(`${power.name}: movió energía ${energyName} de ${source.pokemon.name} a ${target.pokemon.name}`, "action"),
        ],
      };
    },
  },

  "Damage Swap": {
    canUse: (state) => {
      const sources = allOwnPokemon(state).filter((p) => (p.currentDamage ?? 0) > 0);
      if (sources.length === 0) return "Ninguno de tus Pokémon tiene daño";
      return sources.some((s) => damageSwapTargets(state, s).length > 0)
        ? null
        : "No hay Pokémon que puedan recibir daño sin quedar Fuera de Combate";
    },
    getSteps: (state, _pokemonId, selections) => {
      if (selections.length === 0) {
        const sources = allOwnPokemon(state).filter((p) => (p.currentDamage ?? 0) > 0 && damageSwapTargets(state, p).length > 0);
        return {
          title: "Damage Swap",
          description: "Selecciona el Pokémon del que mover contadores de daño",
          options: sources.map((p) => ownOption(state, p, true)),
          maxSelections: 1,
          thumbnails: sources.map((p) => p.pokemon),
        };
      }
      const source = ownPokemonById(state, selections[0][0]);
      if (!source) return null;
      if (selections.length === 1) {
        const targets = damageSwapTargets(state, source);
        return {
          title: "Damage Swap",
          description: "Selecciona el Pokémon que recibe el daño (no puede quedar Fuera de Combate)",
          options: targets.map((p) => ownOption(state, p, true)),
          maxSelections: 1,
          thumbnails: targets.map((p) => p.pokemon),
        };
      }
      if (selections.length === 2) {
        const target = ownPokemonById(state, selections[1][0]);
        const max = target ? Math.min(source.currentDamage ?? 0, damageRoom(target)) : 0;
        const amounts = Array.from({ length: Math.floor(max / 10) }, (_, i) => String((i + 1) * 10));
        return {
          title: "Damage Swap",
          description: "¿Cuánto daño mover?",
          options: amounts.map((amount) => ({ id: amount, label: `${amount} de daño (${Number(amount) / 10} contador${amount === "10" ? "" : "es"})` })),
          maxSelections: 1,
        };
      }
      return null;
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const amount = Number(selections[2][0]);
      const source = ownPokemonById(state, selections[0][0])!;
      const fromSource = replaceOwn(state, source.pokemon.id, { ...source, currentDamage: (source.currentDamage ?? 0) - amount });
      const target = ownPokemonById(fromSource, selections[1][0])!;
      const moved = replaceOwn(fromSource, target.pokemon.id, { ...target, currentDamage: (target.currentDamage ?? 0) + amount });
      return {
        ...moved,
        events: [
          ...state.events,
          createGameEvent(`${power.name}: movió ${amount} de daño de ${source.pokemon.name} a ${target.pokemon.name}`, "action"),
        ],
      };
    },
  },

  "Energy Burn": {
    canUse: (state, pokemonId) => {
      const check = canUseEnergyBurn(state, "player", pokemonId);
      return check.canUse ? null : check.errorMessage ?? "No puedes usar Energy Burn";
    },
    getSteps: () => null,
    resolve: (state, pokemonId) => activateEnergyBurn(state, "player", pokemonId),
  },

  "Buzzap": {
    canUse: (state, pokemonId) => {
      const check = canUseBuzzap(state, "player", pokemonId);
      return check.canUse ? null : check.errorMessage ?? "No puedes usar Buzzap";
    },
    getSteps: (state, pokemonId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Buzzap",
          description: "Elige el tipo de energía en que se convierte",
          options: BASIC_ENERGY_TYPES.map((type) => ({ id: type, label: `Energía ${getEnergyTypeInSpanish(type)}` })),
          maxSelections: 1,
          disableAutoSelect: true,
        };
      }
      if (selections.length === 1) {
        const targets = canUseBuzzap(state, "player", pokemonId).validTargets;
        return {
          title: "Buzzap",
          description: "Selecciona el Pokémon al que se une",
          options: targets.map((p) => ownOption(state, p)),
          maxSelections: 1,
          thumbnails: targets.map((p) => p.pokemon),
        };
      }
      return null;
    },
    resolve: (state, pokemonId, selections) =>
      executeBuzzap(state, "player", pokemonId, selections[0][0] as EnergyType, selections[1][0]),
  },

  "Heal": {
    canUse: (state) =>
      allOwnPokemon(state).some((p) => (p.currentDamage ?? 0) > 0) ? null : "Ningún Pokémon tiene daño para curar",
    coinFlips: () => 1,
    getSteps: (state, _pokemonId, selections, coinResults) => {
      if (coinResults?.[0] !== "heads" || selections.length > 0) return null;
      const damaged = allOwnPokemon(state).filter((p) => (p.currentDamage ?? 0) > 0);
      return {
        title: "Heal",
        description: "Selecciona un Pokémon para quitarle 1 contador de daño",
        options: damaged.map((p) => ownOption(state, p, true)),
        maxSelections: 1,
        thumbnails: damaged.map((p) => p.pokemon),
      };
    },
    resolve: (state, pokemonId, selections, { coinResults }) => {
      const power = powerOf(state, pokemonId)!;
      const heads = coinResults?.[0] === "heads";
      const flipped: GameState = {
        ...state,
        events: [...state.events, createGameEvent(`${power.name} - Moneda: [coin:${heads ? "heads" : "tails"}]`, "info")],
      };
      if (!heads) {
        const used = markPowerAsUsed(flipped, pokemonId);
        return { ...used, events: [...used.events, createGameEvent(`${power.name} falló`, "info")] };
      }
      return executeHealFlip(flipped, selections[0][0], "player", pokemonId);
    },
  },

  "Shift": {
    canUse: (state, pokemonId) => {
      const check = canUseShift(state, "player", pokemonId);
      return check.canUse ? null : check.errorMessage ?? "No puedes usar Shift";
    },
    getSteps: (state, pokemonId, selections) => {
      if (selections.length > 0) return null;
      const { availableTypes } = canUseShift(state, "player", pokemonId);
      return {
        title: "Shift",
        description: "Elige el tipo que tendrá hasta el final del turno",
        options: availableTypes.map((type) => ({ id: type, label: getEnergyTypeInSpanish(type) })),
        maxSelections: 1,
        disableAutoSelect: true,
      };
    },
    resolve: (state, pokemonId, selections) =>
      executeShift(initiateShift(state, "player", pokemonId), "player", selections[0][0] as EnergyType),
  },

  "Peek": {
    canUse: (state, pokemonId) => {
      const check = canUsePeek(state, "player", pokemonId);
      return check.canUse ? null : check.errorMessage ?? "No puedes usar Peek";
    },
    getSteps: (_state, _pokemonId, selections) =>
      selections.length > 0
        ? null
        : {
            title: "Peek",
            description: "Elige qué mirar",
            options: PEEK_OPTIONS.map(({ id, label }) => ({ id, label })),
            maxSelections: 1,
            disableAutoSelect: true,
          },
    resolve: (state, pokemonId, selections) =>
      executePeek(state, "player", pokemonId, selections[0][0] as (typeof PEEK_OPTIONS)[number]["id"]),
  },
};

/** Power types whose effect the player activates (each must have a POWER_EFFECTS entry). */
export const ACTIVATED_POWER_TYPES: readonly PokemonPowerType[] = [
  PokemonPowerType.UnlimitedEnergyAttach,
  PokemonPowerType.MoveEnergy,
  PokemonPowerType.MoveDamage,
  PokemonPowerType.EnergyConversion,
  PokemonPowerType.SelfSacrifice,
  PokemonPowerType.HealFlip,
  PokemonPowerType.TypeShift,
  PokemonPowerType.Peek,
];

