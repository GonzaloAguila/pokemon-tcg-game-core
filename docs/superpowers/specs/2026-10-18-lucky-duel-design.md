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

## Implementation notes (game-core 0.8.0, 2026-10-18)

Code: `src/domain/lucky-duel/` (`mode.ts` `isLuckyDuel`, `rules.ts` card tables and blockers,
`deck.ts` deck + setup), engine hooks in `lib/gameState.ts` (`settleLuckyDuelDraw`, endTurn
checkup, `canExecuteAttack` / `canExecuteMetronome`, `startPlayingPhase`), `board/bench.ts`
(`maxBenchSize` 0), `board/index.ts` (`canPlayBasicPokemon` reason), `effects/index.ts`
(`canPlayTrainerCard` / `canUsePokemonPower`). Tests: `test/lucky-duel.test.ts`. Simulator:
`npm run simulate -- --decks lucky-duel` (`playLuckyDuelAIGame`; 0 failures in 4,500 games).

Interface as specified, plus:
- `LUCKY_DUEL_EXCLUDED_TRAINERS` is `Record<cardName, reason>` (Spanish reason, UI-ready).
- Extra exports: `buildLuckyDuelDeck(active, rng?)` (the deck around a given Basic),
  `isLuckyDuel(state)`, `settleLuckyDuelDraw(state)`, `LUCKY_DUEL_BASICS`, `LUCKY_DUEL_DECK_SIZE`,
  types `GameMode`, `LuckyDuelDraw` and `GameResult` (now exported from the package root).
- `initializeLuckyDuelGame` already deals (it is `initializeMultiplayerGame` + `startGame` in one):
  the API must NOT call `startGame` nor trim Prizes afterwards. Then `setPlayerReady` x2 and
  `startPlayingPhase` as today; that call sets `luckyDuelRevealed: true` and logs
  "Lucky Duel: ¡X contra Y!" (no earlier event names an Active).
- Card ids are opaque random strings (`ld1-xxxxxxxx` / `ld2-…`) so ids of hidden cards (face-down
  Actives, hands, decks) say nothing about the card. They are deterministic for a seeded rng.

Changes / interpretations of the rulings:
- Trainer pool: beyond the minimum list, also excluded (reasons in code): Lt. Surge (puts the Active
  on the Bench), Lt. Surge's Treaty (needs Prizes; with 0 Prizes the engine's "last Prize taken"
  check would end the game), Minion of Team Rocket (needs the other Bench; tails only ends your
  turn), Erika's Perfume (puts Pokémon on the other Bench), Narrow Gym (Bench limit), The Rocket's
  Training Gym and Cerulean City Gym (Retreat cost; there is no Retreat), Good Manners (searches for
  a Basic; the deck has none). The excluded Trainers are also unplayable in a Lucky Duel
  (`canPlayTrainerCard` gives the reason) in case one ever reaches a hand.
- The Breeder rule is extended to every Trainer that depends on the line, so no deck holds a card it
  can never use: Devolution Spray, Pokémon Trader, Recall, Blaine's Quiz #1 only with an evolution;
  The Boss's Way only with a Dark evolution; Brock's Training Method / Erika's Maids only with that
  owner's evolution; Misty, Sabrina's ESP and the owner Gyms (Celadon, Pewter, Vermilion) only with
  that owner's Pokémon in the line. One table in `rules.ts` (`LINE_DEPENDENT_TRAINERS`) — easy to
  revert if the owner prefers dead cards as part of the luck.
- Bench-searching attacks (Call for Family, Sprout, Call for Friend, Brock's Geodude / Misty's
  Psyduck's Call a Friend…) "can't be used if your Bench is full" by their own text, and a locked
  Bench counts as full: they can't be used (instead of "do nothing"). Summon Minions does nothing.
- R8 blocks (Spanish reason): Cowardice and Buzzap (powers), Vanish (Abra) and Take Away (Erika's
  Dragonair) — attacks that always shuffle the attacker into the deck (also through Metronome).
  Phoenix Flame (Blaine's Moltres, a Basic whose only attack it is) stays usable and works as
  printed — owner ruling 2026-10-18 ("si sale cruz hará perder a su propietario, no cambies nada";
  0.8.0 had made the tails do nothing, reverted in 0.8.1): on tails Blaine's Moltres is shuffled into
  the deck, its owner has no Pokémon left and loses; if the same attack Knocked Out the other Active,
  it is a draw (settleLuckyDuelDraw).
- No changes needed (they already do nothing without a Bench / Prizes): forced and self switches
  (Whirlwind, Lure, Teleport, Teleport Blast, Fragrance Trap, Flee, Step In), bench damage, Bench
  Guard, Retreat Aid, Dark Electrode's Energy Bomb / Lt. Surge's Electabuzz (no Bench: the Energy is
  discarded as printed), Fairy Power (the Active is only offered with a Bench), Trickery ("no
  Prizes"). Attacks that require a Bench (Fling, Fascinate, Drag Off, Fly Swatter, Lucky Throw,
  Alert) can't be used. Peek doesn't offer the Prize options. Retreat: "no Benched Pokémon".
- Pidgeot's Hurricane / Sabrina's Gengar's Call of the Night remove the other Active without a
  Knock Out: that player has no Pokémon left and loses (as in a standard game without a Bench).
- R3: Kabuto, Omanyte and Aerodactyl lines never appear (they evolve from Mysterious Fossil, a
  Trainer). Basics are uniform per printing (164 Basic printings across the five sets as of 0.8.0).
- Draws (R9): `settleLuckyDuelDraw` turns a victory/defeat into `"draw"` when neither side has a
  Pokémon left (Active gone, or still on the board with damage ≥ HP because the game ended before
  its own Knock Out was processed — it is Knocked Out then). It runs at the end of `checkKnockouts`
  (every attack, Trainer, power and endTurn goes through it), on the endTurn checkup (in a Lucky
  Duel both Actives are checked even when the first Knock Out ended the game) and after Destiny Bond
  in chosen-target attacks. The log's "¡Victoria!/¡Derrota!" lines of that action are replaced by
  "¡Empate! Ambos Pokémon activos quedaron Fuera de Combate". Deck-out still loses.
- AI (0.8.1; scope change: Lucky Duel ships vs the AI first). 0.8.0's evaluator scored every Lucky
  Duel position as "won" (0 Prizes left = the prize-out branch), so the AI only attacked when it
  Knocked Out and otherwise passed until a deck-out. Now `evaluateBoard` has a Lucky Duel branch
  (`evaluateLuckyDuel`, ai/evaluate.ts): no Prize terms; HP of an Active worth a Knock-Out-is-the-
  game rate (chip damage and healing matter); both next-turn Knock Out threats at the game's value;
  a deck reserve of 10 cards (each card below it costs; draw/search Trainers were already gated by
  `canAffordDraws`); a draw scores -GAME_WON/4 (never aimed for). It never attacks into a certain
  loss (self Knock Out / self removal that doesn't win), except when the Active's only attack may
  lose on a coin (Phoenix Flame), which it then uses (else it could never win). The AI executor
  keeps a draw (it used to overwrite it with "defeat"). Locked Benches: no Bench actions are
  attempted (maxBenchSize 0); `decideOpponentSetup` returns [] (the Active is given).
  Measured with the shipped policy (`greedy` = smart, the one the frontend uses), `--decks
  lucky-duel`, seeds 1..1000: deck-outs 38.7% → 0.3% (the rest are true stalemates, e.g. Base
  Porygon, which has no damaging attack, against a Psychic attacker it resists); avg game length
  49.2 → 8.8 turns; attacks per game 0.9 → 5.3; vs the random policy it now wins ~80% (it lost ~71%
  before).
- Single-player flow (test/ai-lucky-duel.test.ts): `initializeLuckyDuelGame(humanDraw, aiDraw)`
  (player = human, opponent = AI), `setPlayerReady` for both (the AI is ready at once),
  `startPlayingPhase` reveals, then the usual `decideOpponentTurn` / `executeAIAction` loop; no
  Prizes to take, no promotions.

## API implementation notes (pokemon-tcg-api, branch feat/lucky-duel, 2026-10-18)

Owner updates that override the rulings above:
- **Bets (overrides R2's "no bets")**: multiplayer Lucky Duel tables take coin bets exactly like
  normal tables (same `betAmount` validation and title caps, escrow at the start, pot to the winner,
  forfeit / disconnect / leave / kick rules unchanged). A **draw refunds each player their own stake
  in full** (no pot, no house cut), whatever the turn; it goes through the same once-only settlement
  (`settleMatch` claims `settledAt`), so retries / other end paths never refund twice.
- **Launch**: Lucky Duel ships for multiplayer tables (same lobby listing as normal tables, with
  `mode`) and vs the AI at the same time.

As built:
- `createRoom { mode?: "standard" | "lucky-duel" }` (default standard); Lucky Duel needs no deck (one
  sent is ignored, also on `joinRoom`), `prizeCount` is 0. `mode` is in `roomList` rows,
  `roomCreated`, `roomJoined`, every table `gameStart` (start, rejoin, spectate) and the admin room list.
- Start: `initializeLuckyDuelGame(drawLuckyDuel(rng), drawLuckyDuel(rng), rng)` with the server's
  CSPRNG; then `setPlayerReady` ×2 → `startPlayingPhase` as usual.
- Before the reveal every viewer (owners, rival, spectators, rejoins) gets both Actives as
  `{ id, hidden: true }` (the real opaque id) and the owner's own deck as placeholders too (its
  evolutions' `evolvesFrom` would name the Basic); the hand stays visible to its owner. Only
  `playerReady` / `surrender` are accepted and `requestCoinFlip` is refused until then, so no engine
  reason can name a face-down card.
- Draw (`gameResult: "draw"`): `gameOver { winner: null, reason: "Empate" }`. Settlement (R2): counts
  like any game (turn ≥ 3, ≥ 2 min; the per-opponent win cap doesn't apply), no win/loss stats and no
  streak change (the stats model has no draws), both players get the loser's XP / match coins /
  `game_played` mission; `matchSettled.outcome: "draw"`. The match row is `finished` with `winnerId`
  null; there is no table-mode column, so a Lucky Duel's `winReason` starts with "Lucky Duel: ".
- vs the AI: `POST /api/matches/ai/:matchId/finish { result: "victory" | "defeat" | "draw",
  turnNumber, mode?: "standard" | "lucky-duel" }`; a draw gets the loser's AI rewards, the response
  carries `outcome`, and the mode is recorded in `winReason` ("lucky-duel: draw").
