import { getProjectId, getJwtToken, getVisibleColumnPosition } from '../utils/dom';
import type { Task } from '../types';
import { fetchTaskById } from '../api/tasks';
import { taskCache } from '../utils/cache';
import { COLUMN_IDENTIFIER } from '../constants/columns';

/**
 * Creates a new task add form DOM element.
 */
export function createTaskAddFormElement(): HTMLFormElement {
    const form = document.createElement('form');
    form.className = 'task-add list-view__add-task d-print-none';
    form.id = 'taskAddForm';
    form.style.padding = '1rem 1rem';

    const fieldWrapper = document.createElement('div');
    fieldWrapper.className = 'add-task__field field';
    fieldWrapper.style.display = 'flex';
    fieldWrapper.style.justifyContent = 'flex-start';
    fieldWrapper.style.gap = '.75rem';

    const inputWrapper = document.createElement('p');
    inputWrapper.className = 'control task-input-wrapper';
    inputWrapper.style.flexShrink = '0';
    inputWrapper.style.marginBlockEnd = '0';
    inputWrapper.style.position = 'relative';
    inputWrapper.style.flexGrow = '1';

    const input = document.createElement('input');
    input.id = 'task-add-textarea-' + Math.random().toString(36).slice(2, 10);
    input.className = 'add-task-textarea input textarea-empty';
    input.placeholder = 'Add a task...';
    input.style.overflowY = 'hidden';
    input.style.height = '38px';

    inputWrapper.appendChild(input);

    const buttonWrapper = document.createElement('p');
    buttonWrapper.className = 'control';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'base-button base-button--type-button button is-primary add-task-button';
    button.style.setProperty('--button-white-space', 'break-spaces');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'icon is-small';
    iconSpan.textContent = '+';

    const buttonTextWrapper = document.createElement('span');
    const buttonText = document.createElement('span');
    buttonText.className = 'button-text';
    buttonText.textContent = 'Add';

    buttonTextWrapper.appendChild(buttonText);
    button.appendChild(iconSpan);
    button.appendChild(buttonTextWrapper);
    buttonWrapper.appendChild(button);

    fieldWrapper.appendChild(inputWrapper);
    fieldWrapper.appendChild(buttonWrapper);
    form.appendChild(fieldWrapper);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const title = input.value.trim();
        if (title) {
            addNewTask(title);
        }
        input.value = '';
    });

    button.addEventListener('click', () => {
        const title = input.value.trim();
        if (title) {
            addNewTask(title);
            input.value = '';
        }
    });

    return form;
}

/**
 * Sends API request to add a new task, inserts it at top of table.
 */
export function addNewTask(title: string): void {
    GM_xmlhttpRequest({
        method: 'PUT',
        url: `/api/v1/projects/${getProjectId()}/tasks`,
        headers: {
            Authorization: `Bearer ${getJwtToken()}`,
            'Content-Type': 'application/json'
        },
        data: JSON.stringify({ title, project_id: getProjectId() }),
        responseType: 'json',
        onload: async (resp) => {
            const newTask = resp.response as Task;
            taskCache[newTask.id] = await fetchTaskById(newTask.id);

            const columnCount = document.querySelectorAll('thead tr > *').length;
            const newRow = document.createElement('tr');
            newRow.classList.add('new-task-row');

            for (let i = 0; i < columnCount; i++) {
                newRow.appendChild(document.createElement('td'));
            }

            const identifyColPos = getVisibleColumnPosition(COLUMN_IDENTIFIER);
            if (identifyColPos >= 0) {
                const identifyCell = newRow.children[identifyColPos];
                if (identifyCell) {
                    const link = document.createElement('a');
                    link.href = `/tasks/${newTask.id}`;
                    link.textContent = newTask.identifier;
                    identifyCell.appendChild(link);
                    link.addEventListener('click', () => {
                        window.location.href = link.href;
                    });
                }
            }

            const titleColPos = getVisibleColumnPosition(2); // COLUMN_TITLE = 2
            if (titleColPos >= 0) {
                const titleCell = newRow.children[titleColPos];
                if (titleCell) {
                    const link = document.createElement('a');
                    link.href = `/tasks/${newTask.id}`;
                    link.textContent = newTask.title;
                    titleCell.appendChild(link);
                    link.addEventListener('click', () => {
                        window.location.href = link.href;
                    });
                }
            }

            const tbody = document.querySelector('tbody');
            tbody?.insertBefore(newRow, tbody.firstChild);
        }
    });
}

/**
 * Shows or removes the task add form depending on presence of task table.
 */
export function updateTaskAddFormVisibility(): void {
    const formPresent = !!document.querySelector('#taskAddForm');
    const tablePresent = !!document.querySelector('table');
    const projectId = getProjectId();

    if ((!tablePresent && formPresent) || projectId <= 0) {
        document.querySelector('#taskAddForm')?.remove();
    } else if (tablePresent && !formPresent) {
        const form = createTaskAddFormElement();
        const switchViewContainer = document.querySelector<HTMLDivElement>('.switch-view-container');
        switchViewContainer?.insertAdjacentElement('afterend', form);
    }
}
