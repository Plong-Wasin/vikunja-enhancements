import type { Label } from '../types';
import { getVisibleColumnPosition, extractTaskIdFromElement, getJwtToken } from '../utils/dom';
import { COLUMN_LABELS, COLORS, COLOR_DARK, COLOR_LIGHT } from '../constants/columns';
import { fetchCurrentUser, fetchTaskById } from '../api/tasks';
import { labelSearchCache, taskCache } from '../utils/cache';
import { debounce } from '../utils/debounce';
import { isHexColorLight } from '../utils/colors';

export function addLabelsSelectionFeature(): void {
    const visibleLabelPos = getVisibleColumnPosition(COLUMN_LABELS);
    if (visibleLabelPos === -1) {
        return;
    }

    const labelCells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleLabelPos + 1}):not(.enhanced)`
    );

    labelCells.forEach((cell) => {
        cell.style.cursor = 'pointer';
        cell.classList.add('bulk-edit', 'enhanced');
        attachLabelsMenuTrigger(cell);
    });
    if (labelCells.length) {
        refreshLabelsColumnUI();
    }
}

function attachLabelsMenuTrigger(cell: HTMLTableCellElement): void {
    cell.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('#labelsMenu') || !document.contains(target)) {
            return;
        }

        closeLabelsMenu();
        openLabelsMenuAtCell(cell);
    });
}

function closeLabelsMenu(): void {
    document.querySelector('#labelsMenu')?.remove();
}

function openLabelsMenuAtCell(cell: HTMLTableCellElement): void {
    cell.style.position = 'relative';
    const menu = createLabelsMenuElement();
    cell.appendChild(menu);
    openLabelsMenu(cell, menu);
}

function createLabelsMenuElement(): HTMLDivElement {
    const menu = document.createElement('div');
    menu.id = 'labelsMenu';
    menu.className = 'multiselect';
    menu.tabIndex = -1;
    Object.assign(menu.style, {
        position: 'absolute',
        display: 'none',
        background: 'var(--scheme-main)',
        border: '1px solid #ccc',
        width: '250px',
        zIndex: '10000',
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
        cursor: 'default',
        top: '0',
        left: '0'
    });

    const selectedList = document.createElement('div');
    selectedList.className = 'selected-list';
    selectedList.id = 'labelsSelectedList';
    Object.assign(selectedList.style, {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '6px'
    });

    const control = document.createElement('div');
    control.className = 'control';
    Object.assign(control.style, {
        padding: '5px',
        borderBottom: '1px solid #ccc',
        borderTop: '1px solid #ccc'
    });

    const inputWrapper = document.createElement('div');
    inputWrapper.className = 'input-wrapper';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input';
    input.placeholder = 'Type to assign…';
    Object.assign(input.style, {
        width: '100%',
        border: 'none',
        outline: 'none',
        background: 'transparent'
    });

    inputWrapper.appendChild(input);
    control.appendChild(inputWrapper);

    const searchResults = document.createElement('div');
    searchResults.className = 'search-results';

    menu.appendChild(selectedList);
    menu.appendChild(control);
    menu.appendChild(searchResults);

    return menu;
}

async function openLabelsMenu(cell: HTMLTableCellElement, menu: HTMLDivElement): Promise<void> {
    menu.style.display = 'block';

    const inputField = menu.querySelector<HTMLInputElement>('.input');
    const selectedList = menu.querySelector<HTMLDivElement>('#labelsSelectedList');
    if (!selectedList) {
        return;
    }

    await refreshSelectedLabelsList(cell, selectedList);
    setupLabelsSearchInputWithKeyboardNavigation(inputField, menu);
    setupLabelsMenuOutsideClickListener(cell, menu);
}

function setupLabelsMenuOutsideClickListener(cell: HTMLTableCellElement, menu: HTMLDivElement): void {
    const outsideClickHandler = (event: MouseEvent) => {
        if (!cell.contains(event.target as Node) && document.contains(event.target as Node)) {
            menu.remove();
            document.removeEventListener('click', outsideClickHandler);
            refreshLabelsColumnUI();
        }
    };
    document.addEventListener('click', outsideClickHandler);
}

/**
 * Setup label search input with keyboard navigation support similar to assignees.
 */
function setupLabelsSearchInputWithKeyboardNavigation(input: HTMLInputElement | null, menu: HTMLDivElement): void {
    if (!input) {
        return;
    }

    input.focus();

    // Navigation state for active highlighted result
    let activeIndex = -1;

    const debouncedSearch = debounce(() => {
        handleLabelSearch(input, menu).then(() => {
            activeIndex = -1; // reset highlight after search results update
        });
    }, 300);

    input.addEventListener('input', () => {
        debouncedSearch();
        activeIndex = -1;
    });

    // Initial search
    handleLabelSearch(input, menu);

    input.addEventListener('keydown', (event: KeyboardEvent) => {
        const buttons = getVisibleSearchResultButtons(menu);

        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
            event.stopPropagation();
            event.preventDefault();
        }

        if (event.key === 'ArrowDown') {
            if (buttons.length === 0) {
                return;
            }
            activeIndex = getNextIndex(activeIndex, buttons.length, 1);
            highlightResult(menu, activeIndex);
        } else if (event.key === 'ArrowUp') {
            if (buttons.length === 0) {
                return;
            }
            activeIndex = getNextIndex(activeIndex, buttons.length, -1);
            highlightResult(menu, activeIndex);
        } else if (event.key === 'Enter') {
            if (activeIndex >= 0 && activeIndex < buttons.length) {
                // Click the highlighted label button
                buttons[activeIndex].click();
            }
        } else if (event.key === 'Escape') {
            closeLabelsMenu();
        }
    });
}

/**
 * Helper: get visible search result buttons (excluding hidden ones).
 */
function getVisibleSearchResultButtons(menu: HTMLDivElement): HTMLButtonElement[] {
    // Search results container holds buttons
    const allButtons = Array.from(menu.querySelectorAll<HTMLButtonElement>('.search-results button'));
    // Only visible buttons (offsetParent != null means visible)
    return allButtons.filter((btn) => btn.offsetParent !== null);
}

/**
 * Helper: calculate next index for circular navigation.
 */
function getNextIndex(current: number, total: number, offset: number): number {
    if (total === 0) {
        return -1;
    }
    if (current === -1) {
        return offset > 0 ? 0 : total - 1;
    }
    const next = current + offset;
    if (next < 0) {
        return total - 1;
    }
    if (next >= total) {
        return 0;
    }
    return next;
}

/**
 * Highlight the currently active search result button visually.
 */
function highlightResult(menu: HTMLDivElement, index: number) {
    const buttons = getVisibleSearchResultButtons(menu);
    buttons.forEach((btn, idx) => {
        if (idx === index) {
            btn.classList.add('active', 'highlighted');
            btn.style.backgroundColor = 'var(--table-row-hover-background-color)';
        } else {
            btn.classList.remove('active', 'highlighted');
            btn.style.backgroundColor = '';
        }
    });
}

export async function refreshLabelsColumnUI(): Promise<void> {
    const visibleLabelPos = getVisibleColumnPosition(COLUMN_LABELS);
    if (visibleLabelPos === -1) {
        return;
    }

    const labelCells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleLabelPos + 1}):not(:has(#labelsMenu))`
    );

    for (const cell of labelCells) {
        cell.innerHTML = '';
        const task = await fetchTaskById(extractTaskIdFromElement(cell));
        if (!task.labels) {
            continue;
        }

        const wrapper = document.createElement('div');
        wrapper.className = 'label-wrapper';

        const sortedLabels = await sortLabelsAlphabetically(task.labels);

        for (const label of sortedLabels) {
            const labelTag = document.createElement('span');
            labelTag.className = 'tag';
            labelTag.style.backgroundColor = '#' + label.hex_color;
            labelTag.style.color = isHexColorLight(label.hex_color) ? COLOR_DARK : COLOR_LIGHT;

            const textSpan = document.createElement('span');
            textSpan.textContent = label.title;

            labelTag.appendChild(textSpan);
            wrapper.appendChild(labelTag);
        }
        cell.appendChild(wrapper);
    }
}

async function handleLabelSearch(input: HTMLInputElement, menu: HTMLDivElement): Promise<void> {
    const query = input.value.trim();
    const resultsContainer = menu.querySelector<HTMLDivElement>('.search-results');
    if (!resultsContainer) {
        return;
    }

    const cacheKey = query;
    if (labelSearchCache.has(cacheKey)) {
        await renderLabelSearchResults(resultsContainer, labelSearchCache.get(cacheKey)!);
        insertCreateLabelButtonIfNeeded(resultsContainer, query);
        return;
    }

    GM_xmlhttpRequest({
        url: `/api/v1/labels?s=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${getJwtToken()}` },
        responseType: 'json',
        onload: async (response) => {
            const labels: Label[] = response.response || [];
            labelSearchCache.set(cacheKey, labels);
            await renderLabelSearchResults(resultsContainer, labels);
            insertCreateLabelButtonIfNeeded(resultsContainer, query);
        }
    });
}

function insertCreateLabelButtonIfNeeded(container: HTMLDivElement, labelText: string) {
    const labelExists = Array.from(labelSearchCache.values()).some((labels) =>
        labels.some((l) => l.title.trim() === labelText)
    );
    if (!labelExists && labelText) {
        const button = document.createElement('button');
        button.type = 'button';
        Object.assign(button.style, {
            width: '100%',
            border: 'none',
            padding: '6px',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        });

        button.innerHTML = `
            <span>
                <span class="tag search-result">
                    <span>${labelText}</span>
                </span>
            </span>
            <span class="hint-text" style="font-size:12px; color:#888;">Click to create</span>
        `;

        button.addEventListener('click', () => {
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const tag = button.querySelector<HTMLSpanElement>('.tag');
            if (tag) {
                tag.style.backgroundColor = color;
                tag.style.color = isHexColorLight(color.replace('#', '')) ? COLOR_DARK : COLOR_LIGHT;
            }
            const hint = button.querySelector<HTMLSpanElement>('.hint-text');
            if (hint) {
                hint.textContent = 'Click to add';
            }
            button.style.display = 'none';
            GM_xmlhttpRequest({
                url: `/api/v1/labels`,
                method: 'PUT',
                headers: { Authorization: `Bearer ${getJwtToken()}`, 'Content-Type': 'application/json' },
                responseType: 'json',
                data: JSON.stringify({
                    title: labelText,
                    hex_color: color.replace('#', '')
                }),
                onload: async (r) => {
                    const label: Label = r.response;
                    button.dataset.labelId = label.id.toString();
                    const bulkRows = document.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected');

                    for (const row of bulkRows) {
                        const taskId = extractTaskIdFromElement(row);

                        taskCache[taskId].labels ??= [];

                        GM_xmlhttpRequest({
                            method: 'PUT',
                            url: `/api/v1/tasks/${taskId}/labels`,
                            headers: {
                                Authorization: `Bearer ${getJwtToken()}`,
                                'Content-Type': 'application/json'
                            },
                            data: JSON.stringify({ label_id: label.id }),
                            onload: () => {
                                if (!taskCache[taskId].labels!.some((l) => l.id === label.id)) {
                                    taskCache[taskId].labels!.push(label);
                                }
                                labelSearchCache.clear();
                                refreshLabelsUI();
                            }
                        });
                    }
                    labelSearchCache.clear();
                }
            });
        });
        container.appendChild(button);
    }
}

async function renderLabelSearchResults(container: HTMLDivElement, labels: Label[]): Promise<void> {
    container.innerHTML = '';
    const sortedLabels = await sortLabelsAlphabetically(labels);

    for (const label of sortedLabels) {
        container.appendChild(createLabelSearchButton(label));
    }

    refreshLabelsUI();
}

function createLabelSearchButton(label: Label): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.labelId = label.id.toString();

    Object.assign(button.style, {
        width: '100%',
        border: 'none',
        padding: '6px',
        textAlign: 'left',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
    });

    const colorForText = isHexColorLight(label.hex_color) ? COLOR_DARK : COLOR_LIGHT;

    button.innerHTML = `
            <span>
                <span class="tag search-result" style="background-color: #${label.hex_color}; color: ${colorForText}">
                    <span>${label.title}</span>
                </span>
            </span>
            <span class="hint-text" style="font-size:12px; color:#888;">Click to add</span>
        `;

    button.addEventListener('click', () => {
        const bulkRows = document.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected');

        for (const row of bulkRows) {
            const taskId = extractTaskIdFromElement(row);

            taskCache[taskId].labels ??= [];

            GM_xmlhttpRequest({
                method: 'PUT',
                url: `/api/v1/tasks/${taskId}/labels`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ label_id: label.id })
            });

            if (!taskCache[taskId].labels!.some((l) => l.id === label.id)) {
                taskCache[taskId].labels!.push(label);
            }
        }
        button.style.display = 'none';
        refreshLabelsUI();
    });

    return button;
}

export async function refreshLabelsUI(): Promise<void> {
    const menu = document.querySelector<HTMLDivElement>('#labelsMenu');
    if (!menu) {
        return;
    }

    const cell = menu.closest('td');
    if (!cell) {
        return;
    }

    const selectedList = menu.querySelector<HTMLDivElement>('#labelsSelectedList');
    if (!selectedList) {
        return;
    }

    await refreshSelectedLabelsList(cell, selectedList);
    await updateLabelSearchButtonVisibility(menu, cell);
}

async function updateLabelSearchButtonVisibility(menu: HTMLDivElement, cell: HTMLTableCellElement): Promise<void> {
    const buttons = menu.querySelectorAll<HTMLButtonElement>('.search-results button');
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    const assignedLabelIds = task?.labels?.map((l) => l.id) || [];

    buttons.forEach((button) => {
        const labelId = parseInt(button.dataset.labelId!);
        button.style.display = assignedLabelIds.includes(labelId) ? 'none' : 'flex';
    });
}

async function refreshSelectedLabelsList(cell: HTMLTableCellElement, selectedList: HTMLDivElement): Promise<void> {
    selectedList.innerHTML = '';
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    if (!task?.labels) {
        return;
    }

    const sortedLabels = await sortLabelsAlphabetically(task.labels);

    for (const label of sortedLabels) {
        selectedList.appendChild(await createLabelSelectedItem(label));
    }
}

async function sortLabelsAlphabetically(labels: Label[]): Promise<Label[]> {
    const user = await fetchCurrentUser();
    const language = user.settings.language || navigator.language;
    return [...labels].sort((a, b) => a.title.localeCompare(b.title, language, { ignorePunctuation: true }));
}

async function createLabelSelectedItem(label: Label): Promise<HTMLSpanElement> {
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.style.backgroundColor = `#${label.hex_color}`;
    tag.style.color = isHexColorLight(label.hex_color) ? COLOR_DARK : COLOR_LIGHT;

    const textSpan = document.createElement('span');
    textSpan.textContent = label.title;

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'base-button base-button--type-button delete is-small';

    tag.appendChild(textSpan);
    tag.appendChild(deleteButton);

    deleteButton.addEventListener('click', () => {
        const bulkRows = document.querySelectorAll<HTMLTableRowElement>('tbody tr.bulk-selected');
        for (const row of bulkRows) {
            const taskId = extractTaskIdFromElement(row);

            GM_xmlhttpRequest({
                method: 'DELETE',
                url: `/api/v1/tasks/${taskId}/labels/${label.id}`,
                headers: { Authorization: `Bearer ${getJwtToken()}` }
            });

            taskCache[taskId].labels ??= [];
            taskCache[taskId].labels = taskCache[taskId].labels!.filter((l) => l.id !== label.id);
        }
        refreshLabelsUI();
    });

    return tag;
}
