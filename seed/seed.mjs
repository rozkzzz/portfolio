// One-time seeder: uploads sample profile + entries into Firestore.
//
// Usage:
//   1. Firebase Console -> Project settings -> Service accounts
//      -> "Generate new private key" -> save as  seed/serviceAccount.json
//   2. cd seed && npm install
//   3. node seed.mjs
//
// serviceAccount.json is gitignored — never commit it.

import { readFile } from "node:fs/promises";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { sampleEntries, sampleProfile } from "../public/js/sample.js";

const key = JSON.parse(
  await readFile(new URL("./serviceAccount.json", import.meta.url), "utf8")
);

initializeApp({ credential: cert(key) });
const db = getFirestore();

async function run() {
  await db.collection("profile").doc("main").set(sampleProfile);
  console.log("✓ profile/main written");

  const batch = db.batch();
  for (const e of sampleEntries) {
    const { id, ...data } = e;
    batch.set(db.collection("entries").doc(id), data);
  }
  await batch.commit();
  console.log(`✓ ${sampleEntries.length} entries written`);
  console.log("Done. Set ENABLED = true in public/js/firebase-config.js");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
