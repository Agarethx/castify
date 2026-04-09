import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginResponse } from '@castify/types';

const mockLoginResponse: LoginResponse = {
  accessToken: 'access.token.mock',
  refreshToken: '00000000-0000-0000-0000-000000000001',
  user: {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'admin@demo.castify.tv',
    role: 'CHANNEL_ADMIN',
    channelId: '00000000-0000-0000-0000-000000000003',
  },
};

const mockAuthService = {
  login: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  me: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('POST /api/auth/login', () => {
    it('retorna tokens con credenciales válidas', async () => {
      mockAuthService.login.mockResolvedValueOnce(mockLoginResponse);

      const body = { email: 'admin@demo.castify.tv', password: 'demo2024' };
      const result = await controller.login(body);

      expect(mockAuthService.login).toHaveBeenCalledWith({
        email: 'admin@demo.castify.tv',
        password: 'demo2024',
      });
      expect(result.accessToken).toBe('access.token.mock');
      expect(result.user.role).toBe('CHANNEL_ADMIN');
    });

    it('lanza 401 con credenciales inválidas', async () => {
      mockAuthService.login.mockRejectedValueOnce(
        new UnauthorizedException('Credenciales inválidas'),
      );

      const body = { email: 'admin@demo.castify.tv', password: 'wrongpassword' };
      await expect(controller.login(body)).rejects.toThrow(UnauthorizedException);
    });

    it('lanza ZodError con body inválido (email malformado)', async () => {
      expect.assertions(1);
      const body = { email: 'no-es-email', password: 'demo2024' };
      try {
        await controller.login(body);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('lanza ZodError cuando password tiene menos de 8 caracteres', async () => {
      expect.assertions(1);
      const body = { email: 'admin@demo.castify.tv', password: 'corto' };
      try {
        await controller.login(body);
      } catch (err) {
        expect(err).toBeDefined();
      }
    });
  });
});
