"use strict";
(function () {
    'use strict';
    // Constants for task table column indices
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
    // Colors used for UI elements and themes
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
    const COLOR_LIGHT = 'hsl(220, 13%, 91%)'; // light grey
    const COLOR_DARK = 'hsl(215, 27.9%, 16.9%)'; // dark grey
    // Caches for tasks, avatars, and search results to optimize performance
    const taskCache = {};
    const avatarCache = {};
    const assigneeSearchCache = new Map();
    const labelSearchCache = new Map();
    let cachedUser = null;
    /**
     * Extracts and returns the project ID from the current page URL.
     */
    function getProjectId() {
        const parts = window.location.pathname.split('/');
        return +parts[2];
    }
    /**
     * Retrieves the JWT token stored in localStorage.
     */
    function getJwtToken() {
        return localStorage.getItem('token');
    }
    /** Logs messages prefixed with [Vikunja] in console */
    function log(...args) {
        console.log('%c[Vikunja]', 'color: #ebd927', ...args);
    }
    /**
     * Gets indices of checked checkboxes in the columns filter UI.
     * Used to detect which columns are currently visible.
     */
    function getVisibleColumnIndices() {
        const checkedIndices = [];
        document.querySelectorAll('.columns-filter input').forEach((input, index) => {
            if (input.checked)
                checkedIndices.push(index);
        });
        return checkedIndices;
    }
    /**
     * Extracts the task ID number from a table row element.
     * Returns 0 if not found.
     */
    function extractTaskIdFromRow(row) {
        if (!row)
            return 0;
        const link = row.querySelector('a');
        if (!link)
            return 0;
        const idStr = link.href.split('/').pop();
        return idStr ? Number(idStr) : 0;
    }
    /**
     * Extracts the task ID from an element nested inside a table row.
     */
    function extractTaskIdFromElement(element) {
        const row = element.closest('tr');
        return extractTaskIdFromRow(row);
    }
    /** Retrieves the textual label for the Done column from the UI. */
    function getDoneColumnLabelText() {
        return document.querySelectorAll('.columns-filter span')[COLUMN_DONE]?.textContent ?? '';
    }
    /****
     * Retrieves the columns filter container element from the DOM.
     * @returns The columns filter div element or null if not found.
     */
    function getColumnsFilterElement() {
        return document.querySelector('.columns-filter');
    }
    /**
     * Fetches and caches user data. Returns the cached user info if it exists.
     */
    async function fetchCurrentUser() {
        if (!cachedUser) {
            cachedUser = await new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: '/api/v1/user',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${getJwtToken()}`
                    },
                    responseType: 'json',
                    onload: (response) => resolve(response.response)
                });
            });
        }
        return cachedUser;
    }
    /**
     * Returns the position of a column index in the list of visible columns.
     * If not visible, returns -1.
     * @param columnIndex The constant for the column
     */
    function getVisibleColumnPosition(columnIndex) {
        return getVisibleColumnIndices().indexOf(columnIndex);
    }
    //---------------- Editable Task Title UI Enhancements ----------------
    /**
     * Entry point to enhance all title cells to support inline editing.
     */
    function addEditableTitleFeature() {
        const visibleTitlePos = getVisibleColumnPosition(COLUMN_TITLE);
        if (visibleTitlePos === -1)
            return;
        const titleCells = document.querySelectorAll(`table td:nth-child(${visibleTitlePos + 1}):not(.enhanced)`);
        titleCells.forEach(setupEditableTitleCell);
    }
    /**
     * Sets up a single task title cell for inline editing, adds edit button and handlers.
     */
    function setupEditableTitleCell(cell) {
        cell.style.cursor = 'pointer';
        cell.classList.add('enhanced');
        const linkToTitle = cell.querySelector('a');
        if (!linkToTitle)
            return;
        // Create container div to hold link, editable input, and edit button
        const container = document.createElement('div');
        applyFlexContainerStyle(container);
        cell.appendChild(container);
        container.appendChild(linkToTitle);
        const editableInputSpan = createContentEditableSpan();
        container.appendChild(editableInputSpan);
        const editButton = createEditButton(linkToTitle, editableInputSpan);
        container.appendChild(editButton);
        container.addEventListener('dblclick', () => activateEditMode(linkToTitle, editableInputSpan));
        attachEditableSpanEventHandlers(linkToTitle, editableInputSpan);
    }
    /** Applies flex container styling to the given element */
    function applyFlexContainerStyle(element) {
        element.style.display = 'flex';
        element.style.justifyContent = 'space-between';
        element.style.alignItems = 'center';
    }
    /** Creates a hidden, contenteditable span used for inline text editing */
    function createContentEditableSpan() {
        const span = document.createElement('span');
        span.contentEditable = 'true';
        span.classList.add('hidden', 'editable-span');
        return span;
    }
    /**
     * Creates an edit button (pencil icon) that triggers entering edit mode.
     */
    function createEditButton(link, editableSpan) {
        const button = document.createElement('button');
        button.innerHTML = '✎';
        button.className = 'edit-title';
        button.addEventListener('click', () => activateEditMode(link, editableSpan));
        return button;
    }
    /**
     * Activates edit mode by hiding the link and showing the editable span with current text.
     */
    function activateEditMode(link, editableSpan) {
        editableSpan.textContent = link.textContent ?? '';
        link.classList.add('hidden');
        editableSpan.classList.remove('hidden');
        focusContentEditableAtEnd(editableSpan);
    }
    /** Focuses and sets the cursor at the end of a contenteditable element */
    function focusContentEditableAtEnd(element) {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const sel = window.getSelection();
        if (!sel)
            return;
        sel.removeAllRanges();
        sel.addRange(range);
        element.focus();
    }
    /**
     * Attaches keydown and blur events for saving or cancelling title edits.
     */
    function attachEditableSpanEventHandlers(link, editableSpan) {
        editableSpan.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                editableSpan.blur();
                saveTitleEdit(link, editableSpan);
            }
            else if (event.key === 'Escape') {
                cancelTitleEdit(link, editableSpan);
            }
        });
        editableSpan.addEventListener('blur', () => saveTitleEdit(link, editableSpan));
    }
    /**
     * Determines if a hex color string represents a light color, for contrast styling.
     * Uses an approximation of WCAG APCA formula.
     */
    function isHexColorLight(color) {
        if (!color || color === '#')
            return true;
        if (!color.startsWith('#')) {
            color = '#' + color;
        }
        const rgb = parseInt(color.slice(1, 7), 16);
        const r = (rgb >> 16) & 0xff;
        const g = (rgb >> 8) & 0xff;
        const b = rgb & 0xff;
        const luminance = Math.pow(r / 255, 2.2) * 0.2126 + Math.pow(g / 255, 2.2) * 0.7152 + Math.pow(b / 255, 2.2) * 0.0722;
        return Math.pow(luminance, 0.678) >= 0.5;
    }
    /**
     * Saves the edited title if changed. Updates UI and sends API request.
     */
    function saveTitleEdit(link, editableSpan) {
        const newText = editableSpan.textContent?.trim() ?? '';
        const originalText = link.textContent ?? '';
        if (!newText || newText === originalText) {
            restoreTitleView(link, editableSpan, originalText);
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
        restoreTitleView(link, editableSpan, newText);
    }
    /**
     * Cancel edit mode and restore original title view without changes.
     */
    function cancelTitleEdit(link, editableSpan) {
        restoreTitleView(link, editableSpan, link.textContent ?? '');
    }
    /**
     * Restores the title cell UI: hides editing span and shows the link with text.
     */
    function restoreTitleView(link, editableSpan, text) {
        link.textContent = text;
        link.classList.remove('hidden');
        editableSpan.classList.add('hidden');
    }
    //---------------- Done Column Enhancements ----------------
    /**
     * Enhances the "Done" column cells by adding checkboxes with interactive labels.
     */
    function addDoneCheckboxFeature() {
        const visibleDonePos = getVisibleColumnPosition(COLUMN_DONE);
        if (visibleDonePos === -1)
            return;
        const doneCells = document.querySelectorAll(`table td:nth-child(${visibleDonePos + 1}):not(.enhanced)`);
        doneCells.forEach(setupDoneCell);
    }
    /**
     * Sets up individual "Done" cell with checkbox and label, attaching event handlers.
     */
    function setupDoneCell(cell) {
        cell.classList.add('enhanced');
        const hasPreviousDoneLabel = Boolean(cell.querySelector('.is-done--small'));
        cell.innerHTML = buildDoneCellContentHtml(hasPreviousDoneLabel);
        const doneLabelDiv = cell.querySelector('.is-done--small');
        const checkbox = cell.querySelector('input[type="checkbox"]');
        if (!doneLabelDiv || !checkbox)
            return;
        updateDoneLabelVisibility(doneLabelDiv, checkbox.checked);
        attachDoneCheckboxEvents(checkbox, cell.closest('tr'));
    }
    /**
     * Builds inner HTML string for the "Done" cell including checkbox and label div.
     */
    function buildDoneCellContentHtml(isChecked) {
        const labelHtml = `<div class="is-done is-done--small" style="flex: 1; width: 100%;">${getDoneColumnLabelText()}</div>`;
        return `
            <div style="display: flex; align-items: center; gap: 6px;">
                <input class="bulk-edit" type="checkbox" ${isChecked ? 'checked' : ''} />
                ${labelHtml}
            </div>
        `;
    }
    /**
     * Attaches change event to the done checkbox, handling bulk and single update logic.
     */
    function attachDoneCheckboxEvents(checkbox, row) {
        checkbox.addEventListener('change', () => {
            const checked = checkbox.checked;
            const tbody = row.closest('tbody');
            if (!tbody)
                return;
            if (row.classList.contains('bulk-selected')) {
                updateDoneStatusForBulkRows(tbody, checked);
            }
            else {
                updateDoneStatusForRow(row, checked);
            }
        });
    }
    /**
     * Updates the done status (UI and backend) for a single task row.
     */
    function updateDoneStatusForRow(row, done) {
        const doneLabelDiv = row.querySelector('.is-done--small');
        if (!doneLabelDiv)
            return;
        updateDoneLabelVisibility(doneLabelDiv, done);
        const taskId = extractTaskIdFromRow(row);
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
     * Updates done status for all bulk-selected rows and sends bulk API request.
     */
    function updateDoneStatusForBulkRows(tbody, done) {
        const selectedRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
        const taskIds = selectedRows.map(extractTaskIdFromRow);
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/bulk`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ done, task_ids: taskIds })
        });
        selectedRows.forEach((row) => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            const labelDiv = row.querySelector('.is-done--small');
            if (checkbox && labelDiv) {
                checkbox.checked = done;
                updateDoneLabelVisibility(labelDiv, done);
            }
        });
    }
    /** Shows or hides the done label div based on checkbox state */
    function updateDoneLabelVisibility(label, isChecked) {
        label.classList.toggle('hidden', !isChecked);
    }
    //---------------- Fetch Tasks Utilities ----------------
    /**
     * Retrieves all unique task IDs from links in the task table.
     */
    function getAllTaskIds() {
        const links = document.querySelectorAll('tbody tr a');
        const ids = Array.from(links).map(extractTaskIdFromElement);
        return Array.from(new Set(ids)); // Unique ids only
    }
    /**
     * Gets task data for specified IDs. Fetches from API if not cached.
     */
    async function fetchTasks(ids) {
        const idsToFetch = ids.filter((id) => !taskCache[id]);
        if (idsToFetch.length > 0) {
            const fetchedTasks = await fetchTasksBatchFromApi(idsToFetch);
            fetchedTasks.forEach((task) => {
                taskCache[task.id] = task;
            });
        }
        return ids.map((id) => taskCache[id]);
    }
    /**
     * Retrieves task data from API by batches with filtering.
     */
    async function fetchTasksBatchFromApi(taskIds) {
        const results = [];
        let remainingIds = [...taskIds];
        while (remainingIds.length > 0) {
            const filter = 'id in ' + remainingIds.join(',');
            const response = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: `/api/v1/tasks/all?filter=${encodeURIComponent(filter)}`,
                    headers: {
                        Authorization: `Bearer ${getJwtToken()}`,
                        'Content-Type': 'application/json'
                    },
                    onload: resolve,
                    onerror: reject
                });
            });
            const data = JSON.parse(response.responseText);
            results.push(...data);
            const fetchedIds = data.map((task) => task.id);
            remainingIds = remainingIds.filter((id) => !fetchedIds.includes(id));
            if (fetchedIds.length === 0)
                break;
        }
        return results;
    }
    /**
     * Fetches a single task by ID using the cache or API as needed.
     */
    async function fetchTaskById(taskId) {
        return (await fetchTasks([taskId]))[0];
    }
    //---------------- Priority Column Enhancements ----------------
    /**
     * Enhances the priority column by adding dropdown selects with styled colors.
     * Supports bulk update of selected tasks.
     */
    async function addPrioritySelectFeature() {
        const visiblePriorityPos = getVisibleColumnPosition(COLUMN_PRIORITY);
        if (visiblePriorityPos === -1)
            return;
        const tasks = await fetchTasks(getAllTaskIds());
        const tbody = document.querySelector('tbody');
        if (!tbody)
            return;
        const rows = tbody.querySelectorAll('tr');
        rows.forEach((row) => configurePriorityCell(row, tasks, visiblePriorityPos));
    }
    /**
     * Creates and sets up the priority select dropdown for a single table row.
     */
    function configurePriorityCell(row, tasks, colPos) {
        const taskId = extractTaskIdFromRow(row);
        const cell = row.children[colPos];
        if (cell.classList.contains('enhanced'))
            return;
        cell.classList.add('enhanced');
        const wrapper = document.createElement('div');
        wrapper.classList.add('select');
        const select = buildPrioritySelectElement();
        const currentPriority = tasks.find((task) => task.id === taskId)?.priority ?? 0;
        updatePrioritySelectAppearance(select, currentPriority);
        wrapper.appendChild(select);
        cell.innerHTML = '';
        cell.appendChild(wrapper);
        attachPriorityChangeHandler(select, row);
    }
    /** Builds a styled priority select element with predefined options */
    function buildPrioritySelectElement() {
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
    /** Updates the visual color and value of the priority select */
    function updatePrioritySelectAppearance(select, priority) {
        select.value = priority.toString();
        if (select.selectedOptions.length > 0) {
            select.style.color = select.selectedOptions[0].style.color;
        }
    }
    /**
     * Binds the change event on the priority selector to update bulk selected rows.
     */
    function attachPriorityChangeHandler(select, row) {
        select.addEventListener('change', () => {
            const tbody = row.closest('tbody');
            if (!tbody)
                return;
            const selectedPriority = +select.value;
            updatePriorityForBulkRows(tbody, selectedPriority);
            updatePrioritySelectAppearance(select, selectedPriority);
        });
    }
    /**
     * Updates the priority for all bulk-selected rows in UI and via bulk API call.
     */
    function updatePriorityForBulkRows(tbody, priority) {
        const bulkRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
        const taskIds = bulkRows.map(extractTaskIdFromRow);
        GM_xmlhttpRequest({
            method: 'POST',
            url: '/api/v1/tasks/bulk',
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ priority, task_ids: taskIds })
        });
        bulkRows.forEach((row) => {
            const selectElement = row.querySelector('.priority-select');
            if (selectElement)
                updatePrioritySelectAppearance(selectElement, priority);
        });
    }
    //---------------- Date Column Enhancements (Due, Start, End) ----------------
    /**
     * Converts ISO UTC datetime string to a local datetime string formatted for datetime-local input.
     */
    function formatUtcToLocalDatetimeInput(utcDatetime) {
        const dateObj = new Date(utcDatetime);
        const pad = (num) => num.toString().padStart(2, '0');
        const year = dateObj.getFullYear();
        const month = pad(dateObj.getMonth() + 1);
        const day = pad(dateObj.getDate());
        const hours = pad(dateObj.getHours());
        const minutes = pad(dateObj.getMinutes());
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    }
    /**
     * Enhances a specific date column with datetime-local inputs, supporting bulk editing.
     */
    async function addDateColumnFeature(columnIndex, inputClassName, taskDateField) {
        const visibleColPos = getVisibleColumnPosition(columnIndex);
        if (visibleColPos === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${visibleColPos + 1}):not(.enhanced)`);
        const tasks = await fetchTasks(getAllTaskIds());
        cells.forEach((cell) => configureDateCell(cell, tasks, inputClassName, taskDateField));
    }
    /**
     * Sets up a single date cell with a datetime-local input and event handling.
     */
    function configureDateCell(cell, tasks, inputClassName, taskDateField) {
        cell.classList.add('enhanced');
        const taskId = extractTaskIdFromElement(cell);
        const dateValue = tasks.find((task) => task.id === taskId)?.[taskDateField];
        const input = document.createElement('input');
        input.type = 'datetime-local';
        input.classList.add(inputClassName, 'bulk-edit');
        if (dateValue && dateValue !== '0001-01-01T00:00:00Z') {
            input.value = formatUtcToLocalDatetimeInput(dateValue);
        }
        cell.innerHTML = '';
        cell.appendChild(input);
        input.addEventListener('change', () => updateDateValueForBulkRows(cell, input, inputClassName, taskDateField));
    }
    /**
     * Handles date input change event to apply bulk date updates via API.
     */
    function updateDateValueForBulkRows(cell, input, inputClass, fieldName) {
        const row = cell.closest('tr');
        if (!row)
            return;
        const newDateISO = new Date(input.value).toISOString();
        const selectedRows = Array.from(document.querySelectorAll('tbody tr.bulk-selected'));
        const taskIds = selectedRows.map(extractTaskIdFromRow);
        GM_xmlhttpRequest({
            method: 'POST',
            url: '/api/v1/tasks/bulk',
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ [fieldName]: newDateISO, task_ids: taskIds })
        });
        selectedRows.forEach((row) => {
            const bulkInput = row.querySelector(`.${inputClass}`);
            if (bulkInput)
                bulkInput.value = input.value;
        });
    }
    // Shortcut functions to enhance due, start, and end date columns.
    async function addDueDateFeature() {
        await addDateColumnFeature(COLUMN_DUE_DATE, 'due-date-datetime-local', 'due_date');
    }
    async function addStartDateFeature() {
        await addDateColumnFeature(COLUMN_START_DATE, 'start-date-datetime-local', 'start_date');
    }
    async function addEndDateFeature() {
        await addDateColumnFeature(COLUMN_END_DATE, 'end-date-datetime-local', 'end_date');
    }
    //---------------- Progress Column Enhancement ----------------
    /**
     * Enhances the progress column to support inline editing on double-click.
     */
    function addProgressEditingFeature() {
        const visibleProgressPos = getVisibleColumnPosition(COLUMN_PROGRESS);
        if (visibleProgressPos === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${visibleProgressPos + 1}):not(.enhanced)`);
        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit', 'enhanced');
            setupProgressEditing(cell);
        });
    }
    /**
     * Attaches double-click handler on progress cell to replace with numeric input.
     */
    function setupProgressEditing(cell) {
        cell.addEventListener('dblclick', (event) => {
            if (event.target.tagName === 'INPUT')
                return; // already editing
            const currentValue = parseInt(cell.innerText) || 0;
            const input = createProgressNumberInput(currentValue);
            const percentSymbol = document.createElement('span');
            percentSymbol.innerText = '%';
            cell.innerHTML = '';
            cell.appendChild(input);
            cell.appendChild(percentSymbol);
            input.focus();
            input.select();
            bindProgressInputEvents(input, cell, currentValue);
        });
    }
    /** Creates a numeric input element for progress editing with constraints */
    function createProgressNumberInput(initialValue) {
        const input = document.createElement('input');
        input.type = 'number';
        input.value = initialValue.toString();
        input.min = '0';
        input.max = '100';
        input.classList.add('edit-progress');
        return input;
    }
    /** Validates that progress value is an integer within 0-100 */
    function isProgressValueValid(progress) {
        return !isNaN(progress) && progress >= 0 && progress <= 100;
    }
    /**
     * Updates progress values for all bulk-selected tasks via individual API calls.
     */
    function updateBulkProgressValues(taskIds, progressPercent) {
        for (const id of taskIds) {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `/api/v1/tasks/${id}`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                data: JSON.stringify({ percent_done: progressPercent / 100 })
            });
        }
    }
    /**
     * Updates the UI to show new progress values for all bulk-selected rows.
     */
    function updateBulkProgressUI(progressPercent) {
        const progressColPos = getVisibleColumnPosition(COLUMN_PROGRESS);
        document.querySelectorAll('tbody tr.bulk-selected').forEach((row) => {
            const progressCell = row.querySelector(`td:nth-child(${progressColPos + 1})`);
            if (progressCell) {
                progressCell.innerText = `${progressPercent}%`;
            }
        });
    }
    /**
     * Binds event listeners for progress input to save or cancel edits.
     */
    function bindProgressInputEvents(input, cell, originalValue) {
        const saveProgress = () => {
            const rawValue = parseInt(input.value);
            const roundedValue = Math.round(rawValue / 10) * 10;
            if (isProgressValueValid(roundedValue)) {
                const selectedTasks = Array.from(document.querySelectorAll('tbody tr.bulk-selected')).map(extractTaskIdFromRow);
                updateBulkProgressValues(selectedTasks, roundedValue);
                updateBulkProgressUI(roundedValue);
            }
            else {
                cell.innerText = `${originalValue}%`;
            }
        };
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                saveProgress();
            }
            else if (event.key === 'Escape') {
                cell.innerText = `${originalValue}%`;
            }
        });
        input.addEventListener('blur', saveProgress);
    }
    //---------------- Assignees Column Enhancements ----------------
    /**
     * Enhances the assignees column cells to open an assignee selection menu on click.
     */
    function addAssigneesSelectionFeature() {
        const visibleAssigneesPos = getVisibleColumnPosition(COLUMN_ASSIGNEES);
        if (visibleAssigneesPos === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${visibleAssigneesPos + 1}):not(.enhanced)`);
        cells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit', 'enhanced');
            attachAssigneeMenuTrigger(cell);
        });
    }
    /**
     * Attaches click handler on assignee cells that triggers the assignee menu toggle.
     */
    function attachAssigneeMenuTrigger(cell) {
        cell.addEventListener('click', (event) => {
            const target = event.target;
            if (target?.closest('#assigneesMenu') || !document.contains(target))
                return;
            closeAssigneesMenu();
            openAssigneesMenuAtCell(cell);
        });
    }
    /** Closes any open assignees menu */
    function closeAssigneesMenu() {
        document.querySelector('#assigneesMenu')?.remove();
    }
    /**
     * Creates and opens the assignees menu UI attached to the given cell.
     */
    function openAssigneesMenuAtCell(cell) {
        cell.style.position = 'relative';
        const menu = createAssigneesMenuElement();
        cell.appendChild(menu);
        openAssigneesMenu(cell, menu);
    }
    /** Creates the base DOM structure for the assignees menu */
    function createAssigneesMenuElement() {
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
    /**
     * Opens the assignees menu, initializing its content and setting up events.
     */
    async function openAssigneesMenu(cell, menu) {
        menu.style.display = 'block';
        const inputField = menu.querySelector('.input');
        const selectedList = menu.querySelector('#assigneesSelectedList');
        if (!selectedList)
            return;
        await refreshSelectedAssigneesList(cell, selectedList);
        setupAssigneeSearchInput(inputField, menu);
        setupAssigneesMenuOutsideClickListener(cell, menu);
    }
    /**
     * Refreshes the list of selected assignees inside the assignees menu.
     */
    async function refreshSelectedAssigneesList(cell, selectedList) {
        selectedList.innerHTML = '';
        const task = await fetchTaskById(extractTaskIdFromElement(cell));
        if (task?.assignees) {
            for (const assignee of task.assignees) {
                selectedList.appendChild(await createAssigneeSelectedItem(assignee));
            }
        }
    }
    /**
     * Creates a UI item for a single assigned user including avatar and remove button.
     */
    async function createAssigneeSelectedItem(assignee) {
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
    /**
     * Handles removing assignee from all bulk-selected tasks or single task.
     */
    function removeAssigneeHandler(removeButton, assigneeId) {
        const row = removeButton.closest('tr');
        if (!row)
            return;
        if (row.classList.contains('bulk-selected')) {
            const bulkRows = document.querySelectorAll('tr.bulk-selected');
            for (const bulkRow of bulkRows) {
                const taskId = extractTaskIdFromElement(bulkRow);
                taskCache[taskId].assignees ??= [];
                taskCache[taskId].assignees = taskCache[taskId].assignees.filter((a) => a.id !== assigneeId);
                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: `/api/v1/tasks/${taskId}/assignees/${assigneeId}`,
                    headers: {
                        Authorization: `Bearer ${getJwtToken()}`,
                        'Content-Type': 'application/json'
                    }
                });
            }
        }
        else {
            const taskId = extractTaskIdFromElement(row);
            taskCache[taskId].assignees ??= [];
            taskCache[taskId].assignees = taskCache[taskId].assignees.filter((a) => a.id !== assigneeId);
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
    /**
     * Fetches avatar image as base64 string with caching to avoid repeated network calls.
     */
    function fetchAvatarImage(username) {
        const size = 30;
        if (avatarCache[username])
            return Promise.resolve(avatarCache[username]);
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
                        }
                        else {
                            reject(new Error('Failed to read avatar as base64'));
                        }
                    };
                    reader.readAsDataURL(blob);
                },
                onerror: reject
            });
        });
    }
    /**
     * Sets up the assignee search input field with debounce and search handling.
     */
    async function setupAssigneeSearchInput(input, menu) {
        if (!input)
            return;
        input.focus();
        const currentTask = await fetchTaskById(extractTaskIdFromElement(input));
        const debounceHandler = debounce(() => performAssigneeSearch(input, menu, currentTask.project_id), 300);
        input.addEventListener('input', debounceHandler);
        // Initial search to populate results
        performAssigneeSearch(input, menu, currentTask.project_id);
    }
    /**
     * Performs assignee search, caches results and renders search buttons.
     */
    function performAssigneeSearch(input, menu, projectId) {
        const query = input.value.trim();
        const resultsContainer = menu.querySelector('.search-results');
        if (!resultsContainer)
            return;
        const cacheKey = `${projectId}:${query}`;
        if (assigneeSearchCache.has(cacheKey)) {
            renderAssigneeSearchResults(resultsContainer, assigneeSearchCache.get(cacheKey));
            return;
        }
        GM_xmlhttpRequest({
            url: `/api/v1/projects/${projectId}/projectusers?s=${encodeURIComponent(query)}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${getJwtToken()}` },
            responseType: 'json',
            onload: async (response) => {
                const assignees = response.response ?? [];
                assigneeSearchCache.set(cacheKey, assignees);
                renderAssigneeSearchResults(resultsContainer, assignees);
            }
        });
    }
    /**
     * Renders the assignee search results as clickable buttons.
     */
    async function renderAssigneeSearchResults(container, assignees) {
        await Promise.all(assignees.map((a) => fetchAvatarImage(a.username)));
        container.innerHTML = '';
        for (const assignee of assignees) {
            const avatar = await fetchAvatarImage(assignee.username);
            container.appendChild(createAssigneeSearchButton(assignee, avatar));
        }
        refreshAssigneesUI();
    }
    /**
     * Creates a button element for an assignee in search results.
     * Clicking adds the assignee to all bulk-selected tasks.
     */
    function createAssigneeSearchButton(assignee, avatar) {
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
            const bulkRows = document.querySelectorAll('tr.bulk-selected');
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
                if (!taskCache[taskId].assignees.some((a) => a.id === assignee.id)) {
                    taskCache[taskId].assignees.push(assignee);
                }
            }
            button.style.display = 'none';
            refreshAssigneesUI();
        });
        return button;
    }
    /**
     * Sets up an event listener on the document to close the assignees menu when clicking outside it.
     */
    function setupAssigneesMenuOutsideClickListener(cell, menu) {
        const outsideClickListener = (event) => {
            if (!cell.contains(event.target) && document.contains(event.target)) {
                menu.remove();
                document.removeEventListener('click', outsideClickListener);
                refreshAssigneesColumnUI();
            }
        };
        document.addEventListener('click', outsideClickListener);
    }
    /**
     * Refreshes the assignees column UI after updates.
     */
    async function refreshAssigneesColumnUI() {
        const visibleAssigneesPos = getVisibleColumnPosition(COLUMN_ASSIGNEES);
        if (visibleAssigneesPos === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${visibleAssigneesPos + 1}):not(:has(#assigneesMenu))`);
        for (const cell of cells) {
            cell.innerHTML = '';
            const task = await fetchTaskById(extractTaskIdFromElement(cell));
            if (!task.assignees)
                continue;
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
    /**
     * Refreshes the assignees UI including search results and selected list.
     */
    async function refreshAssigneesUI() {
        const menu = document.querySelector('#assigneesMenu');
        if (!menu)
            return;
        const cell = menu.closest('td');
        if (!cell)
            return;
        const selectedList = menu.querySelector('#assigneesSelectedList');
        if (!selectedList)
            return;
        await updateAssigneeSearchButtonVisibility(menu, cell);
        await refreshSelectedAssigneesList(cell, selectedList);
    }
    /**
     * Updates visibility of assignee search result buttons based on assigned users.
     */
    async function updateAssigneeSearchButtonVisibility(menu, cell) {
        const buttons = menu.querySelectorAll('.search-results button');
        const task = await fetchTaskById(extractTaskIdFromElement(cell));
        const assignedUserIds = task?.assignees?.map((a) => a.id) || [];
        buttons.forEach((button) => {
            const assigneeId = parseInt(button.dataset.assigneeId);
            button.style.display = assignedUserIds.includes(assigneeId) ? 'none' : 'flex';
        });
    }
    //---------------- Labels Column Enhancements ----------------
    /**
     * Enhances the labels column cells with click-to-edit label selection menus.
     */
    function addLabelsSelectionFeature() {
        const visibleLabelPos = getVisibleColumnPosition(COLUMN_LABELS);
        if (visibleLabelPos === -1)
            return;
        const labelCells = document.querySelectorAll(`table td:nth-child(${visibleLabelPos + 1}):not(.enhanced)`);
        labelCells.forEach((cell) => {
            cell.style.cursor = 'pointer';
            cell.classList.add('bulk-edit', 'enhanced');
            attachLabelsMenuTrigger(cell);
        });
    }
    /**
     * Attaches click handler to label cells to open label menu.
     */
    function attachLabelsMenuTrigger(cell) {
        cell.addEventListener('click', (event) => {
            const target = event.target;
            if (target?.closest('#labelsMenu') || !document.contains(target))
                return;
            closeLabelsMenu();
            openLabelsMenuAtCell(cell);
        });
    }
    /** Closes any open labels menu */
    function closeLabelsMenu() {
        document.querySelector('#labelsMenu')?.remove();
    }
    /** Creates and opens the labels menu UI attached to the specified cell */
    function openLabelsMenuAtCell(cell) {
        cell.style.position = 'relative';
        const menu = createLabelsMenuElement();
        cell.appendChild(menu);
        openLabelsMenu(cell, menu);
    }
    /** Creates base DOM and style for the labels menu */
    function createLabelsMenuElement() {
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
     * Opens labels menu, populates selected list, sets up search input and outside click handling.
     */
    async function openLabelsMenu(cell, menu) {
        menu.style.display = 'block';
        const inputField = menu.querySelector('.input');
        const selectedList = menu.querySelector('#labelsSelectedList');
        if (!selectedList)
            return;
        await refreshSelectedLabelsList(cell, selectedList);
        setupLabelsSearchInput(inputField, menu);
        setupLabelsMenuOutsideClickListener(cell, menu);
    }
    /**
     * Sets up click listener to close labels menu when clicking outside it.
     */
    function setupLabelsMenuOutsideClickListener(cell, menu) {
        const outsideClickHandler = (event) => {
            if (!cell.contains(event.target) && document.contains(event.target)) {
                menu.remove();
                document.removeEventListener('click', outsideClickHandler);
                refreshLabelsColumnUI();
            }
        };
        document.addEventListener('click', outsideClickHandler);
    }
    /**
     * Refreshes the labels column's UI displaying assigned labels after editing.
     */
    async function refreshLabelsColumnUI() {
        const visibleLabelPos = getVisibleColumnPosition(COLUMN_LABELS);
        if (visibleLabelPos === -1)
            return;
        const labelCells = document.querySelectorAll(`table td:nth-child(${visibleLabelPos + 1}):not(:has(#labelsMenu))`);
        for (const cell of labelCells) {
            cell.innerHTML = '';
            const task = await fetchTaskById(extractTaskIdFromElement(cell));
            if (!task.labels)
                continue;
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
    /**
     * Sets up search input with debounce for labels menu.
     */
    async function setupLabelsSearchInput(input, menu) {
        if (!input)
            return;
        input.focus();
        const debouncedSearch = debounce(() => handleLabelSearch(input, menu), 300);
        input.addEventListener('input', debouncedSearch);
        handleLabelSearch(input, menu);
    }
    /**
     * Handles searching labels from API, caches results and triggers rendering.
     */
    function handleLabelSearch(input, menu) {
        const query = input.value.trim();
        const resultsContainer = menu.querySelector('.search-results');
        if (!resultsContainer)
            return;
        const cacheKey = query;
        if (labelSearchCache.has(cacheKey)) {
            renderLabelSearchResults(resultsContainer, labelSearchCache.get(cacheKey));
            return;
        }
        GM_xmlhttpRequest({
            url: `/api/v1/labels?s=${encodeURIComponent(query)}`,
            method: 'GET',
            headers: { Authorization: `Bearer ${getJwtToken()}` },
            responseType: 'json',
            onload: async (response) => {
                const labels = response.response || [];
                labelSearchCache.set(cacheKey, labels);
                renderLabelSearchResults(resultsContainer, labels);
            }
        });
    }
    /**
     * Renders label search results as buttons for selection.
     */
    async function renderLabelSearchResults(container, labels) {
        container.innerHTML = '';
        const sortedLabels = await sortLabelsAlphabetically(labels);
        for (const label of sortedLabels) {
            container.appendChild(createLabelSearchButton(label));
        }
        refreshLabelsUI();
    }
    /**
     * Creates a search result button for a label that adds the label to bulk-selected tasks.
     */
    function createLabelSearchButton(label) {
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
            <span style="font-size:12px; color:#888;" class="hidden">Enter or click</span>
        `;
        button.addEventListener('click', () => {
            const bulkRows = document.querySelectorAll('tr.bulk-selected');
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
                if (!taskCache[taskId].labels.some((l) => l.id === label.id)) {
                    taskCache[taskId].labels.push(label);
                }
            }
            button.style.display = 'none';
            refreshLabelsUI();
        });
        return button;
    }
    /**
     * Refreshes the labels menu UI including selected labels and search results.
     */
    async function refreshLabelsUI() {
        const menu = document.querySelector('#labelsMenu');
        if (!menu)
            return;
        const cell = menu.closest('td');
        if (!cell)
            return;
        const selectedList = menu.querySelector('#labelsSelectedList');
        if (!selectedList)
            return;
        await refreshSelectedLabelsList(cell, selectedList);
        await updateLabelSearchButtonVisibility(menu, cell);
    }
    /**
     * Updates visibility of label search buttons based on assigned labels for the current task.
     */
    async function updateLabelSearchButtonVisibility(menu, cell) {
        const buttons = menu.querySelectorAll('.search-results button');
        const task = await fetchTaskById(extractTaskIdFromElement(cell));
        const assignedLabelIds = task?.labels?.map((l) => l.id) || [];
        buttons.forEach((button) => {
            const labelId = parseInt(button.dataset.labelId);
            button.style.display = assignedLabelIds.includes(labelId) ? 'none' : 'flex';
        });
    }
    /**
     * Refreshes the selected labels list inside the labels menu UI.
     */
    async function refreshSelectedLabelsList(cell, selectedList) {
        selectedList.innerHTML = '';
        const task = await fetchTaskById(extractTaskIdFromElement(cell));
        if (!task?.labels)
            return;
        const sortedLabels = await sortLabelsAlphabetically(task.labels);
        for (const label of sortedLabels) {
            selectedList.appendChild(await createLabelSelectedItem(label));
        }
    }
    /**
     * Sorts an array of labels alphabetically based on current user's language settings.
     */
    async function sortLabelsAlphabetically(labels) {
        const user = await fetchCurrentUser();
        const language = user.settings.language;
        return [...labels].sort((a, b) => a.title.localeCompare(b.title, language, { ignorePunctuation: true }));
    }
    /**
     * Creates a label item element with a delete button for removing the label from selected tasks.
     */
    async function createLabelSelectedItem(label) {
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
            const bulkRows = document.querySelectorAll('tbody tr.bulk-selected');
            for (const row of bulkRows) {
                const taskId = extractTaskIdFromElement(row);
                GM_xmlhttpRequest({
                    method: 'DELETE',
                    url: `/api/v1/tasks/${taskId}/labels/${label.id}`,
                    headers: { Authorization: `Bearer ${getJwtToken()}` }
                });
                taskCache[taskId].labels ??= [];
                taskCache[taskId].labels = taskCache[taskId].labels.filter((l) => l.id !== label.id);
            }
            refreshLabelsUI();
        });
        return tag;
    }
    //---------------- Task Add Form Creation and Handling ----------------
    /**
     * Creates a new task add form with input and add button.
     */
    function createTaskAddFormElement() {
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
     * Sends request to add a new task, inserts it as a new row at the top on success.
     */
    function addNewTask(title) {
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
                const newTask = resp.response;
                taskCache[newTask.id] = await fetchTaskById(newTask.id);
                const columnCount = document.querySelectorAll('thead tr > *').length;
                const newRow = document.createElement('tr');
                newRow.classList.add('new-task-row');
                for (let i = 0; i < columnCount; i++) {
                    newRow.appendChild(document.createElement('td'));
                }
                const identifyColPos = getVisibleColumnPosition(COLUMN_IDENTIFY);
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
                const titleColPos = getVisibleColumnPosition(COLUMN_TITLE);
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
     * Shows or removes the task add form depending on presence of the tasks table.
     */
    function updateTaskAddFormVisibility() {
        const formPresent = !!document.querySelector('#taskAddForm');
        const tablePresent = !!document.querySelector('table');
        const projectId = getProjectId();
        if ((!tablePresent && formPresent) || projectId <= 0) {
            document.querySelector('#taskAddForm')?.remove();
        }
        else if (tablePresent && !formPresent) {
            const form = createTaskAddFormElement();
            const switchViewContainer = document.querySelector('.switch-view-container');
            switchViewContainer?.insertAdjacentElement('afterend', form);
        }
    }
    //---------------- Table Row Bulk Selection and Drag & Drop ----------------
    let currentlyDraggedRows = [];
    // Manages row selection with clicking, shift-click for range, ctrl/cmd for multi-select
    document.addEventListener('click', (event) => {
        const target = event.target;
        const clickedRow = target.closest('tr');
        const tbody = clickedRow?.closest('tbody');
        const filterContainer = document.querySelector('.columns-filter');
        if (!clickedRow || !tbody || !filterContainer)
            return;
        const allRows = Array.from(tbody.querySelectorAll('tr'));
        // Ignore clicks within selected bulk-edit controls
        if (target.closest('.bulk-edit')?.closest('.bulk-selected'))
            return;
        if (!target.closest('.bulk-edit')) {
            event.preventDefault();
        }
        const lastClickedRow = tbody.querySelector('tr.last-clicked');
        if (event.shiftKey && lastClickedRow) {
            allRows.forEach((row) => row.classList.remove('bulk-selected'));
            const start = allRows.indexOf(lastClickedRow);
            const end = allRows.indexOf(clickedRow);
            const [from, to] = [start, end].sort((a, b) => a - b);
            for (let i = from; i <= to; i++) {
                allRows[i].classList.add('bulk-selected');
            }
        }
        else if (event.ctrlKey || event.metaKey) {
            clickedRow.classList.toggle('bulk-selected');
        }
        else {
            allRows.forEach((row) => row.classList.remove('bulk-selected'));
            clickedRow.classList.add('bulk-selected');
        }
        allRows.forEach((row) => row.classList.remove('last-clicked'));
        clickedRow.classList.add('last-clicked');
    });
    // Drag start prepares list of dragged rows if they belong to bulk-selected class
    document.addEventListener('dragstart', (event) => {
        if (!getColumnsFilterElement())
            return;
        const draggedRow = event.target.closest('tr');
        const tbody = draggedRow?.closest('tbody');
        if (!draggedRow || !tbody || !draggedRow.classList.contains('bulk-selected')) {
            event.preventDefault();
            return;
        }
        currentlyDraggedRows = Array.from(tbody.querySelectorAll('tr.bulk-selected'));
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', 'dragging');
    });
    // Dragover event adds visual helpers and prevents illegal drops, checking for task hierarchy
    document.addEventListener('dragover', async (event) => {
        if (!getColumnsFilterElement())
            return;
        const targetRow = event.target.closest('tbody tr');
        const table = event.target.closest('table');
        const projectMenu = event.target.closest('a.base-button.list-menu-link[href^="/projects/"]');
        if (targetRow && !targetRow.classList.contains('bulk-selected')) {
            const draggedTaskIds = currentlyDraggedRows.map(extractTaskIdFromElement);
            const targetTaskParents = await getAllParentTaskIds(extractTaskIdFromElement(targetRow));
            for (const parentId of targetTaskParents) {
                if (draggedTaskIds.includes(parentId)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'none';
                    return;
                }
            }
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            targetRow.classList.add('drag-over');
        }
        else if (table && !targetRow) {
            table.classList.add('drag-over');
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
        }
        else if (projectMenu) {
            const pmProjectId = parseInt(projectMenu.href.split('/').pop() ?? '0');
            if (pmProjectId > 0 && pmProjectId !== getProjectId()) {
                projectMenu.classList.add('drag-over');
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
            }
        }
    });
    // Remove drag visual indicators on drag end or drag leave
    document.addEventListener('dragend', () => {
        document.querySelector('.drag-over')?.classList.remove('drag-over');
    });
    document.addEventListener('dragleave', () => {
        document.querySelector('.drag-over')?.classList.remove('drag-over');
    });
    // Drop event handles task hierarchy update, project moves, and parent task reassignment
    document.addEventListener('drop', async (event) => {
        if (!getColumnsFilterElement())
            return;
        const draggedTaskIds = currentlyDraggedRows.map(extractTaskIdFromElement);
        let topLevelDraggedIds = [...draggedTaskIds];
        // Remove tasks that are children of other dragged tasks (only keep top-level)
        for (const id of draggedTaskIds) {
            const parentIds = await getAllParentTaskIds(id);
            if (topLevelDraggedIds.some((otherId) => parentIds.includes(otherId))) {
                topLevelDraggedIds = topLevelDraggedIds.filter((i) => i !== id);
            }
        }
        const targetRow = event.target.closest('tbody tr');
        const table = event.target.closest('table');
        const projectMenu = event.target.closest('a.base-button.list-menu-link[href^="/projects/"]');
        if (targetRow) {
            const targetTaskId = extractTaskIdFromElement(targetRow);
            await Promise.all(topLevelDraggedIds.map(async (draggedId) => {
                const draggedTask = await fetchTaskById(draggedId);
                if (!draggedTask || !targetTaskId)
                    return;
                const oldParentId = draggedTask.related_tasks.parenttask?.[0]?.id;
                if (oldParentId) {
                    await new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: 'DELETE',
                            url: `/api/v1/tasks/${draggedId}/relations/parenttask/${oldParentId}`,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${getJwtToken()}`
                            },
                            onload: () => resolve()
                        });
                    });
                }
                await new Promise((resolve) => {
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
                        onload: () => resolve()
                    });
                });
            }));
            clearCachedTaskData();
            await fetchTasks(getAllTaskIds());
            await reorderTaskRows(document.querySelectorAll('tbody tr'));
        }
        else if (table) {
            await Promise.all(topLevelDraggedIds.map(async (id) => {
                const task = await fetchTaskById(id);
                if (!task)
                    return;
                const oldParentId = task.related_tasks.parenttask?.[0]?.id;
                if (oldParentId) {
                    await new Promise((resolve) => {
                        GM_xmlhttpRequest({
                            method: 'DELETE',
                            url: `/api/v1/tasks/${id}/relations/parenttask/${oldParentId}`,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${getJwtToken()}`
                            },
                            onload: () => resolve()
                        });
                    });
                }
            }));
            clearCachedTaskData();
            await fetchTasks(getAllTaskIds());
            await reorderTaskRows(document.querySelectorAll('tbody tr'));
        }
        else if (projectMenu) {
            const newProjectId = parseInt(projectMenu.href.split('/').pop() ?? '0');
            await Promise.all(draggedTaskIds.map((id) => new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `/api/v1/tasks/${id}`,
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${getJwtToken()}`
                    },
                    data: JSON.stringify({ project_id: newProjectId }),
                    onload: () => resolve()
                });
            })));
            currentlyDraggedRows.forEach((row) => row.remove());
            clearCachedTaskData();
            await fetchTasks(getAllTaskIds());
            await reorderTaskRows(document.querySelectorAll('tbody tr'));
        }
    });
    //---------------- Mutation Observer for Row Selection ----------------
    /**
     * Watches class attribute changes on table rows to update draggable attribute as selection state changes.
     */
    function initializeRowSelectionMutationObserver() {
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type !== 'attributes' || mutation.attributeName !== 'class')
                    continue;
                const element = mutation.target;
                if (!(element instanceof HTMLTableRowElement))
                    continue;
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
    /**
     * Toggles draggable attribute on a row if bulk-selected class was added/removed.
     */
    function handleRowSelectionClassChange(row, oldClassValue) {
        const isCurrentlySelected = row.classList.contains('bulk-selected');
        const wasPreviouslySelected = oldClassValue?.includes('bulk-selected') ?? false;
        if (isCurrentlySelected !== wasPreviouslySelected) {
            if (isCurrentlySelected) {
                row.setAttribute('draggable', 'true');
            }
            else {
                row.removeAttribute('draggable');
            }
        }
    }
    /**
     * Returns the hierarchy (indent) level of a task based on parent tasks.
     * 0 for root tasks, 1+ for children.
     */
    async function getTaskHierarchyLevel(taskId) {
        let indentLevel = 0;
        let currentId = taskId;
        const baseTask = await fetchTaskById(currentId);
        if (!baseTask)
            return indentLevel;
        while (true) {
            const task = await fetchTaskById(currentId);
            if (!task.related_tasks.parenttask?.length ||
                task.related_tasks.parenttask[0].project_id !== baseTask.project_id) {
                break;
            }
            currentId = task.related_tasks.parenttask[0].id;
            indentLevel++;
        }
        return indentLevel;
    }
    /**
     * Clears cached task data.
     */
    function clearCachedTaskData() {
        for (const key in taskCache) {
            delete taskCache[key];
        }
    }
    /**
     * Reorders table rows to visually represent hierarchy of tasks.
     */
    async function reorderTaskRows(rows) {
        const data = await Promise.all([...rows].map(async (row) => {
            const task = await fetchTaskById(extractTaskIdFromRow(row));
            const level = await getTaskHierarchyLevel(task.id);
            return { row, level };
        }));
        // Sort by level ascending, process in reversed order to preserve insertion order
        data.reverse().sort((a, b) => a.level - b.level);
        for (const { row, level } of data) {
            if (level !== 0) {
                const task = await fetchTaskById(extractTaskIdFromRow(row));
                const parentId = task.related_tasks.parenttask[0].id;
                const parentRow = [...rows].find((r) => extractTaskIdFromRow(r) === parentId);
                if (parentRow)
                    parentRow.insertAdjacentElement('afterend', row);
            }
            row.style.setProperty('--level', level.toString());
        }
    }
    /**
     * Gets all parent task IDs for a given task, walking up all parents.
     */
    async function getAllParentTaskIds(taskId) {
        let currentId = taskId;
        const parentIds = [];
        while (true) {
            const task = await fetchTaskById(currentId);
            if (!task.related_tasks?.parenttask?.length)
                break;
            const parentId = task.related_tasks.parenttask[0].id;
            parentIds.push(parentId);
            currentId = parentId;
        }
        return parentIds;
    }
    // Cache for table thead HTML and URL to detect changes
    let lastCachedTheadHtml = null;
    let lastCachedUrl = null;
    /**
     * Periodically checks for URL or table header changes to clear new task rows.
     */
    setInterval(() => {
        const currentUrl = document.location.href;
        const currentTheadHtml = document.querySelector('thead')?.outerHTML ?? null;
        if (currentUrl !== lastCachedUrl || currentTheadHtml !== lastCachedTheadHtml) {
            lastCachedUrl = currentUrl;
            lastCachedTheadHtml = currentTheadHtml;
            document.querySelectorAll('.new-task-row').forEach((row) => row.remove());
        }
    }, 100);
    //---------------- General Enhancements ----------------
    /**
     * Applies all enhancements for task table columns.
     */
    function applyAllTableColumnEnhancements() {
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
    /** Fix horizontal overflow for tables inside scrollable containers */
    function fixTableHorizontalOverflow() {
        const container = document.querySelector('table')?.closest('.has-horizontal-overflow');
        if (container)
            container.style.overflow = 'visible';
    }
    // Debounced version of updateTaskAddFormVisibility to avoid rapid calls
    const debouncedUpdateTaskAddFormVisibility = debounce(() => updateTaskAddFormVisibility(), 300);
    /**
     * Handles DOM mutations for the task list, updating UI and informing necessary enhancements.
     */
    async function handleDomMutations(observer) {
        debouncedUpdateTaskAddFormVisibility();
        if (!document.querySelector('table tbody tr td') || !document.querySelector('.columns-filter')) {
            return;
        }
        observer.disconnect();
        if (document.querySelector('table tbody tr td') && !document.querySelector('tr[style*="--level"]')) {
            clearCachedTaskData();
            await fetchTasks(getAllTaskIds());
            const rows = document.querySelectorAll('tbody tr');
            await reorderTaskRows(rows);
        }
        applyAllTableColumnEnhancements();
        fixTableHorizontalOverflow();
        observer.observe(document.body, observerConfig);
    }
    const observerConfig = { attributes: true, childList: true, subtree: true };
    const mutationObserver = new MutationObserver((mutations, observer) => {
        handleDomMutations(observer);
    });
    // Initial observer start
    mutationObserver.observe(document.body, observerConfig);
    initializeRowSelectionMutationObserver();
    //---------------- Utility Functions ----------------
    /**
     * Creates a debounced function that delays its invocation.
     */
    function debounce(func, delay = 300) {
        let timeoutId;
        return function (...args) {
            if (timeoutId)
                clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }
    /**
     * Creates a throttled function that limits invocation frequency.
     */
    function throttle(func, limit) {
        let inThrottle = false;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => (inThrottle = false), limit);
            }
        };
    }
    //---------------- Insert CSS Styles ----------------
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
            color: var(--button-hover-color);
            cursor: pointer;
        }
        .bulk-selected {
            background-color: var(--table-row-hover-background-color);
        }
        .drag-over {
            outline: 2px dashed var(--link-focus-border);
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
            padding-left: calc(0.75em + 20px * var(--level, 0));
        }
        .is-done {
            background: var(--success);
            color: var(--white);
            padding: .5rem;
            font-weight: 700;
            line-height: 1;
            border-radius: 4px;
            text-align: center;
        }
    `);
})();
