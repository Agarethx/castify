import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import multipart from '@fastify/multipart';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true }),
  );

  // Register multipart plugin for VOD file uploads (2 GB limit for dev)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await app.register(multipart as any, {
    limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 1 },
  });

  app.setGlobalPrefix('api', { exclude: ['health'] });

  const webUrl = process.env['WEB_URL'] ?? 'http://localhost:3000';
  app.enableCors({
    origin: [webUrl, 'http://localhost:3000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug', 'x-session-token', 'x-streaming-secret'],
  });

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`Castify API running on http://0.0.0.0:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
