'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { SignResponse, VerifyResponse } from '@/lib/api';
import { signImage, verifyImage } from '@/lib/api';

interface FileState {
  file: File | null;
  name: string;
  dataUrl: string;
}

const initialFileState: FileState = { file: null, name: '', dataUrl: '' };

export default function Home() {
  const [source, setSource] = useState<FileState>(initialFileState);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [signed, setSigned] = useState<Pick<SignResponse, 'fileName' | 'dataUrl'>>({});
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);

  useEffect(() => {
    setStatus('');
    setSigned({});
    setVerifyResult(null);
  }, [source.file]);

  const canSign = useMemo(() => Boolean(source.dataUrl) && !busy, [source.dataUrl, busy]);
  const canVerify = useMemo(
    () => !busy && Boolean((signed.dataUrl || source.dataUrl) && (signed.fileName || source.name)),
    [busy, signed.dataUrl, signed.fileName, source.dataUrl, source.name],
  );

  const onPick = (file: File | undefined | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSource({ file, name: file.name ?? 'image.jpg', dataUrl: String(reader.result ?? '') });
    };
    reader.readAsDataURL(file);
  };

  const onClear = () => {
    setSource(initialFileState);
  };

  const onSign = async () => {
    if (!source.dataUrl || busy) return;
    setBusy(true);
    setStatus('Signing…');
    try {
      const response = await signImage({ name: source.name, dataUrl: source.dataUrl });
      if (!response.ok || !response.dataUrl) {
        throw new Error(response.error || 'Sign failed');
      }
      setSigned({ fileName: response.fileName ?? `signed_${source.name}`, dataUrl: response.dataUrl });
      setStatus('Signed successfully. Download or verify the result.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setStatus(`Sign error: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    const target = signed.dataUrl
      ? { name: signed.fileName ?? source.name, dataUrl: signed.dataUrl }
      : { name: source.name, dataUrl: source.dataUrl };
    if (!target.dataUrl) return;
    setBusy(true);
    setStatus('Verifying…');
    setVerifyResult(null);
    try {
      const result = await verifyImage({ name: target.name ?? source.name, dataUrl: target.dataUrl });
      setVerifyResult(result);
      setStatus(result.ok ? 'Verification PASS' : 'Verification FAIL');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setStatus(`Verify error: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const onDownloadSigned = () => {
    if (!signed.dataUrl) return;
    const link = document.createElement('a');
    link.href = signed.dataUrl;
    link.download = signed.fileName ?? `signed_${source.name || 'image'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <main className="container flex min-h-screen flex-col gap-10 py-10">
      <section className="grid gap-6 text-center">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4">
          <div className="rounded-full bg-primary/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            C2PA Proof of Concept
          </div>
          <h1 className="text-balance text-4xl font-bold md:text-5xl">Sign & verify image attestations</h1>
          <p className="text-pretty text-base text-muted-foreground md:text-lg">
            Upload an image, produce a C2PA manifest with your signing keys, and verify the attestation — all without
            running a separate backend server.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-primary/20 bg-card/80 backdrop-blur">
          <CardHeader>
            <CardTitle>1. Pick an image</CardTitle>
            <CardDescription>Select a JPEG or PNG to sign.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex w-full flex-col gap-2 text-left text-sm font-medium">
              Image file
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                className="block w-full cursor-pointer rounded-md border border-dashed border-border/60 bg-background/80 px-3 py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground"
                onChange={(event) => onPick(event.target.files?.[0])}
              />
            </label>
            {source.dataUrl ? (
              <div className="relative overflow-hidden rounded-lg border border-border/50">
                <Image
                  src={source.dataUrl}
                  alt="Selected preview"
                  width={800}
                  height={600}
                  className="h-auto w-full object-contain"
                  priority
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border/60 bg-background/60 text-sm text-muted-foreground">
                No image selected yet.
              </div>
            )}
          </CardContent>
          <CardFooter className="justify-between gap-3 border-t border-border/40">
            <div className="text-xs text-muted-foreground">Images are processed entirely on the server-side API route.</div>
            <Button variant="secondary" onClick={onClear} disabled={busy || !source.dataUrl}>
              Clear selection
            </Button>
          </CardFooter>
        </Card>

        <div className="grid gap-6">
          <Card className="border-primary/20 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle>2. Actions</CardTitle>
              <CardDescription>Sign with your configured credentials or verify a signed image.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button size="lg" onClick={onSign} disabled={!canSign}>
                  {busy && status.startsWith('Signing') ? 'Working…' : 'Sign'}
                </Button>
                <Button size="lg" variant="outline" onClick={onVerify} disabled={!canVerify}>
                  {busy && status.startsWith('Verifying') ? 'Working…' : 'Verify'}
                </Button>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-left text-xs font-mono text-muted-foreground">
                {busy ? 'Working…' : status || 'Awaiting action.'}
              </div>
              {verifyResult && (
                <div
                  className={`rounded-md border p-3 text-left text-xs font-mono ${
                    verifyResult.ok
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : 'border-red-500/50 bg-red-500/10 text-red-200'
                  }`}
                >
                  <strong className="text-sm font-semibold">
                    {verifyResult.ok ? 'PASS' : 'FAIL'}
                  </strong>
                  <pre className="mt-2 whitespace-pre-wrap text-xs">
                    {(verifyResult.output || verifyResult.error || '').split('\n').slice(0, 6).join('\n')}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle>3. Export</CardTitle>
              <CardDescription>Download a signed copy for archival or distribution.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              {signed.dataUrl ? (
                <div className="space-y-1">
                  <p className="font-medium text-foreground">Ready: {signed.fileName}</p>
                  <p>The download stays in-memory – nothing is persisted.</p>
                </div>
              ) : (
                <p>No signed asset yet. Run the sign action to generate one.</p>
              )}
            </CardContent>
            <CardFooter className="justify-end border-t border-border/40">
              <Button onClick={onDownloadSigned} disabled={!signed.dataUrl || busy}>
                Download signed image
              </Button>
            </CardFooter>
          </Card>
        </div>
      </section>
    </main>
  );
}
