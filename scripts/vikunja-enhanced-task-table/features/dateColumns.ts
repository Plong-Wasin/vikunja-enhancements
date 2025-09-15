import type { TaskDateField, Task } from '../types';
import { getVisibleColumnPosition, extractTaskIdFromElement } from '../utils/dom';
import { COLUMN_DUE_DATE, COLUMN_START_DATE, COLUMN_END_DATE } from '../constants/columns';
import { fetchTasks, fetchTaskById, updateSingleTask } from '../api/tasks';

/**
 * Converts UTC ISO datetime string to local datetime input string (YYYY-MM-DDTHH:mm).
 */
function formatUtcToLocalDatetimeInput(utcDatetime: string): string {
    const dateObj = new Date(utcDatetime);
    const pad = (num: number) => num.toString().padStart(2, '0');

    const year = dateObj.getFullYear();
    const month = pad(dateObj.getMonth() + 1);
    const day = pad(dateObj.getDate());
    const hours = pad(dateObj.getHours());
    const minutes = pad(dateObj.getMinutes());

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Enhances a date column with datetime-local inputs that support bulk editing.
 */
export async function addDateColumnFeature(
    columnIndex: number,
    inputClassName: string,
    taskDateField: TaskDateField
): Promise<void> {
    const visibleColPos = getVisibleColumnPosition(columnIndex);
    if (visibleColPos === -1) {
        return;
    }

    const cells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleColPos + 1}):not(.enhanced)`
    );

    const tasks = await fetchTasks(getAllTaskIds());

    cells.forEach((cell) => configureDateCell(cell, tasks, inputClassName, taskDateField));
}

/**
 * Setup a date cell input element with event handling.
 */
function configureDateCell(
    cell: HTMLTableCellElement,
    tasks: Task[],
    inputClassName: string,
    taskDateField: TaskDateField
): void {
    cell.classList.add('enhanced');

    const taskId = extractTaskIdFromElement(cell);
    const dateValue = tasks.find((task) => task.id === taskId)?.[taskDateField];

    const input = document.createElement('input');
    input.type = 'datetime-local';
    input.classList.add(inputClassName, 'bulk-edit');

    if (dateValue && dateValue !== '0001-01-01T00:00:00Z') {
        input.value = formatUtcToLocalDatetimeInput(dateValue);
    }

    cell.innerHTML = '';
    cell.appendChild(input);

    input.addEventListener('change', () => updateDateValueForBulkRows(cell, input, inputClassName, taskDateField));
}

/**
 * Updates bulk selected rows date values and calls API updates.
 */
function updateDateValueForBulkRows(
    cell: HTMLTableCellElement,
    input: HTMLInputElement,
    inputClass: string,
    fieldName: TaskDateField
): void {
    const row = cell.closest('tr');
    if (!row) {
        return;
    }

    const newDateISO = new Date(input.value).toISOString();

    const selectedRows = Array.from(document.querySelectorAll<HTMLTableRowElement>('tbody tr.bulk-selected'));
    const taskIds = selectedRows.map((tr) => extractTaskIdFromElement(tr));

    for (const taskId of taskIds) {
        updateSingleTask(taskId, { [fieldName]: newDateISO });
    }

    selectedRows.forEach((row) => {
        const bulkInput = row.querySelector<HTMLInputElement>(`.${inputClass}`);
        if (bulkInput) {
            bulkInput.value = input.value;
        }
    });
}

/**
 * Shortcut functions to add features for due, start, and end dates.
 */
export async function addDueDateFeature() {
    await addDateColumnFeature(COLUMN_DUE_DATE, 'due-date-datetime-local', 'due_date');
}
export async function addStartDateFeature() {
    await addDateColumnFeature(COLUMN_START_DATE, 'start-date-datetime-local', 'start_date');
}
export async function addEndDateFeature() {
    await addDateColumnFeature(COLUMN_END_DATE, 'end-date-datetime-local', 'end_date');
}

function getAllTaskIds(): number[] {
    const links = document.querySelectorAll<HTMLAnchorElement>('tbody tr a');
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
}
