// ============================================================================
// generate-scenes-config.mjs  —  Genera 3DScenesConfiguration.json
// ----------------------------------------------------------------------------
// Construye la configuracion de 3D Scenes Studio: un "element" (TwinToObjectMapping)
// por cada malla del .glb (cuyo nombre == dtId, asi que el mapeo es 1:1 automatico)
// y tres "behaviors" listos: Ocupacion, Seguridad (humo) y Energia.
//
// Subiendo este archivo + parking-garage.glb al mismo contenedor de blobs, al abrir
// 3D Scenes Studio la escena ya aparece coloreada y mapeada, sin trabajo manual.
//
//   node model3d/generate-scenes-config.mjs
// Variables (opcionales) para construir la URL del .glb:
//   STORAGE_ACCOUNT, STORAGE_CONTAINER  (si faltan, deja un placeholder reemplazable)
// ============================================================================

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildModel } from '../lib/layout-builder.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const model = buildModel();

const acct = process.env.STORAGE_ACCOUNT;
const container = process.env.STORAGE_CONTAINER || '3dscenes';
const glbUrl = acct
  ? `https://${acct}.blob.core.windows.net/${container}/parking-garage.glb`
  : '<<REEMPLAZAR_URL_DEL_GLB>>'; // 04-upload-3d-model.ps1 lo completa automaticamente

// ---- Elements: uno por malla nombrada -------------------------------------
const elements = [];
const elById = {};
function addElement(dtId) {
  const id = randomUUID();
  const el = { type: 'TwinToObjectMapping', id, displayName: dtId, primaryTwinID: dtId, objectIDs: [dtId] };
  elements.push(el); elById[dtId] = id; return id;
}
for (const lvl of model.levels) addElement(lvl.dtId);
for (const z of model.zones) addElement(z.dtId);
for (const s of model.spaces) addElement(s.dtId);
for (const sd of model.smokeDetectors) addElement(sd.dtId);
for (const lz of model.lightingZones) addElement(lz.dtId);
for (const ap of model.accessPoints) addElement(ap.dtId);
for (const rp of model.ramps) addElement(rp.dtId);

const idsOf = (arr) => arr.map((x) => elById[x.dtId]);

// ---- Behaviors -------------------------------------------------------------
const COLORS = {
  green: '#2E933C', amber: '#F2A900', red: '#D62828', gray: '#6C757D',
  blue: '#1168BD', lightOn: '#FFD166', lightDim: '#3A506B', smoke: '#FF4D4D',
};

const behaviorOccupancy = {
  id: 'beh-occupancy', displayName: 'Ocupacion de plazas',
  datasources: [{ type: 'ElementTwinToObjectMappingDataSource', elementIDs: idsOf(model.spaces) }],
  visuals: [
    {
      type: 'ExpressionRangeVisual', id: randomUUID(),
      valueExpression: 'PrimaryTwin.occupancyState', expressionType: 'CategoricalValues',
      objectIDs: { expression: 'objectIDs' },
      valueRanges: [
        { id: randomUUID(), values: ['Occupied'], visual: { color: COLORS.red } },
        { id: randomUUID(), values: ['Reserved'], visual: { color: COLORS.amber } },
        { id: randomUUID(), values: ['Free'], visual: { color: COLORS.green } },
        { id: randomUUID(), values: ['OutOfService'], visual: { color: COLORS.gray } },
      ],
    },
  ],
  twinAliases: [],
};

const behaviorZone = {
  id: 'beh-zone-occupancy', displayName: 'Ocupacion por zona',
  datasources: [{ type: 'ElementTwinToObjectMappingDataSource', elementIDs: idsOf(model.zones) }],
  visuals: [{
    type: 'ExpressionRangeVisual', id: randomUUID(),
    valueExpression: 'PrimaryTwin.occupancyRate', expressionType: 'NumericRange',
    objectIDs: { expression: 'objectIDs' },
    valueRanges: [
      { id: randomUUID(), values: [0, 0.6], visual: { color: COLORS.green } },
      { id: randomUUID(), values: [0.6, 0.85], visual: { color: COLORS.amber } },
      { id: randomUUID(), values: [0.85, 1.01], visual: { color: COLORS.red } },
    ],
  }],
  twinAliases: [],
};

const behaviorSmoke = {
  id: 'beh-smoke', displayName: 'Alerta de humo',
  datasources: [{ type: 'ElementTwinToObjectMappingDataSource', elementIDs: idsOf(model.smokeDetectors) }],
  visuals: [
    {
      type: 'ExpressionRangeVisual', id: randomUUID(),
      valueExpression: 'PrimaryTwin.smokeDetected', expressionType: 'CategoricalValues',
      objectIDs: { expression: 'objectIDs' },
      valueRanges: [
        { id: randomUUID(), values: [true], visual: { color: COLORS.smoke, iconName: 'Warning', labelExpression: '"HUMO DETECTADO"' } },
        { id: randomUUID(), values: [false], visual: { color: COLORS.green } },
      ],
    },
  ],
  twinAliases: [],
};

const behaviorEnergy = {
  id: 'beh-energy', displayName: 'Eficiencia energetica',
  datasources: [{ type: 'ElementTwinToObjectMappingDataSource', elementIDs: idsOf(model.lightingZones) }],
  visuals: [{
    type: 'ExpressionRangeVisual', id: randomUUID(),
    valueExpression: 'PrimaryTwin.currentLevel', expressionType: 'NumericRange',
    objectIDs: { expression: 'objectIDs' },
    valueRanges: [
      { id: randomUUID(), values: [0, 40], visual: { color: COLORS.lightDim } },
      { id: randomUUID(), values: [40, 80], visual: { color: COLORS.amber } },
      { id: randomUUID(), values: [80, 101], visual: { color: COLORS.lightOn } },
    ],
  }],
  twinAliases: [],
};

const behaviors = [behaviorOccupancy, behaviorZone, behaviorSmoke, behaviorEnergy];

// ---- Layers (capas conmutables en el visor del operador) -------------------
const layers = [
  { id: randomUUID(), displayName: 'Operaciones', behaviorIDs: ['beh-occupancy', 'beh-zone-occupancy'] },
  { id: randomUUID(), displayName: 'Seguridad', behaviorIDs: ['beh-smoke'] },
  { id: randomUUID(), displayName: 'Energia', behaviorIDs: ['beh-energy'] },
];

// ---- Scene -----------------------------------------------------------------
const scene = {
  id: randomUUID(),
  displayName: 'SmartPark - Jockey Plaza',
  description: 'Gemelo digital 3D del estacionamiento (generado por Apex Twin).',
  assets: [{ type: '3DAsset', url: glbUrl }],
  elements,
  behaviorIDs: behaviors.map((b) => b.id),
  pollingConfiguration: { minimumPollingFrequency: 5000 },
};

const config = {
  $schema: 'https://github.com/microsoft/iot-cardboard-js/tree/main/schemas/3DScenesConfiguration/v1.0.0/3DScenesConfiguration.schema.json',
  configuration: { scenes: [scene], behaviors, layers },
};

const outPath = join(__dirname, '3DScenesConfiguration.json');
writeFileSync(outPath, JSON.stringify(config, null, 2));
console.log('Config de escena generada:', outPath);
console.log('  elements:', elements.length, '| behaviors:', behaviors.length, '| layers:', layers.length);
console.log('  URL del GLB:', glbUrl);
if (!acct) console.log('  NOTA: define STORAGE_ACCOUNT para incrustar la URL real, o usa 04-upload-3d-model.ps1 que la reemplaza.');
