// ============================================================================
// shoot.mjs  —  Renderiza parking-garage.glb headless y captura varios angulos.
// Sirve la carpeta model3d/ por HTTP local y usa Edge (channel msedge) via Playwright.
//   node tools/shoot.mjs
// Salida: tools/shots/*.png
// ============================================================================
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;                 // sirve tools/ (preview.html) y ../model3d via ruta
const MIME = { '.html':'text/html', '.glb':'model/gltf-binary', '.js':'text/javascript', '.json':'application/json', '.png':'image/png' };

// Servidor estatico minimo (tools/ + model3d/)
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let file;
    if (p === '/' || p === '/preview.html') file = join(ROOT, 'preview.html');
    else if (p.endsWith('parking-garage.glb')) file = join(ROOT, '..', 'model3d', 'parking-garage.glb');
    else file = join(ROOT, p);
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    res.end(data);
  } catch { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}/preview.html`;

// Geometria v7: Nivel 1 (calle) y=0, Azotea y=7. Centro vertical ~3.5.
const SHOTS = [
  { name: '01-iso',        orbit: '40deg 58deg 72m', fov: '32deg', target: '0m 3m 0m' },
  { name: '02-front',      orbit: '0deg 76deg 66m',  fov: '34deg', target: '0m 2.5m 6m' },
  { name: '03-aerial',     orbit: '20deg 18deg 78m', fov: '32deg', target: '0m 5m 0m' },
  { name: '04-rampN1',     orbit: '170deg 70deg 34m', fov: '40deg', target: '0m 1m -16m' },
  { name: '05-groundIn',   orbit: '35deg 84deg 40m', fov: '44deg', target: '0m 1.5m 2m' },
  { name: '06-bays',       orbit: '-30deg 52deg 40m', fov: '36deg', target: '-7m 5m -5m' },
  { name: '07-topAzotea',  orbit: '0deg 4deg 70m',   fov: '32deg', target: '0m 7m 0m' },
  { name: '08-rampTop',    orbit: '0deg 12deg 34m',  fov: '38deg', target: '0m 5m -18m' },
  { name: '09-isoback',    orbit: '215deg 56deg 72m', fov: '32deg', target: '0m 3m 0m' },
  { name: '10-corner',     orbit: '135deg 60deg 70m', fov: '34deg', target: '0m 3.5m 0m' },
  { name: '11-eyelevel',   orbit: '8deg 90deg 56m',  fov: '42deg', target: '0m 4m 0m' },
  { name: '12-boothCU',    orbit: '20deg 74deg 18m', fov: '42deg', target: '14m 1m 20m' },
  { name: '13-elevatorCU', orbit: '160deg 72deg 22m', fov: '42deg', target: '7m 4m -18m' },
  { name: '14-azoteaIso',  orbit: '45deg 50deg 70m', fov: '32deg', target: '0m 7m 0m' },
  { name: '15-sideL',      orbit: '90deg 72deg 66m', fov: '32deg', target: '0m 3.5m 0m' },
  { name: '16-frontModule',orbit: '0deg 40deg 44m',  fov: '36deg', target: '0m 7m 13m' },
];

const browser = await chromium.launch({
  channel: 'msedge', headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
page.on('console', (m) => { if (m.type() === 'error') console.log('  [page error]', m.text()); });
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => window.__loaded === true || window.__error, { timeout: 60000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.log('ERROR cargando modelo:', err); }

for (const s of SHOTS) {
  await page.evaluate(({ orbit, target, fov }) => window.setView(orbit, target, fov), s);
  await page.waitForTimeout(1400);
  const out = join(ROOT, 'shots', `${s.name}.png`);
  await page.screenshot({ path: out });
  console.log('  captura:', out);
}

await browser.close();
server.close();
console.log('Listo. Capturas en tools/shots/');
