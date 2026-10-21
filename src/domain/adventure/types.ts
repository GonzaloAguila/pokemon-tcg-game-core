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
