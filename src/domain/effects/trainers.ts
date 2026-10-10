/**
 * TRAINER_EFFECTS — every Base Set and Jungle Trainer as a CardEffectDef (sourceId = the
 * card's id in the hand). Steps are ported from the frontend's trainer-registry.ts and the
 * selections mean what the API's playTrainer handler maps them to:
 *
 * | Trainer | selections |
 * |---|---|
 * | Switch / Gust of Wind | [[benchPokemonId]] (own / opponent's bench) |
 * | Potion / Defender / Scoop Up / Devolution Spray | [[ownPokemonId]] |
 * | Super Potion | [[ownPokemonId], [energyId]] |
 * | Energy Removal | [[opponentActiveEnergyId]] |
 * | Super Energy Removal | [[ownPokemonId], [ownEnergyId], [opponentPokemonId], [1–2 energyIds]] |
 * | Energy Retrieval | [[handCardId], [1–2 basic energyIds from discard]] |
 * | Maintenance | [[handCardId, handCardId]] |
 * | Computer Search | [[handCardId, handCardId], [deckCardId]] |
 * | Item Finder | [[handCardId, handCardId], [discardTrainerId]] |
 * | Pokémon Breeder | [[stage2CardId], [basicPokemonId]] |
 * | Pokémon Trader | [[handPokemonId], [deckPokemonId]] |
 * | Poké Ball | 1 coin; heads: [[deckPokemonId]] |
 * | Pokédex | [[new order of the top cards as "0".."n-1"]] |
 * | Revive | [[discardBasicId]] · Pokémon Flute: [[opponentDiscardBasicId]] |
 * | Bill, Professor Oak, Imposter Professor Oak, Lass, PlusPower, Full Heal, Pokémon Center | [] |
 * | Mr. Fuji (Fossil) | [[benchPokemonId]] |
 * | Energy Search (Fossil) | [[deckBasicEnergyId]] (no step when the deck has none) |
 * | Gambler (Fossil) | 1 coin; [] |
 * | Recycle (Fossil) | 1 coin; heads (and a non-empty discard pile): [[discardCardId]] |
 *
 * Mysterious Fossil and Clefairy Doll have no entry: they are played as Basic Pokémon
 * (playBasicPokemon; see isPlayedAsBasic).
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { createGameEvent, drawCard, energyCardLabel, getEnergyTypeInSpanish, shuffle, triggerOnPlayPower } from "@/lib/gameState";
import { ALL_CARDS } from "@/domain/catalog";
import { cardsLeavingPlay, isBasicEnergy, isEnergyCard, isPokemonCard } from "@/domain/cards";
import { CardKind, PokemonStage } from "@/domain/constants";
import { MAX_BENCH_SIZE, findInPlay, getEvolutionBlocker } from "@/domain/board";
import {
  playBill,
  playSwitch,
  playGustOfWind,
  playPlusPower,
  playDefender,
  playPotion,
  playSuperPotion,
  playFullHeal,
  playEnergyRemoval,
  playSuperEnergyRemoval,
  playProfessorOak,
  playImposterProfessorOak,
  playLass,
  playPokemonCenter,
  playEnergyRetrieval,
  playMaintenance,
  playComputerSearch,
  playItemFinder,
  playPokemonBreeder,
  canPlayPokemonBreeder,
  playPokemonTrader,
  playScoopUp,
  playDevolutionSpray,
  hasEvolvedPokemon,
  getEvolvedPokemonTargets,
  playPokeBall,
  playPokedex,
  playRevive,
  playPokemonFlute,
} from "@/domain/trainers";
import type { CardEffectDef, SelectionOption, SelectionStep } from "./types";

// ============================================================================
// Option helpers
// ============================================================================

type Location = "Activo" | "Banca" | "Activo rival" | "Banca rival";

function remainingHp(pokemon: PokemonInPlay): number {
  return isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.hp - (pokemon.currentDamage ?? 0) : 0;
}

export function pokemonOption(pokemon: PokemonInPlay, location: Location, showDamage = false): SelectionOption {
  return {
    id: pokemon.pokemon.id,
    label: `${pokemon.pokemon.name} (${location})`,
    sublabel: showDamage ? `${pokemon.currentDamage ?? 0} de daño` : `${remainingHp(pokemon)} PS`,
  };
}

export function energyOption(energy: GameCard): SelectionOption {
  return {
    id: energy.id,
    label: energyCardLabel(energy),
  };
}

export function cardOption(card: GameCard): SelectionOption {
  return { id: card.id, label: card.name };
}

/** Own Pokémon matching `filter`, as options + thumbnails (Active first). */
function ownPokemonChoices(state: GameState, filter: (p: PokemonInPlay) => boolean, showDamage = false) {
  const options: SelectionOption[] = [];
  const thumbnails: GameCard[] = [];
  if (state.playerActivePokemon && filter(state.playerActivePokemon)) {
    options.push(pokemonOption(state.playerActivePokemon, "Activo", showDamage));
    thumbnails.push(state.playerActivePokemon.pokemon);
  }
  for (const benched of state.playerBench) {
    if (benched && filter(benched)) {
      options.push(pokemonOption(benched, "Banca", showDamage));
      thumbnails.push(benched.pokemon);
    }
  }
  return { options, thumbnails };
}

function opponentPokemonChoices(state: GameState, filter: (p: PokemonInPlay) => boolean) {
  const options: SelectionOption[] = [];
  const thumbnails: GameCard[] = [];
  if (state.opponentActivePokemon && filter(state.opponentActivePokemon)) {
    options.push(pokemonOption(state.opponentActivePokemon, "Activo rival"));
    thumbnails.push(state.opponentActivePokemon.pokemon);
  }
  for (const benched of state.opponentBench) {
    if (benched && filter(benched)) {
      options.push(pokemonOption(benched, "Banca rival"));
      thumbnails.push(benched.pokemon);
    }
  }
  return { options, thumbnails };
}

const isDamaged = (p: PokemonInPlay) => (p.currentDamage ?? 0) > 0;
const hasEnergy = (p: PokemonInPlay) => p.attachedEnergy.length > 0;
const otherHandCards = (state: GameState, cardId: string) => state.playerHand.filter((c) => c.id !== cardId);
const isBasicPokemonCard = (c: GameCard) => c.kind === CardKind.Pokemon && c.stage === PokemonStage.Basic;

/** Own bench index of a Pokémon id (-1 = Active or not found) */
function ownTargetIndex(state: GameState, pokemonId: string): number {
  const found = findInPlay(state, "player", pokemonId);
  return found ? found.benchIndex : -1;
}

/** A Trainer that asks nothing (its rules are all in `play`) */
function immediate(play: (state: GameState, cardId: string) => GameState, canUse?: (state: GameState, cardId: string) => string | null): CardEffectDef {
  return {
    canUse: canUse ?? (() => null),
    getSteps: () => null,
    resolve: (state, cardId) => play(state, cardId),
  };
}

/** A Trainer with exactly one step */
function singleStep(
  step: (state: GameState, cardId: string) => SelectionStep,
  canUse: (state: GameState, cardId: string) => string | null,
  resolve: (state: GameState, cardId: string, chosen: string[]) => GameState
): CardEffectDef {
  return {
    canUse,
    getSteps: (state, cardId, selections) => (selections.length === 0 ? step(state, cardId) : null),
    resolve: (state, cardId, selections) => resolve(state, cardId, selections[0]),
  };
}

// ============================================================================
// Pokémon Breeder helpers (Stage 2 → matching Basic, via the catalog's Stage 1)
// ============================================================================

function breederTargets(state: GameState, cardId: string, stage2: GameCard): PokemonInPlay[] {
  const own = [state.playerActivePokemon, ...state.playerBench].filter((p): p is PokemonInPlay => p != null);
  return own.filter((p) => canPlayPokemonBreeder(state, cardId, stage2.id, ownTargetIndex(state, p.pokemon.id)));
}

function breederStage2s(state: GameState, cardId: string): GameCard[] {
  return state.playerHand.filter(
    (c) => isPokemonCard(c) && c.stage === PokemonStage.Stage2 && breederTargets(state, cardId, c).length > 0
  );
}

// ============================================================================
// Registry
// ============================================================================

export const TRAINER_EFFECTS: Record<string, CardEffectDef> = {
  // ------------------------------------------------------------------ immediate
  "Bill": immediate(playBill),
  "Professor Oak": immediate(playProfessorOak),
  "PlusPower": immediate(playPlusPower),
  "Lass": immediate(playLass),
  "Pokémon Center": immediate(playPokemonCenter),
  "Imposter Professor Oak": immediate(playImposterProfessorOak),
  "Full Heal": immediate(playFullHeal, (state) => {
    if (!state.playerActivePokemon) return "No tienes Pokémon activo";
    return (state.playerActivePokemon.statusConditions ?? []).length === 0 ? "No hay estados especiales que curar" : null;
  }),

  // ------------------------------------------------------------------ one step
  "Switch": singleStep(
    (state) => {
      const bench = state.playerBench.filter((p): p is PokemonInPlay => p != null);
      return {
        title: "Switch",
        description: "Selecciona un Pokémon de tu banca para intercambiar",
        options: bench.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name, sublabel: `${remainingHp(p)} PS` })),
        maxSelections: 1,
        thumbnails: bench.map((p) => p.pokemon),
        disableAutoSelect: true,
      };
    },
    (state) => {
      if (!state.playerActivePokemon) return "No tienes Pokémon activo";
      return state.playerBench.some((p) => p != null) ? null : "No tienes Pokémon en la banca";
    },
    (state, cardId, [pokemonId]) =>
      playSwitch(state, cardId, state.playerBench.findIndex((p) => p?.pokemon.id === pokemonId))
  ),

  "Gust of Wind": singleStep(
    (state) => {
      const bench = state.opponentBench.filter((p): p is PokemonInPlay => p != null);
      return {
        title: "Gust of Wind",
        description: "Selecciona un Pokémon de la banca rival",
        options: bench.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name, sublabel: `${remainingHp(p)} PS` })),
        maxSelections: 1,
        thumbnails: bench.map((p) => p.pokemon),
      };
    },
    (state) => {
      if (!state.opponentActivePokemon) return "El rival no tiene Pokémon activo";
      return state.opponentBench.some((p) => p != null) ? null : "El rival no tiene Pokémon en la banca";
    },
    (state, cardId, [pokemonId]) =>
      playGustOfWind(state, cardId, state.opponentBench.findIndex((p) => p?.pokemon.id === pokemonId))
  ),

  "Potion": singleStep(
    (state) => ({
      title: "Potion",
      description: "Selecciona un Pokémon para curar 20 de daño",
      ...ownPokemonChoices(state, isDamaged, true),
      maxSelections: 1,
    }),
    (state) => (ownPokemonChoices(state, isDamaged).options.length > 0 ? null : "No hay Pokémon con daño para curar"),
    (state, cardId, [pokemonId]) => playPotion(state, cardId, pokemonId)
  ),

  "Defender": singleStep(
    (state) => {
      const { options, thumbnails } = ownPokemonChoices(state, () => true);
      return {
        title: "Defender",
        description: "Selecciona un Pokémon para proteger (-20 daño)",
        options: options.map(({ id, label }) => ({ id, label })),
        thumbnails,
        maxSelections: 1,
      };
    },
    (state) => (ownPokemonChoices(state, () => true).options.length > 0 ? null : "No tienes Pokémon en juego"),
    (state, cardId, [pokemonId]) => playDefender(state, cardId, pokemonId)
  ),

  "Energy Removal": singleStep(
    (state) => {
      const energies = state.opponentActivePokemon?.attachedEnergy ?? [];
      return {
        title: "Energy Removal",
        description: `Selecciona una energía de ${state.opponentActivePokemon?.pokemon.name ?? "rival"}`,
        options: energies.map(energyOption),
        maxSelections: 1,
        thumbnails: energies,
      };
    },
    (state) =>
      state.opponentActivePokemon && state.opponentActivePokemon.attachedEnergy.length > 0
        ? null
        : "El Pokémon activo rival no tiene energías",
    (state, cardId, [energyId]) => playEnergyRemoval(state, cardId, energyId)
  ),

  "Scoop Up": singleStep(
    (state) => ({
      title: "Scoop Up",
      description: "Selecciona un Pokémon: su carta de Pokémon Básico vuelve a tu mano y se descartan las cartas unidas",
      ...ownPokemonChoices(state, () => true),
      maxSelections: 1,
    }),
    (state) => {
      if (!state.playerActivePokemon && state.playerBench.length === 0) return "No tienes Pokémon en juego";
      if (state.playerActivePokemon && state.playerBench.length === 0) return "No puedes recoger tu único Pokémon sin tener banca";
      return null;
    },
    (state, cardId, [pokemonId]) => playScoopUp(state, cardId, ownTargetIndex(state, pokemonId))
  ),

  "Devolution Spray": singleStep(
    (state) => {
      const options: SelectionOption[] = [];
      const thumbnails: GameCard[] = [];
      for (const target of getEvolvedPokemonTargets(state)) {
        const pokemon = target.pokemon;
        const lowerStage = pokemon.previousEvolutions?.[pokemon.previousEvolutions.length - 1];
        const lowerHp = lowerStage && isPokemonCard(lowerStage) ? lowerStage.hp : 0;
        const damage = pokemon.currentDamage ?? 0;
        options.push({
          id: pokemon.pokemon.id,
          label: `${pokemon.pokemon.name} (${target.index === -1 ? "Activo" : "Banca"})`,
          sublabel: damage >= lowerHp
            ? `Quedará Fuera de Combate (${damage} de daño → ${lowerStage?.name ?? ""} ${lowerHp} PS)`
            : `→ ${lowerStage?.name ?? ""} (${damage}/${lowerHp} de daño)`,
        });
        thumbnails.push(pokemon.pokemon);
      }
      return {
        title: "Devolution Spray",
        description: "Selecciona un Pokémon evolucionado para devolverlo a su fase anterior",
        options,
        maxSelections: 1,
        thumbnails,
        disableAutoSelect: true,
      };
    },
    (state) => (hasEvolvedPokemon(state) ? null : "No tienes Pokémon evolucionados en juego"),
    (state, cardId, [pokemonId]) => playDevolutionSpray(state, cardId, ownTargetIndex(state, pokemonId))
  ),

  "Maintenance": singleStep(
    (state, cardId) => ({
      title: "Maintenance",
      description: "Selecciona 2 cartas de tu mano para barajar en tu mazo",
      options: otherHandCards(state, cardId).map(cardOption),
      maxSelections: 2,
      source: "hand",
    }),
    (state, cardId) => (otherHandCards(state, cardId).length < 2 ? "Necesitas al menos 2 cartas adicionales en tu mano" : null),
    (state, cardId, chosen) => playMaintenance(state, cardId, chosen)
  ),

  "Pokédex": singleStep(
    (state) => {
      const top = state.playerDeck.slice(0, Math.min(5, state.playerDeck.length));
      return {
        title: "Pokédex",
        description: `Ordena las próximas ${top.length} cartas de tu mazo`,
        options: top.map((c, i) => ({ id: String(i), label: c.name })),
        maxSelections: top.length,
        orderingCards: top,
      };
    },
    (state) => (state.playerDeck.length === 0 ? "Tu mazo está vacío" : null),
    (state, cardId, order) => playPokedex(state, cardId, order.map(Number))
  ),

  "Revive": singleStep(
    (state) => {
      const basics = state.playerDiscard.filter(isBasicPokemonCard);
      return {
        title: "Revive",
        description: "Selecciona un Pokémon Básico de tu pila de descartes para ponerlo en tu banca",
        options: basics.map(cardOption),
        maxSelections: 1,
        cards: basics,
      };
    },
    (state) => {
      if (state.playerBench.length >= MAX_BENCH_SIZE) return "Tu banca está llena";
      return state.playerDiscard.some(isBasicPokemonCard) ? null : "No hay Pokémon Básicos en tu pila de descartes";
    },
    (state, cardId, [discardId]) => playRevive(state, cardId, discardId)
  ),

  "Pokémon Flute": singleStep(
    (state) => {
      const basics = state.opponentDiscard.filter(isBasicPokemonCard);
      return {
        title: "Pokémon Flute",
        description: "Selecciona un Pokémon Básico de la pila de descartes rival para ponerlo en su banca",
        options: basics.map(cardOption),
        maxSelections: 1,
        cards: basics,
      };
    },
    (state) => {
      if (state.opponentBench.length >= MAX_BENCH_SIZE) return "La banca rival está llena";
      return state.opponentDiscard.some(isBasicPokemonCard) ? null : "No hay Pokémon Básicos en la pila de descartes rival";
    },
    (state, cardId, [discardId]) => playPokemonFlute(state, cardId, discardId)
  ),

  // ------------------------------------------------------------------ multi step
  "Energy Retrieval": {
    canUse: (state, cardId) => {
      if (otherHandCards(state, cardId).length < 1) return "Necesitas al menos 1 carta adicional en tu mano para descartar";
      return state.playerDiscard.some(isBasicEnergy) ? null : "No hay energías básicas en tu descarte";
    },
    getSteps: (state, cardId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Energy Retrieval",
          description: "Selecciona 1 carta de tu mano para descartar",
          options: otherHandCards(state, cardId).map(cardOption),
          maxSelections: 1,
          source: "hand",
        };
      }
      if (selections.length === 1) {
        const basics = state.playerDiscard.filter(isBasicEnergy);
        return {
          title: "Energy Retrieval",
          description: "Selecciona hasta 2 energías básicas de tu descarte",
          options: basics.map((energy) => ({ id: energy.id, label: `Energía ${getEnergyTypeInSpanish(energy.energyType)}` })),
          maxSelections: Math.min(2, basics.length),
          minSelections: 1,
          thumbnails: basics,
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => playEnergyRetrieval(state, cardId, selections[0][0], selections[1]),
  },

  "Super Potion": {
    canUse: (state) =>
      ownPokemonChoices(state, (p) => isDamaged(p) && hasEnergy(p)).options.length > 0
        ? null
        : "No hay Pokémon con daño y energías para descartar",
    getSteps: (state, _cardId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Super Potion",
          description: "Selecciona un Pokémon para curar 40 de daño",
          ...ownPokemonChoices(state, (p) => isDamaged(p) && hasEnergy(p), true),
          maxSelections: 1,
        };
      }
      if (selections.length === 1) {
        const target = findInPlay(state, "player", selections[0][0])?.pokemon;
        const energies = target?.attachedEnergy ?? [];
        return {
          title: "Super Potion",
          description: `Selecciona energía a descartar de ${target?.pokemon.name ?? ""}`,
          options: energies.map(energyOption),
          maxSelections: 1,
          thumbnails: energies,
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => playSuperPotion(state, cardId, selections[0][0], selections[1][0]),
  },

  "Computer Search": {
    canUse: (state, cardId) => {
      if (otherHandCards(state, cardId).length < 2) return "Necesitas al menos 2 cartas adicionales en tu mano";
      return state.playerDeck.length === 0 ? "Tu mazo está vacío" : null;
    },
    getSteps: (state, cardId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Computer Search",
          description: "Selecciona 2 cartas de tu mano para descartar",
          options: otherHandCards(state, cardId).map(cardOption),
          maxSelections: 2,
          source: "hand",
        };
      }
      if (selections.length === 1) {
        return {
          title: "Computer Search",
          description: "Selecciona 1 carta de tu mazo",
          options: state.playerDeck.map(cardOption),
          maxSelections: 1,
          cards: state.playerDeck,
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => playComputerSearch(state, cardId, selections[0], selections[1][0]),
  },

  "Item Finder": {
    canUse: (state, cardId) => {
      if (otherHandCards(state, cardId).length < 2) return "Necesitas al menos 2 cartas adicionales en tu mano";
      return state.playerDiscard.some((c) => c.kind === CardKind.Trainer) ? null : "No hay cartas de Entrenador en tu descarte";
    },
    getSteps: (state, cardId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Item Finder",
          description: "Selecciona 2 cartas de tu mano para descartar",
          options: otherHandCards(state, cardId).map(cardOption),
          maxSelections: 2,
          source: "hand",
        };
      }
      if (selections.length === 1) {
        const trainers = state.playerDiscard.filter((c) => c.kind === CardKind.Trainer);
        return {
          title: "Item Finder",
          description: "Selecciona 1 carta de Entrenador de tu descarte",
          options: trainers.map(cardOption),
          maxSelections: 1,
          cards: trainers,
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => playItemFinder(state, cardId, selections[0], selections[1][0]),
  },

  "Pokémon Trader": {
    canUse: (state) => {
      if (!state.playerHand.some(isPokemonCard)) return "No tienes Pokémon en tu mano para intercambiar";
      return state.playerDeck.some(isPokemonCard) ? null : "No hay Pokémon en tu mazo";
    },
    getSteps: (state, cardId, selections) => {
      if (selections.length === 0) {
        const inHand = state.playerHand.filter((c) => c.id !== cardId && isPokemonCard(c));
        return {
          title: "Pokémon Trader",
          description: "Selecciona un Pokémon de tu mano para devolver al mazo",
          options: inHand.map(cardOption),
          maxSelections: 1,
          cards: inHand,
        };
      }
      if (selections.length === 1) {
        const inDeck = state.playerDeck.filter(isPokemonCard);
        return {
          title: "Pokémon Trader",
          description: "Selecciona un Pokémon de tu mazo para añadir a tu mano",
          options: inDeck.map(cardOption),
          maxSelections: 1,
          cards: inDeck,
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => playPokemonTrader(state, cardId, selections[0][0], selections[1][0]),
  },

  "Super Energy Removal": {
    canUse: (state) => {
      if (ownPokemonChoices(state, hasEnergy).options.length === 0) return "No tienes Pokémon con energías para descartar";
      return opponentPokemonChoices(state, hasEnergy).options.length > 0 ? null : "El rival no tiene Pokémon con energías";
    },
    getSteps: (state, _cardId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Super Energy Removal",
          description: "Selecciona tu Pokémon del cual descartar 1 energía",
          ...ownPokemonChoices(state, hasEnergy),
          maxSelections: 1,
        };
      }
      if (selections.length === 1) {
        const own = findInPlay(state, "player", selections[0][0])?.pokemon;
        const energies = own?.attachedEnergy ?? [];
        return {
          title: "Super Energy Removal",
          description: `Selecciona energía a descartar de ${own?.pokemon.name ?? "tu Pokémon"}`,
          options: energies.map(energyOption),
          maxSelections: 1,
          thumbnails: energies,
        };
      }
      if (selections.length === 2) {
        return {
          title: "Super Energy Removal",
          description: "Selecciona el Pokémon rival del cual quitar energías",
          ...opponentPokemonChoices(state, hasEnergy),
          maxSelections: 1,
        };
      }
      if (selections.length === 3) {
        const target = findInPlay(state, "opponent", selections[2][0])?.pokemon;
        const energies = target?.attachedEnergy ?? [];
        return {
          title: "Super Energy Removal",
          description: `Selecciona hasta 2 energías de ${target?.pokemon.name ?? "rival"} para descartar`,
          options: energies.map(energyOption),
          maxSelections: Math.min(2, energies.length),
          minSelections: 1,
          thumbnails: energies,
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) =>
      playSuperEnergyRemoval(state, cardId, selections[0][0], selections[1][0], selections[2][0], selections[3]),
  },

  "Pokémon Breeder": {
    canUse: (state, cardId) => {
      if (state.turnNumber <= 2) return "No puedes evolucionar en tu primer turno";
      const blocker = getEvolutionBlocker(state);
      if (blocker) return blocker;
      if (!state.playerHand.some((c) => isPokemonCard(c) && c.stage === PokemonStage.Stage2)) {
        return "No tienes Pokémon Fase 2 en tu mano";
      }
      return breederStage2s(state, cardId).length > 0
        ? null
        : "No tienes Pokémon básicos válidos para evolucionar con tus Fase 2";
    },
    getSteps: (state, cardId, selections) => {
      if (selections.length === 0) {
        const stage2s = breederStage2s(state, cardId);
        return {
          title: "Pokémon Breeder",
          description: "Selecciona un Pokémon Fase 2 de tu mano",
          options: stage2s.map(cardOption),
          maxSelections: 1,
          cards: stage2s,
          disableAutoSelect: true,
        };
      }
      if (selections.length === 1) {
        const stage2 = state.playerHand.find((c) => c.id === selections[0][0]);
        const targets = stage2 ? breederTargets(state, cardId, stage2) : [];
        return {
          title: "Pokémon Breeder",
          description: `Selecciona el Pokémon básico para evolucionar a ${stage2?.name ?? ""}`,
          options: targets.map((p) =>
            pokemonOption(p, state.playerActivePokemon?.pokemon.id === p.pokemon.id ? "Activo" : "Banca")
          ),
          maxSelections: 1,
          thumbnails: targets.map((p) => p.pokemon),
          disableAutoSelect: true,
        };
      }
      return null;
    },
    // The Stage 2 is played from the hand: its "when you play it from your hand" power triggers
    resolve: (state, cardId, selections) =>
      triggerOnPlayPower(playPokemonBreeder(state, cardId, selections[0][0], ownTargetIndex(state, selections[1][0])), selections[0][0]),
  },

  // ------------------------------------------------------------------ coin
  "Poké Ball": {
    canUse: (state) => (state.playerDeck.length === 0 ? "Tu mazo está vacío" : null),
    coinFlips: () => 1,
    getSteps: (state, _cardId, selections, coinResults) => {
      if (coinResults?.[0] !== "heads" || selections.length > 0) return null;
      const inDeck = state.playerDeck.filter((c) => c.kind === CardKind.Pokemon);
      if (inDeck.length === 0) return null;
      return {
        title: "Poké Ball",
        description: "Selecciona un Pokémon de tu mazo",
        options: inDeck.map(cardOption),
        maxSelections: 1,
        cards: inDeck,
      };
    },
    resolve: (state, cardId, selections, { coinResults }) =>
      playPokeBall(state, cardId, selections[0]?.[0] ?? null, coinResults?.[0] === "heads"),
  },
};

/**
 * Trainer cards in the catalog that are intentionally NOT playable yet. Every other Trainer
 * in ALL_CARDS must have a TRAINER_EFFECTS entry (enforced by a test).
 */
export const UNSUPPORTED_TRAINERS: readonly string[] = [
  // Team Rocket: implemented in the next commits of Stage D
  "Here Comes Team Rocket!",
  "Rocket's Sneak Attack",
  "The Boss's Way",
  "Challenge!",
  "Digger",
  "Imposter Oak's Revenge",
  "Nightly Garbage Run",
  "Goop Gas Attack",
  "Sleep!",
];

// ============================================================================
// Fossil
// ============================================================================

/** The Trainer leaves the hand for the discard pile (after its effect). */
function discardPlayed(state: GameState, cardId: string, message: string): GameState {
  const card = state.playerHand.find((c) => c.id === cardId)!;
  return {
    ...state,
    playerHand: state.playerHand.filter((c) => c.id !== cardId),
    playerDiscard: [...state.playerDiscard, card],
    events: [...state.events, createGameEvent(message, "action")],
  };
}

function drawCards(state: GameState, count: number): { state: GameState; drawn: number } {
  let deck = state.playerDeck;
  let hand = state.playerHand;
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const result = drawCard(deck, hand);
    if (!result.success) break;
    deck = result.newDeck;
    hand = result.newHand;
    drawn++;
  }
  return { state: { ...state, playerDeck: deck, playerHand: hand }, drawn };
}

Object.assign(TRAINER_EFFECTS, {
  "Mr. Fuji": singleStep(
    (state) => {
      const bench = state.playerBench.filter((p): p is PokemonInPlay => p != null);
      return {
        title: "Mr. Fuji",
        description: "Elige un Pokémon de tu Banca: se baraja en tu mazo con todas sus cartas",
        options: bench.map((p) => pokemonOption(p, "Banca")),
        maxSelections: 1,
        thumbnails: bench.map((p) => p.pokemon),
        disableAutoSelect: true,
      };
    },
    (state) => (state.playerBench.some((p) => p != null) ? null : "No tienes Pokémon en la Banca"),
    (state, cardId, [pokemonId]) => {
      const index = state.playerBench.findIndex((p) => p?.pokemon.id === pokemonId);
      const target = state.playerBench[index];
      const played = discardPlayed(state, cardId, "Jugaste Mr. Fuji");
      return {
        ...played,
        playerBench: state.playerBench.filter((_, i) => i !== index),
        playerDeck: shuffle([...state.playerDeck, ...cardsLeavingPlay(target)]),
        events: [...played.events, createGameEvent(`${target.pokemon.name} y sus cartas se barajaron en tu mazo`, "info")],
      };
    }
  ),

  "Energy Search": {
    canUse: (state) => (state.playerDeck.length === 0 ? "Tu mazo está vacío" : null),
    getSteps: (state, _cardId, selections) => {
      if (selections.length > 0) return null;
      const basics = state.playerDeck.filter(isBasicEnergy);
      if (basics.length === 0) return null;
      return {
        title: "Energy Search",
        description: "Elige una carta de Energía básica de tu mazo",
        options: basics.map(energyOption),
        maxSelections: 1,
        cards: basics,
      };
    },
    resolve: (state, cardId, selections) => {
      const chosenId = selections[0]?.[0];
      const found = chosenId ? state.playerDeck.find((c) => c.id === chosenId) : undefined;
      const played = discardPlayed(state, cardId, "Jugaste Energy Search");
      return {
        ...played,
        playerHand: found ? [found, ...played.playerHand] : played.playerHand,
        playerDeck: shuffle(state.playerDeck.filter((c) => c.id !== chosenId)),
        events: [
          ...played.events,
          createGameEvent(found ? `Tomaste ${energyOption(found).label} de tu mazo` : "No había Energía básica en tu mazo", "info"),
          createGameEvent("Se mezcló el mazo", "info"),
        ],
      };
    },
  },

  "Gambler": {
    canUse: () => null,
    coinFlips: () => 1,
    getSteps: () => null,
    resolve: (state, cardId, _selections, { coinResults }) => {
      const heads = coinResults?.[0] === "heads";
      const played = discardPlayed(state, cardId, "Jugaste Gambler");
      const shuffled: GameState = { ...played, playerDeck: shuffle([...played.playerDeck, ...played.playerHand]), playerHand: [] };
      const { state: drew, drawn } = drawCards(shuffled, heads ? 8 : 1);
      return {
        ...drew,
        events: [
          ...drew.events,
          createGameEvent(`Barajaste tu mano en tu mazo - Moneda: [coin:${heads ? "heads" : "tails"}]`, "info"),
          createGameEvent(`Robaste ${drawn} carta${drawn === 1 ? "" : "s"}`, "info"),
        ],
      };
    },
  },

  "Recycle": {
    canUse: () => null,
    coinFlips: () => 1,
    getSteps: (state, _cardId, selections, coinResults) => {
      if (coinResults?.[0] !== "heads" || selections.length > 0 || state.playerDiscard.length === 0) return null;
      return {
        title: "Recycle",
        description: "Elige una carta de tu pila de descartes para ponerla encima de tu mazo",
        options: state.playerDiscard.map(cardOption),
        maxSelections: 1,
        cards: state.playerDiscard,
      };
    },
    resolve: (state, cardId, selections, { coinResults }) => {
      const heads = coinResults?.[0] === "heads";
      const chosen = heads ? state.playerDiscard.find((c) => c.id === selections[0]?.[0]) : undefined;
      const withoutChosen: GameState = chosen
        ? { ...state, playerDiscard: state.playerDiscard.filter((c) => c.id !== chosen.id), playerDeck: [chosen, ...state.playerDeck] }
        : state;
      const played = discardPlayed(withoutChosen, cardId, `Jugaste Recycle - Moneda: [coin:${heads ? "heads" : "tails"}]`);
      return chosen
        ? { ...played, events: [...played.events, createGameEvent(`Pusiste ${chosen.name} encima de tu mazo`, "info")] }
        : played;
    },
  },
} satisfies Record<string, CardEffectDef>);

/**
 * Trainers printed "play this card as if it were a Basic Pokémon" (`playsAsBasic`: Mysterious
 * Fossil, Clefairy Doll) have no TRAINER_EFFECTS entry: they go into play with playBasicPokemon.
 */
export function isPlayedAsBasic(name: string): boolean {
  return ALL_CARDS.some((c) => c.kind === CardKind.Trainer && c.name === name && !!c.playsAsBasic);
}

/** Catalog Trainer names (for coverage checks) */
export function catalogTrainerNames(): string[] {
  return [...new Set(ALL_CARDS.filter((c) => c.kind === CardKind.Trainer).map((c) => c.name))];
}
