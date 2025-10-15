export function parseManifest(text) {
  try {
    const value = JSON.parse(text)
    const errors = validateManifest(value)
    return { value, errors, ok: errors.length === 0 }
  } catch (err) {
    return { value: null, errors: [`JSON parse error: ${err.message}`], ok: false }
  }
}

export function validateManifest(manifest) {
  const errors = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Manifest must be a JSON object']
  }

  const requireString = (key) => {
    if (typeof manifest[key] !== 'string' || !manifest[key].trim()) {
      errors.push(`${key} must be a non-empty string`)
    }
  }

  requireString('vendor')
  requireString('claim_generator')

  if (manifest.private_key && typeof manifest.private_key !== 'string') {
    errors.push('private_key must be a PEM path or PEM string')
  }
  if (manifest.sign_cert && typeof manifest.sign_cert !== 'string') {
    errors.push('sign_cert must be a PEM path or PEM string')
  }
  if (manifest.alg && typeof manifest.alg !== 'string') {
    errors.push('alg must be a signing algorithm string (e.g. ps256)')
  }
  if (manifest.sign_cert_chain) {
    if (!Array.isArray(manifest.sign_cert_chain) || manifest.sign_cert_chain.some((v) => typeof v !== 'string')) {
      errors.push('sign_cert_chain must be an array of PEM paths or PEM strings')
    }
  }

  if (!Array.isArray(manifest.assertions) || manifest.assertions.length === 0) {
    errors.push('assertions must be a non-empty array')
  } else {
    manifest.assertions.forEach((assertion, idx) => {
      if (!assertion || typeof assertion !== 'object' || Array.isArray(assertion)) {
        errors.push(`assertions[${idx}] must be an object`)
        return
      }
      if (typeof assertion.label !== 'string' || !assertion.label.trim()) {
        errors.push(`assertions[${idx}].label must be a non-empty string`)
      }
      if (!('data' in assertion)) {
        errors.push(`assertions[${idx}] is missing data property`)
      } else if (typeof assertion.data !== 'object' || assertion.data === null) {
        errors.push(`assertions[${idx}].data must be an object`)
      }
    })
  }

  if (manifest.ta_url && typeof manifest.ta_url !== 'string') {
    errors.push('ta_url must be a string when present')
  }

  return errors
}

export function buildManifestForSigning(manifest, taUrl) {
  if (!manifest) return null
  const copy = JSON.parse(JSON.stringify(manifest))
  if (taUrl) {
    copy.ta_url = taUrl
  } else {
    delete copy.ta_url
  }
  return copy
}

export function formatValidationErrors(errors) {
  return errors.join('\n')
}
