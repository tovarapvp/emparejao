import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;
const productionD1DatabaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
const productionD1DatabaseName =
  process.env.CLOUDFLARE_D1_DATABASE_NAME?.trim() || "emparejao-db";

if (process.env.WORKERS_CI === "1" && d1 && !productionD1DatabaseId) {
  throw new Error(
    "Falta CLOUDFLARE_D1_DATABASE_ID en Settings > Build > Build Variables and Secrets.",
  );
}

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  durable_objects: {
    bindings: [
      {
        name: "ROOM_HUB",
        class_name: "RoomHub",
      },
    ],
  },
  migrations: [
    {
      tag: "room-hub-v1",
      new_sqlite_classes: ["RoomHub"],
    },
  ],
  triggers: {
    crons: ["17 * * * *"],
  },
  ratelimits: [
    {
      name: "ROOM_CREATE_LIMITER",
      namespace_id: "21001",
      simple: { limit: 10, period: 60 as const },
    },
    {
      name: "ROOM_JOIN_LIMITER",
      namespace_id: "21002",
      simple: { limit: 1000, period: 60 as const },
    },
    {
      name: "ROOM_SOCKET_LIMITER",
      namespace_id: "21003",
      simple: { limit: 2400, period: 60 as const },
    },
    {
      name: "ALERT_LIMITER",
      namespace_id: "21004",
      simple: { limit: 1, period: 60 as const },
    },
  ],
  observability: {
    enabled: true,
    logs: {
      enabled: true,
      invocation_logs: true,
      head_sampling_rate: 1,
    },
  },
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: productionD1DatabaseName,
          database_id:
            productionD1DatabaseId ?? SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
