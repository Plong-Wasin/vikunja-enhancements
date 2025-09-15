import { getVisibleColumnPosition, extractTaskIdFromRow, getDoneColumnLabelText } from '../utils/dom';
import { COLUMN_DONE } from '../constants/columns';
import { fetchTaskById, updateSingleTask } from '../api/tasks';
import { taskCache } from '../utils/cache';

/**
 * Entry point to add done checkboxes with labels in the Done column.
 */
export function addDoneCheckboxFeature(): void {
    const visibleDonePos = getVisibleColumnPosition(COLUMN_DONE);
    if (visibleDonePos === -1) {
        return;
    }

    const doneCells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleDonePos + 1}):not(.enhanced)`
    );

    doneCells.forEach(setupDoneCell);
}

/**
 * Setup a single "Done" cell with checkbox and label.
 */
function setupDoneCell(cell: HTMLTableCellElement): void {
    cell.classList.add('enhanced');

    const hasPreviousDoneLabel = Boolean(cell.querySelector<HTMLDivElement>('.is-done--small'));
    cell.innerHTML = buildDoneCellContentHtml(hasPreviousDoneLabel);

    const doneLabelDiv = cell.querySelector<HTMLDivElement>('.is-done--small');
    const checkbox = cell.querySelector<HTMLInputElement>('input[type="checkbox"]');

    if (!doneLabelDiv || !checkbox) {
        return;
    }

    updateDoneLabelVisibility(doneLabelDiv, checkbox.checked);
    attachDoneCheckboxEvents(checkbox, cell.closest('tr')!);
}

function buildDoneCellContentHtml(isChecked: boolean): string {
    const labelHtml = `<div class="is-done is-done--small" style="flex: 1; width: 100%;">${getDoneColumnLabelText()}</div>`;
    return `
            <div style="display: flex; align-items: center; gap: 6px;">
                <input class="bulk-edit" type="checkbox" ${isChecked ? 'checked' : ''} />
                ${labelHtml}
            </div>
        `;
}

function attachDoneCheckboxEvents(checkbox: HTMLInputElement, row: HTMLTableRowElement): void {
    checkbox.addEventListener('change', () => {
        const checked = checkbox.checked;
        const tbody = row.closest('tbody');
        if (!tbody) {
            return;
        }

        updateDoneStatusForBulkRows(tbody, checked);
    });
}

async function updateDoneStatusForBulkRows(tbody: HTMLTableSectionElement, done: boolean): Promise<void> {
    const selectedRows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected'));
    const taskIds = selectedRows.map(extractTaskIdFromRow);
    const now = new Date().toISOString();

    for (const taskId of taskIds) {
        const task = await fetchTaskById(taskId);
        if (done && task.done) {
            continue; // Skip if already done and setting to done
        }
        updateSingleTask(taskId, { done, done_at: done ? now : '0001-01-01T00:00:00Z' });
        // Update cache manually
        taskCache[taskId].done = done;
        taskCache[taskId].done_at = done ? now : '0001-01-01T00:00:00Z';
    }

    selectedRows.forEach((row) => {
        const checkbox = row.querySelector<HTMLInputElement>('input[type="checkbox"]');
        const labelDiv = row.querySelector<HTMLDivElement>('.is-done--small');
        if (checkbox && labelDiv) {
            checkbox.checked = done;
            updateDoneLabelVisibility(labelDiv, done);
        }
    });
}

function updateDoneLabelVisibility(label: HTMLDivElement, isChecked: boolean): void {
    label.classList.toggle('hidden', !isChecked);
}
