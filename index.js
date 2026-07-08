import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const entrypoint = new URL("./dist/index.js", import.meta.url);

if (!existsSync(entrypoint)) {
    console.log("[VictusMC Bot] dist/index.js not found. Building TypeScript before startup...");
    const build = spawnSync("npm", ["run", "build"], {
        stdio: "inherit",
        shell: process.platform === "win32",
    });

    if (build.status !== 0) {
        console.error("[VictusMC Bot] Build failed. Check the TypeScript errors above.");
        process.exit(build.status || 1);
    }
}

await import("./dist/index.js");
