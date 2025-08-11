# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A custom rich text editor built with **pure vanilla HTML, CSS, and JavaScript** - no build system, no dependencies.

Key features:
- Contenteditable-based editing with custom keyboard handling
- Block-level element manipulation (headings, paragraphs)
- Custom undo/redo history system with DOM-based state tracking
- Advanced text selection and range management
- Inline formatting preservation across all operations

## Architecture Overview

### Core Design Principles

1. **Mutation-based State Management**: All changes expressed as reversible mutations
2. **DOM-based Truth**: History index stored in DOM to prevent state drift
3. **Perfect Node Identity**: Same DOM nodes reused across undo/redo cycles
4. **Clean Separation**: Each manager self-registers handlers and owns its domain

### Key Components

- **StateManager**: Central mutation orchestrator (`commit`, `replay`, `revert`)
- **Editor**: High-level event handling and coordination
- **BlockManager**: Block-level operations (format, insert, remove)
- **ContentManager**: Text and range operations with inline preservation
- **HistoryManager**: Undo/redo via hidden contenteditable hook
- **CaretTracker/Carets**: Caret position and selection management
- **DOMOperations**: Low-level DOM manipulation preserving inline formatting

### Critical Implementation Rules

1. **Caret positioning** belongs in mutation `apply` handlers ONLY
2. **DOM state capture** BEFORE making changes, never rely on stale references
3. **Element creation** outside mutations when possible, reuse in revert
4. **No cloning** in cache operations - preserve node identity

## Code Style Guidelines

- **Direct object literals** for mutations (no redundant variables)
- **Inline handlers** unless complex
- **Self-registration** - managers register their own handlers
- **DRY principle** - consolidate common patterns

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
│   ├── caret-tracker.js    # CaretState and CaretTracker classes
│   ├── carets.js          # Caret/selection utilities
│   ├── dom-operations.js  # DOM manipulation utilities
│   └── block-text.js       # Text position utilities
└── css/
    └── editor.css          # Editor styles
```

## Detailed Implementation Guides

- **[CARET-HANDLING.md](./CARET-HANDLING.md)** - Caret positioning patterns and implementation
- **[HISTORY-COMPATIBLE-CODE.md](./HISTORY-COMPATIBLE-CODE.md)** - DOM state capture and revert patterns

## Quick Reference

### Mutation Pattern
```javascript
// Create element outside, pass to mutation
const newElement = document.createElement(tagName);
stateManager.commit({
    type: 'formatBlock',
    element: block,
    newElement: newElement,
    apply: (mutation) => {
        // Capture DOM state first
        mutation.parent = element.parentNode;
        mutation.nextSibling = element.nextSibling;
        // Apply changes
        element.replaceWith(newElement);
    },
    revert: (mutation) => {
        // Reuse stored elements
        newElement.remove();
        mutation.parent.insertBefore(element, mutation.nextSibling);
    }
});
```

### Anti-Patterns to Avoid

❌ **Never clone cached nodes** - breaks identity  
❌ **Never use stale DOM references** - capture before changes  
❌ **Never position caret in revert** - history handles it  
❌ **Never use DocumentFragments for caching** - becomes empty  

✅ **Always reuse same DOM nodes** across operations  
✅ **Always capture state before changes**  
✅ **Always position caret in apply only**  
✅ **Always store actual node arrays** for caching