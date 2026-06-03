// ============================================================================
// verify-graph.mjs  —  Comprobacion rapida del grafo (smoke test del setup)
//   npm run verify
// ============================================================================
import { getAdtClient } from '../lib/adt-client.mjs';

const client = getAdtClient();

async function count(query) {
  let n = 0;
  for await (const _ of client.queryTwins(query)) n++;
  return n;
}

try {
  const total = await count('SELECT * FROM digitaltwins');
  const spaces = await count("SELECT * FROM digitaltwins T WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:ParkingSpace;1')");
  const occupied = await count("SELECT * FROM digitaltwins T WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:ParkingSpace;1') AND T.occupancyState = 'Occupied'");
  const smoke = await count("SELECT * FROM digitaltwins T WHERE IS_OF_MODEL(T, 'dtmi:com:apextwin:smartpark:SmokeDetector;1') AND T.smokeDetected = true");
  console.log('Grafo SmartPark:');
  console.log('  twins totales :', total);
  console.log('  plazas        :', spaces);
  console.log('  plazas ocupadas:', occupied, `(${spaces ? Math.round((occupied / spaces) * 100) : 0}%)`);
  console.log('  detectores en alerta:', smoke);
  console.log(total > 0 ? 'OK ✔' : 'Grafo vacio: ejecuta `npm run seed`.');
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
