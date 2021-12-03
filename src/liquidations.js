global.currentConfiguration = require("./configuration.json");

const { BigNumber } = require("bignumber.js");
const { calculateBalance } = require("./functions");
const { getDBConnection, GET_BALANCES } = require('./utils');

// BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

const ZERO = new BigNumber(0);

function getAccounts(timestamp) {
  const db = getDBConnection();

  console.time(`Query takes`);
  const balanceData = db.prepare(GET_BALANCES).all();
  const accountAssets = {};
  console.timeEnd(`Query takes`);

  console.time(`Calculating.`);

  for(let i = balanceData.length-1; i>=0; i--) {
    const data = balanceData[i];
  // balanceData.forEach((data) => {
    const {
      ltv,
      liquidation_threshold: liquidationThreshold,
      decimals,
      asset_price: assetPrice,
      interest_rate_mode: mode,
      user,
      reserve,
      liquidation_bonus: liquidationBonus,
    } = data;

    if (!accountAssets[user]) {
      accountAssets[user] = {
        totalCollateralInETH: ZERO,
        avgLtv: ZERO,
        avgLiquidationThreshold: ZERO,
        totalDebtInETH: ZERO,
        healthFactor: '',
        collateral: [],
        debt: []
      };
    }

    const calculatedBalance = calculateBalance(data, timestamp);
    const tokenUnit = 10**decimals;

    if (mode == 0) {
      const liquidityBalanceETH = new BigNumber(assetPrice * 1e10).times(calculatedBalance).div(tokenUnit);

      accountAssets[user]['totalCollateralInETH'] = accountAssets[user]['totalCollateralInETH'].plus(liquidityBalanceETH);
      accountAssets[user]['avgLtv'] = accountAssets[user]['avgLtv'].plus(liquidityBalanceETH.times(ltv));
      accountAssets[user]['avgLiquidationThreshold'] = accountAssets[user]['avgLiquidationThreshold'].plus(liquidityBalanceETH.times(liquidationThreshold));

      accountAssets[user].collateral.push({ reserve, liquidityBalanceETH, liquidationBonus, assetPrice, decimals });
    }

    if (mode == 2) {
      const totalDebtInETH = accountAssets[user]['totalDebtInETH'].plus(
        new BigNumber(assetPrice * 1e10).times(calculatedBalance).div(tokenUnit)
      );
      accountAssets[user]['totalDebtInETH'] = totalDebtInETH;
      accountAssets[user].debt.push({ reserve, totalDebtInETH, calculatedBalance, assetPrice, decimals });
    }
  };

  console.timeEnd(`Calculating.`);

  return accountAssets;
}

module.exports = { 
  getAccounts,
}
