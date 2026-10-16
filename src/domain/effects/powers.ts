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
 * | Entrada / Step In (Dragonite, from the Bench, once per turn) | – | [] |
 * | Maldición / Curse (Gengar, once per turn) | – | [[opponentPokemonWithDamageId], [otherOpponentPokemonId]] |
 * | Comportamiento Extraño / Strange Behavior (Slowbro, repeatable) | – | [[ownDamagedPokemonId]] |
 * | Cobardía / Cowardice (Tentacool) | – | [] |
 * | Engaño / Trickery (Rattata, once per turn) | – | [[prizeIndex "0".."n-1"]] (face down: by position) |
 * | Luz Evolutiva / Evolutionary Light (Dark Dragonair, once per turn) | – | [[deckEvolutionCardId]] (no step when the deck has none) |
 * | Intercambio de Materia / Matter Exchange (Dark Kadabra, once per turn) | – | [[handCardId]] |
 * | Reunir Fuego / Gather Fire (Charmander, once per turn) | – | [[fireEnergyIdOnAnotherOwnPokemon]] |
 * | Hipnosis a Distancia / Long-Distance Hypnosis (Drowzee), Hedor de Polen / Pollen Stench (Dark Gloom), once per turn | 1 | [] |
 * | Carga de Energía / Energy Charge (Lt. Surge's Magneton, while Active, repeatable) | – | [[lightningEnergyIdOnAnotherOwnPokemon]] |
 * | Trampa Aromática / Fragrance Trap (Erika's Victreebel, once per turn) | 1 | heads: [[opponentBenchedPokemonId]]; tails: [] |
 * | Curación Natural / Natural Healing (Blaine's Vulpix, once per turn) | – | [] |
 *
 * Passive powers (Shell Armor, Strange Barrier, Pollen Defense, Restless Sleep, Rebirth, Flee,
 * Bench Guard, Photosynthesis, Strikes Back, Invisible Wall, Thick Skinned, Retreat Aid, Toxic Gas,
 * Prehistoric Power, Transform, Transparency, Kabuto Armor, Clairvoyance) have no entry: the
 * engine applies them (see isPowerActive).
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import {
  checkKnockouts,
  clearStatusConditionsOnRetreat,
  createGameEvent,
  getEnergyTypeInSpanish,
  energyCardLabel,
  energyProvidesType,
  applyStatusCondition,
  shuffle,
} from "@/lib/gameState";
import { cardOutOfPlay, isEnergyCard, isPokemonCard, isTrainerInPlay, type PokemonPower } from "@/domain/cards";
import { EnergyType, PokemonPowerType, PokemonStage, StatusCondition } from "@/domain/constants";
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
  arePrizesRevealed,
  hasStatusImmunity,
  getEffectiveHp,
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
  return allOwnPokemon(state).filter((p) => canAttachWithPower(power, p, energy, state) === null);
}

// ---------------------------------------------------------------------------- Energy Trans

function energyTransEnergies(state: GameState, pokemonId: string, source: PokemonInPlay | undefined): GameCard[] {
  const power = powerOf(state, pokemonId);
  // In play, Rainbow Energy counts as a Grass Energy card too
  return (source?.attachedEnergy ?? []).filter((e) => isEnergyCard(e) && (!power?.energyType || energyProvidesType(e, power.energyType, source, state)));
}

// ---------------------------------------------------------------------------- Damage Swap

/** Most damage `target` can take without being Knocked Out (a transformed Ditto: the copy's HP) */
function damageRoom(target: PokemonInPlay, state?: GameState): number {
  if (!isPokemonCard(target.pokemon)) return 0;
  const hp = state ? getEffectiveHp(state, target) : target.pokemon.hp;
  return Math.max(0, hp - (target.currentDamage ?? 0) - 10);
}

function damageSwapTargets(state: GameState, source: PokemonInPlay): PokemonInPlay[] {
  return allOwnPokemon(state).filter((p) => p.pokemon.id !== source.pokemon.id && damageRoom(p, state) >= 10);
}

// ---------------------------------------------------------------------------- Curse

function opponentOption(state: GameState, pokemon: PokemonInPlay): SelectionOption {
  return pokemonOption(pokemon, state.opponentActivePokemon?.pokemon.id === pokemon.pokemon.id ? "Activo rival" : "Banca rival", true);
}

const isDamaged = (p: PokemonInPlay) => (p.currentDamage ?? 0) > 0;

function opponentPokemon(state: GameState): PokemonInPlay[] {
  return [state.opponentActivePokemon, ...state.opponentBench].filter((p): p is PokemonInPlay => p != null);
}

/** Replace one of the opponent's Pokémon (by id) with `updated`. */
function replaceOpponent(state: GameState, pokemonId: string, updated: PokemonInPlay): GameState {
  if (state.opponentActivePokemon?.pokemon.id === pokemonId) return { ...state, opponentActivePokemon: updated };
  return { ...state, opponentBench: state.opponentBench.map((p) => (p?.pokemon.id === pokemonId ? updated : p)) };
}

// ---------------------------------------------------------------------------- Strange Behavior

/** Damaged Pokémon of the player (other than Slowbro) that can give it a counter. */
function strangeBehaviorSources(state: GameState, pokemonId: string): PokemonInPlay[] {
  const slowbro = ownPokemonById(state, pokemonId);
  if (!slowbro || damageRoom(slowbro) < 10) return [];
  return allOwnPokemon(state).filter((p) => p.pokemon.id !== pokemonId && isDamaged(p));
}

/** The player's only Pokémon in play can't leave it (the player would have none). */
function isOnlyPokemon(state: GameState): boolean {
  return allOwnPokemon(state).length <= 1;
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
      const energyName = energyCardLabel(energy);
      return {
        ...moved,
        events: [
          ...state.events,
          createGameEvent(`${power.name}: movió ${energyName} de ${source.pokemon.name} a ${target.pokemon.name}`, "action"),
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
        const max = target ? Math.min(source.currentDamage ?? 0, damageRoom(target, state)) : 0;
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

// ============================================================================
// Fossil
// ============================================================================

const FOSSIL_POWER_EFFECTS: Record<string, CardEffectDef> = {
  "Entrada": {
    canUse: (state, pokemonId) => {
      const found = findInPlay(state, "player", pokemonId);
      if (!found || found.location !== "bench") return "Solo puede usarse mientras está en tu Banca";
      return state.playerActivePokemon ? null : "No tienes Pokémon activo";
    },
    getSteps: () => null,
    resolve: (state, pokemonId) => {
      const found = findInPlay(state, "player", pokemonId)!;
      const power = powerOf(state, pokemonId)!;
      const oldActive = state.playerActivePokemon!;
      const toBench: PokemonInPlay = { ...clearStatusConditionsOnRetreat(oldActive), modifiedWeakness: undefined, modifiedResistance: undefined };
      const switched: GameState = {
        ...state,
        playerActivePokemon: found.pokemon,
        playerBench: state.playerBench.map((p, i) => (i === found.benchIndex ? toBench : p)),
        events: [
          ...state.events,
          createGameEvent(`${power.name}: ${found.pokemon.pokemon.name} se cambió con ${oldActive.pokemon.name}`, "action"),
        ],
      };
      return markPowerAsUsed(switched, pokemonId);
    },
  },

  "Maldición": {
    canUse: (state) => {
      const opponents = opponentPokemon(state);
      if (opponents.length < 2) return "El rival necesita al menos 2 Pokémon en juego";
      return opponents.some(isDamaged) ? null : "Ningún Pokémon del rival tiene contadores de daño";
    },
    getSteps: (state, _pokemonId, selections) => {
      const opponents = opponentPokemon(state);
      if (selections.length === 0) {
        const sources = opponents.filter(isDamaged);
        return {
          title: "Maldición",
          description: "Elige el Pokémon del rival del que mover 1 contador de daño",
          options: sources.map((p) => opponentOption(state, p)),
          maxSelections: 1,
          thumbnails: sources.map((p) => p.pokemon),
        };
      }
      if (selections.length === 1) {
        const targets = opponents.filter((p) => p.pokemon.id !== selections[0][0]);
        return {
          title: "Maldición",
          description: "Elige el Pokémon del rival que recibe el contador (puede quedar Fuera de Combate)",
          options: targets.map((p) => opponentOption(state, p)),
          maxSelections: 1,
          thumbnails: targets.map((p) => p.pokemon),
        };
      }
      return null;
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const source = findInPlay(state, "opponent", selections[0][0])!.pokemon;
      const fromSource = replaceOpponent(state, source.pokemon.id, { ...source, currentDamage: (source.currentDamage ?? 0) - 10 });
      const target = findInPlay(fromSource, "opponent", selections[1][0])!.pokemon;
      const moved = replaceOpponent(fromSource, target.pokemon.id, { ...target, currentDamage: (target.currentDamage ?? 0) + 10 });
      const logged: GameState = {
        ...moved,
        events: [
          ...state.events,
          createGameEvent(`${power.name}: movió 1 contador de daño de ${source.pokemon.name} a ${target.pokemon.name}`, "action"),
        ],
      };
      // "even if it would Knock Out the other Pokémon"
      return checkKnockouts(markPowerAsUsed(logged, pokemonId));
    },
  },

  "Comportamiento Extraño": {
    canUse: (state, pokemonId) => {
      const slowbro = ownPokemonById(state, pokemonId);
      if (slowbro && damageRoom(slowbro) < 10) return `${slowbro.pokemon.name} quedaría Fuera de Combate`;
      return strangeBehaviorSources(state, pokemonId).length > 0 ? null : "Ninguno de tus otros Pokémon tiene contadores de daño";
    },
    getSteps: (state, pokemonId, selections) => {
      if (selections.length > 0) return null;
      const sources = strangeBehaviorSources(state, pokemonId);
      return {
        title: "Comportamiento Extraño",
        description: "Elige el Pokémon del que mover 1 contador de daño a Slowbro",
        options: sources.map((p) => ownOption(state, p, true)),
        maxSelections: 1,
        thumbnails: sources.map((p) => p.pokemon),
      };
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const source = ownPokemonById(state, selections[0][0])!;
      const fromSource = replaceOwn(state, source.pokemon.id, { ...source, currentDamage: (source.currentDamage ?? 0) - 10 });
      const slowbro = ownPokemonById(fromSource, pokemonId)!;
      const moved = replaceOwn(fromSource, pokemonId, { ...slowbro, currentDamage: (slowbro.currentDamage ?? 0) + 10 });
      return {
        ...moved,
        events: [
          ...state.events,
          createGameEvent(`${power.name}: movió 1 contador de daño de ${source.pokemon.name} a ${slowbro.pokemon.name}`, "action"),
        ],
      };
    },
  },

  "Cobardía": {
    canUse: (state, pokemonId) => {
      const tentacool = ownPokemonById(state, pokemonId);
      if (!tentacool) return "Debes elegir uno de tus Pokémon en juego";
      if (tentacool.playedOnTurn === state.turnNumber) return `No puedes usarlo el turno en que pusiste a ${tentacool.pokemon.name} en juego`;
      if (isOnlyPokemon(state)) return `${tentacool.pokemon.name} es tu único Pokémon en juego`;
      return null;
    },
    getSteps: () => null,
    resolve: (state, pokemonId) => {
      const found = findInPlay(state, "player", pokemonId)!;
      const power = powerOf(state, pokemonId)!;
      const tentacool = found.pokemon;
      const discarded = [
        ...tentacool.attachedEnergy,
        ...(tentacool.attachedTrainers ?? []),
        ...(tentacool.previousEvolutions ?? []),
      ].map(cardOutOfPlay);
      const isActive = found.location === "active";
      return {
        ...state,
        playerHand: [cardOutOfPlay(tentacool.pokemon), ...state.playerHand],
        playerDiscard: [...state.playerDiscard, ...discarded],
        ...(isActive
          ? { playerActivePokemon: null, playerNeedsToPromote: true }
          : { playerBench: state.playerBench.filter((_, i) => i !== found.benchIndex) }),
        events: [
          ...state.events,
          createGameEvent(`${power.name}: ${tentacool.pokemon.name} volvió a la mano`, "action"),
          ...(isActive ? [createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")] : []),
        ],
      };
    },
  },
};

Object.assign(POWER_EFFECTS, FOSSIL_POWER_EFFECTS);

// ============================================================================
// Team Rocket
// ============================================================================

const isEvolutionCard = (c: GameCard) => isPokemonCard(c) && c.stage !== PokemonStage.Basic;

/** Energy cards of the power's type attached to the player's OTHER Pokémon (Gather Fire). */
function gatherableEnergies(state: GameState, pokemonId: string): { energy: GameCard; holder: PokemonInPlay }[] {
  const power = powerOf(state, pokemonId);
  const type = power?.energyType ?? EnergyType.Fire;
  return allOwnPokemon(state)
    .filter((p) => p.pokemon.id !== pokemonId)
    .flatMap((holder) => holder.attachedEnergy.filter((e) => energyProvidesType(e, type, holder, state)).map((energy) => ({ energy, holder })));
}

const STATUS_NAMES: Record<string, string> = {
  [StatusCondition.Asleep]: "Dormido",
  [StatusCondition.Confused]: "Confundido",
  [StatusCondition.Paralyzed]: "Paralizado",
  [StatusCondition.Poisoned]: "Envenenado",
};

/** Long-Distance Hypnosis / Pollen Stench: heads → the Defending Pokémon, tails → your Active. */
const statusFlipPower: CardEffectDef = {
  canUse: (state) => (state.playerActivePokemon && state.opponentActivePokemon ? null : "No hay Pokémon activos"),
  coinFlips: () => 1,
  getSteps: () => null,
  resolve: (state, pokemonId, _selections, { coinResults }) => {
    const power = powerOf(state, pokemonId)!;
    const status = power.status ?? StatusCondition.Asleep;
    const heads = coinResults?.[0] === "heads";
    const events = [...state.events, createGameEvent(`${power.name} - Moneda: [coin:${heads ? "heads" : "tails"}]`, "info")];
    const target = heads ? state.opponentActivePokemon! : state.playerActivePokemon!;
    // Snorlax's Thick Skinned and Mysterious Fossil can't be affected by Special Conditions
    const immune = hasStatusImmunity(target, state) || isTrainerInPlay(target.pokemon);
    const affected = immune ? target : applyStatusCondition(target, status, state.turnNumber);
    events.push(
      createGameEvent(
        immune ? `${target.pokemon.name} no puede verse afectado por estados especiales` : `¡${target.pokemon.name} pasa a estar ${STATUS_NAMES[status] ?? status}!`,
        "action"
      )
    );
    const next: GameState = heads ? { ...state, opponentActivePokemon: affected, events } : { ...state, playerActivePokemon: affected, events };
    return markPowerAsUsed(next, pokemonId);
  },
};

const TEAM_ROCKET_POWER_EFFECTS: Record<string, CardEffectDef> = {
  "Engaño": {
    canUse: (state) => {
      if (state.playerPrizes.length === 0) return "No te quedan Premios";
      return state.playerDeck.length === 0 ? "Tu mazo está vacío" : null;
    },
    getSteps: (state, pokemonId, selections) => {
      if (selections.length > 0) return null;
      const revealed = arePrizesRevealed(state, "player");
      return {
        title: powerOf(state, pokemonId)?.name ?? "Engaño",
        description: "Elige 1 de tus Premios para cambiarlo por la carta superior de tu mazo",
        options: state.playerPrizes.map((c, i) => ({ id: String(i), label: revealed ? `Premio ${i + 1}: ${c.name}` : `Premio ${i + 1}` })),
        maxSelections: 1,
        disableAutoSelect: true,
      };
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const index = Number(selections[0][0]);
      const prize = state.playerPrizes[index];
      const top = state.playerDeck[0];
      const swapped: GameState = {
        ...state,
        playerPrizes: state.playerPrizes.map((c, i) => (i === index ? top : c)),
        playerDeck: [prize, ...state.playerDeck.slice(1)],
        events: [...state.events, createGameEvent(`${power.name}: cambió el Premio ${index + 1} por la carta superior de su mazo`, "action")],
      };
      return markPowerAsUsed(swapped, pokemonId);
    },
  },

  "Luz Evolutiva": {
    canUse: (state) => (state.playerDeck.length === 0 ? "Tu mazo está vacío" : null),
    getSteps: (state, pokemonId, selections) => {
      if (selections.length > 0) return null;
      const evolutions = state.playerDeck.filter(isEvolutionCard);
      if (evolutions.length === 0) return null;
      return {
        title: powerOf(state, pokemonId)?.name ?? "Luz Evolutiva",
        description: "Elige una carta de Evolución de tu mazo para tu mano",
        options: evolutions.map((c) => ({ id: c.id, label: c.name })),
        maxSelections: 1,
        cards: evolutions,
      };
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const chosen = state.playerDeck.find((c) => c.id === selections[0]?.[0]);
      const next: GameState = {
        ...state,
        playerHand: chosen ? [chosen, ...state.playerHand] : state.playerHand,
        playerDeck: shuffle(state.playerDeck.filter((c) => c.id !== chosen?.id)),
        events: [
          ...state.events,
          createGameEvent(chosen ? `${power.name}: mostró ${chosen.name} y lo puso en su mano` : `${power.name}: no había cartas de Evolución en el mazo`, "action"),
          createGameEvent("Se mezcló el mazo", "info"),
        ],
      };
      return markPowerAsUsed(next, pokemonId);
    },
  },

  "Intercambio de Materia": {
    canUse: (state) => {
      if (state.playerHand.length === 0) return "No tienes cartas en la mano para descartar";
      return state.playerDeck.length === 0 ? "Tu mazo está vacío" : null;
    },
    getSteps: (state, pokemonId, selections) =>
      selections.length > 0
        ? null
        : {
            title: powerOf(state, pokemonId)?.name ?? "Intercambio de Materia",
            description: "Elige una carta de tu mano para descartar y robar una carta",
            options: state.playerHand.map((c) => ({ id: c.id, label: c.name })),
            maxSelections: 1,
            source: "hand",
          },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const discarded = state.playerHand.find((c) => c.id === selections[0][0])!;
      const [drawn, ...deck] = state.playerDeck;
      const next: GameState = {
        ...state,
        playerHand: [drawn, ...state.playerHand.filter((c) => c.id !== discarded.id)],
        playerDeck: deck,
        playerDiscard: [...state.playerDiscard, discarded],
        events: [...state.events, createGameEvent(`${power.name}: descartó ${discarded.name} y robó una carta`, "action")],
      };
      return markPowerAsUsed(next, pokemonId);
    },
  },

  "Reunir Fuego": {
    canUse: (state, pokemonId) =>
      gatherableEnergies(state, pokemonId).length > 0 ? null : "Tus otros Pokémon no tienen cartas de Energía Fuego",
    getSteps: (state, pokemonId, selections) => {
      if (selections.length > 0) return null;
      const options = gatherableEnergies(state, pokemonId);
      return {
        title: powerOf(state, pokemonId)?.name ?? "Reunir Fuego",
        description: "Elige una carta de Energía Fuego de otro de tus Pokémon para unirla a este Pokémon",
        options: options.map(({ energy, holder }) => ({ id: energy.id, label: `${energyCardLabel(energy)} (${holder.pokemon.name})` })),
        maxSelections: 1,
        thumbnails: options.map(({ energy }) => energy),
      };
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const { energy, holder } = gatherableEnergies(state, pokemonId).find((g) => g.energy.id === selections[0][0])!;
      const withoutEnergy = replaceOwn(state, holder.pokemon.id, { ...holder, attachedEnergy: holder.attachedEnergy.filter((e) => e.id !== energy.id) });
      const receiver = ownPokemonById(withoutEnergy, pokemonId)!;
      const moved = replaceOwn(withoutEnergy, pokemonId, { ...receiver, attachedEnergy: [...receiver.attachedEnergy, energy] });
      const logged: GameState = {
        ...moved,
        events: [...state.events, createGameEvent(`${power.name}: movió ${energyCardLabel(energy)} de ${holder.pokemon.name} a ${receiver.pokemon.name}`, "action")],
      };
      return markPowerAsUsed(logged, pokemonId);
    },
  },

  "Hipnosis a Distancia": statusFlipPower,
  "Hedor de Polen": statusFlipPower,
};

Object.assign(POWER_EFFECTS, TEAM_ROCKET_POWER_EFFECTS);

// ============================================================================
// Gym Heroes
// ============================================================================

const GYM_HEROES_POWER_EFFECTS: Record<string, CardEffectDef> = {
  // "As often as you like ... if it is your Active Pokémon" (worksFromBench: false): not once per turn
  "Carga de Energía": {
    canUse: (state, pokemonId) => {
      const type = powerOf(state, pokemonId)?.energyType ?? EnergyType.Lightning;
      return gatherableEnergies(state, pokemonId).length > 0 ? null : `Tus otros Pokémon no tienen cartas de Energía ${getEnergyTypeInSpanish(type)}`;
    },
    getSteps: (state, pokemonId, selections) => {
      if (selections.length > 0) return null;
      const options = gatherableEnergies(state, pokemonId);
      const type = powerOf(state, pokemonId)?.energyType ?? EnergyType.Lightning;
      return {
        title: powerOf(state, pokemonId)?.name ?? "Carga de Energía",
        description: `Elige una carta de Energía ${getEnergyTypeInSpanish(type)} de otro de tus Pokémon para unirla a este Pokémon`,
        options: options.map(({ energy, holder }) => ({ id: energy.id, label: `${energyCardLabel(energy)} (${holder.pokemon.name})` })),
        maxSelections: 1,
        thumbnails: options.map(({ energy }) => energy),
      };
    },
    resolve: (state, pokemonId, selections) => {
      const power = powerOf(state, pokemonId)!;
      const { energy, holder } = gatherableEnergies(state, pokemonId).find((g) => g.energy.id === selections[0][0])!;
      const withoutEnergy = replaceOwn(state, holder.pokemon.id, { ...holder, attachedEnergy: holder.attachedEnergy.filter((e) => e.id !== energy.id) });
      const receiver = ownPokemonById(withoutEnergy, pokemonId)!;
      const moved = replaceOwn(withoutEnergy, pokemonId, { ...receiver, attachedEnergy: [...receiver.attachedEnergy, energy] });
      return {
        ...moved,
        events: [...state.events, createGameEvent(`${power.name}: movió ${energyCardLabel(energy)} de ${holder.pokemon.name} a ${receiver.pokemon.name}`, "action")],
      };
    },
  },

  "Trampa Aromática": {
    // "You may flip a coin. If heads, and if your opponent has any Benched Pokémon..."
    canUse: (state) => (state.opponentActivePokemon && state.opponentBench.length > 0 ? null : "Tu rival no tiene Pokémon en la Banca"),
    coinFlips: () => 1,
    getSteps: (state, pokemonId, selections, coinResults) => {
      if (coinResults?.[0] !== "heads" || selections.length > 0 || state.opponentBench.length === 0) return null;
      return {
        title: powerOf(state, pokemonId)?.name ?? "Trampa Aromática",
        description: "Elige el Pokémon de la Banca de tu rival que cambia por su Pokémon Activo",
        options: state.opponentBench.map((p) => opponentOption(state, p)),
        maxSelections: 1,
        thumbnails: state.opponentBench.map((p) => p.pokemon),
      };
    },
    resolve: (state, pokemonId, selections, { coinResults }) => {
      const power = powerOf(state, pokemonId)!;
      const heads = coinResults?.[0] === "heads";
      const events = [...state.events, createGameEvent(`${power.name} - Moneda: [coin:${heads ? "heads" : "tails"}]`, "info")];
      const index = state.opponentBench.findIndex((p) => p.pokemon.id === selections[0]?.[0]);
      if (!heads || index === -1 || !state.opponentActivePokemon) return markPowerAsUsed({ ...state, events }, pokemonId);
      const oldActive = state.opponentActivePokemon;
      const incoming = state.opponentBench[index];
      const toBench: PokemonInPlay = { ...clearStatusConditionsOnRetreat(oldActive), modifiedWeakness: undefined, modifiedResistance: undefined };
      const switched: GameState = {
        ...state,
        opponentActivePokemon: incoming,
        opponentBench: state.opponentBench.map((p, i) => (i === index ? toBench : p)),
        events: [...events, createGameEvent(`${power.name}: ${incoming.pokemon.name} pasa a ser el Pokémon Activo en lugar de ${oldActive.pokemon.name}`, "action")],
      };
      return markPowerAsUsed(switched, pokemonId);
    },
  },

  "Curación Natural": {
    canUse: (state, pokemonId) => {
      const self = ownPokemonById(state, pokemonId);
      return self && isDamaged(self) ? null : `${self?.pokemon.name ?? "Este Pokémon"} no tiene contadores de daño`;
    },
    getSteps: () => null,
    resolve: (state, pokemonId) => {
      const power = powerOf(state, pokemonId)!;
      const self = ownPokemonById(state, pokemonId)!;
      const healed = replaceOwn(state, pokemonId, { ...self, currentDamage: Math.max(0, (self.currentDamage ?? 0) - 10) });
      return markPowerAsUsed(
        { ...healed, events: [...state.events, createGameEvent(`${power.name}: ${self.pokemon.name} se curó 10 de daño`, "action")] },
        pokemonId
      );
    },
  },
};

Object.assign(POWER_EFFECTS, GYM_HEROES_POWER_EFFECTS);

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
  PokemonPowerType.SwitchFromBench,
  PokemonPowerType.MoveOpponentDamage,
  PokemonPowerType.MoveDamageToSelf,
  PokemonPowerType.ReturnSelfToHand,
  PokemonPowerType.SwapPrize,
  PokemonPowerType.SearchEvolution,
  PokemonPowerType.DiscardToDraw,
  PokemonPowerType.GatherEnergy,
  PokemonPowerType.StatusFlip,
  PokemonPowerType.TakeEnergyToActive,
  PokemonPowerType.SwitchOpponentOnFlip,
  PokemonPowerType.SelfHeal,
];

