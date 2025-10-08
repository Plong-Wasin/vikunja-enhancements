import { getVisibleColumnPosition, extractTaskIdFromElement, focusContentEditableAtEnd } from '../utils/dom';
import { COLUMN_TITLE } from '../constants/columns';
import { fetchTaskById, updateSingleTask } from '../api/tasks';
import { hasCheckboxes, getChecklistStatistics } from '../utils/checklistStats';

/**
 * Entry: enhance all title cells for inline edit capability.
 */
export function addEditableTitleFeature(): void {
    const visibleTitlePos = getVisibleColumnPosition(COLUMN_TITLE);
    if (visibleTitlePos === -1) {
        return;
    }

    const titleCells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleTitlePos + 1}):not(.enhanced)`
    );
    titleCells.forEach(setupEditableTitleCell);
}

/**
 * Setup a single task title cell for inline editing.
 */
export async function setupEditableTitleCell(cell: HTMLTableCellElement): Promise<void> {
    cell.style.cursor = 'pointer';
    cell.classList.add('enhanced', 'column-title');

    const titleLink = cell.querySelector<HTMLAnchorElement>('a');
    if (!titleLink) {
        return;
    }

    // Create container div to hold link, editable input, and edit button
    const container = document.createElement('div');
    applyFlexContainerStyle(container);
    cell.appendChild(container);

    // Wrapper for title and icons
    const titleWrapper = document.createElement('span');
    titleWrapper.classList.add('title-wrapper');

    // Title text span separate from icons
    const titleTextSpan = document.createElement('span');
    titleTextSpan.classList.add('title-text');
    titleTextSpan.textContent = titleLink.textContent ?? '';
    titleLink.textContent = '';
    titleLink.appendChild(titleTextSpan);

    titleWrapper.appendChild(titleLink);

    // Fetch the task for attachments and description
    const task = await fetchTaskById(extractTaskIdFromElement(cell));

    // Attachment icon if any
    if (task.attachments) {
        const attachmentIcon = createAttachmentIcon();
        titleWrapper.appendChild(attachmentIcon);
    }

    // Description icon (always show if description exists)
    if (taskHasDescription(task)) {
        const descriptionIcon = createDescriptionIcon();
        titleWrapper.appendChild(descriptionIcon);

        // Add progress indicator after description icon if checkboxes are present
        if (task.description && hasCheckboxes(task.description)) {
            const progressIndicator = createCheckboxProgressIndicator(task.description);
            titleWrapper.appendChild(progressIndicator);
        }
    }

    container.appendChild(titleWrapper);

    // Create editable content span
    const editableContentSpan = createContentEditableSpan();
    container.appendChild(editableContentSpan);

    // Create edit button linked to title link and editable span
    const editButton = createEditButton(titleLink, editableContentSpan);
    container.appendChild(editButton);

    // Event listeners for editing interactions
    container.addEventListener('dblclick', () => activateEditMode(titleLink, editableContentSpan));
    attachEditableSpanEventHandlers(titleLink, editableContentSpan);
}

function createAttachmentIcon(): HTMLSpanElement {
    const fileIcon = document.createElement('span');
    fileIcon.className = 'project-task-icon';
    fileIcon.innerHTML = `
        <svg class="svg-inline--fa fa-paperclip" data-prefix="fas" data-icon="paperclip" role="img" viewBox="0 0 512 512" aria-hidden="true">
            <path fill="currentColor" d="M224.6 12.8c56.2-56.2 147.4-56.2 203.6 0s56.2 147.4 0 203.6l-164 164c-34.4 34.4-90.1 34.4-124.5 0s-34.4-90.1 0-124.5L292.5 103.3c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L185 301.3c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l164-164c31.2-31.2 31.2-81.9 0-113.1s-81.9-31.2-113.1 0l-164 164c-53.1 53.1-53.1 139.2 0 192.3s139.2 53.1 192.3 0L428.3 284.3c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L343.4 459.6c-78.1 78.1-204.7 78.1-282.8 0s-78.1-204.7 0-282.8l164-164z"/>
        </svg>`;
    return fileIcon;
}

function taskHasDescription(task: { description?: string }): boolean {
    if (!task.description) {
        return false;
    }
    return task.description !== '<p></p>';
}

/**
 * Creates a simple description icon.
 */
function createDescriptionIcon(): HTMLSpanElement {
    const descriptionIcon = document.createElement('span');
    descriptionIcon.className = 'project-task-icon is-mirrored-rtl';
    descriptionIcon.innerHTML = `
        <svg class="svg-inline--fa fa-align-left" data-prefix="fas" data-icon="align-left" role="img" viewBox="0 0 448 512" aria-hidden="true">
            <path fill="currentColor" d="M288 64c0 17.7-14.3 32-32 32L32 96C14.3 96 0 81.7 0 64S14.3 32 32 32l224 0c17.7 0 32 14.3 32 32zm0 256c0 17.7-14.3 32-32 32L32 352c-17.7 0-32-14.3-32-32s14.3-32 32-32l224 0c17.7 0 32 14.3 32 32zM0 192c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 224c-17.7 0-32-14.3-32-32zM448 448c0 17.7-14.3 32-32 32L32 480c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z"/>
        </svg>`;
    return descriptionIcon;
}

/**
 * Creates a circular checkbox progress indicator that appears after the description icon.
 */
function createCheckboxProgressIndicator(description: string): HTMLSpanElement {
    const stats = getChecklistStatistics(description);
    const progress = Math.round((stats.checked / stats.total) * 100);

    // Create progress container
    const progressContainer = document.createElement('span');
    progressContainer.className = 'checkbox-progress-indicator';
    progressContainer.title = `${stats.checked} of ${stats.total} tasks completed`;

    // Circular progress indicator
    const progressCircle = document.createElement('span');
    progressCircle.className = 'progress-circle-wrapper';

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    circle.classList.add('progress-svg');
    circle.setAttribute('viewBox', '0 0 36 36');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.classList.add('progress-bg');
    path.setAttribute('d', 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831');

    const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fill.classList.add('progress-fill');
    fill.setAttribute('d', 'M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831');
    fill.setAttribute('stroke-dasharray', `${progress}, 100`);

    circle.appendChild(path);
    circle.appendChild(fill);
    progressCircle.appendChild(circle);

    // Progress text
    const progressText = document.createElement('span');
    progressText.className = 'progress-text';
    progressText.textContent = `${stats.checked}/${stats.total}`;

    progressContainer.appendChild(progressCircle);
    progressContainer.appendChild(progressText);

    return progressContainer;
}

function applyFlexContainerStyle(element: HTMLElement): void {
    element.style.display = 'flex';
    element.style.justifyContent = 'space-between';
    element.style.alignItems = 'center';
}

function createContentEditableSpan(): HTMLSpanElement {
    const span = document.createElement('span');
    span.contentEditable = 'true';
    span.classList.add('hidden', 'editable-span');
    return span;
}

function createEditButton(link: HTMLAnchorElement, editableSpan: HTMLSpanElement): HTMLButtonElement {
    const button = document.createElement('button');
    button.innerHTML = '✎';
    button.className = 'edit-title';
    button.addEventListener('click', () => activateEditMode(link, editableSpan));
    return button;
}

function activateEditMode(link: HTMLAnchorElement, editableSpan: HTMLSpanElement): void {
    editableSpan.textContent = link.textContent ?? '';
    const textWrapper = link.closest('.title-wrapper');
    textWrapper?.classList.add('hidden');
    editableSpan.classList.remove('hidden');
    focusContentEditableAtEnd(editableSpan);
}

function attachEditableSpanEventHandlers(link: HTMLAnchorElement, editableSpan: HTMLSpanElement): void {
    editableSpan.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            editableSpan.blur();
            saveTitleEdit(link, editableSpan);
        } else if (event.key === 'Escape') {
            cancelTitleEdit(link, editableSpan);
        }
    });

    editableSpan.addEventListener('blur', () => saveTitleEdit(link, editableSpan));
}

function saveTitleEdit(link: HTMLAnchorElement, editableSpan: HTMLSpanElement): void {
    const newText = editableSpan.textContent?.trim() ?? '';
    const originalText = link.textContent ?? '';

    if (!newText || newText === originalText) {
        restoreTitleView(link, editableSpan, originalText);
        return;
    }

    const taskId = extractTaskIdFromElement(link);
    if (taskId) {
        updateSingleTask(taskId, { title: newText });
    }

    restoreTitleView(link, editableSpan, newText);
}

function cancelTitleEdit(link: HTMLAnchorElement, editableSpan: HTMLSpanElement): void {
    restoreTitleView(link, editableSpan, link.textContent ?? '');
}

function restoreTitleView(link: HTMLAnchorElement, editableSpan: HTMLSpanElement, text: string): void {
    const textWrapper = link.closest('.title-wrapper');
    link.textContent = text;
    textWrapper?.classList.remove('hidden');
    editableSpan.classList.add('hidden');
}
