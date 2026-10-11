import type { CircularLoftCircle, CircularLoftParameters, CircularLoftSection } from './design';

function cloneCircle(circle: CircularLoftCircle): CircularLoftCircle {
    return { ...circle };
}

function cloneSection(section: CircularLoftSection): CircularLoftSection {
    return { circles: section.circles.map(cloneCircle) };
}

function midpointCircle(a: CircularLoftCircle, b: CircularLoftCircle): CircularLoftCircle {
    return {
        diameterMm: (a.diameterMm + b.diameterMm) / 2,
        xMm: (a.xMm + b.xMm) / 2,
        yMm: (a.yMm + b.yMm) / 2,
    };
}

/** Appends an inner material/void zone while preserving strict nesting in every section. */
export function appendCircularLoftCircle(
    parameters: CircularLoftParameters,
): CircularLoftParameters {
    return {
        ...parameters,
        sections: parameters.sections.map((section) => {
            const innermost = section.circles[section.circles.length - 1];
            return {
                circles: [
                    ...section.circles.map(cloneCircle),
                    {
                        diameterMm: innermost.diameterMm / 2,
                        xMm: innermost.xMm,
                        yMm: innermost.yMm,
                    },
                ],
            };
        }),
        gapsMm: [...parameters.gapsMm],
    };
}

/** Removes the innermost zone. The required outer circle is retained. */
export function removeCircularLoftInnermostCircle(
    parameters: CircularLoftParameters,
): CircularLoftParameters {
    if (parameters.sections[0].circles.length <= 1)
        return {
            ...parameters,
            sections: parameters.sections.map(cloneSection),
            gapsMm: [...parameters.gapsMm],
        };
    return {
        ...parameters,
        sections: parameters.sections.map((section) => ({
            circles: section.circles.slice(0, -1).map(cloneCircle),
        })),
        gapsMm: [...parameters.gapsMm],
    };
}

/**
 * Inserts a midpoint section and splits its adjacent interval equally. A zero
 * (or transient negative) draft gap remains invalid for the schema to report;
 * the operation deliberately does not silently alter the editor's draft.
 */
export function insertCircularLoftMiddleSection(
    parameters: CircularLoftParameters,
    intervalIndex: number,
): CircularLoftParameters {
    const gapMm = parameters.gapsMm[intervalIndex];
    const lower = parameters.sections[intervalIndex];
    const upper = parameters.sections[intervalIndex + 1];
    if (!lower || !upper || gapMm === undefined)
        throw new RangeError('The section interval does not exist.');
    const middle: CircularLoftSection = {
        circles: lower.circles.map((circle, index) => midpointCircle(circle, upper.circles[index])),
    };
    return {
        ...parameters,
        sections: [
            ...parameters.sections.slice(0, intervalIndex + 1).map(cloneSection),
            middle,
            ...parameters.sections.slice(intervalIndex + 1).map(cloneSection),
        ],
        gapsMm: [
            ...parameters.gapsMm.slice(0, intervalIndex),
            gapMm / 2,
            gapMm / 2,
            ...parameters.gapsMm.slice(intervalIndex + 1),
        ],
    };
}

/** Adds a terminal section with the prior terminal spacing. */
export function appendCircularLoftSection(
    parameters: CircularLoftParameters,
): CircularLoftParameters {
    const lastSection = parameters.sections[parameters.sections.length - 1];
    const lastGapMm = parameters.gapsMm[parameters.gapsMm.length - 1];
    if (!lastSection || lastGapMm === undefined)
        throw new RangeError('The loft needs two sections.');
    return {
        ...parameters,
        sections: [...parameters.sections.map(cloneSection), cloneSection(lastSection)],
        gapsMm: [...parameters.gapsMm, lastGapMm],
    };
}

/** Removes a section, joining its adjacent intervals when it is interior. */
export function removeCircularLoftSection(
    parameters: CircularLoftParameters,
    sectionIndex: number,
): CircularLoftParameters {
    if (parameters.sections.length <= 2)
        throw new RangeError('A circular loft must retain at least two sections.');
    if (sectionIndex < 0 || sectionIndex >= parameters.sections.length)
        throw new RangeError('The section does not exist.');

    const sections = parameters.sections
        .filter((_, index) => index !== sectionIndex)
        .map(cloneSection);
    const gapsMm = [...parameters.gapsMm];
    if (sectionIndex === 0) gapsMm.shift();
    else if (sectionIndex === parameters.sections.length - 1) gapsMm.pop();
    else gapsMm.splice(sectionIndex - 1, 2, gapsMm[sectionIndex - 1] + gapsMm[sectionIndex]);
    return { ...parameters, sections, gapsMm };
}
