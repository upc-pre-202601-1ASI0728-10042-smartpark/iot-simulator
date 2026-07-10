import { buildModel } from '../lib/layout-builder.mjs';
import { writeFileSync } from 'fs';
const twinBody = (modelId, props) => ({ $metadata: { $model: modelId }, ...props });
const model = buildModel();
const twinFor = t => ({ dtId: t.dtId, body: twinBody(t.model, t.props) });
const twins = [
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
const relationships = model.relationships.map(r => ({
  source: r.source, name: r.name, target: r.target,
  relId: `${r.source}__${r.name}__${r.target}`,
}));
const out = process.env.OUT || 'graph.json';
writeFileSync(out, JSON.stringify({ twins, relationships }));
console.log('dumped', twins.length, 'twins,', relationships.length, 'rels ->', out);
// muestra props de una plaza y una zona
const sp = model.spaces[0], zn = model.zones[0];
console.log('space props keys:', Object.keys(sp.props), '| sample:', JSON.stringify(sp.props));
console.log('zone  props keys:', Object.keys(zn.props), '| sample:', JSON.stringify(zn.props));
