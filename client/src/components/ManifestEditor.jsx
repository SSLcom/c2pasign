import React, { useMemo, useRef } from 'react'

export default function ManifestEditor({
  value,
  onChange,
  presets,
  selectedPreset,
  onSelectPreset,
  onImportJson,
  onExportJson,
  errors = [],
  taUrl,
  disabled,
}) {
  const fileInput = useRef(null)
  const errorText = useMemo(() => (errors && errors.length ? errors.join('\n') : ''), [errors])

  const triggerImport = () => {
    fileInput.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      onImportJson?.(text)
    } catch (err) {
      console.error('Failed to import manifest', err)
    } finally {
      event.target.value = ''
    }
  }

  const presetDescription = useMemo(() => {
    const preset = presets?.find((p) => p.id === selectedPreset)
    return preset?.description || ''
  }, [presets, selectedPreset])

  return (
    <div className="panel manifest-card">
      <div className="panel-header">
        <div>
          <h2>Manifest Editor</h2>
          <p className="muted">Edit the manifest JSON used for signing. Timestamp URLs are injected automatically.</p>
        </div>
        <div className="manifest-tools">
          <select
            className="preset-select"
            value={presets?.some((preset) => preset.id === selectedPreset) ? selectedPreset : ''}
            onChange={(e) => onSelectPreset?.(e.target.value)}
            disabled={disabled}
          >
            {presets?.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
            <option value="">Custom</option>
          </select>
          <button type="button" className="secondary" onClick={triggerImport} disabled={disabled}>
            Import JSON
          </button>
          <button type="button" className="secondary" onClick={() => onExportJson?.()} disabled={disabled}>
            Export JSON
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>
      </div>

      {presetDescription && <p className="preset-description">{presetDescription}</p>}

      <div className="ta-hint">
        <strong>Timestamp authority</strong>
        <span>{taUrl ? taUrl : 'Timestamping disabled'}</span>
      </div>

      <textarea
        className="manifest-editor"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        spellCheck="false"
        disabled={disabled}
      />

      <div className="manifest-footer">
        <div className="error-block" role="alert">
          {errorText || 'Manifest is valid.'}
        </div>
      </div>
    </div>
  )
}
