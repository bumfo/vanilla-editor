import DOMOperations from './dom-operations.js';
import { COMPOSITE_MUTATION } from './mutation-types.js';

/**
 * State Manager - Central hub for all DOM manipulations
 * All editing operations go through this manager to ensure consistency
 * and enable undo/redo functionality
 */
class StateManager {
    constructor() {
        this.handlers = new Map();
        this.commitListeners = [];
        this.beforeCommitListeners = [];
        
        // Register built-in composite mutation handler
        this.registerCompositeHandler();
    }

    /**
     * Register a mutation handler
     * @param {string} type - The type of mutation
     * @param {Object} handler - Handler object with apply and revert methods
     */
    registerHandler(type, handler) {
        if (!handler.apply || !handler.revert) {
            throw new Error('Handler must have apply and revert methods');
        }
        this.handlers.set(type, handler);
    }

    /**
     * Commit a user-initiated mutation (recordable)
     * @param {Object} mutation - The mutation to commit
     * @returns {boolean} - Whether the mutation was committed successfully
     */
    commit(mutation) {
        mutation._isReplay = false;
        return this._executeMutation(mutation, false, true);
    }

    /**
     * Replay a history mutation (not recordable)
     * @param {Object} mutation - The mutation to replay
     * @returns {boolean} - Whether the mutation was replayed successfully
     */
    replay(mutation) {
        mutation._isReplay = true;
        
        // Set replay mode for DOM operations debugging
        if (window.DOMOperations) {
            DOMOperations.setReplayMode(true);
        }
        
        try {
            return this._executeMutation(mutation, false, false);
        } finally {
            // Always clear replay mode regardless of success/failure
            if (window.DOMOperations) {
                DOMOperations.setReplayMode(false);
            }
        }
    }

    /**
     * Revert a mutation (not recordable)
     * @param {Object} mutation - The mutation to revert
     * @returns {boolean} - Whether the mutation was reverted successfully
     */
    revert(mutation) {
        return this._executeMutation(mutation, true, false);
    }

    /**
     * Internal method to execute mutations (apply or revert)
     * @param {Object} mutation - The mutation to execute
     * @param {boolean} isRevert - false for apply, true for revert
     * @param {boolean} notifyHistory - Whether to notify commit listeners
     * @returns {boolean} - Whether the mutation was executed successfully
     */
    _executeMutation(mutation, isRevert, notifyHistory) {
        const handler = this.handlers.get(mutation.type);
        if (!handler) {
            console.error(`No handler registered for mutation type: ${mutation.type}`);
            return false;
        }

        // Notify before commit listeners (only for apply operations)
        if (notifyHistory && !isRevert) {
            for (const listener of this.beforeCommitListeners) {
                listener(mutation);
            }
        }

        try {
            if (isRevert) {
                handler.revert(mutation);
            } else {
                handler.apply(mutation);
            }

            // Notify listeners after successful operation
            if (notifyHistory) {
                const eventType = isRevert ? 'revert' : 'commit';
                for (const listener of this.commitListeners) {
                    listener(mutation, eventType);
                }
            }

            return true;
        } catch (error) {
            const operation = isRevert ? 'reverting' : 'applying';
            console.error(`Error ${operation} mutation:`, error);
            return false;
        }
    }

    /**
     * Add a listener for mutation commits
     * @param {Function} listener - Function to call when mutations are committed
     */
    addCommitListener(listener) {
        this.commitListeners.push(listener);
    }

    /**
     * Remove a listener for mutation commits
     * @param {Function} listener - Function to remove
     */
    removeCommitListener(listener) {
        const index = this.commitListeners.indexOf(listener);
        if (index > -1) {
            this.commitListeners.splice(index, 1);
        }
    }

    /**
     * Add a listener for before mutation commits
     * @param {Function} listener - Function to call before mutations are committed
     */
    addBeforeCommitListener(listener) {
        this.beforeCommitListeners.push(listener);
    }

    /**
     * Remove a before commit listener
     * @param {Function} listener - Function to remove
     */
    removeBeforeCommitListener(listener) {
        const index = this.beforeCommitListeners.indexOf(listener);
        if (index > -1) {
            this.beforeCommitListeners.splice(index, 1);
        }
    }

    /**
     * Register the built-in composite mutation handler
     */
    registerCompositeHandler() {
        this.registerHandler(COMPOSITE_MUTATION, {
            apply: (compositeMutation) => {
                // Apply each sub-mutation in sequence
                for (const subMutation of compositeMutation.mutations) {
                    const success = this.applySilently(subMutation);
                    if (!success) {
                        console.error('Failed to apply sub-mutation in composite:', subMutation);
                        break;
                    }
                }
                
                // Composite mutations handle their own caret positioning
                // The caretStateAfter will be handled by the history manager
            },
            
            revert: (compositeMutation) => {
                // Revert sub-mutations in reverse order
                const mutations = [...compositeMutation.mutations].reverse();
                for (const subMutation of mutations) {
                    const success = this.revert(subMutation);
                    if (!success) {
                        console.error('Failed to revert sub-mutation in composite:', subMutation);
                        break;
                    }
                }
            }
        });
    }

    /**
     * Apply a mutation silently (used by composite handler - no history recording)
     * @param {Object} mutation - The mutation to apply
     * @returns {boolean} - Whether the mutation was applied successfully
     */
    applySilently(mutation) {
        return this._executeMutation(mutation, false, false);
    }
}

export default StateManager;