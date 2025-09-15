import {
    getColumnsFilterElement,
    extractTaskIdFromRow,
    extractTaskIdFromElement,
    getProjectId,
    getJwtToken
} from '../utils/dom';
import { fetchTaskById, fetchTasks, updateSingleTask } from '../api/tasks';
import { clearCachedTaskData } from '../utils/cache';

/** State holding currently dragged rows during drag/drop */
let currentlyDraggedRows: HTMLTableRowElement[] = [];

// Row selection with click, shift, ctrl/meta keys
document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const clickedRow = target.closest('tr');
    const tbody = clickedRow?.closest('tbody');
    const filterContainer = document.querySelector('.columns-filter');
    if (!clickedRow || !tbody || !filterContainer) {
        return;
    }

    const allRows = Array.from(tbody.querySelectorAll('tr'));

    // Ignore clicks within selected bulk-edit controls
    if (target.closest('.bulk-edit')?.closest('.bulk-selected')) {
        return;
    }

    if (!target.closest('.bulk-edit')) {
        event.preventDefault();
    }

    const lastClickedRow = tbody.querySelector<HTMLTableRowElement>('tr.last-clicked');

    if (event.shiftKey && lastClickedRow) {
        allRows.forEach((row) => row.classList.remove('bulk-selected'));
        const start = allRows.indexOf(lastClickedRow);
        const end = allRows.indexOf(clickedRow);
        const [from, to] = [start, end].sort((a, b) => a - b);
        for (let i = from; i <= to; i++) {
            allRows[i].classList.add('bulk-selected');
        }
    } else if (event.ctrlKey || event.metaKey) {
        clickedRow.classList.toggle('bulk-selected');
    } else {
        allRows.forEach((row) => row.classList.remove('bulk-selected'));
        clickedRow.classList.add('bulk-selected');
    }

    allRows.forEach((row) => row.classList.remove('last-clicked'));
    clickedRow.classList.add('last-clicked');
});

// Drag start sets current dragged rows if dragged row is bulk-selected
document.addEventListener('dragstart', (event: DragEvent) => {
    if (!getColumnsFilterElement() || !(event.target instanceof HTMLTableRowElement)) {
        return;
    }
    const draggedRow = event.target.closest('tr') as HTMLTableRowElement | null;
    const tbody = draggedRow?.closest('tbody');
    if (!draggedRow || !tbody || !draggedRow.classList.contains('bulk-selected')) {
        event.preventDefault();
        return;
    }

    currentlyDraggedRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
    event.dataTransfer!.effectAllowed = 'move';
    event.dataTransfer!.setData('text/plain', 'dragging');
});

// Dragover manages visual cues and allows dropping on rows, projects, or table boundary
document.addEventListener('dragover', (event) => {
    if (!getColumnsFilterElement() || !currentlyDraggedRows) {
        return;
    }

    const target = event.target as HTMLElement;
    const table = target.closest<HTMLTableElement>('table');
    const targetRow = target.closest<HTMLTableRowElement>('tbody tr');
    const projectMenu = target.closest<HTMLAnchorElement>('a.base-button.list-menu-link[href^="/projects/"]');

    if (targetRow && !targetRow.classList.contains('bulk-selected')) {
        event.preventDefault();
        event.dataTransfer!.dropEffect = 'move';
        targetRow.classList.add('drag-over');
    } else if (projectMenu) {
        const pmProjectId = parseInt(projectMenu.href.split('/').pop() ?? '0');
        if (pmProjectId > 0 && pmProjectId !== getProjectId()) {
            projectMenu.classList.add('drag-over');
            event.preventDefault();
            event.dataTransfer!.dropEffect = 'move';
        }
    } else if (!targetRow) {
        const realTable = table || (target.querySelector('table') as HTMLElement | null);
        if (realTable) {
            const rect = realTable.getBoundingClientRect();
            const buffer = 20;
            const inExtendedZone =
                event.clientX >= rect.left - buffer &&
                event.clientX <= rect.right + buffer &&
                event.clientY >= rect.top - buffer &&
                event.clientY <= rect.bottom + buffer;

            if (inExtendedZone) {
                realTable.classList.add('drag-over');
                event.preventDefault();
                event.dataTransfer!.dropEffect = 'move';
            }
        }
    }
});

// Remove drag-over classes on dragend and dragleave
document.addEventListener('dragend', () => {
    if (!currentlyDraggedRows) {
        return;
    }
    document.querySelector('.drag-over')?.classList.remove('drag-over');
});
document.addEventListener('dragleave', () => {
    if (!currentlyDraggedRows) {
        return;
    }
    document.querySelector('.drag-over')?.classList.remove('drag-over');
});

async function removeParentTaskRelation(draggedTaskId: number, oldParentId: number): Promise<void> {
    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: 'DELETE',
            url: `/api/v1/tasks/${draggedTaskId}/relations/parenttask/${oldParentId}`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getJwtToken()}`
            },
            onload: () => resolve()
        });
    });
}

async function addParentTaskRelation(draggedTaskId: number, newParentId: number): Promise<void> {
    return new Promise((resolve) => {
        GM_xmlhttpRequest({
            method: 'PUT',
            url: `/api/v1/tasks/${draggedTaskId}/relations`,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getJwtToken()}`
            },
            data: JSON.stringify({
                relation_kind: 'parenttask',
                other_task_id: newParentId
            }),
            onload: () => resolve()
        });
    });
}

async function moveTaskToProject(taskId: number, projectId: number): Promise<void> {
    await updateSingleTask(taskId, { project_id: projectId });
}

// Drop event handler updates parent relations, or moves project, or detaches parents.
document.addEventListener('drop', async (event) => {
    if (!getColumnsFilterElement() || !currentlyDraggedRows) {
        return;
    }

    const draggedTaskIds = currentlyDraggedRows.map(extractTaskIdFromElement);
    let topLevelDraggedIds = [...draggedTaskIds];

    // Filter only top-level dragged tasks (exclude descendants)
    for (const id of draggedTaskIds) {
        const parentIds = await getAllParentTaskIds(id);
        if (topLevelDraggedIds.some((otherId) => parentIds.includes(otherId))) {
            topLevelDraggedIds = topLevelDraggedIds.filter((i) => i !== id);
        }
    }

    const target = event.target as HTMLElement;
    const targetRow = target.closest<HTMLTableRowElement>('tbody tr');
    let table = target.closest<HTMLTableElement>('table');
    const projectMenu = target.closest<HTMLAnchorElement>('a.base-button.list-menu-link[href^="/projects/"]');

    if (!table) {
        const realTable = target.querySelector<HTMLTableElement>('table');
        if (realTable) {
            const rect = realTable.getBoundingClientRect();
            const buffer = 20;
            const inExtendedZone =
                event.clientX >= rect.left - buffer &&
                event.clientX <= rect.right + buffer &&
                event.clientY >= rect.top - buffer &&
                event.clientY <= rect.bottom + buffer;

            if (inExtendedZone) {
                table = realTable;
            }
        }
    }

    if (targetRow) {
        const targetTaskId = extractTaskIdFromElement(targetRow);

        await Promise.all(
            topLevelDraggedIds.map(async (draggedId) => {
                const draggedTask = await fetchTaskById(draggedId);
                if (!draggedTask || !targetTaskId) {
                    return;
                }

                const oldParentId = draggedTask.related_tasks.parenttask?.[0]?.id;
                if (oldParentId) {
                    await removeParentTaskRelation(draggedId, oldParentId);
                }
                await addParentTaskRelation(draggedId, targetTaskId);
            })
        );

        clearCachedTaskData();
        await fetchTasks(getAllTaskIds());
        await reorderTaskRows(document.querySelectorAll('tbody tr'));
    } else if (table) {
        await Promise.all(
            topLevelDraggedIds.map(async (id) => {
                const task = await fetchTaskById(id);
                if (!task) {
                    return;
                }
                const oldParentId = task.related_tasks.parenttask?.[0]?.id;
                if (oldParentId) {
                    await removeParentTaskRelation(id, oldParentId);
                }
            })
        );

        clearCachedTaskData();
        await fetchTasks(getAllTaskIds());
        await reorderTaskRows(document.querySelectorAll('tbody tr'));
    } else if (projectMenu) {
        const newProjectId = parseInt(projectMenu.href.split('/').pop() ?? '0');
        await Promise.all(draggedTaskIds.map((id) => moveTaskToProject(id, newProjectId)));

        currentlyDraggedRows.forEach((row) => row.remove());
        clearCachedTaskData();

        await fetchTasks(getAllTaskIds());
        await reorderTaskRows(document.querySelectorAll('tbody tr'));
    }
});

export async function reorderTaskRows(rows: NodeListOf<HTMLTableRowElement>): Promise<void> {
    const data = await Promise.all(
        [...rows].map(async (row) => {
            const task = await fetchTaskById(extractTaskIdFromRow(row));
            const level = await getTaskHierarchyLevel(task.id);
            return { row, level };
        })
    );

    data.reverse().sort((a, b) => a.level - b.level);

    for (const { row, level } of data) {
        if (level !== 0) {
            const task = await fetchTaskById(extractTaskIdFromRow(row));
            const parentId = task.related_tasks.parenttask![0].id;
            const parentRow = [...rows].find((r) => extractTaskIdFromRow(r) === parentId);
            if (parentRow) {
                parentRow.insertAdjacentElement('afterend', row);
            }
        }
        row.style.setProperty('--level', level.toString());
    }
}

async function getTaskHierarchyLevel(taskId: number): Promise<number> {
    let indentLevel = 0;
    let currentId = taskId;

    const baseTask = await fetchTaskById(currentId);
    if (!baseTask) {
        return indentLevel;
    }

    while (true) {
        const task = await fetchTaskById(currentId);
        if (
            !task.related_tasks.parenttask?.length ||
            task.related_tasks.parenttask[0].project_id !== baseTask.project_id
        ) {
            break;
        }
        currentId = task.related_tasks.parenttask[0].id;
        indentLevel++;
    }
    return indentLevel;
}

async function getAllParentTaskIds(taskId: number): Promise<number[]> {
    let currentId = taskId;
    const parentIds: number[] = [];

    while (true) {
        const task = await fetchTaskById(currentId);
        if (!task.related_tasks?.parenttask?.length) {
            break;
        }

        const parentId = task.related_tasks.parenttask[0].id;
        parentIds.push(parentId);
        currentId = parentId;
    }
    return parentIds;
}

function getAllTaskIds(): number[] {
    const links = document.querySelectorAll<HTMLAnchorElement>('tbody tr a');
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
}
export function initializeRowSelectionMutationObserver(): void {
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') {
                continue;
            }
            const element = mutation.target;
            if (!(element instanceof HTMLTableRowElement)) {
                continue;
            }

            handleRowSelectionClassChange(element, mutation.oldValue);
        }
    });

    observer.observe(document.body, {
        subtree: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['class']
    });
}

function handleRowSelectionClassChange(row: HTMLTableRowElement, oldClassValue: string | null | undefined): void {
    const isCurrentlySelected = row.classList.contains('bulk-selected');
    const wasPreviouslySelected = oldClassValue?.includes('bulk-selected') ?? false;

    if (isCurrentlySelected !== wasPreviouslySelected) {
        if (isCurrentlySelected) {
            row.setAttribute('draggable', 'true');
        } else {
            row.removeAttribute('draggable');
        }
    }
}
