import type { Task, User, Assignee, Label } from '../types';

export const taskCache: Record<number, Task> = {};
export const avatarCache: Record<string, string> = {};
export const assigneeSearchCache = new Map<string, Assignee[]>();
export const labelSearchCache = new Map<string, Label[]>();
export const cache = {
    user: null as User | null
};

export function clearCache(): void {
    Object.keys(taskCache).forEach((k) => delete taskCache[+k]);
    Object.keys(avatarCache).forEach((k) => delete avatarCache[k]);
    assigneeSearchCache.clear();
    labelSearchCache.clear();
    cache.user = null;
}

/**
 * Clears cached task data.
 */
export function clearCachedTaskData(): void {
    for (const key in taskCache) {
        delete taskCache[key];
    }
}
