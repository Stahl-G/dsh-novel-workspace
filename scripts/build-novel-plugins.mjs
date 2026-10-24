import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const require = createRequire(new URL("../packages/novel-plugin/package.json", import.meta.url));
const { WorkspaceTypertGenerator } = await import(
  pathToFileURL(require.resolve("@deepseek-ai/dsh-typert-generator")).href
);
const { build } = require("esbuild");
const { transform } = require("lightningcss");

const root = fileURLToPath(new URL("..", import.meta.url));
const folder = process.argv[2];
const pkg = resolve(root, "packages", folder);
const packageName = JSON.parse(readFileSync(resolve(pkg, "package.json"), "utf8")).name;
// Typert requires declaration owners, including framework module merges, in its
// host inventory. Analyze the published SDK declarations without DSH source.
const analysis = mkdtempSync(join(tmpdir(), "kaitu-typert-"));
if (folder === "novel-plugin")
  try {
    const analyzedPkg = resolve(analysis, `packages/${folder}`);
    const sdkPackages = ["dsh-typert-protocol", "dsh-typert-registry"];
    const sdkRoots = sdkPackages.map((name) => resolve(analysis, "packages", name));
    mkdirSync(analyzedPkg, { recursive: true });
    cpSync(resolve(pkg, "src"), resolve(analyzedPkg, "src"), { recursive: true });
    cpSync(resolve(pkg, "package.json"), resolve(analyzedPkg, "package.json"));
    mkdirSync(resolve(analyzedPkg, "lib"));
    writeFileSync(resolve(analyzedPkg, "lib/typert.host.d.ts"), "export declare const TYPERT: unknown;\n");
    symlinkSync(resolve(pkg, "node_modules"), resolve(analyzedPkg, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    for (const [index, sdkName] of sdkPackages.entries()) {
      const sdkRoot = sdkRoots[index];
      cpSync(resolve(pkg, `node_modules/@deepseek-ai/${sdkName}/lib/types`), resolve(sdkRoot, "src"), {
        recursive: true,
      });
      writeFileSync(
        resolve(sdkRoot, "package.json"),
        JSON.stringify({ name: `@deepseek-ai/${sdkName}`, exports: { ".": "./src/index.d.ts" } }),
      );
      symlinkSync(resolve(pkg, "node_modules"), resolve(sdkRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    }
    const options = JSON.parse(readFileSync(resolve(root, "tsconfig.base.json"), "utf8"));
    options.compilerOptions.types = ["node"];
    const sdkPaths = Object.fromEntries(
      sdkPackages.map((name, index) => [
        `@deepseek-ai/${name}`,
        [resolve(sdkRoots[index], "src/index.d.ts")],
      ]),
    );
    // Resolve workspace types explicitly when Windows temp and source use different drives.
    options.compilerOptions.paths = {
      "@kaitu/core": [resolve(root, "packages/core/dist/index.d.ts")],
      ...sdkPaths,
    };
    writeFileSync(resolve(analysis, "tsconfig.base.json"), JSON.stringify(options));
    symlinkSync(resolve(root, "node_modules"), resolve(analysis, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    for (const dir of [analyzedPkg, ...sdkRoots]) {
      writeFileSync(
        resolve(dir, "tsconfig.json"),
        JSON.stringify({
          extends: "../../tsconfig.base.json",
          include: ["src/**/*.ts"],
          exclude: ["src/client"],
        }),
      );
    }
    writeFileSync(
      resolve(analysis, "tsconfig.host.json"),
      JSON.stringify({
        extends: "./tsconfig.base.json",
        files: [],
        references: [
          { path: `packages/${folder}` },
          ...sdkPackages.map((name) => ({ path: `packages/${name}` })),
        ],
      }),
    );
    const generator = new WorkspaceTypertGenerator(analysis);
    for (const artifact of generator.generate([packageName], ["host"])) {
      const base = resolve(pkg, "lib");
      mkdirSync(base, { recursive: true });
      writeFileSync(resolve(base, "typert.host.js"), artifact.js);
      writeFileSync(resolve(base, "typert.host.d.ts"), artifact.dts);
      if (artifact.remote) {
        writeFileSync(resolve(base, "typert.remote-client.js"), artifact.remote.js);
        writeFileSync(resolve(base, "typert.remote-client.d.ts"), artifact.remote.dts);
      }
    }
  } finally {
    rmSync(analysis, { recursive: true, force: true });
  }
execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.json"], { cwd: pkg, stdio: "inherit" });
if (folder === "novel-plugin")
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc"), "-p", "tsconfig.client.json"], { cwd: pkg, stdio: "inherit" });
const hostBundle = await build({
  metafile: true,
  entryPoints: [resolve(pkg, "src/index.ts")],
  outfile: resolve(pkg, "dist/index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  external: ["@deepseek-ai/cordis", "@deepseek-ai/dsh-typert-protocol"],
  banner: {
    js: 'import { createRequire as __kaituCreateRequire } from "node:module"; const require=__kaituCreateRequire(import.meta.url);',
  },
});

writeFileSync(resolve(pkg, "dist/metafile.json"), JSON.stringify(hostBundle.metafile));

if (folder !== "novel-plugin") rmSync(analysis, { recursive: true, force: true });

if (folder === "novel-plugin") {
  const css = [];
  const output = await build({
    entryPoints: [resolve(pkg, "src/client/index.tsx")],
    bundle: true,
    platform: "browser",
    format: "cjs",
    jsx: "automatic",
    write: false,
    target: "es2022",
    external: ["react", "react/*", "@deepseek-ai/cordis"],
    plugins: [
      {
        name: "novel-css",
        setup(b) {
          b.onLoad({ filter: /\.module\.css$/ }, ({ path }) => {
            const r = transform({
              filename: path,
              code: readFileSync(path),
              cssModules: { pattern: "kn_[local]_[hash]" },
            });
            css.push(r.code.toString());
            return {
              contents: `export default ${JSON.stringify(Object.fromEntries(Object.entries(r.exports).map(([k, v]) => [k, v.name])))}`,
              loader: "js",
              resolveDir: dirname(path),
            };
          });
        },
      },
    ],
    banner: {
      js: `window.__ModuleLoader__.load({id:${JSON.stringify("kaitu-novel-workspace")},factory:(require)=>{var module={exports:{}};var exports=module.exports;`,
    },
    footer: { js: "return module.exports;}});" },
  });
  writeFileSync(
    resolve(pkg, "dist/client.js"),
    output.outputFiles[0].text.replace(
      "var exports=module.exports;",
      `var exports=module.exports;window.__kaituNovelStyles=${JSON.stringify(css.join("\n"))};`,
    ),
  );
  // CSS lifetime follows Cordis apply/dispose, including hot reload.
  writeFileSync(resolve(pkg, "dist/styles.json"), JSON.stringify(css.join("\n")));
}
