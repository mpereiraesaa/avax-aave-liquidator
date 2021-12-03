const path = require('path');
const { BigNumber } = require('bignumber.js');
const Database = require('better-sqlite3');
const fetch = require("node-fetch");

BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

let db;

const PROTOCOL = "AAVE";
const NETWORK = "AVALANCHE";

const GET_TOKENS = `SELECT * FROM TOKEN_INFO`;
const GET_STABLE_DEBT_TOKENS = `SELECT * FROM TOKEN_INFO WHERE interest_rate_mode = 1;`;
const GET_RESERVES = `SELECT * FROM RESERVE_DATA`;
const GET_BALANCES = `
  SELECT
  rd.reserve, b.token, b.user, b.balance, ti.interest_rate_mode, rd.liquidity_index, rd.current_liquidity_rate, rd.variable_borrow_index, rd.current_variable_borrow_rate, rd.liquidation_threshold, rd.liquidation_bonus, rd.decimals, rd.last_update, rd.ltv, rd.reserve_factor, rd.asset_price
  FROM BALANCES b
  INNER JOIN RESERVE_DATA rd
  ON (b.token = rd.atoken_address OR b.token = rd.stable_debt_token_address OR b.token = rd.variable_debt_token_address)
  INNER JOIN TOKEN_INFO ti ON ti.token = b.token
  WHERE b.balance > 0
`;

async function getPendingPoolGasData() {
  const url = "https://gavax.blockscan.com/gasapi.ashx?apikey=key&method=pendingpooltxgweidata";
  const data = await fetch(url, {
    "headers": {},
    "body": null,
    "method": "GET"
  });
  const response = await data.json();
  return !!response.result ? response.result : {};
}

function getDBConnection() {
  const dbPath = path.resolve(__dirname, `../database/${PROTOCOL}_${NETWORK}.sqlite`);

  if (!db) {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');

    db.function('add_big_number', (a, b) => {
      return new BigNumber(a).plus(b).toString(10);
    });

    db.aggregate('add_all', {
      start: new BigNumber(0),
      step: (total, nextValue) => total.plus(new BigNumber(nextValue)),
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
  getPendingPoolGasData,
  getDBConnection,
  waitForTransactions,
  GET_TOKENS,
  GET_STABLE_DEBT_TOKENS,
  GET_RESERVES,
  GET_BALANCES,
};
