// ============================================================================
// layout-builder.mjs  —  Derivacion deterministica del grafo SmartPark
// ----------------------------------------------------------------------------
// A partir de config/layout.json produce la lista completa de twins, sus
// posiciones 3D y sus relaciones. Lo consumen los tres generadores para que
// modelo 3D, grafo de Azure Digital Twins y configuracion de la escena queden
// SIEMPRE sincronizados. Sin dependencias externas.
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function loadLayout(path) {
  const p = path ?? join(__dirname, '..', 'config', 'layout.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

const M = 'dtmi:com:apextwin:smartpark';
export const MODELS = {
  lot: `${M}:ParkingLot;1`,
  level: `${M}:ParkingLevel;1`,
  zone: `${M}:ParkingZone;1`,
  space: `${M}:ParkingSpace;1`,
  smoke: `${M}:SmokeDetector;1`,
  access: `${M}:AccessPoint;1`,
  ramp: `${M}:Ramp;1`,
  lighting: `${M}:LightingZone;1`,
  luminosity: `${M}:LuminositySensor;1`,
};

const pad2 = (n) => String(n).padStart(2, '0');

// Devuelve un modelo plano: { lot, levels[], zones[], spaces[], smokeDetectors[],
// accessPoints[], ramps[], lightingZones[], luminositySensors[], relationships[] }
export function buildModel(layout) {
  const L = layout ?? loadLayout();
  const out = {
    lot: null, levels: [], zones: [], spaces: [],
    smokeDetectors: [], accessPoints: [], ramps: [],
    lightingZones: [], luminositySensors: [], relationships: [],
  };

  const { spacesPerZone: sp, spaceTypes: st } = L;
  let globalSpaceIndex = 0;

  out.lot = {
    dtId: L.lot.dtId, model: MODELS.lot,
    props: { displayName: L.lot.displayName, address: L.lot.address, totalSpaces: 0, occupiedSpaces: 0, occupancyRate: 0 },
    geometry: L.lot.geometry,
  };

  for (const lvl of L.levels) {
    const levelId = `LEVEL-${lvl.levelNumber}`;
    const level = {
      dtId: levelId, model: MODELS.level, y: lvl.y,
      props: { levelNumber: lvl.levelNumber, name: lvl.name, totalSpaces: 0, occupiedSpaces: 0, occupancyRate: 0 },
      geometry: { width: L.lot.geometry.width, depth: L.lot.geometry.depth },
    };
    out.levels.push(level);
    out.relationships.push({ source: L.lot.dtId, name: 'hasLevel', target: levelId });

    // Zonas del nivel
    for (const z of L.zonesPerLevel) {
      const zoneId = `ZONE-L${lvl.levelNumber}-${z.code}`;
      const zone = {
        dtId: zoneId, model: MODELS.zone, levelNumber: lvl.levelNumber, code: z.code,
        originX: z.originX, originZ: z.originZ, y: lvl.y,
        props: {
          code: z.code, totalSpaces: 0, occupiedSpaces: 0, occupancyRate: 0, congestionLevel: 'Low',
          entriesLastInterval: 0, exitsLastInterval: 0, netFlow: 0,
          avgOccupancyRate: 0, occupancyTrend: 'Stable', lowOccupancy: false,
        },
        bounds: null,
      };
      out.zones.push(zone);
      out.relationships.push({ source: levelId, name: 'hasZone', target: zoneId });

      // Plazas de la zona (grid rows x cols)
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let n = 0;
      for (let r = 0; r < sp.rows; r++) {
        for (let c = 0; c < sp.cols; c++) {
          n++;
          globalSpaceIndex++;
          const code = `${z.code}${pad2(n)}`;
          const spaceId = `SPACE-L${lvl.levelNumber}-${code}`;
          const x = z.originX + c * (sp.spaceW + sp.gap) + sp.spaceW / 2;
          const zz = z.originZ + r * (sp.spaceD + sp.aisle) + sp.spaceD / 2;
          let type = 'Regular';
          if (globalSpaceIndex % st.disabledEvery === 0) type = 'Disabled';
          else if (globalSpaceIndex % st.evEvery === 0) type = 'EV';
          out.spaces.push({
            dtId: spaceId, model: MODELS.space, zoneId, levelNumber: lvl.levelNumber,
            x, y: lvl.y + 0.12, z: zz, w: sp.spaceW, d: sp.spaceD,
            props: { code, occupancyState: 'Free', spaceType: type, lastUpdated: new Date().toISOString() },
          });
          out.relationships.push({ source: zoneId, name: 'hasSpace', target: spaceId });
          minX = Math.min(minX, x - sp.spaceW / 2); maxX = Math.max(maxX, x + sp.spaceW / 2);
          minZ = Math.min(minZ, zz - sp.spaceD / 2); maxZ = Math.max(maxZ, zz + sp.spaceD / 2);
        }
      }
      zone.bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
      zone.props.totalSpaces = n;

      // Zona de iluminacion + sensor de luminosidad (1 por zona)
      if (L.sensors.lightingZonePerZone) {
        const lightId = `LIGHT-L${lvl.levelNumber}-${z.code}`;
        out.lightingZones.push({
          dtId: lightId, model: MODELS.lighting, zoneId,
          x: zone.bounds.cx, y: lvl.y + 0.05, z: zone.bounds.cz,
          w: zone.bounds.maxX - zone.bounds.minX + 0.4, d: zone.bounds.maxZ - zone.bounds.minZ + 0.4,
          props: { code: lightId, currentLevel: 100, recommendedLevel: 100, savingsPercent: 0, status: 'Optimal' },
        });
        out.relationships.push({ source: zoneId, name: 'hasLightingZone', target: lightId });

        if (L.sensors.luminositySensorPerZone) {
          const lumId = `LUMEN-L${lvl.levelNumber}-${z.code}`;
          out.luminositySensors.push({
            dtId: lumId, model: MODELS.luminosity, zoneId, lightId,
            x: zone.bounds.cx - 1.2, y: lvl.y + (L.lot.geometry.levelHeight - 0.6), z: zone.bounds.cz,
            props: { code: lumId, luminosity: 320, lastReading: new Date().toISOString() },
          });
          out.relationships.push({ source: lightId, name: 'monitoredBy', target: lumId });
        }
      }

      // Detector de humo por zona (relacionado al nivel)
      if (L.sensors.smokeDetectorPerZone) {
        const smokeId = `SMOKE-L${lvl.levelNumber}-${z.code}`;
        out.smokeDetectors.push({
          dtId: smokeId, model: MODELS.smoke, levelNumber: lvl.levelNumber, zoneId,
          x: zone.bounds.cx + 1.2, y: lvl.y + (L.lot.geometry.levelHeight - 0.6), z: zone.bounds.cz,
          props: { code: smokeId, smokeDetected: false, smokeLevel: 0, status: 'Normal', lastReading: new Date().toISOString() },
        });
        out.relationships.push({ source: levelId, name: 'hasSmokeDetector', target: smokeId });
      }
    }

    // Puntos de acceso por nivel
    let apIdx = 0;
    for (const ap of L.sensors.accessPointsPerLevel) {
      const apId = `ACCESS-L${lvl.levelNumber}-${ap.suffix}`;
      const edgeX = apIdx === 0 ? -L.lot.geometry.width / 2 + 2 : L.lot.geometry.width / 2 - 2;
      out.accessPoints.push({
        dtId: apId, model: MODELS.access, levelNumber: lvl.levelNumber,
        x: edgeX, y: lvl.y + 0.6, z: L.lot.geometry.depth / 2 - 2,
        props: { code: apId, type: ap.type, vehicleCount: 0, status: 'Open' },
      });
      out.relationships.push({ source: levelId, name: 'hasAccessPoint', target: apId });
      apIdx++;
    }
  }

  // Rampas entre niveles consecutivos
  if (L.sensors.rampPerLevelTransition) {
    for (let i = 0; i < L.levels.length - 1; i++) {
      const a = L.levels[i], b = L.levels[i + 1];
      const rampId = `RAMP-L${a.levelNumber}-L${b.levelNumber}`;
      out.ramps.push({
        dtId: rampId, model: MODELS.ramp, levelNumber: a.levelNumber,
        x: 0, y: (a.y + b.y) / 2 + 0.3, z: -L.lot.geometry.depth / 2 + 3,
        w: 5, d: 8,
        props: { code: rampId, connectsLevels: `${a.levelNumber}-${b.levelNumber}`, vehiclesPerMinute: 0, flowStatus: 'Normal' },
      });
      out.relationships.push({ source: `LEVEL-${a.levelNumber}`, name: 'hasRamp', target: rampId });
    }
  }

  // Totales del lote
  const total = out.spaces.length;
  out.lot.props.totalSpaces = total;
  for (const lvl of out.levels) {
    lvl.props.totalSpaces = out.spaces.filter((s) => s.levelNumber === lvl.props.levelNumber).length;
  }
  for (const z of out.zones) {
    z.props.totalSpaces = out.spaces.filter((s) => s.zoneId === z.dtId).length;
  }
  return out;
}

export function summarize(model) {
  return {
    lot: 1, levels: model.levels.length, zones: model.zones.length, spaces: model.spaces.length,
    smokeDetectors: model.smokeDetectors.length, accessPoints: model.accessPoints.length,
    ramps: model.ramps.length, lightingZones: model.lightingZones.length,
    luminositySensors: model.luminositySensors.length, relationships: model.relationships.length,
    totalTwins: 1 + model.levels.length + model.zones.length + model.spaces.length +
      model.smokeDetectors.length + model.accessPoints.length + model.ramps.length +
      model.lightingZones.length + model.luminositySensors.length,
  };
}
