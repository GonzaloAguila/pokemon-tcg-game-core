/**
 * Gym Challenge simple Trainers through the effect registry (playTrainerCard / getTrainerSteps),
 * from the printed text and the accepted defaults of docs/card-doubts.md → "Gym Challenge".
 */
import { describe, it, expect } from "vitest";
import { endTurn, executeAttack, type GameState } from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerCoinFlips, getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { canEvolve, evolvePokemonCard, swapSides } from "@/domain/board";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { decideOpponentTurn, executeAIAction, answerOpponentTrainerStep } from "@/domain/ai";
import { makeState, inPlay, gameCard, energy, names, deepFreeze, armedFor, attackIndex } from "./helpers/state";

const { Fire, Water, Grass, Psychic, Fighting } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const card = (name: string) => gameCard(name, "gym-challenge");
const gc = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-challenge", ...opts });
type Setup = NonNullable<Parameters<typeof makeState>[0]>;

function withHand(hand: ReturnType<typeof gameCard>[], extra: Setup = {}): GameState {
  return makeState({
    ...extra,
    player: { active: inPlay("Machop"), hand, ...(extra.player ?? {}) },
    opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) },
  });
}

const optionIds = (state: GameState, cardId: string, selections: string[][] = [], coins?: ("heads" | "tails")[]) =>
  getTrainerSteps(state, cardId, selections, coins)!.options.filter((o) => !o.disabled).map((o) => o.id);

/** Log lines added by `after` that name a side (see event-perspective.test.ts). */
const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival|Pusiste|Tomaste|Mostraste|miraste|Barajaste|barajaste|descartaste)\b/;
const ALLOWED = [/^Jugaste [^:]*$/, /^Jugaste [^-]+ - Monedas?: (\[coin:(heads|tails)\][ ,]*)+$/, /^Robaste \d+ cartas?$/, /^Descartaste [^:]*$/];
function badLines(before: GameState, after: GameState): string[] {
  return after.events
    .slice(before.events.length)
    .map((e) => e.message)
    .filter((m) => !ALLOWED.some((ok) => ok.test(m)) && RELATIVE.test(m));
}

describe("Erika's Kindness", () => {
  it("removes 2 counters (1 if it has only 1) from every damaged Pokémon of both sides", () => {
    const trainer = card("Erika's Kindness");
    const state = deepFreeze(withHand([trainer], {
      player: { active: inPlay("Machop", { damage: 30 }), bench: [inPlay("Abra", { damage: 10 }), inPlay("Gastly")] },
      opponent: { active: inPlay("Onix", { damage: 20 }), bench: [inPlay("Pikachu", { damage: 50 })] },
    }));
    const next = playTrainerCard(state, trainer.id);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    expect(next.playerBench.map((p) => p.currentDamage)).toEqual([0, 0]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(0);
    expect(next.opponentBench[0].currentDamage).toBe(30);
    expect(names(next.playerDiscard)).toEqual(["Erika's Kindness"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs a damaged Pokémon", () => {
    const trainer = card("Erika's Kindness");
    expect(canPlayTrainerCard(withHand([trainer]), trainer.id)).toMatch(/contadores de daño/);
  });
});

describe("Giovanni's Last Resort", () => {
  it("heals a Giovanni's Pokémon completely, then discards the rest of the hand", () => {
    const trainer = card("Giovanni's Last Resort");
    const other = card("Fervor");
    const machop = gc("Giovanni's Machop", { damage: 40 });
    const state = deepFreeze(withHand([trainer, other], { player: { active: machop } }));
    expect(optionIds(state, trainer.id)).toEqual([machop.pokemon.id]);
    const next = playTrainerCard(state, trainer.id, [[machop.pokemon.id]]);
    expect(next.playerActivePokemon!.currentDamage).toBe(0);
    expect(next.playerHand).toEqual([]);
    expect(names(next.playerDiscard).sort()).toEqual(["Fervor", "Giovanni's Last Resort"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs a damaged Pokémon with Giovanni in its name", () => {
    const trainer = card("Giovanni's Last Resort");
    expect(canPlayTrainerCard(withHand([trainer], { player: { active: inPlay("Machop", { damage: 30 }) } }), trainer.id)).toMatch(/Giovanni/);
    expect(canPlayTrainerCard(withHand([trainer], { player: { active: gc("Giovanni's Machop") } }), trainer.id)).toMatch(/Giovanni/);
  });
});

describe("Master Ball", () => {
  it("offers the Pokémon cards among the top 7 and shuffles the rest back", () => {
    const trainer = card("Master Ball");
    const top = [energy(Fire), energy(Water), gameCard("Pikachu"), energy(Fire), card("Fervor"), energy(Grass), gameCard("Raichu")];
    const below = [gameCard("Abra")];
    const state = deepFreeze(withHand([trainer], { player: { deck: [...top, ...below] } }));
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.cards!.map((c) => c.name)).toEqual(top.map((c) => c.name));
    expect(optionIds(state, trainer.id)).toEqual([top[2].id, top[6].id]);
    const next = playTrainerCard(state, trainer.id, [[top[6].id]]);
    expect(names(next.playerHand)).toEqual(["Raichu"]);
    expect(next.playerDeck).toHaveLength(7);
    expect(names(next.playerDiscard)).toEqual(["Master Ball"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("may take nothing; refused with an empty deck", () => {
    const trainer = card("Master Ball");
    const state = withHand([trainer], { player: { deck: [energy(Fire)] } });
    expect(playTrainerCard(state, trainer.id, [[]]).playerDeck).toHaveLength(1);
    expect(canPlayTrainerCard(withHand([trainer], { player: { deck: [] } }), trainer.id)).toMatch(/mazo/);
  });
});

describe("Max Revive", () => {
  it("discards 2 Energy cards from the hand and puts a Basic from the discard pile onto the Bench", () => {
    const trainer = card("Max Revive");
    const fire = energy(Fire);
    const water = energy(Water);
    const abra = gameCard("Abra");
    const state = deepFreeze(withHand([trainer, fire, water, gameCard("Raichu")], { player: { discard: [abra, gameCard("Raichu")] } }));
    expect(optionIds(state, trainer.id)).toEqual([fire.id, water.id]);
    expect(optionIds(state, trainer.id, [[fire.id, water.id]])).toEqual([abra.id]);
    const next = playTrainerCard(state, trainer.id, [[fire.id, water.id], [abra.id]]);
    expect(next.playerBench.map((p) => p.pokemon.name)).toEqual(["Abra"]);
    expect(names(next.playerHand)).toEqual(["Raichu"]);
    expect(names(next.playerDiscard).sort()).toEqual(["Fire Energy", "Max Revive", "Raichu", "Water Energy"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs 2 Energy cards, a Basic in the discard pile and room on the Bench", () => {
    const trainer = card("Max Revive");
    const discard = [gameCard("Abra")];
    expect(canPlayTrainerCard(withHand([trainer, energy(Fire)], { player: { discard } }), trainer.id)).toMatch(/Energía/);
    expect(canPlayTrainerCard(withHand([trainer, energy(Fire), energy(Fire)]), trainer.id)).toMatch(/Básico/);
    const full = Array.from({ length: 5 }, () => inPlay("Abra"));
    expect(canPlayTrainerCard(withHand([trainer, energy(Fire), energy(Fire)], { player: { discard, bench: full } }), trainer.id)).toMatch(/Banca/);
  });
});

describe("Misty's Tears", () => {
  it("discards another card to take up to 2 basic Water Energy cards from the deck", () => {
    const trainer = card("Misty's Tears");
    const cost = gameCard("Abra");
    const w1 = energy(Water);
    const w2 = energy(Water);
    const w3 = energy(Water);
    const state = deepFreeze(withHand([trainer, cost], { player: { deck: [energy(Fire), w1, w2, w3] } }));
    expect(optionIds(state, trainer.id)).toEqual([cost.id]);
    expect(optionIds(state, trainer.id, [[cost.id]])).toEqual([w1.id, w2.id, w3.id]);
    const next = playTrainerCard(state, trainer.id, [[cost.id], [w1.id, w3.id]]);
    expect(names(next.playerHand)).toEqual(["Water Energy", "Water Energy"]);
    expect(next.playerDeck).toHaveLength(2);
    expect(names(next.playerDiscard).sort()).toEqual(["Abra", "Misty's Tears"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs another card in the hand", () => {
    const trainer = card("Misty's Tears");
    expect(canPlayTrainerCard(withHand([trainer]), trainer.id)).toMatch(/mano/);
  });
});

describe("Fervor", () => {
  it("puts the basic Fire Energy cards of the top 3 into the hand and discards the rest", () => {
    const trainer = card("Fervor");
    const deck = [energy(Fire), gameCard("Abra"), energy(Fire), energy(Water)];
    const state = deepFreeze(withHand([trainer], { player: { deck } }));
    const next = playTrainerCard(state, trainer.id);
    expect(names(next.playerHand)).toEqual(["Fire Energy", "Fire Energy"]);
    expect(names(next.playerDiscard).sort()).toEqual(["Abra", "Fervor"]);
    expect(names(next.playerDeck)).toEqual(["Water Energy"]);
    expect(badLines(state, next)).toEqual([]);
  });
});

describe("Warp Point", () => {
  it("the opponent switches first (their step, default the first Benched), then the player", () => {
    const trainer = card("Warp Point");
    const mine = inPlay("Abra");
    const t1 = inPlay("Pikachu");
    const t2 = inPlay("Gastly");
    const state = deepFreeze(withHand([trainer], {
      player: { active: inPlay("Machop", { statuses: [StatusCondition.Confused] }), bench: [mine] },
      opponent: { active: inPlay("Onix", { statuses: [StatusCondition.Asleep] }), bench: [t1, t2] },
    }));
    const first = getTrainerSteps(state, trainer.id, [])!;
    expect(first.chooser).toBe("opponent");
    expect(first.defaultSelection).toEqual([t1.pokemon.id]);
    expect(first.options.map((o) => o.id)).toEqual([t1.pokemon.id, t2.pokemon.id]);
    const second = getTrainerSteps(state, trainer.id, [[t2.pokemon.id]])!;
    expect(second.chooser ?? "self").toBe("self");
    const next = playTrainerCard(state, trainer.id, [[t2.pokemon.id], [mine.pokemon.id]]);
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Gastly");
    expect(next.opponentBench.map((p) => p.pokemon.name)).toEqual(["Pikachu", "Onix"]);
    expect(next.opponentBench[1].statusConditions).toEqual([]);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(next.playerBench[0].statusConditions).toEqual([]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("skips the half of a side without Benched Pokémon; refused when neither has one", () => {
    const trainer = card("Warp Point");
    const mine = inPlay("Abra");
    const onlyMine = withHand([trainer], { player: { bench: [mine] } });
    expect(getTrainerSteps(onlyMine, trainer.id, [])!.chooser ?? "self").toBe("self");
    expect(playTrainerCard(onlyMine, trainer.id, [[mine.pokemon.id]]).playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(canPlayTrainerCard(withHand([trainer]), trainer.id)).toMatch(/Banca/);
  });

  it("the AI playing it against a human waits for the human's switch", () => {
    const trainer = card("Warp Point");
    const human = inPlay("Pikachu");
    const state = makeState({
      turnNumber: 6,
      isPlayerTurn: false,
      player: { active: inPlay("Onix"), bench: [human] },
      opponent: { active: inPlay("Machop", { statuses: [StatusCondition.Paralyzed] }), bench: [armedFor(inPlay("Machamp"), "Lanzamiento Sísmico")], hand: [trainer] },
    });
    const action = decideOpponentTurn(state, { otherPlayerAnswersByHuman: true }).find((a) => a.type === "playTrainer");
    expect(action).toMatchObject({ trainerName: "Warp Point", waitsForOtherPlayer: true });
    const waiting = executeAIAction(state, action!);
    expect(waiting.pendingOpponentTrainerStep).toMatchObject({ trainerName: "Warp Point", step: { chooser: "opponent" } });
    const after = answerOpponentTrainerStep(waiting, [human.pokemon.id]);
    expect(after.playerActivePokemon!.pokemon.name).toBe("Pikachu");
    expect(after.opponentActivePokemon!.pokemon.name).toBe("Machamp");
  });
});

describe("Sabrina", () => {
  it("moves every Energy card of a Sabrina's Pokémon to another", () => {
    const trainer = card("Sabrina");
    const abra = gc("Sabrina's Abra", { energy: [Psychic, Psychic] });
    const drowzee = gc("Sabrina's Drowzee", { energy: [Fighting] });
    const state = deepFreeze(withHand([trainer], { player: { active: abra, bench: [drowzee, inPlay("Gastly", { energy: [Psychic] })] } }));
    expect(optionIds(state, trainer.id)).toEqual([abra.pokemon.id, drowzee.pokemon.id]);
    expect(optionIds(state, trainer.id, [[abra.pokemon.id]])).toEqual([drowzee.pokemon.id]);
    const next = playTrainerCard(state, trainer.id, [[abra.pokemon.id], [drowzee.pokemon.id]]);
    expect(next.playerActivePokemon!.attachedEnergy).toEqual([]);
    expect(next.playerBench[0].attachedEnergy.map((e) => (e as { energyType?: string }).energyType)).toEqual([Fighting, Psychic, Psychic]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs 2 Sabrina's Pokémon, one of them with Energy", () => {
    const trainer = card("Sabrina");
    expect(canPlayTrainerCard(withHand([trainer], { player: { active: gc("Sabrina's Abra", { energy: [Psychic] }) } }), trainer.id)).toMatch(/Sabrina/);
    expect(canPlayTrainerCard(withHand([trainer], { player: { active: gc("Sabrina's Abra"), bench: [gc("Sabrina's Drowzee")] } }), trainer.id)).toMatch(/Energía/);
  });
});

describe("Koga", () => {
  const grimer = () => armedFor(gc("Koga's Grimer"), "Lanzamiento de Lodo");
  const mud = (state: GameState) => executeAttack(state, attackIndex(state.playerActivePokemon!, "Lanzamiento de Lodo"), { coinResults: [], skipEndTurn: true });

  it("this turn, a Koga's Pokémon's attack that damages the Defending Pokémon Poisons it", () => {
    const trainer = card("Koga");
    const state = deepFreeze(withHand([trainer], { player: { active: grimer() } }));
    const played = playTrainerCard(state, trainer.id);
    expect(names(played.playerDiscard)).toEqual(["Koga"]);
    expect(badLines(state, played)).toEqual([]);
    const attacked = mud(played);
    expect(attacked.opponentActivePokemon!.currentDamage).toBe(40); // Onix: Weakness to Grass
    expect(attacked.opponentActivePokemon!.statusConditions).toContain(StatusCondition.Poisoned);
    // Without Koga: no Poison
    expect(mud(withHand([], { player: { active: grimer() } })).opponentActivePokemon!.statusConditions).toEqual([]);
  });

  it("only a Pokémon with Koga in its name, only this turn", () => {
    const trainer = card("Koga");
    const plain = armedFor(inPlay("Machop"), "Patada baja");
    const played = playTrainerCard(withHand([trainer], { player: { active: plain } }), trainer.id);
    const attacked = executeAttack(played, attackIndex(played.playerActivePokemon!, "Patada baja"), { coinResults: [], skipEndTurn: true });
    expect(attacked.opponentActivePokemon!.statusConditions).toEqual([]);
    const kept = playTrainerCard(withHand([trainer], { player: { active: grimer() } }), trainer.id);
    expect(swapSides(endTurn(kept)).activeModifiers).toEqual([]);
  });
});

describe("Rocket's Secret Experiment", () => {
  it("heads: any card of the deck into the hand", () => {
    const trainer = card("Rocket's Secret Experiment");
    const wanted = gameCard("Abra");
    const state = deepFreeze(withHand([trainer], { player: { deck: [energy(Fire), wanted] } }));
    expect(getTrainerCoinFlips(state, trainer.id)).toBe(1);
    expect(optionIds(state, trainer.id, [], [H])).toEqual(state.playerDeck.map((c) => c.id));
    const next = playTrainerCard(state, trainer.id, [[wanted.id]], { coinResults: [H] });
    expect(names(next.playerHand)).toEqual(["Abra"]);
    expect(next.trainerLockUntilTurn?.player).toBeUndefined();
    expect(badLines(state, next)).toEqual([]);
  });

  it("tails: no Trainer cards for the rest of this turn and all of the next one", () => {
    const trainer = card("Rocket's Secret Experiment");
    const fervor = card("Fervor");
    const state = deepFreeze(withHand([trainer, fervor], { turnNumber: 5 }));
    expect(getTrainerSteps(state, trainer.id, [], [T])).toBeNull();
    const next = playTrainerCard(state, trainer.id, [], { coinResults: [T] });
    expect(next.trainerLockUntilTurn?.player).toBe(7);
    expect(canPlayTrainerCard(next, fervor.id)).toMatch(/Entrenador/);
    // The other player's turn (6) is free; the player's next turn (7) is locked; turn 9 is free
    const theirTurn = swapSides(endTurn(next));
    const theirFervor = card("Fervor");
    expect(canPlayTrainerCard({ ...theirTurn, playerHand: [theirFervor] }, theirFervor.id)).toBeNull();
    const myNext = swapSides(endTurn(theirTurn));
    expect(myNext.turnNumber).toBe(7);
    expect(canPlayTrainerCard(myNext, fervor.id)).toMatch(/Entrenador/);
    const later = swapSides(endTurn(swapSides(endTurn(myNext))));
    expect(later.turnNumber).toBe(9);
    expect(canPlayTrainerCard(later, fervor.id)).toBeNull();
  });
});

describe("Transparent Walls", () => {
  it("prevents attack damage to the player's Benched Pokémon until the end of the opponent's next turn", () => {
    const trainer = card("Transparent Walls");
    const state = deepFreeze(withHand([trainer], { turnNumber: 5, player: { active: inPlay("Onix"), bench: [inPlay("Abra")] } }));
    const played = playTrainerCard(state, trainer.id);
    expect(played.benchProtectedUntilTurn?.player).toBe(6);
    expect(badLines(state, played)).toEqual([]);
    // The opponent's turn: Selfdestruct does 20 to every Benched Pokémon (both sides)
    const theirTurn = swapSides(endTurn(played));
    const attacker = armedFor(inPlay("Magneton", { set: "base" }), "Autodestrucción");
    expect(theirTurn.opponentBench[0].pokemon.name).toBe("Abra");
    const attacked = executeAttack(
      { ...theirTurn, playerActivePokemon: attacker, playerBench: [inPlay("Pikachu")] },
      attackIndex(attacker, "Autodestrucción"),
      { coinResults: [], skipEndTurn: true }
    );
    expect(attacked.opponentBench[0].currentDamage ?? 0).toBe(0);
    expect(attacked.playerBench[0].currentDamage).toBe(20);
    expect(attacked.opponentActivePokemon!.currentDamage).toBeGreaterThan(0);
  });

  it("expires after the opponent's next turn", () => {
    const trainer = card("Transparent Walls");
    const played = playTrainerCard(withHand([trainer], { turnNumber: 5, player: { bench: [inPlay("Abra")] } }), trainer.id);
    const back = swapSides(endTurn(swapSides(endTurn(played))));
    expect(back.turnNumber).toBe(7);
    expect(back.benchProtectedUntilTurn?.player).toBeUndefined();
  });
});

describe("Giovanni", () => {
  it("a Giovanni's Pokémon (and what it evolves into) may evolve this turn though just played, Basic → Stage 1 → Stage 2", () => {
    const trainer = card("Giovanni");
    const machop = gc("Giovanni's Machop", { playedOnTurn: 5 });
    const machoke = card("Giovanni's Machoke");
    const machamp = card("Giovanni's Machamp");
    const state = deepFreeze(withHand([trainer, machoke, machamp], { turnNumber: 5, player: { active: machop } }));
    expect(canEvolve(state, machoke.id, machop.pokemon.id)).toMatch(/este turno/);
    expect(optionIds(state, trainer.id)).toEqual([machop.pokemon.id]);
    const played = playTrainerCard(state, trainer.id, [[machop.pokemon.id]]);
    expect(badLines(state, played)).toEqual([]);
    const stage1 = evolvePokemonCard(played, machoke.id, machop.pokemon.id);
    const stage2 = evolvePokemonCard(stage1, machamp.id, machoke.id);
    expect(stage2.playerActivePokemon!.pokemon.name).toBe("Giovanni's Machamp");
  });

  it("ignores the first-turn ban, not on the next turn; needs a Giovanni's Pokémon", () => {
    const trainer = card("Giovanni");
    const machop = gc("Giovanni's Machop", { playedOnTurn: 0 });
    const machoke = card("Giovanni's Machoke");
    const firstTurn = withHand([trainer, machoke], { turnNumber: 1, player: { active: machop } });
    const played = playTrainerCard(firstTurn, trainer.id, [[machop.pokemon.id]]);
    expect(canEvolve(played, machoke.id, machop.pokemon.id)).toBeNull();
    const later = { ...played, turnNumber: 3, playerActivePokemon: { ...played.playerActivePokemon!, playedOnTurn: 3 } };
    expect(canEvolve(later, machoke.id, machop.pokemon.id)).not.toBeNull();
    expect(canPlayTrainerCard(withHand([trainer]), trainer.id)).toMatch(/Giovanni/);
  });
});

describe("Blaine", () => {
  it("attaches 2 Fire Energy cards from the hand to a Blaine's Pokémon as the turn's attachment (Healing Fire heals for each)", () => {
    const trainer = card("Blaine");
    const ninetales = gc("Blaine's Ninetales", { damage: 30 });
    const f1 = energy(Fire);
    const f2 = energy(Fire);
    const f3 = energy(Fire);
    const state = deepFreeze(withHand([trainer, f1, f2, f3, energy(Water)], { player: { active: ninetales } }));
    expect(optionIds(state, trainer.id)).toEqual([ninetales.pokemon.id]);
    const energyStep = getTrainerSteps(state, trainer.id, [[ninetales.pokemon.id]])!;
    expect(energyStep.source).toBe("hand");
    expect(energyStep.options.map((o) => o.id)).toEqual([f1.id, f2.id, f3.id]);
    const next = playTrainerCard(state, trainer.id, [[ninetales.pokemon.id], [f1.id, f3.id]]);
    expect(next.playerActivePokemon!.attachedEnergy.map((e) => e.id)).toEqual([f1.id, f3.id]);
    expect(next.playerActivePokemon!.currentDamage).toBe(10);
    expect(next.energyAttachedThisTurn).toBe(true);
    expect(names(next.playerHand)).toEqual(["Fire Energy", "Water Energy"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("refused after an Energy attachment, without a Blaine's Pokémon or 2 Fire Energy cards", () => {
    const trainer = card("Blaine");
    const vulpix = gc("Blaine's Vulpix");
    const hand = () => [trainer, energy(Fire), energy(Fire)];
    expect(canPlayTrainerCard(withHand(hand(), { player: { active: vulpix }, energyAttachedThisTurn: true }), trainer.id)).toMatch(/Energía/);
    expect(canPlayTrainerCard(withHand(hand()), trainer.id)).toMatch(/Blaine/);
    expect(canPlayTrainerCard(withHand([trainer, energy(Fire)], { player: { active: vulpix } }), trainer.id)).toMatch(/Fuego/);
    expect(() => playTrainerCard(withHand(hand(), { player: { active: vulpix }, energyAttachedThisTurn: true }), trainer.id, [])).toThrow(IllegalActionError);
  });
});
