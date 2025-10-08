// ==UserScript==
// @name         Vikunja Enhanced Task Table
// @namespace    https://github.com/Plong-Wasin
// @version      0.5.0
// @description  Adds inline editing, bulk actions, drag & drop, and other UI enhancements to Vikunja task tables.
// @author       Plong-Wasin
// @match        https://try.vikunja.io/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/Plong-Wasin/vikunja-enhancements/refs/heads/main/vikunja-enhanced-task-table.user.js
// @downloadURL  https://raw.githubusercontent.com/Plong-Wasin/vikunja-enhancements/refs/heads/main/vikunja-enhanced-task-table.user.js
// ==/UserScript==
"use strict";
(() => {
  // scripts/vikunja-enhanced-task-table/styles/main.css.ts
  GM_addStyle(`
    body:has(.columns-filter) {
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
        tbody tr td.column-title {
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
        .enhanced {
            .text-wrapper {
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .label-wrapper {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }
        }
    }
`);
  function fixTableHorizontalOverflow() {
    const container = document.querySelector("table")?.closest(".has-horizontal-overflow");
    if (container) {
      container.style.overflow = "visible";
    }
  }

  // scripts/vikunja-enhanced-task-table/utils/dom.ts
  function getProjectId() {
    const parts = window.location.pathname.split("/");
    return +parts[2];
  }
  function getJwtToken() {
    return localStorage.getItem("token");
  }
  function getVisibleColumnPosition(columnIndex) {
    return getVisibleColumnIndices().indexOf(columnIndex);
  }
  function getVisibleColumnIndices() {
    const checkedIndices = [];
    document.querySelectorAll(".columns-filter input").forEach((input, index) => {
      if (input.checked) {
        checkedIndices.push(index);
      }
    });
    return checkedIndices;
  }
  function getColumnsFilterElement() {
    return document.querySelector(".columns-filter");
  }
  function extractTaskIdFromRow(row) {
    if (!row) {
      return 0;
    }
    const link = row.querySelector("a");
    if (!link) {
      return 0;
    }
    const idStr = link.href.split("/").pop();
    return idStr ? Number(idStr) : 0;
  }
  function extractTaskIdFromElement(element) {
    const row = element.closest("tr");
    return extractTaskIdFromRow(row);
  }
  function getDoneColumnLabelText() {
    return document.querySelectorAll(".columns-filter span")[1]?.textContent ?? "";
  }
  function focusContentEditableAtEnd(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const sel = window.getSelection();
    if (!sel) {
      return;
    }
    sel.removeAllRanges();
    sel.addRange(range);
    element.focus();
  }

  // scripts/vikunja-enhanced-task-table/utils/cache.ts
  var taskCache = {};
  var avatarCache = {};
  var assigneeSearchCache = /* @__PURE__ */ new Map();
  var labelSearchCache = /* @__PURE__ */ new Map();
  var cache = {
    user: null
  };
  function clearCachedTaskData() {
    for (const key in taskCache) {
      delete taskCache[key];
    }
  }

  // scripts/vikunja-enhanced-task-table/api/tasks.ts
  async function fetchCurrentUser() {
    if (!cache.user) {
      cache.user = await new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: "/api/v1/user",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getJwtToken()}`
          },
          responseType: "json",
          onload: (response) => resolve(response.response)
        });
      });
    }
    return cache.user;
  }
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
  async function fetchTasksBatchFromApi(taskIds) {
    const results = [];
    let remainingIds = [...taskIds];
    while (remainingIds.length > 0) {
      const filter = "id in " + remainingIds.join(",");
      const response = await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `/api/v1/tasks/all?filter=${encodeURIComponent(filter)}`,
          headers: {
            Authorization: `Bearer ${getJwtToken()}`,
            "Content-Type": "application/json"
          },
          onload: resolve,
          onerror: reject,
          responseType: "json"
        });
      });
      const data = response.response;
      results.push(...data);
      const fetchedIds = data.map((task) => task.id);
      remainingIds = remainingIds.filter((id) => !fetchedIds.includes(id));
      if (fetchedIds.length === 0) {
        break;
      }
    }
    return results;
  }
  async function fetchTaskById(taskId) {
    return (await fetchTasks([taskId]))[0];
  }
  async function updateSingleTask(taskId, payload) {
    const task = await fetchTaskById(taskId);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "POST",
        url: `/api/v1/tasks/${taskId}`,
        headers: {
          Authorization: `Bearer ${getJwtToken()}`,
          "Content-Type": "application/json"
        },
        data: JSON.stringify({ ...task, ...payload }),
        responseType: "json",
        onload: (response) => {
          const updatedTask = response.response;
          taskCache[taskId] = { ...taskCache[taskId], ...updatedTask };
          resolve(updatedTask);
        },
        onerror: (err) => reject(err)
      });
    });
  }

  // scripts/vikunja-enhanced-task-table/constants/columns.ts
  var COLUMN_IDENTIFIER = 0;
  var COLUMN_DONE = 1;
  var COLUMN_TITLE = 2;
  var COLUMN_PRIORITY = 3;
  var COLUMN_LABELS = 4;
  var COLUMN_ASSIGNEES = 5;
  var COLUMN_DUE_DATE = 6;
  var COLUMN_START_DATE = 7;
  var COLUMN_END_DATE = 8;
  var COLUMN_PROGRESS = 9;
  var COLORS = [
    "#ffbe0b",
    "#fd8a09",
    "#fb5607",
    "#ff006e",
    "#efbdeb",
    "#8338ec",
    "#5f5ff6",
    "#3a86ff",
    "#4c91ff",
    "#0ead69",
    "#25be8b",
    "#073b4c",
    "#373f47"
  ];
  var COLOR_LIGHT = "hsl(220, 13%, 91%)";
  var COLOR_DARK = "hsl(215, 27.9%, 16.9%)";

  // scripts/vikunja-enhanced-task-table/features/editableTitle.ts
  function addEditableTitleFeature() {
    const visibleTitlePos = getVisibleColumnPosition(COLUMN_TITLE);
    if (visibleTitlePos === -1) {
      return;
    }
    const titleCells = document.querySelectorAll(
      `table td:nth-child(${visibleTitlePos + 1}):not(.enhanced)`
    );
    titleCells.forEach(setupEditableTitleCell);
  }
  async function setupEditableTitleCell(cell) {
    cell.style.cursor = "pointer";
    cell.classList.add("enhanced", "column-title");
    const titleLink = cell.querySelector("a");
    if (!titleLink) {
      return;
    }
    const container = document.createElement("div");
    applyFlexContainerStyle(container);
    cell.appendChild(container);
    const titleWrapper = document.createElement("span");
    titleWrapper.classList.add("title-wrapper");
    const titleTextSpan = document.createElement("span");
    titleTextSpan.classList.add("title-text");
    titleTextSpan.textContent = titleLink.textContent ?? "";
    titleLink.textContent = "";
    titleLink.appendChild(titleTextSpan);
    titleWrapper.appendChild(titleLink);
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    if (task.attachments) {
      const attachmentIcon = createAttachmentIcon();
      titleWrapper.appendChild(attachmentIcon);
    }
    if (taskHasDescription(task)) {
      const descriptionIcon = createDescriptionIcon();
      titleWrapper.appendChild(descriptionIcon);
    }
    container.appendChild(titleWrapper);
    const editableContentSpan = createContentEditableSpan();
    container.appendChild(editableContentSpan);
    const editButton = createEditButton(titleLink, editableContentSpan);
    container.appendChild(editButton);
    container.addEventListener("dblclick", () => activateEditMode(titleLink, editableContentSpan));
    attachEditableSpanEventHandlers(titleLink, editableContentSpan);
  }
  function createAttachmentIcon() {
    const fileIcon = document.createElement("span");
    fileIcon.className = "project-task-icon";
    fileIcon.innerHTML = `
        <svg class="svg-inline--fa fa-paperclip" data-prefix="fas" data-icon="paperclip" role="img" viewBox="0 0 512 512" aria-hidden="true">
            <path fill="currentColor" d="M224.6 12.8c56.2-56.2 147.4-56.2 203.6 0s56.2 147.4 0 203.6l-164 164c-34.4 34.4-90.1 34.4-124.5 0s-34.4-90.1 0-124.5L292.5 103.3c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L185 301.3c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l164-164c31.2-31.2 31.2-81.9 0-113.1s-81.9-31.2-113.1 0l-164 164c-53.1 53.1-53.1 139.2 0 192.3s139.2 53.1 192.3 0L428.3 284.3c12.5-12.5 32.8-12.5 45.3 0s12.5 32.8 0 45.3L343.4 459.6c-78.1 78.1-204.7 78.1-282.8 0s-78.1-204.7 0-282.8l164-164z"/>
        </svg>`;
    return fileIcon;
  }
  function taskHasDescription(task) {
    if (!task.description) {
      return false;
    }
    return task.description !== "<p></p>";
  }
  function createDescriptionIcon() {
    const descriptionIcon = document.createElement("span");
    descriptionIcon.className = "project-task-icon is-mirrored-rtl";
    descriptionIcon.innerHTML = `
        <svg class="svg-inline--fa fa-align-left" data-prefix="fas" data-icon="align-left" role="img" viewBox="0 0 448 512" aria-hidden="true">
            <path fill="currentColor" d="M288 64c0 17.7-14.3 32-32 32L32 96C14.3 96 0 81.7 0 64S14.3 32 32 32l224 0c17.7 0 32 14.3 32 32zm0 256c0 17.7-14.3 32-32 32L32 352c-17.7 0-32-14.3-32-32s14.3-32 32-32l224 0c17.7 0 32 14.3 32 32zM0 192c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 224c-17.7 0-32-14.3-32-32zM448 448c0 17.7-14.3 32-32 32L32 480c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z"/>
        </svg>`;
    return descriptionIcon;
  }
  function applyFlexContainerStyle(element) {
    element.style.display = "flex";
    element.style.justifyContent = "space-between";
    element.style.alignItems = "center";
  }
  function createContentEditableSpan() {
    const span = document.createElement("span");
    span.contentEditable = "true";
    span.classList.add("hidden", "editable-span");
    return span;
  }
  function createEditButton(link, editableSpan) {
    const button = document.createElement("button");
    button.innerHTML = "\u270E";
    button.className = "edit-title";
    button.addEventListener("click", () => activateEditMode(link, editableSpan));
    return button;
  }
  function activateEditMode(link, editableSpan) {
    editableSpan.textContent = link.textContent ?? "";
    const textWrapper = link.closest(".title-wrapper");
    textWrapper?.classList.add("hidden");
    editableSpan.classList.remove("hidden");
    focusContentEditableAtEnd(editableSpan);
  }
  function attachEditableSpanEventHandlers(link, editableSpan) {
    editableSpan.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        editableSpan.blur();
        saveTitleEdit(link, editableSpan);
      } else if (event.key === "Escape") {
        cancelTitleEdit(link, editableSpan);
      }
    });
    editableSpan.addEventListener("blur", () => saveTitleEdit(link, editableSpan));
  }
  function saveTitleEdit(link, editableSpan) {
    const newText = editableSpan.textContent?.trim() ?? "";
    const originalText = link.textContent ?? "";
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
  function cancelTitleEdit(link, editableSpan) {
    restoreTitleView(link, editableSpan, link.textContent ?? "");
  }
  function restoreTitleView(link, editableSpan, text) {
    const textWrapper = link.closest(".title-wrapper");
    link.textContent = text;
    textWrapper?.classList.remove("hidden");
    editableSpan.classList.add("hidden");
  }

  // scripts/vikunja-enhanced-task-table/features/doneCheckbox.ts
  function addDoneCheckboxFeature() {
    const visibleDonePos = getVisibleColumnPosition(COLUMN_DONE);
    if (visibleDonePos === -1) {
      return;
    }
    const doneCells = document.querySelectorAll(
      `table td:nth-child(${visibleDonePos + 1}):not(.enhanced)`
    );
    doneCells.forEach(setupDoneCell);
  }
  function setupDoneCell(cell) {
    cell.classList.add("enhanced");
    const hasPreviousDoneLabel = Boolean(cell.querySelector(".is-done--small"));
    cell.innerHTML = buildDoneCellContentHtml(hasPreviousDoneLabel);
    const doneLabelDiv = cell.querySelector(".is-done--small");
    const checkbox = cell.querySelector('input[type="checkbox"]');
    if (!doneLabelDiv || !checkbox) {
      return;
    }
    updateDoneLabelVisibility(doneLabelDiv, checkbox.checked);
    attachDoneCheckboxEvents(checkbox, cell.closest("tr"));
  }
  function buildDoneCellContentHtml(isChecked) {
    const labelHtml = `<div class="is-done is-done--small" style="flex: 1; width: 100%;">${getDoneColumnLabelText()}</div>`;
    return `
            <div style="display: flex; align-items: center; gap: 6px;">
                <input class="bulk-edit" type="checkbox" ${isChecked ? "checked" : ""} />
                ${labelHtml}
            </div>
        `;
  }
  function attachDoneCheckboxEvents(checkbox, row) {
    checkbox.addEventListener("change", () => {
      const checked = checkbox.checked;
      const tbody = row.closest("tbody");
      if (!tbody) {
        return;
      }
      updateDoneStatusForBulkRows(tbody, checked);
    });
  }
  async function updateDoneStatusForBulkRows(tbody, done) {
    const selectedRows = Array.from(tbody.querySelectorAll("tr.bulk-selected"));
    const taskIds = selectedRows.map(extractTaskIdFromRow);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    for (const taskId of taskIds) {
      const task = await fetchTaskById(taskId);
      if (done && task.done) {
        continue;
      }
      updateSingleTask(taskId, { done, done_at: done ? now : "0001-01-01T00:00:00Z" });
      taskCache[taskId].done = done;
      taskCache[taskId].done_at = done ? now : "0001-01-01T00:00:00Z";
    }
    selectedRows.forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const labelDiv = row.querySelector(".is-done--small");
      if (checkbox && labelDiv) {
        checkbox.checked = done;
        updateDoneLabelVisibility(labelDiv, done);
      }
    });
  }
  function updateDoneLabelVisibility(label, isChecked) {
    label.classList.toggle("hidden", !isChecked);
  }

  // scripts/vikunja-enhanced-task-table/features/prioritySelect.ts
  async function addPrioritySelectFeature() {
    const visiblePriorityPos = getVisibleColumnPosition(COLUMN_PRIORITY);
    if (visiblePriorityPos === -1) {
      return;
    }
    const tasks = await fetchTasks(getAllTaskIds());
    const tbody = document.querySelector("tbody");
    const rows = tbody?.querySelectorAll(
      `tr:has(td:nth-child(${visiblePriorityPos + 1}):not(.enhanced))`
    );
    if (!tbody || !rows || rows.length === 0) {
      return;
    }
    rows.forEach((row) => configurePriorityCell(row, tasks, visiblePriorityPos));
  }
  function getAllTaskIds() {
    const links = document.querySelectorAll("tbody tr a");
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
  }
  function configurePriorityCell(row, tasks, colPos) {
    const taskId = extractTaskIdFromRow(row);
    const cell = row.children[colPos];
    if (cell.classList.contains("enhanced")) {
      return;
    }
    cell.classList.add("enhanced");
    const wrapper = document.createElement("div");
    wrapper.classList.add("select");
    const select = buildPrioritySelectElement();
    const currentPriority = tasks.find((task) => task.id === taskId)?.priority ?? 0;
    updatePrioritySelectAppearance(select, currentPriority);
    wrapper.appendChild(select);
    cell.innerHTML = "";
    cell.appendChild(wrapper);
    attachPriorityChangeHandler(select, row);
  }
  function buildPrioritySelectElement() {
    const select = document.createElement("select");
    select.classList.add("priority-select", "bulk-edit");
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
  function updatePrioritySelectAppearance(select, priority) {
    select.value = priority.toString();
    if (select.selectedOptions.length > 0) {
      select.style.color = select.selectedOptions[0].style.color;
    }
  }
  function attachPriorityChangeHandler(select, row) {
    select.addEventListener("change", () => {
      const tbody = row.closest("tbody");
      if (!tbody) {
        return;
      }
      const selectedPriority = +select.value;
      updatePriorityForBulkRows(tbody, selectedPriority);
      updatePrioritySelectAppearance(select, selectedPriority);
    });
  }
  function updatePriorityForBulkRows(tbody, priority) {
    const bulkRows = Array.from(tbody.querySelectorAll("tr.bulk-selected"));
    const taskIds = bulkRows.map(extractTaskIdFromRow);
    for (const taskId of taskIds) {
      updateSingleTask(taskId, { priority });
    }
    bulkRows.forEach((row) => {
      const selectElement = row.querySelector(".priority-select");
      if (selectElement) {
        updatePrioritySelectAppearance(selectElement, priority);
      }
    });
  }

  // scripts/vikunja-enhanced-task-table/features/dateColumns.ts
  function formatUtcToLocalDatetimeInput(utcDatetime) {
    const dateObj = new Date(utcDatetime);
    const pad = (num) => num.toString().padStart(2, "0");
    const year = dateObj.getFullYear();
    const month = pad(dateObj.getMonth() + 1);
    const day = pad(dateObj.getDate());
    const hours = pad(dateObj.getHours());
    const minutes = pad(dateObj.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  async function addDateColumnFeature(columnIndex, inputClassName, taskDateField) {
    const visibleColPos = getVisibleColumnPosition(columnIndex);
    if (visibleColPos === -1) {
      return;
    }
    const cells = document.querySelectorAll(
      `table td:nth-child(${visibleColPos + 1}):not(.enhanced)`
    );
    const tasks = await fetchTasks(getAllTaskIds2());
    cells.forEach((cell) => configureDateCell(cell, tasks, inputClassName, taskDateField));
  }
  function configureDateCell(cell, tasks, inputClassName, taskDateField) {
    cell.classList.add("enhanced");
    const taskId = extractTaskIdFromElement(cell);
    const dateValue = tasks.find((task) => task.id === taskId)?.[taskDateField];
    const input = document.createElement("input");
    input.type = "datetime-local";
    input.classList.add(inputClassName, "bulk-edit");
    if (dateValue && dateValue !== "0001-01-01T00:00:00Z") {
      input.value = formatUtcToLocalDatetimeInput(dateValue);
    }
    cell.innerHTML = "";
    cell.appendChild(input);
    input.addEventListener("change", () => updateDateValueForBulkRows(cell, input, inputClassName, taskDateField));
  }
  function updateDateValueForBulkRows(cell, input, inputClass, fieldName) {
    const row = cell.closest("tr");
    if (!row) {
      return;
    }
    const newDateISO = new Date(input.value).toISOString();
    const selectedRows = Array.from(document.querySelectorAll("tbody tr.bulk-selected"));
    const taskIds = selectedRows.map((tr) => extractTaskIdFromElement(tr));
    for (const taskId of taskIds) {
      updateSingleTask(taskId, { [fieldName]: newDateISO });
    }
    selectedRows.forEach((row2) => {
      const bulkInput = row2.querySelector(`.${inputClass}`);
      if (bulkInput) {
        bulkInput.value = input.value;
      }
    });
  }
  async function addDueDateFeature() {
    await addDateColumnFeature(COLUMN_DUE_DATE, "due-date-datetime-local", "due_date");
  }
  async function addStartDateFeature() {
    await addDateColumnFeature(COLUMN_START_DATE, "start-date-datetime-local", "start_date");
  }
  async function addEndDateFeature() {
    await addDateColumnFeature(COLUMN_END_DATE, "end-date-datetime-local", "end_date");
  }
  function getAllTaskIds2() {
    const links = document.querySelectorAll("tbody tr a");
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
  }

  // scripts/vikunja-enhanced-task-table/features/progressEditing.ts
  function addProgressEditingFeature() {
    const visibleProgressPos = getVisibleColumnPosition(COLUMN_PROGRESS);
    if (visibleProgressPos === -1) {
      return;
    }
    const cells = document.querySelectorAll(
      `table td:nth-child(${visibleProgressPos + 1}):not(.enhanced)`
    );
    cells.forEach((cell) => {
      cell.style.cursor = "pointer";
      cell.classList.add("bulk-edit", "enhanced");
      setupProgressEditing(cell);
    });
  }
  function setupProgressEditing(cell) {
    cell.addEventListener("dblclick", (event) => {
      if (event.target.tagName === "INPUT") {
        return;
      }
      const currentValue = parseInt(cell.innerText) || 0;
      const input = createProgressNumberInput(currentValue);
      const percentSymbol = document.createElement("span");
      percentSymbol.innerText = "%";
      cell.innerHTML = "";
      cell.appendChild(input);
      cell.appendChild(percentSymbol);
      input.focus();
      input.select();
      bindProgressInputEvents(input, cell, currentValue);
    });
  }
  function createProgressNumberInput(initialValue) {
    const input = document.createElement("input");
    input.type = "number";
    input.value = initialValue.toString();
    input.min = "0";
    input.max = "100";
    input.classList.add("edit-progress");
    return input;
  }
  function isProgressValueValid(progress) {
    return !isNaN(progress) && progress >= 0 && progress <= 100;
  }
  function updateBulkProgressValues(taskIds, progressPercent) {
    for (const id of taskIds) {
      updateSingleTask(id, { percent_done: progressPercent / 100 });
    }
  }
  function updateBulkProgressUI(progressPercent) {
    const progressColPos = getVisibleColumnPosition(COLUMN_PROGRESS);
    document.querySelectorAll("tbody tr.bulk-selected").forEach((row) => {
      const progressCell = row.querySelector(`td:nth-child(${progressColPos + 1})`);
      if (progressCell) {
        progressCell.innerText = `${progressPercent}%`;
      }
    });
  }
  function bindProgressInputEvents(input, cell, originalValue) {
    const saveProgress = () => {
      const rawValue = parseInt(input.value);
      const roundedValue = Math.round(rawValue / 10) * 10;
      if (isProgressValueValid(roundedValue)) {
        const selectedTasks = Array.from(
          document.querySelectorAll("tbody tr.bulk-selected")
        ).map(extractTaskIdFromRow);
        updateBulkProgressValues(selectedTasks, roundedValue);
        updateBulkProgressUI(roundedValue);
      } else {
        cell.innerText = `${originalValue}%`;
      }
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        saveProgress();
      } else if (event.key === "Escape") {
        cell.innerText = `${originalValue}%`;
      }
    });
    input.addEventListener("blur", saveProgress);
  }

  // scripts/vikunja-enhanced-task-table/utils/debounce.ts
  function debounce(func, delay = 300) {
    let timeoutId = null;
    return function(...args) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // scripts/vikunja-enhanced-task-table/features/assigneesSelection.ts
  function addAssigneesSelectionFeature() {
    const visibleAssigneesPos = getVisibleColumnPosition(COLUMN_ASSIGNEES);
    if (visibleAssigneesPos === -1) {
      return;
    }
    const cells = document.querySelectorAll(
      `table td:nth-child(${visibleAssigneesPos + 1}):not(.enhanced)`
    );
    cells.forEach((cell) => {
      cell.style.cursor = "pointer";
      cell.classList.add("bulk-edit", "enhanced");
      attachAssigneeMenuTrigger(cell);
    });
  }
  function attachAssigneeMenuTrigger(cell) {
    cell.addEventListener("click", (event) => {
      const target = event.target;
      if (target?.closest("#assigneesMenu") || !document.contains(target)) {
        return;
      }
      closeAssigneesMenu();
      openAssigneesMenuAtCell(cell);
    });
  }
  function closeAssigneesMenu() {
    document.querySelector("#assigneesMenu")?.remove();
  }
  function openAssigneesMenuAtCell(cell) {
    cell.style.position = "relative";
    const menu = createAssigneesMenuElement();
    cell.appendChild(menu);
    openAssigneesMenu(cell, menu);
  }
  function createAssigneesMenuElement() {
    const menu = document.createElement("div");
    menu.id = "assigneesMenu";
    menu.className = "multiselect";
    menu.tabIndex = -1;
    Object.assign(menu.style, {
      position: "absolute",
      display: "none",
      background: "var(--scheme-main)",
      border: "1px solid #ccc",
      width: "250px",
      zIndex: "10000",
      boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
      cursor: "default",
      top: "0",
      left: "0"
    });
    const selectedList = document.createElement("div");
    selectedList.className = "selected-list";
    selectedList.id = "assigneesSelectedList";
    const control = document.createElement("div");
    control.className = "control";
    Object.assign(control.style, {
      padding: "5px",
      borderBottom: "1px solid #ccc",
      borderTop: "1px solid #ccc"
    });
    const inputWrapper = document.createElement("div");
    inputWrapper.className = "input-wrapper";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.placeholder = "Type to assign\u2026";
    Object.assign(input.style, {
      width: "100%",
      border: "none",
      outline: "none",
      background: "transparent"
    });
    inputWrapper.appendChild(input);
    control.appendChild(inputWrapper);
    const searchResults = document.createElement("div");
    searchResults.className = "search-results";
    menu.appendChild(selectedList);
    menu.appendChild(control);
    menu.appendChild(searchResults);
    return menu;
  }
  async function openAssigneesMenu(cell, menu) {
    menu.style.display = "block";
    const inputField = menu.querySelector(".input");
    const selectedList = menu.querySelector("#assigneesSelectedList");
    if (!selectedList) {
      return;
    }
    await refreshSelectedAssigneesList(cell, selectedList);
    setupAssigneeSearchInput(inputField, menu, cell);
    setupAssigneesMenuOutsideClickListener(cell, menu);
  }
  async function refreshSelectedAssigneesList(cell, selectedList) {
    selectedList.innerHTML = "";
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    if (task?.assignees) {
      for (const assignee of task.assignees) {
        selectedList.appendChild(await createAssigneeSelectedItem(assignee));
      }
    }
  }
  async function createAssigneeSelectedItem(assignee) {
    const container = document.createElement("div");
    container.className = "user m-2";
    Object.assign(container.style, {
      position: "relative",
      display: "inline-block"
    });
    const avatarImg = document.createElement("img");
    avatarImg.width = 30;
    avatarImg.height = 30;
    avatarImg.className = "avatar v-popper--has-tooltip";
    avatarImg.style.borderRadius = "100%";
    avatarImg.style.verticalAlign = "middle";
    avatarImg.src = await fetchAvatarImage(assignee.username);
    avatarImg.title = assignee.name || assignee.username;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "base-button base-button--type-button remove-assignee";
    removeBtn.innerText = "X";
    Object.assign(removeBtn.style, {
      position: "absolute",
      top: "-4px",
      right: "-4px",
      width: "16px",
      height: "16px",
      borderRadius: "50%",
      background: "red",
      color: "white",
      border: "none",
      fontSize: "12px",
      cursor: "pointer",
      lineHeight: "16px",
      textAlign: "center",
      padding: "0"
    });
    container.appendChild(avatarImg);
    container.appendChild(removeBtn);
    removeBtn.addEventListener("click", () => removeAssigneeHandler(removeBtn, assignee.id));
    return container;
  }
  function removeAssigneeHandler(removeButton, assigneeId) {
    var _a, _b;
    const row = removeButton.closest("tr");
    if (!row) {
      return;
    }
    if (row.classList.contains("bulk-selected")) {
      const bulkRows = document.querySelectorAll("tr.bulk-selected");
      for (const bulkRow of bulkRows) {
        const taskId = extractTaskIdFromElement(bulkRow);
        (_a = taskCache[taskId]).assignees ?? (_a.assignees = []);
        taskCache[taskId].assignees = taskCache[taskId].assignees.filter((a) => a.id !== assigneeId);
        GM_xmlhttpRequest({
          method: "DELETE",
          url: `/api/v1/tasks/${taskId}/assignees/${assigneeId}`,
          headers: {
            Authorization: `Bearer ${getJwtToken()}`,
            "Content-Type": "application/json"
          }
        });
      }
    } else {
      const taskId = extractTaskIdFromElement(row);
      (_b = taskCache[taskId]).assignees ?? (_b.assignees = []);
      taskCache[taskId].assignees = taskCache[taskId].assignees.filter((a) => a.id !== assigneeId);
      GM_xmlhttpRequest({
        method: "DELETE",
        url: `/api/v1/tasks/${taskId}/assignees/${assigneeId}`,
        headers: {
          Authorization: `Bearer ${getJwtToken()}`,
          "Content-Type": "application/json"
        }
      });
    }
    refreshAssigneesUI();
  }
  function fetchAvatarImage(username) {
    const size = 30;
    if (avatarCache[username]) {
      return Promise.resolve(avatarCache[username]);
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url: `/api/v1/avatar/${username}?size=${size}`,
        method: "GET",
        headers: { Authorization: `Bearer ${getJwtToken()}` },
        responseType: "blob",
        onload: (response) => {
          const blob = response.response;
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              avatarCache[username] = reader.result;
              resolve(reader.result);
            } else {
              reject(new Error("Failed to read avatar as base64"));
            }
          };
          reader.readAsDataURL(blob);
        },
        onerror: reject
      });
    });
  }
  function setupAssigneeSearchInput(input, menu, cell) {
    if (!input) {
      return;
    }
    input.focus();
    const navState = { activeIndex: -1 };
    let projectId = null;
    fetchTaskById(extractTaskIdFromElement(cell)).then((task) => {
      projectId = task?.project_id ?? null;
      const debouncedSearch = debounce(() => {
        performAssigneeSearch(input, menu, projectId);
      }, 300);
      input.addEventListener("input", () => {
        debouncedSearch();
        navState.activeIndex = -1;
      });
      performAssigneeSearch(input, menu, projectId);
    });
    input.addEventListener("keydown", (event) => {
      const buttons = getVisibleSearchResultButtons(menu);
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
        event.stopPropagation();
        event.preventDefault();
      }
      if (event.key === "ArrowDown") {
        if (buttons.length === 0) {
          return;
        }
        navState.activeIndex = getNextIndex(navState.activeIndex, buttons.length, 1);
        highlightResult(menu, navState.activeIndex);
      } else if (event.key === "ArrowUp") {
        if (buttons.length === 0) {
          return;
        }
        navState.activeIndex = getNextIndex(navState.activeIndex, buttons.length, -1);
        highlightResult(menu, navState.activeIndex);
      } else if (event.key === "Enter") {
        if (navState.activeIndex >= 0 && navState.activeIndex < buttons.length) {
          buttons[navState.activeIndex].click();
        }
      } else if (event.key === "Escape") {
        closeAssigneesMenu();
      }
    });
  }
  function getVisibleSearchResultButtons(menu) {
    const allButtons = Array.from(menu.querySelectorAll(".search-results button"));
    return allButtons.filter((btn) => {
      return btn.offsetParent !== null;
    });
  }
  function getNextIndex(current, total, offset) {
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
  function highlightResult(menu, index) {
    const buttons = getVisibleSearchResultButtons(menu);
    buttons.forEach((btn, idx) => {
      if (idx === index) {
        btn.classList.add("active", "highlighted");
        btn.style.backgroundColor = "var(--table-row-hover-background-color)";
      } else {
        btn.classList.remove("active", "highlighted");
        btn.style.backgroundColor = "";
      }
    });
  }
  function performAssigneeSearch(input, menu, projectId) {
    const query = input.value.trim();
    const resultsContainer = menu.querySelector(".search-results");
    if (!resultsContainer) {
      return;
    }
    const cacheKey = `${projectId}:${query}`;
    if (assigneeSearchCache.has(cacheKey)) {
      renderAssigneeSearchResults(resultsContainer, assigneeSearchCache.get(cacheKey));
      return;
    }
    GM_xmlhttpRequest({
      url: `/api/v1/projects/${projectId}/projectusers?s=${encodeURIComponent(query)}`,
      method: "GET",
      headers: { Authorization: `Bearer ${getJwtToken()}` },
      responseType: "json",
      onload: async (response) => {
        const assignees = response.response ?? [];
        assigneeSearchCache.set(cacheKey, assignees);
        await renderAssigneeSearchResults(resultsContainer, assignees);
      }
    });
  }
  function sortAssigneesAlphabetically(assignees) {
    return assignees.slice().sort((a, b) => {
      const nameA = (a.name || a.username).toLowerCase();
      const nameB = (b.name || b.username).toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }
  async function reorderAssigneesWithCurrentUserFirst(assignees) {
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
  async function renderAssigneeSearchResults(container, assignees) {
    const sortedAssignees = await reorderAssigneesWithCurrentUserFirst([...assignees]);
    await Promise.all(sortedAssignees.map((a) => fetchAvatarImage(a.username)));
    container.innerHTML = "";
    await Promise.all(
      sortedAssignees.map(async (assignee, idx) => {
        const avatar = await fetchAvatarImage(assignee.username);
        const btn = createAssigneeSearchButton(assignee, avatar);
        btn.dataset.resultIndex = idx.toString();
        btn.classList.remove("active", "highlighted");
        container.appendChild(btn);
      })
    );
    refreshAssigneesUI();
  }
  function createAssigneeSearchButton(assignee, avatar) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.assigneeId = assignee.id.toString();
    Object.assign(button.style, {
      width: "100%",
      border: "none",
      padding: "6px",
      textAlign: "left",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    });
    const labelWrapper = document.createElement("div");
    Object.assign(labelWrapper.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px"
    });
    const avatarImg = document.createElement("img");
    avatarImg.className = "avatar";
    avatarImg.src = avatar;
    avatarImg.width = 30;
    avatarImg.height = 30;
    Object.assign(avatarImg.style, {
      borderRadius: "100%",
      verticalAlign: "middle"
    });
    const nameSpan = document.createElement("span");
    nameSpan.style.color = "var(--input-color)";
    nameSpan.textContent = assignee.name || assignee.username;
    const hintSpan = document.createElement("span");
    hintSpan.className = "hidden";
    hintSpan.textContent = "Enter or click";
    Object.assign(hintSpan.style, {
      fontSize: "12px",
      color: "#888"
    });
    labelWrapper.appendChild(avatarImg);
    labelWrapper.appendChild(nameSpan);
    button.appendChild(labelWrapper);
    button.appendChild(hintSpan);
    button.addEventListener("click", () => {
      var _a;
      const bulkRows = document.querySelectorAll("tr.bulk-selected");
      for (const row of bulkRows) {
        const taskId = extractTaskIdFromElement(row);
        (_a = taskCache[taskId]).assignees ?? (_a.assignees = []);
        GM_xmlhttpRequest({
          method: "PUT",
          url: `/api/v1/tasks/${taskId}/assignees`,
          headers: {
            Authorization: `Bearer ${getJwtToken()}`,
            "Content-Type": "application/json"
          },
          data: JSON.stringify({ user_id: assignee.id })
        });
        if (!taskCache[taskId].assignees.some((a) => a.id === assignee.id)) {
          taskCache[taskId].assignees.push(assignee);
        }
      }
      button.style.display = "none";
      refreshAssigneesUI();
    });
    return button;
  }
  function setupAssigneesMenuOutsideClickListener(cell, menu) {
    const outsideClickListener = (event) => {
      if (!cell.contains(event.target) && document.contains(event.target)) {
        menu.remove();
        document.removeEventListener("click", outsideClickListener);
        refreshAssigneesColumnUI();
      }
    };
    document.addEventListener("click", outsideClickListener);
  }
  async function refreshAssigneesColumnUI() {
    const visibleAssigneesPos = getVisibleColumnPosition(COLUMN_ASSIGNEES);
    if (visibleAssigneesPos === -1) {
      return;
    }
    const cells = document.querySelectorAll(
      `table td:nth-child(${visibleAssigneesPos + 1}):not(:has(#assigneesMenu))`
    );
    for (const cell of cells) {
      cell.innerHTML = "";
      const task = await fetchTaskById(extractTaskIdFromElement(cell));
      if (!task.assignees) {
        continue;
      }
      const container = document.createElement("div");
      container.className = "assignees-list is-inline mis-1";
      for (const assignee of task.assignees) {
        const assigneeSpan = document.createElement("span");
        assigneeSpan.className = "assignee";
        const userWrapper = document.createElement("div");
        userWrapper.className = "user";
        userWrapper.style.display = "inline";
        const avatarImg = document.createElement("img");
        avatarImg.className = "avatar v-popper--has-tooltip";
        avatarImg.width = 28;
        avatarImg.height = 28;
        avatarImg.style.border = "2px solid var(--white)";
        avatarImg.style.borderRadius = "100%";
        avatarImg.title = assignee.name || assignee.username;
        avatarImg.src = await fetchAvatarImage(assignee.username);
        userWrapper.appendChild(avatarImg);
        assigneeSpan.appendChild(userWrapper);
        container.appendChild(assigneeSpan);
      }
      cell.appendChild(container);
    }
  }
  async function refreshAssigneesUI() {
    const menu = document.querySelector("#assigneesMenu");
    if (!menu) {
      return;
    }
    const cell = menu.closest("td");
    if (!cell) {
      return;
    }
    const selectedList = menu.querySelector("#assigneesSelectedList");
    if (!selectedList) {
      return;
    }
    await updateAssigneeSearchButtonVisibility(menu, cell);
    await refreshSelectedAssigneesList(cell, selectedList);
  }
  async function updateAssigneeSearchButtonVisibility(menu, cell) {
    const buttons = menu.querySelectorAll(".search-results button");
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    const assignedUserIds = task?.assignees?.map((a) => a.id) || [];
    buttons.forEach((button) => {
      const assigneeId = parseInt(button.dataset.assigneeId);
      button.style.display = assignedUserIds.includes(assigneeId) ? "none" : "flex";
    });
  }

  // scripts/vikunja-enhanced-task-table/utils/colors.ts
  function isHexColorLight(color) {
    if (!color || color === "#") {
      return true;
    }
    if (!color.startsWith("#")) {
      color = "#" + color;
    }
    const rgb = parseInt(color.slice(1, 7), 16);
    const r = rgb >> 16 & 255;
    const g = rgb >> 8 & 255;
    const b = rgb & 255;
    const luminance = Math.pow(r / 255, 2.2) * 0.2126 + Math.pow(g / 255, 2.2) * 0.7152 + Math.pow(b / 255, 2.2) * 0.0722;
    return Math.pow(luminance, 0.678) >= 0.5;
  }

  // scripts/vikunja-enhanced-task-table/features/labelsSelection.ts
  function addLabelsSelectionFeature() {
    const visibleLabelPos = getVisibleColumnPosition(COLUMN_LABELS);
    if (visibleLabelPos === -1) {
      return;
    }
    const labelCells = document.querySelectorAll(
      `table td:nth-child(${visibleLabelPos + 1}):not(.enhanced)`
    );
    labelCells.forEach((cell) => {
      cell.style.cursor = "pointer";
      cell.classList.add("bulk-edit", "enhanced");
      attachLabelsMenuTrigger(cell);
    });
    if (labelCells.length) {
      refreshLabelsColumnUI();
    }
  }
  function attachLabelsMenuTrigger(cell) {
    cell.addEventListener("click", (event) => {
      const target = event.target;
      if (target?.closest("#labelsMenu") || !document.contains(target)) {
        return;
      }
      closeLabelsMenu();
      openLabelsMenuAtCell(cell);
    });
  }
  function closeLabelsMenu() {
    document.querySelector("#labelsMenu")?.remove();
  }
  function openLabelsMenuAtCell(cell) {
    cell.style.position = "relative";
    const menu = createLabelsMenuElement();
    cell.appendChild(menu);
    openLabelsMenu(cell, menu);
  }
  function createLabelsMenuElement() {
    const menu = document.createElement("div");
    menu.id = "labelsMenu";
    menu.className = "multiselect";
    menu.tabIndex = -1;
    Object.assign(menu.style, {
      position: "absolute",
      display: "none",
      background: "var(--scheme-main)",
      border: "1px solid #ccc",
      width: "250px",
      zIndex: "10000",
      boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
      cursor: "default",
      top: "0",
      left: "0"
    });
    const selectedList = document.createElement("div");
    selectedList.className = "selected-list";
    selectedList.id = "labelsSelectedList";
    Object.assign(selectedList.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px"
    });
    const control = document.createElement("div");
    control.className = "control";
    Object.assign(control.style, {
      padding: "5px",
      borderBottom: "1px solid #ccc",
      borderTop: "1px solid #ccc"
    });
    const inputWrapper = document.createElement("div");
    inputWrapper.className = "input-wrapper";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.placeholder = "Type to assign\u2026";
    Object.assign(input.style, {
      width: "100%",
      border: "none",
      outline: "none",
      background: "transparent"
    });
    inputWrapper.appendChild(input);
    control.appendChild(inputWrapper);
    const searchResults = document.createElement("div");
    searchResults.className = "search-results";
    menu.appendChild(selectedList);
    menu.appendChild(control);
    menu.appendChild(searchResults);
    return menu;
  }
  async function openLabelsMenu(cell, menu) {
    menu.style.display = "block";
    const inputField = menu.querySelector(".input");
    const selectedList = menu.querySelector("#labelsSelectedList");
    if (!selectedList) {
      return;
    }
    await refreshSelectedLabelsList(cell, selectedList);
    setupLabelsSearchInputWithKeyboardNavigation(inputField, menu);
    setupLabelsMenuOutsideClickListener(cell, menu);
  }
  function setupLabelsMenuOutsideClickListener(cell, menu) {
    const outsideClickHandler = (event) => {
      if (!cell.contains(event.target) && document.contains(event.target)) {
        menu.remove();
        document.removeEventListener("click", outsideClickHandler);
        refreshLabelsColumnUI();
      }
    };
    document.addEventListener("click", outsideClickHandler);
  }
  function setupLabelsSearchInputWithKeyboardNavigation(input, menu) {
    if (!input) {
      return;
    }
    input.focus();
    let activeIndex = -1;
    const debouncedSearch = debounce(() => {
      handleLabelSearch(input, menu).then(() => {
        activeIndex = -1;
      });
    }, 300);
    input.addEventListener("input", () => {
      debouncedSearch();
      activeIndex = -1;
    });
    handleLabelSearch(input, menu);
    input.addEventListener("keydown", (event) => {
      const buttons = getVisibleSearchResultButtons2(menu);
      if (["ArrowDown", "ArrowUp", "Enter", "Escape"].includes(event.key)) {
        event.stopPropagation();
        event.preventDefault();
      }
      if (event.key === "ArrowDown") {
        if (buttons.length === 0) {
          return;
        }
        activeIndex = getNextIndex2(activeIndex, buttons.length, 1);
        highlightResult2(menu, activeIndex);
      } else if (event.key === "ArrowUp") {
        if (buttons.length === 0) {
          return;
        }
        activeIndex = getNextIndex2(activeIndex, buttons.length, -1);
        highlightResult2(menu, activeIndex);
      } else if (event.key === "Enter") {
        if (activeIndex >= 0 && activeIndex < buttons.length) {
          buttons[activeIndex].click();
        }
      } else if (event.key === "Escape") {
        closeLabelsMenu();
      }
    });
  }
  function getVisibleSearchResultButtons2(menu) {
    const allButtons = Array.from(menu.querySelectorAll(".search-results button"));
    return allButtons.filter((btn) => btn.offsetParent !== null);
  }
  function getNextIndex2(current, total, offset) {
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
  function highlightResult2(menu, index) {
    const buttons = getVisibleSearchResultButtons2(menu);
    buttons.forEach((btn, idx) => {
      if (idx === index) {
        btn.classList.add("active", "highlighted");
        btn.style.backgroundColor = "var(--table-row-hover-background-color)";
      } else {
        btn.classList.remove("active", "highlighted");
        btn.style.backgroundColor = "";
      }
    });
  }
  async function refreshLabelsColumnUI() {
    const visibleLabelPos = getVisibleColumnPosition(COLUMN_LABELS);
    if (visibleLabelPos === -1) {
      return;
    }
    const labelCells = document.querySelectorAll(
      `table td:nth-child(${visibleLabelPos + 1}):not(:has(#labelsMenu))`
    );
    for (const cell of labelCells) {
      cell.innerHTML = "";
      const task = await fetchTaskById(extractTaskIdFromElement(cell));
      if (!task.labels) {
        continue;
      }
      const wrapper = document.createElement("div");
      wrapper.className = "label-wrapper";
      const sortedLabels = await sortLabelsAlphabetically(task.labels);
      for (const label of sortedLabels) {
        const labelTag = document.createElement("span");
        labelTag.className = "tag";
        labelTag.style.backgroundColor = "#" + label.hex_color;
        labelTag.style.color = isHexColorLight(label.hex_color) ? COLOR_DARK : COLOR_LIGHT;
        const textSpan = document.createElement("span");
        textSpan.textContent = label.title;
        labelTag.appendChild(textSpan);
        wrapper.appendChild(labelTag);
      }
      cell.appendChild(wrapper);
    }
  }
  async function handleLabelSearch(input, menu) {
    const query = input.value.trim();
    const resultsContainer = menu.querySelector(".search-results");
    if (!resultsContainer) {
      return;
    }
    const cacheKey = query;
    if (labelSearchCache.has(cacheKey)) {
      await renderLabelSearchResults(resultsContainer, labelSearchCache.get(cacheKey));
      insertCreateLabelButtonIfNeeded(resultsContainer, query);
      return;
    }
    GM_xmlhttpRequest({
      url: `/api/v1/labels?s=${encodeURIComponent(query)}`,
      method: "GET",
      headers: { Authorization: `Bearer ${getJwtToken()}` },
      responseType: "json",
      onload: async (response) => {
        const labels = response.response || [];
        labelSearchCache.set(cacheKey, labels);
        await renderLabelSearchResults(resultsContainer, labels);
        insertCreateLabelButtonIfNeeded(resultsContainer, query);
      }
    });
  }
  function insertCreateLabelButtonIfNeeded(container, labelText) {
    const labelExists = Array.from(labelSearchCache.values()).some(
      (labels) => labels.some((l) => l.title.trim() === labelText)
    );
    if (!labelExists && labelText) {
      const button = document.createElement("button");
      button.type = "button";
      Object.assign(button.style, {
        width: "100%",
        border: "none",
        padding: "6px",
        textAlign: "left",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      });
      button.innerHTML = `
            <span>
                <span class="tag search-result">
                    <span>${labelText}</span>
                </span>
            </span>
            <span class="hint-text" style="font-size:12px; color:#888;">Click to create</span>
        `;
      button.addEventListener("click", () => {
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        const tag = button.querySelector(".tag");
        if (tag) {
          tag.style.backgroundColor = color;
          tag.style.color = isHexColorLight(color.replace("#", "")) ? COLOR_DARK : COLOR_LIGHT;
        }
        const hint = button.querySelector(".hint-text");
        if (hint) {
          hint.textContent = "Click to add";
        }
        button.style.display = "none";
        GM_xmlhttpRequest({
          url: `/api/v1/labels`,
          method: "PUT",
          headers: { Authorization: `Bearer ${getJwtToken()}`, "Content-Type": "application/json" },
          responseType: "json",
          data: JSON.stringify({
            title: labelText,
            hex_color: color.replace("#", "")
          }),
          onload: async (r) => {
            var _a;
            const label = r.response;
            button.dataset.labelId = label.id.toString();
            const bulkRows = document.querySelectorAll("tr.bulk-selected");
            for (const row of bulkRows) {
              const taskId = extractTaskIdFromElement(row);
              (_a = taskCache[taskId]).labels ?? (_a.labels = []);
              GM_xmlhttpRequest({
                method: "PUT",
                url: `/api/v1/tasks/${taskId}/labels`,
                headers: {
                  Authorization: `Bearer ${getJwtToken()}`,
                  "Content-Type": "application/json"
                },
                data: JSON.stringify({ label_id: label.id }),
                onload: () => {
                  if (!taskCache[taskId].labels.some((l) => l.id === label.id)) {
                    taskCache[taskId].labels.push(label);
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
  async function renderLabelSearchResults(container, labels) {
    container.innerHTML = "";
    const sortedLabels = await sortLabelsAlphabetically(labels);
    for (const label of sortedLabels) {
      container.appendChild(createLabelSearchButton(label));
    }
    refreshLabelsUI();
  }
  function createLabelSearchButton(label) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.labelId = label.id.toString();
    Object.assign(button.style, {
      width: "100%",
      border: "none",
      padding: "6px",
      textAlign: "left",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
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
    button.addEventListener("click", () => {
      var _a;
      const bulkRows = document.querySelectorAll("tr.bulk-selected");
      for (const row of bulkRows) {
        const taskId = extractTaskIdFromElement(row);
        (_a = taskCache[taskId]).labels ?? (_a.labels = []);
        GM_xmlhttpRequest({
          method: "PUT",
          url: `/api/v1/tasks/${taskId}/labels`,
          headers: {
            Authorization: `Bearer ${getJwtToken()}`,
            "Content-Type": "application/json"
          },
          data: JSON.stringify({ label_id: label.id })
        });
        if (!taskCache[taskId].labels.some((l) => l.id === label.id)) {
          taskCache[taskId].labels.push(label);
        }
      }
      button.style.display = "none";
      refreshLabelsUI();
    });
    return button;
  }
  async function refreshLabelsUI() {
    const menu = document.querySelector("#labelsMenu");
    if (!menu) {
      return;
    }
    const cell = menu.closest("td");
    if (!cell) {
      return;
    }
    const selectedList = menu.querySelector("#labelsSelectedList");
    if (!selectedList) {
      return;
    }
    await refreshSelectedLabelsList(cell, selectedList);
    await updateLabelSearchButtonVisibility(menu, cell);
  }
  async function updateLabelSearchButtonVisibility(menu, cell) {
    const buttons = menu.querySelectorAll(".search-results button");
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    const assignedLabelIds = task?.labels?.map((l) => l.id) || [];
    buttons.forEach((button) => {
      const labelId = parseInt(button.dataset.labelId);
      button.style.display = assignedLabelIds.includes(labelId) ? "none" : "flex";
    });
  }
  async function refreshSelectedLabelsList(cell, selectedList) {
    selectedList.innerHTML = "";
    const task = await fetchTaskById(extractTaskIdFromElement(cell));
    if (!task?.labels) {
      return;
    }
    const sortedLabels = await sortLabelsAlphabetically(task.labels);
    for (const label of sortedLabels) {
      selectedList.appendChild(await createLabelSelectedItem(label));
    }
  }
  async function sortLabelsAlphabetically(labels) {
    const user = await fetchCurrentUser();
    const language = user.settings.language || navigator.language;
    return [...labels].sort((a, b) => a.title.localeCompare(b.title, language, { ignorePunctuation: true }));
  }
  async function createLabelSelectedItem(label) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.style.backgroundColor = `#${label.hex_color}`;
    tag.style.color = isHexColorLight(label.hex_color) ? COLOR_DARK : COLOR_LIGHT;
    const textSpan = document.createElement("span");
    textSpan.textContent = label.title;
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "base-button base-button--type-button delete is-small";
    tag.appendChild(textSpan);
    tag.appendChild(deleteButton);
    deleteButton.addEventListener("click", () => {
      var _a;
      const bulkRows = document.querySelectorAll("tbody tr.bulk-selected");
      for (const row of bulkRows) {
        const taskId = extractTaskIdFromElement(row);
        GM_xmlhttpRequest({
          method: "DELETE",
          url: `/api/v1/tasks/${taskId}/labels/${label.id}`,
          headers: { Authorization: `Bearer ${getJwtToken()}` }
        });
        (_a = taskCache[taskId]).labels ?? (_a.labels = []);
        taskCache[taskId].labels = taskCache[taskId].labels.filter((l) => l.id !== label.id);
      }
      refreshLabelsUI();
    });
    return tag;
  }

  // scripts/vikunja-enhanced-task-table/features/taskAddForm.ts
  function createTaskAddFormElement() {
    const form = document.createElement("form");
    form.className = "task-add list-view__add-task d-print-none";
    form.id = "taskAddForm";
    form.style.padding = "1rem 1rem";
    const fieldWrapper = document.createElement("div");
    fieldWrapper.className = "add-task__field field";
    fieldWrapper.style.display = "flex";
    fieldWrapper.style.justifyContent = "flex-start";
    fieldWrapper.style.gap = ".75rem";
    const inputWrapper = document.createElement("p");
    inputWrapper.className = "control task-input-wrapper";
    inputWrapper.style.flexShrink = "0";
    inputWrapper.style.marginBlockEnd = "0";
    inputWrapper.style.position = "relative";
    inputWrapper.style.flexGrow = "1";
    const input = document.createElement("input");
    input.id = "task-add-textarea-" + Math.random().toString(36).slice(2, 10);
    input.className = "add-task-textarea input textarea-empty";
    input.placeholder = "Add a task...";
    input.style.overflowY = "hidden";
    input.style.height = "38px";
    inputWrapper.appendChild(input);
    const buttonWrapper = document.createElement("p");
    buttonWrapper.className = "control";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "base-button base-button--type-button button is-primary add-task-button";
    button.style.setProperty("--button-white-space", "break-spaces");
    const iconSpan = document.createElement("span");
    iconSpan.className = "icon is-small";
    iconSpan.textContent = "+";
    const buttonTextWrapper = document.createElement("span");
    const buttonText = document.createElement("span");
    buttonText.className = "button-text";
    buttonText.textContent = "Add";
    buttonTextWrapper.appendChild(buttonText);
    button.appendChild(iconSpan);
    button.appendChild(buttonTextWrapper);
    buttonWrapper.appendChild(button);
    fieldWrapper.appendChild(inputWrapper);
    fieldWrapper.appendChild(buttonWrapper);
    form.appendChild(fieldWrapper);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (title) {
        addNewTask(title);
      }
      input.value = "";
    });
    button.addEventListener("click", () => {
      const title = input.value.trim();
      if (title) {
        addNewTask(title);
        input.value = "";
      }
    });
    return form;
  }
  function addNewTask(title) {
    GM_xmlhttpRequest({
      method: "PUT",
      url: `/api/v1/projects/${getProjectId()}/tasks`,
      headers: {
        Authorization: `Bearer ${getJwtToken()}`,
        "Content-Type": "application/json"
      },
      data: JSON.stringify({ title, project_id: getProjectId() }),
      responseType: "json",
      onload: async (resp) => {
        const newTask = resp.response;
        taskCache[newTask.id] = await fetchTaskById(newTask.id);
        const columnCount = document.querySelectorAll("thead tr > *").length;
        const newRow = document.createElement("tr");
        newRow.classList.add("new-task-row");
        for (let i = 0; i < columnCount; i++) {
          newRow.appendChild(document.createElement("td"));
        }
        const identifyColPos = getVisibleColumnPosition(COLUMN_IDENTIFIER);
        if (identifyColPos >= 0) {
          const identifyCell = newRow.children[identifyColPos];
          if (identifyCell) {
            const link = document.createElement("a");
            link.href = `/tasks/${newTask.id}`;
            link.textContent = newTask.identifier;
            identifyCell.appendChild(link);
            link.addEventListener("click", () => {
              window.location.href = link.href;
            });
          }
        }
        const titleColPos = getVisibleColumnPosition(2);
        if (titleColPos >= 0) {
          const titleCell = newRow.children[titleColPos];
          if (titleCell) {
            const link = document.createElement("a");
            link.href = `/tasks/${newTask.id}`;
            link.textContent = newTask.title;
            titleCell.appendChild(link);
            link.addEventListener("click", () => {
              window.location.href = link.href;
            });
          }
        }
        const tbody = document.querySelector("tbody");
        tbody?.insertBefore(newRow, tbody.firstChild);
      }
    });
  }
  function updateTaskAddFormVisibility() {
    const formPresent = !!document.querySelector("#taskAddForm");
    const tablePresent = !!document.querySelector("table");
    const projectId = getProjectId();
    if (!tablePresent && formPresent || projectId <= 0) {
      document.querySelector("#taskAddForm")?.remove();
    } else if (tablePresent && !formPresent) {
      const form = createTaskAddFormElement();
      const switchViewContainer = document.querySelector(".switch-view-container");
      switchViewContainer?.insertAdjacentElement("afterend", form);
    }
  }

  // scripts/vikunja-enhanced-task-table/features/bulkSelectionAndDragDrop.ts
  var currentlyDraggedRows = [];
  document.addEventListener("click", (event) => {
    const target = event.target;
    const clickedRow = target.closest("tr");
    const tbody = clickedRow?.closest("tbody");
    const filterContainer = document.querySelector(".columns-filter");
    if (!clickedRow || !tbody || !filterContainer) {
      return;
    }
    const allRows = Array.from(tbody.querySelectorAll("tr"));
    if (target.closest(".bulk-edit")?.closest(".bulk-selected")) {
      return;
    }
    if (!target.closest(".bulk-edit")) {
      event.preventDefault();
    }
    const lastClickedRow = tbody.querySelector("tr.last-clicked");
    if (event.shiftKey && lastClickedRow) {
      allRows.forEach((row) => row.classList.remove("bulk-selected"));
      const start = allRows.indexOf(lastClickedRow);
      const end = allRows.indexOf(clickedRow);
      const [from, to] = [start, end].sort((a, b) => a - b);
      for (let i = from; i <= to; i++) {
        allRows[i].classList.add("bulk-selected");
      }
    } else if (event.ctrlKey || event.metaKey) {
      clickedRow.classList.toggle("bulk-selected");
    } else {
      allRows.forEach((row) => row.classList.remove("bulk-selected"));
      clickedRow.classList.add("bulk-selected");
    }
    allRows.forEach((row) => row.classList.remove("last-clicked"));
    clickedRow.classList.add("last-clicked");
  });
  document.addEventListener("dragstart", (event) => {
    if (!getColumnsFilterElement() || !(event.target instanceof HTMLTableRowElement)) {
      return;
    }
    const draggedRow = event.target.closest("tr");
    const tbody = draggedRow?.closest("tbody");
    if (!draggedRow || !tbody || !draggedRow.classList.contains("bulk-selected")) {
      event.preventDefault();
      return;
    }
    currentlyDraggedRows = Array.from(tbody.querySelectorAll("tr.bulk-selected"));
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", "dragging");
  });
  document.addEventListener("dragover", (event) => {
    if (!getColumnsFilterElement() || !currentlyDraggedRows) {
      return;
    }
    const target = event.target;
    const table = target.closest("table");
    const targetRow = target.closest("tbody tr");
    const projectMenu = target.closest('a.base-button.list-menu-link[href^="/projects/"]');
    if (targetRow && !targetRow.classList.contains("bulk-selected")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      targetRow.classList.add("drag-over");
    } else if (projectMenu) {
      const pmProjectId = parseInt(projectMenu.href.split("/").pop() ?? "0");
      if (pmProjectId > 0 && pmProjectId !== getProjectId()) {
        projectMenu.classList.add("drag-over");
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }
    } else if (!targetRow) {
      const realTable = table || target.querySelector("table");
      if (realTable) {
        const rect = realTable.getBoundingClientRect();
        const buffer = 20;
        const inExtendedZone = event.clientX >= rect.left - buffer && event.clientX <= rect.right + buffer && event.clientY >= rect.top - buffer && event.clientY <= rect.bottom + buffer;
        if (inExtendedZone) {
          realTable.classList.add("drag-over");
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }
    }
  });
  document.addEventListener("dragend", () => {
    if (!currentlyDraggedRows) {
      return;
    }
    document.querySelector(".drag-over")?.classList.remove("drag-over");
  });
  document.addEventListener("dragleave", () => {
    if (!currentlyDraggedRows) {
      return;
    }
    document.querySelector(".drag-over")?.classList.remove("drag-over");
  });
  async function removeParentTaskRelation(draggedTaskId, oldParentId) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "DELETE",
        url: `/api/v1/tasks/${draggedTaskId}/relations/parenttask/${oldParentId}`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getJwtToken()}`
        },
        onload: () => resolve()
      });
    });
  }
  async function addParentTaskRelation(draggedTaskId, newParentId) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "PUT",
        url: `/api/v1/tasks/${draggedTaskId}/relations`,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getJwtToken()}`
        },
        data: JSON.stringify({
          relation_kind: "parenttask",
          other_task_id: newParentId
        }),
        onload: () => resolve()
      });
    });
  }
  async function moveTaskToProject(taskId, projectId) {
    await updateSingleTask(taskId, { project_id: projectId });
  }
  document.addEventListener("drop", async (event) => {
    if (!getColumnsFilterElement() || !currentlyDraggedRows) {
      return;
    }
    const draggedTaskIds = currentlyDraggedRows.map(extractTaskIdFromElement);
    let topLevelDraggedIds = [...draggedTaskIds];
    for (const id of draggedTaskIds) {
      const parentIds = await getAllParentTaskIds(id);
      if (topLevelDraggedIds.some((otherId) => parentIds.includes(otherId))) {
        topLevelDraggedIds = topLevelDraggedIds.filter((i) => i !== id);
      }
    }
    const target = event.target;
    const targetRow = target.closest("tbody tr");
    let table = target.closest("table");
    const projectMenu = target.closest('a.base-button.list-menu-link[href^="/projects/"]');
    if (!table) {
      const realTable = target.querySelector("table");
      if (realTable) {
        const rect = realTable.getBoundingClientRect();
        const buffer = 20;
        const inExtendedZone = event.clientX >= rect.left - buffer && event.clientX <= rect.right + buffer && event.clientY >= rect.top - buffer && event.clientY <= rect.bottom + buffer;
        if (inExtendedZone) {
          table = realTable;
        }
      }
    }
    if (targetRow) {
      const targetTaskId = extractTaskIdFromElement(targetRow);
      await Promise.all(
        topLevelDraggedIds.map(async (draggedId) => {
          const draggedTask = await fetchTaskById(draggedId);
          if (!draggedTask || !targetTaskId) {
            return;
          }
          const oldParentId = draggedTask.related_tasks.parenttask?.[0]?.id;
          if (oldParentId) {
            await removeParentTaskRelation(draggedId, oldParentId);
          }
          await addParentTaskRelation(draggedId, targetTaskId);
        })
      );
      clearCachedTaskData();
      await fetchTasks(getAllTaskIds3());
      await reorderTaskRows(document.querySelectorAll("tbody tr"));
    } else if (table) {
      await Promise.all(
        topLevelDraggedIds.map(async (id) => {
          const task = await fetchTaskById(id);
          if (!task) {
            return;
          }
          const oldParentId = task.related_tasks.parenttask?.[0]?.id;
          if (oldParentId) {
            await removeParentTaskRelation(id, oldParentId);
          }
        })
      );
      clearCachedTaskData();
      await fetchTasks(getAllTaskIds3());
      await reorderTaskRows(document.querySelectorAll("tbody tr"));
    } else if (projectMenu) {
      const newProjectId = parseInt(projectMenu.href.split("/").pop() ?? "0");
      await Promise.all(draggedTaskIds.map((id) => moveTaskToProject(id, newProjectId)));
      currentlyDraggedRows.forEach((row) => row.remove());
      clearCachedTaskData();
      await fetchTasks(getAllTaskIds3());
      await reorderTaskRows(document.querySelectorAll("tbody tr"));
    }
  });
  async function reorderTaskRows(rows) {
    const data = await Promise.all(
      [...rows].map(async (row) => {
        const task = await fetchTaskById(extractTaskIdFromRow(row));
        const level = await getTaskHierarchyLevel(task.id);
        return { row, level };
      })
    );
    data.reverse().sort((a, b) => a.level - b.level);
    for (const { row, level } of data) {
      if (level !== 0) {
        const task = await fetchTaskById(extractTaskIdFromRow(row));
        const parentId = task.related_tasks.parenttask[0].id;
        const parentRow = [...rows].find((r) => extractTaskIdFromRow(r) === parentId);
        if (parentRow) {
          parentRow.insertAdjacentElement("afterend", row);
        }
      }
      row.style.setProperty("--level", level.toString());
    }
  }
  async function getTaskHierarchyLevel(taskId) {
    let indentLevel = 0;
    let currentId = taskId;
    const baseTask = await fetchTaskById(currentId);
    if (!baseTask) {
      return indentLevel;
    }
    while (true) {
      const task = await fetchTaskById(currentId);
      if (!task.related_tasks.parenttask?.length || task.related_tasks.parenttask[0].project_id !== baseTask.project_id) {
        break;
      }
      currentId = task.related_tasks.parenttask[0].id;
      indentLevel++;
    }
    return indentLevel;
  }
  async function getAllParentTaskIds(taskId) {
    let currentId = taskId;
    const parentIds = [];
    while (true) {
      const task = await fetchTaskById(currentId);
      if (!task.related_tasks?.parenttask?.length) {
        break;
      }
      const parentId = task.related_tasks.parenttask[0].id;
      parentIds.push(parentId);
      currentId = parentId;
    }
    return parentIds;
  }
  function getAllTaskIds3() {
    const links = document.querySelectorAll("tbody tr a");
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
  }
  function initializeRowSelectionMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "attributes" || mutation.attributeName !== "class") {
          continue;
        }
        const element = mutation.target;
        if (!(element instanceof HTMLTableRowElement)) {
          continue;
        }
        handleRowSelectionClassChange(element, mutation.oldValue);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: ["class"]
    });
  }
  function handleRowSelectionClassChange(row, oldClassValue) {
    const isCurrentlySelected = row.classList.contains("bulk-selected");
    const wasPreviouslySelected = oldClassValue?.includes("bulk-selected") ?? false;
    if (isCurrentlySelected !== wasPreviouslySelected) {
      if (isCurrentlySelected) {
        row.setAttribute("draggable", "true");
      } else {
        row.removeAttribute("draggable");
      }
    }
  }

  // scripts/vikunja-enhanced-task-table/features/mutationObserver.ts
  var observerConfig = { attributes: true, childList: true, subtree: true };
  async function handleDomMutations(observer) {
    debouncedUpdateTaskAddFormVisibility();
    if (!document.querySelector("table tbody tr td") || !document.querySelector(".columns-filter")) {
      return;
    }
    observer.disconnect();
    if (document.querySelector("table tbody tr td") && !document.querySelector('tr[style*="--level"]')) {
      clearCachedTaskData();
      await fetchTasks(getAllTaskIds4());
      const rows = document.querySelectorAll("tbody tr");
      await reorderTaskRows(rows);
    }
    applyAllTableColumnEnhancements();
    fixTableHorizontalOverflow();
    observer.observe(document.body, observerConfig);
  }
  var debouncedUpdateTaskAddFormVisibility = debounce(() => updateTaskAddFormVisibility(), 300);
  function getAllTaskIds4() {
    const links = document.querySelectorAll("tbody tr a");
    const ids = Array.from(links).map((a) => extractTaskIdFromElement(a));
    return Array.from(new Set(ids));
  }
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

  // scripts/vikunja-enhanced-task-table/main.ts
  var observerConfig2 = { attributes: true, childList: true, subtree: true };
  var mutationObserver = new MutationObserver((mutations, observer) => {
    handleDomMutations(observer);
  });
  mutationObserver.observe(document.body, observerConfig2);
  initializeRowSelectionMutationObserver();
})();
