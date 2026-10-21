/**
 * Adventure content for the simulator (`npm run simulate -- --adventure <json>`): the parts of the
 * API's adventure JSON (content/adventures/<id>.json, spec §5.4) the engine needs to play its
 * battles. The API owns and validates the content; this only reads it.
 */

import type { AdventurePassive, BattleModifier, CardEntry } from "@/domain/adventure";
import type { AdventureGameConfig } from "@/domain/adventure/game";

export type AdventureDifficulty = "normal" | "hard";

/** The subset of the adventure JSON the simulator reads. */
export type AdventureContentLike = {
  id?: string;
  rules: { prizeCount: number; openingHand: number };
  starters: { id: string; deck: CardEntry[] }[];
  battles: {
    index: number;
    id: string;
    opponent: {
      name: string;
      deck?: CardEntry[];
      deckByDifficulty?: { normal: CardEntry[]; hard: { byStarter: Record<string, CardEntry[]> } };
    };
    modifiers?: BattleModifier[];
  }[];
};

/** The rival deck of a battle for a run (battle 10: by difficulty, hard by the run's starter). */
export function rivalDeckFor(content: AdventureContentLike, battleIndex: number, difficulty: AdventureDifficulty, starterId: string): CardEntry[] {
  const battle = content.battles.find((b) => b.index === battleIndex);
  if (!battle) throw new Error(`Adventure has no battle ${battleIndex}`);
  const { deck, deckByDifficulty } = battle.opponent;
  if (deck) return deck;
  if (!deckByDifficulty) throw new Error(`Battle ${battleIndex} has no rival deck`);
  if (difficulty === "normal") return deckByDifficulty.normal;
  const hard = deckByDifficulty.hard.byStarter[starterId];
  if (!hard) throw new Error(`Battle ${battleIndex} has no hard deck for ${starterId}`);
  return hard;
}

/**
 * The createAdventureGame config of a battle with a starter's deck (the untouched starter deck
 * unless `playerDeck` is given) and the battle's modifiers.
 */
export function adventureBattleConfig(
  content: AdventureContentLike,
  starterId: string,
  battleIndex: number,
  options: { difficulty?: AdventureDifficulty; playerDeck?: CardEntry[]; playerPassives?: AdventurePassive[] } = {}
): AdventureGameConfig {
  const starter = content.starters.find((s) => s.id === starterId);
  if (!starter) throw new Error(`Adventure has no starter ${starterId}`);
  const battle = content.battles.find((b) => b.index === battleIndex);
  if (!battle) throw new Error(`Adventure has no battle ${battleIndex}`);
  return {
    playerDeck: options.playerDeck ?? starter.deck,
    opponentDeck: rivalDeckFor(content, battleIndex, options.difficulty ?? "normal", starterId),
    prizeCount: content.rules.prizeCount,
    openingHand: content.rules.openingHand,
    playerPassives: options.playerPassives ?? [],
    modifiers: battle.modifiers ?? [],
  };
}
