import React, { useCallback, useEffect, useMemo, useState } from 'react'
import ManifestEditor from './components/ManifestEditor.jsx'
import VerificationReport from './components/VerificationReport.jsx'
import { signImage, verifyImage } from './api.js'
import { MANIFEST_PRESETS, defaultManifestText } from './manifestPresets.js'
import { parseManifest, buildManifestForSigning } from './manifestUtils.js'
import { TSA_OPTIONS, getTsaOption } from './timestampOptions.js'
import { buildVerificationReport } from './verificationParser.js'
import { signWithWasm } from './localSigner.js'

function useFileState() {
  const [file, setFile] = useState(null)
  const [dataUrl, setDataUrl] = useState('')
  const [name, setName] = useState('')

  const onPick = useCallback((f) => {
    if (!f) return
    setFile(f)
    setName(f.name)
    const reader = new FileReader()
    reader.onload = () => setDataUrl(reader.result)
    reader.readAsDataURL(f)
  }, [])

  const clear = useCallback(() => {
    setFile(null)
    setDataUrl('')
    setName('')
  }, [])

  return { file, name, dataUrl, onPick, clear }
}

const downloadDataUrl = (dataUrl, fileName) => {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const dataUrlToBuffer = (dataUrl) => {
  if (!dataUrl) return null
  const parts = dataUrl.split(',')
  const base64 = parts.length > 1 ? parts[1] : parts[0]
  try {
    const binary = typeof atob === 'function'
      ? atob(base64)
      : typeof Buffer !== 'undefined'
        ? Buffer.from(base64, 'base64').toString('binary')
        : ''
    const length = binary.length
    const bytes = new Uint8Array(length)
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch (err) {
    console.warn('Failed to decode data URL', err)
    return null
  }
}

const uint8ToDataUrl = (bytes, mimeType, fallbackExt = 'jpg') => {
  if (!(bytes instanceof Uint8Array)) return null
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  const b64 = typeof btoa === 'function'
    ? btoa(binary)
    : typeof Buffer !== 'undefined'
      ? Buffer.from(bytes).toString('base64')
      : ''
  const mime = mimeType || (fallbackExt.includes('png') ? 'image/png' : 'image/jpeg')
  return `data:${mime};base64,${b64}`
}

const presetsById = Object.fromEntries(MANIFEST_PRESETS.map((preset) => [preset.id, preset]))

export default function App() {
  const src = useFileState()
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [signed, setSigned] = useState({ name: '', dataUrl: '' })
  const [verifyReport, setVerifyReport] = useState(null)
  const [manifestText, setManifestText] = useState(defaultManifestText)
  const [selectedPreset, setSelectedPreset] = useState(MANIFEST_PRESETS[0]?.id || '')
  const [timestampChoice, setTimestampChoice] = useState('proxy')

  const manifestInfo = useMemo(() => parseManifest(manifestText), [manifestText])
  const manifestValid = manifestInfo.ok
  const manifestErrors = manifestInfo.errors
  const timestampOption = getTsaOption(timestampChoice)

  useEffect(() => {
    setSigned({ name: '', dataUrl: '' })
    setVerifyReport(null)
    setStatus('')
  }, [src.dataUrl])

  const canSign = useMemo(() => !!src.dataUrl && manifestValid && !busy, [src.dataUrl, manifestValid, busy])
  const canVerify = useMemo(() => !busy && (signed.dataUrl || src.dataUrl), [busy, signed.dataUrl, src.dataUrl])

  const handlePresetChange = useCallback((presetId) => {
    setSelectedPreset(presetId)
    const preset = presetsById[presetId]
    if (preset) {
      setManifestText(JSON.stringify(preset.manifest, null, 2))
    }
  }, [])

  const handleImportManifest = useCallback((text) => {
    setSelectedPreset('')
    setManifestText(text)
  }, [])

  const handleExportManifest = useCallback(() => {
    const blob = new Blob([manifestText], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const filename = `${selectedPreset || 'manifest'}-${Date.now()}.json`
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [manifestText, selectedPreset])

  const onSign = useCallback(async () => {
    if (!canSign) return
    setBusy(true)
    setVerifyReport(null)
    setStatus('Signing with c2pa...')
    try {
      const manifest = buildManifestForSigning(manifestInfo.value, timestampOption?.url)
      if (!manifest) throw new Error('Manifest invalid')
      const fileName = src.name || (src.file ? src.file.name : 'image.jpg')
      const fileBuffer = dataUrlToBuffer(src.dataUrl)
      if (!fileBuffer) throw new Error('Unable to read source image')
      const wasmResult = await signWithWasm({
        fileBuffer,
        fileName,
        manifest,
        timestampUrl: timestampOption?.url,
      })
      if (wasmResult?.buffer) {
        const dataUrl = uint8ToDataUrl(wasmResult.buffer, wasmResult.mimeType, fileName.toLowerCase())
        setSigned({ name: `signed_${fileName}`, dataUrl })
        setStatus('Signed locally with WebAssembly runtime.')
        setBusy(false)
        return
      }
      const res = await signImage({
        name: fileName,
        dataUrl: src.dataUrl,
        manifest,
        timestampUrl: timestampOption?.url,
        timestampMode: timestampOption?.id,
      })
      if (!res.ok) throw new Error(res.error || 'Signing failed')
      setSigned({ name: res.fileName || `signed_${src.name || 'image'}`, dataUrl: res.dataUrl })
      setStatus('Signed successfully. Download the signed file to keep the manifest intact.')
    } catch (err) {
      console.error(err)
      setStatus(`Sign error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [canSign, manifestInfo.value, src.name, src.file, src.dataUrl, timestampOption])

  const onVerify = useCallback(async () => {
    const target = signed.dataUrl ? signed : { name: src.name, dataUrl: src.dataUrl }
    if (!target.dataUrl || busy) return
    setBusy(true)
    setStatus('Verifying manifest...')
    try {
      const res = await verifyImage(target)
      setVerifyReport(buildVerificationReport(res))
      if (!res.ok) {
        setStatus('Verification failed')
      } else {
        setStatus('Verification succeeded')
      }
    } catch (err) {
      console.error(err)
      setStatus(`Verify error: ${err.message}`)
    } finally {
      setBusy(false)
    }
  }, [busy, signed, src.name, src.dataUrl])

  const onDownloadSigned = useCallback(() => {
    if (!signed.dataUrl) return
    downloadDataUrl(signed.dataUrl, signed.name || `signed_${src.name || 'image'}`)
  }, [signed, src.name])

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>C2PA in-browser signing & verification</h1>
        <p className="muted">
          Generate, inspect, and verify C2PA manifests without leaving the browser. Bring your own image, adjust the manifest,
          and optionally attach a timestamp authority request.
        </p>
      </header>

      <main className="layout">
        <section className="column">
          <div className="panel">
            <h2>1. Select an image</h2>
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(event) => src.onPick(event.target.files?.[0])}
            />
            {src.dataUrl && <img className="preview" src={src.dataUrl} alt="preview" />}
            <div className="actions">
              <button type="button" className="secondary" onClick={src.clear} disabled={busy || !src.dataUrl}>
                Clear
              </button>
            </div>
          </div>

          <div className="panel">
            <h2>2. Timestamp authority</h2>
            <ul className="tsa-options">
              {TSA_OPTIONS.map((option) => (
                <li key={option.id}>
                  <label className="tsa-option">
                    <input
                      type="radio"
                      name="tsa"
                      value={option.id}
                      checked={timestampChoice === option.id}
                      onChange={() => setTimestampChoice(option.id)}
                      disabled={busy}
                    />
                    <div>
                      <div className="tsa-label">{option.label}</div>
                      <div className="tsa-description">{option.description}</div>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel">
            <h2>3. Actions</h2>
            <div className="actions">
              <button onClick={onSign} disabled={!canSign}>
                Sign locally
              </button>
              <button onClick={onVerify} disabled={!canVerify}>
                Verify
              </button>
            </div>
            <div className="status-text">{busy ? 'Working...' : status}</div>
            {signed.dataUrl && (
              <div className="actions" style={{ marginTop: 12 }}>
                <button onClick={onDownloadSigned} disabled={busy} className="secondary">
                  Download signed file
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="column wide">
          <ManifestEditor
            value={manifestText}
            onChange={setManifestText}
            presets={MANIFEST_PRESETS}
            selectedPreset={selectedPreset}
            onSelectPreset={handlePresetChange}
            onImportJson={handleImportManifest}
            onExportJson={handleExportManifest}
            errors={manifestErrors}
            taUrl={timestampOption?.url}
            disabled={busy}
          />

          {verifyReport && <VerificationReport report={verifyReport} />}
        </section>
      </main>
    </div>
  )
}
