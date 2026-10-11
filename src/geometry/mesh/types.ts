export type RawMesh = {
    positions: Float32Array;
    indices: Uint32Array;
};

export type Tessellation = {
    circularSegments: number;
    verticalSegments: number;
    drawerSideSegments: number;
    edgeSegments?: number;
};

export type VectorReliefOptions = { carrierSagittaMm: number; chordErrorMm: number };

export type Point = readonly [number, number];
