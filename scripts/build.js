import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify } from 'terser';
import { js as jsBeautify } from 'js-beautify';

// -----------------------------
// Config
// -----------------------------
const beautifyOptions = {
  indent_size: 2,
  indent_char: ' ',
  quote_style: 'single',
  max_preserve_newlines: 5,
  preserve_newlines: true,
  keep_array_indentation: true,
  break_chained_methods: false,
  indent_scripts: 'normal',
  brace_style: 'collapse,preserve-inline',
  space_before_conditional: true,
  unescape_strings: false,
  jslint_happy: false,
  end_with_newline: true,
  wrap_line_length: 0,
  indent_inner_html: false,
  comma_first: false,
  e4x: false,
  indent_empty_lines: false,
};

const terserOptions = {
  module: true,
  mangle: false,
  compress: false,
  format: { comments: false, quote_style: 1 },
};

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
const isJsFile = (name) => name.endsWith('.js') && !name.endsWith('.min.js');

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const ent of entries) {
    const full = path.join(directory, ent.name);
    if (ent.isDirectory()) files.push(...(await walk(full)));
    else if (ent.isFile() && isJsFile(ent.name)) files.push(full);
  }
  return files;
}

function extractHeader(content) {
  const lines = content.split(/\r?\n/);
  if (!lines[0]?.trim().startsWith('// ==UserScript==')) return { header: '', body: content };

  const headerLines = [];
  let index = 0;
  for (; index < lines.length; index++) {
    headerLines.push(lines[index]);
    if (lines[index].trim().startsWith('// ==/UserScript==')) {
      index++;
      break;
    }
  }
  return { header: headerLines.join('\n'), body: lines.slice(index).join('\n') };
}

function normalizeEnding(content) {
  return content.endsWith('\n') ? content : content + '\n';
}

// -----------------------------
// Pipeline
// -----------------------------
async function processFile(file, options = {}) {
  const { shouldMinify = false } = options;
  const source = await fs.readFile(file, 'utf8');
  const { header, body } = extractHeader(source);
  const beautifiedBody = jsBeautify(body, beautifyOptions);

  // Validate with terser (parse-only via compress: false / mangle: false)
  let valid = false;
  try {
    const r = await minify(beautifiedBody, terserOptions);
    if (!r?.code) throw new Error('No output from terser');
    valid = true;
  } catch (error) {
    console.error(`Terser error for ${path.relative(root, file)}:`, error.message || error);
  }

  // Write formatted source if it changed
  const out = (header ? header + '\n\n' : '') + beautifiedBody;
  const finalOut = normalizeEnding(out);
  let changed = false;

  if (finalOut !== source) {
    await fs.writeFile(file, finalOut, 'utf8');
    changed = true;
    console.log(`Formatted: ${path.relative(root, file)}`);
  } else {
    console.log(`Unchanged: ${path.relative(root, file)}`);
  }

  // Write minified version if needed
  if (shouldMinify) {
    const result = await minify(beautifiedBody, terserOptions);
    if (!result?.code) throw new Error(`Terser failed for ${file}`);
    const minified = (header ? header + '\n\n' : '') + result.code;
    const finalMinified = normalizeEnding(minified);
    const outPath = file.replace(/\.js$/, '.min.js');

    let minChanged = true;
    try {
      const existing = await fs.readFile(outPath, 'utf8');
      if (existing === finalMinified) minChanged = false;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    if (minChanged) {
      await fs.writeFile(outPath, finalMinified, 'utf8');
      console.log(`Wrote: ${path.relative(root, outPath)}`);
    } else {
      console.log(`Unchanged: ${path.relative(root, outPath)}`);
    }
  }

  return { changed, valid, error: valid ? null : 'Validation failed' };
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  try {
    const libs = await walk(libsDirectory);
    if (!libs.length) console.log('No JS source files found under libs/');

    let userFiles = [];
    try {
      userFiles = await walk(userscriptsDirectory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    const libResults = await Promise.allSettled(
      libs.map(f => processFile(f, { shouldMinify: true }))
    );

    const userResults = await Promise.allSettled(
      userFiles.map(f => processFile(f, { shouldMinify: false }))
    );

    const libsChanged = libResults.filter(
      r => r.status === 'fulfilled' && r.value.changed
    ).length;

    const libErrors = libResults.filter(
      r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.valid)
    );

    const userErrors = userResults.filter(
      r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.valid)
    );

    for (const r of [...libResults, ...userResults]) {
      if (r.status === 'rejected') console.error('Build error:', r.reason);
    }

    console.log(
      `Built ${libs.length} lib${libs.length !== 1 ? 's' : ''} (${libsChanged} changed), ` +
      `validated ${userFiles.length} userscript${userFiles.length !== 1 ? 's' : ''}.`
    );

    const hasValidationFailures = libErrors.length > 0 || userErrors.length > 0;
    const hasHardErrors = [...libResults, ...userResults].some(r => r.status === 'rejected');

    if (hasHardErrors) {
      process.exitCode = 1;
    } else if (hasValidationFailures) {
      process.exitCode = 2;
    }

    console.log('Build complete.');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

if (path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) main();
