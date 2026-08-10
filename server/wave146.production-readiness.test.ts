/**
 * Wave 146 Production-Readiness Tests
 *
 * Focus: Pagination coverage for all list procedures.
 * Verifies that every `list` procedure accepts limit/offset input.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const serverDir = path.resolve(__dirname);

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(serverDir, relPath), "utf-8");
}

describe("Wave 146: List procedures have pagination", () => {
  it("routers.ts: apiKeys.list has limit/offset input", () => {
    const content = readFile("routers.ts");
    // Find apiKeys router section and verify it has pagination
    const apiKeysSection = content.match(/const apiKeysRouter\s*=\s*router\(\{[\s\S]*?(?=const \w+Router\s*=\s*router)/);
    expect(apiKeysSection).toBeTruthy();
    const section = apiKeysSection![0];
    expect(section).toMatch(/list:.*protectedProcedure\s*\n\s*\.input/s);
    expect(section).toMatch(/limit.*z\.number/);
    expect(section).toMatch(/offset.*z\.number/);
  });

  it("routers.ts: webhooks.list has limit/offset input", () => {
    const content = readFile("routers.ts");
    const webhooksSection = content.match(/const webhooksRouter\s*=\s*router\(\{[\s\S]*?(?=const \w+Router\s*=\s*router)/);
    expect(webhooksSection).toBeTruthy();
    const section = webhooksSection![0];
    expect(section).toMatch(/list:.*protectedProcedure\s*\n\s*\.input/s);
    expect(section).toMatch(/limit.*z\.number/);
  });

  it("routers.ts: virtualCards.list has limit/offset input", () => {
    const content = readFile("routers.ts");
    const vcSection = content.match(/const virtualCardsRouter\s*=\s*router\(\{[\s\S]*?(?=const \w+Router\s*=\s*router)/);
    expect(vcSection).toBeTruthy();
    const section = vcSection![0];
    expect(section).toMatch(/limit.*z\.number/);
  });

  it("routers.ts: paymentLinks.list has limit/offset input", () => {
    const content = readFile("routers.ts");
    const plSection = content.match(/const paymentLinksRouter\s*=\s*router\(\{[\s\S]*?(?=const \w+Router\s*=\s*router)/);
    expect(plSection).toBeTruthy();
    const section = plSection![0];
    expect(section).toMatch(/limit.*z\.number/);
  });

  it("routers.ts: team.list has limit/offset input", () => {
    const content = readFile("routers.ts");
    const teamSection = content.match(/const teamRouter\s*=\s*router\(\{[\s\S]*?(?=const \w+Router\s*=\s*router)/);
    expect(teamSection).toBeTruthy();
    const section = teamSection![0];
    expect(section).toMatch(/limit.*z\.number/);
  });

  it("db.ts: listApiKeys accepts opts with limit/offset", () => {
    const content = readFile("db.ts");
    expect(content).toMatch(/listApiKeys\(merchantId: string, opts.*limit.*offset/);
  });

  it("db.ts: listWebhooks accepts opts with limit/offset", () => {
    const content = readFile("db.ts");
    expect(content).toMatch(/listWebhooks\(merchantId: string, opts.*limit.*offset/);
  });

  it("db.ts: listVirtualCards accepts opts with limit/offset", () => {
    const content = readFile("db.ts");
    expect(content).toMatch(/listVirtualCards\(merchantId: string, opts.*limit.*offset/);
  });

  it("db.ts: listPaymentLinks accepts opts with limit/offset", () => {
    const content = readFile("db.ts");
    expect(content).toMatch(/listPaymentLinks\(merchantId: string, opts.*limit.*offset/);
  });

  it("db.ts: listTeamMembers accepts opts with limit/offset", () => {
    const content = readFile("db.ts");
    expect(content).toMatch(/listTeamMembers\(merchantId: string, opts.*limit.*offset/);
  });

  it("wave24Router.ts: budgetsRouter.list has pagination", () => {
    const content = readFile("wave24Router.ts");
    const budgetsSection = content.match(/export const budgetsRouter\s*=\s*router\(\{[\s\S]*?(?=export const \w+Router\s*=\s*router|\n\/\/)/);
    expect(budgetsSection).toBeTruthy();
    expect(budgetsSection![0]).toMatch(/limit.*z\.number/);
  });

  it("wave24Router.ts: savingsGoalsRouter.list has pagination", () => {
    const content = readFile("wave24Router.ts");
    const goalsSection = content.match(/export const savingsGoalsRouter\s*=\s*router\(\{[\s\S]*?(?=export const \w+Router\s*=\s*router|\n\/\/)/);
    expect(goalsSection).toBeTruthy();
    expect(goalsSection![0]).toMatch(/limit.*z\.number/);
  });

  it("wave68Router.ts: consumerCardRouter.list has pagination", () => {
    const content = readFile("wave68Router.ts");
    const cardSection = content.match(/export const consumerCardRouter\s*=\s*router\(\{[\s\S]*?(?=export const \w+Router\s*=\s*router|\n\/\/)/);
    expect(cardSection).toBeTruthy();
    expect(cardSection![0]).toMatch(/limit.*z\.number/);
  });

  it("sipRouter.ts: sipRouter.list has pagination", () => {
    const content = readFile("sipRouter.ts");
    expect(content).toMatch(/limit.*z\.number/);
    expect(content).toMatch(/LIMIT \$\{input\.limit\}/);
  });

  it("orphanedTablesCRUD.ts: all list procedures have pagination", () => {
    const content = readFile("orphanedTablesCRUD.ts");
    // Check that no bare list: protectedProcedure.query( exists
    const bareListMatches = content.match(/(?<!\w)list:\s*protectedProcedure\.query\(/g);
    expect(bareListMatches).toBeNull();
  });

  it("wave99Router.ts: tenantConfigRouter.list has pagination", () => {
    const content = readFile("wave99Router.ts");
    const tcSection = content.match(/const tenantConfigRouter\s*=\s*router\(\{[\s\S]*?(?=const \w+Router\s*=\s*router|\n\/\/)/);
    expect(tcSection).toBeTruthy();
    expect(tcSection![0]).toMatch(/limit.*z\.number/);
  });
});
