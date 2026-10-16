# Gym Heroes — design

**Date:** 2026-10-16 · **Status:** approved by the owner (Misty's Duel as real Rock-Paper-Scissors with buttons) · **Owner request:** code Gym Heroes and Gym Challenge (the next two sets), then a vs-AI Gym Leader mode with their themed decks. Agreed order: sets first (Gym Heroes, then Gym Challenge), then the Gym Leader mode. This spec covers **Gym Heroes only**; Gym Challenge and the Gym Leader mode get their own specs.

**Approach (agreed):** the same as Fossil + Team Rocket: the engine first (catalog, new mechanics, a test per card with an effect, bot simulator), then API and frontend in parallel, card doubts logged for the owner, then publish. The whole set ships at once (no half set in the boosters).

## Source data

- `data/pokemontcg/gym1.json` (api.pokemontcg.io, set `gym1`, 132 cards) is the source of truth for card text. Translate attack/power names and texts to Spanish with the same conventions as the other sets; Pokémon names stay in English ("Brock's Onix").
- Composition: 62 Basic, 24 Stage 1, 5 Stage 2, 27 Trainers, 7 Stadiums, 1 Rocket's Secret Machine (Tickling Machine), 6 basic Energy. Rarities: 19 Rare Holo, 23 Rare, 42 Uncommon, 42 Common, 6 Energy.
- Owners: Brock 19, Erika 18, Misty 17, Lt. Surge 13, Sabrina 11, Blaine 9, Rocket 4 (plus a few un-owned Pokémon).
- Reprints inside the set: Brock (#15 / #98), Erika (#16 / #100), Lt. Surge (#17 / #101), Misty (#18 / #102) are holo/non-holo printings of the same Trainer → keep one card each (as Jungle/Fossil exclude non-holo duplicates); the catalog keeps the lower number and the other is logged as excluded. The 6 basic Energy are the existing Base Set energies (not new catalog cards).
- Images: `https://pkmncards.com/wp-content/uploads/{slug}-gym-heroes-g1-{n}.jpg` (slug rules as the other sets; apostrophes dropped: `brocks-onix`). A script HEADs every catalog image URL; misses go to `docs/card-doubts.md`.

## New rules the engine needs

### 1. Owner's Pokémon ("Brock's Onix")

The owner is part of the card name, so most of the rule falls out of name matching:
- A card evolves only from the exact `evolvesFrom` name: `Brock's Graveler` evolves from `Brock's Geodude`, never from `Geodude`, and `Graveler` never evolves from `Brock's Geodude`. `findValidEvolutionTargets` already matches by name; add tests that pin both directions.
- Deck building: the 4-copies limit is by name, so `Brock's Onix` and `Onix` are different cards (correct per the rules); no change.
- `ownerOf(card)` helper (`"Brock" | "Misty" | "Erika" | "Lt. Surge" | "Sabrina" | "Blaine" | "Rocket" | null`) for the cards that refer to "Pokémon with Brock in its name" (Trainers, Stadiums, the AI and the future Gym Leader decks). It reads the name prefix; no new card field.

### 2. Stadiums (7 cards)

New state: `stadium: { card: TrainerCard; playedBy: "player" | "opponent" } | null` (in the player's perspective; swapped with the board like everything else; serialized for MP like other public state).

Rules:
- Played from the hand like a Trainer, stays in play. Only one Stadium in play: a new one discards the old one to its owner's discard pile. A player can't play a Stadium with the same name as the one in play. One Stadium per turn per player (the rule of the era printed on the cards is only "discard if another comes into play"; the one-per-turn limit came later — **logged as a doubt, default: no per-turn limit, same-name blocked**).
- Effects are continuous and read through **modifier hooks**, not per-card checks scattered around:
  - `retreatCostModifier(state, pokemon)` — The Rocket's Training Gym (+1 Colorless for everyone), Cerulean City Gym (−1 Colorless for Misty's Pokémon).
  - `ignoreResistance(state, attacker)` — Pewter City Gym (Brock's Pokémon).
  - `maxBenchSize(state)` — Narrow Gym (4; when played, players with 5 discard down to 4, each choosing which — a pending choice per player). Replaces the hard-coded `5` in trainers, AI and board actions.
  - `trainerCost(state, trainerCard)` — No Removal Gym (Energy Removal / Super Energy Removal cost 2 discards).
  - Activated Stadium actions use the existing `POWER_EFFECTS`-style registry keyed by stadium name, offered to the player whose turn it is: Celadon City Gym (discard an Energy from an Erika's Pokémon to remove up to 3 damage counters — per card text), Vermilion City Gym (optional coin on Lt. Surge's attacks: heads +10 damage — per card text).
- UI/API: the board's existing "Estadio" zone shows the card; MP sends `stadium` in the state and plays it with the generic `playTrainer` action.

### 3. Trainers that need new effect machinery

Most of the 27 Trainers fit the existing `TRAINER_EFFECTS` registry (search deck, draw, discard, look at hand, opponent chooses). These need something new:
- **Attached Trainers** (stay on a Pokémon until a trigger): Charity (returns to hand at end of turn, may reduce its attack's damage), Sabrina's ESP (re-flip that Pokémon's attack coins once; discarded at end of turn). Generalize the PlusPower/Defender attachment (`attachedTrainers` on `PokemonInPlay` with an expiry) instead of one-offs.
- **Recall**: the Active may use an attack from any card under it (its Basic / earlier stages) this turn; the attack picker lists them. Needs evolution history on `PokemonInPlay` (the engine already keeps the cards under an evolved Pokémon — confirm and reuse).
- **Tickling Machine**: opponent's hand set aside face down until the end of their next turn (a timed zone on the opponent's side).
- **Misty's Duel**: a real Rock-Paper-Scissors (owner's decision). Playing it opens `pendingDuel` (state: which player played it, each side's pick or null, the round). Each player picks Piedra / Papel / Tijera with buttons; picks stay hidden until both are in; a tie replays the round. The winner shuffles their hand into their deck and draws 5. SP: the AI picks at random through the engine's injected RNG (testable). MP: the server collects both picks (`duelPick {choice}`), never echoes the opponent's pick early, resolves, and shows both picks to both players. Engine: `startMistysDuel` (via the Trainer registry), `resolveDuelRound(state, playerPick, opponentPick)` → winner | tie.
- **Blaine's Quiz #1**: the opponent guesses the Pokémon's length among options → a `chooser: "opponent"` step (the AI answers in SP). Needs each Pokémon card's length: from `flavorText`/pokédex data in the source JSON; if missing, logged as a doubt.
- **Lt. Surge's Treaty**: the opponent chooses between two options (existing `chooser: "opponent"` step).
- **Minion of Team Rocket**: on tails the turn ends immediately (existing end-turn path).
- Leader Trainers: Brock (heal 10 from each damaged Pokémon), Erika (both draw up to 3; the opponent's draw is its choice → opponent step), Lt. Surge (swap a Basic from hand in as Active), Misty (discard 2: Misty's attackers +double damage this turn — per card text).

### 4. Pokémon Powers (11) and attacks (122 with text)

Powers go into `POWER_EFFECTS` (activated: Energy Charge, Fragrance Trap, Natural Healing) or into the continuous/trigger hooks the engine already has for Base/Fossil powers (Bench Guard, Pollen Defense, Flee, Rebirth, Shell Armor, Restless Sleep, Strange Barrier, Photosynthesis). New trigger points if missing: "when damaged while Active" (Pollen Defense, Flee, Restless Sleep), "when Knocked Out" (Rebirth), "redirect bench damage" (Bench Guard). Attacks reuse the existing attack-effect vocabulary; any new effect kind gets a unit test.

## Work split

| Stage | Repo | Output |
|---|---|---|
| 1 | game-core | `CardSet.GymHeroes`, `CARD_SETS` entry (code "G1", 1999-08-14), `gym-heroes.ts` catalog (128 unique cards), image URLs, owner helper, Stadium state + hooks, new Trainer machinery, powers, AI support (play Stadiums/Trainers with a simple value), tests per effect, `npm run simulate` clean, `docs/card-doubts.md` entries. Version bump to the next minor, published only with the owner's OK. |
| 2a | API | Gym Heroes booster in the pack system and economy config (rarity weights like other sets), collection/catalog endpoints (set registry is generic), MP state carries `stadium`, socket validation allows the new Trainer selections, `duelPick` action with hidden picks for Misty's Duel. |
| 2b | frontend | `SET_UI` entry + logo + booster art + catalog route, Stadium zone shows the card and its activated action, attacks picker supports Recall, Tickling Machine's set-aside hand, Misty's Duel Rock-Paper-Scissors modal (three buttons, wait for the rival, reveal both picks, replay on a tie) in SP and MP, Blaine's Quiz opponent step (generic step modals already exist), deck builder works with owner names. |
| 3 | all | Bot simulation across all sets, SP and MP smoke tests in the browser, owner reviews `card-doubts.md`, publish game-core, deploy API, push frontend. |

Branches: `feat/gym-heroes` in each repo (game-core: this branch). Nothing merged or deployed without the owner's OK.

## Testing

- One test per card with an effect (attack text, power, Trainer, Stadium) against the engine; the evolution-by-owner rule in both directions; Stadium replacement, same-name block, each modifier hook; Narrow Gym's discard-down choice.
- Every catalog image URL resolves (HEAD 200).
- `npm run simulate` (greedy/random/mixed, seeded, all sets) with no invariant failures and no stuck pending states.
- Frontend/API: existing suites green; browser smoke test of SP and MP games with Gym Heroes decks (a Stadium in play, Recall, an opponent-chosen Trainer).

## Doubts to log for the owner (defaults in **bold**)

- Stadium per-turn limit → **none, same-name blocked** (as printed in 2000).
- Blaine's Quiz #1 lengths → from the source data; cards without it listed.
- Holo/non-holo duplicate Trainers (Brock, Erika, Lt. Surge, Misty) → **one catalog card each**.
- Spanish names for Stadiums ("Gimnasio de Ciudad Plateada") and leader Trainers (names kept: "Brock", "Misty").
