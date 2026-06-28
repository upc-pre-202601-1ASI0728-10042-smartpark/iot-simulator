// ============================================================================
// simulator/index.mjs  —  Simulador IoT de SmartPark (TS-10 del backlog)
// ----------------------------------------------------------------------------
// Genera telemetria sintetica realista y la sincroniza con Azure Digital Twins
// mediante operaciones JSON Patch (igual que harian sensores fisicos en el
// futuro, sin cambios en el resto del sistema). Cuando detecta humo, ademas
// POSTea al Web Service para disparar la cadena de notificaciones push.
//
// La ocupacion NO se mueve con volteos aleatorios de plazas: se deriva de un
// modelo de FLUJO VEHICULAR por zona (entradas/salidas por intervalo). De cada
// zona se calcula ademas una TENDENCIA de ocupacion (media movil + direccion +
// bandera de baja ocupacion sostenida) que alimenta la eficiencia energetica.
//
//   npm run simulate
//
// Variables (.env): ADT_HOST_NAME, SIM_TICK_MS, SIM_SMOKE_PROBABILITY,
//   SIM_FLOW_INTENSITY, SIM_PEAK_HOURS, SIM_TREND_WINDOW, SIM_LOW_OCCUPANCY,
//   WEB_SERVICE_SMOKE_URL, WEB_SERVICE_API_KEY
// ============================================================================

import { getAdtClient } from '../lib/adt-client.mjs';
import { buildModel } from '../lib/layout-builder.mjs';

const client = getAdtClient();
const model = buildModel();

const TICK = Number(process.env.SIM_TICK_MS ?? 5000);
const SMOKE_P = Number(process.env.SIM_SMOKE_PROBABILITY ?? 0.0015);
const FLOW = Number(process.env.SIM_FLOW_INTENSITY ?? 1.2);   // intensidad base de flujo por intervalo
const PEAK = (process.env.SIM_PEAK_HOURS ?? '12,13,18,19,20').split(',').map(Number);
const TREND_WINDOW = Number(process.env.SIM_TREND_WINDOW ?? 6);      // muestras para la media movil
const LOW_OCC = Number(process.env.SIM_LOW_OCCUPANCY ?? 0.25);       // umbral de baja ocupacion
const SMOKE_URL = process.env.WEB_SERVICE_SMOKE_URL;
const API_KEY = process.env.WEB_SERVICE_API_KEY;

const rep = (path, value) => ({ op: 'replace', path, value });
const now = () => new Date().toISOString();
const rnd = (a, b) => a + Math.random() * (b - a);

// Conteo de eventos por intervalo (aproximacion de Knuth a una Poisson):
// modela cuantos vehiculos entran/salen en un tick dado una media esperada.
function poisson(mean) {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > limit);
  return k - 1;
}

// Extrae k elementos al azar (sin repeticion) de un array.
function pick(arr, k) {
  const a = arr.slice(), out = [];
  for (let i = 0; i < k && a.length; i++) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
  return out;
}

// --- Estado en memoria ---
const occ = new Map();              // spaceId -> bool ocupada
for (const s of model.spaces) occ.set(s.dtId, false);
const smokeActive = new Map();      // detectorId -> ticks restantes de alerta
// Tendencia de ocupacion por zona: historial de tasas para la media movil.
const trend = new Map();            // zoneId -> number[] (occupancyRate reciente)
for (const z of model.zones) trend.set(z.dtId, []);

async function patch(dtId, ops) {
  try { await client.updateDigitalTwin(dtId, ops); }
  catch (e) { console.warn(`  patch ${dtId} fallo: ${e.message}`); }
}

function targetOccupancy() {
  const h = new Date().getHours();
  return PEAK.includes(h) ? 0.9 : 0.45;
}

// Direccion de la tendencia comparando la mitad reciente contra la mitad antigua
// de la ventana. Umbral de 0.05 para evitar ruido de baja frecuencia.
function trendDirection(history) {
  if (history.length < 3) return 'Stable';
  const mid = Math.floor(history.length / 2);
  const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const delta = avg(history.slice(mid)) - avg(history.slice(0, mid));
  return delta > 0.05 ? 'Rising' : delta < -0.05 ? 'Falling' : 'Stable';
}

// Flujo vehicular + ocupacion + tendencia (nucleo del Sprint 2).
// Por zona: se calculan entradas y salidas del intervalo con un modelo de flujo
// que empuja la ocupacion hacia el objetivo horario; se ocupan/liberan plazas en
// consecuencia y se acumulan las cifras por nivel para los puntos de acceso.
async function tickOccupancy() {
  const target = targetOccupancy();
  const peak = PEAK.includes(new Date().getHours());
  let changed = 0;
  const levelFlow = new Map();      // levelNumber -> { entries, exits }
  for (const lvl of model.levels) levelFlow.set(lvl.props.levelNumber, { entries: 0, exits: 0 });

  let lotOcc = 0;
  for (const z of model.zones) {
    const zoneSpaces = model.spaces.filter((s) => s.zoneId === z.dtId);
    const free = zoneSpaces.filter((s) => !occ.get(s.dtId));
    const taken = zoneSpaces.filter((s) => occ.get(s.dtId));
    const rate = zoneSpaces.length ? taken.length / zoneSpaces.length : 0;

    // Presion hacia el objetivo: si falta ocupacion entran mas coches; si sobra, salen mas.
    const pressure = target - rate;
    const base = FLOW * (peak ? 1.5 : 0.7);
    const entries = Math.min(free.length, poisson(base * (0.35 + Math.max(0, pressure) * 3)));
    const exits = Math.min(taken.length, poisson(base * (0.35 + Math.max(0, -pressure) * 3)));

    for (const s of pick(free, entries)) {
      occ.set(s.dtId, true); changed++;
      await patch(s.dtId, [rep('/occupancyState', 'Occupied'), rep('/lastUpdated', now())]);
    }
    for (const s of pick(taken, exits)) {
      occ.set(s.dtId, false); changed++;
      await patch(s.dtId, [rep('/occupancyState', 'Free'), rep('/lastUpdated', now())]);
    }

    const lf = levelFlow.get(z.levelNumber);
    lf.entries += entries; lf.exits += exits;

    // Rollup + tendencia de la zona
    const o = zoneSpaces.filter((s) => occ.get(s.dtId)).length;
    const newRate = zoneSpaces.length ? o / zoneSpaces.length : 0;
    lotOcc += o;
    const hist = trend.get(z.dtId);
    hist.push(newRate);
    if (hist.length > TREND_WINDOW) hist.shift();
    const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
    const direction = trendDirection(hist);
    const low = hist.length >= TREND_WINDOW && avg < LOW_OCC;
    const congestion = newRate >= 0.85 ? 'High' : newRate >= 0.6 ? 'Moderate' : 'Low';

    await patch(z.dtId, [
      rep('/occupiedSpaces', o), rep('/occupancyRate', round2(newRate)), rep('/congestionLevel', congestion),
      rep('/entriesLastInterval', entries), rep('/exitsLastInterval', exits), rep('/netFlow', entries - exits),
      rep('/avgOccupancyRate', round2(avg)), rep('/occupancyTrend', direction), rep('/lowOccupancy', low),
    ]);
    // Cache para tickEnergy (decision estable basada en la tendencia, no en el instante)
    z._rate = newRate; z._avg = avg; z._trend = direction; z._low = low;
  }

  // Rollups por nivel y lote
  for (const lvl of model.levels) {
    const ls = model.spaces.filter((s) => s.levelNumber === lvl.props.levelNumber);
    const o = ls.filter((s) => occ.get(s.dtId)).length;
    await patch(lvl.dtId, [rep('/occupiedSpaces', o), rep('/occupancyRate', round2(ls.length ? o / ls.length : 0))]);
  }
  await patch(model.lot.dtId, [
    rep('/occupiedSpaces', lotOcc),
    rep('/occupancyRate', round2(model.spaces.length ? lotOcc / model.spaces.length : 0)),
  ]);
  return { changed, levelFlow };
}

async function tickEnergy() {
  // La recomendacion de atenuacion se apoya en la TENDENCIA (media movil) y en la
  // bandera de baja ocupacion sostenida, no en un valor instantaneo ruidoso.
  for (const lz of model.lightingZones) {
    const z = model.zones.find((zz) => zz.dtId === lz.zoneId);
    const avg = z?._avg ?? 0;
    const low = z?._low ?? false;
    const recommended = low ? 30 : avg < 0.2 ? 40 : avg < 0.5 ? 70 : 100;
    const savings = Math.max(0, Math.round((100 - recommended) * 0.25));
    await patch(lz.dtId, [
      rep('/currentLevel', 100),
      rep('/recommendedLevel', recommended),
      rep('/savingsPercent', savings),
      rep('/status', recommended < 100 ? 'DimmingRecommended' : 'Optimal'),
    ]);
  }
  for (const lm of model.luminositySensors) {
    await patch(lm.dtId, [rep('/luminosity', Math.round(rnd(180, 480))), rep('/lastReading', now())]);
  }
}

// Los puntos de acceso y rampas reflejan el flujo vehicular REAL del intervalo
// (entradas/salidas contabilizadas en tickOccupancy), no numeros al azar.
async function tickFlow(levelFlow) {
  for (const ap of model.accessPoints) {
    const lf = levelFlow.get(ap.levelNumber) ?? { entries: 0, exits: 0 };
    const moved = ap.props.type === 'Entry' ? lf.entries : lf.exits;
    await patch(ap.dtId, [
      rep('/vehicleCount', (ap._vc = (ap._vc ?? 0) + moved)),
      rep('/status', moved > 6 ? 'Congested' : 'Open'),
    ]);
  }
  for (const rp of model.ramps) {
    // Trafico de la rampa = vehiculos que se mueven en el nivel superior que conecta.
    const upper = Math.max(...rp.props.connectsLevels.split('-').map(Number));
    const lf = levelFlow.get(upper) ?? { entries: 0, exits: 0 };
    const perMin = round2((lf.entries + lf.exits) * (60000 / TICK) / 4);
    await patch(rp.dtId, [
      rep('/vehiclesPerMinute', perMin),
      rep('/flowStatus', perMin > 15 ? 'Severe' : perMin > 9 ? 'Moderate' : 'Normal'),
    ]);
  }
}

async function tickSmoke() {
  // Resolver alertas activas
  for (const [id, left] of [...smokeActive.entries()]) {
    if (left <= 1) {
      smokeActive.delete(id);
      await patch(id, [rep('/smokeDetected', false), rep('/smokeLevel', 0), rep('/status', 'Normal'), rep('/lastReading', now())]);
      console.log(`  [HUMO] resuelto en ${id}`);
    } else {
      smokeActive.set(id, left - 1);
      const lvl = Math.round(rnd(220, 600));
      await patch(id, [rep('/smokeLevel', lvl), rep('/lastReading', now())]);
    }
  }
  // Disparar nueva alerta
  if (smokeActive.size === 0 && Math.random() < SMOKE_P) {
    const det = model.smokeDetectors[Math.floor(Math.random() * model.smokeDetectors.length)];
    const level = Math.round(rnd(250, 700));
    smokeActive.set(det.dtId, 4 + Math.floor(rnd(0, 4)));
    await patch(det.dtId, [rep('/smokeDetected', true), rep('/smokeLevel', level), rep('/status', 'Alert'), rep('/lastReading', now())]);
    console.log(`  [HUMO] ALERTA en ${det.dtId} (zona ${det.zoneId}, nivel ${det.levelNumber}) -> ${level} ppm`);
    await notifyWebService(det, level);
  }
}

async function notifyWebService(det, level) {
  if (!SMOKE_URL) return;
  const affected = model.spaces
    .filter((s) => s.zoneId === det.zoneId && occ.get(s.dtId))
    .map((s) => s.dtId);
  const payload = {
    detectorId: det.dtId, zoneId: det.zoneId, levelNumber: det.levelNumber,
    smokeLevel: level, detectedAt: now(), affectedOccupiedSpaces: affected,
  };
  try {
    const res = await fetch(SMOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(API_KEY ? { 'X-Api-Key': API_KEY } : {}) },
      body: JSON.stringify(payload),
    });
    console.log(`  [HUMO] POST ${SMOKE_URL} -> ${res.status}`);
  } catch (e) {
    console.warn(`  [HUMO] Web Service no disponible (${e.message}). Twin actualizado igual.`);
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

let ticking = false;
async function loop() {
  if (ticking) return;
  ticking = true;
  try {
    const { changed, levelFlow } = await tickOccupancy();
    await tickEnergy();
    await tickFlow(levelFlow);
    await tickSmoke();
    const entries = [...levelFlow.values()].reduce((s, v) => s + v.entries, 0);
    const exits = [...levelFlow.values()].reduce((s, v) => s + v.exits, 0);
    const lowZones = model.zones.filter((z) => z._low).length;
    console.log(`[${new Date().toLocaleTimeString()}] tick OK | flujo: +${entries}/-${exits} | plazas cambiadas: ${changed} | zonas baja ocup.: ${lowZones} | alertas humo: ${smokeActive.size}`);
  } catch (e) {
    console.error('tick error:', e.message);
  } finally {
    ticking = false;
  }
}

console.log('Simulador IoT SmartPark iniciado.');
console.log(`  tick=${TICK}ms  smokeP=${SMOKE_P}  flow=${FLOW}  horasPico=[${PEAK}]  ventanaTendencia=${TREND_WINDOW}  umbralBajaOcup=${LOW_OCC}`);
console.log(`  ADT=${process.env.ADT_HOST_NAME}`);
console.log(`  WebService=${SMOKE_URL ?? '(no configurado: solo se actualiza el twin)'}`);
console.log('  Ctrl+C para detener.\n');
await loop();
setInterval(loop, TICK);
