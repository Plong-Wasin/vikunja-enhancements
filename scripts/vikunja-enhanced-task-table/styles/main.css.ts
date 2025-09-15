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

/** Fix horizontal overflow for tables inside scrollable containers */
export function fixTableHorizontalOverflow(): void {
    const container = document.querySelector('table')?.closest<HTMLElement>('.has-horizontal-overflow');
    if (container) {
        container.style.overflow = 'visible';
    }
}
