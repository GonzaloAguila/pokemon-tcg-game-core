/**
 * AI Executor - Executes AI Actions on Game State
 *
 * Toma las acciones decididas por la estrategia y las aplica al estado del juego.
 * Diseñado para ser llamado desde React con delays para efectos visuales.
 */

import type { GameState } from "@/domain/match";
import { executeAttack, endTurn, executeRetreat, createGameEvent } from "@/domain/match";
import { isPokemonCard } from "@/domain/cards";
import type { AIAction } from "./types";
import {
  playBasicToActive,
  playBasicToBench,
  attachEnergy,
  evolve,
} from "./actions";

/**
 * Simula un lanzamiento de moneda y retorna los resultados
 */
function simulateCoinFlips(count: number): ("heads" | "tails")[] {
  const results: ("heads" | "tails")[] = [];
  for (let i = 0; i < count; i++) {
    results.push(Math.random() < 0.5 ? "heads" : "tails");
  }
  return results;
}

/**
 * Genera el mensaje de log para los resultados de coin flip
 * Usa tokens especiales [coin:heads] y [coin:tails] que EventLogger renderiza como imágenes
 */
function getCoinFlipLogMessage(results: ("heads" | "tails")[]): string {
  const coinTokens = results.map(r => `[coin:${r}]`).join(" ");
  if (results.length === 1) {
    return `Moneda: ${coinTokens}`;
  }
  return `Monedas: ${coinTokens}`;
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

  // Check if attacker is confused - must flip coin before attacking
  const isConfused = attacker.statusConditions?.includes("confused") ?? false;
  if (isConfused) {
    const confusionFlip = Math.random() < 0.5 ? "heads" : "tails";
    const coinToken = `[coin:${confusionFlip}]`;

    if (confusionFlip === "tails") {
      // Tails: attack fails, deal 30 damage to self
      const CONFUSION_SELF_DAMAGE = 30;
      const newSelfDamage = (attacker.currentDamage || 0) + CONFUSION_SELF_DAMAGE;
      const attackerHP = attacker.pokemon.hp;
      const isKO = newSelfDamage >= attackerHP;

      const events = [
        ...state.events,
        createGameEvent(`${attacker.pokemon.name} está confundido - Moneda: ${coinToken}`, "info"),
        createGameEvent(`¡Cruz! ${attacker.pokemon.name} se lastima a sí mismo`, "info"),
        createGameEvent(`${attacker.pokemon.name} se hizo ${CONFUSION_SELF_DAMAGE} de daño a sí mismo`, "action"),
      ];

      if (isKO) {
        events.push(createGameEvent(`¡${attacker.pokemon.name} se noqueó a sí mismo!`, "action"));

        // Move to discard
        const newDiscard = [
          ...state.opponentDiscard,
          attacker.pokemon,
          ...attacker.attachedEnergy,
          ...(attacker.attachedTrainers || []),
          ...(attacker.previousEvolutions || []),
        ];

        // Player takes prize
        let newPlayerPrizes = [...state.playerPrizes];
        let newPlayerHand = [...state.playerHand];
        if (newPlayerPrizes.length > 0) {
          const prize = newPlayerPrizes.shift()!;
          newPlayerHand = [prize, ...newPlayerHand];
          events.push(createGameEvent(`Tomaste un premio`, "action"));
        }

        // Check for player win
        if (newPlayerPrizes.length === 0) {
          events.push(createGameEvent(`¡Ganaste la partida!`, "system"));
          return {
            ...state,
            opponentActivePokemon: null,
            opponentDiscard: newDiscard,
            playerPrizes: newPlayerPrizes,
            playerHand: newPlayerHand,
            gamePhase: "GAME_OVER",
            events,
          };
        }

        // Auto-promote from opponent bench
        const benchPokemonIndex = state.opponentBench.findIndex(p => p != null);
        if (benchPokemonIndex === -1) {
          // No bench Pokemon - player wins
          events.push(createGameEvent(`¡Ganaste la partida!`, "system"));
          return {
            ...state,
            opponentActivePokemon: null,
            opponentDiscard: newDiscard,
            playerPrizes: newPlayerPrizes,
            playerHand: newPlayerHand,
            gamePhase: "GAME_OVER",
            events,
          };
        }

        const promoted = state.opponentBench[benchPokemonIndex]!;
        const newBench = [...state.opponentBench];
        newBench.splice(benchPokemonIndex, 1);
        events.push(createGameEvent(`${promoted.pokemon.name} pasa a ser el Pokémon activo del rival`, "info"));

        return {
          ...state,
          opponentActivePokemon: promoted,
          opponentBench: newBench,
          opponentDiscard: newDiscard,
          playerPrizes: newPlayerPrizes,
          playerHand: newPlayerHand,
          events,
        };
      } else {
        // Not KO'd, just apply damage
        return {
          ...state,
          opponentActivePokemon: {
            ...attacker,
            currentDamage: newSelfDamage,
          },
          events,
        };
      }
    } else {
      // Heads: attack proceeds, add event and continue
      state = {
        ...state,
        events: [
          ...state.events,
          createGameEvent(`${attacker.pokemon.name} está confundido - Moneda: ${coinToken}`, "info"),
          createGameEvent(`¡Cara! El ataque procede normalmente`, "info"),
        ],
      };
    }
  }

  // Verificar si el ataque tiene efectos con coin flip
  const coinFlipEffect = attack.effects?.find(e => e.coinFlip);
  let coinFlipResults: ("heads" | "tails")[] = [];
  let coinFlipLogMessage = "";

  if (coinFlipEffect?.coinFlip) {
    // Simular coin flips
    coinFlipResults = simulateCoinFlips(coinFlipEffect.coinFlip.count);
    coinFlipLogMessage = getCoinFlipLogMessage(coinFlipResults);
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
    activeModifiers: swappedModifiers,
  };

  // Ejecutar el ataque con skipEndTurn=true y skipDefenderPromotion=true
  // skipEndTurn=true: para que endTurn se llame después del swap con perspectiva correcta
  // skipDefenderPromotion=true: para que el jugador real elija qué promover
  let resultState = executeAttack(swappedState, attackIndex, true, true);

  // Si hay coin flip, agregar el log del resultado DESPUÉS del mensaje del ataque
  if (coinFlipLogMessage) {
    resultState = {
      ...resultState,
      events: [
        ...resultState.events,
        createGameEvent(coinFlipLogMessage, "info"),
      ],
    };

    // Procesar efectos de coin flip manualmente
    const headsCount = coinFlipResults.filter(r => r === "heads").length;
    const tailsCount = coinFlipResults.filter(r => r === "tails").length;

    // coinFlipDamage: daño basado en el resultado de la moneda
    if (coinFlipEffect?.type === "coinFlipDamage" && coinFlipEffect.amount) {
      let coinDamage = 0;
      if (coinFlipEffect.coinFlip?.onHeads === "damage") coinDamage += coinFlipEffect.amount * headsCount;
      if (coinFlipEffect.coinFlip?.onTails === "damage") coinDamage += coinFlipEffect.amount * tailsCount;

      if (coinDamage > 0 && resultState.opponentActivePokemon) {
        // En estado swapped, "opponent" es el jugador real (defensor)
        const defenderInSwapped = resultState.opponentActivePokemon;
        const defenderCard = defenderInSwapped.pokemon;

        if (isPokemonCard(defenderCard)) {
          // Calcular debilidad/resistencia
          const attackerType = attacker.pokemon.types[0];
          const hasWeakness = defenderCard.weaknesses?.includes(attackerType) ?? false;
          const hasResistance = defenderCard.resistances?.includes(attackerType) ?? false;

          let finalDamage = coinDamage;
          if (hasWeakness) finalDamage *= 2;
          if (hasResistance) finalDamage = Math.max(0, finalDamage - 30);

          const newDamage = (defenderInSwapped.currentDamage || 0) + finalDamage;

          // Mensaje de daño
          let damageMsg = `${attacker.pokemon.name} hizo ${finalDamage} de daño`;
          if (hasWeakness) damageMsg += " (x2 debilidad)";
          else if (hasResistance) damageMsg += " (-30 resistencia)";

          // Verificar KO
          if (newDamage >= defenderCard.hp) {
            resultState = {
              ...resultState,
              opponentActivePokemon: null,
              opponentDiscard: [
                ...resultState.opponentDiscard,
                defenderCard,
                ...defenderInSwapped.attachedEnergy,
                ...(defenderInSwapped.attachedTrainers || []),
                ...(defenderInSwapped.previousEvolutions || []),
              ],
              playerCanTakePrize: resultState.playerPrizes.length > 0,
              events: [
                ...resultState.events,
                createGameEvent(damageMsg, "action"),
                createGameEvent(`¡${defenderCard.name} fue noqueado!`, "action"),
                ...(resultState.playerPrizes.length > 0 ? [createGameEvent("¡Puedes tomar un premio!", "action")] : []),
              ],
            };
          } else {
            resultState = {
              ...resultState,
              opponentActivePokemon: {
                ...defenderInSwapped,
                currentDamage: newDamage,
              },
              events: [
                ...resultState.events,
                createGameEvent(damageMsg, "action"),
              ],
            };
          }
        }
      } else if (coinDamage === 0) {
        resultState = {
          ...resultState,
          events: [
            ...resultState.events,
            createGameEvent(`${attacker.pokemon.name} falló el ataque`, "info"),
          ],
        };
      }
    }

    // applyStatus: aplicar estado basado en coin flip (ej: Electabuzz Impactrueno - parálisis en cara)
    if (coinFlipEffect?.type === "applyStatus" && coinFlipEffect.coinFlip) {
      const headsCount = coinFlipResults.filter(r => r === "heads").length;
      const tailsCount = coinFlipResults.filter(r => r === "tails").length;

      // Determinar qué estado aplicar basado en el resultado
      let statusToApply: string | null = null;
      if (headsCount > 0 && coinFlipEffect.coinFlip.onHeads && coinFlipEffect.coinFlip.onHeads !== "damage" && coinFlipEffect.coinFlip.onHeads !== "protection") {
        statusToApply = coinFlipEffect.coinFlip.onHeads;
      } else if (tailsCount > 0 && headsCount === 0 && coinFlipEffect.coinFlip.onTails && coinFlipEffect.coinFlip.onTails !== "damage" && coinFlipEffect.coinFlip.onTails !== "protection") {
        statusToApply = coinFlipEffect.coinFlip.onTails;
      }

      // Aplicar estado al defensor (en swapped state, "opponent" es el jugador real)
      if (statusToApply && resultState.opponentActivePokemon) {
        const defender = resultState.opponentActivePokemon;
        const currentStatuses = defender.statusConditions || [];

        // No aplicar si ya tiene el estado
        if (!currentStatuses.includes(statusToApply as "paralyzed" | "poisoned" | "confused" | "asleep")) {
          const statusMessages: Record<string, string> = {
            paralyzed: "paralizado",
            asleep: "dormido",
            confused: "confundido",
            poisoned: "envenenado",
          };

          resultState = {
            ...resultState,
            opponentActivePokemon: {
              ...defender,
              statusConditions: [...currentStatuses, statusToApply as "paralyzed" | "poisoned" | "confused" | "asleep"],
              ...(statusToApply === "paralyzed" ? { paralyzedOnTurn: state.turnNumber } : {}),
            },
            events: [
              ...resultState.events,
              createGameEvent(
                `¡${defender.pokemon.name} está ${statusMessages[statusToApply] || statusToApply}!`,
                "action"
              ),
            ],
          };
        }
      }
    }
  }

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
 * Ejecuta un trainer del oponente
 * Implementación simplificada para game-core (sin dependencia de trainer-registry)
 */
function executeTrainer(
  state: GameState,
  cardId: string,
  trainerName: string,
  selections: string[][]
): GameState {
  // Implementación inline de trainers básicos que la IA puede usar
  switch (trainerName) {
    case "Bill": {
      // Bill: robar 2 cartas del deck del oponente a su mano
      const deck = [...state.opponentDeck];
      const hand = [...state.opponentHand];
      const discard = [...state.opponentDiscard];

      // Mover Bill al descarte
      const billCard = hand.find(c => c.id === cardId);
      const newHand = hand.filter(c => c.id !== cardId);
      if (billCard) {
        discard.push(billCard);
      }

      // Robar 2 cartas
      const drawnCards = deck.splice(0, 2);
      newHand.push(...drawnCards);

      return {
        ...state,
        opponentDeck: deck,
        opponentHand: newHand,
        opponentDiscard: discard,
        events: [
          ...state.events,
          { id: `evt-${Date.now()}`, timestamp: Date.now(), message: "Rival usó Bill y robó 2 cartas", type: "action" },
        ],
      };
    }

    case "Potion": {
      // Potion: curar 20 de daño
      const targetId = selections[0]?.[0];
      if (!targetId) return state;

      let newState = { ...state };

      if (state.opponentActivePokemon?.pokemon.id === targetId) {
        const currentDamage = state.opponentActivePokemon.currentDamage || 0;
        const healed = Math.min(20, currentDamage);
        newState.opponentActivePokemon = {
          ...state.opponentActivePokemon,
          currentDamage: currentDamage - healed,
        };
        newState.events = [
          ...state.events,
          { id: `evt-${Date.now()}`, timestamp: Date.now(), message: `Rival usó Potion y curó ${healed} de daño`, type: "action" },
        ];
      }

      // Mover Potion al descarte
      const potionCard = state.opponentHand.find(c => c.id === cardId);
      if (potionCard) {
        newState.opponentHand = state.opponentHand.filter(c => c.id !== cardId);
        newState.opponentDiscard = [...state.opponentDiscard, potionCard];
      }

      return newState;
    }

    case "PlusPower": {
      // PlusPower: +10 daño al próximo ataque
      const plusPowerCard = state.opponentHand.find(c => c.id === cardId);
      if (!plusPowerCard) return state;

      return {
        ...state,
        opponentHand: state.opponentHand.filter(c => c.id !== cardId),
        activeModifiers: [
          ...state.activeModifiers,
          {
            id: `mod-${Date.now()}`,
            source: "plusPower",
            card: plusPowerCard,
            amount: 10,
            expiresAfterTurn: state.turnNumber,
            playerId: "opponent",
          },
        ],
        events: [
          ...state.events,
          { id: `evt-${Date.now()}`, timestamp: Date.now(), message: "Rival usó PlusPower (+10 daño)", type: "action" },
        ],
      };
    }

    default:
      return state;
  }
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
