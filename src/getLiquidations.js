global.currentConfiguration = require("./configuration.json");

const { abi: LendingPoolABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/lendingpool/LendingPool.sol/LendingPool.json");
const ethers = require('ethers');
const { BigNumber } = require("bignumber.js");
const { calculateHealthFactorFromBalances } = require("@aave/protocol-js");
const { getAccounts } = require("./liquidations");
const { sync } = require('./synchronization');
const addresses = require('./addresses/avax.json');

BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

const NO_HEALTH_FACTOR = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

async function run() {
  await sync(100);

  const { timestamp } = await provider.getBlock('latest');

  const accounts = await getAccounts(timestamp);
  const liquidatableAccounts = [];

  const lendingPool = new ethers.Contract(addresses.LendingPool, LendingPoolABI, provider);

  for (acc of Object.keys(accounts).slice(0,5)) {
  // Object.keys(accounts).forEach(async (acc) => {
    const {
      totalCollateralInETH,
      avgLtv,
      avgLiquidationThreshold,
      totalDebtInETH,
      collateral,
      debt
    } = accounts[acc];

    const finalAvgLtv = totalCollateralInETH.gt(0) ? avgLtv.div(totalCollateralInETH) : 0;
    const finalAvgLiquidationThreshold = totalCollateralInETH.gt(0) ? avgLiquidationThreshold.div(totalCollateralInETH) : 0;
    const healthFactor = calculateHealthFactorFromBalances(
      totalCollateralInETH,
      totalDebtInETH,
      finalAvgLiquidationThreshold,
    );

    const data = await lendingPool.getUserAccountData(acc);
    const [
      totalCollateralETH2,
      totalDebtETH2,
      availableBorrowsETH2,
      currentLiquidationThreshold2,
      ltv2,
      healthFactor2
    ] = data;

    // console.log(totalCollateralETH2.toString(), totalCollateralInETH.toString(10));
    console.log(healthFactor2.toHexString() === NO_HEALTH_FACTOR ? -1 : healthFactor2.toString(), healthFactor.toString(10));
  };
}

run();
