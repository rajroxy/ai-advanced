/**
 * Local dev launcher: one command starts the whole system.
 *   - the Bun + SQLite engine on API_PORT (default 8787)
 *   - the Vite UI on PORT, proxying /api to the engine
 * Nothing leaves your machine.
 */

// The engine prefers the platform-injected PORT; Vite gets its own port so the
// engine can proxy UI traffic to it without colliding.
const API_PORT = process.env.PORT ?? process.env.API_PORT ?? "8787";
let VITE_PORT = process.env.VITE_PORT ?? "5273";
if (VITE_PORT === API_PORT) VITE_PORT = "5274";
const env = { ...process.env, API_PORT, VITE_PORT, CORTEX_DEV: "1" };

const children = [
  Bun.spawn(["bun", "run", "--watch", "server/index.ts"], {
    env,
    stdio: ["inherit", "inherit", "inherit"],
  }),
  // Vite is pinned to VITE_PORT so the engine can proxy UI traffic to it.
  Bun.spawn(["bunx", "vite", "--port", VITE_PORT, "--strictPort"], {
    env,
    stdio: ["inherit", "inherit", "inherit"],
  }),
];

let shuttingDown = false;
const shutdown = () => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const exited = await Promise.race(children.map((c) => c.exited.then((code) => ({ c, code }))));
if (!shuttingDown) {
  console.error(`A dev process exited (code ${exited.code}); stopping the rest.`);
  shutdown();
}
