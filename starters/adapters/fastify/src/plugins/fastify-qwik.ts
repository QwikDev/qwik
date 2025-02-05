import fastifyStatic from "@fastify/static";
import qwikRouterConfig from "@qwik-router-config";
import { createQwikRouter } from "@qwik.dev/router/middleware/node";
import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import render from "../entry.ssr";

export interface FastifyQwikOptions {
  distDir: string;
  buildDir: string;
}

const { router, notFound } = createQwikRouter({ render, qwikRouterConfig });

const qwikPlugin: FastifyPluginAsync<FastifyQwikOptions> = async (
  fastify,
  options,
) => {
  const { buildDir, distDir } = options;

  fastify.register(fastifyStatic, {
    root: buildDir,
    prefix: "/build",
    immutable: true,
    maxAge: "1y",
    decorateReply: false,
  });

  fastify.register(fastifyStatic, {
    root: distDir,
    redirect: false,
    decorateReply: false,
  });

  fastify.setNotFoundHandler(async (request, response) => {
    await router(request.raw, response.raw, (err) => fastify.log.error(err));
    await notFound(request.raw, response.raw, (err) => fastify.log.error(err));
  });
};

export default fastifyPlugin(qwikPlugin, { fastify: ">=4.0.0 <6.0.0" });
