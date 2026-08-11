import { createConnection } from "mysql2/promise";

const conn = await createConnection(process.env.DATABASE_URL! + '?ssl={"rejectUnauthorized":false}');
try {
  await conn.execute(`
    ALTER TABLE merchants 
    ADD COLUMN ussd_lang_picker_enabled tinyint(1) NOT NULL DEFAULT 1
  `);
  console.log("Column ussd_lang_picker_enabled added successfully");
} catch (e: any) {
  if (e.code === "ER_DUP_FIELDNAME") {
    console.log("Column already exists — skipping");
  } else {
    console.error("Error:", e.message, e.code);
  }
}
await conn.end();
