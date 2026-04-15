import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { Channel } from '@castify/types';
import { TenantService } from './tenant.service';

interface RequestWithTenant extends FastifyRequest {
  tenant?: Channel;
}

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantService: TenantService) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = ctx.switchToHttp().getRequest<RequestWithTenant>();
    const slug = req.headers['x-tenant-slug'];

    if (slug && typeof slug === 'string' && !req.tenant) {
      req.tenant = await this.tenantService.resolveBySlug(slug).catch(() => undefined);
    }

    return next.handle();
  }
}
