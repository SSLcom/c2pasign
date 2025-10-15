const API_BASE = '' // Vite dev proxies /api to server

async function requestJson(path, body, init = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: JSON.stringify(body ?? {}),
    ...init,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch (err) {
    json = { ok: false, error: `Invalid JSON response from ${path}`, raw: text }
  }
  if (!res.ok && json.ok === undefined) {
    json.ok = false
    json.error = json.error || res.statusText || `Request failed (${res.status})`
  }
  return json
}

export async function signImage({ name, dataUrl, manifest, timestampUrl, timestampMode }) {
  return requestJson('/api/sign', {
    imageName: name,
    imageData: dataUrl,
    manifest,
    timestampUrl,
    timestampMode,
  })
}

export async function verifyImage({ name, dataUrl }) {
  return requestJson('/api/verify', {
    imageName: name,
    imageData: dataUrl,
    detailed: true,
  })
}

export async function proxyTimestamp(path, payload) {
  return requestJson(`/api/tsa/${path}`, payload)
}
