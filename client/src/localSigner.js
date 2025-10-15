import { SIGNING_PRIVATE_KEY_PEM, SIGNING_CERT_CHAIN } from './signingMaterial.js'

let runtimePromise = null

async function loadRuntime() {
  if (runtimePromise) return runtimePromise
  runtimePromise = (async () => {
    if (typeof window === 'undefined') return null
    try {
      const module = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@contentauth/c2pa-wasm@0.9.2/dist/browser/c2pa.js')
      const factory = module?.createC2pa || module?.default?.createC2pa || module?.default
      if (typeof factory !== 'function') return null
      const wasmSrc = module?.wasmUrl || module?.wasmSrc || `${module?.baseUrl || ''}c2pa.wasm`
      const workerSrc = module?.workerUrl || module?.workerSrc || `${module?.baseUrl || ''}c2pa.worker.js`
      return await factory({ wasmSrc, workerSrc })
    } catch (err) {
      console.warn('Failed to load c2pa wasm runtime', err)
      return null
    }
  })()
  return runtimePromise
}

async function buildManifest(runtime, manifest) {
  if (!runtime?.createManifestStore) throw new Error('Runtime missing createManifestStore')
  const store = await runtime.createManifestStore()
  const builder = await store.createManifest(manifest.claim_generator || 'c2pa.manifest')
  if (builder?.setVendor && manifest.vendor) {
    builder.setVendor(manifest.vendor)
  }
  const assertions = Array.isArray(manifest.assertions) ? manifest.assertions : []
  if (builder?.addAssertion) {
    for (const assertion of assertions) {
      await builder.addAssertion(assertion)
    }
  }
  return { store, builder }
}

export async function signWithWasm({ fileBuffer, fileName, manifest, timestampUrl }) {
  try {
    const runtime = await loadRuntime()
    if (!runtime?.createSigner) return null
    const { store, builder } = await buildManifest(runtime, manifest)
    if (timestampUrl && builder?.setTimestampUrl) {
      builder.setTimestampUrl(timestampUrl)
    }
    const signer = await runtime.createSigner({
      privateKey: SIGNING_PRIVATE_KEY_PEM,
      certificates: SIGNING_CERT_CHAIN,
      signingAlgorithm: manifest.alg || 'ps256',
    })
    const signResult = await runtime.sign({
      signer,
      manifestStore: store,
      data: new Uint8Array(fileBuffer),
      fileName,
    })
    if (!signResult?.data && !signResult?.buffer) return null
    const payload = signResult.data || signResult.buffer
    return {
      buffer: payload instanceof Uint8Array ? payload : new Uint8Array(payload),
      mimeType: signResult.mimeType || signResult.contentType,
    }
  } catch (err) {
    console.warn('WASM signing unavailable, falling back to API', err)
    return null
  }
}
