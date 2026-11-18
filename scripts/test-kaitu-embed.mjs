#!/usr/bin/env node
/* global console */
// Reuses the real host's discovery service, iframe route and CSS, not its Electron bundle.
import process from "node:process";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, mkdtemp, symlink, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { build } from "esbuild";

const plugin = resolve(import.meta.dirname, "..");
const hostArgument = process.argv[2];
if (!hostArgument || process.argv.length !== 3) throw new Error("Usage: node scripts/test-kaitu-embed.mjs /path/to/rensheng-kaitu-checkout");
if (Number(process.versions.node.split(".")[0]) < 24) throw new Error("Node 24.9+ is required");
const host = resolve(hostArgument);
const hostCommit = execFileSync("git", ["-C", host, "rev-parse", "HEAD"], {encoding:"utf8"}).trim();
const loader = await readFile(join(host, "packages/desktop/payload-loader.mjs"), "utf8");
const dshVersion = /export const DSH_VERSION = "([^"]+)"/u.exec(loader)?.[1];
if (!dshVersion) throw new Error("The host does not declare DSH_VERSION");
const sourceHashes = {};
for (const path of ["packages/desktop/plugins.mjs", "packages/dsh-plugin/src/client/ExplorePluginRoute.tsx", "packages/dsh-plugin/src/client/ExplorePluginEmbed.module.css"]) {
  sourceHashes[path] = createHash("sha256").update(await readFile(join(host,path))).digest("hex");
}
// Preserve the production Host's exact DSH dependency graph, replacing only the QA importer.
const hostLock = await readFile(join(host, "pnpm-lock.yaml"), "utf8");
const lockedDsh = / {6}'@deepseek-ai\/dsh':\n {8}specifier: ([^\n]+)\n {8}version: ([^\n]+)/u.exec(hostLock);
if (!lockedDsh || lockedDsh[1] !== dshVersion || !lockedDsh[2].startsWith(dshVersion)) throw new Error("Host lockfile DSH version does not match payload-loader");
const fixtureLock = hostLock.replace(/^importers:[\s\S]*?(?=^packages:)/mu,
  `importers:\n  .:\n    dependencies:\n      '@deepseek-ai/dsh':\n        specifier: ${dshVersion}\n        version: ${lockedDsh[2]}\n\n`);
if(fixtureLock===hostLock)throw new Error("Host lockfile importer boundary is unsupported");
const require = createRequire(import.meta.url);
const semverEntry = require.resolve("semver", {paths:[join(plugin,"node_modules/.pnpm/node_modules"),host,plugin]});
const qa = await mkdtemp(join(tmpdir(),"kaitu-embed-qa-"));
const redact = value => value.replace(/([?&]token=)[A-Za-z0-9_.-]+/gu,"$1[REDACTED]");
console.log(JSON.stringify({hostCommit,dshVersion,sourceHashes,scope:"production discovery + route + CSS in native DSH iframe; not full Electron app"}));
try {
await mkdir(join(qa,"route/lib"),{recursive:true});
await mkdir(join(qa,"home"));
await symlink(join(plugin,"node_modules"),join(qa,"node_modules"),process.platform==="win32"?"junction":"dir");
await writeFile(join(qa,"package.json"),'{"private":true,"type":"module"}\n');
const IFRAME_CHECK = `    {
      const { symlink } = await import('node:fs/promises');
      const { createPluginService } = await import('__SERVICE_MODULE__');
      const serviceHome=join(temporaryRoot,'host-service');
      await mkdir(join(serviceHome,'profiles'),{recursive:true});
      await symlink(join(dshHome,'profiles/web'),join(serviceHome,'profiles/desktop'));
      const service=createPluginService({home:serviceHome,archive:temporaryRoot,runtime:temporaryRoot,beforeChange:async()=>{},onChanged:async()=>{}});
      const discovered=service.explore().find((e)=>e.name==='kaitu-novel-workspace');
      if(discovered?.page!=='kaitu-novel') throw Error('Actual installed package lacks valid Explore metadata');
      const outer=createHttpServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><body style="margin:0"><script>window.events=[];addEventListener("message",e=>window.events.push(e.data))</script><iframe title="真实宿主嵌入" style="width:100vw;height:100vh;border:0"></iframe></body></html>')});
      await new Promise<void>(r=>outer.listen(0,'127.0.0.1',r));
      const outerAddress=outer.address(); if(!outerAddress||typeof outerAddress==='string')throw Error('missing outer address');
      const outerOrigin=\`http://127.0.0.1:\${outerAddress.port}\`;
      const target=await service.page('plugin:kaitu-novel-workspace',outerOrigin,async()=>({url:dshTokenUrl}));
      const browser=await chromium.launch({channel:browserChannel,headless:true});
      try {
        const context=await browser.newContext({viewport:{width:1440,height:1000}});
        const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
        await page.goto(outerOrigin);await page.locator('iframe').evaluate((e,url)=>{e.setAttribute('src',url)},target);
        const frame=page.frameLocator('iframe');
        for(let step=0;step<8;step++) {
          const next=frame.getByRole('button',{name:/^(?:Continue|继续|Configure later|稍后配置)$/u}).filter({visible:true}).first();
          try {await next.waitFor({state:'visible',timeout:2000});await next.click();await page.waitForTimeout(350);} catch {break;}
        }
        await frame.locator('[class*="onboardingOverlay"]').waitFor({state:'detached',timeout:15000});
        await frame.locator('[data-kaitu-novel-entry]').waitFor({state:'visible',timeout:30000});
        await frame.getByRole('textbox',{name:'作品目录路径'}).pressSequentially(storyRoot,{delay:15});
        await page.waitForTimeout(500);

        await frame.getByRole('button',{name:'打开',exact:true}).click();
        try { await frame.locator('.oh-story-editor').waitFor({state:'visible',timeout:30000}); } catch(error) {throw Error('Initial novel open failed: '+(await frame.locator('body').innerText()).slice(0,4000),{cause:error});}

        const hidden=await frame.locator('html').evaluate(e=>e.classList.contains('embedded'));if(!hidden)throw Error('Real host embed CSS not applied');
        await page.evaluate(origin=>{document.querySelector('iframe')!.contentWindow!.postMessage({type:'kaitu:explore-return'},origin)},new URL(target).origin);
        await frame.locator('[data-kaitu-novel-entry]').waitFor({state:'visible',timeout:15000});
        await page.evaluate(origin=>{document.querySelector('iframe')!.contentWindow!.postMessage({type:'kaitu:explore-conversation'},origin)},new URL(target).origin);
        await frame.locator('.oh-story-editor').waitFor({state:'visible',timeout:15000});
        const originalSession=await frame.locator('[data-conversation-content][data-conversation-session]').first().getAttribute('data-conversation-session');
        if(!originalSession)throw Error('Missing original native session');
        const savedRecent=await rpc<{entries:{id:string;path:string}[]}>(origin,'kaituNovelRecent/read',{});
        if(!savedRecent.entries.some(entry=>entry.id===originalSession))throw Error('Host did not persist the opened session: '+JSON.stringify(savedRecent));
        const bookBeforeReload=await snapshotSyntheticBook(storyRoot);
        const chatMarker='IFRAME_RELOAD：重载前的合成聊天线索，不修改作品。';
        await prepareSession(origin,originalSession,chatMarker);
        const catalogBeforeReload=await rpc<{items:{sessionId:string}[]}>(origin,'session/list',{_request:{}});
        await page.goto('about:blank');await page.goto(outerOrigin);
        await page.locator('iframe').evaluate((e,url)=>e.setAttribute('src',url),target);
        await frame.locator('[data-kaitu-novel-entry]').waitFor({state:'visible',timeout:30000});
        await frame.getByRole('navigation',{name:'最近打开的作品'}).getByRole('button').first().click({timeout:15000});
        await frame.locator('.oh-story-editor').waitFor({state:'visible',timeout:30000});
        const readSession=()=>frame.locator('[data-conversation-content][data-conversation-session]').first().getAttribute('data-conversation-session');
        if(await readSession()!==originalSession)throw Error('Iframe hard reload lost native session');
        await frame.getByText(chatMarker,{exact:true}).waitFor({state:'visible'});
        await page.evaluate(origin=>document.querySelector('iframe')!.contentWindow!.postMessage({type:'kaitu:explore-return'},origin),new URL(target).origin);
        await frame.getByRole('textbox',{name:'作品目录路径'}).fill(storyRoot);
        await frame.getByRole('button',{name:'打开',exact:true}).click();
        await frame.locator('.oh-story-editor').waitFor({state:'visible',timeout:30000});
        if(await readSession()!==originalSession)throw Error('Iframe same directory created another session after reload');
        const catalogAfterReload=await rpc<{items:{sessionId:string}[]}>(origin,'session/list',{_request:{}});
        if(JSON.stringify(catalogBeforeReload.items.map(x=>x.sessionId).sort())!==JSON.stringify(catalogAfterReload.items.map(x=>x.sessionId).sort()))throw Error('Iframe reload unexpectedly created a session');
        if(await snapshotSyntheticBook(storyRoot)!==bookBeforeReload)throw Error('Iframe reload changed manuscript');
        // Restart the actual isolated Host on another origin; no browser storage is copied.
        const events=await page.evaluate(()=>window['events']);
        await context.close();
        if(!child)throw Error('Missing isolated Host process');
        await stopDshProcess(child);
        let restartPort=String(await freePort());
        while(restartPort===new URL(origin).port)restartPort=String(await freePort());
        const restartOrigin='http://127.0.0.1:'+restartPort;
        const restartLogs:string[]=[];
        child=spawn(process.execPath,[dshBin,'web','--no-open','--port',restartPort],{cwd:repositoryRoot,env,stdio:['ignore','pipe','pipe']});
        child.stdout?.on('data',(chunk:Buffer)=>{restartLogs.push(chunk.toString('utf8'));logs.push(chunk.toString('utf8'));});
        child.stderr?.on('data',(chunk:Buffer)=>{restartLogs.push(chunk.toString('utf8'));logs.push(chunk.toString('utf8'));});
        const restartTokenUrl=await authorizeDsh(restartOrigin,restartLogs);
        const restartTarget=await service.page('plugin:kaitu-novel-workspace',outerOrigin,async()=>({url:restartTokenUrl}));
        const freshContext=await browser.newContext({viewport:{width:1440,height:1000}});
        const freshPage=await freshContext.newPage();freshPage.on('pageerror',e=>errors.push(e.message));
        await freshPage.goto(outerOrigin);
        await freshPage.locator('iframe').evaluate((e,url)=>e.setAttribute('src',url),restartTarget);
        const freshFrame=freshPage.frameLocator('iframe');
        await freshFrame.locator('[data-kaitu-novel-entry]').waitFor({state:'visible',timeout:30000});
        await freshFrame.getByRole('navigation',{name:'最近打开的作品'}).getByRole('button').first().click({timeout:15000});
        await freshFrame.locator('.oh-story-editor').waitFor({state:'visible',timeout:30000});
        const readRestartSession=()=>freshFrame.locator('[data-conversation-content][data-conversation-session]').first().getAttribute('data-conversation-session');
        if(await readRestartSession()!==originalSession)throw Error('Host restart/new origin lost original session identity');
        await freshFrame.getByText(chatMarker,{exact:true}).waitFor({state:'visible'});
        await freshPage.evaluate(origin=>document.querySelector('iframe')!.contentWindow!.postMessage({type:'kaitu:explore-return'},origin),new URL(restartTarget).origin);
        await freshFrame.getByRole('textbox',{name:'作品目录路径'}).fill(storyRoot);
        await freshFrame.getByRole('button',{name:'打开',exact:true}).click();
        await freshFrame.locator('.oh-story-editor').waitFor({state:'visible',timeout:30000});
        if(await readRestartSession()!==originalSession)throw Error('Same directory after Host restart created another session');
        const catalogAfterRestart=await rpc<{items:{sessionId:string}[]}>(restartOrigin,'session/list',{_request:{}});
        if(JSON.stringify(catalogBeforeReload.items.map(x=>x.sessionId).sort())!==JSON.stringify(catalogAfterRestart.items.map(x=>x.sessionId).sort()))throw Error('Host restart/resume unexpectedly created a session');
        if(await snapshotSyntheticBook(storyRoot)!==bookBeforeReload)throw Error('Host restart/resume changed manuscript');

        if(errors.length)throw Error('Browser errors: '+errors.join('\\n'));
        process.stdout.write(JSON.stringify({ok:true,dshVersion,hostCommit:'__HOST_COMMIT__',route:'unmodified-production-ExplorePluginRoute',metadata:'actual-installed-package',discovery:discovered,productionServicePage:true,iframe:true,syntheticBook:true,novelEditor:true,returnAndConversation:true,hardReloadSameSessionAndChat:true,hostRestartNewOriginFreshContext:true,noDuplicateSession:true,manuscriptUnchanged:true,embedCSS:true,navigationEvents:events,provider:'local-fixture',fullElectronApp:false})+'\\n');
      } finally {await browser.close();await new Promise<void>((r,j)=>outer.close(e=>e?j(e):r()))}
      return;
    }
`;
await writeFile(qa+'/route/package.json',JSON.stringify({name:'kaitu-host-route-qa',version:'0.0.0',private:true,type:'module',main:'./lib/index.js',exports:{'.':'./lib/index.js','./client':'./lib/client.js','./package.json':'./package.json'},dsh:{client:{platform:'web',inject:['@deepseek-ai/dsh-client-ui-layout','@deepseek-ai/dsh-client-ui-slots']},bundle:{patch:'./cordis.patch.yml'}}}));
await writeFile(qa+'/route/cordis.patch.yml',"- insert:\n    - id: kaitu-host-route-qa\n      name: kaitu-host-route-qa\n");
await writeFile(qa+'/route/lib/index.js',"export const name='kaitu-host-route-qa'; export function apply() {}\n");
await writeFile(qa+'/route/client.ts',`import { registerExplorePluginRoute } from '${host}/packages/dsh-plugin/src/client/ExplorePluginRoute.tsx'; export const name='kaitu-host-route-qa'; export const inject=['layout','slots']; export function apply(ctx) {registerExplorePluginRoute(ctx);}`);
await build({entryPoints:[qa+'/route/client.ts'],outfile:qa+'/route/lib/client.js',bundle:true,platform:'browser',format:'cjs',target:'chrome120',external:['@deepseek-ai/*'],banner:{js:'window.__ModuleLoader__.load({id:"kaitu-host-route-qa",factory:(require)=>{var module={exports:{}};var exports=module.exports;'},footer:{js:';return module.exports;}});'},plugins:[{name:'original-host-css',setup(b){b.onLoad({filter:/ExplorePluginEmbed\.module\.css$/},async args=>({contents:`const s=document.createElement('style');s.textContent=${JSON.stringify(await readFile(args.path,'utf8'))};document.head.append(s);export default {embedded:'embedded'};`,loader:'js'}))}}]});
// The production service only uses KaituError from core; compile that exact error class rather than the unrelated data-layer exports.
await build({entryPoints:[host+'/packages/desktop/plugins.mjs'],outfile:qa+'/plugins-service.mjs',bundle:true,platform:'node',format:'esm',nodePaths:[plugin+'/node_modules/.pnpm/semver@7.7.4/node_modules',plugin+'/node_modules'],plugins:[{name:'core-errors-only',setup(b){b.onResolve({filter:/core\/dist\/index\.js$/},()=>({path:host+'/packages/core/src/errors.ts'}));b.onResolve({filter:/^semver$/},()=>({path:semverEntry}))}}]});
let src=await readFile(plugin+'/scripts/native-dsh-smoke.ts','utf8');
src=src.replace('const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");',`const repositoryRoot = '${plugin}';`);
src=src.replace('from "./native-dsh-helpers.js"',`from "${plugin}/scripts/native-dsh-helpers.ts"`);
src=src.replace('run(process.execPath, [dshBin, "plugin", "--profile", "web", "add", archivePath], env);',`run(process.execPath, [dshBin, "plugin", "--profile", "web", "add", archivePath], env);\n    run(process.execPath, [dshBin, "plugin", "--profile", "web", "add", '${qa}/route'], env);`);
const marker='    // A real first launch has no workspace or Session.';
const block=IFRAME_CHECK.replace('__SERVICE_MODULE__',qa+'/plugins-service.mjs').replace('__HOST_COMMIT__',hostCommit);
if(!src.includes(marker)) throw Error('smoke injection target missing');
src=src.replace(marker,block+'\n'+marker);
src=src.replace('redact(logs.join("").slice(-16_000))', 'redact(logs.join("").slice(-16_000)).replace(/([?&]token=)[A-Za-z0-9_.-]+/gu, "$1[REDACTED]")');
const installMarker = '    try { runPnpm(["--dir", installation, "install", "--offline"]); }\n    catch { runPnpm(["--dir", installation, "install"]); }';
if(!src.includes(installMarker))throw new Error("DSH fixture install marker changed");
src=src.replace(installMarker,`    await writeFile(join(installation, "pnpm-lock.yaml"), ${JSON.stringify(fixtureLock)});\n    try { runPnpm(["--dir", installation, "install", "--frozen-lockfile", "--offline"]); }\n    catch { runPnpm(["--dir", installation, "install", "--frozen-lockfile"]); }`);
await writeFile(qa+'/native-embed.ts',src);


const child = spawn(process.execPath,[require.resolve("tsx/cli"),join(qa,"native-embed.ts")],{
  cwd:plugin, stdio:["ignore","pipe","pipe"],
  env:{PATH:process.env.PATH,HOME:process.env.KAITU_QA_PACKAGE_HOME ?? join(qa,"home"),TMPDIR:qa,LANG:"en_US.UTF-8",PNPM_HOME:process.env.KAITU_QA_PNPM_HOME ?? join(qa,"pnpm-home"),npm_config_network_concurrency:"4",npm_config_cache:join(qa,"npm-cache"),npm_config_manage_package_manager_versions:"false",DSH_TEST_VERSION:dshVersion}
});
let output="";
child.stdout.on("data",chunk=>{output+=chunk.toString()});
child.stderr.on("data",chunk=>{output+=chunk.toString()});
const code=await new Promise((accept,reject)=>{child.once("error",reject);child.once("close",accept)});
process.stdout.write(redact(output));
if(code!==0) throw new Error(`Kaitu iframe integration failed (${code})`);
} finally {await rm(qa,{recursive:true,force:true})}
