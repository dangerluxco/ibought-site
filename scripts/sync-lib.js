// Copies the app's pure helpers (links, dates, the order-file parser) into the
// website so both build share links and read files the same way. Source of
// truth: ../ibought-app/utils/*.ts. Output is committed, so the site still
// builds without the app repo next to it.
const fs = require('fs');
const path = require('path');

const appRepo = path.join(__dirname, '..', '..', 'ibought-app');
if (!fs.existsSync(appRepo)) {
  console.log('ibought-app not found next to this repo; keeping the committed src/generated files.');
  process.exit(0);
}
const ts = require(path.join(appRepo, 'node_modules', 'typescript'));

for (const name of ['amazon', 'csv']) {
  const src = fs.readFileSync(path.join(appRepo, 'utils', name + '.ts'), 'utf8');
  let out = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  out = out.replace(/from '\.\/amazon'/g, "from './amazon.js'");
  fs.writeFileSync(
    path.join(__dirname, '..', 'src', 'generated', name + '.js'),
    '// GENERATED from ibought-app/utils/' + name + '.ts by scripts/sync-lib.js. Do not edit.\n' + out,
  );
  console.log('synced', name);
}
