import React from 'react'

const TRUST_BUNDLES = [
  {
    id: 'rsa',
    label: 'C2PA RSA trust bundle',
    href: '/trust-bundles/C2PA-TRUST-BUNDLE.pem',
  },
  {
    id: 'ecc',
    label: 'C2PA ECC trust bundle',
    href: 'https://contentauthenticity.org/trust/c2pa_ecc_trust_bundle.pem',
  },
]

function renderData(data) {
  if (!data) return null
  if (typeof data === 'string') return <code>{data}</code>
  return <pre className="json-preview">{JSON.stringify(data, null, 2)}</pre>
}

export default function VerificationReport({ report }) {
  if (!report) return null
  const {
    ok,
    summary,
    validationState,
    timestamp,
    trustChain = [],
    claims = [],
    warnings = [],
    raw,
  } = report

  return (
    <div className={`panel verify-report ${ok ? 'ok' : 'fail'}`}>
      <div className="report-header">
        <h2>Verification Report</h2>
        <span className={ok ? 'status-pill pass' : 'status-pill fail'}>
          {ok ? 'Trusted' : 'Untrusted'}
        </span>
      </div>
      {summary && <p className="summary-text">{summary}</p>}
      {validationState && (
        <div className="report-section">
          <h3>Validation state</h3>
          <p>{validationState}</p>
        </div>
      )}

      <div className="report-section">
        <h3>Timestamp authority</h3>
        {timestamp ? (
          <ul className="plain-list">
            <li>
              <strong>URL:</strong> {timestamp.url || 'Not present'}
            </li>
            {timestamp.time && (
              <li>
                <strong>Time:</strong> {timestamp.time}
              </li>
            )}
            {timestamp.status && (
              <li>
                <strong>Status:</strong> {timestamp.status}
              </li>
            )}
            {timestamp.error && (
              <li className="warning">{timestamp.error}</li>
            )}
          </ul>
        ) : (
          <p className="muted">No timestamp assertion detected.</p>
        )}
      </div>

      <div className="report-section">
        <h3>Claim assertions</h3>
        {claims.length === 0 && <p className="muted">No claims parsed.</p>}
        {claims.map((claim) => (
          <div key={claim.label} className="claim-block">
            <strong>{claim.label}</strong>
            {renderData(claim.data)}
          </div>
        ))}
      </div>

      <div className="report-section">
        <h3>Trust chain</h3>
        {trustChain.length === 0 && <p className="muted">No trust chain data.</p>}
        {trustChain.map((cert, idx) => (
          <div key={`${cert.subject || 'cert'}-${idx}`} className="trust-block">
            <div><strong>Subject:</strong> {cert.subject || 'Unknown'}</div>
            {cert.issuer && <div><strong>Issuer:</strong> {cert.issuer}</div>}
            {cert.validFrom && <div><strong>Valid from:</strong> {cert.validFrom}</div>}
            {cert.validTo && <div><strong>Valid to:</strong> {cert.validTo}</div>}
            {cert.status && <div><strong>Status:</strong> {cert.status}</div>}
          </div>
        ))}
        <p className="muted small">Reference trust bundles:</p>
        <ul className="bundle-links">
          {TRUST_BUNDLES.map((bundle) => (
            <li key={bundle.id}>
              <a href={bundle.href} target="_blank" rel="noreferrer">
                {bundle.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {warnings.length > 0 && (
        <div className="report-section">
          <h3>Warnings</h3>
          <ul className="warning-list">
            {warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {raw && (
        <details className="report-section">
          <summary>Raw verifier output</summary>
          <pre className="raw-output">{raw}</pre>
        </details>
      )}
    </div>
  )
}
