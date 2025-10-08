export interface MatchedCheckboxes {
    checked: number[];
    unchecked: number[];
}

export interface CheckboxStatistics {
    total: number;
    checked: number;
}

/**
 * Extracts checkbox positions from text, separating checked and unchecked ones.
 */
const getCheckboxesInText = (text: string): MatchedCheckboxes => {
    const regex = /data-checked="(true|false)"/g;
    let match;
    const checkboxes: MatchedCheckboxes = {
        checked: [],
        unchecked: []
    };

    while ((match = regex.exec(text)) !== null) {
        if (match[1] === 'true') {
            checkboxes.checked.push(match.index);
        } else {
            checkboxes.unchecked.push(match.index);
        }
    }

    return checkboxes;
};

/**
 * Calculates checkbox statistics from task description text.
 */
export const getChecklistStatistics = (text: string): CheckboxStatistics => {
    const checkboxes = getCheckboxesInText(text);
    return {
        total: checkboxes.checked.length + checkboxes.unchecked.length,
        checked: checkboxes.checked.length
    };
};

/**
 * Determines if a description contains any checkboxes.
 */
export const hasCheckboxes = (text: string): boolean => {
    return getCheckboxProgress(text) > 0;
};

/**
 * Calculates the completion percentage for checkboxes.
 */
export const getCheckboxProgress = (text: string): number => {
    const stats = getChecklistStatistics(text);
    if (stats.total === 0) {
        return 0;
    }
    return Math.round((stats.checked / stats.total) * 100);
};
