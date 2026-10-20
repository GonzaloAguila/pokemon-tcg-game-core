import { describe, it, expect } from "vitest";
import {
  TRAINER_EFFECTS,
  POWER_EFFECTS,
  UNSUPPORTED_TRAINERS,
  ACTIVATED_POWER_TYPES,
  isPlayedAsBasic,
  catalogTrainerNames,
  canPlayTrainerCard,
  getTrainerSteps,
  getTrainerCoinFlips,
  playTrainerCard,
  canUsePokemonPower,
  getPowerSteps,
  getPowerCoinFlips,
  usePokemonPower,
} from "@/domain/effects";
import { ALL_CARDS } from "@/domain/catalog";
import { IllegalActionError } from "@/shared/errors";
import { EnergyType, StatusCondition, PokemonStage, TrainerType } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, energies, deepFreeze, names } from "./helpers/state";

const { Water, Fire, Grass, Lightning, Psychic } = EnergyType;

describe("registry coverage", () => {
  it("every Trainer in the catalog has a TRAINER_EFFECTS entry (except the allow-list)", () => {
    // Stadiums without an on-play effect need no entry: they fall back to playStadium
    const isStadium = (name: string) => ALL_CARDS.some((c) => c.kind === "trainer" && c.name === name && c.trainerType === TrainerType.Stadium);
    const missing = catalogTrainerNames().filter(
      (name) => !TRAINER_EFFECTS[name] && !UNSUPPORTED_TRAINERS.includes(name) && !isPlayedAsBasic(name) && !isStadium(name)
    );
    expect(missing).toEqual([]);
    // Every catalog Trainer is playable (the last Gym Heroes ones, Tasks 10–14, are in)
    expect([...UNSUPPORTED_TRAINERS]).toEqual([]);
    expect(isPlayedAsBasic("Mysterious Fossil") && isPlayedAsBasic("Clefairy Doll")).toBe(true);
  });

  it("every activated power in the catalog has a POWER_EFFECTS entry", () => {
    const activated = ALL_CARDS.flatMap((c) =>
      c.kind === "pokemon" && c.power && ACTIVATED_POWER_TYPES.includes(c.power.type) ? [c.power.name] : []
    );
    expect(activated.length).toBeGreaterThanOrEqual(8);
    expect(activated.filter((name) => !POWER_EFFECTS[name])).toEqual([]);
  });

  it("Clefairy Doll is not played as a Trainer: it goes into play as a Basic", () => {
    const doll = gameCard("Clefairy Doll");
    expect(canPlayTrainerCard(makeState({ player: { active: inPlay("Machop"), hand: [doll] } }), doll.id)).toMatch(/Pokémon Básico/);
  });
});

describe("generic trainer entry points", () => {
  it("validates turn, selections and options; throws IllegalActionError", () => {
    const potion = gameCard("Potion");
    const machop = inPlay("Machop", { damage: 30 });
    const state = makeState({ player: { active: machop, bench: [inPlay("Abra")], hand: [potion] } });

    expect(canPlayTrainerCard({ ...state, isPlayerTurn: false }, potion.id)).toMatch(/turno/);
    const step = getTrainerSteps(state, potion.id, []);
    expect(step?.options.map((o) => o.id)).toEqual([machop.pokemon.id]);
    expect(() => playTrainerCard(state, potion.id, [])).toThrow(IllegalActionError);
    expect(() => playTrainerCard(state, potion.id, [[state.playerBench[0].pokemon.id]])).toThrow(/no válida/);
    expect(() => playTrainerCard(state, potion.id, [[machop.pokemon.id], ["extra"]])).toThrow(/de más/);

    const next = playTrainerCard(deepFreeze(state), potion.id, [[machop.pokemon.id]]);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    expect(names(next.playerDiscard)).toEqual(["Potion"]);
  });

  it("no-step trainers: Bill, Professor Oak, PlusPower, Lass, Pokémon Center, Imposter Professor Oak, Full Heal", () => {
    const cards = ["Bill", "Professor Oak", "PlusPower", "Lass", "Pokémon Center", "Imposter Professor Oak", "Full Heal"].map((n) => gameCard(n));
    const active = inPlay("Machop", { damage: 20, energy: [EnergyType.Fighting], statuses: [StatusCondition.Asleep] });
    const base = makeState({ player: { active, hand: cards } });
    for (const card of cards) {
      expect(canPlayTrainerCard(base, card.id)).toBeNull();
      expect(getTrainerSteps(base, card.id, [])).toBeNull();
    }
    expect(playTrainerCard(base, cards[0].id).playerHand).toHaveLength(cards.length - 1 + 2);
    expect(playTrainerCard(base, cards[1].id).playerHand).toHaveLength(7);
    expect(playTrainerCard(base, cards[2].id).activeModifiers).toHaveLength(1);
    expect(playTrainerCard(base, cards[3].id).playerHand).toHaveLength(0);
    expect(playTrainerCard(base, cards[4].id).playerActivePokemon!.currentDamage).toBe(0);
    expect(playTrainerCard(base, cards[5].id).opponentHand).toHaveLength(7);
    expect(playTrainerCard(base, cards[6].id).playerActivePokemon!.statusConditions).toEqual([]);
  });

  it("Switch and Gust of Wind choose a benched Pokémon by id", () => {
    const sw = gameCard("Switch");
    const gust = gameCard("Gust of Wind");
    const abra = inPlay("Abra");
    const pidgey = inPlay("Pidgey");
    const state = makeState({
      player: { active: inPlay("Machop"), bench: [abra], hand: [sw, gust] },
      opponent: { active: inPlay("Onix"), bench: [pidgey] },
    });
    expect(playTrainerCard(state, sw.id, [[abra.pokemon.id]]).playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(playTrainerCard(state, gust.id, [[pidgey.pokemon.id]]).opponentActivePokemon!.pokemon.name).toBe("Pidgey");
  });

  it("Defender, Energy Removal, Scoop Up, Super Potion", () => {
    const defender = gameCard("Defender");
    const removal = gameCard("Energy Removal");
    const scoop = gameCard("Scoop Up");
    const superPotion = gameCard("Super Potion");
    const machop = inPlay("Machop", { damage: 40, energy: [EnergyType.Fighting] });
    const abra = inPlay("Abra");
    const onix = inPlay("Onix", { energy: [EnergyType.Fighting] });
    const state = makeState({ player: { active: machop, bench: [abra], hand: [defender, removal, scoop, superPotion] }, opponent: { active: onix } });

    expect(playTrainerCard(state, defender.id, [[abra.pokemon.id]]).activeModifiers[0].targetPokemonId).toBe(abra.pokemon.id);
    expect(playTrainerCard(state, removal.id, [[onix.attachedEnergy[0].id]]).opponentActivePokemon!.attachedEnergy).toHaveLength(0);
    expect(playTrainerCard(state, scoop.id, [[abra.pokemon.id]]).playerHand.some((c) => c.name === "Abra")).toBe(true);
    const potioned = playTrainerCard(state, superPotion.id, [[machop.pokemon.id], [machop.attachedEnergy[0].id]]);
    expect(potioned.playerActivePokemon!.currentDamage).toBe(0);
    expect(potioned.playerActivePokemon!.attachedEnergy).toHaveLength(0);
  });

  it("Energy Removal: an Energy card attached to any of the opponent's Pokémon (Benched too)", () => {
    const removal = gameCard("Energy Removal");
    const onix = inPlay("Onix", { energy: [EnergyType.Fighting] });
    const machop = inPlay("Machop", { energy: [EnergyType.Fighting, EnergyType.Fighting] });
    const state = makeState({ player: { active: inPlay("Abra"), hand: [removal] }, opponent: { active: onix, bench: [machop] } });
    const step = getTrainerSteps(state, removal.id, [])!;
    expect(step.options.map((o) => o.id)).toEqual([onix.attachedEnergy[0].id, ...machop.attachedEnergy.map((e) => e.id)]);
    const after = playTrainerCard(state, removal.id, [[machop.attachedEnergy[1].id]]);
    expect(after.opponentBench[0].attachedEnergy.map((e) => e.id)).toEqual([machop.attachedEnergy[0].id]);
    expect(after.opponentActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(after.opponentDiscard.map((c) => c.id)).toEqual([machop.attachedEnergy[1].id]);
    // Only the Benched Pokémon has Energy: still playable
    const benchOnly = makeState({ player: { active: inPlay("Abra"), hand: [removal] }, opponent: { active: inPlay("Onix"), bench: [machop] } });
    expect(canPlayTrainerCard(benchOnly, removal.id)).toBeNull();
  });

  it("Super Energy Removal: own energy, opponent Pokémon, up to 2 energies", () => {
    const ser = gameCard("Super Energy Removal");
    const machop = inPlay("Machop", { energy: [EnergyType.Fighting] });
    const onix = inPlay("Onix", { energy: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting] });
    const state = makeState({ player: { active: machop, hand: [ser] }, opponent: { active: onix } });
    const step4 = getTrainerSteps(state, ser.id, [[machop.pokemon.id], [machop.attachedEnergy[0].id], [onix.pokemon.id]]);
    expect(step4?.maxSelections).toBe(2);
    expect(step4?.minSelections).toBe(1);
    const next = playTrainerCard(state, ser.id, [[machop.pokemon.id], [machop.attachedEnergy[0].id], [onix.pokemon.id], [onix.attachedEnergy[0].id, onix.attachedEnergy[1].id]]);
    expect(next.opponentActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(next.playerActivePokemon!.attachedEnergy).toHaveLength(0);
  });

  it("Energy Retrieval, Maintenance, Computer Search, Item Finder, Pokémon Trader", () => {
    const retrieval = gameCard("Energy Retrieval");
    const maintenance = gameCard("Maintenance");
    const search = gameCard("Computer Search");
    const finder = gameCard("Item Finder");
    const trader = gameCard("Pokémon Trader");
    const [e1, e2] = energies(Fire, Water);
    const filler = [gameCard("Abra"), gameCard("Pidgey")];
    const discarded = [energy(Grass), energy(Grass), gameCard("Bill")];
    const deckPokemon = gameCard("Onix");
    const state = makeState({
      player: {
        active: inPlay("Machop"),
        hand: [retrieval, maintenance, search, finder, trader, e1, e2, ...filler],
        discard: discarded,
        deck: [deckPokemon, ...energies(Fire, Fire)],
      },
    });

    const retrieved = playTrainerCard(state, retrieval.id, [[e1.id], [discarded[0].id, discarded[1].id]]);
    expect(retrieved.playerHand.filter((c) => c.name === "Grass Energy")).toHaveLength(2);
    expect(playTrainerCard(state, maintenance.id, [[e1.id, e2.id]]).playerDeck).toHaveLength(3 + 2 - 1);
    const searched = playTrainerCard(state, search.id, [[e1.id, e2.id], [deckPokemon.id]]);
    expect(searched.playerHand.some((c) => c.id === deckPokemon.id)).toBe(true);
    const found = playTrainerCard(state, finder.id, [[e1.id, e2.id], [discarded[2].id]]);
    expect(found.playerHand.some((c) => c.id === discarded[2].id)).toBe(true);
    const traded = playTrainerCard(state, trader.id, [[filler[0].id], [deckPokemon.id]]);
    expect(traded.playerHand.some((c) => c.id === deckPokemon.id)).toBe(true);
    expect(traded.playerDeck.some((c) => c.id === filler[0].id)).toBe(true);
  });

  it("Pokémon Breeder offers only Stage 2 cards with a matching Basic", () => {
    const breeder = gameCard("Pokémon Breeder");
    const charizard = gameCard("Charizard");
    const blastoise = gameCard("Blastoise");
    const charmander = inPlay("Charmander", { playedOnTurn: 0 });
    const state = makeState({ turnNumber: 3, player: { active: charmander, hand: [breeder, charizard, blastoise] } });
    expect(getTrainerSteps(state, breeder.id, [])?.options.map((o) => o.id)).toEqual([charizard.id]);
    const next = playTrainerCard(state, breeder.id, [[charizard.id], [charmander.pokemon.id]]);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Charizard");
    expect(canPlayTrainerCard({ ...state, turnNumber: 2 }, breeder.id)).toMatch(/primer turno/);
  });

  it("Devolution Spray devolves, removes conditions, and knocks out when damage >= new HP", () => {
    const spray = gameCard("Devolution Spray");
    const charmeleon = inPlay("Charmeleon", { damage: 60, evolvedFrom: ["Charmander"], statuses: [StatusCondition.Confused] });
    const state = makeState({ player: { active: charmeleon, bench: [inPlay("Abra")], hand: [spray] } });
    const step = getTrainerSteps(state, spray.id, []);
    expect(step?.options[0].sublabel).toMatch(/Fuera de Combate/);

    const next = playTrainerCard(state, spray.id, [[charmeleon.pokemon.id]]);
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.opponentPrizes).toHaveLength(5);
    expect(names(next.playerDiscard)).toContain("Charmander");

    const healthy = { ...state, playerActivePokemon: { ...charmeleon, currentDamage: 10 } };
    const devolved = playTrainerCard(healthy, spray.id, [[charmeleon.pokemon.id]]).playerActivePokemon!;
    expect(devolved.pokemon.name).toBe("Charmander");
    expect(devolved.statusConditions).toEqual([]);
  });

  it("Pokédex reorders the top cards with a permutation", () => {
    const dex = gameCard("Pokédex");
    const deck = energies(Fire, Water, Grass);
    const state = makeState({ player: { active: inPlay("Machop"), hand: [dex], deck } });
    expect(() => playTrainerCard(state, dex.id, [["0", "0", "1"]])).toThrow(IllegalActionError);
    expect(names(playTrainerCard(state, dex.id, [["2", "0", "1"]]).playerDeck)).toEqual(["Grass Energy", "Fire Energy", "Water Energy"]);
  });

  it("Revive and Pokémon Flute put a Basic from a discard pile onto a bench", () => {
    const revive = gameCard("Revive");
    const flute = gameCard("Pokémon Flute");
    const abra = gameCard("Abra");
    const pidgey = gameCard("Pidgey");
    const state = makeState({
      player: { active: inPlay("Machop"), hand: [revive, flute], discard: [abra, gameCard("Kadabra")] },
      opponent: { active: inPlay("Onix"), discard: [pidgey] },
    });
    expect(getTrainerSteps(state, revive.id, [])?.options.map((o) => o.id)).toEqual([abra.id]);
    const revived = playTrainerCard(state, revive.id, [[abra.id]]);
    expect(revived.playerBench[0].pokemon.id).toBe(abra.id);
    expect(revived.playerBench[0].currentDamage).toBe(10); // half of 30 HP, rounded down to 10
    expect(playTrainerCard(state, flute.id, [[pidgey.id]]).opponentBench[0].pokemon.id).toBe(pidgey.id);
  });

  it("Poké Ball: the caller flips 1 coin; heads asks for a Pokémon, tails just discards", () => {
    const ball = gameCard("Poké Ball");
    const onix = gameCard("Onix");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [ball], deck: [onix, energy(Fire)] } });
    expect(getTrainerCoinFlips(state, ball.id)).toBe(1);
    expect(() => playTrainerCard(state, ball.id, [], {})).toThrow(/moneda/);
    expect(getTrainerSteps(state, ball.id, [], ["tails"])).toBeNull();
    expect(names(playTrainerCard(state, ball.id, [], { coinResults: ["tails"] }).playerDiscard)).toEqual(["Poké Ball"]);
    expect(getTrainerSteps(state, ball.id, [], ["heads"])?.options.filter((o) => !o.disabled).map((o) => o.id)).toEqual([onix.id]);
    const next = playTrainerCard(state, ball.id, [[onix.id]], { coinResults: ["heads"] });
    expect(next.playerHand.some((c) => c.id === onix.id)).toBe(true);
  });
});

describe("generic power entry points", () => {
  it("Rain Dance attaches Water from the hand without using the turn's attachment", () => {
    const blastoise = inPlay("Blastoise", { evolvedFrom: ["Squirtle", "Wartortle"] });
    const water = energy(Water);
    const squirtle = inPlay("Squirtle");
    const state = makeState({ energyAttachedThisTurn: true, player: { active: squirtle, bench: [blastoise], hand: [water, energy(Fire)] } });
    expect(getPowerSteps(state, blastoise.pokemon.id, [])?.options.map((o) => o.id)).toEqual([water.id]);
    const next = usePokemonPower(state, blastoise.pokemon.id, [[water.id], [squirtle.pokemon.id]]);
    expect(next.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(next.energyAttachedThisTurn).toBe(true);
  });

  it("uses the power of the given Pokémon: an asleep Blastoise can't, an awake one can", () => {
    const asleep = inPlay("Blastoise", { statuses: [StatusCondition.Asleep] });
    const awake = inPlay("Blastoise");
    const state = makeState({ player: { active: asleep, bench: [awake], hand: [energy(Water)] } });
    expect(canUsePokemonPower(state, asleep.pokemon.id)).toMatch(/estado/);
    expect(canUsePokemonPower(state, awake.pokemon.id)).toBeNull();
  });

  it("Energy Trans moves one Grass Energy between own Pokémon", () => {
    const venusaur = inPlay("Venusaur", { energy: [Grass, Grass] });
    const bulbasaur = inPlay("Bulbasaur");
    const state = makeState({ player: { active: venusaur, bench: [bulbasaur] } });
    const next = usePokemonPower(state, venusaur.pokemon.id, [[venusaur.pokemon.id], [venusaur.attachedEnergy[0].id], [bulbasaur.pokemon.id]]);
    expect(next.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(next.playerBench[0].attachedEnergy).toHaveLength(1);
  });

  it("Damage Swap moves damage without knocking out the target", () => {
    const alakazam = inPlay("Alakazam", { damage: 30, evolvedFrom: ["Abra", "Kadabra"] });
    const abra = inPlay("Abra", { damage: 0 }); // 30 HP: can take at most 20
    const state = makeState({ player: { active: alakazam, bench: [abra] } });
    const amounts = getPowerSteps(state, alakazam.pokemon.id, [[alakazam.pokemon.id], [abra.pokemon.id]])?.options.map((o) => o.id);
    expect(amounts).toEqual(["10", "20"]);
    const next = usePokemonPower(state, alakazam.pokemon.id, [[alakazam.pokemon.id], [abra.pokemon.id], ["20"]]);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    expect(next.playerBench[0].currentDamage).toBe(20);
  });

  it("Energy Burn turns Charizard's Energy into Fire", () => {
    const charizard = inPlay("Charizard", { energy: [Water] });
    const state = makeState({ player: { active: charizard } });
    expect(usePokemonPower(state, charizard.pokemon.id).playerActivePokemon!.energyConversionType).toBe(Fire);
  });

  it("Buzzap: choose a type, then a Pokémon; the opponent gets a prize", () => {
    const electrode = inPlay("Electrode", { evolvedFrom: ["Voltorb"] });
    const pikachu = inPlay("Pikachu", { set: "base" });
    const state = makeState({ player: { active: pikachu, bench: [electrode] } });
    const next = usePokemonPower(state, electrode.pokemon.id, [[Lightning], [pikachu.pokemon.id]]);
    expect(next.playerBench).toHaveLength(0);
    expect(next.playerActivePokemon!.attachedEnergy[0].buzzapEnergyType).toBe(Lightning);
    expect(next.playerActivePokemon!.attachedEnergy[0].id).toBe(electrode.pokemon.id); // same physical card
    expect(next.opponentCanTakePrize).toBe(true);
  });

  it("Heal: 1 coin; heads removes a counter, tails only uses the power", () => {
    const vileplume = inPlay("Vileplume", { set: "jungle", damage: 20 });
    const state = makeState({ player: { active: vileplume } });
    expect(getPowerCoinFlips(state, vileplume.pokemon.id)).toBe(1);
    const healed = usePokemonPower(state, vileplume.pokemon.id, [[vileplume.pokemon.id]], { coinResults: ["heads"] });
    expect(healed.playerActivePokemon!.currentDamage).toBe(10);
    expect(canUsePokemonPower(healed, vileplume.pokemon.id)).toMatch(/ya fue usado/);
    const failed = usePokemonPower(state, vileplume.pokemon.id, [], { coinResults: ["tails"] });
    expect(failed.playerActivePokemon!.currentDamage).toBe(20);
    expect(failed.usedPowersThisTurn).toEqual([vileplume.pokemon.id]);
  });

  it("Shift changes Venomoth's type to one in play; Peek reveals a card", () => {
    const venomoth = inPlay("Venomoth", { set: "jungle" });
    const mankey = inPlay("Mankey", { set: "jungle" });
    const state = makeState({ player: { active: venomoth, bench: [mankey] }, opponent: { active: inPlay("Charmander") } });
    expect(getPowerSteps(state, venomoth.pokemon.id, [])?.options.map((o) => o.id)).toContain(Fire);
    expect(usePokemonPower(state, venomoth.pokemon.id, [[Fire]]).playerActivePokemon!.shiftedType).toBe(Fire);
    const peeked = usePokemonPower(state, mankey.pokemon.id, [["opponentDeck"]]);
    expect(peeked.pendingPeek?.revealedCards).toHaveLength(1);
    expect(canUsePokemonPower(peeked, mankey.pokemon.id)).toMatch(/ya fue usado/);
  });

  it("passive powers are not activatable", () => {
    const machamp = inPlay("Machamp", { evolvedFrom: ["Machop", "Machoke"] });
    const state = makeState({ player: { active: machamp } });
    expect(canUsePokemonPower(state, machamp.pokemon.id)).toMatch(/funciona solo/);
    expect(() => usePokemonPower(state, machamp.pokemon.id)).toThrow(IllegalActionError);
  });

  it("Stage data sanity: every Stage 2 in the catalog evolves from a Stage 1 in the catalog", () => {
    const stage1Names = new Set(ALL_CARDS.filter((c) => c.kind === "pokemon" && c.stage === PokemonStage.Stage1).map((c) => c.name));
    const orphans = ALL_CARDS.filter((c) => c.kind === "pokemon" && c.stage === PokemonStage.Stage2 && !stage1Names.has(c.evolvesFrom ?? ""));
    expect(orphans.map((c) => c.name)).toEqual([]);
    void Psychic;
  });
});
