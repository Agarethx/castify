import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Channel } from '@castify/types';

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Channel => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { tenant: Channel }>();
    return request.tenant;
  },
);
