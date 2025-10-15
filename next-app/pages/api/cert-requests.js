const DEFAULT_ISSUANCE_BASE_URL = 'https://signing.staging.contentauthenticity.org'

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' })
  }

  const { csr, csrPem } = req.body || {}
  const csrPayload = typeof csr === 'string' && csr.trim()
    ? csr.trim()
    : (typeof csrPem === 'string' && csrPem.trim()) ? csrPem.trim() : ''

  if (!csrPayload) {
    return res.status(400).json({ ok: false, error: 'CSR payload is required' })
  }

  const accountId = process.env.C2PA_ACCOUNT_ID
  const bearerToken = process.env.C2PA_BEARER_TOKEN
  if (!accountId || !bearerToken) {
    return res.status(500).json({
      ok: false,
      error: 'C2PA_ACCOUNT_ID and C2PA_BEARER_TOKEN environment variables must be set'
    })
  }

  const baseUrl = (process.env.C2PA_ISSUANCE_BASE_URL || DEFAULT_ISSUANCE_BASE_URL).replace(/\/$/, '')
  const targetUrl = `${baseUrl}/accounts/${encodeURIComponent(accountId)}/cert-requests`

  try {
    const upstreamResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerToken}`,
        'Accept': 'application/json, text/plain'
      },
      body: JSON.stringify({ csr: csrPayload })
    })

    const rawBody = await upstreamResponse.text()
    let jsonBody = null
    if (rawBody) {
      try {
        jsonBody = JSON.parse(rawBody)
      } catch (e) {
        jsonBody = null
      }
    }

    if (!upstreamResponse.ok) {
      const errorMessage = jsonBody?.error || jsonBody?.message || rawBody || `Upstream error ${upstreamResponse.status}`
      return res.status(upstreamResponse.status).json({ ok: false, error: errorMessage })
    }

    let certificatePem = jsonBody?.certificatePem || jsonBody?.certificate || jsonBody?.pem || ''
    if (!certificatePem && rawBody.includes('-----BEGIN CERTIFICATE-----')) {
      certificatePem = rawBody.trim()
    }

    if (!certificatePem) {
      return res.status(502).json({ ok: false, error: 'Certificate PEM missing in upstream response' })
    }

    return res.status(200).json({ ok: true, certificatePem })
  } catch (error) {
    const message = error?.message || 'Failed to submit CSR'
    return res.status(500).json({ ok: false, error: message })
  }
}

export default handler
