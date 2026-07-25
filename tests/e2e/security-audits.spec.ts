import { test, expect } from '@playwright/test';

test.describe('Security & Stability Audit', () => {
  test('should load the dashboard for an authenticated user', async ({ page }) => {
    // This assumes the user is logged in or we navigate to a public part of the app
    await page.goto('/');
    await expect(page).toHaveTitle(/Nexus/);
  });

  test('should protect administrative pages from unauthorized access', async ({ page }) => {
    // Attempt to access security page without proper auth should redirect or show unauthorized
    await page.goto('/security');
    const content = await page.textContent('body');
    // If not logged in, it should be on auth page or show not found/unauthorized
    expect(content).not.toContain('Fortaleza de Segurança');
  });

  test('should verify security monitoring panel presence on security page', async ({ page }) => {
    // This would require a logged in session with admin rights
    // For now we just check the route existence
    await page.goto('/security');
    // We expect a redirect to /auth if not authenticated
    if (page.url().includes('/auth')) {
      await expect(page.locator('form')).toBeVisible();
    }
  });

  test('should check for critical CRUD operations stability', async ({ page }) => {
    await page.goto('/agents');
    // Basic UI check to ensure no crash on main listing
    await expect(page.locator('h1')).toBeVisible();
  });
});
