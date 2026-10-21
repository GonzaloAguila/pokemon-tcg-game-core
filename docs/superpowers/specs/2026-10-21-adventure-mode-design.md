# Modo Aventura — design

**Date:** 2026-10-21 · **Status:** design + plan, nothing implemented · **Source:** the owner's Claude Doc "Modo Aventura — Spec v1" (https://claude.ai/artifact/2c4U2tybHiuyBak5oNxSfT), flattened in `docs/adventure/source-spec-v1.txt` (prose and tables) and `docs/adventure/source-spec-v1-code.txt` (adventure JSON example, Run, AdventureProgress, GameConfig). Plan: `docs/superpowers/plans/2026-10-21-adventure-mode.md`.

This document maps the owner's spec onto what the three repos already have. Where it says "spec" it means the owner's v1; where it deviates, the reason is given. Everything the spec leaves to "the agent" (where the engine runs, existing AI, persistence, accounts, card ids) is answered from the code below.

## 1. Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Battle architecture: option A (owner decision, 2026-10-21).** Adventure battles are server-authoritative: the API runs them as Socket.io game rooms (the multiplayer `GameRoomManager`), the human is seat `player1`, seat `player2` is the game-core AI driven by the server. The server flips every coin, runs the AI, detects the end and applies the result to the run. | The spec's "el cliente nunca reporta gané" and the project rule "never decide game/economy outcomes in the browser". Today every vs-AI game runs in the browser and the client reports the result (`POST /api/matches/ai/:id/finish`, API `matches.service.ts` `finishAiMatch` ~l.665; the API CLAUDE.md lists the farming hole). MP rooms already have everything else: server coins (`rooms.ts` `serverCoin` ~l.564, `rollCoins` ~l.575), masking (`state-masking.ts` `maskGameStateForPlayer` ~l.418), rejoin (`joinRoom` ~l.978), surrender, end detection (`runAction` ~l.2156). |
| D2 | **Rejected alternatives** (one line each): B — browser engine + server replay of an action log with a server seed (needs a full deterministic replay of every browser flow, the AI and the coin modal; high cost, brittle); C — client-reported results with cosmetic-only rewards (contradicts the spec and the rule above; the achievements and the unique reward would be farmable). | |
| D3 | **Reuse the shipped AI** (`decideOpponentTurn` / `decideOpponentSetup` / `decideOpponentPromotion` / `answerStepForAI` / `answerAttackChoiceForAI`, `src/domain/ai/smart.ts`), not the spec's new heuristic. It already plans with the engine on a fair view (`knowledge.ts` `knowledgeView`), handles every Base Set card in the adventure, takes ~2 ms per decision. The spec itself says "si el proyecto ya tiene una, se reutiliza". Difficulty comes from the hand-built decks (spec §IA). Missing pieces, all in game-core (plan Tasks 1 and 5): a coin source and a seeded RNG for determinism, and a headless **AI driver** (today the "what does the AI do now" loop lives in the frontend `useAIOpponent.ts` + `model/ai-setup.ts`, the server has no AI at all). | |
| D4 | **Adventure content lives in the API** as `content/adventures/<id>.json`, validated at startup with zod plus game-core cross-checks (card ids exist, set not `inDevelopment`, Trainer not in `UNSUPPORTED_TRAINERS`, deck rules). game-core gets only the rules the engine needs (config, passives, AI). | The content is progression/economy data the server owns (offers, rewards, achievements); future rival decks never reach the browser (the spec hides them in `GET /adventures/:id`); tuning `rules` and decks in playtest (H7) is an API deploy, not a game-core publish + two consumer bumps. The API already uses zod (18 files); game-core has no runtime dependencies and should keep none. |
| D5 | **Card ids are the catalog ids** (`base-set-046-charmander`), not `base1-46`. The JSON uses them directly; mapping in §8. | game-core's convention (`{set-slug}-{3-digit}-{slug-name}`, `findCardById`); `base1-N` would need a translation layer forever. |
| D6 | **Runs, battles and progress in Postgres via Prisma** (new models + a migration, prod uses `prisma migrate deploy` since 2026-10-13). Accounts exist (`requireAuth`); no anonymous runs. | Spec open questions 3 and 4. |
| D7 | **Achievements go into the existing claim-based system** (`UserAchievement`, `achievements.service.ts` `RAW_DEFS` + a new checker type `adventure`), not into `AdventureProgress.achievements`. The run service only records facts; `checkAndUpdateProgress` derives progress from them, the player claims in the profile like every other achievement. | One achievements system; the same pattern Lucky Duel uses (achievements derived from `Match` rows, `luckyDuelWinWhere`). |
| D8 | **Unique rewards** are granted once with the existing idempotency table (`economy/claims.ts` `claimOnce(tx, userId, "adventure", "<adventureId>:<difficulty>")`, new `ClaimKind`) in the same transaction as the battle-10 result. The card back uses the usual upsert of `UserCardBack`. | Existing pattern (tutorial reward, set milestones). |
| D9 | **The battle screen is the multiplayer page** (`MultiplayerGamePage.tsx`) with an adventure context, not the single-player `GamePage`. | The state arrives masked, the opponent's moves arrive as `gameState` pushes, server coins are animated from `showCoinFlip`, rejoin works; the board actions already talk to a `PlayerActionExecutor` (`useSocketActionExecutor`). What it hard-wires (chat, turn timer, kick, room chip, exits to `/lobby`) becomes a prop (plan Task 19). |
| D10 | **RNG per battle** = mulberry32 seeded from `hash(run.seed + ":" + battleIndex + ":" + attempt)`, its 32-bit state persisted with the battle snapshot. Every engine/AI call of an adventure room runs inside `withRandom(room.rng)` (shuffles, ids, Sleep checkup) and the room's coin source draws from the same generator. `run.seed` is a server secret (128 random bits), never sent to the client. | Spec: deterministic AI "para poder reproducir bugs" — seed + the logged human actions replay a battle exactly. Unpredictable to the player because the seed is secret. |

## 2. Run flow (spec, unchanged) and phases

`pre_battle` → (`POST …/battle`) `in_battle` → victory 1–9: `choosing_treasure` → (`POST …/treasure`) `pre_battle` of N+1 · victory 10: `finished`/`won` · defeat: hearts − 1, `pre_battle` of N again or `finished`/`lost` at 0 · abandon (`pre_battle` or `choosing_treasure`): `finished`/`abandoned`, no achievements. Surrender inside a battle = defeat of that battle. One active run per user (409 otherwise). Closing the tab never loses anything: the run is in the DB and the battle snapshot too (§5).

## 3. Engine changes (game-core, minor bump → 0.10.0)

### 3.1 Game config

game-core already has half of the spec's `GameConfig`: `startGame(state, { prizeCount })` (1–6; `lib/gameState.ts` ~l.2374) is used by the vs-AI prize option (frontend `AI_PRIZE_COUNTS = [6,4,3]`) and the draft (`startGameWithRawDecks(…, prizeCount)`, API `rooms.ts` ~l.1236, 4/5/6). Missing:

- **Per-side Prize count**: `prizeCount: number | { player: number; opponent: number }`. Every win check is `prizes.length === 0` (`takePrize` ~l.7143, bench KOs ~l.2209, attack self-KO ~l.6762, `checkKnockouts` ~l.1913/1990), so dealing fewer Prizes to one side needs no other change.
- **Opening hand**: `openingHand: number | { player; opponent }` (default 7). Today 7 is hard-coded in `startGame` (`slice(0, 7)`) and `doMulligan` (~l.2475); store `state.openingHandSize` per side for the mulligan; `swapSides` swaps it.
- **Deck sizes 20–40**: the engine has no deck-size rule (only consumers: API `checkDeckPlayable`, frontend `MAX_DECK_SIZE = 60`); a 20-card deck deals 7 + 3 and plays. game-core adds `validateDeckEntries(entries, { minSize, maxSize, maxCopies })` (copies by **name** across sets, basic Energy unlimited: `isLimitedInDeck`) so the API and the frontend share one rule.
- **Decks from card ids**: `buildDeckFromEntries` takes `{ cardNumber, set }`; the adventure needs `{ cardId, qty }` → `deckFromCardEntries(entries)` through `findCardById` (throws on an unknown id).
- `createAdventureGame(config)`: `initializeMultiplayerGame` + `startGame` with the options above, `state.gameMode` untouched (standard rules), passives set on the state.

### 3.2 Passives as engine hooks

`GameState.passives?: { player?: AdventurePassive[]; opponent?: AdventurePassive[]; luckyCoinUsed?: { player?: boolean; opponent?: boolean } }`, swapped by `swapSides` (the AI plans on swapped views). `AdventurePassive = "lucky_coin" | "start_attached_energy" | "opening_hand_plus_1" | "prize_minus_one" | "extra_heart"`.

| Passive | Hook | Where |
|---|---|---|
| `opening_hand_plus_1` | setup | `createAdventureGame`: that side's `openingHand + 1`; `doMulligan` reads `openingHandSize`. |
| `prize_minus_one` | win condition | `createAdventureGame`: that side gets `prizeCount − 1` Prizes (default of owner question Q1). |
| `start_attached_energy` | end of setup | `startPlayingPhase` (the both-ready transition, ~l.2533) calls `applySetupPassives(state)`: for a side with it, the first basic Energy card in deck order that the Active can use (its type appears in the cost of one of its attacks, or any basic Energy if it has only Colorless costs) is attached to the Active, the deck is shuffled, a perspective-free log line. No such card: nothing. Applies before the first draw. |
| `lucky_coin` | coin flip | Coins are always flipped by the caller (game-core CLAUDE.md "Coins are flipped by the caller"), so the hook is a pure helper the room's coin source calls: `takeLuckyCoin(state, side) → { state, coin: "heads" } \| null` (marks `luckyCoinUsed[side]`). The API calls it for the first coin of the human's own action in the battle (default of Q2). |
| `extra_heart` | run level | API only (`hearts += 1`, `maxHearts += 1` when chosen). The engine ignores it. |

### 3.3 Coins, RNG and the AI driver

- **Today**: SP flips with `Math.random` in the browser (frontend `model/attack-coins.ts` `flipCoin` l.54, `CoinFlipModal.tsx` l.162 for the start coin / fixed effect coins); MP flips on the server (`crypto.randomInt`, injectable `CoinSource`). game-core's AI executor flips **its own** coins with `Math.random` (`ai/executor.ts` ~l.194, 240, 330, 492, 738) — the server must not call it as is.
- **Change**: `executeAIAction(state, action, { flip?, onCoins? })` — every executor coin comes from `flip` (default `Math.random` for the frontend), and `onCoins({ purpose, attackName?, results, flippedBy })` reports them so the server can send `showCoinFlip` for the AI's coins. `createSeededRng(seed: number, state?: number)` → `{ next(): number; state(): number }` (mulberry32 with readable state) and `hashSeed(text): number` in `domain/simulation/rng.ts` (exported).
- **AI driver** (new `domain/ai/driver.ts`): `nextAIStep(state, options) → AIStep | null` — one atomic thing the AI side (`opponent`) must do now, or null when the human must act / the game is over — and `applyAIStep(state, step, { flip, onCoins }) → GameState`. Covers, in this order: mulligan and setup (port of frontend `model/ai-setup.ts` `resolveOpponentMulligans` / `applyOpponentSetup`, then `setPlayerReady`), Prize taking (`takePrize(state, 0, false, …)`), promotion (`decideOpponentPromotion`), pending answers the AI owns (`answerAttackChoiceForAI` + `resolveAttackChoice`, `answerStepForAI` for `pendingTrainerChoice` steps it answers, `resolveBenchTrimForAI`, `answerChaosGymOfferForAI`, `aiDuelPick`, `resolveOwnPowerChoice`), then its turn: `decideOpponentTurn(state, { otherPlayerAnswersByHuman: true, otherPlayerDuels: true })`, one action at a time, replanning when a plan ends without `attack`/`endTurn`, forcing `endTurn` when a plan changed nothing or after 20 plans (`MAX_AI_PLANS_PER_TURN`, frontend `useAIOpponent.ts` l.24). The driver is a pure port of `useAIOpponent`'s decisions (the frontend may adopt it later; not in scope). Step plan state (the queued actions of the current plan) is part of the returned value so a server can persist it between steps.

### 3.4 Content checks the engine offers

`isAdventureCardAllowed(card)`: in the catalog, set not `inDevelopment`, Trainer not in `UNSUPPORTED_TRAINERS` — used by the API's content validator. Simulator: `npm run simulate -- --adventure <path-to-json>` plays every starter deck against every rival deck with the adventure rules (prizes, hands, passives off) and prints win rates per battle — the spec's H3 test ("IA vs IA termina siempre sin errores en 100 partidas con seeds fijos") and the H7 balance tool.

## 4. Data model (API, Prisma)

```prisma
model AdventureRun {
  id                String    @id @default(uuid())
  userId            String
  adventureId       String
  adventureVersion  Int
  difficulty        String    // "normal" | "hard"
  starterId         String
  status            String    // "active" | "won" | "lost" | "abandoned"
  phase             String    // "pre_battle" | "in_battle" | "choosing_treasure" | "finished"
  currentBattle     Int       @default(1)   // 1..10
  attempt           Int       @default(1)   // tries of currentBattle (RNG seed part)
  hearts            Int
  maxHearts         Int
  heartsLost        Int       @default(0)
  deck              Json      // CardEntry[] { cardId, qty }
  passives          String[]
  treasuresTaken    String[]
  treasuresSkipped  Int       @default(0)
  pendingOffer      String[]  // empty = none
  offTypeUsed       Boolean   @default(false) // monotype achievement (see §6)
  seed              String    // server secret, never serialized to the client
  battle            Json?     // live battle snapshot: { roomId, state, rngState, aiPlan, humanActions[] }
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  finishedAt        DateTime?
  user              User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  battles           AdventureBattleResult[]
  @@index([userId, status])
  @@map("adventure_runs")
}
// migration adds: CREATE UNIQUE INDEX adventure_runs_one_active ON adventure_runs("userId") WHERE status = 'active';

model AdventureBattleResult {   // history, achievements, abuse checks
  id          String   @id @default(uuid())
  runId       String
  battleIndex Int
  attempt     Int
  victory     Boolean
  reason      String   // "prizes" | "no-pokemon" | "deck-out" | "surrender"
  turns       Int
  startedAt   DateTime
  endedAt     DateTime @default(now())
  run         AdventureRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  @@unique([runId, battleIndex, attempt])
  @@map("adventure_battle_results")
}

model AdventureProgress {
  id                    String   @id @default(uuid())
  userId                String
  adventureId           String
  clearsNormal          Int      @default(0)
  clearsHard            Int      @default(0)
  clearedStartersNormal String[]
  clearedStartersHard   String[]
  runsPlayed            Int      @default(0)
  flawlessClears        Int      @default(0)
  puristClears          Int      @default(0)
  monotypeClears        Int      @default(0)
  @@unique([userId, adventureId])
  @@map("adventure_progress")
}

model UserStarterUnlock {   // reward type starter_unlock (Pikachu)
  userId    String
  starterId String
  createdAt DateTime @default(now())
  @@id([userId, starterId])
  @@map("user_starter_unlocks")
}
```

Differences from the spec's models: `attempt`, `offTypeUsed`, `battle` (snapshot instead of `activeGameId`), the battle history table, achievements moved to `UserAchievement` (D7), rewards to `EconomyClaim` (D8). Migration `YYYYMMDDHHMMSS_adventure_mode` (convention `prisma/migrations/20261018120000_lucky_duel_coins`; `test/migrations.test.ts` fails without it).

## 5. API

### 5.1 HTTP (`src/modules/adventure/`, mounted under `/api`, `requireAuth`; mutating routes in the economy rate-limit list)

| Method | Route | Does | Errors |
|---|---|---|---|
| GET | `/adventures` | adventures + the user's progress (clears, cleared starters, rewards claimed via `hasClaim`, achievements by id) | |
| GET | `/adventures/:id` | name, rules, starters (with decks), battle list (index, location, rival name/class, lead Pokémon for the map) — rival decks only for battles already beaten in the user's active run, treasures (names, kinds, contents), rewards | 404 |
| POST | `/adventure/runs` | `{ adventureId, difficulty, starterId }` → run | 409 active run exists; 404 unknown ids; 403 locked starter |
| GET | `/adventure/runs/active` | the active run or 404 | |
| GET | `/adventure/runs/:id` | the run (own runs only; `seed` and `battle.state` stripped; `battle.roomId` kept) | 404 |
| PATCH | `/adventure/runs/:id/deck` | `{ remove: CardEntry[], energies: CardEntry[] }` — removals of cards in the deck, basic Energy set to the given counts; result within min/max and copy limits | 409 not `pre_battle`; 422 rule broken |
| POST | `/adventure/runs/:id/battle` | creates (or returns the live) adventure room for `currentBattle` → `{ roomId }`; phase `in_battle` | 409 wrong phase |
| POST | `/adventure/runs/:id/treasure` | `{ treasureId }` or `{ skip: true }` | 409 wrong phase; 422 not in `pendingOffer` |
| POST | `/adventure/runs/:id/abandon` | status `abandoned` | 409 `in_battle` (surrender first) |

All mutations run in one `$transaction` after `lockUsers` (users `xp.service.ts` `lockUsers`), like `progress.service.ts`.

### 5.2 Adventure battle rooms (socket)

- `GameRoomManager` gains a room kind `config.mode: "adventure"` with `aiSeat: "player2"`: player2 has no socket and never times out; no turn timer, answer clock, kick, forfeit timer, cleanup refund, bets, `Match` row or `settleMatch` (adventure battles are not matches: default of Q4). Adventure logic sits in a new `src/socket/adventure-room.ts`; `rooms.ts` gets small extension points (room kind, coin source per room, an after-action hook). `rooms.ts` is 2.9k lines: don't grow it.
- **Start**: `createAdventureRoom(run)`: decks from the run (player) and the battle's rival deck (by difficulty/starter for battle 10), `createAdventureGame` with the run's rules and passives, `room.rng` seeded per D10. The human joins with the existing `joinRoom { roomId }` → `gameStart` (masked for `player1`, `opponentInfo` = the rival's name/class/avatar, `adventure: { runId, battle, hearts, maxHearts, passives }`).
- **Human actions**: the existing `action` / `requestCoinFlip` events and `runAction` path, unchanged rules. Coins: the room's coin source = `room.rng`, through `takeLuckyCoin` for the first coin of a human-initiated action when the run has `lucky_coin`.
- **AI**: after every applied action, while `nextAIStep(state)` returns a step, the room applies it inside `withRandom(room.rng)` with `flip` = room coin source, broadcasts `gameState` (and `showCoinFlip` from `onCoins`, `flippedBy` relative to each viewer), waits the step's delay (500–800 ms, like SP), and snapshots. The loop never awaits inside `withRandom`.
- **Persistence**: after each human action and each AI step, `AdventureRun.battle = { roomId, state, rngState, aiPlan, humanActions }` (debounced ≤ 1 s; the human action log is the bug-repro record). On a `joinRoom` for an adventure room missing from memory (API restart, `refundUnsettledMatches` doesn't touch it), the room is rebuilt from the snapshot and the AI loop resumes.
- **End**: `gamePhase === GAME_OVER` (or surrender) → `applyBattleResult(runId, { victory, reason, turns })` exactly once (`room.resultSettled`), then `adventureBattleResult { victory, hearts, phase, offer?, runResult? }` to the player and the room closes (`FINISHED_ROOM_TTL_MS`). The client never sends a result.

### 5.3 Run logic (pure, `src/modules/adventure/run-logic.ts`)

- Offer: pool by battle (tier1 after 1–4, major after 5, tier2 after 6–9, none after 10); RNG `hashSeed(seed + ":" + battleIndex)`; exclude passives already owned, card treasures that would break the copy limit (by name) or the max deck size; up to 3 distinct; stored in `pendingOffer` (refresh-proof twice over).
- Treasure: `starter.basic|stage1|stage2` tokens resolved with the starter's `line`; cards added to `deck`; passives appended; `extra_heart` raises hearts and maxHearts.
- Deck edit: removed cards are gone for the run; only basic Energy may be added; Double Colorless Energy only by treasure; min 20 / max 40 / 4 copies by name except basic Energy (game-core `validateDeckEntries`).
- Result: victory 1–9 → offer + `choosing_treasure`; 10 → `won` + reward + progress; defeat → hearts − 1, `heartsLost` + 1, `pre_battle` (attempt + 1) or `lost`.
- Monotype: at every battle start, if the deck has a Pokémon whose type isn't the starter's (Colorless allowed) or a basic Energy of another type (DCE counts as Colorless), `offTypeUsed = true`.

### 5.4 Content (`content/adventures/pueblo-paleta-bosque-verde.json`)

The spec's JSON shape with D5 ids, validated by a zod schema at startup (server refuses to boot on an invalid file) and by a vitest test: 10 battles indexed 1–10; rival decks 20–24 and every hard-mode starter covered; pools reference existing treasures; starter decks within `rules`; every card allowed by `isAdventureCardAllowed`; copy limits; `modifiers` must be `[]` in v1.

## 6. Achievements and rewards

| Spec id | API id | Condition (from `AdventureProgress` / run rows) | Tier (default, Q5) |
|---|---|---|---|
| clear_normal | `adventure-1-clear-normal` | clearsNormal ≥ 1 | Bronze |
| clear_hard | `adventure-1-clear-hard` | clearsHard ≥ 1 | Gold |
| flawless | `adventure-1-flawless` | a won run with heartsLost = 0 | Silver |
| all_starters | `adventure-1-all-starters` | union of cleared starters (both difficulties) = 3 | Silver |
| all_starters_hard | `adventure-1-all-starters-hard` | clearedStartersHard = 3 | Platinum |
| purist | `adventure-1-purist` | a won run with `treasuresTaken` empty | Gold |
| monotype | `adventure-1-monotype` | a won run with `offTypeUsed = false` | Silver |

New checker `adventure` in `checkAndUpdateProgress` reading `AdventureProgress`; called after `applyBattleResult` of battle 10. Abandoned runs count nothing. The "meta" Legend achievement counts active achievements, so 7 new ones raise its target for everyone (Q5).

Rewards: normal → card back `cardback-bosque-verde` (API catalog entry next to `AVAILABLE_CARD_BACKS`, admin-grantable; frontend `CARD_BACKS` entry `source: "adventure"` + `public/card-backs/` image ≤ 500 px wide); hard → `UserStarterUnlock { starterId: "pikachu" }` (Q7). The content schema accepts `cosmetic | starter_unlock | card`.

## 7. Frontend (screens mapped to existing pieces)

| Screen | Route | Built from |
|---|---|---|
| Entry | `/play` | one `GAME_MODES` entry in `src/features/play/ui/PlayModeSelection.tsx` ("Aventura", pixel icon); `/adventure` in `PRIVATE_PATHS` (`src/domain/seo/site.ts`) and `ProtectRoute`. |
| Adventure select | `/adventure` | `Slab` + `LabelBand` card, achievements and rewards from `GET /adventures`; "Continuar" when a run is active. |
| New run | `/adventure/new` | the 3 starters with their decks (card tiles, no sleeves), normal/difficult toggle (`TabStrip`), Empezar. |
| Map | `/adventure/run` | new `AdventureMap` (10 nodes on a path by zone, Game Boy Color look: PokeAPI pixel sprites of each rival's lead Pokémon as the node, silhouette for future nodes, pulsing current node), `RunBar` (hearts, Batalla N/10, passives) — Q12; actions Editar mazo, Ver rival (only for beaten nodes and the current one's name), Batallar, Abandonar (confirm). |
| Deck editor | `/adventure/run/deck` | `src/features/draft/model/deck-layout.ts` `groupDeckCards` columns + `DraftCardTile` (− only) + the draft builder's basic Energy steppers + min/max chip (draft `DeckBuilder.tsx` l.396–413, 568–609) in a new `RunDeckEditor` (no timer, no sideboard: removed cards are lost). |
| Battle | `/adventure/battle/[roomId]` | `MultiplayerGamePage` with `context={{ kind: "adventure", runId }}`: no chat / turn timer / kick / room chip, `RunBar` through `GameLayoutProps.headerExtra` (`GameHeader` `headerExtra` l.66), exits to `/adventure/run`, `adventureBattleResult` instead of `matchSettled`. |
| Battle result | modal over the board | victory → treasure screen; defeat → heart-break animation (Motion) + "Te quedan N corazones" → map. |
| Treasure choice | `/adventure/run/treasure` | 3 large tiles (cards: card art; passives: PokeAPI item sprites), the major ones with the `HoloSparkle` overlay (`src/ui/cards/overlays/`); Elegir / Saltar. |
| End of run | `/adventure/run/end` | won/lost, battles won, treasures, newly claimable achievements (link to the profile tab), the reward; Volver / Nueva run. |
| Profile | — | achievements grouped "Aventura" (client-side id prefix `adventure-`, `AchievementsTab.tsx` groups by tier only today); new `CARD_BACKS` entry. |

Text in Spanish, tú, neutral (no regional slang); Nunito only; no coloured border strips; no card sleeves in grids; PokeAPI sprites, never emoji (`public/sprites/CREDITS.txt`). There are no trainer-class sprites in `public/sprites` today (only `ui/` items/badges, avatars, stickers, emotes).

## 8. Card id mapping (all verified in the 0.9.0 catalog)

Every card exists, is Base Set and is implemented (`UNSUPPORTED_TRAINERS` is empty since 0.9.0; none is on the AI's never-plays list). Weaknesses as in the catalog.

| Spec | Catalog id | Name | Notes |
|---|---|---|---|
| base1-2 | `base-set-002-blastoise` | Blastoise | Stage 2, 100 HP, W Lightning, Rain Dance |
| base1-4 | `base-set-004-charizard` | Charizard | Stage 2, 120 HP, W Water, R Fighting, Energy Burn |
| base1-15 | `base-set-015-venusaur` | Venusaur | Stage 2, 100 HP, W Fire, Energy Trans |
| base1-17 | `base-set-017-beedrill` | Beedrill | Stage 2, 80 HP, R Fighting, retreat 0 — **catalog has W Water; the printed card is W Fire — verify and fix** (battles 5, 7) |
| base1-19 | `base-set-019-dugtrio` | Dugtrio | Stage 1, 70 HP, W Grass, R Lightning |
| base1-22 | `base-set-022-pidgeotto` | Pidgeotto | Stage 1, 60 HP, Mirror Move |
| base1-24 | `base-set-024-charmeleon` | Charmeleon | Stage 1, 80 HP, W Water |
| base1-30 | `base-set-030-ivysaur` | Ivysaur | Stage 1, 60 HP, W Fire |
| base1-33 | `base-set-033-kakuna` | Kakuna | Stage 1, 80 HP, W Fire |
| base1-34 | `base-set-034-machoke` | Machoke | Stage 1, 80 HP, W Psychic |
| base1-35 | `base-set-035-magikarp` | Magikarp | 30 HP, W Lightning |
| base1-38 | `base-set-038-poliwhirl` | Poliwhirl | Stage 1, 60 HP, W Grass |
| base1-40 | `base-set-040-raticate` | Raticate | Stage 1, 60 HP, W Fighting, R Psychic |
| base1-42 | `base-set-042-wartortle` | Wartortle | Stage 1, 70 HP, W Lightning |
| base1-44 | `base-set-044-bulbasaur` | Bulbasaur | 40 HP, W Fire |
| base1-45 | `base-set-045-caterpie` | Caterpie | 40 HP, W Fire |
| base1-46 | `base-set-046-charmander` | Charmander | 50 HP, W Water |
| base1-47 | `base-set-047-diglett` | Diglett | 30 HP, W Grass, R Lightning |
| base1-48 | `base-set-048-doduo` | Doduo | 50 HP, W Lightning, R Fighting |
| base1-52 | `base-set-052-machop` | Machop | 50 HP, W Psychic |
| base1-53 | `base-set-053-magnemite` | Magnemite | 40 HP, W Fighting, Selfdestruct |
| base1-54 | `base-set-054-metapod` | Metapod | Stage 1, 70 HP, W Fire |
| base1-56 | `base-set-056-onix` | Onix | 90 HP, W Grass |
| base1-57 | `base-set-057-pidgey` | Pidgey | 40 HP, W Lightning, R Fighting |
| base1-58 | `base-set-058-pikachu` | Pikachu | 40 HP, W Fighting (not `jungle-060-pikachu`) |
| base1-59 | `base-set-059-poliwag` | Poliwag | 40 HP, W Grass |
| base1-61 | `base-set-061-rattata` | Rattata | 30 HP, W Fighting, R Psychic |
| base1-62 | `base-set-062-sandshrew` | Sandshrew | 40 HP, W Grass, R Lightning |
| base1-63 | `base-set-063-squirtle` | Squirtle | 40 HP, **W Lightning** (spec's note is right) |
| base1-65 | `base-set-065-staryu` | Staryu | 40 HP, W Lightning |
| base1-67 | `base-set-067-voltorb` | Voltorb | 40 HP, W Fighting |
| base1-69 | `base-set-069-weedle` | Weedle | 40 HP, W Fire |
| base1-71 | `base-set-071-computer-search` | Computer Search | |
| base1-80 | `base-set-080-defender` | Defender | |
| base1-84 | `base-set-084-pluspower` | PlusPower | |
| base1-88 | `base-set-088-professor-oak` | Professor Oak | |
| base1-90 | `base-set-090-super-potion` | Super Potion | |
| base1-91 | `base-set-091-bill` | Bill | |
| base1-92 | `base-set-092-energy-removal` | Energy Removal | |
| base1-93 | `base-set-093-gust-of-wind` | Gust of Wind | |
| base1-94 | `base-set-094-potion` | Potion | |
| base1-95 | `base-set-095-switch` | Switch | |
| base1-96 | `base-set-096-double-colorless-energy` | Double Colorless Energy | limited to 4 |
| base1-97 | `base-set-097-fighting-energy` | Fighting Energy | |
| base1-98 | `base-set-098-fire-energy` | Fire Energy | |
| base1-99 | `base-set-099-grass-energy` | Grass Energy | |
| base1-100 | `base-set-100-lightning-energy` | Lightning Energy | |
| base1-102 | `base-set-102-water-energy` | Water Energy | |

Other printings with the same name (Team Rocket Charmander/Squirtle/Rattata/Magikarp/Voltorb/Magnemite/Diglett/Machop, Jungle Pikachu) never enter a run (no free additions), but the copy limit counts by name, as in the deck builder.

Deck sums checked: starters 24, battles 1–9 20 each, battle 10 normal 24, hard ×3 24 each.

## 9. Spec problems found

1. **Pack de evolución is never offered with an untouched starter deck**: the starter has 4 copies of the Basic, `t1-evolucion` adds a 5th, and the spec excludes treasures that break the 4-copy limit. Default (Q3): starters with 3 Basics and 3 Rattata (still 24).
2. **Beedrill's catalog data** looks wrong (W Water instead of Fire) — engine task to verify every adventure card against the printed card (`docs/card-verification` style) before content is final.
3. **`prize_minus_one` "se apartan 3, gana al tomar 2"** would need a prize target separate from the Prize pile in 5+ win checks; dealing 2 Prizes is equivalent except that one more card stays in the deck (Q1).
4. **Deck-out pressure**: 24 cards − 7 − 3 = 14 draws; Bill (+2) and especially Professor Oak (discard the hand, draw 7; `t2-oak`, `m-profesor`) can deck the player out. The spec already flags it for H7; the simulator task measures it.
5. **Energy freedom vs monotype / Compañero eléctrico**: basic Energy of any type can be added freely, so the "+2 energía Rayo" of `t1-pikachu` is only a convenience, and monotype must be judged per battle on the deck used (§5.3), not on treasures taken.
6. **Battle 10 hard vs Squirtle** relies on 3 Pikachu with only 2 Lightning Energy (Thundershock needs one): weak by design? Playtest item, not a rule conflict.
7. The spec's Run model has `activeGameId`; with A the battle is a room plus a DB snapshot (`battle` Json).
8. `GET /adventures/:id` "sin mazos rivales de batallas futuras" + "ver rival" on the map: only beaten battles and the current one's identity are shown (§5.1).

## 10. Risks

- **Global `Math.random` swap on the server** (`withRandom`): safe only while no `await` happens inside it; the room code must keep every engine call synchronous inside the wrapper (review focus).
- **Server load**: the AI runs on the VPS (~2 ms per decision, ≤ ~100 ms on crowded boards) — fine for tens of concurrent runs; the AI loop yields between steps (delays) so it never blocks the event loop long.
- **Snapshot size**: `state.events` grows unbounded (game-core CLAUDE.md); a 20-card game is short, but the snapshot should drop events older than the last N (the client gets them live).
- **Two battle UIs**: SP vs-AI stays browser-run; adventure is server-run on the MP page. New board features must keep working on the MP page (already a project rule).
- **VPS migration (2026-11-21)**: runs live in Postgres, so they move with the DB dump; live rooms are rebuilt from snapshots.
- **Content tuning** needs playtests (H7) — the simulator's per-battle win rates are the input.

## 11. Owner questions (defaults in bold, used by the plan)

1. `prize_minus_one`: **deal 2 Prizes** (one more card in the deck) vs deal 3 and win at 2.
2. `lucky_coin` scope: **the first coin of the player's own action in each battle (attack incl. Confusion, Trainer, power, retreat)**; not the opening "who starts" coin, not the between-turns Sleep flip, not coins flipped for the AI's attacks.
3. Starter deck vs `t1-evolucion`: **3 Basics + 3 Rattata** (24 cards) vs keep 4 Basics and drop the Basic from the treasure.
4. Per-battle economy: **no coins / XP / missions / stats / Match rows for adventure battles**; only the unique reward and achievements.
5. Achievement tiers as in §6 (**Bronze, Gold, Silver, Silver, Platinum, Gold, Silver**) with the standard tier coins; **exclude adventure achievements from the Legend "meta" count** so existing players' target doesn't move.
6. "Bosque Verde" card back art: **owner supplies it**; a placeholder crop of `public/bg/bg-field.png` until then.
7. Pikachu `starter_unlock`: **recorded and shown as unlocked; playable when a future adventure lists Pikachu as a starter** (Adventure 1 keeps 3 starters).
8. Difficult mode: **open from the start** vs locked until a normal clear.
9. AI: **the shipped smart AI in every battle**, difficulty from decks only (vs the weaker legacy AI for battles 1–4 in normal).
10. Abandon: **allowed in `pre_battle` and `choosing_treasure`**; inside a battle the player surrenders first (heart lost).
11. Verified email: **anyone can play; claiming achievements already needs a verified email; the card back is granted regardless**.
12. Map art: **PokeAPI pixel sprites** (each rival's lead Pokémon, items for hearts/passives: e.g. heart-scale, amulet-coin, quick-claw, exp-share, escape-rope) — no trainer-class sprites exist today.
13. Idle runs and battles: **never expire**.
