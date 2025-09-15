/**
 * Extracts the project ID from current page URL pathname.
 */
export function getProjectId(): number {
    const parts = window.location.pathname.split('/');
    return +parts[2];
}

/**
 * Gets the JWT token from localStorage.
 */
export function getJwtToken(): string | null {
    return localStorage.getItem('token');
}

/** Logs prefixed console messages. */
export function log(...args: unknown[]): void {
    console.log('%c[Vikunja-Enhanced-Task-Table]', 'color: #ebd927', ...args);
}

/**
 * Returns the position of a column index in the list of visible columns.
 * If not visible, returns -1.
 * @param columnIndex The constant for the column
 */
export function getVisibleColumnPosition(columnIndex: number): number {
    return getVisibleColumnIndices().indexOf(columnIndex);
}

/**
 * Gets indices of visible checked columns in the columns filter UI.
 */
export function getVisibleColumnIndices(): number[] {
    const checkedIndices: number[] = [];
    document.querySelectorAll<HTMLInputElement>('.columns-filter input').forEach((input, index) => {
        if (input.checked) {
            checkedIndices.push(index);
        }
    });
    return checkedIndices;
}

/**
 * Gets the columns filter container element from DOM.
 */
export function getColumnsFilterElement(): HTMLDivElement | null {
    return document.querySelector('.columns-filter');
}

/**
 * Extracts the task ID number from a table row element.
 */
export function extractTaskIdFromRow(row: HTMLTableRowElement | null): number {
    if (!row) {
        return 0;
    }
    const link = row.querySelector<HTMLAnchorElement>('a');
    if (!link) {
        return 0;
    }
    const idStr = link.href.split('/').pop();
    return idStr ? Number(idStr) : 0;
}

/**
 * Extracts task ID from element inside a table row.
 */
export function extractTaskIdFromElement(element: HTMLElement): number {
    const row = element.closest('tr');
    return extractTaskIdFromRow(row);
}

/** Retrieves the text label of column "Done" */
export function getDoneColumnLabelText(): string {
    return document.querySelectorAll<HTMLSpanElement>('.columns-filter span')[1]?.textContent ?? '';
}

/**
 * Focus contenteditable element placing cursor at the end.
 */
export function focusContentEditableAtEnd(element: HTMLElement): void {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);

    const sel = window.getSelection();
    if (!sel) {
        return;
    }
    sel.removeAllRanges();
    sel.addRange(range);
    element.focus();
}
