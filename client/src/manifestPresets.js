export const MANIFEST_PRESETS = [
  {
    id: 'basic-photo',
    name: 'Basic Photo',
    description: 'Covers common IPTC photo metadata with creation action.',
    manifest: {
      vendor: 'demo-lab',
      claim_generator: 'c2pa-demo/1.0',
      private_key: 'mykey.key',
      sign_cert: 'mycert.pem',
      sign_cert_chain: ['C2PA-TRUST-BUNDLE.pem'],
      alg: 'ps256',
      assertions: [
        {
          label: 'stds.iptc.photo-metadata',
          data: {
            title: 'Demo Photo',
            description: 'Signed with the in-browser c2pa signer.',
            creator: 'Demo Photographer',
            creditLine: 'Demo Studio',
          },
        },
        {
          label: 'c2pa.actions',
          data: {
            actions: [
              {
                action: 'c2pa.created',
                softwareAgent: 'c2pa-demo-client',
                when: '2024-01-01T00:00:00Z',
              },
            ],
          },
        },
      ],
    },
  },
  {
    id: 'news-photo',
    name: 'Newsroom Photo',
    description: 'Adds rights and location metadata for newsroom workflows.',
    manifest: {
      vendor: 'demo-lab',
      claim_generator: 'c2pa-demo/1.0',
      private_key: 'mykey.key',
      sign_cert: 'mycert.pem',
      sign_cert_chain: ['C2PA-TRUST-BUNDLE.pem'],
      alg: 'ps256',
      assertions: [
        {
          label: 'stds.iptc.photo-metadata',
          data: {
            title: 'Breaking News',
            description: 'Captured on assignment.',
            creator: 'Demo Photojournalist',
            locationCreated: {
              name: 'Seattle, WA',
              gps: { lat: 47.6062, lon: -122.3321 },
            },
            copyrightNotice: '© Demo Newsroom',
            usageTerms: 'Editorial use only',
          },
        },
        {
          label: 'stds.schema-org.CreativeWork',
          data: {
            '@context': 'https://schema.org',
            '@type': 'ImageObject',
            headline: 'Breaking News Image',
            description: 'Signed with newsroom preset manifest.',
            keywords: ['news', 'breaking', 'c2pa'],
          },
        },
      ],
    },
  },
]

export const defaultManifest = MANIFEST_PRESETS[0].manifest
export const defaultManifestText = JSON.stringify(defaultManifest, null, 2)
