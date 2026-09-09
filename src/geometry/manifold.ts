/// <reference types="vite/client" />

import Module, { type ManifoldToplevel } from 'manifold-3d'
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url'

let modulePromise: Promise<ManifoldToplevel> | undefined

/**
 * Loads the WASM kernel once per JavaScript realm. The worker and tests each get
 * their own realm, so neither can accidentally share native object handles.
 */
export function getManifoldModule(): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    const runtime = globalThis as typeof globalThis & { process?: { versions?: { node?: string } } }
    const moduleOptions = runtime.process?.versions?.node ? undefined : { locateFile: () => manifoldWasmUrl }
    modulePromise = Module(moduleOptions).then((module) => {
      module.setup()
      return module
    })
  }

  return modulePromise
}
