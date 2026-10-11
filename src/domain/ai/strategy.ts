/**
 * AI Strategy - Greedy Decision Logic
 *
 * Implementa una IA básica con estrategia greedy:
 * 1. Poner Pokemon básicos en banca (expandir opciones)
 * 2. Adjuntar energía al mejor target
 * 3. Evolucionar cuando es posible
 * 4. Atacar si puede (prioriza KO)
 * 5. Terminar turno
 *
 * Trainers / powers that change the hand (Bill, Energy Search, Evolutionary Light...) are
 * planned ALONE, without endTurn: the caller executes them and asks for a new plan (the
 * single-player loop and the simulator both do), which then sees the new cards. See
 * cardEffects.ts for when each Trainer / power is used.
 */

import type { GameState } from "@/domain/match";
import { canUseAttack, canPokemonAttack, hasStatusCondition } from "@/domain/match";
import { isPokemonCard, isEnergyCard, isTrainerCard, isTrainerInPlay } from "@/domain/cards";
import { swapSides } from "@/domain/board";
import { canPlayTrainerCard } from "@/domain/effects";
import { planHandChange, planStepIn, planSupportPowers, planTrainers } from "./cardEffects";
import { executeAIAction } from "./executor";
import type { AIAction, Side } from "./types";
import {
  basicHp,
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


  // Simular el estado a medida que planeamos acciones
  let simulatedState = { ...state };

  // 0. A Mysterious Fossil / Clefairy Doll as the Active can't attack or retreat: discard it
  //    (promoting the first benched Pokémon) unless something in hand evolves from it
  const active = simulatedState.opponentActivePokemon;
  if (active && isTrainerInPlay(active.pokemon) && simulatedState.opponentBench.length > 0 &&
      !simulatedState.opponentHand.some((c) => isPokemonCard(c) && c.evolvesFrom === active.pokemon.name)) {
    const discard: AIAction = { type: "discardFromPlay", pokemonId: active.pokemon.id, delay: 700 };
    const after = executeAIAction(simulatedState, discard);
    if (after !== simulatedState) {
      actions.push(discard);
      simulatedState = after;
    }
  }

  // 0.5 A Trainer / power that changes the hand: alone, then the turn is planned again
  const handChange = planHandChange(swapSides(simulatedState));
  if (handChange) return [...actions, handChange];

  // 1. Si no tiene activo, jugar uno
  if (!simulatedState.opponentActivePokemon) {
    const basics = getBasicPokemonInHand(simulatedState, side);
    if (basics.length > 0) {
      // Elegir el básico con más HP
      const bestBasic = basics.reduce((best, current) => (basicHp(current) > basicHp(best) ? current : best));

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

  // 2.5 Step In: a Benched Dragonite that can attack replaces an Active that can't
  const stepIn = planStepIn(swapSides(simulatedState));
  if (stepIn) {
    const after = executeAIAction(simulatedState, stepIn);
    if (after !== simulatedState) {
      actions.push(stepIn);
      simulatedState = after;
    }
  }

  // 3. Adjuntar energía (si no lo hizo aún)
  if (!simulatedState.energyAttachedThisTurn) {
    const energies = getEnergiesInHand(simulatedState, side);
    const target = energies.length > 0 ? getBestEnergyTarget(simulatedState, side) : null;
    // Basic Energy first; never a Rainbow Energy that would Knock Out the target (10 damage)
    const targetPokemon = target
      ? [simulatedState.opponentActivePokemon, ...simulatedState.opponentBench].find((p) => p?.pokemon.id === target.pokemonId)
      : undefined;
    const remaining = targetPokemon && isPokemonCard(targetPokemon.pokemon) ? targetPokemon.pokemon.hp - (targetPokemon.currentDamage ?? 0) : 0;
    const usable = energies
      .filter((e) => !(isEnergyCard(e) && e.providesAllTypes && remaining <= 10))
      .sort((a, b) => Number(isEnergyCard(b) && b.isBasic) - Number(isEnergyCard(a) && a.isBasic));
    if (usable.length > 0) {
      if (target) {
        // Elegir la mejor energía para el target
        const energy = usable[0];

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

  // 4.5 Powers that help this turn (Gather Fire, Strange Behavior): applied to the plan's state
  for (const power of planSupportPowers(swapSides(simulatedState))) {
    const after = executeAIAction(simulatedState, power);
    if (after === simulatedState) break;
    actions.push(power);
    simulatedState = after;
  }

  // 5. Jugar trainers (Potion, PlusPower, and the Fossil / Team Rocket ones of cardEffects)
  const willAttack =
    !!simulatedState.opponentActivePokemon &&
    !!simulatedState.playerActivePokemon &&
    canPokemonAttack(simulatedState.opponentActivePokemon) &&
    getUsableAttacks(simulatedState, side).length > 0;
  const otherTrainers = planTrainers(swapSides(simulatedState), { willAttack });
  actions.push(...otherTrainers);
  const playedIds = new Set(otherTrainers.map((a) => (a.type === "playTrainer" ? a.cardId : "")));
  simulatedState = { ...simulatedState, opponentHand: simulatedState.opponentHand.filter((c) => !playedIds.has(c.id)) };
  const trainersPlayed = playSimpleTrainers(simulatedState, side);
  actions.push(...trainersPlayed.actions);
  simulatedState = trainersPlayed.state;

  // 6. Atacar si es posible
  if (simulatedState.opponentActivePokemon && simulatedState.playerActivePokemon) {
    const active = simulatedState.opponentActivePokemon;

    // Verificar que puede atacar (no dormido/paralizado)
    const canAttack = canPokemonAttack(active);
    if (canAttack) {
      const usableAttacks = getUsableAttacks(simulatedState, side);

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
  actions.push({
    type: "endTurn",
    delay: 500,
  });

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
  // The engine's view of the AI (Hay Fever, Headache... block every Trainer)
  const view = side === "player" ? state : swapSides(state);

  for (const card of hand) {
    if (!isTrainerCard(card)) continue;
    if (canPlayTrainerCard(view, card.id) !== null) continue;

    // Solo jugar trainers simples que la IA puede manejar (Bill: cardEffects, before the rest)
    switch (card.name) {
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
      const bestBasic = basics.reduce((best, current) => (basicHp(current) > basicHp(best) ? current : best));

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
