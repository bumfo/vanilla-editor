# History-Compatible Code Patterns

## Core Concepts

### Mutation Handlers vs Mutation Instances

**Mutation Handler**: A definition that specifies how to apply and revert a type of operation. Registered once with the StateManager.

```javascript
// Handler registration (done once in manager constructor)
stateManager.registerHandler('formatBlock', {
    apply: (mutation) => { /* implementation */ },
    revert: (mutation) => { /* implementation */ }
});
```

**Mutation Instance**: The actual data/arguments for a specific operation. Created each time an operation is performed.

```javascript
// Mutation instance (created for each operation)
const mutation = {
    type: 'formatBlock',
    element: block,
    newElement: newElement
    // No apply/revert methods - those are in the handler!
};
stateManager.commit(mutation);
```

### Invertibility Principle

Mutations must be perfectly invertible, meaning:
- `apply(revert(state)) = identity(state)`
- `revert(apply(state)) = identity(state)`
- This includes **pointer identity** - the same DOM nodes must be preserved

## Pattern 1: Basic Mutation Structure

### Handler Registration (in Manager Constructor)

```javascript
class BlockManager {
    constructor(editor, stateManager) {
        this.stateManager = stateManager;
        this.registerHandlers();
    }
    
    registerHandlers() {
        // Handler defines how to apply/revert ANY formatBlock mutation
        this.stateManager.registerHandler('formatBlock', {
            apply: (mutation) => {
                const { element, newElement } = mutation;
                
                // Capture state BEFORE changes
                mutation.parent = element.parentNode;
                mutation.nextSibling = element.nextSibling;
                
                // Transfer children (preserves inline formatting)
                while (element.firstChild) {
                    newElement.appendChild(element.firstChild);
                }
                
                // Replace element
                element.parentNode.replaceChild(newElement, element);
            },
            
            revert: (mutation) => {
                const { element, newElement, parent, nextSibling } = mutation;
                
                // Transfer children back (same nodes, not clones!)
                while (newElement.firstChild) {
                    element.appendChild(newElement.firstChild);
                }
                
                // Restore original element
                newElement.remove();
                parent.insertBefore(element, nextSibling);
            }
        });
    }
}
```

### Creating and Committing Mutation Instances

```javascript
class BlockManager {
    formatBlock(block, tagName) {
        // Create element ONCE for reuse
        const newElement = document.createElement(tagName);
        
        // Create mutation instance (just data, no methods)
        const mutation = {
            type: 'formatBlock',
            element: block,
            newElement: newElement
        };
        
        // Commit executes the handler's apply method
        return this.stateManager.commit(mutation);
    }
}
```

## Pattern 2: Complex Operations with DOM Cache

### Handler with Cache Management

```javascript
this.stateManager.registerHandler('splitBlock', {
    apply: (mutation) => {
        const { block, splitOffset, newBlock } = mutation;
        
        // Initialize cache on first apply (preserves on replay)
        if (!mutation.domCache) {
            mutation.domCache = {};
        }
        
        // Capture original state
        DOMOperations.prepareSplitBlock(block, splitOffset, mutation.domCache);
        
        // Apply the split
        DOMOperations.applySplitToFirstBlock(block, mutation.domCache);
        DOMOperations.populateAfterSplitBlock(newBlock, mutation.domCache);
        
        // Insert new block
        block.parentNode.insertBefore(newBlock, block.nextSibling);
    },
    
    revert: (mutation) => {
        const { block, newBlock } = mutation;
        
        // Remove new block
        newBlock.remove();
        
        // Restore original content (cache already exists)
        DOMOperations.revertSplitBlock(block, mutation.domCache);
    }
});
```

### Creating Split Mutation Instance

```javascript
splitBlock(block, offset) {
    // Create new block element once
    const newBlock = document.createElement(block.tagName);
    
    // Mutation instance with data only
    return this.stateManager.commit({
        type: 'splitBlock',
        block: block,
        splitOffset: offset,
        newBlock: newBlock
    });
}
```

## Pattern 3: State Capture Rules

### Always Capture Parent Info BEFORE Changes

```javascript
// Handler implementation
apply: (mutation) => {
    const { element } = mutation;
    
    // CORRECT: Capture before removal
    mutation.parent = element.parentNode;
    mutation.nextSibling = element.nextSibling;
    
    element.remove();
}

// WRONG: Parent is null after removal!
apply: (mutation) => {
    element.remove();
    mutation.parent = element.parentNode; // null!
}
```

### Store Original Content Before Modifications

```javascript
apply: (mutation) => {
    const { block, newText } = mutation;
    
    // CORRECT: Store original first
    mutation.originalText = block.textContent;
    block.textContent = newText;
}

revert: (mutation) => {
    // Can restore using captured original
    mutation.block.textContent = mutation.originalText;
}
```

## Pattern 4: Element Creation and Reuse

### Create Elements Outside Handlers

```javascript
// In high-level method
insertBlock(afterBlock, tagName) {
    // Create element ONCE
    const newBlock = document.createElement(tagName);
    newBlock.appendChild(document.createElement('br'));
    
    // Pass to mutation instance
    return this.stateManager.commit({
        type: 'insertElement',
        element: newBlock,
        parent: afterBlock.parentNode,
        before: afterBlock.nextSibling
    });
}

// Handler just uses the pre-created element
this.stateManager.registerHandler('insertElement', {
    apply: (mutation) => {
        const { element, parent, before } = mutation;
        parent.insertBefore(element, before || null);
    },
    
    revert: (mutation) => {
        mutation.element.remove();
    }
});
```

## Pattern 5: Multi-Block Operations

### Handler for Complex Deletion

```javascript
this.stateManager.registerHandler('deleteContent', {
    apply: (mutation) => {
        const { startBlock, startOffset, endBlock, endOffset, intermediateBlocks } = mutation;
        
        if (!mutation.domCache) {
            mutation.domCache = {};
        }
        
        // Capture all affected blocks
        DOMOperations.captureBlockContent(startBlock, 'originalStart', mutation.domCache);
        DOMOperations.captureBlockContent(endBlock, 'originalEnd', mutation.domCache);
        
        // Capture and remove intermediate blocks
        intermediateBlocks.forEach((block, index) => {
            DOMOperations.captureBlockContent(block, `intermediate_${index}`, mutation.domCache);
            mutation[`parent_${index}`] = block.parentNode;
            mutation[`nextSibling_${index}`] = block.nextSibling;
            block.remove();
        });
        
        // Apply deletion to start/end blocks
        DOMOperations.prepareExtractContent(
            startBlock, startOffset, endBlock, endOffset, mutation.domCache
        );
        DOMOperations.applyExtractContent(
            startBlock, startOffset, endBlock, endOffset, mutation.domCache
        );
    },
    
    revert: (mutation) => {
        const { startBlock, endBlock, intermediateBlocks } = mutation;
        
        // Restore intermediate blocks
        intermediateBlocks.forEach((block, index) => {
            const parent = mutation[`parent_${index}`];
            const nextSibling = mutation[`nextSibling_${index}`];
            parent.insertBefore(block, nextSibling);
            
            // Restore content
            DOMOperations.restoreBlockContent(block, `intermediate_${index}`, mutation.domCache);
        });
        
        // Restore start/end blocks
        DOMOperations.restoreBlockContent(startBlock, 'originalStart', mutation.domCache);
        DOMOperations.restoreBlockContent(endBlock, 'originalEnd', mutation.domCache);
    }
});
```

## Invertibility Requirements

### Perfect Node Identity Preservation

```javascript
// Test invertibility
const originalNode = block.firstChild;
const originalId = originalNode.id;

// Apply mutation
stateManager.commit(mutation);

// Revert mutation
stateManager.revert(mutation);

// Must be the SAME object, not a clone
console.assert(block.firstChild === originalNode, 'Node identity preserved');
console.assert(block.firstChild.id === originalId, 'Node properties preserved');
```

### Cache Persistence Across Cycles

```javascript
// First apply creates cache
stateManager.commit(mutation);  // mutation.domCache created

// Undo preserves cache
stateManager.revert(mutation);  // mutation.domCache still exists

// Redo reuses cache
stateManager.replay(mutation);  // mutation.domCache reused, not recreated
```

## Key Rules Summary

### ✅ DO:
- Register handlers with `apply` and `revert` methods
- Create mutation instances with just data (no methods)
- Capture DOM state BEFORE making changes
- Create elements outside handlers when possible
- Use conditional cache initialization
- Preserve node identity (move nodes, don't clone)
- Test invertibility including pointer identity

### ❌ DON'T:
- Put `apply`/`revert` methods on mutation instances
- Create elements inside handlers during replay
- Use `textContent` for content with inline formatting
- Clone nodes when moving between locations
- Reinitialize cache on replay (`mutation.domCache = {}`)
- Rely on stale DOM references

## Testing Invertibility

```javascript
// Comprehensive test
function testMutationInvertibility(mutation) {
    // Capture initial state
    const initialHTML = editor.innerHTML;
    const initialNodes = Array.from(editor.querySelectorAll('*'));
    
    // Apply
    stateManager.commit(mutation);
    const afterApplyHTML = editor.innerHTML;
    
    // Revert
    stateManager.revert(mutation);
    
    // Check HTML restored
    console.assert(editor.innerHTML === initialHTML, 'HTML restored');
    
    // Check node identity preserved
    const finalNodes = Array.from(editor.querySelectorAll('*'));
    initialNodes.forEach((node, i) => {
        console.assert(node === finalNodes[i], `Node ${i} identity preserved`);
    });
    
    // Apply again (replay)
    stateManager.replay(mutation);
    
    // Should match first apply
    console.assert(editor.innerHTML === afterApplyHTML, 'Replay matches original apply');
}
```

## Integration with StateManager

The StateManager coordinates between mutation instances and handlers:

```javascript
class StateManager {
    commit(mutation) {
        // Find handler for mutation.type
        const handler = this.handlers.get(mutation.type);
        
        // Execute handler's apply method with mutation instance
        handler.apply(mutation);
        
        // Record in history
        this.history.push(mutation);
    }
    
    replay(mutation) {
        // Reuse handler's apply (no new recording)
        const handler = this.handlers.get(mutation.type);
        handler.apply(mutation);
    }
    
    revert(mutation) {
        // Use handler's revert method
        const handler = this.handlers.get(mutation.type);
        handler.revert(mutation);
    }
}
```

See also:
- [DOM-OPERATIONS.md](./DOM-OPERATIONS.md) - DOMOperations implementation
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [MUTATION-TYPES.md](./MUTATION-TYPES.md) - Mutation type constants