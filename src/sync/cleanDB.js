const { getDBConnection } = require('../utils');

function cleanDB() {
  const db = getDBConnection();
  const stmt = db.prepare(`DELETE FROM TRANSFERS`);

  db.transaction(() => {
    stmt.run();
  })();
}

module.exports = { cleanDB }
