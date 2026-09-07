import { test, expect, request } from '@playwright/test'

/**
 * Issue #3 — User Logout Endpoint (canonical E2E).
 *
 * INTENDED END STATE:
 * - Backend: `POST /api/auth/logout` requires auth ([Authorize]),
 *   returns `200 { message: "logged out successfully" }` (stateless ack).
 * - Frontend: `api.logout()` best-effort POST with auth headers, never
 *   throws; `AuthContext.logout()` is async, calls the API then clears
 *   state + storage; Dashboard/AdminDashboard `await logout()` then
 *   `navigate('/login')`.
 *
 * NOTE: these specs are NOT executed in this QA pass (no live servers).
 * Run with `npx playwright test` once backend + frontend have landed.
 */

const BASE = 'http://localhost:3000'
const API = 'http://localhost:5000'

const TEST_EMAIL = 'logout-e2e@example.com'
const TEST_PASSWORD = 'SecurePass123!'
const TEST_NAME = 'Logout E2E User'

async function seedTestUser() {
  const ctx = await request.newContext()
  const res = await ctx.post(`${API}/api/auth/register`, {
    data: { email: TEST_EMAIL, password: TEST_PASSWORD, displayName: TEST_NAME },
  })
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

async function loginViaApi(email = TEST_EMAIL, password = TEST_PASSWORD) {
  const ctx = await request.newContext()
  const res = await ctx.post(`${API}/api/auth/login`, { data: { email, password } })
  const body = await res.json().catch(() => ({}))
  await ctx.dispose()
  return { status: res.status(), body }
}

test.describe('Logout - UI flow (issue #3)', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test('logout from dashboard -> /login, token removed, / redirects back to /login', async ({ page }) => {
    await loginViaUi(page)

    // Sanity: a token exists before logout (either storage, per remember-me).
    const before =
      (await page.evaluate(() => localStorage.getItem('mvp_token'))) ??
      (await page.evaluate(() => sessionStorage.getItem('mvp_token')))
    expect(before).toBeTruthy()

    await page.getByRole('button', { name: /logout/i }).click()

    // 1. URL lands on /login.
    await expect(page).toHaveURL(`${BASE}/login`)
    // 2. Token is gone from BOTH storages.
    expect(await page.evaluate(() => localStorage.getItem('mvp_token'))).toBeNull()
    expect(await page.evaluate(() => sessionStorage.getItem('mvp_token'))).toBeNull()
    // 3. Visiting a protected route bounces back to /login.
    await page.goto(`${BASE}/`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('logout button visible on dashboard implies authenticated session (login.spec.ts:43 companion)', async ({
    page,
  }) => {
    await loginViaUi(page)
    await expect(page.getByRole('button', { name: /logout/i })).toBeVisible()
  })
})

test.describe('Logout - API contract (issue #3)', () => {
  test.beforeAll(async () => {
    await seedTestUser()
  })

  test('POST /api/auth/logout without a token is rejected (requires auth)', async () => {
    const ctx = await request.newContext()
    const res = await ctx.post(`${API}/api/auth/logout`)
    expect([401, 403]).toContain(res.status())
    await ctx.dispose()
  })

  test('POST /api/auth/logout with a Bearer token returns 200 acknowledgement', async () => {
    const { status, body } = await loginViaApi()
    expect(status).toBe(200)
    expect(body.token).toBeTruthy()

    const ctx = await request.newContext()
    const res = await ctx.post(`${API}/api/auth/logout`, {
      headers: { Authorization: `Bearer ${body.token}` },
    })
    expect(res.status()).toBe(200)
    const logoutBody = await res.json().catch(() => ({}))
    expect(logoutBody.message).toMatch(/logged out successfully/i)
    await ctx.dispose()
  })
})
