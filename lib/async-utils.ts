/**
 * Run an async mapper over `items` with at most `limit` tasks in flight.
 * Preserves output order by index. Errors propagate immediately — on
 * failure the remaining items are not started, but in-flight tasks run
 * to completion before the rejection surfaces.
 */
export async function pMapLimit<T, R>(
    items: readonly T[],
    limit: number,
    mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    if (limit <= 0) throw new Error("pMapLimit: limit must be > 0");
    const results: R[] = new Array(items.length);
    let nextIndex = 0;
    let firstError: unknown = null;

    async function worker(): Promise<void> {
        while (firstError === null) {
            const i = nextIndex++;
            if (i >= items.length) return;
            try {
                results[i] = await mapper(items[i]!, i);
            } catch (err) {
                if (firstError === null) firstError = err;
                return;
            }
        }
    }

    const workerCount = Math.min(limit, items.length);
    const workers = Array.from({ length: workerCount }, () => worker());
    await Promise.all(workers);
    if (firstError !== null) throw firstError;
    return results;
}
