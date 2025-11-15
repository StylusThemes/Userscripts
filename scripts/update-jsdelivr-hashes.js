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
// Helper function to get all files recursively
// -----------------------------
async function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = await fs.readdir(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = await fs.stat(fullPath);
    if (stat.isDirectory()) {
      await getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath);
    }
  }
  return arrayOfFiles;
}

// -----------------------------
// Main function
// -----------------------------
async function updateJsdelivrHashes() {
  try {
    // Get all lib files
    const libsDirectory = path.join(root, 'libs');
    const allLibFiles = await getAllFiles(libsDirectory);

    // Get all userscript files
    const userscriptFiles = await fs.readdir(userscriptsDirectory);
    const jsFiles = userscriptFiles.filter(file => file.endsWith('.user.js'));

    for (const libFile of allLibFiles) {
      const relativePath = path.relative(root, libFile); // e.g., libs/utils/utils.min.js

      // Get the last commit hash for this file
      const lastCommit = execSync(`git log -1 --format=%H -- "${relativePath}"`, { encoding: 'utf8' }).trim();
      console.log(`Last commit for ${relativePath}: ${lastCommit}`);

      const escapedPath = relativePath.replace(/\./g, '\\.');

      // Regex to match the @require line for this file, only if commit hash is present
      const regex = new RegExp(`(@require\\s+https://cdn\\.jsdelivr\\.net/gh/StylusThemes/Userscripts@)[a-f0-9]{40}(/${escapedPath})`, 'g');

      for (const jsFile of jsFiles) {
        const filePath = path.join(userscriptsDirectory, jsFile);
        const content = await fs.readFile(filePath, 'utf8');

        if (regex.test(content)) {
          // Replace the commit hash
          const updatedContent = content.replace(regex, `$1${lastCommit}$2`);
          await fs.writeFile(filePath, updatedContent, 'utf8');
          console.log(`Updated ${jsFile} for ${relativePath}`);
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
