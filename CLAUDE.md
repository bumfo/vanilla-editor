# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A custom rich text editor built with **pure vanilla HTML, CSS, and JavaScript** - no build system, no dependencies.

**Key features:**
- Contenteditable-based editing with custom keyboard handling
- Block-level element manipulation (headings, paragraphs)
- Custom undo/redo history system with DOM-based state tracking
- Advanced text selection and range management
- Inline formatting preservation across all operations

## Architecture Highlights

### Mutation System Design

The editor uses a **handler-based mutation system** where:
- **Mutation Handlers** define how to apply/revert operation types (registered once)
- **Mutation Instances** are data objects passed to operations (created per action)
- **StateManager** coordinates between handlers and instances

```
User Action → Create Mutation Instance → StateManager.commit() → Handler.apply()
                    (data only)              (finds handler)       (executes logic)
```

### Component Hierarchy

```
Editor (Event Orchestration)
    ├── StateManager (Mutation Coordination)
    ├── BlockManager (Block Operations)
    ├── ContentManager (Text Operations)
    ├── HistoryManager (Undo/Redo)
    └── Utilities
        ├── CaretTracker (Position Management)
        ├── DOMOperations (DOM Manipulation)
        └── BlockText (Text Utilities)
```

### Perfect Invertibility Principle

**All mutations MUST be perfectly invertible:**
- `apply(revert(state)) = identity(state)`
- `revert(apply(state)) = identity(state)`
- This includes **pointer identity** - same DOM nodes must be preserved

## Core Concepts

### 1. Handlers vs Instances

**Handlers** (definition):
- Contain `apply` and `revert` methods
- Registered with `stateManager.registerHandler(type, handler)`
- Shared across all operations of that type

**Instances** (data):
- Contain `type` and operation-specific properties
- NO methods - just data
- Created fresh for each operation
- Passed to `commit()`, `replay()`, `revert()`

### 2. DOM Cache Management

- Cache initialized in handler's `apply` method: `if (!mutation.domCache) mutation.domCache = {}`
- Persists across replay/revert cycles
- Stores actual DOM nodes, never clones
- Critical for preserving inline formatting

### 3. Node Identity Preservation

- Same DOM nodes move between locations
- Never clone nodes during operations
- Use `appendChild()` to move, not `cloneNode()`
- Essential for maintaining event listeners and data

## Critical Constraints

### Must-Follow Rules

1. **State Capture Timing**
   - ALWAYS capture DOM state BEFORE making changes
   - Store `parentNode` and `nextSibling` before removal
   - Capture original content before modifications

2. **Element Creation**
   - Create elements OUTSIDE handlers when possible
   - Pass as mutation instance properties
   - Reuse same elements in revert operations

3. **Caret Positioning**
   - ONLY in handler's `apply` method
   - NEVER in `revert` method (history handles it)
   - NEVER in high-level methods (Editor class)

4. **Cache Initialization**
   - Use conditional init: `if (!mutation.domCache)`
   - NEVER reinitialize: `mutation.domCache = {}` (destroys cache)

## Important Caveats

### Common Pitfalls

1. **Stale References**: DOM references become invalid after modifications
2. **Node Cloning**: Breaks identity, creates memory leaks
3. **textContent Usage**: Destroys inline formatting (`<b>`, `<i>`, etc.)
4. **DocumentFragments**: Become empty after use, complicating cache

### Testing Requirements

- Test undo/redo sequences thoroughly
- Verify node identity preservation
- Check inline formatting survival
- Test multi-block operations

### Performance Considerations

- Reuse nodes instead of creating new ones
- Cache expensive calculations in mutation.domCache
- Batch multi-block operations in single mutations

## Code Style Guidelines

- **Direct object literals** for mutations (no redundant variables)
- **Inline handlers** unless complex
- **Self-registration** - managers register their own handlers
- **DRY principle** - consolidate common patterns
- **Constants** for mutation types (better tooling support)

## File Structure

```
editor/
├── index.html               # Main entry point
├── js/
│   ├── editor.js           # Main editor orchestration
│   ├── state-manager.js    # Central mutation handling
│   ├── block-manager.js    # Block-level operations
│   ├── content-manager.js  # Text/range operations
│   ├── history-manager.js  # Undo/redo functionality
│   ├── caret-tracker.js    # CaretState and CaretTracker
│   ├── carets.js          # Caret/selection utilities
│   ├── dom-operations.js  # DOM manipulation utilities
│   └── block-text.js       # Text position utilities
└── css/
    └── editor.css          # Editor styles
```

## Detailed Documentation

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - Complete system design and component interactions
- **[HISTORY-COMPATIBLE-CODE.md](./HISTORY-COMPATIBLE-CODE.md)** - Mutation patterns with examples
- **[DOM-OPERATIONS.md](./DOM-OPERATIONS.md)** - DOM manipulation and caching details
- **[MUTATION-TYPES.md](./MUTATION-TYPES.md)** - Type constants and specifications
- **[CARET-HANDLING.md](./CARET-HANDLING.md)** - Caret positioning patterns

## Quick Reference

### Anti-Patterns to Avoid

❌ **Clone cached nodes** - breaks identity
❌ **Use stale DOM references** - capture before changes
❌ **Position caret in revert** - history handles it
❌ **Use DocumentFragments for caching** - becomes empty
❌ **Put methods on mutation instances** - they're just data
❌ **Create elements in handlers** - create outside
❌ **Use textContent with formatting** - destroys inline elements
❌ **Reinitialize domCache** - destroys existing cache

### Best Practices

✅ **Reuse same DOM nodes** across operations
✅ **Capture state before changes**
✅ **Position caret in apply only**
✅ **Store actual node arrays** for caching
✅ **Test invertibility** including pointer identity
✅ **Use constants** for mutation types
✅ **Initialize cache conditionally**
✅ **Create elements once** outside handlers