# Fossil + Team Rocket — design and plan

**Date:** 2026-10-10 · **Owner request:** add Fossil, then Team Rocket, following how Base Set and Jungle work, fully playable (SP and MP), tested with bots. Card doubts go to `docs/card-doubts.md` for the owner to review.
**Mode:** autonomous (owner away, no approvals possible). Feature branches + worktrees only; no publish, no merge, no deploy.

| Repo | Worktree | Branch | Base |
|---|---|---|---|
| game-core | `D:/Proyectos/pokemon-tcg-wt-gc` | `feature/fossil-team-rocket` | `refactor/engine-coin-flips` (unpublished, 118 tests) |
| API | `D:/Proyectos/pokemon-tcg-wt-api` | `feature/fossil-team-rocket` | `hardening/socket-validation` (unmerged) |
| frontend | `D:/Proyectos/pokemon-tcg-wt-fe` | `feature/fossil-team-rocket` | `main` |

The original checkouts belong to other agents (frontend: `design/slab-identity`; API: `hardening/socket-validation`) — never touch them.

## Source data

`data/pokemontcg/base3.json` (Fossil) and `base5.json` (Team Rocket) from api.pokemontcg.io, plus readable dumps `fossil.txt` / `rocket.txt` (non-holo duplicates removed). They are the source of truth for card text; translate names of attacks/powers/texts to Spanish like Base/Jungle, keep Pokémon names in English.

- **Fossil:** 62 cards → **47 unique** (exclude non-holo duplicates #16–30, same as Jungle excluded #17–32). 10 Pokémon Powers, 4 trainers + Mysterious Fossil.
- **Team Rocket:** 83 cards → **66 unique** (exclude #18–31, #71, #72, #80 which duplicate #1–14, #15, #16, #17). 16 powers, 9 trainers, 3 special energies, Dark Raichu (#83, "Rare Secret" → `CardRarity.RareHolo`, logged as a doubt).
- Images: `https://pkmncards.com/wp-content/uploads/{slug}-fossil-fo-{n}.jpg` and `{slug}-team-rocket-tr-{n}.jpg`. Verified: aerodactyl/mysterious-fossil/kabuto (fo), dark-charizard/here-comes-team-rocket/rockets-sneak-attack/dark-raichu/imposter-oaks-revenge (tr). `mr-fuji-fossil-fo-58` is 404 (try `mr.-fuji`, like `mr.-mime`). A test/script must HEAD every catalog image URL.

## Why not "just copy Jungle"

Today every mechanic is wired 4 times by card name / power type: game-core function, frontend SP (`usePokemonPowers`, `trainer-registry.ts`, `useBoardActions`), frontend MP (`MultiplayerGamePage.tsx`), API (`rooms.ts` per-name `switch`), plus the AI. Energy attach, evolution and basic placement are re-implemented in FE, API and AI with drifting rules. Sets are enumerated by hand in ~36 files. Adding 113 cards with ~26 powers, 13 trainers and 3 special energies that way multiplies bugs. So stage A moves behavior into game-core once; consumers become generic.

## Stage A — game-core foundations (no new cards)

1. **Set registry** (`src/domain/catalog/sets.ts`): `CARD_SETS: CardSetInfo[]` = `{ id: "base-set"|"jungle"|…, name: CardSet, code: "BS"|"JU"|"FO"|"TR", releaseDate, cards, imageUrl(card) }`, plus `ALL_CARDS`, `getSetById`, `getSetForCard`, `findCardById`, `findCardDefinition(set, number)`. Every engine lookup (`findCardByName`, `resolve.ts`, trainers `allCards`, `getCardImageUrl`) goes through it. Exported from `src/index.ts`. Consumers replace their `[...baseSetCards, ...jungleCards]` copies with `ALL_CARDS` / `CARD_SETS`.
2. **Engine-owned board actions**: `playBasicPokemon(state, cardId, "active"|"bench")`, `attachEnergyCard(state, energyCardId, targetPokemonId)` (with special-energy on-attach hook + Rain Dance), `evolvePokemonCard(state, evolutionCardId, targetPokemonId)` (with `findValidEvolutionTargets` rules + Prehistoric Power), and `isPlayableAsBasic(card)` (Mysterious Fossil, Clefairy Doll). Player side only, like every engine function; callers swap perspective. FE, API and AI switch to them.
3. **Card effect registry** — one contract for trainers and activated powers, moved from the frontend's `TrainerDef`:
   ```ts
   interface SelectionStep { title; description; options: { id; label; … }[]; maxSelections; minSelections?; source?; cards?; thumbnails?; orderingCards?; disableAutoSelect?; chooser?: "self" | "opponent" }
   interface CardEffectDef {
     canUse(state, sourceId): string | null;                      // null = OK, else Spanish reason
     getSteps(state, sourceId, selections: string[][], coins?: CoinFlipResult[]): SelectionStep | null;
     coinFlips?(state, sourceId, selections): number | "untilTails" | 0;  // flipped by the caller (server in MP)
     resolve(state, sourceId, selections, { coinResults }): GameState;
   }
   TRAINER_EFFECTS: Record<trainerName, CardEffectDef>   // sourceId = card id in hand
   POWER_EFFECTS:   Record<powerName,  CardEffectDef>    // sourceId = PokemonInPlay id
   playTrainerCard(state, cardId, selections, { coinResults })
   usePokemonPower(state, pokemonId, selections, { coinResults })
   getTrainerSteps / getPowerSteps / getTrainerCoinFlips / getPowerCoinFlips
   ```
   Base Set + Jungle trainers and activated powers are wrapped (no rule changes) so the frontend SP/MP and the API dispatch generically: FE `trainer-registry.ts` and the per-power switches disappear; API `rooms.ts` replaces the name `switch` with `playTrainerCard` / `usePokemonPower` (keep zod validation: `selections: string[][]` bounded, `coinResults` server-rolled from `getXCoinFlips`). Opponent choices ("he or she chooses") use a pending state answered by the other side (`chooser: "opponent"`).
4. **Passive power query**: `isPowerActive(state, pokemon)` = has power ∧ not Asleep/Confused/Paralyzed ∧ not suppressed (Toxic Gas, Goop Gas Attack, Dark Arbok Stare). All existing passive checks (Invisible Wall, Thick Skinned, Strikes Back, Retreat Aid, …) use it.
5. **Bots** (`src/domain/simulation/` + `scripts/simulate.ts`, `npm run simulate -- --games 200 --sets fossil --seed 1`):
   - `playAIGame(deckA, deckB, { rng, policyA, policyB, maxTurns })` runs a full headless game: mulligan, setup, turns, prizes, promotions, pending states on both sides, until `GAME_OVER` or turn cap. Exports `swapSides`.
   - Policies: `greedyAI` (existing strategy) and `randomLegal` (fuzzer: picks uniformly among legal actions — every playable basic/evolution/energy/trainer/power with random valid selections, retreat, attack, end turn — using the registry's `canUse`/`getSteps`).
   - Seeded RNG (mulberry32) replaces `Math.random` during a run so failures replay.
   - Invariants after every action: no exception; card conservation (each side always owns exactly its 60 cards across deck/hand/discard/prizes/in play/attached); damage ≥ 0 and multiple of 10; no Pokémon in play with damage ≥ HP after KO processing; no pending flag left when the turn passes; game ends.
   - Vitest runs a small fixed batch (e.g. 30 seeded games per set) in CI; the script runs large batches and prints failures with seeds.

### Stage A status (2026-10-10, branch `feature/fossil-team-rocket`) — done

1. Set registry — `src/domain/catalog/sets.ts`; every lookup goes through it.
2. Board actions — `src/domain/board` (`playBasicPokemon`, `attachEnergyCard`, `evolvePokemonCard`, `canX`, `swapSides`); AI switched. Prehistoric Power hook: `getEvolutionBlocker`. Clefairy Doll left unplayable (`playsAsBasic` not set).
3. Effect registry — `src/domain/effects`; all Base Set + Jungle trainers (except Clefairy Doll) and the 8 activated powers. Illegal calls throw `IllegalActionError`.
4. `isPowerActive` + `GameState.powersSuppressed`; passive powers routed through it.
5. Simulator — `src/domain/simulation`, `npm run simulate`. 6,000+ games per policy pair (Base+Jungle, plus single-set runs) with 0 failures after fixing what it found (bench-damage game end, Buzzap card identity).
- Coordinator addendum: `canExecuteAttack`/`canExecuteMetronome` enforced in `executeAttack`/`executeMetronome`, `attackedThisTurn`, engine-owned Sand-attack coin; confusion before Metronome/Conversion is the consumers' job via `resolveConfusionFlip`.
- Extra rule fixes found on the way: Breeder on turn 2, evolution/devolution resets, Devolution Spray KO, Full Heal + Toxic, double between-turns checkup, first-turn draw.

## Stage B — Fossil (game-core)

Catalog `src/domain/catalog/fossil.ts` (47 cards, `CardSet.Fossil = "Fossil"`, id slug `fossil-NNN-name`). New mechanics, each with a failing card-scenario test first:

- **Mysterious Fossil**: trainer playable as Basic (bench/active, setup counts? — the card text says "play as if it were a Basic Pokémon": allowed in setup, counts for mulligan; doubt logged), 10 HP, no attacks, can't retreat, status immune, KO gives no prize, may be discarded from play during your turn. Aerodactyl/Kabuto/Omanyte evolve from it.
- **Powers**: Prehistoric Power (no evolutions while active), Toxic Gas (suppression), Transform (Ditto copies Defending: type, HP, W/R, attacks; energy of any type), Step In, Curse, Transparency (coin per attack effect, defender's coin), Strange Behavior, Kabuto Armor (half damage, rounded down), Clairvoyance (opponent hand visible — API masking must reveal it), Cowardice.
- **Attack effects**: Blizzard (heads → opponent bench, tails → own bench), Dark Mind / Stretch Kick (choose bench target), Prophecy (look/reorder top 3 of either deck), Absorb (heal half dealt rounded up), Sonicboom (no W/R), Selfdestruct (both benches + self), Wildfire (discard X Fire → mill X), Dive Bomb (tails nothing), Gigashock (choose 3 bench), Thunderstorm (coin per bench + tails self), Terror Strike (opponent chooses switch), Clamp (tails nothing), Energy Conversion (2 energy from discard + self dmg), Leech Life (heal = dealt), Hyper Beam (discard defender energy), Harden (≤30 prevented), Smokescreen, Stone Barrage (until tails), Call for Family (Krabby to bench), Headache (no trainers next turn), Hide in Shell, Spacing Out (requires damage), Scavenge (discard Psychic → trainer from discard). Reuse existing `AttackEffectType`s where they fit; add new ones as needed.
- **Trainers**: Mr. Fuji, Energy Search, Gambler (coin), Recycle (coin).
- AI: must at least not break on the new cards (play Fossil only when it has an evolution, never Mysterious Fossil as its only Active if avoidable; use simple powers optionally).

### Stage B status (2026-10-10, branch `feature/fossil-team-rocket`) — done

- **Catalog**: `src/domain/catalog/fossil.ts`, 47 cards, registry entry `fossil` (FO, 1999-10-10, 62 printed), checked programmatically against `base3.json` (`test/fossil-catalog.test.ts`). Spanish attack/power names (repeated attacks reuse Base Set/Jungle names; power names are Spanish, unlike the English Base/Jungle power names — see doubts).
- **Images**: `npm run check-images -- --set <id>`: Fossil 47/47, Base Set 102/102, Jungle 48/48 (Mr. Fuji = `mr.-fuji`).
- **Mysterious Fossil / Clefairy Doll**: `playsAsBasic: { hp: 10 }`; in play a Pokémon form (`toInPlayCard`) that becomes the Trainer again when it leaves play (`cardsLeavingPlay`); no Prize, can't retreat, no Special Conditions, `canDiscardFromPlay` / `discardFromPlay`.
- **Powers**: passive Toxic Gas (`isPowerSuppressed`), Prehistoric Power (`getEvolutionBlocker`), Clairvoyance (`isHandRevealed`), Kabuto Armor (`applyDamageHalving`), Transform (`getEffectivePokemonCard` + state-based `checkKnockouts`), Transparency (defender coin in the attack's coin plan); activated (`POWER_EFFECTS`): Entrada (Step In), Maldición (Curse), Comportamiento Extraño (Strange Behavior), Cobardía (Cowardice).
- **Attacks**: coin plans (`getAttackCoinPlan` / `flipAttackCoins`: until-tails, per-bench coins, Transparency last); the generic **pending attack choice** (`pendingAttackChoice` + `resolveAttackChoice`, `lib/attackChoices.ts`) for Hyper Beam, Terror Strike (opponent chooses), Prophecy, Wildfire, Energy Conversion, Scavenge; Sonicboom, Dive Bomb/Clamp, Spacing Out, Headache (`noTrainersOnTurn`), Absorb/Leech Life, Gigashock, Blizzard, Thunderstorm, Selfdestruct.
- **Trainers**: Mr. Fuji, Energy Search, Gambler, Recycle (`TRAINER_EFFECTS`; `UNSUPPORTED_TRAINERS` is empty).
- **AI**: plays a Fossil only with an evolution in hand or no other Basic, discards an Active Fossil it can't evolve, answers its own attack choices (`ai/pending.ts`); `answerStepForAI` for the human's attacks that the AI must answer (Terror Strike).
- **Bots**: `--stats` prints a coverage report (`--coverage <sets>`); 0 failures on `--sets fossil` and `--sets base-set,jungle,fossil` (numbers in the final report); vitest runs 30-game Fossil batches.
- Fixes found on the way: AI deck search swapping cards between sides, AI never resolving Spark-style choices, endTurn not waiting for the opponent's promotion, Dragonair's Hyper Beam doing nothing, Venonat's Leech Life, Agility vs Hurricane. Doubts: `docs/card-doubts.md` "Stage B".

**Consumer work for Stage C (new):** handle `pendingAttackChoice` (render `step`; `chooser: "opponent"` goes to the other player; answer with `resolveAttackChoice` on the attacking side's view), flip attack coins from `getAttackCoinPlan` (`flipAttackCoins`; Stone Barrage until tails; Transparency's coin last, shown as the defender's), list a Ditto's attacks from `getEffectivePokemonCard`, a "discard from play" button (`canDiscardFromPlay`), `isHandRevealed` (API masking), Headache via `canPlayTrainerCard`/`canPlayBasicPokemon`, and the mid-turn promotions of Cowardice / Fossil discard / Curse (`playerNeedsToPromote` / `opponentNeedsToPromote` during the turn).

## Stage C — Fossil in API and frontend

- **API**: set registry in catalog/boosters/market/prizes/battle-pass/draft/handlers; `fossil-booster` (11 cards, 1 rare 33% holo, 3 uncommon, 5 common, same price as Jungle, energy as Jungle); generic trainer/power dispatch; engine board actions; coin-flip consumer migration (delete `applyCoinFlipEffects`, roll `getAttackCoinFlipCount` coins server-side, `executeAttack(state, i, { coinResults })`); masking honours Clairvoyance; zod schemas for new payloads; tests.
- **Frontend**: registry-driven set lists (cards pages, catalog, detail, pack opening, market tiles, sidebar, home, deck preview, card reveal); Fossil logo `public/sets/fossil.png` and pack art `public/packs/fossil/` (if pack art can't be sourced, use the set logo on the existing pack tile style and log it); generic trainer/power flow in SP and MP via `getTrainerSteps`/`getPowerSteps` (one modal path for all), engine board actions; coin-flip consumer migration in `useCoinFlipHandler`/`useAttackFlow`; `npm run build` green.
- Local verification without publishing: in game-core `npm run build && npm pack`, then in each consumer worktree `npm install --no-save <tgz>` (package.json untouched). Final version bump (0.6.0) is left to the owner.

## Stage D — Team Rocket

Same pipeline as B+C. Key mechanics: Dark Pokémon (separate names, `evolvesFrom` "Dark X"), special energies (Rainbow: any type, 10 dmg on attach from hand; Full Heal Energy: clears conditions on attach; Potion Energy: remove 1 counter on attach — all provide 1 energy), Summon Minions / Sneak Attack / Reel In (on play-from-hand triggers), Final Beam (on KO), Sinkhole (on retreat), Hay Fever (no trainers), Sticky Goo (+2 retreat), Frenzy, Evolutionary Light, Matter Exchange, Gather Fire, Long-Distance Hypnosis, Pollen Stench, Trickery (prizes ↔ top deck), opponent-flipped coins (Knock Down, Bench Manipulation), Mirror Shell, Rapid Evolution, Fling, Drag Off, Magnetic Lines, Energy Bomb, Mass Explosion, Continuous Fireball, Vanish, Mischief, Afternoon Nap; trainers Here Comes Team Rocket! (prizes face up — masking), Rocket's Sneak Attack (see opponent hand), The Boss's Way, Challenge! (opponent accepts/declines), Digger, Imposter Oak's Revenge, Nightly Garbage Run, Goop Gas Attack, Sleep!. `team-rocket-booster` and assets.

### Stage D status — game-core (2026-10-10, branch `feature/fossil-team-rocket`) — done

- **Catalog**: `src/domain/catalog/team-rocket.ts`, 66 cards, registry entry `team-rocket` (TR, 2000-04-24, 83 printed), checked against `base5.json` (`test/team-rocket-catalog.test.ts`); images 66/66. Dark Pokémon evolve across sets (Dark Charmeleon ← Charmander, Dark Raichu ← Pikachu). Power names in Spanish like Fossil.
- **Special Energy**: Rainbow (every basic type in play, 1 unit, 10 damage when attached from the hand), Full Heal Energy, Potion Energy (`ENERGY_ATTACH_EFFECTS`, `energyProvidesType`, `provides`).
- **On-play powers** (Summon Minions, Sneak Attack, Reel In): `state.pendingPowerChoice` + `resolvePowerChoice` (lib/powerChoices.ts).
- **Passive powers**: Hay Fever (`getTrainerBlocker`), Sticky Goo (`getRetreatCost`), Sinkhole (`executeRetreat` coins / `getRetreatCoinFlips`), Final Beam (defender coin), Frenzy. **Activated**: Trickery, Evolutionary Light, Matter Exchange, Gather Fire, Long-Distance Hypnosis, Pollen Stench.
- **Attacks**: new attack choices (ChooseTargetDamage, optional Teleport Blast, Magnetic Lines, Energy Bomb, Third Eye, Rapid Evolution, Afternoon Nap) and engine effects (Fling, Vanish, Mischief, Mirror Shell, Mass Explosion, Magnetism, Continuous Fireball, Fireball / Playing with Fire, Petal Whirlwind, Surprise Thunder, opponent-flipped coins, RequireOpponentBench). Conversion 1/2 engine-resolved when the caller passes `chosenType`.
- **Trainers**: all 9 in `TRAINER_EFFECTS` (`UNSUPPORTED_TRAINERS` empty).
- **AI**: answers its own attack / on-play choices, leaves the human's (`chooser: "opponent"`) pending, `answerStepForAI` for the steps it must answer, safe Rainbow attachment.
- **Bots**: random decks include TR special Energy; 1500 games per policy pair on `--sets team-rocket` and `--sets base-set,jungle,fossil,team-rocket`, 0 failures; coverage of every TR Trainer, activated power, on-play power and attack across those runs; vitest runs 30-game TR batches. Fix found: Goop Gas / Stare expiring now Knocks Out a Ditto whose copy no longer fits before the turn passes.
- Doubts: `docs/card-doubts.md` "Stage D".

**Consumer work for Stage D (frontend + API)**: render `pendingPowerChoice.step` after evolving (answer with `resolvePowerChoice`, acting side's view); Sinkhole coins on retreat (`getRetreatCoinFlips` → `executeRetreat(..., { coinResults })`; the API rolls them); show `attackFlipper: "opponent"` coins as the defending player's and the defender coin as Final Beam when the Defending Pokémon is Dark Gyarados; Trainer steps with `chooser: "opponent"` (Challenge! accept/decline and the opponent's Basics) must be asked to the other player and relayed; `reveals: "opponentHand"` steps (Rocket's Sneak Attack) and `arePrizesRevealed` (Here Comes Team Rocket!) change what the API masks; Digger's untilTails coins alternate players (display); Conversion via `chosenType`; deck builders: special Energy limited to 4 (`isLimitedInDeck`); `team-rocket` booster and assets (Stage C-like).

## Out of scope (logged in card-doubts for the owner)

Starter/theme deck changes, cosmetic skins for new cards, landing page, publishing game-core, merging, deploying.

## Done criteria per set

game-core: `npx tsc --noEmit`, `npm test` (all old + new scenario tests), `npm run simulate` 500 games per policy pair with 0 invariant failures, image URL check 100%. API: `npx tsc --noEmit`, tests green, local boot + catalog endpoints list the set. Frontend: `npx tsc --noEmit`, `npm run build`, local smoke (catalog page renders, pack opens, a SP game with a Fossil deck plays a trainer and a power).
