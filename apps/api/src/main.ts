import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: true }));

  app.enableCors({
    origin: process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = parseInt(process.env['PORT'] ?? '3001', 10);
  await app.listen(port, '0.0.0.0');

  console.log(`Castify API running on http://0.0.0.0:${port}`);
}

bootstrap().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
