const fs = require('fs');
const path = require('path');

const root = process.cwd();
const sourceDir = path.join(root, 'google-apps-script', 'roster-manager');
const outputFile = path.join(root, 'app', 'admin', 'google-workspace', 'roster-manager-script-template.ts');

const required = [
  ['Code.gs', 'Code', 'SERVER_JS'],
  ['PaperEntry.gs', 'PaperEntry', 'SERVER_JS'],
  ['Sidebar.html', 'Sidebar', 'HTML'],
  ['appsscript.json', 'appsscript', 'JSON'],
];

for (const [fileName] of required) {
  if (!fs.existsSync(path.join(sourceDir, fileName))) {
    console.error(`Missing ${path.join(sourceDir, fileName)}. No changes made.`);
    process.exit(1);
  }
}

const files = required.map(([fileName, name, type]) => ({
  name,
  type,
  source: fs.readFileSync(path.join(sourceDir, fileName), 'utf8'),
}));

const content = `// Generated from google-apps-script/roster-manager. Re-run the generator after Apps Script source changes.\n` +
  `export const rosterManagerScriptFiles = ${JSON.stringify(files, null, 2)} as const;\n`;

fs.writeFileSync(outputFile, content, 'utf8');
console.log('Generated app/admin/google-workspace/roster-manager-script-template.ts');
