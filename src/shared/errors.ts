/**
 * Error thrown by engine actions (board actions, trainers and powers played through the
 * effect registry) when the requested action is not legal in the given state, or the
 * selections are not among the offered options.
 *
 * Convention: every action has a `canX(...)` query that returns the same Spanish reason
 * (or null when legal) without throwing. Callers check first (to grey out buttons, or to
 * reject a socket message with `reason`); calling the action anyway is a caller bug or a
 * cheat attempt, so it throws instead of silently returning an unchanged state.
 */
export class IllegalActionError extends Error {
  /** Spanish, user-facing reason (same text the matching `canX` returns) */
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    this.name = "IllegalActionError";
    this.reason = reason;
  }
}

/** Throws IllegalActionError when `reason` is set (the result of a `canX` query). */
export function assertLegal(reason: string | null): void {
  if (reason !== null) throw new IllegalActionError(reason);
}
