// The palettes have one source, src/palettes/palettes.json: this writes the Flutter SDK's copy from it, next to this repository.
// Run it after changing a palette: node scripts/palettes-to-dart.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const palettes = JSON.parse(readFileSync(resolve(root, 'src/palettes/palettes.json'), 'utf8'));
const color = (hex) => `Color(0xFF${hex.slice(1).toUpperCase()})`;
const text = (value) => `'${value.replaceAll("'", "\\'")}'`;

const entries = palettes.map((p) => `  AgGraphPalette(
    id: ${text(p.id)},
    category: ${text(p.category)},
    name: ${text(p.name)},
    suits: AgGraphPaletteSuits.${p.suits},
    groups: [${p.groups.map(color).join(', ')}],
    steps: AgGraphPaletteSteps(start: ${color(p.steps.start)}, decision: ${color(p.steps.decision)}, human: ${color(p.steps.human)}, ai: ${color(p.steps.ai)}, action: ${color(p.steps.action)}, end: ${color(p.steps.end)}),
    states: AgGraphPaletteStates(working: ${color(p.states.working)}, waiting: ${color(p.states.waiting)}, done: ${color(p.states.done)}, failed: ${color(p.states.failed)}),
  ),`);

const dart = `// Written by agentivity_sdk_react/scripts/palettes-to-dart.mjs from src/palettes/palettes.json: do not change it here.
import 'package:flutter/painting.dart';

import 'ag_graph_palette.dart';

/// The palettes that come with the SDK.
const List<AgGraphPalette> agGraphPalettes = [
${entries.join('\n')}
];
`;

const out = resolve(root, '../agentivity_sdk_flutter/lib/src/palettes/ag_graph_palettes_data.dart');
writeFileSync(out, dart);
console.log(`${palettes.length} palettes written to ${out}`);
