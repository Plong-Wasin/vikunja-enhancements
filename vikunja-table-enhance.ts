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

    const IDENTIFY = 0; // สำหรับ "#" หรือไม่ระบุ
    const DONE = 1; // "Done"
    const TITLE = 2; // "Title"
    const PRIORITY = 3; // "Priority" /
    const LABELS = 4; // "Labels" /
    const ASSIGNEES = 5; // "Assignees" /
    const DUE_DATE = 6; // "Due Date" /
    const START_DATE = 7; // "Start Date" /
    const END_DATE = 8; // "End Date" /
    const PROGRESS = 9; // "Progress" /
    const DONE_AT = 10; // "Done At"
    const CREATED = 11; // "Created"
    const UPDATED = 12; // "Updated"
    // ICON COLOR RGB 235,233,229
    const CREATED_BY = 13; // "Created By"

    const taskCache: Record<number, Task> = {};
    const avatarCache: Record<string, string> = {};
    const assigneeSearchCache = new Map<string, Assignee[]>();
    const labelSearchCache = new Map<string, Label[]>();

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
    const LIGHT = 'hsl(220, 13%, 91%)'; // grey-200
    const DARK = 'hsl(215, 27.9%, 16.9%)'; // grey-800

    function getViewId(): number {
        return +(window.location.pathname.split('/').pop() ?? 0);
    }

    function getProjectId(): number {
        const pathParts = window.location.pathname.split('/');
        const projectId = pathParts[2];
        return +projectId;
    }

    function getJwtToken() {
        return localStorage.getItem('token');
    }

    function isTableView(): boolean {
        return !!document.querySelector('.fa-table-cells');
    }

    function log(...args: any[]) {
        console.log('%c[Vikunja]', 'color: #ebd927', ...args);
    }
    function ready(fn: any) {
        if (document.readyState != 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }
    async function sleep(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Collects the indices of all checked checkboxes inside `.columns-filter`.
     *
     * @returns An array of indices representing the positions of checked checkboxes.
     */
    function getCheckedColumnIndices(): number[] {
        const checkedIndices: number[] = [];

        document
            .querySelectorAll<HTMLInputElement>('.columns-filter input')
            .forEach((input, index) => {
                if (input.checked) {
                    checkedIndices.push(index);
                }
            });

        return checkedIndices;
    }

    /**
     * Extract the task ID from a table row element.
     * @param tr - The table row containing the task link.
     * @returns The task ID as a number, or 0 if not found.
     */
    function getTaskIdByTr(tr: HTMLTableRowElement | null): number {
        if (!tr) return 0;

        const link = tr.querySelector<HTMLAnchorElement>('a');
        if (!link) return 0;

        const idStr = link.href.split('/').pop();
        return idStr ? Number(idStr) : 0;
    }

    /**
     * Extract the task ID from any element inside the row.
     * @param el - An element inside the table row.
     * @returns The task ID as a number, or 0 if not found.
     */
    function getTaskIdFromElement(el: HTMLElement): number {
        const tr = el.closest('tr');
        return getTaskIdByTr(tr);
    }

    function getDoneText(): string {
        return (
            document.querySelectorAll<HTMLSpanElement>(
                '.columns-filter span'
            )[2]?.textContent ?? ''
        );
    }

    /**
     * Returns the position of a checked column, or -1 if not checked.
     *
     * @param column - The column index to check.
     * @returns The index of the checked column, or -1 if not checked.
     */
    function getCheckedColumnIndex(column: number): number {
        return getCheckedColumnIndices().indexOf(column);
    }

    /**
     * Entry point: Enhance editable titles in the table.
     */
    function enhanceEditableTitles() {
        const titleIndex = getCheckedColumnIndex(TITLE);
        if (titleIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${titleIndex + 1}):not(.enhanced)`
        );

        cells.forEach(initEditableCell);
    }

    /**
     * Initialize editable behavior for a single table cell.
     * @param td - The table cell element.
     */
    function initEditableCell(td: HTMLTableCellElement) {
        td.style.cursor = 'pointer';
        td.classList.add('enhanced');
        const link = td.querySelector<HTMLAnchorElement>('a');
        if (!link) return;

        const div = document.createElement('div');
        td.appendChild(div);
        styleCell(div);

        div.appendChild(link);

        const span = createEditableSpan();
        div.appendChild(span);

        const editBtn = createEditButton(link, span);
        div.appendChild(editBtn);

        div.addEventListener('dblclick', () => activateEditMode(link, span));

        attachLinkEvents(link, span);
    }

    /**
     * Apply layout styling to the table cell.
     */
    function styleCell(td: HTMLElement) {
        td.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    }

    /**
     * Create an editable span (hidden by default).
     */
    function createEditableSpan(): HTMLSpanElement {
        const span = document.createElement('span');
        span.contentEditable = 'true';
        span.classList.add('hidden');
        span.classList.add('editable-span');
        return span;
    }

    /**
     * Create the edit button for a link.
     * @param link - The anchor element to edit.
     * @param span - The editable span element.
     */
    function createEditButton(link: HTMLAnchorElement, span: HTMLSpanElement) {
        const btn = document.createElement('button');
        btn.innerHTML = '✎';
        btn.className = 'edit-title';
        btn.addEventListener('click', () => activateEditMode(link, span));
        return btn;
    }

    /**
     * Switch link into editable mode.
     */
    function activateEditMode(link: HTMLAnchorElement, span: HTMLSpanElement) {
        span.textContent = link.textContent || '';
        link.classList.add('hidden');
        span.classList.remove('hidden');
        focusCursorToEnd(span);
    }

    /**
     * Place cursor at the end of a contenteditable element.
     */
    function focusCursorToEnd(element: HTMLElement) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);

        const selection = window.getSelection();
        if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
        }

        element.focus();
    }

    /**
     * Attach events for saving or canceling edits.
     */
    function attachLinkEvents(link: HTMLAnchorElement, span: HTMLSpanElement) {
        span.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                span.blur();
                saveChanges(link, span);
            } else if (e.key === 'Escape') {
                cancelEdit(link, span);
            }
        });

        span.addEventListener('blur', () => saveChanges(link, span));
    }

    function colorIsDark(color: string | undefined) {
        if (typeof color === 'undefined') {
            return true; // Defaults to dark
        }

        if (color === '#' || color === '') {
            return true; // Defaults to dark
        }

        if (color.substring(0, 1) !== '#') {
            color = '#' + color;
        }

        const rgb = parseInt(color.substring(1, 7), 16); // convert rrggbb to decimal
        const r = (rgb >> 16) & 0xff; // extract red
        const g = (rgb >> 8) & 0xff; // extract green
        const b = (rgb >> 0) & 0xff; // extract blue

        // this is a quick and dirty implementation of the WCAG 3.0 APCA color contrast formula
        // see: https://gist.github.com/Myndex/e1025706436736166561d339fd667493#andys-shortcut-to-luminance--lightness
        const Ys =
            Math.pow(r / 255.0, 2.2) * 0.2126 +
            Math.pow(g / 255.0, 2.2) * 0.7152 +
            Math.pow(b / 255.0, 2.2) * 0.0722;

        return Math.pow(Ys, 0.678) >= 0.5;
    }

    /**
     * Save changes (send API request if text is modified).
     */
    function saveChanges(link: HTMLAnchorElement, span: HTMLSpanElement) {
        const newText = span.textContent?.trim() || '';
        const originalText = link.textContent || '';

        if (!newText || newText === originalText) {
            resetView(link, span, originalText);
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

        resetView(link, span, newText);
    }

    /**
     * Cancel editing and restore the original view.
     */
    function cancelEdit(link: HTMLAnchorElement, span: HTMLSpanElement) {
        resetView(link, span, link.textContent || '');
    }

    /**
     * Restore link and hide editable span.
     */
    function resetView(
        link: HTMLAnchorElement,
        span: HTMLSpanElement,
        text: string
    ) {
        link.textContent = text;
        link.classList.remove('hidden');
        span.classList.add('hidden');
    }

    /**
     * Enhance the "Done" column with checkboxes.
     */
    function enhanceDoneColumn() {
        const doneIndex = getCheckedColumnIndex(DONE);
        if (doneIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${doneIndex + 1}):not(.enhanced)`
        );

        cells.forEach(setupDoneCell);
    }

    /**
     * Setup a single "Done" cell with checkbox + label.
     */
    function setupDoneCell(cell: HTMLTableCellElement) {
        cell.classList.add('enhanced');
        const hasDoneElement = Boolean(
            cell.querySelector<HTMLDivElement>('.is-done--small')
        );

        cell.innerHTML = buildDoneCellHTML(hasDoneElement);

        const doneElement =
            cell.querySelector<HTMLDivElement>('.is-done--small');
        const inputElement = cell.querySelector<HTMLInputElement>('input');

        if (!doneElement || !inputElement) return;

        syncDoneState(doneElement, inputElement.checked);
        bindDoneEvents(inputElement, cell.closest('tr')!);
    }

    /**
     * Build HTML for a "Done" cell.
     */
    function buildDoneCellHTML(isChecked: boolean): string {
        const doneLabel = `
        <div data-v-85863e0a="" data-v-dd8cbb24="" 
             class="is-done is-done--small" 
             style="flex: 1; width: 100%;">Done</div>
    `;

        return `
        <div style="display: flex; align-items: center; gap: 6px;">
            <input class="bulk-edit" type="checkbox" ${
                isChecked ? 'checked' : ''
            }/>
            ${doneLabel}
        </div>
    `;
    }

    /**
     * Attach change event to a checkbox and handle single or bulk updates.
     */
    function bindDoneEvents(input: HTMLInputElement, tr: HTMLTableRowElement) {
        input.addEventListener('change', () => {
            const isChecked = input.checked;
            const tbody = tr.closest('tbody');
            if (!tbody) return;

            if (tr.classList.contains('bulk-selected')) {
                updateBulkRowsDone(tbody, isChecked);
            } else {
                updateSingleRowDone(tr, isChecked);
            }
        });
    }

    /**
     * Update a single row checkbox and send API request.
     */
    function updateSingleRowDone(tr: HTMLTableRowElement, isChecked: boolean) {
        const doneElement = tr.querySelector<HTMLDivElement>('.is-done--small');
        if (!doneElement) return;

        syncDoneState(doneElement, isChecked);

        const taskId = getTaskIdByTr(tr);
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/${taskId}`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ done: isChecked })
        });
    }

    /**
     * Update all rows with the 'bulk-selected' class to match checkbox state.
     */
    function updateBulkRowsDone(
        tbody: HTMLTableSectionElement,
        isChecked: boolean
    ) {
        const bulkRows = Array.from(
            tbody.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected')
        );

        // Send bulk API request
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/bulk`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                done: isChecked,
                task_ids: bulkRows.map(getTaskIdByTr)
            })
        });

        // Update UI for all bulk rows
        bulkRows.forEach((row) => {
            const rowInput = row.querySelector<HTMLInputElement>(
                'input[type="checkbox"]'
            );
            const rowDone =
                row.querySelector<HTMLDivElement>('.is-done--small');
            if (rowInput && rowDone) {
                rowInput.checked = isChecked;
                syncDoneState(rowDone, isChecked);
            }
        });
    }

    /**
     * Show or hide the "Done" label based on checkbox state.
     */
    function syncDoneState(doneElement: HTMLDivElement, isChecked: boolean) {
        doneElement.classList.toggle('hidden', !isChecked);
    }

    /**
     * Retrieve all task IDs from the table rows.
     */
    function getTaskIdsFromTable(): number[] {
        const taskLinks =
            document.querySelectorAll<HTMLAnchorElement>('tbody tr a');
        return [
            ...new Set(
                Array.from(taskLinks).map((link) => getTaskIdFromElement(link))
            )
        ];
    }

    async function fetchFromApiDynamic(taskIds: number[]): Promise<Task[]> {
        const result: Task[] = [];
        let remainingIds = [...taskIds];

        while (remainingIds.length > 0) {
            // ส่ง request กับทุก id ที่เหลือ
            const res: Tampermonkey.Response<any> = await new Promise(
                (resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url:
                            '/api/v1/tasks/all?filter=' +
                            encodeURIComponent(
                                'id in ' + remainingIds.join(',')
                            ),
                        headers: {
                            Authorization: `Bearer ${getJwtToken()}`,
                            'Content-Type': 'application/json'
                        },
                        onload: (r) => resolve(r),
                        onerror: (e) => reject(e)
                    });
                }
            );

            const data = JSON.parse(res.responseText);
            result.push(...data);

            // ลบ id ที่ได้แล้ว
            const fetchedIds = data.map((task: any) => task.id);
            remainingIds = remainingIds.filter(
                (id) => !fetchedIds.includes(id)
            );

            // ถ้า API คืนค่ามาน้อยกว่า request → ไม่มี id เหลือ → break
            if (fetchedIds.length === 0) break;
        }

        return result;
    }

    async function fetchTasksByIds(taskIds: number[]): Promise<Task[]> {
        const idsToFetch = taskIds.filter((id) => !taskCache[id]);

        if (idsToFetch.length > 0) {
            const fetchedTasks = await fetchFromApiDynamic(idsToFetch);
            fetchedTasks.forEach((task) => {
                taskCache[task.id] = task;
            });
        }

        return taskIds.map((id) => taskCache[id]);
    }

    async function fetchTaskById(taskId: number): Promise<Task> {
        return (await fetchTasksByIds([taskId]))[0];
    }

    /**
     * Enhance the "Priority" column by replacing cells with dropdown selectors.
     */
    async function enhancePriorityColumn() {
        const priorityIndex = getCheckedColumnIndex(PRIORITY);
        if (priorityIndex === -1) return;

        const taskData = await fetchTasksByIds(getTaskIdsFromTable());

        const tbody = document.querySelector('tbody');
        if (!tbody) return;

        const rows = document.querySelectorAll<HTMLTableRowElement>('tbody tr');
        rows.forEach((row) => setupPriorityCell(row, taskData, priorityIndex));
    }

    /**
     * Setup priority cell for a single row.
     */
    function setupPriorityCell(
        row: HTMLTableRowElement,
        taskData: Task[],
        priorityIndex: number
    ) {
        const taskId = getTaskIdByTr(row);
        const td = row.children[priorityIndex];
        if (td.classList.contains('enhanced')) return;
        td.classList.add('enhanced');

        const wrapper = document.createElement('div');
        wrapper.classList.add('select');

        const select = createPrioritySelect();
        const currentPriority =
            taskData.find((task) => task.id === taskId)?.priority ?? 0;
        updateSelectStyle(select, currentPriority);

        wrapper.appendChild(select);
        td.innerHTML = '';
        td.appendChild(wrapper);

        bindPriorityEvents(select, row);
    }

    /**
     * Create a <select> element for priority options.
     */
    function createPrioritySelect(): HTMLSelectElement {
        const select = document.createElement('select');
        select.classList.add('priority-select');
        select.classList.add('bulk-edit');
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
     * Update the <select> element value and style based on priority.
     */
    function updateSelectStyle(select: HTMLSelectElement, priority: number) {
        select.value = priority.toString();
        if (select.selectedOptions[0]) {
            select.style.color = select.selectedOptions[0].style.color;
        }
    }

    /**
     * Bind event handlers for priority change (single vs bulk update).
     */
    function bindPriorityEvents(
        select: HTMLSelectElement,
        row: HTMLTableRowElement
    ) {
        select.addEventListener('change', () => {
            const tbody = row.closest('tbody');
            if (!tbody) return;

            const priority = +select.value;
            updateBulkRowsPriority(tbody, priority);
            updateSelectStyle(select, priority);
        });
    }

    /**
     * Update all bulk-selected rows' priority via API + update UI.
     */
    function updateBulkRowsPriority(
        tbody: HTMLTableSectionElement,
        priority: number
    ) {
        const bulkRows = Array.from(
            tbody.querySelectorAll<HTMLTableRowElement>('tr.bulk-selected')
        );

        // Send bulk API request
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/bulk`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                priority,
                task_ids: bulkRows.map(getTaskIdByTr)
            })
        });

        // Update UI for all bulk rows
        bulkRows.forEach((row) => {
            const select =
                row.querySelector<HTMLSelectElement>('.priority-select');
            if (select) updateSelectStyle(select, priority);
        });
    }
    function utcToDatetimeLocal(utcString: string) {
        const date = new Date(utcString);

        const pad = (num: number) => String(num).padStart(2, '0');

        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1); // Months are 0-based
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());

        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    /**
     * Enhance a date column (start_date or due_date) with datetime-local inputs.
     * @param columnKey - The constant for the column (START_DATE or DUE_DATE)
     * @param className - The CSS class for the input element
     * @param dateField - The field name in task data ('start_date' or 'due_date')
     */
    async function enhanceDateColumn(
        columnKey: number,
        className: string,
        dateField: TaskDateField
    ) {
        const colIndex = getCheckedColumnIndex(columnKey);
        if (colIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(.enhanced)`
        );

        const taskData = await fetchTasksByIds(getTaskIdsFromTable());

        cells.forEach((cell) =>
            setupDateCell(cell, taskData, className, dateField)
        );
    }

    /**
     * Setup a single date cell with input element and change handler.
     */
    function setupDateCell(
        cell: HTMLTableCellElement,
        taskData: Task[],
        className: string,
        dateField: TaskDateField
    ) {
        cell.classList.add('enhanced');
        const taskId = getTaskIdFromElement(cell);
        const dateValue = taskData.find((task) => task.id === taskId)?.[
            dateField
        ];

        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.classList.add(className);
        input.classList.add('bulk-edit');

        if (dateValue && dateValue !== '0001-01-01T00:00:00Z') {
            input.value = utcToDatetimeLocal(dateValue);
        }

        cell.innerHTML = '';
        cell.appendChild(input);

        input.addEventListener('change', () =>
            handleDateChange(cell, input, dateField)
        );
    }

    /**
     * Handle change event for a date input (single or bulk update).
     */
    function handleDateChange(
        cell: HTMLTableCellElement,
        input: HTMLInputElement,
        dateField: TaskDateField
    ) {
        const tr = cell.closest('tr');
        if (!tr) return;

        const newDateUTC = new Date(input.value).toISOString();

        if (tr.classList.contains('bulk-selected')) {
            const rows = Array.from(
                document.querySelectorAll<HTMLTableRowElement>(
                    'tbody tr.bulk-selected'
                )
            );
            const taskIds = rows.map(getTaskIdByTr);

            // Bulk API request
            GM_xmlhttpRequest({
                method: 'POST',
                url: `/api/v1/tasks/bulk`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({
                    [dateField]: newDateUTC,
                    task_ids: taskIds
                })
            });

            // Update UI for all bulk-selected rows
            rows.forEach((row) => {
                const rowInput = row.querySelector<HTMLInputElement>(
                    `.${input.className}`
                );
                if (rowInput) rowInput.value = input.value;
            });
        } else {
            const taskId = getTaskIdFromElement(cell);
            GM_xmlhttpRequest({
                method: 'POST',
                url: `/api/v1/tasks/${taskId}`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ [dateField]: newDateUTC })
            });
        }
    }

    /**
     * Wrapper functions for specific columns
     */
    async function enhanceDueDateColumn() {
        await enhanceDateColumn(
            DUE_DATE,
            'due-date-datetime-local',
            'due_date'
        );
    }

    async function enhanceStartDateColumn() {
        await enhanceDateColumn(
            START_DATE,
            'start-date-datetime-local',
            'start_date'
        );
    }

    async function enhanceEndDateColumn() {
        await enhanceDateColumn(
            END_DATE,
            'end-date-datetime-local',
            'end_date'
        );
    }

    /**
     * Enhance the "Progress" column to allow inline editing on double-click.
     */
    function enhanceProgressColumn() {
        const colIndex = getCheckedColumnIndex(PROGRESS);
        if (colIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(.enhanced)`
        );

        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit');
            cell.classList.add('enhanced');
            attachProgressEditor(cell);
        });
    }

    /**
     * Attach double-click editor to a single cell.
     */
    function attachProgressEditor(cell: HTMLTableCellElement) {
        cell.addEventListener('dblclick', function (e) {
            if (e.target && (e.target as HTMLElement).tagName === 'INPUT')
                return;
            const currentProgress = parseInt(cell.innerText) || 0;
            const input = createProgressInput(currentProgress);
            const label = document.createElement('span');
            label.innerText = '%';

            cell.innerHTML = '';
            cell.appendChild(input);
            cell.appendChild(label);

            // Focus and select the input for convenience
            input.focus();
            input.select();

            // Bind events to handle saving/canceling
            bindProgressInputEvents(input, cell, currentProgress);
        });
    }

    /**
     * Create an input element for editing progress.
     */
    function createProgressInput(value: number): HTMLInputElement {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = value.toString();
        input.min = '0';
        input.max = '100';
        input.classList.add('edit-progress');
        return input;
    }

    /**
     * Check if the given progress value is valid (0–100).
     */
    function isValidProgress(progress: number): boolean {
        return !isNaN(progress) && progress >= 0 && progress <= 100;
    }

    /**
     * Send API request to update progress for multiple tasks (bulk).
     */
    function updateBulkTaskProgress(
        taskIds: number[],
        newProgress: number
    ): void {
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
     * Update the UI for bulk-selected rows after saving.
     */
    function updateBulkProgressUI(newProgress: number): void {
        const colIndex = getCheckedColumnIndex(PROGRESS);
        document
            .querySelectorAll<HTMLTableRowElement>('tbody tr.bulk-selected')
            .forEach((row) => {
                const td = row.querySelector<HTMLTableCellElement>(
                    `td:nth-child(${colIndex + 1})`
                );
                if (td) td.innerText = `${newProgress}%`;
            });
    }

    /**
     * Bind event listeners for the progress input element.
     */
    function bindProgressInputEvents(
        input: HTMLInputElement,
        cell: HTMLTableCellElement,
        originalProgress: number
    ) {
        /**
         * Save the progress value to the API and update the cell text.
         */
        const saveProgress = () => {
            const newProgress = Math.round(parseInt(input.value) / 10) * 10;

            if (isValidProgress(newProgress)) {
                const tr = cell.closest('tr');
                const taskId = getTaskIdFromElement(cell);

                // Collect all bulk-selected task IDs
                const taskIds = Array.from(
                    document.querySelectorAll<HTMLTableRowElement>(
                        'tbody tr.bulk-selected'
                    )
                ).map(getTaskIdByTr);

                // Bulk update API request
                updateBulkTaskProgress(taskIds, newProgress);

                // Update UI for all bulk-selected rows
                updateBulkProgressUI(newProgress);
            } else {
                // Revert to original value if invalid
                cell.innerText = `${originalProgress}%`;
            }
        };

        // Save on Enter, cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') saveProgress();
            else if (e.key === 'Escape')
                cell.innerText = `${originalProgress}%`;
        });

        // Save on blur (clicking outside)
        input.addEventListener('blur', saveProgress);
    }
    /**
     * Entry point: Enhance the assignees column by making cells clickable and attaching the editor.
     */
    function enhanceAssigneesColumn() {
        const colIndex = getCheckedColumnIndex(ASSIGNEES);
        if (colIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(.enhanced)`
        );

        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit');
            cell.classList.add('enhanced');
            attachAssigneesEditor(cell);
        });
    }

    /**
     * Attach click listener that opens the assignees menu.
     */
    function attachAssigneesEditor(cell: HTMLTableCellElement) {
        cell.addEventListener('click', (e) => {
            const target = e.target as HTMLElement | null;

            // Prevent reopening when clicking inside the menu
            if (
                (target && target.closest('#assigneesMenu')) ||
                !document.contains(target)
            )
                return;

            closeExistingAssigneesMenu();
            openAssignessMenuForCell(cell);
        });
    }

    /**
     * Close any currently opened assignees menu.
     */
    function closeExistingAssigneesMenu() {
        document.querySelector('#assigneesMenu')?.remove();
    }

    /**
     * Open menu for a specific table cell.
     */
    function openAssignessMenuForCell(cell: HTMLTableCellElement) {
        cell.style.position = 'relative';
        const assigneesMenu = createAssigneesMenu();
        cell.appendChild(assigneesMenu);

        openAssigneesMenu(cell, assigneesMenu);
    }

    /**
     * Create the base DOM structure for the assignees menu.
     */
    function createAssigneesMenu(): HTMLDivElement {
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
            zIndex: 10000,
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            cursor: 'default',
            top: '0',
            left: '0'
        });

        // Selected assignees list
        const selectedList = document.createElement('div');
        selectedList.className = 'selected-list';
        selectedList.id = 'assigneesSelectedList';

        // Input wrapper
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

        // Search results container
        const searchResults = document.createElement('div');
        searchResults.className = 'search-results';

        menu.appendChild(selectedList);
        menu.appendChild(control);
        menu.appendChild(searchResults);

        return menu;
    }

    /**
     * Debounce utility: delays execution until after delay has passed.
     */
    function debounce<T extends (...args: any[]) => void>(
        func: T,
        delay = 300
    ) {
        let timeout: ReturnType<typeof setTimeout> | null;

        return function (this: ThisParameterType<T>, ...args: Parameters<T>) {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }

    /**
     * Throttle utility: ensures function is not called more than once in limit.
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

    /**
     * Show the menu and initialize its content.
     */
    async function openAssigneesMenu(
        cell: HTMLTableCellElement,
        assigneesMenu: HTMLDivElement
    ) {
        assigneesMenu.style.display = 'block';

        const input = assigneesMenu.querySelector<HTMLInputElement>('.input');
        const assigneesSelectedList =
            assigneesMenu.querySelector<HTMLDivElement>(
                '#assigneesSelectedList'
            );
        if (!assigneesSelectedList) return;

        await refreshAssigneesList(cell, assigneesSelectedList);

        setupAssigneesSearchInput(input, assigneesMenu);
        setupAssigneesOutsideClickHandler(cell, assigneesMenu);
    }

    /**
     * Refresh the list of selected assignees inside the menu.
     */
    async function refreshAssigneesList(
        cell: HTMLTableCellElement,
        assigneesSelectedList: HTMLDivElement
    ) {
        assigneesSelectedList.innerHTML = '';
        const task = await fetchTaskById(getTaskIdFromElement(cell));

        if (task?.assignees) {
            for (const assignee of task.assignees) {
                assigneesSelectedList.appendChild(
                    await createAssigneeItem(assignee)
                );
            }
        }
    }

    /**
     * Create a selected assignee item with avatar and remove button.
     */
    async function createAssigneeItem(
        assignee: Assignee
    ): Promise<HTMLDivElement> {
        const div = document.createElement('div');
        div.className = 'user m-2';
        Object.assign(div.style, {
            position: 'relative',
            display: 'inline-block'
        });

        const img = document.createElement('img');
        img.height = 30;
        img.width = 30;
        img.className = 'avatar v-popper--has-tooltip';
        img.style.borderRadius = '100%';
        img.style.verticalAlign = 'middle';
        img.src = await fetchAvatar(assignee.username);
        img.title = assignee.name || assignee.username;

        const button = document.createElement('button');
        button.type = 'button';
        button.className =
            'base-button base-button--type-button remove-assignee';
        button.innerText = 'X';
        Object.assign(button.style, {
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

        div.appendChild(img);
        div.appendChild(button);
        button.addEventListener('click', () => {
            const tr = button.closest('tr');
            if (!tr) return;
            if (tr.classList.contains('bulk-selected')) {
                const rows =
                    document.querySelectorAll<HTMLTableRowElement>(
                        'tr.bulk-selected'
                    );
                for (const row of rows) {
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
            } else {
                const taskId = getTaskIdFromElement(tr);
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
            updateAndRefreshAssignees();
        });
        return div;
    }

    /**
     * Update the search results and refresh the selected assignees list.
     */
    async function updateAndRefreshAssignees() {
        const assigneesMenu =
            document.querySelector<HTMLDivElement>('#assigneesMenu');
        if (!assigneesMenu) return;

        const cell = assigneesMenu.closest('td');
        if (!cell) return;

        const assigneesSelectedList = document.querySelector<HTMLDivElement>(
            '#assigneesSelectedList'
        );
        if (!assigneesSelectedList) return;

        await updateAssigneesSearchResults(assigneesMenu, cell);
        await refreshAssigneesList(cell, assigneesSelectedList);
    }

    async function updateAssigneesSearchResults(
        assigneesMenu: HTMLDivElement,
        cell: HTMLTableCellElement
    ) {
        const buttons = assigneesMenu.querySelectorAll<HTMLButtonElement>(
            '.search-results button'
        );
        const task = await fetchTaskById(getTaskIdFromElement(cell));
        const taskAssignees = task?.assignees || [];

        buttons.forEach((btn) => {
            const assigneeId = parseInt(btn.dataset.assigneeId!);
            btn.style.display = taskAssignees.some((a) => a.id === assigneeId)
                ? 'none'
                : 'flex';
        });
    }

    /**
     * Fetch avatar image as base64 and cache it.
     */
    function fetchAvatar(username: string): Promise<string> {
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
     * Setup search input event with debounce.
     */
    async function setupAssigneesSearchInput(
        input: HTMLInputElement | null,
        assigneesMenu: HTMLDivElement
    ) {
        if (!input) return;
        input.focus();

        const task = await fetchTaskById(getTaskIdFromElement(input));

        const debouncedSearch = debounce(
            () => handleAssigneeSearch(input, assigneesMenu, task.project_id),
            300
        );

        input.addEventListener('input', debouncedSearch);

        // Trigger an initial search
        handleAssigneeSearch(input, assigneesMenu, task.project_id);
    }

    /**
     * Handle assignee search request and render results.
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

        // ✅ Use cache if available
        if (assigneeSearchCache.has(cacheKey)) {
            renderAssignees(searchResults, assigneeSearchCache.get(cacheKey)!);
            return;
        }

        // Otherwise fetch from API
        GM_xmlhttpRequest({
            url: `/api/v1/projects/${projectId}/projectusers?s=${encodeURIComponent(
                query
            )}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${getJwtToken()}` },
            responseType: 'json',
            onload: async (response) => {
                const assignees = (response.response as Assignee[]) ?? [];

                // ✅ Save result in cache
                assigneeSearchCache.set(cacheKey, assignees);

                renderAssignees(searchResults, assignees);
            }
        });
    }

    // Helper function to render assignees
    async function renderAssignees(
        container: HTMLDivElement,
        assignees: Assignee[]
    ) {
        const avatarPromises = assignees.map((assignee) =>
            fetchAvatar(assignee.username)
        );
        await Promise.all(avatarPromises);
        container.innerHTML = '';
        for (const assignee of assignees) {
            const avatar = await fetchAvatar(assignee.username);
            const btn = createAssigneeSearchButton(assignee, avatar);
            container.appendChild(btn);
        }
        updateAndRefreshAssignees();
    }

    function createAssigneeSearchButton(
        assignee: Assignee,
        avatar: string
    ): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.assigneeId = assignee.id.toString();
        Object.assign(btn.style, {
            width: '100%',
            border: 'none',
            padding: '6px',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        });

        const wrapper = document.createElement('div');
        Object.assign(wrapper.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
        });

        // avatar
        const img = document.createElement('img');
        img.className = 'avatar';
        img.src = avatar;
        img.width = 30;
        img.height = 30;
        Object.assign(img.style, {
            borderRadius: '100%',
            verticalAlign: 'middle'
        });

        // ชื่อ
        const nameSpan = document.createElement('span');
        nameSpan.style.color = 'var(--input-color)';
        nameSpan.textContent = assignee.name || assignee.username;

        // hint text
        const hintSpan = document.createElement('span');
        hintSpan.className = 'hidden';
        hintSpan.textContent = 'Enter or click';
        Object.assign(hintSpan.style, {
            fontSize: '12px',
            color: '#888'
        });

        // ประกอบ element
        wrapper.appendChild(img);
        wrapper.appendChild(nameSpan);

        btn.appendChild(wrapper);
        btn.appendChild(hintSpan);

        btn.addEventListener('click', () => {
            const rows =
                document.querySelectorAll<HTMLTableRowElement>(
                    'tr.bulk-selected'
                );
            for (const row of rows) {
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
                    taskCache[taskId].assignees!.find(
                        (a) => a.id === assignee.id
                    )
                )
                    return;
                taskCache[taskId].assignees!.push(assignee);
            }
            btn.style.display = 'none';
            updateAndRefreshAssignees();
        });

        return btn;
    }

    /**
     * Close the menu when clicking outside.
     */
    function setupAssigneesOutsideClickHandler(
        cell: HTMLTableCellElement,
        assigneesMenu: HTMLDivElement
    ) {
        document.addEventListener('click', function clickOutside(e) {
            if (
                !cell.contains(e.target as Node) &&
                document.contains(e.target as Node)
            ) {
                assigneesMenu?.remove();
                document.removeEventListener('click', clickOutside);
                refreshAssignessColumn();
            }
        });
    }

    /**
     * Refresh all assignees in the table after closing menu.
     */
    async function refreshAssignessColumn() {
        const colIndex = getCheckedColumnIndex(ASSIGNEES);
        if (colIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(:has(#assigneesMenu))`
        );

        for (const cell of cells) {
            cell.innerHTML = '';
            const task = await fetchTaskById(getTaskIdFromElement(cell));
            const assignees = task.assignees;
            if (!assignees) continue;

            const assigneesList = document.createElement('div');
            assigneesList.className = 'assignees-list is-inline mis-1';

            for (const assignee of assignees) {
                const assigneeEl = document.createElement('span');
                assigneeEl.className = 'assignee';

                const userDiv = document.createElement('div');
                userDiv.className = 'user';
                userDiv.style.display = 'inline';

                const avatar = document.createElement('img');
                avatar.className = 'avatar v-popper--has-tooltip';
                avatar.width = 28;
                avatar.height = 28;
                avatar.style.border = '2px solid var(--white)';
                avatar.style.borderRadius = '100%';
                avatar.title = assignee.name || assignee.username;
                avatar.src = await fetchAvatar(assignee.username);

                userDiv.appendChild(avatar);
                assigneeEl.appendChild(userDiv);
                assigneesList.appendChild(assigneeEl);
            }
            cell.appendChild(assigneesList);
        }
    }

    function enhanceLabelsColumn() {
        const colIndex = getCheckedColumnIndex(LABELS);
        if (colIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(.enhanced)`
        );

        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit');
            cell.classList.add('enhanced');
            attachLabelsEditor(cell);
        });
    }

    function attachLabelsEditor(cell: HTMLTableCellElement) {
        cell.addEventListener('click', (e) => {
            const target = e.target as HTMLElement | null;

            // Prevent reopening when clicking inside the menu
            if (
                (target && target.closest('#labelsMenu')) ||
                !document.contains(target)
            )
                return;

            closeExistingLabelsMenu();
            openLabelsMenuForCell(cell);
        });
    }

    /**
     * Open menu for a specific table cell.
     */
    function openLabelsMenuForCell(cell: HTMLTableCellElement) {
        cell.style.position = 'relative';
        const assigneesMenu = createLabelsMenu();
        cell.appendChild(assigneesMenu);

        openLabelsMenu(cell, assigneesMenu);
    }

    async function openLabelsMenu(
        cell: HTMLTableCellElement,
        labelsMenu: HTMLDivElement
    ) {
        labelsMenu.style.display = 'block';

        const input = labelsMenu.querySelector<HTMLInputElement>('.input');
        const labelsSelectedList = labelsMenu.querySelector<HTMLDivElement>(
            '#labelsSelectedList'
        );
        if (!labelsSelectedList) return;

        await refreshLabelsList(cell, labelsSelectedList);

        setupLabelsSearchInput(input, labelsMenu);
        setupLabelsOutsideClickHandler(cell, labelsMenu);
    }

    function setupLabelsOutsideClickHandler(
        cell: HTMLTableCellElement,
        labelsMenu: HTMLDivElement
    ) {
        document.addEventListener('click', function clickOutside(e) {
            if (
                !cell.contains(e.target as Node) &&
                document.contains(e.target as Node)
            ) {
                labelsMenu?.remove();
                document.removeEventListener('click', clickOutside);
                refreshLabelsColumn();
            }
        });
    }

    async function refreshLabelsColumn() {
        const colIndex = getCheckedColumnIndex(LABELS);
        if (colIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${colIndex + 1}):not(:has(#labelsMenu))`
        );

        for (const cell of cells) {
            cell.innerHTML = '';
            const task = await fetchTaskById(getTaskIdFromElement(cell));
            const labels = task.labels;
            if (!labels) continue;

            const labelWrapper = document.createElement('div');
            labelWrapper.className = 'label-wrapper';

            // ใช้ for...of สร้าง tag แต่ละอัน
            for (const label of labels) {
                const tag = document.createElement('span');
                tag.className = 'tag';
                tag.style.backgroundColor = '#' + label.hex_color;
                tag.style.color = colorIsDark(label.hex_color) ? DARK : LIGHT;

                const spanText = document.createElement('span');
                spanText.textContent = label.title;

                tag.appendChild(spanText);
                labelWrapper.appendChild(tag);
            }

            cell.appendChild(labelWrapper);
        }
    }

    async function setupLabelsSearchInput(
        input: HTMLInputElement | null,
        assigneesMenu: HTMLDivElement
    ) {
        if (!input) return;
        input.focus();

        const debouncedSearch = debounce(
            () => handleLabelSearch(input, assigneesMenu),
            300
        );

        input.addEventListener('input', debouncedSearch);

        // Trigger an initial search
        handleLabelSearch(input, assigneesMenu);
    }

    function handleLabelSearch(input: HTMLInputElement, menu: HTMLDivElement) {
        const query = input.value.trim();
        const searchResults =
            menu.querySelector<HTMLDivElement>('.search-results');
        if (!searchResults) return;

        const cacheKey = query;

        // ✅ Use cache if available
        if (assigneeSearchCache.has(cacheKey)) {
            renderLabels(searchResults, labelSearchCache.get(cacheKey)!);
            if (
                !labelSearchCache
                    .get(cacheKey)
                    ?.some(
                        (label: Label) => label.title.trim() === query.trim()
                    )
            ) {
                updateAndRefreshLabels();
            }
            return;
        }

        // Otherwise fetch from API
        GM_xmlhttpRequest({
            url: `/api/v1/labels?s=${encodeURIComponent(query)}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${getJwtToken()}` },
            responseType: 'json',
            onload: async (response) => {
                const labels = (response.response as Label[]) ?? [];

                // ✅ Save result in cache
                labelSearchCache.set(cacheKey, labels);
                renderLabels(searchResults, labels);
            }
        });
    }

    async function renderLabels(container: HTMLDivElement, labels: Label[]) {
        container.innerHTML = '';
        for (const label of labels) {
            const btn = createLabelSearchButton(label);
            container.appendChild(btn);
        }
        updateAndRefreshLabels();
    }

    function createLabelSearchButton(label: Label): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.labelId = label.id.toString();
        Object.assign(btn.style, {
            width: '100%',
            border: 'none',
            padding: '6px',
            textAlign: 'left',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
        });
        const color = colorIsDark(label.hex_color) ? DARK : LIGHT;

        btn.innerHTML = `
      <span>
        <span  class="tag search-result" style="background-color: #${label.hex_color}; color: ${color}">
            <span>${label.title}</span>
        </span>
       </span>
      <span style="font-size:12px; color:#888;" class="hidden">Enter or click</span>
    `;

        btn.addEventListener('click', () => {
            const rows =
                document.querySelectorAll<HTMLTableRowElement>(
                    'tr.bulk-selected'
                );
            for (const row of rows) {
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
                if (taskCache[taskId].labels!.find((a) => a.id === label.id))
                    return;
                taskCache[taskId].labels!.push(label);
            }
            btn.style.display = 'none';
            updateAndRefreshLabels();
        });

        return btn;
    }

    async function refreshLabelsList(
        cell: HTMLTableCellElement,
        labelsSelectedList: HTMLDivElement
    ) {
        labelsSelectedList.innerHTML = '';
        const task = await fetchTaskById(getTaskIdFromElement(cell));

        if (task?.labels) {
            for (const label of task.labels ?? []) {
                labelsSelectedList.appendChild(await createLabelItem(label));
            }
        }
    }

    /**
     * Create a selected assignee item with avatar and remove button.
     */
    async function createLabelItem(label: Label): Promise<HTMLSpanElement> {
        const tag = document.createElement('span');
        tag.className = 'tag';
        tag.style.backgroundColor = `#${label.hex_color}`;
        tag.style.color = colorIsDark(label.hex_color) ? DARK : LIGHT;

        // สร้าง span สำหรับข้อความ
        const labelEl = document.createElement('span');
        labelEl.textContent = label.title;

        // สร้างปุ่มลบ
        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className =
            'base-button base-button--type-button delete is-small';

        // ประกอบทั้งหมด
        tag.appendChild(labelEl);
        tag.appendChild(deleteButton);

        deleteButton.addEventListener('click', async () => {
            const rows = document.querySelectorAll<HTMLTableRowElement>(
                'tbody tr.bulk-selected'
            );
            for (const row of rows) {
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
            updateAndRefreshLabels();
        });

        return tag;
    }
    async function updateAndRefreshLabels() {
        const labelsMenu =
            document.querySelector<HTMLDivElement>('#labelsMenu');
        if (!labelsMenu) return;

        const cell = labelsMenu.closest('td');
        if (!cell) return;

        const labelsSelectedList = document.querySelector<HTMLDivElement>(
            '#labelsSelectedList'
        );
        if (!labelsSelectedList) return;

        await refreshLabelsList(cell, labelsSelectedList);
        await updateLabelsSearchResults(labelsMenu, cell);
    }

    async function updateLabelsSearchResults(
        labelsMenu: HTMLDivElement,
        cell: HTMLTableCellElement
    ) {
        const buttons = labelsMenu.querySelectorAll<HTMLButtonElement>(
            '.search-results button'
        );
        const task = await fetchTaskById(getTaskIdFromElement(cell));
        const taskLabels = task?.labels || [];

        buttons.forEach((btn) => {
            const labelId = parseInt(btn.dataset.labelId!);
            btn.style.display = taskLabels.some((a) => a.id === labelId)
                ? 'none'
                : 'flex';
        });
    }

    /**
     * Create the base DOM structure for the assignees menu.
     */
    function createLabelsMenu(): HTMLDivElement {
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
            zIndex: 10000,
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            cursor: 'default',
            top: '0',
            left: '0'
        });

        // Selected assignees list
        const selectedList = document.createElement('div');
        selectedList.className = 'selected-list';
        selectedList.id = 'labelsSelectedList';
        Object.assign(selectedList.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px'
        });

        // Input wrapper
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

        // Search results container
        const searchResults = document.createElement('div');
        searchResults.className = 'search-results';

        menu.appendChild(selectedList);
        menu.appendChild(control);
        menu.appendChild(searchResults);

        return menu;
    }

    function closeExistingLabelsMenu() {
        document.querySelector('#labelsMenu')?.remove();
    }

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
            background-color: var(--table-row-hover-background-color)
        }
        tbody tr.drag-over {
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
            padding-left: calc(20px * var(--level));
        }
    `);
    let draggedRows: HTMLTableRowElement[] = [];
    let lastDragOverTr: HTMLTableRowElement | null = null;

    document.addEventListener('click', (e) => {
        const tr = (e.target as HTMLElement).closest('tr');
        const tbody = tr?.closest('tbody');

        if (!tr || !tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));

        if (
            (e.target as HTMLElement)
                .closest('.bulk-edit')
                ?.closest('.bulk-selected')
        ) {
            return;
        } else if (!(e.target as HTMLElement).closest('.bulk-edit')) {
            e.preventDefault();
        }

        const lastClicked =
            tbody.querySelector<HTMLTableRowElement>('tr.last-clicked');

        if (e.shiftKey && lastClicked) {
            rows.forEach((r) => r.classList.remove('bulk-selected'));
            const start = rows.indexOf(lastClicked);
            const end = rows.indexOf(tr);
            const [s, e_] = [start, end].sort((a, b) => a - b);
            for (let i = s; i <= e_; i++) {
                rows[i].classList.add('bulk-selected');
            }
        } else if (e.ctrlKey || e.metaKey) {
            tr.classList.toggle('bulk-selected');
        } else {
            rows.forEach((r) => r.classList.remove('bulk-selected'));
            tr.classList.add('bulk-selected');
        }

        // Update last-clicked
        rows.forEach((r) => r.classList.remove('last-clicked'));
        tr.classList.add('last-clicked');
    });

    // --- Drag & Drop ---
    document.addEventListener('dragstart', (e: DragEvent) => {
        const tr = (e.target as HTMLElement).closest(
            'tr'
        ) as HTMLTableRowElement;
        const tbody = tr?.closest('tbody');
        if (!tr || !tbody || !tr.classList.contains('bulk-selected')) {
            e.preventDefault();
            return;
        }

        draggedRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
        e.dataTransfer!.effectAllowed = 'move';
        e.dataTransfer!.setData('text/plain', 'dragging');
    });

    document.addEventListener('dragover', (e) => {
        const tr = (e.target as HTMLElement).closest('tr');
        if (
            !tr ||
            !tr.closest('tbody') ||
            tr.classList.contains('bulk-selected')
        )
            return;

        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';

        if (lastDragOverTr && lastDragOverTr !== tr) {
            lastDragOverTr.classList.remove('drag-over');
        }

        tr.classList.add('drag-over');
        lastDragOverTr = tr;
    });

    document.addEventListener('dragend', (e) => {
        if (lastDragOverTr) {
            lastDragOverTr.classList.remove('drag-over');
            lastDragOverTr = null;
        }
    });

    document.addEventListener('dragleave', (e) => {
        const tr = (e.target as HTMLElement).closest('tr');
        if (tr && tr.classList.contains('drag-over')) {
            tr.classList.remove('drag-over');
            lastDragOverTr = null;
        }
    });

    document.addEventListener('drop', (e) => {
        const targetTr = (e.target as HTMLElement).closest('tr');
        const tbody = targetTr?.closest('tbody');
        if (!targetTr || !tbody) return;
        e.preventDefault();

        // ถ้า targetTr อยู่ใน selection bulk-selected ของตัวเอง → ไม่ทำอะไร
        if (targetTr.classList.contains('bulk-selected')) return;

        draggedRows
            .slice()
            .reverse()
            .forEach((row) => {
                tbody.insertBefore(row, targetTr.nextElementSibling);
            });
    });

    /**
     * Initialize a MutationObserver to watch for class changes on <tr> elements.
     * Specifically toggles the "draggable" attribute when the "bulk-selected" class changes.
     */
    function initRowSelectionObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (!isClassAttributeChange(mutation)) continue;

                const target = mutation.target;
                if (!(target instanceof HTMLTableRowElement)) continue;

                handleRowClassChange(target, mutation.oldValue);
            }
        });

        observer.observe(document.body, {
            subtree: true,
            attributes: true,
            attributeOldValue: true,
            attributeFilter: ['class']
        });
    }

    /**
     * Check if the mutation is a class attribute change.
     */
    function isClassAttributeChange(mutation: MutationRecord): boolean {
        return (
            mutation.type === 'attributes' && mutation.attributeName === 'class'
        );
    }

    /**
     * Handle changes to a row's class attribute.
     * Toggles the draggable attribute based on whether "bulk-selected" is added or removed.
     */
    function handleRowClassChange(
        row: HTMLTableRowElement,
        oldClassValue: string | null | undefined
    ) {
        const hasClass = row.classList.contains('bulk-selected');
        const hadClass = oldClassValue?.includes('bulk-selected') ?? false;

        // Apply changes only if there is a real difference
        if (hasClass !== hadClass) {
            if (hasClass) {
                row.setAttribute('draggable', 'true');
            } else {
                row.removeAttribute('draggable');
            }
        }
    }

    async function getTaskLevelById(taskId: number): Promise<number> {
        let level = 0;
        let currentTaskId = taskId;
        while (1) {
            const task = await fetchTaskById(currentTaskId);
            if (!task.related_tasks?.parenttask?.length) break;
            currentTaskId = task.related_tasks.parenttask[0].id;
            level++;
        }
        return level;
    }

    // Observer configuration
    const observerConfig = { attributes: true, childList: true, subtree: true };

    let href: string | null = null;
    let theadHtml: string | null = null;

    /**
     * Clear the task cache
     */
    function clearTaskCache() {
        for (const key in taskCache) {
            delete taskCache[key];
        }
    }

    /**
     * Sort rows by task level and insert them in hierarchical order
     */
    async function reorderTaskRows(rows: NodeListOf<HTMLTableRowElement>) {
        const sortRows = (
            await Promise.all(
                Array.from(rows).map(async (row) => {
                    const task = await fetchTaskById(getTaskIdByTr(row));
                    const level = await getTaskLevelById(task.id);
                    return { row, level };
                })
            )
        ).sort((a, b) => a.level - b.level);

        for (const row of sortRows) {
            if (row.level !== 0) {
                const task = await fetchTaskById(getTaskIdByTr(row.row));
                const parentRow = Array.from(rows).find((r) => {
                    const id = getTaskIdByTr(r);
                    return id === task.related_tasks.parenttask![0].id;
                });

                if (parentRow) {
                    parentRow.insertAdjacentElement('afterend', row.row);
                }
            }
            row.row.style.setProperty('--level', row.level.toString());
        }
    }

    /**
     * Enhance table columns with custom features
     */
    function enhanceTableColumns() {
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

    /**
     * Ensure horizontal overflow is visible for the table
     */
    function fixHorizontalOverflow() {
        const hasHorizontalOverflow = document
            .querySelector('table')
            ?.closest<HTMLElement>('.has-horizontal-overflow');

        if (hasHorizontalOverflow) {
            hasHorizontalOverflow.style.overflow = 'visible';
        }
    }

    /**
     * Handle detected DOM changes
     */
    async function handleDomChanges(observer: MutationObserver) {
        if (!document.querySelector('table tbody tr td')) {
            return; // No table detected
        }

        observer.disconnect();

        setTimeout(async () => {
            const currentHref = window.location.href;
            const currentTheadHtml =
                document.querySelector('thead')?.outerHTML ?? null;

            // Only proceed if table header or URL has changed
            if (href !== currentHref || theadHtml !== currentTheadHtml) {
                clearTaskCache();
                await fetchTasksByIds(getTaskIdsFromTable());

                const rows =
                    document.querySelectorAll<HTMLTableRowElement>('tbody tr');
                await reorderTaskRows(rows);

                // Save state for change detection
                href = currentHref;
                theadHtml = currentTheadHtml;
            }

            enhanceTableColumns();
            fixHorizontalOverflow();

            // Resume observing
            observer.observe(document.body, observerConfig);
        }, 100);
    }

    // Create and start observer
    const observer = new MutationObserver((mutations, obs) => {
        handleDomChanges(obs);
    });

    observer.observe(document.body, observerConfig);
    initRowSelectionObserver();
})();
