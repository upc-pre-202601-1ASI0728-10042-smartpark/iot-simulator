// ============================================================================
// 03-seed-graph.mjs  —  Siembra (o borra) el grafo de twins en Azure Digital Twins
// ----------------------------------------------------------------------------
// Crea los 56 twins y sus 55 relaciones derivados de config/layout.json.
// Idempotente: usa upsert, asi que puedes re-ejecutarlo sin duplicar.
//
//   npm run seed          # crea/actualiza el grafo
//   npm run seed:delete   # borra todos los twins del grafo (limpieza)
//
// Requisitos: haber subido la ontologia (02-upload-models.ps1) y tener
// ADT_HOST_NAME en .env + rol "Azure Digital Twins Data Owner".
// ============================================================================

import { getAdtClient, twinBody } from '../lib/adt-client.mjs';
import { buildModel, summarize } from '../lib/layout-builder.mjs';

const DELETE = process.argv.includes('--delete');
const client = getAdtClient();
const model = buildModel();

function allTwins() {
  return [
    twinFor(model.lot),
    ...model.levels.map(twinFor),
    ...model.zones.map(twinFor),
    ...model.spaces.map(twinFor),
    ...model.smokeDetectors.map(twinFor),
    ...model.accessPoints.map(twinFor),
    ...model.ramps.map(twinFor),
    ...model.lightingZones.map(twinFor),
    ...model.luminositySensors.map(twinFor),
  ];
}
function twinFor(t) { return { dtId: t.dtId, body: twinBody(t.model, t.props) }; }

async function seed() {
  console.log('Sembrando grafo SmartPark...', summarize(model));
  const twins = allTwins();

  let created = 0;
  for (const t of twins) {
    await client.upsertDigitalTwin(t.dtId, JSON.stringify(t.body));
    created++;
    if (created % 10 === 0) console.log(`  twins: ${created}/${twins.length}`);
  }
  console.log(`  twins OK: ${created}`);

  let rels = 0;
  for (const r of model.relationships) {
    const relId = `${r.source}__${r.name}__${r.target}`;
    await client.upsertRelationship(
      r.source, relId,
      { $relationshipId: relId, $sourceId: r.source, $relationshipName: r.name, $targetId: r.target }
    );
    rels++;
    if (rels % 15 === 0) console.log(`  relaciones: ${rels}/${model.relationships.length}`);
  }
  console.log(`  relaciones OK: ${rels}`);
  console.log('Listo. Abre Azure Digital Twins Explorer y ejecuta:  SELECT * FROM digitaltwins');
}

async function wipe() {
  console.log('Borrando grafo SmartPark...');
  const twins = allTwins();
  // 1) borrar relaciones salientes e incidentes de cada twin
  for (const t of twins) {
    for await (const rel of client.listRelationships(t.dtId)) {
      await client.deleteRelationship(t.dtId, rel.$relationshipId);
    }
    for await (const inc of client.listIncomingRelationships(t.dtId)) {
      await client.deleteRelationship(inc.$sourceId, inc.$relationshipId);
    }
  }
  // 2) borrar twins
  let n = 0;
  for (const t of twins) {
    try { await client.deleteDigitalTwin(t.dtId); n++; } catch (e) { /* ya no existe */ }
  }
  console.log(`  twins borrados: ${n}`);
}

(DELETE ? wipe() : seed()).catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
