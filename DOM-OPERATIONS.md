# DOM-OPERATIONS.md

## Overview

The `DOMOperations` class provides low-level DOM manipulation utilities that preserve inline formatting and node identity across undo/redo operations. It implements a sophisticated caching system that ensures the same DOM nodes are reused throughout the editor's history, maintaining perfect node identity.

## Core Design Principles

### 1. Perfect Node Identity Preservation
- **Same DOM objects** move between locations, never recreated
- **No cloning** during cache retrieval - return actual cached nodes
- **Direct node arrays** instead of DocumentFragment indirection

### 2. Three-Phase Operation Pattern
All complex operations follow: **prepare → apply → revert**
- **Prepare**: Calculate and cache all possible content variations
- **Apply**: Use cached nodes, move to target locations
- **Revert**: Move same nodes back to original locations

### 3. Cache Persistence
- Cache stored in mutation object (`mutation.domCache`)
- Survives across apply/revert cycles
- Conditional initialization preserves existing cache

## Caching System

### Node Storage Architecture

```javascript
// Single node caching
static getCachedNode(cacheKey, createFn, cache) {
    if (!cache._nodes) cache._nodes = new Map();
    
    if (!cache._nodes.has(cacheKey)) {
        cache._nodes.set(cacheKey, createFn());
    }
    
    // Return actual node, NOT a clone
    return cache._nodes.get(cacheKey);
}

// Node array caching
static getCachedNodes(cacheKey, createFn, cache) {
    if (!cache._nodeArrays) cache._nodeArrays = new Map();
    
    if (!cache._nodeArrays.has(cacheKey)) {
        // createFn returns Array<Node> directly
        const nodeArray = createFn();
        cache._nodeArrays.set(cacheKey, nodeArray);
    }
    
    return cache._nodeArrays.get(cacheKey);
}
```

### Cache Initialization Pattern

```javascript
// CORRECT: Preserve existing cache
if (!mutation.domCache) {
    mutation.domCache = {};
}

// WRONG: Destroys cache during replay
mutation.domCache = {};
```

## Core Operations

### Block Content Management

#### captureBlockContent(block, cacheKey, cache)
Captures and caches the current content of a block for later restoration.

```javascript
const createOriginalFn = () => {
    // Clone only at capture time
    return Array.from(block.childNodes).map(node => node.cloneNode(true));
};
```

#### restoreBlockContent(block, cacheKey, cache)
Restores previously captured content to a block.

#### populateBlock(block, cacheKey, createContentFn, cache)
The core mechanism for moving cached nodes to target blocks:
1. Clears existing content
2. Retrieves cached nodes
3. Detaches from current parents
4. Appends to target block
5. Normalizes the result

### Split Operations

#### prepareSplitBlock(block, offset, cache)
Pre-calculates and caches content for split operation:
- `'original'`: Complete original content
- `'beforeSplit'`: Content before split point
- `'afterSplit'`: Content after split point

#### applySplitToFirstBlock(block, offset, cache)
Replaces block content with cached before-split content.

#### revertSplitBlock(block, cache)
Restores original content from cache.

### Merge Operations

#### prepareMergeBlocks(firstBlock, secondBlock, cache)
Caches content for merge:
- `'originalFirst'`: First block's original content
- `'originalSecond'`: Second block's original content
- `'merged'`: Combined content with proper inline preservation

#### applyMergeBlocks(firstBlock, secondBlock, cache)
Applies cached merged content to first block.

#### revertMergeBlocks(firstBlock, secondBlock, cache)
Restores both blocks to original state.

### Extract Operations

#### prepareExtractContent(startBlock, startOffset, endBlock, endOffset, cache)
Caches multi-block content extraction:
- Original content for all affected blocks
- Remaining content after extraction
- Extracted content

#### applyExtractContent(startBlock, startOffset, endBlock, endOffset, cache)
Removes content between two points across multiple blocks.

#### revertExtractContent(startBlock, startBlockIndex, endBlock, endBlockIndex, intermediateBlocks, cache)
Restores all affected blocks to original state.

## Utility Functions

### clearBlock(block)
Removes all child nodes from a block element.

### normalizeBlock(block)
Ensures block has proper content structure:
- Adds `<br>` to empty blocks for caret positioning
- Preserves inline formatting

### getTextLength(block)
Returns total text length including all inline elements.

### transferInlineContent(sourceBlock, targetBlock)
Moves inline content between blocks preserving formatting.

## Replay Mode Protection

The system includes debugging guards to detect problematic node creation during replay:

```javascript
static createElement(tagName) {
    if (this._isReplayMode) {
        console.warn(`Warning: Creating element '${tagName}' during replay`);
        console.trace('createElement during replay');
    }
    return document.createElement(tagName);
}
```

StateManager integration:
```javascript
replay(mutation) {
    DOMOperations.setReplayMode(true);
    try {
        return this._executeMutation(mutation, false, false);
    } finally {
        DOMOperations.setReplayMode(false);
    }
}
```

## Anti-Patterns to Avoid

### ❌ Node Cloning in Cache
```javascript
// BAD: Creates new objects, breaks identity
return cache._nodes.get(cacheKey).cloneNode(true);
```

### ❌ DocumentFragment Indirection
```javascript
// BAD: Fragment becomes empty after use
const createContentFn = () => {
    const fragment = document.createDocumentFragment();
    nodes.forEach(node => fragment.appendChild(node));
    return fragment;
};
```

### ❌ Cache Reinitialization
```javascript
// BAD: Destroys existing cache
mutation.domCache = {};
```

## Best Practices

### ✅ Direct Node Array Storage
```javascript
// GOOD: Store and return actual nodes
const createContentFn = () => {
    return Array.from(block.childNodes).map(node => node.cloneNode(true));
};
```

### ✅ Conditional Cache Initialization
```javascript
// GOOD: Preserve existing cache
if (!mutation.domCache) {
    mutation.domCache = {};
}
```

### ✅ Node Identity Verification
```javascript
// Verify same node objects across operations
const nodeBeforeOperation = block.firstChild;
// ... perform operation ...
const nodeAfterRevert = block.firstChild;
console.assert(nodeBeforeOperation === nodeAfterRevert, 'Node identity preserved');
```

## Integration with Mutation System

DOMOperations is designed to work seamlessly with the mutation system:

1. **Prepare Phase** (in mutation setup):
   ```javascript
   DOMOperations.prepareSplitBlock(block, offset, mutation.domCache);
   ```

2. **Apply Phase** (in mutation.apply):
   ```javascript
   DOMOperations.applySplitToFirstBlock(block, offset, mutation.domCache);
   ```

3. **Revert Phase** (in mutation.revert):
   ```javascript
   DOMOperations.revertSplitBlock(block, mutation.domCache);
   ```

This pattern ensures that all DOM operations are reversible and maintain perfect node identity across the editor's history system.