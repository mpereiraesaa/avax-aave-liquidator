const { getDBConnection } = require('../utils');

function syncAccountBalances() {
  const db = getDBConnection();

  const stmt = db.prepare(`
    INSERT INTO BALANCES
      (token, user, balance, token_user_unique_id, last_block)
      SELECT
        LOWER(token),
        user,
        add_all(amount) as balance,
        token || user as token_user_unique_id,
        MAX(block_number) as last_block
      FROM TRANSFERS
      WHERE block_number > COALESCE((SELECT last_block FROM BALANCES ORDER BY last_block DESC LIMIT 1), -1)
      GROUP BY token, user
    ON CONFLICT(token_user_unique_id)
    DO UPDATE SET balance = add_big_number(balance, excluded.balance), last_block = excluded.last_block
  `);

  db.transaction(() => {
    stmt.run();
  })();
}

module.exports = { syncAccountBalances }
