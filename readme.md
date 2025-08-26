# Vikunja Enhanced Task Table UserScript

Enhance the task management experience in Vikunja with this userscript. This script adds inline editing, bulk actions, drag & drop reorder, improved assignee and label selection, enhanced date and priority fields, and more, directly in your Vikunja project task tables.

---

## Features

- **Inline Editing:** Quickly edit task titles and progress fields directly in the table.
- **Bulk Actions:** Select multiple tasks with shift/ctrl-click and update done status, priority, dates, assignees, or labels in bulk.
- **Drag & Drop Reordering:** Easily reorder tasks and modify task hierarchy using drag & drop.
- **Date Fields:** Edit Due Date, Start Date, and End Date with datetime-local inputs.
- **Assignees & Labels:** Improved UI for assigning users and labels with search and quick assign functionality.
- **Add Tasks:** Inline task addition with a simple form.
- **Dynamic UI Updates:** Automatic DOM monitoring to reapply enhancements as tasks change.
- **Visual Enhancements:** Clear feedback on selections, drag targets, and edited items.

---

## Installation

1. Install a userscript manager like [Tampermonkey](https://www.tampermonkey.net/) (available for Chrome, Firefox, Edge, Opera).
2. Click the “Raw” or “Download” link to access the userscript file ([`vikunja-enhanced-task-table.user.js`](raw/refs/heads/main/vikunja-enhanced-task-table.user.js)).
3. Open the userscript file in Tampermonkey or your userscript manager.
4. Enable the script.
5. Navigate to your Vikunja projects page (`https://your-vikunja-instance.com/projects/*`).
6. Enjoy enhanced task table functionality!

---

## Usage

- **Selecting Tasks:** Click on rows to select; use Shift+Click for ranges or Ctrl/Cmd+Click for multi-select.
- **Editing Titles:** Double-click or press the pencil icon next to a task title to edit inline.
- **Marking Done:** Use checkboxes in the “Done” column to toggle task completion, supports bulk updates.
- **Changing Priority:** Select priority from dropdown menus, supports bulk updates.
- **Editing Dates:** Change Due, Start, or End dates with convenient date pickers.
- **Adjust Progress:** Double-click progress cells and enter values (0–100%) for quick updates.
- **Manage Assignees and Labels:** Click cells to open searchable selection menus with avatars and quick add/remove.
- **Drag & Drop:** Drag selected rows to reorder or set parent tasks in the hierarchy; drag onto projects menu to move tasks between projects.
- **Add New Task:** Use the “Add a task…” input field above the table to quickly create new tasks.

---

## Configuration

To specify which URLs the userscript runs on, update the matching patterns as follows:

1. Open your userscript manager (e.g., Tampermonkey).
2. Find the installed Vikunja Enhanced Task Table script and go to its **Settings** tab.
3. Locate the **Includes/Excludes** or **User matches** section.
4. Add or adjust URL patterns to match your Vikunja instance's project pages (for example: `https://your-vikunja-instance.com/projects/*`).
5. Save your changes.

---

## Development

The script is written in TypeScript (compiled to JavaScript) and uses:

- Tampermonkey GM_xmlhttpRequest for cross-origin API communication.
- DOM manipulation and events for UI enhancements.
- MutationObservers to track dynamic changes and keep UI in sync.
- Caching of tasks, avatars, assignees, and labels to avoid unnecessary API calls.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

---

## Disclaimer

This userscript is a community enhancement and is not officially supported by the Vikunja project. Use at your own risk.

---

Thank you for using Vikunja Enhanced Task Table!