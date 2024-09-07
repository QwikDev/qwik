/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for the Express HTTP server when building for production.
 *
 * Learn more about Node.js server integrations here:
 * - https://qwik.dev/docs/deployments/node/
 *
 */
import {
  createQwikCity,
  type PlatformNode,
} from "@builder.io/qwik-city/middleware/node";
import "dotenv/config";
import qwikCityPlan from "@qwik-city-plan";
import { manifest } from "@qwik-client-manifest";
import render from "./entry.ssr";
import express from "express";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

declare global {
  interface QwikCityPlatform extends PlatformNode { }
}

const distDir = join(fileURLToPath(import.meta.url), "..", "..", "dist");
const buildDir = join(distDir, "build");

const PORT = process.env.PORT ?? 3000;

const { router, notFound } = createQwikCity({
  render,
  qwikCityPlan,
  manifest,
});

const app = express();

app.use(`/build`, express.static(buildDir, { immutable: true, maxAge: "1y" }));
app.use(express.static(distDir, { redirect: false }));

app.use(router);

app.use(notFound);

app.listen(PORT, () => {
  console.log(`Server started: http://localhost:${PORT}/`);
});
