import { prizesOwed } from "@/lib/gameState";
/**
 * Gym Heroes attack effects (texts in data/pokemontcg/gym1.json).
 *
 * Every Gym Heroes attack with text and the effect data it runs on. "existing" = the
 * AttackEffectType vocabulary already had it (same wording in Base Set / Jungle / Fossil /
 * Team Rocket); "NEW" = a new effect kind or a new option of an existing one (each tested in
 * "new effect kinds" below with a test-only attack, then card by card).
 *
 * | # | Card | Attack | Effect data | Kind |
 * |---|---|---|---|---|
 * | 1 | Blaine's Moltres | Phoenix Flame | ShuffleSelfIntoDeck `withAttachedCards`, coin onTails | NEW (option) |
 * | 2 | Brock's Rhydon | Lariat | AttackFails onTails | existing |
 * | 3 | Erika's Clefable | Fairy Power | ReturnPokemonToHand (attack choice), coin onHeads | NEW |
 * | 4 | Erika's Dragonair | Blizzard | BenchDamage opponent (heads) / own (tails) | existing |
 * | 4 | Erika's Dragonair | Take Away | ShuffleSelfIntoDeck `withAttachedCards` + ShuffleDefenderIntoDeck | NEW (option) + existing |
 * | 5 | Erika's Vileplume | Mega Drain | Heal `healFromDamage: "halfRoundedUp"` | existing |
 * | 6, 27 | Lt. Surge's Electabuzz | Charge | AttachEnergyFromDiscard (attack choice, up to 2 Lightning) | NEW |
 * | 6 | Lt. Surge's Electabuzz | Discharge | Discard `discardAll` + `energyType` + CoinFlipDamage `coinCountFromEnergyType` | NEW (option) + existing |
 * | 7 | Lt. Surge's Fearow | Repeating Drill | CoinFlipDamage ×5 | existing |
 * | 7 | Lt. Surge's Fearow | Clutch | PreventRetreat | existing |
 * | 8 | Lt. Surge's Magneton | Mega Shock | SelfDamage onTails | existing |
 * | 9 | Misty's Seadra | Knockout Needle | CoinFlipDamage ×2 `minHits: 2` | existing |
 * | 10 | Misty's Tentacruel | Jellyfish Poison | ApplyStatus heads Poisoned / tails Confused | existing |
 * | 11 | Rocket's Hitmonchan | Crosscounter | CounterAttack (coin, ×2) | NEW |
 * | 12 | Rocket's Moltres | Fire Wall | CounterAttack (10, W/R) | NEW |
 * | 13 | Rocket's Scyther | Shadow Images | EvadeOnFlip | NEW |
 * | 14 | Sabrina's Gengar | Pain Amplifier | DamageCountersOnDamaged | NEW |
 * | 14 | Sabrina's Gengar | Call of the Night | ShuffleDefenderIntoDeck, 2 coins `minHits: 2` | existing |
 * | 20 | Brock's Golem | Rock Slide | BenchDamage opponent up to 3 | existing |
 * | 21 | Brock's Onix | Bind | ApplyStatus Paralyzed (coin) | existing |
 * | 21 | Brock's Onix | Tunneling | BenchDamage opponent up to 2 + CantAttackNextTurn | existing + NEW |
 * | 22 | Brock's Rhyhorn | Horn Toss | ForceSwitch `switchChosenBy: "opponent"` | existing |
 * | 22 | Brock's Rhyhorn | Take Down | SelfDamage | existing |
 * | 23 | Brock's Sandslash | Needles | ApplyStatus Paralyzed + `additionalStatuses` Poisoned (coin) | existing |
 * | 23 | Brock's Sandslash | Sandstorm | SandAttack | existing |
 * | 24 | Brock's Zubat | Alert | RequireOwnBench + Draw + SelfSwitch | NEW + existing |
 * | 25 | Erika's Clefairy | Moonwatching | SearchDeckChoice (1 basic Energy → hand) | NEW |
 * | 25 | Erika's Clefairy | Comet Slap | CoinFlipDamage ×3 | existing |
 * | 27 | Lt. Surge's Electabuzz | Electric Current | MoveAllEnergyToBench `energyType` + `amount: 1` | NEW (option) |
 * | 28 | Lt. Surge's Raichu | Thunderbolt | Discard `discardAll` | existing |
 * | 29 | Misty's Cloyster | Triple Cannon | CoinFlipDamage ×3 | existing |
 * | 30 | Misty's Goldeen | Horn Hazard | AttackFails onTails | existing |
 * | 31 | Misty's Poliwrath | Water Ring | BenchDamage both `benchExcludeTypes: [Water]` | NEW (option) |
 * | 32 | Misty's Tentacool | Mysterious Light | ApplyStatus Asleep (coin) | existing |
 * | 32 | Misty's Tentacool | Jellyfish Pod | SearchDeckChoice (any number of named Pokémon → hand) | NEW |
 * | 33 | Rocket's Snorlax | Collapse | ApplyStatus Self Asleep | existing |
 * | 34 | Sabrina's Venomoth | Healing Pollen | Heal `healAllOwn`, 3 coins (10 per heads) | NEW (option) |
 * | 34 | Sabrina's Venomoth | Sonic Distortion | ApplyStatus Confused, 2 coins | existing |
 * | 35 | Blaine's Growlithe | Shake | ForceSwitch `switchChosenBy: "opponent"` | existing |
 * | 35 | Blaine's Growlithe | Fire Tackle | SelfDamage | existing |
 * | 36 | Blaine's Kangaskhan | Child's Punch | AttackFails onTails | existing |
 * | 36 | Blaine's Kangaskhan | One-Two Punch | CoinFlipDamage (+10) | existing |
 * | 37 | Blaine's Magmar | Firebreathing | CoinFlipDamage (+10) | existing |
 * | 37 | Blaine's Magmar | Lava Burst | MillSelfForDamage | NEW |
 * | 38 | Brock's Geodude | Lucky Shot | RequireOpponentBench + ChooseTargetDamage bench (coin) | existing |
 * | 39 | Brock's Golbat | Spiral Dive | BonusDamage 10 + IgnoreWeaknessResistance + BenchDamage opponent | existing |
 * | 40 | Brock's Graveler | Rock Toss | CoinFlipDamage ×3 | existing |
 * | 41 | Brock's Lickitung | Slam | CoinFlipDamage ×2 | existing |
 * | 42 | Erika's Dratini | Tail Strike | CoinFlipDamage (+20) | existing |
 * | 43 | Erika's Exeggcute | Deflector | HalveDamageNextTurn | NEW |
 * | 43 | Erika's Exeggcute | Egg Bomb | AttackFails `defenderOnly` onTails + SelfDamage onTails | NEW (option) + existing |
 * | 44 | Erika's Exeggutor | Psychic Exchange | ShuffleHandDraw | NEW |
 * | 44 | Erika's Exeggutor | Stomp | CoinFlipDamage (+10) | existing |
 * | 45 | Erika's Gloom | Healing Pollen | Heal Self 40 (coin) | existing |
 * | 45 | Erika's Gloom | Magic Pollen | ChooseStatus (attack choice, coin) | NEW |
 * | 46 | Erika's Gloom | Dream Dance | ApplyStatus Asleep, Defender and Self | existing |
 * | 46 | Erika's Gloom | Vile Smell | ApplyStatus Confused, Defender and Self | existing |
 * | 47 | Erika's Oddish | Poisonpowder | ApplyStatus Poisoned (coin) | existing |
 * | 48 | Erika's Weepinbell | Flytrap | RequireOpponentBench + ChooseTargetDamage `switchWithDefender` | existing |
 * | 49 | Erika's Weepinbell | Sleep Poison | ApplyStatus Asleep + `additionalStatuses` Poisoned | existing |
 * | 50 | Lt. Surge's Magnemite | Removal Pulse | Discard Defender (attack choice, coin) | existing |
 * | 50 | Lt. Surge's Magnemite | Confusion Pulse | ApplyStatus Confused (coin) | existing |
 * | 51 | Lt. Surge's Raticate | Super Fang | HalfHPDamage | existing |
 * | 53 | Misty's Poliwhirl | Rapids | Discard Defender (attack choice, coin) | existing |
 * | 53 | Misty's Poliwhirl | Water Punch | CoinFlipDamage `coinCountFromEnergyType: Water` | existing |
 * | 54 | Misty's Psyduck | Call for Friend | SearchDeckChoice (Basic "Misty" → Bench, coin) | NEW |
 * | 55 | Misty's Seaking | Mud Splash | ChooseTargetDamage bench (coin) | existing |
 * | 56 | Misty's Starmie | Water Gun | ExtraEnergy Water (+20 max) | existing |
 * | 56 | Misty's Starmie | Bubblebeam | ApplyStatus Paralyzed (coin) | existing |
 * | 57 | Misty's Tentacool | Crystal Beam | BlockEnergyAttach (coin) | NEW |
 * | 58 | Sabrina's Haunter | Night Spirits | CoinFlipDamage `coinCountSource: "ownNamedInPlay"` | NEW (option) |
 * | 59 | Sabrina's Jynx | Good Night | ApplyStatus Asleep | existing |
 * | 59 | Sabrina's Jynx | Good Morning | RemoveStatus Asleep | NEW |
 * | 60 | Sabrina's Slowbro | Naptime | Heal Self 30 + ApplyStatus Self Asleep (coin) | existing |
 * | 60 | Sabrina's Slowbro | Screaming Headbutt | CantAttackNextTurn `thisAttackOnly` | NEW |
 * | 61 | Blaine's Charmander | Kindle | Discard cost `[Colorless]` (any Energy card) + Discard Defender | NEW (option) + existing |
 * | 62 | Blaine's Growlithe | Blaze | BenchDamage opponent `benchTypes: [Grass]` | NEW (option) |
 * | 63 | Blaine's Ponyta | Agility | Protection damageAndEffects (coin) | existing |
 * | 64 | Blaine's Tauros | 3-Pronged Tail | CoinFlipDamage ×3 | existing |
 * | 64 | Blaine's Tauros | Full Speed Charge | CoinFlipDamage ×4 + SelfDamage per tails | existing |
 * | 65 | Blaine's Vulpix | Tail Fan | ApplyStatus Confused (coin) | existing |
 * | 66 | Brock's Geodude | Call for Friend | SearchDeckChoice (Basic "Brock" → Bench, coin) | NEW |
 * | 66 | Brock's Geodude | Hook Shot | IgnoreWeaknessResistance `resistanceOnly` | NEW (option) |
 * | 67 | Brock's Mankey | Taunt | ForceSwitch (attacker chooses) | existing |
 * | 68 | Brock's Mankey | Fidget | ShuffleOwnDeck | NEW |
 * | 68 | Brock's Mankey | Karate Chop | SelfDamageReduction | existing |
 * | 69 | Brock's Onix | Bellow | ApplyStatus Paralyzed (coin) | existing |
 * | 70 | Brock's Rhyhorn | Drill Tackle | AttackFails, 2 coins onTails | existing |
 * | 71 | Brock's Sandshrew | Defense Curl | Protection damageOnly (coin) | existing |
 * | 72 | Brock's Sandshrew | Sand Pit | PreventRetreat | existing |
 * | 73 | Brock's Vulpix | Quick Attack | CoinFlipDamage (+20) | existing |
 * | 74 | Brock's Zubat | Poison Fang | ApplyStatus Poisoned (coin) | existing |
 * | 75 | Erika's Bellsprout | Poison Vine | ApplyStatus Poisoned (coin) | existing |
 * | 76 | Erika's Bellsprout | Careless Tackle | SelfDamage | existing |
 * | 77 | Erika's Exeggcute | Eggsplosion | CoinFlipDamage `coinCountFromEnergy` | existing |
 * | 77 | Erika's Exeggcute | Psychic | BonusDamage `bonusDamageSource: "defenderEnergyCards"` | NEW (option) |
 * | 78 | Erika's Oddish | Blot | Heal Self 10 `ignorePrevention` | NEW (option) |
 * | 78 | Erika's Oddish | Sporadic Sponging | Heal Self 10 `ignorePrevention` (coin) | NEW (option) |
 * | 79 | Erika's Tangela | Stretch Vine | BenchDamage opponent, 1 chosen | existing |
 * | 80 | Lt. Surge's Magnemite | Thundershock | ApplyStatus Paralyzed (coin) | existing |
 * | 81 | Lt. Surge's Pikachu | Charge | AttachEnergyFromDiscard (1 Lightning) | NEW |
 * | 81 | Lt. Surge's Pikachu | Lightning Tail | ApplyStatus Paralyzed (coin) | existing |
 * | 82 | Lt. Surge's Rattata | Focus Energy | BonusDamage Self 20 next turn (Gnaw 20 → 40) | existing |
 * | 83 | Lt. Surge's Spearow | Whirlwind | ForceSwitch `switchChosenBy: "opponent"` | existing |
 * | 83 | Lt. Surge's Spearow | Razor Wind | AttackFails onTails | existing |
 * | 84 | Lt. Surge's Voltorb | Spin Ball / Double Spin | CoinFlipDamage ×1 / ×2 | existing |
 * | 85 | Misty's Goldeen | Fury Attack | CoinFlipDamage ×2 | existing |
 * | 85 | Misty's Goldeen | Supersonic | ApplyStatus Confused (coin) | existing |
 * | 86 | Misty's Horsea | Smokescreen | SandAttack | existing |
 * | 87 | Misty's Poliwag | Hypnotic Stare | ApplyStatus heads Paralyzed / tails Asleep | existing |
 * | 87 | Misty's Poliwag | Tail Rap | CoinFlipDamage ×2 | existing |
 * | 89 | Misty's Shellder | Clamp | ApplyStatus Paralyzed (heads) + AttackFails (tails) | existing |
 * | 90 | Misty's Staryu | Swift | IgnoreDefenderEffects | NEW |
 * | 91 | Sabrina's Abra | Energy Loop | Discard cost `[Psychic]` `discardTo: "hand"` | NEW (option) |
 * | 92 | Sabrina's Drowzee | Suggestion | ApplyStatus CannotAttack (coin) | existing |
 * | 93 | Sabrina's Gastly | Spook | PreventRetreat | existing |
 * | 94 | Sabrina's Mr. Mime | Sleight of Hand | SearchDeckChoice `putBackFromHand: 3` (basic Energy → hand) | NEW |
 * | 95 | Sabrina's Slowpoke | Lazy Attack | ApplyStatus Self Asleep | existing |
 * | 96 | Sabrina's Venonat | Poison Antennae | ApplyStatus Poisoned | existing |
 * | 96 | Sabrina's Venonat | Removal Beam | Discard Defender (attack choice, coin) | existing |
 */
import { describe, it, expect } from "vitest";
import { canAttachEnergy, clearEffectsAsIfEvolved, swapSides } from "@/domain/board";
import {
  canExecuteAttack,
  canUseAttack,
  clearStatusConditionsOnRetreat,
  endTurn,
  executeAttack,
  getAttackCoinPlan,
  resolveAttackChoice,
} from "@/lib/gameState";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { gymHeroesCards } from "@/domain/catalog";
import type { Attack, AttackEffect, PokemonCard } from "@/domain/cards";
import { AttackEffectType, AttackTarget, BenchDamageTarget, EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze, takeable } from "./helpers/state";

const { Water, Fire, Grass, Lightning, Psychic, Fighting, Colorless } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
type Coin = typeof H | typeof T;

const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const choose = (state: GameState, selection: string[]) => resolveAttackChoice(state, selection, { skipEndTurn: true });
const optionIds = (state: GameState) => state.pendingAttackChoice!.step.options.map((o) => o.id);

/** The same Pokémon with only this (test-only) attack. */
function withAttack(pokemon: PokemonInPlay, attack: Partial<Attack> & { effects: AttackEffect[] }): PokemonInPlay {
  const card = pokemon.pokemon as PokemonCard;
  return { ...pokemon, pokemon: { ...card, attacks: [{ name: "Test", cost: [], damage: 0, ...attack }] } };
}
/** Use the attacker's only (test) attack with these coins, without ending the turn. */
const use = (state: GameState, coins: Coin[] = [], extra: Record<string, unknown> = {}) =>
  executeAttack(state, 0, { coinResults: coins, skipEndTurn: true, ...extra });

describe("new effect kinds", () => {
  it("ShuffleSelfIntoDeck withAttachedCards: the attacker and every card attached go into the deck (after the damage)", () => {
    const moltres = withAttack(inPlay("Moltres", { set: "fossil", energy: [Fire, Fire] }), {
      damage: 30,
      effects: [{ type: AttackEffectType.ShuffleSelfIntoDeck, target: AttackTarget.Self, withAttachedCards: true, coinFlip: { count: 1, onTails: "damage" } }],
    });
    const state = deepFreeze(vs(moltres, inPlay("Machop"), { player: { bench: [inPlay("Abra")], deck: [] } }));
    const heads = use(state, [H]);
    expect(heads.playerActivePokemon!.pokemon.name).toBe("Moltres");
    const tails = use(state, [T]);
    expect(tails.opponentActivePokemon!.currentDamage).toBe(30);
    expect(tails.playerActivePokemon).toBeNull();
    expect(tails.playerNeedsToPromote).toBe(true);
    expect(names(tails.playerDeck).sort()).toEqual(["Fire Energy", "Fire Energy", "Moltres"]);
    expect(tails.playerDiscard).toEqual([]);
  });

  it("Discard discardAll + energyType: only the Energy cards of that type go (Discharge: a coin per card discarded)", () => {
    const electabuzz = withAttack(inPlay("Electabuzz", { energy: [Lightning, Water, Lightning] }), {
      damage: "30x",
      effects: [
        { type: AttackEffectType.Discard, target: AttackTarget.Self, discardAll: true, energyType: Lightning },
        { type: AttackEffectType.CoinFlipDamage, target: AttackTarget.Defender, amount: 30, coinFlip: { count: 1, onHeads: "damage" }, coinCountFromEnergyType: Lightning },
      ],
    });
    const state = deepFreeze(vs(electabuzz, inPlay("Onix")));
    expect(getAttackCoinPlan(state, 0).attack).toBe(2);
    const next = use(state, [H, T]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(30);
    expect(names(next.playerDiscard)).toEqual(["Lightning Energy", "Lightning Energy"]);
    expect(names(next.playerActivePokemon!.attachedEnergy)).toEqual(["Water Energy"]);
  });

  it("AttachEnergyFromDiscard: up to N basic Energy cards of the type from the discard pile go onto the attacker", () => {
    const charge: AttackEffect = { type: AttackEffectType.AttachEnergyFromDiscard, target: AttackTarget.Self, energyType: Lightning, amount: 2, minAmount: 0 };
    const discard = [energy(Lightning), energy(Water), energy(Lightning), energy(Lightning)];
    const state = deepFreeze(vs(withAttack(inPlay("Electabuzz"), { effects: [charge] }), inPlay("Onix"), { player: { discard } }));
    const next = use(state);
    const step = next.pendingAttackChoice!.step;
    expect(step.options.map((o) => o.label)).toEqual(["Energía Eléctrica", "Energía Eléctrica", "Energía Eléctrica"]);
    expect([step.minSelections, step.maxSelections]).toEqual([0, 2]);
    const done = choose(next, [discard[0].id, discard[2].id]);
    expect(names(done.playerActivePokemon!.attachedEnergy)).toEqual(["Lightning Energy", "Lightning Energy"]);
    expect(names(done.playerDiscard)).toEqual(["Water Energy", "Lightning Energy"]);
    expect(choose(next, []).playerActivePokemon!.attachedEnergy).toEqual([]);
    // Nothing of that type in the discard pile: nothing to choose
    expect(use(vs(withAttack(inPlay("Electabuzz"), { effects: [charge] }), inPlay("Onix"))).pendingAttackChoice).toBeUndefined();
    // "Take 1 Lightning Energy card": exactly one when there is one
    const one = use(vs(withAttack(inPlay("Pikachu"), { effects: [{ ...charge, amount: 1, minAmount: 1 }] }), inPlay("Onix"), { player: { discard } }));
    expect([one.pendingAttackChoice!.step.minSelections, one.pendingAttackChoice!.step.maxSelections]).toEqual([1, 1]);
  });

  describe("ReturnPokemonToHand (Fairy Power)", () => {
    const fairyPower: AttackEffect = { type: AttackEffectType.ReturnPokemonToHand, target: AttackTarget.Self, coinFlip: { count: 1, onHeads: "damage" } };
    const setup = () => {
      const clefable = withAttack(inPlay("Clefable", { set: "jungle", energy: [Fire], damage: 30 }), { effects: [fairyPower] });
      const abra = inPlay("Abra", { energy: [Psychic] });
      const machop = inPlay("Machop", { damage: 20 });
      return { clefable, abra, machop, state: deepFreeze(vs(clefable, inPlay("Onix"), { player: { bench: [abra, machop] } })) };
    };

    it("heads: any number of your Pokémon in play go to the hand with their cards; tails: nothing", () => {
      const { clefable, abra, machop, state } = setup();
      expect(use(state, [T]).pendingAttackChoice).toBeUndefined();
      const next = use(state, [H]);
      const step = next.pendingAttackChoice!.step;
      // The most damaged Benched Pokémon first, the Active last
      expect(optionIds(next)).toEqual([machop.pokemon.id, abra.pokemon.id, clefable.pokemon.id]);
      expect([step.minSelections, step.maxSelections]).toEqual([0, 3]);
      const done = choose(next, [abra.pokemon.id]);
      expect(names(done.playerHand).sort()).toEqual(["Abra", "Psychic Energy"]);
      expect(names(done.playerBench.map((p) => p.pokemon))).toEqual(["Machop"]);
      expect(done.playerActivePokemon!.pokemon.name).toBe("Clefable");
      expect(choose(next, []).playerBench).toHaveLength(2);
    });

    it("returning the Active Pokémon: the player promotes; returning everything loses the game", () => {
      const { clefable, abra, machop, state } = setup();
      const next = use(state, [H]);
      const active = choose(next, [clefable.pokemon.id]);
      expect(active.playerActivePokemon).toBeNull();
      expect(active.playerNeedsToPromote).toBe(true);
      expect(names(active.playerHand).sort()).toEqual(["Clefable", "Fire Energy"]);
      const all = choose(next, [clefable.pokemon.id, abra.pokemon.id, machop.pokemon.id]);
      expect(all.gameResult).toBe("defeat");
    });

    it("with an empty Bench the Active Pokémon isn't offered (returning it would lose the game)", () => {
      const { clefable } = setup();
      expect(use(vs(clefable, inPlay("Onix")), [H]).pendingAttackChoice).toBeUndefined();
    });
  });

  describe("CounterAttack (Crosscounter, Fire Wall)", () => {
    const fireWall: AttackEffect = { type: AttackEffectType.CounterAttack, target: AttackTarget.Self, amount: 10, applyWeaknessResistance: true };
    const crosscounter: AttackEffect = { type: AttackEffectType.CounterAttack, target: AttackTarget.Self, damageMultiplier: 2, retaliationCoin: true };
    const hit = (damage: number) => withAttack(inPlay("Electabuzz"), { damage, effects: [] });

    it("is remembered on the attacker for the opponent's next turn", () => {
      const next = use(vs(withAttack(inPlay("Moltres", { set: "fossil" }), { effects: [fireWall] }), inPlay("Onix")));
      expect(next.playerActivePokemon!.counterAttack).toMatchObject({ onTurn: 3, amount: 10, applyWeaknessResistance: true });
    });

    it("Fire Wall: an attack that damages it takes 10 back (Weakness and Resistance applied), even when it is Knocked Out", () => {
      const moltres = inPlay("Moltres", { set: "fossil", counterAttack: { onTurn: 2, attackName: "Muro de Fuego", amount: 10, applyWeaknessResistance: true } });
      const state = deepFreeze(vs(hit(20), moltres));
      expect(getAttackCoinPlan(state, 0).defender).toBe(0);
      expect(use(state).playerActivePokemon!.currentDamage).toBe(10);
      // Weak to Fire: 20
      const bellsprout = withAttack(inPlay("Bellsprout", { set: "jungle" }), { damage: 20, effects: [] });
      expect(use(vs(bellsprout, moltres)).playerActivePokemon!.currentDamage).toBe(20);
      const knockedOut = use(vs(hit(100), moltres));
      expect(knockedOut.opponentActivePokemon).toBeNull();
      expect(knockedOut.playerActivePokemon!.currentDamage).toBe(10);
      // No damage done, or not the turn right after: nothing
      expect(use(vs(hit(0), moltres)).playerActivePokemon!.currentDamage).toBe(0);
      expect(use(vs(hit(20), moltres, { turnNumber: 5 })).playerActivePokemon!.currentDamage).toBe(0);
    });

    it("Crosscounter: the defending player flips; heads = double the damage done back to the attacker", () => {
      const hitmonchan = inPlay("Hitmonchan", { counterAttack: { onTurn: 2, attackName: "Contraataque Cruzado", damageMultiplier: 2, retaliationCoin: true } });
      const state = deepFreeze(vs(hit(20), hitmonchan));
      expect(getAttackCoinPlan(state, 0).defender).toBe(1);
      expect(use(state, [H]).playerActivePokemon!.currentDamage).toBe(40);
      expect(use(state, [T]).playerActivePokemon!.currentDamage).toBe(0);
      // Knocked Out by the double damage: the defender takes a Prize
      const ko = use(vs(withAttack(inPlay("Abra"), { damage: 30, effects: [] }), hitmonchan, { player: { bench: [inPlay("Onix")] } }), [H]);
      expect(ko.playerActivePokemon).toBeNull();
      expect(prizesOwed(ko, "opponent")).toBe(1);
    });

    it("works for chosen-target damage on the Active Pokémon too", () => {
      const hitmonchan = inPlay("Hitmonchan", { counterAttack: { onTurn: 2, attackName: "Contraataque Cruzado", damageMultiplier: 2, retaliationCoin: true } });
      const flitter = withAttack(inPlay("Electabuzz"), { effects: [{ type: AttackEffectType.ChooseTargetDamage, target: AttackTarget.Defender, amount: 20, targetScope: "opponentAny" }] });
      const next = use(vs(flitter, hitmonchan), [H]);
      expect(choose(next, [hitmonchan.pokemon.id]).playerActivePokemon!.currentDamage).toBe(40);
    });

    it("ends when the Pokémon goes to the Bench", () => {
      const hitmonchan = inPlay("Hitmonchan", { counterAttack: { onTurn: 2, attackName: "Contraataque Cruzado", damageMultiplier: 2, retaliationCoin: true } });
      const benched = clearStatusConditionsOnRetreat(hitmonchan);
      expect(benched.counterAttack).toBeUndefined();
      expect(clearEffectsAsIfEvolved(hitmonchan).counterAttack).toBeUndefined();
    });
  });

  it("DamageCountersOnDamaged (Pain Amplifier): 1 counter on each opponent's Pokémon that has counters, no damage modifiers", () => {
    const pain = withAttack(inPlay("Gengar", { set: "fossil" }), {
      effects: [{ type: AttackEffectType.DamageCountersOnDamaged, target: AttackTarget.Defender, amount: 10 }],
    });
    // A Defender on it would reduce damage: counters aren't damage
    const defender = inPlay("Onix", { damage: 20 });
    const shield = { id: "df", source: "defender" as const, card: gameCard("Defender", "base"), targetPokemonId: defender.pokemon.id, amount: -20, expiresAfterTurn: 4, playerId: "opponent" as const };
    const state = deepFreeze(vs(pain, defender, { activeModifiers: [shield], opponent: { bench: [inPlay("Abra", { damage: 20 }), inPlay("Machop")] } }));
    const next = use(state);
    expect(next.opponentActivePokemon!.currentDamage).toBe(30);
    expect(next.opponentBench.map((p) => p.currentDamage)).toEqual([0]);
    expect(names(next.opponentBench.map((p) => p.pokemon))).toEqual(["Machop"]);
    expect(prizesOwed(next, "player")).toBe(1); // Abra (30 HP) Knocked Out
    // Agility on the Defending Pokémon stops it there
    const agile = inPlay("Raichu", { damage: 10, protection: { type: "damageAndEffects", expiresAfterTurn: 3 } });
    expect(use(vs(pain, agile)).opponentActivePokemon!.currentDamage).toBe(10);
    // The Defending Pokémon Knocked Out by the counter: a Prize, the defender promotes
    const ko = use(vs(pain, inPlay("Abra", { damage: 20 }), { opponent: { bench: [inPlay("Machop")] } }));
    expect(ko.opponentActivePokemon!.pokemon.name).toBe("Machop");
    expect(ko.playerCanTakePrize).toBe(true);
  });

  it("Heal healAllOwn with coins (Healing Pollen): 10 per heads from each of your Pokémon", () => {
    const pollen = withAttack(inPlay("Venomoth", { set: "jungle", damage: 30 }), {
      effects: [{ type: AttackEffectType.Heal, target: AttackTarget.Self, amount: 10, healAllOwn: true, coinFlip: { count: 3, onHeads: "damage" } }],
    });
    const state = deepFreeze(vs(pollen, inPlay("Onix", { damage: 30 }), { player: { bench: [inPlay("Abra", { damage: 10 }), inPlay("Machop", { damage: 40 })] } }));
    const next = use(state, [H, T, H]);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    expect(next.playerBench.map((p) => p.currentDamage)).toEqual([0, 20]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(30);
    expect(use(state, [T, T, T]).playerBench.map((p) => p.currentDamage)).toEqual([10, 40]);
  });

  it("Heal ignorePrevention (Blot): heals even when the attack's damage is prevented (Leech Seed wouldn't)", () => {
    const heal: AttackEffect = { type: AttackEffectType.Heal, target: AttackTarget.Self, amount: 10 };
    const protectedOnix = inPlay("Onix", { protection: { type: "damageOnly", expiresAfterTurn: 3 } });
    const blot = withAttack(inPlay("Oddish", { set: "jungle", damage: 20 }), { damage: 10, effects: [{ ...heal, ignorePrevention: true }] });
    expect(use(vs(blot, protectedOnix)).playerActivePokemon!.currentDamage).toBe(10);
    const leechSeed = withAttack(inPlay("Oddish", { set: "jungle", damage: 20 }), { damage: 10, effects: [heal] });
    expect(use(vs(leechSeed, protectedOnix)).playerActivePokemon!.currentDamage).toBe(20);
  });

  it("MillSelfForDamage (Lava Burst): the top 5 cards of the deck are discarded, 20 per Fire Energy card among them", () => {
    const lava = withAttack(inPlay("Magmar"), {
      damage: "20x",
      effects: [{ type: AttackEffectType.MillSelfForDamage, target: AttackTarget.Self, amount: 5, energyType: Fire, extraDamagePerEnergy: 20 }],
    });
    const deck = [energy(Fire), gameCard("Abra"), energy(Fire), energy(Water), energy(Fire), energy(Fire), gameCard("Machop")];
    const next = use(deepFreeze(vs(lava, inPlay("Onix"), { player: { deck } })));
    expect(next.opponentActivePokemon!.currentDamage).toBe(60);
    expect(names(next.playerDiscard)).toEqual(["Fire Energy", "Abra", "Fire Energy", "Water Energy", "Fire Energy"]);
    expect(names(next.playerDeck)).toEqual(["Fire Energy", "Machop"]);
    // Fewer than 5 cards: all of them
    const short = use(vs(lava, inPlay("Onix"), { player: { deck: [energy(Fire)] } }));
    expect(short.opponentActivePokemon!.currentDamage).toBe(20);
    expect(short.playerDeck).toEqual([]);
  });

  it("HalveDamageNextTurn (Deflector): damage done to it during the opponent's next turn is halved (rounded down to 10)", () => {
    const deflector = withAttack(inPlay("Exeggcute", { set: "jungle" }), { effects: [{ type: AttackEffectType.HalveDamageNextTurn, target: AttackTarget.Self }] });
    const used = use(vs(deflector, inPlay("Onix")));
    expect(used.playerActivePokemon!.halveDamage).toEqual({ onTurn: 4, attackName: "Test" });
    const exeggcute = inPlay("Exeggcute", { set: "jungle", halveDamage: { onTurn: 4, attackName: "Deflector" } });
    const hit30 = withAttack(inPlay("Electabuzz"), { damage: 30, effects: [] });
    expect(use(vs(hit30, exeggcute, { turnNumber: 4 })).opponentActivePokemon!.currentDamage).toBe(10);
    expect(use(vs(hit30, exeggcute, { turnNumber: 6 })).opponentActivePokemon!.currentDamage).toBe(30);
    // It ends when the Pokémon goes to the Bench or evolves
    expect(clearStatusConditionsOnRetreat(exeggcute).halveDamage).toBeUndefined();
    expect(clearEffectsAsIfEvolved(exeggcute).halveDamage).toBeUndefined();
  });

  it("AttackFails defenderOnly (Egg Bomb): tails = nothing to the Defending Pokémon, but the attacker's own effects happen", () => {
    const eggBomb = withAttack(inPlay("Exeggcute", { set: "jungle" }), {
      damage: 40,
      effects: [
        { type: AttackEffectType.AttackFails, target: AttackTarget.Defender, defenderOnly: true, coinFlip: { count: 1, onTails: "damage" } },
        { type: AttackEffectType.SelfDamage, target: AttackTarget.Self, amount: 20, coinFlip: { count: 1, onTails: "damage" } },
      ],
    });
    const state = deepFreeze(vs(eggBomb, inPlay("Machop")));
    const heads = use(state, [H]);
    expect([heads.opponentActivePokemon!.currentDamage, heads.playerActivePokemon!.currentDamage]).toEqual([40, 0]);
    const tails = use(state, [T]);
    expect([tails.opponentActivePokemon!.currentDamage, tails.playerActivePokemon!.currentDamage]).toEqual([0, 20]);
    expect(tails.attackedThisTurn).toBe(true);
  });

  it("ShuffleHandDraw (Psychic Exchange): the hand goes into the deck, the deck is shuffled, then 5 cards are drawn", () => {
    const exchange = withAttack(inPlay("Exeggutor", { set: "jungle" }), { effects: [{ type: AttackEffectType.ShuffleHandDraw, target: AttackTarget.Self, amount: 5 }] });
    const hand = [gameCard("Abra"), gameCard("Machop")];
    const deck = [energy(Fire), energy(Water), energy(Grass), energy(Fire), energy(Water), energy(Psychic)];
    const next = use(deepFreeze(vs(exchange, inPlay("Onix"), { player: { hand, deck } })));
    expect(next.playerHand).toHaveLength(5);
    expect(next.playerDeck).toHaveLength(3);
    expect(names([...next.playerHand, ...next.playerDeck]).sort()).toEqual(names([...hand, ...deck]).sort());
    // Fewer than 5 cards in all: every card is drawn
    expect(use(vs(exchange, inPlay("Onix"), { player: { hand, deck: [energy(Fire)] } })).playerHand).toHaveLength(3);
  });

  it("ShuffleOwnDeck (Fidget): the attacker's deck is shuffled, nothing else", () => {
    const fidget = withAttack(inPlay("Mankey", { set: "jungle" }), { effects: [{ type: AttackEffectType.ShuffleOwnDeck, target: AttackTarget.Self }] });
    const deck = Array.from({ length: 30 }, (_, i) => energy(i % 2 ? Fire : Water));
    const next = use(deepFreeze(vs(fidget, inPlay("Onix"), { player: { deck } })));
    expect(names(next.playerDeck).sort()).toEqual(names(deck).sort());
    expect(next.playerDeck.map((c) => c.id)).not.toEqual(deck.map((c) => c.id));
    expect(next.events.at(-1)!.message).toMatch(/mezcló el mazo del atacante/);
  });

  describe("ChooseStatus (Magic Pollen)", () => {
    const magicPollen = withAttack(inPlay("Gloom", { set: "jungle" }), {
      damage: 30,
      effects: [{
        type: AttackEffectType.ChooseStatus,
        target: AttackTarget.Defender,
        statusOptions: [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed, StatusCondition.Poisoned],
        coinFlip: { count: 1, onHeads: "damage" },
      }],
    });

    it("heads: the attacker picks the Special Condition; tails: nothing to pick", () => {
      const state = deepFreeze(vs(magicPollen, inPlay("Machop")));
      expect(use(state, [T]).pendingAttackChoice).toBeUndefined();
      const next = use(state, [H]);
      expect(next.pendingAttackChoice!.step.options.map((o) => o.label)).toEqual(["Dormido", "Confundido", "Paralizado", "Envenenado"]);
      const done = choose(next, [StatusCondition.Paralyzed]);
      expect(done.opponentActivePokemon!.statusConditions).toEqual([StatusCondition.Paralyzed]);
      expect(done.opponentActivePokemon!.currentDamage).toBe(30);
    });

    it("nothing to pick when the Defending Pokémon is Knocked Out, protected from effects, or immune (Thick Skinned)", () => {
      expect(use(vs(magicPollen, inPlay("Abra")), [H]).pendingAttackChoice).toBeUndefined();
      const agile = inPlay("Raichu", { protection: { type: "damageAndEffects", expiresAfterTurn: 3 } });
      expect(use(vs(magicPollen, agile), [H]).pendingAttackChoice).toBeUndefined();
      expect(use(vs(magicPollen, inPlay("Snorlax", { set: "jungle" })), [H]).pendingAttackChoice).toBeUndefined();
    });
  });

  it("BlockEnergyAttach (Crystal Beam): heads = no Energy can be attached to the Defending Pokémon during the opponent's next turn", () => {
    const crystalBeam = withAttack(inPlay("Tentacool", { set: "fossil" }), {
      damage: 20,
      effects: [{ type: AttackEffectType.BlockEnergyAttach, target: AttackTarget.Defender, coinFlip: { count: 1, onHeads: "damage" } }],
    });
    const machop = inPlay("Machop");
    const water = energy(Water);
    const state = vs(crystalBeam, machop, { opponent: { hand: [water], bench: [inPlay("Abra")] } });
    const theirTurn = endTurn(use(state, [H]));
    // The opponent's turn, from their side: swap the views
    const view = swapSides(theirTurn);
    expect(canAttachEnergy(view, water.id, machop.pokemon.id)).toMatch(/Energía/);
    expect(canAttachEnergy(view, water.id, view.playerBench[0].pokemon.id)).toBeNull();
    const tailsView = swapSides(endTurn(use(state, [T])));
    expect(canAttachEnergy(tailsView, water.id, machop.pokemon.id)).toBeNull();
    expect(clearStatusConditionsOnRetreat(theirTurn.opponentActivePokemon!).energyAttachBlockedOnTurn).toBeUndefined();
  });

  it("coinCountSource ownNamedInPlay (Night Spirits): a coin per named Pokémon you have in play", () => {
    const spirits = withAttack(inPlay("Haunter"), {
      damage: "30x",
      effects: [{
        type: AttackEffectType.CoinFlipDamage, target: AttackTarget.Defender, amount: 30,
        coinFlip: { count: 1, onHeads: "damage" }, coinCountSource: "ownNamedInPlay", names: ["Gastly", "Haunter", "Gengar"],
      }],
    });
    const state = vs(spirits, inPlay("Onix"), { player: { bench: [inPlay("Gastly"), inPlay("Abra"), inPlay("Gengar", { set: "fossil" })] }, opponent: { bench: [inPlay("Gastly")] } });
    expect(getAttackCoinPlan(state, 0).attack).toBe(3);
    expect(use(state, [H, T, H]).opponentActivePokemon!.currentDamage).toBe(60);
  });

  it("RemoveStatus (Good Morning): an Asleep Defending Pokémon wakes up (after the damage)", () => {
    const goodMorning = withAttack(inPlay("Jynx"), {
      damage: 20,
      effects: [{ type: AttackEffectType.RemoveStatus, target: AttackTarget.Defender, status: StatusCondition.Asleep }],
    });
    const next = use(deepFreeze(vs(goodMorning, inPlay("Onix", { statuses: [StatusCondition.Asleep, StatusCondition.Poisoned] }))));
    expect(next.opponentActivePokemon!.statusConditions).toEqual([StatusCondition.Poisoned]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(20);
    expect(use(vs(goodMorning, inPlay("Onix", { statuses: [StatusCondition.Confused] }))).opponentActivePokemon!.statusConditions).toEqual([StatusCondition.Confused]);
  });

  it("Discard cost [Colorless] (Kindle): any Energy card attached pays it", () => {
    const kindle = (types: EnergyType[]) => withAttack(inPlay("Charmander", { energy: types }), {
      cost: [Fire],
      damage: 10,
      effects: [{ type: AttackEffectType.Discard, target: AttackTarget.Self, discardCostRequirement: [Colorless] }],
    });
    const next = use(vs(kindle([Fire]), inPlay("Onix")));
    expect(names(next.playerDiscard)).toEqual(["Fire Energy"]);
    expect(next.playerActivePokemon!.attachedEnergy).toEqual([]);
    const two = use(vs(kindle([Water, Fire]), inPlay("Onix")));
    expect(two.playerDiscard).toHaveLength(1);
    expect(canUseAttack(kindle([Fire]), 0)).toBe(true);
    expect(canUseAttack(kindle([]), 0)).toBe(false);
  });

  it("IgnoreWeaknessResistance resistanceOnly (Hook Shot): Resistance isn't applied, Weakness is", () => {
    const hookShot = withAttack(inPlay("Geodude", { set: "fossil" }), {
      damage: 20,
      effects: [{ type: AttackEffectType.IgnoreWeaknessResistance, target: null, resistanceOnly: true }],
    });
    // Pidgey resists Fighting; Pikachu is weak to it
    expect(use(vs(hookShot, inPlay("Pidgey"))).opponentActivePokemon!.currentDamage).toBe(20);
    expect(use(vs(hookShot, inPlay("Pikachu", { set: "jungle" }))).opponentActivePokemon!.currentDamage).toBe(40);
  });

  it("BonusDamage defenderEnergyCards (Psychic): +10 per Energy card attached to the Defending Pokémon", () => {
    const psychic = withAttack(inPlay("Exeggcute", { set: "jungle" }), {
      damage: "10+",
      effects: [{ type: AttackEffectType.BonusDamage, target: AttackTarget.Defender, amount: 10, bonusDamageSource: "defenderEnergyCards" }],
    });
    // Double Colorless Energy is 1 card
    const defender = inPlay("Machop", { energy: [Fighting, Colorless, Fighting] });
    expect(use(vs(psychic, defender)).opponentActivePokemon!.currentDamage).toBe(40);
    expect(use(vs(psychic, inPlay("Machop"))).opponentActivePokemon!.currentDamage).toBe(10);
  });

  it("IgnoreDefenderEffects (Swift): no Weakness/Resistance, powers or effects on the Defending Pokémon change its damage", () => {
    const swift = withAttack(inPlay("Staryu"), { damage: 20, effects: [{ type: AttackEffectType.IgnoreDefenderEffects, target: null }] });
    const hit = (defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) => use(vs(swift, defender, extra)).opponentActivePokemon!.currentDamage;
    expect(hit(inPlay("Charmander"))).toBe(20); // weak to Water
    expect(hit(inPlay("Kabuto", { set: "fossil" }))).toBe(20); // Kabuto Armor
    expect(hit(inPlay("Onix", { protection: { type: "damageAndEffects", expiresAfterTurn: 3 } }))).toBe(20); // Agility
    expect(hit(inPlay("Onix", { nextTurnDamageReduction: 20, nextTurnEffectAppliedOnTurn: 2 }))).toBe(20); // Minimize
    expect(hit(inPlay("Onix", { halveDamage: { onTurn: 3, attackName: "Deflector" } }))).toBe(20);
    const onix = inPlay("Onix");
    const shield = { id: "df", source: "defender" as const, card: gameCard("Defender", "base"), targetPokemonId: onix.pokemon.id, amount: -20, expiresAfterTurn: 4, playerId: "opponent" as const };
    expect(hit(onix, { activeModifiers: [shield] })).toBe(20);
    // Transparency and Shadow Images don't get a coin
    const haunter = inPlay("Haunter", { set: "fossil" });
    expect(getAttackCoinPlan(vs(swift, haunter), 0).defender).toBe(0);
    expect(hit(haunter)).toBe(20);
    expect(getAttackCoinPlan(vs(swift, inPlay("Scyther", { set: "jungle", evadeOnFlip: { attackName: "Imágenes Sombra" } })), 0).defender).toBe(0);
  });

  it("Discard cost discardTo hand (Energy Loop): the Psychic Energy card goes back to the hand", () => {
    const loop = withAttack(inPlay("Abra", { energy: [Psychic, Water] }), {
      cost: [Psychic],
      damage: 20,
      effects: [{ type: AttackEffectType.Discard, target: AttackTarget.Self, discardCostRequirement: [Psychic], discardTo: "hand" }],
    });
    const next = use(deepFreeze(vs(loop, inPlay("Onix"))));
    expect(names(next.playerHand)).toEqual(["Psychic Energy"]);
    expect(next.playerDiscard).toEqual([]);
    expect(names(next.playerActivePokemon!.attachedEnergy)).toEqual(["Water Energy"]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(20);
  });

  it("BenchDamage benchTypes / benchExcludeTypes (Blaze, Water Ring): only the Benched Pokémon of (or not of) those types", () => {
    const bench = () => [inPlay("Bulbasaur"), inPlay("Squirtle"), inPlay("Abra")];
    const blaze = withAttack(inPlay("Growlithe"), {
      damage: 20,
      effects: [{ type: AttackEffectType.BenchDamage, target: AttackTarget.Defender, amount: 10, benchTarget: BenchDamageTarget.Opponent, benchTypes: [Grass] }],
    });
    expect(use(vs(blaze, inPlay("Onix"), { opponent: { bench: bench() } })).opponentBench.map((p) => p.currentDamage)).toEqual([10, 0, 0]);
    const waterRing = withAttack(inPlay("Poliwrath"), {
      damage: 30,
      effects: [{ type: AttackEffectType.BenchDamage, target: AttackTarget.Defender, amount: 10, benchTarget: BenchDamageTarget.Both, benchExcludeTypes: [Water] }],
    });
    const next = use(vs(waterRing, inPlay("Onix"), { player: { bench: bench() }, opponent: { bench: bench() } }));
    expect(next.opponentBench.map((p) => p.currentDamage)).toEqual([10, 0, 10]);
    expect(next.playerBench.map((p) => p.currentDamage)).toEqual([10, 0, 10]);
  });

  it("MoveAllEnergyToBench with energyType + amount (Electric Current): 1 Lightning Energy to a Benched Pokémon, discarded without a Bench", () => {
    const current = withAttack(inPlay("Electabuzz", { energy: [Water, Lightning, Lightning] }), {
      damage: 20,
      effects: [{ type: AttackEffectType.MoveAllEnergyToBench, target: AttackTarget.Self, energyType: Lightning, amount: 1 }],
    });
    const abra = inPlay("Abra");
    const next = use(vs(current, inPlay("Onix"), { player: { bench: [abra] } }));
    expect(next.pendingAttackChoice!.step.description).toMatch(/Energía Eléctrica/);
    const done = choose(next, [abra.pokemon.id]);
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(names(done.playerBench[0].attachedEnergy)).toEqual(["Lightning Energy"]);
    expect(names(done.playerActivePokemon!.attachedEnergy)).toEqual(["Water Energy", "Lightning Energy"]);
    const alone = use(vs(current, inPlay("Onix")));
    expect(names(alone.playerDiscard)).toEqual(["Lightning Energy"]);
    expect(names(alone.playerActivePokemon!.attachedEnergy)).toEqual(["Water Energy", "Lightning Energy"]);
  });

  describe("SearchDeckChoice (Moonwatching, Jellyfish Pod, Call for Friend, Sleight of Hand)", () => {
    const search = (effect: Partial<AttackEffect>, setup: Parameters<typeof makeState>[0] = {}) =>
      vs(withAttack(inPlay("Clefairy"), { effects: [{ type: AttackEffectType.SearchDeckChoice, target: AttackTarget.Self, ...effect }] }), inPlay("Onix"), setup);

    it("to the hand: the matching cards of the deck, then the deck is shuffled", () => {
      const deck = [gameCard("Abra"), energy(Water), gameCard("Potion", "base"), energy(Fire)];
      const next = use(search({ deckFilter: { basicEnergy: true }, destination: "hand", amount: 1, minAmount: 1 }, { player: { deck } }));
      const step = next.pendingAttackChoice!.step;
      expect(names(takeable(step))).toEqual(["Water Energy", "Fire Energy"]);
      expect(step.cards!.length).toBe(deck.length);
      expect([step.minSelections, step.maxSelections]).toEqual([1, 1]);
      const done = choose(next, [deck[3].id]);
      expect(names(done.playerHand)).toEqual(["Fire Energy"]);
      expect(names(done.playerDeck).sort()).toEqual(["Abra", "Potion", "Water Energy"]);
    });

    it("any number of named Pokémon; nothing to find: the deck is only shuffled", () => {
      const deck = [gameCard("Tentacool", "fossil"), gameCard("Abra"), gameCard("Tentacruel", "fossil")];
      const named = { deckFilter: { names: ["Tentacool", "Tentacruel"] }, destination: "hand" as const };
      const next = use(search(named, { player: { deck } }));
      expect([next.pendingAttackChoice!.step.minSelections, next.pendingAttackChoice!.step.maxSelections]).toEqual([0, 2]);
      expect(names(choose(next, [deck[0].id, deck[2].id]).playerHand)).toEqual(["Tentacool", "Tentacruel"]);
      const none = use(search(named, { player: { deck: [gameCard("Abra")] } }));
      expect(none.pendingAttackChoice).toBeUndefined();
      expect(none.events.at(-1)!.message).toMatch(/mezcló/);
    });

    it("to the Bench: Basic Pokémon whose name includes the owner; the attack can't be used with a full Bench", () => {
      const mistys = (name: string) => ({ ...gameCard(name, "jungle"), name: `Misty's ${name}` });
      const deck = [mistys("Goldeen"), gameCard("Goldeen", "jungle"), mistys("Seaking")];
      const friend = { deckFilter: { basicPokemon: true, nameIncludes: "Misty" }, destination: "bench" as const, amount: 1, coinFlip: { count: 1, onHeads: "damage" as const } };
      const state = search(friend, { player: { deck } });
      expect(use(state, [T]).pendingAttackChoice).toBeUndefined();
      const next = use(state, [H]);
      expect(names(takeable(next.pendingAttackChoice!.step))).toEqual(["Misty's Goldeen"]);
      const done = choose(next, [deck[0].id]);
      expect(names(done.playerBench.map((p) => p.pokemon))).toEqual(["Misty's Goldeen"]);
      expect(done.playerBench[0].playedOnTurn).toBe(3);
      const full = search(friend, { player: { deck, bench: Array.from({ length: 5 }, () => inPlay("Abra")) } });
      expect(canExecuteAttack(full, 0)).toMatch(/llena/);
    });

    it("Sleight of Hand: up to 3 cards of the hand on top of the deck, then that many basic Energy cards to the hand", () => {
      const hand = [gameCard("Abra"), gameCard("Potion", "base"), gameCard("Machop")];
      const deck = [energy(Water), gameCard("Onix"), energy(Fire), energy(Psychic)];
      const next = use(search({ putBackFromHand: 3, deckFilter: { basicEnergy: true }, destination: "hand" }, { player: { hand, deck } }));
      const first = next.pendingAttackChoice!.step;
      expect(first.source).toBe("hand");
      expect([first.minSelections, first.maxSelections]).toEqual([0, 3]);
      const second = choose(next, [hand[0].id, hand[2].id]);
      expect(names(second.playerHand)).toEqual(["Potion"]);
      expect(names(second.playerDeck.slice(0, 2))).toEqual(["Abra", "Machop"]);
      const step2 = second.pendingAttackChoice!.step;
      expect([step2.minSelections, step2.maxSelections]).toEqual([2, 2]);
      const done = choose(second, [deck[0].id, deck[3].id]);
      expect(names(done.playerHand)).toEqual(["Potion", "Water Energy", "Psychic Energy"]);
      expect(names(done.playerDeck).sort()).toEqual(["Abra", "Fire Energy", "Machop", "Onix"]);
      // Nothing put back: no search
      expect(choose(next, []).pendingAttackChoice).toBeUndefined();
    });
  });

  it("RequireOwnBench (Alert): can't be used with an empty Bench", () => {
    const alert = withAttack(inPlay("Zubat", { set: "fossil" }), { effects: [{ type: AttackEffectType.RequireOwnBench, target: null }] });
    expect(canExecuteAttack(vs(alert, inPlay("Onix")), 0)).toMatch(/Banca/);
    expect(canExecuteAttack(vs(alert, inPlay("Onix"), { player: { bench: [inPlay("Abra")] } }), 0)).toBeNull();
  });

  describe("CantAttackNextTurn (Tunneling, Screaming Headbutt)", () => {
    const lockAll: AttackEffect = { type: AttackEffectType.CantAttackNextTurn, target: AttackTarget.Self };
    const lockThis: AttackEffect = { ...lockAll, thisAttackOnly: true };
    const twoAttacks = (lock: AttackEffect) => {
      const p = inPlay("Electabuzz");
      const card = p.pokemon as PokemonCard;
      return { ...p, pokemon: { ...card, attacks: [{ name: "Lock", cost: [], damage: 10, effects: [lock] }, { name: "Other", cost: [], damage: 10 }] } };
    };
    /** Use attack 0 (it ends the turn), then the opponent's turn passes: the attacker's next turn */
    const nextOwnTurn = (lock: AttackEffect) => endTurn((executeAttack(vs(twoAttacks(lock), inPlay("Onix")), 0, { coinResults: [] })));

    it("Tunneling: no attack at all during your next turn, then it can attack again", () => {
      const next = nextOwnTurn(lockAll);
      expect(next.isPlayerTurn).toBe(true);
      expect(canExecuteAttack(next, 0)).toMatch(/no puede atacar/);
      expect(canExecuteAttack(next, 1)).toMatch(/no puede atacar/);
      expect(canExecuteAttack(endTurn(endTurn(next)), 0)).toBeNull();
    });

    it("Screaming Headbutt: only that attack is locked", () => {
      const next = nextOwnTurn(lockThis);
      expect(canExecuteAttack(next, 0)).toMatch(/Lock/);
      expect(canExecuteAttack(next, 1)).toBeNull();
    });

    it("ends when the Pokémon goes to the Bench or evolves", () => {
      const locked = { ...inPlay("Electabuzz"), attackLock: { onTurn: 5 } };
      expect(clearStatusConditionsOnRetreat(locked).attackLock).toBeUndefined();
      expect(clearEffectsAsIfEvolved(locked).attackLock).toBeUndefined();
    });
  });

  describe("EvadeOnFlip (Shadow Images)", () => {
    const shadowImages: AttackEffect = { type: AttackEffectType.EvadeOnFlip, target: AttackTarget.Self };
    const scyther = () => inPlay("Scyther", { set: "jungle", evadeOnFlip: { attackName: "Imágenes Sombra" } });
    const poisonHit = withAttack(inPlay("Electabuzz"), {
      damage: 30,
      effects: [{ type: AttackEffectType.ApplyStatus, target: AttackTarget.Defender, status: StatusCondition.Poisoned }],
    });

    it("stays on the attacker", () => {
      const next = use(vs(withAttack(scyther(), { effects: [shadowImages] }), inPlay("Onix")));
      expect(next.playerActivePokemon!.evadeOnFlip).toEqual({ attackName: "Test" });
    });

    it("an attack that can damage it flips a coin for the attacker (the defender coin): tails = no damage, the other effects happen", () => {
      const state = deepFreeze(vs(poisonHit, scyther()));
      expect(getAttackCoinPlan(state, 0)).toMatchObject({ defender: 1, defenderFlipper: "attacker" });
      const tails = use(state, [T]);
      expect(tails.opponentActivePokemon!.currentDamage).toBe(0);
      expect(tails.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Poisoned);
      expect(tails.opponentActivePokemon!.evadeOnFlip).toBeDefined();
      // Heads: the damage is done, and the effect ends (it took damage)
      const heads = use(state, [H]);
      expect(heads.opponentActivePokemon!.currentDamage).toBe(30);
      expect(heads.opponentActivePokemon!.evadeOnFlip).toBeUndefined();
    });

    it("lasts several turns, no coin for attacks without damage, and ends on the Bench", () => {
      const status = withAttack(inPlay("Electabuzz"), { effects: [{ type: AttackEffectType.ApplyStatus, target: AttackTarget.Defender, status: StatusCondition.Asleep }] });
      expect(getAttackCoinPlan(vs(status, scyther()), 0).defender).toBe(0);
      expect(use(vs(poisonHit, scyther(), { turnNumber: 9 }), [T]).opponentActivePokemon!.currentDamage).toBe(0);
      expect(clearStatusConditionsOnRetreat(scyther()).evadeOnFlip).toBeUndefined();
      expect(clearEffectsAsIfEvolved(scyther()).evadeOnFlip).toBeUndefined();
    });

    it("chosen-target damage on it uses the same coin", () => {
      const target = scyther();
      const flitter = withAttack(inPlay("Electabuzz"), { effects: [{ type: AttackEffectType.ChooseTargetDamage, target: AttackTarget.Defender, amount: 20, targetScope: "opponentAny" }] });
      const tails = use(vs(flitter, target), [T]);
      expect(choose(tails, [target.pokemon.id]).opponentActivePokemon!.currentDamage).toBe(0);
      const heads = use(vs(flitter, target), [H]);
      const done = choose(heads, [target.pokemon.id]);
      expect(done.opponentActivePokemon!.currentDamage).toBe(20);
      expect(done.opponentActivePokemon!.evadeOnFlip).toBeUndefined();
    });
  });
});

// ============================================================================
// Card by card: every Gym Heroes attack with text (damage + effect)
// ============================================================================

let uid = 0;
/** A Gym Heroes card in play, by printed number (several cards share a name). */
function gym(number: number, opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const card = structuredClone(gymHeroesCards.find((c) => c.number === number)!);
  uid += 1;
  return { ...inPlay("Abra", opts), pokemon: { ...card, id: `${card.id}#g${uid}` } as GameCard };
}
const gymHand = (number: number): GameCard => gym(number).pokemon;
/** A 120 HP Defending Pokémon without Weakness, Resistance or power (Chansey without W/R). */
function dummy(opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const p = inPlay("Chansey", opts);
  return { ...p, pokemon: { ...(p.pokemon as PokemonCard), weaknesses: [], resistances: [] } };
}
/** The state with the attacker armed for `name` (attacks are only legal when paid). */
function armedState(state: GameState, name: string): GameState {
  return { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
}
/** Attack by name with these coins (the attacker gets the Energy it needs), without ending the turn. */
function attack(state: GameState, name: string, coins: Coin[] = [], extra: Record<string, unknown> = {}): GameState {
  const armed = armedState(state, name);
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true, ...extra });
}
const dmg = (state: GameState) => state.opponentActivePokemon!.currentDamage;
const statuses = (state: GameState) => state.opponentActivePokemon!.statusConditions;

describe("Gym Heroes attacks, card by card", () => {
  const { Asleep, Confused, Paralyzed, Poisoned, CannotAttack } = StatusCondition;

  it.each([
    [21, "Atadura", 20, Paralyzed],
    [32, "Luz Misteriosa", 0, Asleep],
    [47, "Polvo Veneno", 20, Poisoned],
    [50, "Pulso Confuso", 20, Confused],
    [56, "Rayo Burbuja", 30, Paralyzed],
    [65, "Abanico de Cola", 20, Confused],
    [69, "Bramido", 0, Paralyzed],
    [74, "Colmillo Veneno", 20, Poisoned],
    [75, "Enredadera Venenosa", 10, Poisoned],
    [80, "Impactrueno", 10, Paralyzed],
    [81, "Cola Relámpago", 20, Paralyzed],
    [85, "Supersónico", 0, Confused],
    [92, "Sugestión", 0, CannotAttack],
  ] as const)("#%i %s: %i damage; heads = %s", (number, name, damage, condition) => {
    const state = deepFreeze(vs(gym(number), dummy()));
    const heads = attack(state, name, [H]);
    expect([dmg(heads), statuses(heads)]).toEqual([damage, [condition]]);
    expect(statuses(attack(state, name, [T]))).toEqual([]);
  });

  it.each([
    [10, "Veneno de Medusa", 30, Poisoned, Confused],
    [87, "Mirada Hipnótica", 0, Paralyzed, Asleep],
  ] as const)("#%i %s: %i damage; heads = %s, tails = %s", (number, name, damage, onHeads, onTails) => {
    const state = vs(gym(number), dummy());
    expect([dmg(attack(state, name, [H])), statuses(attack(state, name, [H]))]).toEqual([damage, [onHeads]]);
    expect(statuses(attack(state, name, [T]))).toEqual([onTails]);
  });

  it("#23 Agujas: heads = Paralyzed and Poisoned; Tormenta de Arena: Smokescreen", () => {
    const state = vs(gym(23), dummy());
    expect([...statuses(attack(state, "Agujas", [H]))!].sort()).toEqual([Paralyzed, Poisoned].sort());
    expect(statuses(attack(state, "Agujas", [T]))).toEqual([]);
    expect(attack(state, "Tormenta de Arena").opponentActivePokemon!.mustFlipToAttack).toBe(true);
  });

  it("#23 Agujas: the paralysis still wears off (Poisoned applied after it keeps its turn)", () => {
    const next = attack(vs(gym(23), dummy()), "Agujas", [H]);
    expect(next.opponentActivePokemon!.paralyzedOnTurn).toBe(3);
  });

  it("fixed Special Conditions: #59 Buenas Noches, #96 Antenas Venenosas, #49 Veneno Somnífero, #46 Danza del Sueño / Olor Vil, #33 Desplome, #95 Ataque Perezoso", () => {
    expect(statuses(attack(vs(gym(59), dummy()), "Buenas Noches"))).toEqual([Asleep]);
    expect(statuses(attack(vs(gym(96), dummy()), "Antenas Venenosas"))).toEqual([Poisoned]);
    expect([...statuses(attack(vs(gym(49), dummy()), "Veneno Somnífero"))!].sort()).toEqual([Asleep, Poisoned].sort());
    const dream = attack(vs(gym(46), dummy()), "Danza del Sueño");
    expect([dmg(dream), statuses(dream), dream.playerActivePokemon!.statusConditions]).toEqual([10, [Asleep], [Asleep]]);
    const vile = attack(vs(gym(46), dummy()), "Olor Vil");
    expect([dmg(vile), statuses(vile), vile.playerActivePokemon!.statusConditions]).toEqual([30, [Confused], [Confused]]);
    const collapse = attack(vs(gym(33), dummy()), "Desplome");
    expect([dmg(collapse), collapse.playerActivePokemon!.statusConditions]).toEqual([20, [Asleep]]);
    const lazy = attack(vs(gym(95), dummy()), "Ataque Perezoso");
    expect([dmg(lazy), lazy.playerActivePokemon!.statusConditions]).toEqual([30, [Asleep]]);
  });

  it.each([
    [7, "Taladro Repetido", [H, T, H, H, T], 30],
    [25, "Bofetón Cometa", [H, H, T], 20],
    [29, "Triple Cañón", [H, H, H], 60],
    [40, "Lanzar Roca", [H, T, T], 20],
    [41, "Portazo", [H, H], 60],
    [64, "Cola Tridente", [T, T, H], 10],
    [84, "Bola Giratoria", [H], 20],
    [84, "Doble Giro", [H, T], 20],
    [85, "Ataque Furia", [H, H], 20],
    [87, "Golpe Caudal", [T, H], 20],
  ] as const)("#%i %s: coins %j → %i damage", (number, name, coins, damage) => {
    expect(dmg(attack(vs(gym(number), dummy()), name, [...coins]))).toBe(damage);
  });

  it.each([
    [36, "Uno-Dos", 30, 10],
    [37, "Aliento de Fuego", 10, 10],
    [42, "Golpe de Cola", 10, 20],
    [44, "Pisotón", 30, 10],
    [73, "Ataque Rápido", 10, 20],
  ] as const)("#%i %s: %i, +%i on heads", (number, name, base, bonus) => {
    const state = vs(gym(number), dummy());
    expect([dmg(attack(state, name, [H])), dmg(attack(state, name, [T]))]).toEqual([base + bonus, base]);
  });

  it.each([
    [2, "Lariat", 70],
    [30, "Azar Cuerno", 30],
    [36, "Puño Infantil", 10],
    [83, "Viento Cortante", 40],
  ] as const)("#%i %s: %i, tails = nothing", (number, name, damage) => {
    const state = vs(gym(number), dummy());
    expect([dmg(attack(state, name, [H])), dmg(attack(state, name, [T]))]).toEqual([damage, 0]);
  });

  it("#70 Placaje Taladro: 70 only with 2 heads; #89 Tenaza: heads 20 + Paralyzed, tails nothing", () => {
    const rhyhorn = vs(gym(70), dummy());
    expect([dmg(attack(rhyhorn, "Placaje Taladro", [H, H])), dmg(attack(rhyhorn, "Placaje Taladro", [H, T]))]).toEqual([70, 0]);
    const shellder = vs(gym(89), dummy());
    const heads = attack(shellder, "Tenaza", [H]);
    expect([dmg(heads), statuses(heads)]).toEqual([20, [Paralyzed]]);
    expect([dmg(attack(shellder, "Tenaza", [T])), statuses(attack(shellder, "Tenaza", [T]))]).toEqual([0, []]);
  });

  it.each([
    [22, "Derribo", 40, 10],
    [35, "Placaje Ígneo", 30, 10],
    [76, "Placaje Descuidado", 20, 10],
  ] as const)("#%i %s: %i damage and %i to itself", (number, name, damage, self) => {
    const next = attack(vs(gym(number), dummy()), name);
    expect([dmg(next), next.playerActivePokemon!.currentDamage]).toEqual([damage, self]);
  });

  it("#8 Megadescarga: 50; tails = 20 to itself", () => {
    const state = vs(gym(8), dummy());
    expect(attack(state, "Megadescarga", [H]).playerActivePokemon!.currentDamage).toBe(0);
    const tails = attack(state, "Megadescarga", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.currentDamage]).toEqual([50, 20]);
  });

  it("can't retreat next turn: #7 Agarre, #72 Foso de Arena, #93 Espanto", () => {
    for (const [number, name, damage] of [[7, "Agarre", 30], [72, "Foso de Arena", 20], [93, "Espanto", 20]] as const) {
      const next = attack(vs(gym(number), dummy()), name);
      expect([dmg(next), next.opponentActivePokemon!.retreatPrevented]).toEqual([damage, true]);
    }
  });

  it("#86 Pantalla de Humo: 20 + Smokescreen", () => {
    const next = attack(vs(gym(86), dummy()), "Pantalla de Humo");
    expect([dmg(next), next.opponentActivePokemon!.mustFlipToAttack]).toEqual([20, true]);
  });

  it("the opponent chooses the new Defending Pokémon after the damage: #22 Cuerno Lanzador, #35 Sacudida, #83 Remolino", () => {
    for (const [number, name, damage] of [[22, "Cuerno Lanzador", 20], [35, "Sacudida", 10], [83, "Remolino", 10]] as const) {
      const benched = inPlay("Machop");
      const next = attack(vs(gym(number), dummy(), { opponent: { bench: [benched] } }), name);
      expect(dmg(next)).toBe(damage);
      expect(next.pendingAttackChoice!.step.chooser).toBe("opponent");
      expect(choose(next, [benched.pokemon.id]).opponentActivePokemon!.pokemon.name).toBe("Machop");
    }
  });

  it("#67 Provocación: the attacker chooses the new Defending Pokémon", () => {
    const next = attack(vs(gym(67), dummy(), { opponent: { bench: [inPlay("Machop")] } }), "Provocación");
    expect(next.pendingForceSwitch).toBe(true);
  });

  it("heads = discard 1 Energy of the Defending Pokémon: #50 Pulso Eliminador, #53 Rápidos, #96 Rayo Eliminador", () => {
    for (const [number, name, damage] of [[50, "Pulso Eliminador", 10], [53, "Rápidos", 20], [96, "Rayo Eliminador", 20]] as const) {
      const defender = dummy({ energy: [Water] });
      const state = vs(gym(number), defender);
      expect(attack(state, name, [T]).pendingAttackChoice).toBeUndefined();
      const heads = attack(state, name, [H]);
      expect(dmg(heads)).toBe(damage);
      const done = choose(heads, [defender.attachedEnergy[0].id]);
      expect(done.opponentActivePokemon!.attachedEnergy).toEqual([]);
      expect(names(done.opponentDiscard)).toEqual(["Water Energy"]);
    }
  });

  it("choose Benched Pokémon: #20 Avalancha (up to 3), #79 Enredadera Elástica (1), #21 Túnel (up to 2, then can't attack)", () => {
    const bench = () => [inPlay("Machop"), inPlay("Abra"), inPlay("Pikachu"), inPlay("Onix")];
    const slide = attack(vs(gym(20), dummy(), { opponent: { bench: bench() } }), "Avalancha");
    expect([dmg(slide), slide.pendingBenchDamageSelection!.maxTargets, slide.pendingBenchDamageSelection!.damageAmount]).toEqual([20, 3, 10]);
    const vine = attack(vs(gym(79), dummy(), { opponent: { bench: bench() } }), "Enredadera Elástica");
    expect([dmg(vine), vine.pendingBenchDamageSelection!.maxTargets, vine.pendingBenchDamageSelection!.damageAmount]).toEqual([0, 1, 20]);
    const tunnel = attack(vs(gym(21), dummy(), { opponent: { bench: bench() } }), "Túnel");
    expect([tunnel.pendingBenchDamageSelection!.maxTargets, tunnel.pendingBenchDamageSelection!.damageAmount]).toEqual([2, 20]);
    expect(tunnel.playerActivePokemon!.attackLock).toEqual({ onTurn: 5 });
  });

  it("#1 Llama Fénix: 90; tails = Blaine's Moltres and its cards into the deck", () => {
    const state = vs(gym(1), dummy(), { player: { bench: [inPlay("Abra")], deck: [] } });
    expect(attack(state, "Llama Fénix", [H]).playerActivePokemon!.pokemon.name).toBe("Blaine's Moltres");
    const tails = attack(state, "Llama Fénix", [T]);
    expect([dmg(tails), tails.playerActivePokemon, names(tails.playerDeck).sort()]).toEqual([
      90,
      null,
      ["Blaine's Moltres", "Fire Energy", "Fire Energy", "Fire Energy", "Fire Energy", "Fire Energy"],
    ]);
  });

  it("#3 Poder Hada: heads = return your Pokémon to the hand; Impacto Lunar 30", () => {
    const abra = inPlay("Abra");
    const next = attack(vs(gym(3), dummy(), { player: { bench: [abra] } }), "Poder Hada", [H]);
    expect(names(choose(next, [abra.pokemon.id]).playerHand)).toEqual(["Abra"]);
    expect(dmg(attack(vs(gym(3), dummy()), "Impacto Lunar"))).toBe(30);
  });

  it("#4 Ventisca: heads = 10 to each of the opponent's Benched Pokémon, tails = to each of yours; Llevarse: both Actives into their decks", () => {
    const state = vs(gym(4), dummy(), { player: { bench: [inPlay("Abra")] }, opponent: { bench: [inPlay("Machop")] } });
    const heads = attack(state, "Ventisca", [H]);
    expect([dmg(heads), heads.opponentBench[0].currentDamage, heads.playerBench[0].currentDamage]).toEqual([30, 10, 0]);
    const tails = attack(state, "Ventisca", [T]);
    expect([tails.opponentBench[0].currentDamage, tails.playerBench[0].currentDamage]).toEqual([0, 10]);
    const away = attack(state, "Llevarse");
    expect([away.playerActivePokemon, away.opponentActivePokemon]).toEqual([null, null]);
    expect(names(away.playerDeck)).toContain("Erika's Dragonair");
    expect(names(away.opponentDeck)).toContain("Chansey");
    expect([away.playerNeedsToPromote, away.opponentNeedsToPromote]).toEqual([true, true]);
  });

  it("#5 Megaagotar: 30, heals half the damage done rounded up", () => {
    const next = attack(vs(gym(5, { damage: 40 }), dummy()), "Megaagotar");
    expect([dmg(next), next.playerActivePokemon!.currentDamage]).toEqual([30, 20]);
  });

  it("#6 / #27 Carga: up to 2 Lightning Energy from the discard pile; #81 Carga: 1", () => {
    const discard = [energy(Lightning), energy(Lightning), energy(Lightning)];
    for (const number of [6, 27]) {
      const next = attack(vs(gym(number), dummy(), { player: { discard } }), "Carga");
      expect(next.pendingAttackChoice!.step.maxSelections).toBe(2);
      expect(choose(next, [discard[0].id, discard[1].id]).playerActivePokemon!.attachedEnergy).toHaveLength(3);
    }
    const pikachu = attack(vs(gym(81), dummy(), { player: { discard } }), "Carga");
    expect([pikachu.pendingAttackChoice!.step.minSelections, pikachu.pendingAttackChoice!.step.maxSelections]).toEqual([1, 1]);
  });

  it("#6 Descarga: discard every Lightning Energy, a coin for each, 30 per heads", () => {
    const next = attack(vs(gym(6, { energy: [Lightning, Lightning, Lightning] }), dummy()), "Descarga", [H, T, H]);
    expect([dmg(next), next.playerActivePokemon!.attachedEnergy, names(next.playerDiscard)]).toEqual([
      60,
      [],
      ["Lightning Energy", "Lightning Energy", "Lightning Energy"],
    ]);
  });

  it("#9 Aguja Noqueadora: 30, 90 with 2 heads", () => {
    const state = vs(gym(9), dummy());
    expect([dmg(attack(state, "Aguja Noqueadora", [H, H])), dmg(attack(state, "Aguja Noqueadora", [H, T]))]).toEqual([90, 30]);
  });

  it("#11 Contraataque Cruzado and #12 Muro de Fuego: remembered for the opponent's next turn", () => {
    expect(attack(vs(gym(11), dummy()), "Contraataque Cruzado").playerActivePokemon!.counterAttack).toMatchObject({ damageMultiplier: 2, retaliationCoin: true });
    const wall = attack(vs(gym(12), dummy()), "Muro de Fuego");
    expect([dmg(wall), wall.playerActivePokemon!.counterAttack]).toEqual([40, { onTurn: 3, attackName: "Muro de Fuego", amount: 10, applyWeaknessResistance: true }]);
    expect(dmg(attack(vs(gym(11), dummy()), "Puño Magnum"))).toBe(50);
  });

  it("#13 Imágenes Sombra sets the effect; Guadaña Cegadora 40", () => {
    expect(attack(vs(gym(13), dummy()), "Imágenes Sombra").playerActivePokemon!.evadeOnFlip).toEqual({ attackName: "Imágenes Sombra" });
    expect(dmg(attack(vs(gym(13), dummy()), "Guadaña Cegadora"))).toBe(40);
  });

  it("#14 Amplificador de Dolor and Llamada de la Noche (2 heads: the Defending Pokémon into the deck)", () => {
    const pain = attack(vs(gym(14), dummy({ damage: 10 }), { opponent: { bench: [inPlay("Machop", { damage: 10 }), inPlay("Abra")] } }), "Amplificador de Dolor");
    expect([dmg(pain), pain.opponentBench.map((p) => p.currentDamage)]).toEqual([20, [20, 0]]);
    const state = vs(gym(14), dummy(), { opponent: { bench: [inPlay("Machop")] } });
    const night = attack(state, "Llamada de la Noche", [H, H]);
    expect(night.opponentActivePokemon).toBeNull();
    expect(names(night.opponentDeck)).toContain("Chansey");
    expect(dmg(attack(state, "Llamada de la Noche", [H, T]))).toBe(40);
  });

  it("#24 Alerta: draw a card, then switch; needs a Bench", () => {
    expect(canExecuteAttack(vs(armedFor(gym(24), "Alerta"), dummy()), 0)).toMatch(/Banca/);
    const next = attack(vs(gym(24), dummy(), { player: { bench: [inPlay("Abra")] } }), "Alerta");
    expect([next.playerHand.length, next.pendingSelfSwitch]).toEqual([1, true]);
  });

  it("#25 Observar la Luna: a basic Energy card of the deck to the hand", () => {
    const deck = [gameCard("Abra"), energy(Water)];
    const next = attack(vs(gym(25), dummy(), { player: { deck } }), "Observar la Luna");
    expect(names(choose(next, [deck[1].id]).playerHand)).toEqual(["Water Energy"]);
  });

  it("#27 Corriente Eléctrica: 20 and 1 Lightning Energy to a Benched Pokémon", () => {
    const abra = inPlay("Abra");
    const next = attack(vs(gym(27, { energy: [Lightning, Lightning] }), dummy(), { player: { bench: [abra] } }), "Corriente Eléctrica");
    expect(dmg(next)).toBe(20);
    expect(names(choose(next, [abra.pokemon.id]).playerBench[0].attachedEnergy)).toEqual(["Lightning Energy"]);
  });

  it("#28 Rayo: 100, discard every Energy attached; Mega Puño 30", () => {
    const next = attack(vs(gym(28), dummy()), "Rayo");
    expect([dmg(next), next.playerActivePokemon!.attachedEnergy, next.playerDiscard.length]).toEqual([100, [], 4]);
    expect(dmg(attack(vs(gym(28), dummy()), "Mega Puño"))).toBe(30);
  });

  it("#31 Anillo de Agua: 30 and 10 to each non-Water Benched Pokémon of both players", () => {
    const next = attack(
      vs(gym(31), dummy(), { player: { bench: [inPlay("Squirtle"), inPlay("Abra")] }, opponent: { bench: [inPlay("Machop"), inPlay("Seel")] } }),
      "Anillo de Agua"
    );
    expect([dmg(next), next.playerBench.map((p) => p.currentDamage), next.opponentBench.map((p) => p.currentDamage)]).toEqual([30, [0, 10], [10, 0]]);
  });

  it("#32 Banco de Medusas: any number of Tentacool / Tentacruel (any owner) to the hand", () => {
    const deck = [gymHand(57), gameCard("Tentacruel", "fossil"), gameCard("Abra")];
    const next = attack(vs(gym(32), dummy(), { player: { deck } }), "Banco de Medusas");
    expect(names(takeable(next.pendingAttackChoice!.step))).toEqual(["Misty's Tentacool", "Tentacruel"]);
  });

  it("#34 Polen Curativo: 10 per heads from each of your Pokémon; Distorsión Sónica: confused with 1 heads", () => {
    const pollen = attack(vs(gym(34, { damage: 30 }), dummy(), { player: { bench: [inPlay("Abra", { damage: 20 })] } }), "Polen Curativo", [H, H, T]);
    expect([pollen.playerActivePokemon!.currentDamage, pollen.playerBench[0].currentDamage]).toEqual([10, 0]);
    const state = vs(gym(34), dummy());
    expect([dmg(attack(state, "Distorsión Sónica", [T, H])), statuses(attack(state, "Distorsión Sónica", [T, H]))]).toEqual([10, [Confused]]);
    expect(statuses(attack(state, "Distorsión Sónica", [T, T]))).toEqual([]);
  });

  it("#37 Estallido de Lava: 20 per Fire Energy among the top 5 cards discarded", () => {
    const deck = [energy(Fire), energy(Fire), gameCard("Abra"), energy(Water), energy(Fire), energy(Fire)];
    const next = attack(vs(gym(37), dummy(), { player: { deck } }), "Estallido de Lava");
    expect([dmg(next), next.playerDeck.length]).toEqual([60, 1]);
  });

  it("#38 Tiro de Suerte: needs a Bench; heads = 30 to the chosen Benched Pokémon", () => {
    expect(canExecuteAttack(vs(armedFor(gym(38), "Tiro de Suerte"), dummy()), 1)).toMatch(/Banca/);
    const machop = inPlay("Machop");
    const state = vs(gym(38), dummy(), { opponent: { bench: [machop] } });
    expect(attack(state, "Tiro de Suerte", [T]).pendingAttackChoice).toBeUndefined();
    expect(choose(attack(state, "Tiro de Suerte", [H]), [machop.pokemon.id]).opponentBench[0].currentDamage).toBe(30);
  });

  it("#39 Picado en Espiral: 10 to each of the opponent's Pokémon, no Weakness / Resistance", () => {
    // Machop is weak to Psychic, not Grass; Onix is weak to Grass: still 10
    const next = attack(vs(gym(39), inPlay("Onix"), { opponent: { bench: [inPlay("Abra"), inPlay("Machop")] } }), "Picado en Espiral");
    expect([dmg(next), next.opponentBench.map((p) => p.currentDamage)]).toEqual([10, [10, 10]]);
  });

  it("#43 Deflector halves the damage next turn; Bomba Huevo: tails = nothing to the defender and 20 to itself", () => {
    expect(attack(vs(gym(43), dummy()), "Deflector").playerActivePokemon!.halveDamage).toEqual({ onTurn: 4, attackName: "Deflector" });
    const tails = attack(vs(gym(43), dummy()), "Bomba Huevo", [T]);
    expect([dmg(tails), tails.playerActivePokemon!.currentDamage]).toEqual([0, 20]);
    expect(dmg(attack(vs(gym(43), dummy()), "Bomba Huevo", [H]))).toBe(40);
  });

  it("#44 Intercambio Psíquico: the hand into the deck, draw 5", () => {
    const next = attack(vs(gym(44), dummy(), { player: { hand: [gameCard("Abra")] } }), "Intercambio Psíquico");
    expect([next.playerHand.length, next.playerDeck.length]).toEqual([5, 6]);
  });

  it("#45 Polen Curativo: heads = 4 counters off; Polen Mágico: heads = the attacker picks the Special Condition", () => {
    expect(attack(vs(gym(45, { damage: 50 }), dummy()), "Polen Curativo", [H]).playerActivePokemon!.currentDamage).toBe(10);
    const pollen = attack(vs(gym(45), dummy()), "Polen Mágico", [H]);
    expect(dmg(pollen)).toBe(30);
    expect(statuses(choose(pollen, [Asleep]))).toEqual([Asleep]);
  });

  it("#48 Atrapamoscas: a Benched Pokémon is switched in first and takes 20", () => {
    const machop = inPlay("Machop");
    const next = attack(vs(gym(48), dummy(), { opponent: { bench: [machop] } }), "Atrapamoscas");
    const done = choose(next, [machop.pokemon.id]);
    expect([done.opponentActivePokemon!.pokemon.name, done.opponentActivePokemon!.currentDamage, done.opponentBench[0].currentDamage]).toEqual(["Machop", 20, 0]);
  });

  it("#51 Supercolmillo: half the remaining HP, rounded up to 10", () => {
    expect(dmg(attack(vs(gym(51), dummy({ damage: 10 })), "Supercolmillo"))).toBe(10 + 60);
  });

  it("#54 / #66 Llamar a un Amigo: heads = a Basic with the owner's name onto the Bench", () => {
    const deck = [gymHand(85), gymHand(69), gymHand(55)];
    const misty = attack(vs(gym(54), dummy(), { player: { deck } }), "Llamar a un Amigo", [H]);
    expect(names(takeable(misty.pendingAttackChoice!.step))).toEqual(["Misty's Goldeen"]);
    const brock = attack(vs(gym(66), dummy(), { player: { deck } }), "Llamar a un Amigo", [H]);
    expect(names(choose(brock, [deck[1].id]).playerBench.map((p) => p.pokemon))).toEqual(["Brock's Onix"]);
    expect(attack(vs(gym(66), dummy(), { player: { deck } }), "Llamar a un Amigo", [T]).pendingAttackChoice).toBeUndefined();
  });

  it("#55 Chapoteo de Barro: 30; heads = 10 to a chosen Benched Pokémon", () => {
    const machop = inPlay("Machop");
    const next = attack(vs(gym(55), dummy(), { opponent: { bench: [machop] } }), "Chapoteo de Barro", [H]);
    expect(dmg(next)).toBe(30);
    expect(choose(next, [machop.pokemon.id]).opponentBench[0].currentDamage).toBe(10);
  });

  it("#56 Pistola de Agua: 10 + 10 per extra Water Energy (at most +20)", () => {
    expect(dmg(attack(vs(gym(56, { energy: [Water, Water, Water, Water] }), dummy()), "Pistola de Agua"))).toBe(30);
  });

  it("#57 Rayo Cristal: 20; heads = no Energy attached to the Defending Pokémon next turn", () => {
    const heads = attack(vs(gym(57), dummy()), "Rayo Cristal", [H]);
    expect([dmg(heads), heads.opponentActivePokemon!.energyAttachBlockedOnTurn]).toEqual([20, 4]);
    expect(attack(vs(gym(57), dummy()), "Rayo Cristal", [T]).opponentActivePokemon!.energyAttachBlockedOnTurn).toBeUndefined();
  });

  it("#58 Espíritus Nocturnos: a coin per Sabrina's Gastly / Haunter / Gengar you have in play", () => {
    const state = vs(gym(58), dummy(), { player: { bench: [gym(93), inPlay("Gastly")] } });
    expect(getAttackCoinPlan(armedState(state, "Espíritus Nocturnos"), 0).attack).toBe(2);
    expect(dmg(attack(state, "Espíritus Nocturnos", [H, H]))).toBe(60);
  });

  it("#59 Buenos Días: 20, an Asleep Defending Pokémon wakes up", () => {
    const next = attack(vs(gym(59), dummy({ statuses: [Asleep] })), "Buenos Días");
    expect([dmg(next), statuses(next)]).toEqual([20, []]);
  });

  it("#60 Hora de la Siesta: heads = 3 counters off and Asleep; Cabezazo Chillón: 40, not next turn", () => {
    const nap = attack(vs(gym(60, { damage: 50 }), dummy()), "Hora de la Siesta", [H]);
    expect([nap.playerActivePokemon!.currentDamage, nap.playerActivePokemon!.statusConditions]).toEqual([20, [Asleep]]);
    expect(attack(vs(gym(60, { damage: 50 }), dummy()), "Hora de la Siesta", [T]).playerActivePokemon!.currentDamage).toBe(50);
    const headbutt = attack(vs(gym(60), dummy()), "Cabezazo Chillón");
    expect([dmg(headbutt), headbutt.playerActivePokemon!.attackLock]).toEqual([40, { onTurn: 5, attackName: "Cabezazo Chillón" }]);
  });

  it("#61 Encender: discard 1 Energy card, then 1 Energy of the Defending Pokémon", () => {
    const defender = dummy({ energy: [Water] });
    const next = attack(vs(gym(61), defender), "Encender");
    expect([dmg(next), next.playerActivePokemon!.attachedEnergy]).toEqual([10, []]);
    expect(choose(next, [defender.attachedEnergy[0].id]).opponentActivePokemon!.attachedEnergy).toEqual([]);
  });

  it("#62 Fuego Vivo: 20 and 10 to each Grass Pokémon on the opponent's Bench", () => {
    const next = attack(vs(gym(62), dummy(), { opponent: { bench: [inPlay("Bulbasaur"), inPlay("Abra")] } }), "Fuego Vivo");
    expect([dmg(next), next.opponentBench.map((p) => p.currentDamage)]).toEqual([20, [10, 0]]);
  });

  it("#63 Agilidad / #71 Rizo Defensa: protection on heads", () => {
    expect(attack(vs(gym(63), dummy()), "Agilidad", [H]).playerActivePokemon!.protection?.type).toBe("damageAndEffects");
    expect(attack(vs(gym(63), dummy()), "Agilidad", [T]).playerActivePokemon!.protection).toBeUndefined();
    expect(attack(vs(gym(71), dummy()), "Rizo Defensa", [H]).playerActivePokemon!.protection?.type).toBe("damageOnly");
  });

  it("#64 Carga a Toda Velocidad: 20 per heads to the defender, 20 per tails to itself", () => {
    const next = attack(vs(gym(64), dummy()), "Carga a Toda Velocidad", [H, T, H, T]);
    expect([dmg(next), next.playerActivePokemon!.currentDamage]).toEqual([40, 40]);
  });

  it("#66 Gancho: no Resistance", () => {
    // Pidgey resists Fighting
    expect(dmg(attack(vs(gym(66), inPlay("Pidgey")), "Gancho"))).toBe(20);
  });

  it("#68 Inquietud shuffles the deck; Golpe Karate: 40 minus 10 per counter", () => {
    expect(attack(vs(gym(68), dummy()), "Inquietud").events.at(-1)!.message).toMatch(/mezcló/);
    expect(dmg(attack(vs(gym(68, { damage: 20 }), dummy()), "Golpe Karate"))).toBe(20);
  });

  it("#77 Explosión de Huevos: a coin per Energy, 10 per heads; Médium: +10 per Energy card on the Defending Pokémon", () => {
    expect(dmg(attack(vs(gym(77, { energy: [Grass, Grass, Grass] }), dummy()), "Explosión de Huevos", [H, H, T]))).toBe(20);
    expect(dmg(attack(vs(gym(77), dummy({ energy: [Water, Water] })), "Médium"))).toBe(30);
  });

  it("Base Set Mewtwo's Médium (same text, owner decision): +10 per Energy card on the Defending Pokémon", () => {
    const mewtwo = inPlay("Mewtwo");
    expect([mewtwo.pokemon.set, mewtwo.pokemon.number]).toEqual(["Base Set", 10]);
    expect(dmg(attack(vs(mewtwo, dummy()), "Médium"))).toBe(10);
    expect(dmg(attack(vs(mewtwo, dummy({ energy: [Water, Water] })), "Médium"))).toBe(30);
    // Energy cards, not units: a Double Colorless Energy counts once
    expect(dmg(attack(vs(mewtwo, dummy({ energy: [EnergyType.Colorless] })), "Médium"))).toBe(20);
  });

  it("#78 Secar / Esponja Esporádica: 1 counter off (with heads for the second)", () => {
    expect(attack(vs(gym(78, { damage: 20 }), dummy()), "Secar").playerActivePokemon!.currentDamage).toBe(10);
    expect(attack(vs(gym(78, { damage: 20 }), dummy()), "Esponja Esporádica", [H]).playerActivePokemon!.currentDamage).toBe(10);
    expect(attack(vs(gym(78, { damage: 20 }), dummy()), "Esponja Esporádica", [T]).playerActivePokemon!.currentDamage).toBe(20);
  });

  it("#82 Foco Energía: Roer does 40 during the next turn", () => {
    const rattata = armedFor(armedFor(gym(82), "Foco Energía"), "Roer");
    const focus = executeAttack(vs(rattata, dummy()), 0, { coinResults: [] });
    const back = endTurn(focus);
    expect(dmg(executeAttack(back, 1, { coinResults: [], skipEndTurn: true }))).toBe(40);
  });

  it("#90 Rapidez: 20 whatever the Defending Pokémon's Weakness or effects", () => {
    // Magmar is weak to Water
    expect(dmg(attack(vs(gym(90), inPlay("Magmar")), "Rapidez"))).toBe(20);
  });

  it("#91 Bucle de Energía: 20, a Psychic Energy back to the hand", () => {
    const next = attack(vs(gym(91), dummy()), "Bucle de Energía");
    expect([dmg(next), names(next.playerHand), next.playerActivePokemon!.attachedEnergy]).toEqual([20, ["Psychic Energy"], []]);
  });

  it("#94 Juego de Manos: up to 3 cards of the hand on top of the deck, then that many basic Energy to the hand", () => {
    const hand = [gameCard("Abra")];
    const deck = [energy(Water), gameCard("Machop")];
    const next = attack(vs(gym(94), dummy(), { player: { hand, deck } }), "Juego de Manos");
    const second = choose(next, [hand[0].id]);
    expect(names(choose(second, [deck[0].id]).playerHand)).toEqual(["Water Energy"]);
  });
});
