import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { signImage, verifyImage, requestCertificate } from './api'

const SECURE_STORAGE_KEY = 'c2pa-secure-material'
const DEFAULT_SUBJECT = 'C2PA Demo Device'

const textEncoder = new TextEncoder()

function concatUint8Arrays(...arrays) {
  const total = arrays.reduce((sum, arr) => sum + (arr?.length || 0), 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const arr of arrays) {
    if (!arr?.length) continue
    out.set(arr, offset)
    offset += arr.length
  }
  return out
}

function encodeLength(length) {
  if (length < 0x80) return Uint8Array.of(length)
  const bytes = []
  let remaining = length
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff)
    remaining >>= 8
  }
  return Uint8Array.of(0x80 | bytes.length, ...bytes)
}

function encodeTag(tag, content) {
  return concatUint8Arrays(Uint8Array.of(tag), encodeLength(content.length), content)
}

function encodeSequence(...parts) {
  const body = concatUint8Arrays(...parts)
  return encodeTag(0x30, body)
}

function encodeSet(...parts) {
  const body = concatUint8Arrays(...parts)
  return encodeTag(0x31, body)
}

function encodeContextSpecific0(content = new Uint8Array()) {
  return concatUint8Arrays(Uint8Array.of(0xa0), encodeLength(content.length), content)
}

function encodeOid(oid) {
  const parts = oid.split('.').map(Number)
  if (parts.length < 2) throw new Error('Invalid OID')
  const first = parts[0] * 40 + parts[1]
  const body = [first]
  for (let i = 2; i < parts.length; i += 1) {
    let value = parts[i]
    if (!Number.isFinite(value)) throw new Error('Invalid OID value')
    const stack = []
    do {
      stack.unshift(value & 0x7f)
      value >>= 7
    } while (value > 0)
    for (let j = 0; j < stack.length - 1; j += 1) {
      stack[j] |= 0x80
    }
    body.push(...stack)
  }
  return encodeTag(0x06, Uint8Array.from(body))
}

function encodeUtf8String(value) {
  return encodeTag(0x0c, textEncoder.encode(value))
}

function trimInteger(bytes) {
  let sliceStart = 0
  while (sliceStart < bytes.length - 1 && bytes[sliceStart] === 0) {
    sliceStart += 1
  }
  let out = bytes.slice(sliceStart)
  if (out.length === 0) out = Uint8Array.of(0)
  if (out[0] & 0x80) {
    out = concatUint8Arrays(Uint8Array.of(0), out)
  }
  return out
}

function encodeInteger(bytes) {
  return encodeTag(0x02, trimInteger(bytes))
}

function encodeBitString(bytes) {
  return encodeTag(0x03, concatUint8Arrays(Uint8Array.of(0x00), bytes))
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function toPem(label, base64) {
  const lines = base64.match(/.{1,64}/g)?.join('\n') || ''
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----\n`
}

function pemToBase64(pem) {
  return pem.replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

async function importPrivateKeyFromPem(pem) {
  if (!pem) return null
  const base64 = pemToBase64(pem)
  const buffer = base64ToArrayBuffer(base64)
  return window.crypto.subtle.importKey(
    'pkcs8',
    buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign']
  )
}

async function importPublicKeyFromSpki(base64) {
  if (!base64) return null
  const buffer = base64ToArrayBuffer(base64)
  return window.crypto.subtle.importKey(
    'spki',
    buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['verify']
  )
}

function useFileState() {
  const [file, setFile] = useState(null)
  const [dataUrl, setDataUrl] = useState('')
  const [name, setName] = useState('')

  const onPick = (f) => {
    if (!f) return
    setFile(f)
    setName(f.name)
    const rd = new FileReader()
    rd.onload = () => setDataUrl(rd.result)
    rd.readAsDataURL(f)
  }

  const clear = () => { setFile(null); setDataUrl(''); setName('') }
  return { file, name, dataUrl, onPick, clear }
}

export default function App() {
  const src = useFileState()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [verifyRes, setVerifyRes] = useState(null)
  const [signed, setSigned] = useState({ name: '', dataUrl: '' })
  const [keyPair, setKeyPair] = useState(null)
  const [pkcs8Pem, setPkcs8Pem] = useState('')
  const [publicKeySpkiB64, setPublicKeySpkiB64] = useState('')
  const [csrPem, setCsrPem] = useState('')
  const [certificatePem, setCertificatePem] = useState('')
  const [keyStatus, setKeyStatus] = useState('')
  const [keyBusy, setKeyBusy] = useState(false)
  const [useSecureStorage, setUseSecureStorage] = useState(false)
  const [storageHydrated, setStorageHydrated] = useState(false)
  const [csrSubject, setCsrSubject] = useState(DEFAULT_SUBJECT)

  const canSign = useMemo(() => !!src.dataUrl && !busy, [src.dataUrl, busy])
  const canVerify = useMemo(
    () => !busy && (signed.dataUrl || src.dataUrl),
    [busy, signed.dataUrl, src.dataUrl]
  )

  useEffect(() => {
    setSigned({ name: '', dataUrl: '' })
    setVerifyRes(null)
    setStatus('')
  }, [src.file])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.crypto?.subtle) {
      setKeyStatus('WebCrypto unavailable; key generation disabled in this browser.')
      setStorageHydrated(true)
      return
    }
    let cancelled = false
    const stored = window.localStorage.getItem(SECURE_STORAGE_KEY)
    if (!stored) {
      setStorageHydrated(true)
      return
    }
    ;(async () => {
      try {
        const parsed = JSON.parse(stored || '{}')
        const privateKeyPem = parsed?.privateKeyPem || ''
        const publicKeySpki = parsed?.publicKeySpki || ''
        const storedCert = parsed?.certificatePem || ''
        const storedSubject = parsed?.subject || DEFAULT_SUBJECT
        if (privateKeyPem && publicKeySpki) {
          const privateKey = await importPrivateKeyFromPem(privateKeyPem)
          const publicKey = await importPublicKeyFromSpki(publicKeySpki)
          if (cancelled) return
          if (privateKey && publicKey) {
            setKeyPair({ privateKey, publicKey })
            setKeyStatus('Loaded key material from secure storage.')
          }
        } else {
          if (!cancelled) {
            setKeyStatus('Secure storage ready. Generate a key pair to begin.')
          }
        }
        if (!cancelled) {
          setPkcs8Pem(privateKeyPem)
          setPublicKeySpkiB64(publicKeySpki)
          setCertificatePem(storedCert)
          setCsrSubject(storedSubject || DEFAULT_SUBJECT)
          setUseSecureStorage(true)
        }
      } catch (e) {
        if (!cancelled) {
          console.warn('Failed to restore secure storage', e)
          setKeyStatus(`Secure storage restore failed: ${e.message || e}`)
          try { window.localStorage.removeItem(SECURE_STORAGE_KEY) } catch {}
        }
      } finally {
        if (!cancelled) setStorageHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!storageHydrated || typeof window === 'undefined') return
    if (!useSecureStorage) {
      try { window.localStorage.removeItem(SECURE_STORAGE_KEY) } catch {}
      return
    }
    try {
      const payload = JSON.stringify({
        privateKeyPem: pkcs8Pem || null,
        publicKeySpki: publicKeySpkiB64 || null,
        certificatePem: certificatePem || null,
        subject: csrSubject || null
      })
      window.localStorage.setItem(SECURE_STORAGE_KEY, payload)
    } catch (e) {
      console.warn('Failed to persist secure storage', e)
      setKeyStatus(`Secure storage save failed: ${e.message || e}`)
    }
  }, [useSecureStorage, storageHydrated, pkcs8Pem, publicKeySpkiB64, certificatePem, csrSubject])

  const onSign = async () => {
    if (!src.dataUrl) return
    setBusy(true)
    setStatus('Signing...')
    try {
      const res = await signImage({ name: src.name, dataUrl: src.dataUrl })
      if (!res.ok) throw new Error(res.error || 'Sign failed')
      setSigned({ name: res.fileName || `signed_${src.name}`, dataUrl: res.dataUrl })
      setStatus('Signed successfully. Use "Download Signed" to save.')
    } catch (e) {
      setStatus(`Sign error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const onVerify = async () => {
    const verifyTarget = signed.dataUrl
      ? { name: signed.name || src.name, dataUrl: signed.dataUrl }
      : { name: src.name, dataUrl: src.dataUrl }
    if (!verifyTarget.dataUrl) return
    setBusy(true)
    setStatus('Verifying...')
    setVerifyRes(null)
    try {
      const res = await verifyImage(verifyTarget)
      setVerifyRes(res)
      setStatus(res.ok ? 'Verification PASS' : 'Verification FAIL')
    } catch (e) {
      setStatus(`Verify error: ${e.message}`)
    } finally {
      setBusy(false)
    }
  }

  const onDownloadSigned = () => {
    if (!signed.dataUrl) return
    const a = document.createElement('a')
    a.href = signed.dataUrl
    a.download = signed.name || `signed_${src.name || 'image'}`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const onToggleSecureStorage = useCallback((event) => {
    const next = event.target.checked
    setUseSecureStorage(next)
    setKeyStatus(next
      ? 'Secure storage enabled. Key material will persist locally.'
      : 'Secure storage disabled. Key material stays in-memory only.')
  }, [])

  const onGenerateKeypair = useCallback(async () => {
    if (!window?.crypto?.subtle) {
      setKeyStatus('WebCrypto unavailable; cannot generate key pair.')
      return
    }
    setKeyBusy(true)
    setKeyStatus('Generating EC P-256 key pair...')
    setCsrPem('')
    setCertificatePem('')
    try {
      const pair = await window.crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-256' },
        true,
        ['sign', 'verify']
      )
      const pkcs8 = await window.crypto.subtle.exportKey('pkcs8', pair.privateKey)
      const spki = await window.crypto.subtle.exportKey('spki', pair.publicKey)
      const pkcs8B64 = bufferToBase64(pkcs8)
      const spkiB64 = bufferToBase64(spki)
      setKeyPair(pair)
      setPkcs8Pem(toPem('PRIVATE KEY', pkcs8B64))
      setPublicKeySpkiB64(spkiB64)
      setKeyStatus('Generated new EC P-256 key pair.')
    } catch (e) {
      console.error('Key generation failed', e)
      setKeyPair(null)
      setPkcs8Pem('')
      setPublicKeySpkiB64('')
      setKeyStatus(`Key generation failed: ${e.message || e}`)
    } finally {
      setKeyBusy(false)
    }
  }, [])

  const onDownloadPrivateKey = useCallback(() => {
    if (!pkcs8Pem) return
    downloadText(`c2pa-key-${Date.now()}.pem`, pkcs8Pem)
  }, [pkcs8Pem])

  const onDownloadCertificate = useCallback(() => {
    if (!certificatePem) return
    downloadText(`c2pa-cert-${Date.now()}.pem`, certificatePem)
  }, [certificatePem])

  const onRequestCertificate = useCallback(async () => {
    if (!window?.crypto?.subtle) {
      setKeyStatus('WebCrypto unavailable; cannot build CSR.')
      return
    }
    if (!publicKeySpkiB64 || !pkcs8Pem) {
      setKeyStatus('Generate a key pair before requesting a certificate.')
      return
    }
    setKeyBusy(true)
    const subjectValue = (csrSubject || '').trim() || DEFAULT_SUBJECT
    try {
      let signingKey = keyPair?.privateKey
      let verifyingKey = keyPair?.publicKey
      if ((!signingKey || !verifyingKey) && pkcs8Pem && publicKeySpkiB64) {
        signingKey = await importPrivateKeyFromPem(pkcs8Pem)
        verifyingKey = await importPublicKeyFromSpki(publicKeySpkiB64)
        if (signingKey && verifyingKey) {
          setKeyPair({ privateKey: signingKey, publicKey: verifyingKey })
        }
      }
      if (!signingKey || !verifyingKey) {
        setKeyStatus('Generate a key pair before requesting a certificate.')
        return
      }
      setKeyStatus('Building CSR...')
      const version = Uint8Array.of(0x02, 0x01, 0x00)
      const subject = encodeSequence(
        encodeSet(
          encodeSequence(
            encodeOid('2.5.4.3'),
            encodeUtf8String(subjectValue)
          )
        )
      )
      const spkiDer = new Uint8Array(base64ToArrayBuffer(publicKeySpkiB64))
      const attributes = encodeContextSpecific0(new Uint8Array())
      const csrInfo = encodeSequence(version, subject, spkiDer, attributes)
      const signatureRaw = new Uint8Array(await window.crypto.subtle.sign(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        signingKey,
        csrInfo
      ))
      const half = signatureRaw.length / 2
      const r = signatureRaw.slice(0, half)
      const s = signatureRaw.slice(half)
      const derSignature = encodeSequence(encodeInteger(r), encodeInteger(s))
      const signatureAlgorithm = encodeSequence(encodeOid('1.2.840.10045.4.3.2'))
      const csrDer = encodeSequence(csrInfo, signatureAlgorithm, encodeBitString(derSignature))
      const csrText = toPem('CERTIFICATE REQUEST', bufferToBase64(csrDer))
      setCsrPem(csrText)
      setKeyStatus('CSR generated. Requesting certificate...')
      const res = await requestCertificate({ csrPem: csrText })
      if (!res?.ok) {
        throw new Error(res?.error || 'Certificate request failed')
      }
      if (!res.certificatePem) {
        throw new Error('Certificate PEM missing from response')
      }
      setCertificatePem(res.certificatePem.trim())
      setKeyStatus('Certificate issued successfully.')
    } catch (e) {
      console.error('CSR/certificate request failed', e)
      setKeyStatus(`CSR/certificate error: ${e.message || e}`)
    } finally {
      setKeyBusy(false)
    }
  }, [keyPair, publicKeySpkiB64, pkcs8Pem, csrSubject])

  return (
    <div className="card">
      <h1>C2PA Image Sign & Verify (PoC)</h1>
      <div className="row">
        <div className="col">
          <div className="panel">
            <label><strong>1) Pick an image</strong></label>
            <input type="file" accept="image/*" disabled={busy}
              onChange={e => src.onPick(e.target.files?.[0])} />
            {src.dataUrl && (
              <img className="preview" src={src.dataUrl} alt="preview" />
            )}
            <div className="actions">
              <button className="secondary" onClick={src.clear} disabled={busy || !src.dataUrl}>Clear</button>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="panel">
            <label><strong>2) Actions</strong></label>
            <div className="actions">
              <button onClick={onSign} disabled={!canSign}>Sign</button>
              <button onClick={onVerify} disabled={!canVerify}>Verify</button>
            </div>
            <div className="status">{busy ? 'Working...' : status}</div>
            {verifyRes && (
              <div className={verifyRes.ok ? 'ok status' : 'fail status'}>
                {verifyRes.ok ? 'PASS' : 'FAIL'}
                {'\n'}
                {(verifyRes.output || verifyRes.error || '').split('\n').slice(0, 4).join('\n')}
              </div>
            )}
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <label><strong>3) Export</strong></label>
            <div className="actions">
              <button onClick={onDownloadSigned} disabled={!signed.dataUrl || busy}>Download Signed</button>
            </div>
            {signed.dataUrl && (
              <div className="status">Ready: {signed.name}</div>
            )}
          </div>

          <div className="panel" style={{ marginTop: 12 }}>
            <label><strong>Keys &amp; Certificate</strong></label>
            <div className="status" style={{ marginBottom: 8 }}>
              <label>
                <input
                  type="checkbox"
                  checked={useSecureStorage}
                  onChange={onToggleSecureStorage}
                  disabled={!storageHydrated}
                />
                {' '}Secure storage (persist key material locally)
              </label>
            </div>
            <div className="actions">
              <button onClick={onGenerateKeypair} disabled={keyBusy}>Generate EC P-256 Keypair</button>
              <button onClick={onDownloadPrivateKey} disabled={!pkcs8Pem}>Download Private Key (PKCS#8)</button>
              <button
                onClick={onRequestCertificate}
                disabled={keyBusy || !pkcs8Pem || !publicKeySpkiB64 || !keyPair}
              >
                Build CSR &amp; Request Certificate
              </button>
            </div>
            <div className="field" style={{ marginTop: 8 }}>
              <label htmlFor="csr-cn"><strong>Common Name (CN)</strong></label>
              <input
                id="csr-cn"
                type="text"
                value={csrSubject}
                onChange={e => setCsrSubject(e.target.value)}
                disabled={keyBusy}
                placeholder={DEFAULT_SUBJECT}
              />
            </div>
            <div className="status">{keyBusy ? 'Working...' : keyStatus}</div>
            {csrPem && (
              <textarea
                readOnly
                value={csrPem}
                rows={6}
                style={{ width: '100%', marginTop: 8 }}
              />
            )}
            {certificatePem && (
              <textarea
                readOnly
                value={certificatePem}
                rows={6}
                style={{ width: '100%', marginTop: 8 }}
              />
            )}
            <div className="actions">
              <button onClick={onDownloadCertificate} disabled={!certificatePem}>Download Certificate</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

