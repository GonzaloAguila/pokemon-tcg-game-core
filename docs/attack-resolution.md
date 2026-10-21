# Attack resolution (0.10.2)

One ordered process for every attack (`executeAttack`, `executeMetronome`, copied attacks, the
resume of a paused attack). No card handles its own Knock Outs or Prizes: the effects only put
damage, and steps 5-8 are the shared Knock Out check (`checkKnockouts` in `src/lib/gameState.ts`),
which also runs after the between-turns checkup, Trainers, powers, retreat, evolution and
promotions.

| Step | What happens | Where |
|---|---|---|
| 1. Costs and pre-damage | `canExecuteAttack` (turn, statuses, Energy, requirements, one attack per turn); a chosen discard cost must pay it (`checkDiscardSelection`: one attached Energy card per entry; Colorless = any Energy card); Confusion flip (`resolveConfusionFlip`); pre-attack reactions (Ninja Trick); coins in `getAttackCoinPlan` order (Smokescreen, power, attack, Stadium, defender coin last); "before damage" effects (Group Attack) | `executeAttack`, `resolveConfusionFlip`, `attackChoices.ts` |
| 2. Damage to the Defending Pokémon | base (incl. coin math, bonuses) → Weakness ×2 → Resistance −30 → PlusPower +10 / Misty +20 → Defender −20 → next-turn reductions → barriers / protection / powers (Invisible Wall, Kabuto Armor...) → floor 0 | `executeAttack` |
| 3. Damage to Benched Pokémon | no Weakness / Resistance unless the card says so (Spiral Dive...); Defender, Kabuto Armor, Bench Guard, Transparent Walls apply; chosen targets may wait for the player (`pendingBenchDamageSelection`, `pendingAttackChoice`) | `executeAttack`, `executeBenchDamage`, `dealChosenTargetDamage` |
| 4. Attacker and after-effects | recoil / Selfdestruct, Juxtapose, Strikes Back, Restless Sleep, Destiny Bond, Final Beam, Mirror Shell, Crosscounter, Shock Blast, status conditions, discards, draws, switches | `executeAttack` |
| 5. One Knock Out check | every Pokémon in play of both players with damage >= its HP is Knocked Out at the same time (the damage step's decisions are passed as `forcedKnockOuts`, so a transformed Ditto's HP changing afterwards doesn't undo them); repeated while a Knock Out changes a Ditto's copy | `checkKnockouts` → `sweepKnockOuts` |
| 6. Prizes | each player is owed one Prize per opposing Pokémon Knocked Out (Mysterious Fossil / Clefairy Doll / a table's `noPrizeFor` give none): `playerPrizesOwed` / `opponentPrizesOwed` (`prizesOwed(state, side)`, never more than the Prizes left), picked one by one with `takePrize`; the attacker's lines are logged first; nothing is taken automatically except a count that covers every Prize left | `sweepKnockOuts`, `takePrize` |
| 7. Win checks | a side owed all its Prizes left takes them and wins; a side with no Pokémon in play loses; both at once → the player whose turn it is wins (stand-in for Sudden Death); deck-out at the next draw | `settleGameEnd`, `endGameIfNoPokemonLeft` |
| 8. Promotions | a side whose Active was Knocked Out (Bench not empty) must promote, after taking its Prizes: the defending player first (single-player: `executeAttack` auto-promotes the AI defender unless `skipDefenderPromotion`), then the attacker | `executeAttack` (PROMOTIONS), `promoteActivePokemon` |
| 9. End of turn | `endTurn` unless a Prize is owed (either side), a promotion or a choice is due; then the last `takePrize` (its `shouldEndTurn` only ends a turn that is already over: `attackedThisTurn` or the paused checkup) or the promotion ends it | `executeAttack`, `takePrize`, consumers |

## Rules followed (classic era)

- Weakness / Resistance only for the Defending Pokémon; "Don't apply Weakness and Resistance for
  Benched Pokémon" is printed on every bench-damage card of the era.
- "When a Pokémon is Knocked Out, its owner puts it and all cards attached to it into the discard
  pile; the opponent takes one of his or her Prize cards" (Base Set rulebook, 1999) — one per
  Pokémon, so several Knock Outs at once owe several Prizes, and the owner chooses which face-down
  Prize card to take.
- Knock Outs are checked once the attack is over (all its damage and effects), for every Pokémon.
- Both players winning at the same time: Sudden Death in the 1999 rulebook — not modelled (the
  player whose turn it is wins; a documented deviation, see "Open questions").
- Promotion order when both Actives are Knocked Out: the defending player, then the attacking player
  (convention of the later rulebooks: the player whose turn it is promotes last; the 1999
  rulebook doesn't order it).

## Open questions

- Sudden Death: a real mini-game (1 Prize each) or `"draw"` instead of the turn-player rule.
- Fire Spin (Base Set Charizard): the catalog's Spanish text says "2 cartas de Energía Fuego"; the
  printed English text may be "2 Energy cards" (any type) — `discardCostRequirement` follows the
  catalog.
