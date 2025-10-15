function tryParseJson(raw) {
  if (!raw) return null
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  const candidate = raw.slice(start, end + 1)
  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function normalizeChain(chain) {
  if (!Array.isArray(chain)) return []
  return chain.map((cert) => ({
    subject: cert.subject || cert.name || cert.commonName,
    issuer: cert.issuer,
    validFrom: cert.valid_from || cert.notBefore,
    validTo: cert.valid_to || cert.notAfter,
    status: cert.status || cert.validation_status,
  }))
}

function collectAssertions(manifest) {
  if (!manifest) return []
  const assertions = manifest.assertions || manifest.claims || []
  return assertions
    .filter((a) => a && typeof a === 'object')
    .map((a, idx) => ({
      label: a.label || a.type || `assertion-${idx}`,
      data: a.data || a.value || null,
    }))
}

function extractTimestamp(manifest) {
  if (!manifest) return null
  const ts = manifest.timestamp || manifest.timestamps?.[0]
  if (!ts) return manifest.ta_url ? { url: manifest.ta_url, status: 'Not embedded' } : null
  return {
    url: ts.url || ts.ta_url || manifest.ta_url,
    time: ts.time || ts.when || ts.generated_at,
    status: ts.status || ts.validation_status || (ts.valid === false ? 'Untrusted' : 'Trusted'),
    error: ts.error,
  }
}

function gatherWarnings(source) {
  const warnings = []
  const add = (items) => {
    if (!items) return
    if (Array.isArray(items)) {
      items.forEach((item) => {
        if (!item) return
        if (typeof item === 'string') warnings.push(item)
        else if (item.message) warnings.push(item.message)
        else warnings.push(JSON.stringify(item))
      })
    } else if (typeof items === 'string') {
      warnings.push(items)
    }
  }
  add(source?.warnings)
  add(source?.errors)
  add(source?.validation_errors)
  add(source?.notes)
  return warnings
}

export function buildVerificationReport(result) {
  if (!result) return null
  const raw = [result.output, result.error].filter(Boolean).join('\n')
  const parsed = result.report || tryParseJson(raw)
  if (!parsed) {
    return {
      ok: !!result.ok,
      summary: result.ok ? 'Signature verified successfully.' : 'Verification failed.',
      validationState: result.ok ? 'Trusted' : 'Untrusted',
      timestamp: null,
      trustChain: [],
      claims: [],
      warnings: raw ? [raw] : [],
      raw,
    }
  }

  const manifest = parsed.active_manifest || parsed.manifest || parsed.result || parsed
  const claims = collectAssertions(manifest)
  const trustChain = normalizeChain(parsed.trust_chain || manifest?.trust_chain || parsed.certificate_chain)
  const timestamp = extractTimestamp(manifest)
  const warnings = gatherWarnings(parsed).concat(gatherWarnings(manifest))
  const validationState = parsed.validation_state || parsed.validationStatus || manifest?.validation_state
  const summary = parsed.summary || (validationState ? `Validation state: ${validationState}` : '')

  return {
    ok: !!result.ok,
    summary,
    validationState,
    timestamp,
    trustChain,
    claims,
    warnings,
    raw,
  }
}
