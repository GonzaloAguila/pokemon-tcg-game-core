/**
 * AI Executor - Executes AI Actions on Game State
 *
 * Toma las acciones decididas por la estrategia y las aplica al estado del juego.
 * Diseñado para ser llamado desde React con delays para efectos visuales.
 */

import type { GameState } from "@/domain/match";
import { canExecuteAttack } from "@/lib/gameState";
import { executeAttack, getAttackCoinFlipCount, endTurn, executeRetreat, createGameEvent, executeDeckSearch, clearStatusConditionsOnRetreat, resolveConfusionFlip, promoteActivePokemon } from "@/domain/match";
import { isPokemonCard } from "@/domain/cards";
import { PokemonStage, type CoinFlipResult } from "@/domain/constants";
import type { AIAction } from "./types";
import {
  playBasicToActive,
  playBasicToBench,
  attachEnergy,
  evolve,
  actAs,
} from "./actions";
import { canPlayTrainerCard, playTrainerCard } from "@/domain/effects";
import { IllegalActionError } from "@/shared/errors";

/** The AI's coin flips (the engine logs and resolves them). */
function flipCoins(count: number): CoinFlipResult[] {
  return Array.from({ length: count }, () => (Math.random() < 0.5 ? "heads" : "tails"));
}

/**
 * Swap the "player"/"opponent" sides of a state (zones, prize/promotion flags, turn,
 * PlusPower/Defender ownership and the game result), so engine functions that act for
 * "player" can run for the AI.
 */
function swapSides(state: GameState): GameState {
  return {
    ...state,
    playerActivePokemon: state.opponentActivePokemon,
    playerBench: state.opponentBench,
    playerHand: state.opponentHand,
    playerDeck: state.opponentDeck,
    playerDiscard: state.opponentDiscard,
    playerPrizes: state.opponentPrizes,
    opponentActivePokemon: state.playerActivePokemon,
    opponentBench: state.playerBench,
    opponentHand: state.playerHand,
    opponentDeck: state.playerDeck,
    opponentDiscard: state.playerDiscard,
    opponentPrizes: state.playerPrizes,
    isPlayerTurn: !state.isPlayerTurn,
    playerCanTakePrize: state.opponentCanTakePrize,
    opponentCanTakePrize: state.playerCanTakePrize,
    playerNeedsToPromote: state.opponentNeedsToPromote,
    opponentNeedsToPromote: state.playerNeedsToPromote,
    activeModifiers: state.activeModifiers.map(m => ({
      ...m,
      playerId: m.playerId === "player" ? "opponent" as const : "player" as const,
    })),
    gameResult: state.gameResult === "victory" ? "defeat" : state.gameResult === "defeat" ? "victory" : state.gameResult,
  };
}

/**
 * Ejecuta una sola acción de la IA y retorna el nuevo estado
 */
export function executeAIAction(state: GameState, action: AIAction): GameState {
  console.log("[AI Executor] Ejecutando acción:", action.type, action);
  switch (action.type) {
    case "playBasicToActive":
      return playBasicToActive(state, "opponent", action.cardId);

    case "playBasicToBench":
      return playBasicToBench(state, "opponent", action.cardId, action.benchIndex);

    case "attachEnergy":
      return attachEnergy(
        state,
        "opponent",
        action.energyCardId,
        action.targetPokemonId,
        action.isBench,
        action.benchIndex
      );

    case "evolve":
      return evolve(state, "opponent", action.evolutionCardId, action.targetIndex);

    case "attack":
      return executeOpponentAttack(state, action.attackIndex);

    case "playTrainer":
      return executeTrainer(state, action.cardId, action.trainerName, action.selections);

    case "retreat":
      return executeOpponentRetreat(state, action.energyIdsToDiscard, action.benchIndex);

    case "endTurn":
      return endTurn(state);

    default:
      return state;
  }
}

/**
 * Ejecuta un ataque del oponente
 * Nota: executeAttack está diseñado para el jugador, necesitamos una versión para el oponente.
 * IMPORTANTE: Usamos skipEndTurn=true para que endTurn se llame DESPUÉS del swap,
 * así los mensajes tienen la perspectiva correcta.
 */
function executeOpponentAttack(state: GameState, attackIndex: number): GameState {
  const attacker = state.opponentActivePokemon;
  const defender = state.playerActivePokemon;

  if (!attacker || !defender) return state;
  if (!isPokemonCard(attacker.pokemon) || !isPokemonCard(defender.pokemon)) return state;

  const attack = attacker.pokemon.attacks[attackIndex];
  if (!attack) return state;

  // Illegal attack (planned on a simulated state, or Leer/Paralysis/energy changed): the
  // engine would throw, so the AI just ends its turn.
  const illegalReason = canExecuteAttack(swapSides(state), attackIndex);
  if (illegalReason) {
    return endTurn({
      ...state,
      events: [...state.events, createGameEvent(`Rival no pudo atacar: ${illegalReason}`, "info")],
    });
  }

  // Sand-attack / Smokescreen is engine-owned: its coin is the first of getAttackCoinFlipCount.

  // Confusion: the engine resolves the flip for the side whose turn it is ("player"),
  // so run it from the AI's perspective and swap back.
  const isConfused = attacker.statusConditions?.includes("confused") ?? false;
  if (isConfused) {
    const heads = Math.random() < 0.5;
    const eventsBefore = state.events.length;
    const resolved = resolveConfusionFlip(swapSides(state), heads, true);
    let afterFlip = swapSides(resolved.state);

    if (resolved.canAttack) {
      state = afterFlip;
    } else {
      // Messages were written from the AI's side; rewrite the ones that name a side
      afterFlip = {
        ...afterFlip,
        events: [
          ...afterFlip.events.slice(0, eventsBefore),
          ...afterFlip.events.slice(eventsBefore).flatMap((event) => {
            if (event.message === "El rival tomó un premio") return [{ ...event, message: "Tomaste un premio" }];
            if (event.message === "¡Derrota! No tienes más Pokémon") {
              return [{ ...event, message: "¡Victoria! El rival no tiene más Pokémon" }];
            }
            if (event.message === "Debes elegir un Pokémon de tu banca para continuar") return [];
            return [event];
          }),
        ],
      };

      // The AI knocked itself out: it always promotes its first benched Pokémon
      if (!afterFlip.opponentActivePokemon && afterFlip.gamePhase !== "GAME_OVER") {
        const benchIndex = afterFlip.opponentBench.findIndex((p) => p != null);
        if (benchIndex !== -1) {
          afterFlip = promoteActivePokemon(afterFlip, benchIndex, false);
        }
      }

      // The attack was used (and failed): the AI's turn ends
      return afterFlip.gamePhase !== "GAME_OVER" ? endTurn(afterFlip) : afterFlip;
    }
  }

  // Swap perspective: intercambiar player/opponent temporalmente
  // También intercambiar playerId en los modifiers para que PlusPower funcione correctamente
  const swappedModifiers = state.activeModifiers.map(m => ({
    ...m,
    playerId: m.playerId === "player" ? "opponent" as const : "player" as const,
  }));

  const swappedState: GameState = {
    ...state,
    playerActivePokemon: state.opponentActivePokemon,
    playerBench: state.opponentBench,
    playerHand: state.opponentHand,
    playerDeck: state.opponentDeck,
    playerDiscard: state.opponentDiscard,
    playerPrizes: state.opponentPrizes,
    opponentActivePokemon: state.playerActivePokemon,
    opponentBench: state.playerBench,
    opponentHand: state.playerHand,
    opponentDeck: state.playerDeck,
    opponentDiscard: state.playerDiscard,
    opponentPrizes: state.playerPrizes,
    isPlayerTurn: true, // Fingir que es turno del "jugador" (que ahora es el oponente)
    playerCanTakePrize: state.opponentCanTakePrize,
    opponentCanTakePrize: state.playerCanTakePrize,
    playerNeedsToPromote: false, // Reset en el estado swapped
    opponentNeedsToPromote: false,
    activeModifiers: swappedModifiers,
  };

  // The AI flips the attack's coins; the engine resolves every coin effect.
  // skipEndTurn: endTurn runs after the swap back, so its messages have the right perspective.
  // skipDefenderPromotion: the human chooses which Pokémon to promote.
  const coinResults = flipCoins(getAttackCoinFlipCount(swappedState, attackIndex));
  const resultState = executeAttack(swappedState, attackIndex, {
    coinResults,
    skipEndTurn: true,
    skipDefenderPromotion: true,
  });

  // Swap de vuelta
  // En resultState, "opponent" = jugador real. Si opponentActivePokemon es null y hay bench,
  // el jugador necesita elegir qué promover.
  const playerBenchAfterSwap = resultState.opponentBench;
  const playerActiveAfterSwap = resultState.opponentActivePokemon;
  const playerNeedsToPromote = playerActiveAfterSwap === null &&
    playerBenchAfterSwap.some(p => p !== null) &&
    resultState.gamePhase !== "GAME_OVER";

  // Swap modifiers back to original perspective
  const finalModifiers = resultState.activeModifiers.map(m => ({
    ...m,
    playerId: m.playerId === "player" ? "opponent" as const : "player" as const,
  }));

  // Corregir mensajes que fueron generados con perspectiva swapped
  // Durante el swap: "player" = AI, "opponent" = human
  // Los mensajes están desde la perspectiva del "player" atacando al "opponent"
  // Necesitamos invertirlos para que reflejen la realidad: AI atacó al human
  const correctedEvents = resultState.events.map((event, idx, allEvents) => {
    let message = event.message;

    // Detectar si hubo self-KO del atacante (AI)
    // Buscamos el mensaje de self-KO que precede a los mensajes de premio
    const hasSelfKO = allEvents.some(e => e.message.includes("se noqueó a sí mismo"));

    // "El rival tomó un premio" durante self-KO → el humano toma el premio
    if (message === "El rival tomó un premio") {
      message = "Tomaste un premio";
    }
    // "¡Puedes tomar un premio!" cuando el defensor (human en swapped) es KO'd
    // Esto está mal porque en realidad el AI (atacante) debería tomar el premio
    else if (message === "¡Puedes tomar un premio!") {
      // Verificar si este mensaje es por el defensor KO'd o por self-KO del atacante
      // Si hay self-KO, puede haber múltiples "puedes tomar premio" - uno correcto y otro no
      // El mensaje correcto es el que viene después del self-KO
      const selfKOIndex = allEvents.findIndex(e => e.message.includes("se noqueó a sí mismo"));
      const thisIndex = idx;

      if (selfKOIndex >= 0 && thisIndex > selfKOIndex) {
        // Este mensaje es por el self-KO, es correcto (humano toma premio)
        message = "¡Puedes tomar un premio!";
      } else {
        // Este mensaje es por el KO del defensor, invertir
        message = "El rival puede tomar un premio";
      }
    }
    // Corregir mensajes de promoción cuando el atacante (AI) se auto-KO
    else if (message.includes("pasa a ser tu Pokémon activo")) {
      const pokemonName = message.replace(" pasa a ser tu Pokémon activo", "");
      message = `${pokemonName} pasa a ser el Pokémon activo del rival`;
    }
    // Corregir mensajes de derrota/victoria (están invertidos por el swap)
    else if (message === "¡Victoria! El rival no tiene más Pokémon") {
      message = "¡Derrota! No tienes más Pokémon";
    }
    else if (message === "¡Derrota! No tienes más Pokémon") {
      message = "¡Victoria! El rival no tiene más Pokémon";
    }

    return { ...event, message };
  });

  let finalState: GameState = {
    ...resultState,
    playerActivePokemon: resultState.opponentActivePokemon,
    playerBench: resultState.opponentBench,
    playerHand: resultState.opponentHand,
    playerDeck: resultState.opponentDeck,
    playerDiscard: resultState.opponentDiscard,
    playerPrizes: resultState.opponentPrizes,
    opponentActivePokemon: resultState.playerActivePokemon,
    opponentBench: resultState.playerBench,
    opponentHand: resultState.playerHand,
    opponentDeck: resultState.playerDeck,
    opponentDiscard: resultState.playerDiscard,
    opponentPrizes: resultState.playerPrizes,
    // El oponente (IA) estaba atacando, así que después del ataque sigue siendo su turno
    // hasta que se llame endTurn
    isPlayerTurn: false,
    playerCanTakePrize: resultState.opponentCanTakePrize,
    opponentCanTakePrize: resultState.playerCanTakePrize,
    playerNeedsToPromote,
    opponentNeedsToPromote: false,
    activeModifiers: finalModifiers,
    events: correctedEvents,
    // Swap game result (victory <-> defeat)
    gameResult: resultState.gameResult === "victory"
      ? "defeat"
      : resultState.gameResult === "defeat"
        ? "victory"
        : resultState.gameResult,
  };

  // Si el Pokemon activo del oponente (IA) fue noqueado (ej: por Strikes Back),
  // la IA necesita promover automaticamente desde su banca
  if (finalState.opponentActivePokemon === null && finalState.gamePhase !== "GAME_OVER") {
    const opponentBenchWithPokemon = finalState.opponentBench.filter(p => p !== null);
    if (opponentBenchWithPokemon.length > 0) {
      // IA promueve automaticamente el primer Pokemon de su banca
      const promotedPokemon = opponentBenchWithPokemon[0];
      const newOpponentBench = finalState.opponentBench.filter(p => p !== promotedPokemon);

      finalState = {
        ...finalState,
        opponentActivePokemon: promotedPokemon,
        opponentBench: newOpponentBench,
        events: [
          ...finalState.events,
          createGameEvent(
            `${promotedPokemon.pokemon.name} pasa a ser el Pokemon activo del rival`,
            "info"
          ),
        ],
      };
    } else {
      // IA no tiene más Pokemon - Victoria para el jugador
      finalState = {
        ...finalState,
        gamePhase: "GAME_OVER",
        gameResult: "victory",
        events: [
          ...finalState.events,
          createGameEvent("¡Victoria! El rival no tiene más Pokemon", "system"),
        ],
      };
    }
  }

  // Verificar si el juego terminó por KO sin más Pokemon
  if (finalState.playerActivePokemon === null && !playerNeedsToPromote) {
    const hasMorePokemon = finalState.playerBench.some(p => p !== null);
    if (!hasMorePokemon) {
      finalState = {
        ...finalState,
        gamePhase: "GAME_OVER",
        gameResult: "defeat",
        events: [
          ...finalState.events,
          createGameEvent("¡Derrota! No tienes más Pokémon", "system"),
        ],
      };
    }
  }

  // Handle pending ForceSwitch: AI auto-picks a bench Pokemon to bring forward
  // In swapped state, pendingForceSwitch meant "attacker (AI) picks from defender (human) bench"
  // After swap-back: human is player, so we need to switch player's active with player's bench
  if (resultState.pendingForceSwitch && finalState.playerActivePokemon) {
    const humanBench = finalState.playerBench.filter(p => p != null);
    if (humanBench.length > 0) {
      // AI picks a random bench Pokemon (or first one)
      const pickIndex = finalState.playerBench.findIndex(p => p != null);
      const picked = finalState.playerBench[pickIndex]!;
      // Moving to the bench clears ALL special conditions (incl. Poison) and active-only effects
      const goingToBench = {
        ...clearStatusConditionsOnRetreat(finalState.playerActivePokemon),
        modifiedWeakness: undefined,
        modifiedResistance: undefined,
      };
      const newBench = [...finalState.playerBench];
      newBench.splice(pickIndex, 1);
      newBench.push(goingToBench);

      finalState = {
        ...finalState,
        playerActivePokemon: picked,
        playerBench: newBench,
        pendingForceSwitch: undefined,
        events: [
          ...finalState.events,
          createGameEvent(`${finalState.playerActivePokemon.pokemon.name} fue enviado a tu banca`, "action"),
          createGameEvent(`${picked.pokemon.name} es ahora tu Pokémon activo`, "info"),
        ],
      };
    } else {
      finalState = { ...finalState, pendingForceSwitch: undefined };
    }
  }

  // Handle pending SelfSwitch: AI auto-picks own bench Pokemon to swap with
  // In swapped state, pendingSelfSwitch meant "attacker (AI) switches with own bench"
  // After swap-back: AI is opponent
  if (resultState.pendingSelfSwitch && finalState.opponentActivePokemon) {
    const aiBench = finalState.opponentBench.filter(p => p != null);
    if (aiBench.length > 0) {
      const pickIndex = finalState.opponentBench.findIndex(p => p != null);
      const picked = finalState.opponentBench[pickIndex]!;
      // Moving to the bench clears ALL special conditions (incl. Poison) and active-only effects
      const goingToBench = {
        ...clearStatusConditionsOnRetreat(finalState.opponentActivePokemon),
        modifiedWeakness: undefined,
        modifiedResistance: undefined,
      };
      const newBench = [...finalState.opponentBench];
      newBench.splice(pickIndex, 1);
      newBench.push(goingToBench);

      finalState = {
        ...finalState,
        opponentActivePokemon: picked,
        opponentBench: newBench,
        pendingSelfSwitch: undefined,
        events: [
          ...finalState.events,
          createGameEvent(`${finalState.opponentActivePokemon.pokemon.name} del rival se cambió con ${picked.pokemon.name}`, "action"),
        ],
      };
    } else {
      finalState = { ...finalState, pendingSelfSwitch: undefined };
    }
  }

  // Handle pending DeckSearch: AI auto-picks a valid card from deck
  // In swapped state, pendingDeckSearch was set by attacker (AI)
  // After swap-back: AI is opponent, so deck search applies to opponent's deck
  if (resultState.pendingDeckSearch && finalState.opponentDeck.length > 0) {
    const filter = resultState.pendingDeckSearch.filter;
    // Find first valid card matching the filter
    const validCard = finalState.opponentDeck.find(card => {
      if (!isPokemonCard(card) || card.stage !== PokemonStage.Basic) return false;
      if (filter.names && !filter.names.includes(card.name)) return false;
      if (filter.type && !card.types.includes(filter.type)) return false;
      return true;
    });

    // Swap to opponent perspective to execute deck search
    const swappedForSearch: GameState = {
      ...finalState,
      playerDeck: finalState.opponentDeck,
      playerBench: finalState.opponentBench,
      opponentDeck: finalState.playerDeck,
      opponentBench: finalState.playerBench,
      pendingDeckSearch: resultState.pendingDeckSearch,
    };

    const searchResult = executeDeckSearch(swappedForSearch, validCard?.id ?? null);

    // Swap back
    finalState = {
      ...searchResult,
      playerDeck: searchResult.opponentDeck,
      playerBench: searchResult.opponentBench,
      opponentDeck: searchResult.playerDeck,
      opponentBench: searchResult.playerBench,
      pendingDeckSearch: undefined,
    };
  }

  // Clear any remaining pending flags
  finalState = { ...finalState, pendingForceSwitch: undefined, pendingSelfSwitch: undefined, pendingDeckSearch: undefined };

  // Si el juego no terminó, no hay premio pendiente para el oponente, y no hay promoción pendiente,
  // terminamos el turno. Esto genera los eventos con la perspectiva CORRECTA.
  if (finalState.gamePhase !== "GAME_OVER" &&
      !finalState.opponentCanTakePrize &&
      !finalState.playerNeedsToPromote) {
    finalState = endTurn(finalState);
  }

  return finalState;
}

/**
 * Ejecuta un trainer del oponente a través del registro de efectos del engine
 * (las selecciones significan lo mismo que para el jugador; sin monedas: la IA no juega Poké Ball).
 */
function executeTrainer(
  state: GameState,
  cardId: string,
  _trainerName: string,
  selections: string[][]
): GameState {
  return actAs(
    state,
    "opponent",
    (s) => canPlayTrainerCard(s, cardId),
    (s) => {
      try {
        return playTrainerCard(s, cardId, selections);
      } catch (error) {
        if (error instanceof IllegalActionError) return s;
        throw error;
      }
    }
  );
}

/**
 * Ejecuta un retreat del oponente
 */
function executeOpponentRetreat(
  state: GameState,
  energyIdsToDiscard: string[],
  benchIndex: number
): GameState {
  // Similar al ataque, necesitamos swap perspective
  const swappedState: GameState = {
    ...state,
    playerActivePokemon: state.opponentActivePokemon,
    playerBench: state.opponentBench,
    playerDiscard: state.opponentDiscard,
    opponentActivePokemon: state.playerActivePokemon,
    opponentBench: state.playerBench,
    opponentDiscard: state.playerDiscard,
  };

  const resultState = executeRetreat(swappedState, energyIdsToDiscard, benchIndex);

  // Swap de vuelta
  return {
    ...resultState,
    playerActivePokemon: resultState.opponentActivePokemon,
    playerBench: resultState.opponentBench,
    playerDiscard: resultState.opponentDiscard,
    opponentActivePokemon: resultState.playerActivePokemon,
    opponentBench: resultState.playerBench,
    opponentDiscard: resultState.playerDiscard,
    retreatedThisTurn: resultState.retreatedThisTurn,
  };
}
