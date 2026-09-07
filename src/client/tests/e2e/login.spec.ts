import { test, expect, request } from '@playwright/test'

const BASE = 'http://localhost:3000'
const API = 'http://localhost:5000'

const TEST_EMAIL = 'login-e2e@example.com'
const TEST_PASSWORD = 'SecurePass123!'
const TEST_NAME = 'Login E2E User'

/**
 * Seed a test user via the API. Idempotent — silently swallows 400
 * "already exists" errors so subsequent runs still pass.
 */
async function seedTestUser() {
  const ctx = await request.newContext()
  const res = await ctx.post(`${API}/api/auth/register`, {
    data: {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      displayName: TEST_NAME,
    },
  })
  if (!res.ok() && res.status() !== 400) {
    console.warn(`seedTestUser: unexpected status ${res.status()}`)
  }
  await ctx.dispose()
}

test.describe('Login - Happy Path', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test('logs in with valid credentials and redirects to dashboard', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /^login$/i }).click()

    await expect(page).toHaveURL(`${BASE}/`)
    // Confirm authenticated dashboard actually rendered (not just URL change).
    await expect(page.getByRole('heading', { name: /streams/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible()
  })

  test('persists the JWT token in storage on success', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    // Opt in to remember-me so the token lands in localStorage.
    await page.getByLabel(/remember me/i).check()
    await page.getByRole('button', { name: /^login$/i }).click()

    await page.waitForURL(`${BASE}/`)
    const token = await page.evaluate(() => localStorage.getItem('mvp_token'))
    expect(token).toBeTruthy()
    expect(token!.length).toBeGreaterThan(20) // JWT is much longer than this
  })

  test('auth survives a page reload after login', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /^login$/i }).click()
    await page.waitForURL(`${BASE}/`)
    await page.reload()
    await expect(page).toHaveURL(`${BASE}/`)
    await expect(page.getByRole('heading', { name: /streams/i })).toBeVisible()
  })

  test('shows display name from server on dashboard header', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /^login$/i }).click()
    await page.waitForURL(`${BASE}/`)
    await expect(page.getByText(new RegExp(TEST_NAME, 'i'))).toBeVisible()
  })
})

test.describe('Login - Failure Cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`)
  })

  test('shows client-side error for empty email', async ({ page }) => {
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /^login$/i }).click()
    await expect(page.getByText(/email is required/i)).toBeVisible()
  })

  test('shows client-side error for empty password', async ({ page }) => {
    await page.getByLabel(/email/i).fill('someone@example.com')
    await page.getByRole('button', { name: /^login$/i }).click()
    await expect(page.getByText(/password is required/i)).toBeVisible()
  })

  test('shows server error for invalid credentials', async ({ page }) => {
    await page.getByLabel(/email/i).fill('nobody@example.com')
    await page.getByLabel(/password/i).fill('definitely-wrong')
    await page.getByRole('button', { name: /^login$/i }).click()
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('shows server error for wrong password on real user', async ({ page }) => {
    await seedTestUser()
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill('WrongPassword!')
    await page.getByRole('button', { name: /^login$/i }).click()
    await expect(page.getByText(/invalid email or password/i)).toBeVisible()
  })
})

test.describe('Login - Remember Me', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test('toggling remember me persists the preference flag', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByLabel(/remember me/i).check()
    await page.getByRole('button', { name: /^login$/i }).click()
    await page.waitForURL(`${BASE}/`)

    const remember = await page.evaluate(() => localStorage.getItem('mvp_remember'))
    expect(remember).toBe('true')
  })
})

test.describe('Login - UX', () => {
  test('disables the submit button while logging in', async ({ page }) => {
    await seedTestUser()
    await page.goto(`${BASE}/login`)
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)

    const loginButton = page.getByRole('button', { name: /^login$/i })
    await loginButton.click()
    // After click, the button text changes to "Logging in..." and is disabled.
    const loggingIn = await page.getByRole('button', { name: /logging in/i }).first()
    await expect(loggingIn).toBeDisabled()
    // Wait for the request to settle.
    await page.waitForURL(`${BASE}/`)
  })

  test('links to the registration page', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByRole('link', { name: /create account/i }).click()
    await expect(page).toHaveURL(`${BASE}/register`)
  })

  test('unauthenticated visits to protected routes redirect through /login', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page).toHaveURL(/\/login/)
  })
})