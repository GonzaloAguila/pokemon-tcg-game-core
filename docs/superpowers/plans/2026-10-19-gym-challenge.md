# Gym Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Gym Challenge set (122 unique cards, already cataloged as data) fully playable in single-player and multiplayer: every attack, power, Trainer and Stadium effect, the new mechanics (live HP, Shapeshift / Psylink, pre-attack reactions, Chaos Gym, hidden cards), AI support, then boosters and UI.

**Architecture:** Engine first in `pokemon-tcg-game-core` (effects as catalog data + engine hooks + registry entries, a test per card with an effect, the bot simulator clean), then the API (`pokemon-tcg-api`) and the frontend (`pokemon-tcg`) consume it generically. Every behavior is a function of `GameState` in the engine; consumers only render steps, flip coins they are told to flip, and send answers.

**Tech Stack:** TypeScript, vitest (all three repos), Prisma/Express/Socket.io (API), Next.js 16 + React 19 (frontend).

**Spec:** `docs/superpowers/specs/2026-10-19-gym-challenge-design.md` (this repo). Doubts with defaults: `docs/card-doubts.md` → "Gym Challenge". Read both and `CLAUDE.md` of each repo before starting. Owner rulings already made for Gym Heroes (`.superpowers/sdd/2026-10-16-gym-heroes/progress.md`) apply here too.

## Global Constraints

- Branch `feat/gym-challenge` in every repo (game-core: already created from master 0.8.3, catalog commit `c6861d7`). Consumers work in their `-news` worktrees (API `D:/Proyectos/pokemon-tcg-api-news`, frontend `D:/Proyectos/pokemon-tcg-news`) on a new `feat/gym-challenge` from origin's main/master; never touch `D:/Proyectos/pokemon-tcg` or `D:/Proyectos/pokemon-tcg-api` directly.
- No publish, no deploy, no merge to main/master, no prod DB. Consumers use a packed engine: `npm pack` in game-core, then `npm install --no-save <path-to.tgz>` in the consumer.
- **Task 0 first:** the owner answers `docs/card-doubts.md` → "Gym Challenge"; the controller rewrites any default the owner changed in the affected task briefs before dispatching. Unanswered entries keep their **bold** default.
- Card data lives in `src/domain/catalog/gym-challenge.ts` (generated once; edit it by hand from now on). Add `effects` to attacks and real fields to powers (`amount`, `energyType`…); keep the Spanish texts as they are unless a ruling changes the meaning. A placeholder `PokemonPowerType` may be replaced by an existing type when the behavior is identical; delete the placeholders nobody uses in Task 11.
- While a Trainer isn't implemented its name stays in `UNSUPPORTED_TRAINERS`; each task removes the names it implements (the registry coverage test enforces the rest). The set stays `inDevelopment: true` until Task 11.
- Text: Pokémon and Trainer names in English, everything else Spanish, tú voice, same terms as the other sets (Energía, Banca, Pokémon Activo, Premios, Estadio, contadores de daño, PS).
- Event log lines perspective-free (see game-core CLAUDE.md "Event perspective"); `test/event-perspective.test.ts` must stay green. Every step another player answers or any mid-attack question carries a harmless `defaultSelection` (`test/default-selection.test.ts`).
- Never mutate input state; actions validate with `canX` and throw `IllegalActionError`. Coins are always passed in by the caller (server in MP); `getXCoinFlips` / coin plans tell the caller how many.
- Tests first (`makeState`, `inPlay`, `gameCard(name, "gym-challenge")`, `armedFor`, `deepFreeze`); `npx tsc --noEmit` and the task's tests green before each commit; `npm run simulate -- --games 500 --seed 1 --sets gym-challenge --policy all --decks random-mix` with 0 failures from Task 3 on.
- UI: Spanish, Nunito only, no colored border strips; every new modal takes `isOpen`/`onClose`.
- Commit after each task with the attribution lines:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01Bm7JEzXpR4jCbPK1ZrpakY`.

## Review Focus

1. Koga's Ninja Trick: the switch happens before any coin of the attack is flipped, and the coin plan (Transparency, Pollen Defense, Rebellion…) is computed for the Pokémon that actually defends; in MP the server flips nothing until the answer (Task 7 + Task 13 tests).
2. Live HP: Gaseous Form / Giant Growth / Shapeshift lowering HP below the damage Knocks Out with a Prize; Dark Wave stopping Gaseous Form does too (Task 4 test).
3. Psylink and Shapeshift attack indices: a paused attack (Flee, Bench Guard, ESP, Ninja Trick) resumes with the same index on the untouched state (Task 4 test).
4. Chaos Gym tails: the card never resolves for its owner; its coins / steps are never asked of its owner; it ends in its owner's discard pile whoever used it (Task 9 test).
5. Hidden cards never leak: Misty's Wish's Prize, the Quiz cards, Surprise's card and a face-down Secret Plan card are masked for the other player in MP and in the AI's knowledge view (Tasks 8, 10, 13).

---

## Stage 1 — game-core (`D:/Proyectos/pokemon-tcg-game-core`, branch `feat/gym-challenge`)

### Task 0: Owner rulings (controller, no subagent)

- [ ] **Step 1:** Read the owner's answers in `docs/card-doubts.md` → "Gym Challenge"; record each changed default in `.superpowers/sdd/2026-10-19-gym-challenge/progress.md` (create it, same ledger format as Gym Heroes).
- [ ] **Step 2:** Patch the affected tasks below (Chaos Gym and Secret Plan alternatives B shrink Tasks 9 and 10 a lot).

### Task 1: Attacks that fit the existing effect vocabulary (data only)

**Files:**
- Modify: `src/domain/catalog/gym-challenge.ts` (`effects` on attacks; local helpers like gym-heroes.ts's `coinStatus`, `coinDamage`, `coinBonus`, `selfDamage`, `tailsFails`… — copy, don't import across catalogs)
- Create: `test/gym-challenge-attacks.test.ts` (table at the top: card → effect kinds used)

**Interfaces:** none new. Covers, by number: #1 Heat Tackle / Firestorm (discard requirement), #2 Flame Jet, #4 Wide Solarbeam, #5 Dragon Tornado, #6 Hurricane Punch, #7 Tumbling Attack, #8 Ambush, #9 Nerve Poison (`additionalStatuses`) / Hyper Needle (`tailsFails` + `UseOnce`, "either way"), #11 Thundertackle, #12 Electro Beam, #14 Hypnoblast, #15 Plasma, #16 Mega Burn, #21 Burn Up, #22 Lie Low (`ReduceDamage` 20 next turn), #24 both, #25 Poison Buildup / Poison Power (if `RequireStatus`/bonus covers it; else Task 2), #27 both, #28 High Voltage / Thunder Flare, #29 Shadow Bind, #30 Water Spray, #32, #33 Stamp, #36 both, #37 both, #38 Stretch Vine, #39 both, #41 Double Razor Leaf, #42 Headlock, #43 Double Scratch, #44 both, #45 Rend (if a damaged-defender bonus exists), #46 Sonic Scream, #47 Toxic Secretion, #48 both, #49 Wing Attack, #50 both, #51 Scratch, #52 Power Ball, #53 Double-edge, #54 both (Ice Throw if a type-conditional bonus exists), #55 both, #57 Hug, #58 Psyshot, #59 Magic Darts, #60 Fire Tail Slap, #61 both, #62 both, #63 Fury Swipes, #64 Hind Kick, #65 both, #66 Bite, #67 both, #68, #69 Pulled Punch, #70, #71 both, #72 Fury Punch, #73 both, #74, #75, #76 both, #78 Sludge Grip (if the status lands on the new Defending Pokémon; else Task 2), #79, #80, #81, #82, #84, #85 Quick Attack, #86, #88, #89 Bubbles / Amnesia, #91, #92, #93 Pound, #94 Quick Attack, #95 both, #96 Lick, #98 Barrier Attack, #99 Scratch. Focus Energy (#53, #85) per the doubts ruling (Gym Heroes' Rattata modelling).

- [ ] **Step 1:** For each attack above, a scenario test through `executeAttack(state, i, { coinResults })` (heads and tails where coins matter) asserting the printed outcome; group by effect kind with `it.each` to keep the file short.
- [ ] **Step 2:** Run — fails (no effects).
- [ ] **Step 3:** Add the effect data. Anything that turns out to need engine code moves to Task 2's list (note it in the commit message).
- [ ] **Step 4:** `npx vitest run test/gym-challenge-attacks.test.ts test/gym-challenge-catalog.test.ts`, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** `feat: Gym Challenge attacks on the existing effect vocabulary`.

### Task 2: New attack effect kinds (no player choice)

**Files:**
- Modify: `src/domain/constants/enums.ts` (`AttackEffectType`), `src/domain/cards/types.ts` (`AttackEffect` fields), `src/lib/gameState.ts` (`executeAttack` effects loop, `calculateBaseDamage`, `canUseAttack` requirements, `endTurn` expiries, `board/clearEffectsAsIfEvolved`), `src/domain/ai/actions.ts` (damage estimates), `src/domain/catalog/gym-challenge.ts`
- Test: `test/gym-challenge-attacks.test.ts` (new `describe` per kind)

**Interfaces (names are proposals; keep them if nothing existing fits):**
- `coinFlip.require: "allHeads"` — Summon Storm (#5: 20 to each other Pokémon, no W/R), Fast-Acting Poison (#77).
- `SwapDamageCounters` (#14 Juxtapose, counters, can Knock Out either), `MoveDamageCountersToDefender` (#30 Damage Shift), `SetRemainingHp { hp: 10 }` (#58 Life Drain).
- `DiscardStadium` (#34 Detonate, #35 Mega Thrash; after damage, to its owner's discard pile).
- `noDamageOnTails` + self effects on tails (#42 Risky Attack: 100 to itself; #99 Random ESP: self Confused).
- `SelfDamagePerEnergy { energyType }` (#15 Electroburn).
- `RequireLastAttack { name }` (#22 → #22 Earthdrill): `PokemonInPlay.lastAttackName` + `lastAttackTurn`, set by every attack, cleared by Bench / evolution.
- `RequireEqualEnergyCards` (#93 Synchronize).
- `BonusIfBenchedNamed { name, amount }` (#23 Love Lariat, on heads; tails nothing), self-status base override (#25 Poison Power if not done in Task 1).
- `IntimidateLock { maxHp: 50 }` (#7): a mark on the Defending Pokémon `cantAttackPokemonId` until the end of the opponent's next turn (T+1), cleared if either is Benched / evolves; `canExecuteAttack` refuses with a Spanish reason.
- `CoinsPerDefenderCounter` coin count (#56 Pendulum Curse: `getAttackCoinPlan` reads the Defending Pokémon's counters).
- `HealAll { amount: 10 }` (#69 Group Therapy, both sides).
- `LastingSandAttack` (#87 Ink Spurt: like `SandAttack` but until evolve / Bench; one coin even with Smokescreen too).
- `Bonfire` composite (#31: discard 1 Fire per heads, nothing if none discarded, 10 × heads to every opposing Pokémon, no W/R).
- Giant Growth (#10) is Task 4 (HP hook).

- [ ] **Step 1:** Failing tests, one per kind (incl. KO checks after counter moves and the T / T+1 expiry of Intimidate against `turnNumber`).
- [ ] **Step 2–3:** Implement, then the catalog data for each card; AI estimates in `ai/actions.ts` / `ai/evaluate.ts` (expected damage over coins) for the damage kinds.
- [ ] **Step 4:** Task tests + `test/immutability.test.ts` + `test/pending-flags.test.ts` green; `npm run simulate -- --games 300 --seed 2 --sets gym-challenge --policy all`.
- [ ] **Step 5: Commit** `feat: new attack effects for Gym Challenge`.

### Task 3: Attacks with choices, searches and hidden cards

**Files:**
- Modify: `src/lib/attackChoices.ts` (`isAttackChoiceEffect`, `stepFor`, `applyChoice`), `src/lib/gameState.ts`, `src/domain/ai/pending.ts` + `src/domain/ai/attackAnswers.ts` (AI answers), `src/domain/simulation/game.ts` (resolvePending), `src/domain/catalog/gym-challenge.ts`
- Test: `test/gym-challenge-attack-choices.test.ts`

**Interfaces:** each a `pendingAttackChoice` step (never a new pending flag):
- #12 Super Removal (heads: attacker picks 1 Energy card on each opposing Pokémon with Energy; respects Brock's Protection once Task 7 lands — leave a `energyRemovalBlocked` call site TODO-free by adding the guard function in this task returning false).
- #4 Growth (heads: up to 2 basic Grass from the hand to the attacker), #40 Lunar Power (heads: Benched Pokémon + matching Evolution card from the deck, "by effect" evolution: ignores played-this-turn, honours Prehistoric Power), #49 Messenger (to deck top, then search Basic / Evolution not named Koga's Pidgey, shuffle, promote), #83 Group Attack (optional search of Koga's Zubat onto the Bench before damage, then 10 × Koga's Zubat in play), #39 Errand-Running / #95 Energy Support if not done in Task 1.
- #43 False Charity (heads: top card shown; Trainer → their discard, else → their hand), #63 Pranks (heads: a card of their discard → their deck top), #51 Surprise (random hand card: the engine picks with `Math.random` — the server in MP —, shown to the attacker only through `pendingPeek`, shuffled into their deck; log doesn't name it), #94 Psyscan (opponent's hand through `pendingPeek`).
- #56 Invigorate (a Basic Pokémon card from either discard pile to its owner's Bench with floor(HP/2) counters; respects `maxBenchSize`), #57 Helping Hand (choose an opposing Pokémon and 0..all its counters, draw that many).
- #90 ESP (Misty's Psyduck): 3 coins; 1 heads draw, 2 heads 20 damage, 3 heads Metronome's copy flow (`executeMetronome`-style choice, then the copied attack's own coins requested via `getAttackChoiceCoinPlan`).

- [ ] **Step 1:** Failing tests per card: the step shape (`chooser`, options, `defaultSelection` when the opponent answers), the resolution, AI answer, perspective-free log.
- [ ] **Step 2–3:** Implement; simulator `resolvePending` answers each.
- [ ] **Step 4:** Tests + `npm run simulate -- --games 500 --seed 3 --sets gym-challenge --policy all --decks random-mix` (0 failures).
- [ ] **Step 5: Commit** `feat: Gym Challenge attacks with choices`.

### Task 4: Live HP and card copies (Gaseous Form, Giant Growth, Shapeshift, Psylink)

**Files:**
- Modify: `src/domain/powers/index.ts` (`getEffectiveHp`, `getEffectivePokemonCard`), `src/lib/gameState.ts` (`getAvailableAttacks`, `PokemonInPlay.shapeshiftCard?: GameCard`, `hpOverride` for Giant Growth, Bench / evolution clears), `src/domain/effects/powers.ts` (Shapeshift: activated power, attach + "discard it during your turn" option), `src/domain/cards/in-play.ts` (`cardsLeavingPlay` includes the Shapeshift card), status application (discard Shapeshift card on Asleep / Confused / Paralyzed), `src/domain/ai/*`
- Test: `test/gym-challenge-live-hp.test.ts`

**Interfaces:**
- `getEffectiveHp(state, pokemon)` = copied / printed HP + Gaseous Form (+10 per Psychic Energy card attached, Rainbow attached counts, only while `isPowerActive`) or Giant Growth's 80.
- `getEffectivePokemonCard(state, pokemon)`: Shapeshift card (name, types, HP, W/R, retreat, attacks; `power` of the Ninetales removed) before Transform.
- `getAvailableAttacks(state, pokemon)`: own → Recall → Psylink (`fromCard` = the Pokémon copied, `psylink: true`), indices appended so existing ones never change.

- [ ] **Step 1:** Failing tests: Gastly 40 → 60 with 2 Psychic; Energy Removal on it with 30 damage Knocks it Out (Prize); Dark Wave (Task 2's `powersSuppressed`) does too; Koga's Ditto Giant Growth 80 / Pound 30, Benched with 50 damage → Knocked Out; Shapeshift into an Evolution card (attacks, Weakness, retreat, owner name for Pewter City Gym) and the card discarded when it becomes Confused; Psylink lists a Benched Sabrina's Kadabra's attacks, pays their cost, a paused attack resumes with the same index.
- [ ] **Step 2–4:** Implement, green, simulate.
- [ ] **Step 5: Commit** `feat: live HP, Shapeshift and Psylink`.

### Task 5: Trigger powers and the other powers

**Files:**
- Modify: `src/lib/gameState.ts` (`defenderCoinKind` new kinds, `AttackCoinPlan.power?: number` for Rebellion after `smokescreen`, `checkKnockouts` sweep for Scram, Fortitude in the Knock Out path), `src/domain/powers/index.ts` (Relaxing Scent next to `applyDamageHalving`, rounded up), `src/domain/board/index.ts` (`attachEnergyCard`: Healing Fire hook), `src/domain/effects/powers.ts` (Soak Up, Emerge in `POWER_EFFECTS` + `ACTIVATED_POWER_TYPES`), `src/lib/powerChoices.ts` (`ON_PLAY_POWERS["Llamar al Jefe"]`: search Giovanni), `src/domain/ai/*`, `src/domain/simulation/*` (coin layout in policies)
- Test: `test/gym-challenge-powers.test.ts`

**Interfaces:**
- `AttackCoinPlan.power?: number` (Rebellion: 2 when the attacker is a working Misty's Gyarados; layout `[smokescreen][power][attack…][stadium][defender]`), documented in CLAUDE.md's coin layout.
- `defenderCoinKind` gains `"fortitude"` (used only if the attack would Knock it Out; heads = 10 HP left), `"energyDrain"` (used only if damaged; heads = its owner picks an Energy card of the attacker to discard → `pendingAttackChoice` for its owner), `"shockBlast"` (used only if damaged while Active; tails = 20 to both Actives, Knock Outs together).
- Scram: in the `checkKnockouts` sweep, before Knock Outs, a working Primeape with exactly 10 HP left → deck (cards too), no Prize, promotion if Active.

- [ ] **Step 1:** Failing tests per power (coins passed in; each "can't be used if already Asleep…" clause; Toxic Gas stops them; Rebellion both tails with a Confused Gyarados that passed the Confusion flip).
- [ ] **Step 2–4:** Implement, green, `npm run simulate -- --games 500 --seed 4 --sets gym-challenge --policy all --stats`.
- [ ] **Step 5: Commit** `feat: Gym Challenge Pokémon Powers`.

### Task 6: Simple Trainers

**Files:**
- Modify: `src/domain/effects/trainers.ts` (`TRAINER_EFFECTS` entries; remove from `UNSUPPORTED_TRAINERS`), `src/domain/trainers/index.ts`, `src/domain/board/index.ts` (`getTrainerBlocker`: `trainerLockUntilTurn`; `getEvolutionBlocker` / evolution checks: Giovanni's mark), `src/lib/gameState.ts` (`GameState.benchProtectedUntilTurn?`, `trainerLockUntilTurn?`, `evolveAnyTimeIds?` per side; swapped by `swapSides`; damage step for Transparent Walls), `src/domain/ai/cardEffects.ts`
- Test: `test/gym-challenge-trainers.test.ts`

**Interfaces / cards:** Erika's Kindness, Giovanni's Last Resort, Master Ball, Max Revive, Misty's Tears, Fervor, Warp Point (opponent step first, `defaultSelection` first Benched), Sabrina (move all Energy between two Sabrina's Pokémon), Koga (a turn `GameModifier` like Misty: Poisoned after a Koga's Pokémon's attack damages the Defending Pokémon), Rocket's Secret Experiment (coin; tails: `trainerLockUntilTurn = turnNumber + 2`), Transparent Walls (`benchProtectedUntilTurn = turnNumber + 1`), Giovanni (`evolveAnyTimeIds` for the turn, follows the evolved Pokémon), Blaine (resolved when played: Pokémon step + 2 Fire Energy step, counts as the turn's attachment; refused if an Energy was attached this turn).

- [ ] **Step 1:** Failing tests through `playTrainerCard` per card (canUse reasons in Spanish, steps, coins, resolution, expiry against `turnNumber`).
- [ ] **Step 2–4:** Implement, green, simulate.
- [ ] **Step 5: Commit** `feat: Gym Challenge Trainers`.

### Task 7: Attached Trainers (Brock's Protection, Koga's Ninja Trick) and the pre-attack reaction

**Files:**
- Modify: `src/domain/trainers/attached.ts` (expiry `"never"` for Brock's Protection; Ninja Trick discarded when its Pokémon goes to the Bench), `src/lib/gameState.ts` (`energyRemovalBlocked(state, pokemon, by: "opponent")` read by every attack / Trainer path that takes an attached Energy off a Pokémon: Energy Removal, Super Energy Removal, Super Removal, Hyper Beam, Discard-defender-Energy effects, Whirlpool-style…; the pre-attack reaction), `src/lib/attackChoices.ts`, `src/domain/ai/attackAnswers.ts`, `src/domain/ai/executor.ts` (`finishAIAttackAfterReaction` also after a pre-attack answer), `src/domain/simulation/*`
- Test: `test/gym-challenge-attached-trainers.test.ts`

**Interfaces:**
- `getAttackPreReaction(state, attackIndex): SelectionStep | null` — the defender's Ninja Trick question (chooser `"opponent"`, `defaultSelection` none = stay).
- `executeAttack(state, i, { coinResults })` with a pending pre-reaction: returns the state untouched with `pendingAttackChoice.reaction = { answers: "preAttack" }` **before validating coins**; callers flip nothing until `resolveAttackChoice` answers it; then `getAttackCoinPlan` on the returned state and `executeAttack` again (the reaction recorded in `ExecuteAttackOptions.reactions.preAttack` so it isn't asked twice).

- [ ] **Step 1:** Failing tests: Energy Removal / Super Removal / Hyper Beam skip a protected Pokémon; your own Energy discard still works; Ninja Trick switch → the new Active takes the whole attack (its Transparency coin now in the plan), Ninja Trick discarded; not asked with an empty Bench; a confused attacker's tails never asks; AI answers.
- [ ] **Step 2–4:** Implement, green, `test/default-selection.test.ts`, simulate.
- [ ] **Step 5: Commit** `feat: Brock's Protection, Koga's Ninja Trick (pre-attack reaction)`.

### Task 8: Trainers the opponent answers or that use hidden cards

**Files:**
- Modify: `src/domain/effects/trainers.ts`, `src/domain/catalog/pokedex-heights.ts` or a new `src/domain/catalog/quiz.ts` (`quizCardNameOptions(card, attackName)`), `src/domain/ai/cardEffects.ts` (`answerStepForAI`), `src/domain/ai/knowledge.ts` (hidden cards), `src/lib/gameState.ts` (Sabrina's Psychic Control: play from the opponent's discard)
- Test: `test/gym-challenge-opponent-trainers.test.ts`

**Interfaces / cards:**
- Blaine's Quiz #2 (opponent step Pokémon / Trainer / Energy, `defaultSelection` first), Blaine's Quiz #3 (player picks card + one of its attacks; opponent picks among `quizCardNameOptions` — 4 deterministic names), Misty's Wish (player picks a Prize position and looks, then a hand card; opponent accept / decline, `defaultSelection: ["decline"]`; Prize face up stays revealed as before).
- Sabrina's Psychic Control: `playTrainerCard(state, cardId, { selections, coinResults, borrowedFromOpponentDiscard: true })` after its heads; Trainer effects must take the played card through a shared `takePlayedCard(state, cardId)` (hand or the borrowed discard card, which stays in the opponent's discard pile). The SP / MP flow: a step listing the eligible Trainers, then that Trainer's own steps (`getTrainerSteps` of the borrowed card).

- [ ] **Step 1:** Failing tests: each step's `chooser` / `answererDescription` / `defaultSelection`, outcomes for right / wrong guesses, Misty's Wish accept / decline / empty hand, Psychic Control with Potion and with a Trainer that needs discards; the borrowed card stays in the opponent's discard pile; hidden cards absent from the opponent's `knowledgeView`.
- [ ] **Step 2–4:** Implement, green, simulate.
- [ ] **Step 5: Commit** `feat: Blaine's Quiz #2 / #3, Misty's Wish, Sabrina's Psychic Control`.

### Task 9: Stadiums

**Files:**
- Modify: `src/domain/stadiums/rules.ts` (`stadiumIgnoresWeakness`, `stadiumResistanceModifier`, `stadiumEvolutionHeal`, `stadiumBenchPlayCoin`), `src/domain/effects/stadiums.ts` (`STADIUM_ACTIONS`: Fuchsia City Gym (once per turn per player, coin), Saffron City Gym (unlimited)), `src/domain/board/index.ts` (`getPlayBasicCoinFlips(state, cardId, position)`, `playBasicPokemon(state, cardId, position, { coinResults })` for Rocket's Minefield Gym: tails 2 counters; omitted coins = the engine flips), `src/lib/gameState.ts` (W/R step, evolution heal for Viridian City Gym on every evolution path), `src/domain/effects/index.ts` (Chaos Gym: leading coin in `getTrainerCoinFlips` while it is in play; tails cancels the card and, default ruling, sets `pendingTrainerChoice` for the opponent "¿Usar esta carta?"), `src/domain/ai/cardEffects.ts` (`stadiumValue` for each)
- Test: `test/gym-challenge-stadiums.test.ts`

- [ ] **Step 1:** Failing tests: Resistance −30 → −10; Cinnabar ignores Weakness only for a Water attacker on a Blaine's Pokémon; Viridian heals 20 on evolution (Breeder too); Fuchsia once per turn each player, heads shuffles; Saffron returns basic Energy only; Minefield coin on Bench play (Mysterious Fossil Knocked Out by the 2 counters, no Prize), not on Lt. Surge / Invigorate / Max Revive; Chaos Gym heads plays normally, tails never resolves for its owner, the opponent may play it (steps on the opponent's view), card ends in its owner's discard pile; the AI declines.
- [ ] **Step 2–4:** Implement, green, simulate with `--stats` (each Stadium played).
- [ ] **Step 5: Commit** `feat: Gym Challenge Stadiums`.

### Task 10: Lt. Surge's Secret Plan (skip if the owner chose alternative B)

**Files:**
- Modify: `src/lib/gameState.ts` (`PokemonInPlay.faceDown?: true`; flip rule hooks: becoming the Active, being targeted / damaged / affected, evolving, retreating; `flipFaceDown(state, pokemonId)` → stays as the Basic Pokémon or is discarded with its cards, no Prize), `src/domain/board/index.ts` (owner's "Dar la vuelta" action during the turn), `src/domain/effects/trainers.ts`, `src/domain/ai/knowledge.ts` (masked), `src/domain/simulation/invariants.ts`
- Test: `test/gym-challenge-secret-plan.test.ts`

- [ ] **Step 1:** Failing tests: a face-down card counts as a Bench Pokémon (bench size, Gust of Wind target → flips first), Energy can be attached without flipping, promotion flips it, a Trainer / Energy flipped is discarded with attached cards (no Prize; if it was the only Pokémon, its owner loses), a Basic flipped stays (no on-play power), the AI never plays it.
- [ ] **Step 2–4:** Implement, green, simulate.
- [ ] **Step 5: Commit** `feat: Lt. Surge's Secret Plan`.

### Task 11: AI, simulator, decks, doubts, release flag, version

**Files:**
- Modify: `src/domain/ai/cardEffects.ts`, `src/domain/ai/smart.ts` / `evaluate.ts` (values for the new Trainers, Stadiums and powers; `AI_NEVER_PLAYS` per the doubts' AI entry), `src/domain/decks/gym-heroes-decks.ts` or a new `gym-challenge-decks.ts` (Giovanni and Koga `gymLeaderDecks`, Blaine and Sabrina extended — coordinate with the Gym Leader mode spec if it exists by then), `src/domain/catalog/sets.ts` (remove `inDevelopment`), `test/gym-challenge-catalog.test.ts` (drop the in-development assertions), `src/domain/constants/enums.ts` (delete unused placeholder power types), `docs/card-doubts.md` (every judgment call made in Tasks 1–10), `CLAUDE.md` (Gym Challenge notes: live HP, Shapeshift / Psylink, pre-attack reaction, coin layout with `power`, Chaos Gym, hidden cards, `inDevelopment` convention under "How to add… a set"), `package.json` version → 0.9.0 (do NOT publish)
- Test: `test/ai-gym-challenge.test.ts`

- [ ] **Step 1–3:** Failing AI tests (plays a helpful Stadium, answers each opponent step, uses Soak Up / Emerge, never plays the excluded Trainers), implement, green.
- [ ] **Step 4:** `npm test`; `npm run simulate -- --games 3000 --seed 7 --policy explore,explore:greedy,explore:random --decks random-mix --stats --coverage gym-challenge` (all sets now by default) → 0 failures, ~100% coverage; `npm run simulate -- --decks lucky-duel --games 1000` (Gym Challenge Basics now in the tables); `npm run check-images -- --set gym-challenge`; `npm run build`; `npm pack` → keep the `.tgz` path for Stage 2.
- [ ] **Step 5: Commit** `feat: AI and Gym Leader decks for Gym Challenge; release the set`.

## Stage 2a — API (`D:/Proyectos/pokemon-tcg-api-news`, branch `feat/gym-challenge`)

Can start against a pack from Task 6 on (set presentation, boosters hidden); MP work needs Tasks 7–10.

### Task 12: Boosters, economy and catalog

**Files:** `src/modules/boosters/boosters.service.ts` (`SET_BOOSTERS["gym-challenge"]`: same slot layout and price as Gym Heroes; image `/packs/gym-challenge/booster.png`; skip any set with `inDevelopment` in `initializeDefaultPacks` and `STANDARD_BOOSTER_IDS`), `src/modules/catalog/catalog.service.ts` (hide `inDevelopment` sets from `SETS`), boosters exclude `UNSUPPORTED_TRAINERS`, tests in `test/`.

- [ ] **Step 1:** Install the packed engine; failing tests: a pack still flagged `inDevelopment` is neither sold nor listed; with the flag off (Task 11 pack) a Gym Challenge booster yields 11 cards of the set with the slot rarities and never an unsupported Trainer; the catalog endpoint returns its 122 cards.
- [ ] **Step 2–4:** Implement, `npx tsc --noEmit`, `npx vitest run` green.
- [ ] **Step 5: Commit** `feat: Gym Challenge boosters and catalog`.

### Task 13: Multiplayer for the new flows

**Files:** `src/socket/schemas.ts` (`playBasic` accepts no coins from the client — the server flips `getPlayBasicCoinFlips`; Trainer selections for Blaine / Psychic Control / Quizzes / Misty's Wish; `useStadium` for Fuchsia / Saffron already generic), `src/socket/handlers.ts` / `rooms.ts` (attack: if `getAttackPreReaction` returns a step, send it to the defender with the answer clock and flip the attack's coins only after the answer; Chaos Gym's leading coin with the Trainer's coins and the off-turn offer through `pendingTrainerChoice`; Fortitude / Energy Drain / Shock Blast / Rebellion coins with `flippedBy` captions; `inDevelopment` sets refused in deck validation), state masking (`faceDown` cards → `{ id, hidden: true }` for the opponent and spectators; Misty's Wish's looked-at Prize only to its player; Quiz cards and Surprise's card to the player who may see them), tests with the socket helpers.

- [ ] **Step 1:** Failing socket tests: Ninja Trick asked to the defender before any `showCoinFlip`; Chaos Gym tails offers the card to the other player who plays it on their view; a face-down card is hidden from the opponent and revealed to both once flipped; Minefield coin shown to both on a Bench play; a forged answer from the wrong player is rejected.
- [ ] **Step 2–4:** Implement, tests green.
- [ ] **Step 5: Commit** `feat: Gym Challenge in multiplayer`.

## Stage 2b — frontend (`D:/Proyectos/pokemon-tcg-news`, branch `feat/gym-challenge`)

### Task 14: Set presentation

**Files:** `src/domain/sets/set-ui.ts` (`SET_UI["gym-challenge"]`: name "Gym Challenge", logo, booster id/art, catalog route), `public/sets/gym-challenge/*`, `public/packs/gym-challenge/booster.png` (ask the owner for real art or generate like Fossil/Team Rocket — log the choice), every place that iterates `CARD_SETS` / `SET_UI_LIST` hides `isSetInDevelopment` sets (collection, deck builder, catalog, home/FAQ copy).

- [ ] **Step 1:** Install the packed engine; failing test: every non-in-development `CARD_SETS` id has a `SET_UI` entry, and an in-development set is not listed.
- [ ] **Step 2–4:** Implement; `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- [ ] **Step 5: Commit** `feat: Gym Challenge set presentation`.

### Task 15: Board and flows (SP and MP)

**Files:** `src/features/game/hooks/useAttackFlow.ts` + `useAttackChoiceFlow.ts` (pre-attack reaction: ask `getAttackPreReaction` before flipping coins; SP: the AI answers for itself with `answerAttackChoiceForAI`, the human answers the AI's attack off-turn), `model/attack-coins.ts` (captions for Rebellion "Rebelión", Fortitude / Energy Drain / Shock Blast as defender coins, Chaos Gym "Chaos Gym"), `hooks/useBoardActions.ts` (Minefield: flip `getPlayBasicCoinFlips` coins and pass them; MP sends `playBasic` as before and animates the server's coin; Blaine / Giovanni through the generic Trainer steps; "Dar la vuelta" action for a face-down card), `hooks/useCardEffectFlow.ts` (Chaos Gym leading coin, Psychic Control's borrowed Trainer steps, Shapeshift's "attach / discard" power steps), board components (attached Trainer badges for Brock's Protection / Ninja Trick, the Shapeshift card under Ninetales, a face-down card back on the Bench, live HP from `getEffectiveHp`), `MultiplayerGamePage.tsx` wiring for each.

- [ ] **Step 1:** Failing component / hook tests where the repo has them: the attack picker lists Psylink attacks labelled with their source card; a face-down card renders as a card back for the opponent; the coin modal shows the Rebellion coins before the attack's.
- [ ] **Step 2–4:** Implement SP then MP; build green; Playwright smoke: SP Gym Challenge vs Gym Challenge (Minefield coin, Ninja Trick, Chaos Gym tails).
- [ ] **Step 5: Commit** `feat: Gym Challenge flows on the board`.

## Stage 3 — integration

### Task 16: End-to-end verification and hand-off

- [ ] **Step 1:** game-core: `npm test`, the Task 11 simulations, `npm run build`, `npm pack`.
- [ ] **Step 2:** API and frontend on the same packed engine: full suites, `npm run build` (frontend), `npx tsc --noEmit` (both).
- [ ] **Step 3:** Local run: Playwright SP game Gym Challenge vs Gym Challenge (Shapeshift, Psylink, Chaos Gym, Ninja Trick, Minefield); MP game with two browser contexts (Ninja Trick off-turn before coins, Chaos Gym offer to the other player, hidden cards stay hidden).
- [ ] **Step 4:** Hand-off: what's done, the doubts the owner hasn't answered, release order (publish game-core 0.9.0 → bump API + frontend to the same version → API deploy with backup → frontend push) — no publish/deploy without the owner's OK.
- [ ] **Step 5: Commit** the hand-off notes in each repo's docs.
