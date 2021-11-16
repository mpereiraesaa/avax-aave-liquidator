global.currentConfiguration = require("./configuration.json");

const ethers = require('ethers');
const { BigNumber } = require("bignumber.js");
const { calculateBalance } = require("./functions");
const { getDBConnection, GET_BALANCES } = require('./utils');

BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

async function getAccounts(timestamp) {
  const db = getDBConnection();

  const balanceData = db.prepare(GET_BALANCES).all();
  const accountAssets = {};

  balanceData.forEach((data) => {
    const {
      ltv,
      liquidation_threshold: liquidationThreshold,
      decimals,
      asset_price: assetPrice,
      interest_rate_mode: mode,
      user,
      reserve,
    } = data;

    if (!accountAssets[user]) {
      accountAssets[user] = {
        totalCollateralInETH: new BigNumber(0),
        avgLtv: new BigNumber(0),
        avgLiquidationThreshold: new BigNumber(0),
        totalDebtInETH: new BigNumber(0),
        healthFactor: '',
        collateral: [],
        debt: []
      };
    }

    const calculatedBalance = calculateBalance(data, timestamp);
    const tokenUnit = 10**decimals;

    if (mode === 0) {
      const liquidityBalanceETH = new BigNumber(assetPrice).times(calculatedBalance).div(tokenUnit);

      accountAssets[user]['totalCollateralInETH'] = accountAssets[user]['totalCollateralInETH'].plus(liquidityBalanceETH);
      accountAssets[user]['avgLtv'] = accountAssets[user]['avgLtv'].plus(liquidityBalanceETH.times(ltv));
      accountAssets[user]['avgLiquidationThreshold'] = accountAssets[user]['avgLiquidationThreshold'].plus(liquidityBalanceETH.times(liquidationThreshold));

      accountAssets[user].collateral.push({ reserve, liquidityBalanceETH });
    }

    if (mode === 2) {
      const totalDebtInETH = accountAssets[user]['totalDebtInETH'].plus(
        new BigNumber(assetPrice).times(calculatedBalance).div(tokenUnit)
      );
      accountAssets[user]['totalDebtInETH'] = totalDebtInETH;
      accountAssets[user].debt.push({ reserve, totalDebtInETH });
    }
  });

  return accountAssets;
}

module.exports = { 
  getAccounts,
}
