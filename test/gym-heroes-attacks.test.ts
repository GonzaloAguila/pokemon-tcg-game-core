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
import { clearEffectsAsIfEvolved } from "@/domain/board";
import {
  canExecuteAttack,
  clearStatusConditionsOnRetreat,
  endTurn,
  executeAttack,
  getAttackCoinPlan,
  resolveAttackChoice,
} from "@/lib/gameState";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import type { Attack, AttackEffect, PokemonCard } from "@/domain/cards";
import { AttackEffectType, AttackTarget, BenchDamageTarget, EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze } from "./helpers/state";

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
      const ko = use(vs(withAttack(inPlay("Abra"), { damage: 30, effects: [] }), hitmonchan), [H]);
      expect(ko.playerActivePokemon).toBeNull();
      expect(ko.opponentPrizes).toHaveLength(5);
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
    expect(next.playerPrizes).toHaveLength(5); // Abra (30 HP) Knocked Out
    // Agility on the Defending Pokémon stops it there
    const agile = inPlay("Raichu", { damage: 10, protection: { type: "damageAndEffects", expiresAfterTurn: 3 } });
    expect(use(vs(pain, agile)).opponentActivePokemon!.currentDamage).toBe(10);
    // The Defending Pokémon Knocked Out by the counter: a Prize, the defender promotes
    const ko = use(vs(pain, inPlay("Abra", { damage: 20 }), { opponent: { bench: [inPlay("Machop")] } }));
    expect(ko.opponentActivePokemon!.pokemon.name).toBe("Machop");
    expect(ko.playerCanTakePrize).toBe(true);
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
