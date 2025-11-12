#!/usr/bin/env bun

// Script to convert TRaSH Guide JSON URLs to regex patterns for release groups.
// Keeps full escaped regex fragments exactly as written, preserves order,
// doubles backslashes for output safety, and supports a --raw flag.

const args = process.argv.slice(2);
const url = args.find(a => !a.startsWith('--'));
const rawOutput = args.includes('--raw');

if (!url) {
    console.error('Usage: bun run trash-json-to-regex.js <url> [--raw]');
    process.exit(1);
}

// Convert GitHub blob URL to raw URL
function getRawUrl(blobUrl) {
    return blobUrl.replace('github.com', 'raw.githubusercontent.com').replace('/blob', '');
}

// Extract all subpatterns separated by unescaped |
function extractRegexParts(value) {
    if (typeof value !== 'string' || !value.trim()) return [];

    try {
        // Split on unescaped |, preserving everything else
        const parts = value.split(/(?<!\\)\|/).map(v => v.trim()).filter(Boolean);
        return parts;
    } catch {
        console.warn('Skipping malformed regex value:', value);
        return [];
    }
}

// Escape all single backslashes to double (for literal JSON-safe output)
function escapeBackslashes(str) {
    return str.replace(/\\/g, '\\\\');
}

// Process JSON and return either full combined regex or raw list
function processJson(json) {
    if (!json || !Array.isArray(json.specifications)) {
        console.error('Invalid TRaSH JSON format.');
        process.exit(1);
    }

    const specs = json.specifications.filter(spec =>
        spec.implementation === 'ReleaseGroupSpecification' ||
        spec.implementation === 'ReleaseTitleSpecification'
    );

    const seen = new Set();
    const ordered = [];

    for (const spec of specs) {
        const value = spec?.fields?.value;
        if (!value) continue;

        const parts = extractRegexParts(value);
        for (const part of parts) {
            if (!seen.has(part)) {
                seen.add(part);
                ordered.push(part);
            }
        }
    }

    // Escape backslashes for output
    const escaped = ordered.map(escapeBackslashes);

    if (rawOutput) {
        // Print each fragment on its own line
        console.log(escaped.join('\n'));
        return null;
    }

    // Join into single parenthesized regex
    return '(' + escaped.join('|') + ')';
}

// Main async runner
async function main() {
    const rawUrl = getRawUrl(url);

    try {
        const response = await fetch(rawUrl);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const json = await response.json();
        const regex = processJson(json);
        if (regex) console.log(regex);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

main();
