# ARCHITECTURE.md

## System Overview

The editor follows a clean separation of concerns with specialized managers coordinating through a central mutation system. Each manager owns its domain and self-registers handlers, eliminating circular dependencies while maintaining loose coupling.

## Component Hierarchy

```
Editor (Orchestration Layer)
    ├── StateManager (Mutation System)
    ├── BlockManager (Block Operations)
    ├── ContentManager (Text/Range Operations)
    ├── HistoryManager (Undo/Redo)
    └── Utilities
        ├── CaretTracker (DOM ↔ Logical Position)
        ├── Carets (Selection Utilities)
        ├── DOMOperations (DOM Manipulation)
        └── BlockText (Text Position Utilities)
```

## Core Components

### Editor Class
**Role**: High-level orchestration and user interaction

**Responsibilities**:
- Event handling (keyboard, mouse, input)
- Coordination between managers
- Editor lifecycle management
- No direct DOM manipulation or handler registration

**Key Methods**:
- `handleKeyDown()`: Routes keyboard events to appropriate handlers
- `handleInput()`: Processes browser input events (including undo/redo)
- `handleMouseDown/Up()`: Manages contenteditable attribute dynamically

### StateManager
**Role**: Central mutation orchestrator with clean interface

**Public API**:
- `commit(mutation)`: Apply user-initiated mutation (recorded in history)
- `replay(mutation)`: Replay history mutation (not recorded)
- `revert(mutation)`: Revert mutation for undo (not recorded)

**Internal**:
- `_executeMutation()`: Single execution path avoids duplication
- Commit listeners only notified for user actions
- Handlers registered by managers themselves

**Mutation Structure**:
```javascript
{
    type: 'operationType',
    // Operation-specific data
    apply: (mutation) => { /* Forward operation */ },
    revert: (mutation) => { /* Reverse operation */ }
    // domCache initialized in apply when needed
}
```

### BlockManager
**Role**: Block-level element operations

**Self-Registered Handlers**:
- `formatBlock`: Change block type (p → h1, etc.)
- `insertElement`: Add new block elements
- `removeElement`: Delete block elements

**High-Level Methods**:
- `formatBlock(block, tagName)`: Change block format
- `insertBlock(block, tagName, where)`: Insert new block
- `removeBlock(block)`: Remove block element

**Implementation Pattern**:
- Creates elements outside mutations
- Passes elements as mutation parameters
- Inline apply/revert functions for clarity
- Each mutation instance gets its own domCache

### ContentManager
**Role**: Text and range operations with inline preservation

**Self-Registered Handlers**:
- `textContent`: Set block text content
- `deleteContent`: Remove content (single or multi-block)
- `insertContent`: Add content at position

**High-Level Methods**:
- `deleteSelection()`: Remove selected content
- `insertAtCursor(text)`: Insert text at caret
- `handleEnter()`: Split blocks at cursor
- `handleBackspace/Delete()`: Context-aware deletion

**Key Features**:
- Uses CaretState for multi-block selections
- Leverages DOMOperations for inline preservation
- Handles complex multi-block operations

### HistoryManager
**Role**: Undo/redo functionality

**Architecture**:
- Uses hidden contenteditable div to hook browser's native undo/redo
- DOM-based index tracking (innerText = history position)
- Listens only to commit events (no circular dependencies)
- Direct `revert()` for undo, `replay()` for redo

**Key Innovation**:
- No internal currentIndex variable
- History position stored in DOM
- Prevents drift between internal state and browser

**Implementation**:
```javascript
// Index tracking via DOM
updateHistoryIndex(index) {
    this.historyDiv.innerText = index > 0 ? index.toString() : '';
}

getCurrentIndex() {
    const text = this.historyDiv.innerText;
    return text ? parseInt(text) : 0;
}
```

## Utility Classes

### CaretState
**Role**: Logical caret position representation

**Properties**:
- `startBlockIndex`, `startOffset`: Start position
- `endBlockIndex`, `endOffset`: End position (for ranges)
- `isCollapsed`: True for cursor, false for selection

**Static Constructors**:
- `CaretState.collapsed(blockIndex, offset)`: Single position
- `CaretState.range(startBlockIndex, startOffset, endBlockIndex, endOffset)`: Selection

**Benefits**:
- Immune to DOM changes
- Uses block indices instead of DOM references
- Serializable for history

### CaretTracker
**Role**: Converts between DOM Ranges and CaretState

**Key Methods**:
- `captureCaretState()`: DOM Selection → CaretState
- `restoreCaretState(caretState)`: CaretState → DOM Selection
- `createRangeFromCaretState(caretState)`: CaretState → Range
- `getLogicalPosition(node, offset)`: DOM position → block index + offset

**Complexity Handling**:
- Text node traversal
- Inline element navigation
- Whitespace normalization

### DOMOperations
**Role**: Low-level DOM manipulation with inline preservation

**Key Features**:
- Perfect node identity caching
- 3-phase operation pattern
- Inline formatting preservation
- No `textContent` usage

**Core Pattern**:
```javascript
// Each mutation instance has its own domCache
const mutation = {
    type: 'splitBlock',
    // domCache initialized in apply on first run
    apply: (mutation) => {
        // Initialize cache if needed (preserves on replay)
        if (!mutation.domCache) {
            mutation.domCache = {};
        }
        
        // Prepare: Cache all variations
        DOMOperations.prepareSplitBlock(block, offset, mutation.domCache);
        
        // Apply: Use cached content
        DOMOperations.applySplitToFirstBlock(block, offset, mutation.domCache);
    },
    revert: (mutation) => {
        // Revert: Restore original (cache already exists)
        DOMOperations.revertSplitBlock(block, mutation.domCache);
    }
};
```

See [DOM-OPERATIONS.md](./DOM-OPERATIONS.md) for detailed implementation.

### BlockText
**Role**: Text position utilities without layout calculations

**Key Functions**:
- `isAtBlockStart(selection)`: Detect cursor at block beginning
- `isAtBlockEnd(selection)`: Detect cursor at block end
- `getVisibleOffsetFromBlockStart(container, offset)`: Calculate text offset

**Advanced Features**:
- CSS `white-space` property handling
- Hidden element detection
- Atomic inline support
- Fallback block detection

## Event Flow

### User Action → Commit
```
1. User Action (keypress, mouse click)
   ↓
2. Editor.handleEvent()
   ↓
3. Manager.handleSpecificAction()
   ↓
4. StateManager.commit(mutation)
   ↓
5. mutation.apply() executed
   ↓
6. HistoryManager notified (via listener)
   ↓
7. History entry created
```

### Undo Operation
```
1. Cmd+Z detected
   ↓
2. Browser triggers 'input' event (type: 'historyUndo')
   ↓
3. HistoryManager.handleHistoryUndo()
   ↓
4. StateManager.revert(mutation)
   ↓
5. mutation.revert() executed
   ↓
6. No history recording (clean separation)
```

### Redo Operation
```
1. Cmd+Shift+Z detected
   ↓
2. Browser triggers 'input' event (type: 'historyRedo')
   ↓
3. HistoryManager.handleHistoryRedo()
   ↓
4. StateManager.replay(mutation)
   ↓
5. mutation.apply() executed
   ↓
6. No history recording (clean separation)
```

## Mutation System Design

### Key Distinction: Handlers vs Instances

**Mutation Handler**: A definition registered once that knows how to apply/revert a type of operation
- Contains `apply` and `revert` methods
- Registered with StateManager via `registerHandler(type, handler)`
- Shared across all mutations of that type

**Mutation Instance**: The actual data for a specific operation
- Contains `type` and operation-specific data
- NO `apply` or `revert` methods
- Passed to `commit()`, `replay()`, and `revert()`
- Each operation creates a new instance

### Invertibility Principle

All mutations must be perfectly invertible:
- `apply(revert(state)) = identity(state)`
- `revert(apply(state)) = identity(state)`
- This includes **pointer identity** - the same DOM nodes must be preserved

### Three Execution Modes

1. **Commit**: User-initiated changes
   - Finds handler for mutation.type
   - Executes handler's `apply(mutation)`
   - Records mutation instance in history
   - Notifies listeners

2. **Replay**: Redo operations
   - Finds handler for mutation.type
   - Executes handler's `apply(mutation)`
   - No history recording
   - No listener notification

3. **Revert**: Undo operations
   - Finds handler for mutation.type
   - Executes handler's `revert(mutation)`
   - No history recording
   - No listener notification

### Mutation Lifecycle

```javascript
// Handler Registration (once in manager constructor)
class BlockManager {
    registerHandlers() {
        this.stateManager.registerHandler('formatBlock', {
            apply: (mutation) => {
                const { element, newElement } = mutation;
                
                // Capture state BEFORE changes
                mutation.parent = element.parentNode;
                mutation.nextSibling = element.nextSibling;
                
                // Transfer children
                while (element.firstChild) {
                    newElement.appendChild(element.firstChild);
                }
                
                // Apply changes
                element.parentNode.replaceChild(newElement, element);
            },
            
            revert: (mutation) => {
                const { element, newElement, parent, nextSibling } = mutation;
                
                // Transfer children back (same nodes!)
                while (newElement.firstChild) {
                    element.appendChild(newElement.firstChild);
                }
                
                // Restore original
                newElement.remove();
                parent.insertBefore(element, nextSibling);
            }
        });
    }
}

// Mutation Instance Creation (per operation)
formatBlock(block, tagName) {
    // Create element once for reuse
    const newElement = document.createElement(tagName);
    
    // Create mutation instance (data only, no methods!)
    const mutation = {
        type: 'formatBlock',
        element: block,
        newElement: newElement
    };
    
    // StateManager finds handler and calls handler.apply(mutation)
    return this.stateManager.commit(mutation);
}

// Execution (by StateManager)
class StateManager {
    commit(mutation) {
        const handler = this.handlers.get(mutation.type);
        handler.apply(mutation);
        this.history.push(mutation);
        this.notifyListeners(mutation);
    }
    
    replay(mutation) {
        const handler = this.handlers.get(mutation.type);
        handler.apply(mutation);
    }
    
    revert(mutation) {
        const handler = this.handlers.get(mutation.type);
        handler.revert(mutation);
    }
}
```

### DOM Cache Management

**Key Principle**: Each mutation instance owns its cache

```javascript
// CORRECT: Cache initialized per mutation instance
apply: (mutation) => {
    if (!mutation.domCache) {
        mutation.domCache = {};
    }
    // Use mutation.domCache for this specific mutation
    DOMOperations.captureBlockContent(block, 'original', mutation.domCache);
}

// WRONG: Would destroy cache on replay
apply: (mutation) => {
    mutation.domCache = {}; // Don't do this!
}
```

**Cache Lifecycle**:
1. **First apply** (during commit): Cache created and populated
2. **Replay** (during redo): Cache preserved and reused
3. **Revert** (during undo): Cache used to restore original state
4. **Future replay/revert cycles**: Cache continues to be reused

## Self-Registration Pattern

Each manager registers its own handlers in the constructor:

```javascript
class BlockManager {
    constructor(editor, stateManager) {
        // Register handlers
        stateManager.registerHandler('formatBlock', 
            (mutation) => this.applyFormatBlock(mutation),
            (mutation) => this.revertFormatBlock(mutation)
        );
        
        stateManager.registerHandler('insertElement',
            (mutation) => this.applyInsertElement(mutation),
            (mutation) => this.revertInsertElement(mutation)
        );
    }
}
```

**Benefits**:
- No central registration logic
- Managers fully encapsulate their operations
- Easy to add/remove managers
- Clear ownership of handlers

## Design Principles

### 1. Clean Separation
- Each manager owns its domain completely
- No cross-manager dependencies
- Communication only through mutations

### 2. DOM State Capture
- Always capture state BEFORE changes
- Never rely on stale references
- Store parent/sibling for reinsertion

### 3. Element Reuse
- Create elements once, reuse in revert
- Maintain node identity across operations
- No cloning in cache operations

### 4. Caret Positioning Rules
- Position caret ONLY in apply handlers
- Never in revert (history handles it)
- Never in high-level methods

### 5. History Independence
- History listens to commits only
- No flags or special modes needed
- Clean architectural separation

### 6. Cache Per Mutation Instance
- Each mutation owns its domCache
- Cache initialized conditionally in apply
- Preserved across replay/revert cycles

## Performance Considerations

### Node Identity Preservation
- Same DOM nodes moved, not recreated
- Reduces memory allocation
- Maintains event listeners and data

### Lazy Evaluation
- Content calculated only when needed
- Results cached for reuse
- No redundant DOM operations

### Batch Operations
- Multi-block operations in single mutation
- Atomic undo/redo of complex changes
- Consistent state transitions

### Memory Management
- Cache scoped to mutation instances
- Nodes reused rather than cloned
- Efficient array storage over fragments