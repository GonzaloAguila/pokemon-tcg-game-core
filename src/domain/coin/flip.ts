/**
 * Coin flip logic - pure functions
 */

import type { CoinFlip } from "./types";

/**
 * Flips a single coin
 * @param rng - Random number generator (0-1), defaults to Math.random
 */
export const flipCoin = (rng: () => number = Math.random): CoinFlip =>
  rng() < 0.5 ? "heads" : "tails";

/**
 * Flips multiple coins
 * @param count - Number of coins to flip
 * @param rng - Random number generator (0-1), defaults to Math.random
 */
export const flipCoins = (
  count: number,
  rng: () => number = Math.random
): CoinFlip[] => Array.from({ length: count }, () => flipCoin(rng));

/**
 * Checks if a coin flip result is heads
 */
export const isHeads = (flip: CoinFlip): boolean => flip === "heads";

/**
 * Checks if a coin flip result is tails
 */
export const isTails = (flip: CoinFlip): boolean => flip === "tails";

/**
 * Counts heads in a series of flips
 */
export const countHeads = (flips: CoinFlip[]): number =>
  flips.filter(isHeads).length;

/**
 * Counts tails in a series of flips
 */
export const countTails = (flips: CoinFlip[]): number =>
  flips.filter(isTails).length;
