export function capLoop(
    indices: number[],
    loopStart: number,
    count: number,
    centerIndex: number,
    top: boolean,
): void {
    for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        if (top) indices.push(centerIndex, loopStart + i, loopStart + next);
        else indices.push(centerIndex, loopStart + next, loopStart + i);
    }
}

export function connectLoops(
    indices: number[],
    lowerStart: number,
    upperStart: number,
    count: number,
): void {
    for (let i = 0; i < count; i += 1) {
        const next = (i + 1) % count;
        const a = lowerStart + i;
        const b = lowerStart + next;
        const c = upperStart + next;
        const d = upperStart + i;
        indices.push(a, b, c, a, c, d);
    }
}
