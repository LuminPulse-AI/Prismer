import { test, expect } from '@playwright/test';
import {
  dismissWorkspaceGate,
  mockSelfHostPaperApis,
  PDF_FIXTURE_PATH,
} from '../helpers/self-host-ocr';

test.describe('self-host OCR browser flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockSelfHostPaperApis(page);
  });

  test('imports a paper from the library and reopens it from assets', async ({ page }) => {
    await page.goto('/workspace');
    await page.waitForURL(/\/workspace\/[^/]+$/);
    await dismissWorkspaceGate(page);

    await page.getByTestId('component-tab-pdf-reader').click();
    await expect(page.getByTestId('pdf-reader-add-document')).toBeVisible();

    await page.getByTestId('pdf-reader-add-document').click();
    await page.getByTestId('pdf-reader-add-from-library').click();
    await expect(page.getByTestId('paper-library-dialog')).toBeVisible();

    await page.getByTestId('paper-library-file-input').setInputFiles(PDF_FIXTURE_PATH);

    await expect(page.getByTestId('paper-library-dialog')).toBeHidden({ timeout: 15_000 });
    await expect(page.getByTestId('pdf-document-tab-imported-paper')).toBeVisible();

    const importedTab = page.getByTestId('pdf-document-tab-imported-paper');
    await expect(importedTab).toContainText(/imported[- ]paper/i);

    await importedTab.hover();
    await page.getByTestId('pdf-document-close-imported-paper').click();
    await expect(importedTab).toBeHidden({ timeout: 10_000 });

    await page.getByTestId('pdf-reader-add-document').click();
    await page.getByTestId('pdf-reader-add-from-assets').click();
    await expect(page.getByTestId('asset-browser-dialog')).toBeVisible();
    await expect(page.getByTestId('asset-browser-item-1')).toContainText('Imported Paper');

    await page.getByTestId('asset-browser-item-1').click();
    await expect(page.getByTestId('pdf-document-tab-imported-paper')).toBeVisible();
    await expect(page.getByTestId('pdf-document-tab-imported-paper')).toContainText(/imported[- ]paper/i);
  });
});
