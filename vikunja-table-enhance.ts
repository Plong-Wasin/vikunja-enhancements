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
    assignees: null;
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
        if (el instanceof HTMLTableRowElement) return getTaskIdByTr(el);
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
            `table td:nth-child(${titleIndex + 1})`
        );

        cells.forEach(initEditableCell);
    }

    /**
     * Initialize editable behavior for a single table cell.
     * @param td - The table cell element.
     */
    function initEditableCell(td: HTMLTableCellElement) {
        td.style.cursor = 'pointer';
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
        span.classList.add('d-none');
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
        link.classList.add('d-none');
        span.classList.remove('d-none');
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
        link.classList.remove('d-none');
        span.classList.add('d-none');
    }

    /**
     * Enhance the "Done" column with checkboxes.
     */
    function enhanceDoneColumn() {
        const doneIndex = getCheckedColumnIndex(DONE);
        if (doneIndex === -1) return;

        const cells = document.querySelectorAll<HTMLTableCellElement>(
            `table td:nth-child(${doneIndex + 1})`
        );

        cells.forEach(setupDoneCell);
    }

    /**
     * Setup a single "Done" cell with checkbox + label.
     */
    function setupDoneCell(cell: HTMLTableCellElement) {
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
            <input type="checkbox" ${isChecked ? 'checked' : ''}/>
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
        doneElement.classList.toggle('d-none', !isChecked);
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
            if (row.classList.contains('bulk-selected')) {
                updateBulkRowsPriority(tbody, priority);
            } else {
                updateSingleRowPriority(row, priority);
            }
            updateSelectStyle(select, priority);
        });
    }

    /**
     * Update a single row's priority via API.
     */
    function updateSingleRowPriority(
        row: HTMLTableRowElement,
        priority: number
    ) {
        const taskId = getTaskIdByTr(row);
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/${taskId}`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ priority })
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
            `table td:nth-child(${colIndex + 1})`
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
        const taskId = getTaskIdFromElement(cell);
        const dateValue = taskData.find((task) => task.id === taskId)?.[
            dateField
        ];

        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.classList.add(className);

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
            `table td:nth-child(${colIndex + 1})`
        );

        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
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
     * Send API request to update progress for a single task.
     */
    function updateTaskProgress(taskId: number, newProgress: number): void {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/${taskId}`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ progress: newProgress })
        });
    }

    /**
     * Send API request to update progress for multiple tasks (bulk).
     */
    function updateBulkTaskProgress(
        taskIds: number[],
        newProgress: number
    ): void {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/bulk`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({
                progress: newProgress,
                task_ids: taskIds
            })
        });
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
            const newProgress = parseInt(input.value);

            if (isValidProgress(newProgress)) {
                const tr = cell.closest('tr');
                const taskId = getTaskIdFromElement(cell);

                if (tr?.classList.contains('bulk-selected')) {
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
                    // Single task update
                    updateTaskProgress(taskId, newProgress);
                    cell.innerText = `${newProgress}%`;
                }
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

    GM_addStyle(`
        .edit-title {
            border: none;
            background: transparent;
            color: transparent;
            transform: rotate(90deg);
            display: none;
        }
        tbody tr:hover .editable-span.d-none + .edit-title {
            display: inline-block;
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
        .d-none {
            display: none;
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
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLSelectElement
        )
            return;

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

        e.preventDefault();
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

        draggedRows.forEach((row) => {
            tbody.insertBefore(row, targetTr);
        });
    });
    setTimeout(() => {
        enhanceEditableTitles();
        enhanceDoneColumn();
        enhancePriorityColumn();
        enhanceDueDateColumn();
        enhanceStartDateColumn();
        enhanceEndDateColumn();
        enhanceProgressColumn();

        // --- Update draggable ตาม bulk-selected ---
        const observer = new MutationObserver(() => {
            document
                .querySelectorAll('tbody tr.bulk-selected')
                .forEach((tr) => tr.setAttribute('draggable', 'true'));
            document
                .querySelectorAll('tbody tr:not(.bulk-selected)')
                .forEach((tr) => tr.removeAttribute('draggable'));
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }, 1000);
})();
