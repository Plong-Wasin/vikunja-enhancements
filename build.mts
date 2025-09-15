import { build, context } from 'esbuild';
import { readFileSync, readdirSync, existsSync } from 'fs';
import path from 'path';

const scriptsDir = 'scripts';
const scripts = readdirSync(scriptsDir);
const useWatch = process.argv.includes('--watch');

for (const script of scripts) {
    const scriptPath = path.join(scriptsDir, script);
    const metaPath = path.join(scriptPath, 'meta.json');
    const entry = path.join(scriptPath, 'main.ts');

    if (!existsSync(metaPath) || !existsSync(entry)) {
        continue;
    }

    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));

    const header = `// ==UserScript==
// @name         ${meta.name}
// @namespace    ${meta.namespace}
// @version      ${meta.version}
// @description  ${meta.description}
// @author       ${meta.author || ''}
${meta.match.map((m: string) => `// @match        ${m}`).join('\n')}
${meta.grant.map((g: string) => `// @grant        ${g}`).join('\n')}
${meta.updateURL ? `// @updateURL    ${meta.updateURL}` : ''}
${meta.downloadURL ? `// @downloadURL  ${meta.downloadURL}` : ''}
// ==/UserScript==`;

    if (useWatch) {
        // ใช้ context + watch mode
        const ctx = await context({
            entryPoints: [entry],
            bundle: true,
            outfile: `${script}.user.js`,
            banner: { js: header },
            platform: 'browser',
            target: 'es2020',
            format: 'iife'
        });
        await ctx.watch();
        console.log(`👀 Watching ${script} (v${meta.version})`);
    } else {
        // build แบบปกติ
        await build({
            entryPoints: [entry],
            bundle: true,
            outfile: `${script}.user.js`,
            banner: { js: header },
            platform: 'browser',
            target: 'es2020',
            format: 'iife'
        });
        console.log(`✅ Built ${script} (v${meta.version})`);
    }
}
