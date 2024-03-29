require('dotenv').config({ path: '../.env' });

global.currentConfiguration = require("./configuration.json");

const { abi: LiquidatorABI } = require("../artifacts/contracts/Liquidator.sol/Liquidator.json");
const { abi: PriceOracleGetterABI } = require("@aave/protocol-v2/artifacts/contracts/interfaces/IPriceOracleGetter.sol/IPriceOracleGetter.json");

const ethers = require('ethers');
const { BigNumber } = require("bignumber.js");
const { calculateHealthFactorFromBalances, pow10, LTV_PRECISION } = require("@aave/protocol-js");
const { getAccounts } = require("./liquidations");
const { sync } = require('./synchronization');
const addresses = require("./addresses/avax.json");
const { getPendingPoolGasData } = require("./utils");

// BigNumber.config({ DECIMAL_PLACES: 0, ROUNDING_MODE: BigNumber.ROUND_DOWN });

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

const wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
const mainAccount = wallet.connect(provider);

// const NO_HEALTH_FACTOR = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

const BASE_GAS_LIMIT = 2000000;
const LIQUIDATION_CLOSE_FACTOR_PERCENT = 4900; // max is 5000
let IS_RUNNING = false;
let LIQUIDATION_IN_PROCESS = false;
let FAILED_TRANSACTIONS = 0;

const liquidator = new ethers.Contract(currentConfiguration.liquidator, LiquidatorABI, provider);

const WRAPPED_AVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

async function run() {
  const oracle = new ethers.Contract(addresses.AaveOracle, PriceOracleGetterABI, provider);

  const [gasPrice, AVAX_PRICE, AVAX_BALANCE, { timestamp, number: blockNumber }, { data: gasData }] = await Promise.all([
    provider.getGasPrice(),
    oracle.getAssetPrice(WRAPPED_AVAX),
    provider.getBalance(mainAccount.address),
    provider.getBlock('latest'),
    getPendingPoolGasData(),
  ]);

  const accounts = getAccounts(timestamp);

  let maxPendingGas;
  let maxPendingGasAtBlock;

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

      const rewards = debtToCoverETH.toString()/1e18 * 0.08; // 8% at least premium.
      const estimatedGasLimit = 1300000;
      let estimatedGasPrice = gasPrice.mul(405).div(100).toString(); // increase 205%

      const slippage = 0.97;
      const maximumAVAXavailable = (((AVAX_BALANCE.toString() / 1e18) / BASE_GAS_LIMIT) * 1e9) * slippage;

      if (!maxPendingGas || (!!maxPendingGasAtBlock && maxPendingGasAtBlock !== blockNumber)) {
        maxPendingGas = JSON.parse(gasData)[0][0];
        maxPendingGasAtBlock = blockNumber;
        console.log(`Found pending gas: ${maxPendingGas} at block ${maxPendingGasAtBlock}`);
      }

      if (maxPendingGas > (estimatedGasPrice/1e9)) {
        estimatedGasPrice = ((maxPendingGas * 1e9)*1.02).toString();
      }

      const BASE_nAVAX = 395;

      if ((estimatedGasPrice/1e9) < BASE_nAVAX) {
        estimatedGasPrice = ((((Math.random()*1e-1) + 1 ) * BASE_nAVAX) * 1e9).toString();
        const index = estimatedGasPrice.indexOf(".");
        estimatedGasPrice = estimatedGasPrice.slice(0, index);
      }

      let tip = (rewards * 0.11); // 11%

      if (rewards > 900.0) {
        tip = tip / (AVAX_PRICE / 1e18);
        tip = tip / BASE_GAS_LIMIT;
        tip = (tip * 1e9).toString();
        const index = tip.indexOf(".") > 0 ? tip.indexOf(".") : tip.length;
        tip = tip.slice(0, index);

        if ((tip/1e9) > (estimatedGasPrice/1e9)) {
          estimatedGasPrice = tip;
        }
      }

      if ((estimatedGasPrice/1e9) > maximumAVAXavailable) {
        estimatedGasPrice = (maximumAVAXavailable * 1e9).toString();
        const index = estimatedGasPrice.indexOf(".");
        estimatedGasPrice = estimatedGasPrice.slice(0, index);
      }

      const finalCost = ((estimatedGasPrice * estimatedGasLimit) / 1e18) * (AVAX_PRICE / 1e18);

      console.log(`possible tip: ${tip/1e9}`);
      console.log(`maximumAVAXavailable: ${maximumAVAXavailable}`);
      console.log(`estimatedGasPrice: ${estimatedGasPrice / 1e9}`);
      console.log(`rewards: ${rewards}`);
      console.log(`maxPendingGas: ${maxPendingGas}`);
      console.log(`finalCost: ${finalCost}`);

      if (rewards > finalCost && !LIQUIDATION_IN_PROCESS) {
        LIQUIDATION_IN_PROCESS = true;

        const tx = await liquidator.populateTransaction.doLiquidate(
          acc,
          collateralAsset,
          selectedDebtAsset,
          debtToCover.toString(10)
        );
        tx.gasLimit = BASE_GAS_LIMIT;
        tx.gasPrice = estimatedGasPrice;
        tx.type = 0;
        tx.maxFeePerGas = null;
        tx.maxPriorityFeePerGas = null;

        console.log("Liquidating account...");
        const txSent = await mainAccount.sendTransaction(tx);
        console.log("Waiting for transaction");
        const txReceipt = await txSent.wait();
        console.log(txReceipt);

        LIQUIDATION_IN_PROCESS = false;
        FAILED_TRANSACTIONS = 0; // reset counter for throttling
      }

    }
  };
}

provider.on('block', async (blockNumber) => {
  if (IS_RUNNING) {
    return;
  }

  IS_RUNNING = true;

  console.time(`Synchronization`);
  await sync(100);
  console.timeEnd(`Synchronization`);

  try {
    console.time(`Looping accounts`);
    await run();
    console.timeEnd(`Looping accounts`);
  } catch (err) {
    console.log(err);
    FAILED_TRANSACTIONS += 1;

    if (FAILED_TRANSACTIONS >= 2) {
      // STOP LIQUIDATIONS ATTEMPTS
      LIQUIDATION_IN_PROCESS = true;

      // throttle 15 secs
      // await new Promise(r => setTimeout(r, 15000));
    } else {
      LIQUIDATION_IN_PROCESS = false;
    }
  }

  IS_RUNNING = false;
});
