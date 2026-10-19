/**
 * Game-level rules the per-state invariants can't see, checked by following a whole game
 * (state in side A's perspective):
 *
 * - Prizes: each side has taken exactly one Prize per prize-giving Pokémon of the other side
 *   that was Knocked Out (capped by the Prizes it had), whenever no Prize is waiting; Prizes
 *   put into the hand by Lt. Surge's Treaty (its log lines) don't count.
 *   A Knock Out = a Pokémon leaves play with the bottom card of its stack (its Basic or
 *   Mysterious Fossil) in its owner's discard pile — a Knocked Out devolved Pokémon's top card
 *   is in the hand — or as Buzzap Energy (Electrode Knocks itself Out), or back in the hand by
 *   Rebirth (Rocket's Moltres: its "volvió a la mano tras quedar Fuera de Combate" line in this
 *   action's events). Scoop Up (Basic to the
 *   hand), Mr. Fuji, Vanish... are not Knock Outs. Trainers played as Basics give no Prize.
 * - The between-turns checkup changes no damage but Poison's on Poisoned Active Pokémon
 *   (10, or poisonDamage: 20 for Toxic), for both players.
 * - One retreat per turn, never while Asleep / Paralyzed or under a "can't retreat" effect.
 * - Evolution cards from the hand (and Pokémon Breeder): not on a player's first turn, not on
 *   a Pokémon put into play or evolved this turn.
 * - A side without an Active Pokémon is promoting one (or has lost).
 * - One Energy card attached from the hand per turn; extra Water Energy cards only with a
 *   working Rain Dance.
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { isPokemonCard, isTrainerInPlay } from "@/domain/cards";
import { GamePhase, PokemonPowerType, StatusCondition } from "@/domain/constants";
import { isPowerActive } from "@/domain/powers";

type Side = "player" | "opponent";

const inPlayOf = (state: GameState, side: Side): PokemonInPlay[] =>
  (side === "player" ? [state.playerActivePokemon, ...state.playerBench] : [state.opponentActivePokemon, ...state.opponentBench]).filter(
    (p): p is PokemonInPlay => p != null
  );

const discardOf = (state: GameState, side: Side): GameCard[] => (side === "player" ? state.playerDiscard : state.opponentDiscard);
const prizesOf = (state: GameState, side: Side): number => (side === "player" ? state.playerPrizes : state.opponentPrizes).length;
const other = (side: Side): Side => (side === "player" ? "opponent" : "player");
const powerNameOf = (p: PokemonInPlay): string | undefined => (isPokemonCard(p.pokemon) ? p.pokemon.power?.name : undefined);

function hasWorkingRainDance(state: GameState, side: Side): boolean {
  return inPlayOf(state, side).some(
    (p) => isPokemonCard(p.pokemon) && p.pokemon.power?.type === PokemonPowerType.UnlimitedEnergyAttach && isPowerActive(state, p)
  );
}

export class GameRules {
  /** Prize-giving Knock Outs suffered by each side */
  private readonly knockOuts: Record<Side, number> = { player: 0, opponent: 0 };
  private prizeBaseline: Record<Side, number> | null = null;
  private turn = -1;
  private retreats = 0;
  private attaches = 0;

  /** Problems after `after` replaced `before` by `actor`'s action labelled `label` */
  check(before: GameState, after: GameState, actor: Side, label: string): string[] {
    const problems: string[] = [];
    if (after.turnNumber !== this.turn) {
      this.turn = after.turnNumber;
      this.retreats = 0;
      this.attaches = 0;
    }

    // Per-turn limits of the acting side (labels of the bots' board actions)
    const activeBefore = actor === "player" ? before.playerActivePokemon : before.opponentActivePokemon;
    const activeAfter = actor === "player" ? after.playerActivePokemon : after.opponentActivePokemon;
    if ((label.startsWith("retreat") || label === "greedy retreat") && activeBefore?.pokemon.id !== activeAfter?.pokemon.id) {
      const blocking = (activeBefore?.statusConditions ?? []).filter((c) => c === StatusCondition.Asleep || c === StatusCondition.Paralyzed);
      if (blocking.length > 0) problems.push(`${activeBefore!.pokemon.name} retreated while ${blocking.join("+")}`);
      if (activeBefore?.retreatPrevented) problems.push(`${activeBefore.pokemon.name} retreated under a "can't retreat" effect`);
      this.retreats++;
      if (this.retreats > 1) problems.push(`retreated ${this.retreats} times in one turn`);
    }
    if (label.startsWith("attach ") || label.startsWith("greedy attachEnergy")) {
      const handBefore = actor === "player" ? before.playerHand : before.opponentHand;
      const handAfter = actor === "player" ? after.playerHand : after.opponentHand;
      const attached = handBefore.filter((c) => c.kind === "energy" && !handAfter.some((h) => h.id === c.id));
      for (const card of attached) {
        const rainDance = card.kind === "energy" && card.isBasic && card.energyType === "water" && hasWorkingRainDance(before, actor);
        if (!rainDance) this.attaches++;
      }
      if (this.attaches > 1) problems.push(`attached ${this.attaches} Energy cards from the hand in one turn`);
    }

    // Between-turns checkup: only Poison changes damage counters
    // (only plain end-turn actions: the greedy executor's attack also ends the turn)
    const checkupRan =
      (label.startsWith("end turn") || label === "greedy endTurn") &&
      before.gamePhase === GamePhase.Playing &&
      before.checkupDoneOnTurn !== before.turnNumber &&
      (after.turnNumber !== before.turnNumber || after.checkupDoneOnTurn === before.turnNumber);
    if (checkupRan) {
      for (const side of ["player", "opponent"] as const) {
        const active = side === "player" ? before.playerActivePokemon : before.opponentActivePokemon;
        for (const p of inPlayOf(before, side)) {
          const now = inPlayOf(after, side).find((q) => q.pokemon.id === p.pokemon.id);
          if (!now) continue;
          const poisoned = p === active && (p.statusConditions ?? []).includes(StatusCondition.Poisoned);
          const expected = poisoned ? (p.poisonDamage ?? 10) : 0;
          const delta = (now.currentDamage ?? 0) - (p.currentDamage ?? 0);
          if (delta !== expected) {
            problems.push(`checkup: ${side} ${p === active ? "Active" : "Benched"} ${p.pokemon.name} took ${delta} damage (expected ${expected})`);
          }
        }
      }
    }

    // Evolving from the hand / with Pokémon Breeder
    if (label.startsWith("evolve") || label === "greedy evolve" || label.endsWith("Pokémon Breeder")) {
      const topsBefore = new Map(inPlayOf(before, actor).map((p) => [p.pokemon.id, p]));
      for (const p of inPlayOf(after, actor)) {
        if (topsBefore.has(p.pokemon.id)) continue;
        const under = [...(p.previousEvolutions ?? [])].reverse().find((c) => topsBefore.has(c.id));
        const old = under && topsBefore.get(under.id);
        if (!old) continue;
        if (before.turnNumber <= 2) problems.push(`${old.pokemon.name} evolved into ${p.pokemon.name} on turn ${before.turnNumber}`);
        if (old.playedOnTurn === before.turnNumber) {
          problems.push(`${old.pokemon.name} evolved into ${p.pokemon.name} the turn it was put into play / evolved`);
        }
      }
    }

    // No Active: promoting, or the game is over
    if (after.gamePhase === GamePhase.Playing) {
      for (const side of ["player", "opponent"] as const) {
        const active = side === "player" ? after.playerActivePokemon : after.opponentActivePokemon;
        // The Defending Pokémon's replacement may wait for the attack's bench damage choice
        const promoting = (side === "player" ? after.playerNeedsToPromote : after.opponentNeedsToPromote) ||
          !!after.pendingBenchDamageSelection?.promoteDefenderAfter;
        const bench = side === "player" ? after.playerBench : after.opponentBench;
        if (!active && bench.length === 0) problems.push(`${side} has no Pokémon in play and the game goes on`);
        else if (!active && !promoting) problems.push(`${side} has no Active Pokémon and isn't promoting one`);
      }
    }

    // Knock Outs: Pokémon (top cards) that left play this action
    const seen = new Set(before.events.map((e) => e.id));
    const newLines = after.events.filter((e) => !seen.has(e.id)).map((e) => e.message);
    for (const side of ["player", "opponent"] as const) {
      const nowInPlay = new Set(inPlayOf(after, side).map((p) => p.pokemon.id));
      const discard = new Set(discardOf(after, side).map((c) => c.id));
      const buzzapped = new Set(
        [...inPlayOf(after, "player"), ...inPlayOf(after, "opponent")].flatMap((p) => p.attachedEnergy.map((e) => e.buzzapSourceId)).filter(Boolean)
      );
      for (const p of inPlayOf(before, side)) {
        const id = p.pokemon.id;
        if (nowInPlay.has(id)) continue;
        // Evolved this action: the old top card is now under the new one
        if (inPlayOf(after, side).some((q) => q.previousEvolutions?.some((c) => c.id === id))) continue;
        const bottom = p.previousEvolutions?.[0]?.id ?? id;
        // Rebirth: the Knocked Out card went back to the hand after being discarded
        const handNow = side === "player" ? after.playerHand : after.opponentHand;
        const reborn = handNow.some((c) => c.id === id) && newLines.some((m) => m === `${powerNameOf(p)}: ${p.pokemon.name} volvió a la mano tras quedar Fuera de Combate`);
        const knockedOut = buzzapped.has(id) || discard.has(bottom) || reborn;
        // Devolved, then Knocked Out: the Knocked Out Pokémon is the stage under the top card
        // (back in the hand); a Mysterious Fossil / Clefairy Doll gives no Prize
        const hand = side === "player" ? after.playerHand : after.opponentHand;
        const devolved = !buzzapped.has(id) && hand.some((c) => c.id === id) && (p.previousEvolutions?.length ?? 0) > 0;
        const card = devolved ? p.previousEvolutions![p.previousEvolutions!.length - 1] : p.pokemon;
        const givesPrize = !isTrainerInPlay(card) && card.kind !== "trainer";
        if (knockedOut && givesPrize) this.knockOuts[side]++;
      }
    }

    // Prizes taken = Knock Outs of the other side (when no Prize is waiting)
    if (after.gamePhase === GamePhase.Playing && !this.prizeBaseline) {
      this.prizeBaseline = { player: prizesOf(after, "player"), opponent: prizesOf(after, "opponent") };
    }
    // Lt. Surge's Treaty: a Prize put into the hand without a Knock Out (one per side)
    if (this.prizeBaseline) {
      for (const line of newLines) {
        if (/^Lt\. Surge's Treaty: quien lo jugó puso el Premio \d+ en su mano$/.test(line)) this.prizeBaseline[actor]--;
        if (/^Lt\. Surge's Treaty: el otro jugador puso el Premio \d+ en su mano$/.test(line)) this.prizeBaseline[other(actor)]--;
      }
    }
    if (this.prizeBaseline && !after.playerCanTakePrize && !after.opponentCanTakePrize) {
      for (const side of ["player", "opponent"] as const) {
        const taken = this.prizeBaseline[side] - prizesOf(after, side);
        const owed = Math.min(this.prizeBaseline[side], this.knockOuts[other(side)]);
        const gameOver = after.gamePhase === GamePhase.GameOver;
        if (gameOver ? taken > owed : taken !== owed) {
          problems.push(`${side} took ${taken} Prizes for ${this.knockOuts[other(side)]} Knock Outs of ${other(side)}'s Pokémon`);
        }
      }
    }
    return problems;
  }
}
