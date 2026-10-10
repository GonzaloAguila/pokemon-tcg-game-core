import { describe, it, expect } from "vitest";
import {
  canPlayBasicPokemon,
  playBasicPokemon,
  canAttachEnergy,
  attachEnergyCard,
  canEvolve,
  evolvePokemonCard,
  getEvolutionTargets,
  ENERGY_ATTACH_EFFECTS,
  swapSides,
} from "@/domain/board";
import { isPlayableAsBasic } from "@/domain/cards";
import { IllegalActionError } from "@/shared/errors";
import { executeAIAction } from "@/domain/ai";
import { GamePhase, EnergyType, StatusCondition, ProtectionType } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, deepFreeze, names } from "./helpers/state";

const { Water, Fire, Grass, Lightning } = EnergyType;

describe("isPlayableAsBasic", () => {
  it("is true for Basic Pokémon only (no Trainer is flagged yet)", () => {
    expect(isPlayableAsBasic(gameCard("Pikachu", "base"))).toBe(true);
    expect(isPlayableAsBasic(gameCard("Raichu", "base"))).toBe(false);
    expect(isPlayableAsBasic(gameCard("Bill"))).toBe(false);
    expect(isPlayableAsBasic(gameCard("Clefairy Doll"))).toBe(false);
    expect(isPlayableAsBasic(energy(Fire))).toBe(false);
  });
});

describe("playBasicPokemon", () => {
  it("puts a Basic as Active during setup (played 'before turn 1')", () => {
    const pikachu = gameCard("Pikachu", "base");
    const state = deepFreeze(makeState({ gamePhase: GamePhase.Setup, turnNumber: 0, player: { hand: [pikachu] } }));

    const next = playBasicPokemon(state, pikachu.id, "active");

    expect(next.playerActivePokemon?.pokemon.id).toBe(pikachu.id);
    expect(next.playerActivePokemon?.playedOnTurn).toBe(0);
    expect(next.playerHand).toHaveLength(0);
    expect(next.events.at(-1)?.message).toBe("Colocaste Pikachu como Pokémon activo");
  });

  it("works in the MULLIGAN phase too (multiplayer has no SETUP phase)", () => {
    const pikachu = gameCard("Pikachu", "base");
    const state = makeState({ gamePhase: GamePhase.Mulligan, turnNumber: 0, player: { hand: [pikachu] } });
    expect(canPlayBasicPokemon(state, pikachu.id, "active")).toBeNull();
  });

  it("benches a Basic during the turn, recording the turn it was played", () => {
    const pikachu = gameCard("Pikachu", "base");
    const state = deepFreeze(makeState({ turnNumber: 5, player: { active: inPlay("Machop"), hand: [pikachu] } }));

    const next = playBasicPokemon(state, pikachu.id, "bench");

    expect(next.playerBench.map((p) => p.pokemon.name)).toEqual(["Pikachu"]);
    expect(next.playerBench[0].playedOnTurn).toBe(5);
    expect(next.events.at(-1)?.message).toBe("Colocaste Pikachu en la banca");
  });

  it("refuses illegal placements with a reason, and the action throws", () => {
    const raichu = gameCard("Raichu", "base");
    const pikachu = gameCard("Pikachu", "base");
    const bill = gameCard("Bill");
    const fullBench = ["Machop", "Machop", "Machop", "Machop", "Machop"].map((n) => inPlay(n));
    const playing = makeState({ player: { active: inPlay("Machop"), hand: [raichu, pikachu, bill] } });

    expect(canPlayBasicPokemon(playing, raichu.id, "bench")).toMatch(/básico/i);
    expect(canPlayBasicPokemon(playing, bill.id, "bench")).toMatch(/básico/i);
    expect(canPlayBasicPokemon(playing, "missing", "bench")).toMatch(/mano/);
    // During the game the Active spot is only refilled by promoting from the bench
    expect(canPlayBasicPokemon({ ...playing, playerActivePokemon: null }, pikachu.id, "active")).not.toBeNull();
    expect(canPlayBasicPokemon({ ...playing, playerBench: fullBench }, pikachu.id, "bench")).toMatch(/banca/);
    expect(canPlayBasicPokemon({ ...playing, isPlayerTurn: false }, pikachu.id, "bench")).toMatch(/turno/);

    const setup = makeState({ gamePhase: GamePhase.Setup, turnNumber: 0, player: { hand: [pikachu] } });
    expect(canPlayBasicPokemon(setup, pikachu.id, "bench")).toMatch(/activo/);

    expect(() => playBasicPokemon(playing, raichu.id, "bench")).toThrow(IllegalActionError);
  });
});

describe("attachEnergyCard", () => {
  it("attaches one Energy from hand per turn", () => {
    const fire = energy(Fire);
    const fire2 = energy(Fire);
    const charmander = inPlay("Charmander");
    const state = deepFreeze(makeState({ player: { active: charmander, bench: [inPlay("Vulpix")], hand: [fire, fire2] } }));

    const next = attachEnergyCard(state, fire.id, charmander.pokemon.id);

    expect(names(next.playerActivePokemon!.attachedEnergy)).toEqual(["Fire Energy"]);
    expect(next.energyAttachedThisTurn).toBe(true);
    expect(next.events.at(-1)?.message).toBe("Adjuntaste energía fuego a Charmander");
    expect(canAttachEnergy(next, fire2.id, next.playerBench[0].pokemon.id)).toMatch(/una energía por turno/);
  });

  it("can attach to a benched Pokémon", () => {
    const fire = energy(Fire);
    const vulpix = inPlay("Vulpix");
    const state = makeState({ player: { active: inPlay("Charmander"), bench: [vulpix], hand: [fire] } });

    const next = attachEnergyCard(state, fire.id, vulpix.pokemon.id);
    expect(names(next.playerBench[0].attachedEnergy)).toEqual(["Fire Energy"]);
  });

  it("refuses during setup, non-Energy cards and the opponent's Pokémon", () => {
    const fire = energy(Fire);
    const bill = gameCard("Bill");
    const charmander = inPlay("Charmander");
    const opponentActive = inPlay("Squirtle");
    const state = makeState({ player: { active: charmander, hand: [fire, bill] }, opponent: { active: opponentActive } });

    expect(canAttachEnergy({ ...state, gamePhase: GamePhase.Setup }, fire.id, charmander.pokemon.id)).not.toBeNull();
    expect(canAttachEnergy(state, bill.id, charmander.pokemon.id)).toMatch(/energía/i);
    expect(canAttachEnergy(state, fire.id, opponentActive.pokemon.id)).toMatch(/Pokémon/);
    expect(() => attachEnergyCard(state, bill.id, charmander.pokemon.id)).toThrow(IllegalActionError);
  });

  it("Rain Dance: extra Water Energy to Water Pokémon does not use the attachment for the turn", () => {
    const water1 = energy(Water);
    const water2 = energy(Water);
    const fire = energy(Fire);
    const squirtle = inPlay("Squirtle");
    const state = makeState({ player: { active: squirtle, bench: [inPlay("Blastoise", { evolvedFrom: ["Squirtle", "Wartortle"] })], hand: [water1, water2, fire] } });

    const first = attachEnergyCard(state, water1.id, squirtle.pokemon.id);
    expect(first.energyAttachedThisTurn).toBe(false);
    const second = attachEnergyCard(first, water2.id, squirtle.pokemon.id);
    expect(second.playerActivePokemon!.attachedEnergy).toHaveLength(2);
    expect(second.energyAttachedThisTurn).toBe(false);
    expect(second.events.at(-1)?.message).toContain("Rain Dance");
    // The normal attachment is still available for a non-Water Energy
    expect(canAttachEnergy(second, fire.id, squirtle.pokemon.id)).toBeNull();
  });

  it("Rain Dance does not work while Blastoise is Asleep", () => {
    const water1 = energy(Water);
    const water2 = energy(Water);
    const squirtle = inPlay("Squirtle");
    const blastoise = inPlay("Blastoise", { statuses: [StatusCondition.Asleep] });
    const state = makeState({ player: { active: blastoise, bench: [squirtle], hand: [water1, water2] } });

    const first = attachEnergyCard(state, water1.id, squirtle.pokemon.id);
    expect(first.energyAttachedThisTurn).toBe(true);
    expect(canAttachEnergy(first, water2.id, squirtle.pokemon.id)).not.toBeNull();
  });

  it("runs the on-attach-from-hand hook of special energies", () => {
    const dce = energy(EnergyType.Colorless);
    const pikachu = inPlay("Pikachu", { set: "base", damage: 20 });
    const state = makeState({ player: { active: pikachu, hand: [dce] } });
    ENERGY_ATTACH_EFFECTS["Double Colorless Energy"] = (s) => ({ ...s, turnNumber: 99 });
    try {
      expect(attachEnergyCard(state, dce.id, pikachu.pokemon.id).turnNumber).toBe(99);
    } finally {
      delete ENERGY_ATTACH_EFFECTS["Double Colorless Energy"];
    }
  });
});

describe("evolvePokemonCard", () => {
  const evolveSetup = (turnNumber: number, playedOnTurn = 0) => {
    const charmeleon = gameCard("Charmeleon");
    const charmander = inPlay("Charmander", {
      damage: 30,
      energy: [Fire, Fire],
      playedOnTurn,
      statuses: [StatusCondition.Poisoned, StatusCondition.Confused],
      poisonDamage: 20,
      protection: { type: ProtectionType.DamageOnly, expiresAfterTurn: turnNumber + 1 },
      retreatPrevented: true,
      retreatPreventedOnTurn: turnNumber - 1,
      mustFlipToAttack: true,
      mustFlipToAttackTurn: turnNumber - 1,
      nextTurnDamageReduction: 20,
      nextTurnEffectAppliedOnTurn: turnNumber - 1,
    });
    const state = makeState({ turnNumber, player: { active: charmander, hand: [charmeleon] } });
    return { state, charmeleon, charmander };
  };

  it("can't evolve on either player's first turn (turns 1 and 2)", () => {
    for (const turn of [1, 2]) {
      const { state, charmeleon, charmander } = evolveSetup(turn);
      expect(canEvolve(state, charmeleon.id, charmander.pokemon.id)).toMatch(/primer turno/);
    }
  });

  it("can't evolve a Pokémon played (or evolved) this turn", () => {
    const { state, charmeleon, charmander } = evolveSetup(5, 5);
    expect(canEvolve(state, charmeleon.id, charmander.pokemon.id)).toMatch(/este turno/);
    expect(getEvolutionTargets(state, charmeleon.id)).toEqual([]);
  });

  it("refuses a card that doesn't evolve from the target", () => {
    const { state, charmander } = evolveSetup(5);
    const raichu = gameCard("Raichu");
    const withRaichu = { ...state, playerHand: [raichu] };
    expect(canEvolve(withRaichu, raichu.id, charmander.pokemon.id)).not.toBeNull();
    expect(() => evolvePokemonCard(withRaichu, raichu.id, charmander.pokemon.id)).toThrow(IllegalActionError);
  });

  it("evolves: keeps damage and Energy, removes special conditions and attack effects", () => {
    const { state, charmeleon, charmander } = evolveSetup(5);
    deepFreeze(state);

    const next = evolvePokemonCard(state, charmeleon.id, charmander.pokemon.id);
    const evolved = next.playerActivePokemon!;

    expect(evolved.pokemon.id).toBe(charmeleon.id);
    expect(names(evolved.previousEvolutions!)).toEqual(["Charmander"]);
    expect(evolved.currentDamage).toBe(30);
    expect(evolved.attachedEnergy).toHaveLength(2);
    expect(evolved.statusConditions).toEqual([]);
    expect(evolved.poisonDamage).toBeUndefined();
    expect(evolved.protection).toBeUndefined();
    expect(evolved.retreatPrevented).toBeUndefined();
    expect(evolved.mustFlipToAttack).toBeUndefined();
    expect(evolved.nextTurnDamageReduction).toBeUndefined();
    expect(evolved.playedOnTurn).toBe(5);
    expect(next.playerHand).toHaveLength(0);
    expect(next.events.at(-1)?.message).toBe("Charmander evolucionó a Charmeleon");
  });

  it("evolves a benched Pokémon and lists valid targets by id", () => {
    const pikachu = inPlay("Pikachu", { set: "base" });
    const raichu = gameCard("Raichu");
    const state = makeState({ turnNumber: 4, player: { active: inPlay("Machop"), bench: [inPlay("Pikachu", { set: "jungle", playedOnTurn: 4 }), pikachu], hand: [raichu] } });

    expect(getEvolutionTargets(state, raichu.id)).toEqual([pikachu.pokemon.id]);
    const next = evolvePokemonCard(state, raichu.id, pikachu.pokemon.id);
    expect(next.playerBench[1].pokemon.name).toBe("Raichu");
    expect(next.playerBench[0].pokemon.name).toBe("Pikachu");
  });
});

describe("swapSides", () => {
  it("swaps zones, flags, turn ownership, modifiers' owner, starting player and result; twice is identity", () => {
    const state = makeState({
      player: { active: inPlay("Pikachu", { set: "base" }), hand: [energy(Lightning)] },
      opponent: { active: inPlay("Bulbasaur"), hand: [energy(Grass)] },
      playerCanTakePrize: true,
      startingPlayer: "player",
      gameResult: "victory",
    });
    const swapped = swapSides(state);

    expect(swapped.playerActivePokemon?.pokemon.name).toBe("Bulbasaur");
    expect(swapped.opponentHand[0].name).toBe("Lightning Energy");
    expect(swapped.opponentCanTakePrize).toBe(true);
    expect(swapped.isPlayerTurn).toBe(false);
    expect(swapped.startingPlayer).toBe("opponent");
    expect(swapped.gameResult).toBe("defeat");
    expect(swapSides(swapped)).toEqual(state);
  });
});

describe("AI board actions go through the engine", () => {
  it("benches and attaches for the opponent side with log lines from the human's view", () => {
    const pikachu = gameCard("Pikachu", "base");
    const lightning = energy(Lightning);
    const opponentActive = inPlay("Electabuzz");
    const state = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Machop") },
      opponent: { active: opponentActive, hand: [pikachu, lightning] },
    });

    const benched = executeAIAction(state, { type: "playBasicToBench", cardId: pikachu.id, benchIndex: 0 });
    expect(benched.opponentBench.map((p) => p.pokemon.name)).toEqual(["Pikachu"]);
    expect(benched.events.at(-1)?.message).toBe("Rival colocó Pikachu en la banca");

    const attached = executeAIAction(benched, {
      type: "attachEnergy",
      energyCardId: lightning.id,
      targetPokemonId: opponentActive.pokemon.id,
      isBench: false,
    });
    expect(attached.opponentActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(attached.energyAttachedThisTurn).toBe(true);
    expect(attached.events.at(-1)?.message).toBe("Rival adjuntó energía eléctrica a Electabuzz");
  });

  it("the AI can't evolve on its first turn even when the human started (turn 2)", () => {
    const raichu = gameCard("Raichu");
    const state = makeState({
      turnNumber: 2,
      isPlayerTurn: false,
      startingPlayer: "player",
      player: { active: inPlay("Machop") },
      opponent: { active: inPlay("Pikachu", { set: "base", playedOnTurn: 0 }), hand: [raichu] },
    });

    const next = executeAIAction(state, { type: "evolve", evolutionCardId: raichu.id, targetIndex: -1 });
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Pikachu");
  });
});
