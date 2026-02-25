const prisma = require('../db');

async function log(action, actor, details = null) {
  try {
    await prisma.auditLog.create({
      data: { action, actor, details },
    });
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

module.exports = { log };
