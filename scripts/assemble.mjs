import {mkdirSync,copyFileSync} from "node:fs";
mkdirSync("dist",{recursive:true});
for(const [a,b] of [["novel-plugin/dist/index.js","index.js"],["novel-plugin/dist/client.js","client.js"],["sf-plugin/dist/index.js","sf.js"]]) copyFileSync(`packages/${a}`,`dist/${b}`);
import {createRequire} from 'node:module';
const require=createRequire(new URL('../packages/novel-plugin/package.json',import.meta.url));
await require('esbuild').build({entryPoints:['src/setup-demo.ts'],outfile:'dist/setup-demo.js',bundle:true,platform:'node',target:'node22',format:'esm',banner:{js:'import {createRequire as __demoRequire} from "node:module"; const require=__demoRequire(import.meta.url);'}});
