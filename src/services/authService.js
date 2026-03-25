const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const config = require('../config');

const SALT_ROUNDS = 10;

const findAdmin = db.prepare('SELECT * FROM admins WHERE username = @username');
const findAdminById = db.prepare('SELECT id, username, display_name, created_at FROM admins WHERE id = @id');
const insertAdmin = db.prepare(`
  INSERT INTO admins (username, password_hash, display_name) VALUES (@username, @passwordHash, @displayName)
`);
const updateAdmin = db.prepare(`
  UPDATE admins SET username = @username, display_name = @displayName WHERE id = @id
`);
const updateAdminPassword = db.prepare(`
  UPDATE admins SET password_hash = @passwordHash WHERE id = @id
`);
const deleteAdmin = db.prepare('DELETE FROM admins WHERE id = @id');
const listAdmins = db.prepare('SELECT id, username, display_name, created_at FROM admins ORDER BY id');
const countAdmins = db.prepare('SELECT COUNT(*) as count FROM admins');

async function createAdmin(username, password, displayName = '') {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const result = insertAdmin.run({
    username,
    passwordHash,
    displayName: displayName || username,
  });
  return result.lastInsertRowid;
}

async function validateLogin(username, password) {
  const admin = findAdmin.get({ username });
  if (!admin) return null;
  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return null;
  return { id: admin.id, username: admin.username, displayName: admin.display_name };
}

function generateToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username },
    config.web.secret,
    { expiresIn: '24h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.web.secret);
}

async function seedDefaultAdmin() {
  const count = countAdmins.get().count;
  if (count > 0) return;

  await createAdmin(config.web.adminUser, config.web.adminPass, 'Administrator');
  console.log(`Default admin created: ${config.web.adminUser}`);
  if (config.web.adminPass === 'admin') {
    console.log('WARNING: Change the default admin password!');
  }
}

function getAdmins() {
  return listAdmins.all();
}

function getAdmin(id) {
  return findAdminById.get({ id });
}

async function changePassword(id, newPassword) {
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  updateAdminPassword.run({ id, passwordHash });
}

function editAdmin(id, { username, displayName }) {
  updateAdmin.run({ id, username, displayName });
}

function removeAdmin(id) {
  const count = countAdmins.get().count;
  if (count <= 1) throw new Error('Cannot delete the last admin.');
  deleteAdmin.run({ id });
}

module.exports = {
  createAdmin,
  validateLogin,
  generateToken,
  verifyToken,
  seedDefaultAdmin,
  getAdmins,
  getAdmin,
  changePassword,
  editAdmin,
  removeAdmin,
};
