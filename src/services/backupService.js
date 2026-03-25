const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db/connection');

const BACKUP_DIR = path.resolve(path.dirname(config.db.path), 'backups');
const MAX_BACKUPS = 20;

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

function createBackup(label = '') {
  ensureBackupDir();

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const safeName = label ? `_${label.replace(/[^a-zA-Z0-9_-]/g, '')}` : '';
  const filename = `backup_${timestamp}${safeName}.db`;
  const backupPath = path.join(BACKUP_DIR, filename);

  // Use SQLite's backup API via better-sqlite3
  db.backup(backupPath);

  const stat = fs.statSync(backupPath);

  // Enforce max backup limit — delete oldest
  pruneOldBackups();

  return {
    filename,
    path: backupPath,
    size: stat.size,
    sizeFormatted: formatSize(stat.size),
    createdAt: now.toISOString(),
    label: label || null,
  };
}

function listBackups() {
  ensureBackupDir();

  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
    .sort()
    .reverse();

  return files.map(filename => {
    const filePath = path.join(BACKUP_DIR, filename);
    const stat = fs.statSync(filePath);

    // Extract label from filename: backup_2024-01-15_12-30-00_label.db
    const match = filename.match(/^backup_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}(?:_(.+))?\.db$/);
    const label = match?.[1] || null;

    // Extract timestamp
    const tsMatch = filename.match(/^backup_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/);
    let createdAt = stat.mtime.toISOString();
    if (tsMatch) {
      createdAt = `${tsMatch[1]}-${tsMatch[2]}-${tsMatch[3]}T${tsMatch[4]}:${tsMatch[5]}:${tsMatch[6]}`;
    }

    return {
      filename,
      size: stat.size,
      sizeFormatted: formatSize(stat.size),
      createdAt,
      label,
    };
  });
}

function getBackupPath(filename) {
  // Prevent path traversal
  const safe = path.basename(filename);
  const filePath = path.join(BACKUP_DIR, safe);
  if (!fs.existsSync(filePath)) return null;
  return filePath;
}

function deleteBackup(filename) {
  const filePath = getBackupPath(filename);
  if (!filePath) throw new Error(`Backup "${filename}" not found.`);
  fs.unlinkSync(filePath);
}

function restoreBackup(filename) {
  const filePath = getBackupPath(filename);
  if (!filePath) throw new Error(`Backup "${filename}" not found.`);

  // Create a safety backup before restoring
  createBackup('pre-restore');

  const dbPath = path.resolve(config.db.path);

  // Close WAL and checkpoint
  db.pragma('wal_checkpoint(TRUNCATE)');

  // Copy backup over the current database
  fs.copyFileSync(filePath, dbPath);

  return { restored: filename, message: 'Database restored. Restart the application for changes to take full effect.' };
}

function pruneOldBackups() {
  const backups = listBackups();
  if (backups.length <= MAX_BACKUPS) return 0;

  const toDelete = backups.slice(MAX_BACKUPS);
  let deleted = 0;
  for (const b of toDelete) {
    try {
      const filePath = path.join(BACKUP_DIR, b.filename);
      fs.unlinkSync(filePath);
      deleted++;
    } catch (_) {}
  }
  return deleted;
}

function getBackupStats() {
  const backups = listBackups();
  const totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  const dbPath = path.resolve(config.db.path);
  const dbSize = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;

  return {
    count: backups.length,
    totalSize,
    totalSizeFormatted: formatSize(totalSize),
    dbSize,
    dbSizeFormatted: formatSize(dbSize),
    maxBackups: MAX_BACKUPS,
    backupDir: BACKUP_DIR,
    latestBackup: backups.length > 0 ? backups[0] : null,
  };
}

function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

module.exports = {
  createBackup,
  listBackups,
  getBackupPath,
  deleteBackup,
  restoreBackup,
  pruneOldBackups,
  getBackupStats,
  BACKUP_DIR,
};
