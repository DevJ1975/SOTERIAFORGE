import { authGuard, ForgeLogin } from '@forge/auth';
import { appRoutes, superadminOnly } from './app.routes';

describe('appRoutes', () => {
  it('registers /login with the shared ForgeLogin component', () => {
    const login = appRoutes.find((route) => route.path === 'login');
    expect(login?.component).toBe(ForgeLogin);
  });

  it('guards /catalog with authGuard and the superadmin role guard', () => {
    const catalog = appRoutes.find((route) => route.path === 'catalog');
    expect(catalog).toBeDefined();
    expect(catalog?.canActivate).toEqual([authGuard, superadminOnly]);
  });

  it('lazy-loads the catalog page', async () => {
    const catalog = appRoutes.find((route) => route.path === 'catalog');
    const loader = catalog?.loadComponent as () => Promise<unknown>;
    expect(typeof loader).toBe('function');
    await expect(loader()).resolves.toBeDefined();
  });
});
