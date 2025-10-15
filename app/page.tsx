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
  const [signLog, setSignLog] = useState('');
  const [verifyLog, setVerifyLog] = useState('');
  const [verifySource, setVerifySource] = useState<'original' | 'signed'>('signed');

  const copyToClipboard = (value: string) => {
    if (!value) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(value);
      }
    } catch (error) {
      console.error('Failed to copy', error);
    }
  };

  useEffect(() => {
    setStatus('');
    setSigned({});
    setVerifyResult(null);
    setSignLog('');
    setVerifyLog('');
  }, [source.file]);

  const canSign = useMemo(() => Boolean(source.dataUrl) && !busy, [source.dataUrl, busy]);
  const canVerify = useMemo(() => {
    if (busy) return false;
    if (verifySource === 'signed') {
      return Boolean(signed.dataUrl);
    }
    return Boolean(source.dataUrl);
  }, [busy, signed.dataUrl, source.dataUrl, verifySource]);

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
    setSignLog('');
    try {
      const response = await signImage({ name: source.name, dataUrl: source.dataUrl });
      if (!response.ok || !response.dataUrl) {
        throw new Error(response.error || 'Sign failed');
      }
      setSigned({ fileName: response.fileName ?? `signed_${source.name}`, dataUrl: response.dataUrl });
      setStatus('Signed successfully. Download or verify the result.');
      const stdout = response.stdout?.trim() ?? '';
      const stderr = response.stderr?.trim() ?? '';
      setSignLog([stdout, stderr].filter(Boolean).join('\n\n'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setStatus(`Sign error: ${message}`);
      if (error instanceof Error) {
        const stdout = (error as Error & { stdout?: string }).stdout?.trim() ?? '';
        const stderr = (error as Error & { stderr?: string }).stderr?.trim() ?? '';
        setSignLog([stdout, stderr].filter(Boolean).join('\n\n') || message);
      }
    } finally {
      setBusy(false);
    }
  };

  const onVerify = async () => {
    const useSigned = verifySource === 'signed' && signed.dataUrl;
    const target = useSigned
      ? { name: signed.fileName ?? source.name, dataUrl: signed.dataUrl }
      : { name: source.name, dataUrl: source.dataUrl };
    if (!target.dataUrl) return;
    setBusy(true);
    setStatus('Verifying…');
    setVerifyResult(null);
    setVerifyLog('');
    try {
      const result = await verifyImage({ name: target.name ?? source.name, dataUrl: target.dataUrl });
      setVerifyResult(result);
      setStatus(result.ok ? 'Verification PASS' : 'Verification FAIL');
      const stdout = result.stdout?.trim() ?? '';
      const stderr = result.stderr?.trim() ?? '';
      setVerifyLog([stdout, stderr].filter(Boolean).join('\n\n'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      setStatus(`Verify error: ${message}`);
      if (error instanceof Error) {
        const stdout = (error as Error & { stdout?: string }).stdout?.trim() ?? '';
        const stderr = (error as Error & { stderr?: string }).stderr?.trim() ?? '';
        setVerifyLog([stdout, stderr].filter(Boolean).join('\n\n') || message);
      }
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
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Verify against:</span>
                <Button
                  type="button"
                  size="sm"
                  variant={verifySource === 'signed' ? 'default' : 'ghost'}
                  className="h-7"
                  onClick={() => setVerifySource('signed')}
                  disabled={!signed.dataUrl || busy}
                >
                  Signed output
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={verifySource === 'original' ? 'default' : 'ghost'}
                  className="h-7"
                  onClick={() => setVerifySource('original')}
                  disabled={!source.dataUrl || busy}
                >
                  Original upload
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
          <Card className="border-primary/20 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle>4. Diagnostics</CardTitle>
              <CardDescription>Inspect raw c2patool output from the most recent operations.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Sign output</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => copyToClipboard(signLog)}
                    disabled={!signLog}
                  >
                    Copy
                  </Button>
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border border-border/40 bg-background/80 p-3 text-xs text-muted-foreground">
                  {signLog || 'Run a signing operation to view output.'}
                </pre>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                  <span>Verify output</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => copyToClipboard(verifyLog)}
                    disabled={!verifyLog}
                  >
                    Copy
                  </Button>
                </div>
                <pre className="max-h-48 overflow-auto rounded-md border border-border/40 bg-background/80 p-3 text-xs text-muted-foreground">
                  {verifyLog || 'Run a verification to view output.'}
                </pre>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
