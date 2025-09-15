export interface Task {
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

export interface Assignee {
    id: number;
    name: string;
    username: string;
    created: Date;
    updated: Date;
}

export interface Attachment {
    id: number;
    task_id: number;
    created_by: CreatedBy;
    file: IFile;
    created: string;
}

export interface CreatedBy {
    id: number;
    name: string;
    username: string;
    created: string;
    updated: string;
}

export interface IFile {
    id: number;
    name: string;
    mime: string;
    size: number;
    created: string;
}

export interface Label {
    id: number;
    title: string;
    description: string;
    hex_color: string;
    created_by: CreatedBy;
    created: string;
    updated: string;
}

export interface RelatedTasks {
    subtask?: Task[];
    parenttask?: Task[];
}

export interface User {
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

export interface Settings {
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

export interface FrontendSettings {
    allow_icon_changes: boolean;
    color_schema: string;
    date_display: string;
    default_view: string;
    minimum_priority: number;
    play_sound_when_done: boolean;
    quick_add_magic_mode: string;
}

export type TaskDateField = 'start_date' | 'due_date' | 'end_date';
