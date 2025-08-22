"use strict";
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
    const taskCache = {};
    function getViewId() {
        return +(window.location.pathname.split('/').pop() ?? 0);
    }
    function getProjectId() {
        const pathParts = window.location.pathname.split('/');
        const projectId = pathParts[2];
        return +projectId;
    }
    function getJwtToken() {
        return localStorage.getItem('token');
    }
    function isTableView() {
        return !!document.querySelector('.fa-table-cells');
    }
    function log(...args) {
        console.log('%c[Vikunja]', 'color: #ebd927', ...args);
    }
    function ready(fn) {
        if (document.readyState != 'loading') {
            fn();
        }
        else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }
    async function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Collects the indices of all checked checkboxes inside `.columns-filter`.
     *
     * @returns An array of indices representing the positions of checked checkboxes.
     */
    function getCheckedColumnIndices() {
        const checkedIndices = [];
        document
            .querySelectorAll('.columns-filter input')
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
    function getTaskIdByTr(tr) {
        if (!tr)
            return 0;
        const link = tr.querySelector('a');
        if (!link)
            return 0;
        const idStr = link.href.split('/').pop();
        return idStr ? Number(idStr) : 0;
    }
    /**
     * Extract the task ID from any element inside the row.
     * @param el - An element inside the table row.
     * @returns The task ID as a number, or 0 if not found.
     */
    function getTaskIdFromElement(el) {
        if (el instanceof HTMLTableRowElement)
            return getTaskIdByTr(el);
        const tr = el.closest('tr');
        return getTaskIdByTr(tr);
    }
    function getDoneText() {
        return (document.querySelectorAll('.columns-filter span')[2]?.textContent ?? '');
    }
    /**
     * Returns the position of a checked column, or -1 if not checked.
     *
     * @param column - The column index to check.
     * @returns The index of the checked column, or -1 if not checked.
     */
    function getCheckedColumnIndex(column) {
        return getCheckedColumnIndices().indexOf(column);
    }
    /**
     * Entry point: Enhance editable titles in the table.
     */
    function enhanceEditableTitles() {
        const titleIndex = getCheckedColumnIndex(TITLE);
        if (titleIndex === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${titleIndex + 1})`);
        cells.forEach(initEditableCell);
    }
    /**
     * Initialize editable behavior for a single table cell.
     * @param td - The table cell element.
     */
    function initEditableCell(td) {
        td.style.cursor = 'pointer';
        const link = td.querySelector('a');
        if (!link)
            return;
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
    function styleCell(td) {
        td.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    }
    /**
     * Create an editable span (hidden by default).
     */
    function createEditableSpan() {
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
    function createEditButton(link, span) {
        const btn = document.createElement('button');
        btn.innerHTML = '✎';
        btn.className = 'edit-title';
        btn.addEventListener('click', () => activateEditMode(link, span));
        return btn;
    }
    /**
     * Switch link into editable mode.
     */
    function activateEditMode(link, span) {
        span.textContent = link.textContent || '';
        link.classList.add('d-none');
        span.classList.remove('d-none');
        focusCursorToEnd(span);
    }
    /**
     * Place cursor at the end of a contenteditable element.
     */
    function focusCursorToEnd(element) {
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
    function attachLinkEvents(link, span) {
        span.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                span.blur();
                saveChanges(link, span);
            }
            else if (e.key === 'Escape') {
                cancelEdit(link, span);
            }
        });
        span.addEventListener('blur', () => saveChanges(link, span));
    }
    function colorIsDark(color) {
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
        const Ys = Math.pow(r / 255.0, 2.2) * 0.2126 +
            Math.pow(g / 255.0, 2.2) * 0.7152 +
            Math.pow(b / 255.0, 2.2) * 0.0722;
        return Math.pow(Ys, 0.678) >= 0.5;
    }
    /**
     * Save changes (send API request if text is modified).
     */
    function saveChanges(link, span) {
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
    function cancelEdit(link, span) {
        resetView(link, span, link.textContent || '');
    }
    /**
     * Restore link and hide editable span.
     */
    function resetView(link, span, text) {
        link.textContent = text;
        link.classList.remove('d-none');
        span.classList.add('d-none');
    }
    /**
     * Enhance the "Done" column with checkboxes.
     */
    function enhanceDoneColumn() {
        const doneIndex = getCheckedColumnIndex(DONE);
        if (doneIndex === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${doneIndex + 1})`);
        cells.forEach(setupDoneCell);
    }
    /**
     * Setup a single "Done" cell with checkbox + label.
     */
    function setupDoneCell(cell) {
        const hasDoneElement = Boolean(cell.querySelector('.is-done--small'));
        cell.innerHTML = buildDoneCellHTML(hasDoneElement);
        const doneElement = cell.querySelector('.is-done--small');
        const inputElement = cell.querySelector('input');
        if (!doneElement || !inputElement)
            return;
        syncDoneState(doneElement, inputElement.checked);
        bindDoneEvents(inputElement, cell.closest('tr'));
    }
    /**
     * Build HTML for a "Done" cell.
     */
    function buildDoneCellHTML(isChecked) {
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
    function bindDoneEvents(input, tr) {
        input.addEventListener('change', () => {
            const isChecked = input.checked;
            const tbody = tr.closest('tbody');
            if (!tbody)
                return;
            if (tr.classList.contains('bulk-selected')) {
                updateBulkRowsDone(tbody, isChecked);
            }
            else {
                updateSingleRowDone(tr, isChecked);
            }
        });
    }
    /**
     * Update a single row checkbox and send API request.
     */
    function updateSingleRowDone(tr, isChecked) {
        const doneElement = tr.querySelector('.is-done--small');
        if (!doneElement)
            return;
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
    function updateBulkRowsDone(tbody, isChecked) {
        const bulkRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
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
            const rowInput = row.querySelector('input[type="checkbox"]');
            const rowDone = row.querySelector('.is-done--small');
            if (rowInput && rowDone) {
                rowInput.checked = isChecked;
                syncDoneState(rowDone, isChecked);
            }
        });
    }
    /**
     * Show or hide the "Done" label based on checkbox state.
     */
    function syncDoneState(doneElement, isChecked) {
        doneElement.classList.toggle('d-none', !isChecked);
    }
    /**
     * Retrieve all task IDs from the table rows.
     */
    function getTaskIdsFromTable() {
        const taskLinks = document.querySelectorAll('tbody tr a');
        return [
            ...new Set(Array.from(taskLinks).map((link) => getTaskIdFromElement(link)))
        ];
    }
    async function fetchFromApiDynamic(taskIds) {
        const result = [];
        let remainingIds = [...taskIds];
        while (remainingIds.length > 0) {
            // ส่ง request กับทุก id ที่เหลือ
            const res = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: '/api/v1/tasks/all?filter=' +
                        encodeURIComponent('id in ' + remainingIds.join(',')),
                    headers: {
                        Authorization: `Bearer ${getJwtToken()}`,
                        'Content-Type': 'application/json'
                    },
                    onload: (r) => resolve(r),
                    onerror: (e) => reject(e)
                });
            });
            const data = JSON.parse(res.responseText);
            result.push(...data);
            // ลบ id ที่ได้แล้ว
            const fetchedIds = data.map((task) => task.id);
            remainingIds = remainingIds.filter((id) => !fetchedIds.includes(id));
            // ถ้า API คืนค่ามาน้อยกว่า request → ไม่มี id เหลือ → break
            if (fetchedIds.length === 0)
                break;
        }
        return result;
    }
    async function fetchTasksByIds(taskIds) {
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
        if (priorityIndex === -1)
            return;
        const taskData = await fetchTasksByIds(getTaskIdsFromTable());
        const tbody = document.querySelector('tbody');
        if (!tbody)
            return;
        const rows = document.querySelectorAll('tbody tr');
        rows.forEach((row) => setupPriorityCell(row, taskData, priorityIndex));
    }
    /**
     * Setup priority cell for a single row.
     */
    function setupPriorityCell(row, taskData, priorityIndex) {
        const taskId = getTaskIdByTr(row);
        const td = row.children[priorityIndex];
        const wrapper = document.createElement('div');
        wrapper.classList.add('select');
        const select = createPrioritySelect();
        const currentPriority = taskData.find((task) => task.id === taskId)?.priority ?? 0;
        updateSelectStyle(select, currentPriority);
        wrapper.appendChild(select);
        td.innerHTML = '';
        td.appendChild(wrapper);
        bindPriorityEvents(select, row);
    }
    /**
     * Create a <select> element for priority options.
     */
    function createPrioritySelect() {
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
    function updateSelectStyle(select, priority) {
        select.value = priority.toString();
        if (select.selectedOptions[0]) {
            select.style.color = select.selectedOptions[0].style.color;
        }
    }
    /**
     * Bind event handlers for priority change (single vs bulk update).
     */
    function bindPriorityEvents(select, row) {
        select.addEventListener('change', () => {
            const tbody = row.closest('tbody');
            if (!tbody)
                return;
            const priority = +select.value;
            if (row.classList.contains('bulk-selected')) {
                updateBulkRowsPriority(tbody, priority);
            }
            else {
                updateSingleRowPriority(row, priority);
            }
            updateSelectStyle(select, priority);
        });
    }
    /**
     * Update a single row's priority via API.
     */
    function updateSingleRowPriority(row, priority) {
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
    function updateBulkRowsPriority(tbody, priority) {
        const bulkRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
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
            const select = row.querySelector('.priority-select');
            if (select)
                updateSelectStyle(select, priority);
        });
    }
    function utcToDatetimeLocal(utcString) {
        const date = new Date(utcString);
        const pad = (num) => String(num).padStart(2, '0');
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
    async function enhanceDateColumn(columnKey, className, dateField) {
        const colIndex = getCheckedColumnIndex(columnKey);
        if (colIndex === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${colIndex + 1})`);
        const taskData = await fetchTasksByIds(getTaskIdsFromTable());
        cells.forEach((cell) => setupDateCell(cell, taskData, className, dateField));
    }
    /**
     * Setup a single date cell with input element and change handler.
     */
    function setupDateCell(cell, taskData, className, dateField) {
        const taskId = getTaskIdFromElement(cell);
        const dateValue = taskData.find((task) => task.id === taskId)?.[dateField];
        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.classList.add(className);
        if (dateValue && dateValue !== '0001-01-01T00:00:00Z') {
            input.value = utcToDatetimeLocal(dateValue);
        }
        cell.innerHTML = '';
        cell.appendChild(input);
        input.addEventListener('change', () => handleDateChange(cell, input, dateField));
    }
    /**
     * Handle change event for a date input (single or bulk update).
     */
    function handleDateChange(cell, input, dateField) {
        const tr = cell.closest('tr');
        if (!tr)
            return;
        const newDateUTC = new Date(input.value).toISOString();
        if (tr.classList.contains('bulk-selected')) {
            const rows = Array.from(document.querySelectorAll('tbody tr.bulk-selected'));
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
                const rowInput = row.querySelector(`.${input.className}`);
                if (rowInput)
                    rowInput.value = input.value;
            });
        }
        else {
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
        await enhanceDateColumn(DUE_DATE, 'due-date-datetime-local', 'due_date');
    }
    async function enhanceStartDateColumn() {
        await enhanceDateColumn(START_DATE, 'start-date-datetime-local', 'start_date');
    }
    async function enhanceEndDateColumn() {
        await enhanceDateColumn(END_DATE, 'end-date-datetime-local', 'end_date');
    }
    /**
     * Enhance the "Progress" column to allow inline editing on double-click.
     */
    function enhanceProgressColumn() {
        const colIndex = getCheckedColumnIndex(PROGRESS);
        if (colIndex === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${colIndex + 1})`);
        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            attachProgressEditor(cell);
        });
    }
    /**
     * Attach double-click editor to a single cell.
     */
    function attachProgressEditor(cell) {
        cell.addEventListener('dblclick', function (e) {
            if (e.target && e.target.tagName === 'INPUT')
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
    function createProgressInput(value) {
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
    function isValidProgress(progress) {
        return !isNaN(progress) && progress >= 0 && progress <= 100;
    }
    /**
     * Send API request to update progress for a single task.
     */
    function updateTaskProgress(taskId, newProgress) {
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
    function updateBulkTaskProgress(taskIds, newProgress) {
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
    function updateBulkProgressUI(newProgress) {
        const colIndex = getCheckedColumnIndex(PROGRESS);
        document
            .querySelectorAll('tbody tr.bulk-selected')
            .forEach((row) => {
            const td = row.querySelector(`td:nth-child(${colIndex + 1})`);
            if (td)
                td.innerText = `${newProgress}%`;
        });
    }
    /**
     * Bind event listeners for the progress input element.
     */
    function bindProgressInputEvents(input, cell, originalProgress) {
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
                    const taskIds = Array.from(document.querySelectorAll('tbody tr.bulk-selected')).map(getTaskIdByTr);
                    // Bulk update API request
                    updateBulkTaskProgress(taskIds, newProgress);
                    // Update UI for all bulk-selected rows
                    updateBulkProgressUI(newProgress);
                }
                else {
                    // Single task update
                    updateTaskProgress(taskId, newProgress);
                    cell.innerText = `${newProgress}%`;
                }
            }
            else {
                // Revert to original value if invalid
                cell.innerText = `${originalProgress}%`;
            }
        };
        // Save on Enter, cancel on Escape
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter')
                saveProgress();
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
    let draggedRows = [];
    let lastDragOverTr = null;
    document.addEventListener('click', (e) => {
        const tr = e.target.closest('tr');
        const tbody = tr?.closest('tbody');
        if (!tr || !tbody)
            return;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        if (e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLSelectElement)
            return;
        const lastClicked = tbody.querySelector('tr.last-clicked');
        if (e.shiftKey && lastClicked) {
            rows.forEach((r) => r.classList.remove('bulk-selected'));
            const start = rows.indexOf(lastClicked);
            const end = rows.indexOf(tr);
            const [s, e_] = [start, end].sort((a, b) => a - b);
            for (let i = s; i <= e_; i++) {
                rows[i].classList.add('bulk-selected');
            }
        }
        else if (e.ctrlKey || e.metaKey) {
            tr.classList.toggle('bulk-selected');
        }
        else {
            rows.forEach((r) => r.classList.remove('bulk-selected'));
            tr.classList.add('bulk-selected');
        }
        // Update last-clicked
        rows.forEach((r) => r.classList.remove('last-clicked'));
        tr.classList.add('last-clicked');
        e.preventDefault();
    });
    // --- Drag & Drop ---
    document.addEventListener('dragstart', (e) => {
        const tr = e.target.closest('tr');
        const tbody = tr?.closest('tbody');
        if (!tr || !tbody || !tr.classList.contains('bulk-selected')) {
            e.preventDefault();
            return;
        }
        draggedRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'dragging');
    });
    document.addEventListener('dragover', (e) => {
        const tr = e.target.closest('tr');
        if (!tr ||
            !tr.closest('tbody') ||
            tr.classList.contains('bulk-selected'))
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
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
        const tr = e.target.closest('tr');
        if (tr && tr.classList.contains('drag-over')) {
            tr.classList.remove('drag-over');
            lastDragOverTr = null;
        }
    });
    document.addEventListener('drop', (e) => {
        const targetTr = e.target.closest('tr');
        const tbody = targetTr?.closest('tbody');
        if (!targetTr || !tbody)
            return;
        e.preventDefault();
        // ถ้า targetTr อยู่ใน selection bulk-selected ของตัวเอง → ไม่ทำอะไร
        if (targetTr.classList.contains('bulk-selected'))
            return;
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
