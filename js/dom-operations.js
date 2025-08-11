/**
 * DOM Operations - Handles low-level DOM manipulation while preserving inline formatting
 * and maintaining compatibility with the mutation/history system.
 * 
 * This class encapsulates node creation caching and provides DRY wrappers for common DOM operations.
 * The caching mechanism is internal - users just call methods and get properly cached/reusable nodes.
 */
class DOMOperations {
    // Static replay state for debugging (single-threaded safe)
    static _isReplayMode = false;
    
    /**
     * Set replay mode for debugging DOM node creation
     * @param {boolean} isReplay - True if in replay mode
     */
    static setReplayMode(isReplay) {
        this._isReplayMode = isReplay;
    }
    
    /**
     * Check if currently in replay mode
     * @returns {boolean} True if in replay mode
     */
    static isReplayMode() {
        return this._isReplayMode;
    }
    
    /**
     * Wrapper for document.createElement with replay mode validation
     * @param {string} tagName - Element tag name
     * @returns {Element} Created element
     */
    static createElement(tagName) {
        if (this._isReplayMode) {
            console.warn(`Warning: Creating element '${tagName}' during replay operation - this may break undo/redo`);
            console.trace('createElement during replay');
        }
        return document.createElement(tagName);
    }
    
    /**
     * Wrapper for document.createTextNode with replay mode validation
     * @param {string} text - Text content
     * @returns {Text} Created text node
     */
    static createTextNode(text) {
        if (this._isReplayMode) {
            console.warn(`Warning: Creating text node '${text.substring(0, 50)}${text.length > 50 ? '...' : ''}' during replay operation - this may break undo/redo`);
            console.trace('createTextNode during replay');
        }
        return document.createTextNode(text);
    }
    
    /**
     * Create a cached node that can be reused across apply/revert cycles
     * @param {string} cacheKey - Unique key for this cached node
     * @param {Function} createFn - Function to create the node if not cached
     * @param {Object} cache - Cache object (mutation.domCache)
     * @returns {Node} The actual cached node (same object identity)
     */
    static getCachedNode(cacheKey, createFn, cache) {
        if (!cache._nodes) cache._nodes = new Map();
        
        if (!cache._nodes.has(cacheKey)) {
            cache._nodes.set(cacheKey, createFn());
        }
        
        return cache._nodes.get(cacheKey);
    }
    
    /**
     * Get cached nodes (preserving node identity across operations)
     * @param {string} cacheKey - Unique key for this cached node array
     * @param {Function} createFn - Function to create the node array if not cached (returns Array<Node>)
     * @param {Object} cache - Cache object (mutation.domCache)
     * @returns {Array<Node>} Array of DOM nodes with preserved identity
     */
    static getCachedNodes(cacheKey, createFn, cache) {
        if (!cache._nodeArrays) cache._nodeArrays = new Map();
        
        if (!cache._nodeArrays.has(cacheKey)) {
            const nodeArray = createFn();
            cache._nodeArrays.set(cacheKey, nodeArray);
        }
        
        return cache._nodeArrays.get(cacheKey);
    }
    
    /**
     * Clear all content from a block element
     * @param {Element} block - Block to clear
     */
    static clearBlock(block) {
        while (block.firstChild) {
            block.removeChild(block.firstChild);
        }
    }
    
    /**
     * Populate block with cached nodes (preserving node identity)
     * @param {Element} block - Target block
     * @param {string} cacheKey - Cache key for the content
     * @param {Function} createContentFn - Function to create content if not cached
     * @param {Object} cache - Cache object
     */
    static populateBlock(block, cacheKey, createContentFn, cache) {
        this.clearBlock(block);
        const nodes = this.getCachedNodes(cacheKey, createContentFn, cache);
        
        // Move nodes to the target block (detaching from current parents)
        nodes.forEach(node => {
            if (node.parentNode) {
                node.parentNode.removeChild(node);
            }
            block.appendChild(node);
        });
        
        this.normalizeBlock(block);
    }
    
    /**
     * Store original block content for revert operations (creates new nodes to preserve current state)
     * @param {Element} block - Block to capture
     * @param {string} cacheKey - Cache key for storage
     * @param {Object} cache - Cache object
     */
    static captureBlockContent(block, cacheKey, cache) {
        const createOriginalFn = () => {
            return Array.from(block.childNodes).map(node => node.cloneNode(true));
        };
        
        // Force creation and caching of original content
        this.getCachedNodes(cacheKey, createOriginalFn, cache);
    }
    
    /**
     * Restore block content from cache (moves cached nodes to block)
     * @param {Element} block - Block to restore
     * @param {string} cacheKey - Cache key for the content
     * @param {Object} cache - Cache object
     */
    static restoreBlockContent(block, cacheKey, cache) {
        this.clearBlock(block);
        
        if (cache._nodeArrays && cache._nodeArrays.has(cacheKey)) {
            const nodes = cache._nodeArrays.get(cacheKey);
            nodes.forEach(node => {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
                block.appendChild(node);
            });
        }
        
        this.normalizeBlock(block);
    }
    
    /**
     * Split block content at offset, preparing for split operations
     * @param {Element} block - Block to split
     * @param {number} offset - Text offset for split
     * @param {Object} cache - Cache object (mutation.domCache)
     * @returns {Object} Split operation data
     */
    static prepareSplitBlock(block, offset, cache) {
        // Capture original content
        this.captureBlockContent(block, 'original', cache);
        
        // Calculate and cache split content
        const beforeKey = 'beforeSplit';
        const afterKey = 'afterSplit';
        
        const createBeforeFn = () => {
            const { beforeNodes } = this._calculateSplitContent(block, offset);
            return beforeNodes;
        };
        
        const createAfterFn = () => {
            const { afterNodes } = this._calculateSplitContent(block, offset);
            return afterNodes;
        };
        
        // Pre-cache the split content
        this.getCachedNodes(beforeKey, createBeforeFn, cache);
        this.getCachedNodes(afterKey, createAfterFn, cache);
        
        return {
            originalTextLength: this.getTextLength(block),
            splitOffset: offset
        };
    }
    
    /**
     * Apply split - update first block with before content
     * @param {Element} block - Block to update
     * @param {Object} cache - Cache object
     */
    static applySplitToFirstBlock(block, cache) {
        this.populateBlock(block, 'beforeSplit', () => [], cache);
    }
    
    /**
     * Populate new block with after-split content
     * @param {Element} newBlock - New block to populate
     * @param {Object} cache - Cache object
     */
    static populateAfterSplitBlock(newBlock, cache) {
        this.populateBlock(newBlock, 'afterSplit', () => [], cache);
    }
    
    /**
     * Revert split operation
     * @param {Element} block - Block to restore
     * @param {Object} cache - Cache object
     */
    static revertSplitBlock(block, cache) {
        this.restoreBlockContent(block, 'original', cache);
    }
    
    /**
     * Prepare merge operation
     * @param {Element} firstBlock - Target block
     * @param {Element} secondBlock - Source block
     * @param {Object} cache - Cache object
     * @returns {Object} Merge operation data
     */
    static prepareMergeBlocks(firstBlock, secondBlock, cache) {
        // Capture original content
        this.captureBlockContent(firstBlock, 'originalFirst', cache);
        this.captureBlockContent(secondBlock, 'originalSecond', cache);
        
        // Calculate and cache merged content
        const createMergedFn = () => {
            const mergedNodes = [];
            
            // Add first block content
            Array.from(firstBlock.childNodes).forEach(node => {
                mergedNodes.push(node.cloneNode(true));
            });
            
            // Add second block content
            Array.from(secondBlock.childNodes).forEach(node => {
                mergedNodes.push(node.cloneNode(true));
            });
            
            return mergedNodes;
        };
        
        this.getCachedNodes('merged', createMergedFn, cache);
        
        return {
            mergeOffset: this.getTextLength(firstBlock)
        };
    }
    
    /**
     * Apply merge operation
     * @param {Element} firstBlock - Target block to receive merged content
     * @param {Object} cache - Cache object
     */
    static applyMergeBlocks(firstBlock, cache) {
        this.populateBlock(firstBlock, 'merged', () => [], cache);
    }
    
    /**
     * Revert merge operation
     * @param {Element} firstBlock - Target block to restore
     * @param {Element} secondBlock - Source block to restore
     * @param {Object} cache - Cache object
     */
    static revertMergeBlocks(firstBlock, secondBlock, cache) {
        this.restoreBlockContent(firstBlock, 'originalFirst', cache);
        this.restoreBlockContent(secondBlock, 'originalSecond', cache);
    }
    
    /**
     * Prepare content extraction (for deletion)
     * @param {Element} block - Block to extract from
     * @param {number} startOffset - Start offset
     * @param {number} endOffset - End offset
     * @param {Object} cache - Cache object
     * @returns {Object} Extract operation data
     */
    static prepareExtractContent(block, startOffset, endOffset, cache) {
        // Capture original
        this.captureBlockContent(block, 'original', cache);
        
        // Calculate and cache remaining content
        const createRemainingFn = () => {
            const { remainingNodes } = this._calculateExtractContent(block, startOffset, endOffset);
            return remainingNodes;
        };
        
        this.getCachedNodes('remaining', createRemainingFn, cache);
        
        return {
            startOffset,
            endOffset
        };
    }
    
    /**
     * Apply content extraction
     * @param {Element} block - Block to update
     * @param {Object} cache - Cache object
     */
    static applyExtractContent(block, cache) {
        this.populateBlock(block, 'remaining', () => [], cache);
    }
    
    /**
     * Revert content extraction
     * @param {Element} block - Block to restore
     * @param {Object} cache - Cache object
     */
    static revertExtractContent(block, cache) {
        this.restoreBlockContent(block, 'original', cache);
    }
    
    /**
     * Ensure block has proper content (add <br> if empty)
     * @param {Element} block - Block to normalize
     */
    static normalizeBlock(block) {
        if (block.childNodes.length === 0) {
            block.appendChild(this.createElement('br'));
        }
    }
    
    /**
     * Get total text length of element
     * @param {Node} node - Node to measure
     * @returns {number} Text length
     */
    static getTextLength(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return node.textContent.length;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            let length = 0;
            for (const child of node.childNodes) {
                length += this.getTextLength(child);
            }
            return length;
        }
        return 0;
    }
    
    /**
     * Check if block is effectively empty
     * @param {Element} block - Block to check
     * @returns {boolean} True if empty
     */
    static isEmptyBlock(block) {
        const textContent = block.textContent.trim();
        if (textContent.length > 0) return false;
        
        const childElements = Array.from(block.children);
        return childElements.every(child => child.tagName === 'BR');
    }
    
    /**
     * Calculate content extraction for complex operations (public helper)
     * @param {Element} block - Block to analyze
     * @param {number} startOffset - Start offset
     * @param {number} endOffset - End offset
     * @returns {Object} {remainingNodes}
     */
    static calculateExtractContent(block, startOffset, endOffset) {
        return this._calculateExtractContent(block, startOffset, endOffset);
    }
    
    /**
     * Calculate split content for complex operations (public helper)
     * @param {Element} block - Block to analyze
     * @param {number} offset - Split offset
     * @returns {Object} {beforeNodes, afterNodes}
     */
    static calculateSplitContent(block, offset) {
        return this._calculateSplitContent(block, offset);
    }
    
    // ===== PRIVATE HELPER METHODS =====
    
    /**
     * Calculate split content without modifying DOM
     * @private
     */
    static _calculateSplitContent(block, offset) {
        const beforeNodes = [];
        const afterNodes = [];
        
        let currentOffset = 0;
        let splitFound = false;
        
        for (const node of block.childNodes) {
            if (splitFound) {
                afterNodes.push(node.cloneNode(true));
                continue;
            }
            
            if (node.nodeType === Node.TEXT_NODE) {
                const nodeLength = node.textContent.length;
                
                if (currentOffset + nodeLength <= offset) {
                    beforeNodes.push(node.cloneNode(true));
                    currentOffset += nodeLength;
                } else {
                    const splitPoint = offset - currentOffset;
                    
                    if (splitPoint > 0) {
                        beforeNodes.push(this.createTextNode(node.textContent.substring(0, splitPoint)));
                    }
                    
                    if (splitPoint < nodeLength) {
                        afterNodes.push(this.createTextNode(node.textContent.substring(splitPoint)));
                    }
                    
                    splitFound = true;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const nodeTextLength = this.getTextLength(node);
                
                if (currentOffset + nodeTextLength <= offset) {
                    beforeNodes.push(node.cloneNode(true));
                    currentOffset += nodeTextLength;
                } else if (currentOffset >= offset) {
                    afterNodes.push(node.cloneNode(true));
                    splitFound = true;
                } else {
                    const { beforeElement, afterElement } = this._splitInlineElement(node, offset - currentOffset);
                    
                    if (beforeElement) beforeNodes.push(beforeElement);
                    if (afterElement) afterNodes.push(afterElement);
                    
                    splitFound = true;
                }
            }
        }
        
        return { beforeNodes, afterNodes };
    }
    
    /**
     * Calculate content extraction without modifying DOM
     * @private
     */
    static _calculateExtractContent(block, startOffset, endOffset) {
        const firstSplit = this._calculateSplitContent(block, startOffset);
        
        const tempBlock = this.createElement('div');
        firstSplit.afterNodes.forEach(node => tempBlock.appendChild(node));
        
        const secondSplit = this._calculateSplitContent(tempBlock, endOffset - startOffset);
        
        return {
            remainingNodes: [...firstSplit.beforeNodes, ...secondSplit.afterNodes]
        };
    }
    
    /**
     * Split inline element preserving structure
     * @private
     */
    static _splitInlineElement(element, offset) {
        let currentOffset = 0;
        let beforeElement = null;
        let afterElement = null;
        
        for (const node of element.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                const nodeLength = node.textContent.length;
                
                if (currentOffset + nodeLength <= offset) {
                    if (!beforeElement) beforeElement = element.cloneNode(false);
                    beforeElement.appendChild(node.cloneNode(true));
                    currentOffset += nodeLength;
                } else if (currentOffset >= offset) {
                    if (!afterElement) afterElement = element.cloneNode(false);
                    afterElement.appendChild(node.cloneNode(true));
                } else {
                    const splitPoint = offset - currentOffset;
                    
                    if (splitPoint > 0) {
                        if (!beforeElement) beforeElement = element.cloneNode(false);
                        beforeElement.appendChild(this.createTextNode(node.textContent.substring(0, splitPoint)));
                    }
                    
                    if (splitPoint < nodeLength) {
                        if (!afterElement) afterElement = element.cloneNode(false);
                        afterElement.appendChild(this.createTextNode(node.textContent.substring(splitPoint)));
                    }
                    
                    currentOffset = offset;
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const nodeTextLength = this.getTextLength(node);
                
                if (currentOffset + nodeTextLength <= offset) {
                    if (!beforeElement) beforeElement = element.cloneNode(false);
                    beforeElement.appendChild(node.cloneNode(true));
                    currentOffset += nodeTextLength;
                } else if (currentOffset >= offset) {
                    if (!afterElement) afterElement = element.cloneNode(false);
                    afterElement.appendChild(node.cloneNode(true));
                } else {
                    const nestedSplit = this._splitInlineElement(node, offset - currentOffset);
                    
                    if (nestedSplit.beforeElement) {
                        if (!beforeElement) beforeElement = element.cloneNode(false);
                        beforeElement.appendChild(nestedSplit.beforeElement);
                    }
                    
                    if (nestedSplit.afterElement) {
                        if (!afterElement) afterElement = element.cloneNode(false);
                        afterElement.appendChild(nestedSplit.afterElement);
                    }
                    
                    currentOffset = offset;
                }
            }
        }
        
        return { beforeElement, afterElement };
    }
}

// Export as global and ES module
window.DOMOperations = DOMOperations;
export default DOMOperations;