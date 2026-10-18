# Lucky Duel — design

Owner-approved in chat on 2026-10-18 ("avanza con el desarrollo ya mismo"). A new multiplayer
table type where each player gets a random Basic Pokémon from the whole catalog and a deck
built around it on the spot. No deck building, pure luck: Magikarp vs Dark Scyther is the point.

## Owner decisions (binding)

1. Name: **Lucky Duel** (table type shown in the lobby as "Lucky Duel").
2. The starting Pokémon is always a **Basic** Pokémon, drawn at random from every set in the
   catalog (`ALL_CARDS` / `CARD_SETS`). No balancing of any kind.
3. Decks are always **two colours**. Colorless does not count as a colour.
4. Evolutions: if the Basic has an evolution line, the deck holds **exactly one** Stage 1 that
   evolves from it and, if that Stage 1 has one, **exactly one** Stage 2 that evolves from it.
   No other Pokémon in the deck.
5. **Benches are locked** for the whole game: treated as full but empty. Nothing can be put on a
   Bench (Basics from hand, attacks like Call for Family / Summon Minions, Trainers like
   Challenge! / Pokémon Flute / Revive); Bench-dependent cards (Switch, Gust of Wind…) can't be
   played.
6. Both Actives start **face down**; the game waits for both players to confirm (Listo) as in
   normal setup, then both are revealed and play goes on normally with a 7-card hand.
7. A Knock Out of the Active ends the game (there is no Bench to promote from).
   **Both Actives Knocked Out at the same time → draw, the game ends.**
8. Cards that remove your own Active without a replacement are not available: Tentacool's
   Cowardice can't be used; Scoop Up and Mr. Fuji are not in the Trainer pool.

## Rulings (controller decisions — change if the owner says otherwise)

- R1 Multiplayer tables only in v1 (public and private). No vs-AI Lucky Duel yet (follow-up).
  Draft is unaffected.
- R2 No bets on Lucky Duel tables in v1. Games count for XP and stats like a normal table; a draw
  has no winner and no loser (both get the participation XP a loser would get; neither streak
  breaks nor grows — follow the existing stats model as closely as possible and document it).
- R3 Each player's Basic is drawn uniformly over the Basic Pokémon card entries of every set
  (each printing is one entry; Trainers played as Basics — Mysterious Fossil, Clefairy Doll — are
  not Pokémon and are excluded). Both players draw independently (they may get the same card).
- R4 Deck: **60 cards** including the Active.
  - The line: the Basic + 0–2 evolution cards (decision 4). Pick a random printing among every
    Stage 1 whose `evolvesFrom` matches the Basic's name (owner names included: Brock's
    Sandshrew → Brock's Sandslash, never plain Sandslash; Dark versions are valid Stage 1/2 of
    the plain Basic per the engine's existing evolution rules — reuse the engine's evolution
    check, don't reimplement name matching).
  - Energy: **24 basic Energy**: 16 of the primary colour + 8 of the secondary.
    Primary = the Basic's type (if it is Colorless, the primary is random too).
    Secondary = random non-Colorless type different from the primary.
    If an attack of any Pokémon in the line needs a non-Colorless type that is neither colour,
    prefer that type as the secondary (so the line can always pay its attacks); if two such
    types exist, pick one at random.
  - Trainers: the rest (33–35 cards), random from the **Lucky Duel Trainer pool**, at most 4
    copies per name (the deck rule `isLimitedInDeck`). Pokémon Breeder only when the deck has a
    Stage 2.
  - Pool = every Trainer in the catalog minus the ones that make no sense without Bench or Prizes
    or that remove your own Active. At least: Switch, Gust of Wind, Challenge!, Pokémon Flute,
    Revive, Clefairy Doll, Mysterious Fossil, Here Comes Team Rocket!, Scoop Up, Mr. Fuji. The
    engine agent audits every Trainer (Base, Jungle, Fossil, Team Rocket, Gym Heroes) and lists
    each exclusion with its reason in the code.
- R5 No Prizes (0 Prize cards). No Mulligan (the Active is given; the hand doesn't need a Basic).
  Draw 7 from the remaining 59 after shuffling.
- R6 Face down means hidden from **both** players and spectators (the owner doesn't see their
  own Active either — "¿Quién es ese Pokémon?" moment) until both confirm. The hand is visible to
  its owner as usual. The server must never send the identity of a face-down Active.
- R7 Randomness only on the server (API). game-core takes an `rng: () => number` parameter
  (default `Math.random`) so tests are deterministic.
- R8 Powers/attacks: anything that would move the player's own Active to hand/deck/discard
  without a replacement (Cowardice, and any similar effect the audit finds) is blocked with a
  Spanish reason; attacks that put Pokémon on a Bench simply do nothing for that part; Retreat is
  impossible (no Bench) — the existing "no Benched Pokémon" blocker covers it.
- R9 Self Knock Out (Selfdestruct, recoil) of only the attacker → the attacker loses (existing
  rule). Both Actives Knocked Out by the same action (or the same between-turns check) → draw.
  Deck-out still loses.

## Interfaces (cross-repo contract)

### game-core (new minor version: 0.8.0)
- `GameResult` gains `"draw"` (`"victory" | "defeat" | "draw" | null`). Every place that reads
  `gameResult` handles it; `swapSides` keeps `"draw"` as is.
- `GameState.gameMode?: "standard" | "lucky-duel"` (absent = standard). `maxBenchSize` returns 0
  for `"lucky-duel"`.
- `drawLuckyDuel(rng?: () => number): LuckyDuelDraw` where
  `LuckyDuelDraw = { active: PokemonCard; deck: Card[] /* 60 incl. active */; colors: [EnergyType, EnergyType] }`.
- `initializeLuckyDuelGame(player1: LuckyDuelDraw, player2: LuckyDuelDraw, rng?): GameState` —
  same shape as `initializeMultiplayerGame` output (player1's view), phase MULLIGAN like MP
  setup, both Actives already placed, 0 Prizes, 7-card hands, `gameMode: "lucky-duel"`,
  `luckyDuelRevealed: false` until the existing "both ready" transition to PLAYING (then true).
- `LUCKY_DUEL_EXCLUDED_TRAINERS` (names + reasons) and `isLuckyDuelTrainerAllowed(card)` exported
  for tests and UI.
- No behaviour change at all for standard games.

### API
- Table option `mode: "standard" | "lucky-duel"` on table creation (validated with zod), stored on
  the room, sent in lobby listings. Lucky Duel tables: no deck selection, no bet.
- On start: `drawLuckyDuel` per seat with the server RNG, `initializeLuckyDuelGame`.
- State sanitization: while `luckyDuelRevealed` is false, both Actives go out as hidden
  placeholders to everyone (including their owner and spectators). Check the known MP setup leak
  ("during setup the rival may read the Active's name early") and make sure it can't happen here.
- Game over with `gameResult: "draw"` → no winner: stats/XP per R2, room chat/emotes as today.
  `finishRoomGame` / `gameOver` events carry `winner: null` + a reason ("Empate").

### Frontend
- Create-table dialog: a mode choice (Normal / Lucky Duel) with a one-line explanation; Lucky
  Duel hides deck and bet fields. Lobby table cards show a "Lucky Duel" badge.
- Game: setup shows both Actives face down (card back), no "place your Active" hint (a short
  "Pulsa Listo para revelar" style hint instead), Listo as usual; on reveal, a flip animation of
  both Actives. Locked Benches are visibly locked (no empty dashed slots inviting drops — e.g. a
  subtle locked state). Basics in hand can't be dragged/used to the Bench (engine reason as toast).
- Game over modal: a "Empate" state for `"draw"`.
- No hard-coded sets; texts in neutral Spanish.

## Out of scope (v1)
vs-AI Lucky Duel, rankings/missions for the mode, reroll, bets.
