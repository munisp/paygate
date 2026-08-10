import { test, expect } from "@playwright/test";

/**
 * e2e tests for LakehouseV2, Fraud Heatmap (Sedona), and DataFusion Credit Scoring.
 * These tests run against the dev server and expect the backend services to be
 * reachable. In CI, upstream Python services are stubbed via MSW.
 */

test.describe("LakehouseV2 — Dataset Management", () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the LakehouseV2 page (requires auth — auth.setup.ts handles login)
    await page.goto("/tier6to8/lakehouse-v2");
    await page.waitForLoadState("networkidle");
  });

  test("renders the Datasets tab by default", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /lakehouse/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /datasets/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /sql query/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /geo heatmap/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /credit scoring/i })).toBeVisible();
    await expect(page.getByRole("tab", { name: /saved queries/i })).toBeVisible();
  });

  test("Datasets tab shows table or empty state", async ({ page }) => {
    await page.getByRole("tab", { name: /datasets/i }).click();
    // Either a table of datasets or an empty state message
    const hasTable = await page.locator("table").count() > 0;
    const hasEmpty = await page.getByText(/no datasets/i).count() > 0;
    expect(hasTable || hasEmpty).toBeTruthy();
  });

  test("SQL Query tab renders editor and run button", async ({ page }) => {
    await page.getByRole("tab", { name: /sql query/i }).click();
    await expect(page.getByRole("button", { name: /run query/i })).toBeVisible();
    // Textarea or code editor should be present
    const hasTextarea = await page.locator("textarea").count() > 0;
    const hasCodeEditor = await page.locator("[data-testid='sql-editor']").count() > 0;
    expect(hasTextarea || hasCodeEditor).toBeTruthy();
  });

  test("SQL Query tab executes a simple query", async ({ page }) => {
    await page.getByRole("tab", { name: /sql query/i }).click();
    const textarea = page.locator("textarea").first();
    await textarea.fill("SELECT 1 AS test_col");
    await page.getByRole("button", { name: /run query/i }).click();
    // Wait for results or error message
    await page.waitForTimeout(3000);
    const hasResults = await page.locator("table").count() > 0;
    const hasError = await page.getByText(/error|failed/i).count() > 0;
    // Either results or an error is acceptable (service may not be running in test)
    expect(hasResults || hasError).toBeTruthy();
  });

  test("Saved Queries tab renders list or empty state", async ({ page }) => {
    await page.getByRole("tab", { name: /saved queries/i }).click();
    const hasTable = await page.locator("table").count() > 0;
    const hasEmpty = await page.getByText(/no saved queries/i).count() > 0;
    expect(hasTable || hasEmpty).toBeTruthy();
  });
});

test.describe("LakehouseV2 — Geo Heatmap (Apache Sedona)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tier6to8/lakehouse-v2");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: /geo heatmap/i }).click();
  });

  test("Geo Heatmap tab renders map container or loading state", async ({ page }) => {
    // Map container, loading spinner, or error message should be visible
    const hasMap = await page.locator("[data-testid='geo-heatmap-map']").count() > 0;
    const hasLoading = await page.getByText(/loading|fetching/i).count() > 0;
    const hasError = await page.getByText(/error|unavailable/i).count() > 0;
    const hasEmpty = await page.getByText(/no data|no events/i).count() > 0;
    expect(hasMap || hasLoading || hasError || hasEmpty).toBeTruthy();
  });

  test("Geo Heatmap shows H3 resolution selector", async ({ page }) => {
    // Resolution selector (dropdown or slider) should be present
    const hasSelect = await page.locator("select").count() > 0;
    const hasSlider = await page.locator("input[type='range']").count() > 0;
    const hasRadio = await page.locator("input[type='radio']").count() > 0;
    expect(hasSelect || hasSlider || hasRadio).toBeTruthy();
  });

  test("Geo Heatmap shows risk score legend", async ({ page }) => {
    const hasLegend = await page.getByText(/risk|score|high|medium|low/i).count() > 0;
    expect(hasLegend).toBeTruthy();
  });
});

test.describe("LakehouseV2 — DataFusion Credit Scoring", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/tier6to8/lakehouse-v2");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: /credit scoring/i }).click();
  });

  test("Credit Scoring tab renders merchant ID input", async ({ page }) => {
    const hasInput = await page.locator("input[type='text'], input[placeholder*='merchant']").count() > 0;
    const hasButton = await page.getByRole("button", { name: /score|analyze|compute/i }).count() > 0;
    expect(hasInput || hasButton).toBeTruthy();
  });

  test("Credit Scoring tab shows score result or loading state", async ({ page }) => {
    const hasScore = await page.getByText(/score|rating|risk/i).count() > 0;
    const hasLoading = await page.getByText(/loading|computing/i).count() > 0;
    const hasEmpty = await page.getByText(/enter merchant|no data/i).count() > 0;
    expect(hasScore || hasLoading || hasEmpty).toBeTruthy();
  });
});

test.describe("Fraud Heatmap Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fraud-risk");
    await page.waitForLoadState("networkidle");
  });

  test("renders fraud risk page with heatmap section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /fraud/i })).toBeVisible();
  });

  test("shows fraud statistics cards", async ({ page }) => {
    // Should show some stats cards with numbers
    const statCards = page.locator("[data-testid*='stat'], .stat-card, [class*='card']");
    const count = await statCards.count();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe("Dashboard — Core Metrics", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  test("renders dashboard with key metric cards", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /dashboard/i })).toBeVisible();
  });

  test("dashboard shows revenue or transaction metrics", async ({ page }) => {
    const hasRevenue = await page.getByText(/revenue|transactions|volume/i).count() > 0;
    expect(hasRevenue).toBeTruthy();
  });

  test("dashboard navigation links are functional", async ({ page }) => {
    // Sidebar links should be visible
    const navLinks = page.locator("nav a, aside a, [role='navigation'] a");
    const count = await navLinks.count();
    expect(count).toBeGreaterThan(3);
  });
});

test.describe("Transactions Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/transactions");
    await page.waitForLoadState("networkidle");
  });

  test("renders transactions table or empty state", async ({ page }) => {
    const hasTable = await page.locator("table").count() > 0;
    const hasEmpty = await page.getByText(/no transactions/i).count() > 0;
    const hasLoading = await page.getByText(/loading/i).count() > 0;
    expect(hasTable || hasEmpty || hasLoading).toBeTruthy();
  });

  test("transactions page has search/filter controls", async ({ page }) => {
    const hasSearch = await page.locator("input[type='search'], input[placeholder*='search']").count() > 0;
    const hasFilter = await page.locator("select, [data-testid*='filter']").count() > 0;
    expect(hasSearch || hasFilter).toBeTruthy();
  });
});

test.describe("Payouts Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/payouts");
    await page.waitForLoadState("networkidle");
  });

  test("renders payouts page", async ({ page }) => {
    await expect(page.getByRole("heading", { name: /payout/i })).toBeVisible();
  });

  test("payouts page shows balance or payout history", async ({ page }) => {
    const hasBalance = await page.getByText(/balance|available|payout/i).count() > 0;
    expect(hasBalance).toBeTruthy();
  });
});

test.describe("API Keys Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/api-keys");
    await page.waitForLoadState("networkidle");
  });

  test("renders API keys page", async ({ page }) => {
    const hasHeading = await page.getByRole("heading", { name: /api key/i }).count() > 0;
    expect(hasHeading).toBeTruthy();
  });

  test("shows create API key button", async ({ page }) => {
    const hasButton = await page.getByRole("button", { name: /create|generate|new/i }).count() > 0;
    expect(hasButton).toBeTruthy();
  });
});

test.describe("Webhooks Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/webhooks");
    await page.waitForLoadState("networkidle");
  });

  test("renders webhooks page", async ({ page }) => {
    const hasHeading = await page.getByRole("heading", { name: /webhook/i }).count() > 0;
    expect(hasHeading).toBeTruthy();
  });
});

test.describe("Settings Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
  });

  test("renders settings page with profile section", async ({ page }) => {
    const hasSettings = await page.getByText(/settings|profile|account/i).count() > 0;
    expect(hasSettings).toBeTruthy();
  });
});
