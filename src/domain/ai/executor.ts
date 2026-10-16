/**
 * AI Executor - Executes AI Actions on Game State
 *
 * Toma las acciones decididas por la estrategia y las aplica al estado del juego.
 * Diseñado para ser llamado desde React con delays para efectos visuales.
 */

import type { GameState } from "@/domain/match";
import { canExecuteAttack, canExecuteMetronome, executeMetronome, canRetreat, flipAttackCoins, getAttackCoinPlan, getRetreatCoinFlips, getRetreatCost, getTotalEnergyValue } from "@/lib/gameState";
import { executeAttack, endTurn, executeRetreat, createGameEvent, resolveConfusionFlip, promoteActivePokemon } from "@/domain/match";
import { isPokemonCard } from "@/domain/cards";
import type { AIAction, AttackAction, PlayTrainerAction, UsePowerAction, UseStadiumAction } from "./types";
import { canUseVermilionCoin } from "@/domain/stadiums/rules";
import { getEffectivePokemonCard } from "@/domain/powers";
import {
  playBasicToActive,
  playBasicToBench,
  attachEnergy,
  evolve,
  actAs,
} from "./actions";
import {
  canPlayTrainerCard,
  canUsePokemonPower,
  getPowerCoinFlips,
  getPowerSteps,
  getTrainerCoinFlips,
  getTrainerSteps,
  playTrainerCard,
  usePokemonPower,
  canUseStadiumAction,
  getStadiumActionCoinFlips,
  useStadiumAction,
  type CoinFlipRequirement,
} from "@/domain/effects";
import type { CoinFlipResult } from "@/domain/constants";
import { answerPowerStepForAI, answerTrainerStepForAI, collectAnswers } from "./cardEffects";
import { canDiscardFromPlay, discardFromPlay, getTurnActionBlocker, swapBenchTrim, swapStadium } from "@/domain/board";
import { choosePromotion } from "./choices";
import { knowledgeView } from "./knowledge";
import { resolveBenchTrimForAI, resolveOwnAttackPendings } from "./pending";
import { IllegalActionError } from "@/shared/errors";


/**
 * Swap the "player"/"opponent" sides of a state (zones, prize/promotion flags, turn,
 * PlusPower/Defender ownership, the Stadium's player and the game result), so engine
 * functions that act for "player" can run for the AI.
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
    ...(state.stadium !== undefined && { stadium: swapStadium(state.stadium) }),
    ...(state.pendingBenchTrim !== undefined && { pendingBenchTrim: swapBenchTrim(state.pendingBenchTrim) }),
  };
}

/**
 * Ejecuta una sola acción de la IA y retorna el nuevo estado
 */
export function executeAIAction(state: GameState, action: AIAction): GameState {
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
      return executeOpponentAttack(state, action);

    case "playTrainer": {
      // A Stadium that shrank the Benches: the AI returns its own Benched Pokémon when it is first to answer
      const played = resolveBenchTrimForAI(executeTrainer(state, action));
      // A Trainer that ended the AI's turn (Minion of Team Rocket's tails): ended here, after the
      // swap back, so the end-of-turn log reads right for the human
      return played.attackedThisTurn && !state.attackedThisTurn && !played.isPlayerTurn && played.gameResult === null ? endTurn(played) : played;
    }

    case "usePower":
      return executePower(state, action);

    case "useStadium":
      return executeStadiumAction(state, action);

    case "retreat":
      return executeOpponentRetreat(state, action.energyIdsToDiscard, action.benchIndex);

    case "discardFromPlay":
      return actAs(
        state,
        "opponent",
        (s) => canDiscardFromPlay(s, action.pokemonId),
        (s) => {
          const discarded = discardFromPlay(s, action.pokemonId);
          // The AI's Active was discarded: it promotes (the human moves next)
          return discarded.playerNeedsToPromote ? promoteActivePokemon(discarded, choosePromotion(knowledgeView(discarded), false), true) : discarded;
        }
      );

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
function executeOpponentAttack(state: GameState, action: AttackAction): GameState {
  const { attackIndex } = action;
  const attacker = state.opponentActivePokemon;
  const defender = state.playerActivePokemon;

  if (!attacker || !defender) return state;
  if (!isPokemonCard(attacker.pokemon) || !isPokemonCard(defender.pokemon)) return state;

  // A transformed Ditto uses the copied card's attacks
  const attack = getEffectivePokemonCard(state, attacker)?.attacks[attackIndex];
  if (!attack) return state;
  // Metronome: the Defending Pokémon's attack it copies
  const copied = action.copiedAttackName
    ? getEffectivePokemonCard(state, defender)?.attacks.find((a) => a.name === action.copiedAttackName)
    : undefined;

  // Illegal attack (planned on a simulated state, or Leer/Paralysis/energy changed): the
  // engine would throw, so the AI just ends its turn.
  const illegalReason = copied ? canExecuteMetronome(swapSides(state), copied) : canExecuteAttack(swapSides(state), attackIndex);
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

      // The AI knocked itself out: it promotes (the human moves next)
      if (!afterFlip.opponentActivePokemon && afterFlip.gamePhase !== "GAME_OVER") {
        const benchIndex = afterFlip.opponentBench.length > 0 ? choosePromotion(knowledgeView(swapSides(afterFlip)), false) : -1;
        if (benchIndex !== -1) {
          afterFlip = promoteActivePokemon(afterFlip, benchIndex, false);
        }
      }

      // The attack was used (and failed): the AI's turn ends
      return afterFlip.gamePhase !== "GAME_OVER" ? endTurn(afterFlip) : afterFlip;
    }
  }

  const swappedState = toAIAttackView(state);

  // The AI flips the attack's coins; the engine resolves every coin effect.
  // skipEndTurn: endTurn runs after the swap back, so its messages have the right perspective.
  // skipDefenderPromotion: the human chooses which Pokémon to promote.
  // Vermilion City Gym: the coin it planned, if the Stadium still offers it
  const vermilionCoin = !copied && !!action.vermilionCoin && canUseVermilionCoin(swappedState, attackIndex) === null;
  const coinResults = flipAttackCoins(
    getAttackCoinPlan(swappedState, copied ?? attackIndex, { vermilionCoin }),
    () => (Math.random() < 0.5 ? "heads" : "tails")
  );
  const options = { coinResults, skipEndTurn: true, skipDefenderPromotion: true, ...(vermilionCoin && { vermilionCoin }) };
  const attacked = copied
    ? executeMetronome(swappedState, copied, options)
    : executeAttack(swappedState, attackIndex, { ...options, ...(action.chosenType && { chosenType: action.chosenType }) });
  return completeAIAttack(attacked, state.events.length);
}

/**
 * The human's view (the AI's turn) as the AI's attacking view, for the engine's attack functions
 * that act for "player": zones, Prize flags, PlusPower / Defender owners and the Stadium's player
 * swapped; promotion flags reset; everything else (startingPlayer, pendingBenchTrim...) kept, as
 * completeAIAttack's swap back expects. Used both to run the attack and to finish it after the
 * human answered (finishAIAttackAfterReaction), so the swap in and the swap back stay symmetric.
 */
function toAIAttackView(state: GameState): GameState {
  // También intercambiar playerId en los modifiers para que PlusPower funcione correctamente
  const swappedModifiers = state.activeModifiers.map(m => ({
    ...m,
    playerId: m.playerId === "player" ? "opponent" as const : "player" as const,
  }));
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
    isPlayerTurn: true, // Fingir que es turno del "jugador" (que ahora es el oponente)
    playerCanTakePrize: state.opponentCanTakePrize,
    opponentCanTakePrize: state.playerCanTakePrize,
    playerNeedsToPromote: false, // Reset en el estado swapped
    opponentNeedsToPromote: false,
    activeModifiers: swappedModifiers,
    ...(state.stadium !== undefined && { stadium: swapStadium(state.stadium) }),
  };
}

/** Event that marks a choice of the AI's attack left to the human (Flee, Bench Guard, Terror Strike): "<name>: el defensor debe elegir". */
const DEFENDER_CHOOSES = /: el defensor debe elegir$/;

/**
 * Single-player: finish the AI's turn after the human answered a choice of the AI's attack —
 * a power asked mid-attack (Flee, Bench Guard: `pendingAttackChoice.reaction`) or a choice left
 * to the defender (Terror Strike). `state` is the human's view ("player" = human, the AI's turn)
 * right after `resolveAttackChoice` ran on the AI's view with `{ skipEndTurn: true }` and was
 * swapped back. It runs the executor's own post-attack step: the AI answers its own choices that
 * came up after the resume (its Bench Guard on its own Bench, a later attack choice), promotes if
 * its Active was Knocked Out, the log lines written in the AI's view since `eventsBefore` (default:
 * after the last "…: el defensor debe elegir" line) are reworded for the human, and the turn ends
 * unless a Prize, a promotion or another answer of the human is pending. Returns `state` unchanged
 * when it isn't the AI's turn or the human still has to answer.
 */
export function finishAIAttackAfterReaction(state: GameState, eventsBefore?: number): GameState {
  if (state.isPlayerTurn || state.gameResult !== null) return state;
  if (state.pendingAttackChoice?.step.chooser === "opponent") return state;
  let start = eventsBefore;
  if (start === undefined) {
    let marker = -1;
    state.events.forEach((e, i) => {
      if (DEFENDER_CHOOSES.test(e.message)) marker = i;
    });
    start = marker === -1 ? state.events.length : marker + 1;
  }
  // The same swap as the AI's attack (completeAIAttack swaps exactly those fields back)
  return completeAIAttack(toAIAttackView(state), start);
}

/**
 * The AI's attack after the engine ran it (`resultState`: the AI's view, "player" = AI, turn not
 * ended): the AI answers its own pending choices (switch, deck search, bench damage, its own
 * powers), the state is swapped back to the human's view, the log lines from `eventsBefore` on
 * (written for the AI) are reworded, the AI promotes after its own Knock Out, and the turn ends
 * unless a Prize, a promotion or a choice of the human is pending. Shared by the AI's attack and
 * finishAIAttackAfterReaction.
 */
function completeAIAttack(attacked: GameState, eventsBefore: number): GameState {
  // The AI answers its own attack's choices (switch, deck search, bench damage) in its view.
  const resultState = resolveOwnAttackPendings(attacked);

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
  // Only the lines written by this attack (earlier ones are already in the human's perspective)
  const newEvents = resultState.events.slice(eventsBefore);
  const correctedEvents = [...resultState.events.slice(0, eventsBefore), ...newEvents.map((event, idx, allEvents) => {
    let message = event.message;

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
  })];

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
    ...(resultState.stadium !== undefined && { stadium: swapStadium(resultState.stadium) }),
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
      // The AI promotes (the human moves next)
      const promotedPokemon = opponentBenchWithPokemon[choosePromotion(knowledgeView(swapSides(finalState)), false)] ?? opponentBenchWithPokemon[0];
      const newOpponentBench = finalState.opponentBench.filter(p => p !== promotedPokemon);

      finalState = {
        ...finalState,
        opponentActivePokemon: promotedPokemon,
        opponentBench: newOpponentBench,
        events: [
          ...finalState.events,
          createGameEvent(
            `${promotedPokemon.pokemon.name} pasa a ser el Pokémon activo del rival`,
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
          createGameEvent("¡Victoria! El rival no tiene más Pokémon", "system"),
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

/** The AI flips the coins an effect asks for (like its attack coins). */
function flipCoins(requirement: CoinFlipRequirement): CoinFlipResult[] {
  const flip = (): CoinFlipResult => (Math.random() < 0.5 ? "heads" : "tails");
  if (requirement === "untilTails") {
    const coins: CoinFlipResult[] = [];
    // Capped like the API's until-tails runs; the last coin is then tails
    for (let i = 0; i < 64; i++) {
      const coin = i === 63 ? "tails" : flip();
      coins.push(coin);
      if (coin === "tails") break;
    }
    return coins;
  }
  return Array.from({ length: requirement }, flip);
}

/** Run an engine effect for the AI; an illegal one leaves the state unchanged. */
function tryEffect(view: GameState, run: () => GameState): GameState {
  try {
    return run();
  } catch (error) {
    if (error instanceof IllegalActionError) return view;
    throw error;
  }
}

/**
 * Ejecuta un trainer del oponente a través del registro de efectos del engine (las selecciones
 * significan lo mismo que para el jugador). The AI flips its coins; with `answerAtPlay` it also
 * answers the steps now (cardEffects.answerTrainerStepForAI).
 */
function executeTrainer(state: GameState, action: PlayTrainerAction): GameState {
  const { cardId, trainerName } = action;
  return actAs(
    state,
    "opponent",
    (s) => canPlayTrainerCard(s, cardId),
    (s) =>
      tryEffect(s, () => {
        let coins = flipCoins(getTrainerCoinFlips(s, cardId));
        const coinsForSteps = coins.length > 0 ? coins : undefined;
        const selections = action.answerAtPlay
          ? collectAnswers(
              (answered) => getTrainerSteps(s, cardId, answered, coinsForSteps),
              (step) => answerTrainerStepForAI(s, cardId, trainerName, step)
            )
          : action.selections;
        // A coin flipped after the choices (Blaine's Gamble)
        if (coins.length === 0) coins = flipCoins(getTrainerCoinFlips(s, cardId, selections));
        // skipEndTurn: a Trainer that ends the turn leaves it to the caller (after the swap back)
        return playTrainerCard(s, cardId, selections, { coinResults: coins, skipEndTurn: true });
      })
  );
}

/** Uses the action of the Stadium in play for the AI with the answers it planned (Celadon City Gym). */
function executeStadiumAction(state: GameState, action: UseStadiumAction): GameState {
  return actAs(
    state,
    "opponent",
    (s) => canUseStadiumAction(s),
    (s) => tryEffect(s, () => useStadiumAction(s, action.selections, { coinResults: flipCoins(getStadiumActionCoinFlips(s)) }))
  );
}

/** Usa el Poder Pokémon activado de un Pokémon de la IA (monedas y respuestas al ejecutarlo). */
function executePower(state: GameState, action: UsePowerAction): GameState {
  const { pokemonId, powerName } = action;
  return actAs(
    state,
    "opponent",
    (s) => canUsePokemonPower(s, pokemonId),
    (s) =>
      tryEffect(s, () => {
        const coins = flipCoins(getPowerCoinFlips(s, pokemonId));
        const coinsForSteps = coins.length > 0 ? coins : undefined;
        const selections =
          action.selections ??
          collectAnswers(
            (answered) => getPowerSteps(s, pokemonId, answered, coinsForSteps),
            (step) => answerPowerStepForAI(s, powerName, step)
          );
        return usePokemonPower(s, pokemonId, selections, { coinResults: coins });
      })
  );
}

/** Why the AI's Active can't retreat now paying `energyIds` (AI view), or null. */
function retreatBlocker(view: GameState, energyIds: string[], benchIndex: number): string | null {
  const blocker = getTurnActionBlocker(view);
  if (blocker) return blocker;
  const active = view.playerActivePokemon;
  if (!active || !view.playerBench[benchIndex]) return "No hay Pokémon para el cambio";
  if (!canRetreat(active, view.playerBench.length, view.retreatedThisTurn)) return "No puede retirarse";
  const paid = getTotalEnergyValue(active.attachedEnergy.filter((e) => energyIds.includes(e.id)));
  return paid >= getRetreatCost(active, view.playerBench, view) ? null : "Energía insuficiente para retirarse";
}

/**
 * Retirada del Pokémon activo de la IA (on its view, through the engine). A refused retreat
 * leaves the state unchanged. The AI flips the Sinkhole coins (Dark Dugtrio).
 */
function executeOpponentRetreat(
  state: GameState,
  energyIdsToDiscard: string[],
  benchIndex: number
): GameState {
  return actAs(
    state,
    "opponent",
    (view) => retreatBlocker(view, energyIdsToDiscard, benchIndex),
    (view) => {
      const coins = Array.from({ length: getRetreatCoinFlips(view) }, (): CoinFlipResult => (Math.random() < 0.5 ? "heads" : "tails"));
      return executeRetreat(view, energyIdsToDiscard, benchIndex, { coinResults: coins });
    }
  );
}
