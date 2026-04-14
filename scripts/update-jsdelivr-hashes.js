import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

// -----------------------------
// Paths
// -----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const libsDirectory = path.join(root, 'libs');
const userscriptsDirectory = path.join(root, 'userscripts');

// -----------------------------
// Utilities
// -----------------------------
async function walk(directory, filter) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    const full = path.join(directory, ent.name);
    if (ent.isDirectory()) files.push(...(await walk(full, filter)));
    else if (ent.isFile() && (!filter || filter(ent.name))) files.push(full);
  }
  return files;
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  try {
    // Phase 1: Gather all .min.js files from libs/
    const libFiles = await walk(libsDirectory, (name) => name.endsWith('.min.js'));
    if (!libFiles.length) console.log('No .min.js files found under libs/');

    // Phase 2: Resolve git hashes in parallel
    const hashMap = new Map();
    const hashResults = await Promise.allSettled(
      libFiles.map(async (file) => {
        const relPath = path.relative(root, file).replace(/\\/g, '/');
        const { stdout } = await execFileAsync('git', ['log', '-1', '--format=%H', '--', relPath]);
        const hash = stdout.trim();
        if (!hash) throw new Error(`No commits found for ${relPath}`);
        return { path: relPath, hash };
      })
    );

    for (const r of hashResults) {
      if (r.status === 'fulfilled') {
        hashMap.set(r.value.path, r.value.hash);
        console.log(`Hash for ${r.value.path}: ${r.value.hash}`);
      } else {
        console.error('Git error:', r.reason.message);
      }
    }

    // Phase 3: Read each userscript ONCE and apply all replacements
    let userFiles = [];
    try {
      userFiles = await walk(userscriptsDirectory, (name) => name.endsWith('.user.js'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    // Single regex that matches ALL jsdelivr @require lines for this repo
    const REQUIRE_REGEX = /(\/\/ @require\s+https:\/\/cdn\.jsdelivr\.net\/gh\/StylusThemes\/Userscripts@)[a-f0-9]{40}(\/libs\/[^\s]+)/g;

    let updatedCount = 0;
    const fileResults = await Promise.allSettled(
      userFiles.map(async (userFile) => {
        const content = await fs.readFile(userFile, 'utf8');
        const updatedContent = content.replace(REQUIRE_REGEX, (match, prefix, libPath) => {
          const newHash = hashMap.get(libPath.slice(1)); // strip leading '/'
          return newHash ? `${prefix}${newHash}${libPath}` : match;
        });
        if (updatedContent !== content) {
          await fs.writeFile(userFile, updatedContent, 'utf8');
          const rel = path.relative(root, userFile);
          console.log(`Updated: ${rel}`);
          return { changed: true };
        }
        return { changed: false };
      })
    );

    for (const r of fileResults) {
      if (r.status === 'rejected') console.error('File error:', r.reason.message);
      else if (r.value.changed) updatedCount++;
    }

    const hardErrors = [...hashResults, ...fileResults].some(r => r.status === 'rejected');

    console.log(
      `Processed ${libFiles.length} lib${libFiles.length !== 1 ? 's' : ''}, ` +
      `updated ${updatedCount} of ${userFiles.length} userscript${userFiles.length !== 1 ? 's' : ''}.`
    );
    console.log('Update complete.');

    if (hardErrors) process.exitCode = 1;
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) main();
