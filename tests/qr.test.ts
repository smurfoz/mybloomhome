// APP-3: a printed label decodes back to exactly the URL it was made from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { QR_OPTIONS, newQrCode, qrUrl, qrSvg } from '../lib/qr.ts';

function render(url: string, pxPerModule = 4) {
  const qr = QRCode.create(url, { errorCorrectionLevel: QR_OPTIONS.errorCorrectionLevel });
  const n = qr.modules.size, quiet = QR_OPTIONS.margin, size = (n + quiet * 2) * pxPerModule;
  const data = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    if (!qr.modules.get(r, c)) continue;
    for (let y = 0; y < pxPerModule; y++) for (let x = 0; x < pxPerModule; x++) {
      const i = (((r + quiet) * pxPerModule + y) * size + (c + quiet) * pxPerModule + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { data, size, qr };
}

test('APP-3 labels use level M with a 4-module quiet zone and decode to the exact URL', async () => {
  for (let i = 0; i < 25; i++) {
    const url = qrUrl('https://store.mybloomhome.example/', newQrCode());
    const { data, size, qr } = render(url);
    assert.equal(qr.errorCorrectionLevel.bit, 0, 'level M');   // L=1, M=0, Q=3, H=2
    assert.equal(jsQR(data, size, size)?.data, url);
  }
  const svg = await qrSvg('https://x.example/q/abcdefghjkmn');
  assert.match(svg, /^<svg/);
  const box = /viewBox="0 0 (\d+) (\d+)"/.exec(svg)!;
  const modules = QRCode.create('https://x.example/q/abcdefghjkmn', { errorCorrectionLevel: 'M' }).modules.size;
  assert.equal(Number(box[1]), modules + 2 * QR_OPTIONS.margin, 'quiet zone of 4 modules each side');
});

// Measured with this renderer and jsQR (40 labels each): a square smudge over
// 6% of the symbol always decodes; 8% → 37/40; 10% → 21/40; 12% → 1/40.
// Scattered damage is worse: level M corrects ~15% of codewords, and scattered
// flipped modules land in many different codewords.
test('APP-3 a smudged label (6% of the symbol wiped white) still decodes', () => {
  const ppm = 4;
  for (let run = 0; run < 20; run++) {
    const url = qrUrl('https://store.mybloomhome.example', newQrCode());
    const { data, size, qr } = render(url, ppm);
    const n = qr.modules.size, quiet = QR_OPTIONS.margin;
    const side = Math.round(Math.sqrt(0.06 * n * n));
    const r0 = Math.floor((n - side) / 2) + (run % 3) - 1, c0 = Math.floor((n - side) / 2) + ((run >> 2) % 3) - 1;
    for (let r = r0; r < r0 + side; r++) for (let c = c0; c < c0 + side; c++) {
      for (let y = 0; y < ppm; y++) for (let x = 0; x < ppm; x++) {
        const i = (((r + quiet) * ppm + y) * size + (c + quiet) * ppm + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 255;
      }
    }
    assert.equal(jsQR(data, size, size)?.data, url, `run ${run}`);
  }
});
