# Mutation Types Documentation

## Overview

This document defines constants for all mutation types used in the editor. Using constants instead of string literals provides:
- Better IDE support (autocomplete, refactoring)
- Type safety with TypeScript/JSDoc
- Single source of truth for mutation type names
- Easier searching and documentation

## Mutation Type Constants

```javascript
// Block-level mutations
const MUTATION_TYPE_FORMAT_BLOCK = 'formatBlock';
const MUTATION_TYPE_INSERT_ELEMENT = 'insertElement';
const MUTATION_TYPE_REMOVE_ELEMENT = 'removeElement';
const MUTATION_TYPE_SPLIT_BLOCK = 'splitBlock';
const MUTATION_TYPE_DELETE_BLOCK = 'deleteBlock';
const MUTATION_TYPE_MERGE_BLOCKS = 'mergeBlocks';

// Content mutations
const MUTATION_TYPE_TEXT_CONTENT = 'textContent';
const MUTATION_TYPE_DELETE_CONTENT = 'deleteContent';
const MUTATION_TYPE_INSERT_CONTENT = 'insertContent';
```

## Usage Examples

### In Handler Registration

```javascript
import { MUTATION_TYPE_FORMAT_BLOCK } from './mutation-types.js';

class BlockManager {
    registerHandlers() {
        this.stateManager.registerHandler(MUTATION_TYPE_FORMAT_BLOCK, {
            apply: (mutation) => { /* ... */ },
            revert: (mutation) => { /* ... */ }
        });
    }
}
```

### In Mutation Creation

```javascript
import { MUTATION_TYPE_FORMAT_BLOCK } from './mutation-types.js';

formatBlock(block, tagName) {
    const newElement = document.createElement(tagName);
    
    return this.stateManager.commit({
        type: MUTATION_TYPE_FORMAT_BLOCK,
        element: block,
        newElement: newElement
    });
}
```

## Mutation Type Specifications

### Block Mutations

#### MUTATION_TYPE_FORMAT_BLOCK
**Purpose**: Change the tag name of a block element

**Required Properties**:
- `type`: 'formatBlock'
- `element`: The block element to format
- `newElement`: The new element to replace it with

**Handler Responsibilities**:
- Capture parent and nextSibling before changes
- Transfer children from old to new element
- Replace element in DOM
- Revert must restore exact DOM state

---

#### MUTATION_TYPE_INSERT_ELEMENT
**Purpose**: Insert a new element into the DOM

**Required Properties**:
- `type`: 'insertElement'
- `element`: The element to insert
- `parent`: Parent node for insertion
- `before`: Reference node (null for append)

**Handler Responsibilities**:
- Insert element at specified position
- Revert removes the element

---

#### MUTATION_TYPE_REMOVE_ELEMENT
**Purpose**: Remove an element from the DOM

**Required Properties**:
- `type`: 'removeElement'
- `element`: The element to remove

**Handler Responsibilities**:
- Capture parent and nextSibling before removal
- Remove element from DOM
- Revert restores element at original position

---

#### MUTATION_TYPE_SPLIT_BLOCK
**Purpose**: Split a block element at a text offset

**Required Properties**:
- `type`: 'splitBlock'
- `block`: The block to split
- `splitOffset`: Text offset for split point
- `newBlock`: The new block element
- `atEnd`: Boolean indicating split at end (optimization)

**Handler Responsibilities**:
- Initialize domCache if needed
- Use DOMOperations for content manipulation
- Insert new block after original
- Position caret at start of new block

---

#### MUTATION_TYPE_DELETE_BLOCK
**Purpose**: Delete a block and position caret appropriately

**Required Properties**:
- `type`: 'deleteBlock'
- `block`: The block to delete

**Handler Responsibilities**:
- Capture position information
- Calculate caret position (end of previous block)
- Remove block from DOM
- Restore caret position

---

#### MUTATION_TYPE_MERGE_BLOCKS
**Purpose**: Merge two adjacent blocks

**Required Properties**:
- `type`: 'mergeBlocks'
- `firstBlock`: The block to merge into
- `secondBlock`: The block to merge from
- `isBackspace`: Boolean indicating merge direction

**Handler Responsibilities**:
- Initialize domCache if needed
- Use DOMOperations for content preservation
- Capture caret position at merge point
- Remove second block after merge

### Content Mutations

#### MUTATION_TYPE_TEXT_CONTENT
**Purpose**: Set the text content of a block

**Required Properties**:
- `type`: 'textContent'
- `block`: The block to modify
- `text`: The new text content

**Handler Responsibilities**:
- Capture original text content
- Set new text (Note: destroys inline formatting)
- Revert restores original text

---

#### MUTATION_TYPE_DELETE_CONTENT
**Purpose**: Delete content within or across blocks

**Required Properties**:
- `type`: 'deleteContent'
- `startBlock`: Starting block
- `startOffset`: Start text offset
- `endBlock`: Ending block
- `endOffset`: End text offset

**Additional Properties (set by handler)**:
- `intermediateBlocks`: Blocks between start and end
- `domCache`: Cache for content preservation

**Handler Responsibilities**:
- Handle single-block and multi-block deletion
- Preserve inline formatting using DOMOperations
- Capture all affected content
- Remove intermediate blocks if multi-block

---

#### MUTATION_TYPE_INSERT_CONTENT
**Purpose**: Insert content at a position

**Required Properties**:
- `type`: 'insertContent'
- `block`: The block for insertion
- `offset`: Text offset for insertion
- `content`: Content to insert (text or nodes)

**Handler Responsibilities**:
- Initialize domCache if needed
- Use DOMOperations for inline preservation
- Position caret after inserted content

## Type Safety with JSDoc

```javascript
/**
 * @typedef {Object} FormatBlockMutation
 * @property {'formatBlock'} type
 * @property {Element} element
 * @property {Element} newElement
 */

/**
 * @param {FormatBlockMutation} mutation
 */
function applyFormatBlock(mutation) {
    const { element, newElement } = mutation;
    // Type-safe access to properties
}
```

## Benefits of Using Constants

### 1. Refactoring Safety
```javascript
// Easy to rename across entire codebase
const MUTATION_TYPE_FORMAT_BLOCK = 'formatBlock'; // Change once

// vs string literals scattered everywhere
'formatBlock' // Need to find and replace all
```

### 2. Autocomplete Support
```javascript
// IDE can suggest available mutations
import { MUTATION_ } from './mutation-types.js';
// IDE shows: MUTATION_TYPE_FORMAT_BLOCK, MUTATION_TYPE_INSERT_ELEMENT, etc.
```

### 3. Type Checking
```javascript
// Can catch typos at development time
type: MUTATION_TYPE_FROMAT_BLOCK // IDE error: undefined variable

// vs runtime error with string
type: 'fromatBlock' // Typo only caught at runtime
```

### 4. Documentation
```javascript
// Constants can have JSDoc comments
/** Changes the tag name of a block element */
const MUTATION_TYPE_FORMAT_BLOCK = 'formatBlock';
```

## Implementation File

Create `mutation-types.js`:

```javascript
/**
 * Mutation type constants for the editor
 * Using constants provides better IDE support and type safety
 */

// Block-level mutations
/** Changes the tag name of a block element */
export const MUTATION_TYPE_FORMAT_BLOCK = 'formatBlock';

/** Inserts a new element into the DOM */
export const MUTATION_TYPE_INSERT_ELEMENT = 'insertElement';

/** Removes an element from the DOM */
export const MUTATION_TYPE_REMOVE_ELEMENT = 'removeElement';

/** Splits a block at a text offset */
export const MUTATION_TYPE_SPLIT_BLOCK = 'splitBlock';

/** Deletes a block and positions caret */
export const MUTATION_TYPE_DELETE_BLOCK = 'deleteBlock';

/** Merges two adjacent blocks */
export const MUTATION_TYPE_MERGE_BLOCKS = 'mergeBlocks';

// Content mutations
/** Sets the text content of a block */
export const MUTATION_TYPE_TEXT_CONTENT = 'textContent';

/** Deletes content within or across blocks */
export const MUTATION_TYPE_DELETE_CONTENT = 'deleteContent';

/** Inserts content at a position */
export const MUTATION_TYPE_INSERT_CONTENT = 'insertContent';
```

## Migration Guide

To migrate existing code to use constants:

1. Create `mutation-types.js` with all constants
2. Import constants in each manager file
3. Replace string literals in `registerHandler()` calls
4. Replace string literals in mutation creation
5. Update any switch statements or conditionals
6. Run tests to ensure everything works

Example migration:
```javascript
// Before
this.stateManager.registerHandler('formatBlock', handler);

// After
import { MUTATION_TYPE_FORMAT_BLOCK } from './mutation-types.js';
this.stateManager.registerHandler(MUTATION_TYPE_FORMAT_BLOCK, handler);
```