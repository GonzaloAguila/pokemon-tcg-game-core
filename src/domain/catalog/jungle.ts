/**
 * Jungle card catalog - 64 cards
 */

import {
  Card,
  createPokemonCard,
  createTrainerCard,
  makeCardId,
} from "@/domain/cards";

import {
  EnergyType,
  CardSet,
  CardRarity,
  PokemonStage,
  TrainerType,
  AttackEffectType,
  StatusCondition,
  AttackTarget,
  ProtectionType,
  BenchDamageTarget,
  PokemonPowerType,
} from "@/domain/constants";

const SET: CardSet = CardSet.Jungle;

export const jungleCards: Card[] = [
  // Cards 1-16 (Rare Holo)
  createPokemonCard({
    id: makeCardId(SET, 1, "Clefable"),
    name: "Clefable",
    number: 1,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Colorless],
    evolvesFrom: "Clefairy",
    attacks: [
      {
        name: "Metrónomo",
        cost: [EnergyType.Colorless],
        text: "Elige 1 de los ataques del Pokémon Defensor. Metrónomo copia ese ataque excepto sus costos de Energía.",
        effects: [
          {
            type: AttackEffectType.CopyAttack,
            target: AttackTarget.Defender,
          },
        ],
      },
      {
        name: "Minimizar",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        text: "Todo daño hecho por ataques a Clefable durante el próximo turno de tu rival se reduce en 20 (después de aplicar Debilidad y Resistencia).",
        effects: [
          {
            type: AttackEffectType.ReduceDamage,
            target: AttackTarget.Self,
            amount: 20,
          },
        ],
      },
    ],
    retreatCost: 2,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 2, "Electrode"),
    name: "Electrode",
    number: 2,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage1,
    hp: 90,
    types: [EnergyType.Lightning],
    evolvesFrom: "Voltorb",
    attacks: [
      {
        name: "Placaje",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
      },
      {
        name: "Rayo Cadena",
        cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning],
        damage: 20,
        text: "Si el Pokémon Defensor no es Incoloro, este ataque hace 10 puntos de daño a cada Pokémon en Banca del mismo tipo que el Pokémon Defensor (de ambos jugadores).",
        effects: [
          {
            type: AttackEffectType.BenchDamage,
            target: AttackTarget.Defender,
            amount: 10,
            benchTarget: BenchDamageTarget.Both,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 3, "Flareon"),
    name: "Flareon",
    number: 3,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Fire],
    evolvesFrom: "Eevee",
    attacks: [
      {
        name: "Ataque Rápido",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, este ataque hace 10 puntos de daño más 20 puntos de daño adicionales.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Lanzallamas",
        cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Colorless, EnergyType.Colorless],
        damage: 60,
        text: "Descarta 1 carta de Energía de Fuego adjunta a Flareon para poder usar este ataque.",
        effects: [
          {
            type: AttackEffectType.Discard,
            target: AttackTarget.Self,
            discardCostRequirement: [EnergyType.Fire],
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Water],
  }),
  createPokemonCard({
    id: makeCardId(SET, 4, "Jolteon"),
    name: "Jolteon",
    number: 4,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Lightning],
    evolvesFrom: "Eevee",
    attacks: [
      {
        name: "Ataque Rápido",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, este ataque hace 10 puntos de daño más 20 puntos de daño adicionales.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Misil Aguja",
        cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Colorless],
        text: "Lanza 4 monedas. Este ataque hace 20 puntos de daño multiplicado por la cantidad de caras.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 4,
              onHeads: "damage",
            },
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 5, "Kangaskhan"),
    name: "Kangaskhan",
    number: 5,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Basic,
    hp: 90,
    types: [EnergyType.Colorless],
    attacks: [
      {
        name: "Buscar",
        cost: [EnergyType.Colorless],
        text: "Roba 1 carta.",
        effects: [
          {
            type: AttackEffectType.Draw,
            target: AttackTarget.Self,
            amount: 1,
          },
        ],
      },
      {
        name: "Puño Cometa",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        text: "Lanza 4 monedas. Este ataque hace 20 puntos de daño multiplicado por la cantidad de caras.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 4,
              onHeads: "damage",
            },
          },
        ],
      },
    ],
    retreatCost: 3,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 6, "Mr. Mime"),
    name: "Mr. Mime",
    number: 6,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Basic,
    hp: 40,
    types: [EnergyType.Psychic],
    power: {
      name: "Invisible Wall",
      text: "Siempre que un ataque (incluyendo el tuyo) haga 30 o más puntos de daño a Mr. Mime (después de aplicar Debilidad y Resistencia), previene ese daño. Este poder no puede usarse si Mr. Mime está Dormido, Confundido o Paralizado.",
      type: PokemonPowerType.DamageBarrier,
      worksFromBench: false,
    },
    attacks: [
      {
        name: "Meditar",
        cost: [EnergyType.Psychic, EnergyType.Colorless],
        damage: 10,
        text: "Hace 10 puntos de daño más 10 puntos de daño adicionales por cada contador de daño en el Pokémon Defensor.",
        effects: [
          {
            type: AttackEffectType.DamagePerCounter,
            target: AttackTarget.Defender,
            amount: 10,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 7, "Nidoqueen"),
    name: "Nidoqueen",
    number: 7,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage2,
    hp: 90,
    types: [EnergyType.Grass],
    evolvesFrom: "Nidorina",
    attacks: [
      {
        name: "Novios",
        cost: [EnergyType.Grass, EnergyType.Colorless],
        damage: 20,
        text: "Hace 20 puntos de daño más 20 puntos de daño adicionales por cada Nidoking que tengas en juego.",
        effects: [
          {
            type: AttackEffectType.BonusDamage,
            target: AttackTarget.Defender,
            amount: 20,
          },
        ],
      },
      {
        name: "Mega Puño",
        cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Colorless, EnergyType.Colorless],
        damage: 50,
      },
    ],
    retreatCost: 3,
    weaknesses: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 8, "Pidgeot"),
    name: "Pidgeot",
    number: 8,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage2,
    hp: 80,
    types: [EnergyType.Colorless],
    evolvesFrom: "Pidgeotto",
    attacks: [
      {
        name: "Ataque Ala",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
      },
      {
        name: "Huracán",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 30,
        text: "A menos que este ataque Noquee al Pokémon Defensor, devuelve al Pokémon Defensor y todas las cartas adjuntas a la mano de tu rival.",
        effects: [
          {
            type: AttackEffectType.ForceSwitch,
            target: AttackTarget.Defender,
          },
        ],
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Lightning],
    resistances: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 9, "Pinsir"),
    name: "Pinsir",
    number: 9,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Basic,
    hp: 60,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Agarre Férreo",
        cost: [EnergyType.Grass, EnergyType.Grass],
        damage: 20,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Paralizado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Paralyzed,
            },
          },
        ],
      },
      {
        name: "Guillotina",
        cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Colorless, EnergyType.Colorless],
        damage: 50,
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 10, "Scyther"),
    name: "Scyther",
    number: 10,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Basic,
    hp: 70,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Danza Espada",
        cost: [EnergyType.Grass],
        text: "Durante tu próximo turno, el daño base de Corte de Scyther es 60 en lugar de 30.",
        effects: [
          {
            type: AttackEffectType.BonusDamage,
            target: AttackTarget.Self,
            amount: 30,
          },
        ],
      },
      {
        name: "Corte",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 30,
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Fire],
    resistances: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 11, "Snorlax"),
    name: "Snorlax",
    number: 11,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Basic,
    hp: 90,
    types: [EnergyType.Colorless],
    power: {
      name: "Thick Skinned",
      text: "Snorlax no puede quedar Dormido, Confundido, Paralizado ni Envenenado. Este poder no puede usarse si Snorlax ya está Dormido, Confundido o Paralizado.",
      type: PokemonPowerType.StatusImmunity,
      worksFromBench: false,
    },
    attacks: [
      {
        name: "Golpe Cuerpo",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 30,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Paralizado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Paralyzed,
            },
          },
        ],
      },
    ],
    retreatCost: 4,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 12, "Vaporeon"),
    name: "Vaporeon",
    number: 12,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage1,
    hp: 80,
    types: [EnergyType.Water],
    evolvesFrom: "Eevee",
    attacks: [
      {
        name: "Ataque Rápido",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, este ataque hace 10 puntos de daño más 20 puntos de daño adicionales.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Pistola de Agua",
        cost: [EnergyType.Water, EnergyType.Water, EnergyType.Colorless],
        damage: 30,
        text: "Hace 30 puntos de daño más 10 puntos de daño adicionales por cada Energía de Agua adjunta a Vaporeon que no se haya usado para pagar el costo de este ataque. La Energía de Agua extra después de la segunda no cuenta.",
        effects: [
          {
            type: AttackEffectType.ExtraEnergy,
            target: null,
            extraDamagePerEnergy: 10,
            maxExtraEnergy: 2,
            extraEnergyType: EnergyType.Water,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Lightning],
  }),
  createPokemonCard({
    id: makeCardId(SET, 13, "Venomoth"),
    name: "Venomoth",
    number: 13,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Grass],
    evolvesFrom: "Venonat",
    power: {
      name: "Shift",
      text: "Una vez durante tu turno (antes de tu ataque), puedes cambiar el tipo de Venomoth al tipo de cualquier otro Pokémon en juego que no sea Incoloro. Este poder no puede usarse si Venomoth está Dormido, Confundido o Paralizado.",
      type: PokemonPowerType.TypeShift,
      worksFromBench: false,
    },
    attacks: [
      {
        name: "Polvo Veneno",
        cost: [EnergyType.Grass, EnergyType.Grass],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Confundido y Envenenado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Confused,
            },
          },
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Poisoned,
            },
          },
        ],
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Fire],
    resistances: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 14, "Victreebel"),
    name: "Victreebel",
    number: 14,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage2,
    hp: 80,
    types: [EnergyType.Grass],
    evolvesFrom: "Weepinbell",
    attacks: [
      {
        name: "Señuelo",
        cost: [EnergyType.Grass],
        text: "Si tu rival tiene algún Pokémon en la Banca, elige 1 de ellos y cámbialo con el Pokémon Defensor.",
        effects: [
          {
            type: AttackEffectType.ForceSwitch,
            target: AttackTarget.Defender,
          },
        ],
      },
      {
        name: "Ácido",
        cost: [EnergyType.Grass, EnergyType.Grass],
        damage: 20,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor no puede Retirarse durante el próximo turno de tu rival.",
      },
    ],
    retreatCost: 2,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 15, "Vileplume"),
    name: "Vileplume",
    number: 15,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage2,
    hp: 80,
    types: [EnergyType.Grass],
    evolvesFrom: "Gloom",
    power: {
      name: "Heal",
      text: "Una vez durante tu turno (antes de tu ataque), puedes lanzar una moneda. Si sale cara, retira 1 contador de daño de 1 de tus Pokémon. Este poder no puede usarse si Vileplume está Dormido, Confundido o Paralizado.",
      type: PokemonPowerType.HealFlip,
      worksFromBench: false,
    },
    attacks: [
      {
        name: "Danza Pétalo",
        cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Grass],
        text: "Lanza 3 monedas. Este ataque hace 40 puntos de daño multiplicado por la cantidad de caras. Vileplume queda Confundido (después de hacer daño).",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 40,
            coinFlip: {
              count: 3,
              onHeads: "damage",
            },
          },
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Self,
            status: StatusCondition.Confused,
          },
        ],
      },
    ],
    retreatCost: 2,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 16, "Wigglytuff"),
    name: "Wigglytuff",
    number: 16,
    set: SET,
    rarity: CardRarity.RareHolo,
    stage: PokemonStage.Stage1,
    hp: 80,
    types: [EnergyType.Colorless],
    evolvesFrom: "Jigglypuff",
    attacks: [
      {
        name: "Nana",
        cost: [EnergyType.Colorless],
        text: "El Pokémon Defensor queda Dormido.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            status: StatusCondition.Asleep,
          },
        ],
      },
      {
        name: "Haz la Ola",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 10,
        text: "Hace 10 puntos de daño más 10 puntos de daño adicionales por cada Pokémon que tengas en tu Banca.",
        effects: [
          {
            type: AttackEffectType.BonusDamage,
            target: AttackTarget.Defender,
            amount: 10,
          },
        ],
      },
    ],
    retreatCost: 2,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  // Cards 33-48 (Uncommon)
  createPokemonCard({
    id: makeCardId(SET, 33, "Butterfree"),
    name: "Butterfree",
    number: 33,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage2,
    hp: 70,
    types: [EnergyType.Grass],
    evolvesFrom: "Metapod",
    attacks: [
      {
        name: "Whirlwind",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
        text: "Si tu rival tiene algún Pokémon en la Banca, elige 1 de ellos y cámbialo con el Pokémon Defensor.",
        effects: [
          {
            type: AttackEffectType.ForceSwitch,
            target: AttackTarget.Defender,
          },
        ],
      },
      {
        name: "Mega Drain",
        cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Grass, EnergyType.Grass],
        damage: 40,
        text: "Retira de Butterfree una cantidad de contadores de daño igual a la mitad del daño hecho al Pokémon Defensor (después de aplicar Debilidad y Resistencia).",
        effects: [
          {
            type: AttackEffectType.Heal,
            target: AttackTarget.Self,
            amount: 20,
          },
        ],
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Fire],
    resistances: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 34, "Dodrio"),
    name: "Dodrio",
    number: 34,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Colorless],
    evolvesFrom: "Doduo",
    power: {
      name: "Retreat Aid",
      text: "Mientras Dodrio esté en la Banca, paga 1 Incoloro menos para Retirar a tu Pokémon Activo.",
      type: PokemonPowerType.RetreatReduction,
      worksFromBench: true,
    },
    attacks: [
      {
        name: "Rage",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 10,
        text: "Hace 10 puntos de daño más 10 puntos de daño adicionales por cada contador de daño en Dodrio.",
        effects: [
          {
            type: AttackEffectType.DamagePerCounter,
            target: AttackTarget.Self,
            amount: 10,
          },
        ],
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Lightning],
    resistances: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 35, "Exeggutor"),
    name: "Exeggutor",
    number: 35,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 80,
    types: [EnergyType.Grass],
    evolvesFrom: "Exeggcute",
    attacks: [
      {
        name: "Teleport",
        cost: [EnergyType.Psychic],
        text: "Cambia a Exeggutor con 1 de tus Pokémon en Banca.",
        effects: [
          {
            type: AttackEffectType.SelfSwitch,
            target: AttackTarget.Self,
          },
        ],
      },
      {
        name: "Big Eggsplosion",
        cost: [EnergyType.Colorless],
        damage: "20x",
        text: "Lanza una cantidad de monedas igual al número de Energías adjuntas a Exeggutor. Este ataque hace 20 puntos de daño multiplicado por la cantidad de caras.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
    ],
    retreatCost: 3,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 36, "Fearow"),
    name: "Fearow",
    number: 36,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Colorless],
    evolvesFrom: "Spearow",
    attacks: [
      {
        name: "Agility",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
        text: "Lanza una moneda. Si sale cara, durante el próximo turno de tu rival, previene todos los efectos de ataques, incluyendo daño, hechos a Fearow.",
        effects: [
          {
            type: AttackEffectType.Protection,
            target: AttackTarget.Self,
            coinFlip: {
              count: 1,
              onHeads: "protection",
            },
            protectionType: ProtectionType.DamageAndEffects,
          },
        ],
      },
      {
        name: "Drill Peck",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 40,
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Lightning],
    resistances: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 37, "Gloom"),
    name: "Gloom",
    number: 37,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 60,
    types: [EnergyType.Grass],
    evolvesFrom: "Oddish",
    attacks: [
      {
        name: "Poisonpowder",
        cost: [EnergyType.Grass],
        text: "El Pokémon Defensor queda Envenenado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            status: StatusCondition.Poisoned,
          },
        ],
      },
      {
        name: "Foul Odor",
        cost: [EnergyType.Grass, EnergyType.Grass],
        damage: 20,
        text: "Tanto el Pokémon Defensor como Gloom quedan Confundidos (después de hacer daño).",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            status: StatusCondition.Confused,
          },
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Self,
            status: StatusCondition.Confused,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 38, "Lickitung"),
    name: "Lickitung",
    number: 38,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Basic,
    hp: 90,
    types: [EnergyType.Colorless],
    attacks: [
      {
        name: "Tongue Wrap",
        cost: [EnergyType.Colorless],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Paralizado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Paralyzed,
            },
          },
        ],
      },
      {
        name: "Supersonic",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Confundido.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Confused,
            },
          },
        ],
      },
    ],
    retreatCost: 3,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 39, "Marowak"),
    name: "Marowak",
    number: 39,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 60,
    types: [EnergyType.Fighting],
    evolvesFrom: "Cubone",
    attacks: [
      {
        name: "Bonemerang",
        cost: [EnergyType.Fighting, EnergyType.Fighting],
        damage: "30x",
        text: "Lanza 2 monedas. Este ataque hace 30 puntos de daño multiplicado por la cantidad de caras.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 30,
            coinFlip: {
              count: 2,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Call for Friend",
        cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Colorless],
        text: "Busca en tu mazo un Pokémon Básico de tipo Lucha y ponlo en tu Banca. Baraja tu mazo después. (No puedes usar este ataque si tu Banca está llena.)",
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Grass],
    resistances: [EnergyType.Lightning],
  }),
  createPokemonCard({
    id: makeCardId(SET, 40, "Nidorina"),
    name: "Nidorina",
    number: 40,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Grass],
    evolvesFrom: "Nidoran♀",
    attacks: [
      {
        name: "Supersonic",
        cost: [EnergyType.Grass],
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Confundido.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Confused,
            },
          },
        ],
      },
      {
        name: "Double Kick",
        cost: [EnergyType.Grass, EnergyType.Colorless, EnergyType.Colorless],
        damage: "30x",
        text: "Lanza 2 monedas. Este ataque hace 30 puntos de daño multiplicado por la cantidad de caras.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 30,
            coinFlip: {
              count: 2,
              onHeads: "damage",
            },
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 41, "Parasect"),
    name: "Parasect",
    number: 41,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 60,
    types: [EnergyType.Grass],
    evolvesFrom: "Paras",
    attacks: [
      {
        name: "Spore",
        cost: [EnergyType.Grass, EnergyType.Grass],
        text: "El Pokémon Defensor queda Dormido.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            status: StatusCondition.Asleep,
          },
        ],
      },
      {
        name: "Slash",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 30,
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 42, "Persian"),
    name: "Persian",
    number: 42,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Colorless],
    evolvesFrom: "Meowth",
    attacks: [
      {
        name: "Scratch",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
      },
      {
        name: "Pounce",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 30,
        text: "Si el Pokémon Defensor ataca a Persian durante el próximo turno de tu rival, el daño hecho se reduce en 10 (después de aplicar Debilidad y Resistencia).",
        effects: [
          {
            type: AttackEffectType.ReduceDamage,
            target: AttackTarget.Self,
            amount: 10,
          },
        ],
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 43, "Primeape"),
    name: "Primeape",
    number: 43,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Fighting],
    evolvesFrom: "Mankey",
    attacks: [
      {
        name: "Fury Swipes",
        cost: [EnergyType.Fighting, EnergyType.Fighting],
        damage: "20x",
        text: "Lanza 3 monedas. Este ataque hace 20 puntos de daño multiplicado por la cantidad de caras.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 3,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Tantrum",
        cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Colorless],
        damage: 50,
        text: "Lanza una moneda. Si sale cruz, Primeape queda Confundido (después de hacer daño).",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Self,
            coinFlip: {
              count: 1,
              onTails: StatusCondition.Confused,
            },
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 44, "Rapidash"),
    name: "Rapidash",
    number: 44,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Fire],
    evolvesFrom: "Ponyta",
    attacks: [
      {
        name: "Stomp",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
        text: "Lanza una moneda. Si sale cara, este ataque hace 20 puntos de daño más 10 puntos de daño adicionales.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 10,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Agility",
        cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Colorless],
        damage: 30,
        text: "Lanza una moneda. Si sale cara, durante el próximo turno de tu rival, previene todos los efectos de ataques, incluyendo daño, hechos a Rapidash.",
        effects: [
          {
            type: AttackEffectType.Protection,
            target: AttackTarget.Self,
            coinFlip: {
              count: 1,
              onHeads: "protection",
            },
            protectionType: ProtectionType.DamageAndEffects,
          },
        ],
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Water],
  }),
  createPokemonCard({
    id: makeCardId(SET, 45, "Rhydon"),
    name: "Rhydon",
    number: 45,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 100,
    types: [EnergyType.Fighting],
    evolvesFrom: "Rhyhorn",
    attacks: [
      {
        name: "Horn Attack",
        cost: [EnergyType.Fighting, EnergyType.Colorless, EnergyType.Colorless],
        damage: 30,
      },
      {
        name: "Ram",
        cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting],
        damage: 50,
        text: "Rhydon se hace 20 puntos de daño a sí mismo. Si tu rival tiene algún Pokémon en la Banca, elige 1 de ellos y cámbialo con el Pokémon Defensor. (Haz el daño antes de cambiar el Pokémon.)",
        effects: [
          {
            type: AttackEffectType.SelfDamage,
            target: AttackTarget.Self,
            amount: 20,
          },
          {
            type: AttackEffectType.ForceSwitch,
            target: AttackTarget.Defender,
          },
        ],
      },
    ],
    retreatCost: 3,
    weaknesses: [EnergyType.Grass],
    resistances: [EnergyType.Lightning],
  }),
  createPokemonCard({
    id: makeCardId(SET, 46, "Seaking"),
    name: "Seaking",
    number: 46,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Water],
    evolvesFrom: "Goldeen",
    attacks: [
      {
        name: "Horn Attack",
        cost: [EnergyType.Water],
        damage: 10,
      },
      {
        name: "Waterfall",
        cost: [EnergyType.Water, EnergyType.Colorless],
        damage: 30,
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Lightning],
  }),
  createPokemonCard({
    id: makeCardId(SET, 47, "Tauros"),
    name: "Tauros",
    number: 47,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Basic,
    hp: 60,
    types: [EnergyType.Colorless],
    attacks: [
      {
        name: "Stomp",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
        text: "Lanza una moneda. Si sale cara, este ataque hace 20 puntos de daño más 10 puntos de daño adicionales.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 10,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Rampage",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
        text: "Hace 20 puntos de daño más 10 puntos de daño adicionales por cada contador de daño en Tauros. Lanza una moneda. Si sale cruz, Tauros queda Confundido.",
        effects: [
          {
            type: AttackEffectType.DamagePerCounter,
            target: AttackTarget.Self,
            amount: 10,
          },
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Self,
            coinFlip: {
              count: 1,
              onTails: StatusCondition.Confused,
            },
          },
        ],
      },
    ],
    retreatCost: 2,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 48, "Weepinbell"),
    name: "Weepinbell",
    number: 48,
    set: SET,
    rarity: CardRarity.Uncommon,
    stage: PokemonStage.Stage1,
    hp: 70,
    types: [EnergyType.Grass],
    evolvesFrom: "Bellsprout",
    attacks: [
      {
        name: "Poisonpowder",
        cost: [EnergyType.Grass],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Envenenado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Poisoned,
            },
          },
        ],
      },
      {
        name: "Razor Leaf",
        cost: [EnergyType.Grass, EnergyType.Grass],
        damage: 30,
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  // Cards 49-63 (Common)
  createPokemonCard({
    id: makeCardId(SET, 49, "Bellsprout"),
    name: "Bellsprout",
    number: 49,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 40,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Vine Whip",
        cost: [EnergyType.Grass],
        damage: 10,
      },
      {
        name: "Call for Family",
        cost: [EnergyType.Grass],
        text: "Busca en tu mazo un Pokémon Básico llamado Bellsprout y ponlo en tu Banca. Baraja tu mazo después. (No puedes usar este ataque si tu Banca está llena.)",
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 50, "Cubone"),
    name: "Cubone",
    number: 50,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 40,
    types: [EnergyType.Fighting],
    attacks: [
      {
        name: "Snivel",
        cost: [EnergyType.Colorless],
        text: "Si el Pokémon Defensor ataca a Cubone durante el próximo turno de tu rival, el daño hecho se reduce en 20.",
        effects: [
          {
            type: AttackEffectType.ReduceDamage,
            target: AttackTarget.Self,
            amount: 20,
          },
        ],
      },
      {
        name: "Rage",
        cost: [EnergyType.Fighting, EnergyType.Fighting],
        damage: 10,
        text: "Hace 10 puntos de daño más 10 puntos de daño adicionales por cada contador de daño en Cubone.",
        effects: [
          {
            type: AttackEffectType.DamagePerCounter,
            target: AttackTarget.Self,
            amount: 10,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Grass],
    resistances: [EnergyType.Lightning],
  }),
  createPokemonCard({
    id: makeCardId(SET, 51, "Eevee"),
    name: "Eevee",
    number: 51,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 50,
    types: [EnergyType.Colorless],
    attacks: [
      {
        name: "Tail Wag",
        cost: [EnergyType.Colorless],
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor no puede atacar a Eevee durante el próximo turno de tu rival. (Poner en Banca o evolucionar a cualquiera de los dos Pokémon termina este efecto.)",
        effects: [
          {
            type: AttackEffectType.Protection,
            target: AttackTarget.Self,
            coinFlip: {
              count: 1,
              onHeads: "protection",
            },
            protectionType: ProtectionType.DamageAndEffects,
          },
        ],
      },
      {
        name: "Quick Attack",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, este ataque hace 10 puntos de daño más 20 puntos de daño adicionales.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 20,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 52, "Exeggcute"),
    name: "Exeggcute",
    number: 52,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 50,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Hypnosis",
        cost: [EnergyType.Psychic],
        text: "El Pokémon Defensor queda Dormido.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            status: StatusCondition.Asleep,
          },
        ],
      },
      {
        name: "Leech Seed",
        cost: [EnergyType.Grass, EnergyType.Grass],
        damage: 20,
        text: "A menos que todo el daño de este ataque sea prevenido, puedes retirar 1 contador de daño de Exeggcute.",
        effects: [
          {
            type: AttackEffectType.Heal,
            target: AttackTarget.Self,
            amount: 10,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 53, "Goldeen"),
    name: "Goldeen",
    number: 53,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 40,
    types: [EnergyType.Water],
    attacks: [
      {
        name: "Horn Attack",
        cost: [EnergyType.Water],
        damage: 10,
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Lightning],
  }),
  createPokemonCard({
    id: makeCardId(SET, 54, "Jigglypuff"),
    name: "Jigglypuff",
    number: 54,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 60,
    types: [EnergyType.Colorless],
    attacks: [
      {
        name: "Lullaby",
        cost: [EnergyType.Colorless],
        text: "El Pokémon Defensor queda Dormido.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            status: StatusCondition.Asleep,
          },
        ],
      },
      {
        name: "Pound",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 55, "Mankey"),
    name: "Mankey",
    number: 55,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 30,
    types: [EnergyType.Fighting],
    power: {
      name: "Peek",
      text: "Una vez durante tu turno (antes de tu ataque), puedes mirar una de las siguientes: la carta superior del mazo de cualquier jugador, una carta aleatoria de la mano de tu rival, o uno de los Premios de cualquier jugador. Este poder no puede usarse si Mankey está Dormido, Confundido o Paralizado.",
      type: PokemonPowerType.Peek,
      worksFromBench: false,
    },
    attacks: [
      {
        name: "Scratch",
        cost: [EnergyType.Colorless],
        damage: 10,
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 56, "Meowth"),
    name: "Meowth",
    number: 56,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 50,
    types: [EnergyType.Colorless],
    attacks: [
      {
        name: "Pay Day",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, roba 1 carta.",
        effects: [
          {
            type: AttackEffectType.Draw,
            target: AttackTarget.Self,
            amount: 1,
            coinFlip: {
              count: 1,
              onHeads: "damage",
            },
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fighting],
    resistances: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 57, "Nidoran♀"),
    name: "Nidoran♀",
    number: 57,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 60,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Fury Swipes",
        cost: [EnergyType.Grass],
        damage: "10x",
        text: "Lanza 3 monedas. Este ataque hace 10 puntos de daño multiplicado por la cantidad de caras.",
        effects: [
          {
            type: AttackEffectType.CoinFlipDamage,
            target: AttackTarget.Defender,
            amount: 10,
            coinFlip: {
              count: 3,
              onHeads: "damage",
            },
          },
        ],
      },
      {
        name: "Call for Family",
        cost: [EnergyType.Grass, EnergyType.Grass],
        text: "Busca en tu mazo un Pokémon Básico llamado Nidoran♂ o Nidoran♀ y ponlo en tu Banca. Baraja tu mazo después. (No puedes usar este ataque si tu Banca está llena.)",
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Psychic],
  }),
  createPokemonCard({
    id: makeCardId(SET, 58, "Oddish"),
    name: "Oddish",
    number: 58,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 50,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Stun Spore",
        cost: [EnergyType.Grass],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Paralizado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Paralyzed,
            },
          },
        ],
      },
      {
        name: "Sprout",
        cost: [EnergyType.Grass, EnergyType.Grass],
        text: "Busca en tu mazo un Pokémon Básico llamado Oddish y ponlo en tu Banca. Baraja tu mazo después. (No puedes usar este ataque si tu Banca está llena.)",
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 59, "Paras"),
    name: "Paras",
    number: 59,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 40,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Scratch",
        cost: [EnergyType.Colorless, EnergyType.Colorless],
        damage: 20,
      },
      {
        name: "Spore",
        cost: [EnergyType.Grass, EnergyType.Grass],
        text: "El Pokémon Defensor queda Dormido.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            status: StatusCondition.Asleep,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  createPokemonCard({
    id: makeCardId(SET, 60, "Pikachu"),
    name: "Pikachu",
    number: 60,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 50,
    types: [EnergyType.Lightning],
    attacks: [
      {
        name: "Spark",
        cost: [EnergyType.Lightning, EnergyType.Lightning],
        damage: 20,
        text: "Si tu rival tiene algún Pokémon en la Banca, elige 1 de ellos y este ataque le hace 10 puntos de daño.",
        effects: [
          {
            type: AttackEffectType.BenchDamage,
            target: AttackTarget.Defender,
            amount: 10,
            benchTarget: BenchDamageTarget.Opponent,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 61, "Rhyhorn"),
    name: "Rhyhorn",
    number: 61,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 70,
    types: [EnergyType.Fighting],
    attacks: [
      {
        name: "Leer",
        cost: [EnergyType.Colorless],
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor no puede atacar durante el próximo turno de tu rival.",
        effects: [
          {
            type: AttackEffectType.Protection,
            target: AttackTarget.Self,
            coinFlip: {
              count: 1,
              onHeads: "protection",
            },
            protectionType: ProtectionType.DamageAndEffects,
          },
        ],
      },
      {
        name: "Horn Attack",
        cost: [EnergyType.Fighting, EnergyType.Colorless, EnergyType.Colorless],
        damage: 30,
      },
    ],
    retreatCost: 3,
    weaknesses: [EnergyType.Grass],
    resistances: [EnergyType.Lightning],
  }),
  createPokemonCard({
    id: makeCardId(SET, 62, "Spearow"),
    name: "Spearow",
    number: 62,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 50,
    types: [EnergyType.Colorless],
    attacks: [
      {
        name: "Peck",
        cost: [EnergyType.Colorless],
        damage: 10,
      },
      {
        name: "Mirror Move",
        cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
        text: "Si Spearow fue atacado el turno anterior, haz el resultado final de ese ataque al Pokémon Defensor.",
        effects: [
          {
            type: AttackEffectType.MirrorMove,
            target: AttackTarget.Self,
          },
        ],
      },
    ],
    retreatCost: 0,
    weaknesses: [EnergyType.Lightning],
    resistances: [EnergyType.Fighting],
  }),
  createPokemonCard({
    id: makeCardId(SET, 63, "Venonat"),
    name: "Venonat",
    number: 63,
    set: SET,
    rarity: CardRarity.Common,
    stage: PokemonStage.Basic,
    hp: 40,
    types: [EnergyType.Grass],
    attacks: [
      {
        name: "Stun Spore",
        cost: [EnergyType.Grass],
        damage: 10,
        text: "Lanza una moneda. Si sale cara, el Pokémon Defensor queda Paralizado.",
        effects: [
          {
            type: AttackEffectType.ApplyStatus,
            target: AttackTarget.Defender,
            coinFlip: {
              count: 1,
              onHeads: StatusCondition.Paralyzed,
            },
          },
        ],
      },
      {
        name: "Leech Life",
        cost: [EnergyType.Grass, EnergyType.Colorless],
        damage: 10,
        text: "Retira de Venonat una cantidad de contadores de daño igual al daño hecho al Pokémon Defensor. Si Venonat tiene menos contadores de daño, retíralos todos.",
        effects: [
          {
            type: AttackEffectType.Heal,
            target: AttackTarget.Self,
            amount: 10,
          },
        ],
      },
    ],
    retreatCost: 1,
    weaknesses: [EnergyType.Fire],
  }),
  // Card 64 (Trainer)
  createTrainerCard({
    id: makeCardId(SET, 64, "Poké Ball"),
    name: "Poké Ball",
    number: 64,
    set: SET,
    rarity: CardRarity.Common,
    trainerType: TrainerType.Item,
    effect: "Lanza una moneda. Si sale cara, busca en tu mazo cualquier carta de Pokémon Básico o de Evolución. Muestra esa carta a tu rival y ponla en tu mano. Baraja tu mazo después.",
  }),
];
