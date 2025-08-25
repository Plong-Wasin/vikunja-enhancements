interface Task {
    id: number;
    title: string;
    description: string;
    done: boolean;
    done_at: string;
    due_date: string;
    reminders: null;
    project_id: number;
    repeat_after: number;
    repeat_mode: number;
    priority: number;
    start_date: string;
    end_date: string;
    assignees: Assignee[] | null;
    labels: Label[] | null;
    hex_color: string;
    percent_done: number;
    identifier: string;
    index: number;
    related_tasks: RelatedTasks;
    attachments: Attachment[] | null;
    cover_image_attachment_id: number;
    is_favorite: boolean;
    created: string;
    updated: string;
    bucket_id: number;
    position: number;
    reactions: null;
    created_by: CreatedBy;
}

interface Assignee {
    id: number;
    name: string;
    username: string;
    created: Date;
    updated: Date;
}

interface Attachment {
    id: number;
    task_id: number;
    created_by: CreatedBy;
    file: IFile;
    created: string;
}

interface CreatedBy {
    id: number;
    name: string;
    username: string;
    created: string;
    updated: string;
}

interface IFile {
    id: number;
    name: string;
    mime: string;
    size: number;
    created: string;
}

interface Label {
    id: number;
    title: string;
    description: string;
    hex_color: string;
    created_by: CreatedBy;
    created: string;
    updated: string;
}

interface RelatedTasks {
    subtask?: Task[];
    parenttask?: Task[];
}

interface User {
    id: number;
    name: string;
    username: string;
    created: string;
    updated: string;
    settings: Settings;
    deletion_scheduled_at: string;
    is_local_user: boolean;
    auth_provider: string;
}

interface Settings {
    name: string;
    email_reminders_enabled: boolean;
    discoverable_by_name: boolean;
    discoverable_by_email: boolean;
    overdue_tasks_reminders_enabled: boolean;
    overdue_tasks_reminders_time: string;
    default_project_id: number;
    week_start: number;
    language: string;
    timezone: string;
    frontend_settings: FrontendSettings;
    extra_settings_links: null;
}

interface FrontendSettings {
    allow_icon_changes: boolean;
    color_schema: string;
    date_display: string;
    default_view: string;
    minimum_priority: number;
    play_sound_when_done: boolean;
    quick_add_magic_mode: string;
}

type TaskDateField = 'start_date' | 'due_date' | 'end_date';

(function () {
    'use strict';

    // Column indices for filtering and editing
    const COLUMN_IDENTIFY = 0; // "#" or unspecified
    const COLUMN_DONE = 1;
    const COLUMN_TITLE = 2;
    const COLUMN_PRIORITY = 3;
    const COLUMN_LABELS = 4;
    const COLUMN_ASSIGNEES = 5;
    const COLUMN_DUE_DATE = 6;
    const COLUMN_START_DATE = 7;
    const COLUMN_END_DATE = 8;
    const COLUMN_PROGRESS = 9;
    const COLUMN_DONE_AT = 10;
    const COLUMN_CREATED = 11;
    const COLUMN_UPDATED = 12;
    const COLUMN_CREATED_BY = 13;

    // Colors for UI elements
    const COLORS = [
        '#ffbe0b',
        '#fd8a09',
        '#fb5607',
        '#ff006e',
        '#efbdeb',
        '#8338ec',
        '#5f5ff6',
        '#3a86ff',
        '#4c91ff',
        '#0ead69',
        '#25be8b',
        '#073b4c',
        '#373f47'
    ];
    const COLOR_LIGHT = 'hsl(220, 13%, 91%)'; // grey-200
    const COLOR_DARK = 'hsl(215, 27.9%, 16.9%)'; // grey-800

    // Cache for tasks and avatars to avoid repeated API calls
    const taskCache: Record<number, Task> = {};
    const avatarCache: Record<string, string> = {};
    const assigneeSearchCache = new Map<string, Assignee[]>();
    const labelSearchCache = new Map<string, Label[]>();

    /** Returns the current project ID from the URL */
    function getProjectId(): number {
        const pathParts = window.location.pathname.split('/');
        const projectId = pathParts[2];
        return +projectId;
    }

    /** Retrieves the JWT token from localStorage */
    function getJwtToken(): string | null {
        return localStorage.getItem('token');
    }
    /** Logs messages prefixed with [Vikunja] */
    function log(...args: any[]) {
        console.log('%c[Vikunja]', 'color: #ebd927', ...args);
    }

    /**
     * Collects indices of all checked checkboxes within '.columns-filter' UI element.
     * Used to identify which columns are currently visible.
     * @returns Array of indices of checked columns
     */
    function getCheckedColumnIndices(): number[] {
        const checkedIndices: number[] = [];
        document
            .querySelectorAll<HTMLInputElement>('.columns-filter input')
            .forEach((input, idx) => {
                if (input.checked) checkedIndices.push(idx);
            });
        return checkedIndices;
    }

    /**
     * Extracts the task ID from a table row element.
     * @param tr Table row element containing task link
     * @returns Task ID number or 0 if not found
     */
    function getTaskIdByRow(tr: HTMLTableRowElement | null): number {
        if (!tr) return 0;
        const link = tr.querySelector<HTMLAnchorElement>('a');
        if (!link) return 0;
        const idStr = link.href.split('/').pop();
        return idStr ? Number(idStr) : 0;
    }

    /**
     * Extracts the task ID from an element inside the row.
     * @param element An element nested inside a table row
     * @returns Task ID number or 0 if not found
     */
    function getTaskIdFromElement(element: HTMLElement): number {
        const row = element.closest('tr');
        return getTaskIdByRow(row);
    }

    /** Returns the text for the "Done" column header */
    function getDoneColumnText(): string {
        return (
            document.querySelectorAll<HTMLSpanElement>(
                '.columns-filter span'
            )[2]?.textContent ?? ''
        );
    }

    /**
     * Finds the index of a checked column or returns -1 if it is not visible
     * @param column Column index constant
     * @returns Index of the checked column or -1 if not checked
     */
    function getCheckedColumnIndex(column: number): number {
        return getCheckedColumnIndices().indexOf(column);
    }

    //---------------- Editable Title Enhancement ----------------

    /**
     * Main function to enhance table title cells with editing capabilities.
     * Adds inline editing UI and behaviour.
     */
    function enhanceEditableTitles() {
        const titleColIndex = getCheckedColumnIndex(COLUMN_TITLE);
        if (titleColIndex === -1) return;

        const titleCells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${titleColIndex + 1}):not(.enhanced)`
        );

        titleCells.forEach(initEditableTitleCell);
    }

    /**
     * Initializes a single title cell to support inline editing.
     * @param cell Table cell element for task title
     */
    function initEditableTitleCell(cell: HTMLTableCellElement) {
        cell.style.cursor = 'pointer';
        cell.classList.add('enhanced');

        const link = cell.querySelector<HTMLAnchorElement>('a');
        if (!link) return;

        // Create container div with styles for layout
        const container = document.createElement('div');
        cell.appendChild(container);
        applyFlexContainerStyle(container);

        // Move link inside container
        container.appendChild(link);

        // Create hidden editable span for inline edit input
        const editSpan = createEditableSpan();
        container.appendChild(editSpan);

        // Create edit button that activates edit mode
        const editButton = createEditButton(link, editSpan);
        container.appendChild(editButton);

        // Double-click on container activates edit mode
        container.addEventListener('dblclick', () =>
            activateEditMode(link, editSpan)
        );

        attachEditSpanEventHandlers(link, editSpan);
    }

    /** Applies flexbox styling to a container element */
    function applyFlexContainerStyle(container: HTMLElement) {
        container.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
    }

    /** Creates a hidden, contenteditable span for editing text */
    function createEditableSpan(): HTMLSpanElement {
        const span = document.createElement('span');
        span.contentEditable = 'true';
        span.classList.add('hidden', 'editable-span');
        return span;
    }

    /**
     * Creates an edit button (pencil icon) that initiates the editing mode
     * @param link The original link element displaying the title
     * @param editSpan The hidden editable span
     * @returns The button element
     */
    function createEditButton(
        link: HTMLAnchorElement,
        editSpan: HTMLSpanElement
    ): HTMLButtonElement {
        const button = document.createElement('button');
        button.innerHTML = '✎';
        button.className = 'edit-title';
        button.addEventListener('click', () =>
            activateEditMode(link, editSpan)
        );
        return button;
    }

    /** Activates editing mode for the title cell */
    function activateEditMode(
        link: HTMLAnchorElement,
        editSpan: HTMLSpanElement
    ) {
        editSpan.textContent = link.textContent || '';
        link.classList.add('hidden');
        editSpan.classList.remove('hidden');
        focusElementCursorToEnd(editSpan);
    }

    /** Sets focus and places the cursor at the end of a contenteditable element */
    function focusElementCursorToEnd(element: HTMLElement) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);

        const selection = window.getSelection();
        if (!selection) return;
        selection.removeAllRanges();
        selection.addRange(range);

        element.focus();
    }

    /**
     * Attaches handlers to the editable span for saving or canceling edits.
     * Saves on Enter or blur, cancels on Escape.
     * @param link The original link element
     * @param editSpan The editable span
     */
    function attachEditSpanEventHandlers(
        link: HTMLAnchorElement,
        editSpan: HTMLSpanElement
    ) {
        editSpan.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                editSpan.blur();
                saveTitleEdit(link, editSpan);
            } else if (event.key === 'Escape') {
                cancelTitleEdit(link, editSpan);
            }
        });

        editSpan.addEventListener('blur', () => saveTitleEdit(link, editSpan));
    }

    /**
     * Determines if given hex color string is dark, for contrast calculation.
     * Uses an approximation of WCAG APCA formula.
     * @param color Color string e.g. '#ff0000' or 'ff0000'
     * @returns True if color is dark, false otherwise
     */
    function isColorDark(color: string | undefined): boolean {
        if (!color || color === '#') return true;

        if (color[0] !== '#') color = '#' + color;

        const rgb = parseInt(color.slice(1, 7), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;

        const luminance =
            Math.pow(r / 255, 2.2) * 0.2126 +
            Math.pow(g / 255, 2.2) * 0.7152 +
            Math.pow(b / 255, 2.2) * 0.0722;

        return Math.pow(luminance, 0.678) >= 0.5;
    }

    /**
     * Saves the edited title if it was changed.
     * Sends API request to update the task title.
     * @param link The original title link element
     * @param editSpan The editable span containing new text
     */
    function saveTitleEdit(link: HTMLAnchorElement, editSpan: HTMLSpanElement) {
        const newText = editSpan.textContent?.trim() ?? '';
        const originalText = link.textContent ?? '';

        if (!newText || newText === originalText) {
            restoreTitleView(link, editSpan, originalText);
            return;
        }

        const taskId = link.href.split('/').pop();
        if (taskId) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `/api/v1/tasks/${taskId}`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ title: newText })
            });
        }

        restoreTitleView(link, editSpan, newText);
    }

    /** Cancels edit mode and restores original title view without changes */
    function cancelTitleEdit(
        link: HTMLAnchorElement,
        editSpan: HTMLSpanElement
    ) {
        restoreTitleView(link, editSpan, link.textContent ?? '');
    }

    /** Restores the title view by hiding the editable span and showing the link */
    function restoreTitleView(
        link: HTMLAnchorElement,
        editSpan: HTMLSpanElement,
        text: string
    ) {
        link.textContent = text;
        link.classList.remove('hidden');
        editSpan.classList.add('hidden');
    }

    //---------------- Done Checkbox Column Enhancement ----------------

    /**
     * Enhances the "Done" column to include interactive checkboxes for marking tasks as done.
     */
    function enhanceDoneColumn() {
        const doneColIndex = getCheckedColumnIndex(COLUMN_DONE);
        if (doneColIndex === -1) return;

        const doneCells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${doneColIndex + 1}):not(.enhanced)`
        );

        doneCells.forEach(setupDoneCell);
    }

    /**
     * Sets up an individual "Done" cell with a checkbox and label, attaching event handlers.
     * @param cell The table cell for the "Done" column
     */
    function setupDoneCell(cell: HTMLTableCellElement) {
        cell.classList.add('enhanced');

        const hasDoneLabel = Boolean(
            cell.querySelector<HTMLDivElement>('.is-done--small')
        );
        cell.innerHTML = buildDoneCellInnerHtml(hasDoneLabel);

        const doneLabelDiv =
            cell.querySelector<HTMLDivElement>('.is-done--small');
        const checkbox = cell.querySelector<HTMLInputElement>(
            'input[type="checkbox"]'
        );

        if (!doneLabelDiv || !checkbox) return;

        updateDoneLabelVisibility(doneLabelDiv, checkbox.checked);

        attachDoneCheckboxEvents(checkbox, cell.closest('tr')!);
    }

    /**
     * Builds inner HTML string for a "Done" cell.
     * @param isChecked True if task is done; checkbox checked state
     * @returns HTML string with checkbox and "Done" label
     */
    function buildDoneCellInnerHtml(isChecked: boolean): string {
        const doneLabelHtml = `<div class="is-done is-done--small" style="flex: 1; width: 100%;">${getDoneColumnText()}</div>`;

        return `
            <div style="display: flex; align-items: center; gap: 6px;">
                <input class="bulk-edit" type="checkbox" ${
                    isChecked ? 'checked' : ''
                } />
                ${doneLabelHtml}
            </div>
        `;
    }

    /**
     * Attaches the checkbox change event to update task done status.
     * Handles both single and bulk operations.
     * @param checkbox The checkbox input element
     * @param row The table row element
     */
    function attachDoneCheckboxEvents(
        checkbox: HTMLInputElement,
        row: HTMLTableRowElement
    ) {
        checkbox.addEventListener('change', () => {
            const isChecked = checkbox.checked;
            const tbody = row.closest('tbody');
            if (!tbody) return;

            if (row.classList.contains('bulk-selected')) {
                updateDoneForBulkRows(tbody, isChecked);
            } else {
                updateDoneForRow(row, isChecked);
            }
        });
    }

    /**
     * Updates the done state UI for a single task row and sends API request.
     * @param row The task's table row element
     * @param done True if task is done, false otherwise
     */
    function updateDoneForRow(row: HTMLTableRowElement, done: boolean) {
        const doneLabelDiv =
            row.querySelector<HTMLDivElement>('.is-done--small');
        if (!doneLabelDiv) return;

        updateDoneLabelVisibility(doneLabelDiv, done);

        const taskId = getTaskIdByRow(row);
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/${taskId}`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ done })
        });
    }

    /**
     * Updates the done state for all bulk-selected rows with UI update and bulk API request.
     * @param tbody The tbody element containing rows
     * @param done True if marking all tasks done, false otherwise
     */
    function updateDoneForBulkRows(
        tbody: HTMLTableSectionElement,
        done: boolean
    ) {
        const bulkRows = Array.from(
            tbody.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected')
        );

        const idsToUpdate = bulkRows.map(getTaskIdByRow);

        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/bulk`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                done,
                task_ids: idsToUpdate
            })
        });

        bulkRows.forEach((row) => {
            const checkbox = row.querySelector<HTMLInputElement>(
                'input[type="checkbox"]'
            );
            const doneLabelDiv =
                row.querySelector<HTMLDivElement>('.is-done--small');
            if (checkbox && doneLabelDiv) {
                checkbox.checked = done;
                updateDoneLabelVisibility(doneLabelDiv, done);
            }
        });
    }

    /**
     * Toggles visibility of the "Done" label in the cell based on checkbox state.
     * @param doneLabel The "Done" label div
     * @param isChecked Whether the checkbox is checked
     */
    function updateDoneLabelVisibility(
        doneLabel: HTMLDivElement,
        isChecked: boolean
    ) {
        doneLabel.classList.toggle('hidden', !isChecked);
    }

    //---------------- Fetch Tasks Utilities ----------------

    /**
     * Retrieves all unique task IDs from the table rows.
     * @returns Array of numeric task IDs
     */
    function getAllTaskIdsFromTable(): number[] {
        const links =
            document.querySelectorAll<HTMLAnchorElement>('tbody tr a');
        const ids = Array.from(links).map((link) => getTaskIdFromElement(link));
        return Array.from(new Set(ids));
    }

    /**
     * Fetches tasks by their IDs from the backend API, caches the results.
     * @param taskIds Array of task IDs to fetch
     * @returns Promise resolving to array of Task objects
     */
    async function fetchTasksByIds(taskIds: number[]): Promise<Task[]> {
        const idsToFetch = taskIds.filter((id) => !taskCache[id]);

        if (idsToFetch.length > 0) {
            const fetchedTasks = await fetchTasksFromApi(idsToFetch);
            fetchedTasks.forEach((task) => {
                taskCache[task.id] = task;
            });
        }

        return taskIds.map((id) => taskCache[id]);
    }

    /**
     * Fetches tasks from API dynamically in batches.
     * @param taskIds Array of task IDs to fetch
     * @returns Promise resolving to an array of Task objects
     */
    async function fetchTasksFromApi(taskIds: number[]): Promise<Task[]> {
        const results: Task[] = [];
        let remainingIds = [...taskIds];

        while (remainingIds.length > 0) {
            // Compose filter query
            const filterQuery = 'id in ' + remainingIds.join(',');

            const response: Tampermonkey.Response<any> = await new Promise(
                (resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: `/api/v1/tasks/all?filter=${encodeURIComponent(
                            filterQuery
                        )}`,
                        headers: {
                            Authorization: `Bearer ${getJwtToken()}`,
                            'Content-Type': 'application/json'
                        },
                        onload: resolve,
                        onerror: reject
                    });
                }
            );

            const data = JSON.parse(response.responseText);
            results.push(...data);

            const fetchedIds = data.map((task: any) => task.id);
            remainingIds = remainingIds.filter(
                (id) => !fetchedIds.includes(id)
            );

            // Break if no more tasks fetched in this iteration
            if (fetchedIds.length === 0) break;
        }

        return results;
    }

    /**
     * Fetches a single task by ID, utilizing cached data if available.
     * @param taskId Task ID
     * @returns Promise resolving to Task object
     */
    async function fetchTaskById(taskId: number): Promise<Task> {
        return (await fetchTasksByIds([taskId]))[0];
    }

    //---------------- Priority Column Enhancement ----------------

    /**
     * Enhances the "Priority" column with dropdown select controls for each row.
     * When priority changes, bulk selected tasks update.
     */
    async function enhancePriorityColumn() {
        const priorityColIndex = getCheckedColumnIndex(COLUMN_PRIORITY);
        if (priorityColIndex === -1) return;

        const tasks = await fetchTasksByIds(getAllTaskIdsFromTable());

        const tbody = document.querySelector('tbody');
        if (!tbody) return;

        const rows = tbody.querySelectorAll<HTMLTableRowElement>('tr');
        rows.forEach((row) => setupPriorityCell(row, tasks, priorityColIndex));
    }

    /**
     * Sets up a priority cell in a row with a styled select dropdown.
     * @param row Table row element
     * @param tasks Array of Task objects for lookup
     * @param colIndex Index of the priority column
     */
    function setupPriorityCell(
        row: HTMLTableRowElement,
        tasks: Task[],
        colIndex: number
    ) {
        const taskId = getTaskIdByRow(row);
        const cell = row.children[colIndex] as HTMLTableCellElement;
        if (cell.classList.contains('enhanced')) return;

        cell.classList.add('enhanced');

        const wrapper = document.createElement('div');
        wrapper.classList.add('select');

        const select = createPrioritySelectElement();

        const currentPriority =
            tasks.find((task) => task.id === taskId)?.priority ?? 0;
        updatePrioritySelectStyle(select, currentPriority);

        wrapper.appendChild(select);
        cell.innerHTML = '';
        cell.appendChild(wrapper);

        bindPrioritySelectChangeEvent(select, row);
    }

    /** Creates a <select> element with priority options and styled colors */
    function createPrioritySelectElement(): HTMLSelectElement {
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

    /**
     * Updates the priority select's value and text color to reflect priority.
     * @param select The select element
     * @param priority Numeric priority value
     */
    function updatePrioritySelectStyle(
        select: HTMLSelectElement,
        priority: number
    ) {
        select.value = priority.toString();
        if (select.selectedOptions[0]) {
            select.style.color = select.selectedOptions[0].style.color;
        }
    }

    /**
     * Binds change event on priority select, updating all bulk-selected rows.
     * @param select The priority select element
     * @param row The table row where select resides
     */
    function bindPrioritySelectChangeEvent(
        select: HTMLSelectElement,
        row: HTMLTableRowElement
    ) {
        select.addEventListener('change', () => {
            const tbody = row.closest('tbody');
            if (!tbody) return;

            const priorityValue = +select.value;
            updateBulkRowsPriority(tbody, priorityValue);
            updatePrioritySelectStyle(select, priorityValue);
        });
    }

    /**
     * Updates priority of all bulk-selected rows with UI updates and bulk API request.
     * @param tbody TBody element containing rows
     * @param priority Numeric priority to set
     */
    function updateBulkRowsPriority(
        tbody: HTMLTableSectionElement,
        priority: number
    ) {
        const bulkRows = Array.from(
            tbody.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected')
        );
        const taskIds = bulkRows.map(getTaskIdByRow);

        GM_xmlhttpRequest({
            method: 'POST',
            url: '/api/v1/tasks/bulk',
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                priority: priority,
                task_ids: taskIds
            })
        });

        bulkRows.forEach((row) => {
            const select =
                row.querySelector<HTMLSelectElement>('.priority-select');
            if (select) updatePrioritySelectStyle(select, priority);
        });
    }

    //---------------- Date Column Enhancement (Due, Start, End) ----------------

    /**
     * Converts UTC datetime string to local datetime string formatted for <input type="datetime-local">
     * @param utcString UTC datetime ISO string
     * @returns Local datetime string formatted as yyyy-MM-ddThh:mm
     */
    function utcToLocalDatetimeInputValue(utcString: string): string {
        const date = new Date(utcString);

        const pad = (num: number) => String(num).padStart(2, '0');

        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1); // zero-based month
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());

        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    /**
     * Enhances a date column with input elements of type datetime-local.
     * @param columnConstant Column constant (e.g. COLUMN_DUE_DATE)
     * @param inputClassName CSS class to assign to datetime input
     * @param dateField Field of Task used for this date ('due_date', 'start_date', 'end_date')
     */
    async function enhanceDateColumn(
        columnConstant: number,
        inputClassName: string,
        dateField: TaskDateField
    ) {
        const colIndex = getCheckedColumnIndex(columnConstant);
        if (colIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(.enhanced)`
        );

        const tasks = await fetchTasksByIds(getAllTaskIdsFromTable());

        cells.forEach((cell) =>
            setupDateCell(cell, tasks, inputClassName, dateField)
        );
    }

    /**
     * Sets up a single date cell with a datetime-local input and appropriate event handling.
     * @param cell Table cell element
     * @param tasks Array of task data
     * @param className Class name for the input element
     * @param dateField Task field for date ('due_date', 'start_date', 'end_date')
     */
    function setupDateCell(
        cell: HTMLTableCellElement,
        tasks: Task[],
        className: string,
        dateField: TaskDateField
    ) {
        cell.classList.add('enhanced');

        const taskId = getTaskIdFromElement(cell);
        const dateValue = tasks.find((task) => task.id === taskId)?.[dateField];

        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.classList.add(className, 'bulk-edit');
        if (dateValue && dateValue !== '0001-01-01T00:00:00Z') {
            input.value = utcToLocalDatetimeInputValue(dateValue);
        }

        cell.innerHTML = '';
        cell.appendChild(input);

        input.addEventListener('change', () =>
            handleDateInputChange(cell, input, className, dateField)
        );
    }

    /**
     * Handles change events on date inputs, applying changes to bulk-selected rows via API call.
     * @param cell The cell containing the input
     * @param input The datetime-local input element
     * @param inputClassName CSS class name for date input
     * @param dateField Task date field to update
     */
    function handleDateInputChange(
        cell: HTMLTableCellElement,
        input: HTMLInputElement,
        inputClassName: string,
        dateField: TaskDateField
    ) {
        const tr = cell.closest('tr');
        if (!tr) return;

        const newDateUTC = new Date(input.value).toISOString();

        const selectedRows = Array.from(
            document.querySelectorAll<HTMLTableRowElement>(
                'tbody tr.bulk-selected'
            )
        );
        const taskIds = selectedRows.map(getTaskIdByRow);

        GM_xmlhttpRequest({
            method: 'POST',
            url: '/api/v1/tasks/bulk',
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                [dateField]: newDateUTC,
                task_ids: taskIds
            })
        });

        // Update inputs for all bulk-selected rows for this date class
        selectedRows.forEach((row) => {
            const rowInput = row.querySelector<HTMLInputElement>(
                `.${inputClassName}`
            );
            if (rowInput) {
                rowInput.value = input.value;
            }
        });
    }

    /** Shortcut wrappers for specific date columns */
    async function enhanceDueDateColumn() {
        await enhanceDateColumn(
            COLUMN_DUE_DATE,
            'due-date-datetime-local',
            'due_date'
        );
    }
    async function enhanceStartDateColumn() {
        await enhanceDateColumn(
            COLUMN_START_DATE,
            'start-date-datetime-local',
            'start_date'
        );
    }
    async function enhanceEndDateColumn() {
        await enhanceDateColumn(
            COLUMN_END_DATE,
            'end-date-datetime-local',
            'end_date'
        );
    }

    //---------------- Progress Column Enhancement ----------------

    /**
     * Enhances "Progress" column to support double-click inline editing of progress percentage.
     */
    function enhanceProgressColumn() {
        const progressColIndex = getCheckedColumnIndex(COLUMN_PROGRESS);
        if (progressColIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${progressColIndex + 1}):not(.enhanced)`
        );

        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit', 'enhanced');
            attachProgressEditingToCell(cell);
        });
    }

    /**
     * Attaches double-click listener to a cell to enable editing progress inline.
     * @param cell Table cell element for progress
     */
    function attachProgressEditingToCell(cell: HTMLTableCellElement) {
        cell.addEventListener('dblclick', (event) => {
            if (
                event.target &&
                (event.target as HTMLElement).tagName === 'INPUT'
            ) {
                return; // already editing
            }

            const currentValue = parseInt(cell.innerText) || 0;
            const input = createProgressInput(currentValue);
            const percentLabel = document.createElement('span');
            percentLabel.innerText = '%';

            cell.innerHTML = '';
            cell.appendChild(input);
            cell.appendChild(percentLabel);

            input.focus();
            input.select();

            bindProgressInputEvents(input, cell, currentValue);
        });
    }

    /** Creates a numeric input for progress editing constrained between 0 and 100 */
    function createProgressInput(initialValue: number): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = initialValue.toString();
        input.min = '0';
        input.max = '100';
        input.classList.add('edit-progress');
        return input;
    }

    /**
     * Validates that progress value is an integer between 0 and 100 inclusive.
     * @param progress Number input progress value
     * @returns True if valid progress, false otherwise
     */
    function isValidProgressValue(progress: number): boolean {
        return !isNaN(progress) && progress >= 0 && progress <= 100;
    }

    /**
     * Sends API requests to update progress for a list of tasks in bulk.
     * @param taskIds Array of task IDs to update
     * @param newProgress New progress value (percentage from 0 to 100)
     */
    function updateBulkProgress(taskIds: number[], newProgress: number): void {
        for (const taskId of taskIds) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `/api/v1/tasks/${taskId}`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    percent_done: newProgress / 100
                })
            });
        }
    }

    /**
     * Updates the progress UI for all bulk-selected rows to display the new progress percentage.
     * @param newProgress New progress value (percentage)
     */
    function updateBulkProgressUI(newProgress: number): void {
        const progressColIndex = getCheckedColumnIndex(COLUMN_PROGRESS);

        document
            .querySelectorAll<HTMLTableRowElement>('tbody tr.bulk-selected')
            .forEach((row) => {
                const progressCell = row.querySelector<HTMLTableCellElement>(
                    `td:nth-child(${progressColIndex + 1})`
                );
                if (progressCell) {
                    progressCell.innerText = `${newProgress}%`;
                }
            });
    }

    /**
     * Hooks event listeners for the progress input box to save or cancel editing.
     * @param input Input element for progress editing
     * @param cell Table cell containing the input
     * @param originalValue Original progress value before editing
     */
    function bindProgressInputEvents(
        input: HTMLInputElement,
        cell: HTMLTableCellElement,
        originalValue: number
    ) {
        const saveEditedProgress = () => {
            // Round progress to nearest multiple of 10
            const newProgressRaw = parseInt(input.value);
            const newProgress = Math.round(newProgressRaw / 10) * 10;

            if (isValidProgressValue(newProgress)) {
                const taskIds = Array.from(
                    document.querySelectorAll<HTMLTableRowElement>(
                        'tbody tr.bulk-selected'
                    )
                ).map(getTaskIdByRow);

                updateBulkProgress(taskIds, newProgress);
                updateBulkProgressUI(newProgress);
            } else {
                // Revert if invalid value entered
                cell.innerText = `${originalValue}%`;
            }
        };

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                saveEditedProgress();
            } else if (event.key === 'Escape') {
                cell.innerText = `${originalValue}%`;
            }
        });

        input.addEventListener('blur', saveEditedProgress);
    }

    //---------------- Assignees Column Enhancement ----------------

    /**
     * Enhances the assignees column to allow opening an assignee menu on click.
     */
    function enhanceAssigneesColumn() {
        const columnIndex = getCheckedColumnIndex(COLUMN_ASSIGNEES);
        if (columnIndex === -1) return;

        const assigneeCells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${columnIndex + 1}):not(.enhanced)`
        );

        assigneeCells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit', 'enhanced');
            attachAssigneeMenuTrigger(cell);
        });
    }

    /**
     * Attaches click handler that shows assignee selection menu for the cell.
     * @param cell Table cell element in assignees column
     */
    function attachAssigneeMenuTrigger(cell: HTMLTableCellElement) {
        cell.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;

            if (
                (target && target.closest('#assigneesMenu')) ||
                !document.contains(target)
            ) {
                return; // Prevent reopening if clicking inside existing menu or outside document
            }

            closeAssigneesMenu();

            openAssigneesMenuForCell(cell);
        });
    }

    /** Closes any existing assignees menu */
    function closeAssigneesMenu() {
        document.querySelector('#assigneesMenu')?.remove();
    }

    /**
     * Opens an assignees menu attached to the given cell, initializing its content and handlers.
     * @param cell Table cell element
     */
    function openAssigneesMenuForCell(cell: HTMLTableCellElement) {
        cell.style.position = 'relative';

        const menu = createAssigneesMenuElement();
        cell.appendChild(menu);

        openAssigneesMenu(cell, menu);
    }

    /** Creates the base DOM element for the assignees menu */
    function createAssigneesMenuElement(): HTMLDivElement {
        // Container div
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

        // Div for showing selected assignees
        const selectedList = document.createElement('div');
        selectedList.className = 'selected-list';
        selectedList.id = 'assigneesSelectedList';

        // Control wrapper for input field
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

        // Container for search results below input
        const searchResults = document.createElement('div');
        searchResults.className = 'search-results';

        menu.appendChild(selectedList);
        menu.appendChild(control);
        menu.appendChild(searchResults);

        return menu;
    }

    /**
     * Opens and initializes the assignees menu: populates selected list, sets up search input and outside click handler.
     * @param cell Table cell containing the menu
     * @param menu The assignees menu div element
     */
    async function openAssigneesMenu(
        cell: HTMLTableCellElement,
        menu: HTMLDivElement
    ) {
        menu.style.display = 'block';

        const inputField = menu.querySelector<HTMLInputElement>('.input');
        const selectedList = menu.querySelector<HTMLDivElement>(
            '#assigneesSelectedList'
        );
        if (!selectedList) return;

        await refreshSelectedAssigneesList(cell, selectedList);

        setupAssigneesSearchInput(inputField, menu);
        setupAssigneesMenuOutsideClickHandler(cell, menu);
    }

    /**
     * Refreshes the selected assignees list inside the menu based on current task data.
     * @param cell The related table cell
     * @param selectedList Container div showing selected assignees
     */
    async function refreshSelectedAssigneesList(
        cell: HTMLTableCellElement,
        selectedList: HTMLDivElement
    ) {
        selectedList.innerHTML = '';
        const task = await fetchTaskById(getTaskIdFromElement(cell));

        if (task?.assignees) {
            for (const assignee of task.assignees) {
                selectedList.appendChild(
                    await createAssigneeItemElement(assignee)
                );
            }
        }
    }

    /**
     * Creates a DOM element for a single selected assignee including avatar and remove button.
     * @param assignee Assignee object
     * @returns Div element representing the assignee in the menu
     */
    async function createAssigneeItemElement(
        assignee: Assignee
    ): Promise<HTMLDivElement> {
        const container = document.createElement('div');
        container.className = 'user m-2';
        Object.assign(container.style, {
            position: 'relative',
            display: 'inline-block'
        });

        const avatarImg = document.createElement('img');
        avatarImg.height = 30;
        avatarImg.width = 30;
        avatarImg.className = 'avatar v-popper--has-tooltip';
        avatarImg.style.borderRadius = '100%';
        avatarImg.style.verticalAlign = 'middle';
        avatarImg.src = await fetchAvatarImage(assignee.username);
        avatarImg.title = assignee.name || assignee.username;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.className =
            'base-button base-button--type-button remove-assignee';
        removeButton.innerText = 'X';
        Object.assign(removeButton.style, {
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
        container.appendChild(removeButton);

        // Event handler to remove assignee from selected tasks
        removeButton.addEventListener('click', () => {
            const row = removeButton.closest('tr');
            if (!row) return;

            if (row.classList.contains('bulk-selected')) {
                const bulkRows =
                    document.querySelectorAll<HTMLTableRowElement>(
                        'tr.bulk-selected'
                    );
                for (const bulkRow of bulkRows) {
                    const taskId = getTaskIdFromElement(bulkRow);
                    taskCache[taskId].assignees ??= [];
                    taskCache[taskId].assignees = taskCache[
                        taskId
                    ].assignees!.filter((a) => a.id !== assignee.id);

                    GM_xmlhttpRequest({
                        method: 'DELETE',
                        url: `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
                        headers: {
                            Authorization: `Bearer ${getJwtToken()}`,
                            'Content-Type': 'application/json'
                        }
                    });
                }
            } else {
                const taskId = getTaskIdFromElement(row);
                taskCache[taskId].assignees ??= [];
                taskCache[taskId].assignees = taskCache[
                    taskId
                ].assignees!.filter((a) => a.id !== assignee.id);

                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: `/api/v1/tasks/${taskId}/assignees/${assignee.id}`,
                    headers: {
                        Authorization: `Bearer ${getJwtToken()}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
            refreshAssigneesUI();
        });
        return container;
    }

    /**
     * Updates search results and refreshes the entire assignees UI after changes.
     */
    async function refreshAssigneesUI() {
        const menu = document.querySelector<HTMLDivElement>('#assigneesMenu');
        if (!menu) return;

        const cell = menu.closest('td');
        if (!cell) return;

        const selectedList = document.querySelector<HTMLDivElement>(
            '#assigneesSelectedList'
        );
        if (!selectedList) return;

        await updateAssigneeSearchResults(menu, cell);
        await refreshSelectedAssigneesList(cell, selectedList);
    }

    /**
     * Update visibility of assignee search buttons based on current task assignees.
     * @param menu Assignees menu element
     * @param cell Related table cell
     */
    async function updateAssigneeSearchResults(
        menu: HTMLDivElement,
        cell: HTMLTableCellElement
    ) {
        const buttons = menu.querySelectorAll<HTMLButtonElement>(
            '.search-results button'
        );
        const task = await fetchTaskById(getTaskIdFromElement(cell));
        const assignedUserIds = task?.assignees?.map((a) => a.id) || [];

        buttons.forEach((button) => {
            const assigneeId = parseInt(button.dataset.assigneeId!);
            button.style.display = assignedUserIds.includes(assigneeId)
                ? 'none'
                : 'flex';
        });
    }

    /**
     * Fetches avatar image for a username, caches the base64 image string.
     * @param username Username string
     * @returns Promise resolving to base64 encoded image string
     */
    function fetchAvatarImage(username: string): Promise<string> {
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
                            reject(
                                new Error('Failed to read avatar as base64')
                            );
                        }
                    };

                    reader.readAsDataURL(blob);
                },
                onerror: reject
            });
        });
    }

    /**
     * Sets up the search input field for assignees with a debounce on typing,
     * and triggers dynamic search with caching.
     * @param input Search input element
     * @param menu Assignees menu element containing search results container
     */
    async function setupAssigneesSearchInput(
        input: HTMLInputElement | null,
        menu: HTMLDivElement
    ) {
        if (!input) return;

        input.focus();

        const currentTask = await fetchTaskById(getTaskIdFromElement(input));

        const debouncedHandler = debounce(
            () => handleAssigneeSearch(input, menu, currentTask.project_id),
            300
        );

        input.addEventListener('input', debouncedHandler);

        // Initial search trigger to populate results
        handleAssigneeSearch(input, menu, currentTask.project_id);
    }

    /**
     * Handles the assignee search query, fetches suggestions, caches results,
     * and renders buttons for each assignee.
     * @param input Search input element
     * @param menu Assignees menu element
     * @param projectId Project ID for context
     */
    function handleAssigneeSearch(
        input: HTMLInputElement,
        menu: HTMLDivElement,
        projectId: number
    ) {
        const query = input.value.trim();
        const searchResults =
            menu.querySelector<HTMLDivElement>('.search-results');
        if (!searchResults) return;

        const cacheKey = `${projectId}:${query}`;

        if (assigneeSearchCache.has(cacheKey)) {
            renderAssigneeSearchResults(
                searchResults,
                assigneeSearchCache.get(cacheKey)!
            );
            return;
        }

        GM_xmlhttpRequest({
            url: `/api/v1/projects/${projectId}/projectusers?s=${encodeURIComponent(
                query
            )}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${getJwtToken()}` },
            responseType: 'json',
            onload: async (response) => {
                const assignees = (response.response as Assignee[]) ?? [];
                assigneeSearchCache.set(cacheKey, assignees);

                renderAssigneeSearchResults(searchResults, assignees);
            }
        });
    }

    /**
     * Renders assignee search results inside the search results container.
     * @param container Container for search results buttons
     * @param assignees Array of assignees to render
     */
    async function renderAssigneeSearchResults(
        container: HTMLDivElement,
        assignees: Assignee[]
    ) {
        // Ensure all avatars are fetched before rendering buttons (avoids flashes)
        await Promise.all(assignees.map((a) => fetchAvatarImage(a.username)));

        container.innerHTML = '';

        for (const assignee of assignees) {
            const avatar = await fetchAvatarImage(assignee.username);
            container.appendChild(createAssigneeSearchButton(assignee, avatar));
        }

        refreshAssigneesUI();
    }

    /**
     * Creates a button DOM element for an assignee search result with avatar and name.
     * Click to add to selected tasks.
     * @param assignee Assignee object
     * @param avatar Base64 avatar image string
     * @returns Button element
     */
    function createAssigneeSearchButton(
        assignee: Assignee,
        avatar: string
    ): HTMLButtonElement {
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

        // Click handler to add assignee to all bulk-selected tasks
        button.addEventListener('click', () => {
            const bulkRows =
                document.querySelectorAll<HTMLTableRowElement>(
                    'tr.bulk-selected'
                );

            for (const row of bulkRows) {
                const taskId = getTaskIdFromElement(row);
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

                if (
                    !taskCache[taskId].assignees!.some(
                        (a) => a.id === assignee.id
                    )
                ) {
                    taskCache[taskId].assignees!.push(assignee);
                }
            }

            button.style.display = 'none';
            refreshAssigneesUI();
        });

        return button;
    }

    /**
     * Sets up click event on document to close assignees menu when clicking outside.
     * @param cell Cell hosting the assignees menu
     * @param menu Assignees menu element
     */
    function setupAssigneesMenuOutsideClickHandler(
        cell: HTMLTableCellElement,
        menu: HTMLDivElement
    ) {
        document.addEventListener(
            'click',
            function outsideClickListener(event) {
                if (
                    !cell.contains(event.target as Node) &&
                    document.contains(event.target as Node)
                ) {
                    menu?.remove();
                    document.removeEventListener('click', outsideClickListener);
                    refreshAssigneesColumnUI();
                }
            }
        );
    }

    /**
     * Refreshes the entire assignees column UI to show updated assignees after editing.
     */
    async function refreshAssigneesColumnUI() {
        const colIndex = getCheckedColumnIndex(COLUMN_ASSIGNEES);
        if (colIndex === -1) return;

        const assigneeCells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(:has(#assigneesMenu))`
        );

        for (const cell of assigneeCells) {
            cell.innerHTML = '';

            const task = await fetchTaskById(getTaskIdFromElement(cell));
            if (!task.assignees) continue;

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

    //---------------- Labels Column Enhancement ----------------

    /**
     * Enhance labels column with click-to-edit functionality similar to assignees.
     */
    function enhanceLabelsColumn() {
        const labelColIndex = getCheckedColumnIndex(COLUMN_LABELS);
        if (labelColIndex === -1) return;

        const labelCells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${labelColIndex + 1}):not(.enhanced)`
        );

        labelCells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit', 'enhanced');
            attachLabelsMenuTrigger(cell);
        });
    }

    /**
     * Attaches click handler to open labels menu.
     * @param cell Cell element in labels column
     */
    function attachLabelsMenuTrigger(cell: HTMLTableCellElement) {
        cell.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;

            if (
                (target && target.closest('#labelsMenu')) ||
                !document.contains(target)
            ) {
                return; // Avoid reopening when clicking inside open menu or outside
            }

            closeLabelsMenu();

            openLabelsMenuForCell(cell);
        });
    }

    /** Closes any open labels menu */
    function closeLabelsMenu() {
        document.querySelector('#labelsMenu')?.remove();
    }

    /**
     * Opens the labels menu for a specific table cell.
     * @param cell The cell element in the labels column
     */
    function openLabelsMenuForCell(cell: HTMLTableCellElement) {
        cell.style.position = 'relative';

        const menu = createLabelsMenuElement();
        cell.appendChild(menu);

        openLabelsMenu(cell, menu);
    }

    /**
     * Creates the base DOM structure for the labels menu.
     * @returns Div element for labels menu
     */
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

    /**
     * Opens and initializes the labels menu: populates selected list,
     * sets up input search and outside click handler.
     * @param cell Cell element containing the menu
     * @param menu Labels menu div element
     */
    async function openLabelsMenu(
        cell: HTMLTableCellElement,
        menu: HTMLDivElement
    ) {
        menu.style.display = 'block';

        const inputField = menu.querySelector<HTMLInputElement>('.input');
        const selectedList = menu.querySelector<HTMLDivElement>(
            '#labelsSelectedList'
        );
        if (!selectedList) return;

        await refreshSelectedLabelsList(cell, selectedList);

        setupLabelsSearchInput(inputField, menu);
        setupLabelsMenuOutsideClickHandler(cell, menu);
    }

    /**
     * Sets click handler to close labels menu when clicking outside.
     * @param cell Cell hosting the menu
     * @param menu Labels menu div element
     */
    function setupLabelsMenuOutsideClickHandler(
        cell: HTMLTableCellElement,
        menu: HTMLDivElement
    ) {
        document.addEventListener(
            'click',
            function outsideClickListener(event) {
                if (
                    !cell.contains(event.target as Node) &&
                    document.contains(event.target as Node)
                ) {
                    menu?.remove();
                    document.removeEventListener('click', outsideClickListener);
                    refreshLabelsColumnUI();
                }
            }
        );
    }

    /**
     * Refreshes the entire labels column UI to reflect current labels of tasks.
     */
    async function refreshLabelsColumnUI() {
        const colIndex = getCheckedColumnIndex(COLUMN_LABELS);
        if (colIndex === -1) return;

        const labelCells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(:has(#labelsMenu))`
        );

        for (const cell of labelCells) {
            cell.innerHTML = '';
            const task = await fetchTaskById(getTaskIdFromElement(cell));
            if (!task.labels) continue;

            const wrapper = document.createElement('div');
            wrapper.className = 'label-wrapper';

            for (const label of task.labels) {
                const labelTag = document.createElement('span');
                labelTag.className = 'tag';
                labelTag.style.backgroundColor = '#' + label.hex_color;
                labelTag.style.color = isColorDark(label.hex_color)
                    ? COLOR_DARK
                    : COLOR_LIGHT;

                const textSpan = document.createElement('span');
                textSpan.textContent = label.title;

                labelTag.appendChild(textSpan);
                wrapper.appendChild(labelTag);
            }

            cell.appendChild(wrapper);
        }
    }

    /**
     * Sets up the labels search input with debounced search event.
     * @param input The input element for search
     * @param menu Labels menu total container
     */
    async function setupLabelsSearchInput(
        input: HTMLInputElement | null,
        menu: HTMLDivElement
    ) {
        if (!input) return;

        input.focus();

        const debouncedSearch = debounce(
            () => handleLabelSearch(input, menu),
            300
        );

        input.addEventListener('input', debouncedSearch);

        handleLabelSearch(input, menu);
    }

    /**
     * Handles label search query, performs API request and caches results.
     * @param input Search input element
     * @param menu Labels menu div element for search results rendering
     */
    function handleLabelSearch(input: HTMLInputElement, menu: HTMLDivElement) {
        const query = input.value.trim();
        const searchResults =
            menu.querySelector<HTMLDivElement>('.search-results');
        if (!searchResults) return;

        const cacheKey = query;

        if (labelSearchCache.has(cacheKey)) {
            renderLabelSearchResults(
                searchResults,
                labelSearchCache.get(cacheKey)!
            );
            return;
        }

        GM_xmlhttpRequest({
            url: `/api/v1/labels?s=${encodeURIComponent(query)}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${getJwtToken()}` },
            responseType: 'json',
            onload: async (response) => {
                const labels = (response.response as Label[]) ?? [];
                labelSearchCache.set(cacheKey, labels);
                renderLabelSearchResults(searchResults, labels);
            }
        });
    }

    /**
     * Renders label search results as buttons for selection.
     * @param container Container div for search result buttons
     * @param labels Array of labels from search results
     */
    async function renderLabelSearchResults(
        container: HTMLDivElement,
        labels: Label[]
    ) {
        container.innerHTML = '';

        for (const label of labels) {
            container.appendChild(createLabelSearchButton(label));
        }

        refreshLabelsUI();
    }

    /**
     * Creates a button element representing a label from search results.
     * Clicking adds the label to bulk-selected tasks.
     * @param label Label object
     * @returns Button element
     */
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

        const color = isColorDark(label.hex_color) ? COLOR_DARK : COLOR_LIGHT;

        button.innerHTML = `
            <span>
                <span class="tag search-result" style="background-color: #${label.hex_color}; color: ${color}">
                    <span>${label.title}</span>
                </span>
            </span>
            <span style="font-size:12px; color:#888;" class="hidden">Enter or click</span>
        `;

        // Handler to add label to all bulk-selected tasks
        button.addEventListener('click', () => {
            const bulkRows =
                document.querySelectorAll<HTMLTableRowElement>(
                    'tr.bulk-selected'
                );

            for (const row of bulkRows) {
                const taskId = getTaskIdFromElement(row);
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

    /**
     * Refreshes the labels UI by updating selected labels list and search results.
     */
    async function refreshLabelsUI() {
        const menu = document.querySelector<HTMLDivElement>('#labelsMenu');
        if (!menu) return;

        const cell = menu.closest('td');
        if (!cell) return;

        const selectedList = document.querySelector<HTMLDivElement>(
            '#labelsSelectedList'
        );
        if (!selectedList) return;

        await refreshSelectedLabelsList(cell, selectedList);
        await updateLabelsSearchResults(menu, cell);
    }

    /**
     * Updates the visibility of label search result buttons based on labels assigned to the current task.
     * @param menu Labels menu element
     * @param cell Related table cell
     */
    async function updateLabelsSearchResults(
        menu: HTMLDivElement,
        cell: HTMLTableCellElement
    ) {
        const buttons = menu.querySelectorAll<HTMLButtonElement>(
            '.search-results button'
        );
        const task = await fetchTaskById(getTaskIdFromElement(cell));
        const assignedLabelIds = task?.labels?.map((l) => l.id) || [];

        buttons.forEach((button) => {
            const labelId = parseInt(button.dataset.labelId!);
            button.style.display = assignedLabelIds.includes(labelId)
                ? 'none'
                : 'flex';
        });
    }

    /**
     * Refreshes the list of selected labels inside the labels menu.
     * @param cell Related table cell
     * @param selectedList Container div for selected labels
     */
    async function refreshSelectedLabelsList(
        cell: HTMLTableCellElement,
        selectedList: HTMLDivElement
    ) {
        selectedList.innerHTML = '';
        const task = await fetchTaskById(getTaskIdFromElement(cell));

        if (!task?.labels) return;

        for (const label of task.labels) {
            selectedList.appendChild(await createLabelItemElement(label));
        }
    }

    /**
     * Creates a label tag element with a delete button for the labels menu's selected list.
     * @param label Label object
     * @returns Span element representing the label tag
     */
    async function createLabelItemElement(
        label: Label
    ): Promise<HTMLSpanElement> {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.style.backgroundColor = `#${label.hex_color}`;
        tag.style.color = isColorDark(label.hex_color)
            ? COLOR_DARK
            : COLOR_LIGHT;

        const textSpan = document.createElement('span');
        textSpan.textContent = label.title;

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className =
            'base-button base-button--type-button delete is-small';

        tag.appendChild(textSpan);
        tag.appendChild(deleteButton);

        // Delete button click event to remove label from bulk-selected tasks
        deleteButton.addEventListener('click', () => {
            const bulkRows = document.querySelectorAll<HTMLTableRowElement>(
                'tbody tr.bulk-selected'
            );

            for (const row of bulkRows) {
                const taskId = getTaskIdFromElement(row);

                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: `/api/v1/tasks/${taskId}/labels/${label.id}`,
                    headers: {
                        Authorization: `Bearer ${getJwtToken()}`
                    }
                });

                taskCache[taskId].labels ??= [];
                taskCache[taskId].labels = taskCache[taskId].labels!.filter(
                    (l) => l.id !== label.id
                );
            }

            refreshLabelsUI();
        });

        return tag;
    }

    //---------------- Drag & Drop for Bulk Selected Rows ----------------

    let draggedRows: HTMLTableRowElement[] = [];

    // Handle clicks for row bulk selection
    document.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        const tr = target.closest('tr');
        const tbody = tr?.closest('tbody');
        if (!tr || !tbody) return;

        const allRows = Array.from(tbody.querySelectorAll('tr'));

        // Ignore clicks inside bulk-edit controls already selected
        if (target.closest('.bulk-edit')?.closest('.bulk-selected')) {
            return;
        } else if (!target.closest('.bulk-edit')) {
            event.preventDefault();
        }

        const lastClicked =
            tbody.querySelector<HTMLTableRowElement>('tr.last-clicked');

        if (event.shiftKey && lastClicked) {
            // Select range between last click and current
            allRows.forEach((row) => row.classList.remove('bulk-selected'));
            const startIdx = allRows.indexOf(lastClicked);
            const endIdx = allRows.indexOf(tr);
            const [minIndex, maxIndex] = [startIdx, endIdx].sort(
                (a, b) => a - b
            );
            for (let i = minIndex; i <= maxIndex; i++) {
                allRows[i].classList.add('bulk-selected');
            }
        } else if (event.ctrlKey || event.metaKey) {
            // Toggle selection on Ctrl+click or Cmd+click
            tr.classList.toggle('bulk-selected');
        } else {
            // Only select the clicked row
            allRows.forEach((row) => row.classList.remove('bulk-selected'));
            tr.classList.add('bulk-selected');
        }

        // Update last-clicked state
        allRows.forEach((row) => row.classList.remove('last-clicked'));
        tr.classList.add('last-clicked');
    });

    // Drag start event to collect all dragged rows
    document.addEventListener('dragstart', (event: DragEvent) => {
        const tr = (event.target as HTMLElement).closest(
            'tr'
        ) as HTMLTableRowElement | null;
        const tbody = tr?.closest('tbody');
        if (!tr || !tbody || !tr.classList.contains('bulk-selected')) {
            event.preventDefault();
            return;
        }

        draggedRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
        event.dataTransfer!.effectAllowed = 'move';
        event.dataTransfer!.setData('text/plain', 'dragging');
    });

    // Dragover event for rows and table
    document.addEventListener('dragover', async (event) => {
        const tr = (event.target as HTMLElement).closest<HTMLTableRowElement>(
            'tbody tr'
        );
        const table = (event.target as HTMLElement).closest('table');
        const projectMenu = (
            event.target as HTMLElement
        ).closest<HTMLAnchorElement>(
            'a.base-button.list-menu-link[href^="/projects/"]'
        );

        // Reject dragging onto self or any descendants to avoid cycles
        if (tr && !tr.classList.contains('bulk-selected')) {
            const draggedTaskIds = draggedRows.map(getTaskIdFromElement);
            const parentIds = await getAllParentTaskIds(
                getTaskIdFromElement(tr)
            );

            for (const parentId of parentIds) {
                if (draggedTaskIds.includes(parentId)) {
                    event.preventDefault();
                    event.dataTransfer!.dropEffect = 'none';
                    return;
                }
            }

            event.preventDefault();
            event.dataTransfer!.dropEffect = 'move';
            tr.classList.add('drag-over');
        } else if (table && !tr) {
            table.classList.add('drag-over');
            event.preventDefault();
            event.dataTransfer!.dropEffect = 'move';
        } else if (
            projectMenu &&
            parseInt(projectMenu.href.split('/').pop() ?? '0') > 0 &&
            parseInt(projectMenu.href.split('/').pop() ?? '0') !==
                getProjectId()
        ) {
            projectMenu.classList.add('drag-over');
            event.preventDefault();
            event.dataTransfer!.dropEffect = 'move';
        }
    });

    // Cleanup drag visual helper classes
    document.addEventListener('dragend', () => {
        document.querySelector('.drag-over')?.classList.remove('drag-over');
    });
    document.addEventListener('dragleave', () => {
        document.querySelector('.drag-over')?.classList.remove('drag-over');
    });

    // Drop event handler with logic for parent-child and project reassignment updates
    document.addEventListener('drop', async (event) => {
        const draggedTaskIds = draggedRows.map(getTaskIdFromElement);

        // Remove tasks that are children of others in dragged tasks (keep only top-level dragged)
        let topLevelDraggedIds = [...draggedTaskIds];
        for (const id of draggedTaskIds) {
            const parents = await getAllParentTaskIds(id);
            if (
                topLevelDraggedIds.some((otherId) => parents.includes(otherId))
            ) {
                topLevelDraggedIds = topLevelDraggedIds.filter((i) => i !== id);
            }
        }

        const tr = (event.target as HTMLElement).closest<HTMLTableRowElement>(
            'tbody tr'
        );
        const table = (event.target as HTMLElement).closest('table');
        const projectMenu = (
            event.target as HTMLElement
        ).closest<HTMLAnchorElement>(
            'a.base-button.list-menu-link[href^="/projects/"]'
        );

        if (tr) {
            const targetTaskId = getTaskIdFromElement(tr);

            await Promise.all(
                topLevelDraggedIds.map(async (draggedId) => {
                    const task = await fetchTaskById(draggedId);
                    if (!task || !targetTaskId) return;

                    const existingParentId =
                        task.related_tasks.parenttask?.[0]?.id;
                    if (existingParentId) {
                        // Remove old parent relation
                        await new Promise((resolve) =>
                            GM_xmlhttpRequest({
                                method: 'DELETE',
                                url: `/api/v1/tasks/${draggedId}/relations/parenttask/${existingParentId}`,
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${getJwtToken()}`
                                },
                                onload: () => resolve(null)
                            })
                        );
                    }

                    // Add new parent relation
                    await new Promise((resolve) =>
                        GM_xmlhttpRequest({
                            method: 'PUT',
                            url: `/api/v1/tasks/${draggedId}/relations`,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${getJwtToken()}`
                            },
                            data: JSON.stringify({
                                relation_kind: 'parenttask',
                                other_task_id: targetTaskId
                            }),
                            onload: () => resolve(null)
                        })
                    );
                })
            );

            clearTaskCache();

            await fetchTasksByIds(getAllTaskIdsFromTable());
            await reorderTaskRows(document.querySelectorAll('tbody tr'));
        } else if (table) {
            // Dropped on the table body (no target task)
            await Promise.all(
                topLevelDraggedIds.map(async (id) => {
                    const task = await fetchTaskById(id);
                    if (!task) return;
                    const oldParentId = task.related_tasks.parenttask?.[0]?.id;
                    if (oldParentId) {
                        await new Promise((resolve) =>
                            GM_xmlhttpRequest({
                                method: 'DELETE',
                                url: `/api/v1/tasks/${id}/relations/parenttask/${oldParentId}`,
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${getJwtToken()}`
                                },
                                onload: () => resolve(null)
                            })
                        );
                    }
                })
            );

            clearTaskCache();

            await fetchTasksByIds(getAllTaskIdsFromTable());
            await reorderTaskRows(document.querySelectorAll('tbody tr'));
        } else if (projectMenu) {
            const newProjectId = parseInt(
                projectMenu.href.split('/').pop() ?? '0'
            );
            await Promise.all(
                draggedTaskIds.map(
                    (id) =>
                        new Promise<void>((resolve) => {
                            GM_xmlhttpRequest({
                                method: 'POST',
                                url: `/api/v1/tasks/${id}`,
                                headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: `Bearer ${getJwtToken()}`
                                },
                                data: JSON.stringify({
                                    project_id: newProjectId
                                }),
                                onload: () => resolve()
                            });
                        })
                )
            );

            draggedRows.forEach((row) => row.remove());
            clearTaskCache();

            await fetchTasksByIds(getAllTaskIdsFromTable());
            await reorderTaskRows(document.querySelectorAll('tbody tr'));
        }
    });

    //---------------- Mutation Observer to Watch Row Class Changes ----------------

    /**
     * Initializes MutationObserver to watch for class changes on table rows.
     * Toggles draggable attribute when bulk-selected class is added or removed.
     */
    function initRowSelectionMutationObserver() {
        const observer = new MutationObserver((mutationRecords) => {
            for (const mutation of mutationRecords) {
                if (!isClassMutation(mutation)) continue;
                const target = mutation.target;
                if (!(target instanceof HTMLTableRowElement)) continue;

                handleRowClassAttributeChange(target, mutation.oldValue);
            }
        });

        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['class']
        });
    }

    /** Checks if a mutation record is a class attribute change */
    function isClassMutation(mutation: MutationRecord): boolean {
        return (
            mutation.type === 'attributes' && mutation.attributeName === 'class'
        );
    }

    /**
     * Handles the change of class attribute on a row and toggles draggable attribute.
     * @param row Table row element
     * @param oldClassValue The previous class attribute value
     */
    function handleRowClassAttributeChange(
        row: HTMLTableRowElement,
        oldClassValue: string | null | undefined
    ) {
        const currentlySelected = row.classList.contains('bulk-selected');
        const previouslySelected =
            oldClassValue?.includes('bulk-selected') ?? false;

        if (currentlySelected !== previouslySelected) {
            if (currentlySelected) {
                row.setAttribute('draggable', 'true');
            } else {
                row.removeAttribute('draggable');
            }
        }
    }

    /**
     * Retrieves hierarchical level of task defined by parent task depth.
     * 0 = top-level, 1 = child, etc.
     * @param taskId Task ID
     * @returns Promise resolving to level number (0 or more)
     */
    async function getTaskIndentLevel(taskId: number): Promise<number> {
        let level = 0;
        let currentTaskId = taskId;

        const baseTask = await fetchTaskById(currentTaskId);
        if (!baseTask) return level;

        while (true) {
            const currentTask = await fetchTaskById(currentTaskId);
            if (
                !currentTask.related_tasks.parenttask?.length ||
                currentTask.related_tasks.parenttask[0].project_id !==
                    baseTask.project_id
            ) {
                break;
            }
            currentTaskId = currentTask.related_tasks.parenttask[0].id;
            level++;
        }
        return level;
    }

    /**
     * Clears the task cache.
     */
    function clearTaskCache() {
        for (const key in taskCache) {
            delete taskCache[key];
        }
    }

    /**
     * Reorders task rows to reflect hierarchical task relationships visually.
     * Uses task level (indentation) to position rows below parent rows.
     * @param rows NodeList of table row elements
     */
    async function reorderTaskRows(rows: NodeListOf<HTMLTableRowElement>) {
        const rowData = await Promise.all(
            [...rows].map(async (row) => {
                const task = await fetchTaskById(getTaskIdByRow(row));
                const level = await getTaskIndentLevel(task.id);
                return { row, level };
            })
        );

        // Sort rows by level ascending, reverse to maintain order of insertion after
        rowData.reverse().sort((a, b) => a.level - b.level);

        for (const { row, level } of rowData) {
            if (level !== 0) {
                const task = await fetchTaskById(getTaskIdByRow(row));
                const parentId = task.related_tasks.parenttask![0].id;
                const parentRow = [...rows].find(
                    (r) => getTaskIdByRow(r) === parentId
                );
                if (parentRow) {
                    parentRow.insertAdjacentElement('afterend', row);
                }
            }
            row.style.setProperty('--level', level.toString());
        }
    }

    /**
     * Retrieves all parent task IDs for a given task, climbing up until no parent.
     * @param taskId Task ID
     * @returns Promise resolving to array of parent task IDs ordered from closest to farthest
     */
    async function getAllParentTaskIds(taskId: number): Promise<number[]> {
        let currentTaskId = taskId;
        const parentIds: number[] = [];

        while (true) {
            const task = await fetchTaskById(currentTaskId);
            if (!task.related_tasks?.parenttask?.length) break;
            const parentId = task.related_tasks.parenttask[0].id;
            parentIds.push(parentId);
            currentTaskId = parentId;
        }
        return parentIds;
    }

    //---------------- General Enhancement and UI Setup ----------------

    /**
     * Enhances all supported table columns by applying their respective feature enhancement functions.
     */
    function enhanceAllTableColumns() {
        enhanceEditableTitles();
        enhanceDoneColumn();
        enhancePriorityColumn();
        enhanceDueDateColumn();
        enhanceStartDateColumn();
        enhanceEndDateColumn();
        enhanceProgressColumn();
        enhanceAssigneesColumn();
        enhanceLabelsColumn();
    }

    /** Fixes horizontal overflow issue for tables inside scrollable containers */
    function fixTableHorizontalOverflow() {
        const overflowContainer = document
            .querySelector('table')
            ?.closest<HTMLElement>('.has-horizontal-overflow');
        if (overflowContainer) {
            overflowContainer.style.overflow = 'visible';
        }
    }

    /** Handles DOM changes by re-enhancing table elements and ensuring proper ordering */
    async function handleDomMutations(observer: MutationObserver) {
        if (!document.querySelector('table tbody tr td')) {
            return; // No table detected, skip
        }

        if (
            document.querySelector('table tbody tr td') &&
            !document.querySelector('tr[style*="--level"]')
        ) {
            // Cache clearing and fetching tasks for first load or refresh
            clearTaskCache();
            await fetchTasksByIds(getAllTaskIdsFromTable());

            const rows =
                document.querySelectorAll<HTMLTableRowElement>('tbody tr');
            await reorderTaskRows(rows);
        }

        observer.disconnect();

        enhanceAllTableColumns();
        fixTableHorizontalOverflow();

        observer.observe(document.body, observerConfig);
    }

    // Mutation observer configuration for attributes, childList and subtree watching
    const observerConfig = { attributes: true, childList: true, subtree: true };

    // Create MutationObserver instance
    const mutationObserver = new MutationObserver((mutations, observer) => {
        handleDomMutations(observer);
    });

    // Start observing DOM for changes
    mutationObserver.observe(document.body, observerConfig);
    initRowSelectionMutationObserver();

    //---------------- Misc ----------------

    /**
     * Creates a debounced version of a function; delays execution until after specified delay.
     * @param func Function to debounce
     * @param delay Delay in milliseconds
     * @returns Debounced function
     */
    function debounce<T extends (...args: any[]) => void>(
        func: T,
        delay = 300
    ) {
        let timeoutId: ReturnType<typeof setTimeout> | null;

        return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Creates a throttled version of a function; prevents frequent calls.
     * @param func Function to throttle
     * @param limit Minimum time between calls
     * @returns Throttled function
     */
    function throttle<T extends (...args: any[]) => void>(
        func: T,
        limit: number
    ) {
        let inThrottle = false;
        return function (this: any, ...args: Parameters<T>) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }

    // Add necessary CSS styles for the enhanced UI elements
    GM_addStyle(`
        .edit-title {
            border: none;
            background: transparent;
            color: transparent;
            transform: rotate(90deg);
            pointer-events: none;
        }
        tbody tr:hover .editable-span.hidden + .edit-title {
            pointer-events: all;
            color: rgba(235, 233, 229, 0.9);
            cursor: pointer;
        }
        .bulk-selected {
            background-color: var(--table-row-hover-background-color);
        }
        .drag-over {
            outline: 2px dashed #007bff;
        }
        tbody td:hover {
            background: var(--pre-background);
        }
        .hidden {
            display: none;
        }
        .search-results button {
            background-color: transparent;
        }
        .search-results button:hover {
            background-color: var(--table-row-hover-background-color);
        }
        tbody tr td:first-child {
            padding-left: calc(0.75em + 20px * var(--level));
        }
    `);
})();
