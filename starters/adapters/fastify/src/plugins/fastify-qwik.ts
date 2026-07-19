import fastifyStatic from "@fastify/static";
import { createQwikRouter } from "@qwik.dev/router/middleware/node";
import type { FastifyPluginAsync } from "fastify";
import fastifyPlugin from "fastify-plugin";

import render from "../entry.ssr";

export interface FastifyQwikOptions {
  distDir: string;
  buildDir: string;
  assetsDir: string;
}

const { router } = createQwikRouter({ render });

const qwikPlugin: FastifyPluginAsync<FastifyQwikOptions> = async (
  fastify,
  options,
) => {
  const { buildDir, distDir, assetsDir } = options;

  fastify.register(fastifyStatic, {
    root: buildDir,
    prefix: "/build",
    immutable: true,
    maxAge: "1y",
    decorateReply: false,
  });

  fastify.register(fastifyStatic, {
    root: assetsDir,
    prefix: "/assets",
    immutable: true,
    maxAge: "1y",
  });

  fastify.register(fastifyStatic, {
    root: distDir,
    redirect: false,
    decorateReply: false,
  });

  fastify.removeAllContentTypeParsers();

  fastify.setNotFoundHandler(async (request, response) => {
    await router(
      request.raw,
      response.raw,
      (err) => {
        if (err) {
          response.send(err);
        }
      },
      { bodyLimit: request.routeOptions.bodyLimit },
    );
  });
};

export default fastifyPlugin(qwikPlugin, { fastify: ">=4.0.0 <6.0.0" });
