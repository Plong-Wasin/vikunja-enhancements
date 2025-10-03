import type { Assignee } from '../types/index.ts';
import { getVisibleColumnPosition, extractTaskIdFromElement, getJwtToken } from '../utils/dom';
import { COLUMN_ASSIGNEES } from '../constants/columns';
import { fetchTaskById, fetchCurrentUser } from '../api/tasks';
import { assigneeSearchCache, avatarCache, taskCache } from '../utils/cache';
import { debounce } from '../utils/debounce';

export function addAssigneesSelectionFeature(): void {
    const visibleAssigneesPos = getVisibleColumnPosition(COLUMN_ASSIGNEES);
    if (visibleAssigneesPos === -1) {
        return;
    }

    const cells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleAssigneesPos + 1}):not(.enhanced)`
    );
    cells.forEach((cell) => {
        cell.style.cursor = 'pointer';
        cell.classList.add('bulk-edit', 'enhanced');
        attachAssigneeMenuTrigger(cell);
    });
}

function attachAssigneeMenuTrigger(cell: HTMLTableCellElement): void {
    cell.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('#assigneesMenu') || !document.contains(target)) {
            return;
        }
        closeAssigneesMenu();
        openAssigneesMenuAtCell(cell);
    });
}

function closeAssigneesMenu(): void {
    document.querySelector('#assigneesMenu')?.remove();
}

function openAssigneesMenuAtCell(cell: HTMLTableCellElement): void {
    cell.style.position = 'relative';
    const menu = createAssigneesMenuElement();
    cell.appendChild(menu);
    openAssigneesMenu(cell, menu);
}

function createAssigneesMenuElement(): HTMLDivElement {
    const menu = document.createElement('div');
    menu.id = 'assigneesMenu';
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
    selectedList.id = 'assigneesSelectedList';

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

async function openAssigneesMenu(cell: HTMLTableCellElement, menu: HTMLDivElement): Promise<void> {
    menu.style.display = 'block';

    const inputField = menu.querySelector<HTMLInputElement>('.input');
    const selectedList = menu.querySelector<HTMLDivElement>('#assigneesSelectedList');
    if (!selectedList) {
        return;
    }

    await refreshSelectedAssigneesList(cell, selectedList);
    setupAssigneeSearchInput(inputField, menu, cell);
    setupAssigneesMenuOutsideClickListener(cell, menu);
}

async function refreshSelectedAssigneesList(cell: HTMLTableCellElement, selectedList: HTMLDivElement): Promise<void> {
    selectedList.innerHTML = '';
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    if (task?.assignees) {
        for (const assignee of task.assignees) {
            selectedList.appendChild(await createAssigneeSelectedItem(assignee));
        }
    }
}

async function createAssigneeSelectedItem(assignee: Assignee): Promise<HTMLDivElement> {
    const container = document.createElement('div');
    container.className = 'user m-2';
    Object.assign(container.style, {
        position: 'relative',
        display: 'inline-block'
    });

    const avatarImg = document.createElement('img');
    avatarImg.width = 30;
    avatarImg.height = 30;
    avatarImg.className = 'avatar v-popper--has-tooltip';
    avatarImg.style.borderRadius = '100%';
    avatarImg.style.verticalAlign = 'middle';
    avatarImg.src = await fetchAvatarImage(assignee.username);
    avatarImg.title = assignee.name || assignee.username;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'base-button base-button--type-button remove-assignee';
    removeBtn.innerText = 'X';
    Object.assign(removeBtn.style, {
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        width: '16px',
        height: '16px',
        borderRadius: '50%',
        background: 'red',
        color: 'white',
        border: 'none',
        fontSize: '12px',
        cursor: 'pointer',
        lineHeight: '16px',
        textAlign: 'center',
        padding: '0'
    });

    container.appendChild(avatarImg);
    container.appendChild(removeBtn);

    removeBtn.addEventListener('click', () => removeAssigneeHandler(removeBtn, assignee.id));

    return container;
}

function removeAssigneeHandler(removeButton: HTMLButtonElement, assigneeId: number): void {
    const row = removeButton.closest('tr');
    if (!row) {
        return;
    }

    if (row.classList.contains('bulk-selected')) {
        const bulkRows = document.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected');
        for (const bulkRow of bulkRows) {
            const taskId = extractTaskIdFromElement(bulkRow);
            taskCache[taskId].assignees ??= [];
            taskCache[taskId].assignees = taskCache[taskId].assignees!.filter((a) => a.id !== assigneeId);

            GM_xmlhttpRequest({
                method: 'DELETE',
                url: `/api/v1/tasks/${taskId}/assignees/${assigneeId}`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                }
            });
        }
    } else {
        const taskId = extractTaskIdFromElement(row);
        taskCache[taskId].assignees ??= [];
        taskCache[taskId].assignees = taskCache[taskId].assignees!.filter((a) => a.id !== assigneeId);

        GM_xmlhttpRequest({
            method: 'DELETE',
            url: `/api/v1/tasks/${taskId}/assignees/${assigneeId}`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            }
        });
    }

    refreshAssigneesUI();
}

export function fetchAvatarImage(username: string): Promise<string> {
    const size = 30;
    if (avatarCache[username]) {
        return Promise.resolve(avatarCache[username]);
    }

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            url: `/api/v1/avatar/${username}?size=${size}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${getJwtToken()}` },
            responseType: 'blob',
            onload: (response) => {
                const blob = response.response;
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (typeof reader.result === 'string') {
                        avatarCache[username] = reader.result;
                        resolve(reader.result);
                    } else {
                        reject(new Error('Failed to read avatar as base64'));
                    }
                };
                reader.readAsDataURL(blob);
            },
            onerror: reject
        });
    });
}

// --- NEW LOGIC: Keyboard Navigation for Search Results ------------

type NavigationState = {
    activeIndex: number;
};

function setupAssigneeSearchInput(
    input: HTMLInputElement | null,
    menu: HTMLDivElement,
    cell: HTMLTableCellElement
): void {
    if (!input) {
        return;
    }

    input.focus();

    // Navigation state per menu
    const navState: NavigationState = { activeIndex: -1 };

    let projectId: number | null = null;
    fetchTaskById(extractTaskIdFromElement(cell)).then((task) => {
        projectId = task?.project_id ?? null;

        const debouncedSearch = debounce(() => {
            performAssigneeSearch(input, menu, projectId!);
        }, 300);

        input.addEventListener('input', () => {
            debouncedSearch();
            navState.activeIndex = -1;
        });

        // First search, so results exist for arrow navigation
        performAssigneeSearch(input, menu, projectId!);
    });

    // Arrow Up/Down navigation, Enter to select, Escape to close
    input.addEventListener('keydown', (event: KeyboardEvent) => {
        const buttons = getVisibleSearchResultButtons(menu);

        if (['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(event.key)) {
            event.stopPropagation();
            event.preventDefault();
        }

        if (event.key === 'ArrowDown') {
            // Move selection down
            if (buttons.length === 0) {
                return;
            }
            navState.activeIndex = getNextIndex(navState.activeIndex, buttons.length, 1);
            highlightResult(menu, navState.activeIndex);
        } else if (event.key === 'ArrowUp') {
            // Move selection up
            if (buttons.length === 0) {
                return;
            }
            navState.activeIndex = getNextIndex(navState.activeIndex, buttons.length, -1);
            highlightResult(menu, navState.activeIndex);
        } else if (event.key === 'Enter') {
            if (navState.activeIndex >= 0 && navState.activeIndex < buttons.length) {
                // Click highlighted result with Enter
                buttons[navState.activeIndex].click();
            }
        } else if (event.key === 'Escape') {
            closeAssigneesMenu();
        }
    });
}

// Helper: get all current visible assignee result buttons in order, skipping hidden ones
function getVisibleSearchResultButtons(menu: HTMLDivElement): HTMLButtonElement[] {
    // "search-results" contains the result buttons
    const allButtons = Array.from(menu.querySelectorAll<HTMLButtonElement>('.search-results button'));
    // Filter buttons that are visible (either inline style or computed style)
    return allButtons.filter((btn) => {
        // Use offsetParent !== null as a practical visibility test
        // This excludes display:none and elements detached from layout
        return btn.offsetParent !== null;
    });
}

// Helper: calculate next index for wrap-around
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

// Visually highlight the active result
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

// --- END NEW LOGIC ---

function performAssigneeSearch(input: HTMLInputElement, menu: HTMLDivElement, projectId: number): void {
    const query = input.value.trim();
    const resultsContainer = menu.querySelector<HTMLDivElement>('.search-results');
    if (!resultsContainer) {
        return;
    }

    const cacheKey = `${projectId}:${query}`;
    if (assigneeSearchCache.has(cacheKey)) {
        renderAssigneeSearchResults(resultsContainer, assigneeSearchCache.get(cacheKey)!);
        return;
    }

    GM_xmlhttpRequest({
        url: `/api/v1/projects/${projectId}/projectusers?s=${encodeURIComponent(query)}`,
        method: 'GET',
        headers: { Authorization: `Bearer ${getJwtToken()}` },
        responseType: 'json',
        onload: async (response) => {
            const assignees: Assignee[] = response.response ?? [];
            assigneeSearchCache.set(cacheKey, assignees);
            await renderAssigneeSearchResults(resultsContainer, assignees);
        }
    });
}

function sortAssigneesAlphabetically(assignees: Assignee[]): Assignee[] {
    return assignees.slice().sort((a, b) => {
        const nameA = (a.name || a.username).toLowerCase();
        const nameB = (b.name || b.username).toLowerCase();
        return nameA.localeCompare(nameB);
    });
}

async function reorderAssigneesWithCurrentUserFirst(assignees: Assignee[]): Promise<Assignee[]> {
    const sorted = sortAssigneesAlphabetically(assignees);
    const currentUser = await fetchCurrentUser();
    if (!currentUser) {
        return sorted;
    }
    const index = sorted.findIndex(
        (a) => a.id === currentUser.id || a.username.toLowerCase() === currentUser.username.toLowerCase()
    );
    if (index > 0) {
        const [current] = sorted.splice(index, 1);
        sorted.unshift(current);
    }
    return sorted;
}

async function renderAssigneeSearchResults(container: HTMLDivElement, assignees: Assignee[]): Promise<void> {
    // Sort alphabetically and place current user if present
    const sortedAssignees = await reorderAssigneesWithCurrentUserFirst([...assignees]);
    await Promise.all(sortedAssignees.map((a) => fetchAvatarImage(a.username)));
    container.innerHTML = '';

    await Promise.all(
        sortedAssignees.map(async (assignee, idx) => {
            const avatar = await fetchAvatarImage(assignee.username);
            const btn = createAssigneeSearchButton(assignee, avatar);
            btn.dataset.resultIndex = idx.toString();
            btn.classList.remove('active', 'highlighted');
            container.appendChild(btn);
        })
    );
    refreshAssigneesUI();
}

function createAssigneeSearchButton(assignee: Assignee, avatar: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.assigneeId = assignee.id.toString();

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

    const labelWrapper = document.createElement('div');
    Object.assign(labelWrapper.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
    });

    const avatarImg = document.createElement('img');
    avatarImg.className = 'avatar';
    avatarImg.src = avatar;
    avatarImg.width = 30;
    avatarImg.height = 30;
    Object.assign(avatarImg.style, {
        borderRadius: '100%',
        verticalAlign: 'middle'
    });

    const nameSpan = document.createElement('span');
    nameSpan.style.color = 'var(--input-color)';
    nameSpan.textContent = assignee.name || assignee.username;

    const hintSpan = document.createElement('span');
    hintSpan.className = 'hidden';
    hintSpan.textContent = 'Enter or click';
    Object.assign(hintSpan.style, {
        fontSize: '12px',
        color: '#888'
    });

    labelWrapper.appendChild(avatarImg);
    labelWrapper.appendChild(nameSpan);

    button.appendChild(labelWrapper);
    button.appendChild(hintSpan);

    button.addEventListener('click', () => {
        const bulkRows = document.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected');
        for (const row of bulkRows) {
            const taskId = extractTaskIdFromElement(row);
            taskCache[taskId].assignees ??= [];
            GM_xmlhttpRequest({
                method: 'PUT',
                url: `/api/v1/tasks/${taskId}/assignees`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ user_id: assignee.id })
            });

            if (!taskCache[taskId].assignees!.some((a) => a.id === assignee.id)) {
                taskCache[taskId].assignees!.push(assignee);
            }
        }
        button.style.display = 'none';
        refreshAssigneesUI();
    });

    return button;
}

function setupAssigneesMenuOutsideClickListener(cell: HTMLTableCellElement, menu: HTMLDivElement): void {
    const outsideClickListener = (event: MouseEvent) => {
        if (!cell.contains(event.target as Node) && document.contains(event.target as Node)) {
            menu.remove();
            document.removeEventListener('click', outsideClickListener);
            refreshAssigneesColumnUI();
        }
    };
    document.addEventListener('click', outsideClickListener);
}

export async function refreshAssigneesColumnUI(): Promise<void> {
    const visibleAssigneesPos = getVisibleColumnPosition(COLUMN_ASSIGNEES);
    if (visibleAssigneesPos === -1) {
        return;
    }

    const cells = document.querySelectorAll<HTMLTableCellElement>(
        `table td:nth-child(${visibleAssigneesPos + 1}):not(:has(#assigneesMenu))`
    );

    for (const cell of cells) {
        cell.innerHTML = '';
        const task = await fetchTaskById(extractTaskIdFromElement(cell));
        if (!task.assignees) {
            continue;
        }

        const container = document.createElement('div');
        container.className = 'assignees-list is-inline mis-1';

        for (const assignee of task.assignees) {
            const assigneeSpan = document.createElement('span');
            assigneeSpan.className = 'assignee';

            const userWrapper = document.createElement('div');
            userWrapper.className = 'user';
            userWrapper.style.display = 'inline';

            const avatarImg = document.createElement('img');
            avatarImg.className = 'avatar v-popper--has-tooltip';
            avatarImg.width = 28;
            avatarImg.height = 28;
            avatarImg.style.border = '2px solid var(--white)';
            avatarImg.style.borderRadius = '100%';
            avatarImg.title = assignee.name || assignee.username;
            avatarImg.src = await fetchAvatarImage(assignee.username);

            userWrapper.appendChild(avatarImg);
            assigneeSpan.appendChild(userWrapper);
            container.appendChild(assigneeSpan);
        }

        cell.appendChild(container);
    }
}

export async function refreshAssigneesUI(): Promise<void> {
    const menu = document.querySelector<HTMLDivElement>('#assigneesMenu');
    if (!menu) {
        return;
    }

    const cell = menu.closest('td');
    if (!cell) {
        return;
    }

    const selectedList = menu.querySelector<HTMLDivElement>('#assigneesSelectedList');
    if (!selectedList) {
        return;
    }

    await updateAssigneeSearchButtonVisibility(menu, cell);
    await refreshSelectedAssigneesList(cell, selectedList);
}

async function updateAssigneeSearchButtonVisibility(menu: HTMLDivElement, cell: HTMLTableCellElement): Promise<void> {
    const buttons = menu.querySelectorAll<HTMLButtonElement>('.search-results button');
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    const assignedUserIds = task?.assignees?.map((a) => a.id) || [];

    buttons.forEach((button) => {
        const assigneeId = parseInt(button.dataset.assigneeId!);
        button.style.display = assignedUserIds.includes(assigneeId) ? 'none' : 'flex';
    });
}
