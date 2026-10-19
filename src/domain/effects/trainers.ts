/**
 * TRAINER_EFFECTS — every Trainer (Base Set to Gym Heroes) as a CardEffectDef (sourceId = the
 * card's id in the hand). Steps are ported from the frontend's trainer-registry.ts and the
 * selections mean what the API's playTrainer handler maps them to:
 *
 * | Trainer | selections |
 * |---|---|
 * | Switch / Gust of Wind | [[benchPokemonId]] (own / opponent's bench) |
 * | Potion / Defender / Scoop Up / Devolution Spray | [[ownPokemonId]] |
 * | Super Potion | [[ownPokemonId], [energyId]] |
 * | Energy Removal | [[energyId attached to any of the opponent's Pokémon]] |
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
 * | Here Comes Team Rocket!, Goop Gas Attack (TR) | [] |
 * | Rocket's Sneak Attack (TR) | [[opponentHandTrainerId] or []] (the step shows the whole opponent hand: `reveals`) |
 * | The Boss's Way (TR) | [[deckDarkEvolutionId]] (no step when the deck has none) |
 * | Challenge! (TR) | [["accept"/"decline"] (chooser: opponent)]; accepted: + [[own deck Basic ids…]] (self) + [[opponent's deck Basic ids…]] (chooser: opponent). Both Benches full: no step (draw 2) |
 * | Digger (TR) | coins "untilTails": coin i is flipped by you (even i) / the opponent (odd i); [] |
 * | Imposter Oak's Revenge (TR) | [[handCardIdToDiscard]] |
 * | Nightly Garbage Run (TR) | [[up to 3 discard ids: Pokémon cards / basic Energy]] |
 * | Sleep! (TR) | 1 coin; [] |
 * | Brock, Blaine's Last Resort, Sabrina's Gaze, Trash Exchange (GH) | [] |
 * | Lt. Surge (GH) | [[handBasicPokemonId]] |
 * | Misty (GH) | [[handCardId, handCardId]] (discarded); then a `misty` modifier for this turn's attack |
 * | The Rocket's Trap (GH) | 1 coin; [] (heads: up to 3 random cards of the opponent's hand) |
 * | Brock's Training Method (GH) | [[deckBrocksPokemonId]] (no step when the deck has none) · Good Manners: [[deckBasicPokemonId]] (same) |
 * | Erika's Maids (GH) | [[handCardId, handCardId], [0–2 deck Erika's Pokémon ids]] (no 2nd step when the deck has none) |
 * | Erika's Perfume (GH) | [[0+ Basic Pokémon ids from the opponent's hand]] (`reveals`; no step when that hand is empty) |
 * | Minion of Team Rocket (GH) | 2 coins; both heads (and a Bench): [[opponentBenchPokemonId]]; a tails ends the turn (`skipEndTurn`: the caller ends it) |
 * | Misty's Wrath (GH) | [[2 of the top 7 deck card ids]] (fewer when the deck is shorter) |
 * | Secret Mission (GH) | [[] (looks at the opponent's hand, `reveals`; no step when it is empty), [0+ handCardIds to discard]] |
 * | Blaine's Gamble (GH) | [[0+ handCardIds to discard]]; then 1 coin (asked with the selections: getTrainerCoinFlips(state, id, selections)) |
 * | Energy Flow (GH) | [[0+ Energy card ids attached to own Pokémon]] |
 * | Charity (GH) | [] (attached to the Active) |
 * | Sabrina's ESP (GH) | [[ownSabrinasPokemonId]] (attached to it) |
 * | Recall (GH) | [] (state.recallActiveOnTurn: this turn's Active may use the attacks under it, getAvailableAttacks) |
 * | Tickling Machine (GH) | 1 coin; [] (heads: the opponent's hand is set aside until the end of their next turn, state.setAsideHands; a tails ends the turn, `skipEndTurn` as Minion of Team Rocket) |
 * | Erika (GH) | [["0"–"3"] (self: how many you draw), ["0"–"3"] (chooser: opponent: how many they draw)] (counts above that deck's size disabled) |
 * | Lt. Surge's Treaty (GH) | [["prizes"/"draw"] (chooser: opponent)]; "prizes": + [[own Prize position "0".."n-1"]] (self) + [[opponent's Prize position]] (chooser: opponent). "prizes" disabled when both sides hold their last Prize |
 * | Blaine's Quiz #1 (GH) | [[handPokemonCardId] (self), [length in inches, e.g. "346"] (chooser: opponent; 4 options, quizLengthOptions)] |
 * | Misty's Duel (GH) | [] (state.pendingDuel: each side picks rock / paper / scissors with submitDuelPick, domain/duel/rps.ts) |
 *
 * Mysterious Fossil and Clefairy Doll have no entry: they are played as Basic Pokémon
 * (playBasicPokemon; see isPlayedAsBasic).
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { applyStatusCondition, clearStatusConditionsOnRetreat, createGameEvent, drawCard, endTurn, energyCardLabel, getEnergyTypeInSpanish, shuffle, triggerOnPlayPower } from "@/lib/gameState";
import { arePrizesRevealed, hasStatusImmunity } from "@/domain/powers";
import { modifiersAttachedTo } from "@/lib/modifiers";
import { ALL_CARDS, heightInInches, pokedexHeight, pokedexSpecies, quizLengthOptions } from "@/domain/catalog";
import { cardOutOfPlay, cardsLeavingPlay, isBasicEnergy, isEnergyCard, isPokemonCard } from "@/domain/cards";
import { hasOwner, type PokemonOwner } from "@/domain/cards/owner";
import { attachTrainer, CHARITY, SABRINAS_ESP } from "@/domain/trainers/attached";
import { setAsideHand, TICKLING_MACHINE } from "@/domain/trainers/set-aside";
import { MISTYS_DUEL, startDuel } from "@/domain/duel/rps";
import { CardKind, GamePhase, PokemonStage, StatusCondition } from "@/domain/constants";
import { isBenchFull, maxBenchSize, findInPlay, getEvolutionBlocker } from "@/domain/board";
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
import { STADIUM_EFFECTS } from "./stadiums";

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

  // "Choose 1 Energy card attached to 1 of your opponent's Pokémon": Active or Benched
  "Energy Removal": singleStep(
    (state) => {
      const holders = [
        ...(state.opponentActivePokemon ? [{ pokemon: state.opponentActivePokemon, location: "Activo rival" }] : []),
        ...state.opponentBench.map((pokemon) => ({ pokemon, location: "Banca rival" })),
      ];
      const choices = holders.flatMap(({ pokemon, location }) =>
        pokemon.attachedEnergy.map((energy) => ({ energy, holder: `${pokemon.pokemon.name} (${location})` }))
      );
      return {
        title: "Energy Removal",
        description: "Selecciona una energía unida a un Pokémon del rival",
        options: choices.map(({ energy, holder }) => ({ ...energyOption(energy), sublabel: holder })),
        maxSelections: 1,
        thumbnails: choices.map(({ energy }) => energy),
      };
    },
    (state) =>
      opponentPokemonChoices(state, hasEnergy).options.length > 0 ? null : "Los Pokémon del rival no tienen energías",
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
      if (isBenchFull(state, "player")) return "Tu banca está llena";
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
      if (isBenchFull(state, "opponent")) return "La banca rival está llena";
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
  // Gym Challenge (catalog only, 2026-10-19): each name leaves this list when its plan task
  // implements it (docs/superpowers/plans/2026-10-19-gym-challenge.md). Its 7 Stadiums need no
  // entry here: they fall back to playStadium (in play, no rule yet).
  "Blaine",
  "Giovanni",
  "Koga",
  "Sabrina",
  "Brock's Protection",
  "Erika's Kindness",
  "Giovanni's Last Resort",
  "Lt. Surge's Secret Plan",
  "Misty's Wish",
  "Blaine's Quiz #2",
  "Blaine's Quiz #3",
  "Koga's Ninja Trick",
  "Master Ball",
  "Max Revive",
  "Misty's Tears",
  "Rocket's Secret Experiment",
  "Sabrina's Psychic Control",
  "Fervor",
  "Transparent Walls",
  "Warp Point",
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
      // An attached Defender is one of "its cards" (kept as a modifier by the engine)
      const { attached, rest } = modifiersAttachedTo(state, target);
      return {
        ...played,
        activeModifiers: rest,
        playerBench: state.playerBench.filter((_, i) => i !== index),
        playerDeck: shuffle([...state.playerDeck, ...cardsLeavingPlay(target), ...attached.map((m) => m.card)]),
        events: [...played.events, createGameEvent(`Mr. Fuji: ${target.pokemon.name} y sus cartas se barajaron en el mazo`, "info")],
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
          createGameEvent(found ? `Energy Search: ${energyOption(found).label} del mazo a la mano` : "Energy Search: no había Energía básica en el mazo", "info"),
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
          createGameEvent(`Gambler: la mano se barajó en el mazo - Moneda: [coin:${heads ? "heads" : "tails"}]`, "info"),
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
        ? { ...played, events: [...played.events, createGameEvent(`Recycle: ${chosen.name} se puso encima del mazo`, "info")] }
        : played;
    },
  },
} satisfies Record<string, CardEffectDef>);

// ============================================================================
// Team Rocket
// ============================================================================

const isBasicPokemon = (c: GameCard) => isPokemonCard(c) && c.stage === PokemonStage.Basic;

/** Basic Pokémon cards of a deck as a "put any number onto your Bench" step (Challenge!). */
function challengeStep(state: GameState, side: "player" | "opponent", chooser: "self" | "opponent"): SelectionStep {
  const deck = side === "player" ? state.playerDeck : state.opponentDeck;
  const benchSize = (side === "player" ? state.playerBench : state.opponentBench).length;
  const basics = deck.filter(isBasicPokemon);
  const room = Math.max(0, maxBenchSize(state, side) - benchSize);
  return {
    title: "Challenge!",
    description:
      chooser === "self"
        ? room === 0 ? "Tu Banca está llena: no puedes poner Pokémon" : "Elige los Pokémon Básicos de tu mazo que pones en tu Banca"
        : room === 0 ? "La Banca de tu rival está llena: no puede poner Pokémon" : "Tu rival elige los Pokémon Básicos de su mazo que pone en su Banca",
    ...(chooser === "opponent" && {
      answererDescription:
        room === 0 ? "Tu Banca está llena: no puedes poner Pokémon" : "Tu rival jugó Challenge!: elige los Pokémon Básicos de tu mazo que pones en tu Banca",
    }),
    options: basics.map(cardOption),
    maxSelections: Math.min(room, basics.length),
    minSelections: 0,
    cards: basics,
    chooser,
    // Answer clock: no Basics benched
    ...(chooser === "opponent" && { defaultSelection: [] }),
  };
}

const benchFrom = (cards: GameCard[], turnNumber: number): PokemonInPlay[] =>
  cards.map((card) => ({
    pokemon: card,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: [],
    currentDamage: 0,
    statusConditions: [],
    playedOnTurn: turnNumber,
  }));

/** Nightly Garbage Run: Basic Pokémon cards, Evolution cards and basic Energy cards. */
const isGarbage = (c: GameCard) => isPokemonCard(c) || isBasicEnergy(c);

Object.assign(TRAINER_EFFECTS, {
  "Here Comes Team Rocket!": immediate((state, cardId) => ({
    ...discardPlayed(state, cardId, "Jugaste Here Comes Team Rocket!"),
    prizesFaceUp: true,
  })),

  "Rocket's Sneak Attack": {
    canUse: () => null,
    getSteps: (state, _cardId, selections) => {
      if (selections.length > 0 || state.opponentHand.length === 0) return null;
      const hand = state.opponentHand;
      const trainers = hand.filter((c) => c.kind === CardKind.Trainer);
      return {
        title: "Rocket's Sneak Attack",
        description: trainers.length > 0
          ? "Mano de tu rival: elige 1 carta de Entrenador; tu rival la baraja en su mazo"
          : "Mano de tu rival: no tiene cartas de Entrenador",
        options: hand.map((c) => ({ ...cardOption(c), disabled: c.kind !== CardKind.Trainer })),
        maxSelections: trainers.length > 0 ? 1 : 0,
        minSelections: trainers.length > 0 ? 1 : 0,
        cards: hand,
        reveals: "opponentHand",
        disableAutoSelect: true,
      };
    },
    resolve: (state, cardId, selections) => {
      const chosen = state.opponentHand.find((c) => c.id === selections[0]?.[0]);
      const played = discardPlayed(state, cardId, "Jugaste Rocket's Sneak Attack");
      const looked = { ...played, events: [...played.events, createGameEvent("Rocket's Sneak Attack: se miró la mano del otro jugador", "info")] };
      if (!chosen) return looked;
      return {
        ...looked,
        opponentHand: state.opponentHand.filter((c) => c.id !== chosen.id),
        opponentDeck: shuffle([...state.opponentDeck, chosen]),
        events: [...looked.events, createGameEvent(`Rocket's Sneak Attack: ${chosen.name} se barajó en el mazo del otro jugador`, "action")],
      };
    },
  },

  "The Boss's Way": {
    canUse: (state) => (state.playerDeck.length === 0 ? "Tu mazo está vacío" : null),
    getSteps: (state, _cardId, selections) => {
      if (selections.length > 0) return null;
      const dark = state.playerDeck.filter((c) => isPokemonCard(c) && c.stage !== PokemonStage.Basic && c.name.includes("Dark"));
      if (dark.length === 0) return null;
      return {
        title: "The Boss's Way",
        description: "Elige una carta de Evolución con «Dark» en su nombre de tu mazo",
        options: dark.map(cardOption),
        maxSelections: 1,
        cards: dark,
      };
    },
    resolve: (state, cardId, selections) => {
      const chosen = state.playerDeck.find((c) => c.id === selections[0]?.[0]);
      const played = discardPlayed(state, cardId, "Jugaste The Boss's Way");
      return {
        ...played,
        playerHand: chosen ? [chosen, ...played.playerHand] : played.playerHand,
        playerDeck: shuffle(state.playerDeck.filter((c) => c.id !== chosen?.id)),
        events: [
          ...played.events,
          createGameEvent(chosen ? `The Boss's Way: se mostró ${chosen.name} y se puso en la mano` : "The Boss's Way: no había cartas de Evolución «Dark» en el mazo", "info"),
          createGameEvent("Se mezcló el mazo", "info"),
        ],
      };
    },
  },

  "Challenge!": {
    canUse: () => null,
    getSteps: (state, _cardId, selections) => {
      const bothFull = isBenchFull(state, "player") && isBenchFull(state, "opponent");
      if (bothFull) return null;
      if (selections.length === 0) {
        return {
          title: "Challenge!",
          description: "Tu rival decide si acepta el desafío. Si lo acepta, cada uno pone Pokémon Básicos de su mazo en su Banca; si no, robas 2 cartas",
          answererDescription:
            "Tu rival jugó Challenge!: ¿aceptas el desafío? Si lo aceptas, cada uno pone Pokémon Básicos de su mazo en su Banca; si no, tu rival roba 2 cartas",
          options: [
            { id: "accept", label: "Aceptar" },
            { id: "decline", label: "Rechazar" },
          ],
          maxSelections: 1,
          disableAutoSelect: true,
          chooser: "opponent",
          // Answer clock: declining only lets the player draw 2
          defaultSelection: ["decline"],
        };
      }
      if (selections[0][0] !== "accept") return null;
      if (selections.length === 1) return challengeStep(state, "player", "self");
      if (selections.length === 2) return challengeStep(state, "opponent", "opponent");
      return null;
    },
    resolve: (state, cardId, selections) => {
      const accepted = selections[0]?.[0] === "accept";
      if (!accepted) {
        const played = discardPlayed(state, cardId, "Jugaste Challenge!");
        const why = selections.length === 0 ? "Challenge!: ambas Bancas están llenas" : "Challenge!: el otro jugador rechazó el desafío";
        const { state: drew, drawn } = drawCards({ ...played, events: [...played.events, createGameEvent(why, "info")] }, 2);
        return { ...drew, events: [...drew.events, createGameEvent(`Robaste ${drawn} carta${drawn === 1 ? "" : "s"}`, "info")] };
      }
      const mine = state.playerDeck.filter((c) => selections[1].includes(c.id));
      const theirs = state.opponentDeck.filter((c) => selections[2].includes(c.id));
      const played = discardPlayed(state, cardId, "Jugaste Challenge!");
      return {
        ...played,
        playerDeck: shuffle(state.playerDeck.filter((c) => !selections[1].includes(c.id))),
        opponentDeck: shuffle(state.opponentDeck.filter((c) => !selections[2].includes(c.id))),
        playerBench: [...state.playerBench, ...benchFrom(mine, state.turnNumber)],
        opponentBench: [...state.opponentBench, ...benchFrom(theirs, state.turnNumber)],
        events: [
          ...played.events,
          createGameEvent("Challenge!: el otro jugador aceptó el desafío", "info"),
          createGameEvent(mine.length > 0 ? `Challenge!: ${mine.map((c) => c.name).join(", ")} a la Banca de quien lo jugó` : "Challenge!: quien lo jugó no puso Pokémon en su Banca", "action"),
          createGameEvent(theirs.length > 0 ? `Challenge!: ${theirs.map((c) => c.name).join(", ")} a la Banca del otro jugador` : "Challenge!: el otro jugador no puso Pokémon en su Banca", "action"),
          createGameEvent("Se mezclaron ambos mazos", "info"),
        ],
      };
    },
  },

  "Digger": {
    canUse: (state) => (state.playerActivePokemon && state.opponentActivePokemon ? null : "No hay Pokémon activos"),
    coinFlips: () => "untilTails",
    // "you, the opponent, you..." until someone gets tails
    coinFlipper: (index) => (index % 2 === 0 ? "self" : "opponent"),
    getSteps: () => null,
    resolve: (state, cardId, _selections, { coinResults }) => {
      const coins = coinResults ?? [];
      const tailsAt = coins.indexOf("tails");
      const mineHit = tailsAt % 2 === 0;
      // Who flipped each coin: getTrainerCoinFlippers (coinFlipper above)
      const tokens = coins.map((c) => `[coin:${c}]`).join(", ");
      const played = discardPlayed(state, cardId, `Jugaste Digger - Monedas: ${tokens}`);
      if (mineHit) {
        const active = played.playerActivePokemon!;
        return {
          ...played,
          playerActivePokemon: { ...active, currentDamage: (active.currentDamage ?? 0) + 10 },
          events: [...played.events, createGameEvent(`Digger: ${active.pokemon.name} (Activo de quien lo jugó) recibió 10 de daño`, "action")],
        };
      }
      const active = played.opponentActivePokemon!;
      return {
        ...played,
        opponentActivePokemon: { ...active, currentDamage: (active.currentDamage ?? 0) + 10 },
        events: [...played.events, createGameEvent(`Digger: ${active.pokemon.name} (Activo del otro jugador) recibió 10 de daño`, "action")],
      };
    },
  },

  "Imposter Oak's Revenge": singleStep(
    (state, cardId) => ({
      title: "Imposter Oak's Revenge",
      description: "Descarta 1 carta de tu mano para jugar esta carta",
      options: otherHandCards(state, cardId).map(cardOption),
      maxSelections: 1,
      source: "hand",
    }),
    (state, cardId) => (otherHandCards(state, cardId).length < 1 ? "Necesitas otra carta en tu mano para descartar" : null),
    (state, cardId, [discardId]) => {
      const discarded = state.playerHand.find((c) => c.id === discardId)!;
      const played = discardPlayed(
        { ...state, playerHand: state.playerHand.filter((c) => c.id !== discardId), playerDiscard: [...state.playerDiscard, discarded] },
        cardId,
        "Jugaste Imposter Oak's Revenge"
      );
      const deck = shuffle([...played.opponentDeck, ...played.opponentHand]);
      const drawn = deck.slice(0, 4);
      return {
        ...played,
        opponentDeck: deck.slice(drawn.length),
        opponentHand: drawn,
        events: [
          ...played.events,
          createGameEvent(`Imposter Oak's Revenge: se descartó ${discarded.name}`, "info"),
          createGameEvent(`Imposter Oak's Revenge: el otro jugador barajó su mano en su mazo y robó ${drawn.length} cartas`, "action"),
        ],
      };
    }
  ),

  "Nightly Garbage Run": {
    canUse: () => null,
    getSteps: (state, _cardId, selections) => {
      if (selections.length > 0) return null;
      const cards = state.playerDiscard.filter(isGarbage);
      if (cards.length === 0) return null;
      return {
        title: "Nightly Garbage Run",
        description: "Elige hasta 3 cartas de Pokémon Básico, de Evolución o de Energía básica de tu pila de descartes para barajarlas en tu mazo",
        options: cards.map((c) => (isEnergyCard(c) ? energyOption(c) : cardOption(c))),
        maxSelections: Math.min(3, cards.length),
        minSelections: 1,
        cards,
      };
    },
    resolve: (state, cardId, selections) => {
      const chosen = state.playerDiscard.filter((c) => (selections[0] ?? []).includes(c.id));
      const played = discardPlayed(
        { ...state, playerDiscard: state.playerDiscard.filter((c) => !chosen.includes(c)) },
        cardId,
        "Jugaste Nightly Garbage Run"
      );
      const events = chosen.length > 0
        ? [...played.events, createGameEvent(`Nightly Garbage Run: ${chosen.map((c) => c.name).join(", ")} se barajaron en el mazo`, "info")]
        : played.events;
      return { ...played, playerDeck: shuffle([...played.playerDeck, ...chosen]), events };
    },
  },

  "Goop Gas Attack": immediate((state, cardId) => {
    const played = discardPlayed(state, cardId, "Jugaste Goop Gas Attack: todos los Poderes Pokémon dejan de funcionar hasta el final del siguiente turno");
    return {
      ...played,
      powersSuppressed: [...(state.powersSuppressed ?? []), { source: "Goop Gas Attack", expiresAfterTurn: state.turnNumber + 1 }],
    };
  }),

  "Sleep!": {
    canUse: (state) => (state.opponentActivePokemon ? null : "El rival no tiene Pokémon activo"),
    coinFlips: () => 1,
    getSteps: () => null,
    resolve: (state, cardId, _selections, { coinResults }) => {
      const heads = coinResults?.[0] === "heads";
      const played = discardPlayed(state, cardId, `Jugaste Sleep! - Moneda: [coin:${heads ? "heads" : "tails"}]`);
      if (!heads) return played;
      const defender = played.opponentActivePokemon!;
      if (hasStatusImmunity(defender, played)) {
        return { ...played, events: [...played.events, createGameEvent(`${defender.pokemon.name} no puede verse afectado por estados especiales`, "action")] };
      }
      const asleep = applyStatusCondition(defender, StatusCondition.Asleep, state.turnNumber);
      return {
        ...played,
        opponentActivePokemon: asleep,
        events: asleep === defender ? played.events : [...played.events, createGameEvent(`¡${defender.pokemon.name} está dormido!`, "action")],
      };
    },
  },
} satisfies Record<string, CardEffectDef>);

// ============================================================================
// Gym Heroes
// ============================================================================

/** "a Basic Pokémon or Evolution card with <owner> in its name" */
const ownersPokemonCard = (owner: PokemonOwner) => (c: GameCard) => isPokemonCard(c) && hasOwner(c, owner);

/** Energy cards attached to a Pokémon (a Buzzap Electrode attached as Energy is one). */
const attachedEnergyCards = (p: PokemonInPlay) => p.attachedEnergy.filter((e) => isEnergyCard(e) || !!e.buzzapEnergyType);

/** A card leaving play for the hand is the printed card again (a Buzzap Electrode is an Electrode). */
function backToHand(card: GameCard): GameCard {
  if (!card.buzzapEnergyType) return cardOutOfPlay(card);
  const { buzzapEnergyType: _type, buzzapSourceId: _source, ...electrode } = card;
  return electrode as GameCard;
}

const listNames = (cards: GameCard[]) => cards.map((c) => c.name).join(", ");
const cardsCount = (n: number) => `${n} carta${n === 1 ? "" : "s"}`;

/** "Show your hand to your opponent": the cards are listed in the log (the played card aside). */
function handShownEvent(state: GameState, cardId: string, trainerName: string) {
  const others = otherHandCards(state, cardId);
  return createGameEvent(`${trainerName}: quien lo jugó mostró su mano (${others.length > 0 ? listNames(others) : "ninguna otra carta"})`, "info");
}

/** A search of the deck for the cards matching `filter` ("show it, put it into your hand, shuffle"). */
function deckSearch(
  name: string,
  description: string,
  filter: (c: GameCard) => boolean,
  { showsHand = false }: { showsHand?: boolean } = {}
): Pick<CardEffectDef, "getSteps" | "resolve"> {
  return {
    getSteps: (state, _cardId, selections) => {
      if (selections.length > 0) return null;
      const found = state.playerDeck.filter(filter);
      if (found.length === 0) return null;
      return { title: name, description, options: found.map(cardOption), maxSelections: 1, cards: found };
    },
    resolve: (state, cardId, selections) => {
      const chosen = state.playerDeck.find((c) => c.id === selections[0]?.[0]);
      const played = discardPlayed(state, cardId, `Jugaste ${name}`);
      return {
        ...played,
        playerHand: chosen ? [...played.playerHand, chosen] : played.playerHand,
        playerDeck: shuffle(state.playerDeck.filter((c) => c.id !== chosen?.id)),
        events: [
          ...played.events,
          ...(showsHand ? [handShownEvent(state, cardId, name)] : []),
          createGameEvent(chosen ? `${name}: se mostró ${chosen.name} y se puso en la mano` : `${name}: no se encontró ninguna carta válida en el mazo`, "info"),
          createGameEvent("Se mezcló el mazo", "info"),
        ],
      };
    },
  };
}

Object.assign(TRAINER_EFFECTS, {
  "Brock": immediate(
    (state, cardId) => {
      const healed: string[] = [];
      const heal = (p: PokemonInPlay): PokemonInPlay => {
        if ((p.currentDamage ?? 0) <= 0) return p;
        healed.push(p.pokemon.name);
        return { ...p, currentDamage: Math.max(0, (p.currentDamage ?? 0) - 10) };
      };
      const played = discardPlayed(state, cardId, "Jugaste Brock");
      const active = played.playerActivePokemon && heal(played.playerActivePokemon);
      const bench = played.playerBench.map(heal);
      return {
        ...played,
        playerActivePokemon: active,
        playerBench: bench,
        events: [
          ...played.events,
          createGameEvent(
            healed.length > 0
              ? `Brock: se quitó 1 contador de daño de ${healed.join(", ")}`
              : "Brock: ninguno de los Pokémon de quien lo jugó tenía contadores de daño",
            "info"
          ),
        ],
      };
    }
    // Always playable (owner ruling 2026-10-18): with nothing damaged it is just discarded (a card for the discard pile)
  ),

  "Lt. Surge": singleStep(
    (state, cardId) => {
      const basics = otherHandCards(state, cardId).filter(isBasicPokemonCard);
      return {
        title: "Lt. Surge",
        description: "Elige una carta de Pokémon Básico de tu mano: pasa a ser tu Pokémon Activo y el actual va a tu Banca",
        options: basics.map(cardOption),
        maxSelections: 1,
        cards: basics,
      };
    },
    (state, cardId) => {
      if (!state.playerActivePokemon) return "No tienes Pokémon activo";
      if (!otherHandCards(state, cardId).some(isBasicPokemonCard)) return "Necesitas una carta de Pokémon Básico en tu mano";
      return isBenchFull(state, "player") ? "Tu Banca está llena" : null;
    },
    (state, cardId, [basicId]) => {
      const basic = state.playerHand.find((c) => c.id === basicId)!;
      const old = state.playerActivePokemon!;
      const played = discardPlayed({ ...state, playerHand: state.playerHand.filter((c) => c.id !== basicId) }, cardId, "Jugaste Lt. Surge");
      // Like a Switch: the old Active goes to the Bench without its Special Conditions
      const benched: PokemonInPlay = { ...clearStatusConditionsOnRetreat(old), modifiedWeakness: undefined, modifiedResistance: undefined };
      const next: GameState = {
        ...played,
        playerActivePokemon: benchFrom([basic], state.turnNumber)[0],
        playerBench: [...played.playerBench, benched],
        events: [...played.events, createGameEvent(`Lt. Surge: ${basic.name} pasa a ser el Pokémon Activo y ${old.pokemon.name} va a la Banca`, "action")],
      };
      // Played from the hand: its "when you play it from your hand" power triggers
      return triggerOnPlayPower(next, basic.id);
    }
  ),

  "Misty": singleStep(
    (state, cardId) => ({
      title: "Misty",
      description: "Descarta 2 cartas de tu mano para jugar esta carta",
      options: otherHandCards(state, cardId).map(cardOption),
      maxSelections: 2,
      source: "hand",
    }),
    (state, cardId) => (otherHandCards(state, cardId).length < 2 ? "Necesitas descartar 2 cartas de tu mano para jugar esta carta" : null),
    (state, cardId, chosen) => {
      const card = state.playerHand.find((c) => c.id === cardId)!;
      const discarded = state.playerHand.filter((c) => chosen.includes(c.id));
      const paid: GameState = {
        ...state,
        playerHand: state.playerHand.filter((c) => !chosen.includes(c.id)),
        playerDiscard: [...state.playerDiscard, ...discarded],
      };
      const played = discardPlayed(paid, cardId, "Jugaste Misty");
      return {
        ...played,
        // This turn's attack: +20 after Weakness and Resistance (attackBonusFromModifiers)
        activeModifiers: [
          ...played.activeModifiers,
          { id: `misty-${card.id}`, source: "misty", card, amount: 20, expiresAfterTurn: state.turnNumber, playerId: "player" },
        ],
        events: [
          ...played.events,
          createGameEvent(`Misty: se descartaron ${discarded.map((c) => c.name).join(" y ")}`, "info"),
          createGameEvent("Misty: el ataque de este turno de un Pokémon con Misty en su nombre hace 20 puntos de daño más al Pokémon Defensor", "info"),
        ],
      };
    }
  ),

  // Recall: for this turn's attack the Active may also use the attacks of the cards under it
  // (whatever Pokémon is Active when it attacks: the mark is on the turn, see getAvailableAttacks)
  "Recall": immediate((state, cardId) => {
    const played = discardPlayed(state, cardId, "Jugaste Recall");
    return {
      ...played,
      recallActiveOnTurn: state.turnNumber,
      events: [
        ...played.events,
        createGameEvent("Recall: el Pokémon Activo puede usar este turno los ataques de las cartas de Pokémon que tiene debajo (pagando su coste de Energía)", "info"),
      ],
    };
  }),

  "The Rocket's Trap": {
    canUse: () => null,
    coinFlips: () => 1,
    getSteps: () => null,
    resolve: (state, cardId, _selections, { coinResults }) => {
      const heads = coinResults?.[0] === "heads";
      const played = discardPlayed(state, cardId, `Jugaste The Rocket's Trap - Moneda: [coin:${heads ? "heads" : "tails"}]`);
      if (!heads || state.opponentHand.length === 0) return played;
      // "choose up to 3 cards at random (don't look at them)": as many as there are, up to 3
      const taken = new Set(shuffle(state.opponentHand).slice(0, 3).map((c) => c.id));
      const back = state.opponentHand.filter((c) => taken.has(c.id));
      return {
        ...played,
        opponentHand: state.opponentHand.filter((c) => !taken.has(c.id)),
        opponentDeck: shuffle([...state.opponentDeck, ...back]),
        events: [...played.events, createGameEvent(`The Rocket's Trap: ${cardsCount(back.length)} al azar de la mano del otro jugador se barajaron en su mazo`, "action")],
      };
    },
  },

  "Blaine's Last Resort": immediate(
    (state, cardId) => {
      const played = discardPlayed(state, cardId, "Jugaste Blaine's Last Resort");
      const shown = { ...played, events: [...played.events, handShownEvent(state, cardId, "Blaine's Last Resort")] };
      const { state: drew, drawn } = drawCards(shown, 5);
      return { ...drew, events: [...drew.events, createGameEvent(`Robaste ${cardsCount(drawn)}`, "info")] };
    },
    (state, cardId) =>
      otherHandCards(state, cardId).some((c) => c.name !== "Blaine's Last Resort")
        ? "No puedes tener en tu mano otras cartas que no sean Blaine's Last Resort"
        : null
  ),

  "Brock's Training Method": {
    canUse: (state) => (state.playerDeck.length === 0 ? "Tu mazo está vacío" : null),
    ...deckSearch(
      "Brock's Training Method",
      "Elige una carta de Pokémon Básico o de Evolución con Brock en su nombre de tu mazo",
      ownersPokemonCard("Brock")
    ),
  },

  "Erika's Maids": {
    canUse: (state, cardId) => (otherHandCards(state, cardId).length < 2 ? "Necesitas otras 2 cartas en tu mano para intercambiar" : null),
    getSteps: (state, cardId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Erika's Maids",
          description: "Elige 2 cartas de tu mano para intercambiar (se barajan en tu mazo)",
          options: otherHandCards(state, cardId).map(cardOption),
          maxSelections: 2,
          source: "hand",
        };
      }
      if (selections.length === 1) {
        const found = state.playerDeck.filter(ownersPokemonCard("Erika"));
        if (found.length === 0) return null;
        return {
          title: "Erika's Maids",
          description: "Elige hasta 2 cartas de Pokémon Básico o de Evolución con Erika en su nombre de tu mazo",
          options: found.map(cardOption),
          maxSelections: Math.min(2, found.length),
          minSelections: 0,
          cards: found,
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => {
      const traded = state.playerHand.filter((c) => selections[0].includes(c.id));
      const taken = state.playerDeck.filter((c) => (selections[1] ?? []).includes(c.id));
      const played = discardPlayed(
        { ...state, playerHand: state.playerHand.filter((c) => !selections[0].includes(c.id)) },
        cardId,
        "Jugaste Erika's Maids"
      );
      return {
        ...played,
        playerHand: [...played.playerHand, ...taken],
        playerDeck: shuffle([...state.playerDeck.filter((c) => !taken.includes(c)), ...traded]),
        events: [
          ...played.events,
          createGameEvent(
            taken.length > 0
              ? `Erika's Maids: 2 cartas de la mano por ${listNames(taken)} (se mostraron y se pusieron en la mano)`
              : "Erika's Maids: 2 cartas de la mano se barajaron en el mazo sin tomar ninguna",
            "info"
          ),
          createGameEvent("Se mezcló el mazo", "info"),
        ],
      };
    },
  },

  "Erika's Perfume": {
    canUse: () => null,
    getSteps: (state, _cardId, selections) => {
      if (selections.length > 0 || state.opponentHand.length === 0) return null;
      const hand = state.opponentHand;
      const basics = hand.filter(isBasicPokemonCard);
      const room = Math.max(0, maxBenchSize(state, "opponent") - state.opponentBench.length);
      return {
        title: "Erika's Perfume",
        description:
          basics.length === 0 ? "Mano de tu rival: no tiene cartas de Pokémon Básico"
          : room === 0 ? "Mano de tu rival: su Banca está llena"
          : "Mano de tu rival: elige las cartas de Pokémon Básico que pones en su Banca (las que quieras)",
        options: hand.map((c) => ({ ...cardOption(c), disabled: !isBasicPokemonCard(c) || room === 0 })),
        maxSelections: Math.min(room, basics.length),
        minSelections: 0,
        cards: hand,
        reveals: "opponentHand",
        disableAutoSelect: true,
      };
    },
    resolve: (state, cardId, selections) => {
      const chosen = state.opponentHand.filter((c) => (selections[0] ?? []).includes(c.id));
      const played = discardPlayed(state, cardId, "Jugaste Erika's Perfume");
      const looked = { ...played, events: [...played.events, createGameEvent("Erika's Perfume: se miró la mano del otro jugador", "info")] };
      if (chosen.length === 0) return looked;
      return {
        ...looked,
        opponentHand: state.opponentHand.filter((c) => !chosen.includes(c)),
        opponentBench: [...state.opponentBench, ...benchFrom(chosen, state.turnNumber)],
        events: [...looked.events, createGameEvent(`Erika's Perfume: ${listNames(chosen)} a la Banca del otro jugador`, "action")],
      };
    },
  },

  "Good Manners": {
    canUse: (state, cardId) => {
      if (otherHandCards(state, cardId).some(isBasicPokemonCard)) return "No puedes tener cartas de Pokémon Básico en tu mano para jugar esta carta";
      return state.playerDeck.length === 0 ? "Tu mazo está vacío" : null;
    },
    ...deckSearch("Good Manners", "Elige una carta de Pokémon Básico de tu mazo", isBasicPokemonCard, { showsHand: true }),
  },

  "Minion of Team Rocket": {
    canUse: () => null,
    coinFlips: () => 2,
    getSteps: (state, _cardId, selections, coinResults) => {
      if (selections.length > 0 || coinResults?.length !== 2 || coinResults.some((c) => c !== "heads")) return null;
      const bench = state.opponentBench;
      if (bench.length === 0) return null;
      return {
        title: "Minion of Team Rocket",
        description: "Elige un Pokémon en la Banca de tu rival: vuelve a su mano con todas las cartas unidas a él",
        options: bench.map((p) => pokemonOption(p, "Banca rival")),
        maxSelections: 1,
        thumbnails: bench.map((p) => p.pokemon),
        disableAutoSelect: true,
      };
    },
    resolve: (state, cardId, selections, { coinResults, skipEndTurn }) => {
      const coins = coinResults ?? [];
      const played = discardPlayed(state, cardId, `Jugaste Minion of Team Rocket - Monedas: ${coins.map((c) => `[coin:${c}]`).join(", ")}`);
      if (coins.some((c) => c === "tails")) {
        // "your turn ends immediately (you can't attack this turn)"
        const over: GameState = {
          ...played,
          attackedThisTurn: true,
          events: [...played.events, createGameEvent("Minion of Team Rocket: el turno de quien lo jugó termina", "action")],
        };
        return skipEndTurn ? over : endTurn(over);
      }
      const target = state.opponentBench.find((p) => p.pokemon.id === selections[0]?.[0]);
      if (!target) return played;
      // A Defender attached to it is one of its cards (kept as a modifier by the engine)
      const { attached, rest } = modifiersAttachedTo(played, target);
      return {
        ...played,
        activeModifiers: rest,
        opponentBench: state.opponentBench.filter((p) => p.pokemon.id !== target.pokemon.id),
        opponentHand: [...state.opponentHand, ...cardsLeavingPlay(target).map(backToHand), ...attached.map((m) => m.card)],
        events: [...played.events, createGameEvent(`Minion of Team Rocket: ${target.pokemon.name} y sus cartas vuelven a la mano del otro jugador`, "action")],
      };
    },
  },

  [TICKLING_MACHINE]: {
    canUse: () => null,
    coinFlips: () => 1,
    getSteps: () => null,
    resolve: (state, cardId, _selections, { coinResults, skipEndTurn }) => {
      const heads = coinResults?.[0] === "heads";
      const played = discardPlayed(state, cardId, `Jugaste Tickling Machine - Moneda: [coin:${heads ? "heads" : "tails"}]`);
      if (!heads) {
        // "your turn ends immediately (you can't attack this turn)": as Minion of Team Rocket's tails
        const over: GameState = {
          ...played,
          attackedThisTurn: true,
          events: [...played.events, createGameEvent("Tickling Machine: el turno de quien lo jugó termina", "action")],
        };
        return skipEndTurn ? over : endTurn(over);
      }
      // "Nobody may look at those cards": the log only counts them. Back at the end of the
      // opponent's next turn (endTurn)
      const aside = setAsideHand(played, "opponent", state.turnNumber + 1);
      const line =
        played.opponentHand.length === 0
          ? "Tickling Machine: el otro jugador no tiene cartas en la mano"
          : `Tickling Machine: el otro jugador aparta boca abajo ${cardsCount(played.opponentHand.length)} de la mano hasta el final de su próximo turno`;
      return { ...aside, events: [...aside.events, createGameEvent(line, "action")] };
    },
  },

  "Misty's Wrath": singleStep(
    (state) => {
      const top = state.playerDeck.slice(0, 7);
      return {
        title: "Misty's Wrath",
        description: `Las ${top.length} primeras cartas de tu mazo: elige ${Math.min(2, top.length)} para tu mano; el resto se descarta`,
        options: top.map(cardOption),
        maxSelections: Math.min(2, top.length),
        cards: top,
      };
    },
    (state) => (state.playerDeck.length === 0 ? "Tu mazo está vacío" : null),
    (state, cardId, chosen) => {
      const top = state.playerDeck.slice(0, 7);
      const kept = top.filter((c) => chosen.includes(c.id));
      const discarded = top.filter((c) => !chosen.includes(c.id));
      const played = discardPlayed(
        { ...state, playerDeck: state.playerDeck.slice(top.length), playerDiscard: [...state.playerDiscard, ...discarded] },
        cardId,
        "Jugaste Misty's Wrath"
      );
      return {
        ...played,
        playerHand: [...played.playerHand, ...kept],
        events: [
          ...played.events,
          createGameEvent(
            `Misty's Wrath: ${cardsCount(kept.length)} a la mano${discarded.length > 0 ? `; se descartaron ${listNames(discarded)}` : ""}`,
            "info"
          ),
        ],
      };
    }
  ),

  "Secret Mission": {
    canUse: () => null,
    getSteps: (state, cardId, selections) => {
      const looks = state.opponentHand.length > 0;
      if (looks && selections.length === 0) {
        const hand = state.opponentHand;
        return {
          title: "Secret Mission",
          description: "Mano de tu rival",
          options: hand.map((c) => ({ ...cardOption(c), disabled: true })),
          maxSelections: 0,
          minSelections: 0,
          cards: hand,
          reveals: "opponentHand",
          disableAutoSelect: true,
        };
      }
      const others = otherHandCards(state, cardId);
      if (selections.length === (looks ? 1 : 0) && others.length > 0) {
        return {
          title: "Secret Mission",
          description: "Descarta las cartas de tu mano que quieras: robas esa misma cantidad",
          options: others.map(cardOption),
          maxSelections: others.length,
          minSelections: 0,
          source: "hand",
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => {
      const chosen = selections[state.opponentHand.length > 0 ? 1 : 0] ?? [];
      const discarded = state.playerHand.filter((c) => chosen.includes(c.id));
      const played = discardPlayed(
        { ...state, playerHand: state.playerHand.filter((c) => !chosen.includes(c.id)), playerDiscard: [...state.playerDiscard, ...discarded] },
        cardId,
        "Jugaste Secret Mission"
      );
      const looked = state.opponentHand.length > 0 ? [createGameEvent("Secret Mission: se miró la mano del otro jugador", "info")] : [];
      if (discarded.length === 0) return { ...played, events: [...played.events, ...looked] };
      const { state: drew, drawn } = drawCards(
        { ...played, events: [...played.events, ...looked, createGameEvent(`Secret Mission: se descartaron ${listNames(discarded)}`, "info")] },
        discarded.length
      );
      return { ...drew, events: [...drew.events, createGameEvent(`Robaste ${cardsCount(drawn)}`, "info")] };
    },
  },

  "Blaine's Gamble": {
    canUse: () => null,
    // "Discard any number of other cards from your hand, then flip a coin": the coin comes
    // after the choice (none to choose with an empty hand: flipped right away)
    coinFlips: (state, cardId, selections) => (selections.length > 0 || otherHandCards(state, cardId).length === 0 ? 1 : 0),
    getSteps: (state, cardId, selections) => {
      const others = otherHandCards(state, cardId);
      if (selections.length > 0 || others.length === 0) return null;
      return {
        title: "Blaine's Gamble",
        description: "Descarta las cartas de tu mano que quieras; después se lanza una moneda: si sale cara, robas el doble de cartas",
        options: others.map(cardOption),
        maxSelections: others.length,
        minSelections: 0,
        source: "hand",
      };
    },
    resolve: (state, cardId, selections, { coinResults }) => {
      const heads = coinResults?.[0] === "heads";
      const chosen = selections[0] ?? [];
      const discarded = state.playerHand.filter((c) => chosen.includes(c.id));
      const played = discardPlayed(
        { ...state, playerHand: state.playerHand.filter((c) => !chosen.includes(c.id)), playerDiscard: [...state.playerDiscard, ...discarded] },
        cardId,
        "Jugaste Blaine's Gamble"
      );
      const events = [
        ...played.events,
        ...(discarded.length > 0 ? [createGameEvent(`Blaine's Gamble: se descartaron ${listNames(discarded)}`, "info")] : []),
        createGameEvent(`Blaine's Gamble - Moneda: [coin:${heads ? "heads" : "tails"}]`, "info"),
      ];
      if (!heads || discarded.length === 0) return { ...played, events };
      const { state: drew, drawn } = drawCards({ ...played, events }, discarded.length * 2);
      return { ...drew, events: [...drew.events, createGameEvent(`Robaste ${cardsCount(drawn)}`, "info")] };
    },
  },

  "Energy Flow": {
    canUse: (state) =>
      ownPokemonChoices(state, (p) => attachedEnergyCards(p).length > 0).options.length > 0 ? null : "Tus Pokémon no tienen cartas de Energía unidas",
    getSteps: (state, _cardId, selections) => {
      if (selections.length > 0) return null;
      const holders = [
        ...(state.playerActivePokemon ? [{ pokemon: state.playerActivePokemon, location: "Activo" }] : []),
        ...state.playerBench.map((pokemon) => ({ pokemon, location: "Banca" })),
      ];
      const choices = holders.flatMap(({ pokemon, location }) =>
        attachedEnergyCards(pokemon).map((energy) => ({ energy, holder: `${pokemon.pokemon.name} (${location})` }))
      );
      return {
        title: "Energy Flow",
        description: "Elige las cartas de Energía unidas a tus Pokémon que vuelven a tu mano (las que quieras)",
        options: choices.map(({ energy, holder }) => ({ ...energyOption(energy), sublabel: holder })),
        maxSelections: choices.length,
        minSelections: 0,
        thumbnails: choices.map(({ energy }) => energy),
        disableAutoSelect: true,
      };
    },
    resolve: (state, cardId, selections) => {
      const chosen = new Set(selections[0] ?? []);
      const returned: GameCard[] = [];
      const strip = (p: PokemonInPlay): PokemonInPlay => {
        const leaving = p.attachedEnergy.filter((e) => chosen.has(e.id));
        if (leaving.length === 0) return p;
        returned.push(...leaving);
        return { ...p, attachedEnergy: p.attachedEnergy.filter((e) => !chosen.has(e.id)) };
      };
      const played = discardPlayed(state, cardId, "Jugaste Energy Flow");
      const active = played.playerActivePokemon && strip(played.playerActivePokemon);
      const bench = played.playerBench.map(strip);
      return {
        ...played,
        playerActivePokemon: active,
        playerBench: bench,
        playerHand: [...played.playerHand, ...returned.map(backToHand)],
        events: [
          ...played.events,
          createGameEvent(
            returned.length > 0 ? `Energy Flow: ${returned.map((e) => energyCardLabel(e)).join(", ")} volvieron a la mano` : "Energy Flow: no volvió ninguna carta de Energía",
            "info"
          ),
        ],
      };
    },
  },

  "Sabrina's Gaze": immediate((state, cardId) => {
    const played = discardPlayed(state, cardId, "Jugaste Sabrina's Gaze");
    const mine = played.playerHand.length;
    const theirs = played.opponentHand.length;
    const myDeck = shuffle([...played.playerDeck, ...played.playerHand]);
    const theirDeck = shuffle([...played.opponentDeck, ...played.opponentHand]);
    return {
      ...played,
      playerHand: myDeck.slice(0, mine),
      playerDeck: myDeck.slice(mine),
      opponentHand: theirDeck.slice(0, theirs),
      opponentDeck: theirDeck.slice(theirs),
      events: [
        ...played.events,
        createGameEvent(
          `Sabrina's Gaze: cada jugador barajó su mano en su mazo; quien lo jugó robó ${cardsCount(mine)} y el otro jugador ${cardsCount(theirs)}`,
          "action"
        ),
      ],
    };
  }),

  "Trash Exchange": immediate((state, cardId) => {
    const count = state.playerDiscard.length;
    const deck = shuffle([...state.playerDeck, ...state.playerDiscard]);
    const played = discardPlayed({ ...state, playerDeck: deck.slice(count), playerDiscard: deck.slice(0, count) }, cardId, "Jugaste Trash Exchange");
    return {
      ...played,
      events: [
        ...played.events,
        createGameEvent(
          `Trash Exchange: ${cardsCount(count)} de la pila de descartes se barajaron en el mazo y se descartaron las ${count} primeras del mazo`,
          "info"
        ),
      ],
    };
  }),
} satisfies Record<string, CardEffectDef>);

// ============================================================================
// Gym Heroes: Trainers the opponent answers (`chooser: "opponent"` steps; consumers show them to
// the other player with stepForAnswerer, the AI answers with answerOpponentTrainerStepForAI)
// ============================================================================

/** The opponent draws up to `count` cards (fewer when the deck runs short). */
function opponentDraws(state: GameState, count: number): { state: GameState; drawn: number } {
  let deck = state.opponentDeck;
  let hand = state.opponentHand;
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const result = drawCard(deck, hand);
    if (!result.success) break;
    deck = result.newDeck;
    hand = result.newHand;
    drawn++;
  }
  return { state: { ...state, opponentDeck: deck, opponentHand: hand }, drawn };
}

/** Erika: "draw up to 3" as buttons 0 / 1 / 2 / 3 (counts above the deck's size disabled; 0 always). */
function drawCountStep(deckSize: number, chooser: "self" | "opponent"): SelectionStep {
  const options = ["0", "1", "2", "3"].map((n) => ({ id: n, label: n, ...(Number(n) > deckSize && { disabled: true }) }));
  return chooser === "self"
    ? {
        title: "Erika",
        description: "¿Cuántas cartas quieres robar? (hasta 3; después, tu rival puede robar hasta 3)",
        options,
        maxSelections: 1,
        minSelections: 1,
        disableAutoSelect: true,
      }
    : {
        title: "Erika",
        description: "Tu rival elige cuántas cartas roba (hasta 3)",
        answererTitle: "Erika",
        answererDescription: "Tu rival jugó Erika: ¿cuántas cartas quieres robar? (hasta 3)",
        options,
        maxSelections: 1,
        minSelections: 1,
        disableAutoSelect: true,
        chooser: "opponent",
        // Answer clock: no draw (always enabled)
        defaultSelection: ["0"],
      };
}

/** A Prize position step ("Premio 1".."Premio n"; names only when the Prizes are face up). */
function prizePositionStep(state: GameState, side: "player" | "opponent"): SelectionStep {
  const prizes = side === "player" ? state.playerPrizes : state.opponentPrizes;
  const revealed = arePrizesRevealed(state, side);
  const options = prizes.map((c, i) => ({ id: String(i), label: revealed ? `Premio ${i + 1}: ${c.name}` : `Premio ${i + 1}` }));
  return side === "player"
    ? {
        title: "Lt. Surge's Treaty",
        description: "Elige 1 de tus Premios para ponerlo en tu mano",
        options,
        maxSelections: 1,
        disableAutoSelect: true,
      }
    : {
        title: "Lt. Surge's Treaty",
        description: "Tu rival elige 1 de sus Premios para ponerlo en su mano",
        answererDescription: "Tu rival jugó Lt. Surge's Treaty: elige 1 de tus Premios para ponerlo en tu mano",
        options,
        maxSelections: 1,
        disableAutoSelect: true,
        chooser: "opponent",
        // Answer clock: the first position (face down, any is as good)
        defaultSelection: options.slice(0, 1).map((o) => o.id),
      };
}

/** Pokémon cards of the hand Blaine's Quiz #1 can name (Basic or Evolution, with a known length). */
const quizCards = (state: GameState, cardId: string) => otherHandCards(state, cardId).filter((c) => isPokemonCard(c) && pokedexHeight(c) !== undefined);

/** A side that took its last Prize wins (outside a Knock Out: Lt. Surge's Treaty). */
function endGameIfPrizedOut(state: GameState): GameState {
  const playerOut = state.playerPrizes.length === 0;
  const opponentOut = state.opponentPrizes.length === 0;
  if (!playerOut && !opponentOut) return state;
  return {
    ...state,
    gameResult: playerOut ? "victory" : "defeat",
    gamePhase: GamePhase.GameOver,
    events: [...state.events, createGameEvent("¡Se tomó el último premio! Fin de la partida", "system")],
  };
}

Object.assign(TRAINER_EFFECTS, {
  // "You may draw up to 3 cards, then your opponent may draw up to 3 cards."
  "Erika": {
    canUse: () => null,
    getSteps: (state, _cardId, selections) => {
      if (selections.length === 0) return drawCountStep(state.playerDeck.length, "self");
      if (selections.length === 1) return drawCountStep(state.opponentDeck.length, "opponent");
      return null;
    },
    resolve: (state, cardId, selections) => {
      const played = discardPlayed(state, cardId, "Jugaste Erika");
      const { state: mine, drawn } = drawCards(played, Number(selections[0][0]));
      const counted = { ...mine, events: [...mine.events, createGameEvent(`Robaste ${cardsCount(drawn)}`, "info")] };
      const { state: theirs, drawn: theirDraw } = opponentDraws(counted, Number(selections[1][0]));
      return { ...theirs, events: [...theirs.events, createGameEvent(`Erika: el otro jugador robó ${cardsCount(theirDraw)}`, "info")] };
    },
  },

  // "Your opponent chooses 1 of the following: everyone chooses 1 of his or her own Prizes and put
  // it into his or her hand, or you draw a card." Prizes are picked blind, the player first.
  "Lt. Surge's Treaty": {
    canUse: () => null,
    getSteps: (state, _cardId, selections) => {
      if (selections.length === 0) {
        const mine = state.playerPrizes.length;
        const theirs = state.opponentPrizes.length;
        // Both would take their last Prize at once: sudden death isn't modelled
        const prizesBlocked = mine === 0 || theirs === 0 || (mine === 1 && theirs === 1);
        return {
          title: "Lt. Surge's Treaty",
          description: "Tu rival elige: cada jugador pone 1 de sus Premios en su mano, o tú robas 1 carta",
          answererDescription: "Tu rival jugó Lt. Surge's Treaty: elige si cada jugador pone 1 de sus Premios en su mano o si tu rival roba 1 carta",
          options: [
            { id: "prizes", label: "Cada jugador pone 1 de sus Premios en su mano", ...(prizesBlocked && { disabled: true, sublabel: "Ambos tomarían su último Premio" }) },
            { id: "draw", label: "Quien jugó Lt. Surge's Treaty roba 1 carta" },
          ],
          maxSelections: 1,
          disableAutoSelect: true,
          chooser: "opponent",
          // Answer clock: never "prizes" (it could hand the player its last Prize)
          defaultSelection: ["draw"],
        };
      }
      if (selections[0][0] !== "prizes") return null;
      if (selections.length === 1) return prizePositionStep(state, "player");
      if (selections.length === 2) return prizePositionStep(state, "opponent");
      return null;
    },
    resolve: (state, cardId, selections) => {
      const played = discardPlayed(state, cardId, "Jugaste Lt. Surge's Treaty");
      if (selections[0][0] === "draw") {
        const chosen = { ...played, events: [...played.events, createGameEvent("Lt. Surge's Treaty: el otro jugador eligió que quien lo jugó robe 1 carta", "info")] };
        const { state: drew, drawn } = drawCards(chosen, 1);
        return { ...drew, events: [...drew.events, createGameEvent(`Robaste ${cardsCount(drawn)}`, "info")] };
      }
      const mine = Number(selections[1][0]);
      const theirs = Number(selections[2][0]);
      const taken: GameState = {
        ...played,
        playerPrizes: state.playerPrizes.filter((_, i) => i !== mine),
        playerHand: [state.playerPrizes[mine], ...played.playerHand],
        opponentPrizes: state.opponentPrizes.filter((_, i) => i !== theirs),
        opponentHand: [state.opponentPrizes[theirs], ...state.opponentHand],
        events: [
          ...played.events,
          createGameEvent("Lt. Surge's Treaty: el otro jugador eligió que cada jugador ponga 1 de sus Premios en su mano", "info"),
          createGameEvent(`Lt. Surge's Treaty: quien lo jugó puso el Premio ${mine + 1} en su mano`, "action"),
          createGameEvent(`Lt. Surge's Treaty: el otro jugador puso el Premio ${theirs + 1} en su mano`, "action"),
        ],
      };
      return endGameIfPrizedOut(taken);
    },
  },

  // The player names a Pokémon card of the hand (put face down: the guesser only gets its name);
  // the opponent guesses its length among 4 (quizLengthOptions); right: they draw 2, wrong: the
  // player draws 2. The card goes back to the hand (it never leaves it here).
  "Blaine's Quiz #1": {
    canUse: (state, cardId) => (quizCards(state, cardId).length > 0 ? null : "Necesitas una carta de Pokémon Básico o de Evolución en tu mano"),
    getSteps: (state, cardId, selections) => {
      if (selections.length === 0) {
        return {
          title: "Blaine's Quiz #1",
          description: "Elige una carta de Pokémon Básico o de Evolución de tu mano: tu rival adivinará la altura de ese Pokémon",
          options: quizCards(state, cardId).map(cardOption),
          maxSelections: 1,
          source: "hand",
          disableAutoSelect: true,
        };
      }
      if (selections.length === 1) {
        const named = quizCards(state, cardId).find((c) => c.id === selections[0][0]);
        if (!named) return null; // not an offered card: the first answer is refused anyway
        const lengths = quizLengthOptions(pokedexSpecies(named.name)).map((length) => ({ id: String(heightInInches(length)), label: length }));
        return {
          title: "Blaine's Quiz #1",
          description: `Tu rival adivina la altura de ${named.name}`,
          answererDescription: `Tu rival jugó Blaine's Quiz #1 con ${named.name}: ¿cuánto mide? Si aciertas, robas 2 cartas; si fallas, tu rival roba 2`,
          options: lengths,
          maxSelections: 1,
          disableAutoSelect: true,
          chooser: "opponent",
          // Answer clock: the first length offered
          defaultSelection: lengths.slice(0, 1).map((o) => o.id),
        };
      }
      return null;
    },
    resolve: (state, cardId, selections) => {
      const named = state.playerHand.find((c) => c.id === selections[0][0])!;
      const length = pokedexHeight(named)!;
      const guessed = Number(selections[1][0]);
      const right = guessed === heightInInches(length);
      const guessLabel = quizLengthOptions(pokedexSpecies(named.name)).find((l) => heightInInches(l) === guessed) ?? selections[1][0];
      const played = discardPlayed(state, cardId, "Jugaste Blaine's Quiz #1");
      const told: GameState = {
        ...played,
        events: [
          ...played.events,
          createGameEvent(
            `Blaine's Quiz #1: ${named.name} mide ${length}; el otro jugador dijo ${guessLabel} y ${right ? "acertó" : "falló"} (la carta vuelve a la mano de quien lo jugó)`,
            "action"
          ),
        ],
      };
      if (right) {
        const { state: drew, drawn } = opponentDraws(told, 2);
        return { ...drew, events: [...drew.events, createGameEvent(`Blaine's Quiz #1: el otro jugador robó ${cardsCount(drawn)}`, "info")] };
      }
      const { state: drew, drawn } = drawCards(told, 2);
      return { ...drew, events: [...drew.events, createGameEvent(`Robaste ${cardsCount(drawn)}`, "info")] };
    },
  },
} satisfies Record<string, CardEffectDef>);

// ============================================================================
// Gym Heroes: attached Trainers (domain/trainers/attached.ts; the engine asks their questions
// in the middle of the attack and handles the end of the turn)
// ============================================================================

/** The played Trainer leaves the hand attached to the player's Pokémon `pokemonId` (not discarded). */
function attachPlayed(state: GameState, cardId: string, pokemonId: string): GameState {
  const card = state.playerHand.find((c) => c.id === cardId)!;
  const attach = (p: PokemonInPlay): PokemonInPlay => (p.pokemon.id === pokemonId ? attachTrainer(p, card, "endOfTurn") : p);
  const target = findInPlay(state, "player", pokemonId)!.pokemon;
  return {
    ...state,
    playerHand: state.playerHand.filter((c) => c.id !== cardId),
    playerActivePokemon: state.playerActivePokemon && attach(state.playerActivePokemon),
    playerBench: state.playerBench.map(attach),
    events: [
      ...state.events,
      createGameEvent(`Jugaste ${card.name}`, "action"),
      createGameEvent(`${card.name} se unió a ${target.pokemon.name}`, "info"),
    ],
  };
}

const isSabrinasPokemon = (p: PokemonInPlay) => hasOwner(p.pokemon, "Sabrina");

Object.assign(TRAINER_EFFECTS, {
  // Attached to the Active: may reduce its attack's damage; back to the hand at the end of the turn
  [CHARITY]: immediate(
    (state, cardId) => attachPlayed(state, cardId, state.playerActivePokemon!.pokemon.id),
    (state) => (state.playerActivePokemon ? null : "No tienes Pokémon activo")
  ),

  // Attached to a Pokémon with Sabrina in its name: one re-flip of its attack's coins; discarded at the end of the turn
  [SABRINAS_ESP]: singleStep(
    (state) => {
      const { options, thumbnails } = ownPokemonChoices(state, isSabrinasPokemon);
      return {
        title: SABRINAS_ESP,
        description: "Elige 1 de tus Pokémon con Sabrina en su nombre para unirle esta carta",
        options,
        thumbnails,
        maxSelections: 1,
      };
    },
    (state) => (ownPokemonChoices(state, isSabrinasPokemon).options.length > 0 ? null : "Necesitas un Pokémon con Sabrina en su nombre en juego"),
    (state, cardId, [pokemonId]) => attachPlayed(state, cardId, pokemonId)
  ),

  // A real Rock-Paper-Scissors: both sides pick with submitDuelPick (state.pendingDuel, domain/duel/rps.ts)
  [MISTYS_DUEL]: immediate((state, cardId) => startDuel(discardPlayed(state, cardId, `Jugaste ${MISTYS_DUEL}`))),
} satisfies Record<string, CardEffectDef>);

// Gym Heroes: Stadiums with an on-play effect (every other Stadium falls back to playStadium)
Object.assign(TRAINER_EFFECTS, STADIUM_EFFECTS);

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
