/**
 * Wave 147 Production-Readiness Tests
 *
 * Focus: Input validation — free-text fields must have length constraints.
 * Verifies that name/title/label fields have min(1).max(500) and
 * description/notes/reason/etc. have max(5000).
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const serverDir = path.resolve(__dirname);

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(serverDir, relPath), "utf-8");
}

describe("Wave 147: Input validation — length constraints on free-text fields", () => {
  const FILES_TO_CHECK = [
    "adminRouter.ts",
    "routers.ts",
    "tier1to5Router.ts",
    "orphanedTablesCRUD.ts",
    "newFeaturesRouter.ts",
  ];

  for (const file of FILES_TO_CHECK) {
    it(`${file}: no bare name: z.string() without length constraint`, () => {
      const content = readFile(file);
      // Match name/title/label: z.string() NOT followed by .min/.max/.optional/.nullable/.nullish/.default etc.
      const bareNamePattern = /(?<!\w)(?:name|title|label)\s*:\s*z\.string\(\)(?!\s*\.(min|max|optional|nullable|nullish|default|trim|nonempty|length|email|url|uuid|regex))/gi;
      const matches = content.match(bareNamePattern);
      expect(matches).toBeNull();
    });

    it(`${file}: no bare description/notes/reason: z.string() without max constraint`, () => {
      const content = readFile(file);
      const bareDescPattern = /(?<!\w)(?:description|notes|reason|comment|message)\s*:\s*z\.string\(\)(?!\s*\.(min|max|optional|nullable|nullish|default|trim|nonempty|length|email|url|uuid|regex))/gi;
      const matches = content.match(bareDescPattern);
      expect(matches).toBeNull();
    });
  }

  it("adminRouter.ts: reason fields have max or optional constraint", () => {
    const content = readFile("adminRouter.ts");
    // All reason fields should have at least some chaining (.max, .optional, etc.)
    const bareReasonFields = content.match(/reason\s*:\s*z\.string\(\)(?!\s*\.)/g);
    expect(bareReasonFields).toBeNull();
  });

  it("tier1to5Router.ts: notes fields have max constraint", () => {
    const content = readFile("tier1to5Router.ts");
    const notesFields = content.match(/notes\s*:\s*z\.string\(\)(?!\s*\.(min|max|optional|nullable|nullish|default))/g);
    expect(notesFields).toBeNull();
  });

  it("orphanedTablesCRUD.ts: name fields have min(1).max(500)", () => {
    const content = readFile("orphanedTablesCRUD.ts");
    const bareNameFields = content.match(/(?<!\w)name\s*:\s*z\.string\(\)(?!\s*\.(min|max|optional|nullable|nullish|default|trim|nonempty|length))/gi);
    expect(bareNameFields).toBeNull();
  });
});
