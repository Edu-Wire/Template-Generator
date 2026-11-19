import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hosts (besides localhost) allowed to load dev-only assets, e.g. an ngrok tunnel.
  // Free ngrok hostnames change between sessions, so the wildcard covers the next one too.
  allowedDevOrigins: ["marcy-unconferred-jeanne.ngrok-free.dev", "*.ngrok-free.dev"],
};

export default nextConfig;
