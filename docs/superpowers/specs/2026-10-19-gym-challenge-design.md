# Gym Challenge — design

**Date:** 2026-10-19 · **Status:** catalog done (branch `feat/gym-challenge`, data only); effects pending the owner's answers to `docs/card-doubts.md` → "Gym Challenge" · **Owner request:** code Gym Heroes and Gym Challenge, then a vs-AI Gym Leader mode with their themed decks ("prepara todo", 2026-10-19). This spec covers **Gym Challenge only**; the Gym Leader mode gets its own spec (what it needs from this set is listed at the end).

**Approach (agreed, same as Gym Heroes):** the engine first (catalog, new mechanics, a test per card with an effect, bot simulator), then API and frontend in parallel, card doubts logged for the owner, then publish. The whole set ships at once: until every effect is in, the set stays `inDevelopment` (see below) and no booster sells it.

## Source data

- `data/pokemontcg/gym2.json` (api.pokemontcg.io, set `gym2`, 132 cards) is the source of truth for card data; card texts were checked against the printed cards (one fix: Rocket's Minefield Gym's text is cut short in the source — "put 2 damage counters").
- Composition: 54 Basic, 33 Stage 1, 8 Stage 2, 24 Trainers + 7 Stadiums, 6 basic Energy. Rarities: 20 Rare Holo, 21 Rare, 42 Uncommon, 43 Common, 6 Energy. 13 Pokémon Powers, 163 attacks (137 with text).
- Owners: Blaine 15, Brock 9, Erika 9, Giovanni 16, Koga 18, Lt. Surge 9, Misty 11, Rocket 4, Sabrina 16. **Giovanni and Koga are new owners** (added to `POKEMON_OWNERS`; `ownerOf("Koga's Beedrill") === "Koga"`).
- Reprints inside the set: Blaine (#17 / #100), Giovanni (#18 / #104), Koga (#19 / #106), Sabrina (#20 / #110) are holo / non-holo printings → one catalog card each (the holo number). The 6 basic Energy (#127–132) are the Base Set ones. **122 catalog cards**: 95 Pokémon, 20 Trainers, 7 Stadiums.
- Same-name printings inside the set (Sabrina's Abra #93/#94, Sabrina's Gastly #96/#97, Giovanni's Meowth #43/#74, Koga's Koffing #48/#79, Koga's Pidgey #49/#80) are separate cards; the deck limit counts them together (by name).
- Cross-set lines by owner name work as is: Gym Challenge evolutions of Gym Heroes Basics (Blaine's Charmander → Blaine's Charmeleon → Blaine's Charizard, Sabrina's Abra → Sabrina's Kadabra → Sabrina's Alakazam…) evolve by exact `evolvesFrom` name.
- Images: `https://pkmncards.com/wp-content/uploads/{slug}-gym-challenge-{n}.jpg` (Gym Heroes' slug rules: apostrophes and `#` dropped, the dot kept, ♀/♂ → female/male; Lt. Surge's Jolteon is misspelled `lit.-surges-…` on pkmncards and special-cased). `npm run check-images -- --set gym-challenge`: 122/122 answer 200.

## Done on the branch (data only)

- `CardSet.GymChallenge = "Gym Challenge"`, `CARD_SETS` entry `{ id: "gym-challenge", code: "G2", releaseDate: "2000-10-16", totalCards: 132, inDevelopment: true }`, `gymChallengeCards` (`src/domain/catalog/gym-challenge.ts`, generated from the source + a reviewed translation table: Spanish attack / power names and texts, Pokémon and Trainer names in English), `getGymChallengeImageUrl`, `test/gym-challenge-catalog.test.ts` (every card against gym2.json, one Spanish name per English attack name, image URL rules, pools).
- **`CardSetInfo.inDevelopment`** (+ `isSetInDevelopment(card)`): a set whose effects aren't implemented. The engine keeps it out of its random pools (`allSetIds()` → simulator default sets, `buildMixDeck`'s cross-set line search, Lucky Duel's tables); `--sets gym-challenge` still includes it for the implementation tasks. Consumers must hide it too (see the plan's consumer tasks) — the API catalog and the frontend iterate `CARD_SETS`. The last engine task removes the flag.
- The 20 non-Stadium Trainers are in `UNSUPPORTED_TRAINERS` (the registry coverage test now allows only in-development names there); each implementation task removes its names. The 7 Stadiums already play through the generic `playStadium` fallback (in play, no rule yet).
- The 13 powers use 12 placeholder `PokemonPowerType` values (data only, commented "Gym Challenge") + `OnPlayFromHand` for Call the Boss (no `ON_PLAY_POWERS` entry yet → nothing happens). No attack has `effects`.

## New rules the engine needs

What Gym Heroes machinery already covers (reuse, don't rebuild): owners (`hasOwner`), Stadium state and hooks (`domain/stadiums/rules.ts`, `STADIUM_ACTIONS` for activated Stadiums like Celadon City Gym), attached Trainers (`trainers/attached.ts`: Charity / ESP), opponent-answered steps (`chooser: "opponent"`, `stepForAnswerer`, `defaultSelection` for the answer clock), mid-attack reactions (`pendingAttackChoice.reaction`: Flee / Bench Guard), Recall's `getAvailableAttacks` indices, the defender coin slot (Final Beam / Pollen Defense), turn modifiers (Misty), set-aside hands (hidden-card masking), `maxBenchSize`, turn-long locks by attack name (Tunneling), Metronome's copy flow, `powersSuppressed`, Transform's `getEffectivePokemonCard` / `getEffectiveHp`. Genuinely new:

### 1. Live HP and card copies

- **HP modifiers** in `getEffectiveHp`: Gaseous Form (+10 per Psychic Energy card attached), Giant Growth (max HP 80 until Benched). A lower HP Knocks Out through the existing state-based `checkKnockouts`.
- **Shapeshift** (Brock's Ninetales): an Evolution card attached to it (a new `PokemonInPlay.shapeshiftCard`) becomes a second source for `getEffectivePokemonCard` (name, types, HP, W/R, retreat, attacks; never its power). Discarded when it becomes Asleep / Confused / Paralyzed, or by its owner during the turn; leaves play with it (`cardsLeavingPlay`).
- **Psylink** (Sabrina's Alakazam): `getAvailableAttacks` appends the printed attacks of the owner's other Psychic Pokémon in play (after own and Recall attacks; indices stay stable for a paused attack because the board is untouched while paused).

### 2. Attack-time triggers and coins

- **Pre-attack reaction** (Koga's Ninja Trick): asked after the Confusion flip and before any coin of the attack, so the coin plan is computed for the Defending Pokémon that actually takes the attack. New `getAttackPreReaction(state, i)` (or `executeAttack` without coins returning the pending reaction) → `resolveAttackChoice` switches → the caller then asks `getAttackCoinPlan` on the new state. MP: the server must not flip the attack's coins before the answer.
- **Power coins in the attack plan** (Rebellion): 2 coins after the Smokescreen coin, before the attack's own coins (`plan.powerCoins`), only while the power works.
- **Knock Out prevention coin** (Fortitude): a defender coin (flipped by its owner) used only if the attack would Knock it Out; heads leaves 10 HP. Also **Energy Drain** (Koga's Muk, defender coin used only if damaged) and **Shock Blast** (Lt. Surge's Electrode, tails = 20 to both Actives after the attack): same slot as Pollen Defense, more than one may apply (order: the existing `defenderCoinKind` order + these).
- **State-based self-shuffle** (Scram): in `checkKnockouts`' sweep, a working Primeape with exactly 10 HP left goes into its owner's deck with its cards (no Prize).

### 3. Damage hooks

- **Relaxing Scent**: global halving (rounded up) of attack damage to any Pokémon while an Erika's Ivysaur is a working Active — next to Kabuto Armor's `applyDamageHalving` step but for every Pokémon.
- **Stadiums**: `stadiumIgnoresWeakness(state, attacker, defender)` (Cinnabar City Gym), `stadiumResistanceModifier` (Resistance Gym, −20), Rocket's Minefield Gym (below), Fuchsia / Saffron City Gym (`STADIUM_ACTIONS`), Viridian City Gym (evolution hook), Chaos Gym (Trainer pipeline, below).
- **Transparent Walls**: a side flag `benchProtectedUntilTurn` (expires like other next-turn effects: "until the end of your opponent's next turn" = turn T+1) that zeroes attack damage to that side's Benched Pokémon (bench damage, chosen-target, Bench Guard's redirect target is the Active anyway).
- **Brock's Protection**: an attached Trainer without expiry; a guard read by every "remove an attached Energy" path of the opponent's attacks and Trainers (`energyRemovalBlocked(state, pokemon, by)`), so Energy Removal & co. skip that Pokémon.

### 4. Trainer pipeline

- **Chaos Gym**: `playTrainerCard` asks a Chaos coin first (coins passed in, `getTrainerCoinFlips` grows a leading coin while Chaos Gym is in play); tails cancels the card; default rule offers it to the opponent (a `pendingTrainerChoice` the other side answers, then the opponent plays it on their own view) — see doubt for the simpler alternative.
- **Sabrina's Psychic Control**: play a Trainer from the opponent's discard pile (`playTrainerCard(state, cardId, { borrowedFrom: "opponentDiscard" })`): the effects must stop assuming the played card is in the player's hand (a `takePlayedCard` helper replaces the hand-splice in `discardPlayed`).
- **Self Trainer lock across turns** (Rocket's Secret Experiment tails): `trainerLockUntilTurn` per side through `getTrainerBlocker`.
- **Evolution blocker bypass** (Giovanni): a per-turn mark on the chosen Pokémon id that follows its evolutions, read by `getEvolutionBlocker` / the played-this-turn check; Lunar Power / Emerge evolve "by effect" (like Rapid Evolution).
- **Blaine**: a second Energy-attachment form (2 Fire Energy cards to one Blaine's Pokémon as the turn's attachment), resolved when the card is played (default in doubts).

### 5. Hidden and asked-of-the-opponent cards

- **Blaine's Quiz #2 / #3**: Quiz #1's opponent step with a hidden chosen card (#3 also names an attack; options built deterministically like `quizLengthOptions`).
- **Misty's Wish**: look at a chosen Prize (hidden from the opponent), offer a hand card, opponent accepts / declines (`defaultSelection: "decline"`).
- **Lt. Surge's Secret Plan**: a face-down Benched card (`PokemonInPlay.faceDown`), masked for the opponent in MP like set-aside hands; flips by rule (default in doubts). The heaviest new mechanic; can be left unplayable for the first release.

### 6. Board action coins

- **Rocket's Minefield Gym**: playing a Basic onto the Bench from the hand flips a coin passed in by the caller: `getPlayBasicCoinFlips(state)` + `playBasicPokemon(state, id, { coinResults })` (omitted → the engine flips, like `executeRetreat`).

### 7. Attacks (163, 137 with text) and powers

Most attacks reuse the existing effect vocabulary (status coins incl. `additionalStatuses`, `CoinFlipDamage`, `SelfDamage`, `BenchDamage` with chosen targets, `ChooseTargetDamage`, `SandAttack`, `UseOnce`, `PreventRetreat`, `Protection`, `ReduceDamage`, `ShuffleSelfIntoDeck`, `AttachEnergyFromDeck/Discard`, `SearchDeck`, `EvolveFromDeck`, `CopyAttack`, `BlockTrainers`, `DamagePerCounter`, `RequireDamageCounters`, `RequireAttachedEnergy`, `IgnoreDefenderEffects`…). New kinds (each with a unit test): both-heads coin conditions (Summon Storm, Fast-Acting Poison), damage-counter swap / move (Juxtapose, Damage Shift), set remaining HP (Life Drain), discard the Stadium (Detonate, Mega Thrash), Intimidate (attack lock by the defender's max HP), Earthdrill (requires last turn's attack name), Messenger (self to deck top, then search), False Charity / Pranks / Surprise (opponent's deck / discard / hand manipulation), Invigorate (Basic from any discard to its owner's Bench with counters), Helping Hand (heal opponent, draw), Group Therapy (heal all), coin-count from the defender's counters (Pendulum Curse), Synchronize (Energy-card parity), Ink Spurt (lasting Smokescreen), ESP (outcome by number of heads, 3 heads = Metronome flow), no-damage-on-tails (Risky Attack, Random ESP), Group Attack (search named Basics then count them), Love Lariat (bonus if a named Pokémon is Benched), Bonfire (discard per heads + damage to every opposing Pokémon), Super Removal (one Energy from each opposing Pokémon). Powers: Soak Up and Emerge are activated (`POWER_EFFECTS`, `ACTIVATED_POWER_TYPES`), Call the Boss an `ON_PLAY_POWERS` entry, Healing Fire a Pokémon-side hook in `attachEnergyCard`, the rest are the triggers / hooks above.

## Work split

| Stage | Repo | Output |
|---|---|---|
| 1 | game-core | Catalog (done), effects per the plan's tasks (attacks in 3 batches, powers in 2, Trainers in 4, Stadiums in 1), AI support, simulator clean with `--sets gym-challenge` and mixed, doubts answered, `inDevelopment` removed, version bump to the next minor (0.9.0), published only with the owner's OK. |
| 2a | API | Gym Challenge booster (`SET_BOOSTERS["gym-challenge"]`), catalog/collection hide `inDevelopment` sets until then, MP: the pre-attack reaction (Ninja Trick) before the server flips attack coins, Chaos Gym's off-turn offer, Misty's Wish / Quizzes answers (existing `pendingTrainerChoice`), Minefield coins on `playBasic`, masking of face-down Secret Plan cards and of Misty's Wish's Prize. |
| 2b | frontend | `SET_UI` entry + logo + booster art, hide `inDevelopment` sets, Shapeshift / Psylink in the attack picker (already through `getAvailableAttacks`), Blaine's double-attach step, Giovanni's evolution allowance, attached Trainer badges (Brock's Protection, Ninja Trick), face-down bench card, Chaos Gym coin + offer modal, Minefield coin animation, SP and MP. |
| 3 | all | Bot simulation across all sets, SP and MP smoke tests, owner reviews doubts, publish game-core, deploy API, push frontend. |

Branches: `feat/gym-challenge` in each repo. Nothing merged or deployed without the owner's OK.

## Testing

- One test per card with an effect (attack text, power, Trainer, Stadium) through the engine entry points (`executeAttack` with coins, `playTrainerCard`, `usePokemonPower`, `useStadiumAction`, board actions), written first.
- The catalog cross-check stays green (`test/gym-challenge-catalog.test.ts`); remove its `inDevelopment` assertions in the last engine task.
- `npm run simulate -- --sets gym-challenge` and `--sets base-set,jungle,fossil,team-rocket,gym-heroes,gym-challenge --decks random-mix --policy explore,random` with 0 invariant failures; `--coverage gym-challenge` ~100%.
- Frontend / API: existing suites green; browser smoke of SP and MP with Gym Challenge decks (a Stadium coin, Ninja Trick off-turn, Chaos Gym tails, a face-down card if shipped).

## Doubts to log for the owner (defaults in **bold**)

55 entries in `docs/card-doubts.md` → "Gym Challenge". The ones that change the most work: **Chaos Gym** (opponent may use the failed Trainer, or alternative B: just discarded), **Lt. Surge's Secret Plan** (face-down Bench card, or alternative B: unplayable at first), **Shapeshift** (Transform-like copy), **Koga's Ninja Trick** (asked before the attack's coins), **Sabrina's Psychic Control** (play from the opponent's discard), **Blaine** (resolved when played).

## What the Gym Leader mode will need from this set (not specced here)

- Themed AI decks for **Giovanni** and **Koga** (new owners) and fuller **Blaine** and **Sabrina** decks (their evolutions are here), next to Gym Heroes' `gymLeaderDecks` (ids `gym-challenge-<leader>`, "Mazo de <leader>"); starting lists from the original 2000 Gym Challenge theme decks if their lists can be found (tcgosaurus product pages, as for the Base theme decks; not verified yet), otherwise built like Gym Heroes' ones.
- Leader Trainers and Gyms the AI can play well (Giovanni, Koga, Fuchsia / Viridian / Saffron / Cinnabar City Gym); the AI rules for the Trainers it never plays (doubts → AI) decide how faithful the leaders feel.
- Leader art (deck `image`) for 8 leaders.
