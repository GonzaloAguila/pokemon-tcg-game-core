# Coin-flip attack effects

Inventory of every attack effect that depends on the attacker's own coin flips, what each
consumer did with it before the engine owned it, and the classic (Base Set / Jungle) rule.

Since `refactor/engine-coin-flips` the engine resolves all of them when the caller passes the
coins: `executeAttack(state, i, { coinResults })` / `executeMetronome(state, attack, { coinResults })`,
with `getAttackCoinFlipCount(state, i | attack)` telling how many coins to flip. The legacy
positional signature still skips coin effects, so the frontend and the API keep working until
they migrate.

Consumers reviewed (2026-10-10):

- **FE** — `pokemon-tcg/src/features/game/hooks/useCoinFlipHandler.ts` (attack and Metronome
  sections) + coin count in `useAttackFlow.ts`
- **API** — `pokemon-tcg-api/src/socket/rooms.ts` (`applyCoinFlipEffects` + the `attack` case)
- **AI** — `src/domain/ai/executor.ts` (`executeOpponentAttack`), migrated to the engine path in this branch

## Inventory (catalog data, Base Set + Jungle)

All coin effects of one attack share the same flips (Thrash: one coin decides +10 or 10 to itself).

| Effect (data) | Cards / attack | Classic rule |
|---|---|---|
| `applyStatus` + `coinFlip.onHeads: <status>` | Alakazam Confuse Ray, Clefairy Sing, Gyarados Bubblebeam, Magneton/Magnemite Thunder Wave, Beedrill/Weedle Poison Sting, Electabuzz Thundershock, Dewgong Ice Beam, Kakuna Poisonpowder, Abra Psyshock, Caterpie String Shot, Drowzee/Vulpix Confuse Ray, Gastly Sleeping Gas, Metapod Stun Spore, Squirtle Bubble, Starmie Star Freeze, Tangela Bind, Pinsir Irongrip, Snorlax Body Slam, Lickitung Tongue Wrap/Supersonic, Nidorina Supersonic, Weepinbell Poisonpowder, Oddish/Venonat Stun Spore | Heads: the Defending Pokémon gets the condition. Not if it was knocked out, not through Agility/Barrier-type protection, not on Snorlax (Thick Skinned) for special conditions. |
| `applyStatus` heads + `additionalStatuses` | Venomoth Venom Powder | Heads: Confused **and** Poisoned. |
| `applyStatus` heads/tails | Koffing Foul Gas | Heads Poisoned, tails Confused. |
| `applyStatus` target self, `onTails` | Primeape Tantrum, Tauros Rampage | Tails: the attacker is Confused (after damage). |
| `applyStatus` `onHeads: cannotAttack` | Rhyhorn Leer | Heads: the Defending Pokémon can't attack during the opponent's next turn. Not a special condition, so Thick Skinned does not stop it; Agility-type protection does. |
| `coinFlipDamage` `"Nx"` / no printed damage | Beedrill Twineedle, Dragonair Slam, Jynx Doubleslap, Nidorino/Nidorina Double Kick, Poliwhirl Doubleslap, Doduo Fury Attack, Farfetch'd Leek Slap, Nidoran♂ Horn Hazard, Jolteon Pin Missile, Kangaskhan Comet Punch, Vileplume Petal Dance, Marowak Bonemerang, Primeape / Nidoran♀ Fury Swipes | Damage = amount × heads, then weakness ×2, resistance −30, PlusPower, Defender, protection — once, on the total. 0 heads: the attack does nothing (no PlusPower). |
| `coinFlipDamage` `"N+"` | Nidoking Thrash (30+10), Flareon/Jolteon/Vaporeon/Eevee Quick Attack (10+20), Rapidash/Tauros Stomp (20+10) | Printed damage + amount on heads, as ONE damage value before weakness/resistance. |
| `bonusDamage` + coinFlip | Electabuzz Thunderpunch (30+10) | Same as above. |
| `coinFlipDamage` + `coinCountFromEnergy` | Exeggutor Big Eggsplosion | One coin per Energy attached to the attacker. **Assumption:** Double Colorless counts as 2 (it provides 2 Energy), via `getTotalEnergyValue`. |
| `selfDamage` `onTails` | Raichu/Zapdos Thunder (30), Electrode Electric Shock (10), Pikachu Thunder Jolt (10), Nidoking Thrash (10), Electabuzz Thunderpunch (10) | Tails: damage to the attacker (no weakness/resistance; Defender reduces it). A self-KO gives the opponent one prize. |
| `protection` heads, `damageOnly` | Chansey Scrunch, Kakuna/Metapod Stiffen, Squirtle/Wartortle Withdraw | Heads: prevent all damage to it during the opponent's next turn (other effects still happen). |
| `protection` heads, `damageAndEffects` | Raichu/Fearow/Rapidash Agility, Eevee Tail Wag | Heads: prevent damage and all effects. |
| `preventRetreat` heads | Victreebel Acid | Heads: the Defending Pokémon can't retreat during the opponent's next turn (blocked by Agility-type protection). |
| `draw` heads (data uses `onHeads: "damage"`) | Meowth Pay Day | Heads: draw 1 card. |
| Metronome copying any of the above | Clefairy / Clefable Metronome | The copied attack's coins are flipped by Metronome's user (Big Eggsplosion counts Clefairy's Energy); damage uses Clefairy's Colorless type. |

## Disagreements found (each is a rule bug in at least one consumer)

| # | Topic | FE | API | AI (before) | Correct |
|---|---|---|---|---|---|
| 1 | Big Eggsplosion coin count | attack path: `getTotalEnergyValue` (DCE = 2); confusion→attack chain: `attachedEnergy.length` (DCE = 1) | `coinFlip.count` = **1 coin** always | `coinFlip.count` = **1 coin** always | One coin per Energy (assumed DCE = 2). |
| 2 | Coin damage vs weakness/resistance | Applied as a **second hit** with its own W/R: resistance −30 is subtracted **twice** on `N+` attacks; uses printed type (ignores Venomoth Shift and Conversion `modifiedWeakness/Resistance`) | **No W/R at all** — raw `amount × heads` added to `currentDamage` | Second hit with its own W/R (double resistance), printed type | One damage value: base + coin damage, then W/R once. |
| 3 | PlusPower on coin damage | Not applied to `Nx` attacks (base 0) | Not applied | Not applied to `Nx` | Applied when the attack does damage. |
| 4 | Defender on coin damage | Not applied to the coin part | Not applied | Not applied | −20 on the total. |
| 5 | Protection / Invisible Wall | Checked **per chunk**: Stomp 20+10 vs Mr. Mime deals 30 (should be blocked); Thrash 30+10 vs Onix Harden lets 10 through (should deal 40) | **Ignored** (Scrunch/Stiffen/Withdraw don't stop coin damage) | **Ignored** | Checked once on the total. |
| 6 | KO from coin damage | Auto-promotes the opponent's first bench Pokémon (no choice); no Strikes Back, Destiny Bond, Mirror Move `lastDamageReceived`, bench-KO sweep | **No KO check** — a Pokémon can sit at damage ≥ HP | Discards and flags the prize, but no Strikes Back / Destiny Bond / `lastDamageReceived` | Normal attack KO flow. |
| 7 | Thunderpunch (`bonusDamage` + coin) | Handled (with the bugs above) | Raw +10 | **Ignored** (only `coinFlipDamage` handled) | +10 on heads. |
| 8 | Several coin effects in one attack (Thrash, Thunderpunch) | All handled | All handled | **Only the first** coin effect: tails self-damage never happens | All effects share the flips. |
| 9 | Self-damage on tails | KO sets `opponentCanTakePrize` (manual pick) instead of the engine's auto-taken single prize; no last-prize defeat check | Raw damage: **no Defender, no KO check** | **Never applied** (no handler) | Defender reduces it; self-KO → opponent auto-takes one prize; defeat on last prize/no bench. |
| 10 | Status vs Agility/Barrier/Tail Wag (`damageAndEffects`) | Not checked | Not checked | Not checked | Blocked. |
| 11 | Status vs Snorlax Thick Skinned | Checked (but also blocks Leer, which isn't a special condition) | **Not checked** | **Not checked** | Blocks special conditions only. |
| 12 | Acid vs `damageAndEffects` protection | Not checked | Not checked | Not checked | Blocked. |
| 13 | Meowth Pay Day | Never draws | Heads adds **+1 damage to Meowth** (generic `onHeads === "damage"` branch, target self) | Never draws | Heads: draw 1. |
| 14 | Protection default type when `protectionType` is missing | `damageOnly` | `damageAndEffects` | `damageOnly` | Latent: every catalog entry sets it. |
| 15 | Turn end after coin effects | Ends unless prize/ForceSwitch/SelfSwitch (ignores DeckSearch / bench selection) | Calls `endTurn` after effects | Calls `endTurn` | Engine rules (all pending flags). Latent for current cards. |
| 16 | Coin event order | After the attack message | Before | After | Engine: before the attack message. |

## Related, not covered by this change

- **Sand-attack / Smokescreen** (`mustFlipToAttack`): engine-owned since Stage A. It adds one coin
  to `getAttackCoinFlipCount` (the FIRST of `coinResults`); tails → the attack does nothing and the
  turn ends. Only the options form enforces it (the legacy positional form has no coins).
- **Confusion** stays a separate step: call `resolveConfusionFlip` before ANY attack, including
  Metronome and Porygon's Conversion 1/2 (both consumers checked those before confusion, so a
  confused Clefairy never flipped).
- **Conversion 1/2** (Porygon) is not a coin effect but is also consumer-owned (FE
  `useAttackFlow.ts`, API `rooms.ts` attack case); the engine has no resolver.
- **Metronome as an AI attack**: the attack has no effect data, so the AI choosing it deals 0.
- AI damage estimates (`ai/actions.ts`) still use the nominal printed number for coin attacks
  (Twineedle estimates 0).

## Fossil (Stage B): coin plans

`getAttackCoinPlan(state, attack)` describes the coins of an attack in the order they go in
`coinResults`; `flipAttackCoins(plan, flip)` builds that list:

| Part | When | Count |
|---|---|---|
| `smokescreen` | the attacker is under Sand-attack / Smokescreen | 1 coin, FIRST; tails = the attack does nothing |
| `attack` | the attack's own coin effects (they all share these coins) | a fixed number, or `"untilTails"` = a run of heads ending in the first tails (Stone Barrage) |
| `defender` | the Defending Pokémon is a Haunter with a working Transparency and the attack can do something to it | 1 coin, LAST; flipped for the defending player; heads = everything the attack does to Haunter is prevented |

`getAttackCoinFlipCount` is the total for fixed plans (for `"untilTails"` it is only the
minimum). `executeAttack` throws when `coinResults` doesn't fit the plan.

New coin effects in the Fossil catalog:

| Effect (data) | Cards | Rule |
|---|---|---|
| `coinFlipDamage` + `untilTails` | Geodude Stone Barrage | 10 × heads, flipping until tails |
| `benchDamage` `perCoinBenchTarget` + `coinCountSource: "opponentBench"`, `selfDamage` on tails | Zapdos Thunderstorm | one coin per opponent's Benched Pokémon (bench order): heads 20 to it; Zapdos takes 10 × tails |
| `benchDamage` heads (opponent) / tails (own) | Articuno Blizzard | 10 to each Benched Pokémon of that side |
| `attackFails` on tails | Moltres Dive Bomb, Cloyster Clamp | tails: the attack does nothing (not even damage) |
| `forceSwitch` heads + `switchChosenBy: "opponent"` | Arbok Terror Strike | heads: damage first, then the opponent picks the new Defending Pokémon (pending attack choice) |
| `heal` heads | Slowpoke Spacing Out | remove 1 counter (needs damage counters to be used) |
| `protection` heads | Shellder Hide in Shell, Seadra Agility | as Withdraw / Agility |

## Team Rocket (Stage D): coin conventions

| Coins | Where | Who flips | Meaning |
|---|---|---|---|
| attack coins with `attackFlipper: "opponent"` | `getAttackCoinPlan` | the defending player | Knock Down (tails +20), Bench Manipulation (one per opponent's Benched Pokémon, 20 × tails, no W/R) |
| `defender` coin of a Defending Dark Gyarados | `getAttackCoinPlan` (LAST, like Transparency) | the defending player | Final Beam: used only when the attack Knocks it Out; heads = 20 × Water Energy to the attacker (W/R) |
| `coinCountFromEnergyType: Fire` | Continuous Fireball | attacker | one coin per Fire Energy card; 50 × heads and that many Fire Energy cards discarded |
| `minHits: 2` | Petal Whirlwind | attacker | 3 coins, 30 × heads; Confused with 2+ heads |
| `secondCoinAmounts` | Surprise Thunder | attacker | always 2 coins: heads/heads 20, heads/tails 10 to each opponent's Benched Pokémon, tails first = nothing |
| `getRetreatCoinFlips(state)` → `executeRetreat(state, ids, i, { coinResults })` | retreat | the retreating player | Confused Active: one coin first (Base Set rule; the Energy is paid, tails = it stays Active, the retreat of the turn is used and the other coins are ignored). Sinkhole: one coin per working Dark Dugtrio of the opponent; tails = 20 to the Pokémon that retreated |
| `getTrainerCoinFlips` = `"untilTails"` | Digger | coin i: you (even i), the opponent (odd i) | the one who got the tails does 10 to their own Active |
| `getPowerCoinFlips` = 1 | Long-Distance Hypnosis, Pollen Stench | power owner | heads: Defending Pokémon Asleep / Confused; tails: your Active |
| `getTrainerCoinFlips` = 1 | Sleep! | player | heads: Defending Pokémon Asleep |
