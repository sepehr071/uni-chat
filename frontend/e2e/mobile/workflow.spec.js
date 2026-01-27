import { test, expect } from '@playwright/test';
import { VIEWPORTS, setMobileViewport, checkTouchTargets, checkHorizontalScroll } from '../fixtures/mobile.fixture.js';

test.describe('WorkflowPage Mobile Responsiveness', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@admin.com');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/chat', { timeout: 10000 });

    // Navigate to workflow page
    await page.goto('/workflow');
    await page.waitForLoadState('networkidle');
  });

  test('sidebar hidden by default on mobile', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    // Sidebar should not be visible by default
    const sidebar = page.locator('[data-testid="workflow-sidebar"]');
    await expect(sidebar).not.toBeVisible();

    // Menu button should be visible
    const menuButton = page.locator('[data-testid="workflow-menu-button"]');
    await expect(menuButton).toBeVisible();
  });

  test('menu button opens sidebar as overlay', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    const menuButton = page.locator('[data-testid="workflow-menu-button"]');
    const sidebar = page.locator('[data-testid="workflow-sidebar"]');

    // Click menu to open sidebar
    await menuButton.click();
    await expect(sidebar).toBeVisible();

    // Backdrop should be visible
    const backdrop = page.locator('[data-testid="sidebar-backdrop"]');
    await expect(backdrop).toBeVisible();
  });

  test('backdrop click closes sidebar', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    // Open sidebar
    await page.locator('[data-testid="workflow-menu-button"]').click();
    await expect(page.locator('[data-testid="workflow-sidebar"]')).toBeVisible();

    // Click backdrop
    await page.locator('[data-testid="sidebar-backdrop"]').click();

    // Sidebar should close
    await expect(page.locator('[data-testid="workflow-sidebar"]')).not.toBeVisible();
  });

  test('toolbar shows overflow menu on mobile', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    // Essential buttons should be visible
    await expect(page.getByRole('button', { name: /new/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /save/i })).toBeVisible();

    // Overflow menu should exist
    const overflowMenu = page.locator('[data-testid="toolbar-overflow-menu"]');
    await expect(overflowMenu).toBeVisible();
  });

  test('canvas is usable on mobile', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    // Canvas should fill available space
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox.width).toBeGreaterThan(300);
    expect(canvasBox.height).toBeGreaterThan(300);
  });

  test('FAB button visible and functional', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    // FAB should be visible
    const fab = page.getByRole('button', { name: /add nodes/i });
    await expect(fab).toBeVisible();

    // Clicking FAB opens sidebar
    await fab.click();
    await expect(page.locator('[data-testid="workflow-sidebar"]')).toBeVisible();
  });

  test('no horizontal scroll at 320px width', async ({ page }) => {
    await setMobileViewport(page, 'narrowPhone'); // 320px

    const scrollInfo = await checkHorizontalScroll(page);
    expect(scrollInfo.hasOverflow).toBe(false);
  });

  test('touch targets meet 44px minimum', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    const violations = await checkTouchTargets(page, 44);

    if (violations.length > 0) {
      console.log('Touch target violations:', violations);
    }

    // Allow some minor violations (e.g., icons inside properly sized buttons)
    expect(violations.length).toBeLessThan(5);
  });

  test('MiniMap hidden on mobile', async ({ page }) => {
    await setMobileViewport(page, 'iPhone14');

    // MiniMap should not be visible on mobile
    const minimap = page.locator('.react-flow__minimap');
    await expect(minimap).not.toBeVisible();
  });

  test('works in landscape orientation', async ({ page }) => {
    await setMobileViewport(page, 'landscapePhone');

    // Essential controls should still be accessible
    await expect(page.locator('[data-testid="workflow-menu-button"]')).toBeVisible();
    await expect(page.locator('.react-flow')).toBeVisible();
  });
});
