import { Global, Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantGuard } from './tenant.guard';
import { TenantInterceptor } from './tenant.interceptor';

@Global()
@Module({
  providers: [TenantService, TenantGuard, TenantInterceptor],
  exports: [TenantService, TenantGuard, TenantInterceptor],
})
export class TenantModule {}
