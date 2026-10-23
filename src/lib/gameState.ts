import { getCardImageUrl as getCatalogImageUrl } from "@/domain/catalog";
import type { Card, ProtectionType, EnergyType, Attack, PokemonCard, AttackEffect } from "@/domain/cards";
import {
  isEnergyCard,
  isPokemonCard,
  isPlayableAsBasic,
  isTrainerInPlay,
  cardsLeavingPlay,
  cardOutOfPlay,
  givesPrizeWhenKnockedOut,
  noPrizeByTableRule,
} from "@/domain/cards";
import { isFaceDown, revealFaceDownCards } from "@/domain/trainers/secret-plan";
import {
  StatusCondition,
  GamePhase,
  CardKind,
  EnergyType as EnergyTypeEnum,
  PokemonStage,
  AttackEffectType,
  AttackTarget,
  BenchDamageTarget,
  PokemonPowerType,
  type CoinFlipResult,
} from "@/domain/constants";
import { decks, findCardBySetAndNumber, type Deck, type DeckEntry } from "@/domain/decks";
import {
  applyAttackDamageReductions,
  applyDamageHalving,
  applyDamagePowers,
  asleepDamageReaction,
  getBenchGuard,
  getDamagedStatusFlip,
  getEnergyTypeOverride,
  getFleePower,
  getRebirthPower,
  getConfusedDamageBonus,
  getKnockOutRetaliation,
  getRetreatCostIncrease,
  getRetreatDamageSources,
  getDamageReaction,
  getEffectiveHp,
  getEffectivePokemonCard,
  getRetreatCostReduction,
  hasBlockingStatus,
  hasStatusImmunity,
  isAwaitingTransformTarget,
  discardBrokenShapeshiftCards,
  isDamageBlocked,
  isPowerActive,
  applyRelaxingScent,
  getEnergyDrainPower,
  getRebellionPower,
  getShockBlastPower,
  getSurviveKnockOutPower,
  isScramming,
} from "@/domain/powers";
import { getTurnActionBlocker, isBenchFull, maxBenchSize } from "@/domain/board";
import { isLuckyDuel, type GameMode } from "@/domain/lucky-duel/mode";
import type { BattlePassives, SetupRules, SidePair, TableRules } from "@/domain/adventure/types";
import { applySetupRules } from "@/domain/adventure/passives";
import { getLuckyDuelAttackBlocker } from "@/domain/lucky-duel/rules";
import { resistanceAmount, stadiumIgnoresResistance, stadiumIgnoresWeakness, stadiumOffersAttackCoin, stadiumRetreatModifier, VERMILION_COIN_DAMAGE } from "@/domain/stadiums/rules";
import type { SelectionStep } from "@/domain/effects/types";
import { checkCoins } from "@/domain/effects/validate";
import { wholeDeckChoice } from "@/domain/effects/deck-search";
import { attachedTrainerNamed, benchedLeavers, expireAttachedTrainers, CHARITY, SABRINAS_ESP, BROCKS_PROTECTION, KOGAS_NINJA_TRICK } from "@/domain/trainers/attached";
import { returnSetAsideHand, type SetAsideHand } from "@/domain/trainers/set-aside";
export type { SetAsideHand } from "@/domain/trainers/set-aside";
import type { LastDuel, PendingDuel } from "@/domain/duel/rps";
export type { LastDuel, PendingDuel, RpsChoice } from "@/domain/duel/rps";
import { isAttackChoiceEffect, matchesDeckCardFilter, newBenchedPokemon, startAttackChoices, type AttackChoiceContext } from "./attackChoices";
export { resolveAttackChoice, getAttackChoiceCoinPlan, isAttackChoiceEffect, matchesDeckCardFilter } from "./attackChoices";
export type { AttackChoiceContext } from "./attackChoices";
import type { PendingPowerChoice } from "./powerChoices";
import { attackBonusFromModifiers, defenderReduction as attachedDefenderReduction, kogaPoisons, modifierAppliesTo, modifierHoldsCard, releaseOrphanModifiers } from "./modifiers";
import { expireSideTurns } from "@/domain/trainers/side-marks";
export { resolvePowerChoice, triggerOnPlayPower, ON_PLAY_POWERS } from "./powerChoices";
export type { PendingPowerChoice, OnPlayPowerDef } from "./powerChoices";
import { assertLegal, IllegalActionError } from "@/shared/errors";
import { chooseAutoPromotion } from "@/domain/ai/choices";

// ============================================================================
// TIPOS
// ============================================================================

export type GameCard = Card & {
  id: string; // ID único para cada instancia de carta
  /** For Buzzap energy: ID of the original Electrode Pokemon */
  buzzapSourceId?: string;
  /** For Buzzap energy: the energy type chosen by the player */
  buzzapEnergyType?: EnergyType;
};

// Re-export StatusCondition from constants for backward compatibility
export { StatusCondition } from "@/domain/constants";

export type PokemonInPlay = {
  pokemon: GameCard;
  attachedEnergy: GameCard[];
  attachedTrainers?: GameCard[];
  previousEvolutions?: GameCard[];
  currentDamage?: number;
  statusConditions?: StatusCondition[];
  paralyzedOnTurn?: number; // Turno en que fue paralizado (se cura al final del siguiente turno del dueño)
  playedOnTurn?: number; // Turno en que fue jugado o evolucionado (no puede evolucionar el mismo turno)
  usedOnceAttacks?: string[]; // Ataques ya usados (para ataques "useOnce" como Bofetada Puerro de Farfetch'd)
  poisonDamage?: number; // Daño de veneno personalizado (default 10, Tóxico usa 20)
  protection?: {
    type: ProtectionType;       // "damageOnly" o "damageAndEffects"
    expiresAfterTurn: number;   // Turno después del cual expira la protección
    threshold?: number;         // Si se establece, solo bloquea daño <= este valor (ej: Onix Endurecimiento bloquea <=30)
  };
  /** Energy Burn: treat all attached energy as this type until end of turn */
  energyConversionType?: EnergyType;
  /** Conversion 1 (Porygon): overrides the opponent's weakness type. Clears when leaving active. */
  modifiedWeakness?: EnergyType;
  /** Conversion 2 (Porygon): overrides this Pokemon's resistance type. Clears when leaving active. */
  modifiedResistance?: EnergyType;
  /** Swords Dance: bonus damage added to next attack. Clears after attacking, retreating, or end of owner's next turn. */
  nextTurnBonusDamage?: number;
  /** Minimize / Screech: reduce incoming damage by this amount. Clears after being attacked, retreating, or end of opponent's next turn. */
  nextTurnDamageReduction?: number;
  /** Turn number when the "next turn" effect was applied (for expiration tracking) */
  nextTurnEffectAppliedOnTurn?: number;
  /** Acid (Victreebel): prevents retreat until end of opponent's next turn. Cleared by Switch/evolve/going to bench. */
  retreatPrevented?: boolean;
  /** Turn number when retreat was prevented (for expiration in endTurn) */
  retreatPreventedOnTurn?: number;
  /** Shift (Venomoth): temporary type change until end of turn */
  shiftedType?: EnergyType;
  /** Mirror Move: stores the final damage received from the last attack (set on attack, cleared on endTurn) */
  lastDamageReceived?: number;
  /** Destiny Bond: if this Pokemon is KO'd by an attack, the attacker is also KO'd. Clears at end of owner's next turn. */
  destinyBondActive?: boolean;
  /** Turn number when Destiny Bond was activated (for expiration) */
  destinyBondTurn?: number;
  /**
   * Mirror Shell (Dark Wartortle): turn number when it was used. During the next turn (the
   * opponent's), attack damage done to it is done back to the attacker. Cleared on bench/evolve.
   */
  mirrorShellOnTurn?: number;
  /**
   * Crosscounter / Fire Wall (CounterAttack): during the turn after `onTurn` (the opponent's),
   * attack damage done to it is answered with damage to the attacker: `amount`, or the damage
   * done × `damageMultiplier`; `retaliationCoin` = only on heads (the attack's defender coin);
   * `applyWeaknessResistance` with its type. Cleared on bench/evolve.
   */
  counterAttack?: {
    onTurn: number;
    attackName: string;
    amount?: number;
    damageMultiplier?: number;
    retaliationCoin?: boolean;
    applyWeaknessResistance?: boolean;
  };
  /**
   * Shadow Images (EvadeOnFlip): whenever an attack that can damage it is used against it, the
   * attacking player flips (the attack's defender coin); tails = no damage to it. Lasts until it
   * takes damage from an attack; cleared on bench/evolve.
   */
  evadeOnFlip?: { attackName: string };
  /**
   * Tunneling / Screaming Headbutt (CantAttackNextTurn): during turn `onTurn` (its owner's next
   * turn) it can't attack, or can't use `attackName` only. Cleared on bench/evolve.
   */
  attackLock?: { onTurn: number; attackName?: string };
  /** The last attack it used and the turn (Earthdrill: "used Lie Low last turn"). Cleared on bench/evolve. */
  lastAttack?: { name: string; turn: number };
  /**
   * Intimidate (IntimidateLock): during turn `onTurn` (its owner's next turn) it can't attack while
   * the Pokémon `pokemonId` is the Defending Pokémon. Cleared on bench/evolve.
   */
  intimidatedBy?: { pokemonId: string; onTurn: number; attackName: string };
  /** Focus Energy (DoubleAttackNextTurn): during turn `onTurn` the attack `name` does double damage (and self damage). Cleared on bench/evolve. */
  doubledAttack?: { name: string; onTurn: number };
  /**
   * Giant Growth (SetMaxHp): its maximum HP is `hp` (getEffectiveHp) and its attack `attackName`
   * does `damage` base damage. Ends when it is Benched (it can be Knocked Out then).
   */
  hpOverride?: { hp: number; attackName?: string; damage?: number };
  /**
   * Giovanni (Gym Challenge): during this turn number it may evolve though it was just put into
   * play / evolved or it is the first turn (canEvolve). Kept when it evolves, so what it evolves
   * into may evolve again that turn.
   */
  evolveAnyTimeOnTurn?: number;
  /** Deflector (HalveDamageNextTurn): damage done to it during turn `onTurn` is halved. Cleared on bench/evolve. */
  halveDamage?: { onTurn: number; attackName: string };
  /** Crystal Beam (BlockEnergyAttach): its owner can't attach Energy cards to it during this turn. Cleared on bench/evolve. */
  energyAttachBlockedOnTurn?: number;
  /** Sand-Attack / SmokeScreen: opponent must flip coin to attack. Clears on bench/evolve. */
  mustFlipToAttack?: boolean;
  /** Turn number when mustFlipToAttack was set (for expiration) */
  mustFlipToAttackTurn?: number;
};

/**
 * A card shown in a log line (the hand Lass reveals, the Energy Sleight of Hand finds): only
 * what is printed on it, never its in-game id. Build them with `toLogCards`.
 */
export type LogCard = { name: string; imageUrl: string };

/** GameState.lastAttackHit: who hit, with which attack, for how much, on which turn. */
export type AttackHit = {
  attackerSide: "player" | "opponent";
  /** The attacker's card name as printed ("Misty's Seaking") */
  attackerName: string;
  attackName: string;
  damage: number;
  turn: number;
  seq: number;
};

export type GameEvent = {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "action" | "system";
  /** Cards the line shows to both players (consumers render them as thumbnails) */
  cards?: LogCard[];
};

// Re-export GamePhase from constants for backward compatibility
export { GamePhase } from "@/domain/constants";

export type GameModifier = {
  id: string;
  /**
   * plusPower / defender: the attached Trainer kept as a modifier (`card` is in play here and
   * goes to the discard pile when it expires). misty (Gym Heroes' Misty): this turn's attack of a
   * Pokémon with Misty in its name does `amount` more; the card is already in the discard pile
   * (`card` is only a reference, see modifierHoldsCard). koga (Gym Challenge's Koga): this turn, an
   * attack of a Pokémon with Koga in its name that damages the Defending Pokémon Poisons it
   * (`amount` 0; no card held either).
   */
  source: "plusPower" | "defender" | "misty" | "koga";
  card: GameCard;
  targetPokemonId?: string; // Para Defender: qué pokemon protege
  amount: number; // +10 para PlusPower, -20 para Defender, +20 para Misty
  expiresAfterTurn: number; // Turno en que expira
  playerId: "player" | "opponent"; // Quién jugó este modifier
};

/** "draw": both Actives Knocked Out at the same time in a Lucky Duel (standard games never draw). */
export type GameResult = "victory" | "defeat" | "draw" | null;

/** A turn number per side ("player" / "opponent" of the state's perspective; see domain/trainers/side-marks.ts). */
export type SideTurns = Partial<Record<"player" | "opponent", number>>;

/**
 * Answers of the Pokémon Powers a player may use in the middle of an attack (Gym Heroes), given
 * back to the attack when it is resumed (ExecuteAttackOptions.reactions):
 * - `flee`: Flee (Misty's Tentacruel, the Defending Pokémon): id of the Benched Pokémon it
 *   switched with, or null when not used.
 * - `benchGuard`: Bench Guard (Brock's Rhydon) of each side ("player" = the attacker's side):
 *   ids of the Benched Pokémon whose damage it took 10 of (empty = not used).
 */
export type AttackReactions = {
  flee?: string | null;
  benchGuard?: Partial<Record<"player" | "opponent", string[]>>;
  /**
   * Sabrina's ESP (attached to the attacker): the attack's own coins flipped again by the caller
   * (laid out by getAttackChoiceCoinPlan), or null when the attacker kept its coins.
   */
  espReflip?: CoinFlipResult[] | null;
  /** Charity (attached to the attacker): how much the attacker reduced its damage to the Defending Pokémon (0 = none). */
  charityReduction?: number;
  /** Group Attack: ids of the deck cards the attacker put on its Bench before the damage (empty = none) */
  beforeDamageSearch?: string[];
  /**
   * Koga's Ninja Trick (attached to the Defending Pokémon), asked before anything of the attack,
   * its coins included: the Benched Pokémon its owner switched it with (it then defends for the
   * whole attack), or null when it stayed.
   */
  preAttack?: string | null;
};

/**
 * What to run again once a reaction is answered (see PendingAttackChoice.reaction): the attack
 * itself (`attackIndex`, or `copiedAttack` through Metronome, with its coins and options), the
 * Bench damage chosen by the attacker (pendingBenchDamageSelection), or an attack choice whose
 * damage went to a Benched Pokémon (ChooseTargetDamage).
 */
export type AttackResume =
  | { kind: "attack"; attackIndex: number; copiedAttack?: Attack; copySource?: string; options: ExecuteAttackOptions }
  | { kind: "benchDamage"; pending: NonNullable<GameState["pendingBenchDamageSelection"]>; selection: string[]; reactions: AttackReactions }
  | { kind: "attackChoice"; pending: PendingAttackChoice; selection: string[]; reactions: AttackReactions };

/** A pending attack choice (see GameState.pendingAttackChoice and lib/attackChoices.ts). */
export type PendingAttackChoice = {
  /** The attack effect waiting for the answer (its type says what the answer does); absent for a `reaction` */
  effect?: AttackEffect;
  /**
   * A question asked in the middle of the attack — a Pokémon Power (Flee, Bench Guard) or a
   * Trainer attached to the attacker (Sabrina's ESP, Charity): nothing of the attack (or of the
   * step in `resume`) has happened yet; answering it runs `resume` again with the answer.
   * `answers` = the AttackReactions entry the answer fills; `powerType` = the power asked (absent
   * for a Trainer); `powerName` = the power's or the Trainer's name; `pokemonId` / `side` = the
   * Pokémon it belongs to and its side in the attacker's view.
   */
  reaction?: {
    answers: keyof AttackReactions;
    powerType?: PokemonPowerType;
    powerName: string;
    pokemonId: string;
    side: "player" | "opponent";
    resume: AttackResume;
  };
  /**
   * Sabrina's ESP's question: the answer `option` re-flips `coins` (the attack's own coins) and
   * needs new coins from the caller, laid out as `plan` (getAttackChoiceCoinPlan →
   * flipAttackCoins → resolveAttackChoice's `coinResults`).
   */
  reflip?: { option: string; coins: CoinFlipResult[]; plan: AttackCoinPlan };
  /** The question; `chooser` = "self" (the attacker) or "opponent" (the defending side) */
  step: SelectionStep;
  /** What the attack left behind (attacker / defender ids, Knock Out, prevention...) */
  context: AttackChoiceContext;
  /** Prophecy: the deck chosen in its first step */
  deck?: "player" | "opponent";
  /** Multi-step choices (Magnetic Lines, Third Eye, Flame Pillar): the answer to the first step */
  picked?: string[];
  /** Choice effects of the same attack still to ask, in order */
  queue: AttackEffect[];
};

/**
 * The Stadium card in play (Gym Heroes): shared by both players; `playedBy` is relative like
 * every side of the state (swapSides flips it) and says whose discard pile it goes to when
 * another Stadium replaces it. Plain data (serialized by the API).
 */
export type StadiumInPlay = { card: GameCard; playedBy: "player" | "opponent" };

/**
 * One player who must return Benched Pokémon to the hand until `keep` are left (a Stadium
 * lowered the Bench limit below its size). See GameState.pendingBenchTrim.
 */
export type BenchTrim = { side: "player" | "opponent"; keep: number };

/** A timed "Pokémon Powers stop working" effect (see GameState.powersSuppressed). */
export type PowerSuppression = {
  /** Card or attack that caused it, for log messages ("Goop Gas Attack") */
  source: string;
  /** Only this Pokémon's power (undefined = every Pokémon in play, both sides) */
  pokemonId?: string;
  /** Last turn number during which it applies */
  expiresAfterTurn: number;
};

export type GameState = {
  playerDeck: GameCard[];
  playerHand: GameCard[];
  playerPrizes: GameCard[];
  playerDiscard: GameCard[];
  playerActivePokemon: PokemonInPlay | null;
  playerBench: PokemonInPlay[]; // Máximo maxBenchSize (5) Pokémon en la banca
  opponentDeck: GameCard[];
  opponentHand: GameCard[];
  opponentPrizes: GameCard[];
  opponentDiscard: GameCard[];
  opponentActivePokemon: PokemonInPlay | null;
  opponentBench: PokemonInPlay[];
  selectedDeckId: string | null;
  turnNumber: number;
  startingPlayer: "player" | "opponent" | null;
  isPlayerTurn: boolean;
  gameStarted: boolean;
  gamePhase: GamePhase;
  playerReady: boolean;
  opponentReady: boolean;
  energyAttachedThisTurn: boolean; // Solo se puede adjuntar una energía por turno
  retreatedThisTurn: boolean; // Solo se puede retirar una vez por turno
  playerCanTakePrize: boolean; // El jugador debe tomar premios (prizesOwed > 0)
  opponentCanTakePrize: boolean; // El oponente debe tomar premios
  /**
   * Prizes owed (0.10.2): one per opposing Pokémon Knocked Out, picked one by one with takePrize;
   * read it with `prizesOwed(state, side)` (absent with the flag set = 1). Set by checkKnockouts.
   */
  playerPrizesOwed?: number;
  opponentPrizesOwed?: number;
  playerNeedsToPromote: boolean; // El jugador necesita elegir un Pokémon de la banca para promover
  opponentNeedsToPromote: boolean; // El oponente necesita elegir un Pokémon de la banca para promover
  activeModifiers: GameModifier[]; // Modificadores activos (PlusPower, Defender, etc.)
  gameResult: GameResult; // Resultado del juego (victoria, derrota o null si aún no termina)
  events: GameEvent[]; // Registro de eventos del juego
  /** ForceSwitch (Lure, Whirlwind): player needs to pick an opponent bench Pokemon to bring forward */
  pendingForceSwitch?: boolean;
  /** SelfSwitch (Teleport): player needs to pick own bench Pokemon to switch with */
  pendingSelfSwitch?: boolean;
  /** Track which Pokemon have used their "once per turn" powers this turn (by Pokemon ID) */
  usedPowersThisTurn?: string[];
  /**
   * The acting side already attacked this turn (set by executeAttack/executeMetronome and a
   * failed confused attack; cleared when the turn passes). Blocks a second attack and any
   * other action while the turn waits for prizes/promotions. Kept in sync with match/types.ts.
   */
  attackedThisTurn?: boolean;
  /**
   * The last attack damage that landed on a Pokémon (the Defending Pokémon, or the one an attack
   * chose): final damage after Weakness / Resistance and modifiers, before the HP cap. Set on every
   * hit, never cleared; `seq` goes up by one per hit (consumers tell a new hit from an old one).
   */
  lastAttackHit?: AttackHit;
  /**
   * endTurn already ran the between-turns Pokémon Checkup for this turn number but stopped
   * before passing the turn (a prize to take or a Pokémon to promote). The next endTurn call
   * skips the checkup, so poison/sleep never apply twice. Cleared when the turn passes.
   * While set, the turn is over: no normal actions (getTurnActionBlocker).
   */
  checkupDoneOnTurn?: number;
  /** DeckSearch: player needs to search deck for Basic Pokemon matching filter */
  pendingDeckSearch?: {
    filter: {
      /** Exact name matches (e.g., ["Bellsprout"] or ["Nidoran♂", "Nidoran♀"]) */
      names?: string[];
      /** Pokemon type filter (e.g., "fighting" for Marowak) */
      type?: EnergyType;
      /** Always enforce Basic-only selection */
      basicOnly: true;
    };
  };
  /**
   * TypeShift (Venomoth Shift power): the player is choosing a type. Optional power UI:
   * it does NOT block endTurn (ending the turn cancels it). Kept in sync with domain/match/types.ts.
   */
  pendingTypeShift?: {
    /** Pokemon ID that will receive the type change */
    pokemonId: string;
    /** Available types to choose from (types of all Pokemon in play, excluding colorless) */
    availableTypes: EnergyType[];
  };
  /**
   * Peek (Mankey power): result being shown to the player. Informational only:
   * it does NOT block endTurn (ending the turn clears it).
   */
  pendingPeek?: {
    /** What was peeked at */
    peekType: "playerDeck" | "opponentDeck" | "opponentHand" | "playerPrize" | "opponentPrize";
    /** The card(s) that were peeked */
    revealedCards: GameCard[];
  };
  /**
   * Pokémon Powers stopped by a timed effect (Goop Gas Attack: every power; Dark Arbok's
   * Stare: one Pokémon). Read through isPowerActive / isPowerSuppressed. Muk's Toxic Gas is
   * derived from the board, not stored here. Entries are dropped by endTurn once
   * `expiresAfterTurn` has passed. Kept in sync with domain/match/types.ts.
   */
  powersSuppressed?: PowerSuppression[];
  /**
   * A choice an attack left to a player (Hyper Beam's Energy, Terror Strike's switch, Prophecy,
   * Wildfire, Energy Conversion, Scavenge...): see lib/attackChoices.ts. Answer with
   * resolveAttackChoice on the attacking side's view; `step.chooser` says who picks. Blocks
   * endTurn and every other action. Kept in sync with domain/match/types.ts (re-export).
   */
  pendingAttackChoice?: PendingAttackChoice;
  /**
   * A choice left by a Pokémon Power played from the hand (Summon Minions, Sneak Attack,
   * Reel In): see lib/powerChoices.ts. Belongs to the side whose turn it is; answer with
   * resolvePowerChoice on that side's view. Blocks endTurn and every other action.
   */
  pendingPowerChoice?: PendingPowerChoice;
  /**
   * Here Comes Team Rocket!: both players play with their Prize cards face up for the rest of
   * the game (read it with arePrizesRevealed; consumers must not hide the Prizes then).
   */
  prizesFaceUp?: boolean;
  /**
   * The Stadium in play (null / absent = none). Read it with getStadium / stadiumNamed; played
   * with playTrainerCard (playStadium). Kept in sync with domain/match/types.ts (re-export).
   */
  stadium?: StadiumInPlay | null;
  /** The side whose turn it is already played a Stadium this turn (one per turn); cleared when the turn passes. */
  stadiumPlayedThisTurn?: boolean;
  /**
   * Lt. Surge's Secret Plan: how many cards were put face down so far (the next placeholder id is
   * `face-down-<count + 1>`; ids never say what the card is). See domain/trainers/secret-plan.ts.
   */
  faceDownCount?: number;
  /**
   * A Stadium lowered the Bench limit below a Bench's size: each listed player, in order (the opponent of
   * whoever played it first), returns Benched Pokémon with all their cards to the hand until
   * `keep` are left. Answer the first entry with resolveBenchTrim (any view; normally that
   * player's own, where its side is "player"). Swapped by swapSides. Blocks endTurn and every
   * other action. Kept in sync with domain/match/types.ts (re-export).
   */
  pendingBenchTrim?: BenchTrim[];
  /** Prize cards each player set aside at the start (startGame's prizeCount, the larger side's when they differ; 6 when absent). */
  prizeCount?: number;
  /**
   * Cards each side draws for its opening hand and after a mulligan (startGame's `openingHand`;
   * 7 when absent). Relative: swapped by swapSides.
   */
  openingHandSize?: SidePair;
  /**
   * Adventure mode: each side's run passives that act in battle and the lucky coins already used
   * (domain/adventure/passives.ts). Relative: swapped by swapSides.
   */
  passives?: BattlePassives;
  /** Adventure battle modifiers read during play (`noPrizeFor`; domain/adventure/modifiers.ts). Relative: swapped by swapSides. */
  tableRules?: TableRules;
  /** Adventure battle modifiers consumed by applySetupRules once both players are ready (`bonusCards`). Relative: swapped by swapSides. */
  setupRules?: SetupRules;
  /**
   * Table type (absent = "standard"). "lucky-duel" (domain/lucky-duel): random Basic and deck,
   * Benches locked (maxBenchSize 0), no Prizes, a Knock Out of an Active ends the game and both
   * Actives Knocked Out at the same time is a draw (settleLuckyDuelDraw).
   */
  gameMode?: GameMode;
  /**
   * Lucky Duel: false while both Actives are still face down (MULLIGAN phase, from
   * initializeLuckyDuelGame); startPlayingPhase (the both-ready transition) sets it to true.
   * While false, consumers must hide BOTH Actives from everyone, their owners included.
   */
  luckyDuelRevealed?: boolean;
  /**
   * Headache (Psyduck): no Trainer cards can be played during this turn number (the opponent's
   * next turn). Dropped by endTurn once that turn is over.
   */
  noTrainersOnTurn?: number;
  /**
   * Recall (Gym Heroes): played during this turn number. While it equals `turnNumber`, the Active
   * Pokémon of the side whose turn it is may also use the attacks of the cards under it
   * (getAvailableAttacks: indices after its own attacks). Dropped by endTurn.
   */
  recallActiveOnTurn?: number;
  /**
   * Rocket's Secret Experiment (Gym Challenge) tails: each side's last turn number without Trainer
   * cards (getTrainerBlocker). Swapped by swapSides; dropped by endTurn once over.
   */
  trainerLockUntilTurn?: SideTurns;
  /**
   * Transparent Walls (Gym Challenge): each side's last turn number during which attack damage to
   * its Benched Pokémon is prevented (applyAttackDamageReductions). Swapped by swapSides; dropped
   * by endTurn once over.
   */
  benchProtectedUntilTurn?: SideTurns;
  /**
   * Tickling Machine (Gym Heroes): hands set aside face down, at most one pile per side (see
   * domain/trainers/set-aside.ts). endTurn puts a side's pile back into its hand at the end of its
   * turn `returnsAfterTurn`, before the between-turns checkup. Swapped by swapSides. Nobody may
   * look at these cards: consumers must mask them for BOTH players. Kept in sync with
   * domain/match/types.ts (re-export).
   */
  setAsideHands?: SetAsideHand[];
  /**
   * Misty's Duel (Gym Heroes): the Rock-Paper-Scissors in progress (domain/duel/rps.ts). Each side
   * answers with submitDuelPick (off-turn included); the other side's pick must be hidden until
   * both picked (maskDuelFor). Swapped by swapSides. Blocks endTurn and every other action. Kept
   * in sync with domain/match/types.ts (re-export).
   */
  pendingDuel?: PendingDuel;
  /**
   * Sabrina's Psychic Control (Gym Challenge) came up heads: the side whose turn it is may now play
   * this Trainer of the opponent's discard pile as if it were in its hand (the generic Trainer
   * flow with this `cardId`: canPlayTrainerCard / getTrainerSteps / playTrainerCard with
   * `borrowedFromOpponentDiscard`); the card stays in the opponent's discard pile. Every other
   * action waits (getTurnActionBlocker) until it is played or given up (declineBorrowedTrainer);
   * endTurn gives it up. Read on the acting side's view: not swapped by swapSides.
   */
  pendingBorrowedTrainer?: { cardId: string; cardName: string };
  /**
   * Chaos Gym (Gym Challenge) came up heads for this Trainer of the side whose turn it is (in its
   * hand, or the card pendingBorrowedTrainer names): it is now played normally with the generic
   * Trainer flow (its own coins and steps; no Chaos Gym coin again). Every other action waits
   * (getTurnActionBlocker); endTurn discards it unplayed. Read on the acting side's view: not
   * swapped by swapSides (effects/chaos-gym.ts).
   */
  pendingChaosGymPlay?: { cardId: string; cardName: string };
  /**
   * Chaos Gym came up tails for a Trainer that doesn't stay in play: it did nothing and is in its
   * owner's discard pile; the other player of the side whose turn it is (`offeredTo`) may use it
   * as if it were in its own hand. `owner` / `offeredTo` are relative sides (swapped by
   * swapSides). The offer is answered on the acting side's view (getChaosGymOfferStep, chooser
   * "opponent" → answerChaosGymOffer); once `accepted`, `offeredTo` plays it on its own view
   * with the generic Trainer flow, out of turn (or gives it up: declineChaosGymOffer). Blocks every
   * action of the acting side and endTurn (effects/chaos-gym.ts).
   */
  pendingChaosOffer?: ChaosGymOffer;
  /** Fuchsia City Gym (Gym Challenge): the turn number in which it was last used (once during each player's turn). */
  fuchsiaCityGymUsedOnTurn?: number;
  /**
   * Single-player: a Trainer the AI plays (the side whose turn it is) waits for the other
   * player's answer to one of its steps (`step.chooser: "opponent"`: Erika, Lt. Surge's Treaty,
   * Blaine's Quiz #1). The card stays in the AI's hand; `answerOpponentTrainerStep` (domain/ai)
   * goes on with the answer. `selections`: the answers so far; `coinResults`: coins flipped
   * before the steps. Not swapped by swapSides.
   */
  pendingOpponentTrainerStep?: {
    cardId: string;
    trainerName: string;
    selections: string[][];
    coinResults: CoinFlipResult[];
    step: SelectionStep;
  };
  /**
   * Misty's Duel: the last decisive round this turn (both picks, the winner; relative, swapped by
   * swapSides; public). Cleared by endTurn and when another duel starts.
   */
  lastDuel?: LastDuel;
  /** BenchDamage: player needs to select bench Pokemon to receive damage */
  pendingBenchDamageSelection?: {
    /** Amount of damage to deal to each selected Pokemon */
    damageAmount: number;
    /** Which side's bench to target */
    targetSide: "player" | "opponent";
    /** Maximum number of bench Pokemon to select */
    maxTargets: number;
    /** Minimum number of bench Pokemon to select (default 1) */
    minTargets?: number;
    /** Optional: only show Pokemon matching defender type (for Chain Lightning) */
    matchDefenderType?: boolean;
    /** Optional: defender types for filtering (Chain Lightning) */
    defenderTypes?: EnergyType[];
    /**
     * The attack Knocked Out the Defending Pokémon: its replacement comes after the bench
     * damage (every benched Pokémon can still be chosen). "auto": the AI's promotion choice;
     * "choose": opponentNeedsToPromote (skipDefenderPromotion).
     */
    promoteDefenderAfter?: "auto" | "choose";
  };
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Crea un nuevo evento de juego
 */
/** `state` with a new lastAttackHit by the player (the attacker of this view); unchanged when no damage landed. */
export function recordAttackHit(state: GameState, attackerName: string, attackName: string, damage: number): GameState {
  if (damage <= 0) return state;
  return {
    ...state,
    lastAttackHit: { attackerSide: "player", attackerName, attackName, damage, turn: state.turnNumber, seq: (state.lastAttackHit?.seq ?? 0) + 1 },
  };
}

export function createGameEvent(
  message: string,
  type: GameEvent["type"] = "info",
  cards?: LogCard[]
): GameEvent {
  return {
    id: `event-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    message,
    type,
    ...(cards && cards.length > 0 && { cards }),
  };
}

/** The log form of some cards: name + catalog image, no ids (see LogCard). */
export function toLogCards(cards: readonly GameCard[]): LogCard[] {
  return cards.map((card) => ({ name: card.name, imageUrl: getCatalogImageUrl(card) }));
}

/** Catalog card by name across all sets (see the set registry). */
export { findCardByName } from "@/domain/catalog";

/**
 * Mezcla un array usando el algoritmo Fisher-Yates
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Resultado de robar una carta
 */
type DrawCardResult = {
  success: boolean;
  newDeck: GameCard[];
  newHand: GameCard[];
  drawnCard: GameCard | null;
  deckOut: boolean;
};

/**
 * Roba una carta del mazo y la agrega a la mano
 * @returns Resultado con el nuevo estado del mazo y mano, o deckOut si no hay cartas
 */
export function drawCard(deck: GameCard[], hand: GameCard[]): DrawCardResult {
  if (deck.length === 0) {
    return {
      success: false,
      newDeck: deck,
      newHand: hand,
      drawnCard: null,
      deckOut: true,
    };
  }

  const drawnCard = deck[0];
  const newDeck = deck.slice(1);
  // Las cartas nuevas se agregan al inicio de la mano (lado izquierdo)
  const newHand = [drawnCard, ...hand];

  return {
    success: true,
    newDeck,
    newHand,
    drawnCard,
    deckOut: false,
  };
}

// ============================================================================
// STATUS CONDITIONS
// ============================================================================

export function hasStatusCondition(
  pokemon: PokemonInPlay,
  status: StatusCondition
): boolean {
  return pokemon.statusConditions?.includes(status) ?? false;
}

/**
 * Confusion (Base Set rule): if the attack coin flip is tails, the attack does nothing
 * and the confused Pokémon does 20 damage to itself (no weakness/resistance).
 * Shared by the AI executor and the consumers' coin-flip handlers.
 */
export const CONFUSION_SELF_DAMAGE = 20;

/**
 * Exclusive status conditions: Asleep, Confused, Paralyzed replace each other.
 * Poisoned is independent and can coexist with any of them.
 */
const EXCLUSIVE_STATUS_CONDITIONS: StatusCondition[] = [
  StatusCondition.Asleep,
  StatusCondition.Confused,
  StatusCondition.Paralyzed,
];

export function applyStatusCondition(
  pokemon: PokemonInPlay,
  status: StatusCondition,
  turnNumber?: number
): PokemonInPlay {
  const currentStatuses = pokemon.statusConditions ?? [];

  // Mysterious Fossil / Clefairy Doll can't be affected by Special Conditions
  if (isTrainerInPlay(pokemon.pokemon) && status !== StatusCondition.CannotAttack) {
    return pokemon;
  }

  if (currentStatuses.includes(status)) {
    return pokemon;
  }

  // Exclusive conditions: Asleep/Confused/Paralyzed replace each other
  let newStatuses: StatusCondition[];
  if (EXCLUSIVE_STATUS_CONDITIONS.includes(status)) {
    newStatuses = [
      ...currentStatuses.filter(s => !EXCLUSIVE_STATUS_CONDITIONS.includes(s)),
      status,
    ];
  } else {
    newStatuses = [...currentStatuses, status];
  }

  const updated: PokemonInPlay = {
    ...pokemon,
    statusConditions: newStatuses,
  };

  if (status === StatusCondition.Paralyzed && turnNumber !== undefined) {
    updated.paralyzedOnTurn = turnNumber;
  }

  // Clear paralyzedOnTurn if we're replacing paralysis with another exclusive condition
  // (Poisoned coexists with it: Needles' "Paralyzed and Poisoned" keeps the paralysis turn)
  if (status !== StatusCondition.Paralyzed && EXCLUSIVE_STATUS_CONDITIONS.includes(status) && currentStatuses.includes(StatusCondition.Paralyzed)) {
    updated.paralyzedOnTurn = undefined;
  }

  return updated;
}

export function removeStatusCondition(
  pokemon: PokemonInPlay,
  status: StatusCondition
): PokemonInPlay {
  if (!pokemon.statusConditions?.includes(status)) {
    return pokemon;
  }

  const updated: PokemonInPlay = {
    ...pokemon,
    statusConditions: pokemon.statusConditions.filter((s) => s !== status),
  };

  if (status === StatusCondition.Paralyzed) {
    updated.paralyzedOnTurn = undefined;
  }

  return updated;
}

export function clearAllStatusConditions(pokemon: PokemonInPlay): PokemonInPlay {
  return {
    ...pokemon,
    statusConditions: [],
    paralyzedOnTurn: undefined,
    // Toxic's 20-damage poison ends with the condition (a later Poison does 10)
    poisonDamage: undefined,
  };
}

/**
 * Apply CannotAttack status (from attacks like Rhyhorn's Leer)
 * This prevents the Pokemon from attacking during its next turn
 */
export function applyCannotAttack(
  pokemon: PokemonInPlay,
  currentTurnNumber: number
): PokemonInPlay {
  return applyStatusCondition(pokemon, StatusCondition.CannotAttack, currentTurnNumber);
}

export function canPokemonAttack(pokemon: PokemonInPlay): boolean {
  if (hasStatusCondition(pokemon, StatusCondition.Asleep)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.Paralyzed)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.CannotAttack)) return false;
  return true;
}

export function canPokemonRetreat(pokemon: PokemonInPlay): boolean {
  if (hasStatusCondition(pokemon, StatusCondition.Asleep)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.Paralyzed)) return false;
  return true;
}

// ============================================================================
// PROTECCIÓN (prevención de daño)
// ============================================================================

export function applyProtection(
  pokemon: PokemonInPlay,
  protectionType: ProtectionType,
  currentTurnNumber: number,
  threshold?: number
): PokemonInPlay {
  return {
    ...pokemon,
    protection: {
      type: protectionType,
      expiresAfterTurn: currentTurnNumber + 1,
      ...(threshold !== undefined && { threshold }),
    },
  };
}

export function isProtected(pokemon: PokemonInPlay): boolean {
  return !!pokemon.protection;
}

export function protectionBlocksDamage(pokemon: PokemonInPlay, damage?: number): boolean {
  if (!pokemon.protection) return false;
  // Threshold-based protection (e.g., Onix Harden): only blocks damage <= threshold
  if (pokemon.protection.threshold !== undefined && damage !== undefined) {
    return damage <= pokemon.protection.threshold;
  }
  // Full protection (no threshold): blocks all damage
  return true;
}

export function clearProtection(pokemon: PokemonInPlay): PokemonInPlay {
  if (!pokemon.protection) return pokemon;
  return {
    ...pokemon,
    protection: undefined,
  };
}

/**
 * Resets everything that ends when a Pokémon moves to the bench (retreat, Switch,
 * Whirlwind/Lure, Teleport...). Classic rule: moving to the bench removes ALL
 * special conditions, including Poison. Also clears protection and "next turn" effects.
 */
export function clearStatusConditionsOnRetreat(pokemon: PokemonInPlay): PokemonInPlay {
  return {
    ...pokemon,
    statusConditions: [],
    poisonDamage: undefined,
    paralyzedOnTurn: undefined,
    protection: undefined,
    // Clear all "next turn" attack effects when going to bench (per TCG rules)
    nextTurnBonusDamage: undefined,
    nextTurnDamageReduction: undefined,
    nextTurnEffectAppliedOnTurn: undefined,
    // Clear retreat prevention when going to bench
    retreatPrevented: undefined,
    retreatPreventedOnTurn: undefined,
    // Clear Destiny Bond when going to bench
    destinyBondActive: undefined,
    destinyBondTurn: undefined,
    // Clear Sand-Attack/SmokeScreen when going to bench
    mustFlipToAttack: undefined,
    mustFlipToAttackTurn: undefined,
    mirrorShellOnTurn: undefined,
    counterAttack: undefined,
    evadeOnFlip: undefined,
    attackLock: undefined,
    halveDamage: undefined,
    energyAttachBlockedOnTurn: undefined,
    lastAttack: undefined,
    intimidatedBy: undefined,
    doubledAttack: undefined,
    hpOverride: undefined,
  };
}

// ============================================================================
// RETREAT (RETIRADA)
// ============================================================================

/**
 * Verifica si un Pokémon puede retirarse
 * @param pokemon - El Pokémon activo que quiere retirarse
 * @param benchLength - Cantidad de Pokémon en la banca
 * @param retreatedThisTurn - Si ya se retiró este turno
 * @returns true si puede retirarse
 */
export function canRetreat(
  pokemon: PokemonInPlay,
  benchLength: number,
  retreatedThisTurn: boolean
): boolean {
  // No puede retirarse si ya lo hizo este turno
  if (retreatedThisTurn) return false;

  // No puede retirarse si no hay Pokémon en la banca
  if (benchLength === 0) return false;

  // No puede retirarse si está dormido o paralizado
  if (hasStatusCondition(pokemon, StatusCondition.Asleep)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.Paralyzed)) return false;

  // No puede retirarse si la retirada fue bloqueada (Acid)
  if (pokemon.retreatPrevented) return false;

  // Mysterious Fossil / Clefairy Doll: "can't retreat"
  if (isTrainerInPlay(pokemon.pokemon)) return false;

  return true;
}

/**
 * Returns how many energy units a single energy card provides.
 * Double Colorless Energy provides 2 colorless energy; all others provide 1.
 */
export function getEnergyValue(card: GameCard): number {
  // Buzzap energy provides 2 units of the chosen type
  if (card.buzzapSourceId) {
    return 2;
  }
  // Explicit amount on the card data (Rainbow / Full Heal / Potion Energy: 1)
  if (isEnergyCard(card) && card.provides !== undefined) {
    return card.provides;
  }
  // Double Colorless Energy provides 2 colorless
  // Check by name first (most reliable)
  if (card.name === "Double Colorless Energy") {
    return 2;
  }
  // Fallback: any non-basic colorless energy provides 2
  if (isEnergyCard(card) && card.energyType === EnergyTypeEnum.Colorless && !card.isBasic) {
    return 2;
  }
  return 1;
}

/**
 * Does this attached Energy card provide Energy of `type` (while in play)? Buzzap Energy
 * provides its chosen type; Rainbow Energy (`providesAllTypes`) every basic type; any other
 * Energy card its printed type. Use it for every "<type> Energy card attached" check (costs,
 * discard costs, Water Gun-style bonuses, Continuous Fireball, Energy Trans, Gather Fire...).
 * In the hand or the discard pile a Rainbow Energy is not a basic Energy card (isBasicEnergy).
 *
 * @param holder - the Pokémon the card is attached to, when known: Photosynthesis (Erika's
 *   Oddish, getEnergyTypeOverride) makes every Energy card attached to it provide Grass only.
 *   Pass the state with it (Toxic Gas stops the power).
 */
export function energyProvidesType(card: GameCard, type: EnergyType, holder?: PokemonInPlay | null, state?: GameState): boolean {
  const override = holder ? getEnergyTypeOverride(state, holder) : undefined;
  if (override && (isEnergyCard(card) || card.buzzapEnergyType)) return type === override;
  if (card.buzzapEnergyType) return card.buzzapEnergyType === type;
  if (!isEnergyCard(card)) return false;
  if (card.providesAllTypes) return type !== EnergyTypeEnum.Colorless;
  return card.energyType === type;
}

/**
 * Returns the total energy units provided by an array of energy cards,
 * accounting for Double Colorless Energy.
 */
export function getTotalEnergyValue(cards: GameCard[]): number {
  return cards.reduce((sum, card) => sum + getEnergyValue(card), 0);
}

/**
 * Verifica si el Pokémon tiene suficiente energía para pagar el coste de retirada
 * @param pokemon - El Pokémon activo
 * @returns true si tiene suficiente energía
 */
export function hasEnoughEnergyToRetreat(pokemon: PokemonInPlay, bench?: PokemonInPlay[], state?: GameState): boolean {
  if (pokemon.pokemon.kind !== CardKind.Pokemon) return false;
  const retreatCost = getRetreatCost(pokemon, bench, state);

  // Si el coste es 0, siempre puede retirarse
  if (retreatCost === 0) return true;

  // Verificar que tiene suficientes energías adjuntas (DCE cuenta como 2)
  return getTotalEnergyValue(pokemon.attachedEnergy) >= retreatCost;
}

/**
 * Obtiene el coste de retirada de un Pokémon
 * @param pokemon - El Pokémon
 * @returns El coste de retirada (0-5)
 */
export function getRetreatCost(pokemon: PokemonInPlay, bench?: PokemonInPlay[], state?: GameState): number {
  if (pokemon.pokemon.kind !== CardKind.Pokemon) return 0;
  // A transformed Ditto has the copied card's Retreat Cost
  let cost = (state ? getEffectivePokemonCard(state, pokemon)?.retreatCost : undefined) ?? pokemon.pokemon.retreatCost;
  if (bench) {
    cost = Math.max(0, cost - getRetreatCostReduction(bench, state));
  }
  // Sticky Goo (Dark Muk as the opposing Active): Retreat Aid first, then the extra cost
  cost += getRetreatCostIncrease(state, pokemon);
  // The Stadium in play (stadiums/rules.ts)
  return state ? Math.max(0, cost + stadiumRetreatModifier(state, pokemon)) : cost;
}

/**
 * Ejecuta la retirada de un Pokémon
 * @param gameState - Estado actual del juego
 * @param energyIdsToDiscard - IDs de las energías a descartar para pagar el coste
 * @param benchIndex - Índice del Pokémon de la banca que será el nuevo activo
 * @returns Nuevo estado del juego
 */
/**
 * Coins the side whose turn it is ("player") flips when its Active retreats: one per working
 * Sinkhole (Dark Dugtrio) of the opponent, in the opponent's Active-then-Bench order. Pass them
 * to executeRetreat as `coinResults` (the server flips them in multiplayer).
 */
export function getRetreatCoinFlips(state: GameState): number {
  return getRetreatDamageSources(state, "player").length;
}

/** Options of executeRetreat. */
export type RetreatOptions = {
  /**
   * Sinkhole coins (getRetreatCoinFlips, in order): tails = that Sinkhole does its damage to the
   * Pokémon that retreated. Omitted: the engine flips them itself (Math.random). A list of the
   * wrong length throws (a caller bug).
   */
  coinResults?: CoinFlipResult[];
};

export function executeRetreat(
  gameState: GameState,
  energyIdsToDiscard: string[],
  benchIndex: number,
  options: RetreatOptions = {}
): GameState {
  const activePokemon = gameState.playerActivePokemon;
  const benchPokemon = gameState.playerBench[benchIndex];

  // Validaciones
  // A normal action of the turn: not after attacking, not while a prize / promotion / pending effect waits
  const turnBlocker = getTurnActionBlocker(gameState);
  if (turnBlocker) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(turnBlocker, "info")],
    };
  }

  if (!activePokemon) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No hay Pokémon activo", "info")],
    };
  }

  if (!benchPokemon) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No hay Pokémon en esa posición de la banca", "info")],
    };
  }

  if (!canRetreat(activePokemon, gameState.playerBench.length, gameState.retreatedThisTurn)) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No puedes retirarte ahora", "info")],
    };
  }

  const retreatCost = getRetreatCost(activePokemon, gameState.playerBench, gameState);

  // Verificar que se están descartando la cantidad correcta de energías (DCE cuenta como 2)
  const discardCards = activePokemon.attachedEnergy.filter(e => energyIdsToDiscard.includes(e.id));
  const discardValue = getTotalEnergyValue(discardCards);
  if (discardValue < retreatCost) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(`Debes descartar energía equivalente a ${retreatCost}`, "info")],
    };
  }

  // Verificar que todas las energías a descartar existen en el Pokémon
  const energyIds = activePokemon.attachedEnergy.map(e => e.id);
  for (const id of energyIdsToDiscard) {
    if (!energyIds.includes(id)) {
      return {
        ...gameState,
        events: [...gameState.events, createGameEvent("Energía inválida seleccionada", "info")],
      };
    }
  }

  // Separar las energías: las que se descartan y las que se quedan
  const energiesToDiscard = activePokemon.attachedEnergy.filter(e => energyIdsToDiscard.includes(e.id));
  const remainingEnergy = activePokemon.attachedEnergy.filter(e => !energyIdsToDiscard.includes(e.id));

  // Limpiar todos los estados especiales del Pokémon que se retira (incluido veneno)
  const retreatingPokemon = clearStatusConditionsOnRetreat(activePokemon);

  // Crear el nuevo Pokémon en banca (el que estaba activo)
  // Clear Conversion effects (modifiedWeakness/modifiedResistance) when leaving active
  const pokemonGoingToBench: PokemonInPlay = {
    ...retreatingPokemon,
    attachedEnergy: remainingEnergy,
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  // Crear nueva banca: remover el que pasa a activo y agregar el que se retira
  const newBench = [...gameState.playerBench];
  newBench.splice(benchIndex, 1); // Remover el que pasa a activo
  newBench.push(pokemonGoingToBench); // Agregar el que se retira al final

  // Crear eventos
  const events = [
    ...gameState.events,
    createGameEvent(
      `${activePokemon.pokemon.name} se retiró${retreatCost > 0 ? ` (descartó ${retreatCost} energía${retreatCost > 1 ? "s" : ""})` : ""}`,
      "action"
    ),
    createGameEvent(
      `${benchPokemon.pokemon.name} es ahora tu Pokémon activo`,
      "info"
    ),
  ];

  // Sinkhole (Dark Dugtrio): the retreating player flips once per working Sinkhole of the opponent
  const sinkholes = getRetreatDamageSources(gameState, "player");
  if (options.coinResults && options.coinResults.length !== sinkholes.length) {
    throw new Error(`executeRetreat: needs ${sinkholes.length} coin result(s) (getRetreatCoinFlips), got ${options.coinResults.length}`);
  }
  let retreated = pokemonGoingToBench;
  sinkholes.forEach((source, i) => {
    const coin: CoinFlipResult = options.coinResults?.[i] ?? (Math.random() < 0.5 ? "heads" : "tails");
    const power = isPokemonCard(source.pokemon) ? source.pokemon.power : undefined;
    const powerName = power?.name ?? "Socavón";
    events.push(createGameEvent(`${powerName} de ${source.pokemon.name} - Moneda: [coin:${coin}]`, "info"));
    if (coin === "tails") {
      const amount = power?.amount ?? 20;
      retreated = { ...retreated, currentDamage: (retreated.currentDamage ?? 0) + amount };
      events.push(createGameEvent(`${powerName}: ${retreated.pokemon.name} recibió ${amount} de daño`, "action"));
    }
  });
  const finalBench = sinkholes.length > 0 ? newBench.map((p) => (p === pokemonGoingToBench ? retreated : p)) : newBench;

  // The new Active may change what a transformed Ditto copies (Knock Out if its new HP is too low);
  // Sinkhole can Knock Out the Pokémon that retreated (a Benched Pokémon now)
  return checkKnockouts({
    ...gameState,
    playerActivePokemon: benchPokemon,
    playerBench: finalBench,
    playerDiscard: [...gameState.playerDiscard, ...energiesToDiscard],
    retreatedThisTurn: true,
    events,
  });
}

/** Options of the resolvers of an attack's pending choice (switch, deck search, bench damage...). */
export type PendingResolutionOptions = {
  /** Don't call endTurn once resolved (callers that swap perspective end the turn themselves). */
  skipEndTurn?: boolean;
  /** Answers of the powers asked while resolving it (Bench Guard), set when resolveAttackChoice resumes it */
  reactions?: AttackReactions;
  /**
   * resolveAttackChoice only: the coins the answer needs, flipped by the caller (the server in
   * multiplayer) as getAttackChoiceCoinPlan(state, selection) lays them out — Sabrina's ESP's
   * re-flip. Ignored for answers that need none.
   */
  coinResults?: CoinFlipResult[];
};

// ============================================================================
// POWERS ASKED IN THE MIDDLE OF AN ATTACK (Gym Heroes: Flee, Bench Guard)
// ============================================================================

/** One Benched Pokémon an attack damaged and the damage done to it. */
export type BenchHit = { id: string; damage: number };

/**
 * Bench Guard (Brock's Rhydon) on the Bench of `side` (attacker's view) for the Benched Pokémon an
 * attack damaged (`hits`): the working guard and the hits it may take `amount` (10) of — another
 * Benched Pokémon that took at least that much. null when there's nothing to ask.
 */
export function benchGuardFor(
  state: GameState,
  side: "player" | "opponent",
  hits: BenchHit[]
): { guard: PokemonInPlay; powerName: string; amount: number; eligible: BenchHit[] } | null {
  const guard = getBenchGuard(state, side === "player" ? state.playerBench : state.opponentBench);
  if (!guard || !isPokemonCard(guard.pokemon) || !guard.pokemon.power) return null;
  const amount = guard.pokemon.power.amount ?? 10;
  const eligible = hits.filter((h) => h.id !== guard.pokemon.id && h.damage >= amount);
  return eligible.length > 0 ? { guard, powerName: guard.pokemon.power.name, amount, eligible } : null;
}

/** Bench Guard's question for the guard's owner (`side` in the attacker's view, who also built it). */
export function benchGuardStep(
  state: GameState,
  side: "player" | "opponent",
  found: NonNullable<ReturnType<typeof benchGuardFor>>
): SelectionStep {
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  const hit = found.eligible.map((h) => ({ hit: h, pokemon: bench.find((p) => p.pokemon.id === h.id)! })).filter((x) => !!x.pokemon);
  const guardName = found.guard.pokemon.name;
  const ask = `Elige los Pokémon de tu Banca de los que ${guardName} recibe ${found.amount} de daño en su lugar`;
  return {
    title: found.powerName,
    description: side === "player" ? `Puedes usar ${found.powerName}. ${ask}` : `Tu rival puede usar ${found.powerName} de ${guardName}`,
    ...(side === "opponent" && { answererDescription: `Puedes usar ${found.powerName}. ${ask}` }),
    options: hit.map(({ hit: h, pokemon }) => ({ id: h.id, label: `${pokemon.pokemon.name} (${h.damage} de daño)` })),
    maxSelections: hit.length,
    minSelections: 0,
    thumbnails: hit.map(({ pokemon }) => pokemon.pokemon),
    disableAutoSelect: true,
    chooser: side === "player" ? "self" : "opponent",
    // Answer clock: the power isn't used
    defaultSelection: [],
  };
}

/**
 * Bench Guard's answer on a Bench (pure): each chosen Benched Pokémon gives `amount` of the damage
 * it just took to the guard. Returns the Bench and the names of the Pokémon it helped.
 */
export function applyBenchGuard(bench: PokemonInPlay[], guardId: string, amount: number, chosen: string[]): { bench: PokemonInPlay[]; helped: string[] } {
  const helped: string[] = [];
  const moved = bench.map((p) => {
    if (p.pokemon.id === guardId || !chosen.includes(p.pokemon.id)) return p;
    helped.push(p.pokemon.name);
    const left = (p.lastDamageReceived ?? amount) - amount;
    return { ...p, currentDamage: Math.max(0, (p.currentDamage ?? 0) - amount), lastDamageReceived: left > 0 ? left : undefined };
  });
  const total = amount * helped.length;
  return {
    bench: total === 0 ? moved : moved.map((p) => (p.pokemon.id === guardId ? { ...p, currentDamage: (p.currentDamage ?? 0) + total } : p)),
    helped,
  };
}

/** The context of a power asked mid-attack (nothing of the attack has happened yet). */
export function reactionContext(attacker: PokemonInPlay, defender: PokemonInPlay, attackName: string, state: GameState): AttackChoiceContext {
  return {
    attackName,
    attackerId: attacker.pokemon.id,
    defenderId: defender.pokemon.id,
    defenderKnockedOut: false,
    defenderBlocksEffects: false,
    discardIdsBefore: state.playerDiscard.map((c) => c.id),
  };
}

const STATUS_NAMES_ES: Partial<Record<string, string>> = {
  [StatusCondition.Asleep]: "Dormido",
  [StatusCondition.Confused]: "Confundido",
  [StatusCondition.Paralyzed]: "Paralizado",
  [StatusCondition.Poisoned]: "Envenenado",
};

/**
 * Whether an effect of `by` can't take an attached Energy card off `pokemon`: Brock's Protection
 * stops the opponent's attacks and Trainers (discard, to the hand or deck, move), not Pokémon
 * Powers nor its owner's own effects. Asked by every attack / Trainer path that takes an
 * opponent's attached Energy: Energy Removal, Super Energy Removal, Super Removal, the Defending
 * Pokémon's Energy discards (Hyper Beam, Whirlpool...) and moves (MoveDefenderEnergyToBench).
 */
export function energyRemovalBlocked(_state: GameState, pokemon: PokemonInPlay, by: "opponent"): boolean {
  return by === "opponent" && !!attachedTrainerNamed(pokemon, BROCKS_PROTECTION);
}

/**
 * Koga's Ninja Trick: the defending side's question before the attack (attacker's view), or null
 * when its Active has no Ninja Trick or its Bench is empty. See getAttackPreReaction.
 */
function ninjaTrickStep(state: GameState, attackName: string): SelectionStep | null {
  const active = state.opponentActivePokemon;
  const bench = state.opponentBench;
  if (!active || bench.length === 0 || !attachedTrainerNamed(active, KOGAS_NINJA_TRICK)) return null;
  const name = active.pokemon.name;
  return {
    title: KOGAS_NINJA_TRICK,
    description: `Tu rival puede usar ${KOGAS_NINJA_TRICK}: cambiar a ${name} por 1 de sus Pokémon en la Banca antes de ${attackName}`,
    answererDescription: `Tu rival va a usar ${attackName}. Puedes cambiar a ${name} por 1 de tus Pokémon en la Banca: ese Pokémon recibe el ataque y ${KOGAS_NINJA_TRICK} se descarta`,
    options: bench.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name })),
    maxSelections: 1,
    minSelections: 0,
    thumbnails: bench.map((p) => p.pokemon),
    disableAutoSelect: true,
    chooser: "opponent",
    // Answer clock: no switch
    defaultSelection: [],
  };
}

/**
 * The question asked before the attack `attack` (an index of getAvailableAttacks, or the Attack
 * copied by Metronome) does anything, its coins included: Koga's Ninja Trick attached to the
 * Defending Pokémon (chooser "opponent", `defaultSelection` [] = no switch). While it is non-null,
 * executeAttack / executeMetronome with `{ coinResults }` ignore the coins and return the state
 * untouched with the question as `pendingAttackChoice.reaction` (`answers: "preAttack"`): callers
 * flip nothing until it is answered, then flip getAttackChoiceCoinPlan(state, selection) — the coin
 * plan against the Pokémon that will defend — and pass them to resolveAttackChoice, which runs the
 * attack. Asked after the attacker's Confusion flip (resolveConfusionFlip comes first).
 */
export function getAttackPreReaction(state: GameState, attack: number | Attack): SelectionStep | null {
  const attacker = state.playerActivePokemon;
  const resolved = attacker ? (typeof attack === "number" ? attackAt(state, attacker, attack) : attack) : undefined;
  return resolved ? ninjaTrickStep(state, resolved.name) : null;
}

/**
 * Koga's Ninja Trick used (attacker's view): the Defending Pokémon switches with the Benched
 * Pokémon `benchedId` (Special Conditions and attack effects end as with Switch) and Ninja Trick
 * goes to its owner's discard pile. Same state when there is nothing to switch (already done).
 */
export function applyNinjaTrickSwitch(state: GameState, benchedId: string): GameState {
  const active = state.opponentActivePokemon;
  const index = state.opponentBench.findIndex((p) => p.pokemon.id === benchedId);
  if (!active || index === -1 || !attachedTrainerNamed(active, KOGAS_NINJA_TRICK)) return state;
  const incoming = state.opponentBench[index];
  const leaving = benchedLeavers(active);
  const toBench: PokemonInPlay = {
    ...clearStatusConditionsOnRetreat(active),
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
    attachedTrainers: (active.attachedTrainers ?? []).filter((c) => !leaving.includes(c)),
  };
  return {
    ...state,
    opponentActivePokemon: incoming,
    opponentBench: [...state.opponentBench.filter((_, i) => i !== index), toBench],
    opponentDiscard: [...state.opponentDiscard, ...leaving.map(cardOutOfPlay)],
    events: [
      ...state.events,
      createGameEvent(`${KOGAS_NINJA_TRICK}: ${active.pokemon.name} se cambió con ${incoming.pokemon.name}`, "action"),
      createGameEvent(`${KOGAS_NINJA_TRICK} se descartó`, "info"),
    ],
  };
}

/**
 * Koga's Ninja Trick on a Benched Pokémon (it went to the Bench: retreat, Switch, a forced
 * switch...) is discarded. Run by checkKnockouts. Same object when nothing changes.
 */
function discardBenchedNinjaTricks(state: GameState): GameState {
  const has = (bench: PokemonInPlay[]) => bench.some((p) => benchedLeavers(p).length > 0);
  if (!has(state.playerBench) && !has(state.opponentBench)) return state;
  const events = [...state.events];
  const sweep = (bench: PokemonInPlay[], discard: GameCard[]) => {
    const out: GameCard[] = [];
    const kept = bench.map((p) => {
      const leaving = benchedLeavers(p);
      if (leaving.length === 0) return p;
      out.push(...leaving);
      for (const c of leaving) events.push(createGameEvent(`${c.name} unido a ${p.pokemon.name} se descartó`, "info"));
      return { ...p, attachedTrainers: (p.attachedTrainers ?? []).filter((c) => !leaving.includes(c)) };
    });
    return { bench: kept, discard: out.length > 0 ? [...discard, ...out] : discard };
  };
  const player = sweep(state.playerBench, state.playerDiscard);
  const opponent = sweep(state.opponentBench, state.opponentDiscard);
  return {
    ...state,
    playerBench: player.bench,
    playerDiscard: player.discard,
    opponentBench: opponent.bench,
    opponentDiscard: opponent.discard,
    events,
  };
}

/**
 * Stop before an attack (or the step in `resume`) does anything: `state` is returned as it was
 * given, with the power's question as the pending attack choice. resolveAttackChoice runs
 * `resume` again with the answer.
 */
export function pauseForReaction(
  state: GameState,
  reaction: NonNullable<PendingAttackChoice["reaction"]>,
  step: SelectionStep,
  context: AttackChoiceContext,
  reflip?: PendingAttackChoice["reflip"]
): GameState {
  const who = step.chooser === "opponent" ? "el defensor" : "el atacante";
  return {
    ...state,
    pendingAttackChoice: { step, context, queue: [], reaction, ...(reflip && { reflip }) },
    events: [...state.events, createGameEvent(`${reaction.powerName}: ${who} debe elegir`, "info")],
  };
}

/** Sabrina's ESP's answer that re-flips the coins (its other answer, "keep", keeps them). */
export const ESP_REFLIP_OPTION = "reflip";

/** Sabrina's ESP's question to the attacker, with the attack's own coins (`coins`). */
function espReflipStep(attackName: string, coins: CoinFlipResult[]): SelectionStep {
  const heads = coins.filter((c) => c === "heads").length;
  const tails = coins.length - heads;
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return {
    title: "¿Volver a lanzar las monedas?",
    description: `${SABRINAS_ESP}: en ${attackName} salieron ${count(heads, "cara", "caras")} y ${count(tails, "cruz", "cruces")}. Puedes volver a lanzar todas las monedas una vez`,
    options: [
      { id: "keep", label: "Quedarse con estas monedas" },
      { id: ESP_REFLIP_OPTION, label: "Volver a lanzarlas todas" },
    ],
    maxSelections: 1,
    disableAutoSelect: true,
    chooser: "self",
    // Answer clock: the coins stay
    defaultSelection: ["keep"],
  };
}

/**
 * Charity's question to the attacker: by how much to reduce the `damage` it does to the Defending
 * Pokémon — any amount "rounded to the nearest 10": 0, 10, … up to the whole damage (option id =
 * the amount).
 */
function charityStep(attackerName: string, defenderName: string, damage: number): SelectionStep {
  const amounts = Array.from({ length: Math.ceil(damage / 10) + 1 }, (_, i) => i * 10);
  return {
    title: CHARITY,
    description: `${attackerName} hace ${damage} de daño a ${defenderName}. Puedes reducir ese daño en la cantidad que quieras (de 10 en 10)`,
    options: amounts.map((amount) => ({
      id: String(amount),
      label: amount === 0 ? `No reducir (${damage} de daño)` : `Reducir ${amount} (${Math.max(0, damage - amount)} de daño)`,
    })),
    maxSelections: 1,
    disableAutoSelect: true,
    chooser: "self",
    // Answer clock: no reduction
    defaultSelection: ["0"],
  };
}

/** The attack is complete once its pending choice is resolved: end the turn unless told not to. */
function finishPendingStep(state: GameState, options: PendingResolutionOptions): GameState {
  return options.skipEndTurn ? state : endTurn(state);
}

/**
 * Applies a ForceSwitch: opponent's active goes to bench, selected bench Pokemon becomes active.
 * Called after executeAttack when pendingForceSwitch is true.
 * Similar to Gust of Wind but triggered by an attack effect.
 */
export function applyForceSwitch(gameState: GameState, benchIndex: number, options: PendingResolutionOptions = {}): GameState {
  const opponentActive = gameState.opponentActivePokemon;
  const targetBench = gameState.opponentBench[benchIndex];

  if (!opponentActive || !targetBench) {
    return {
      ...gameState,
      pendingForceSwitch: undefined,
      events: [...gameState.events, createGameEvent("No se pudo realizar el cambio forzado", "info")],
    };
  }

  // Clear status/effects from the Pokemon going to bench
  const goingToBench: PokemonInPlay = {
    ...clearStatusConditionsOnRetreat(opponentActive),
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  const newBench = [...gameState.opponentBench];
  newBench.splice(benchIndex, 1);
  newBench.push(goingToBench);

  const events = [
    ...gameState.events,
    createGameEvent(`${opponentActive.pokemon.name} fue enviado a la banca del rival`, "action"),
    createGameEvent(`${targetBench.pokemon.name} es ahora el Pokémon activo del rival`, "info"),
  ];

  const newState: GameState = {
    ...gameState,
    opponentActivePokemon: targetBench,
    opponentBench: newBench,
    pendingForceSwitch: undefined,
    events,
  };

  // Now end the turn (attack is complete)
  return finishPendingStep(newState, options);
}

/**
 * Applies a SelfSwitch: attacker switches with own bench Pokemon.
 * Called after executeAttack when pendingSelfSwitch is true.
 * Used by Exeggutor's Teleport.
 */
export function applySelfSwitch(gameState: GameState, benchIndex: number, options: PendingResolutionOptions = {}): GameState {
  const playerActive = gameState.playerActivePokemon;
  const targetBench = gameState.playerBench[benchIndex];

  if (!playerActive || !targetBench) {
    return {
      ...gameState,
      pendingSelfSwitch: undefined,
      events: [...gameState.events, createGameEvent("No se pudo realizar el cambio", "info")],
    };
  }

  // Clear effects when going to bench (like retreat)
  const goingToBench: PokemonInPlay = {
    ...clearStatusConditionsOnRetreat(playerActive),
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  const newBench = [...gameState.playerBench];
  newBench.splice(benchIndex, 1);
  newBench.push(goingToBench);

  const events = [
    ...gameState.events,
    createGameEvent(`${playerActive.pokemon.name} se cambió con ${targetBench.pokemon.name}`, "action"),
  ];

  const newState: GameState = {
    ...gameState,
    playerActivePokemon: targetBench,
    playerBench: newBench,
    pendingSelfSwitch: undefined,
    events,
  };

  // Now end the turn (attack is complete)
  return finishPendingStep(newState, options);
}

/**
 * Skips a pending ForceSwitch or SelfSwitch (when there are no valid targets)
 * and ends the turn normally.
 */
export function skipPendingSwitch(gameState: GameState, options: PendingResolutionOptions = {}): GameState {
  return finishPendingStep({
    ...gameState,
    pendingForceSwitch: undefined,
    pendingSelfSwitch: undefined,
  }, options);
}

/**
 * Executes a DeckSearch: player searches deck for a Basic Pokemon matching the filter.
 * Called after executeAttack when pendingDeckSearch is set.
 * Used by "Call for Family" attacks (Bellsprout, Oddish, Nidorina, Marowak).
 *
 * @param gameState - Current game state
 * @param selectedCardId - ID of the selected Pokemon card (null to skip selection)
 * @returns New game state with Pokemon added to bench and deck shuffled
 */
export function executeDeckSearch(
  gameState: GameState,
  selectedCardId: string | null,
  options: PendingResolutionOptions = {}
): GameState {
  const filter = gameState.pendingDeckSearch?.filter;

  if (!filter) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("No hay búsqueda pendiente", "info")],
    };
  }

  // If no card selected, just shuffle and end turn
  if (!selectedCardId) {
    const shuffledDeck = shuffle([...gameState.playerDeck]);
    const events = [
      ...gameState.events,
      createGameEvent("No seleccionaste ningún Pokémon. Se mezcló el mazo", "info"),
    ];

    const newState: GameState = {
      ...gameState,
      playerDeck: shuffledDeck,
      pendingDeckSearch: undefined,
      events,
    };

    return finishPendingStep(newState, options);
  }

  // Find the selected card in deck
  const selectedCard = gameState.playerDeck.find(c => c.id === selectedCardId);

  if (!selectedCard) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("Carta no encontrada en el mazo", "info")],
    };
  }

  // Validate card matches filter
  if (selectedCard.kind !== CardKind.Pokemon) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("La carta seleccionada no es un Pokémon", "info")],
    };
  }

  if (selectedCard.stage !== PokemonStage.Basic) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("Solo puedes seleccionar Pokémon Básicos", "info")],
    };
  }

  // Check name filter
  if (filter.names && filter.names.length > 0) {
    if (!filter.names.includes(selectedCard.name)) {
      return {
        ...gameState,
        pendingDeckSearch: undefined,
        events: [...gameState.events, createGameEvent(`Solo puedes seleccionar: ${filter.names.join(" o ")}`, "info")],
      };
    }
  }

  // Check type filter
  if (filter.type) {
    if (!selectedCard.types.includes(filter.type)) {
      return {
        ...gameState,
        pendingDeckSearch: undefined,
        events: [...gameState.events, createGameEvent(`Solo puedes seleccionar Pokémon de tipo ${filter.type}`, "info")],
      };
    }
  }

  // Check if bench is full
  const benchCount = gameState.playerBench.filter(p => p !== null).length;
  if (benchCount >= maxBenchSize(gameState, "player")) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("Tu banca está llena", "info")],
    };
  }

  // Remove card from deck
  const newDeck = gameState.playerDeck.filter(c => c.id !== selectedCardId);

  // Shuffle deck
  const shuffledDeck = shuffle(newDeck);

  // Create PokemonInPlay
  const newPokemonInPlay: PokemonInPlay = {
    pokemon: selectedCard,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: [],
    statusConditions: [],
    currentDamage: 0,
    playedOnTurn: gameState.turnNumber,
  };

  // Add to bench
  const newBench = [...gameState.playerBench, newPokemonInPlay];

  const events = [
    ...gameState.events,
    createGameEvent(`Encontraste ${selectedCard.name} y lo colocaste en tu banca`, "action"),
    createGameEvent("Se mezcló el mazo", "info"),
  ];

  const newState: GameState = {
    ...gameState,
    playerDeck: shuffledDeck,
    playerBench: newBench,
    pendingDeckSearch: undefined,
    events,
  };

  // End turn after deck search completes
  return finishPendingStep(newState, options);
}

/**
 * After the bench damage of an attack that Knocked Out the Defending Pokémon
 * (`promoteDefenderAfter`): its owner promotes from what is left on the Bench.
 */
function promoteDefenderAfterBenchDamage(state: GameState, mode: "auto" | "choose" | undefined): GameState {
  if (!mode || state.gameResult !== null || state.opponentActivePokemon || state.opponentBench.length === 0) return state;
  if (mode === "choose") {
    return {
      ...state,
      opponentNeedsToPromote: true,
      events: [...state.events, createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")],
    };
  }
  const index = chooseAutoPromotion(state);
  const promoted = state.opponentBench[index];
  return {
    ...state,
    opponentActivePokemon: promoted,
    opponentBench: state.opponentBench.filter((_, i) => i !== index),
    events: [...state.events, createGameEvent(`${promoted.pokemon.name} pasa a ser el Pokémon activo del rival`, "info")],
  };
}

/**
 * Execute bench damage on selected Pokemon
 * @param gameState Current game state with pendingBenchDamageSelection
 * @param selectedPokemonIds Array of Pokemon IDs to receive damage (empty array = skip/cancel)
 * @returns New game state with damage applied and pending cleared
 */
export function executeBenchDamage(
  gameState: GameState,
  selectedPokemonIds: string[],
  options: PendingResolutionOptions = {}
): GameState {
  const pending = gameState.pendingBenchDamageSelection;

  if (!pending) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No hay daño de banca pendiente", "info")],
    };
  }

  const { damageAmount, targetSide, maxTargets, minTargets = 1 } = pending;

  // If no selection (cancel), just clear pending and end turn
  if (selectedPokemonIds.length === 0) {
    const events = [
      ...gameState.events,
      createGameEvent("No seleccionaste ningún Pokémon", "info"),
    ];

    const newState: GameState = {
      ...gameState,
      pendingBenchDamageSelection: undefined,
      events,
    };

    return finishPendingStep(promoteDefenderAfterBenchDamage(newState, pending.promoteDefenderAfter), options);
  }

  // Validate selection count
  if (selectedPokemonIds.length < minTargets) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(`Debes seleccionar al menos ${minTargets} Pokémon`, "info")],
    };
  }

  if (selectedPokemonIds.length > maxTargets) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(`No puedes seleccionar más de ${maxTargets} Pokémon`, "info")],
    };
  }

  // Apply damage to selected Pokemon
  const events = [...gameState.events];
  let newPlayerBench = [...gameState.playerBench];
  let newOpponentBench = [...gameState.opponentBench];
  // Strikes Back (Machamp) of a chosen Benched Pokémon: damage to the attacker (no W/R)
  let strikesBack = 0;
  const hits: BenchHit[] = [];
  const attackerNow = gameState.playerActivePokemon;

  if (targetSide === "opponent") {
    newOpponentBench = newOpponentBench.map((p) => {
      if (!p || !selectedPokemonIds.includes(p.pokemon.id)) return p;

      const dealt = applyAttackDamageReductions(p, Math.max(0, damageAmount - attachedDefenderReduction(gameState, p)), gameState, attackerNow);
      hits.push({ id: p.pokemon.id, damage: dealt });
      const newDamage = (p.currentDamage || 0) + dealt;
      events.push(
        createGameEvent(
          `${p.pokemon.name} del rival recibió ${dealt} de daño`,
          "action"
        )
      );
      const reaction = dealt > 0 && gameState.playerActivePokemon ? getDamageReaction(p, false, gameState) : null;
      if (reaction) {
        strikesBack += reaction.reactionDamage;
        events.push(createGameEvent(`¡${reaction.powerName}! ${p.pokemon.name} contraataca con ${reaction.reactionDamage} de daño desde la banca`, "action"));
      }

      return {
        ...p,
        currentDamage: newDamage,
      };
    });
  } else {
    newPlayerBench = newPlayerBench.map((p) => {
      if (!p || !selectedPokemonIds.includes(p.pokemon.id)) return p;

      const dealt = applyAttackDamageReductions(p, Math.max(0, damageAmount - attachedDefenderReduction(gameState, p)), gameState, attackerNow);
      hits.push({ id: p.pokemon.id, damage: dealt });
      const newDamage = (p.currentDamage || 0) + dealt;
      events.push(
        createGameEvent(
          `Tu ${p.pokemon.name} recibió ${dealt} de daño`,
          "action"
        )
      );

      return {
        ...p,
        currentDamage: newDamage,
      };
    });
  }

  // Bench Guard (Brock's Rhydon) on the damaged Bench: asked before the damage is done
  const damagedBench = targetSide === "opponent" ? newOpponentBench : newPlayerBench;
  const guard = benchGuardFor(targetSide === "opponent" ? { ...gameState, opponentBench: damagedBench } : { ...gameState, playerBench: damagedBench }, targetSide, hits);
  if (guard) {
    const chosen = options.reactions?.benchGuard?.[targetSide];
    if (chosen === undefined) {
      const viewWithHits = targetSide === "opponent" ? { ...gameState, opponentBench: damagedBench } : { ...gameState, playerBench: damagedBench };
      const active = gameState.playerActivePokemon ?? damagedBench[0];
      const defending = gameState.opponentActivePokemon ?? active;
      return pauseForReaction(
        { ...gameState, pendingBenchDamageSelection: undefined },
        {
          answers: "benchGuard",
          powerType: PokemonPowerType.RedirectBenchDamage,
          powerName: guard.powerName,
          pokemonId: guard.guard.pokemon.id,
          side: targetSide,
          resume: { kind: "benchDamage", pending, selection: selectedPokemonIds, reactions: options.reactions ?? {} },
        },
        benchGuardStep(viewWithHits, targetSide, guard),
        reactionContext(active, defending, guard.powerName, gameState)
      );
    }
    const guarded = applyBenchGuard(damagedBench, guard.guard.pokemon.id, guard.amount, chosen.filter((id) => guard.eligible.some((h) => h.id === id)));
    if (targetSide === "opponent") newOpponentBench = guarded.bench;
    else newPlayerBench = guarded.bench;
    if (guarded.helped.length > 0) {
      events.push(createGameEvent(`${guard.powerName}: ${guard.guard.pokemon.name} recibió ${guard.amount * guarded.helped.length} del daño de ${guarded.helped.join(", ")}`, "action"));
    }
  }

  // The attack may already have knocked out an Active: a bench KO can leave a side with
  // no Pokémon at all (Spark KOs the Active, then the last benched Pokémon). Strikes Back can
  // Knock Out the attacker (checkKnockouts: bench KOs first, then the Actives)
  const attacker = gameState.playerActivePokemon;
  const newState = promoteDefenderAfterBenchDamage(endGameIfNoPokemonLeft(checkKnockouts({
    ...gameState,
    playerActivePokemon: attacker && strikesBack > 0 ? { ...attacker, currentDamage: (attacker.currentDamage || 0) + strikesBack } : attacker,
    playerBench: newPlayerBench,
    opponentBench: newOpponentBench,
    pendingBenchDamageSelection: undefined,
    events,
  })), pending.promoteDefenderAfter);

  // The last prize may have been taken by a bench KO
  if (newState.gameResult !== null) {
    return newState;
  }

  // End turn after damage is applied
  return finishPendingStep(newState, options);
}

/**
 * Does the Knock Out of `pokemon` (of `owner`) give a Prize? givesPrizeWhenKnockedOut with the
 * table's rules; a Pokémon the adventure `noPrizeFor` rule names logs a perspective-free line into
 * `events`. Every Prize site of the engine uses it.
 */
function knockOutGivesPrize(state: GameState | undefined, pokemon: PokemonInPlay, owner: "player" | "opponent", events: GameEvent[]): boolean {
  if (!givesPrizeWhenKnockedOut(pokemon)) return false;
  if (state && noPrizeByTableRule(pokemon, state, owner)) {
    events.push(createGameEvent(`${pokemon.pokemon.name} no da premio en esta mesa`, "info"));
    return false;
  }
  return true;
}

/**
 * The cards a Knocked Out Pokémon leaves: everything goes to its owner's discard pile, except
 * the card Rebirth (Rocket's Moltres, getRebirthPower) returns to the hand "after discarding
 * it" — its power must work at the moment of the Knock Out (`knockedOut` as it was then). The
 * Prize is taken as usual. Every Knock Out path uses it.
 */
function knockedOutCards(state: GameState | undefined, knockedOut: PokemonInPlay): { discard: GameCard[]; hand: GameCard[]; events: GameEvent[] } {
  const cards = cardsLeavingPlay(knockedOut);
  const power = getRebirthPower(state, knockedOut);
  if (!power) return { discard: cards, hand: [], events: [] };
  const id = knockedOut.pokemon.id;
  return {
    discard: cards.filter((c) => c.id !== id),
    hand: cards.filter((c) => c.id === id),
    events: [createGameEvent(`${power.name}: ${knockedOut.pokemon.name} volvió a la mano tras quedar Fuera de Combate`, "action")],
  };
}

/**
 * Prizes `side` is owed: one per opposing Pokémon Knocked Out, picked one by one with takePrize
 * (`playerPrizesOwed` / `opponentPrizesOwed`; `playerCanTakePrize` / `opponentCanTakePrize` say
 * whether any is owed). A state that only sets the flag (older consumers, tests) owes 1.
 */
export function prizesOwed(
  state: Pick<GameState, "playerCanTakePrize" | "opponentCanTakePrize" | "playerPrizesOwed" | "opponentPrizesOwed">,
  side: "player" | "opponent"
): number {
  const flag = side === "player" ? state.playerCanTakePrize : state.opponentCanTakePrize;
  if (!flag) return 0;
  const count = side === "player" ? state.playerPrizesOwed : state.opponentPrizesOwed;
  return count !== undefined && count > 0 ? count : 1;
}

/** `side` is owed `owed` Prizes (never more than its Prizes left); the flag follows the count. */
export function withPrizesOwed(state: GameState, side: "player" | "opponent", owed: number): GameState {
  const left = side === "player" ? state.playerPrizes.length : state.opponentPrizes.length;
  const n = Math.max(0, Math.min(owed, left));
  return side === "player"
    ? { ...state, playerCanTakePrize: n > 0, playerPrizesOwed: n > 0 ? n : undefined }
    : { ...state, opponentCanTakePrize: n > 0, opponentPrizesOwed: n > 0 ? n : undefined };
}

/**
 * Knock out the acting side's ("player") Active Pokémon outside an attack (a Trainer or a Power
 * left it with damage >= HP, Destiny Bond after a chosen-target attack...): the shared Knock Out
 * check with that Pokémon forced out (checkKnockouts). `_prizeMessage` is kept for compatibility:
 * the opponent is now owed the Prize ("El rival puede tomar un premio").
 */
export function knockOutPlayerActive(state: GameState, _prizeMessage?: string): GameState {
  const active = state.playerActivePokemon;
  if (!active) return state;
  return checkKnockouts(
    { ...state, events: [...state.events, createGameEvent(`¡${active.pokemon.name} fue noqueado!`, "action")] },
    { forcedKnockOuts: [active.pokemon.id] }
  );
}

/** Knock out the opponent's Active Pokémon outside an attack (the same shared check, forced). */
export function knockOutOpponentActive(state: GameState): GameState {
  const active = state.opponentActivePokemon;
  if (!active) return state;
  return checkKnockouts(
    { ...state, events: [...state.events, createGameEvent(`¡${active.pokemon.name} fue noqueado!`, "action")] },
    { forcedKnockOuts: [active.pokemon.id] }
  );
}

export type KnockOutOptions = {
  /**
   * Pokémon (ids) the caller already found Knocked Out and whose Knock Out line it already logged:
   * an attack's damage step (the Defending Pokémon / the attacker, with the HP they had then — a
   * transformed Ditto's copy can change once the other Active leaves), Destiny Bond, the
   * between-turns checkup. They leave play with the others, in the same check.
   */
  forcedKnockOuts?: readonly string[];
};

/**
 * THE Knock Out check (attack resolution steps 5-7, CLAUDE.md "Attack resolution"), run after
 * every attack, the between-turns checkup, Trainers / powers and anything else that changes
 * damage or HP:
 *
 * 1. State-based departures first: Secret Plan's face-down cards flip, Ninja Trick leaves the
 *    Bench, broken Shapeshifts, Scram (not Knock Outs).
 * 2. Every Pokémon in play of BOTH players with damage >= its HP (Actives with their current HP;
 *    `forcedKnockOuts` too) is Knocked Out at the same time: it goes to its owner's discard pile
 *    with every card attached (Rebirth: back to the hand); repeated while a Knock Out changes a
 *    transformed Ditto's HP.
 * 3. Prizes: each player is owed one Prize per opposing Pokémon Knocked Out (a Mysterious Fossil /
 *    Clefairy Doll or a table's noPrizeFor Pokémon gives none), added to `xPrizesOwed` (never more
 *    than the Prizes left) and picked one by one with takePrize — never taken behind the player's
 *    back.
 * 4. Win checks (settleGameEnd): a side owed every Prize it has left takes them now and wins; a
 *    side left with no Pokémon in play loses; both at once → the player whose turn it is wins
 *    (Sudden Death isn't modelled; a Lucky Duel is a draw: settleLuckyDuelDraw).
 * 5. Promotions: a side whose Active was Knocked Out gets `xNeedsToPromote` (after its Prizes;
 *    the defending player first, then the attacker).
 *
 * Pure: returns the same object when nothing happened.
 */
export function checkKnockouts(state: GameState, options: KnockOutOptions = {}): GameState {
  // Shapeshift: a statused Ninetales loses its Evolution card first (its HP is its own again)
  // Scram: a Primeape with exactly 10 HP left goes into the deck before any Knock Out
  // Koga's Ninja Trick: discarded once its Pokémon is on the Bench
  // Lt. Surge's Secret Plan: face-down cards that became the Active or were affected flip first
  let next = shuffleScrammingPokemon(discardBrokenShapeshiftCards(discardBenchedNinjaTricks(revealFaceDownCards(state))));
  if (next.gameResult === null) {
    const forced = new Set(options.forcedKnockOuts ?? []);
    for (let pass = 0; pass < 4; pass++) {
      const swept = sweepKnockOuts(next, forced);
      if (swept === next) break;
      next = swept;
    }
  }
  const changed = next !== state;
  const settled = settleGameEnd(changed ? clearEmptyPromotions(next) : next, changed);
  // Defender / PlusPower of a Pokémon that left play go to the discard pile with it. Lucky Duel:
  // the other Active Knocked Out by the same action makes it a draw
  return releaseOrphanModifiers(settleLuckyDuelDraw(settled));
}

/** One pass of steps 2-3 of checkKnockouts: every Pokémon in play Knocked Out now, at once. */
function sweepKnockOuts(state: GameState, forced: ReadonlySet<string>): GameState {
  const counts = (p: PokemonInPlay) => p.pokemon.kind === CardKind.Pokemon && !isFaceDown(p);
  // Actives use their current HP (a transformed Ditto's copy); a Benched Ditto is not a copy
  const activeOut = (p: PokemonInPlay | null): p is PokemonInPlay =>
    !!p && counts(p) && (forced.has(p.pokemon.id) || ((p.currentDamage ?? 0) >= getEffectiveHp(state, p) && !isAwaitingTransformTarget(state, p)));
  const benchOut = (p: PokemonInPlay) => counts(p) && (forced.has(p.pokemon.id) || (p.currentDamage ?? 0) >= getEffectiveHp(state, p));

  // The defending side's lines first (the side whose turn it isn't)
  const sides: ("player" | "opponent")[] = state.isPlayerTurn ? ["opponent", "player"] : ["player", "opponent"];
  const found = sides.map((side) => {
    const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
    const bench = side === "player" ? state.playerBench : state.opponentBench;
    return { side, active: activeOut(active) ? active : null, bench: bench.filter(benchOut) };
  });
  if (found.every((f) => !f.active && f.bench.length === 0)) return state;

  const events: GameEvent[] = [...state.events];
  const gained = { player: 0, opponent: 0 };
  let next: GameState = state;
  for (const { side, active, bench } of found) {
    const knockedOut = [...(active ? [active] : []), ...bench];
    if (knockedOut.length === 0) continue;
    const discard: GameCard[] = [];
    const hand: GameCard[] = [];
    for (const ko of knockedOut) {
      if (!forced.has(ko.pokemon.id)) {
        events.push(createGameEvent(ko === active ? `¡${ko.pokemon.name} fue noqueado!` : `¡${ko.pokemon.name} fue noqueado en la banca!`, "action"));
      }
      const leaving = knockedOutCards(state, ko);
      discard.push(...leaving.discard);
      hand.push(...leaving.hand);
      events.push(...leaving.events);
      if (knockOutGivesPrize(state, ko, side, events)) gained[side === "player" ? "opponent" : "player"] += 1;
    }
    if (side === "player") {
      const left = next.playerBench.filter((p) => !bench.includes(p));
      next = {
        ...next,
        playerBench: left,
        playerDiscard: [...next.playerDiscard, ...discard],
        playerHand: [...next.playerHand, ...hand],
        ...(active && { playerActivePokemon: null, playerNeedsToPromote: left.length > 0 }),
      };
    } else {
      const left = next.opponentBench.filter((p) => !bench.includes(p));
      next = {
        ...next,
        opponentBench: left,
        opponentDiscard: [...next.opponentDiscard, ...discard],
        opponentHand: [...next.opponentHand, ...hand],
        ...(active && { opponentActivePokemon: null, opponentNeedsToPromote: left.length > 0 }),
      };
    }
  }
  // Prizes owed (the attacker's line first), never more than the Prizes left
  for (const side of [...sides].reverse()) {
    if (gained[side] === 0) continue;
    const before = prizesOwed(next, side);
    next = withPrizesOwed(next, side, before + gained[side]);
    const added = prizesOwed(next, side) - before;
    for (let i = 0; i < added; i++) {
      events.push(createGameEvent(side === "player" ? "¡Puedes tomar un premio!" : "El rival puede tomar un premio", "action"));
    }
  }
  for (const { side, active } of found) {
    if (!active) continue;
    if (side === "player" && next.playerNeedsToPromote) events.push(createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info"));
    if (side === "opponent" && next.opponentNeedsToPromote) events.push(createGameEvent(`El dueño de ${active.pokemon.name} debe elegir un nuevo Pokémon activo`, "info"));
  }
  return { ...next, events };
}

/** A side with nothing left on the Bench can't promote. */
function clearEmptyPromotions(state: GameState): GameState {
  const player = state.playerNeedsToPromote && state.playerBench.length > 0;
  const opponent = state.opponentNeedsToPromote && state.opponentBench.length > 0;
  return player === state.playerNeedsToPromote && opponent === state.opponentNeedsToPromote
    ? state
    : { ...state, playerNeedsToPromote: player, opponentNeedsToPromote: opponent };
}

/**
 * Win checks after Knock Outs (attack resolution step 7). A side owed every Prize it has left
 * takes them now (takePrize: "Tomaste un premio"...) and wins — the last Prize is never picked by
 * hand. With `checkNoPokemon`, a side with no Pokémon in play loses. Both sides at once: the
 * player whose turn it is wins (the classic rule is a Sudden Death game, not modelled; a Lucky
 * Duel turns it into a draw afterwards: settleLuckyDuelDraw). The game is over, so owed Prizes,
 * promotions and pending choices are dropped. Pure: the same object when nobody wins.
 */
function settleGameEnd(state: GameState, checkNoPokemon: boolean): GameState {
  if (state.gameResult !== null || state.gamePhase === GamePhase.GameOver) return state;
  const prizedOut = (side: "player" | "opponent") => {
    const left = side === "player" ? state.playerPrizes.length : state.opponentPrizes.length;
    return left > 0 && prizesOwed(state, side) >= left;
  };
  const noPokemon = (side: "player" | "opponent") =>
    checkNoPokemon &&
    (side === "player" ? !state.playerActivePokemon && state.playerBench.length === 0 : !state.opponentActivePokemon && state.opponentBench.length === 0);
  const playerWins = prizedOut("player") || noPokemon("opponent");
  const opponentWins = prizedOut("opponent") || noPokemon("player");
  if (!playerWins && !opponentWins) return state;
  const winner: "player" | "opponent" = playerWins && opponentWins ? (state.isPlayerTurn ? "player" : "opponent") : playerWins ? "player" : "opponent";

  let next: GameState;
  if (prizedOut(winner)) {
    next = state;
    while (next.gameResult === null && prizesOwed(next, winner) > 0) next = takePrize(next, 0, winner === "player", false);
  } else {
    next = {
      ...state,
      gameResult: winner === "player" ? "victory" : "defeat",
      gamePhase: GamePhase.GameOver,
      events: [
        ...state.events,
        createGameEvent(winner === "player" ? "¡Victoria! El rival no tiene más Pokémon" : "¡Derrota! No tienes más Pokémon", "system"),
        createGameEvent("Ya puedes salir de la mesa", "info"),
      ],
    };
  }
  return {
    ...next,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerPrizesOwed: undefined,
    opponentPrizesOwed: undefined,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    pendingForceSwitch: undefined,
    pendingSelfSwitch: undefined,
    pendingDeckSearch: undefined,
    pendingBenchDamageSelection: undefined,
    pendingAttackChoice: undefined,
  };
}

/**
 * The last Prizes are taken automatically: a side owed every Prize it has left takes them and
 * wins (part of every checkKnockouts; exported for callers that changed owed Prizes themselves).
 */
export function takeLastPrizes(state: GameState): GameState {
  return settleGameEnd(state, false);
}

/**
 * Scram (Brock's Primeape): every working Primeape (either side, Active or Benched) with exactly
 * 10 HP left is shuffled with its cards into its owner's deck — not a Knock Out (no Prize); its
 * owner promotes if it was the Active. Returns the same state when none.
 */
function shuffleScrammingPokemon(state: GameState): GameState {
  let next = state;
  for (const side of ["player", "opponent"] as const) {
    const activeKey = side === "player" ? "playerActivePokemon" : "opponentActivePokemon";
    const benchKey = side === "player" ? "playerBench" : "opponentBench";
    const deckKey = side === "player" ? "playerDeck" : "opponentDeck";
    const promoteKey = side === "player" ? "playerNeedsToPromote" : "opponentNeedsToPromote";
    const active = next[activeKey];
    const leaving = [active, ...next[benchKey]].filter((p): p is PokemonInPlay => !!p && isScramming(next, p));
    if (leaving.length === 0) continue;
    const activeLeft = !!active && leaving.includes(active);
    const bench = next[benchKey].filter((p) => !leaving.includes(p));
    const events = [...next.events];
    for (const p of leaving) {
      const powerName = isPokemonCard(p.pokemon) ? p.pokemon.power?.name ?? "" : "";
      events.push(createGameEvent(`${powerName}: ¡${p.pokemon.name} y todas sus cartas se barajaron en el mazo de su dueño!`, "action"));
    }
    if (activeLeft && bench.length > 0) events.push(createGameEvent(`El dueño de ${active.pokemon.name} debe elegir un nuevo Pokémon activo`, "info"));
    next = {
      ...next,
      [activeKey]: activeLeft ? null : active,
      [benchKey]: bench,
      [deckKey]: shuffle([...next[deckKey], ...leaving.flatMap((p) => cardsLeavingPlay(p))]),
      ...(activeLeft && { [promoteKey]: bench.length > 0 }),
      events,
    };
  }
  return next;
}

/** Result lines a Lucky Duel draw replaces (exact engine texts, see settleLuckyDuelDraw). */
const LUCKY_DUEL_REPLACED_RESULT_LINES: ReadonlySet<string> = new Set([
  "¡Victoria! El rival no tiene más Pokémon",
  "¡Derrota! No tienes más Pokémon",
  "Ya puedes salir de la mesa",
]);

/**
 * Lucky Duel: both Actives Knocked Out by the same action (an attack, a between-turns checkup...)
 * is a draw. Call it once that action set the result: when neither side has a Pokémon that can
 * stay in play — its Active is gone, or is still on the board with damage >= its HP because the
 * game ended before its own Knock Out was processed (it is Knocked Out here) — the result becomes
 * "draw". No-op for standard games and for games that didn't just end with a winner.
 */
export function settleLuckyDuelDraw(state: GameState): GameState {
  if (!isLuckyDuel(state) || (state.gameResult !== "victory" && state.gameResult !== "defeat")) return state;
  const out = (p: PokemonInPlay | null, bench: PokemonInPlay[]): boolean =>
    bench.length === 0 &&
    (!p || (p.pokemon.kind === CardKind.Pokemon && (p.currentDamage ?? 0) >= getEffectiveHp(state, p) && !isAwaitingTransformTarget(state, p)));
  if (!out(state.playerActivePokemon, state.playerBench) || !out(state.opponentActivePokemon, state.opponentBench)) return state;
  // The game ended during this action, so every winner / loser line in the log comes from it:
  // replaced by the draw line
  const events = state.events.filter((e) => !LUCKY_DUEL_REPLACED_RESULT_LINES.has(e.message));
  const leave = (p: PokemonInPlay | null) => {
    if (!p) return { discard: [] as GameCard[], hand: [] as GameCard[] };
    const leaving = knockedOutCards(state, p);
    events.push(createGameEvent(`¡${p.pokemon.name} fue noqueado!`, "action"), ...leaving.events);
    return leaving;
  };
  const player = leave(state.playerActivePokemon);
  const opponent = leave(state.opponentActivePokemon);
  events.push(
    createGameEvent("¡Empate! Ambos Pokémon activos quedaron Fuera de Combate", "system"),
    createGameEvent("Ya puedes salir de la mesa", "info")
  );
  return {
    ...state,
    playerActivePokemon: null,
    opponentActivePokemon: null,
    playerDiscard: [...state.playerDiscard, ...player.discard],
    playerHand: [...state.playerHand, ...player.hand],
    opponentDiscard: [...state.opponentDiscard, ...opponent.discard],
    opponentHand: [...state.opponentHand, ...opponent.hand],
    gameResult: "draw",
    gamePhase: GamePhase.GameOver,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    events,
  };
}

/**
 * Win check for a side left with no Pokémon in play (also after a Pokémon left play without a
 * Knock Out: Fling, Vanish...) and the Prize-out check, with the same rules as checkKnockouts
 * (settleGameEnd). Promotion flags of a side with nothing on the Bench are cleared.
 */
export function endGameIfNoPokemonLeft(state: GameState): GameState {
  return settleGameEnd(clearEmptyPromotions(state), true);
}

/**
 * Former Bench-only sweep: every Knock Out now goes through the one check (checkKnockouts), which
 * owes the Prizes instead of taking them. Kept as an alias for consumers.
 */
export function processBenchKnockouts(state: GameState): GameState {
  return checkKnockouts(state);
}

/**
 * Construye un mazo completo desde un DeckEntry[]
 * Cards are resolved by (entry.set, entry.cardNumber); no set = Base Set.
 */
export function buildDeckFromEntries(entries: DeckEntry[]): GameCard[] {
  const deck: GameCard[] = [];

  for (const entry of entries) {
    const card = findCardBySetAndNumber(entry.set, entry.cardNumber);
    if (!card) {
      console.warn(`Carta #${entry.cardNumber} (${entry.set ?? "Base Set"}) no encontrada en el catálogo`);
      continue;
    }

    // Crear múltiples copias de la carta
    for (let i = 0; i < entry.quantity; i++) {
      deck.push({
        ...card,
        id: `${card.name}-${i}-${Date.now()}-${Math.random()}`,
      });
    }
  }

  return deck;
}

/**
 * Inicializa el estado del juego desde un Deck seleccionado (sin preparar)
 */
export function initializeGame(deck: Deck): GameState {
  // Construir y mezclar el mazo del jugador
  const fullDeck = buildDeckFromEntries(deck.cards);
  const shuffledDeck = shuffle(fullDeck);

  // Seleccionar un mazo diferente para el rival
  const availableDecks = decks.filter(d => d.id !== deck.id && d.id !== "test");
  const opponentDeck = availableDecks.length > 0
    ? availableDecks[Math.floor(Math.random() * availableDecks.length)]
    : deck; // Fallback al mismo deck si no hay otros disponibles
  const opponentFullDeck = buildDeckFromEntries(opponentDeck.cards);
  const opponentShuffledDeck = shuffle(opponentFullDeck);

  return {
    playerDeck: shuffledDeck,
    playerHand: [],
    playerPrizes: [],
    playerDiscard: [],
    playerActivePokemon: null,
    playerBench: [],
    opponentDeck: opponentShuffledDeck,
    opponentHand: [],
    opponentPrizes: [],
    opponentDiscard: [],
    opponentActivePokemon: null,
    opponentBench: [],
    selectedDeckId: deck.id,
    turnNumber: 0,
    startingPlayer: null,
    isPlayerTurn: false,
    gameStarted: false,
    gamePhase: GamePhase.Mulligan,
    playerReady: false,
    opponentReady: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    events: [createGameEvent("Partida inicializada", "system")],
  };
}

/**
 * Inicializa el estado del juego para multijugador con ambos mazos especificados
 */
export function initializeMultiplayerGame(player1Deck: Deck, player2Deck: Deck): GameState {
  // Construir y mezclar el mazo del jugador 1
  const player1FullDeck = buildDeckFromEntries(player1Deck.cards);
  const player1ShuffledDeck = shuffle(player1FullDeck);

  // Construir y mezclar el mazo del jugador 2 (será el "opponent" desde la perspectiva del estado)
  const player2FullDeck = buildDeckFromEntries(player2Deck.cards);
  const player2ShuffledDeck = shuffle(player2FullDeck);

  return {
    playerDeck: player1ShuffledDeck,
    playerHand: [],
    playerPrizes: [],
    playerDiscard: [],
    playerActivePokemon: null,
    playerBench: [],
    opponentDeck: player2ShuffledDeck,
    opponentHand: [],
    opponentPrizes: [],
    opponentDiscard: [],
    opponentActivePokemon: null,
    opponentBench: [],
    selectedDeckId: player1Deck.id,
    turnNumber: 0,
    startingPlayer: null,
    isPlayerTurn: false,
    gameStarted: false,
    gamePhase: GamePhase.Mulligan,
    playerReady: false,
    opponentReady: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    events: [createGameEvent("Partida multijugador inicializada", "system")],
  };
}

/** Prize cards in a standard game. */
export const DEFAULT_PRIZE_COUNT = 6;

/** Cards in an opening hand in a standard game. */
export const DEFAULT_OPENING_HAND = 7;

export type StartGameOptions = {
  /**
   * Prize cards per player (1-6, default 6): shorter games vs the AI. The game is won as
   * always, by taking the last one. A pair deals each side its own count (adventure mode).
   */
  prizeCount?: number | SidePair;
  /** Cards in each opening hand (and after a mulligan: `openingHandSize`); default 7. A pair: per side. */
  openingHand?: number | SidePair;
};

function sidePair(value: number | SidePair | undefined, fallback: number, clamp: (n: number) => number): SidePair {
  const pair = typeof value === "object" ? value : { player: value ?? fallback, opponent: value ?? fallback };
  return { player: clamp(pair.player), opponent: clamp(pair.opponent) };
}

/** The opening hand size of a side (`openingHandSize`, else 7). */
export function openingHandSizeOf(state: GameState, side: "player" | "opponent"): number {
  return state.openingHandSize?.[side] ?? DEFAULT_OPENING_HAND;
}

/**
 * Prepara el juego: reparte cartas y premios (sin coinflip, eso ocurre después del setup)
 */
export function startGame(gameState: GameState, options: StartGameOptions = {}): GameState {
  const prizes = sidePair(options.prizeCount, DEFAULT_PRIZE_COUNT, (n) => Math.min(DEFAULT_PRIZE_COUNT, Math.max(1, Math.floor(n))));
  const hands = sidePair(options.openingHand, DEFAULT_OPENING_HAND, (n) => Math.max(1, Math.floor(n)));
  const prizeCount = Math.max(prizes.player, prizes.opponent);

  // Crear copias de los mazos para no mutar los originales
  const playerDeckCopy = [...gameState.playerDeck];
  const opponentDeckCopy = [...gameState.opponentDeck];

  // Mezclar nuevamente antes de repartir
  const shuffledPlayerDeck = shuffle(playerDeckCopy);
  const shuffledOpponentDeck = shuffle(opponentDeckCopy);

  // Repartir: la mano inicial, los premios, el resto queda en el mazo
  const playerPrizesEnd = hands.player + prizes.player;
  const playerHand = shuffledPlayerDeck.slice(0, hands.player);
  const playerPrizes = shuffledPlayerDeck.slice(hands.player, playerPrizesEnd);
  const playerDeck = shuffledPlayerDeck.slice(playerPrizesEnd);

  const opponentPrizesEnd = hands.opponent + prizes.opponent;
  const opponentHand = shuffledOpponentDeck.slice(0, hands.opponent);
  const opponentPrizes = shuffledOpponentDeck.slice(hands.opponent, opponentPrizesEnd);
  const opponentDeck = shuffledOpponentDeck.slice(opponentPrizesEnd);
  const prizesText = (count: number) => `${count} ${count === 1 ? "premio" : "premios"}`;

  // Crear eventos
  const newEvents = [
    ...gameState.events,
    createGameEvent(`Tú robas ${hands.player} cartas y colocas ${prizesText(prizes.player)}`, "action"),
    createGameEvent(`Rival roba ${hands.opponent} cartas y coloca ${prizesText(prizes.opponent)}`, "action"),
  ];
  const customHands = hands.player !== DEFAULT_OPENING_HAND || hands.opponent !== DEFAULT_OPENING_HAND;

  return {
    ...gameState,
    playerDeck,
    playerHand,
    playerPrizes,
    playerActivePokemon: null,
    playerBench: [],
    opponentDeck,
    opponentHand,
    opponentPrizes,
    prizeCount,
    ...(customHands && { openingHandSize: hands }),
    opponentActivePokemon: null,
    opponentBench: [],
    turnNumber: 0,
    startingPlayer: null,
    isPlayerTurn: false,
    gameStarted: true,
    gamePhase: GamePhase.Mulligan, // Inicia en mulligan para verificar pokémon básicos
    playerReady: false,
    opponentReady: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    events: newEvents,
  };
}

/**
 * Verifica si hay al menos un Pokémon básico en la mano
 */
export function hasBasicPokemon(hand: GameCard[]): boolean {
  return hand.some(isPlayableAsBasic);
}

/**
 * Why that side (`isPlayer`: the "player" side, else the "opponent" side) can't mulligan
 * now, or null. Only before the game starts (MULLIGAN/SETUP), with no Pokémon in play and
 * no Basic Pokémon (or card played as a Basic) in the hand.
 */
export function canMulligan(gameState: GameState, isPlayer: boolean): string | null {
  if (gameState.gamePhase !== GamePhase.Mulligan && gameState.gamePhase !== GamePhase.Setup) {
    return "Solo puedes hacer mulligan antes de empezar la partida";
  }
  const active = isPlayer ? gameState.playerActivePokemon : gameState.opponentActivePokemon;
  const bench = isPlayer ? gameState.playerBench : gameState.opponentBench;
  if (active || bench.length > 0) return "Ya tienes Pokémon en juego: no puedes hacer mulligan";
  const hand = isPlayer ? gameState.playerHand : gameState.opponentHand;
  if (hasBasicPokemon(hand)) return "Tienes Pokémon básicos en la mano: no puedes hacer mulligan";
  return null;
}

/**
 * Realiza un mulligan: devuelve la mano al mazo, mezcla y roba una mano nueva (7 cartas, o el
 * `openingHandSize` de ese lado). Throws IllegalActionError when `canMulligan` gives a reason.
 */
export function doMulligan(gameState: GameState, isPlayer: boolean): GameState {
  assertLegal(canMulligan(gameState, isPlayer));
  const hand = isPlayer ? gameState.playerHand : gameState.opponentHand;
  const deck = isPlayer ? gameState.playerDeck : gameState.opponentDeck;

  // Combinar mano con mazo
  const combined = [...hand, ...deck];

  // Mezclar
  const shuffled = shuffle(combined);

  // Robar la mano nueva
  const handSize = openingHandSizeOf(gameState, isPlayer ? "player" : "opponent");
  const newHand = shuffled.slice(0, handSize);
  const newDeck = shuffled.slice(handSize);

  const playerName = isPlayer ? "Tú" : "Rival";
  const newEvent = createGameEvent(`${playerName} ${isPlayer ? "hiciste" : "hizo"} mulligan`, "action");

  if (isPlayer) {
    return {
      ...gameState,
      playerHand: newHand,
      playerDeck: newDeck,
      events: [...gameState.events, newEvent],
    };
  } else {
    return {
      ...gameState,
      opponentHand: newHand,
      opponentDeck: newDeck,
      events: [...gameState.events, newEvent],
    };
  }
}

/**
 * Avanza a la fase de SETUP cuando el jugador tiene pokémon básicos
 */
export function advanceToSetup(gameState: GameState): GameState {
  return {
    ...gameState,
    gamePhase: GamePhase.Setup,
    events: [
      ...gameState.events,
      createGameEvent("Fase de preparación: coloca tus Pokémon básicos", "system"),
    ],
  };
}

/**
 * Marca un jugador como listo.
 * Cuando ambos están listos, NO avanza automáticamente a PLAYING.
 * El caller debe lanzar la moneda primero y luego llamar a startPlayingPhase().
 */
export function setPlayerReady(gameState: GameState, isPlayer: boolean): GameState {
  const playerName = isPlayer ? "Tú" : "Rival";
  const newEvent = createGameEvent(`${playerName} ${isPlayer ? "estás" : "está"} listo`, "info");

  return {
    ...gameState,
    playerReady: isPlayer ? true : gameState.playerReady,
    opponentReady: !isPlayer ? true : gameState.opponentReady,
    events: [...gameState.events, newEvent],
  };
}

/**
 * Inicia la fase de juego después del coin flip.
 * @param coinFlipResult - Resultado de la moneda para determinar quién comienza
 */
export function startPlayingPhase(gameState: GameState, coinFlipResult: "heads" | "tails"): GameState {
  const startingPlayer = coinFlipResult === "heads" ? "player" : "opponent";
  // Adventure mode: the rules applied once both players are ready (start_attached_energy...), before the first draw
  gameState = applySetupRules(gameState);

  // Classic rule: every turn starts with a draw, the starting player's first turn included
  // (endTurn draws for every later turn). The decks are never empty here (60 - 7 - 6).
  const draw = startingPlayer === "player"
    ? drawCard(gameState.playerDeck, gameState.playerHand)
    : drawCard(gameState.opponentDeck, gameState.opponentHand);

  return {
    ...gameState,
    ...(startingPlayer === "player"
      ? { playerDeck: draw.newDeck, playerHand: draw.newHand }
      : { opponentDeck: draw.newDeck, opponentHand: draw.newHand }),
    gamePhase: GamePhase.Playing,
    startingPlayer,
    isPlayerTurn: startingPlayer === "player",
    turnNumber: 1,
    energyAttachedThisTurn: false,
    // Lucky Duel: both players are ready, the face-down Actives are revealed
    ...(isLuckyDuel(gameState) && { luckyDuelRevealed: true }),
    events: [
      ...gameState.events,
      ...(isLuckyDuel(gameState) && gameState.playerActivePokemon && gameState.opponentActivePokemon
        ? [createGameEvent(`Lucky Duel: ¡${gameState.playerActivePokemon.pokemon.name} contra ${gameState.opponentActivePokemon.pokemon.name}!`, "system")]
        : []),
      createGameEvent("¡Comienza la partida!", "system"),
      createGameEvent(
        `Moneda lanzada: ${coinFlipResult === "heads" ? "[coin:heads]" : "[coin:tails]"}`,
        "info"
      ),
      createGameEvent(
        `${startingPlayer === "player" ? "Tú empiezas" : "Rival empieza"} el juego`,
        "info"
      ),
      createGameEvent("¡Comienza el turno 1!", "system"),
      createGameEvent(
        `Turno de ${startingPlayer === "player" ? "Jugador" : "Rival"}`,
        "info"
      ),
      ...(draw.success ? [createGameEvent(startingPlayer === "player" ? "Robaste una carta" : "El rival robó una carta", "info")] : []),
    ],
  };
}

/**
 * Between-turns checkup for one active Pokémon.
 * @param isOwnersTurnEnding - true when this Pokémon's owner is the player ending the turn.
 *   Effects that last "during your opponent's next turn" (Leer / CannotAttack) wear off
 *   only at the end of the affected Pokémon's own turn.
 */
function processStatusEffectsForPokemon(
  pokemon: PokemonInPlay,
  currentTurn: number,
  isOwnersTurnEnding: boolean,
  hp: number
): { pokemon: PokemonInPlay; events: GameEvent[]; isKnockedOut: boolean } {
  let updated = { ...pokemon };
  const events: GameEvent[] = [];
  let isKnockedOut = false;

  // Veneno: 10 de daño (o 20 si es Tóxico)
  if (hasStatusCondition(updated, StatusCondition.Poisoned)) {
    const poisonDmg = updated.poisonDamage ?? 10;
    const newDamage = (updated.currentDamage ?? 0) + poisonDmg;
    updated.currentDamage = newDamage;
    events.push(createGameEvent(`${updated.pokemon.name} recibe ${poisonDmg} de daño por veneno`, "action"));

    if (updated.pokemon.kind === CardKind.Pokemon && newDamage >= hp) {
      isKnockedOut = true;
      events.push(createGameEvent(`¡${updated.pokemon.name} fue noqueado por veneno!`, "action"));
    }
  }

  // Dormido: tirar moneda, cara = despertar
  if (hasStatusCondition(updated, StatusCondition.Asleep)) {
    const coinFlip = Math.random() < 0.5 ? "heads" : "tails";
    if (coinFlip === "heads") {
      updated = removeStatusCondition(updated, StatusCondition.Asleep);
      events.push(createGameEvent(`${updated.pokemon.name} despertó (moneda: [coin:heads])`, "info"));
    } else {
      events.push(createGameEvent(`${updated.pokemon.name} sigue dormido (moneda: [coin:tails])`, "info"));
    }
  }

  // Parálisis: se cura al final del siguiente turno del dueño
  if (hasStatusCondition(updated, StatusCondition.Paralyzed) && updated.paralyzedOnTurn !== undefined) {
    // Si fue paralizado en un turno anterior (no este), se cura
    if (updated.paralyzedOnTurn < currentTurn) {
      updated = removeStatusCondition(updated, StatusCondition.Paralyzed);
      events.push(createGameEvent(`${updated.pokemon.name} ya no está paralizado`, "info"));
    }
  }

  // CannotAttack (Leer): applied during the opponent's turn, it must last through the
  // affected Pokémon's next turn, so it is only cleared when its OWNER ends a turn.
  if (isOwnersTurnEnding && hasStatusCondition(updated, StatusCondition.CannotAttack)) {
    updated = removeStatusCondition(updated, StatusCondition.CannotAttack);
    events.push(createGameEvent(`${updated.pokemon.name} ya puede atacar`, "info"));
  }

  return { pokemon: updated, events, isKnockedOut };
}

/**
 * The end of `side`'s turn for its attached Trainers (domain/trainers/attached.ts): Charity goes
 * back to the hand, Sabrina's ESP to the discard pile. Pure (log lines pushed to `events`).
 */
function expireEndOfTurnTrainers(state: GameState, side: "player" | "opponent", events: GameEvent[]): GameState {
  const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  const { pokemon, toHand, toDiscard, expired } = expireAttachedTrainers(active ? [active, ...bench] : bench);
  if (expired.length === 0) return state;
  for (const e of expired) {
    events.push(createGameEvent(`${e.card.name} (unida a ${e.pokemonName}) ${e.to === "hand" ? "vuelve a la mano" : "se descarta"}`, "info"));
  }
  const newActive = active ? pokemon[0] : null;
  const newBench = active ? pokemon.slice(1) : pokemon;
  return side === "player"
    ? { ...state, playerActivePokemon: newActive, playerBench: newBench, playerHand: [...state.playerHand, ...toHand], playerDiscard: [...state.playerDiscard, ...toDiscard] }
    : { ...state, opponentActivePokemon: newActive, opponentBench: newBench, opponentHand: [...state.opponentHand, ...toHand], opponentDiscard: [...state.opponentDiscard, ...toDiscard] };
}

/** Chaos Gym's offer of a failed Trainer to the other player (GameState.pendingChaosOffer). */
export type ChaosGymOffer = {
  cardId: string;
  cardName: string;
  /** Whose discard pile the card is in (relative). */
  owner: "player" | "opponent";
  /** Who may use it (relative): always the other player of the side whose turn it is. */
  offeredTo: "player" | "opponent";
  /** The offered player said yes: it now plays the card on its own view (generic Trainer flow). */
  accepted?: boolean;
};

export function endTurn(gameState: GameState, skipOpponentPromotion: boolean = false): GameState {
  // Block turn end while an ATTACK is still resolving (switch, deck search, bench damage selection).
  // pendingTypeShift / pendingPeek are optional Pokémon Power prompts opened during the turn:
  // they never block (blocking would deadlock a closed modal or a client that never sends
  // clearPeek) and are discarded below so they can't leak into the next turn.
  if (
    gameState.pendingForceSwitch || gameState.pendingSelfSwitch || gameState.pendingDeckSearch ||
    gameState.pendingBenchDamageSelection || gameState.pendingAttackChoice || gameState.pendingPowerChoice ||
    gameState.pendingBenchTrim || gameState.pendingDuel || gameState.pendingChaosOffer
  ) {
    return gameState;
  }
  // Chaos Gym heads but the card was never played: it is discarded without effect
  const unplayed = gameState.pendingChaosGymPlay;
  if (unplayed) {
    const inHand = gameState.playerHand.find((c) => c.id === unplayed.cardId);
    gameState = {
      ...gameState,
      pendingChaosGymPlay: undefined,
      ...(inHand && { playerHand: gameState.playerHand.filter((c) => c.id !== unplayed.cardId), playerDiscard: [...gameState.playerDiscard, inHand] }),
    };
  }

  // State-based Knock Outs first (a transformed Ditto whose copy no longer fits its damage)
  gameState = checkKnockouts(gameState);
  if (gameState.gameResult !== null) return gameState;

  const currentTurn = gameState.turnNumber;
  const isPlayerEndingTurn = gameState.isPlayerTurn;
  const newIsPlayerTurn = !isPlayerEndingTurn;
  const newTurnNumber = currentTurn + 1;
  const events: GameEvent[] = [...gameState.events];

  let updatedState: GameState = { ...gameState, pendingTypeShift: undefined, pendingPeek: undefined, lastDuel: undefined, pendingBorrowedTrainer: undefined };

  // The end of the turn, before the between-turns checkup: the ending side's attached Trainers
  // leave (Charity back to the hand, Sabrina's ESP to the discard pile)
  updatedState = expireEndOfTurnTrainers(updatedState, isPlayerEndingTurn ? "player" : "opponent", events);
  // Tickling Machine: the ending side's set-aside hand comes back at the end of the turn it was due
  // (same moment, before the checkup; the line never names the cards)
  const setAside = returnSetAsideHand(updatedState, isPlayerEndingTurn ? "player" : "opponent", currentTurn);
  if (setAside.returned > 0) {
    updatedState = setAside.state;
    events.push(createGameEvent(`Tickling Machine: ${setAside.returned === 1 ? "la carta apartada vuelve" : `las ${setAside.returned} cartas apartadas vuelven`} a la mano de quien las apartó`, "info"));
  }

  // =====================================================================
  // POKEMON CHECKUP — between turns, BOTH Active Pokémon (poison, sleep, paralysis...). The damage
  // is put on them; their Knock Outs go through the shared check below (checkKnockouts, forced:
  // both at once, Prizes owed to the other side) — the same rule as an attack's Knock Outs.
  // =====================================================================

  // The checkup runs once per turn change, even if endTurn is called again after a pause
  const checkupAlreadyDone = gameState.checkupDoneOnTurn === currentTurn;
  const checkupKnockOuts: string[] = [];
  const checkup = (pokemon: PokemonInPlay | null, isOwnTurn: boolean, isPlayerPokemon: boolean) => {
    if (!pokemon || checkupAlreadyDone) return;
    const result = processStatusEffectsForPokemon(pokemon, currentTurn, isOwnTurn, getEffectiveHp(gameState, pokemon));
    events.push(...result.events);
    if (result.isKnockedOut) {
      checkupKnockOuts.push(result.pokemon.pokemon.id);
      events.push(createGameEvent(`¡${result.pokemon.pokemon.name} fue noqueado!`, "action"));
    }
    if (isPlayerPokemon) updatedState.playerActivePokemon = result.pokemon;
    else updatedState.opponentActivePokemon = result.pokemon;
  };
  // 1) the Pokémon of the player ending the turn, 2) the other one
  checkup(isPlayerEndingTurn ? updatedState.playerActivePokemon : updatedState.opponentActivePokemon, true, isPlayerEndingTurn);
  checkup(isPlayerEndingTurn ? updatedState.opponentActivePokemon : updatedState.playerActivePokemon, false, !isPlayerEndingTurn);
  const opponentActiveBefore = updatedState.opponentActivePokemon;

  // =====================================================================
  // EXPIRE POWER SUPPRESSION (Goop Gas Attack, Stare) — before the state-based Knock Outs:
  // a Ditto whose Transform works again may now be Knocked Out by its copy's HP
  // =====================================================================
  if (updatedState.powersSuppressed?.length) {
    const stillActive = updatedState.powersSuppressed.filter((s) => s.expiresAfterTurn >= newTurnNumber);
    if (stillActive.length !== updatedState.powersSuppressed.length) {
      events.push(createGameEvent("Los Poderes Pokémon vuelven a funcionar", "info"));
    }
    updatedState.powersSuppressed = stillActive.length > 0 ? stillActive : undefined;
  }

  // The shared Knock Out check (the checkup's Knock Outs, a transformed Ditto whose copy changed)
  const swept = checkKnockouts({ ...updatedState, events: [...events] }, { forcedKnockOuts: checkupKnockOuts });
  if (swept.gameResult !== null) return swept;
  updatedState = { ...swept };
  events.splice(0, events.length, ...swept.events);

  // Single-player: the engine promotes the other side's (the AI's) new Active itself, unless asked not to
  if (!skipOpponentPromotion && opponentActiveBefore && checkupKnockOuts.includes(opponentActiveBefore.pokemon.id) &&
      updatedState.opponentNeedsToPromote && updatedState.opponentActivePokemon === null && updatedState.opponentBench.length > 0) {
    const promoted = updatedState.opponentBench[0];
    updatedState = { ...updatedState, opponentActivePokemon: promoted, opponentBench: updatedState.opponentBench.slice(1), opponentNeedsToPromote: false };
    events.push(createGameEvent(`${promoted.pokemon.name} pasa a ser el Pokémon activo del rival`, "info"));
    const recheck = checkKnockouts({ ...updatedState, events: [...events] });
    if (recheck.gameResult !== null) return recheck;
    updatedState = { ...recheck };
    events.splice(0, events.length, ...recheck.events);
  }

  // Si alguien puede tomar premio o promover, no avanzar el turno aún (either side may still
  // need a new Active: an attack that Knocked Out the Defending Pokémon with skipDefenderPromotion)
  if (updatedState.playerCanTakePrize || updatedState.opponentCanTakePrize || updatedState.playerNeedsToPromote || updatedState.opponentNeedsToPromote) {
    return {
      ...updatedState,
      checkupDoneOnTurn: currentTurn,
      events,
    };
  }

  // =====================================================================
  // EXPIRAR PROTECCIÓN
  // =====================================================================
  const expireProtection = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.protection) return pokemon;
    if (newTurnNumber > pokemon.protection.expiresAfterTurn) {
      events.push(
        createGameEvent(
          `La protección de ${pokemon.pokemon.name} expiró`,
          "info"
        )
      );
      return clearProtection(pokemon);
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireProtection(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireProtection(updatedState.opponentActivePokemon);

  // =====================================================================
  // EXPIRAR DESTINY BOND
  // Destiny Bond set on turn T expires at end of opponent's next turn (T + 1)
  // =====================================================================
  const expireDestinyBond = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.destinyBondActive || pokemon.destinyBondTurn == null) return pokemon;
    if (newTurnNumber > pokemon.destinyBondTurn + 1) {
      events.push(
        createGameEvent(
          `El efecto de Unión de Destino de ${pokemon.pokemon.name} expiró`,
          "info"
        )
      );
      return { ...pokemon, destinyBondActive: undefined, destinyBondTurn: undefined };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireDestinyBond(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireDestinyBond(updatedState.opponentActivePokemon);

  // =====================================================================
  // EXPIRAR SAND-ATTACK / SMOKESCREEN (mustFlipToAttack)
  // Set on turn T, expires at end of affected Pokemon's next turn (T + 1)
  // Also clears when going to bench or evolving (handled separately)
  // =====================================================================
  const expireMustFlipToAttack = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.mustFlipToAttack || pokemon.mustFlipToAttackTurn == null) return pokemon;
    if (newTurnNumber > pokemon.mustFlipToAttackTurn + 1) {
      events.push(
        createGameEvent(
          `${pokemon.pokemon.name} ya puede atacar normalmente`,
          "info"
        )
      );
      return { ...pokemon, mustFlipToAttack: undefined, mustFlipToAttackTurn: undefined };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireMustFlipToAttack(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireMustFlipToAttack(updatedState.opponentActivePokemon);

  // =====================================================================
  // EXPIRAR RETREAT PREVENTION (Acid)
  // Retreat prevention applied on turn T expires when the affected Pokemon's
  // next turn ends (i.e., when newTurnNumber > T + 1)
  // =====================================================================
  const expireRetreatPrevention = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.retreatPrevented || pokemon.retreatPreventedOnTurn == null) return pokemon;
    if (newTurnNumber > pokemon.retreatPreventedOnTurn + 1) {
      events.push(
        createGameEvent(
          `${pokemon.pokemon.name} ya puede retirarse`,
          "info"
        )
      );
      return { ...pokemon, retreatPrevented: undefined, retreatPreventedOnTurn: undefined };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireRetreatPrevention(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireRetreatPrevention(updatedState.opponentActivePokemon);

  // Headache: the blocked turn is over once the turn after it starts
  if (updatedState.noTrainersOnTurn !== undefined && updatedState.noTrainersOnTurn < newTurnNumber) {
    updatedState.noTrainersOnTurn = undefined;
  }
  // Recall: only for the attack of the turn it was played
  if (updatedState.recallActiveOnTurn !== undefined) delete updatedState.recallActiveOnTurn;
  // Rocket's Secret Experiment / Transparent Walls: marks whose last turn is over
  if (updatedState.trainerLockUntilTurn) {
    const kept = expireSideTurns(updatedState.trainerLockUntilTurn, newTurnNumber);
    if (kept) updatedState.trainerLockUntilTurn = kept;
    else delete updatedState.trainerLockUntilTurn;
  }
  if (updatedState.benchProtectedUntilTurn) {
    const kept = expireSideTurns(updatedState.benchProtectedUntilTurn, newTurnNumber);
    if (kept) updatedState.benchProtectedUntilTurn = kept;
    else delete updatedState.benchProtectedUntilTurn;
  }


  // =====================================================================
  // EXPIRAR MODIFIERS (PlusPower, Defender, etc.)
  // =====================================================================
  const expiredModifiers = updatedState.activeModifiers.filter(
    (m) => m.expiresAfterTurn <= currentTurn
  );
  const remainingModifiers = updatedState.activeModifiers.filter(
    (m) => m.expiresAfterTurn > currentTurn
  );

  // Move expired modifier cards to the appropriate discard pile (Misty's is already there)
  for (const mod of expiredModifiers) {
    if (!modifierHoldsCard(mod)) {
      // nothing to move
    } else if (mod.playerId === "player") {
      updatedState.playerDiscard = [...updatedState.playerDiscard, mod.card];
    } else {
      updatedState.opponentDiscard = [...updatedState.opponentDiscard, mod.card];
    }
    events.push(
      createGameEvent(
        `El efecto de ${mod.card.name} expiró`,
        "info"
      )
    );
  }
  updatedState.activeModifiers = remainingModifiers;

  // =====================================================================
  // EXPIRE NEXT-TURN ATTACK EFFECTS (Swords Dance, Minimize, etc.)
  // Effects applied on turn T expire when turnNumber reaches T+2
  // =====================================================================
  const clearExpiredNextTurnEffects = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon) return pokemon;
    if (pokemon.nextTurnEffectAppliedOnTurn == null) return pokemon;
    // Effect was applied on turn T. It should be available during turn T+1 (opponent's turn).
    // If we reach T+2 without it being consumed, it expires.
    // Swords Dance's bonus is for the attacker's OWN next turn (T+2): only the reduction ends here
    if (pokemon.nextTurnBonusDamage && newTurnNumber === pokemon.nextTurnEffectAppliedOnTurn + 2) {
      return pokemon.nextTurnDamageReduction ? { ...pokemon, nextTurnDamageReduction: undefined } : pokemon;
    }
    if (newTurnNumber > pokemon.nextTurnEffectAppliedOnTurn + 1) {
      const hadBonus = pokemon.nextTurnBonusDamage;
      const hadReduction = pokemon.nextTurnDamageReduction;
      if (hadBonus || hadReduction) {
        events.push(
          createGameEvent(
            `El efecto temporal de ${pokemon.pokemon.name} expiró`,
            "info"
          )
        );
      }
      return {
        ...pokemon,
        nextTurnBonusDamage: undefined,
        nextTurnDamageReduction: undefined,
        nextTurnEffectAppliedOnTurn: undefined,
      };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = clearExpiredNextTurnEffects(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = clearExpiredNextTurnEffects(updatedState.opponentActivePokemon);

  // =====================================================================
  // CLEAR ENERGY BURN (energyConversionType resets at end of turn)
  // CLEAR SHIFT (shiftedType resets at end of turn)
  // =====================================================================
  if (updatedState.playerActivePokemon?.shiftedType) {
    events.push(createGameEvent(`Efecto de Shift terminado — ${updatedState.playerActivePokemon.pokemon.name} vuelve a su tipo original`, "info"));
  }
  if (updatedState.opponentActivePokemon?.shiftedType) {
    events.push(createGameEvent(`Efecto de Shift terminado — ${updatedState.opponentActivePokemon.pokemon.name} vuelve a su tipo original`, "info"));
  }
  if (updatedState.playerActivePokemon?.energyConversionType || updatedState.playerActivePokemon?.shiftedType) {
    updatedState.playerActivePokemon = {
      ...updatedState.playerActivePokemon,
      energyConversionType: undefined,
      shiftedType: undefined,
    };
  }
  if (updatedState.opponentActivePokemon?.energyConversionType || updatedState.opponentActivePokemon?.shiftedType) {
    updatedState.opponentActivePokemon = {
      ...updatedState.opponentActivePokemon,
      energyConversionType: undefined,
      shiftedType: undefined,
    };
  }
  // Clear shiftedType and Energy Burn from bench Pokemon as well (both work from the Bench,
  // and a Charizard may have been benched after using Energy Burn)
  updatedState.playerBench = updatedState.playerBench.map(p =>
    p && (p.shiftedType || p.energyConversionType) ? { ...p, shiftedType: undefined, energyConversionType: undefined } : p
  );
  updatedState.opponentBench = updatedState.opponentBench.map(p =>
    p && (p.shiftedType || p.energyConversionType) ? { ...p, shiftedType: undefined, energyConversionType: undefined } : p
  );

  // =====================================================================
  // CLEAR lastDamageReceived (Mirror Move) for the player ending their turn
  // Lifecycle: A attacks B (set on B) -> B's turn (B can use Mirror Move) -> B ends turn (clear on B)
  // =====================================================================
  if (isPlayerEndingTurn) {
    if (updatedState.playerActivePokemon?.lastDamageReceived != null) {
      updatedState.playerActivePokemon = {
        ...updatedState.playerActivePokemon,
        lastDamageReceived: undefined,
      };
    }
    updatedState.playerBench = updatedState.playerBench.map(p =>
      p && p.lastDamageReceived != null ? { ...p, lastDamageReceived: undefined } : p
    );
  } else {
    if (updatedState.opponentActivePokemon?.lastDamageReceived != null) {
      updatedState.opponentActivePokemon = {
        ...updatedState.opponentActivePokemon,
        lastDamageReceived: undefined,
      };
    }
    updatedState.opponentBench = updatedState.opponentBench.map(p =>
      p && p.lastDamageReceived != null ? { ...p, lastDamageReceived: undefined } : p
    );
  }

  // Mensaje de fin de turno (después de procesar todos los efectos de fin de turno)
  events.push(
    createGameEvent(
      isPlayerEndingTurn ? "Fin de tu turno" : "Fin del turno del rival",
      "system"
    )
  );

  // =====================================================================
  // INICIO DEL NUEVO TURNO: Robar una carta
  // =====================================================================
  const incomingPlayerDeck = newIsPlayerTurn ? updatedState.playerDeck : updatedState.opponentDeck;
  const incomingPlayerHand = newIsPlayerTurn ? updatedState.playerHand : updatedState.opponentHand;

  const drawResult = drawCard(incomingPlayerDeck, incomingPlayerHand);

  // Si no puede robar (deck vacío), pierde el juego
  if (drawResult.deckOut) {
    if (newIsPlayerTurn) {
      events.push(createGameEvent("¡No puedes robar! Tu mazo está vacío", "system"));
      events.push(createGameEvent("¡Derrota! No tienes cartas para robar", "system"));
      return {
        ...updatedState,
        gamePhase: GamePhase.GameOver,
        gameResult: "defeat",
        events,
      };
    } else {
      events.push(createGameEvent("¡El rival no puede robar! Su mazo está vacío", "system"));
      events.push(createGameEvent("¡Victoria! El rival no tiene cartas para robar", "system"));
      return {
        ...updatedState,
        gamePhase: GamePhase.GameOver,
        gameResult: "victory",
        events,
      };
    }
  }

  // Anunciar el nuevo turno PRIMERO
  events.push(
    createGameEvent(
      `Turno ${newTurnNumber} - ${newIsPlayerTurn ? "Tu turno" : "Turno del rival"}`,
      "system"
    )
  );

  // Actualizar mazo y mano del jugador que roba
  if (newIsPlayerTurn) {
    updatedState.playerDeck = drawResult.newDeck;
    updatedState.playerHand = drawResult.newHand;
    events.push(createGameEvent("Robaste una carta", "action"));
  } else {
    updatedState.opponentDeck = drawResult.newDeck;
    updatedState.opponentHand = drawResult.newHand;
    events.push(createGameEvent("El rival robó una carta", "info"));
  }

  return {
    ...updatedState,
    isPlayerTurn: newIsPlayerTurn,
    turnNumber: newTurnNumber,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    stadiumPlayedThisTurn: false,
    usedPowersThisTurn: [], // Clear used powers for new turn
    attackedThisTurn: undefined,
    checkupDoneOnTurn: undefined,
    events,
  };
}

/**
 * Obtiene la URL de la imagen de una carta
 */
export function getCardImageUrl(card: GameCard): string {
  return getCatalogImageUrl(card);
}

/**
 * Traduce el tipo de energía al español
 */
export function getEnergyTypeInSpanish(energyType: string): string {
  const translations: Record<string, string> = {
    grass: "Planta",
    fire: "Fuego",
    water: "Agua",
    lightning: "Eléctrica",
    psychic: "Psíquica",
    fighting: "Lucha",
    darkness: "Oscuridad",
    metal: "Metal",
    fairy: "Hada",
    dragon: "Dragón",
    colorless: "Incolora"
  };

  return translations[energyType.toLowerCase()] || energyType;
}

/**
 * Display label of an Energy card: "Energía Fuego" for a basic Energy, the card's name for a
 * special Energy ("Rainbow Energy", "Double Colorless Energy"), the name for anything else.
 */
export function energyCardLabel(card: GameCard): string {
  if (card.buzzapEnergyType) return `Energía ${getEnergyTypeInSpanish(card.buzzapEnergyType)} (${card.name})`;
  if (!isEnergyCard(card)) return card.name;
  return card.isBasic ? `Energía ${getEnergyTypeInSpanish(card.energyType)}` : card.name;
}

/**
 * Verifica si un Pokémon puede evolucionar en otro
 * @param evolution - El Pokémon al que quiere evolucionar (debe ser stage-1 o stage-2)
 * @param base - El Pokémon base que está en juego
 * @returns true si la evolución es válida
 */
export function canEvolveInto(evolution: Card, base: Card): boolean {
  // Verificar que ambos parámetros existan
  if (!evolution || !base) {
    return false;
  }

  // Ambas deben ser cartas de Pokémon
  if (evolution.kind !== CardKind.Pokemon || base.kind !== CardKind.Pokemon) {
    return false;
  }

  // La evolución debe tener evolvesFrom definido
  if (!evolution.evolvesFrom) {
    return false;
  }

  // El Pokémon base debe coincidir con el evolvesFrom de la evolución
  return evolution.evolvesFrom === base.name;
}

/**
 * Encuentra todos los Pokémon en juego que pueden ser evolucionados por una carta específica
 * @param evolutionCard - La carta de evolución (stage-1 o stage-2)
 * @param activePokemon - Pokémon activo del jugador
 * @param bench - Banca del jugador
 * @param turnNumber - Turno actual (para bloquear evolución el mismo turno que fue jugado/evolucionado)
 * @returns Array de índices donde se puede colocar la evolución (-1 = activo, 0-4 = banca)
 */
export function findValidEvolutionTargets(
  evolutionCard: GameCard,
  activePokemon: PokemonInPlay | null,
  bench: PokemonInPlay[],
  turnNumber?: number,
  startingPlayer?: "player" | "opponent" | null,
  isPlayerTurn?: boolean
): number[] {
  const validTargets: number[] = [];

  // Global restriction: Cannot evolve on turn 1 of the game
  if (turnNumber !== undefined && turnNumber <= 1) {
    return validTargets;
  }

  // First turn restriction: Cannot evolve on YOUR first turn
  // If player goes second, their first turn is turn 2
  // If opponent goes second, their first turn is turn 2
  if (turnNumber !== undefined && startingPlayer && isPlayerTurn !== undefined) {
    const isPlayersFirstTurn = isPlayerTurn && (
      (startingPlayer === "player" && turnNumber === 1) ||
      (startingPlayer === "opponent" && turnNumber === 2)
    );
    const isOpponentsFirstTurn = !isPlayerTurn && (
      (startingPlayer === "opponent" && turnNumber === 1) ||
      (startingPlayer === "player" && turnNumber === 2)
    );
    if (isPlayersFirstTurn || isOpponentsFirstTurn) {
      return validTargets;
    }
  }

  // Verificar Pokémon activo
  if (activePokemon && canEvolveInto(evolutionCard, activePokemon.pokemon)) {
    // No puede evolucionar si fue jugado o evolucionado este mismo turno
    const canEvolveThisTurn = turnNumber === undefined || activePokemon.playedOnTurn !== turnNumber;
    if (canEvolveThisTurn) {
      validTargets.push(-1); // -1 indica el Pokémon activo
    }
  }

  // Verificar cada Pokémon en la banca
  bench.forEach((pokemonInPlay, index) => {
    if (canEvolveInto(evolutionCard, pokemonInPlay?.pokemon)) {
      const canEvolveThisTurn = turnNumber === undefined || pokemonInPlay.playedOnTurn !== turnNumber;
      if (canEvolveThisTurn) {
        validTargets.push(index);
      }
    }
  });

  return validTargets;
}

/**
 * Attack requirements on the Defending Pokémon (RequireStatus, e.g. Haunter's Dream Eater:
 * "You can't use this attack unless the Defending Pokémon is Asleep").
 * @returns true when every requirement is met (or the attack has none)
 */
export function meetsAttackRequirements(
  attack: Attack,
  defender: PokemonInPlay | null | undefined,
  attacker?: PokemonInPlay | null,
  defenderBench?: PokemonInPlay[],
  attackerBench?: PokemonInPlay[]
): boolean {
  return getAttackRequirementFailure(attack, defender, attacker, defenderBench, attackerBench) === null;
}

/**
 * Why an attack's own requirement isn't met (Spanish reason), or null. Requirements on the
 * attacker are only checked when it is given, the opponent's Bench only when `defenderBench`
 * is given (Fling, Drag Off, Fascinate: "can't be used if your opponent has no Benched Pokémon"),
 * the attacker's Bench only when `attackerBench` is given (Alert).
 */
export function getAttackRequirementFailure(
  attack: Attack,
  defender: PokemonInPlay | null | undefined,
  attacker?: PokemonInPlay | null,
  defenderBench?: PokemonInPlay[],
  attackerBench?: PokemonInPlay[]
): string | null {
  for (const effect of attack.effects ?? []) {
    if (effect.type === AttackEffectType.RequireStatus && effect.requiredStatus) {
      if (effect.target === AttackTarget.Defender && (!defender || !hasStatusCondition(defender, effect.requiredStatus))) {
        return `No puedes usar ${attack.name}: el Pokémon defensor no cumple el requisito del ataque`;
      }
    }
    // Spacing Out: "can't be used if Slowpoke has no damage counters on it" (checked when the attacker is known)
    // Retaliation: `amount` damage counters or more
    if (effect.type === AttackEffectType.RequireDamageCounters && attacker && (attacker.currentDamage ?? 0) < (effect.amount ?? 1) * 10) {
      return effect.amount && effect.amount > 1
        ? `No puedes usar ${attack.name}: ${attacker.pokemon.name} necesita ${effect.amount} contadores de daño o más`
        : `No puedes usar ${attack.name}: ${attacker.pokemon.name} no tiene contadores de daño`;
    }
    // Synchronize: as many Energy cards attached as the Defending Pokémon
    if (effect.type === AttackEffectType.RequireEqualEnergyCards && attacker && defender &&
        attacker.attachedEnergy.length !== defender.attachedEnergy.length) {
      return `No puedes usar ${attack.name}: ${attacker.pokemon.name} y el Pokémon Defensor no tienen la misma cantidad de cartas de Energía unidas`;
    }
    // Fireball / Playing with Fire: an Energy card of that type attached (Rainbow Energy counts)
    if (effect.type === AttackEffectType.RequireAttachedEnergy && effect.energyType && attacker &&
        !attacker.attachedEnergy.some((e) => energyProvidesType(e, effect.energyType!, attacker))) {
      return `No puedes usar ${attack.name}: ${attacker.pokemon.name} no tiene Energía ${getEnergyTypeInSpanish(effect.energyType)} unida`;
    }
    if (effect.type === AttackEffectType.RequireOpponentBench && defenderBench && defenderBench.length === 0) {
      return `No puedes usar ${attack.name}: tu rival no tiene Pokémon en la Banca`;
    }
    if (effect.type === AttackEffectType.RequireOwnBench && attackerBench && attackerBench.length === 0) {
      return `No puedes usar ${attack.name}: no tienes Pokémon en la Banca`;
    }
  }
  return null;
}

/** The Bench of the side `pokemon` is the Active of (for requirements on the defender's Bench). */
function benchOfActive(state: GameState, pokemon: PokemonInPlay | null | undefined): PokemonInPlay[] | undefined {
  if (!pokemon) return undefined;
  if (state.opponentActivePokemon?.pokemon.id === pokemon.pokemon.id) return state.opponentBench;
  if (state.playerActivePokemon?.pokemon.id === pokemon.pokemon.id) return state.playerBench;
  return undefined;
}

/** One attack a Pokémon in play can choose (see getAvailableAttacks). */
export type AvailableAttack = {
  attack: Attack;
  /** Name of the card the attack comes from: the Pokémon itself (a transformed Ditto too), or the card under it (Recall). */
  fromCard: string;
  /** The index every attack entry point takes (canExecuteAttack, getAttackCoinPlan, executeAttack...). */
  index: number;
  /** A lower stage's attack, usable through Recall. */
  recalled: boolean;
  /** Another Psychic Pokémon's attack, usable through Psylink (Sabrina's Alakazam): `fromCard` is that Pokémon. */
  psylink?: boolean;
};

/** Recall is in effect for `pokemon`: played this turn, and it is the Active of the side whose turn it is. */
function recallAppliesTo(state: GameState, pokemon: PokemonInPlay): boolean {
  if (state.recallActiveOnTurn !== state.turnNumber) return false;
  const active = state.isPlayerTurn ? state.playerActivePokemon : state.opponentActivePokemon;
  return active?.pokemon.id === pokemon.pokemon.id;
}

function listAttacks(state: GameState, pokemon: PokemonInPlay, withRecall: boolean): AvailableAttack[] {
  const card = getEffectivePokemonCard(state, pokemon);
  if (!card) return [];
  const own = card.attacks.map((attack, index) => ({ attack, fromCard: card.name, index, recalled: false }));
  const psylinked = psylinkAttacks(state, pokemon);
  if (!withRecall && psylinked.length === 0) return own;
  // The cards under it, Basic first (a Mysterious Fossil under Kabuto has no attacks)
  const under = withRecall
    ? (pokemon.previousEvolutions ?? []).flatMap((c) =>
        isPokemonCard(c) ? (c.attacks ?? []).map((attack) => ({ attack, fromCard: c.name })) : []
      )
    : [];
  const recalled = under.map((u, k) => ({ ...u, index: own.length + k, recalled: true }));
  const base = own.length + recalled.length;
  return [...own, ...recalled, ...psylinked.map((p, k) => ({ ...p, index: base + k, recalled: false, psylink: true }))];
}

/**
 * Psylink (Sabrina's Alakazam): while its power works, a copy of every attack of its owner's
 * other Psychic Pokémon in play (Active and Bench, by their current type: Shift, a copy), in
 * board order. Their own attacks only (getEffectivePokemonCard): never Recall's or another
 * Psylink's, so two Alakazams don't copy each other's copies.
 */
function psylinkAttacks(state: GameState, pokemon: PokemonInPlay): { attack: Attack; fromCard: string }[] {
  if (!isPokemonCard(pokemon.pokemon) || pokemon.pokemon.power?.type !== PokemonPowerType.CopyTeamAttacks) return [];
  if (!isPowerActive(state, pokemon)) return [];
  const id = pokemon.pokemon.id;
  const isPlayers = state.playerActivePokemon?.pokemon.id === id || state.playerBench.some((p) => p.pokemon.id === id);
  const team = isPlayers ? [state.playerActivePokemon, ...state.playerBench] : [state.opponentActivePokemon, ...state.opponentBench];
  return team.flatMap((p) => {
    if (!p || p.pokemon.id === id) return [];
    const card = getEffectivePokemonCard(state, p);
    const types = p.shiftedType ? [p.shiftedType] : (card?.types ?? []);
    if (!card || !types.includes(EnergyTypeEnum.Psychic)) return [];
    return card.attacks.map((attack) => ({ attack, fromCard: card.name }));
  });
}

/**
 * The attacks `pokemon` can choose from now, in index order — the indices every attack entry
 * point takes. Its own attacks come first with their printed indices (a transformed Ditto: the
 * copied card's, getEffectivePokemonCard); while Recall is in effect (played this turn, and
 * `pokemon` is the Active of the side whose turn it is) the attacks of the cards under it follow,
 * Basic first (previousEvolutions order), indices continuing after its own. Consumers list
 * attacks with this instead of `card.attacks`.
 */
export function getAvailableAttacks(state: GameState, pokemon: PokemonInPlay): AvailableAttack[] {
  return listAttacks(state, pokemon, recallAppliesTo(state, pokemon));
}

/** The attack `index` of `pokemon` now (getAvailableAttacks), or undefined. */
function attackAt(state: GameState, pokemon: PokemonInPlay, index: number): Attack | undefined {
  const own = getEffectivePokemonCard(state, pokemon)?.attacks;
  if (!own) return undefined;
  // Own attacks (the hot path: no list built); past them Recall's, then Psylink's
  if (index < own.length) return own[index];
  return listAttacks(state, pokemon, recallAppliesTo(state, pokemon))[index]?.attack;
}

/**
 * Verifica si un Pokémon puede usar un ataque específico
 * @param pokemonInPlay - El Pokémon en juego con sus energías adjuntas
 * @param attackIndex - Índice del ataque a verificar
 * @param defender - Pokémon defensor. When given, requirements on the defender are checked
 *   too (Dream Eater needs it Asleep). Omit it to check only energy / once-per-play rules.
 * @returns true si tiene las energías necesarias (y se cumplen los requisitos)
 */
export function canUseAttack(
  pokemonInPlay: PokemonInPlay,
  attackIndex: number,
  defender?: PokemonInPlay | null,
  state?: GameState
): boolean {
  // With the state, a transformed Ditto uses the copied card's attacks and Energy of any type
  const pokemon = (state ? getEffectivePokemonCard(state, pokemonInPlay) : undefined) ?? pokemonInPlay.pokemon;
  if (pokemon.kind !== CardKind.Pokemon) return false;

  // With the state, Recall's attacks too (getAvailableAttacks indices)
  const attack = state ? attackAt(state, pokemonInPlay, attackIndex) : pokemon.attacks[attackIndex];
  if (!attack) return false;

  if (defender !== undefined && !meetsAttackRequirements(attack, defender, pokemonInPlay, state ? benchOfActive(state, defender) : undefined, state ? benchOfActive(state, pokemonInPlay) : undefined)) {
    return false;
  }
  if (defender !== undefined && state && attackTurnBlocker(state, pokemonInPlay, attack)) return false;

  // Verificar si es un ataque de uso único ya utilizado
  const hasUseOnce = attack.effects?.some((e) => e.type === AttackEffectType.UseOnce);
  if (hasUseOnce && pokemonInPlay.usedOnceAttacks?.includes(attack.name)) {
    return false;
  }

  const attachedEnergy = pokemonInPlay.attachedEnergy;

  // Transform (Ditto): any Energy attached counts as Energy of any type
  if (pokemon.transformedFrom) {
    const total = getTotalEnergyValue(attachedEnergy);
    const cards = attachedEnergy.filter((e) => e.kind === CardKind.Energy || e.buzzapEnergyType).length;
    const discardNeeded = Math.max(0, ...(attack.effects ?? []).map((e) => e.discardCostRequirement?.length ?? 0));
    return total >= attack.cost.length && cards >= discardNeeded;
  }

  // Check for Energy Burn conversion (all energy treated as one type)
  // Auto-detect from power if not explicitly set (continuous power)
  let energyConversionType = pokemonInPlay.energyConversionType;
  if (!energyConversionType && isPokemonCard(pokemonInPlay.pokemon)) {
    const power = pokemonInPlay.pokemon.power;
    if (power?.type === PokemonPowerType.EnergyConversion && power.energyType) {
      // Only Asleep/Confused/Paralyzed stop the power (Poison does not); with the state, Toxic Gas too
      if (state ? isPowerActive(state, pokemonInPlay) : !hasBlockingStatus(pokemonInPlay)) {
        energyConversionType = power.energyType;
      }
    }
  }
  // Photosynthesis (Erika's Oddish): every Energy card attached provides Grass (works while statused)
  if (!energyConversionType) energyConversionType = getEnergyTypeOverride(state, pokemonInPlay);

  // Contar energías por tipo (Double Colorless cuenta como 2 para costos de ataque)
  const energyValueCount: Record<string, number> = {};
  // Contar cartas de energía por tipo (para requisitos de descarte, cada carta = 1)
  const energyCardCount: Record<string, number> = {};
  // Rainbow Energy: counts as any basic type (one type at a time), assigned below where needed
  let wildValue = 0;
  let wildCards = 0;
  for (const energy of attachedEnergy) {
    if (energy.kind === CardKind.Energy && !energyConversionType && !energy.buzzapEnergyType && energy.providesAllTypes) {
      wildValue += getEnergyValue(energy);
      wildCards += 1;
      continue;
    }
    // A Buzzap Electrode is a Pokémon card attached as Energy (kind stays "pokemon")
    if (energy.kind === CardKind.Energy || energy.buzzapEnergyType) {
      // Determine effective energy type:
      // 1. Energy Burn: all energy counts as the conversion type
      // 2. Buzzap energy: use the chosen buzzap type
      // 3. Normal energy: use the card's energy type
      let effectiveType = isEnergyCard(energy) ? energy.energyType : energy.buzzapEnergyType!;
      if (energyConversionType) {
        effectiveType = energyConversionType;
      } else if (energy.buzzapEnergyType) {
        effectiveType = energy.buzzapEnergyType;
      }

      const value = getEnergyValue(energy); // DCE provee 2 energías colorless
      energyValueCount[effectiveType] = (energyValueCount[effectiveType] || 0) + value;
      // For discard requirements: Energy Burn converts the type entirely for all purposes
      // Buzzap energy uses its chosen type, normal energy uses card type
      energyCardCount[effectiveType] = (energyCardCount[effectiveType] || 0) + 1;
    }
  }

  // Contar requerimientos por tipo
  const costCount: Record<string, number> = {};
  for (const type of attack.cost) {
    costCount[type] = (costCount[type] || 0) + 1;
  }

  // Primero verificar energías específicas (no colorless) usando valores de energía
  // (lo que falte de un tipo lo puede pagar Rainbow Energy)
  let usedEnergy: Record<string, number> = {};
  let wildLeft = wildValue;
  for (const [type, required] of Object.entries(costCount)) {
    if (type === EnergyTypeEnum.Colorless) continue;

    const available = energyValueCount[type] || 0;
    if (available < required) {
      const missing = required - available;
      if (wildLeft < missing) return false;
      wildLeft -= missing;
      usedEnergy[type] = available;
      continue;
    }
    usedEnergy[type] = required;
  }

  // Luego verificar colorless (puede ser cualquier tipo) usando valores de energía
  const colorlessRequired = costCount[EnergyTypeEnum.Colorless] || 0;
  if (colorlessRequired > 0) {
    // Calcular total de energías restantes después de pagar costos específicos
    let remainingEnergy = wildLeft;
    for (const [type, count] of Object.entries(energyValueCount)) {
      const used = usedEnergy[type] || 0;
      remainingEnergy += count - used;
    }

    if (remainingEnergy < colorlessRequired) {
      return false;
    }
  }

  // Verificar discardCostRequirement de los efectos del ataque (cuenta cartas, no valores)
  if (attack.effects) {
    for (const effect of attack.effects) {
      if (effect.discardCostRequirement && effect.discardCostRequirement.length > 0) {
        const discardCount: Record<string, number> = {};
        for (const type of effect.discardCostRequirement) {
          discardCount[type] = (discardCount[type] || 0) + 1;
        }

        let wildCardsLeft = wildCards;
        let typedUsed = 0;
        for (const [type, required] of Object.entries(discardCount)) {
          // Colorless (Kindle: "discard 1 Energy card"): any card, checked below
          if (type === EnergyTypeEnum.Colorless) continue;
          const available = energyCardCount[type] || 0;
          typedUsed += Math.min(required, available);
          if (available < required) {
            const missing = required - available;
            if (wildCardsLeft < missing) return false;
            wildCardsLeft -= missing;
          }
        }
        const anyRequired = discardCount[EnergyTypeEnum.Colorless] || 0;
        const totalCards = Object.values(energyCardCount).reduce((sum, n) => sum + n, 0) - typedUsed + wildCardsLeft;
        if (totalCards < anyRequired) return false;
      }
    }
  }

  return true;
}

/** The type a working Energy Burn (Charizard) turns every Energy attached to `holder` into, if any. */
function energyBurnType(holder: PokemonInPlay): EnergyType | undefined {
  if (holder.energyConversionType) return holder.energyConversionType;
  if (!isPokemonCard(holder.pokemon)) return undefined;
  const power = holder.pokemon.power;
  return power?.type === PokemonPowerType.EnergyConversion && power.energyType && !hasBlockingStatus(holder) ? power.energyType : undefined;
}

/**
 * Can this card attached to `holder` pay one entry of an attack's discard cost
 * (`discardCostRequirement`)? Colorless = "discard 1 Energy card": any Energy card (Kindle);
 * a type = an Energy card that provides it (Rainbow Energy, a Buzzap Electrode's chosen type, every
 * card under a working Energy Burn).
 */
export function energyPaysDiscard(card: GameCard, type: EnergyType, holder: PokemonInPlay, state?: GameState): boolean {
  if (card.kind !== CardKind.Energy && !card.buzzapEnergyType) return false;
  if (type === EnergyTypeEnum.Colorless) return true;
  if (energyBurnType(holder)) return true;
  return energyProvidesType(card, type, holder, state);
}

/**
 * Why `selectedIds` can't pay the discard cost `required` of an attack by `holder` (Spanish), or
 * null: exactly one distinct Energy card attached to it per entry, each matching its entry
 * (energyPaysDiscard). The cost counts cards, not Energy units (a Double Colorless Energy is 1 card).
 * executeAttack enforces it; the consumers' discard pickers use it to enable "confirm".
 */
export function checkDiscardSelection(holder: PokemonInPlay, required: readonly EnergyType[], selectedIds: readonly string[], state?: GameState): string | null {
  const cards = selectedIds.map((id) => holder.attachedEnergy.find((e) => e.id === id));
  if (new Set(selectedIds).size !== selectedIds.length || cards.some((c) => !c)) return "Elige cartas de Energía unidas al atacante";
  if (cards.length !== required.length) return `Debes descartar ${required.length} carta${required.length === 1 ? "" : "s"} de Energía`;
  // Every entry gets its own card (at most 4 entries: try the assignments)
  const assign = (i: number, used: Set<number>): boolean =>
    i === required.length ||
    cards.some((card, k) => !used.has(k) && energyPaysDiscard(card!, required[i], holder, state) && assign(i + 1, new Set([...used, k])));
  return assign(0, new Set()) ? null : `Esas cartas no pagan el descarte (${required.map(getEnergyTypeInSpanish).join(", ")})`;
}

/**
 * Get the discard requirement for an attack (if any)
 * Returns the energy types that must be discarded, or null if no discard needed
 */
export function getAttackDiscardRequirement(pokemonInPlay: PokemonInPlay, attackIndex: number, state?: GameState): EnergyType[] | null {
  const pokemon = pokemonInPlay.pokemon;
  if (pokemon.kind !== CardKind.Pokemon) return null;

  // With the state: getAvailableAttacks indices (a transformed Ditto's, Recall's)
  const attack = state ? attackAt(state, pokemonInPlay, attackIndex) : pokemon.attacks[attackIndex];
  if (!attack || !attack.effects) return null;

  for (const effect of attack.effects) {
    if (effect.discardCostRequirement && effect.discardCostRequirement.length > 0) {
      return effect.discardCostRequirement;
    }
  }

  return null;
}

/**
 * Base damage of an attack, before weakness/resistance, PlusPower, Defender and
 * protection, and before next-turn bonuses or Mirror Move (executeAttack adds those).
 *
 * - Numeric damage is the printed value.
 * - "Nx" damage starts at 0: the multiplier is always described by an effect —
 *   `DamagePerCounter` (Self) for Flail ("10 × each damage counter on Magikarp"),
 *   or a coin flip (`CoinFlipDamage`: Bonemerang, Double Kick, Fury Swipes) that
 *   executeAttack resolves when the caller passes `coinResults`.
 * - Effects that still carry `coinFlip` are ignored here; a `CoinFlipDamage` without
 *   `coinFlip` (already resolved, see resolveCoinFlipEffects) adds its amount.
 * - "N+" / "N-" start at N and are adjusted by the non-coin-flip effects below.
 *
 * @param attackerBench - bench of the attacking side (BonusDamage "benchCount"/"namedPokemon")
 */
export function calculateBaseDamage(
  attacker: PokemonInPlay,
  defender: PokemonInPlay,
  attack: Attack,
  attackerBench: PokemonInPlay[],
  defenderBench: PokemonInPlay[] = []
): { damage: number; description: string } {
  let baseDamage = 0;
  let description = "";

  if (typeof attack.damage === "number") {
    baseDamage = attack.damage;
  } else if (typeof attack.damage === "string") {
    const numMatch = attack.damage.match(/(\d+)/);
    const baseValue = numMatch ? parseInt(numMatch[1], 10) : 0;
    // "Nx": the multiplier comes from an effect (see above), never from the string itself
    baseDamage = attack.damage.endsWith("x") ? 0 : baseValue;
  }

  const ownCounters = Math.floor((attacker.currentDamage || 0) / 10);

  for (const effect of attack.effects ?? []) {
    if (effect.coinFlip) continue;
    // Poison Power: only while the attacker has the Special Condition
    if (effect.onlyIfSelfStatus && !hasStatusCondition(attacker, effect.onlyIfSelfStatus)) continue;

    // BonusDamage: add damage based on source (bench count, named pokemon, etc.)
    // Skip Self-targeting BonusDamage without a bonusDamageSource — those are "next turn" buffs (e.g., Swords Dance)
    if (effect.type === AttackEffectType.BonusDamage && effect.amount
        && !(effect.target === AttackTarget.Self && !effect.bonusDamageSource)) {
      let multiplier = 1;
      if (effect.bonusDamageSource === "benchCount") {
        multiplier = attackerBench.filter(p => p != null).length;
      } else if (effect.bonusDamageSource === "namedPokemon" && effect.bonusDamageNameMatch) {
        const name = effect.bonusDamageNameMatch;
        // Count in active + bench
        let count = 0;
        if (attacker.pokemon.name === name) count++;
        for (const bp of attackerBench) {
          if (bp && bp.pokemon.name === name) count++;
        }
        multiplier = count;
      } else if (effect.bonusDamageSource === "namedOnBench" && effect.names) {
        // Magnetism: each named Pokémon on your Bench
        multiplier = attackerBench.filter((p) => p && effect.names!.includes(p.pokemon.name)).length;
      } else if (effect.bonusDamageSource === "namedInPlay" && effect.names) {
        // Mass Explosion: each named Pokémon in play, both sides (Actives included)
        multiplier = [attacker, defender, ...attackerBench, ...defenderBench].filter((p) => p && effect.names!.includes(p.pokemon.name)).length;
      } else if (effect.bonusDamageSource === "defenderEnergyCards") {
        // Psychic: each Energy card attached to the Defending Pokémon
        multiplier = defender.attachedEnergy.filter((e) => e.kind === CardKind.Energy || !!e.buzzapEnergyType).length;
      } else if (effect.bonusDamageSource === "defenderDamaged") {
        // Rend (+20) / Pulled Punch (−30): the Defending Pokémon already has damage counters
        multiplier = (defender.currentDamage ?? 0) > 0 ? 1 : 0;
      } else if (effect.bonusDamageSource === "ownEnergyOfType" && effect.energyType) {
        // Roaring Flames: each attached Energy card providing `energyType` (before the attack discards them)
        const type = effect.energyType;
        multiplier = attacker.attachedEnergy.filter((e) => energyProvidesType(e, type, attacker)).length;
      } else if (effect.bonusDamageSource === "defenderType") {
        // Ice Throw: "if the Defending Pokémon is Fighting, this attack's base damage is doubled"
        multiplier = isPokemonCard(defender.pokemon) && !!effect.defenderType && defender.pokemon.types.includes(effect.defenderType) ? 1 : 0;
      }
      // Love Lariat: "if you have at least 1 Giovanni's Nidoking on your Bench"
      if (effect.bonusOnce) multiplier = Math.min(multiplier, 1);
      baseDamage += effect.amount * multiplier;
    }

    // DamagePerCounter: damage per damage counter on self (Rage, Rampage, Flail) or defender (Meditate)
    if (effect.type === AttackEffectType.DamagePerCounter && effect.amount) {
      if (effect.target === AttackTarget.Self) {
        baseDamage += effect.amount * ownCounters;
        if (typeof attack.damage === "string" && attack.damage.endsWith("x")) {
          description = ` (${effect.amount} × ${ownCounters} contadores)`;
        }
      } else if (effect.target === AttackTarget.Defender) {
        const counters = Math.floor((defender.currentDamage || 0) / 10);
        baseDamage += effect.amount * counters;
      }
    }

    // SelfDamageReduction (Karate Chop): "N minus 10 for each damage counter on this Pokémon"
    if (effect.type === AttackEffectType.SelfDamageReduction && effect.amount) {
      baseDamage -= effect.amount * ownCounters;
    }

    // HalfHPDamage (Super Fang): damage = half of defender's remaining HP, rounded up to nearest 10
    if (effect.type === AttackEffectType.HalfHPDamage && effect.target === AttackTarget.Defender
        && isPokemonCard(defender.pokemon)) {
      const remainingHP = defender.pokemon.hp - (defender.currentDamage || 0);
      const halfHP = Math.ceil(remainingHP / 2);
      baseDamage = Math.ceil(halfHP / 10) * 10;
    }

    // CoinFlipDamage already resolved by resolveCoinFlipEffects (no `coinFlip` left):
    // the amount is the total coin damage (amount × matching coins)
    if (effect.type === AttackEffectType.CoinFlipDamage && effect.amount) {
      baseDamage += effect.amount;
    }

    // ExtraEnergy: bonus damage per extra energy of a type beyond attack cost
    if (effect.type === AttackEffectType.ExtraEnergy && effect.extraDamagePerEnergy) {
      const energyType = effect.extraEnergyType;
      const maxExtra = effect.maxExtraEnergy ?? Infinity;
      if (energyType) {
        // Count total energy of this type attached (a transformed Ditto's Energy is any type)
        const anyType = isPokemonCard(attacker.pokemon) && !!attacker.pokemon.transformedFrom;
        const totalOfType = attacker.attachedEnergy.filter(
          e => e.kind === CardKind.Energy && (anyType || energyProvidesType(e, energyType, attacker))
        ).length;
        // Count how many are required by the attack cost: its symbols of that type, plus the
        // Colorless part that the other Energy can't pay (Poliwrath W W W for W W C: no extra)
        const otherValue = getTotalEnergyValue(attacker.attachedEnergy.filter(
          e => e.kind === CardKind.Energy && !(anyType || energyProvidesType(e, energyType, attacker))
        ));
        const colorlessCost = attack.cost.filter(c => c === EnergyTypeEnum.Colorless).length;
        const requiredOfType = attack.cost.filter(c => c === energyType).length + Math.max(0, colorlessCost - otherValue);
        const extraCount = Math.min(Math.max(0, totalOfType - requiredOfType), maxExtra);
        baseDamage += effect.extraDamagePerEnergy * extraCount;
      }
    }
  }

  return { damage: Math.max(0, baseDamage), description };
}

// ============================================================================
// COIN-FLIP ATTACK EFFECTS
// ============================================================================

/** Options for executeAttack / executeMetronome (object form). */
export type ExecuteAttackOptions = {
  /** Don't call endTurn after the attack (the caller will). */
  skipEndTurn?: boolean;
  /** After a KO, let the defending side choose its new active instead of auto-promoting. */
  skipDefenderPromotion?: boolean;
  /** Energy cards chosen to pay a discard cost (Fire Spin...). */
  selectedEnergyIds?: string[];
  /**
   * Conversion 1 / Conversion 2 (Porygon): the type chosen by the attacker. When given, the
   * engine sets the Defending Pokémon's Weakness (if it has one) / the attacker's Resistance
   * (never Colorless). Omitted: unchanged (the consumer applies it, as before).
   */
  chosenType?: EnergyType;
  /**
   * The attacker's coin flips, flipped by the caller (UI or server), in order.
   * Must have exactly `getAttackCoinFlipCount(state, attackIndex)` entries — omit it
   * (or pass []) for attacks without coins. The engine resolves every coin effect.
   */
  coinResults?: CoinFlipResult[];
  /**
   * Vermilion City Gym: the attacker (a Pokémon with Lt. Surge in its name) chose to flip the
   * Stadium's coin (`canUseVermilionCoin`); its coin is in `coinResults` as
   * `getAttackCoinPlan(state, i, { vermilionCoin: true })` lays it out. Refused
   * (IllegalActionError) when the Stadium doesn't offer it.
   */
  vermilionCoin?: boolean;
  /**
   * Answers of the powers asked in the middle of this attack (Flee, Bench Guard): set by
   * resolveAttackChoice when it resumes a paused attack. Without them the attack stops at the
   * first power to ask (`pendingAttackChoice.reaction`) and returns the state it was given.
   * The legacy positional form never asks (the powers aren't used).
   */
  reactions?: AttackReactions;
};

/** Options of getAttackCoinPlan / getAttackCoinFlipCount: the attacker's optional coins. */
export type AttackCoinOptions = Pick<ExecuteAttackOptions, "vermilionCoin">;

/** Night Spirits: the attacker's side's Pokémon in play (Active and Benched) with one of these names. */
function ownNamedInPlay(state: GameState | undefined, attacker: PokemonInPlay, names: string[]): number {
  const bench = state?.playerActivePokemon?.pokemon.id === attacker.pokemon.id ? state.playerBench : [];
  return [attacker, ...bench].filter((p) => names.includes(p.pokemon.name)).length;
}

/** Coins needed by an attack used by `attacker` (shared by all its coin effects). */
export function coinFlipCountFor(attacker: PokemonInPlay, attack: Attack, state?: GameState): number | "untilTails" {
  let count = 0;
  for (const effect of attack.effects ?? []) {
    if (!effect.coinFlip) continue;
    // Stone Barrage: flip until tails
    if (effect.coinFlip.untilTails) return "untilTails";
    // Big Eggsplosion: one coin per Energy attached (Double Colorless provides 2)
    // Thunderstorm: one coin per opponent's Benched Pokémon
    // Continuous Fireball: one coin per Energy card providing that type (Rainbow Energy counts)
    const n = effect.coinCountFromEnergyType
      ? attacker.attachedEnergy.filter((e) => energyProvidesType(e, effect.coinCountFromEnergyType!, attacker, state)).length
      : effect.coinCountFromEnergy
      ? getTotalEnergyValue(attacker.attachedEnergy)
      : effect.coinCountSource === "opponentBench"
        ? (state?.opponentBench.length ?? 0)
        : effect.coinCountSource === "ownNamedInPlay"
          ? ownNamedInPlay(state, attacker, effect.names ?? [])
          : effect.coinCountSource === "defenderCounters"
            // Pendulum Curse: one coin per damage counter on the Defending Pokémon
            ? Math.floor(((state ? opposingActive(state, attacker) : null)?.currentDamage ?? 0) / 10)
            : effect.coinFlip.count;
    count = Math.max(count, n);
  }
  return count;
}

/**
 * The coins of one attack, in the order they go in `coinResults`:
 *
 * 1. `smokescreen` (0 or 1): the attacker is under Sand-attack / Smokescreen. FIRST coin; tails =
 *    the attack does nothing (no other coin matters).
 * 2. `attack`: the attack's own coins (all its coin effects share them): a fixed number, or
 *    `"untilTails"` (Stone Barrage): a run of heads ending with the first tails (at least 1 coin).
 * 3. `stadium` (absent/0 or 1): the Stadium's coin the attacker opted into (Vermilion City Gym,
 *    `{ vermilionCoin: true }`): heads = 10 more damage to the Defending Pokémon if the attack
 *    damaged it (after Weakness and Resistance), tails = 10 damage to the attacker.
 * 4. `defender` (0 or 1): Haunter's Transparency on the Defending Pokémon, LAST coin (flipped
 *    for the defending player; heads = everything the attack does to Haunter is prevented). Only
 *    counted when the attack can do something to the Defending Pokémon (damage or an effect on
 *    it); it is ignored when the attack ended up doing nothing to it. The same slot is Dark
 *    Gyarados' Final Beam, Rocket's Hitmonchan's Crosscounter (heads = double the damage
 *    back) and Erika's Vileplume's Pollen Defense (heads = the attacker is Confused; flipped by
 *    Vileplume's owner, used only if the attack damaged it), all only when the attack can damage it.
 *
 * In multiplayer the server flips all of them. Use flipAttackCoins to build the list.
 */
export type AttackCoinPlan = {
  smokescreen: number;
  /**
   * The attacker's power coins, after Smokescreen's and before the attack's own: Rebellion (Misty's
   * Gyarados, 2 coins: both tails = the attack does nothing and it shuffles itself into the deck).
   * Absent = 0. Flipped by the attacking player.
   */
  power?: number;
  attack: number | "untilTails";
  /** The attacker's optional Stadium coin (Vermilion City Gym); absent = 0 */
  stadium?: number;
  defender: number;
  /**
   * Who flips the attack's own coins: present ("opponent") only when the defending player flips
   * them (Knock Down, Bench Manipulation: "your opponent flips"). Same position in coinResults.
   */
  attackFlipper?: "opponent";
  /**
   * Who flips the defender coin: present ("attacker") only when the attacking player flips it
   * (Rocket's Scyther's Shadow Images: "your opponent flips"); otherwise the defending player.
   */
  defenderFlipper?: "attacker";
};

/** Effect types that do something to the Defending Pokémon (Transparency flips for them). */
const DEFENDER_EFFECT_TYPES: ReadonlySet<string> = new Set([
  AttackEffectType.ApplyStatus,
  AttackEffectType.ForceSwitch,
  AttackEffectType.PreventRetreat,
  AttackEffectType.SandAttack,
  AttackEffectType.ReturnToHand,
  AttackEffectType.Discard,
  AttackEffectType.ChangeWeakness,
  AttackEffectType.ChooseTargetDamage,
  AttackEffectType.ShuffleDefenderIntoDeck,
  AttackEffectType.MoveDefenderEnergyToBench,
  AttackEffectType.DamageCountersOnDamaged,
  AttackEffectType.ChooseStatus,
  AttackEffectType.BlockEnergyAttach,
  AttackEffectType.RemoveStatus,
  AttackEffectType.SwapDamageCounters,
  AttackEffectType.MoveDamageCountersToDefender,
  AttackEffectType.SetRemainingHp,
  AttackEffectType.IntimidateLock,
  AttackEffectType.DiscardEnergyEachOpponent,
  AttackEffectType.LockDefenderAttack,
]);

/** Can the attack do anything to the Defending Pokémon (damage, or an effect on it)? */
function attackCanAffectDefender(attack: Attack): boolean {
  if (typeof attack.damage === "string" ? attack.damage.length > 0 : (attack.damage ?? 0) > 0) return true;
  return (attack.effects ?? []).some(
    (e) =>
      e.target === AttackTarget.Defender &&
      (DEFENDER_EFFECT_TYPES.has(e.type) ||
        e.type === AttackEffectType.CoinFlipDamage ||
        e.type === AttackEffectType.MirrorMove ||
        e.type === AttackEffectType.HalfHPDamage ||
        e.type === AttackEffectType.DamagePerCounter)
  );
}

/** Haunter's Transparency on this Defending Pokémon (a working PreventAttackOnFlip power). */
function defenderFlipsToPrevent(state: GameState, defender: PokemonInPlay | null): boolean {
  if (!defender || !isPokemonCard(defender.pokemon)) return false;
  const power = defender.pokemon.power;
  return power?.type === PokemonPowerType.PreventAttackOnFlip && isPowerActive(state, defender);
}

/** Can the attack do damage to the Defending Pokémon (Final Beam only matters then)? */
function attackCanDamageDefender(attack: Attack): boolean {
  if (typeof attack.damage === "string" ? attack.damage.length > 0 : (attack.damage ?? 0) > 0) return true;
  return (attack.effects ?? []).some(
    (e) =>
      e.type === AttackEffectType.CoinFlipDamage ||
      e.type === AttackEffectType.ChooseTargetDamage ||
      e.type === AttackEffectType.MirrorMove ||
      e.type === AttackEffectType.HalfHPDamage ||
      e.type === AttackEffectType.DamagePerCounter
  );
}

/**
 * Final Beam (Dark Gyarados) damage to the attacker that Knocked it Out: `amount` per Water
 * Energy card attached to it (Rainbow Energy counts), as damage of its type with the attacker's
 * Weakness and Resistance applied. The coin is the attack's defender coin (getAttackCoinPlan).
 */
export function knockOutRetaliationDamage(
  state: GameState,
  knockedOut: PokemonInPlay,
  attacker: PokemonInPlay
): number {
  const power = getKnockOutRetaliation(state, knockedOut);
  const knockedOutCard = getEffectivePokemonCard(state, knockedOut);
  const attackerCard = getEffectivePokemonCard(state, attacker);
  if (!power || !knockedOutCard || !attackerCard) return 0;
  const waterCards = knockedOut.attachedEnergy.filter((e) => energyProvidesType(e, EnergyTypeEnum.Water, knockedOut, state)).length;
  let damage = (power.amount ?? 20) * waterCards;
  const type = knockedOut.shiftedType ?? knockedOutCard.types[0];
  const weaknesses = attacker.modifiedWeakness ? [attacker.modifiedWeakness] : attackerCard.weaknesses ?? [];
  const resistances = attacker.modifiedResistance ? [attacker.modifiedResistance] : attackerCard.resistances ?? [];
  if (damage > 0 && type && weaknesses.includes(type) && !stadiumIgnoresWeakness(state, type, attacker)) damage *= 2;
  if (damage > 0 && type && resistances.includes(type)) damage = Math.max(0, damage - resistanceAmount(state));
  return damage;
}

/** Crosscounter / Fire Wall used by `pokemon` on the previous turn (working now), or undefined. */
export function activeCounterAttack(state: GameState, pokemon: PokemonInPlay | null | undefined): PokemonInPlay["counterAttack"] {
  const counter = pokemon?.counterAttack;
  return counter && counter.onTurn === state.turnNumber - 1 ? counter : undefined;
}

/**
 * Damage the Pokémon `damaged` (with a working CounterAttack) does back to `attacker` after the
 * attack did `damageDone` to it: `amount` or `damageDone` × `damageMultiplier`, 0 without heads on
 * its coin (`retaliationCoin`), Weakness / Resistance of the attacker for its type if
 * `applyWeaknessResistance`.
 */
export function counterAttackDamage(
  state: GameState,
  damaged: PokemonInPlay,
  damageDone: number,
  attacker: PokemonInPlay,
  coin?: CoinFlipResult
): number {
  const counter = activeCounterAttack(state, damaged);
  if (!counter || damageDone <= 0) return 0;
  if (counter.retaliationCoin && coin !== "heads") return 0;
  let damage = counter.amount ?? damageDone * (counter.damageMultiplier ?? 1);
  if (counter.applyWeaknessResistance) {
    const damagedCard = getEffectivePokemonCard(state, damaged);
    const attackerCard = getEffectivePokemonCard(state, attacker);
    const type = damaged.shiftedType ?? damagedCard?.types[0];
    const weaknesses = attacker.modifiedWeakness ? [attacker.modifiedWeakness] : attackerCard?.weaknesses ?? [];
    const resistances = attacker.modifiedResistance ? [attacker.modifiedResistance] : attackerCard?.resistances ?? [];
    if (type && weaknesses.includes(type) && !stadiumIgnoresWeakness(state, type, attacker)) damage *= 2;
    if (type && resistances.includes(type)) damage = Math.max(0, damage - resistanceAmount(state));
  }
  return damage;
}

/**
 * What the attack's defender coin (one at most) is for, or null when there is none:
 * Transparency (whenever the attack can affect the Defending Pokémon), then Final Beam, Shadow
 * Images (flipped by the attacker), Crosscounter, Pollen Defense, Fortitude (used only if the
 * attack Knocks it Out), Energy Drain and Shock Blast (used only if it damages it) — whenever the
 * attack can damage it.
 */
function defenderCoinKind(
  state: GameState,
  defender: PokemonInPlay | null,
  attack: Attack
): "transparency" | "finalBeam" | "evade" | "counterAttack" | "damagedStatus" | "fortitude" | "energyDrain" | "shockBlast" | null {
  if (!defender) return null;
  // Swift: nothing on the Defending Pokémon changes its damage (Transparency, Shadow Images)
  const unaffected = (attack.effects ?? []).some((e) => e.type === AttackEffectType.IgnoreDefenderEffects);
  if (!unaffected && defenderFlipsToPrevent(state, defender) && attackCanAffectDefender(attack)) return "transparency";
  if (!attackCanDamageDefender(attack)) return null;
  if (getKnockOutRetaliation(state, defender)) return "finalBeam";
  if (!unaffected && defender.evadeOnFlip) return "evade";
  if (activeCounterAttack(state, defender)?.retaliationCoin) return "counterAttack";
  // Pollen Defense (Erika's Vileplume): it isn't a change to the damage, so Swift doesn't skip it
  if (getDamagedStatusFlip(state, defender)) return "damagedStatus";
  // Gym Challenge: Giovanni's Machamp, Koga's Muk, Lt. Surge's Electrode
  if (getSurviveKnockOutPower(state, defender)) return "fortitude";
  if (getEnergyDrainPower(state, defender)) return "energyDrain";
  if (getShockBlastPower(state, defender)) return "shockBlast";
  return null;
}

/**
 * Coin plan of an attack used now by the side whose turn it is ("player"): see AttackCoinPlan.
 * @param attack - index into getAvailableAttacks(state, active) (its own attacks — a transformed
 *   Ditto's copied ones — then, with Recall, the attacks of the cards under it), or an Attack
 *   object (the attack copied by Metronome).
 */
export function getAttackCoinPlan(state: GameState, attack: number | Attack, options: AttackCoinOptions = {}): AttackCoinPlan {
  const none: AttackCoinPlan = { smokescreen: 0, attack: 0, defender: 0 };
  const attacker = state.playerActivePokemon;
  const card = attacker ? getEffectivePokemonCard(state, attacker) : undefined;
  if (!attacker || !card) return none;
  const resolved = typeof attack === "number" ? attackAt(state, attacker, attack) : attack;
  if (!resolved) return none;
  const defenderCoin = defenderCoinKind(state, state.opponentActivePokemon, resolved);
  const opponentFlips = (resolved.effects ?? []).some((e) => e.coinFlip && e.coinFlippedBy === "opponent");
  // Vermilion City Gym, only when the attacker opted in and the Stadium offers it
  const stadiumCoin = options.vermilionCoin && stadiumOffersAttackCoin(state, attacker);
  // Rebellion (Misty's Gyarados): 2 coins whenever it attacks, before the attack's own
  const powerCoins = getRebellionPower(state, attacker) ? 2 : 0;
  return {
    smokescreen: smokescreenCoins(attacker),
    ...(powerCoins > 0 && { power: powerCoins }),
    attack: coinFlipCountFor(attacker, resolved, state),
    ...(stadiumCoin && { stadium: 1 }),
    defender: defenderCoin ? 1 : 0,
    ...(defenderCoin === "evade" && { defenderFlipper: "attacker" as const }),
    ...(opponentFlips && { attackFlipper: "opponent" as const }),
  };
}

/** Flip the coins of a plan in order (smokescreen, power, the attack's own — until tails if so —, stadium, defender). */
export function flipAttackCoins(plan: AttackCoinPlan, flip: () => CoinFlipResult): CoinFlipResult[] {
  const coins: CoinFlipResult[] = [];
  for (let i = 0; i < plan.smokescreen; i++) coins.push(flip());
  for (let i = 0; i < (plan.power ?? 0); i++) coins.push(flip());
  if (plan.attack === "untilTails") {
    for (let guard = 0; guard < 1000; guard++) {
      const coin = flip();
      coins.push(coin);
      if (coin === "tails") break;
    }
  } else {
    for (let i = 0; i < plan.attack; i++) coins.push(flip());
  }
  for (let i = 0; i < (plan.stadium ?? 0); i++) coins.push(flip());
  for (let i = 0; i < plan.defender; i++) coins.push(flip());
  return coins;
}

/** Split `coinResults` along the plan; throws when they don't fit it (a caller bug). */
function splitAttackCoins(
  plan: AttackCoinPlan,
  coins: CoinFlipResult[],
  attackName: string
): { smokescreen: CoinFlipResult[]; power: CoinFlipResult[]; attack: CoinFlipResult[]; stadium: CoinFlipResult[]; defender: CoinFlipResult[] } {
  const fail = (expected: string): never => {
    throw new Error(`executeAttack: "${attackName}" needs ${expected} coin result(s) (getAttackCoinPlan), got ${coins.length}`);
  };
  const stadiumCount = plan.stadium ?? 0;
  const after = stadiumCount + plan.defender;
  const before = plan.smokescreen + (plan.power ?? 0);
  const smokescreen = coins.slice(0, plan.smokescreen);
  const power = coins.slice(plan.smokescreen, before);
  const rest = coins.slice(before);
  let attackCount: number;
  if (plan.attack === "untilTails") {
    const tailsAt = rest.indexOf("tails");
    if (tailsAt === -1) fail(`${before} + a run ending in tails + ${after}`);
    attackCount = tailsAt + 1;
    if (rest.length !== attackCount + after) fail(`${before} + ${attackCount} (until tails) + ${after}`);
  } else {
    attackCount = plan.attack;
    if (coins.length !== before + attackCount + after) fail(String(before + attackCount + after));
  }
  return {
    smokescreen,
    power,
    attack: rest.slice(0, attackCount),
    stadium: rest.slice(attackCount, attackCount + stadiumCount),
    defender: rest.slice(attackCount + stadiumCount),
  };
}

/**
 * How many coins the side whose turn it is ("player") must flip before using an attack:
 * pass the result to executeAttack / executeMetronome as `coinResults`.
 *
 * @param attack - index into getAvailableAttacks(state, active) (Recall's attacks follow the own
 *   ones), or an Attack object for an attack used through Metronome (the copied attack;
 *   Energy-based counts use the Metronome user).
 * @returns 0 when the attack has no coin effects (or there is no active Pokémon/attack).
 */
export function getAttackCoinFlipCount(state: GameState, attack: number | Attack, options: AttackCoinOptions = {}): number {
  const plan = getAttackCoinPlan(state, attack, options);
  // "untilTails" (Stone Barrage) has no fixed count: the minimum (tails at once) is returned;
  // callers must use getAttackCoinPlan + flipAttackCoins for those
  return plan.smokescreen + (plan.power ?? 0) + (plan.attack === "untilTails" ? 1 : plan.attack) + (plan.stadium ?? 0) + plan.defender;
}

/**
 * Sand-attack / Smokescreen: a Pokémon with `mustFlipToAttack` flips one extra coin when it
 * attacks; it is the FIRST of `coinResults` (tails: the attack does nothing).
 */
function smokescreenCoins(attacker: PokemonInPlay): number {
  return attacker.mustFlipToAttack ? 1 : 0;
}

/**
 * Energy Bomb / Electric Current (MoveAllEnergyToBench): the attached Energy cards still to move,
 * in order — every card, or with `energyType` those providing it (printed type first, Rainbow
 * Energy last) — at most `amount` minus the `moved` ones.
 */
export function energyToMove(attacker: PokemonInPlay, effect: AttackEffect, moved = 0): GameCard[] {
  const type = effect.energyType;
  const cards = type
    ? [
        ...attacker.attachedEnergy.filter((e) => energyProvidesType(e, type, attacker) && !(isEnergyCard(e) && e.providesAllTypes)),
        ...attacker.attachedEnergy.filter((e) => energyProvidesType(e, type, attacker) && isEnergyCard(e) && e.providesAllTypes),
      ]
    : attacker.attachedEnergy;
  return cards.slice(0, Math.max(0, (effect.amount ?? Infinity) - moved));
}

/** An attached card as it is once it leaves play (a Mysterious Fossil can't be attached, but be safe). */
function cardOutOfPlayEnergy(card: GameCard): GameCard {
  return cardOutOfPlay(card);
}

/**
 * Mass Explosion's second part (DamageNamedInPlay) as the effects the pipeline already knows:
 * self damage when the attacker is named, and bench damage to the named Benched Pokémon of
 * both sides (the Defending Pokémon's share is added in executeAttack).
 */
function expandNamedDamage(attack: Attack, attackerName: string): Attack {
  if (!attack.effects?.some((e) => e.type === AttackEffectType.DamageNamedInPlay)) return attack;
  return {
    ...attack,
    effects: attack.effects.flatMap((e): AttackEffect[] => {
      if (e.type !== AttackEffectType.DamageNamedInPlay || e.coinFlip) return [e];
      const names = e.names ?? [];
      return [
        e,
        ...(names.includes(attackerName) ? [{ type: AttackEffectType.SelfDamage, target: AttackTarget.Self, amount: e.amount } as AttackEffect] : []),
        { type: AttackEffectType.BenchDamage, target: AttackTarget.Defender, amount: e.amount, benchTarget: BenchDamageTarget.Both, benchNameFilter: names },
      ];
    }),
  };
}

// ============================================================================
// ATTACK LEGALITY
// ============================================================================

/**
 * Why the side whose turn it is ("player") can't use its Active Pokémon's attack
 * `attackIndex` right now, or null. executeAttack enforces it (throws IllegalActionError).
 *
 * Checks: normal-action blocker (PLAYING phase, your turn, nothing pending, not already
 * attacked this turn), both Active Pokémon present, Asleep / Paralyzed / Leer's "can't
 * attack", attack requirements on the Defending Pokémon (Dream Eater), "once while in play"
 * attacks, Energy cost (Double Colorless = 2, Energy Burn, Buzzap) and discard costs, and
 * Call for Family with a full bench.
 *
 * Classic (1999) rule: the starting player MAY attack on its first turn, so there is no
 * first-turn check. Confusion is not a reason (it is resolved by resolveConfusionFlip first).
 */
export function canExecuteAttack(state: GameState, attackIndex: number): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const attacker = state.playerActivePokemon;
  const defender = state.opponentActivePokemon;
  if (!attacker || !defender) return "No hay Pokémon para atacar";
  // A transformed Ditto uses the Defending Pokémon's attacks
  const attackerCard = getEffectivePokemonCard(state, attacker);
  if (!attackerCard) return "Tu Pokémon activo no puede atacar";
  const attack = attackAt(state, attacker, attackIndex);
  if (!attack) {
    // A lower stage's attack without Recall
    const recallable = !recallAppliesTo(state, attacker) && listAttacks(state, attacker, true)[attackIndex];
    return recallable ? `Para usar los ataques de las cartas que ${attacker.pokemon.name} tiene debajo debes jugar Recall este turno` : "Ese ataque no existe";
  }
  const name = attacker.pokemon.name;
  if (hasStatusCondition(attacker, StatusCondition.Asleep)) return `${name} está dormido y no puede atacar`;
  if (hasStatusCondition(attacker, StatusCondition.Paralyzed)) return `${name} está paralizado y no puede atacar`;
  if (hasStatusCondition(attacker, StatusCondition.CannotAttack)) return `${name} no puede atacar este turno`;
  // Tunneling / Screaming Headbutt used on its previous turn
  if (attacker.attackLock?.onTurn === state.turnNumber && !attacker.attackLock.attackName) return `${name} no puede atacar este turno`;
  if (attacker.attackLock?.onTurn === state.turnNumber && attacker.attackLock.attackName === attack.name) {
    return `${name} no puede usar ${attack.name} este turno`;
  }
  const requirement = getAttackRequirementFailure(attack, defender, attacker, state.opponentBench, state.playerBench) ??
    attackTurnBlocker(state, attacker, attack);
  if (requirement) return requirement;
  const luckyDuel = getLuckyDuelAttackBlocker(state, attack);
  if (luckyDuel) return luckyDuel;
  const isUseOnce = attack.effects?.some((e) => e.type === AttackEffectType.UseOnce);
  if (isUseOnce && attacker.usedOnceAttacks?.includes(attack.name)) return `${attack.name} ya fue usado`;
  if (!canUseAttack(attacker, attackIndex, undefined, state)) return `${name} no tiene la energía necesaria para ${attack.name}`;
  // Group Attack's "you may search" before the damage (beforeDamage) is optional: a full Bench only skips it
  const searchesDeck = attack.effects?.some(
    (e) => e.type === AttackEffectType.DeckSearch || (e.type === AttackEffectType.SearchDeckChoice && e.destination === "bench" && !e.beforeDamage)
  );
  if (searchesDeck && isBenchFull(state, "player")) {
    return "Tu banca está llena, no puedes usar este ataque";
  }
  return null;
}

/** The other side's Active Pokémon when `pokemon` is an Active (null otherwise). */
function opposingActive(state: GameState, pokemon: PokemonInPlay): PokemonInPlay | null {
  if (state.playerActivePokemon?.pokemon.id === pokemon.pokemon.id) return state.opponentActivePokemon;
  if (state.opponentActivePokemon?.pokemon.id === pokemon.pokemon.id) return state.playerActivePokemon;
  return null;
}

/**
 * Why `attacker` can't use `attack` this turn because of an earlier turn (Spanish reason), or
 * null: Earthdrill (RequireLastAttack: its owner's previous turn is turnNumber − 2) and
 * Intimidate on it while the Pokémon that used it is the Defending Pokémon.
 */
function attackTurnBlocker(state: GameState, attacker: PokemonInPlay, attack: Attack): string | null {
  for (const effect of attack.effects ?? []) {
    if (effect.type !== AttackEffectType.RequireLastAttack || !effect.attackName) continue;
    const last = attacker.lastAttack;
    if (!last || last.name !== effect.attackName || last.turn !== state.turnNumber - 2) {
      return `No puedes usar ${attack.name}: ${attacker.pokemon.name} no usó ${effect.attackName} en su turno anterior`;
    }
  }
  const lock = attacker.intimidatedBy;
  if (lock && lock.onTurn === state.turnNumber) {
    const defender = opposingActive(state, attacker);
    if (defender && defender.pokemon.id === lock.pokemonId) {
      return `${attacker.pokemon.name} no puede atacar a ${defender.pokemon.name} este turno (${lock.attackName})`;
    }
  }
  return null;
}

/**
 * The attack's effects as they apply to this attacker now: effects gated on its Special
 * Condition dropped when it doesn't have it (Poison Power), self damage per Energy card of a type
 * made a plain amount (Electroburn) and doubled by Focus Energy.
 */
function conditionAttackEffects(attack: Attack, attacker: PokemonInPlay, state: GameState, doubled: boolean): Attack {
  if (!attack.effects) return attack;
  const effects = attack.effects
    .filter((e) => !e.onlyIfSelfStatus || hasStatusCondition(attacker, e.onlyIfSelfStatus))
    .map((e) => {
      if (e.type !== AttackEffectType.SelfDamage || e.coinFlip) return e;
      const perType = e.perEnergyType;
      const amount = perType
        ? (e.amount ?? 0) * attacker.attachedEnergy.filter((c) => energyProvidesType(c, perType, attacker, state)).length
        : e.amount;
      return { ...e, amount: doubled && amount ? amount * 2 : amount };
    });
  return { ...attack, effects };
}

/** Index of the Metronome-style (CopyAttack) attack of the player's Active Pokémon, or -1. */
function copyAttackIndex(state: GameState): number {
  const attacker = state.playerActivePokemon;
  const card = attacker ? getEffectivePokemonCard(state, attacker) : undefined;
  if (!card) return -1;
  return getAvailableAttacks(state, attacker!).findIndex(({ attack }) => attack.effects?.some((e) => e.type === AttackEffectType.CopyAttack));
}

/**
 * Why Metronome (Clefairy / Clefable) can't copy `copiedAttack` now, or null: Metronome
 * itself must be usable (its own cost, statuses, turn...) and `copiedAttack` must be one of
 * the Defending Pokémon's attacks whose requirements are met.
 */
export function canExecuteMetronome(state: GameState, copiedAttack: Attack): string | null {
  const index = copyAttackIndex(state);
  if (index === -1) return "Tu Pokémon activo no tiene Metrónomo";
  const reason = canExecuteAttack(state, index);
  if (reason) return reason;
  const defender = state.opponentActivePokemon!;
  const defenderCard = getEffectivePokemonCard(state, defender);
  const copyable = !!defenderCard && defenderCard.attacks.some((a) => a.name === copiedAttack.name);
  if (!copyable) return "Metrónomo solo puede copiar un ataque del Pokémon Defensor";
  const requirement = getAttackRequirementFailure(copiedAttack, defender, undefined, state.opponentBench, state.playerBench);
  if (requirement) return requirement;
  return getLuckyDuelAttackBlocker(state, copiedAttack);
}

const NON_STATUS_COIN_OUTCOMES = ["damage", "protection", "preventRetreat"];

export type CoinResolution = {
  /** The attack's effects with every coin effect turned into a plain effect (or dropped). */
  effects: AttackEffect[];
  /** Coin effects that did not happen (tails on Scrunch...), for log messages. */
  missed: AttackEffect[];
  /** The attack has coin damage (CoinFlipDamage / coin BonusDamage). */
  hasCoinDamage: boolean;
};

/**
 * Turn coin effects into the equivalent non-coin effects for these flips, so the regular
 * effects pipeline in executeAttack applies them (one damage value before weakness and
 * resistance, KO checks, protection, immunity...). All coin effects of an attack share the
 * same coins (Thrash: one coin decides +10 or 10 to itself).
 *
 * - An effect "happens" once per matching coin: heads if `onHeads` is set, tails if
 *   `onTails` is set (the value only matters for ApplyStatus, where it is the status).
 * - CoinFlipDamage / coin BonusDamage → CoinFlipDamage with amount × matching coins
 *   (calculateBaseDamage adds it to the base damage).
 * - SelfDamage / Heal → amount × matching coins. ApplyStatus → the status for the coin side.
 * - Protection, PreventRetreat, Draw (Pay Day) and anything else → kept once if any coin matches.
 */
export function resolveCoinFlipEffects(effects: AttackEffect[], coins: CoinFlipResult[]): CoinResolution {
  // (Thunderstorm) perCoinBenchTarget: coin i decides the i-th Benched Pokémon of the target side
  const heads = coins.filter((c) => c === "heads").length;
  const tails = coins.length - heads;
  const resolved: AttackEffect[] = [];
  const missed: AttackEffect[] = [];
  let hasCoinDamage = false;

  for (const effect of effects) {
    if (!effect.coinFlip) {
      resolved.push(effect);
      continue;
    }
    const { coinFlip, coinCountFromEnergy: _fromEnergy, ...plain } = effect;
    const hits = (coinFlip.onHeads ? heads : 0) + (coinFlip.onTails ? tails : 0);

    // Surprise Thunder: the first coin must be heads; the second one picks the amount
    if (effect.secondCoinAmounts) {
      if (coins[0] !== "heads") missed.push(effect);
      else resolved.push({ ...plain, amount: coins[1] === "heads" ? effect.secondCoinAmounts.heads : effect.secondCoinAmounts.tails });
      continue;
    }
    // Petal Whirlwind: the effect needs at least `minHits` matching coins
    if (coinFlip.minHits !== undefined && hits < coinFlip.minHits) {
      missed.push(effect);
      continue;
    }
    // ESP (Misty's Psyduck): the effect needs exactly `exactHits` matching coins
    if (coinFlip.exactHits !== undefined && hits !== coinFlip.exactHits) {
      missed.push(effect);
      continue;
    }

    if (effect.type === AttackEffectType.CoinFlipDamage || effect.type === AttackEffectType.BonusDamage) {
      hasCoinDamage = true;
      resolved.push({ ...plain, type: AttackEffectType.CoinFlipDamage, target: AttackTarget.Defender, amount: (effect.amount ?? 0) * hits });
      continue;
    }

    if (effect.type === AttackEffectType.ApplyStatus) {
      const isStatus = (v: string | undefined): v is StatusCondition => !!v && !NON_STATUS_COIN_OUTCOMES.includes(v);
      const status =
        heads > 0 && isStatus(coinFlip.onHeads) ? coinFlip.onHeads
        : tails > 0 && isStatus(coinFlip.onTails) ? coinFlip.onTails
        : undefined;
      if (status) resolved.push({ ...plain, status });
      else missed.push(effect);
      continue;
    }

    if (effect.type === AttackEffectType.BenchDamage && effect.perCoinBenchTarget) {
      const wanted = coinFlip.onHeads ? "heads" : "tails";
      const indexes = coins.map((c, i) => (c === wanted ? i : -1)).filter((i) => i !== -1);
      if (indexes.length === 0) missed.push(effect);
      else resolved.push({ ...plain, benchTargetIndexes: indexes });
      continue;
    }
    if (hits === 0) {
      missed.push(effect);
      continue;
    }
    if (
      effect.type === AttackEffectType.SelfDamage || effect.type === AttackEffectType.Heal ||
      effect.type === AttackEffectType.BenchDamage || effect.type === AttackEffectType.ChooseTargetDamage
    ) {
      // Healing Pollen: "for each heads, remove 1 damage counter"; Bonfire: 10 × heads to each
      // Benched Pokémon; Magic Darts: 10 × heads to the chosen Pokémon
      resolved.push({ ...plain, amount: (effect.amount ?? 0) * hits });
    } else if (effect.type === AttackEffectType.Discard && effect.energyType && !effect.discardAll) {
      // Continuous Fireball: one Fire Energy card per heads
      resolved.push({ ...plain, amount: (effect.amount ?? 1) * hits });
    } else if (effect.type === AttackEffectType.RecoverFromDiscard) {
      // Call Will-o'-the-wisp: one card (at least, when `minAmount` is set) per heads
      const per = effect.amount ?? 1;
      resolved.push({ ...plain, amount: per * hits, ...(effect.minAmount !== undefined && { minAmount: effect.minAmount * hits }) });
    } else {
      resolved.push(plain);
    }
  }

  return { effects: resolved, missed, hasCoinDamage };
}


/**
 * Uses an attack of the active Pokémon of the side whose turn it is ("player") against the
 * opponent's active Pokémon, resolving damage, effects, knockouts and (by default) endTurn.
 * `attackIndex` indexes getAvailableAttacks(state, active): the Active's own attacks first (a
 * transformed Ditto's copied ones), then — the turn Recall was played — the attacks of the cards
 * under it.
 *
 * Two call forms:
 *
 * - **Options object (engine-owned coins)**: `executeAttack(state, i, { coinResults, ... })`.
 *   The caller flips `getAttackCoinFlipCount(state, i)` coins and passes them; the engine
 *   resolves every coin effect (coin damage before weakness/resistance, statuses, self
 *   damage, protection, prevent retreat, Pay Day...). Throws if the number of coins doesn't
 *   match (a caller bug: it would otherwise silently change the outcome).
 * - **Legacy positional booleans** `(state, i, skipEndTurn?, skipDefenderPromotion?, selectedEnergyIds?)`:
 *   unchanged behaviour — effects with `coinFlip` are SKIPPED and the caller applies them.
 *   Deprecated; kept so consumers can migrate one at a time.
 *
 * @example
 * const coins = Array.from({ length: getAttackCoinFlipCount(state, 1) }, flipCoin);
 * const next = executeAttack(state, 1, { coinResults: coins });
 */
export function executeAttack(gameState: GameState, attackIndex: number, options?: ExecuteAttackOptions): GameState;
/** @deprecated Coin effects are skipped in this form; pass `{ coinResults }` instead. */
export function executeAttack(
  gameState: GameState,
  attackIndex: number,
  skipEndTurn?: boolean,
  skipDefenderPromotion?: boolean,
  selectedEnergyIds?: string[]
): GameState;
export function executeAttack(
  gameState: GameState,
  attackIndex: number,
  skipEndTurnOrOptions: boolean | ExecuteAttackOptions = false,
  skipDefenderPromotionArg: boolean = false,
  selectedEnergyIdsArg?: string[]
): GameState {
  assertLegal(canExecuteAttack(gameState, attackIndex));
  // A discard cost chosen by the player (Fire Spin, Kindle...) must pay it: the right cards, attached
  const selected = typeof skipEndTurnOrOptions === "object" ? skipEndTurnOrOptions.selectedEnergyIds : selectedEnergyIdsArg;
  const attacker = gameState.playerActivePokemon;
  const discardCost = attacker && selected && selected.length > 0 ? getAttackDiscardRequirement(attacker, attackIndex, gameState) : null;
  if (attacker && discardCost && selected) assertLegal(checkDiscardSelection(attacker, discardCost, selected, gameState));
  return executeAttackUnchecked(gameState, attackIndex, skipEndTurnOrOptions, skipDefenderPromotionArg, selectedEnergyIdsArg);
}

/** executeAttack without the legality guard (executeMetronome checks Metronome itself). */
function executeAttackUnchecked(
  gameState: GameState,
  attackIndex: number,
  skipEndTurnOrOptions: boolean | ExecuteAttackOptions,
  skipDefenderPromotionArg: boolean,
  selectedEnergyIdsArg?: string[],
  copiedAttack?: Attack
): GameState {
  const options = typeof skipEndTurnOrOptions === "object" && skipEndTurnOrOptions !== null
    ? skipEndTurnOrOptions
    : undefined;
  const reactions: AttackReactions = options?.reactions ?? {};
  // Koga's Ninja Trick answered with a switch: the switched-in Pokémon defends for the whole
  // attack (a no-op once done: a later question resumes from the switched state)
  if (options && reactions.preAttack) gameState = applyNinjaTrickSwitch(gameState, reactions.preAttack);
  // A power asked mid-attack (Flee, Bench Guard) returns this state untouched with the question
  const inputState = gameState;
  const skipEndTurn = options ? !!options.skipEndTurn : !!skipEndTurnOrOptions;
  const skipDefenderPromotion = options ? !!options.skipDefenderPromotion : skipDefenderPromotionArg;
  const selectedEnergyIds = options ? options.selectedEnergyIds : selectedEnergyIdsArg;

  const attacker = gameState.playerActivePokemon;
  const defender = gameState.opponentActivePokemon;

  if (!attacker || !defender) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No hay Pokémon para atacar", "info"),
      ],
    };
  }

  // The cards the rules see: a transformed Ditto is a copy of the other Active (Transform)
  const attackerCard = getEffectivePokemonCard(gameState, attacker);
  const defenderCard = getEffectivePokemonCard(gameState, defender);
  if (!attackerCard || !defenderCard) {
    return gameState;
  }
  const attackerView: PokemonInPlay = { ...attacker, pokemon: attackerCard };
  const defenderView: PokemonInPlay = { ...defender, pokemon: defenderCard };

  // getAvailableAttacks indices: Recall's attacks follow the Active's own
  const printedAttack = attackAt(gameState, attacker, attackIndex);
  if (!printedAttack) return gameState;

  // Koga's Ninja Trick (Gym Challenge): the defender's question comes before anything of the
  // attack, its coins included (they depend on the Pokémon that defends: Transparency...)
  const preAttackStep = options && reactions.preAttack === undefined ? ninjaTrickStep(gameState, printedAttack.name) : null;
  if (preAttackStep) {
    return pauseForReaction(
      inputState,
      {
        answers: "preAttack",
        powerName: KOGAS_NINJA_TRICK,
        pokemonId: defender.pokemon.id,
        side: "opponent",
        // The caller's coins (if any) are replaced by the answer's (getAttackChoiceCoinPlan)
        resume: { kind: "attack", attackIndex, ...(copiedAttack && { copiedAttack }), options: { ...options!, reactions } },
      },
      preAttackStep,
      reactionContext(attacker, defender, printedAttack.name, gameState)
    );
  }

  // Coin flips: in the options form the engine resolves coin effects from the caller's coins,
  // laid out as getAttackCoinPlan says (Sand-attack/Smokescreen first, Transparency last).
  // Vermilion City Gym's optional coin: only when the Stadium offers it to this attacker
  if (options?.vermilionCoin && !stadiumOffersAttackCoin(gameState, attacker)) {
    throw new IllegalActionError("El Estadio en juego no ofrece una moneda a este Pokémon");
  }
  const coinPlan = getAttackCoinPlan(gameState, printedAttack, { vermilionCoin: options?.vermilionCoin });
  const allCoins = options ? (options.coinResults ?? []) : undefined;
  const splitCoins = allCoins ? splitAttackCoins(coinPlan, allCoins, printedAttack.name) : undefined;
  if (splitCoins && splitCoins.smokescreen.length > 0) {
    const coin = splitCoins.smokescreen[0];
    const events = [
      ...gameState.events,
      createGameEvent(`${attacker.pokemon.name} debe lanzar una moneda para atacar - Moneda: [coin:${coin}]`, "info"),
    ];
    if (coin === "tails") {
      // The attack is used but does nothing; the turn ends like after any attack
      const failed: GameState = {
        ...gameState,
        attackedThisTurn: true,
        events: [...events, createGameEvent(`${attacker.pokemon.name} usó ${printedAttack.name} pero el ataque no hizo nada`, "action")],
      };
      return skipEndTurn ? failed : endTurn(failed);
    }
    gameState = { ...gameState, events: [...events, createGameEvent("[coin:heads] El ataque procede normalmente", "info")] };
  }
  // Rebellion (Misty's Gyarados): both tails = the attack does nothing (no Energy discard either);
  // Gyarados and every card attached go into its owner's deck (not a Knock Out: no Prize)
  if (splitCoins && splitCoins.power.length > 0) {
    const rebellion = getRebellionPower(gameState, attacker);
    const tokens = splitCoins.power.map((c) => `[coin:${c}]`).join(" ");
    const coinEvent = createGameEvent(`${rebellion?.name ?? "Rebelión"} de ${attacker.pokemon.name} - Monedas: ${tokens}`, "info");
    if (splitCoins.power.every((c) => c === "tails")) {
      const needsToPromote = gameState.playerBench.length > 0;
      const shuffled: GameState = {
        ...gameState,
        playerActivePokemon: null,
        playerDeck: shuffle([...gameState.playerDeck, ...cardsLeavingPlay(attacker)]),
        playerNeedsToPromote: needsToPromote,
        attackedThisTurn: true,
        events: [
          ...gameState.events,
          coinEvent,
          createGameEvent(`${attacker.pokemon.name} usó ${printedAttack.name} pero el ataque no hizo nada`, "action"),
          createGameEvent(`¡${attacker.pokemon.name} y todas sus cartas se barajaron en el mazo de su dueño!`, "action"),
          ...(needsToPromote ? [createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")] : []),
        ],
      };
      const done = releaseOrphanModifiers(endGameIfNoPokemonLeft(shuffled));
      // The turn waits for the promotion, as after the attacker's own Knock Out
      return skipEndTurn || done.gameResult !== null || done.playerNeedsToPromote ? done : endTurn(done);
    }
    gameState = { ...gameState, events: [...gameState.events, coinEvent] };
  }
  // What to run again once a question asked mid-attack is answered (ESP, Charity, Flee)
  const resumeAttack = (): AttackResume => ({ kind: "attack", attackIndex, ...(copiedAttack && { copiedAttack }), options: { ...options!, reactions } });

  // Sabrina's ESP (Gym Heroes) attached to the attacker: it may re-flip all of the attack's own
  // coins once (not Smokescreen's, the Stadium's or the defender's coin) — asked as soon as they
  // are known, before anything they decide; the new coins come from the caller with the answer
  const ownCoins = splitCoins?.attack;
  const esp = options && ownCoins && ownCoins.length > 0 ? attachedTrainerNamed(attacker, SABRINAS_ESP) : undefined;
  if (esp && ownCoins && reactions.espReflip === undefined) {
    const plan: AttackCoinPlan = {
      smokescreen: 0,
      attack: coinPlan.attack,
      defender: 0,
      ...(coinPlan.attackFlipper && { attackFlipper: coinPlan.attackFlipper }),
    };
    return pauseForReaction(
      inputState,
      { answers: "espReflip", powerName: SABRINAS_ESP, pokemonId: attacker.pokemon.id, side: "player", resume: resumeAttack() },
      espReflipStep(printedAttack.name, ownCoins),
      reactionContext(attacker, defender, printedAttack.name, gameState),
      { option: ESP_REFLIP_OPTION, coins: ownCoins, plan }
    );
  }
  const reflipped = esp && reactions.espReflip ? reactions.espReflip : undefined;
  if (reflipped) checkCoins(coinPlan.attack, reflipped);
  const coinResults = reflipped ?? ownCoins;
  // The log keeps the coins ESP replaced
  const espEvents: GameEvent[] = reflipped && ownCoins
    ? [
        createGameEvent(`${ownCoins.length === 1 ? "Moneda" : "Monedas"}: ${ownCoins.map((r) => `[coin:${r}]`).join(" ")}`, "info"),
        createGameEvent(`${SABRINAS_ESP}: se vuelven a lanzar todas las monedas de ${printedAttack.name}`, "action"),
      ]
    : [];
  const coinResolution = coinResults && coinResults.length > 0
    ? resolveCoinFlipEffects(printedAttack.effects ?? [], coinResults)
    : null;
  // Focus Energy (Lt. Surge's Raticate): this turn the attack's damage and self damage are doubled
  const doubledAttack = attacker.doubledAttack?.onTurn === gameState.turnNumber && attacker.doubledAttack.name === printedAttack.name;
  const expandedAttack: Attack = conditionAttackEffects(
    expandNamedDamage(coinResolution ? { ...printedAttack, effects: coinResolution.effects } : printedAttack, attacker.pokemon.name),
    attacker,
    gameState,
    doubledAttack
  );
  // The Stadium's coin the attacker opted into (Vermilion City Gym): heads adds damage below,
  // tails = damage to the attacker besides whatever the attack does (the self-damage effect)
  const stadiumCoin = splitCoins?.stadium[0];
  const attack: Attack = stadiumCoin === "tails"
    ? {
        ...expandedAttack,
        effects: [
          ...(expandedAttack.effects ?? []),
          { type: AttackEffectType.SelfDamage, target: AttackTarget.Self, amount: VERMILION_COIN_DAMAGE } as AttackEffect,
        ],
      }
    : expandedAttack;
  // The defending side's coin, last in the list: Transparency (Haunter) or Final Beam (Dark Gyarados)
  const defenderCoin = splitCoins?.defender[0];
  const defenderPowerType = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.type : undefined;
  const transparencyCoin = defenderPowerType === PokemonPowerType.PreventAttackOnFlip ? defenderCoin : undefined;
  const finalBeamCoin = defenderPowerType === PokemonPowerType.KnockOutRetaliation ? defenderCoin : undefined;
  const defenderCoinFor = defenderCoinKind(gameState, defender, printedAttack);
  const counterAttackCoin = defenderCoinFor === "counterAttack" ? defenderCoin : undefined;
  // Pollen Defense (Erika's Vileplume): heads = the attacker is Confused if this attack damages it
  const damagedStatusCoin = defenderCoinFor === "damagedStatus" ? defenderCoin : undefined;
  // Gym Challenge defender coins: Fortitude (heads: survives with 10 HP), Energy Drain (heads: its
  // owner discards an Energy card of the attacker), Shock Blast (tails: 20 to each Active)
  const fortitudeCoin = defenderCoinFor === "fortitude" ? defenderCoin : undefined;
  const energyDrainCoin = defenderCoinFor === "energyDrain" ? defenderCoin : undefined;
  const shockBlastCoin = defenderCoinFor === "shockBlast" ? defenderCoin : undefined;
  // Shadow Images: tails = this attack does no damage to the Defending Pokémon
  const evadeCoin = defenderCoinFor === "evade" ? defenderCoin : undefined;

  // Dive Bomb / Clamp tails: "this attack does nothing (not even damage)"
  if (attack.effects?.some((e) => e.type === AttackEffectType.AttackFails && !e.coinFlip && !e.defenderOnly)) {
    const tokens = (coinResults ?? []).map((r) => `[coin:${r}]`).join(" ");
    const failed: GameState = {
      ...gameState,
      attackedThisTurn: true,
      events: [
        ...gameState.events,
        ...espEvents,
        ...(tokens ? [createGameEvent(`Moneda: ${tokens}`, "info")] : []),
        createGameEvent(`${attacker.pokemon.name} usó ${attack.name} pero el ataque no hizo nada`, "action"),
      ],
    };
    return skipEndTurn ? failed : endTurn(failed);
  }

  // RequireStatus (Dream Eater): the attack can't be used unless the defender has the status
  if (!meetsAttackRequirements(attack, defender, attacker, gameState.opponentBench, gameState.playerBench)) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent(`No puedes usar ${attack.name}: el Pokémon defensor no cumple el requisito del ataque`, "info"),
      ],
    };
  }

  // Group Attack: "before doing damage, you may search your deck for Basic Pokémon named X and put
  // them onto your Bench" — asked of the attacker before anything else of the attack happens
  const preSearch = options ? attack.effects?.find((e) => e.type === AttackEffectType.SearchDeckChoice && e.beforeDamage) : undefined;
  if (preSearch) {
    const room = maxBenchSize(gameState, "player") - gameState.playerBench.length;
    const found = gameState.playerDeck.filter((c) => matchesDeckCardFilter(c, preSearch.deckFilter));
    if (reactions.beforeDamageSearch === undefined && room > 0 && found.length > 0) {
      const max = Math.min(room, found.length);
      return pauseForReaction(
        inputState,
        { answers: "beforeDamageSearch", powerName: printedAttack.name, pokemonId: attacker.pokemon.id, side: "player", resume: resumeAttack() },
        {
          title: printedAttack.name,
          description: `Antes de hacer el daño puedes buscar en tu mazo hasta ${max} Pokémon Básicos llamados ${preSearch.deckFilter?.names?.join(" o ") ?? ""} para ponerlos en tu Banca`,
          ...wholeDeckChoice(gameState.playerDeck, (c) => found.includes(c)),
          maxSelections: max,
          minSelections: 0,
          disableAutoSelect: true,
          chooser: "self",
          defaultSelection: [],
        },
        reactionContext(attacker, defender, printedAttack.name, gameState)
      );
    }
    const taken = found.filter((c) => reactions.beforeDamageSearch?.includes(c.id)).slice(0, Math.max(0, room));
    if (taken.length > 0) {
      gameState = {
        ...gameState,
        playerDeck: shuffle(gameState.playerDeck.filter((c) => !taken.some((t) => t.id === c.id))),
        playerBench: [...gameState.playerBench, ...taken.map((c) => newBenchedPokemon(c, gameState.turnNumber))],
        events: [...gameState.events, createGameEvent(`${printedAttack.name}: ${taken.map((c) => c.name).join(", ")} a la Banca. Se mezcló el mazo`, "action")],
      };
    }
  }

  // Block DeckSearch attacks when bench is full (TCG rule: "No puedes usar este ataque si tu Banca está llena.")
  const hasDeckSearchEffect = attack.effects?.some(e => e.type === AttackEffectType.DeckSearch);
  if (hasDeckSearchEffect) {
    const benchCount = gameState.playerBench.filter(p => p !== null).length;
    if (benchCount >= maxBenchSize(gameState, "player")) {
      return {
        ...gameState,
        events: [
          ...gameState.events,
          createGameEvent("Tu banca está llena, no puedes usar este ataque", "info"),
        ],
      };
    }
  }

  // Daño base: printed damage + non-coin-flip damage effects (see calculateBaseDamage)
  const base = calculateBaseDamage(attackerView, defenderView, attack, gameState.playerBench, gameState.opponentBench);
  let baseDamage = base.damage;
  if (doubledAttack) baseDamage *= 2;
  // Drag Off: its damage goes to the Benched Pokémon switched in by its choice (attackChoices)
  if (attack.effects?.some((e) => e.type === AttackEffectType.ChooseTargetDamage && e.switchWithDefender)) baseDamage = 0;
  // Egg Bomb tails: "this attack does nothing to the Defending Pokémon" (its effects on the attacker still happen)
  const nothingToDefender = attack.effects?.some((e) => e.type === AttackEffectType.AttackFails && e.defenderOnly && !e.coinFlip) ?? false;
  if (nothingToDefender) baseDamage = 0;
  // Lava Burst: the top cards of the attacker's deck are discarded; damage per basic Energy card of the type among them
  const mill = attack.effects?.find((e) => e.type === AttackEffectType.MillSelfForDamage && !e.coinFlip);
  const milledCards = mill ? gameState.playerDeck.slice(0, mill.amount ?? 5) : [];
  if (mill) {
    const energyCards = milledCards.filter((c) => isEnergyCard(c) && c.isBasic && c.energyType === mill.energyType).length;
    baseDamage += (mill.extraDamagePerEnergy ?? 0) * energyCards;
  }
  const damageMultiplierDescription = base.description;

  // Frenzy (Dark Primeape): it does 30 more damage while Confused
  const frenzyBonus = baseDamage > 0 ? getConfusedDamageBonus(gameState, attacker) : 0;
  if (frenzyBonus > 0) baseDamage += frenzyBonus;

  // Apply stored nextTurnBonusDamage from a previous turn (e.g., Swords Dance +30)
  // The bonus is consumed and cleared later when assembling the final state
  let consumedBonusDamage = false;
  let bonusDamageMessage = "";
  // Only an attack that does damage gets it ("Slash's base damage is 60"; not Swords Dance again)
  if (attacker.nextTurnBonusDamage && attacker.nextTurnBonusDamage > 0 && baseDamage > 0) {
    baseDamage += attacker.nextTurnBonusDamage;
    consumedBonusDamage = true;
    bonusDamageMessage = `¡Efecto de turno anterior! +${attacker.nextTurnBonusDamage} de daño extra`;
  }

  // Check for MirrorMove effect: replaces all damage with lastDamageReceived
  // Mirror Move copies the FINAL damage dealt to this Pokemon last turn (already includes weakness/resistance)
  let isMirrorMove = false;
  const mirrorMoveEffect = attack.effects?.find(e => e.type === AttackEffectType.MirrorMove);
  if (mirrorMoveEffect) {
    isMirrorMove = true;
    const lastDamage = attacker.lastDamageReceived;
    if (lastDamage && lastDamage > 0) {
      baseDamage = lastDamage;
    } else {
      baseDamage = 0;
    }
  }

  let damage = baseDamage;

  // Verificar debilidad y resistencia (using modifiedWeakness/modifiedResistance from Porygon's Conversion)
  // Skip for MirrorMove — the copied damage already had weakness/resistance applied
  const defenderWeaknesses = defender.modifiedWeakness
    ? [defender.modifiedWeakness]
    : (defenderCard.weaknesses ?? []);
  const defenderResistances = defender.modifiedResistance
    ? [defender.modifiedResistance]
    : (defenderCard.resistances ?? []);

  // Use shiftedType (Venomoth Shift) if available, otherwise use original type
  const attackerType = attacker.shiftedType || attackerCard.types[0];
  // Swift: its damage isn't affected by Weakness, Resistance, Pokémon Powers or any other effect on the Defending Pokémon
  const ignoresDefenderEffects = attack.effects?.some((e) => e.type === AttackEffectType.IgnoreDefenderEffects) ?? false;
  // Sonicboom: "Don't apply Weakness and Resistance for this attack"
  const ignoresWeaknessResistance = ignoresDefenderEffects ||
    (attack.effects?.some((e) => e.type === AttackEffectType.IgnoreWeaknessResistance && !e.resistanceOnly) ?? false);
  // Hook Shot: "Don't apply Resistance for this attack"
  const ignoresResistance = ignoresWeaknessResistance || (attack.effects?.some((e) => e.type === AttackEffectType.IgnoreWeaknessResistance) ?? false);
  // Cinnabar City Gym: no Weakness for a Water attacker against a Pokémon with Blaine in its name
  const hasWeakness = !isMirrorMove && !ignoresWeaknessResistance && defenderWeaknesses.includes(attackerType) &&
    !stadiumIgnoresWeakness(gameState, attackerType, defender);
  // The Stadium in play may cancel Resistance for this attacker (stadiums/rules.ts)
  const hasResistance = !isMirrorMove && !ignoresResistance && !stadiumIgnoresResistance(gameState, attacker) &&
    defenderResistances.includes(attackerType);

  // Aplicar debilidad (x2)
  if (hasWeakness) {
    damage *= 2;
  }

  // Aplicar resistencia (-30; -10 with Resistance Gym)
  if (hasResistance) {
    damage = Math.max(0, damage - resistanceAmount(gameState));
  }

  // Vermilion City Gym heads: 10 more if the attack does damage to the Defending Pokémon
  // after Weakness and Resistance (like PlusPower)
  if (stadiumCoin === "heads" && damage > 0) {
    damage += VERMILION_COIN_DAMAGE;
  }

  // Aplicar bonus de PlusPower (después de debilidad/resistencia, según reglas TCG)
  // PlusPower only adds damage if the attack does damage to the defending Pokemon after
  // Weakness and Resistance (10 vs Resistance = 0: no PlusPower). Misty (Gym Heroes): the same
  // for this turn's attack of a Pokémon with Misty in its name.
  const plusPowerBonus = attackBonusFromModifiers(gameState, attacker);
  if (plusPowerBonus > 0 && damage > 0) {
    damage += plusPowerBonus;
  }

  // Aplicar reducción de Defender (después de debilidad/resistencia)
  const defenderModifiers = ignoresDefenderEffects ? [] : gameState.activeModifiers.filter(
    (m) => m.source === "defender" && modifierAppliesTo(m, defender)
  );
  const defenderReduction = defenderModifiers.reduce((sum, m) => sum + Math.abs(m.amount), 0);
  if (defenderReduction > 0) {
    damage = Math.max(0, damage - defenderReduction);
  }

  // Apply stored nextTurnDamageReduction from defender (e.g., Minimize -20, Screech -10)
  // The reduction is consumed and cleared later when assembling the final state
  let consumedDamageReduction = false;
  let damageReductionMessage = "";
  if (defender.nextTurnDamageReduction && defender.nextTurnDamageReduction > 0 && damage > 0 && !ignoresDefenderEffects) {
    const reduction = defender.nextTurnDamageReduction;
    damage = Math.max(0, damage - reduction);
    consumedDamageReduction = true;
    damageReductionMessage = `${defender.pokemon.name} redujo el daño en ${reduction} (efecto de turno anterior)`;
  }

  // Kabuto Armor: half the damage (after Weakness/Resistance and the modifiers above), rounded down
  const damageBeforeArmor = damage;
  if (!ignoresDefenderEffects) damage = applyDamageHalving(defender, damage, gameState);
  const halvedByArmor = damage < damageBeforeArmor;
  // Shell Armor / Strange Barrier (Gym Heroes): Swift's damage ignores them too
  const damagePower = ignoresDefenderEffects ? { damage } : applyDamagePowers(defender, damage, gameState, attacker);
  const reducedByPower = damagePower.damage < damage ? damagePower.power : undefined;
  damage = damagePower.damage;
  // Relaxing Scent (Erika's Ivysaur, an Active on either side): halved, rounded up (Swift ignores powers)
  const scent = ignoresDefenderEffects ? { damage } : applyRelaxingScent(gameState, damage);
  const halvedByScent = scent.damage < damage ? scent.power : undefined;
  damage = scent.damage;

  // Verificar si el defensor está protegido o tiene barrera de daño
  const defenderIsProtected = !ignoresDefenderEffects && protectionBlocksDamage(defender, damage);
  // Transparency (Haunter) heads: every effect of this attack done to it, damage included, is prevented
  const transparencyPrevents = transparencyCoin === "heads";
  // DamageAndEffects protection (Agility, Barrier, Tail Wag) also blocks status, ForceSwitch, PreventRetreat
  // Flee (Misty's Tentacruel) used: the attack's damage is done, its other effects on it are prevented
  const fleeTo = reactions.flee ? gameState.opponentBench.find((p) => p.pokemon.id === reactions.flee) : undefined;
  const defenderBlocksEffects = (defender.protection?.type === "damageAndEffects" && defenderIsProtected) || transparencyPrevents || !!fleeTo;
  let effectiveDamage = damage;
  let damageBarrierBlocked = false;
  if (transparencyPrevents) {
    effectiveDamage = 0;
  } else if (defenderIsProtected && damage > 0) {
    effectiveDamage = 0;
  } else if (evadeCoin === "tails") {
    effectiveDamage = 0;
  } else if (!ignoresDefenderEffects && isDamageBlocked(defender, damage, gameState)) {
    effectiveDamage = 0;
    damageBarrierBlocked = true;
  }
  const evaded = evadeCoin === "tails" && !transparencyPrevents && !(defenderIsProtected && damage > 0);

  // Charity (Gym Heroes) attached to the attacker: it may reduce the damage it does to the
  // Defending Pokémon by any amount in 10s — asked once that damage is known (after Weakness /
  // Resistance, PlusPower, Defender, reductions, powers and protection), before anything happens
  const charity = options && effectiveDamage > 0 ? attachedTrainerNamed(attacker, CHARITY) : undefined;
  if (charity && reactions.charityReduction === undefined) {
    return pauseForReaction(
      inputState,
      { answers: "charityReduction", powerName: CHARITY, pokemonId: attacker.pokemon.id, side: "player", resume: resumeAttack() },
      charityStep(attacker.pokemon.name, defender.pokemon.name, effectiveDamage),
      reactionContext(attacker, defender, printedAttack.name, gameState)
    );
  }
  const charityReduction = charity ? Math.min(reactions.charityReduction ?? 0, effectiveDamage) : 0;
  effectiveDamage -= charityReduction;

  // Mass Explosion: its second part also hits the Defending Pokémon when it is named (no W/R),
  // unless everything was prevented
  const namedDamage = attack.effects?.find((e) => e.type === AttackEffectType.DamageNamedInPlay && !e.coinFlip);
  const namedDefenderDamage =
    namedDamage?.names?.includes(defender.pokemon.name) && !transparencyPrevents && !(defenderIsProtected && damage > 0)
      ? applyAttackDamageReductions(defender, namedDamage.amount ?? 0, gameState, attacker)
      : 0;

  // Pain Amplifier: a damage counter on the Defending Pokémon if it already had any (not damage:
  // only what prevents every effect of the attack stops it)
  const countersOnDamaged = attack.effects?.find((e) => e.type === AttackEffectType.DamageCountersOnDamaged && !e.coinFlip);
  const defenderCounters =
    countersOnDamaged && (defender.currentDamage || 0) > 0 && !defenderBlocksEffects ? countersOnDamaged.amount ?? 10 : 0;

  // Juxtapose / Damage Shift / Life Drain: damage counters moved onto (or off) the Defending
  // Pokémon — not damage (no W/R, damage-only protection doesn't stop them); only what prevents
  // every effect of the attack does. The attacker's side is updated in the effects loop.
  const counterEffect = (type: AttackEffectType) =>
    defenderBlocksEffects ? undefined : attack.effects?.find((e) => e.type === type && !e.coinFlip);
  const swapCounters = counterEffect(AttackEffectType.SwapDamageCounters);
  const shiftCounters = counterEffect(AttackEffectType.MoveDamageCountersToDefender);
  const drainTo = counterEffect(AttackEffectType.SetRemainingHp);
  const shiftedFromIds = shiftCounters
    ? [attacker, ...gameState.playerBench].filter((p) => (p.currentDamage ?? 0) > 0).map((p) => p.pokemon.id)
    : [];
  const counterDelta =
    (swapCounters ? (attacker.currentDamage ?? 0) - (defender.currentDamage ?? 0) : 0) +
    shiftedFromIds.length * 10 +
    (drainTo ? Math.max(0, defenderCard.hp - (drainTo.amount ?? 10) - (defender.currentDamage ?? 0)) : 0);

  // Aplicar daño al defensor
  let newDamage = (defender.currentDamage || 0) + effectiveDamage + namedDefenderDamage + defenderCounters + counterDelta;
  const defenderHP = defenderCard.hp;
  // Fortitude (Giovanni's Machamp): its coin is used only if the attack's damage would Knock it Out
  const attackDamageToDefender = effectiveDamage + namedDefenderDamage;
  const fortitudeUsed = !!fortitudeCoin && attackDamageToDefender > 0 && newDamage >= defenderHP;
  const fortitudeHolds = fortitudeUsed && fortitudeCoin === "heads";
  if (fortitudeHolds) newDamage = Math.max(0, defenderHP - 10);
  const defenderPowerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name ?? "" : "";

  // Flee (Misty's Tentacruel): damaged as the Active and not Knocked Out → its owner may switch it
  // with a Benched Pokémon before the attack's other effects; the attack waits for the answer
  const fleePower = getFleePower(gameState, defender);
  if (
    options && reactions.flee === undefined && fleePower && effectiveDamage + namedDefenderDamage > 0 &&
    newDamage < defenderHP && gameState.opponentBench.length > 0
  ) {
    const bench = gameState.opponentBench;
    const damageDone = effectiveDamage + namedDefenderDamage;
    const ask = `${defender.pokemon.name} recibe ${damageDone} de daño de ${printedAttack.name}: puedes cambiarlo por 1 de tus Pokémon en la Banca (evita los demás efectos del ataque sobre él)`;
    return pauseForReaction(
      inputState,
      {
        answers: "flee",
        powerType: PokemonPowerType.SwitchWhenDamaged,
        powerName: fleePower.name,
        pokemonId: defender.pokemon.id,
        side: "opponent",
        resume: { kind: "attack", attackIndex, ...(copiedAttack && { copiedAttack }), options: { ...options, reactions } },
      },
      {
        title: fleePower.name,
        description: `Tu rival puede usar ${fleePower.name}: ${defender.pokemon.name} recibe ${damageDone} de daño`,
        answererDescription: `Puedes usar ${fleePower.name}. ${ask}`,
        options: bench.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name })),
        maxSelections: 1,
        minSelections: 0,
        thumbnails: bench.map((p) => p.pokemon),
        disableAutoSelect: true,
        chooser: "opponent",
        // Answer clock: no switch
        defaultSelection: [],
      },
      reactionContext(attacker, defender, printedAttack.name, gameState)
    );
  }

  // Crear eventos
  const events: GameEvent[] = [...gameState.events];

  // Coin results first, so the log reads: coins → attack → effects (the ones Sabrina's ESP replaced before)
  events.push(...espEvents);
  if (coinResolution && coinResults) {
    const tokens = coinResults.map((r) => `[coin:${r}]`).join(" ");
    events.push(createGameEvent(coinResults.length === 1 ? `Moneda: ${tokens}` : `Monedas: ${tokens}`, "info"));
  }

  // The Stadium's coin (Vermilion City Gym), after the attack's own coins
  if (stadiumCoin) {
    events.push(createGameEvent(`${gameState.stadium?.card.name ?? "Estadio"} - Moneda: [coin:${stadiumCoin}]`, "info"));
  }

  // Add deferred messages for next-turn effects (computed before events array was created)
  if (bonusDamageMessage) {
    events.push(createGameEvent(bonusDamageMessage, "action"));
  }
  if (damageReductionMessage) {
    events.push(createGameEvent(damageReductionMessage, "action"));
  }
  if (charityReduction > 0) {
    events.push(createGameEvent(`${CHARITY}: el atacante redujo el daño en ${charityReduction}`, "action"));
  }

  // Mirror Move result message
  if (isMirrorMove) {
    if (attacker.lastDamageReceived && attacker.lastDamageReceived > 0) {
      events.push(createGameEvent(
        `¡Movimiento Espejo! ${attacker.pokemon.name} devuelve ${attacker.lastDamageReceived} de daño`,
        "action"
      ));
    } else {
      events.push(createGameEvent(
        `Movimiento Espejo falló: ${attacker.pokemon.name} no fue atacado el turno anterior`,
        "info"
      ));
    }
  }

  // Transparency's coin, flipped for the Defending Pokémon
  if (transparencyCoin) {
    const powerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name ?? "Transparencia" : "Transparencia";
    events.push(createGameEvent(`${powerName} de ${defender.pokemon.name} - Moneda: [coin:${transparencyCoin}]`, "info"));
  }
  // Shadow Images' coin, flipped by the attacker
  if (evadeCoin && defender.evadeOnFlip) {
    events.push(createGameEvent(`${defender.evadeOnFlip.attackName} de ${defender.pokemon.name} - Moneda: [coin:${evadeCoin}]`, "info"));
  }

  // Mensaje del ataque con detalles de debilidad/resistencia y protección
  let damageMessage = "";
  if (nothingToDefender) {
    damageMessage = ` pero no le hizo nada a ${defender.pokemon.name}`;
  } else if (transparencyPrevents) {
    damageMessage = ` pero ${defender.pokemon.name} evitó todos sus efectos (Transparencia)`;
  } else if (defenderIsProtected && damage > 0) {
    if (defender.protection?.threshold !== undefined) {
      damageMessage = ` pero Endurecimiento previno ${damage} de daño (${damage} ≤ ${defender.protection.threshold})`;
    } else {
      damageMessage = ` pero ${defender.pokemon.name} está protegido. ¡El daño fue prevenido!`;
    }
  } else if (evaded) {
    damageMessage = ` pero ${defender.pokemon.name} no recibió daño (${defender.evadeOnFlip?.attackName ?? "Imágenes Sombra"})`;
  } else if (damageBarrierBlocked) {
    const barrierPowerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name || "Muro Invisible" : "Muro Invisible";
    damageMessage = ` pero ${defender.pokemon.name} bloqueó el daño con ${barrierPowerName}`;
  } else if (effectiveDamage === 0 && charityReduction > 0) {
    damageMessage = ` e hizo 0 de daño (${CHARITY})`;
  } else if (effectiveDamage > 0) {
    const armorNote = !halvedByArmor ? "" : defender.halveDamage?.onTurn === gameState.turnNumber ? ` (la mitad por ${defender.halveDamage.attackName})` : " (la mitad por Armadura Kabuto)";
    if (halvedByArmor) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription}${armorNote}`;
    } else if (reducedByPower) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription} (${reducedByPower.name} de ${defender.pokemon.name})`;
    } else if (hasWeakness) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription} (x2 debilidad)`;
    } else if (hasResistance) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription} (-30 resistencia)`;
    } else {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription}`;
    }
  } else if (coinResolution?.hasCoinDamage && baseDamage === 0) {
    // Coin damage attack with no matching coins (Twineedle tails/tails, Leek Slap tails)
    damageMessage = " pero no hizo daño";
  } else if (damageMultiplierDescription && baseDamage === 0) {
    // Ataque por contadores propios (Azote/Flail) sin contadores: indicarlo.
    damageMessage = " pero no hizo daño (0 contadores)";
  } else if (hasResistance && baseDamage > 0) {
    // El ataque tenía daño pero fue reducido a 0 por resistencia
    damageMessage = ` e hizo 0 de daño (-30 resistencia)`;
  } else if (defenderReduction > 0 && baseDamage > 0) {
    // El ataque fue reducido a 0 por Defender
    damageMessage = ` e hizo 0 de daño (bloqueado por Defender)`;
  } else if (halvedByArmor) {
    damageMessage = ` e hizo 0 de daño (la mitad por Armadura Kabuto)`;
  } else if (reducedByPower) {
    damageMessage = ` e hizo 0 de daño (${reducedByPower.name} de ${defender.pokemon.name})`;
  }

  events.push(
    createGameEvent(
      `${attacker.pokemon.name} usó ${attack.name}${damageMessage}`,
      "action"
    )
  );

  if (halvedByScent && effectiveDamage > 0) {
    events.push(createGameEvent(`${halvedByScent.name}: el daño a ${defender.pokemon.name} se redujo a la mitad`, "info"));
  }

  // Coin protection that didn't happen (Scrunch, Stiffen, Withdraw, Agility on tails)
  if (coinResolution?.missed.some((e) => e.type === AttackEffectType.Protection)) {
    events.push(createGameEvent(`${attacker.pokemon.name} no logró protegerse`, "info"));
  }

  // Gym Challenge defender coins, logged only when their power is used
  if (fortitudeUsed) {
    events.push(createGameEvent(`${defenderPowerName} de ${defender.pokemon.name} - Moneda: [coin:${fortitudeCoin}]`, "info"));
    if (fortitudeHolds) events.push(createGameEvent(`¡${defender.pokemon.name} no queda Fuera de Combate: le quedan 10 PS!`, "action"));
  }
  if ((energyDrainCoin || shockBlastCoin) && attackDamageToDefender > 0) {
    events.push(createGameEvent(`${defenderPowerName} de ${defender.pokemon.name} - Moneda: [coin:${energyDrainCoin ?? shockBlastCoin}]`, "info"));
  }

  // Verificar si el defensor fue noqueado
  const isKnockedOut = newDamage >= defenderHP;
  if (isKnockedOut) {
    events.push(
      createGameEvent(`¡${defender.pokemon.name} fue noqueado!`, "action")
    );
  }

  // Actualizar estado del oponente
  let newOpponentActive: PokemonInPlay | null = defender;
  let newOpponentDiscard = [...gameState.opponentDiscard];
  let newOpponentBench = [...gameState.opponentBench];
  let newPlayerPrizes = [...gameState.playerPrizes];
  let newPlayerHand = [...gameState.playerHand];
  let newOpponentHand = [...gameState.opponentHand];

  // The Defending Pokémon left play without a Knock Out (Fling...): its owner promotes
  let opponentNeedsToPromote = false;

  if (isKnockedOut) {
    // Knocked Out (step 2 found it): no effect touches it any more. It leaves play with every
    // other Knock Out in the attack's single check ("KNOCK OUTS" below: checkKnockouts, which
    // owes the Prize), and its replacement is chosen after that ("PROMOTIONS"), so a Benched
    // Pokémon Knocked Out by this same attack is never promoted.
    newOpponentActive = null;
  } else {
    // Solo actualizar daño + store lastDamageReceived for Mirror Move
    newOpponentActive = {
      ...defender,
      currentDamage: newDamage,
      lastDamageReceived: effectiveDamage > 0 ? effectiveDamage : undefined,
      // Shadow Images lasts until it takes damage
      ...(newDamage > (defender.currentDamage || 0) && { evadeOnFlip: undefined }),
    };
    // Koga (Gym Challenge): this turn, a Koga's Pokémon's attack that damages the Defending Pokémon Poisons it
    if (newDamage > (defender.currentDamage || 0) && kogaPoisons(gameState, attacker) && !hasStatusImmunity(newOpponentActive, gameState)) {
      const poisoned = applyStatusCondition(newOpponentActive, StatusCondition.Poisoned, gameState.turnNumber);
      if (poisoned !== newOpponentActive) {
        newOpponentActive = poisoned;
        events.push(createGameEvent(`Koga: ¡${poisoned.pokemon.name} está envenenado!`, "action"));
      }
    }
  }

  // Destiny Bond: if the defender was KO'd and had Destiny Bond active, KO the attacker too
  let destinyBondTriggered = false;
  if (isKnockedOut && defender.destinyBondActive && effectiveDamage > 0) {
    destinyBondTriggered = true;
    events.push(
      createGameEvent(
        `¡Unión de Destino! ¡${defender.pokemon.name} se lleva a ${attacker.pokemon.name} consigo!`,
        "action"
      )
    );
  }

  // Procesar efectos del ataque que no requieren coin flip
  let newPlayerActive: PokemonInPlay | null = attacker;
  let newPlayerBench = [...gameState.playerBench];
  let newPlayerDiscard = [...gameState.playerDiscard];
  let newPlayerDeck = [...gameState.playerDeck];
  let newOpponentPrizes = [...gameState.opponentPrizes];
  let newOpponentDeck = [...gameState.opponentDeck];
  let attackerKnockedOut = false;
  // Vanish: the attacker left play without a Knock Out
  let attackerLeftPlay = false;
  let attackerNeedsToPromote = false;
  let pendingBenchDamageSelection: GameState["pendingBenchDamageSelection"] = undefined;
  // Detonate / Mega Thrash discard the Stadium in play
  let newStadium: StadiumInPlay | null = gameState.stadium ?? null;

  // The attacker Knocked Out by its own attack (self damage, Juxtapose, Strikes Back, Destiny Bond,
  // Mirror Shell...): from then on no effect touches it (newPlayerActive is null) and it leaves play
  // in the attack's single Knock Out check with the HP it had (forced), which owes the Prize.
  const knockedOutAttacker: { pokemon: PokemonInPlay | null } = { pokemon: null };
  const applyAttackerKnockout = (knockedOut: PokemonInPlay, _cause: string) => {
    knockedOutAttacker.pokemon = knockedOut;
    return { newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote };
  };

  if (attack.effects) {
    for (const effect of attack.effects) {
      // Ignorar efectos con coinFlip (se procesan en handleCoinFlipComplete)
      if (effect.coinFlip) continue;

      // Draw: robar cartas del mazo (ej: Kangaskhan's Fetch)
      if (effect.type === AttackEffectType.Draw && effect.amount) {
        const isPlayer = effect.target === AttackTarget.Self;
        for (let i = 0; i < effect.amount; i++) {
          const deck = isPlayer ? newPlayerDeck : newOpponentDeck;
          const hand = isPlayer ? newPlayerHand : newOpponentHand;
          const result = drawCard(deck, hand);
          if (result.success) {
            if (isPlayer) {
              newPlayerDeck = result.newDeck;
              newPlayerHand = result.newHand;
            } else {
              newOpponentDeck = result.newDeck;
              newOpponentHand = result.newHand;
            }
          }
        }
        const who = isPlayer ? "Robaste" : "El rival robó";
        events.push(createGameEvent(`${who} ${effect.amount} carta${effect.amount > 1 ? "s" : ""} por ${attack.name}`, "action"));
      }

      // Juxtapose: the attacker gets the Defending Pokémon's damage counters (even a Knock Out)
      if (effect.type === AttackEffectType.SwapDamageCounters && swapCounters && newPlayerActive && !attackerKnockedOut) {
        const taken = defender.currentDamage ?? 0;
        events.push(createGameEvent(`${attack.name}: ${newPlayerActive.pokemon.name} y ${defender.pokemon.name} intercambiaron sus contadores de daño`, "action"));
        if (taken >= attackerCard.hp) {
          attackerKnockedOut = true;
          events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado!`, "action"));
          ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
            applyAttackerKnockout({ ...newPlayerActive, currentDamage: taken }, "El rival tomó un premio"));
          newPlayerActive = null;
        } else {
          newPlayerActive = { ...newPlayerActive, currentDamage: taken };
        }
      }

      // Damage Shift: 1 damage counter off each of the attacker's damaged Pokémon (onto the Defending Pokémon above)
      if (effect.type === AttackEffectType.MoveDamageCountersToDefender && shiftedFromIds.length > 0) {
        const lift = (p: PokemonInPlay): PokemonInPlay =>
          shiftedFromIds.includes(p.pokemon.id) ? { ...p, currentDamage: Math.max(0, (p.currentDamage ?? 0) - 10) } : p;
        if (newPlayerActive) newPlayerActive = lift(newPlayerActive);
        newPlayerBench = newPlayerBench.map(lift);
        const n = shiftedFromIds.length;
        events.push(createGameEvent(`${attack.name}: ${n} contador${n > 1 ? "es" : ""} de daño pasa${n > 1 ? "n" : ""} a ${defender.pokemon.name}`, "action"));
      }

      // Life Drain: the Defending Pokémon is left with `amount` HP
      if (effect.type === AttackEffectType.SetRemainingHp && drainTo && counterDelta > 0) {
        events.push(createGameEvent(`${attack.name}: ${defender.pokemon.name} queda con ${drainTo.amount ?? 10} PS`, "action"));
      }

      // Detonate / Mega Thrash: the Stadium in play goes to its owner's discard pile
      if (effect.type === AttackEffectType.DiscardStadium && newStadium) {
        if (newStadium.playedBy === "player") newPlayerDiscard.push(newStadium.card);
        else newOpponentDiscard.push(newStadium.card);
        events.push(createGameEvent(`${attack.name}: ${newStadium.card.name} se descarta`, "action"));
        newStadium = null;
      }

      // Intimidate: a Defending Pokémon with `maxHp` HP or less can't attack the attacker next turn
      if (effect.type === AttackEffectType.IntimidateLock && newOpponentActive && !isKnockedOut && !defenderBlocksEffects &&
          defenderCard.hp <= (effect.maxHp ?? 50)) {
        newOpponentActive = {
          ...newOpponentActive,
          intimidatedBy: { pokemonId: attacker.pokemon.id, onTurn: gameState.turnNumber + 1, attackName: attack.name },
        };
        events.push(createGameEvent(`${defender.pokemon.name} no podrá atacar a ${attacker.pokemon.name} durante el próximo turno de su dueño`, "action"));
      }

      // Focus Energy (Lt. Surge's Raticate): `attackName` doubled during the owner's next turn
      if (effect.type === AttackEffectType.DoubleAttackNextTurn && effect.attackName && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = { ...newPlayerActive, doubledAttack: { name: effect.attackName, onTurn: gameState.turnNumber + 2 } };
        events.push(createGameEvent(`${newPlayerActive.pokemon.name} hará el doble de daño con ${effect.attackName} en el próximo turno de su dueño`, "action"));
      }

      // Giant Growth (SetMaxHp): maximum HP and a boosted attack until it is Benched
      if (effect.type === AttackEffectType.SetMaxHp && effect.amount && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          hpOverride: { hp: effect.amount, ...(effect.attackName && effect.boostedDamage !== undefined && { attackName: effect.attackName, damage: effect.boostedDamage }) },
        };
        events.push(createGameEvent(`${newPlayerActive.pokemon.name} ahora tiene ${effect.amount} PS máximos`, "action"));
      }

      // Daño a sí mismo (selfDamage)
      if (effect.type === AttackEffectType.SelfDamage && effect.amount && newPlayerActive) {
        let selfDamage: number = effect.amount;

        // Apply Defender reduction to self-damage
        const selfDefenderMods = gameState.activeModifiers.filter(
          (m) => m.source === "defender" && modifierAppliesTo(m, newPlayerActive)
        );
        const selfDefenderReduction = selfDefenderMods.reduce((sum, m) => sum + Math.abs(m.amount), 0);
        if (selfDefenderReduction > 0) {
          selfDamage = Math.max(0, selfDamage - selfDefenderReduction);
          events.push(
            createGameEvent(
              `Defender redujo el auto-daño en ${selfDefenderReduction}`,
              "info"
            )
          );
        }

        // Kabuto Armor also halves damage an attack does to its own user ("even your own")
        selfDamage = applyAttackDamageReductions(newPlayerActive, selfDamage, gameState, attacker);
        const newSelfDamage: number = (newPlayerActive.currentDamage || 0) + selfDamage;

        if (selfDamage > 0) {
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se hizo ${selfDamage} de daño a sí mismo`,
              "action"
            )
          );
        }

        // Verificar si el atacante se noqueó
        if (newSelfDamage >= attackerCard.hp) {
          attackerKnockedOut = true;
          events.push(
            createGameEvent(`¡${newPlayerActive.pokemon.name} se noqueó a sí mismo!`, "action")
          );

          ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
            applyAttackerKnockout(newPlayerActive, "El rival tomó un premio"));
          newPlayerActive = null;
        } else {
          newPlayerActive = {
            ...newPlayerActive,
            currentDamage: newSelfDamage,
          };
        }
      }

      // Daño a la banca (benchDamage)
      if (effect.type === AttackEffectType.BenchDamage && effect.amount && effect.benchTarget) {
        const benchDamageAmount = effect.amount;
        const target = effect.benchTarget;
        // Opponent's Benched Pokémon this effect damaged now (Strikes Back reacts only for them;
        // chosen targets react in executeBenchDamage)
        const damagedOpponentBenchIds = new Set<string>();

        // Chain Lightning: use original defender types (not newOpponentActive which may be promoted replacement)
        const defenderTypes = defenderCard.types;
        if (effect.skipIfColorless && defenderTypes.includes(EnergyTypeEnum.Colorless)) {
          // Effect does nothing against Colorless defenders
        } else {
          // Determine if we need manual selection
          const maxTargets = effect.maxBenchTargets ?? Infinity;
          const needsManualSelection = maxTargets < Infinity;
          // Thunderstorm: only the Benched Pokémon whose coin was heads (by bench position)
          const coinIndexes = effect.benchTargetIndexes;

          // Mass Explosion: only the named Benched Pokémon; Blaze / Water Ring: only (or not) these types
          const nameFilter = effect.benchNameFilter;
          const typesOf = (p: PokemonInPlay): EnergyType[] => (p.shiftedType ? [p.shiftedType] : isPokemonCard(p.pokemon) ? p.pokemon.types : []);
          const named = (p: PokemonInPlay) =>
            (!nameFilter || nameFilter.includes(p.pokemon.name)) &&
            (!effect.benchTypes || typesOf(p).some((t) => effect.benchTypes!.includes(t))) &&
            (!effect.benchExcludeTypes || !typesOf(p).some((t) => effect.benchExcludeTypes!.includes(t)));
          // Count available targets
          const getAvailableTargets = (bench: PokemonInPlay[]): PokemonInPlay[] => {
            return bench.filter((p) => {
              if (!p) return false;
              if (!named(p)) return false;
              if (effect.matchDefenderType && isPokemonCard(p.pokemon)) {
                return p.pokemon.types.some((t) => defenderTypes.includes(t));
              }
              return true;
            });
          };

          // Check if we need manual selection (when maxTargets < available targets)
          if (target === BenchDamageTarget.Opponent || target === BenchDamageTarget.Both) {
            const availableOpponentTargets = getAvailableTargets(newOpponentBench);

            // Gigashock: "choose 3 ... if fewer than 3, do the damage to each of them" — no choice then
            const exactAndAll = effect.exactBenchTargets && availableOpponentTargets.length <= maxTargets;
            if (needsManualSelection && availableOpponentTargets.length > 0 && !exactAndAll) {
              // Set pending state - frontend will show selection modal
              pendingBenchDamageSelection = {
                damageAmount: benchDamageAmount,
                targetSide: "opponent",
                maxTargets: maxTargets,
                minTargets: effect.exactBenchTargets
                  ? Math.min(maxTargets, availableOpponentTargets.length)
                  : Math.min(1, availableOpponentTargets.length),
                matchDefenderType: effect.matchDefenderType,
                defenderTypes: effect.matchDefenderType ? defenderTypes : undefined,
              };
              // Do NOT apply damage automatically - wait for player selection
              // Do NOT call endTurn() - the pending flag will block it
              events.push(
                createGameEvent(
                  `Elige hasta ${maxTargets} Pokémon de la banca del rival para hacer ${benchDamageAmount} de daño`,
                  "action"
                )
              );
            } else {
              // Automatic damage (maxTargets >= available targets OR no targets available)
              let opponentHitsRemaining = maxTargets;
              const opponentHits: BenchHit[] = [];
              newOpponentBench = newOpponentBench.map((benchPokemon, benchIndex) => {
                if (!benchPokemon || opponentHitsRemaining <= 0) return benchPokemon;
                if (coinIndexes && !coinIndexes.includes(benchIndex)) return benchPokemon;
                if (!named(benchPokemon)) return benchPokemon;

                // Filter by defender type if matchDefenderType is set
                if (effect.matchDefenderType && isPokemonCard(benchPokemon.pokemon)) {
                  const sharesType = benchPokemon.pokemon.types.some((t) => defenderTypes.includes(t));
                  if (!sharesType) return benchPokemon;
                }

                opponentHitsRemaining--;
                const dealt = applyAttackDamageReductions(benchPokemon, Math.max(0, benchDamageAmount - attachedDefenderReduction(gameState, benchPokemon)), gameState, attacker);
                if (dealt > 0) damagedOpponentBenchIds.add(benchPokemon.pokemon.id);
                opponentHits.push({ id: benchPokemon.pokemon.id, damage: dealt });
                const newBenchDamage = (benchPokemon.currentDamage || 0) + dealt;
                events.push(
                  createGameEvent(
                    `${benchPokemon.pokemon.name} del rival recibió ${dealt} de daño`,
                    "action"
                  )
                );

                return {
                  ...benchPokemon,
                  currentDamage: newBenchDamage,
                  // Mirror Move: track bench damage so it can be copied when promoted
                  lastDamageReceived: dealt > 0 ? dealt : undefined,
                };
              });
              // Bench Guard (Brock's Rhydon) of the defending side: asked before anything happens
              const guard = benchGuardFor({ ...gameState, opponentBench: newOpponentBench }, "opponent", opponentHits);
              if (guard && options) {
                const chosen = reactions.benchGuard?.opponent;
                if (chosen === undefined) {
                  return pauseForReaction(
                    inputState,
                    {
                      answers: "benchGuard",
                      powerType: PokemonPowerType.RedirectBenchDamage,
                      powerName: guard.powerName,
                      pokemonId: guard.guard.pokemon.id,
                      side: "opponent",
                      resume: { kind: "attack", attackIndex, ...(copiedAttack && { copiedAttack }), options: { ...options, reactions } },
                    },
                    benchGuardStep({ ...gameState, opponentBench: newOpponentBench }, "opponent", guard),
                    reactionContext(attacker, defender, printedAttack.name, gameState)
                  );
                }
                const guarded = applyBenchGuard(newOpponentBench, guard.guard.pokemon.id, guard.amount, chosen.filter((id) => guard.eligible.some((h) => h.id === id)));
                newOpponentBench = guarded.bench;
                if (guarded.helped.length > 0) {
                  for (const p of newOpponentBench) if ((p.currentDamage ?? 0) <= (gameState.opponentBench.find((b) => b.pokemon.id === p.pokemon.id)?.currentDamage ?? 0)) damagedOpponentBenchIds.delete(p.pokemon.id);
                  events.push(createGameEvent(`${guard.powerName}: ${guard.guard.pokemon.name} recibió ${guard.amount * guarded.helped.length} del daño de ${guarded.helped.join(", ")}`, "action"));
                }
              }
            }
          }

          // Apply to own bench (typically for attacks like Selfdestruct)
          if (target === BenchDamageTarget.Own || target === BenchDamageTarget.Both) {
            const availableOwnTargets = getAvailableTargets(newPlayerBench);

            // Own bench damage usually doesn't need selection (hits all), but support it anyway
            if (needsManualSelection && availableOwnTargets.length > maxTargets && !pendingBenchDamageSelection) {
              pendingBenchDamageSelection = {
                damageAmount: benchDamageAmount,
                targetSide: "player",
                maxTargets: maxTargets,
                minTargets: Math.min(1, availableOwnTargets.length),
                matchDefenderType: effect.matchDefenderType,
                defenderTypes: effect.matchDefenderType ? defenderTypes : undefined,
              };
              events.push(
                createGameEvent(
                  `Elige hasta ${maxTargets} de tus Pokémon de la banca para recibir ${benchDamageAmount} de daño`,
                  "action"
                )
              );
            } else {
              // Automatic damage
              let ownHitsRemaining = maxTargets;
              const ownHits: BenchHit[] = [];
              newPlayerBench = newPlayerBench.map((benchPokemon) => {
                if (!benchPokemon || ownHitsRemaining <= 0) return benchPokemon;
                if (!named(benchPokemon)) return benchPokemon;

                // Filter by defender type if matchDefenderType is set
                if (effect.matchDefenderType && isPokemonCard(benchPokemon.pokemon)) {
                  const sharesType = benchPokemon.pokemon.types.some((t) => defenderTypes.includes(t));
                  if (!sharesType) return benchPokemon;
                }

                ownHitsRemaining--;
                const dealt = applyAttackDamageReductions(benchPokemon, Math.max(0, benchDamageAmount - attachedDefenderReduction(gameState, benchPokemon)), gameState, attacker);
                ownHits.push({ id: benchPokemon.pokemon.id, damage: dealt });
                const newBenchDamage = (benchPokemon.currentDamage || 0) + dealt;
                events.push(
                  createGameEvent(
                    `Tu ${benchPokemon.pokemon.name} recibió ${dealt} de daño`,
                    "action"
                  )
                );

                return {
                  ...benchPokemon,
                  currentDamage: newBenchDamage,
                  // Mirror Move: track bench damage for potential use when promoted
                  lastDamageReceived: dealt > 0 ? dealt : undefined,
                };
              });
              // Bench Guard (Brock's Rhydon) on the attacker's own Bench: its owner (the attacker) chooses
              const guard = benchGuardFor({ ...gameState, playerBench: newPlayerBench }, "player", ownHits);
              if (guard && options) {
                const chosen = reactions.benchGuard?.player;
                if (chosen === undefined) {
                  return pauseForReaction(
                    inputState,
                    {
                      answers: "benchGuard",
                      powerType: PokemonPowerType.RedirectBenchDamage,
                      powerName: guard.powerName,
                      pokemonId: guard.guard.pokemon.id,
                      side: "player",
                      resume: { kind: "attack", attackIndex, ...(copiedAttack && { copiedAttack }), options: { ...options, reactions } },
                    },
                    benchGuardStep({ ...gameState, playerBench: newPlayerBench }, "player", guard),
                    reactionContext(attacker, defender, printedAttack.name, gameState)
                  );
                }
                const guarded = applyBenchGuard(newPlayerBench, guard.guard.pokemon.id, guard.amount, chosen.filter((id) => guard.eligible.some((h) => h.id === id)));
                newPlayerBench = guarded.bench;
                if (guarded.helped.length > 0) {
                  events.push(createGameEvent(`${guard.powerName}: ${guard.guard.pokemon.name} recibió ${guard.amount * guarded.helped.length} del daño de ${guarded.helped.join(", ")}`, "action"));
                }
              }
            }
          }
        }

        // Strikes Back: check bench Pokemon with DamageReaction powers (e.g., Machamp)
        // Only opponent bench can trigger Strikes Back against the attacker
        if (target === BenchDamageTarget.Opponent || target === BenchDamageTarget.Both) {
          if (newPlayerActive && !attackerKnockedOut) {
            for (const benchPokemon of newOpponentBench) {
              if (!benchPokemon) continue;
              // Not damaged by this bench damage (Mass Explosion's names, Chain Lightning's type,
              // Thunderstorm's tails, a target still to be chosen)
              if (!damagedOpponentBenchIds.has(benchPokemon.pokemon.id)) continue;
              const reaction = getDamageReaction(benchPokemon, false, gameState); // false = from bench
              if (reaction) {
                const counterDamage = reaction.reactionDamage;
                const currentAttackerDamage: number = newPlayerActive.currentDamage || 0;
                const newAttackerDamage: number = currentAttackerDamage + counterDamage;
                events.push(
                  createGameEvent(
                    `¡${reaction.powerName}! ${benchPokemon.pokemon.name} contraataca con ${counterDamage} de daño desde la banca`,
                    "action"
                  )
                );

                if (newAttackerDamage >= attackerCard.hp) {
                  attackerKnockedOut = true;
                  events.push(
                    createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por el contraataque de ${benchPokemon.pokemon.name}!`, "action")
                  );
                  ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
                    applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por el contraataque"));
                  newPlayerActive = null;
                  break; // Attacker KO'd, stop checking further reactions
                } else {
                  newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
                }
              }
            }
          }
        }

        // Bench KOs are resolved by processBenchKnockouts() once all effects are applied
      }

      // Lava Burst: the cards counted above go to the discard pile
      if (effect.type === AttackEffectType.MillSelfForDamage) {
        newPlayerDeck = newPlayerDeck.slice(milledCards.length);
        newPlayerDiscard.push(...milledCards);
        events.push(createGameEvent(
          milledCards.length === 0
            ? `${attack.name}: no quedan cartas en el mazo`
            : `${attack.name}: se descartaron ${milledCards.map((c) => (isEnergyCard(c) ? energyCardLabel(c) : c.name)).join(", ")} de la parte superior del mazo`,
          "action"
        ));
      }

      // Pain Amplifier on the opponent's Benched Pokémon that already have damage counters (KOs: processBenchKnockouts)
      if (effect.type === AttackEffectType.DamageCountersOnDamaged) {
        const amount = effect.amount ?? 10;
        const hit = [
          ...(defenderCounters > 0 ? [defender.pokemon.name] : []),
          ...newOpponentBench.filter((p) => (p.currentDamage ?? 0) > 0).map((p) => p.pokemon.name),
        ];
        newOpponentBench = newOpponentBench.map((p) => ((p.currentDamage ?? 0) > 0 ? { ...p, currentDamage: (p.currentDamage ?? 0) + amount } : p));
        if (hit.length > 0) events.push(createGameEvent(`${attack.name}: ${amount / 10} contador${amount > 10 ? "es" : ""} de daño en ${hit.join(", ")}`, "action"));
      }

      // Healing Pollen: `amount` from each of your Pokémon (all of their counters if fewer)
      if (effect.type === AttackEffectType.Heal && effect.healAllOwn) {
        const amount = effect.amount ?? 0;
        const healed: string[] = [];
        const heal = (p: PokemonInPlay): PokemonInPlay => {
          const removed = Math.min(amount, p.currentDamage ?? 0);
          if (removed <= 0) return p;
          healed.push(`${p.pokemon.name} (${removed})`);
          return { ...p, currentDamage: (p.currentDamage ?? 0) - removed };
        };
        if (newPlayerActive) newPlayerActive = heal(newPlayerActive);
        newPlayerBench = newPlayerBench.map(heal);
        // Group Therapy: the opponent's Pokémon too (not a Defending Pokémon that prevents the attack's effects)
        if (effect.healBothSides) {
          if (newOpponentActive && !isKnockedOut && !defenderBlocksEffects) newOpponentActive = heal(newOpponentActive);
          newOpponentBench = newOpponentBench.map(heal);
        }
        if (healed.length > 0) events.push(createGameEvent(`${attack.name}: se curó el daño de ${healed.join(", ")}`, "action"));
      }

      // Heal: cure damage from self (e.g., Butterfree Mega Drain, Exeggcute Leech Seed, Venonat Leech Life)
      if (effect.type === AttackEffectType.Heal && !effect.healAllOwn && effect.target === AttackTarget.Self && newPlayerActive) {
        // Leech Seed: "unless all damage from this attack is prevented" (protection, Invisible Wall,
        // Transparency); an attack without damage (Spacing Out) heals anyway
        const damagePrevented = transparencyPrevents || (defenderIsProtected && damage > 0) || damageBarrierBlocked;
        // Blot / Sporadic Sponging: no such condition (`ignorePrevention`)
        let healAmount = damagePrevented && !effect.ignorePrevention ? 0 : effect.amount || 0;
        if (effect.healFromDamage === "all") {
          // Leech Life: as many counters as the damage done (after W/R)
          healAmount = effectiveDamage;
        } else if (effect.healFromDamage === "halfRoundedUp") {
          // Absorb: half the damage done, rounded up to the nearest 10
          healAmount = Math.ceil(effectiveDamage / 2 / 10) * 10;
        } else if (effect.healFromDamageDealt) {
          // Heal = half the actual damage dealt to the defender
          healAmount = Math.floor(effectiveDamage / 2);
          // Round down to nearest 10 (damage counters are multiples of 10)
          healAmount = Math.floor(healAmount / 10) * 10;
        }
        const attackerDamage: number = newPlayerActive.currentDamage || 0;
        const actualHeal = Math.min(healAmount, attackerDamage);
        if (actualHeal > 0) {
          newPlayerActive = {
            ...newPlayerActive,
            currentDamage: attackerDamage - actualHeal,
          };
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se curó ${actualHeal} de daño`,
              "action"
            )
          );
        }
      }

      // Recuperación: curar todo el daño descartando energía (ej: Starmie's Recuperación)
      if (effect.type === AttackEffectType.Recover && effect.target === "self" && newPlayerActive) {
        const discardReq = effect.discardCostRequirement;

        if (discardReq && discardReq.length > 0) {
          // Buscar y descartar las energías requeridas
          const remainingEnergy: GameCard[] = [...newPlayerActive.attachedEnergy];
          const discardedEnergy: GameCard[] = [];
          let canPay = true;

          const holder = newPlayerActive;
          if (selectedEnergyIds && selectedEnergyIds.length > 0) {
            // The player's choice (validated before the attack: checkDiscardSelection)
            for (const energyId of selectedEnergyIds) {
              const idx = remainingEnergy.findIndex((e) => e.id === energyId);
              if (idx !== -1) discardedEnergy.push(...remainingEnergy.splice(idx, 1));
            }
            canPay = discardedEnergy.length === discardReq.length;
          } else {
            for (const reqType of discardReq) {
              const idx = remainingEnergy.findIndex((e) => energyPaysDiscard(e, reqType, holder, gameState));
              if (idx !== -1) {
                discardedEnergy.push(...remainingEnergy.splice(idx, 1));
              } else {
                canPay = false;
                break;
              }
            }
          }

          if (canPay) {
            const healedAmount = newPlayerActive.currentDamage || 0;
            newPlayerDiscard.push(...discardedEnergy);

            newPlayerActive = {
              ...newPlayerActive,
              attachedEnergy: remainingEnergy,
              currentDamage: 0,
            };

            if (healedAmount > 0) {
              events.push(
                createGameEvent(
                  `${newPlayerActive.pokemon.name} se recuperó y curó ${healedAmount} de daño`,
                  "action"
                )
              );
            } else {
              events.push(
                createGameEvent(
                  `${newPlayerActive.pokemon.name} usó Recuperación (sin daño que curar)`,
                  "info"
                )
              );
            }
          } else {
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} no tiene la energía necesaria para Recuperación`,
                "info"
              )
            );
          }
        } else {
          // Sin costo de descarte, curar directamente
          const healedAmount = newPlayerActive.currentDamage || 0;
          newPlayerActive = {
            ...newPlayerActive,
            currentDamage: 0,
          };
          if (healedAmount > 0) {
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} se recuperó y curó ${healedAmount} de daño`,
                "action"
              )
            );
          }
        }
      }

      // Energy Bomb / Electric Current with no Benched Pokémon: the Energy cards to move are discarded
      if (effect.type === AttackEffectType.MoveAllEnergyToBench && newPlayerActive && !attackerKnockedOut && newPlayerBench.length === 0) {
        const discarded = energyToMove(newPlayerActive, effect);
        if (discarded.length > 0) {
          newPlayerDiscard.push(...discarded.map(cardOutOfPlayEnergy));
          newPlayerActive = { ...newPlayerActive, attachedEnergy: newPlayerActive.attachedEnergy.filter((e) => !discarded.includes(e)) };
          events.push(createGameEvent(
            effect.energyType
              ? `${newPlayerActive.pokemon.name} descartó ${discarded.map(energyCardLabel).join(", ")} (no hay Pokémon en la Banca)`
              : `${newPlayerActive.pokemon.name} descartó todas sus energías (no hay Pokémon en la Banca)`,
            "action"
          ));
        }
      }

      // Mirror Shell: remember the turn (checked during the opponent's next attack)
      if (effect.type === AttackEffectType.MirrorShell && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = { ...newPlayerActive, mirrorShellOnTurn: gameState.turnNumber };
        events.push(createGameEvent(`${newPlayerActive.pokemon.name} devolverá el daño que reciba durante el siguiente turno`, "action"));
      }

      // Deflector: damage halved during the opponent's next turn
      if (effect.type === AttackEffectType.HalveDamageNextTurn && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = { ...newPlayerActive, halveDamage: { onTurn: gameState.turnNumber + 1, attackName: attack.name } };
        events.push(createGameEvent(`${newPlayerActive.pokemon.name} recibirá la mitad del daño durante el siguiente turno`, "action"));
      }

      // Tunneling / Screaming Headbutt: locked during its owner's next turn
      if (effect.type === AttackEffectType.CantAttackNextTurn && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          attackLock: { onTurn: gameState.turnNumber + 2, ...(effect.thisAttackOnly && { attackName: attack.name }) },
        };
        events.push(createGameEvent(
          effect.thisAttackOnly
            ? `${newPlayerActive.pokemon.name} no podrá usar ${attack.name} durante el próximo turno de su dueño`
            : `${newPlayerActive.pokemon.name} no podrá atacar durante el próximo turno de su dueño`,
          "action"
        ));
      }

      // Shadow Images: until it takes damage
      if (effect.type === AttackEffectType.EvadeOnFlip && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = { ...newPlayerActive, evadeOnFlip: { attackName: attack.name } };
        events.push(createGameEvent(`Quien ataque a ${newPlayerActive.pokemon.name} deberá lanzar una moneda: si sale cruz, el ataque no le hace daño`, "action"));
      }

      // Crosscounter / Fire Wall: remembered for the opponent's next turn
      if (effect.type === AttackEffectType.CounterAttack && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          counterAttack: {
            onTurn: gameState.turnNumber,
            attackName: attack.name,
            ...(effect.amount !== undefined && { amount: effect.amount }),
            ...(effect.damageMultiplier !== undefined && { damageMultiplier: effect.damageMultiplier }),
            ...(effect.retaliationCoin && { retaliationCoin: true }),
            ...(effect.applyWeaknessResistance && { applyWeaknessResistance: true }),
          },
        };
        events.push(createGameEvent(`${newPlayerActive.pokemon.name} contraatacará si recibe daño de un ataque durante el siguiente turno`, "action"));
      }

      // Conversion 1 / 2 (Porygon), when the caller passed the chosen type
      if (options?.chosenType && options.chosenType !== EnergyTypeEnum.Colorless) {
        if (effect.type === AttackEffectType.ChangeWeakness && newOpponentActive && !isKnockedOut && !defenderBlocksEffects) {
          const hasWeakness = !!newOpponentActive.modifiedWeakness || (defenderCard.weaknesses ?? []).length > 0;
          if (hasWeakness) {
            newOpponentActive = { ...newOpponentActive, modifiedWeakness: options.chosenType };
            events.push(createGameEvent(`La Debilidad de ${newOpponentActive.pokemon.name} pasa a ser ${getEnergyTypeInSpanish(options.chosenType)}`, "action"));
          }
        }
        if (effect.type === AttackEffectType.ChangeResistance && newPlayerActive && !attackerKnockedOut) {
          newPlayerActive = { ...newPlayerActive, modifiedResistance: options.chosenType };
          events.push(createGameEvent(`La Resistencia de ${newPlayerActive.pokemon.name} pasa a ser ${getEnergyTypeInSpanish(options.chosenType)}`, "action"));
        }
      }

      // Descarte de energía como costo del ataque
      if (effect.type === AttackEffectType.Discard && newPlayerActive) {
        if (effect.target === AttackTarget.Self && effect.energyType && effect.amount && !effect.discardCostRequirement) {
          // Continuous Fireball / Fireball / Playing with Fire: N Energy cards of that type
          // (cards printed with the type first, Rainbow Energy last)
          const type = effect.energyType;
          const candidates = [
            ...newPlayerActive.attachedEnergy.filter((e) => energyProvidesType(e, type, newPlayerActive, gameState) && !(isEnergyCard(e) && e.providesAllTypes)),
            ...newPlayerActive.attachedEnergy.filter((e) => isEnergyCard(e) && e.providesAllTypes),
          ].slice(0, effect.amount);
          if (candidates.length > 0) {
            const ids = candidates.map((e) => e.id);
            newPlayerDiscard.push(...candidates);
            newPlayerActive = { ...newPlayerActive, attachedEnergy: newPlayerActive.attachedEnergy.filter((e) => !ids.includes(e.id)) };
            events.push(createGameEvent(`${newPlayerActive.pokemon.name} descartó ${candidates.map(energyCardLabel).join(", ")}`, "action"));
          }
        } else if (effect.discardAll && effect.energyType) {
          // Discharge: every Energy card of that type (Rainbow Energy included)
          const type = effect.energyType;
          const discarded: GameCard[] = newPlayerActive.attachedEnergy.filter((e) => energyProvidesType(e, type, newPlayerActive, gameState));
          if (discarded.length > 0) {
            newPlayerDiscard.push(...discarded);
            newPlayerActive = { ...newPlayerActive, attachedEnergy: newPlayerActive.attachedEnergy.filter((e: GameCard) => !discarded.includes(e)) };
            events.push(createGameEvent(`${newPlayerActive.pokemon.name} descartó ${discarded.map(energyCardLabel).join(", ")}`, "action"));
          }
        } else if (effect.discardAll) {
          // Descartar TODAS las energías (ej: Zapdos' Rayo)
          const allEnergy = [...newPlayerActive.attachedEnergy];
          if (allEnergy.length > 0) {
            newPlayerDiscard.push(...allEnergy);
            newPlayerActive = {
              ...newPlayerActive,
              attachedEnergy: [],
            };
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} descartó todas sus energías (${allEnergy.length})`,
                "action"
              )
            );
          }
        } else if (effect.discardCostRequirement) {
          // Descartar energías específicas (ej: Charizard' Giro Fuego, Ninetales' Lanzallamas)
          const remainingEnergy: GameCard[] = [...newPlayerActive.attachedEnergy];
          const discardedEnergy: GameCard[] = [];

          if (selectedEnergyIds && selectedEnergyIds.length > 0) {
            // The player's choice (validated before the attack: checkDiscardSelection)
            for (const energyId of selectedEnergyIds) {
              const idx = remainingEnergy.findIndex((e) => e.id === energyId);
              if (idx !== -1) {
                discardedEnergy.push(...remainingEnergy.splice(idx, 1));
              }
            }
          } else {
            // Auto-select energies (fallback for AI or legacy code)
            const discardReq = effect.discardCostRequirement;
            const holder = newPlayerActive;
            // Typed requirements first; Colorless (Kindle) = any Energy card, last
            const ordered = [...discardReq.filter((t) => t !== EnergyTypeEnum.Colorless), ...discardReq.filter((t) => t === EnergyTypeEnum.Colorless)];
            for (const reqType of ordered) {
              const matches = (e: GameCard): boolean => energyPaysDiscard(e, reqType, holder, gameState);
              // A card printed with that type first, Rainbow Energy last
              const exact = remainingEnergy.findIndex((e) => matches(e) && !(isEnergyCard(e) && e.providesAllTypes));
              const idx = exact !== -1 ? exact : remainingEnergy.findIndex(matches);
              if (idx !== -1) {
                discardedEnergy.push(...remainingEnergy.splice(idx, 1));
              }
            }
          }

          if (discardedEnergy.length > 0 && effect.discardTo === "hand") {
            // Energy Loop: the cost goes back to the hand instead
            newPlayerHand = [...newPlayerHand, ...discardedEnergy];
            newPlayerActive = { ...newPlayerActive, attachedEnergy: remainingEnergy };
            events.push(createGameEvent(`${newPlayerActive.pokemon.name} devolvió ${discardedEnergy.map(energyCardLabel).join(", ")} a la mano`, "action"));
          } else if (discardedEnergy.length > 0) {
            newPlayerDiscard.push(...discardedEnergy);
            newPlayerActive = {
              ...newPlayerActive,
              attachedEnergy: remainingEnergy,
            };

            const energyNames = discardedEnergy.map(energyCardLabel).join(", ");
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} descartó ${discardedEnergy.length} energía${discardedEnergy.length > 1 ? "s" : ""} (${energyNames})`,
                "action"
              )
            );
          }
        }
      }

      // BonusDamage (Self): store bonus for NEXT attack (e.g., Scyther's Swords Dance +30)
      if (effect.type === AttackEffectType.BonusDamage && effect.target === AttackTarget.Self && effect.amount && newPlayerActive && !attackerKnockedOut) {
        // Only store if it has no bonusDamageSource (those are immediate, like Nidoqueen's namedPokemon)
        if (!effect.bonusDamageSource) {
          newPlayerActive = {
            ...newPlayerActive,
            // "base damage is 60 instead of 30": a second Swords Dance doesn't stack
            nextTurnBonusDamage: effect.amount,
            nextTurnEffectAppliedOnTurn: gameState.turnNumber,
          };
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se preparó para hacer +${effect.amount} de daño en su próximo ataque`,
              "action"
            )
          );
        }
      }

      // ReduceDamage (Self): store damage reduction for next opponent's attack (e.g., Clefable's Minimize -20)
      if (effect.type === AttackEffectType.ReduceDamage && effect.target === AttackTarget.Self && effect.amount && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          nextTurnDamageReduction: (newPlayerActive.nextTurnDamageReduction || 0) + effect.amount,
          nextTurnEffectAppliedOnTurn: gameState.turnNumber,
        };
        events.push(
          createGameEvent(
            `${newPlayerActive.pokemon.name} reducirá el daño recibido en ${effect.amount} durante el próximo turno`,
            "action"
          )
        );
      }

      // Protection (non-coin-flip): apply protection to self (e.g., Onix's Harden)
      // Coin-flip protection (Kakuna, Metapod) is handled in frontend useCoinFlipHandler and AI executor
      if (effect.type === AttackEffectType.Protection && !effect.coinFlip && effect.target === AttackTarget.Self && newPlayerActive && !attackerKnockedOut) {
        const protType = effect.protectionType || ("damageOnly" as ProtectionType);
        const threshold = effect.amount; // undefined for full protection, number for threshold (e.g., 30 for Onix)
        newPlayerActive = applyProtection(newPlayerActive, protType, gameState.turnNumber, threshold);
        if (threshold !== undefined) {
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se endureció — prevendrá daño de ${threshold} o menos durante el próximo turno del rival`,
              "action"
            )
          );
        } else {
          events.push(
            createGameEvent(
              `¡${newPlayerActive.pokemon.name} se protegió! El daño será prevenido durante el próximo turno del rival`,
              "action"
            )
          );
        }
      }

      // DestinyBond: set flag on attacker (Gastly) — if KO'd by opponent's attack, attacker is also KO'd
      if (effect.type === AttackEffectType.DestinyBond && effect.target === AttackTarget.Self && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          destinyBondActive: true,
          destinyBondTurn: gameState.turnNumber,
        };
        events.push(
          createGameEvent(
            `¡${newPlayerActive.pokemon.name} activó Unión de Destino! Si es noqueado por un ataque, el atacante también será noqueado`,
            "action"
          )
        );
      }

      // Aplicar estado sin coinFlip (ej: Ivysaur's Polvo Veneno, Nidoking's Tóxico, Gloom's Foul Odor)
      if (effect.type === AttackEffectType.ApplyStatus && effect.status) {
        const status = effect.status;
        const statusMessages: Record<string, string> = {
          paralyzed: "paralizado",
          asleep: "dormido",
          confused: "confundido",
          poisoned: "envenenado",
        };
        const statusMessage = (name: string, s: StatusCondition) =>
          s === StatusCondition.CannotAttack
            ? `¡${name} no podrá atacar durante el próximo turno!`
            : `¡${name} está ${statusMessages[s] || s}!`;

        // Collect all statuses to apply (primary + additionalStatuses)
        const allStatuses = [status, ...(effect.additionalStatuses || [])];

        if (effect.target === AttackTarget.Self) {
          // Apply status to the ATTACKER (e.g., Vileplume Petal Dance → confused, Gloom Foul Odor → confused)
          if (newPlayerActive && !attackerKnockedOut) {
            for (const s of allStatuses) {
              const before: PokemonInPlay = newPlayerActive;
              newPlayerActive = applyStatusCondition(newPlayerActive, s, gameState.turnNumber);
              if (newPlayerActive !== before) {
                // Si es veneno con daño personalizado (Tóxico = 20), guardarlo
                if (s === StatusCondition.Poisoned && effect.poisonDamage) {
                  newPlayerActive = { ...newPlayerActive, poisonDamage: effect.poisonDamage };
                }
                events.push(createGameEvent(statusMessage(newPlayerActive.pokemon.name, s), "action"));
              }
            }
          }
        } else {
          // Apply status to the DEFENDER — only if not KO'd (don't transfer to promoted Pokemon)
          if (newOpponentActive && !isKnockedOut) {
            // DamageAndEffects protection (Agility/Barrier) blocks status effects
            if (defenderBlocksEffects) {
              events.push(
                createGameEvent(
                  `¡${newOpponentActive.pokemon.name} está protegido y no recibe efectos de estado!`,
                  "action"
                )
              );
            } else {
              // StatusImmunity (Snorlax's Thick Skinned) stops special conditions only;
              // Leer's "can't attack" is not a special condition
              let statusesToApply = allStatuses;
              if (hasStatusImmunity(newOpponentActive, gameState)) {
                statusesToApply = allStatuses.filter((s) => s === StatusCondition.CannotAttack);
                const immunityPowerName = isPokemonCard(newOpponentActive.pokemon) ? newOpponentActive.pokemon.power?.name || "Piel Gruesa" : "Piel Gruesa";
                if (statusesToApply.length < allStatuses.length) {
                  events.push(
                    createGameEvent(
                      isTrainerInPlay(newOpponentActive.pokemon)
                        ? `¡${newOpponentActive.pokemon.name} no puede verse afectado por estados especiales!`
                        : `¡${newOpponentActive.pokemon.name} es inmune a estados alterados gracias a ${immunityPowerName}!`,
                      "action"
                    )
                  );
                }
              }
              for (const s of statusesToApply) {
                const before: PokemonInPlay = newOpponentActive;
                newOpponentActive = applyStatusCondition(newOpponentActive, s, gameState.turnNumber);
                if (newOpponentActive !== before) {
                  // Si es veneno con daño personalizado (Tóxico = 20), guardarlo
                  if (s === StatusCondition.Poisoned && effect.poisonDamage) {
                    newOpponentActive = { ...newOpponentActive, poisonDamage: effect.poisonDamage };
                  }
                  events.push(createGameEvent(statusMessage(newOpponentActive.pokemon.name, s), "action"));
                } else if (s === StatusCondition.Poisoned && effect.poisonDamage && hasStatusCondition(newOpponentActive, s) && newOpponentActive.poisonDamage !== effect.poisonDamage) {
                  // Toxic: "20 Poison damage instead of 10 ... (even if it was already Poisoned)"
                  newOpponentActive = { ...newOpponentActive, poisonDamage: effect.poisonDamage };
                  events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} ahora recibe ${effect.poisonDamage} de daño por veneno!`, "action"));
                }
              }
            }
          }
        }
      }
    }
  }

  // =====================================================================
  // FORCE SWITCH / SELF SWITCH / PREVENT RETREAT / DECK SEARCH — post-effects processing
  // =====================================================================
  let pendingForceSwitch = false;
  let pendingSelfSwitch = false;
  let pendingDeckSearch: GameState["pendingDeckSearch"] = undefined;
  let noTrainersOnTurn = gameState.noTrainersOnTurn;
  let powersSuppressed = gameState.powersSuppressed;

  if (attack.effects) {
    for (const effect of attack.effects) {
      // Dark Wave: every Pokémon Power stops until the end of the opponent's next turn (not an
      // effect on the Defending Pokémon: protection doesn't stop it)
      if (effect.type === AttackEffectType.SuppressAllPowers && !effect.coinFlip) {
        powersSuppressed = [...(powersSuppressed ?? []), { source: attack.name, expiresAfterTurn: gameState.turnNumber + 1 }];
        events.push(createGameEvent(`${attack.name}: todos los Poderes Pokémon dejan de funcionar hasta el final del siguiente turno`, "action"));
      }

      // Headache: the opponent can't play Trainer cards during their next turn (not an effect on
      // the Defending Pokémon: protection doesn't stop it)
      if (effect.type === AttackEffectType.BlockTrainers && !effect.coinFlip) {
        noTrainersOnTurn = gameState.turnNumber + 1;
        events.push(createGameEvent("¡El defensor no podrá jugar cartas de Entrenador durante su próximo turno!", "action"));
      }

      // ForceSwitch: opponent must switch active with a bench Pokemon (Lure, Whirlwind, Ram).
      // Terror Strike (the opponent chooses) is a pending attack choice instead.
      if (effect.type === AttackEffectType.ForceSwitch && effect.target === AttackTarget.Defender && effect.switchChosenBy !== "opponent" && !effect.coinFlip) {
        // DamageAndEffects protection blocks ForceSwitch
        if (defenderBlocksEffects) {
          events.push(
            createGameEvent(
              `¡${newOpponentActive?.pokemon.name || defender.pokemon.name} está protegido y no puede ser forzado a cambiar!`,
              "action"
            )
          );
        // Only if opponent has bench Pokemon and wasn't KO'd
        } else if (newOpponentActive && !isKnockedOut) {
          const opponentBench = [...newOpponentBench];
          const hasBench = opponentBench.some(p => p != null);
          if (hasBench) {
            pendingForceSwitch = true;
            events.push(
              createGameEvent(
                `¡${newPlayerActive?.pokemon.name || attacker.pokemon.name} fuerza al rival a cambiar su Pokémon activo!`,
                "action"
              )
            );
          }
        }
      }

      // Good Morning: the Defending Pokémon is no longer Asleep
      if (effect.type === AttackEffectType.RemoveStatus && !effect.coinFlip && effect.status && newOpponentActive && !isKnockedOut && !defenderBlocksEffects) {
        if (hasStatusCondition(newOpponentActive, effect.status)) {
          newOpponentActive = removeStatusCondition(newOpponentActive, effect.status);
          events.push(createGameEvent(`${newOpponentActive.pokemon.name} ya no está ${effect.status === StatusCondition.Asleep ? "dormido" : effect.status}`, "action"));
        }
      }

      // Crystal Beam: no Energy cards attached to the Defending Pokémon during the opponent's next turn
      if (effect.type === AttackEffectType.BlockEnergyAttach && !effect.coinFlip && newOpponentActive && !isKnockedOut) {
        if (defenderBlocksEffects) {
          events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} está protegido y no es afectado por ${attack.name}!`, "action"));
        } else {
          newOpponentActive = { ...newOpponentActive, energyAttachBlockedOnTurn: gameState.turnNumber + 1 };
          events.push(createGameEvent(`No se podrán unir Energías a ${newOpponentActive.pokemon.name} durante el próximo turno`, "action"));
        }
      }

      // Fling: the Defending Pokémon and everything attached go into its owner's deck
      if (effect.type === AttackEffectType.ShuffleDefenderIntoDeck && newOpponentActive && !isKnockedOut) {
        if (defenderBlocksEffects) {
          events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} está protegido y no es afectado por ${attack.name}!`, "action"));
        } else {
          newOpponentDeck = shuffle([...newOpponentDeck, ...cardsLeavingPlay(newOpponentActive)]);
          events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} y todas sus cartas se barajaron en el mazo de su dueño!`, "action"));
          newOpponentActive = null;
          opponentNeedsToPromote = newOpponentBench.length > 0;
        }
      }

      // Vanish: the attacker goes into its owner's deck, the cards attached to the discard pile
      // (Phoenix Flame / Take Away: the cards attached go into the deck too)
      // (Lucky Duel: Vanish / Take Away can't be used; Phoenix Flame's tails works as printed and,
      // with no Bench, its owner loses)
      if (effect.type === AttackEffectType.ShuffleSelfIntoDeck && newPlayerActive && !attackerKnockedOut) {
        const leaving = newPlayerActive;
        if (effect.deckTop) {
          // Messenger: on top of the deck; the attack's search shuffles after (nothing to find: now)
          newPlayerDeck = [...cardsLeavingPlay(leaving), ...newPlayerDeck];
          const search = attack.effects?.find((e) => e.type === AttackEffectType.SearchDeckChoice);
          if (!search || !newPlayerDeck.some((c) => matchesDeckCardFilter(c, search.deckFilter))) newPlayerDeck = shuffle(newPlayerDeck);
          events.push(createGameEvent(`¡${leaving.pokemon.name} y todas sus cartas se pusieron encima del mazo de su dueño!`, "action"));
        } else if (effect.withAttachedCards) {
          newPlayerDeck = shuffle([...newPlayerDeck, ...cardsLeavingPlay(leaving)]);
          events.push(createGameEvent(`¡${leaving.pokemon.name} y todas sus cartas se barajaron en el mazo de su dueño!`, "action"));
        } else {
          newPlayerDeck = shuffle([...newPlayerDeck, ...[leaving.pokemon, ...(leaving.previousEvolutions ?? [])].map(cardOutOfPlay)]);
          newPlayerDiscard.push(...[...leaving.attachedEnergy, ...(leaving.attachedTrainers ?? [])].map(cardOutOfPlay));
          events.push(createGameEvent(`¡${leaving.pokemon.name} se barajó en el mazo de su dueño!`, "action"));
        }
        newPlayerActive = null;
        attackerLeftPlay = true;
        attackerNeedsToPromote = newPlayerBench.length > 0;
        if (attackerNeedsToPromote) events.push(createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info"));
      }

      // Star Boomerang: the attacker and every card attached to it go back to its owner's hand
      if (effect.type === AttackEffectType.ReturnToHand && effect.target === AttackTarget.Self && newPlayerActive && !attackerKnockedOut) {
        const leaving = newPlayerActive;
        if (effect.returnEnergyOnly) {
          // Fade Out: the Pokémon (with its lower stages) and its Energy cards; the rest is discarded
          const kept = [leaving.pokemon, ...(leaving.previousEvolutions ?? []), ...leaving.attachedEnergy].map(cardOutOfPlay);
          newPlayerHand = [...newPlayerHand, ...kept];
          newPlayerDiscard.push(...(leaving.attachedTrainers ?? []).map(cardOutOfPlay));
          events.push(createGameEvent(`¡${leaving.pokemon.name} y sus cartas de Energía volvieron a la mano de su dueño!`, "action"));
        } else {
          newPlayerHand = [...newPlayerHand, ...cardsLeavingPlay(leaving)];
          events.push(createGameEvent(`¡${leaving.pokemon.name} y todas sus cartas unidas volvieron a la mano de su dueño!`, "action"));
        }
        newPlayerActive = null;
        attackerLeftPlay = true;
        attackerNeedsToPromote = newPlayerBench.length > 0;
        if (attackerNeedsToPromote) events.push(createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info"));
      }

      // Psychic Exchange: the hand is shuffled into the deck, then `amount` cards are drawn
      if (effect.type === AttackEffectType.ShuffleHandDraw) {
        let deck = shuffle([...newPlayerDeck, ...newPlayerHand]);
        let hand: GameCard[] = [];
        for (let i = 0; i < (effect.amount ?? 0); i++) {
          const drawn = drawCard(deck, hand);
          if (!drawn.success) break;
          deck = drawn.newDeck;
          hand = drawn.newHand;
        }
        newPlayerDeck = deck;
        newPlayerHand = hand;
        events.push(createGameEvent(`${attack.name}: la mano se barajó en el mazo y se robaron ${hand.length} cartas`, "action"));
      }

      // Fidget: shuffle the attacker's deck
      if (effect.type === AttackEffectType.ShuffleOwnDeck) {
        newPlayerDeck = shuffle(newPlayerDeck);
        events.push(createGameEvent("Se mezcló el mazo del atacante", "action"));
      }

      // Mischief: shuffle the opponent's deck
      if (effect.type === AttackEffectType.ShuffleOpponentDeck) {
        newOpponentDeck = shuffle(newOpponentDeck);
        events.push(createGameEvent("Se mezcló el mazo del defensor", "action"));
      }

      // A deck search with nothing to find (or Sleight of Hand with an empty hand): only the shuffle
      if (effect.type === AttackEffectType.SearchDeckChoice) {
        const nothing = effect.putBackFromHand
          ? newPlayerHand.length === 0
          : !newPlayerDeck.some((c) => matchesDeckCardFilter(c, effect.deckFilter));
        if (nothing) {
          newPlayerDeck = shuffle(newPlayerDeck);
          events.push(createGameEvent(`${attack.name}: no se encontró nada en el mazo. Se mezcló el mazo`, "info"));
        }
      }

      // Rapid Evolution / Afternoon Nap with nothing to find: the deck is searched and shuffled
      if (effect.type === AttackEffectType.EvolveFromDeck || effect.type === AttackEffectType.AttachEnergyFromDeck) {
        const finds = effect.type === AttackEffectType.EvolveFromDeck
          ? newPlayerDeck.some((c) => isPokemonCard(c) && effect.searchPokemonNames?.includes(c.name))
          : newPlayerDeck.some((c) => isEnergyCard(c) && c.isBasic && c.energyType === effect.energyType);
        if (!finds) {
          newPlayerDeck = shuffle(newPlayerDeck);
          events.push(createGameEvent(`${attack.name}: no se encontró nada en el mazo. Se mezcló el mazo`, "info"));
        }
      }

      // SelfSwitch: attacker switches with own bench Pokemon (Teleport). Teleport Blast ("you may") is a pending attack choice.
      if (effect.type === AttackEffectType.SelfSwitch && effect.target === AttackTarget.Self && !effect.optional) {
        if (newPlayerActive && !attackerKnockedOut) {
          const hasBench = newPlayerBench.some(p => p != null);
          if (hasBench) {
            pendingSelfSwitch = true;
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} puede cambiarse con un Pokémon de la banca`,
                "action"
              )
            );
          }
        }
      }

      // PreventRetreat: defender can't retreat next turn (Acid)
      if (effect.type === AttackEffectType.PreventRetreat && newOpponentActive && !isKnockedOut) {
        // DamageAndEffects protection blocks PreventRetreat
        if (defenderBlocksEffects) {
          events.push(
            createGameEvent(
              `¡${newOpponentActive.pokemon.name} está protegido y no se le puede impedir retirarse!`,
              "action"
            )
          );
        // No coinFlip here — the coin flip is on the effect itself, handled in coin flip handler
        } else if (!effect.coinFlip) {
          newOpponentActive = {
            ...newOpponentActive,
            retreatPrevented: true,
            retreatPreventedOnTurn: gameState.turnNumber,
          };
          events.push(
            createGameEvent(
              `¡${newOpponentActive.pokemon.name} no puede retirarse durante el próximo turno!`,
              "action"
            )
          );
        }
      }

      // ReturnToHand: return defender to opponent's hand (Pidgeot's Hurricane)
      // Only if defender was NOT knocked out
      if (effect.type === AttackEffectType.ReturnToHand && effect.target === AttackTarget.Defender) {
        if (newOpponentActive && !isKnockedOut && defenderBlocksEffects) {
          events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} está protegido y no vuelve a la mano!`, "action"));
        } else if (newOpponentActive && !isKnockedOut) {
          // Return the defender and all attached cards to opponent's hand
          const cardsToReturn: GameCard[] = cardsLeavingPlay(newOpponentActive);

          // Add all cards to opponent's hand
          newOpponentHand = [...newOpponentHand, ...cardsToReturn];

          // Clear the defender
          newOpponentActive = null;

          events.push(
            createGameEvent(
              `¡${defender.pokemon.name} y todas sus cartas adjuntas volvieron a la mano!`,
              "action"
            )
          );

          // Opponent will need to promote from bench
          if (newOpponentBench.some(p => p !== null)) {
            // There are Pokemon on bench to promote
            opponentNeedsToPromote = true;
          } else {
            // No bench Pokemon - the game will end (handled by gameResult logic later)
            // The gameResult check at line 2774 will detect this: newOpponentActive === null && newOpponentBench.length === 0
            events.push(
              createGameEvent(
                "¡El rival no tiene Pokémon en la banca!",
                "action"
              )
            );
          }
        }
      }

      // SearchDeck: Buscar Pokemon en el deck y ponerlo en la banca (Call for Family, Sprout)
      if (effect.type === AttackEffectType.SearchDeck && effect.searchPokemonNames && effect.searchPokemonNames.length > 0) {
        const benchCount = newPlayerBench.filter(p => p !== null).length;
        if (benchCount >= maxBenchSize(gameState, "player")) {
          events.push(createGameEvent("Tu banca está llena, no puedes buscar Pokémon", "info"));
        } else {
          // Search deck for any matching Pokemon
          const matchingCards = newPlayerDeck.filter(card =>
            card.kind === CardKind.Pokemon &&
            card.stage === PokemonStage.Basic &&
            effect.searchPokemonNames!.includes(card.name)
          );

          if (matchingCards.length > 0) {
            // Take the first matching card
            const foundCard = matchingCards[0];
            // Remove from deck
            newPlayerDeck = newPlayerDeck.filter(c => c.id !== foundCard.id);
            // Shuffle deck
            newPlayerDeck = shuffle(newPlayerDeck);
            // Add to bench
            const newPokemonInPlay: PokemonInPlay = {
              pokemon: foundCard,
              attachedEnergy: [],
              attachedTrainers: [],
              previousEvolutions: [],
              statusConditions: [],
              currentDamage: 0,
              playedOnTurn: gameState.turnNumber,
            };
            newPlayerBench.push(newPokemonInPlay);
            events.push(createGameEvent(`Encontraste ${foundCard.name} y lo pusiste en tu banca`, "action"));
          } else {
            // Shuffle deck even if not found
            newPlayerDeck = shuffle(newPlayerDeck);
            events.push(createGameEvent("No se encontró ningún Pokémon con ese nombre en tu mazo", "info"));
          }
        }
      }

      // SandAttack: defender must flip coin to attack next turn (Sandshrew's Sand-Attack)
      if (effect.type === AttackEffectType.SandAttack && effect.target === AttackTarget.Defender) {
        if (newOpponentActive && !isKnockedOut) {
          if (defenderBlocksEffects) {
            events.push(
              createGameEvent(
                `¡${newOpponentActive.pokemon.name} está protegido y no es afectado por ${attack.name}!`,
                "action"
              )
            );
          } else {
            // Ink Spurt (`lasting`): no turn = until it evolves or is Benched; a Sand-attack on top
            // of it keeps it lasting (still one coin)
            const lasting = !!effect.lasting || (!!newOpponentActive.mustFlipToAttack && newOpponentActive.mustFlipToAttackTurn == null);
            newOpponentActive = {
              ...newOpponentActive,
              mustFlipToAttack: true,
              mustFlipToAttackTurn: lasting ? undefined : gameState.turnNumber,
            };
            events.push(
              createGameEvent(
                lasting
                  ? `¡${newOpponentActive.pokemon.name} deberá lanzar una moneda cada vez que intente atacar!`
                  : `¡${newOpponentActive.pokemon.name} deberá lanzar una moneda para atacar en su próximo turno!`,
                "action"
              )
            );
          }
        }
      }

      // DeckSearch: Open modal to search deck for Basic Pokemon (Call for Family)
      // Player can browse entire deck and select one valid Basic Pokemon
      if (effect.type === AttackEffectType.DeckSearch && effect.deckSearchFilter) {
        // Use original gameState bench count, not newPlayerBench which may have been modified by promotion
        const benchCount = gameState.playerBench.filter(p => p !== null).length;
        if (benchCount >= maxBenchSize(gameState, "player")) {
          events.push(createGameEvent("Tu banca está llena, no puedes buscar Pokémon", "info"));
        } else {
          // Set pending deck search with filter criteria
          pendingDeckSearch = {
            filter: effect.deckSearchFilter,
          };
          events.push(
            createGameEvent(
              `Busca en tu mazo un Pokémon Básico para colocar en tu banca`,
              "action"
            )
          );
        }
      }
    }
  }

  // DESTINY BOND: KO the attacker if Destiny Bond was triggered
  if (destinyBondTriggered && newPlayerActive && !attackerKnockedOut) {
    attackerKnockedOut = true;
    events.push(
      createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por Unión de Destino!`, "action")
    );

    ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
      applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por Unión de Destino"));
    newPlayerActive = null;
  }

  // STRIKES BACK: Aplicar contraataque si el defensor tiene damageReaction
  // Se aplica incluso si el defensor fue noqueado (usa defender, no newOpponentActive)
  if (effectiveDamage > 0 && newPlayerActive && !attackerKnockedOut) {
    const reaction = getDamageReaction(defender, true, gameState); // true = defender was active
    if (reaction) {
      const counterDamage = reaction.reactionDamage;
      const newAttackerDamage = (newPlayerActive.currentDamage || 0) + counterDamage;

      events.push(
        createGameEvent(
          `¡${reaction.powerName}! ${defender.pokemon.name} contraataca con ${counterDamage} de daño`,
          "action"
        )
      );

      // Verificar si el atacante es noqueado por el contraataque
      if (newAttackerDamage >= attackerCard.hp) {
        attackerKnockedOut = true;
        events.push(
          createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por el contraataque!`, "action")
        );

        // El KO del defensor da premio al jugador; el del atacante, al rival (siempre)
        ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
          applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por el contraataque"));
        newPlayerActive = null;
      } else {
        // Solo actualizar daño del atacante
        newPlayerActive = {
          ...newPlayerActive,
          currentDamage: newAttackerDamage,
        };
      }
    }
  }

  // RESTLESS SLEEP (Rocket's Snorlax): damaged while already Asleep (even if Knocked Out) → damage to the attacker
  const restless = effectiveDamage > 0 ? asleepDamageReaction(gameState, defender) : null;
  if (restless && newPlayerActive && !attackerKnockedOut) {
    const newAttackerDamage = (newPlayerActive.currentDamage || 0) + restless.damage;
    events.push(createGameEvent(`¡${restless.power.name}! ${defender.pokemon.name} le hizo ${restless.damage} de daño a ${newPlayerActive.pokemon.name}`, "action"));
    if (newAttackerDamage >= attackerCard.hp) {
      attackerKnockedOut = true;
      events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por ${restless.power.name}!`, "action"));
      ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
        applyAttackerKnockout(newPlayerActive, `El rival tomó un premio por ${restless.power.name}`));
      newPlayerActive = null;
    } else {
      newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
    }
  }

  // FINAL BEAM (Dark Gyarados): Knocked Out by this attack → its owner flips (the attack's defender
  // coin); heads = 20 × Water Energy attached to it, to the attacker, with Weakness/Resistance
  if (isKnockedOut && finalBeamCoin && effectiveDamage > 0 && newPlayerActive && !attackerKnockedOut && getKnockOutRetaliation(gameState, defender)) {
    const powerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name ?? "Rayo Final" : "Rayo Final";
    events.push(createGameEvent(`${powerName} de ${defender.pokemon.name} - Moneda: [coin:${finalBeamCoin}]`, "info"));
    const retaliation = finalBeamCoin === "heads" ? knockOutRetaliationDamage(gameState, defender, attacker) : 0;
    if (retaliation > 0) {
      const newAttackerDamage = (newPlayerActive.currentDamage || 0) + retaliation;
      events.push(createGameEvent(`¡${powerName}! ${defender.pokemon.name} le hizo ${retaliation} de daño a ${newPlayerActive.pokemon.name}`, "action"));
      if (newAttackerDamage >= attackerCard.hp) {
        attackerKnockedOut = true;
        events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por ${powerName}!`, "action"));
        ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
          applyAttackerKnockout(newPlayerActive, `El rival tomó un premio por ${powerName}`));
        newPlayerActive = null;
      } else {
        newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
      }
    }
  }

  // MIRROR SHELL (Dark Wartortle): attack damage done to it during this turn is done back to the
  // attacker, even if Dark Wartortle was Knocked Out (no Weakness/Resistance)
  if (effectiveDamage > 0 && defender.mirrorShellOnTurn === gameState.turnNumber - 1 && newPlayerActive && !attackerKnockedOut) {
    const newAttackerDamage = (newPlayerActive.currentDamage || 0) + effectiveDamage;
    events.push(createGameEvent(`¡Caparazón Espejo! ${defender.pokemon.name} le devuelve ${effectiveDamage} de daño a ${newPlayerActive.pokemon.name}`, "action"));
    if (newAttackerDamage >= attackerCard.hp) {
      attackerKnockedOut = true;
      events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por Caparazón Espejo!`, "action"));
      ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
        applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por Caparazón Espejo"));
      newPlayerActive = null;
    } else {
      newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
    }
  }

  // CROSSCOUNTER / FIRE WALL: attack damage done to it this turn is answered, even after a Knock Out
  const counter = activeCounterAttack(gameState, defender);
  if (counter && effectiveDamage > 0 && newPlayerActive && !attackerKnockedOut) {
    if (counter.retaliationCoin && counterAttackCoin) {
      events.push(createGameEvent(`${counter.attackName} de ${defender.pokemon.name} - Moneda: [coin:${counterAttackCoin}]`, "info"));
    }
    const retaliation = counterAttackDamage(gameState, defender, effectiveDamage, attacker, counterAttackCoin);
    if (retaliation > 0) {
      const newAttackerDamage = (newPlayerActive.currentDamage || 0) + retaliation;
      events.push(createGameEvent(`¡${counter.attackName}! ${defender.pokemon.name} le hizo ${retaliation} de daño a ${newPlayerActive.pokemon.name}`, "action"));
      if (newAttackerDamage >= attackerCard.hp) {
        attackerKnockedOut = true;
        events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por ${counter.attackName}!`, "action"));
        ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
          applyAttackerKnockout(newPlayerActive, `El rival tomó un premio por ${counter.attackName}`));
        newPlayerActive = null;
      } else {
        newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
      }
    }
  }

  // POLLEN DEFENSE (Erika's Vileplume): damaged by this attack (even if Knocked Out) → its owner's
  // coin (the attack's defender coin); heads = the attacking Pokémon is now Confused
  if (damagedStatusCoin && effectiveDamage + namedDefenderDamage > 0) {
    const power = getDamagedStatusFlip(gameState, defender);
    if (power) {
      events.push(createGameEvent(`${power.name} de ${defender.pokemon.name} - Moneda: [coin:${damagedStatusCoin}]`, "info"));
      if (damagedStatusCoin === "heads" && newPlayerActive && !attackerKnockedOut) {
        const status = power.status ?? StatusCondition.Confused;
        if (hasStatusImmunity(newPlayerActive, gameState)) {
          events.push(createGameEvent(`${newPlayerActive.pokemon.name} no puede verse afectado por estados especiales`, "action"));
        } else {
          newPlayerActive = applyStatusCondition(newPlayerActive, status, gameState.turnNumber);
          events.push(createGameEvent(`¡${power.name}! ${newPlayerActive.pokemon.name} pasa a estar ${STATUS_NAMES_ES[status] ?? status}`, "action"));
        }
      }
    }
  }

  // Marcar ataques de uso único como utilizados
  const hasUseOnceEffect = attack.effects?.some((e) => e.type === AttackEffectType.UseOnce);
  if (hasUseOnceEffect && newPlayerActive && !attackerKnockedOut) {
    const usedOnce = newPlayerActive.usedOnceAttacks ?? [];
    if (!usedOnce.includes(attack.name)) {
      newPlayerActive = {
        ...newPlayerActive,
        usedOnceAttacks: [...usedOnce, attack.name],
      };
    }
  }

  // Earthdrill: the attack it used this turn
  if (newPlayerActive && !attackerKnockedOut && !attackerLeftPlay) {
    newPlayerActive = { ...newPlayerActive, lastAttack: { name: printedAttack.name, turn: gameState.turnNumber } };
  }

  // Clear consumed next-turn effects
  if (consumedBonusDamage && newPlayerActive && !attackerKnockedOut) {
    const stillHasReduction = newPlayerActive.nextTurnDamageReduction;
    newPlayerActive = {
      ...newPlayerActive,
      nextTurnBonusDamage: undefined,
      // Only clear the turn tracker if no other effect remains
      nextTurnEffectAppliedOnTurn: stillHasReduction ? newPlayerActive.nextTurnEffectAppliedOnTurn : undefined,
    };
  }
  if (consumedDamageReduction && newOpponentActive) {
    const stillHasBonus = newOpponentActive.nextTurnBonusDamage;
    newOpponentActive = {
      ...newOpponentActive,
      nextTurnDamageReduction: undefined,
      nextTurnEffectAppliedOnTurn: stillHasBonus ? newOpponentActive.nextTurnEffectAppliedOnTurn : undefined,
    };
  }

  // FLEE (Misty's Tentacruel) used: after the attack, it switches with the chosen Benched Pokémon
  if (fleeTo && newOpponentActive && !isKnockedOut && newOpponentActive.pokemon.id === defender.pokemon.id) {
    const index = newOpponentBench.findIndex((p) => p.pokemon.id === fleeTo.pokemon.id);
    if (index !== -1) {
      const incoming = newOpponentBench[index];
      const toBench: PokemonInPlay = { ...clearStatusConditionsOnRetreat(newOpponentActive), modifiedWeakness: undefined, modifiedResistance: undefined };
      newOpponentBench = [...newOpponentBench.filter((_, i) => i !== index), toBench];
      newOpponentActive = incoming;
      const fleeName = getFleePower(gameState, defender)?.name ?? "Huida";
      events.push(createGameEvent(`${fleeName}: ${defender.pokemon.name} se cambió con ${incoming.pokemon.name}`, "action"));
    }
  }

  // Construir el estado después del ataque
  let stateAfterAttack: GameState = {
    ...gameState,
    // Knocked Out Actives stay in their slot until the single Knock Out check below
    playerActivePokemon: attackerKnockedOut ? knockedOutAttacker.pokemon : attackerLeftPlay ? newPlayerActive : (newPlayerActive ?? attacker),
    playerBench: newPlayerBench,
    playerDiscard: newPlayerDiscard,
    playerDeck: newPlayerDeck,
    opponentActivePokemon: isKnockedOut && newOpponentActive === null ? { ...defender, currentDamage: newDamage } : newOpponentActive,
    opponentBench: newOpponentBench,
    opponentDiscard: newOpponentDiscard,
    opponentDeck: newOpponentDeck,
    playerPrizes: newPlayerPrizes,
    playerHand: newPlayerHand,
    opponentPrizes: newOpponentPrizes,
    opponentHand: newOpponentHand,
    pendingForceSwitch: pendingForceSwitch || undefined,
    pendingSelfSwitch: pendingSelfSwitch || undefined,
    pendingDeckSearch: pendingDeckSearch,
    pendingBenchDamageSelection: pendingBenchDamageSelection,
    noTrainersOnTurn,
    powersSuppressed,
    attackedThisTurn: true,
    ...(newStadium !== (gameState.stadium ?? null) && { stadium: newStadium }),
    events,
  };
  stateAfterAttack = recordAttackHit(stateAfterAttack, attacker.pokemon.name, attack.name, attackDamageToDefender);

  // =====================================================================
  // STEP 4 — AFTER-EFFECTS that still damage: Shock Blast (Lt. Surge's Electrode) tails, 20 damage
  // to each Active Pokémon (the attacker and Electrode; no Weakness / Resistance)
  // =====================================================================
  if (shockBlastCoin === "tails" && attackDamageToDefender > 0) {
    const blast = (p: PokemonInPlay | null, id: string) => (p && p.pokemon.id === id ? { ...p, currentDamage: (p.currentDamage ?? 0) + 20 } : p);
    stateAfterAttack = {
      ...stateAfterAttack,
      playerActivePokemon: blast(stateAfterAttack.playerActivePokemon, attacker.pokemon.id),
      opponentActivePokemon: blast(stateAfterAttack.opponentActivePokemon, defender.pokemon.id),
      events: [...stateAfterAttack.events, createGameEvent(`${defenderPowerName}: hace 20 de daño a cada Pokémon Activo`, "action")],
    };
  }

  // =====================================================================
  // STEPS 5-7 — KNOCK OUTS, PRIZES, WIN CHECKS: one check of every Pokémon in play of both
  // players (checkKnockouts): the Defending Pokémon and the attacker as the damage step found them
  // (forced), Benched Pokémon hit by bench damage, Scram, a transformed Ditto whose copy changed...
  // Each player is owed one Prize per opposing Pokémon Knocked Out (picked with takePrize); a side
  // owed all its Prizes left takes them and wins; a side with no Pokémon loses.
  // =====================================================================
  const forcedKnockOuts = [
    ...(isKnockedOut ? [defender.pokemon.id] : []),
    ...(attackerKnockedOut && knockedOutAttacker.pokemon ? [knockedOutAttacker.pokemon.pokemon.id] : []),
  ];
  stateAfterAttack = endGameIfNoPokemonLeft(checkKnockouts(stateAfterAttack, { forcedKnockOuts }));
  if (stateAfterAttack.gameResult !== null) {
    return stateAfterAttack;
  }

  // =====================================================================
  // STEP 8 — PROMOTIONS (after the Prizes): the defending player first, then the attacker
  // =====================================================================
  // Pokémon that left play without a Knock Out during the effects (Fling, Vanish, Star Boomerang)
  let playerPromotes = stateAfterAttack.playerNeedsToPromote || attackerNeedsToPromote;
  let opponentPromotes = stateAfterAttack.opponentNeedsToPromote || opponentNeedsToPromote;
  const defenderKnockedOut = isKnockedOut && stateAfterAttack.opponentActivePokemon === null;
  if (defenderKnockedOut && stateAfterAttack.opponentBench.length > 0) {
    const remainingBench = stateAfterAttack.opponentBench;
    const pendingOpponentBenchDamage = stateAfterAttack.pendingBenchDamageSelection;
    if (pendingOpponentBenchDamage?.targetSide === "opponent") {
      // The attacker still chooses the benched targets: promote once that damage is done
      opponentPromotes = false;
      stateAfterAttack = {
        ...stateAfterAttack,
        pendingBenchDamageSelection: { ...pendingOpponentBenchDamage, promoteDefenderAfter: skipDefenderPromotion ? "choose" : "auto" },
      };
    } else if (skipDefenderPromotion) {
      // Its owner chooses (multiplayer, the AI's own attacks)
      opponentPromotes = true;
    } else {
      // Auto-promotion (single-player: the defender is the AI): the AI's promotion choice
      const index = chooseAutoPromotion(stateAfterAttack);
      const promoted = remainingBench[index];
      opponentPromotes = false;
      stateAfterAttack = {
        ...stateAfterAttack,
        opponentActivePokemon: promoted,
        opponentBench: remainingBench.filter((_, i) => i !== index),
        events: [...stateAfterAttack.events, createGameEvent(`${promoted.pokemon.name} pasa a ser el Pokémon activo del rival`, "info")],
      };
    }
  }
  // A promotion is only possible with something left on the Bench
  if (stateAfterAttack.opponentBench.length === 0) opponentPromotes = false;
  if (stateAfterAttack.playerBench.length === 0) playerPromotes = false;
  stateAfterAttack = { ...stateAfterAttack, playerNeedsToPromote: playerPromotes, opponentNeedsToPromote: opponentPromotes };
  // The new Defending Pokémon can change what a transformed Ditto copies
  stateAfterAttack = checkKnockouts(stateAfterAttack);
  if (stateAfterAttack.gameResult !== null) {
    return stateAfterAttack;
  }

  // Choices left to a player (Hyper Beam, Terror Strike, Prophecy, Wildfire, Energy Conversion,
  // Scavenge): a pending attack choice blocks the end of the turn until it is answered
  const choiceEffects = (attack.effects ?? []).filter((e) => !e.coinFlip && isAttackChoiceEffect(e));
  // Energy Drain (Koga's Muk) heads, damaged (even Knocked Out): its owner chooses 1 Energy card
  // attached to the attacker to discard — after the attack's own choices
  const attackerNow = stateAfterAttack.playerActivePokemon;
  if (energyDrainCoin === "heads" && attackDamageToDefender > 0 && attackerNow?.pokemon.id === attacker.pokemon.id && attackerNow.attachedEnergy.length > 0) {
    choiceEffects.push({ type: AttackEffectType.DiscardAttackerEnergy, target: AttackTarget.Self, sourceName: defenderPowerName });
  }
  if (choiceEffects.length > 0) {
    stateAfterAttack = startAttackChoices(stateAfterAttack, choiceEffects, {
      attackName: attack.name,
      attackerId: attacker.pokemon.id,
      defenderId: defender.pokemon.id,
      defenderKnockedOut: isKnockedOut,
      defenderBlocksEffects,
      discardIdsBefore: gameState.playerDiscard.map((c) => c.id),
      finalBeamCoin,
      counterAttackCoin,
      evadeCoin,
      damagedStatusCoin,
    });
  }

  // Si skipEndTurn es true, no terminar el turno (el caller lo hará después de aplicar efectos)
  if (skipEndTurn) {
    return stateAfterAttack;
  }

  // Don't end turn if there's a pending force/self switch, deck search, bench damage selection or attack choice — a player needs to choose first
  if (pendingForceSwitch || pendingSelfSwitch || pendingDeckSearch || pendingBenchDamageSelection || stateAfterAttack.pendingAttackChoice) {
    return stateAfterAttack;
  }

  // STEP 9 — END OF TURN, unless a Prize is owed (either side: the last takePrize ends the turn)
  // or a promotion is due
  if (
    stateAfterAttack.opponentActivePokemon !== null &&
    stateAfterAttack.playerActivePokemon !== null &&
    !stateAfterAttack.playerCanTakePrize &&
    !stateAfterAttack.opponentCanTakePrize
  ) {
    return endTurn(stateAfterAttack);
  }

  return stateAfterAttack;
}

/**
 * Confusion check before an attack (Base Set rule), for the side whose turn it is ("player").
 * The caller flips the coin (so the server can be authoritative) and passes the result.
 *
 * - Active not Confused → `{ state (same object), canAttack: true }`.
 * - Heads → `canAttack: true`; only a coin event is added. The caller then runs the attack.
 * - Tails → `canAttack: false`; the attack is used but fails: the active takes
 *   CONFUSION_SELF_DAMAGE (20, no weakness/resistance). If that knocks it out it is handled
 *   like an attacker self-KO in executeAttack (discard, opponent auto-takes one prize,
 *   promotion or defeat, game over on the last prize). Then the turn ends like a resolved
 *   attack: endTurn is called internally unless `skipEndTurn`, the game is over, or the
 *   active was knocked out (the turn then waits for the promotion, exactly as after an
 *   executeAttack self-KO: promote, then call endTurn).
 *
 * @param skipEndTurn - like executeAttack: return before endTurn (e.g. callers that swap
 *   perspective and want to call endTurn themselves)
 */
export function resolveConfusionFlip(
  state: GameState,
  heads: boolean,
  skipEndTurn: boolean = false
): { state: GameState; canAttack: boolean } {
  const active = state.playerActivePokemon;
  if (!active || !hasStatusCondition(active, StatusCondition.Confused)) {
    return { state, canAttack: true };
  }

  const name = active.pokemon.name;
  const coin = heads ? "[coin:heads]" : "[coin:tails]";
  const events: GameEvent[] = [
    ...state.events,
    createGameEvent(`${name} está confundido - Moneda: ${coin}`, "info"),
  ];

  if (heads) {
    events.push(createGameEvent("[coin:heads] El ataque procede normalmente", "info"));
    return { state: { ...state, events }, canAttack: true };
  }

  events.push(createGameEvent(`[coin:tails] ${name} se lastima a sí mismo`, "info"));
  // Frenzy (Dark Primeape): 30 more, even to itself
  const selfDamage = CONFUSION_SELF_DAMAGE + getConfusedDamageBonus(state, active);
  events.push(createGameEvent(`${name} se hizo ${selfDamage} de daño a sí mismo`, "action"));

  const newDamage = (active.currentDamage ?? 0) + selfDamage;
  // A confused Ditto isn't a copy: its own HP
  const knockedOut = active.pokemon.kind === CardKind.Pokemon && newDamage >= getEffectiveHp(state, active);

  if (!knockedOut) {
    const damaged: GameState = {
      ...state,
      playerActivePokemon: { ...active, currentDamage: newDamage },
      attackedThisTurn: true,
      events,
    };
    const endsTurn = !skipEndTurn && state.opponentActivePokemon !== null &&
      !damaged.pendingForceSwitch && !damaged.pendingSelfSwitch &&
      !damaged.pendingDeckSearch && !damaged.pendingBenchDamageSelection;
    return { state: endsTurn ? endTurn(damaged) : damaged, canAttack: false };
  }

  events.push(createGameEvent(`¡${name} se noqueó a sí mismo!`, "action"));
  // The shared Knock Out check: the opponent is owed the Prize, the player promotes (or loses);
  // the turn waits for them (the last takePrize / the promotion ends it)
  return {
    state: checkKnockouts(
      { ...state, playerActivePokemon: { ...active, currentDamage: newDamage }, attackedThisTurn: true, events },
      { forcedKnockOuts: [active.pokemon.id] }
    ),
    canAttack: false,
  };
}

/**
 * Ejecuta Metronomo (Clefairy/Clefable) - copia un ataque del oponente y lo ejecuta
 * con todos sus efectos, ignorando costos de energía y descarte.
 * @param gameState - Estado actual del juego
 * @param copiedAttack - El ataque copiado del Pokémon rival
 * @returns Nuevo estado del juego después de ejecutar el ataque copiado
 *
 * Same two call forms as executeAttack: `{ coinResults, skipEndTurn, skipDefenderPromotion }`
 * (coins counted with `getAttackCoinFlipCount(state, copiedAttack)`, resolved by the engine)
 * or the deprecated positional booleans (coin effects skipped).
 */
export function executeMetronome(gameState: GameState, copiedAttack: Attack, options?: ExecuteAttackOptions): GameState;
/** @deprecated Coin effects are skipped in this form; pass `{ coinResults }` instead. */
export function executeMetronome(
  gameState: GameState,
  copiedAttack: Attack,
  skipEndTurn?: boolean,
  skipDefenderPromotion?: boolean
): GameState;
export function executeMetronome(
  gameState: GameState,
  copiedAttack: Attack,
  skipEndTurnOrOptions: boolean | ExecuteAttackOptions = false,
  skipDefenderPromotion: boolean = false
): GameState {
  assertLegal(canExecuteMetronome(gameState, copiedAttack));
  return executeCopiedAttack(gameState, copiedAttack, skipEndTurnOrOptions, skipDefenderPromotion);
}

/**
 * The coins an attack copied by the Active (ESP's 3 heads) needs, laid out like getAttackCoinPlan
 * for the copy executeCopiedAttack runs (no Energy cost; the Smokescreen coin of the attack that
 * copies it was already flipped, so the Active must not be under one: callers clear it first).
 */
export function getCopiedAttackCoinPlan(state: GameState, copiedAttack: Attack): AttackCoinPlan {
  const attacker = state.playerActivePokemon;
  if (!attacker || !isPokemonCard(attacker.pokemon)) return { smokescreen: 0, attack: 0, defender: 0 };
  const card = getEffectivePokemonCard(state, attacker) ?? (attacker.pokemon as PokemonCard);
  const temp: PokemonInPlay = {
    ...attacker,
    pokemon: { ...card, ...(card.transformedFrom && { power: undefined }), attacks: [{ ...copiedAttack, cost: [] }] } as PokemonCard,
  };
  return getAttackCoinPlan({ ...state, playerActivePokemon: temp }, 0);
}

/**
 * Run `copiedAttack` (one of the Defending Pokémon's attacks) as the Active's attack, without its
 * Energy cost or Energy discards: Metronome (executeMetronome checks it is legal first) and ESP's
 * 3 heads (Misty's Psyduck). No legality check here. `source` names what copied it in the log.
 */
export function executeCopiedAttack(
  gameState: GameState,
  copiedAttack: Attack,
  skipEndTurnOrOptions: boolean | ExecuteAttackOptions = false,
  skipDefenderPromotion: boolean = false,
  source: string = "Metrónomo"
): GameState {
  const attacker = gameState.playerActivePokemon;
  const defender = gameState.opponentActivePokemon;

  if (!attacker || !defender) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No hay Pokémon para atacar", "info"),
      ],
    };
  }

  if (attacker.pokemon.kind !== CardKind.Pokemon || defender.pokemon.kind !== CardKind.Pokemon) {
    return gameState;
  }

  // Log del uso de Metronomo
  const events = [
    ...gameState.events,
    createGameEvent(`¡${attacker.pokemon.name} usó ${source} y copió ${copiedAttack.name}!`, "action"),
  ];

  // Crear un ataque temporal que use el daño y efectos del ataque copiado
  // pero sin requisitos de energía o descarte (Metronomo ignora esos requisitos)
  const metronomeAttack: Attack = {
    ...copiedAttack,
    cost: [], // Metronomo no requiere energía específica (ya fue pagada con el costo de Metronomo)
    effects: copiedAttack.effects?.map(effect => {
      // Ignorar efectos de descarte de energía (Metronomo no descarta)
      if (effect.type === AttackEffectType.Discard) {
        return { ...effect, type: AttackEffectType.Discard, discardAll: false, discardCostRequirement: [] };
      }
      return effect;
    }),
  };

  // Crear un estado temporal con un Pokémon que tenga el ataque de Metronomo
  // A transformed Ditto uses Metronome as the copied card (its type, HP...); the temporary card
  // drops Transform so the copy isn't recomputed from the attack below
  const attackerCard = getEffectivePokemonCard(gameState, attacker) ?? (attacker.pokemon as PokemonCard);
  const tempAttacker: PokemonInPlay = {
    ...attacker,
    pokemon: {
      ...attackerCard,
      ...(attackerCard.transformedFrom && { power: undefined }),
      attacks: [metronomeAttack], // Reemplazar ataques con el ataque copiado
    } as PokemonCard,
  };

  const tempState: GameState = {
    ...gameState,
    playerActivePokemon: tempAttacker,
    events,
  };

  // Ejecutar el ataque copiado usando executeAttack
  // Metronome never discards Energy, so selectedEnergyIds is dropped
  const resultState = typeof skipEndTurnOrOptions === "object" && skipEndTurnOrOptions !== null
    ? executeAttackUnchecked(tempState, 0, { ...skipEndTurnOrOptions, selectedEnergyIds: undefined }, false, undefined, copiedAttack)
    : executeAttackUnchecked(tempState, 0, !!skipEndTurnOrOptions, skipDefenderPromotion, undefined);

  // A power asked mid-attack (Flee, Bench Guard): nothing happened, Metronome is used again with the answer
  const paused = resultState.pendingAttackChoice;
  if (paused?.reaction?.resume.kind === "attack") {
    // The copy is run again (executeCopiedAttack) with the answer, logged with the same source
    const resume = source === "Metrónomo" ? paused.reaction.resume : { ...paused.reaction.resume, copySource: source };
    return {
      ...gameState,
      pendingAttackChoice: { ...paused, reaction: { ...paused.reaction, resume } },
      events: [...gameState.events, ...resultState.events.slice(tempState.events.length)],
    };
  }

  // Restaurar el Pokémon original (con sus ataques reales) después de ejecutar; also the card
  // itself when the copied attack moved it out of play (Selfdestruct, Strikes Back, Vanish...)
  const realCard = (c: GameCard): GameCard => (c.id === attacker.pokemon.id ? attacker.pokemon : c);
  return {
    ...resultState,
    playerActivePokemon: resultState.playerActivePokemon
      ? { ...resultState.playerActivePokemon, pokemon: attacker.pokemon }
      : null,
    playerDiscard: resultState.playerDiscard.map(realCard),
    playerDeck: resultState.playerDeck.map(realCard),
  };
}

/**
 * Permite al jugador tomar un premio después de noquear un Pokémon rival
 * @param gameState - Estado actual del juego
 * @param prizeIndex - Índice del premio a tomar (0-5)
 * @param isPlayer - Si es el jugador o el oponente quien toma el premio
 * @returns Nuevo estado del juego con el premio tomado
 */
export function takePrize(gameState: GameState, prizeIndex: number, isPlayer: boolean = true, shouldEndTurn: boolean = true): GameState {
  // Bloquear si el juego ya terminó
  if (gameState.gamePhase === GamePhase.GameOver) {
    return gameState;
  }

  const prizes = isPlayer ? gameState.playerPrizes : gameState.opponentPrizes;
  const owed = prizesOwed(gameState, isPlayer ? "player" : "opponent");
  const canTake = owed > 0;

  // Verificar que puede tomar un premio
  if (!canTake) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No puedes tomar un premio ahora", "info"),
      ],
    };
  }

  // Verificar que el índice es válido
  if (prizeIndex < 0 || prizeIndex >= prizes.length) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("Premio inválido", "info"),
      ],
    };
  }

  // Tomar el premio - las cartas nuevas van a la izquierda de la mano
  const prize = prizes[prizeIndex];
  const newPrizes = prizes.filter((_, i) => i !== prizeIndex);
  const newHand = isPlayer
    ? [prize, ...gameState.playerHand]
    : [prize, ...gameState.opponentHand];

  const events = [
    ...gameState.events,
    createGameEvent(
      isPlayer ? "Tomaste un premio" : "El rival tomó un premio",
      "action"
    ),
  ];

  // Verificar victoria por premios
  let gameResult: GameResult = null;
  let gamePhase: GamePhase = gameState.gamePhase;

  if (newPrizes.length === 0) {
    events.push(
      createGameEvent(
        isPlayer ? "¡Victoria! Has tomado todos tus premios" : "¡Derrota! El rival tomó todos sus premios",
        "system"
      )
    );
    events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
    gameResult = isPlayer ? "victory" : "defeat";
    gamePhase = GamePhase.GameOver;
  }

  // One Prize fewer owed (the count never exceeds the Prizes left)
  const updatedState: GameState = withPrizesOwed(
    {
      ...gameState,
      gamePhase,
      gameResult,
      playerPrizes: isPlayer ? newPrizes : gameState.playerPrizes,
      playerHand: isPlayer ? newHand : gameState.playerHand,
      opponentPrizes: !isPlayer ? newPrizes : gameState.opponentPrizes,
      opponentHand: !isPlayer ? newHand : gameState.opponentHand,
      events,
    },
    isPlayer ? "player" : "opponent",
    owed - 1
  );

  // No terminar turno si el juego terminó o si se indica que no debe terminar
  if (gameResult !== null || !shouldEndTurn) {
    return updatedState;
  }

  // The turn ends with the last thing it waited for: only a turn that is already over (an attack
  // was made, or endTurn paused after the between-turns checkup), with no Prize owed by either
  // side, no promotion due and both Actives in play. A Prize owed in the middle of a turn (Curse,
  // Buzzap) leaves the turn going.
  const turnDone = gameState.attackedThisTurn === true || gameState.checkupDoneOnTurn === gameState.turnNumber;
  if (
    turnDone &&
    !updatedState.playerCanTakePrize &&
    !updatedState.opponentCanTakePrize &&
    !updatedState.playerNeedsToPromote &&
    !updatedState.opponentNeedsToPromote &&
    updatedState.opponentActivePokemon !== null &&
    updatedState.playerActivePokemon !== null
  ) {
    return endTurn(updatedState);
  }

  return updatedState;
}

/**
 * Promueve un Pokémon de la banca a la posición activa
 * Se usa cuando el jugador necesita elegir manualmente qué Pokémon promover después de un KO
 * @param gameState - Estado actual del juego
 * @param benchIndex - Índice del Pokémon en la banca a promover (0-4)
 * @param isPlayer - Si es el jugador o el oponente quien promueve
 * @returns Nuevo estado del juego con el Pokémon promovido
 */
export function promoteActivePokemon(
  gameState: GameState,
  benchIndex: number,
  isPlayer: boolean = true
): GameState {
  const bench = isPlayer ? gameState.playerBench : gameState.opponentBench;
  const pokemonToPromote = bench[benchIndex];

  if (!pokemonToPromote) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No hay Pokémon en esa posición de la banca", "info"),
      ],
    };
  }

  // Remover de la banca
  const newBench = bench.filter((_, i) => i !== benchIndex);

  const events = [
    ...gameState.events,
    createGameEvent(
      `${pokemonToPromote.pokemon.name} pasa a ser ${isPlayer ? "tu" : "el"} Pokémon activo`,
      "action"
    ),
  ];

  // The new Active may change what a transformed Ditto copies (Knock Out if its new HP is too low)
  if (isPlayer) {
    return checkKnockouts({
      ...gameState,
      playerActivePokemon: pokemonToPromote,
      playerBench: newBench,
      playerNeedsToPromote: false,
      events,
    });
  } else {
    return checkKnockouts({
      ...gameState,
      opponentActivePokemon: pokemonToPromote,
      opponentBench: newBench,
      opponentNeedsToPromote: false,
      events,
    });
  }
}
