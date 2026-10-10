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
