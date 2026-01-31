/**
 * AI Strategy - Greedy Decision Logic
 *
 * Implementa una IA básica con estrategia greedy:
 * 1. Poner Pokemon básicos en banca (expandir opciones)
 * 2. Adjuntar energía al mejor target
 * 3. Evolucionar cuando es posible
 * 4. Atacar si puede (prioriza KO)
 * 5. Terminar turno
 */

import type { GameState } from "@/domain/match";
import { canUseAttack, canPokemonAttack, hasStatusCondition } from "@/domain/match";
import { isPokemonCard, isEnergyCard, isTrainerCard } from "@/domain/cards";
import type { AIAction, Side } from "./types";
import {
  getBasicPokemonInHand,
  getEnergiesInHand,
  getPlayableEvolutions,
  getFirstEmptyBenchSlot,
  getUsableAttacks,
  getBestEnergyTarget,
} from "./actions";

/**
 * Decide las acciones que la IA debe tomar en su turno
 * Retorna una lista de acciones a ejecutar secuencialmente
 */
export function decideOpponentTurn(state: GameState): AIAction[] {
  const actions: AIAction[] = [];
  const side: Side = "opponent";

  console.log("[AI Strategy] Decidiendo turno...");
  console.log("[AI Strategy] Activo:", state.opponentActivePokemon?.pokemon.name);
  console.log("[AI Strategy] Mano:", state.opponentHand.map(c => c.name));
  console.log("[AI Strategy] Banca:", state.opponentBench.map(b => b?.pokemon.name));

  // Simular el estado a medida que planeamos acciones
  let simulatedState = { ...state };

  // 1. Si no tiene activo, jugar uno
  if (!simulatedState.opponentActivePokemon) {
    const basics = getBasicPokemonInHand(simulatedState, side);
    if (basics.length > 0) {
      // Elegir el básico con más HP
      const bestBasic = basics.reduce((best, current) => {
        if (!isPokemonCard(best) || !isPokemonCard(current)) return best;
        return current.hp > best.hp ? current : best;
      });

      actions.push({
        type: "playBasicToActive",
        cardId: bestBasic.id,
        delay: 800,
      });

      // Actualizar estado simulado
      simulatedState = {
        ...simulatedState,
        opponentHand: simulatedState.opponentHand.filter(c => c.id !== bestBasic.id),
        opponentActivePokemon: {
          pokemon: bestBasic,
          attachedEnergy: [],
          currentDamage: 0,
          playedOnTurn: state.turnNumber,
        },
      };
    }
  }

  // 2. Colocar básicos en la banca (hasta llenarla o quedarse sin básicos)
  let benchSlot = getFirstEmptyBenchSlot(simulatedState, side);
  let basicsInHand = getBasicPokemonInHand(simulatedState, side);
  console.log("[AI Strategy] Básicos en mano:", basicsInHand.map(c => c.name), "Slot vacío:", benchSlot);

  while (benchSlot !== -1 && basicsInHand.length > 0) {
    // Priorizar Pokemon con evoluciones o mejor HP
    const basicToPlay = basicsInHand[0]; // Simple: tomar el primero

    actions.push({
      type: "playBasicToBench",
      cardId: basicToPlay.id,
      benchIndex: benchSlot,
      delay: 600,
    });

    // Actualizar estado simulado
    const newBench = [...simulatedState.opponentBench];
    newBench[benchSlot] = {
      pokemon: basicToPlay,
      attachedEnergy: [],
      currentDamage: 0,
      playedOnTurn: state.turnNumber,
    };

    simulatedState = {
      ...simulatedState,
      opponentHand: simulatedState.opponentHand.filter(c => c.id !== basicToPlay.id),
      opponentBench: newBench,
    };

    // Re-evaluar
    benchSlot = getFirstEmptyBenchSlot(simulatedState, side);
    basicsInHand = getBasicPokemonInHand(simulatedState, side);
  }

  // 3. Adjuntar energía (si no lo hizo aún)
  console.log("[AI Strategy] energyAttachedThisTurn:", simulatedState.energyAttachedThisTurn);
  if (!simulatedState.energyAttachedThisTurn) {
    const energies = getEnergiesInHand(simulatedState, side);
    console.log("[AI Strategy] Energías en mano:", energies.map(c => c.name));
    if (energies.length > 0) {
      const target = getBestEnergyTarget(simulatedState, side);
      console.log("[AI Strategy] Target para energía:", target);
      if (target) {
        // Elegir la mejor energía para el target
        const energy = energies[0]; // Simple: usar la primera

        actions.push({
          type: "attachEnergy",
          energyCardId: energy.id,
          targetPokemonId: target.pokemonId,
          isBench: target.isBench,
          benchIndex: target.benchIndex,
          delay: 700,
        });

        // Actualizar estado simulado
        simulatedState = {
          ...simulatedState,
          opponentHand: simulatedState.opponentHand.filter(c => c.id !== energy.id),
          energyAttachedThisTurn: true,
        };

        // Actualizar energía del Pokemon target
        if (target.isBench && target.benchIndex !== undefined) {
          const newBench = [...simulatedState.opponentBench];
          const benchPokemon = newBench[target.benchIndex];
          if (benchPokemon) {
            newBench[target.benchIndex] = {
              ...benchPokemon,
              attachedEnergy: [...benchPokemon.attachedEnergy, energy],
            };
            simulatedState.opponentBench = newBench;
          }
        } else if (simulatedState.opponentActivePokemon) {
          simulatedState.opponentActivePokemon = {
            ...simulatedState.opponentActivePokemon,
            attachedEnergy: [...simulatedState.opponentActivePokemon.attachedEnergy, energy],
          };
        }
      }
    }
  }

  // 4. Evolucionar cuando es posible
  const evolutions = getPlayableEvolutions(simulatedState, side);
  for (const evo of evolutions) {
    // Priorizar evolucionar el activo
    const activeTarget = evo.targets.find(t => t === -1);
    const targetIndex = activeTarget !== undefined ? activeTarget : evo.targets[0];

    actions.push({
      type: "evolve",
      evolutionCardId: evo.card.id,
      targetIndex,
      delay: 800,
    });

    // Actualizar estado simulado (simplificado)
    simulatedState = {
      ...simulatedState,
      opponentHand: simulatedState.opponentHand.filter(c => c.id !== evo.card.id),
    };

    if (targetIndex === -1 && simulatedState.opponentActivePokemon) {
      simulatedState.opponentActivePokemon = {
        ...simulatedState.opponentActivePokemon,
        pokemon: evo.card,
        playedOnTurn: state.turnNumber,
      };
    }
  }

  // 5. Jugar trainers simples (Bill, etc.)
  const trainersPlayed = playSimpleTrainers(simulatedState, side);
  actions.push(...trainersPlayed.actions);
  simulatedState = trainersPlayed.state;

  // 6. Atacar si es posible
  console.log("[AI Strategy] Verificando ataque...");
  console.log("[AI Strategy] Oponente activo:", simulatedState.opponentActivePokemon?.pokemon.name);
  console.log("[AI Strategy] Player activo:", simulatedState.playerActivePokemon?.pokemon.name);
  if (simulatedState.opponentActivePokemon && simulatedState.playerActivePokemon) {
    const active = simulatedState.opponentActivePokemon;

    // Verificar que puede atacar (no dormido/paralizado)
    const canAttack = canPokemonAttack(active);
    console.log("[AI Strategy] Puede atacar:", canAttack);
    if (canAttack) {
      const usableAttacks = getUsableAttacks(simulatedState, side);
      console.log("[AI Strategy] Ataques usables:", usableAttacks);

      if (usableAttacks.length > 0) {
        // Priorizar ataques que noquean
        const knockoutAttack = usableAttacks.find(a => a.knocksOut);
        if (knockoutAttack) {
          actions.push({
            type: "attack",
            attackIndex: knockoutAttack.index,
            delay: 1000,
          });
        } else {
          // Usar el ataque con más daño
          const bestAttack = usableAttacks.reduce((best, current) =>
            current.damage > best.damage ? current : best
          );
          actions.push({
            type: "attack",
            attackIndex: bestAttack.index,
            delay: 1000,
          });
        }

        // Si atacamos, no agregamos endTurn (el ataque lo hace)
        return actions;
      }
    }
  }

  // 7. Si no puede atacar, terminar turno
  console.log("[AI Strategy] No puede atacar, agregando endTurn");
  actions.push({
    type: "endTurn",
    delay: 500,
  });

  console.log("[AI Strategy] Acciones finales:", actions.map(a => a.type));
  return actions;
}

/**
 * Jugar trainers simples que no requieren selección
 */
function playSimpleTrainers(
  state: GameState,
  side: Side
): { actions: AIAction[]; state: GameState } {
  const actions: AIAction[] = [];
  let currentState = state;

  const hand = side === "player" ? state.playerHand : state.opponentHand;

  for (const card of hand) {
    if (!isTrainerCard(card)) continue;

    // Solo jugar trainers simples que la IA puede manejar
    switch (card.name) {
      case "Bill":
        // Bill: robar 2 cartas - siempre útil
        actions.push({
          type: "playTrainer",
          cardId: card.id,
          trainerName: card.name,
          selections: [],
          delay: 800,
        });
        currentState = {
          ...currentState,
          opponentHand: currentState.opponentHand.filter(c => c.id !== card.id),
        };
        break;

      case "Potion":
        // Potion: curar 20 de daño - usar si el activo tiene daño
        if (currentState.opponentActivePokemon?.currentDamage &&
            currentState.opponentActivePokemon.currentDamage >= 20) {
          actions.push({
            type: "playTrainer",
            cardId: card.id,
            trainerName: card.name,
            selections: [[currentState.opponentActivePokemon.pokemon.id]],
            delay: 800,
          });
          currentState = {
            ...currentState,
            opponentHand: currentState.opponentHand.filter(c => c.id !== card.id),
          };
        }
        break;

      case "PlusPower":
        // PlusPower: +10 daño - usar antes de atacar si tiene activo
        if (currentState.opponentActivePokemon) {
          actions.push({
            type: "playTrainer",
            cardId: card.id,
            trainerName: card.name,
            selections: [],
            delay: 600,
          });
          currentState = {
            ...currentState,
            opponentHand: currentState.opponentHand.filter(c => c.id !== card.id),
          };
        }
        break;

      // Agregar más trainers según se necesite
    }
  }

  return { actions, state: currentState };
}

/**
 * Decide las acciones del oponente durante la fase de SETUP
 */
export function decideOpponentSetup(state: GameState): AIAction[] {
  const actions: AIAction[] = [];
  const side: Side = "opponent";

  // 1. Si no tiene activo, jugar el mejor básico
  if (!state.opponentActivePokemon) {
    const basics = getBasicPokemonInHand(state, side);
    if (basics.length > 0) {
      // Elegir el básico con más HP
      const bestBasic = basics.reduce((best, current) => {
        if (!isPokemonCard(best) || !isPokemonCard(current)) return best;
        return current.hp > best.hp ? current : best;
      });

      actions.push({
        type: "playBasicToActive",
        cardId: bestBasic.id,
        delay: 500,
      });
    }
  }

  // 2. Llenar la banca con básicos
  let simulatedState = { ...state };
  let benchSlot = getFirstEmptyBenchSlot(simulatedState, side);
  let basicsRemaining = getBasicPokemonInHand(simulatedState, side)
    .filter(c => {
      // Excluir el que ya pusimos como activo
      const activeAction = actions.find(a => a.type === "playBasicToActive");
      if (activeAction && "cardId" in activeAction) {
        return c.id !== activeAction.cardId;
      }
      return true;
    });

  while (benchSlot !== -1 && basicsRemaining.length > 0) {
    const basicToPlay = basicsRemaining[0];

    actions.push({
      type: "playBasicToBench",
      cardId: basicToPlay.id,
      benchIndex: benchSlot,
      delay: 400,
    });

    // Actualizar para siguiente iteración
    const newBench = [...simulatedState.opponentBench];
    newBench[benchSlot] = {
      pokemon: basicToPlay,
      attachedEnergy: [],
      currentDamage: 0,
    };
    simulatedState.opponentBench = newBench;

    basicsRemaining = basicsRemaining.filter(c => c.id !== basicToPlay.id);
    benchSlot = getFirstEmptyBenchSlot(simulatedState, side);
  }

  return actions;
}
