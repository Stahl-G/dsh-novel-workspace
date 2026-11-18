// The existing cross-platform workflow invokes Vitest directly. Exercise the
// real Node CLI tests there too, without changing GitHub Actions permissions.
import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

export default function checkBookCLI() {
  if (process.env.CI !== "true") return; // local pnpm verify already runs test:book
  const suites = ["./kaitu-book.test.mjs", "./kaitu-author-loop.test.mjs"]
    .map((file) => fileURLToPath(new URL(file, import.meta.url)));
  execFileSync(process.execPath, ["--test", ...suites], {
    stdio: "inherit"
  });
}
