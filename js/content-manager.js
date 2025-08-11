/**
 * Content Manager - Handles text content and range operations
 */
class ContentManager {
    constructor(editorElement, stateManager, caretTracker) {
        this.editor = editorElement;
        this.stateManager = stateManager;
        this.caretTracker = caretTracker;
        this.registerHandlers();
    }

    /**
     * DRY helper to restore caret state after DOM changes
     * @param {Object} mutation - The mutation object containing caret state
     * @param {string} stateKey - Key for caret state ('caretStateBefore' or 'caretStateAfter')
     */
    restoreCaretState(mutation, stateKey = 'caretStateBefore') {
        const caretState = mutation[stateKey];
        if (caretState && this.caretTracker) {
            try {
                this.caretTracker.restoreCaretState(caretState);
            } catch (error) {
                console.warn('Failed to restore caret state:', error);
            }
        }
    }

    /**
     * Register all content-related mutation handlers
     */
    registerHandlers() {
        // Text content handler
        this.stateManager.registerHandler('textContent', {
            apply: (mutation) => {
                const { element, newContent, oldContent } = mutation;

                // Store old content if not provided
                if (oldContent === undefined) {
                    mutation.oldContent = element.textContent;
                }

                element.textContent = newContent;
            },

            revert: (mutation) => {
                const { element, oldContent } = mutation;
                element.textContent = oldContent;
            },
        });

        // Delete content handler (handles multi-block deletion like mergeBlocks)
        this.stateManager.registerHandler('deleteContent', {
            apply: (mutation) => {
                const { rangeCaretState } = mutation;
                const blocks = Array.from(this.editor.children);
                
                const startBlockIndex = rangeCaretState.startBlockIndex;
                const endBlockIndex = rangeCaretState.endBlockIndex;
                const startOffset = rangeCaretState.startOffset;
                const endOffset = rangeCaretState.endOffset;

                // Get the blocks involved
                const startBlock = blocks[startBlockIndex];
                const endBlock = blocks[endBlockIndex];

                if (!startBlock || !endBlock) return;

                // Store original state for revert
                mutation.startBlockIndex = startBlockIndex;
                mutation.endBlockIndex = endBlockIndex;
                mutation.startOffset = startOffset;
                mutation.endOffset = endOffset;
                
                if (startBlockIndex === endBlockIndex) {
                    // Single block deletion - simple text removal
                    mutation.originalContent = startBlock.textContent;
                    mutation.deletedBlocks = [];
                    
                    const text = startBlock.textContent;
                    const beforeText = text.substring(0, startOffset);
                    const afterText = text.substring(endOffset);
                    startBlock.textContent = beforeText + afterText;
                } else {
                    // Multi-block deletion - merge like mergeBlocks
                    mutation.startBlockOriginalContent = startBlock.textContent;
                    mutation.endBlockOriginalContent = endBlock.textContent;
                    
                    // Store intermediate blocks for revert (similar to mergeBlocks pattern)
                    mutation.deletedBlocks = [];
                    for (let i = startBlockIndex + 1; i < endBlockIndex; i++) {
                        const block = blocks[i];
                        mutation.deletedBlocks.push({
                            element: block,
                            content: block.textContent,
                            tagName: block.tagName
                        });
                    }
                    
                    // Store endBlock for reuse in revert (like mergeBlocks)
                    mutation.removedEndBlock = endBlock;
                    mutation.removedEndBlockContent = endBlock.textContent;
                    
                    // Calculate merge offset (like mergeBlocks)
                    const startBlockRemainingText = startBlock.textContent.substring(0, startOffset);
                    mutation.mergeOffset = startBlockRemainingText.length;
                    
                    // Remove intermediate blocks
                    mutation.deletedBlocks.forEach(blockInfo => {
                        blockInfo.element.remove();
                    });
                    
                    // Merge start and end blocks (like mergeBlocks)
                    const endBlockRemainingText = endBlock.textContent.substring(endOffset);
                    startBlock.textContent = startBlockRemainingText + endBlockRemainingText;
                    
                    // Remove end block (but keep reference for revert)
                    endBlock.remove();
                }

                // Set caret position at merge/deletion point (like mergeBlocks)
                mutation.caretStateAfter = CaretState.collapsed(startBlockIndex, mutation.mergeOffset || startOffset);
                
                // Restore caret immediately using DRY helper (like mergeBlocks)
                this.restoreCaretState(mutation, 'caretStateAfter');
            },

            revert: (mutation) => {
                const { 
                    startBlockIndex, endBlockIndex, 
                    startBlockOriginalContent, endBlockOriginalContent,
                    originalContent, deletedBlocks, removedEndBlock
                } = mutation;
                
                const blocks = Array.from(this.editor.children);
                const startBlock = blocks[startBlockIndex];
                
                if (startBlockIndex === endBlockIndex) {
                    // Single block revert
                    startBlock.textContent = originalContent;
                } else {
                    // Multi-block revert (like mergeBlocks revert)
                    // Restore original start block content
                    startBlock.textContent = startBlockOriginalContent;
                    
                    // Reuse the removed end block element (like mergeBlocks)
                    removedEndBlock.textContent = endBlockOriginalContent;
                    
                    // Re-insert intermediate blocks first
                    let insertAfter = startBlock;
                    deletedBlocks.forEach(blockInfo => {
                        blockInfo.element.textContent = blockInfo.content;
                        insertAfter.parentNode.insertBefore(blockInfo.element, insertAfter.nextSibling);
                        insertAfter = blockInfo.element;
                    });
                    
                    // Re-insert end block after all intermediate blocks
                    insertAfter.parentNode.insertBefore(removedEndBlock, insertAfter.nextSibling);
                }
            },
        });

        // Insert content handler (using CaretTracker for positioning)
        this.stateManager.registerHandler('insertContent', {
            apply: (mutation) => {
                const { caretState, content } = mutation;

                // Convert caret state to DOM range using CaretTracker
                const insertRange = this.caretTracker.createRangeFromCaretState(caretState);
                if (!insertRange) return;

                // Store position for revert
                mutation.restorePosition = caretState;
                mutation.insertedLength = content.length;

                // Insert the content
                const textNode = document.createTextNode(content);
                insertRange.insertNode(textNode);
            },

            revert: (mutation) => {
                const { restorePosition, insertedLength } = mutation;

                // Convert restore position to DOM range  
                const restoreRange = this.caretTracker.createRangeFromCaretState(restorePosition);
                if (!restoreRange) return;

                // Create range to select inserted content and delete it
                const deleteRange = document.createRange();
                deleteRange.setStart(restoreRange.startContainer, restoreRange.startOffset);
                deleteRange.setEnd(restoreRange.startContainer, restoreRange.startOffset + insertedLength);

                try {
                    deleteRange.deleteContents();
                } catch (error) {
                    // Handle cases where the range might be invalid
                    console.warn('Failed to revert insertContent:', error);
                }
            },
        });
    }

    /**
     * Delete content in the current selection
     * @returns {boolean} Whether the deletion was successful
     */
    deleteSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return false;

        const range = selection.getRangeAt(0);
        if (range.collapsed) return false;

        try {
            // Capture start and end positions using CaretTracker
            const startPos = this.caretTracker.getLogicalPosition(range.startContainer, range.startOffset);
            const endPos = this.caretTracker.getLogicalPosition(range.endContainer, range.endOffset);

            // Use single CaretState with endBlockIndex for the range
            const rangeCaretState = CaretState.range(
                startPos.blockIndex, startPos.offset,
                endPos.blockIndex, endPos.offset
            );

            return this.stateManager.commit({
                type: 'deleteContent',
                rangeCaretState: rangeCaretState,
            });
        } catch (error) {
            console.warn('Failed to delete selection:', error);
            return false;
        }
    }

    /**
     * Insert content at current cursor position
     * @param {string} content - The content to insert
     * @returns {boolean} Whether the insertion was successful
     */
    insertAtCursor(content) {
        const selection = window.getSelection();
        if (selection.rangeCount === 0) return false;

        const range = selection.getRangeAt(0);
        if (!range.collapsed) {
            // Delete selection first
            if (!this.deleteSelection()) return false;
        }

        try {
            // Capture current position using CaretTracker
            const currentPos = this.caretTracker.getLogicalPosition(range.startContainer, range.startOffset);
            const caretState = CaretState.collapsed(currentPos.blockIndex, currentPos.offset);

            return this.stateManager.commit({
                type: 'insertContent',
                caretState: caretState,
                content: content,
            });
        } catch (error) {
            console.warn('Failed to insert content:', error);
            return false;
        }
    }
}

// Export as global
window.ContentManager = ContentManager;