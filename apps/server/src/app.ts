import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { registerRoutes } from './routes.js';

export async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(cors, { origin: true, credentials: true });
  await registerRoutes(app);
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api')) return reply.code(404).send({ error: '不存在' });
      return reply.sendFile('index.html');
    });
  }
  return app;
}
