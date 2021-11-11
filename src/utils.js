const path = require('path');
const { BigNumber } = require('bignumber.js');
const Database = require('better-sqlite3');

BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

let db;

const PROTOCOL = "BLIZZ";
const NETWORK = "AVALANCHE";

const GET_TOKENS = `SELECT * FROM TOKEN_INFO`;
const GET_STABLE_DEBT_TOKENS = `SELECT * FROM TOKEN_INFO WHERE interest_rate_mode = 1;`;
const GET_RESERVES = `SELECT * FROM RESERVE_DATA`;

function getDBConnection() {
  const dbPath = path.resolve(__dirname, `../database/${PROTOCOL}_${NETWORK}.sqlite`);

  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.function('add_big_number', (a, b) => {
      return new BigNumber(a).plus(b).toString(10);
    });

    db.aggregate('add_all', {
      start: 0,
      step: (total, nextValue) => new BigNumber(total).plus(nextValue),
      result: total => total.toString(10)
    });
  }

  return db;
}

async function waitForTransactions() {
  let inTransaction = getDBConnection().inTransaction;

  return new Promise((resolve, reject) => {
    while (inTransaction) {
      inTransaction = getDBConnection().inTransaction;
    }
    resolve();
  });
}

module.exports = {
  getDBConnection,
  waitForTransactions,
  GET_TOKENS,
  GET_STABLE_DEBT_TOKENS,
  GET_RESERVES,
};
