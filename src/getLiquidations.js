global.currentConfiguration = require("./configuration.json");

const { abi: LendingPoolABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/lendingpool/LendingPool.sol/LendingPool.json");
const ethers = require('ethers');
const { BigNumber } = require("bignumber.js");
const { calculateHealthFactorFromBalances, pow10, LTV_PRECISION } = require("@aave/protocol-js");
const { getAccounts } = require("./liquidations");
const { sync } = require('./synchronization');
const addresses = require('./addresses/avax.json');

// BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

// const NO_HEALTH_FACTOR = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

const LIQUIDATION_CLOSE_FACTOR_PERCENT = 4900; // max is 5000

async function run() {
  const { timestamp } = await provider.getBlock('latest');

  const accounts = await getAccounts(timestamp);
  // const lendingPool = new ethers.Contract(addresses.LendingPool, LendingPoolABI, provider);

  for (acc of Object.keys(accounts)) {
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

    // const data = await lendingPool.getUserAccountData(acc);
    // const [
    //   totalCollateralETH2,
    //   totalDebtETH2,
    //   availableBorrowsETH2,
    //   currentLiquidationThreshold2,
    //   ltv2,
    //   healthFactor2
    // ] = data;
    // console.log(healthFactor2.toHexString() === NO_HEALTH_FACTOR ? -1 : healthFactor2.toString(), healthFactor.toString());

    if (!healthFactor.eq(-1) && healthFactor.lt(1)) {
      console.log(`Liquidation found for ${acc}`);

      let collateralAsset;
      let maxCollateralAmountAvailable = new BigNumber(0);
      let liquidationBonus;
      let collateralAssetPrice;
      let collateralDecimals;
      let selectedDebtAsset;
      let debtToCoverETH = new BigNumber(0);
      let debtToCover = new BigNumber(0);

      collateral.forEach((asset) => {
        if (asset.liquidityBalanceETH > maxCollateralAmountAvailable) {
          maxCollateralAmountAvailable = asset.liquidityBalanceETH;
          collateralAsset = asset.reserve;
          liquidationBonus = asset.liquidationBonus;
          collateralAssetPrice = asset.assetPrice;
          collateralDecimals = asset.decimals;
        }
      });

      debt.forEach((asset) => {
        let maxLiquidatableDebtETH = asset.totalDebtInETH.multipliedBy(LIQUIDATION_CLOSE_FACTOR_PERCENT).dividedBy(pow10(LTV_PRECISION))
          .times(liquidationBonus).div(pow10(LTV_PRECISION));

        if (maxLiquidatableDebtETH.gt(maxCollateralAmountAvailable)) {
          maxLiquidatableDebtETH = maxCollateralAmountAvailable;
        }

        if (maxLiquidatableDebtETH.gt(debtToCoverETH)) {
          debtToCoverETH = maxLiquidatableDebtETH;
          selectedDebtAsset = asset.reserve;

          debtToCover = debtToCoverETH.times(pow10(asset.decimals))
            .div(asset.assetPrice)
            .div(liquidationBonus)
            .times(pow10(LTV_PRECISION)).toString()
        }
      });

      console.log(`collateralAsset: ${collateralAsset}`);
      console.log(`debtAsset: ${selectedDebtAsset}`);
      console.log(`debtToCover: ${debtToCover.toString()}`);
      console.log(`debtToCoverUSD: ${debtToCoverETH.toString()/1e18}`);
      console.log(`user: ${acc}`);
    }
  };
}

provider.on('block', async (blockNumber) => {
  console.time(`Synchronization ${blockNumber}`);
  await sync(100);
  console.timeEnd(`Synchronization ${blockNumber}`);

  await run();
});

