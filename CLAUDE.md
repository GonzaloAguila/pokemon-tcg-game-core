# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Shared game logic package for Pokemon TCG multiplayer. Contains all pure game logic, types, and domain functions used by both the frontend (Next.js) and backend (Express + Socket.io) applications.

**This package has NO React dependencies** - it must remain framework-agnostic.

## Commands

```bash
npm run build     # Compile TypeScript to dist/
npm run dev       # Watch mode for development
npm run lint      # Run ESLint
npm run test      # Run tests (when added)
npm run publish   # Publish to GitHub Packages
```

## Architecture

### Directory Structure

```
src/
├── domain/              # Pure game logic (copied from pokemon-tcg)
│   ├── ai/              # AI opponent logic
│   ├── cards/           # Card types and guards
│   ├── catalog/         # Card database (Base Set)
│   ├── constants/       # Enums (EnergyType, GamePhase, etc.)
│   ├── match/           # GameState, validators, actions
│   ├── powers/          # Pokemon Power implementations
│   ├── status/          # Status condition logic
│   └── trainers/        # Trainer card implementations
├── lib/
│   └── gameState.ts     # Main game engine (~2000 lines)
└── index.ts             # Barrel exports
```

### Key Exports

```typescript
// Types
export type { GameState, PokemonInPlay, GameCard, GameModifier } from './domain/match';
export type { Card, PokemonCard, TrainerCard, EnergyCard, Attack } from './domain/cards';

// Enums
export { EnergyType, GamePhase, StatusCondition, CardKind } from './domain/constants';

// Game Logic
export { initializeGame, startGame, executeAttack, endTurn } from './lib/gameState';
export { canUseAttack, canRetreat, findValidEvolutionTargets } from './lib/gameState';

// Domain Functions
export { isPokemonCard, isEnergyCard, isTrainerCard } from './domain/cards';
export * from './domain/trainers';
export * from './domain/powers';
```

## Code Conventions

### Pure Functions Only

All game logic must be pure functions with no side effects:

```typescript
// CORRECT - Pure function
function executeAttack(state: GameState, attackIndex: number): GameState {
  return { ...state, /* modifications */ };
}

// WRONG - Side effect
function executeAttack(state: GameState, attackIndex: number): void {
  state.damage += 10; // Mutation!
}
```

### Immutable State

Never mutate GameState. Always return new objects:

```typescript
// CORRECT
return {
  ...state,
  playerHand: state.playerHand.filter(c => c.id !== cardId)
};

// WRONG
state.playerHand.splice(index, 1);
return state;
```

### No Framework Dependencies

This package must NOT import:
- React, Next.js, or any UI framework
- Browser APIs (window, document, localStorage)
- Node.js specific APIs (fs, path) unless behind dynamic imports

### Validation Pattern

Always `canX()` before `applyX()`:

```typescript
if (canUseAttack(state, pokemon, attackIndex)) {
  return executeAttack(state, attackIndex);
}
```

## Adding New Content

### Adding a Card

1. Add to `src/domain/catalog/base-set.ts`
2. Use factory functions: `createPokemonCard()`, `createTrainerCard()`, etc.

### Adding a Trainer Effect

1. Create `canPlayX()` + `playX()` in `src/domain/trainers/index.ts`
2. Both functions must be pure

### Adding a Pokemon Power

1. Add power type to `PokemonPowerType` in `src/domain/constants/enums.ts`
2. Implement `canUseX()` + `useX()` in `src/domain/powers/index.ts`

## Publishing

This package is published to GitHub Packages as a private npm package.

```bash
# Login to GitHub Packages
npm login --registry=https://npm.pkg.github.com

# Publish
npm publish
```

Consumers install with:
```bash
npm install @YOUR_USERNAME/pokemon-tcg-game-core
```

## Testing

When adding tests, follow this pattern:

```typescript
describe('executeAttack', () => {
  it('should apply base damage to defender', () => {
    const state = createTestGameState();
    const result = executeAttack(state, 0);
    expect(result.opponentActivePokemon?.currentDamage).toBe(30);
  });
});
```
