/**
 * Steps answered by the other player (`chooser: "opponent"`): `title` / `description` speak to
 * the card's player (who waits), `answererTitle` / `answererDescription` to the player who
 * answers; `stepForAnswerer` picks the right wording.
 */
import { describe, it, expect } from "vitest";
import { executeAttack, getTrainerSteps, stepForAnswerer, type GameState, type SelectionStep } from "@/index";
import { makeState, inPlay, gameCard, armedFor, attackIndex } from "./helpers/state";

const H = "heads" as const;

function attack(state: GameState, name: string, coins: ("heads" | "tails")[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}

/** No second-person wording aimed at the card's player in a text for the other player, and vice versa. */
function expectWordedFor(step: SelectionStep) {
  expect(step.answererDescription).toBeTruthy();
  expect(step.answererDescription).not.toEqual(step.description);
}

describe("attack choices the defending player answers", () => {
  it("Terror Strike: the attacker reads that the opponent chooses; the defender is asked to choose from their Bench", () => {
    const state = makeState({
      player: { active: inPlay("Arbok", { set: "fossil" }) },
      opponent: { active: inPlay("Machamp"), bench: [inPlay("Machop"), inPlay("Abra")] },
    });
    const step = attack(state, "Golpe Terrorífico", [H]).pendingAttackChoice!.step;
    expect(step.chooser).toBe("opponent");
    expect(step.description).toBe("Tu rival elige el Pokémon de su Banca que cambia por Machamp");
    expect(step.answererDescription).toBe("Tu rival usó Golpe Terrorífico: elige el Pokémon de tu Banca que cambia por Machamp");
    expect(stepForAnswerer(step).description).toBe(step.answererDescription);
    expect(stepForAnswerer(step).title).toBe(step.title);
  });

  it("Knock Back (Team Rocket) words it the same way", () => {
    const state = makeState({
      player: { active: inPlay("Dark Machoke", { set: "rocket" }) },
      opponent: { active: inPlay("Machamp"), bench: [inPlay("Machop")] },
    });
    const step = attack(state, "Empujón").pendingAttackChoice!.step;
    expectWordedFor(step);
    expect(step.answererDescription).toContain("elige el Pokémon de tu Banca");
  });
});

describe("Challenge!", () => {
  const trainer = () => gameCard("Challenge!", "rocket");

  it("accept/decline: the Trainer's player waits for the answer, the opponent is challenged", () => {
    const card = trainer();
    const state = makeState({ player: { active: inPlay("Machop"), hand: [card] }, opponent: { active: inPlay("Onix") } });
    const step = getTrainerSteps(state, card.id, [])!;
    expect(step.chooser).toBe("opponent");
    expect(step.description).toBe(
      "Tu rival decide si acepta el desafío. Si lo acepta, cada uno pone Pokémon Básicos de su mazo en su Banca; si no, robas 2 cartas"
    );
    expect(step.answererDescription).toBe(
      "Tu rival jugó Challenge!: ¿aceptas el desafío? Si lo aceptas, cada uno pone Pokémon Básicos de su mazo en su Banca; si no, tu rival roba 2 cartas"
    );
  });

  it("the opponent's Basics: worded for each side, also when their Bench is full", () => {
    const card = trainer();
    const deck = [gameCard("Machop"), gameCard("Abra")];
    const state = makeState({ player: { active: inPlay("Machop"), hand: [card] }, opponent: { active: inPlay("Onix"), deck } });
    const theirs = getTrainerSteps(state, card.id, [["accept"], []])!;
    expect(theirs.description).toBe("Tu rival elige los Pokémon Básicos de su mazo que pone en su Banca");
    expect(theirs.answererDescription).toBe("Tu rival jugó Challenge!: elige los Pokémon Básicos de tu mazo que pones en tu Banca");

    const full = makeState({
      player: { active: inPlay("Machop"), hand: [card] },
      opponent: { active: inPlay("Onix"), deck, bench: Array.from({ length: 5 }, () => inPlay("Abra")) },
    });
    const fullStep = getTrainerSteps(full, card.id, [["accept"], []])!;
    expect(fullStep.description).toBe("La Banca de tu rival está llena: no puede poner Pokémon");
    expect(fullStep.answererDescription).toBe("Tu Banca está llena: no puedes poner Pokémon");
  });

  it("the player's own Basics are their own question (no answerer text)", () => {
    const card = trainer();
    const state = makeState({ player: { active: inPlay("Machop"), hand: [card], deck: [gameCard("Abra")] }, opponent: { active: inPlay("Onix") } });
    const mine = getTrainerSteps(state, card.id, [["accept"]])!;
    expect(mine.chooser).toBe("self");
    expect(mine.answererDescription).toBeUndefined();
    expect(stepForAnswerer(mine)).toBe(mine);
  });
});
