// ============================================================================
// energy-advisor.mjs  —  Zonas de baja ocupacion para eficiencia energetica
// ----------------------------------------------------------------------------
// Consulta el grafo de twins y deriva, por zona, la recomendacion de atenuacion
// de iluminacion a partir de la TENDENCIA de ocupacion (media movil + bandera de
// baja ocupacion sostenida) que emite el simulador (Sprint 2). Es el mismo
// criterio que consume el endpoint /api/v1/energy/recommendations del backend,
// expuesto aqui como utilidad de linea de comandos para operadores.
//
//   npm run advise
//
// Salida: tabla de zonas con tendencia + nivel de luz recomendado + ahorro,
// y el total de energia de iluminacion que se ahorraria atenuando las zonas
// de baja ocupacion sostenida.
// ============================================================================
import { getAdtClient } from '../lib/adt-client.mjs';

const client = getAdtClient();
const M = 'dtmi:com:apextwin:smartpark';

// Mismo criterio que tickEnergy del simulador: decision estable por tendencia.
function recommend(avg, low) {
  return low ? 30 : avg < 0.2 ? 40 : avg < 0.5 ? 70 : 100;
}

async function main() {
  const zones = [];
  for await (const z of client.queryTwins(
    `SELECT * FROM digitaltwins T WHERE IS_OF_MODEL(T, '${M}:ParkingZone;1')`
  )) {
    zones.push(z);
  }
  if (zones.length === 0) {
    console.log('Grafo vacio o sin zonas: ejecuta `npm run seed` y `npm run simulate`.');
    return;
  }

  zones.sort((a, b) => (a.$dtId < b.$dtId ? -1 : 1));
  console.log('Asesor de eficiencia energetica — zonas de estacionamiento\n');
  console.log('  ZONA           OCUP%  MEDIA%  TENDENCIA  BAJA?  LUZ_REC  AHORRO%');
  console.log('  ' + '-'.repeat(66));

  let dimmable = 0, savedPct = 0;
  for (const z of zones) {
    const rate = Math.round((z.occupancyRate ?? 0) * 100);
    const avg = z.avgOccupancyRate ?? z.occupancyRate ?? 0;
    const low = z.lowOccupancy === true;
    const trend = z.occupancyTrend ?? 'Stable';
    const rec = recommend(avg, low);
    const savings = Math.max(0, Math.round((100 - rec) * 0.25));
    if (rec < 100) { dimmable++; savedPct += savings; }
    console.log(
      `  ${z.$dtId.padEnd(14)} ${String(rate).padStart(4)}  ${String(Math.round(avg * 100)).padStart(5)}  ` +
      `${trend.padEnd(9)}  ${(low ? 'SI' : 'no').padEnd(4)}  ${String(rec).padStart(6)}  ${String(savings).padStart(6)}`
    );
  }

  console.log('  ' + '-'.repeat(66));
  console.log(`\n  Zonas con atenuacion recomendada: ${dimmable}/${zones.length}`);
  console.log(`  Ahorro medio de iluminacion en zonas atenuables: ${dimmable ? Math.round(savedPct / dimmable) : 0}%`);
  const lowZones = zones.filter((z) => z.lowOccupancy === true).map((z) => z.$dtId);
  console.log(`  Zonas en baja ocupacion sostenida: ${lowZones.length ? lowZones.join(', ') : '(ninguna)'}`);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
