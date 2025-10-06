import React, { useState, useMemo, useEffect } from 'react'
import { signImage, verifyImage } from './api'

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
        </div>
      </div>
    </div>
  )
}

