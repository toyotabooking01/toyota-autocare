// Keep browser-safe ESM as the source of truth. Commit the generated CJS files
// so serverless deployments need no build step or synchronous ESM support.
const fs = require('node:fs');
const path = require('node:path');

const sources = [
  'shared/accountValidation.mjs',
  'shared/vehicleYearRules.mjs',
  'shared/serviceBayName.mjs',
  'server/utils/formValidation.mjs',
];
const root = path.resolve(__dirname, '../..');

function generatedModules() {
  return sources.map(source => {
    const original = fs.readFileSync(path.join(root, source), 'utf8').replace(/\r\n/g, '\n');
    const names = [...original.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1]);
    const body = original
      .replace(/^import \{([^}]+)\} from '([^']+)'.*$/gm,
        (_, names, dependency) => `const {${names}} = require('${dependency.replace(/\.mjs$/, '.cjs')}');`)
      .replace(/^export (?=const |function )/gm, '');
    if (/^(?:import|export) /m.test(body)) throw new Error(`Unsupported module syntax in ${source}`);
    return {
      file: path.join(root, source.replace(/\.mjs$/, '.cjs')),
      content: `// Generated from ${source}; do not edit.\n// Regenerate: node server/scripts/generate-validation-cjs.js\n${body.trimEnd()}\n\nmodule.exports = { ${names.join(', ')} };\n`,
    };
  });
}

if (require.main === module) {
  for (const { file, content } of generatedModules()) fs.writeFileSync(file, content);
}

module.exports = { generatedModules };
