const API_BASE = '' // Vite dev proxies /api to server

export async function signImage({ name, dataUrl }) {
  const res = await fetch(`${API_BASE}/api/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageName: name, imageData: dataUrl })
  })
  return res.json()
}

export async function verifyImage({ name, dataUrl }) {
  const res = await fetch(`${API_BASE}/api/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageName: name, imageData: dataUrl })
  })
  return res.json()
}

export async function requestCertificate({ csrPem }) {
  const res = await fetch(`${API_BASE}/api/cert-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csr: csrPem })
  })
  const text = await res.text()
  try {
    const json = text ? JSON.parse(text) : {}
    if (!res.ok) {
      return {
        ok: false,
        error: json?.error || json?.message || `HTTP ${res.status}`
      }
    }
    return json
  } catch (e) {
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    return { ok: false, error: `Unexpected response: ${text || e.message}` }
  }
}

