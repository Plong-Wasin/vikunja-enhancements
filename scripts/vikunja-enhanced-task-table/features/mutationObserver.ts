import { fetchTasks } from '../api/tasks';
import { clearCachedTaskData } from '../utils/cache';
import { addEditableTitleFeature } from './editableTitle';
import { addDoneCheckboxFeature } from './doneCheckbox';
import { addPrioritySelectFeature } from './prioritySelect';
import { addDueDateFeature, addStartDateFeature, addEndDateFeature } from './dateColumns';
import { addProgressEditingFeature } from './progressEditing';
import { addAssigneesSelectionFeature } from './assigneesSelection';
import { addLabelsSelectionFeature } from './labelsSelection';
import { fixTableHorizontalOverflow } from '../styles/main.css';
import { debounce } from '../utils/debounce';
import { updateTaskAddFormVisibility } from './taskAddForm';
import { extractTaskIdFromElement } from '../utils/dom';
import { reorderTaskRows } from './bulkSelectionAndDragDrop';

const observerConfig = { attributes: true, childList: true, subtree: true };

export async function handleDomMutations(observer: MutationObserver): Promise<void> {
    debouncedUpdateTaskAddFormVisibility();

    if (!document.querySelector('table tbody tr td') || !document.querySelector('.columns-filter')) {
        return;
    }
    observer.disconnect();

    if (document.querySelector('table tbody tr td') && !document.querySelector('tr[style*="--level"]')) {
        clearCachedTaskData();
        await fetchTasks(getAllTaskIds());

        const rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr');
        await reorderTaskRows(rows);
    }

    applyAllTableColumnEnhancements();
    fixTableHorizontalOverflow();

    observer.observe(document.body, observerConfig);
}

const debouncedUpdateTaskAddFormVisibility = debounce(() => updateTaskAddFormVisibility(), 300);

function getAllTaskIds(): number[] {
    const links = document.querySelectorAll<HTMLAnchorElement>('tbody tr a');
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
}

function applyAllTableColumnEnhancements(): void {
    addEditableTitleFeature();
    addDoneCheckboxFeature();
    addPrioritySelectFeature();
    addDueDateFeature();
    addStartDateFeature();
    addEndDateFeature();
    addProgressEditingFeature();
    addAssigneesSelectionFeature();
    addLabelsSelectionFeature();
}
