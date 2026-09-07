import { test, expect, request } from '@playwright/test'

const BASE = 'http://localhost:3000'
const API = 'http://localhost:5000'

const TEST_EMAIL = 'test@example.com'
const TEST_PASSWORD = 'SecurePass123!'
const TEST_NAME = 'Test User'

/**
 * Ensure the seeded test user exists by registering them via the API.
 * Idempotent — silently swallows "already exists" errors so subsequent
 * test runs still work.
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
  // 200 = newly created, 400 = already exists — both fine.
  if (!res.ok() && res.status() !== 400) {
    console.warn(`seedTestUser: unexpected status ${res.status()}`)
  }
  await ctx.dispose()
}

async function loginViaUi(page: import('@playwright/test').Page, email = TEST_EMAIL, password = TEST_PASSWORD) {
  await page.goto(`${BASE}/login`)
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /login/i }).click()
  await page.waitForURL(`${BASE}/`)
}

test.describe('Registration - Happy Path', () => {
  test('register with valid data auto-logs in and redirects to dashboard', async ({ page }) => {
    // Use a unique email so we always exercise the success path.
    const email = `happy+${Date.now()}@example.com`

    await page.goto(`${BASE}/login`)
    await page.getByRole('link', { name: /create account/i }).click()
    await expect(page).toHaveURL(`${BASE}/register`)

    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByLabel(/display name/i).fill(TEST_NAME)
    await page.getByRole('button', { name: /register/i }).click()

    await expect(page).toHaveURL(`${BASE}/`)
    // Confirm authenticated dashboard actually rendered (not just URL change).
    await expect(page.getByRole('heading', { name: /streams/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible()
  })
})

test.describe('Registration - Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/register`)
  })

  test('shows error for empty email', async ({ page }) => {
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByLabel(/display name/i).fill(TEST_NAME)
    await page.getByRole('button', { name: /register/i }).click()

    await expect(page.getByText(/email is required/i)).toBeVisible()
  })

  test('shows error for empty password', async ({ page }) => {
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/display name/i).fill(TEST_NAME)
    await page.getByRole('button', { name: /register/i }).click()

    await expect(page.getByText(/password is required/i)).toBeVisible()
  })

  test('shows error for empty display name', async ({ page }) => {
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /register/i }).click()

    await expect(page.getByText(/display name is required/i)).toBeVisible()
  })
})

test.describe('Registration - Duplicate Email', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test('shows error when registering with an already-used email', async ({ page }) => {
    await page.goto(`${BASE}/register`)
    await page.getByLabel(/email/i).fill(TEST_EMAIL)
    await page.getByLabel(/password/i).fill(TEST_PASSWORD)
    await page.getByLabel(/display name/i).fill(TEST_NAME)
    await page.getByRole('button', { name: /register/i }).click()

    // ASP.NET Identity's default DuplicateEmail description matches this regex.
    await expect(page.getByText(/email.*(already|taken)/i)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Auth Persistence', () => {
  test('token stored in storage after login', async ({ page }) => {
    await seedTestUser()
    await loginViaUi(page)

    // Remember-me is unchecked by default → token lives in sessionStorage.
    const sessionToken = await page.evaluate(() => sessionStorage.getItem('mvp_token'))
    const localToken = await page.evaluate(() => localStorage.getItem('mvp_token'))
    expect(sessionToken ?? localToken).toBeTruthy()
  })

  test('auth persists after page refresh', async ({ page }) => {
    await seedTestUser()
    await loginViaUi(page)
    await page.reload()
    await expect(page).toHaveURL(`${BASE}/`)
  })
})

test.describe('Protected Routes', () => {
  test('redirects to login when unauthenticated', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Navigation', () => {
  test('register link from login page', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.getByRole('link', { name: /create account/i }).click()
    await expect(page).toHaveURL(`${BASE}/register`)
  })

  test('logout from dashboard', async ({ page }) => {
    await seedTestUser()
    await loginViaUi(page)
    await page.getByRole('button', { name: /logout/i }).click()
    await expect(page).toHaveURL(`${BASE}/login`)
  })
})