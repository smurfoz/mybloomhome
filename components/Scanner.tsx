'use client';
// QR input: phone camera (native BarcodeDetector, else @zxing/browser), a USB or
// Bluetooth scanner (types like a keyboard and presses Enter), or typing.
import { useEffect, useRef, useState } from 'react';

function feedback(ok: boolean) {
  try { navigator.vibrate?.(ok ? 40 : [80, 60, 80]); } catch {}
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    o.frequency.value = ok ? 1200 : 300;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.08);
  } catch {}
}

export function Scanner({ onScan, placeholder = 'Scan or type item code', disabled }:
  { onScan: (text: string) => Promise<boolean>; placeholder?: string; disabled?: boolean }) {
  const [text, setText] = useState('');
  const [camera, setCamera] = useState(false);
  const [camError, setCamError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef({ value: '', at: 0 });

  const handle = async (value: string, fromCamera: boolean) => {
    const v = value.trim();
    if (!v) return;
    // A label held in front of the camera is read many times a second; ignore
    // repeats for 1.5 s. Typed and handheld-scanner input is always deliberate.
    if (fromCamera) {
      if (v === last.current.value && Date.now() - last.current.at < 1500) return;
      last.current = { value: v, at: Date.now() };
    }
    feedback(await onScan(v));
  };

  useEffect(() => {
    if (!camera) return;
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        const BD = (window as unknown as { BarcodeDetector?: new (o: object) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (BD) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
          video.current!.srcObject = stream;
          await video.current!.play();
          const detector = new BD({ formats: ['qr_code'] });
          let raf = 0;
          const loop = async () => {
            try { const codes = await detector.detect(video.current!); if (codes[0]) await handle(codes[0].rawValue, true); } catch {}
            raf = requestAnimationFrame(loop);
          };
          raf = requestAnimationFrame(loop);
          stop = () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); };
        } else {
          const { BrowserQRCodeReader } = await import('@zxing/browser');
          const reader = new BrowserQRCodeReader();
          const controls = await reader.decodeFromVideoDevice(undefined, video.current!, (result) => { if (result) handle(result.getText(), true); });
          stop = () => controls.stop();
          if (cancelled) stop();
        }
      } catch (e) {
        setCamError(e instanceof Error && e.name === 'NotAllowedError' ? 'Camera permission was refused.' : 'Camera not available — type or use a handheld scanner.');
        setCamera(false);
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [camera]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input text-lg" value={text} placeholder={placeholder} aria-label="Scan or type item code"
          disabled={disabled} autoCapitalize="characters" autoComplete="off" enterKeyHint="go"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = text; setText(''); handle(v, false); } }} />
        <button type="button" className="btn-secondary shrink-0" disabled={disabled}
          onClick={() => { setCamError(''); setCamera((c) => !c); }}>{camera ? 'Stop camera' : '📷 Camera'}</button>
      </div>
      {camera && <video ref={video} className="aspect-video w-full rounded-lg bg-black object-cover" muted playsInline />}
      {camError && <p className="text-sm text-warn">{camError}</p>}
    </div>
  );
}
