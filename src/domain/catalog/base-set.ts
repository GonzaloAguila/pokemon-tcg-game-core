/**
 * Base Set card catalog - 102 cards
 */

import {
  Card,
  createPokemonCard,
  createTrainerCard,
  createEnergyCard,
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

const SET: CardSet = CardSet.BaseSet;

export const baseSetCards: Card[] = [
    createPokemonCard({
      id: makeCardId(SET, 1, "Alakazam"),
      name: "Alakazam",
      number: 1,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage2,
      hp: 80,
      types: [EnergyType.Psychic],
      evolvesFrom: "Kadabra",
      power: {
        name: "Damage Swap",
        text: "Tan frecuentemente como quieras durante tu turno (antes de tu ataque), puedes mover 1 contador de daño de uno de tus Pokémon a otro siempre y cuando no lo noquee. Este poder no puede usarse si Alakazam está Dormido, Confundido o Paralizado.",
        type: PokemonPowerType.MoveDamage,
        worksFromBench: true,
      },
      attacks: [
        {
          name: "Rayo Confuso",
          cost: [EnergyType.Psychic, EnergyType.Psychic, EnergyType.Psychic],
          damage: 30,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon Defensor queda Confundido.",
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
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 2, "Blastoise"),
      name: "Blastoise",
      number: 2,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage2,
      hp: 100,
      types: [EnergyType.Water],
      evolvesFrom: "Wartortle",
      power: {
        name: "Rain Dance",
        text: "Tan frecuentemente como quieras durante tu turno (antes de tu ataque), puedes adjuntar 1 carta de Energía Agua a uno de tus Pokémon de Agua. (Esto es adicional a la carta de Energía que puedes adjuntar cada turno). Este poder no puede usarse si Blastoise está Dormido, Confundido o Paralizado.",
        type: PokemonPowerType.UnlimitedEnergyAttach,
        worksFromBench: true,
        energyType: EnergyType.Water,
        targetPokemonTypes: [EnergyType.Water],
      },
      attacks: [
        {
          name: "Hidro Bomba",
          cost: [EnergyType.Water, EnergyType.Water, EnergyType.Water],
          damage: 40,
          text:
            "Hace 40 puntos de daño más otros 10 puntos por cada carta de Energía Agua unida a Blastoise pero no puede usarse para pagar el coste adicional de Energía de este ataque. Energía Agua adicional a partir de la segunda no cuenta.",
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
      retreatCost: 3,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 3, "Chansey"),
      name: "Chansey",
      number: 3,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Basic,
      hp: 120,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Acurruque",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Echa la moneda a cara o cruz. Si sale cara, previene todo daño hecho a Chansey durante el próximo turno de tu rival (ocurre cualquier otro efecto de ataques).",
          effects: [
            {
              type: AttackEffectType.Protection,
              target: AttackTarget.Self,
              coinFlip: {
                count: 1,
                onHeads: "protection",
              },
              protectionType: ProtectionType.DamageOnly,
            },
          ],
        },
        {
          name: "Doble Filo",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          damage: 80,
          text: "Chansey se hace 80 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 80,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [EnergyType.Psychic],
    }),
    createPokemonCard({
      id: makeCardId(SET, 4, "Charizard"),
      name: "Charizard",
      number: 4,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage2,
      hp: 120,
      types: [EnergyType.Fire],
      evolvesFrom: "Charmeleon",
      power: {
        name: "Energy Burn",
        text: "Tan frecuentemente como quieras durante tu turno (antes de atacar), puedes convertir todas las Energías adjuntas a Charizard en Energía Fuego para el resto de este turno. Este poder no puede usarse si Charizard está Dormido, Confundido o Paralizado.",
        type: PokemonPowerType.EnergyConversion,
        worksFromBench: true,
        energyType: EnergyType.Fire,
      },
      attacks: [
        {
          name: "Giro Fuego",
          cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Fire, EnergyType.Fire],
          damage: 100,
          text: "Descarta 2 cartas de Energía Fuego unidas a Charizard para poder usar este ataque.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Fire, EnergyType.Fire],
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Water],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 5, "Clefairy"),
      name: "Clefairy",
      number: 5,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Canto",
          cost: [EnergyType.Colorless],
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Dormido.",
          effects: [
            {
              type: AttackEffectType.ApplyStatus,
              target: AttackTarget.Defender,
              coinFlip: {
                count: 1,
                onHeads: StatusCondition.Asleep,
              },
            },
          ],
        },
        {
          name: "Metrónomo",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Elige 1 de los ataques del Pokémon a la defensa. Metrónomo copia ese ataque excepto por su coste de energía y cualquier otra cosa necesaria para poder usar el ataque, como descartar cartas de energía. (No importa cual sea el tipo de Pokémon a la defensa, la Energía de Clefairy es siempre incolora).",
          effects: [
            {
              type: AttackEffectType.CopyAttack,
              target: AttackTarget.Defender,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [EnergyType.Psychic],
    }),
    createPokemonCard({
      id: makeCardId(SET, 6, "Gyarados"),
      name: "Gyarados",
      number: 6,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage1,
      hp: 100,
      types: [EnergyType.Water],
      evolvesFrom: "Magikarp",
      attacks: [
        {
          name: "Furia Dragón",
          cost: [EnergyType.Water, EnergyType.Water, EnergyType.Water],
          damage: 50,
        },
        {
          name: "Rayo Burbuja",
          cost: [EnergyType.Water, EnergyType.Water, EnergyType.Water, EnergyType.Water],
          damage: 40,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Paralizado.",
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
      retreatCost: 3,
      weaknesses: [EnergyType.Grass],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 7, "Hitmonchan"),
      name: "Hitmonchan",
      number: 7,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Basic,
      hp: 70,
      types: [EnergyType.Fighting],
      attacks: [
        {
          name: "Puño Bala",
          cost: [EnergyType.Fighting],
          damage: 20,
        },
        {
          name: "Puño Especial",
          cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Colorless],
          damage: 40,
        },
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 8, "Machamp"),
      name: "Machamp",
      number: 8,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage2,
      hp: 100,
      types: [EnergyType.Fighting],
      evolvesFrom: "Machoke",
      power: {
        name: "Strikes Back",
        text: "Cuando Machamp recibe daño de un ataque del oponente (incluso si es Noqueado), este poder hace 10 puntos de daño al Pokémon atacante. Este poder no puede usarse si Machamp está Dormido, Confundido o Paralizado.",
        type: PokemonPowerType.DamageReaction,
        worksFromBench: true,
        reactionDamage: 10,
      },
      attacks: [
        {
          name: "Lanzamiento Sísmico",
          cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting, EnergyType.Colorless],
          damage: 60,
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 9, "Magneton"),
      name: "Magneton",
      number: 9,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Lightning],
      evolvesFrom: "Magnemite",
      attacks: [
        {
          name: "Onda Trueno",
          cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Colorless],
          damage: 30,
          text:
            "Hecha la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Paralizado.",
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
          name: "Autodestrucción",
          cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Colorless, EnergyType.Colorless],
          damage: 80,
          text:
            "Hace 20 de daño a cada Pokémon en la Banca de cada jugador. (No apliques Debilidad o Resistencia para el Pokémon en la banca). Magneton se hace 80 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 80,
            },
            {
              type: AttackEffectType.BenchDamage,
              target: AttackTarget.Defender,
              amount: 20,
              benchTarget: BenchDamageTarget.Both,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 10, "Mewtwo"),
      name: "Mewtwo",
      number: 10,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Basic,
      hp: 60,
      types: [EnergyType.Psychic],
      attacks: [
        {
          name: "Médium",
          cost: [EnergyType.Psychic, EnergyType.Colorless],
          damage: 10,
          text:
            "Hace 10 de daño más 10 puntos más por cada carta de Energía unida al Pokémon a la defensa.",
        },
        {
          name: "Barrera",
          cost: [EnergyType.Psychic, EnergyType.Psychic],
          text:
            "Descarta 1 carta de Energía Psiquica unida a Mewtwo para poder usar este ataque. Durante el próximo turno de tu rival, previene todos los efectos de ataques, incluyendo daño, hechos a Mewtwo.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Psychic],
            },
            {
              type: AttackEffectType.Protection,
              target: AttackTarget.Self,
              protectionType: ProtectionType.DamageAndEffects,
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 11, "Nidoking"),
      name: "Nidoking",
      number: 11,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage2,
      hp: 90,
      types: [EnergyType.Grass],
      evolvesFrom: "Nidorino",
      attacks: [
        {
          name: "Golpe",
          cost: [EnergyType.Grass, EnergyType.Colorless, EnergyType.Colorless],
          damage: 30,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, este ataque hace 30 puntos de daño mas otros 10 puntos más; si sale cruz este ataque hace 30 puntos de daño y Nidoking se hace 10 puntos de daño a sí mismo.",
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
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 10,
              coinFlip: {
                count: 1,
                onTails: "damage",
              },
            },
          ],
        },
        {
          name: "Tóxico",
          cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Grass],
          damage: 20,
          text:
            "El Pokémon a la defensa pasa a estar envenenado. Ahora resta 20 puntos de veneno en lugar de 10 después del turno de cada jugador (incluso si ya estaba envenenado).",
          effects: [
            {
              type: AttackEffectType.ApplyStatus,
              target: AttackTarget.Defender,
              status: StatusCondition.Poisoned,
              poisonDamage: 20,
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 12, "Ninetales"),
      name: "Ninetales",
      number: 12,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Fire],
      evolvesFrom: "Vulpix",
      attacks: [
        {
          name: "Danza Ígnea",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Si tu rival tiene algún Pokémon en su Banca, elige 1 de ellos y cámbialo con el Pokémon a la defensa.",
          effects: [
            {
              type: AttackEffectType.ForceSwitch,
              target: AttackTarget.Defender,
            },
          ],
        },
        {
          name: "Lanzallamas",
          cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Fire, EnergyType.Fire],
          damage: 80,
          text: "Descarta 1 carta de Energía Fuego unida a Ninetales para poder usar este ataque.",
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
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 13, "Poliwrath"),
      name: "Poliwrath",
      number: 13,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage2,
      hp: 90,
      types: [EnergyType.Water],
      evolvesFrom: "Poliwhirl",
      attacks: [
        {
          name: "Pistola de Agua",
          cost: [EnergyType.Water, EnergyType.Water, EnergyType.Colorless],
          damage: 30,
          text:
            "Hace 30 puntos de daño más otros 10 más por cada Energía Agua unida a Poliwrath que no sea usada para pagar el coste de Energía de este ataque. Energía Agua adicional después de la segunda no cuenta.",
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
        {
          name: "Torbellino / Remolino",
          cost: [EnergyType.Water, EnergyType.Water, EnergyType.Colorless, EnergyType.Colorless],
          damage: 40,
          text:
            "Si el Pokémon a la defensa tiene cartas de Energía unidas, elige 1 de ellas y descártala.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Defender,
              amount: 1,
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Grass],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 14, "Raichu"),
      name: "Raichu",
      number: 14,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Lightning],
      evolvesFrom: "Pikachu",
      attacks: [
        {
          name: "Agilidad",
          cost: [EnergyType.Lightning, EnergyType.Colorless, EnergyType.Colorless],
          damage: 20,
          text:
            "Lanza una moneda. Si sale cara, durante el siguiente turno de tu oponente, evita todos los efectos de los ataques, incluidos el daño, hecho a Raichu.",
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
          name: "Trueno",
          cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning, EnergyType.Colorless],
          damage: 60,
          text:
            "Lanza una moneda. Si sale cruz, Raichu se hace 30 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 30,
              coinFlip: {
                count: 1,
                onTails: "damage",
              },
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 15, "Venusaur"),
      name: "Venusaur",
      number: 15,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Stage2,
      hp: 100,
      types: [EnergyType.Grass],
      evolvesFrom: "Ivysaur",
      power: {
        name: "Energy Trans",
        text: "Tan frecuentemente como quieras durante tu turno (antes de tu ataque), puedes mover 1 carta de Energía Planta de uno de tus Pokémon a otro. Este poder no puede usarse si Venusaur está Dormido, Confundido o Paralizado.",
        type: PokemonPowerType.MoveEnergy,
        worksFromBench: true,
        energyType: EnergyType.Grass,
      },
      attacks: [
        {
          name: "Rayo Solar",
          cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Grass, EnergyType.Grass],
          damage: 60,
        },
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Fire],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 16, "Zapdos"),
      name: "Zapdos",
      number: 16,
      set: SET,
      rarity: CardRarity.RareHolo,
      stage: PokemonStage.Basic,
      hp: 90,
      types: [EnergyType.Lightning],
      attacks: [
        {
          name: "Trueno",
          cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning, EnergyType.Colorless],
          damage: 60,
          text:
            "Hecha la moneda a cara o cruz. Si sale cruz, Zapdos se hace 30 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 30,
              coinFlip: {
                count: 1,
                onTails: "damage",
              },
            },
          ],
        },
        {
          name: "Rayo",
          cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning],
          damage: 100,
          text: "Descarta todas las cartas de Energía unidas a Zapdos para poder usar este ataque.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardAll: true,
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 17, "Beedrill"),
      name: "Beedrill",
      number: 17,
      set: SET,
      rarity: CardRarity.Rare,
      stage: PokemonStage.Stage2,
      hp: 80,
      types: [EnergyType.Grass],
      evolvesFrom: "Kakuna",
      attacks: [
        {
          name: "Doble Ataque",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Echa 2 monedas a cara o cruz. Este ataque hace 30 puntos de daño multiplicado por la cantidad de caras que haya salido.",
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
          name: "Picotazo Venenoso",
          cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Grass],
          damage: 40,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Envenenado.",
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
      ],
      retreatCost: 0,
      weaknesses: [EnergyType.Water],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 18, "Dragonair"),
      name: "Dragonair",
      number: 18,
      set: SET,
      rarity: CardRarity.Rare,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Colorless],
      evolvesFrom: "Dratini",
      attacks: [
        {
          name: "Portazo",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Echa 2 monedas a cara o cruz. Este ataque hace 30 puntos de daño multiplicado por la cantidad de caras que hayan salido.",
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
          name: "Híper Rayo",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          damage: 20,
          text:
            "Si el Pokémon a la defensa tiene cualquier carta de Energía unida, elige 1 de ellas y descártala.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Defender,
              amount: 1,
            },
          ],
        },
      ],
      retreatCost: 2,
      weaknesses: [],
      resistances: [EnergyType.Psychic],
    }),
    createPokemonCard({
      id: makeCardId(SET, 19, "Dugtrio"),
      name: "Dugtrio",
      number: 19,
      set: SET,
      rarity: CardRarity.Rare,
      stage: PokemonStage.Stage1,
      hp: 70,
      types: [EnergyType.Fighting],
      evolvesFrom: "Diglett",
      attacks: [
        { name: "Cuchillada", cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Colorless], damage: 40 },
        {
          name: "Terremoto",
          cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting, EnergyType.Fighting],
          damage: 70,
          text:
            "Hace 10 puntos de daño a cada uno de tus Pokémon en la Banca. (No apliques Debilidad ni Resistencia para los Pokémon en la Banca.)",
          effects: [
            {
              type: AttackEffectType.BenchDamage,
              target: AttackTarget.Self,
              amount: 10,
              benchTarget: BenchDamageTarget.Own,
            },
          ],
        },
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Grass],
      resistances: [EnergyType.Lightning],
    }),
    createPokemonCard({
      id: makeCardId(SET, 20, "Electabuzz"),
      name: "Electabuzz",
      number: 20,
      set: SET,
      rarity: CardRarity.Rare,
      stage: PokemonStage.Basic,
      hp: 70,
      types: [EnergyType.Lightning],
      attacks: [
        {
          name: "Impactrueno",
          cost: [EnergyType.Lightning],
          damage: 10,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Paralizado.",
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
          name: "Puño-trueno",
          cost: [EnergyType.Lightning, EnergyType.Colorless],
          damage: 30,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, este ataque hace 30 puntos de daño más otros 10 más; si sale cruz, este ataque hace 30 puntos de daño y Electabuzz se hace 10 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.BonusDamage,
              target: AttackTarget.Defender,
              amount: 10,
              coinFlip: {
                count: 1,
                onHeads: "damage",
              },
            },
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 10,
              coinFlip: {
                count: 1,
                onTails: "damage",
              },
            },
          ],
        },
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Fighting],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 21, "Electrode"),
      name: "Electrode",
      number: 21,
      set: SET,
      rarity: CardRarity.Rare,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Lightning],
      evolvesFrom: "Voltorb",
      power: {
        name: "Buzzap",
        text: "En cualquier momento durante tu turno (antes de atacar), puedes Noquear a Electrode y adjuntarlo a otro de tus Pokémon. Electrode ahora es una Energía Especial que provee 2 unidades de Energía del tipo que elijas. Tu oponente toma un premio. Este poder no puede usarse si Electrode está Dormido, Confundido o Paralizado.",
        type: PokemonPowerType.SelfSacrifice,
        worksFromBench: true,
        becomesEnergyValue: 2,
      },
      attacks: [
        {
          name: "Descarga Eléctrica",
          cost: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning],
          damage: 50,
          text:
            "Echa la moneda a cara o cruz. Si sale cruz, Electrode se hace 10 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 10,
              coinFlip: {
                count: 1,
                onTails: "damage",
              },
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 22, "Pidgeotto"),
      name: "Pidgeotto",
      number: 22,
      set: SET,
      rarity: CardRarity.Rare,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Colorless],
      evolvesFrom: "Pidgey",
      attacks: [
        {
          name: "Torbellino / Remolino",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          damage: 20,
          text:
            "Si tu rival tiene cualquier Pokémon en la banca, debe elegir uno de ellos y cambiarlo con el Pokémon a la defensa. (Haz el daño antes de cambiar el Pokémon.)",
          effects: [
            {
              type: AttackEffectType.ForceSwitch,
              target: AttackTarget.Defender,
            },
          ],
        },
        {
          name: "Movimiento Espejo",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Si Pidgeotto fue atacado en el último turno, haz el resultado final de ese ataque sobre Pidgeotto al Pokémon a la defensa.",
          effects: [
            {
              type: AttackEffectType.MirrorMove,
              target: AttackTarget.Self,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 23, "Arcanine"),
      name: "Arcanine",
      number: 23,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 100,
      types: [EnergyType.Fire],
      evolvesFrom: "Growlithe",
      attacks: [
        {
          name: "Lanzallamas",
          cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Colorless],
          damage: 50,
          text:
            "Descarta 1 carta de Energía Fuego unida a Arcanine para poder usar este ataque.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Fire],
            },
          ],
        },
        {
          name: "Derribo",
          cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Colorless, EnergyType.Colorless],
          damage: 80,
          text: "Arcanine se hace 30 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 30,
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Water],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 24, "Charmeleon"),
      name: "Charmeleon",
      number: 24,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Fire],
      evolvesFrom: "Charmander",
      attacks: [
        { name: "Cuchillada", cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless], damage: 30 },
        {
          name: "Lanzallamas",
          cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Colorless],
          damage: 50,
          text: "Descarta 1 carta de Energía Fuego unida a Charmeleon para poder usar este ataque.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Fire],
            },
          ],
        }
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Water],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 25, "Dewgong"),
      name: "Dewgong",
      number: 25,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Water],
      evolvesFrom: "Seel",
      attacks: [
        { name: "Aurora Beam", cost: [EnergyType.Water, EnergyType.Water, EnergyType.Colorless], damage: 50 },
        {
          name: "Rayo Hielo",
          cost: [EnergyType.Water, EnergyType.Water, EnergyType.Colorless, EnergyType.Colorless],
          damage: 30,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon Defensor queda Paralizado.",
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
      retreatCost: 3,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 26, "Dratini"),
      name: "Dratini",
      number: 26,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Golpe Cola",
          cost: [EnergyType.Colorless],
          damage: 10,
        },
      ],
      retreatCost: 1,
      weaknesses: [],
      resistances: [EnergyType.Psychic],
    }),
    createPokemonCard({
      id: makeCardId(SET, 27, "Farfetchd"),
      name: "Farfetch'd",
      number: 27,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Bofetada Puerro",
          cost: [EnergyType.Colorless],
          text:
            "Echa la moneda a cara o cruz. Si sale cruz, este ataque no hace nada. En cualquier caso, no puedes volver a usar este ataque mientras Farfetch'd esté en juego (ni siquiera ponerlo en la Banca te permite usarlo de nuevo).",
          effects: [
            {
              type: AttackEffectType.CoinFlipDamage,
              target: AttackTarget.Defender,
              amount: 30,
              coinFlip: {
                count: 1,
                onHeads: "damage",
              },
            },
            {
              type: AttackEffectType.UseOnce,
              target: null,
            },
          ],
        },
        {
          name: "Rompe Ollas",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          damage: 30,
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 28, "Growlithe"),
      name: "Growlithe",
      number: 28,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 60,
      types: [EnergyType.Fire],
      attacks: [
        {
          name: "Llamarada",
          cost: [EnergyType.Colorless, EnergyType.Fire],
          damage: 20,
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Water],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 29, "Haunter"),
      name: "Haunter",
      number: 29,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Psychic],
      evolvesFrom: "Gastly",
      attacks: [
        {
          name: "Hipnosis",
          cost: [EnergyType.Psychic],
          text:
            "El Pokémon a la defensa pasa a estar dormido.",
          effects: [
            {
              type: AttackEffectType.ApplyStatus,
              target: AttackTarget.Defender,
              status: StatusCondition.Asleep,
            },
          ],
        },
        {
          name: "Comesueños",
          cost: [EnergyType.Psychic, EnergyType.Psychic],
          damage: 50,
          text:
            "No puedes usar este ataque a menos que el Pokémon a la defensa esté Dormido.",
          effects: [
            {
              type: AttackEffectType.RequireStatus,
              target: AttackTarget.Defender,
              requiredStatus: StatusCondition.Asleep,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 30, "Ivysaur"),
      name: "Ivysaur",
      number: 30,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Grass],
      evolvesFrom: "Bulbasaur",
      attacks: [
        {
          name: "Látigo Cepa",
          cost: [EnergyType.Grass, EnergyType.Colorless, EnergyType.Colorless],
          damage: 30,
        },
        {
          name: "Polvo Veneno",
          cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Grass],
          damage: 20,
          text:
            "El Pokémon Defensor queda Envenenado.",
          effects: [
            {
              type: AttackEffectType.ApplyStatus,
              target: AttackTarget.Defender,
              status: StatusCondition.Poisoned,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fire],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 31, "Jynx"),
      name: "Jynx",
      number: 31,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 70,
      types: [EnergyType.Psychic],
      attacks: [
        {
          name: "Bofetón Doble",
          cost: [EnergyType.Psychic],
          text:
            "Echa 2 monedas a cara o cruz. Este ataque hace 10 puntos de daño multiplicado por la cantidad de caras que hayan salido.",
          effects: [
            {
              type: AttackEffectType.CoinFlipDamage,
              target: AttackTarget.Defender,
              amount: 10,
              coinFlip: {
                count: 2,
                onHeads: "damage",
              },
            },
          ],
        },
        {
          name: "Meditación",
          cost: [EnergyType.Psychic, EnergyType.Psychic, EnergyType.Colorless],
          damage: 20,
          text:
            "Hace 20 puntos de daño más otros 10 puntos de daño más por cada contador de daño en el Pokémon Defensor.",
          effects: [
            {
              type: AttackEffectType.DamagePerCounter,
              target: AttackTarget.Defender,
              amount: 10,
            },
          ],
        },
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 32, "Kadabra"),
      name: "Kadabra",
      number: 32,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Psychic],
      evolvesFrom: "Abra",
      attacks: [
        {
          name: "Recuperación",
          cost: [EnergyType.Psychic, EnergyType.Psychic],
          text:
            "Descarta 1 carta de Energía Psíquica unida a Kadabra para eliminar todos los contadores de daño de Kadabra.",
          effects: [
            {
              type: AttackEffectType.Recover,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Psychic],
            },
          ],
        },
        {
          name: "Psi",
          cost: [EnergyType.Psychic, EnergyType.Psychic, EnergyType.Colorless],
          damage: 50,
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 33, "Kakuna"),
      name: "Kakuna",
      number: 33,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Grass],
      evolvesFrom: "Weedle",
      attacks: [
        {
          name: "Endurecimiento",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Echa la moneda a cara o cruz. Si sale cara, previene todo daño hecho a Kakuna durante el próximo turno de tu rival. (Ocurre cualquier otro efecto de ataques.)",
          effects: [
            {
              type: AttackEffectType.Protection,
              target: AttackTarget.Self,
              coinFlip: {
                count: 1,
                onHeads: "protection",
              },
              protectionType: ProtectionType.DamageOnly,
            },
          ],
        },
        {
          name: "Polvo Venenoso",
          cost: [EnergyType.Grass, EnergyType.Grass],
          damage: 20,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon Defensa pasa a estado Envenenado.",
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
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Fire],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 34, "Machoke"),
      name: "Machoke",
      number: 34,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 80,
      types: [EnergyType.Fighting],
      evolvesFrom: "Machop",
      attacks: [
        {
          name: "Golpe Karate",
          cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Colorless],
          damage: 50,
          text:
            "Este ataque hace 10 puntos de daño menos por cada contador de daño en Machoke.",
          effects: [
            {
              type: AttackEffectType.SelfDamageReduction,
              target: AttackTarget.Self,
              amount: 10,
            },
          ],
        },
        {
          name: "Sumisión",
          cost: [EnergyType.Fighting, EnergyType.Fighting, EnergyType.Colorless, EnergyType.Colorless],
          damage: 60,
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 20,
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 35, "Magikarp"),
      name: "Magikarp",
      number: 35,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 30,
      types: [EnergyType.Water],
      attacks: [
        {
          name: "Placaje",
          cost: [EnergyType.Colorless],
          damage: 10,
        },
        {
          name: "Azote",
          cost: [EnergyType.Water],
          damage: "10x",
          text: "Hace 10 puntos de daño multiplicados por la cantidad de contadores de daño sobre Magikarp.",
          effects: [
            {
              type: AttackEffectType.DamagePerCounter,
              target: AttackTarget.Self,
              amount: 10,
            },
          ],
        }
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 36, "Magmar"),
      name: "Magmar",
      number: 36,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Fire],
      attacks: [
        {
          name: "Puño Fuego",
          cost: [EnergyType.Fire, EnergyType.Fire],
          damage: 30,
        },
        {
          name: "Lanzallamas",
          cost: [EnergyType.Fire, EnergyType.Fire, EnergyType.Colorless],
          damage: 50,
          text: "Descarta 1 carta de Energía Fuego unida a Magmar para poder usar este ataque.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Fire],
            },
          ],
        },
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Water],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 37, "Nidorino"),
      name: "Nidorino",
      number: 37,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Grass],
      evolvesFrom: "Nidoran",
      attacks: [
        {
          name: "Doble Patada",
          cost: [EnergyType.Grass, EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Echa 2 monedas. Este ataque hace 30 puntos de daño por cada cara.",
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
          name: "Cuerno Taladro",
          cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Colorless, EnergyType.Colorless],
          damage: 50,
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 38, "Poliwhirl"),
      name: "Poliwhirl",
      number: 38,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Water],
      evolvesFrom: "Poliwag",
      attacks: [
        {
          name: "Amnesia",
          cost: [EnergyType.Water, EnergyType.Water],
          text:
            "Elige 1 de los ataques del Pokémon Defensor. Ese Pokémon no puede usar ese ataque durante el próximo turno de tu rival.",
        },
        {
          name: "Bofetón Doble",
          cost: [EnergyType.Water, EnergyType.Water, EnergyType.Colorless],
          text:
            "Echa 2 monedas a cara o cruz. Este ataque hace 30 puntos de daño multiplicado por la cantidad de caras que hayan salido.",
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
      weaknesses: [EnergyType.Grass],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 39, "Porygon"),
      name: "Porygon",
      number: 39,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 30,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Conversión 1",
          cost: [EnergyType.Colorless],
          text:
            "Si el Pokémon Defensor tiene una Debilidad, puedes cambiarla a un tipo de tu elección distinto de Incoloro.",
          effects: [
            {
              type: AttackEffectType.ChangeWeakness,
              target: AttackTarget.Defender,
            },
          ],
        },
        {
          name: "Conversión 2",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Cambia la Resistencia de Porygon a un tipo de tu elección distinto de Incoloro.",
          effects: [
            {
              type: AttackEffectType.ChangeResistance,
              target: AttackTarget.Self,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [EnergyType.Psychic],
    }),
    createPokemonCard({
      id: makeCardId(SET, 40, "Raticate"),
      name: "Raticate",
      number: 40,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Colorless],
      evolvesFrom: "Rattata",
      attacks: [
        {
          name: "Mordisco",
          cost: [EnergyType.Colorless],
          damage: 20,
        },
        {
          name: "Supercolmillo",
          cost: [EnergyType.Colorless, EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Hace daño al Pokémon Defensor igual a la mitad de los PS restantes del Pokémon Defensor (redondeado hacia arriba a la decena más cercana).",
          effects: [
            {
              type: AttackEffectType.HalfHPDamage,
              target: AttackTarget.Defender,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [EnergyType.Psychic],
    }),
    createPokemonCard({
      id: makeCardId(SET, 41, "Seel"),
      name: "Seel",
      number: 41,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Basic,
      hp: 60,
      types: [EnergyType.Water],
      attacks: [
        {
          name: "Cabezazo",
          cost: [EnergyType.Water],
          damage: 10,
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 42, "Wartortle"),
      name: "Wartortle",
      number: 42,
      set: SET,
      rarity: CardRarity.Uncommon,
      stage: PokemonStage.Stage1,
      hp: 70,
      types: [EnergyType.Water],
      evolvesFrom: "Squirtle",
      attacks: [
        {
          name: "Refugio",
          cost: [EnergyType.Water, EnergyType.Colorless],
          text:
            "Echa la moneda a cara o cruz. Si sale cara, previene todo el daño hecho a Wartortle durante el próximo turno de tu rival. (Ocurre cualquier otro efecto de ataques.)",
          effects: [
            {
              type: AttackEffectType.Protection,
              target: AttackTarget.Self,
              coinFlip: {
                count: 1,
                onHeads: "protection",
              },
              protectionType: ProtectionType.DamageOnly,
            },
          ],
        },
        {
          name: "Mordisco",
          cost: [EnergyType.Water, EnergyType.Colorless, EnergyType.Colorless],
          damage: 40,
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 43, "Abra"),
      name: "Abra",
      number: 43,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 30,
      types: [EnergyType.Psychic],
      attacks: [
        {
          name: "Psicochoque",
          cost: [EnergyType.Psychic],
          damage: 10,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar paralizado.",
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
      retreatCost: 0,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 44, "Bulbasaur"),
      name: "Bulbasaur",
      number: 44,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Grass],
      attacks: [
        {
          name: "Drenadoras",
          cost: [EnergyType.Grass, EnergyType.Grass],
          damage: 20,
          text:
            "A menos que todo daño de este ataque sea prevenido, puedes quitar un contador de daño de Bulbasaur.",
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
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 45, "Caterpie"),
      name: "Caterpie",
      number: 45,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Grass],
      attacks: [
        {
          name: "Disparo Demora",
          cost: [EnergyType.Grass],
          damage: 10,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Paralizado.",
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
      retreatCost: 1,
      weaknesses: [EnergyType.Fire],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 46, "Charmander"),
      name: "Charmander",
      number: 46,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Fire],
      attacks: [
        {
          name: "Arañazo",
          cost: [EnergyType.Colorless],
          damage: 10,
        },
        {
          name: "Ascuas",
          cost: [EnergyType.Fire, EnergyType.Colorless],
          damage: 30,
          text: "Descarta 1 carta de Energía Fuego unida a Charmander para poder usar este ataque.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Fire],
            },
          ],
        }
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Water],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 47, "Diglett"),
      name: "Diglett",
      number: 47,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 30,
      types: [EnergyType.Fighting],
      attacks: [
        { name: "Excavar", cost: [EnergyType.Fighting], damage: 10 },
        { name: "Bofetada Barro", cost: [EnergyType.Fighting, EnergyType.Fighting], damage: 30 },
      ],
      retreatCost: 0,
      weaknesses: [EnergyType.Grass],
      resistances: [EnergyType.Lightning],
    }),
    createPokemonCard({
      id: makeCardId(SET, 48, "Doduo"),
      name: "Doduo",
      number: 48,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Ataque furia",
          cost: [EnergyType.Colorless],
          text:
            "Echa 2 monedas a cara o cruz. Este ataque hace 10 puntos de daño multiplicado por la cantidad de caras que hayan salido.",
          effects: [
            {
              type: AttackEffectType.CoinFlipDamage,
              target: AttackTarget.Defender,
              amount: 10,
              coinFlip: {
                count: 2,
                onHeads: "damage",
              },
            },
          ],
        },
      ],
      retreatCost: 0,
      weaknesses: [EnergyType.Lightning],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 49, "Drowzee"),
      name: "Drowzee",
      number: 49,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Psychic],
      attacks: [
        { name: "Destructor", cost: [EnergyType.Colorless], damage: 10 },
        {
          name: "Rayo confuso",
          cost: [EnergyType.Psychic, EnergyType.Psychic],
          damage: 10,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Confundido.",
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
      retreatCost: 1,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 50, "Gastly"),
      name: "Gastly",
      number: 50,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 30,
      types: [EnergyType.Psychic],
      attacks: [
        {
          name: "Gas de Dormir",
          cost: [EnergyType.Psychic],
          damage: 0,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Dormido.",
          effects: [
            {
              type: AttackEffectType.ApplyStatus,
              target: AttackTarget.Defender,
              coinFlip: {
                count: 1,
                onHeads: StatusCondition.Asleep,
              },
            },
          ],
        },
        {
          name: "Unión de Destino",
          cost: [EnergyType.Psychic, EnergyType.Colorless],
          text:
            "Descarta 1 carta de Energía Psíquica unida a Gastly para poder usar este ataque. Si un Pokémon deja fuera de combate a Gastly durante el próximo turno de tu rival, deja fuera de combate a ese Pokémon.",
          effects: [
            {
              type: AttackEffectType.Discard,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Psychic],
            },
            {
              type: AttackEffectType.DestinyBond,
              target: AttackTarget.Self,
            },
          ],
        },
      ],
      retreatCost: 0,
      weaknesses: [],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 51, "Koffing"),
      name: "Koffing",
      number: 51,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Grass],
      attacks: [
        {
          name: "Gas pestilente",
          cost: [EnergyType.Grass, EnergyType.Grass],
          damage: 10,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Envenenado; si sale cruz, pasa a estar Confundido.",
          effects: [
            {
              type: AttackEffectType.ApplyStatus,
              target: AttackTarget.Defender,
              coinFlip: {
                count: 1,
                onHeads: StatusCondition.Poisoned,
                onTails: StatusCondition.Confused,
              },
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 52, "Machop"),
      name: "Machop",
      number: 52,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Fighting],
      attacks: [{ name: "Patada baja", cost: [EnergyType.Fighting], damage: 20 }],
      retreatCost: 1,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 53, "Magnemite"),
      name: "Magnemite",
      number: 53,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Lightning],
      attacks: [
        {
          name: "Onda trueno",
          cost: [EnergyType.Lightning],
          damage: 10,
          text:
            "Hecha la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Paralizado.",
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
          name: "Autodestrucción",
          cost: [EnergyType.Lightning, EnergyType.Colorless],
          damage: 40,
          text:
            "Hace 10 puntos de daño a cada Pokémon en las bancas de ambos jugadores. (No apliques Debilidad ni Resistencia para los Pokémon en la Banca). Magnemite se hace 40 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 40,
            },
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
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 54, "Metapod"),
      name: "Metapod",
      number: 54,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Stage1,
      hp: 70,
      types: [EnergyType.Grass],
      evolvesFrom: "Caterpie",
      attacks: [
        {
          name: "Endurecimiento",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          text:
            "Echa la moneda a cara o cruz. Si sale cara, previene todo el daño hecho a Metapod durante el próximo turno de tu rival. (Ocurre cualquier otro efecto de ataque).",
          effects: [
            {
              type: AttackEffectType.Protection,
              target: AttackTarget.Self,
              coinFlip: {
                count: 1,
                onHeads: "protection",
              },
              protectionType: ProtectionType.DamageOnly,
            },
          ],
        },
        {
          name: "Espora Paralizadora",
          cost: [EnergyType.Grass, EnergyType.Grass],
          damage: 20,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon a la defensa pasa a estar Paralizado.",
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
      retreatCost: 2,
      weaknesses: [EnergyType.Fire],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 55, "Nidoran"),
      name: "Nidoran",
      number: 55,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Grass],
      attacks: [
        {
          name: "Azar Cuerno",
          cost: [EnergyType.Grass],
          text:
            "Echa la moneda a cara o cruz. Si sale cruz, este ataque no hace nada.",
          effects: [
            {
              type: AttackEffectType.CoinFlipDamage,
              target: AttackTarget.Defender,
              amount: 30,
              coinFlip: {
                count: 1,
                onHeads: "damage",
              },
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Psychic],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 56, "Onix"),
      name: "Onix",
      number: 56,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 90,
      types: [EnergyType.Fighting],
      attacks: [
        {
          name: "Lanzarrocas",
          cost: [EnergyType.Fighting],
          damage: 10,
        },
        {
          name: "Endurecimiento",
          cost: [EnergyType.Fighting, EnergyType.Fighting],
          text:
            "Durante el próximo turno de tu rival, cuando se haga 30 o menos puntos de daño a Onix (después de aplicar Debilidad y Resistencia), previene ese daño. (Ocurre cualquier otro efecto de ataques.)",
          effects: [
            {
              type: AttackEffectType.Protection,
              target: AttackTarget.Self,
              protectionType: ProtectionType.DamageOnly,
              amount: 30,
            },
          ],
        },
      ],
      retreatCost: 3,
      weaknesses: [EnergyType.Grass],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 57, "Pidgey"),
      name: "Pidgey",
      number: 57,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Remolino",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          damage: 10,
          text:
            "Si tu rival tiene algún Pokémon en la Banca, elige 1 de ellos y cámbialo con el Pokémon Defensor. (Haz el daño antes de cambiar el Pokémon.)",
          effects: [
            {
              type: AttackEffectType.ForceSwitch,
              target: AttackTarget.Defender,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [EnergyType.Fighting],
    }),
    createPokemonCard({
      id: makeCardId(SET, 58, "Pikachu"),
      name: "Pikachu",
      number: 58,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Lightning],
      attacks: [
        {
          name: "Roer",
          cost: [EnergyType.Colorless],
          damage: 10,
        },
        {
          name: "Trueno Sacudida",
          cost: [EnergyType.Lightning, EnergyType.Colorless],
          damage: 30,
          text:
            "Echa la moneda a cara o cruz. Si sale cruz, Pikachu se hace 10 puntos de daño a sí mismo.",
          effects: [
            {
              type: AttackEffectType.SelfDamage,
              target: AttackTarget.Self,
              amount: 10,
              coinFlip: {
                count: 1,
                onTails: "damage",
              },
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 59, "Poliwag"),
      name: "Poliwag",
      number: 59,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Water],
      attacks: [
        {
          name: "Pistola Agua",
          cost: [EnergyType.Water],
          damage: 10,
          text:
            "Hace 10 puntos de daño más otros 10 más por cada Energía Agua unida a Poliwag que no sea usada para pagar el coste de Energía de este ataque. Energía Agua adicional después de la segunda no cuenta.",
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
      weaknesses: [EnergyType.Grass],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 60, "Ponyta"),
      name: "Ponyta",
      number: 60,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Fire],
      attacks: [
        {
          name: "Patada Aplastante",
          cost: [EnergyType.Colorless, EnergyType.Colorless],
          damage: 20,
        },
        {
          name: "Cola de Fuego",
          cost: [EnergyType.Fire, EnergyType.Fire],
          damage: 30,
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Water],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 61, "Rattata"),
      name: "Rattata",
      number: 61,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 30,
      types: [EnergyType.Colorless],
      attacks: [
        {
          name: "Mordisco",
          cost: [EnergyType.Colorless],
          damage: 20,
        },
      ],
      retreatCost: 0,
      weaknesses: [EnergyType.Fighting],
      resistances: [EnergyType.Psychic],
    }),
    createPokemonCard({
      id: makeCardId(SET, 62, "Sandshrew"),
      name: "Sandshrew",
      number: 62,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Fighting],
      attacks: [
        {
          name: "Ataque Arena",
          cost: [EnergyType.Fighting],
          damage: 10,
          text:
            "Si el Pokémon Defensor intenta atacar durante el próximo turno de tu rival, tu rival echa la moneda a cara o cruz. Si sale cruz, ese ataque no hace nada.",
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Grass],
      resistances: [EnergyType.Lightning],
    }),
    createPokemonCard({
      id: makeCardId(SET, 63, "Squirtle"),
      name: "Squirtle",
      number: 63,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Water],
      attacks: [
        {
          name: "Burbuja",
          cost: [EnergyType.Water],
          damage: 10,
          text: "Echa la moneda a cara o cruz. Si sale cara, el Pokémon Defensor queda Paralizado.",
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
          name: "Refugio",
          cost: [EnergyType.Water, EnergyType.Colorless],
          text: "Echa la moneda a cara o cruz. Si sale cara, previene todo el daño hecho a Squirtle durante el próximo turno de tu rival. (Ocurre cualquier otro efecto de ataques.)",
          effects: [
            {
              type: AttackEffectType.Protection,
              target: AttackTarget.Self,
              coinFlip: {
                count: 1,
                onHeads: "protection",
              },
              protectionType: ProtectionType.DamageOnly,
            },
          ],
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 64, "Starmie"),
      name: "Starmie",
      number: 64,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Stage1,
      hp: 60,
      types: [EnergyType.Water],
      evolvesFrom: "Staryu",
      attacks: [
        {
          name: "Recuperación",
          cost: [EnergyType.Water, EnergyType.Water],
          text:
            "Descarta 1 carta de Energía Agua unida a Starmie para eliminar todos los contadores de daño de Starmie.",
          effects: [
            {
              type: AttackEffectType.Recover,
              target: AttackTarget.Self,
              discardCostRequirement: [EnergyType.Water],
            }
          ]
        },
        {
          name: "Estrella Congelante",
          cost: [EnergyType.Water, EnergyType.Colorless, EnergyType.Colorless],
          damage: 20,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon Defensor queda Paralizado.",
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
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 65, "Staryu"),
      name: "Staryu",
      number: 65,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Water],
      attacks: [
        {
          name: "Bofetón",
          cost: [EnergyType.Water],
          damage: 20,
        },
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Lightning],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 66, "Tangela"),
      name: "Tangela",
      number: 66,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Grass],
      attacks: [
        {
          name: "Atadura",
          cost: [EnergyType.Grass, EnergyType.Colorless],
          damage: 20,
          text: "Echa la moneda a cara o cruz. Si sale cara, el Pokémon Defensor queda Paralizado.",
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
          name: "Polvo veneno",
          cost: [EnergyType.Grass, EnergyType.Grass, EnergyType.Grass],
          damage: 20,
          text: "El Pokémon Defensor queda Envenenado.",
          effects: [
            {
              type: AttackEffectType.ApplyStatus,
              target: AttackTarget.Defender,
              status: StatusCondition.Poisoned,
            },
          ],
        },
      ],
      retreatCost: 2,
      weaknesses: [EnergyType.Fire],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 67, "Voltorb"),
      name: "Voltorb",
      number: 67,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Lightning],
      attacks: [
        {
          name: "Derribo",
          cost: [EnergyType.Lightning],
          damage: 10,
        }
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fighting],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 68, "Vulpix"),
      name: "Vulpix",
      number: 68,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 50,
      types: [EnergyType.Fire],
      attacks: [
        {
          name: "Rayo confuso",
          cost: [EnergyType.Fire, EnergyType.Fire],
          damage: 10,
          text:
            "Echa la moneda a cara o cruz. Si sale cara, el Pokémon Defensor queda Confundido.",
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
      retreatCost: 1,
      weaknesses: [EnergyType.Water],
      resistances: [],
    }),
    createPokemonCard({
      id: makeCardId(SET, 69, "Weedle"),
      name: "Weedle",
      number: 69,
      set: SET,
      rarity: CardRarity.Common,
      stage: PokemonStage.Basic,
      hp: 40,
      types: [EnergyType.Grass],
      attacks: [
        {
          name: "Picotazo Venenoso",
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
      ],
      retreatCost: 1,
      weaknesses: [EnergyType.Fire],
      resistances: [],
    }),
    createTrainerCard({
      id: makeCardId(SET, 70, "Clefairy Doll"),
      name: "Clefairy Doll",
      number: 70,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Item,
      effect: "Juega a Muñeco Clefairy como si fuera un Pokémon Básico. No tiene ataques, no puede retirarse y no puede verse afectado por Estados Especiales. Si queda Fuera de Combate, no cuenta como Pokémon Fuera de Combate. En cualquier momento de tu turno antes de atacar, puedes descartarlo.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 71, "Computer Search"),
      name: "Computer Search",
      number: 71,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Item,
      effect: "Descarta 2 cartas de tu mano. Busca en tu mazo cualquier carta y ponla en tu mano. Baraja tu mazo después.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 72, "Devolution Spray"),
      name: "Devolution Spray",
      number: 72,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Item,
      effect: "Elige 1 de tus Pokémon evolucionados y hazlo evolucionar hacia atrás. Devuelve la carta de Evolución a tu mano.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 73, "Imposter Professor Oak"),
      name: "Imposter Professor Oak",
      number: 73,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Supporter,
      effect: "Tu rival baraja su mano en su mazo y luego roba 7 cartas.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 74, "Item Finder"),
      name: "Item Finder",
      number: 74,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Item,
      effect: "Descarta otras 2 cartas de tu mano. Pon 1 carta de Entrenador de tu pila de descartes en tu mano.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 75, "Lass"),
      name: "Lass",
      number: 75,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Supporter,
      effect: "Ambos jugadores barajan todas las cartas de Entrenador de sus manos en sus mazos.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 76, "Pokémon Breeder"),
      name: "Pokémon Breeder",
      number: 76,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Supporter,
      effect: "Pon una carta de Pokémon de Fase 2 de tu mano sobre su Pokémon Básico correspondiente. Esto cuenta como evolucionar.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 77, "Pokémon Trader"),
      name: "Pokémon Trader",
      number: 77,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Supporter,
      effect: "Cambia 1 carta de Pokémon de tu mano por 1 carta de Pokémon de tu mazo. Muestra ambas cartas y baraja tu mazo.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 78, "Scoop Up"),
      name: "Scoop Up",
      number: 78,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Item,
      effect: "Elige 1 de tus Pokémon en juego y devuelve la carta de Pokémon Básico a tu mano. (Descarta todas las cartas unidas a ese Pokémon.)",
    }),
    createTrainerCard({
      id: makeCardId(SET, 79, "Super Energy Removal"),
      name: "Super Energy Removal",
      number: 79,
      set: SET,
      rarity: CardRarity.Rare,
      trainerType: TrainerType.Item,
      effect: "Descarta 1 carta de Energía unida a 1 de tus Pokémon. Luego elige 2 cartas de Energía unidas al Pokémon Activo de tu rival y descártalas.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 80, "Defender"),
      name: "Defender",
      number: 80,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Une esta carta a 1 de tus Pokémon. Mientras esté unida, el daño hecho por ataques a ese Pokémon se reduce en 20. Descarta esta carta al final del turno de tu rival.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 81, "Energy Retrieval"),
      name: "Energy Retrieval",
      number: 81,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Pon 2 cartas de Energía Básica de tu pila de descartes en tu mano.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 82, "Full Heal"),
      name: "Full Heal",
      number: 82,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Elimina todos los Estados Especiales de tu Pokémon Activo.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 83, "Maintenance"),
      name: "Maintenance",
      number: 83,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Baraja 2 cartas de tu mano en tu mazo. Luego roba 1 carta.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 84, "PlusPower"),
      name: "PlusPower",
      number: 84,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Durante este turno, los ataques de tus Pokémon hacen 10 puntos de daño más al Pokémon Defensor.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 85, "Pokémon Center"),
      name: "Pokémon Center",
      number: 85,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Elimina todos los contadores de daño de todos tus Pokémon. Luego descarta todas las cartas de Energía unidas a esos Pokémon.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 86, "Pokémon Flute"),
      name: "Pokémon Flute",
      number: 86,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Elige 1 Pokémon Básico de la pila de descartes de tu rival y ponlo en su Banca.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 87, "Pokédex"),
      name: "Pokédex",
      number: 87,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Mira las 5 primeras cartas de tu mazo y vuelve a colocarlas arriba de tu mazo en el orden que quieras.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 88, "Professor Oak"),
      name: "Professor Oak",
      number: 88,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Supporter,
      effect: "Descarta tu mano y roba 7 cartas.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 89, "Revive"),
      name: "Revive",
      number: 89,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Pon 1 Pokémon Básico de tu pila de descartes en tu Banca con la mitad de sus PS (redondeando hacia abajo).",
    }),
    createTrainerCard({
      id: makeCardId(SET, 90, "Super Potion"),
      name: "Super Potion",
      number: 90,
      set: SET,
      rarity: CardRarity.Uncommon,
      trainerType: TrainerType.Item,
      effect: "Descarta 1 carta de Energía unida a 1 de tus Pokémon y quítale 40 puntos de daño.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 91, "Bill"),
      name: "Bill",
      number: 91,
      set: SET,
      rarity: CardRarity.Common,
      trainerType: TrainerType.Item,
      effect: "Roba 2 cartas.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 92, "Energy Removal"),
      name: "Energy Removal",
      number: 92,
      set: SET,
      rarity: CardRarity.Common,
      trainerType: TrainerType.Item,
      effect: "Descarta 1 carta de Energía unida al Pokémon Activo de tu rival.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 93, "Gust of Wind"),
      name: "Gust of Wind",
      number: 93,
      set: SET,
      rarity: CardRarity.Common,
      trainerType: TrainerType.Item,
      effect: "Elige 1 Pokémon en la Banca de tu rival y cámbialo por su Pokémon Activo.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 94, "Potion"),
      name: "Potion",
      number: 94,
      set: SET,
      rarity: CardRarity.Common,
      trainerType: TrainerType.Item,
      effect: "Quita 20 puntos de daño de 1 de tus Pokémon.",
    }),
    createTrainerCard({
      id: makeCardId(SET, 95, "Switch"),
      name: "Switch",
      number: 95,
      set: SET,
      rarity: CardRarity.Common,
      trainerType: TrainerType.Item,
      effect: "Cambia tu Pokémon Activo por 1 de tus Pokémon en la Banca.",
    }),
  createEnergyCard({
    id: makeCardId(SET, 96, "Double Colorless Energy"),
    name: "Double Colorless Energy",
    number: 96,
    set: SET,
    rarity: CardRarity.Common,
    energyType: EnergyType.Colorless,
    isBasic: false,
  }),
  createEnergyCard({
    id: makeCardId(SET, 97, "Fighting Energy"),
    name: "Fighting Energy",
    number: 97,
    set: SET,
    rarity: CardRarity.Common,
    energyType: EnergyType.Fighting,
    isBasic: true,
  }),
  createEnergyCard({
    id: makeCardId(SET, 98, "Fire Energy"),
    name: "Fire Energy",
    number: 98,
    set: SET,
    rarity: CardRarity.Common,
    energyType: EnergyType.Fire,
    isBasic: true,
  }),
  createEnergyCard({
    id: makeCardId(SET, 99, "Grass Energy"),
    name: "Grass Energy",
    number: 99,
    set: SET,
    rarity: CardRarity.Common,
    energyType: EnergyType.Grass,
    isBasic: true,
  }),
  createEnergyCard({
    id: makeCardId(SET, 100, "Lightning Energy"),
    name: "Lightning Energy",
    number: 100,
    set: SET,
    rarity: CardRarity.Common,
    energyType: EnergyType.Lightning,
    isBasic: true,
  }),
  createEnergyCard({
    id: makeCardId(SET, 101, "Psychic Energy"),
    name: "Psychic Energy",
    number: 101,
    set: SET,
    rarity: CardRarity.Common,
    energyType: EnergyType.Psychic,
    isBasic: true,
  }),
  createEnergyCard({
    id: makeCardId(SET, 102, "Water Energy"),
    name: "Water Energy",
    number: 102,
    set: SET,
    rarity: CardRarity.Common,
    energyType: EnergyType.Water,
    isBasic: true,
  }),
];
