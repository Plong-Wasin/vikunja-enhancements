import { getVisibleColumnPosition, extractTaskIdFromRow, extractTaskIdFromElement } from '../utils/dom';
import { COLUMN_PRIORITY } from '../constants/columns';
import { fetchTasks, updateSingleTask } from '../api/tasks';
import { Task } from '../types';

/**
 * Entry point to enhance priority column with styled dropdown selects.
 */
export async function addPrioritySelectFeature(): Promise<void> {
    const visiblePriorityPos = getVisibleColumnPosition(COLUMN_PRIORITY);
    if (visiblePriorityPos === -1) {
        return;
    }

    const tasks = await fetchTasks(getAllTaskIds());
    const tbody = document.querySelector('tbody');
    const rows = tbody?.querySelectorAll<HTMLTableRowElement>(
        `tr:has(td:nth-child(${visiblePriorityPos + 1}):not(.enhanced))`
    );

    if (!tbody || !rows || rows.length === 0) {
        return;
    }

    rows.forEach((row) => configurePriorityCell(row, tasks, visiblePriorityPos));
}

function getAllTaskIds(): number[] {
    const links = document.querySelectorAll<HTMLAnchorElement>('tbody tr a');
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
}

function configurePriorityCell(row: HTMLTableRowElement, tasks: Task[], colPos: number): void {
    const taskId = extractTaskIdFromRow(row);
    const cell = row.children[colPos] as HTMLTableCellElement;
    if (cell.classList.contains('enhanced')) {
        return;
    }

    cell.classList.add('enhanced');

    const wrapper = document.createElement('div');
    wrapper.classList.add('select');

    const select = buildPrioritySelectElement();

    const currentPriority = tasks.find((task) => task.id === taskId)?.priority ?? 0;
    updatePrioritySelectAppearance(select, currentPriority);

    wrapper.appendChild(select);
    cell.innerHTML = '';
    cell.appendChild(wrapper);

    attachPriorityChangeHandler(select, row);
}

function buildPrioritySelectElement(): HTMLSelectElement {
    const select = document.createElement('select');
    select.classList.add('priority-select', 'bulk-edit');
    select.innerHTML = `
            <option value="0" style="color: var(--info);">Unset</option>
            <option value="1" style="color: var(--info);">Low</option>
            <option value="2" style="color: var(--warning);">Medium</option>
            <option value="3" style="color: var(--danger);">High</option>
            <option value="4" style="color: var(--danger);">Urgent</option>
            <option value="5" style="color: var(--danger);">DO NOW</option>
        `;
    return select;
}

function updatePrioritySelectAppearance(select: HTMLSelectElement, priority: number): void {
    select.value = priority.toString();
    if (select.selectedOptions.length > 0) {
        select.style.color = select.selectedOptions[0].style.color;
    }
}

function attachPriorityChangeHandler(select: HTMLSelectElement, row: HTMLTableRowElement): void {
    select.addEventListener('change', () => {
        const tbody = row.closest('tbody');
        if (!tbody) {
            return;
        }

        const selectedPriority = +select.value;
        updatePriorityForBulkRows(tbody, selectedPriority);
        updatePrioritySelectAppearance(select, selectedPriority);
    });
}

function updatePriorityForBulkRows(tbody: HTMLTableSectionElement, priority: number): void {
    const bulkRows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected'));
    const taskIds = bulkRows.map(extractTaskIdFromRow);

    for (const taskId of taskIds) {
        updateSingleTask(taskId, { priority });
    }

    bulkRows.forEach((row) => {
        const selectElement = row.querySelector<HTMLSelectElement>('.priority-select');
        if (selectElement) {
            updatePrioritySelectAppearance(selectElement, priority);
        }
    });
}
