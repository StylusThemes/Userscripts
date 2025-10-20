import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { minify } from "terser";
import { js as jsBeautify } from "js-beautify";

// -----------------------------
// Config
// -----------------------------
const beautifyOptions = {
  indent_size: 2,
  indent_char: " ",
  max_preserve_newlines: 5,
  preserve_newlines: true,
  keep_array_indentation: true,
  break_chained_methods: false,
  indent_scripts: "normal",
  brace_style: "collapse,preserve-inline",
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
  format: { comments: false },
};

// -----------------------------
// Paths
// -----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const libsDirectory = path.join(root, "libs");
const userscriptsDirectory = path.join(root, "userscripts");

// -----------------------------
// Utilities
// -----------------------------
const isJsFile = (name) => name.endsWith(".js") && !name.endsWith(".min.js");

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
  if (!lines[0]?.trim().startsWith("// ==UserScript==")) return { header: "", body: content };

  const headerLines = [];
  let index = 0;
  for (; index < lines.length; index++) {
    headerLines.push(lines[index]);
    if (lines[index].trim().startsWith("// ==/UserScript==")) {
      index++;
      break;
    }
  }
  return { header: headerLines.join("\n"), body: lines.slice(index).join("\n") };
}

function normalizeEnding(content) {
  return content.endsWith("\n") ? content : content + "\n";
}

// -----------------------------
// JS Processing
// -----------------------------
async function formatSource(file) {
  const source = await fs.readFile(file, "utf8");
  const { header, body } = extractHeader(source);
  const beautifiedBody = jsBeautify(body, beautifyOptions);
  const out = (header ? header + "\n\n" : "") + beautifiedBody;
  const finalOut = normalizeEnding(out);

  if (finalOut !== source) {
    await fs.writeFile(file, finalOut, "utf8");
    // eslint-disable-next-line no-console
    console.log(`Formatted: ${path.relative(root, file)}`);
    return true;
  }
  // eslint-disable-next-line no-console
  console.log(`Unchanged format: ${path.relative(root, file)}`);
  return false;
}

async function ensureMinified(file) {
  const source = await fs.readFile(file, "utf8");
  const { header, body } = extractHeader(source);
  const beautifiedBody = jsBeautify(body, beautifyOptions);
  const result = await minify(beautifiedBody, terserOptions);
  if (!result?.code) throw new Error(`Terser failed for ${file}`);

  const out = (header ? header + "\n\n" : "") + result.code;
  const finalOut = normalizeEnding(out);
  const outPath = file.replace(/\.js$/, ".min.js");

  try {
    const existing = await fs.readFile(outPath, "utf8");
    if (existing === finalOut) {
      // eslint-disable-next-line no-console
      console.log(`Unchanged: ${path.relative(root, outPath)}`);
      return;
    }
  } catch {} // File doesn't exist, will write

  await fs.writeFile(outPath, finalOut, "utf8");
  // eslint-disable-next-line no-console
  console.log(`Wrote: ${path.relative(root, outPath)}`);
}

async function validateWithTerser(file) {
  const source = await fs.readFile(file, "utf8");
  const { body } = extractHeader(source);
  try {
    const beautified = jsBeautify(body, beautifyOptions);
    const r = await minify(beautified, { module: true, mangle: false, compress: false });
    if (!r?.code) throw new Error("No output from terser");
    // eslint-disable-next-line no-console
    console.log(`Valid: ${path.relative(root, file)}`);
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Terser error for ${path.relative(root, file)}:`, error.message || error);
    return false;
  }
}

// -----------------------------
// Main
// -----------------------------
async function main() {
  try {
    const files = await walk(libsDirectory);
    if (!files.length) {
      // eslint-disable-next-line no-console
      console.log("No JS source files found under libs/");
    }

    let hadError = false;

    for (const f of files) {
      await formatSource(f);
      if (!(await validateWithTerser(f))) hadError = true;
      await ensureMinified(f);
    }

    // Process userscripts without minifying
    try {
      const userFiles = await walk(userscriptsDirectory);
      for (const uf of userFiles) {
        await formatSource(uf);
        if (!(await validateWithTerser(uf))) hadError = true;
      }
    } catch {} // userscripts/ may not exist

    if (hadError) process.exitCode = 2;
    // eslint-disable-next-line no-console
    console.log("Build complete.");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith("build.js")) main();
