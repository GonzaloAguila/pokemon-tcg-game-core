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

/**
 * `GameState.tableRules`: battle modifiers the engine reads during play (relative, swapped by
 * swapSides). `noPrizeFor[side]`: names of that side's Pokémon whose Knock Out gives no Prize.
 */
export type TableRules = {
  noPrizeFor?: { player?: string[]; opponent?: string[] };
};

/**
 * `GameState.setupRules`: battle modifiers consumed once both players are ready (applySetupRules;
 * relative, swapped by swapSides). `bonusCards[side]`: battle-only cards put into that side's hand.
 */
export type SetupRules = {
  bonusCards?: { player?: CardEntry[]; opponent?: CardEntry[] };
};
