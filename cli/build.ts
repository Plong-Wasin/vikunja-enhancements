// scripts/build.ts
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as readline from 'readline';

const baseDir = path.resolve(__dirname, '../');
const userJsPath = path.join(baseDir, 'vikunja-enhanced-task-table.user.js');
const templateJsPath = path.join(baseDir, 'templates', 'vikunja-enhanced-task-table.user.js');
const compiledJsPath = path.join(baseDir, 'vikunja-enhanced-task-table.js');
const outputUserJsPath = path.join(baseDir, 'vikunja-enhanced-task-table.user.js');

function readFileSafe(p: string): string | null {
    try {
        return fs.readFileSync(p, 'utf8');
    } catch {
        return null;
    }
}

function getCurrentVersion(): { version: string; exists: boolean } {
    const content = readFileSafe(userJsPath);
    if (!content) return { version: '0.1.0', exists: false };
    const m = content.match(/@version\s+(\d+\.\d+\.\d+)/);
    return { version: m?.[1] ?? '0.1.0', exists: true };
}

function bumpMinor(version: string): string {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3) return '0.1.0';
    parts[1] += 1; // bump minor
    parts[2] = 0; // reset patch
    return parts.join('.');
}

function askValidVersion(current: string, suggested: string, showCurrent: boolean): Promise<string> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const semverRegex = /^\d+\.\d+\.\d+$/;

    function askLoop(): Promise<string> {
        return new Promise((resolve) => {
            rl.question(`Enter version (suggested: ${suggested}): `, (answer) => {
                const version = answer.trim() || suggested;
                if (!semverRegex.test(version)) {
                    console.log('❌ Invalid version format. Use x.y.z (e.g., 1.2.3).');
                    resolve(askLoop()); // ask again
                } else {
                    resolve(version);
                }
            });
        });
    }

    if (showCurrent) {
        console.log(`Current version: ${current}`);
    }
    return askLoop().finally(() => rl.close());
}

async function main() {
    const { version: currentVersion, exists } = getCurrentVersion();

    // ถ้าไฟล์ยังไม่มี suggested = 0.1.0, ถ้ามีไฟล์ suggested = bump minor
    const suggestedVersion = exists ? bumpMinor(currentVersion) : '0.1.0';

    const template = fs.readFileSync(templateJsPath, 'utf8');
    const version = await askValidVersion(currentVersion, suggestedVersion, exists);

    const replaced = template.replace(/{{\s*version\s*}}/g, version);

    execSync('npx tsc', { cwd: baseDir, stdio: 'inherit' });

    const compiledJs = fs.readFileSync(compiledJsPath, 'utf8');
    const finalContent = `${replaced}\n\n${compiledJs}`;
    fs.writeFileSync(outputUserJsPath, finalContent, 'utf8');

    console.log(`✅ Done: ${outputUserJsPath} (version ${version})`);
}

main().catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});
