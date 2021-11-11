const { getDBConnection } = require('./utils');

function createTables() {
  const db = getDBConnection();

  db.exec(`
    CREATE TABLE IF NOT EXISTS LIQUIDATIONS
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      debt_asset VARCHAR(255),
      liquidator VARCHAR(255),
      borrower VARCHAR(255),
      debt_to_cover VARCHAR(255),
      collateral_asset VARCHAR(255),
      liquidated_collateral_amount VARCHAR(255),
      receive_atoken TINYINT(1),
      block_number BIGINT,
      transaction_hash VARCHAR(255) UNIQUE NOT NULL,
      log_index VARCHAR(255)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS TRANSFERS
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token VARCHAR(255),
      user VARCHAR(255),
      amount VARCHAR(255),
      transfer_unique_id VARCHAR(255) UNIQUE NOT NULL,
      block_number BIGINT,
      transaction_hash VARCHAR(255),
      log_index VARCHAR(255)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS BALANCES
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token VARCHAR(255),
      user VARCHAR(255),
      balance VARCHAR(255),
      token_user_unique_id VARCHAR(255) UNIQUE NOT NULL,
      last_block BIGINT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS MINTABLE_DEBT
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token VARCHAR(255),
      user VARCHAR(255),
      new_rate VARCHAR(255),
      timestamp BIGINT,
      token_user_unique_id VARCHAR(255) UNIQUE NOT NULL
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS TOKEN_INFO
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token VARCHAR(255) UNIQUE NOT NULL,
      interest_rate_mode TINYINT(1) DEFAULT 0
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS RESERVE_DATA
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reserve VARCHAR(255) UNIQUE NOT NULL,
      atoken_address VARCHAR(255),
      stable_debt_token_address VARCHAR(255),
      variable_debt_token_address VARCHAR(255),
      ltv VARCHAR(255),
      liquidation_threshold VARCHAR(255),
      liquidation_bonus VARCHAR(255),
      reserve_factor VARCHAR(255),
      variable_borrow_index VARCHAR(255),
      current_variable_borrow_rate VARCHAR(255),
      liquidity_index VARCHAR(255),
      current_liquidity_rate VARCHAR(255),
      last_update BIGINT,
      asset_price VARCHAR(255),
      decimals INTEGER
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS SYNCHRONIZED_BLOCKS
    (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at DEFAULT CURRENT_TIMESTAMP,
      block_number BIGINT
    )
  `);
}

module.exports = createTables;
