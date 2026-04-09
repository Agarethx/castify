import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { TenantService } from './tenant.service';
import { Channel } from '@castify/types';

const mockChannel: Channel = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Canal Demo',
  slug: 'demo',
  logoUrl: null,
  primaryColor: '#6366f1',
  plan: 'PRO',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockTenantService = {
  resolveBySlug: jest.fn(),
};

function createMockContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers, tenant: undefined as Channel | undefined };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard(mockTenantService as unknown as TenantService);
    jest.clearAllMocks();
  });

  it('resuelve el tenant cuando X-Tenant-Slug está presente', async () => {
    mockTenantService.resolveBySlug.mockResolvedValueOnce(mockChannel);

    const ctx = createMockContext({ 'x-tenant-slug': 'demo' });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockTenantService.resolveBySlug).toHaveBeenCalledWith('demo');
  });

  it('lanza 400 cuando X-Tenant-Slug no está presente', async () => {
    const ctx = createMockContext({});
    await expect(guard.canActivate(ctx)).rejects.toThrow(BadRequestException);
  });

  it('lanza 404 cuando el slug no existe', async () => {
    mockTenantService.resolveBySlug.mockRejectedValueOnce(
      new NotFoundException("Canal 'no-existe' no encontrado"),
    );

    const ctx = createMockContext({ 'x-tenant-slug': 'no-existe' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(NotFoundException);
  });
});
