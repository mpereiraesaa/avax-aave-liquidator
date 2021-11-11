const ethers = require('ethers');
const { abi: LendingPoolABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/lendingpool/LendingPool.sol/LendingPool.json");
const { abi: AddressesProviderABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/configuration/LendingPoolAddressesProvider.sol/LendingPoolAddressesProvider.json");
const { abi: PriceOracleGetterABI } = require("@aave/protocol-v2/artifacts/contracts/interfaces/IPriceOracleGetter.sol/IPriceOracleGetter.json");

const addresses = require('../addresses/avax.json');
const { getDBConnection, GET_RESERVES, waitForTransactions } = require('../utils');

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

const syncReserves = async () => {
  const db = getDBConnection();

  const lendingPool = new ethers.Contract(addresses.LendingPool, LendingPoolABI, provider);

  const reserves = db.prepare(GET_RESERVES).all();
  const reserveAddresses = reserves.map((reserve) => reserve.reserve);

  const addressProvider = new ethers.Contract(addresses.LendingPoolAddressProvider, AddressesProviderABI, provider);

  const oracleAddress = await addressProvider.getPriceOracle();
  const oracle = new ethers.Contract(oracleAddress, PriceOracleGetterABI, provider);

  const update = await Promise.all(reserveAddresses.map(async (reserve) => {
    const reserveData = await lendingPool.getReserveData(reserve);
    const {
      variableBorrowIndex,
      currentVariableBorrowRate,
      liquidityIndex,
      currentLiquidityRate,
      lastUpdateTimestamp,
    } = reserveData;

    const price = await oracle.getAssetPrice(reserve);

    return [reserve, variableBorrowIndex, currentVariableBorrowRate, liquidityIndex, currentLiquidityRate, lastUpdateTimestamp, price];
  }));

  const stmt = db.prepare(`
    UPDATE RESERVE_DATA
    SET variable_borrow_index=?, current_variable_borrow_rate=?,liquidity_index=?,current_liquidity_rate=?,last_update=?,asset_price=?
    WHERE reserve = ?    
  `);

  db.transaction(() => {
    update.forEach((upd) => {
      stmt.run(upd[1], upd[2], upd[3], upd[4], upd[5], upd[6], upd[0]);
    });
  })();

  await waitForTransactions();
}

module.exports = { syncReserves };
