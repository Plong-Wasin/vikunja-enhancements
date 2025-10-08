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
        
        /* Checkbox Progress Indicator Styles - positioned after description icon */
        .checkbox-progress-indicator {
            display: inline-flex;
            align-items: center;
            gap: 2px;
            font-size: 10px;
            color: var(--text-light);
            margin-left: 2px;
            flex-shrink: 0;
        }
        
        .progress-circle-wrapper {
            width: 14px;
            height: 14px;
            position: relative;
            display: inline-block;
        }
        
        .progress-svg {
            width: 100%;
            height: 100%;
            transform: rotate(0deg);
        }
        
        .progress-bg {
            fill: none;
            stroke: var(--grey-200);
            stroke-width: 3;
        }
        
        .progress-fill {
            fill: none;
            stroke: var(--primary);
            stroke-width: 3;
            stroke-linecap: round;
            transition: stroke-dasharray 0.3s ease;
        }
        
        .progress-text {
            font-weight: 600;
            font-size: 9px;
            white-space: nowrap;
            line-height: 1;
        }
        
        /* Hover effect for the entire progress indicator */
        .checkbox-progress-indicator:hover {
            color: var(--grey-700);
        }
        
        .checkbox-progress-indicator:hover .progress-fill {
            stroke: var(--primary-hover);
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
