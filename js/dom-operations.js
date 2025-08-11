/**
 * DOM Operations - Handles low-level DOM manipulation while preserving inline formatting
 * and maintaining compatibility with the mutation/history system.
 * 
 * This class encapsulates node creation caching and provides DRY wrappers for common DOM operations.
 * The caching mechanism is internal - users just call methods and get properly cached/reusable nodes.
 */
class DOMOperations {
    /**
     * Create a cached node that can be reused across apply/revert cycles
     * @param {string} cacheKey - Unique key for this cached node
     * @param {Function} createFn - Function to create the node if not cached
     * @param {Object} cache - Cache object (mutation.domCache)
     * @returns {Node} The cached or newly created node
     */
    static getCachedNode(cacheKey, createFn, cache) {
        if (!cache._nodes) cache._nodes = new Map();
        
        if (!cache._nodes.has(cacheKey)) {
            cache._nodes.set(cacheKey, createFn());
        }
        
        return cache._nodes.get(cacheKey).cloneNode(true);
    }
    
    /**
     * Get cached nodes (preserving node identity across operations)
     * @param {string} cacheKey - Unique key for this cached node array
     * @param {Function} createFn - Function to create the fragment if not cached (returns DocumentFragment)
     * @param {Object} cache - Cache object (mutation.domCache)
     * @param {boolean} debugReplay - Debug flag to track replay operations (not used in logic)
     * @returns {Array<Node>} Array of DOM nodes with preserved identity
     */
    static getCachedNodes(cacheKey, createFn, cache, debugReplay = false) {
        if (!cache._nodeArrays) cache._nodeArrays = new Map();
        
        if (!cache._nodeArrays.has(cacheKey)) {
            const fragment = createFn();
            // Extract and store the actual nodes (fragment will become empty)
            const nodeArray = Array.from(fragment.childNodes);
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
     * @param {boolean} debugReplay - Debug flag (not used in logic)
     */
    static populateBlock(block, cacheKey, createContentFn, cache, debugReplay = false) {
        this.clearBlock(block);
        const nodes = this.getCachedNodes(cacheKey, createContentFn, cache, debugReplay);
        
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
            const fragment = document.createDocumentFragment();
            Array.from(block.childNodes).forEach(node => {
                fragment.appendChild(node.cloneNode(true));
            });
            return fragment;
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
            const fragment = document.createDocumentFragment();
            const { beforeNodes } = this._calculateSplitContent(block, offset);
            beforeNodes.forEach(node => fragment.appendChild(node));
            return fragment;
        };
        
        const createAfterFn = () => {
            const fragment = document.createDocumentFragment();
            const { afterNodes } = this._calculateSplitContent(block, offset);
            afterNodes.forEach(node => fragment.appendChild(node));
            return fragment;
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
     * @param {boolean} isReplay - True if this is a replay/redo operation
     */
    static applySplitToFirstBlock(block, cache, isReplay = false) {
        this.populateBlock(block, 'beforeSplit', () => document.createDocumentFragment(), cache, isReplay);
    }
    
    /**
     * Populate new block with after-split content
     * @param {Element} newBlock - New block to populate
     * @param {Object} cache - Cache object
     * @param {boolean} isReplay - True if this is a replay/redo operation
     */
    static populateAfterSplitBlock(newBlock, cache, isReplay = false) {
        this.populateBlock(newBlock, 'afterSplit', () => document.createDocumentFragment(), cache, isReplay);
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
            const fragment = document.createDocumentFragment();
            
            // Add first block content
            Array.from(firstBlock.childNodes).forEach(node => {
                fragment.appendChild(node.cloneNode(true));
            });
            
            // Add second block content
            Array.from(secondBlock.childNodes).forEach(node => {
                fragment.appendChild(node.cloneNode(true));
            });
            
            return fragment;
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
     * @param {boolean} isReplay - True if this is a replay/redo operation
     */
    static applyMergeBlocks(firstBlock, cache, isReplay = false) {
        this.populateBlock(firstBlock, 'merged', () => document.createDocumentFragment(), cache, isReplay);
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
            const fragment = document.createDocumentFragment();
            const { remainingNodes } = this._calculateExtractContent(block, startOffset, endOffset);
            remainingNodes.forEach(node => fragment.appendChild(node));
            return fragment;
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
     * @param {boolean} isReplay - True if this is a replay/redo operation
     */
    static applyExtractContent(block, cache, isReplay = false) {
        this.populateBlock(block, 'remaining', () => document.createDocumentFragment(), cache, isReplay);
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
            block.appendChild(document.createElement('br'));
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
                        beforeNodes.push(document.createTextNode(node.textContent.substring(0, splitPoint)));
                    }
                    
                    if (splitPoint < nodeLength) {
                        afterNodes.push(document.createTextNode(node.textContent.substring(splitPoint)));
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
        
        const tempBlock = document.createElement('div');
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
                        beforeElement.appendChild(document.createTextNode(node.textContent.substring(0, splitPoint)));
                    }
                    
                    if (splitPoint < nodeLength) {
                        if (!afterElement) afterElement = element.cloneNode(false);
                        afterElement.appendChild(document.createTextNode(node.textContent.substring(splitPoint)));
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

// Export as global
window.DOMOperations = DOMOperations;