// ============================================================================
// simulator/index.mjs  —  Simulador IoT de SmartPark (TS-10 del backlog)
// ----------------------------------------------------------------------------
// Genera telemetria sintetica realista y la sincroniza con Azure Digital Twins
// mediante operaciones JSON Patch (igual que harian sensores fisicos en el
// futuro, sin cambios en el resto del sistema). Cuando detecta humo, ademas
// POSTea al Web Service para disparar la cadena de notificaciones push.
//
//   npm run simulate
//
// Variables (.env): ADT_HOST_NAME, SIM_TICK_MS, SIM_SMOKE_PROBABILITY,
//   SIM_OCCUPANCY_CHURN, SIM_PEAK_HOURS, WEB_SERVICE_SMOKE_URL, WEB_SERVICE_API_KEY
// ============================================================================

import { getAdtClient } from '../lib/adt-client.mjs';
import { buildModel } from '../lib/layout-builder.mjs';

const client = getAdtClient();
const model = buildModel();

const TICK = Number(process.env.SIM_TICK_MS ?? 5000);
const SMOKE_P = Number(process.env.SIM_SMOKE_PROBABILITY ?? 0.0015);
const CHURN = Number(process.env.SIM_OCCUPANCY_CHURN ?? 0.06);
const PEAK = (process.env.SIM_PEAK_HOURS ?? '12,13,18,19,20').split(',').map(Number);
const SMOKE_URL = process.env.WEB_SERVICE_SMOKE_URL;
const API_KEY = process.env.WEB_SERVICE_API_KEY;

const rep = (path, value) => ({ op: 'replace', path, value });
const now = () => new Date().toISOString();
const rnd = (a, b) => a + Math.random() * (b - a);

// --- Estado en memoria ---
const occ = new Map();              // spaceId -> bool ocupada
for (const s of model.spaces) occ.set(s.dtId, false);
const smokeActive = new Map();      // detectorId -> ticks restantes de alerta

async function patch(dtId, ops) {
  try { await client.updateDigitalTwin(dtId, ops); }
  catch (e) { console.warn(`  patch ${dtId} fallo: ${e.message}`); }
}

function targetOccupancy() {
  const h = new Date().getHours();
  return PEAK.includes(h) ? 0.9 : 0.45;
}

async function tickOccupancy() {
  const target = targetOccupancy();
  const changed = [];
  for (const s of model.spaces) {
    if (Math.random() < CHURN) {
      const next = Math.random() < target;
      if (next !== occ.get(s.dtId)) {
        occ.set(s.dtId, next);
        changed.push(s);
        await patch(s.dtId, [
          rep('/occupancyState', next ? 'Occupied' : 'Free'),
          rep('/lastUpdated', now()),
        ]);
      }
    }
  }
  // Rollups por zona -> nivel -> lote
  let lotOcc = 0;
  for (const z of model.zones) {
    const zoneSpaces = model.spaces.filter((s) => s.zoneId === z.dtId);
    const o = zoneSpaces.filter((s) => occ.get(s.dtId)).length;
    const rate = zoneSpaces.length ? o / zoneSpaces.length : 0;
    const congestion = rate >= 0.85 ? 'High' : rate >= 0.6 ? 'Moderate' : 'Low';
    await patch(z.dtId, [rep('/occupiedSpaces', o), rep('/occupancyRate', round2(rate)), rep('/congestionLevel', congestion)]);
    z._occ = o; z._rate = rate;
  }
  for (const lvl of model.levels) {
    const ls = model.spaces.filter((s) => s.levelNumber === lvl.props.levelNumber);
    const o = ls.filter((s) => occ.get(s.dtId)).length;
    lotOcc += o;
    await patch(lvl.dtId, [rep('/occupiedSpaces', o), rep('/occupancyRate', round2(ls.length ? o / ls.length : 0))]);
  }
  await patch(model.lot.dtId, [
    rep('/occupiedSpaces', lotOcc),
    rep('/occupancyRate', round2(model.spaces.length ? lotOcc / model.spaces.length : 0)),
  ]);
  return changed.length;
}

async function tickEnergy() {
  // A menor ocupacion de zona, mayor recomendacion de atenuacion (ahorro 15-25%)
  for (const lz of model.lightingZones) {
    const z = model.zones.find((zz) => zz.dtId === lz.zoneId);
    const rate = z?._rate ?? 0;
    const recommended = rate < 0.2 ? 40 : rate < 0.5 ? 70 : 100;
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

async function tickFlow() {
  for (const ap of model.accessPoints) {
    const vpm = Math.round(rnd(0, PEAK.includes(new Date().getHours()) ? 18 : 6));
    await patch(ap.dtId, [
      rep('/vehicleCount', (ap._vc = (ap._vc ?? 0) + vpm)),
      rep('/status', vpm > 14 ? 'Congested' : 'Open'),
    ]);
  }
  for (const rp of model.ramps) {
    const vpm = round2(rnd(0, 20));
    await patch(rp.dtId, [
      rep('/vehiclesPerMinute', vpm),
      rep('/flowStatus', vpm > 15 ? 'Severe' : vpm > 9 ? 'Moderate' : 'Normal'),
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
    const changed = await tickOccupancy();
    await tickEnergy();
    await tickFlow();
    await tickSmoke();
    console.log(`[${new Date().toLocaleTimeString()}] tick OK | plazas cambiadas: ${changed} | alertas humo activas: ${smokeActive.size}`);
  } catch (e) {
    console.error('tick error:', e.message);
  } finally {
    ticking = false;
  }
}

console.log('Simulador IoT SmartPark iniciado.');
console.log(`  tick=${TICK}ms  smokeP=${SMOKE_P}  churn=${CHURN}  horasPico=[${PEAK}]`);
console.log(`  ADT=${process.env.ADT_HOST_NAME}`);
console.log(`  WebService=${SMOKE_URL ?? '(no configurado: solo se actualiza el twin)'}`);
console.log('  Ctrl+C para detener.\n');
await loop();
setInterval(loop, TICK);
