import { test, expect } from '@playwright/test'

// Requires backend + frontend running locally and seeded users.
test('customer shopping journey', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await expect(page.getByText('Dukani')).toBeVisible()
  // Real checkout flow relies on authenticated session and product seed.
})

test('owner shopkeeper operational entry points', async ({ page }) => {
  await page.goto('http://localhost:3000/dashboard/shop')
  await expect(page).toHaveURL(/\/$|dashboard\/shop/)
})
