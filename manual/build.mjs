// manual.html を PDF にする（Chrome を DevTools の仕組みで動かして印刷する）
// 使い方: node build.mjs   → baby-care_manual.pdf ができる
// 必要なもの: Google Chrome（macOS の標準の場所）と Node.js。書体は ../../_fonts/ の Noto Sans JP・Inter（OFL）
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, process.argv[2] || 'baby-care_manual.pdf');
const port = 9700 + Math.floor(Math.random() * 200);
const prof = mkdtempSync(join(tmpdir(), 'manual-pdf-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  let up = false;
  for (let i = 0; i < 50 && !up; i++) { try { await (await fetch(`http://127.0.0.1:${port}/json/version`)).json(); up = true; } catch { await sleep(200); } }
  const page = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable');
  await send('Page.navigate', { url: pathToFileURL(join(here, 'manual.html')).href });
  await sleep(1200);
  await send('Runtime.evaluate', { expression: 'document.fonts.ready.then(()=>document.fonts.size)', awaitPromise: true });
  await sleep(500);
  const r = await send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, displayHeaderFooter: false });
  if (!r.result?.data) throw new Error('PDF にできませんでした: ' + JSON.stringify(r.error || r).slice(0, 200));
  writeFileSync(outPath, Buffer.from(r.result.data, 'base64'));
  console.log('作成:', outPath);
  ws.close();
} finally {
  chrome.kill('SIGKILL'); await sleep(300); try { rmSync(prof, { recursive: true, force: true }); } catch {}
}
process.exit(0)
