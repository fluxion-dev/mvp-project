import { test, expect } from '@playwright/test'

test('register page loads with form', async ({ page }) => {
  await page.goto('http://localhost:3000/register')
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByLabel(/password/i)).toBeVisible()
  await expect(page.getByLabel(/display name/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /register/i })).toBeVisible()
})

test('login page loads with form', async ({ page }) => {
  await page.goto('http://localhost:3000/login')
  await expect(page.getByLabel(/email/i)).toBeVisible()
  await expect(page.getByLabel(/password/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /login/i })).toBeVisible()
  await expect(page.getByText(/create account/i)).toBeVisible()
})