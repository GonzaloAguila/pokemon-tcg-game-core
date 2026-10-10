# Card doubts — for the owner to review

Each entry: card, the question, what was implemented meanwhile. Agents append here; keep entries short.

## Decisions taken by default (confirm or change)

- **Non-holo duplicates excluded** (Fossil #16–30; Team Rocket #18–31, #71, #72, #80), as in Jungle.
- **Dark Raichu (TR #83, "Rare Secret")** mapped to `CardRarity.RareHolo` (no secret rarity in the enum).
- **Starter decks and cosmetic skins** not changed for the new sets.
- **Mysterious Fossil in setup/mulligan**: treated as a Basic Pokémon ("play as if it were a Basic Pokémon").

## Open questions

### Stage A (wrapping Base Set / Jungle trainers and powers — behavior kept unless noted)

- **Devolution Spray (BS #72)**: the printed card says "choose a Stage, *discard* all Evolution cards of that Stage or higher". The engine (and the catalog's Spanish text) removes ONE stage and returns it to the hand. Kept as is. Fixed meanwhile (unambiguous): the devolved Pokémon loses Special Conditions and attack effects ("just as if you had evolved it") and is Knocked Out when its damage ≥ the lower stage's HP (it used to stay in play with damage ≥ HP).
- **Energy Removal (BS #92)**: the printed card allows an Energy on *any* of the opponent's Pokémon; the engine and catalog text only allow the opponent's Active. Kept.
- **Super Energy Removal (BS #79)**: the catalog text says "the opponent's Active", the engine allows any opponent Pokémon (matches the printed card). Catalog text is the doubt.
- **Full Heal (BS #82)**: the engine refuses it when the Active has no condition (the card can be played anyway, to no effect), and it also removes Leer's "can't attack", which is not a Special Condition. Kept.
- **Poké Ball (JU #64)**: on heads the player "may" search; the registry requires choosing a Pokémon when the deck has one, and the deck is not shuffled when nothing is taken. Kept.
- **Peek (Mankey)**: "one of either player's Prizes" — the engine picks the prize at random instead of letting the player choose. Kept.
- **Damage Swap (Alakazam)**: one use = one move of N counters between two Pokémon (the API's `amount` semantics); the card moves 1 counter per use, as often as you like. Equivalent outcomes.

### Stage B (Fossil)

- **Mysterious Fossil (FO #62) — type**: the card has no type; in play it is a Pokémon with `types: []` and no Weakness/Resistance (Chain Lightning, Shift and Conversion see no type). Consumers that read `types[0]` must handle an empty list.
- **Mysterious Fossil — discard from play**: refused when it is your only Pokémon in play (instead of allowing it and losing). Discarding the Active Fossil leaves `playerNeedsToPromote` set (like Scoop Up); the turn continues after the promotion.
- **Mysterious Fossil — outside play it is a Trainer**: Poké Ball, Pokémon Trader, Revive, Pokémon Flute and Call for Family don't find it (they look for Pokémon cards); Item Finder, Lass, Computer Search, Recycle and Scavenge do. Kabuto/Omanyte/Aerodactyl on top of it give a Prize when Knocked Out; the Fossil under them goes to the discard pile as the Trainer.
- **Clefairy Doll (BS #70)**: was unplayable; it now uses the same data-driven rules as Mysterious Fossil (`playsAsBasic: { hp: 10 }`: 10 HP, no attacks, can't retreat, no Special Conditions, no Prize when Knocked Out, may be discarded from play). This is a Base Set behavior change (the card becomes playable).
- **Toxic Gas (Muk, FO #13)**: works from the Bench too and affects both players' Pokémon (other Toxic Gases excepted). Mysterious Fossil's rules are not a power and keep working. Charizard's Energy Burn auto-conversion inside `canUseAttack` only sees Toxic Gas when the caller passes the state.
- **Prehistoric Power (Aerodactyl, FO #1)**: works from the Bench and blocks both players (Evolution cards from hand and Pokémon Breeder). Devolution Spray is not "playing an Evolution card" and stays legal.
- **Clairvoyance (Omanyte, FO #52)**: works from the Bench; exposed as `isHandRevealed(state, side)` for consumers (the API must stop masking that hand).
- **Kabuto Armor (Kabuto, FO #50)**: halving is applied after Weakness/Resistance AND after PlusPower, Defender and Minimize (the text only says "after applying Weakness and Resistance"); it also halves bench damage (Kabuto on the Bench), self-damage of an attack and the damage of chosen bench targets, but not confusion damage (not "an attack doing damage").
- **Curse (Gengar, FO #5)**: a Knock Out caused by Curse gives the Prize automatically (like bench Knock Outs; `checkKnockouts`), and a Knocked Out Active leaves `opponentNeedsToPromote` set during the Curse user's turn (the opponent picks the new Active, then the turn continues).
- **Cowardice (Tentacool, FO #56)**: refused when Tentacool is your only Pokémon in play; returning the Active leaves `playerNeedsToPromote` (like Scoop Up). "The turn you put Tentacool into play" = `playedOnTurn` (setup counts as turn 0, so it can be used on turn 1).
- **Step In (Dragonite, FO #4)**: not a retreat (the retreat of the turn is still available); the Pokémon sent to the Bench loses Special Conditions and attack effects like any switch.
- **Transform (Ditto, FO #3)**: the copy keeps Ditto's name, id and power (only Transform: the copied card's own power is not gained) and takes the stage, HP, type, Weakness, Resistance, attacks and Retreat Cost of the opposing Active (it copies at all times while both are Active, not only "during an attack"). A Ditto facing another Ditto is a plain Ditto. Facing a Mysterious Fossil it becomes a 10 HP Pokémon without attacks, but still gives a Prize when Knocked Out. Double Colorless Energy counts as 2 Energy of any type. When the copy's HP drops below Ditto's damage (new Defending Pokémon, Ditto falls Asleep, Toxic Gas arrives) Ditto is Knocked Out right away (state-based `checkKnockouts` after attacks, trainers, powers, retreat, evolution, promotion and in endTurn), with the Prize taken automatically.
- **Transparency (Haunter, FO #6)**: implemented for the Defending Haunter only (a Benched Haunter hit by bench damage doesn't flip: bench targets are often chosen after the coins). The coin is part of the attack's coins (LAST in `coinResults`, see `getAttackCoinPlan`) and is flipped whenever the attack can do something to the Defending Pokémon (damage or an effect on it), even if the attack then does nothing (e.g. Twineedle tails/tails). Heads prevents damage and every effect on Haunter (like Agility); the attacker's own effects (self damage, bench damage) still happen.
- **Stone Barrage (Geodude, FO #47)**: coins are a run ending in the first tails (`attack: "untilTails"` in the coin plan); Metronome copying it does the same.
- **Thunderstorm (Zapdos, FO #15)**: coin i is for the i-th Benched Pokémon in bench order; self damage is 10 × tails (Kabuto Armor would halve none of it: Zapdos isn't Kabuto).
- **Gigashock (Raichu, FO #14)**: with 3 or fewer Benched Pokémon all are hit without asking; with more, exactly 3 must be chosen.
- **Prophecy (Hypno, FO #8)**: "look at up to 3" is implemented as the top 3 (or all if fewer); the attacker picks the deck, then the new order.
- **Wildfire (Moltres, FO #12)**: only Fire Energy cards (not Double Colorless) can be discarded; 0 is allowed; mills as many as the deck has.
- **Energy Conversion (Gastly, FO #33)**: the 2 Energy cards come from the discard pile as it was before the attack (Energy discarded by this attack's self-Knock Out can't be taken: the text recovers first, then does the damage).
- **Scavenge (Slowpoke, FO #55)**: the Psychic Energy discard is a cost (like Fire Spin, `selectedEnergyIds` / auto-pick); with no Trainer in the discard pile the attack still works.
- **Headache (Psyduck, FO #53)**: blocks every Trainer, including playing Mysterious Fossil / Clefairy Doll as a Basic. Not stopped by protection or Transparency (it affects the player, not the Defending Pokémon).
- **Clamp / Dive Bomb tails ("does nothing")**: no damage, no PlusPower, no effects; the attack counts as used and the turn ends.
- **Hyper Beam — Dragonair (BS #18) behavior change**: its "choose 1 Energy of the Defending Pokémon and discard it" was never applied by the engine (data only); it now uses the same pending attack choice as Golduck's Hyper Beam. Consumers must handle `pendingAttackChoice` (see Stage C).
- **Leech Life — Venonat (JU #63) fix**: healed a fixed 10; it now heals the damage actually done (after W/R; 0 if prevented), like Golbat/Zubat.
- **Mega Drain (Butterfree, JU #33)**: the printed card most likely says "(rounded up to the nearest 10)" like Absorb; the engine still rounds down (no source data for Jungle here). Kept; please confirm.
- **Agility-type protection vs Hurricane (Pidgeot, JU #8)**: fixed on the way — "prevent all effects of attacks" now also stops the return to the hand (it used to happen).
- **Transform while the other side has no Active** (after a Knock Out, before the promotion): Ditto is a plain Ditto meanwhile but is not Knocked Out by the HP change; the check runs once the new Active is promoted (and then uses the new copy).
- **Energy Search (FO #59)**: refused only with an empty deck; with no basic Energy in the deck it is played and finds nothing (the deck is shuffled). When there is one, picking it is required (no "fail to find").
- **Recycle (FO #61)**: any card of the discard pile (Energy included); playable with an empty discard pile (the coin is still flipped).
- **Gambler (FO #60)**: the Gambler itself is not shuffled in (it goes to the discard pile); with a short deck you draw what is left.
- **Mr. Fuji (FO #58)**: a Mysterious Fossil under a Kabuto goes back into the deck as the Trainer card.
