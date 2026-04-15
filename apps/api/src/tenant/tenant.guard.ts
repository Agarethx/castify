import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Channel } from '@castify/types';
import { TenantService } from './tenant.service';

interface RequestWithTenant extends FastifyRequest {
  tenant: Channel;
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly tenantService: TenantService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithTenant>();
    const slug = req.headers['x-tenant-slug'];

    if (!slug || typeof slug !== 'string') {
      throw new BadRequestException('Header X-Tenant-Slug es requerido');
    }

    req.tenant = await this.tenantService.resolveBySlug(slug);
    return true;
  }
}
