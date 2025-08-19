"use strict";
(function () {
    const NO = 0; // สำหรับ "#" หรือไม่ระบุ
    const DONE = 1; // "Done" /
    const TITLE = 2; // "Title" /
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
    function getViewId() {
        return +(window.location.pathname.split('/').pop() ?? 0);
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
     * Returns the position of a checked column, or -1 if not checked.
     *
     * @param column - The column index to check.
     * @returns The index of the checked column, or -1 if not checked.
     */
    function getCheckedColumnIndex(column) {
        return getCheckedColumnIndices().indexOf(column);
    }
    /**
     * Main function to enhance editable titles in the table.
     */
    function enhanceEditableTitles() {
        const titleIndex = getCheckedColumnIndex(2);
        if (titleIndex === -1)
            return;
        const cells = document.querySelectorAll(`table td:nth-child(${titleIndex + 1})`);
        cells.forEach(makeCellEditable);
    }
    /**
     * Apply editable behavior to a single table cell.
     * @param td - The table cell element.
     */
    function makeCellEditable(td) {
        td.style.cssText =
            'display: flex; justify-content: space-between; align-items: center;';
        const link = td.querySelector('a');
        if (!link)
            return;
        let originalText = link.textContent || '';
        const editBtn = createEditButton(link, originalText);
        td.appendChild(editBtn);
        attachLinkEvents(link, () => originalText, (newText) => (originalText = newText));
    }
    /**
     * Create the edit button for a link.
     * @param link - The anchor element to edit.
     * @param originalText - Original text of the link.
     * @returns The button element.
     */
    function createEditButton(link, originalText) {
        const btn = document.createElement('button');
        btn.innerHTML = '✎';
        btn.className = 'editTitle';
        btn.style.cssText =
            'color: rgb(235, 233, 229); border: none; background: transparent; cursor: pointer;';
        btn.addEventListener('click', () => makeLinkEditable(link));
        return btn;
    }
    /**
     * Make a link editable and focus at the end.
     * @param link - The anchor element to edit.
     */
    function makeLinkEditable(link) {
        link.contentEditable = 'true';
        link.focus();
        const range = document.createRange();
        range.selectNodeContents(link);
        range.collapse(false); // move cursor to end
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
    /**
     * Attach events to handle saving/canceling editable link.
     * @param link - The anchor element.
     * @param getOriginalText - Function returning original text.
     * @param setOriginalText - Function to update original text.
     */
    function attachLinkEvents(link, getOriginalText, setOriginalText) {
        const saveLink = () => {
            link.contentEditable = 'false';
            const text = link.textContent?.trim() || '';
            if (!text) {
                link.textContent = getOriginalText();
            }
            else {
                setOriginalText(text);
                const taskId = link.href.split('/').pop();
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: `/api/v1/tasks/${taskId}`,
                    headers: {
                        Authorization: `Bearer ${getJwtToken()}`,
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({ title: text })
                });
            }
        };
        link.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                link.blur();
                saveLink();
            }
            else if (e.key === 'Escape') {
                link.textContent = getOriginalText();
                link.contentEditable = 'false';
                link.blur();
            }
        });
        link.addEventListener('blur', () => {
            if (link.isContentEditable)
                saveLink();
        });
    }
    setTimeout(() => {
        enhanceEditableTitles();
    }, 3000);
})();
