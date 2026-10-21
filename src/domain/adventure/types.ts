/**
 * Adventure mode (Modo Aventura) types. No runtime imports: the engine core (lib/gameState.ts)
 * imports these. Spec: docs/superpowers/specs/2026-10-21-adventure-mode-design.md.
 */

/** A deck list entry by catalog card id (`base-set-046-charmander`). */
export type CardEntry = { cardId: string; qty: number };

/** One number per side, relative to the state's perspective ("player" / "opponent"). */
export type SidePair = { player: number; opponent: number };

/** A relative side of the table. */
export type TableSide = "player" | "opponent";

/** Run passives (treasures) that act in battle; `extra_heart` is run level only (API). */
export type AdventurePassive = "lucky_coin" | "start_attached_energy" | "opening_hand_plus_1" | "prize_minus_one" | "extra_heart";

/** `GameState.passives`: each side's passives (relative, swapped by swapSides) and the lucky coins already used. */
export type BattlePassives = {
  player?: AdventurePassive[];
  opponent?: AdventurePassive[];
  luckyCoinUsed?: { player?: boolean; opponent?: boolean };
};
