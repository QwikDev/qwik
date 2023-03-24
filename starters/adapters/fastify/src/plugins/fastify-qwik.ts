import { createQwikCity } from '@builder.io/qwik-city/middleware/node';
import fastifyStatic from '@fastify/static';
import qwikCityPlan from '@qwik-city-plan';
import type { FastifyPluginAsync } from 'fastify';
import fastifyPlugin from 'fastify-plugin';

import render from '../entry.ssr';

export interface FastifyQwikOptions {
  distDir: string;
  buildDir: string;
}

const { router, notFound } = createQwikCity({ render, qwikCityPlan });

const qwikPlugin: FastifyPluginAsync<FastifyQwikOptions> = async (fastify, options) => {
  const { buildDir, distDir } = options;

  fastify.register(fastifyStatic, {
    root: buildDir,
    prefix: '/build',
    immutable: true,
    maxAge: '1y',
    decorateReply: false,
  });

  fastify.register(fastifyStatic, {
    root: distDir,
    redirect: false,
    decorateReply: false,
  });

  fastify.setNotFoundHandler(async (request, response) => {
    await router(request.raw, response.raw, fastify.log.error);
    await notFound(request.raw, response.raw, fastify.log.error);
  });
};

export default fastifyPlugin(qwikPlugin, { fastify: '4.x' });
