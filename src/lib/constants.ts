/**
 * Application-wide named constants.
 *
 * Centralises values that would otherwise appear as unexplained numbers
 * in component code. Importing from here makes intent self-documenting.
 */

/** Minimum percentage width of the left pane in the resizable SplitPane. */
export const SPLIT_MIN_PCT = 20

/** Maximum percentage width of the left pane in the resizable SplitPane. */
export const SPLIT_MAX_PCT = 80

/** Default starting split position (left pane percentage). */
export const SPLIT_DEFAULT_PCT = 60

/**
 * Character count beyond which the project description "Show more" toggle
 * appears. If the description exceeds this length, the user needs to expand
 * it to read the full text.
 */
export const DESC_EXPAND_CHAR_THRESHOLD = 200

/**
 * Line count beyond which the project description "Show more" toggle appears.
 * Descriptions with more newlines than this are considered long-form.
 */
export const DESC_EXPAND_LINE_THRESHOLD = 3

/** Debounce delay (ms) applied to the full-text search input. */
export const SEARCH_DEBOUNCE_MS = 200
