import { INSERT_ELEMENT, REMOVE_ELEMENT } from './mutation-types.js';
import { CaretTracker } from './caret-tracker.js';
import StateManager from './state-manager.js';
import BlockManager from './block-manager.js';
import HistoryManager from './history-manager.js';
import ContentManager from './content-manager.js';
import DOMOperations from './dom-operations.js';
import Carets from './carets.js';
import BlockText from './block-text.js';

/**
 * Main Editor Application
 * Ties together all the managers and sets up the editor
 */
class Editor {
    constructor(editorElement) {
        this.element = editorElement;

        // Initialize caret tracker shared across managers
        this.caretTracker = new CaretTracker(editorElement);

        // Initialize managers
        this.stateManager = new StateManager();
        this.blockManager = new BlockManager(editorElement, this.stateManager, this.caretTracker);
        this.historyManager = new HistoryManager(this.stateManager, this.caretTracker);
        this.contentManager = new ContentManager(editorElement, this.stateManager, this.caretTracker);

        // Create bottom editing bar
        this.createEditingBar();

        // Set up event listeners
        this.setupEventListeners();

        // Store reference to p4 for demo
        this.p4 = document.getElementById('p4');
    }

    /**
     * Create the bottom editing bar
     */
    createEditingBar() {
        // Create toolbar container
        this.toolbar = DOMOperations.createElement('div');
        this.toolbar.className = 'editor-toolbar';

        // Format buttons group
        const formatGroup = DOMOperations.createElement('div');
        formatGroup.className = 'toolbar-group';

        const formatButtons = [
            { tag: 'H1', label: 'H1' },
            { tag: 'H2', label: 'H2' },
            { tag: 'H3', label: 'H3' },
            { tag: 'P', label: 'P' },
        ];

        formatButtons.forEach(({ tag, label }) => {
            const btn = DOMOperations.createElement('button');
            btn.className = 'toolbar-btn format-btn';
            btn.textContent = label;
            btn.dataset.format = tag;
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => this.formatCurrentBlock(tag));
            formatGroup.appendChild(btn);
        });

        // Action buttons group
        const actionGroup = DOMOperations.createElement('div');
        actionGroup.className = 'toolbar-group';

        const splitBtn = DOMOperations.createElement('button');
        splitBtn.className = 'toolbar-btn action-btn';
        splitBtn.textContent = 'Split';
        splitBtn.addEventListener('mousedown', (e) => e.preventDefault());
        splitBtn.addEventListener('click', () => this.splitCurrentBlock());

        const mergeBtn = DOMOperations.createElement('button');
        mergeBtn.className = 'toolbar-btn action-btn';
        mergeBtn.textContent = 'Merge';
        mergeBtn.addEventListener('mousedown', (e) => e.preventDefault());
        mergeBtn.addEventListener('click', () => this.mergeWithPrevious());

        const deleteSelectionBtn = DOMOperations.createElement('button');
        deleteSelectionBtn.className = 'toolbar-btn action-btn';
        deleteSelectionBtn.textContent = 'Delete';
        deleteSelectionBtn.addEventListener('mousedown', (e) => e.preventDefault());
        deleteSelectionBtn.addEventListener('click', () => this.deleteSelection());

        // actionGroup.appendChild(splitBtn);
        // actionGroup.appendChild(mergeBtn);
        actionGroup.appendChild(deleteSelectionBtn);

        // Add groups to toolbar
        this.toolbar.appendChild(formatGroup);
        this.toolbar.appendChild(actionGroup);

        // Add toolbar to body
        document.body.appendChild(this.toolbar);

        // Store references for later
        this.formatButtons = formatGroup.querySelectorAll('.format-btn');
        this.splitButton = splitBtn;
        this.mergeButton = mergeBtn;
        this.deleteSelectionButton = deleteSelectionBtn;

        // Update toolbar state initially and on selection change
        setTimeout(() => this.updateToolbarState(), 0);
    }

    /**
     * Format current block to specified tag
     */
    formatCurrentBlock(tagName) {
        const { range, block } = this.getNormalizedRangeAndBlock();
        if (!range || !block) return;

        this.blockManager.formatBlock(block, tagName);
        this.updateToolbarState();
    }

    /**
     * Split current block at cursor position
     */
    splitCurrentBlock() {
        const { range, block } = this.getNormalizedRangeAndBlock();
        if (!range || !block || !range.collapsed) return;

        // Get text offset within the block using caret tracker
        try {
            const logicalPos = this.caretTracker.getLogicalPosition(range.startContainer, range.startOffset);
            const textOffset = logicalPos.offset;

            // Split the block at the cursor position (caret handled by mutation)
            const newBlock = this.blockManager.splitBlock(block, textOffset);

            if (newBlock) {
                this.updateToolbarState();
            }
        } catch (error) {
            console.warn('Failed to split block:', error);
        }
    }

    /**
     * Merge current block with previous block
     */
    mergeWithPrevious() {
        const { range, block } = this.getNormalizedRangeAndBlock();
        if (!range || !block) return;

        const previousBlock = block.previousElementSibling;
        if (!previousBlock) return;

        // Perform the merge - caret positioning is handled by the mutation
        const success = this.blockManager.mergeWithPrevious(block);

        if (success) {
            this.updateToolbarState();
        }
    }

    /**
     * Delete current selection (especially useful for cross-block selections)
     */
    deleteSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0 || selection.isCollapsed) return;

        const success = this.contentManager.deleteSelection();
        
        if (success) {
            this.updateToolbarState();
        }
    }

    /**
     * Get normalized range and block for user actions
     * @returns {Object} Object with {range, block} properties (may be undefined)
     */
    getNormalizedRangeAndBlock() {
        let range = Carets.getCurrentRange();
        if (!range) return {};

        let block = this.blockManager.getBlockForNode(range.startContainer);
        if (!block) {
            console.info('Caret at editor:', range.startContainer, range.startOffset);

            range = this.caretTracker.normalizeRange(range);
            Carets.setRange(range);
            block = this.blockManager.getBlockForNode(range.startContainer);
        }

        if (!block) {
            console.warn('Failed to get block:', range.startContainer, range.startOffset);
            return {};
        }

        return { range, block };
    }

    /**
     * Check if current selection spans across multiple blocks
     * @returns {boolean} True if selection spans multiple blocks
     */
    isCrossBlockSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount === 0 || selection.isCollapsed) return false;

        const range = selection.getRangeAt(0);
        
        // Get the blocks containing start and end of selection
        const startBlock = this.blockManager.getBlockForNode(range.startContainer);
        const endBlock = this.blockManager.getBlockForNode(range.endContainer);
        
        // Cross-block if different blocks or if no blocks found (shouldn't happen)
        return startBlock !== endBlock;
    }

    /**
     * Update toolbar state based on current selection
     */
    updateToolbarState() {
        const range = Carets.getCurrentRange();
        if (!range) return;

        const block = this.blockManager.getBlockForNode(range.startContainer);
        if (!block) return;

        // Update format button states
        this.formatButtons.forEach(btn => {
            const format = btn.dataset.format;
            if (block.tagName === format) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Update action button states
        const blocks = this.blockManager.getAllBlocks();
        const blockIndex = blocks.indexOf(block);

        // Disable merge if first block
        this.mergeButton.disabled = blockIndex === 0;

        // Split is always enabled for now
        this.splitButton.disabled = false;

        // Delete selection only enabled for cross-block selections
        this.deleteSelectionButton.disabled = !this.isCrossBlockSelection();
    }

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Keyboard events
        this.element.addEventListener('keydown', this.onKeyDown.bind(this));
        this.element.addEventListener('keypress', this.onKeyPress.bind(this));
        this.element.addEventListener('beforeinput', this.onBeforeInput.bind(this));
        this.element.addEventListener('paste', this.onPaste.bind(this));

        // IME composition events
        this.element.addEventListener('compositionstart', this.onCompositionStart.bind(this));
        this.element.addEventListener('compositionupdate', this.onCompositionUpdate.bind(this));
        this.element.addEventListener('compositionend', this.onCompositionEnd.bind(this));

        // Mouse events
        this.element.addEventListener('mousedown', this.onMouseDown.bind(this));

        // Selection change events for toolbar updates
        this.element.addEventListener('keyup', () => this.updateToolbarState());
        this.element.addEventListener('mouseup', () => this.updateToolbarState());
        document.addEventListener('selectionchange', () => {
            if (Carets.isSelectionInEditor(this.element)) {
                this.updateToolbarState();
            }
        });

        // Button events (demo)
        const btn = document.getElementById('btn');
        if (btn) {
            btn.addEventListener('mousedown', e => e.preventDefault());
            btn.addEventListener('focus', e => e.preventDefault());
            btn.addEventListener('click', this.onButtonClick.bind(this));
        }

        // Initialize IME composition state
        this.historyManager.isComposing = false;
    }

    /**
     * Handle keydown events
     */
    onKeyDown(e) {
        switch (e.key) {
            case 'Enter':
                this.handleEnter(e);
                break;
            case 'Tab':
                this.handleTab(e);
                break;
            case 'Backspace':
                this.handleBackspace(e);
                break;
            case 'Delete':
                this.handleDelete(e);
                break;
        }
    }

    /**
     * Handle keypress events for ordinary character input
     */
    onKeyPress(e) {
        // Skip if IME composition is in progress
        if (e.isComposing) {
            return;
        }

        // Skip if it's a special key (Ctrl, Alt, etc.)
        if (e.ctrlKey || e.altKey || e.metaKey) {
            return;
        }

        // Skip non-printable characters
        const char = e.char || String.fromCharCode(e.charCode);
        if (!char || char.length === 0) {
            return;
        }

        // For cross-block selections, delete first before inserting
        if (!window.getSelection().isCollapsed && this.isCrossBlockSelection()) {
            console.log('onKeyPress', 'deleteSelection');

            // e.preventDefault();
            // this.contentManager.deleteSelection();
            this.contentManager.deleteSelection();
        }

        // Allow default behavior for single character insertion
        // The browser's contenteditable will handle it naturally
    }

    /**
     * Handle Enter key
     */
    handleEnter(e) {
        if (!e.shiftKey) {
            e.preventDefault();

            const { range, block } = this.getNormalizedRangeAndBlock();
            if (!range || !block || !range.collapsed) return;

            try {
                // Get text offset within the block
                const logicalPos = this.caretTracker.getLogicalPosition(range.startContainer, range.startOffset);
                const textOffset = logicalPos.offset;

                // Check if we're at the end of the block for fast path
                const isAtEnd = textOffset >= block.textContent.length;

                if (isAtEnd) {
                    let tag = /^H[1-6]$/.test(block.tagName) ? 'P' : block.tagName;
                    this.blockManager.insertBlockAfter(block, '', tag);
                } else {
                    console.log('split block:', block);
                    // Regular split at cursor position
                    this.blockManager.splitBlock(block, textOffset);
                }
            } catch (error) {
                console.warn('Failed to handle Enter:', error);
            }
        }
    }

    /**
     * Handle Tab key
     */
    handleTab(e) {
        e.preventDefault();
        // TODO: Implement tab handling (indent/outdent)
    }

    /**
     * Handle Backspace key
     */
    handleBackspace(e) {
        const { range, block } = this.getNormalizedRangeAndBlock();
        if (!range) {
            e.preventDefault();
            return;
        }

        // If there's a selection, use our deleteSelection for cross-block or let default behavior handle single-block
        if (!range.collapsed) {
            if (this.isCrossBlockSelection()) {
                e.preventDefault();
                this.contentManager.deleteSelection();
                this.updateToolbarState();
            }
            return;
        }

        if (!block) return;

        // Check if at block start
        if (BlockText.isAtBlockStart(range)) {
            e.preventDefault();

            // If not a paragraph, convert to paragraph
            if (block.tagName !== 'P') {
                this.blockManager.formatBlock(block, 'P');
                return;
            }

            // If it's a paragraph, merge or delete
            const previousBlock = block.previousElementSibling;
            if (previousBlock) {
                const blockText = block.innerText;
                if (blockText === '' || blockText === '\n') {
                    // If current block is empty, just delete it (caret handled by mutation)
                    this.blockManager.deleteBlock(block);
                } else {
                    // Merge with previous block (caret handled by mutation)
                    this.blockManager.mergeWithPrevious(block);
                }
            }
        }
    }

    /**
     * Handle Delete key
     */
    handleDelete(e) {
        const { range, block } = this.getNormalizedRangeAndBlock();
        if (!range) {
            e.preventDefault();
            return;
        }

        // If there's a selection, use our deleteSelection for cross-block or let default behavior handle single-block
        if (!range.collapsed) {
            if (this.isCrossBlockSelection()) {
                e.preventDefault();
                this.contentManager.deleteSelection();
                this.updateToolbarState();
            }
            return;
        }

        if (!block) return;

        // Check if at block end
        if (BlockText.isAtBlockEnd(range)) {
            e.preventDefault();

            const nextBlock = block.nextElementSibling;
            if (nextBlock) {
                const nextBlockText = nextBlock.innerText;
                if (nextBlockText === '' || nextBlockText === '\n') {
                    // If next block is empty, just delete it
                    this.blockManager.deleteBlock(nextBlock);
                } else {
                    // Merge next block into current
                    this.blockManager.mergeBlocks(block, nextBlock);
                }
            }
        }
    }

    /**
     * Handle beforeinput events
     */
    onBeforeInput(e) {
        if (e.isComposing) return;

        const selection = window.getSelection();
        if (!selection.isCollapsed && this.isCrossBlockSelection()) {
            // Only use custom deletion for cross-block selections
            // Let browser handle single-block selections
            this.contentManager.deleteSelection();
            this.updateToolbarState();
        }
    }

    /**
     * Handle IME composition start
     */
    onCompositionStart(e) {
        console.log('onCompositionStart', e.inputType);

        this.historyManager.isComposing = true;

        if (e.inputType === undefined) {
            this.contentManager.deleteSelection();
            // this.updateToolbarState();

            return;
        }

        // For cross-block selections during IME, handle deletion
        if (!window.getSelection().isCollapsed && this.isCrossBlockSelection() && e.inputType !== undefined) {
            // Let the composition complete first, then handle the selection
            // setTimeout(() => {
            // if (!window.getSelection().isCollapsed && this.isCrossBlockSelection()) {
            console.log('onCompositionStart', 'deleteSelection');
            this.contentManager.deleteSelection();
            this.updateToolbarState();
            // }
            // }, 0);
        }
    }

    /**
     * Handle IME composition update
     */
    onCompositionUpdate(e) {
        // IME is still composing, maintain flag
        this.historyManager.isComposing = true;
    }

    /**
     * Handle IME composition end
     */
    onCompositionEnd(e) {
        this.historyManager.onComposingEnd();
    }

    /**
     * Handle paste events
     */
    onPaste(e) {
        e.preventDefault();
        // TODO: Implement paste handling with sanitization
    }

    /**
     * Handle mousedown events
     */
    onMouseDown(e) {
        let el = e.target;
        if (el !== this.element) {
            // Find the block element
            while (el.parentNode !== this.element) {
                el = el.parentNode;
                if (!el || el === document.body) return;
            }

            // Make block contenteditable if needed
            const contenteditable = el.hasAttribute('contenteditable') || this.element.hasAttribute('contenteditable');
            if (!contenteditable) {
                el.setAttribute('contenteditable', '');
            }
        }
    }

    /**
     * Handle button click (demo)
     */
    onButtonClick() {
        // this.selectionManager.saveSelection();
        this.deleteLine();
        // this.selectionManager.restoreSelection();
    }

    /**
     * Demo: Add line
     */
    addLine() {
        if (!this.p4 || this.element.contains(this.p4)) return false;

        return this.stateManager.commit({
            type: INSERT_ELEMENT,
            element: this.p4,
            parent: this.element,
            before: null,
        });
    }

    /**
     * Demo: Delete line
     */
    deleteLine() {
        if (!this.p4 || !this.element.contains(this.p4)) return false;

        return this.stateManager.commit({
            type: REMOVE_ELEMENT,
            element: this.p4,
        });
    }

    /**
     * Execute a command (wrapper for document.execCommand)
     */
    execCommand(command, value = null) {
        if (!document.execCommand(command, false, value)) {
            throw new Error(`Failed to execute command: ${command}`);
        }
    }

    /**
     * Get editor statistics
     */
    getStats() {
        return {
            blocks: this.blockManager.getAllBlocks().length,
            historySize: this.historyManager.getState().stack.length,
            canUndo: this.historyManager.canUndo(),
            canRedo: this.historyManager.canRedo(),
        };
    }

    /**
     * Destroy the editor
     */
    destroy() {
        // Remove event listeners
        this.element.removeEventListener('keydown', this.onKeyDown.bind(this));
        this.element.removeEventListener('beforeinput', this.onBeforeInput.bind(this));
        this.element.removeEventListener('paste', this.onPaste.bind(this));
        this.element.removeEventListener('mousedown', this.onMouseDown.bind(this));

        // Destroy managers
        this.historyManager.destroy();
    }
}

export default Editor;