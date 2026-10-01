import { backupDb, dbStatus } from "../server/db.ts";

/** Snapshot the local database so the workspace can always be restored. */

const status = dbStatus();
console.log(`database: ${status.path}`);
console.log(`size:     ${(status.bytes / 1024 / 1024).toFixed(2)} MB`);

if (!status.ok) {
  console.warn(`integrity check reported: ${status.message}`);
}

const dest = backupDb();
console.log(`backup:   ${dest}`);
if (status.lastBackup) console.log(`previous: ${status.lastBackup}`);
