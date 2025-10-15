export interface SignRequest {
  name: string;
  dataUrl: string;
}

export interface SignResponse {
  ok: boolean;
  error?: string;
  fileName?: string;
  dataUrl?: string;
  stdout?: string;
  stderr?: string;
}

export interface VerifyResponse {
  ok: boolean;
  output?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
}

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/?$/, '') || '';

async function request<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = res.statusText;
    let stdout: string | undefined;
    let stderr: string | undefined;
    try {
      const data = (await res.json()) as { error?: string; stdout?: string; stderr?: string };
      if (data?.error) message = data.error;
      stdout = data.stdout;
      stderr = data.stderr;
    } catch (err) {
      console.error('Failed to parse error response', err);
    }
    const error = new Error(message || 'Request failed');
    (error as Error & { stdout?: string; stderr?: string }).stdout = stdout;
    (error as Error & { stdout?: string; stderr?: string }).stderr = stderr;
    throw error;
  }
  return (await res.json()) as T;
}

export function signImage(body: SignRequest) {
  return request<SignResponse>(`${apiBase}/api/sign`, {
    imageName: body.name,
    imageData: body.dataUrl,
  });
}

export function verifyImage(body: SignRequest) {
  return request<VerifyResponse>(`${apiBase}/api/verify`, {
    imageName: body.name,
    imageData: body.dataUrl,
  });
}
