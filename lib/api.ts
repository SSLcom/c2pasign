export interface SignRequest {
  name: string;
  dataUrl: string;
}

export interface SignResponse {
  ok: boolean;
  error?: string;
  fileName?: string;
  dataUrl?: string;
}

export interface VerifyResponse {
  ok: boolean;
  output?: string;
  error?: string;
}

async function request<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch (err) {
      console.error('Failed to parse error response', err);
    }
    throw new Error(message || 'Request failed');
  }
  return (await res.json()) as T;
}

export function signImage(body: SignRequest) {
  return request<SignResponse>('/api/sign', {
    imageName: body.name,
    imageData: body.dataUrl,
  });
}

export function verifyImage(body: SignRequest) {
  return request<VerifyResponse>('/api/verify', {
    imageName: body.name,
    imageData: body.dataUrl,
  });
}
