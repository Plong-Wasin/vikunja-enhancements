import { getVisibleColumnPosition, extractTaskIdFromRow } from '../utils/dom';
import { COLUMN_PROGRESS } from '../constants/columns';
import { updateSingleTask } from '../api/tasks';

/**
 * Adds inline editing feature for Progress column.
 */
export function addProgressEditingFeature(): void {
    const visibleProgressPos = getVisibleColumnPosition(COLUMN_PROGRESS);
    if (visibleProgressPos === -1) {
        return;
    }

    const cells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleProgressPos + 1}):not(.enhanced)`
    );

    cells.forEach((cell) => {
        cell.style.cursor = 'pointer';
        cell.classList.add('bulk-edit', 'enhanced');
        setupProgressEditing(cell);
    });
}

/**
 * Setup double-click editing on progress cell.
 */
function setupProgressEditing(cell: HTMLTableCellElement): void {
    cell.addEventListener('dblclick', (event) => {
        if ((event.target as HTMLElement).tagName === 'INPUT') {
            return;
        } // already editing

        const currentValue = parseInt(cell.innerText) || 0;
        const input = createProgressNumberInput(currentValue);
        const percentSymbol = document.createElement('span');
        percentSymbol.innerText = '%';

        cell.innerHTML = '';
        cell.appendChild(input);
        cell.appendChild(percentSymbol);

        input.focus();
        input.select();

        bindProgressInputEvents(input, cell, currentValue);
    });
}

function createProgressNumberInput(initialValue: number): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'number';
    input.value = initialValue.toString();
    input.min = '0';
    input.max = '100';
    input.classList.add('edit-progress');
    return input;
}

function isProgressValueValid(progress: number): boolean {
    return !isNaN(progress) && progress >= 0 && progress <= 100;
}

function updateBulkProgressValues(taskIds: number[], progressPercent: number): void {
    for (const id of taskIds) {
        updateSingleTask(id, { percent_done: progressPercent / 100 });
    }
}

function updateBulkProgressUI(progressPercent: number): void {
    const progressColPos = getVisibleColumnPosition(COLUMN_PROGRESS);
    document.querySelectorAll<HTMLTableRowElement>('tbody tr.bulk-selected').forEach((row) => {
        const progressCell = row.querySelector<HTMLTableCellElement>(`td:nth-child(${progressColPos + 1})`);
        if (progressCell) {
            progressCell.innerText = `${progressPercent}%`;
        }
    });
}

function bindProgressInputEvents(input: HTMLInputElement, cell: HTMLTableCellElement, originalValue: number): void {
    const saveProgress = () => {
        const rawValue = parseInt(input.value);
        const roundedValue = Math.round(rawValue / 10) * 10;

        if (isProgressValueValid(roundedValue)) {
            const selectedTasks = Array.from(
                document.querySelectorAll<HTMLTableRowElement>('tbody tr.bulk-selected')
            ).map(extractTaskIdFromRow);

            updateBulkProgressValues(selectedTasks, roundedValue);
            updateBulkProgressUI(roundedValue);
        } else {
            cell.innerText = `${originalValue}%`;
        }
    };

    input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            saveProgress();
        } else if (event.key === 'Escape') {
            cell.innerText = `${originalValue}%`;
        }
    });

    input.addEventListener('blur', saveProgress);
}
