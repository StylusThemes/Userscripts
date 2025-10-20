import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

// -----------------------------
// Paths
// -----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const userscriptsDirectory = path.join(root, "userscripts");

// -----------------------------
// Main function
// -----------------------------
async function updateJsdelivrHashes() {
  try {
    // Get current commit hash
    const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    console.log(`Current commit: ${currentCommit}`);

    // Get changed files in the last commit
    const changedFilesOutput = execSync('git diff --name-only HEAD~1..HEAD', { encoding: 'utf8' });
    const changedFiles = changedFilesOutput.split('\n').filter(line => line.trim() !== '');
    console.log(`Changed files: ${changedFiles.join(', ')}`);

    // Filter files in libs/
    const libsChangedFiles = changedFiles.filter(file => file.startsWith('libs/'));

    if (libsChangedFiles.length === 0) {
      console.log('No libs files changed in the last commit. Nothing to update.');
      return;
    }

    // Get all userscript files
    const userscriptFiles = await fs.readdir(userscriptsDirectory);
    const jsFiles = userscriptFiles.filter(file => file.endsWith('.user.js'));

    for (const libFile of libsChangedFiles) {
      const relativePath = libFile; // e.g., libs/utils/utils.min.js
      const escapedPath = relativePath.replace(/\./g, '\\.');

      // Regex to match the @require line for this file, only if commit hash is present
      const regex = new RegExp(`(@require\\s+https://cdn\\.jsdelivr\\.net/gh/StylusThemes/Userscripts@)[a-f0-9]{40}(/${escapedPath})`, 'g');

      for (const jsFile of jsFiles) {
        const filePath = path.join(userscriptsDirectory, jsFile);
        const content = await fs.readFile(filePath, 'utf8');

        if (regex.test(content)) {
          // Replace the commit hash
          const updatedContent = content.replace(regex, `$1${currentCommit}$2`);
          await fs.writeFile(filePath, updatedContent, 'utf8');
          console.log(`Updated ${jsFile} for ${libFile}`);
        }
      }
    }

    console.log('Update complete.');
  } catch (error) {
    console.error('Error updating jsdelivr hashes:', error.message);
    process.exit(1);
  }
}

// Run the function
updateJsdelivrHashes();
