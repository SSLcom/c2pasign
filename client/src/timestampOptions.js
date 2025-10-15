export const TSA_OPTIONS = [
  {
    id: 'none',
    label: 'No timestamp',
    description: 'Skip timestamping (faster but not anchored to a TSA).',
    url: '',
  },
  {
    id: 'staging',
    label: 'SSL.com staging (direct)',
    description: 'Calls the SSL.com staging TSA directly from the browser.',
    url: 'https://api.staging.c2pa.ssl.com/v1/timestamp/rsa',
  },
  {
    id: 'proxy',
    label: 'Proxy via /api/tsa/rsa',
    description: 'Uses the local proxy to reach the SSL.com staging TSA.',
    url: '/api/tsa/rsa',
    proxied: true,
  },
]

export function getTsaOption(id) {
  return TSA_OPTIONS.find((option) => option.id === id) || TSA_OPTIONS[0]
}
