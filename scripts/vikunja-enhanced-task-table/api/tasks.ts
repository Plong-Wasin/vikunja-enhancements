import type { Task, User } from '../types';
import { getJwtToken } from '../utils/dom.js';
import { taskCache, cache } from '../utils/cache.js';

/**
 * Fetch current logged user, cached after first fetch.
 */
export async function fetchCurrentUser(): Promise<User> {
    if (!cache.user) {
        cache.user = await new Promise<User>((resolve) => {
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
    return cache.user;
}

/**
 * Fetch tasks by array of IDs with batching and caching.
 */
export async function fetchTasks(ids: number[]): Promise<Task[]> {
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
 * Fetch batch of tasks from API with filtering by IDs.
 */
export async function fetchTasksBatchFromApi(taskIds: number[]): Promise<Task[]> {
    const results: Task[] = [];
    let remainingIds = [...taskIds];

    while (remainingIds.length > 0) {
        const filter = 'id in ' + remainingIds.join(',');
        const response: Tampermonkey.Response<string> = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `/api/v1/tasks/all?filter=${encodeURIComponent(filter)}`,
                headers: {
                    Authorization: `Bearer ${getJwtToken()}`,
                    'Content-Type': 'application/json'
                },
                onload: resolve,
                onerror: reject,
                responseType: 'json'
            });
        });

        const data = response.response;
        results.push(...data);

        const fetchedIds = data.map((task: Task) => task.id);
        remainingIds = remainingIds.filter((id) => !fetchedIds.includes(id));
        if (fetchedIds.length === 0) {
            break;
        }
    }

    return results;
}

/**
 * Fetch single task by ID.
 */
export async function fetchTaskById(taskId: number): Promise<Task> {
    return (await fetchTasks([taskId]))[0];
}

/**
 * Update a single task by merging with payload via POST API.
 */
export async function updateSingleTask(taskId: number, payload: Partial<Task>): Promise<Task> {
    const task = await fetchTaskById(taskId);

    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method: 'POST',
            url: `/api/v1/tasks/${taskId}`,
            headers: {
                Authorization: `Bearer ${getJwtToken()}`,
                'Content-Type': 'application/json'
            },
            data: JSON.stringify({ ...task, ...payload }),
            responseType: 'json',
            onload: (response) => {
                const updatedTask = response.response as Task;
                taskCache[taskId] = { ...taskCache[taskId], ...updatedTask };
                resolve(updatedTask);
            },
            onerror: (err) => reject(err)
        });
    });
}
