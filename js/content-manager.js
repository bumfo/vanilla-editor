import { DELETE_CONTENT, INSERT_CONTENT } from './mutation-types.js';
import { CaretState } from './caret-tracker.js';
import Carets from './carets.js';
import DOMOperations from './dom-operations.js';

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
        this.stateManager.registerHandler(DELETE_CONTENT, {
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

                // Initialize DOM cache only if it doesn't exist (preserve existing cache during replay)
                if (!mutation.domCache) {
                    mutation.domCache = {};
                }
                
                if (startBlockIndex === endBlockIndex) {
                    // Single block deletion - extract content using DOMOperations
                    const extractData = DOMOperations.prepareExtractContent(startBlock, startOffset, endOffset, mutation.domCache);
                    mutation.extractData = extractData;
                    mutation.deletedBlocks = [];
                    mutation.mergeOffset = startOffset;
                    
                    // Apply content extraction
                    DOMOperations.applyExtractContent(startBlock, mutation.domCache);
                } else {
                    // Multi-block deletion - complex merge operation
                    
                    // Capture original content of start and end blocks
                    DOMOperations.captureBlockContent(startBlock, 'originalStart', mutation.domCache);
                    DOMOperations.captureBlockContent(endBlock, 'originalEnd', mutation.domCache);
                    
                    // Store intermediate blocks for revert (capture their content properly)
                    mutation.deletedBlocks = [];
                    for (let i = startBlockIndex + 1; i < endBlockIndex; i++) {
                        const block = blocks[i];
                        const blockCacheKey = `intermediateBlock_${i}`;
                        DOMOperations.captureBlockContent(block, blockCacheKey, mutation.domCache);
                        mutation.deletedBlocks.push({
                            element: block,
                            cacheKey: blockCacheKey,
                            tagName: block.tagName
                        });
                    }
                    
                    // Store endBlock for reuse in revert
                    mutation.removedEndBlock = endBlock;
                    
                    // Calculate merge offset (start block remaining length)
                    mutation.mergeOffset = startOffset;
                    
                    // Create merged content: start block (0 to startOffset) + end block (endOffset to end)
                    const createMergedFn = () => {
                        const mergedNodes = [];
                        
                        // Get content BEFORE the selection (0 to startOffset) from start block
                        const beforeSplit = DOMOperations.calculateSplitContent(startBlock, startOffset);
                        mergedNodes.push(...beforeSplit.beforeNodes);
                        
                        // Get content AFTER the selection (endOffset to end) from end block  
                        const afterSplit = DOMOperations.calculateSplitContent(endBlock, endOffset);
                        mergedNodes.push(...afterSplit.afterNodes);
                        
                        return mergedNodes;
                    };
                    
                    DOMOperations.getCachedNodes('merged', createMergedFn, mutation.domCache);
                    
                    // Remove intermediate blocks
                    mutation.deletedBlocks.forEach(blockInfo => {
                        blockInfo.element.remove();
                    });
                    
                    // Apply merged content to start block
                    DOMOperations.populateBlock(startBlock, 'merged', () => [], mutation.domCache);
                    
                    // Remove end block (but keep reference for revert)
                    endBlock.remove();
                }

                // Set caret position at merge/deletion point
                mutation.caretStateAfter = CaretState.collapsed(startBlockIndex, mutation.mergeOffset);
                
                if (!mutation.caretStateAfter) {
                        // Set caret position at merge/deletion point
                        mutation.caretStateAfter = CaretState.collapsed(startBlockIndex, mutation.mergeOffset);
                }

                // Restore caret immediately using DRY helper
                this.restoreCaretState(mutation, 'caretStateAfter');
            },

            revert: (mutation) => {
                const { 
                    startBlockIndex, endBlockIndex, 
                    deletedBlocks, removedEndBlock
                } = mutation;
                
                const blocks = Array.from(this.editor.children);
                const startBlock = blocks[startBlockIndex];
                
                if (startBlockIndex === endBlockIndex) {
                    // Single block revert using DOMOperations
                    DOMOperations.revertExtractContent(startBlock, mutation.domCache);
                } else {
                    // Multi-block revert
                    // Restore original start block content
                    DOMOperations.restoreBlockContent(startBlock, 'originalStart', mutation.domCache);
                    
                    // Restore original end block content
                    DOMOperations.restoreBlockContent(removedEndBlock, 'originalEnd', mutation.domCache);
                    
                    // Re-insert intermediate blocks first
                    let insertAfter = startBlock;
                    deletedBlocks.forEach(blockInfo => {
                        DOMOperations.restoreBlockContent(blockInfo.element, blockInfo.cacheKey, mutation.domCache);
                        insertAfter.parentNode.insertBefore(blockInfo.element, insertAfter.nextSibling);
                        insertAfter = blockInfo.element;
                    });
                    
                    // Re-insert end block after all intermediate blocks
                    insertAfter.parentNode.insertBefore(removedEndBlock, insertAfter.nextSibling);
                }
            },
        });

        // Insert content handler (using CaretTracker for positioning)
        this.stateManager.registerHandler(INSERT_CONTENT, {
            apply: (mutation) => {
                const { caretState, content } = mutation;

                // Convert caret state to DOM range using CaretTracker
                const insertRange = this.caretTracker.createRangeFromCaretState(caretState);
                if (!insertRange) return;

                // Store position for revert
                mutation.restorePosition = caretState;
                mutation.insertedLength = content.length;

                // Insert the content
                const textNode = DOMOperations.createTextNode(content);
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
                type: DELETE_CONTENT,
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
                type: INSERT_CONTENT,
                caretState: caretState,
                content: content,
            });
        } catch (error) {
            console.warn('Failed to insert content:', error);
            return false;
        }
    }
}

export default ContentManager;