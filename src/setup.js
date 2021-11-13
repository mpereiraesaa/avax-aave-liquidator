global.currentConfiguration = require("./configuration.json");

const ethers = require('ethers');
const { BigNumber } = ethers;
const { abi: LendingPoolABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/lendingpool/LendingPool.sol/LendingPool.json");
const addresses = require('./addresses/avax.json');
const { getDBConnection } = require('./utils');
const createTables = require('./createTables');

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

async function run() {
  await createTables();

  const db = getDBConnection();

  const lendingPool = new ethers.Contract(addresses.LendingPool, LendingPoolABI, provider);

  const reserves = await lendingPool.getReservesList();

  reserves.map(async (reserve) => {
    const reserveData = await lendingPool.getReserveData(reserve);
    const {
      configuration,
      aTokenAddress,
      stableDebtTokenAddress,
      variableDebtTokenAddress,
      variableBorrowIndex,
      currentVariableBorrowRate,
      liquidityIndex,
      currentLiquidityRate,
      lastUpdateTimestamp,
    } = reserveData;

    const LIQUIDATION_THRESHOLD_MASK = "4294901760";
    const LTV_MASK = "65535";
    const LIQUIDATION_BONUS_MASK = "281470681743360";
    const DECIMALS_MASK = "71776119061217280";
    const RESERVE_FACTOR_MASK = "1208907372870555465154560";

    const LIQUIDATION_THRESHOLD_START_BIT_POSITION = 16;
    const LIQUIDATION_BONUS_START_BIT_POSITION = 32;
    const RESERVE_DECIMALS_START_BIT_POSITION = 48;
    const RESERVE_FACTOR_START_BIT_POSITION = 64;

    const bnData = BigNumber.from(configuration[0]);

    const ltv = bnData.and(LTV_MASK).toString();
    const liquidationThreshold = bnData.and(LIQUIDATION_THRESHOLD_MASK).shr(LIQUIDATION_THRESHOLD_START_BIT_POSITION).toString();
    const liquidationsBonus = bnData.and(LIQUIDATION_BONUS_MASK).shr(LIQUIDATION_BONUS_START_BIT_POSITION).toString();
    const decimals = bnData.and(DECIMALS_MASK).shr(RESERVE_DECIMALS_START_BIT_POSITION).toString();
    const reserveFactor = bnData.and(RESERVE_FACTOR_MASK).shr(RESERVE_FACTOR_START_BIT_POSITION).toString();

    const stmt1 = db.prepare(`
      INSERT INTO RESERVE_DATA
        (
          reserve,
          atoken_address,
          stable_debt_token_address,
          variable_debt_token_address,
          ltv,
          liquidation_threshold,
          liquidation_bonus,
          decimals,
          reserve_factor,
          variable_borrow_index,
          current_variable_borrow_rate,
          liquidity_index,
          current_liquidity_rate,
          last_update,
          asset_price
        )
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(reserve)
      DO UPDATE SET asset_price=excluded.asset_price,variable_borrow_index=excluded.variable_borrow_index,current_variable_borrow_rate=excluded.current_variable_borrow_rate,liquidity_index=excluded.liquidity_index,current_liquidity_rate=excluded.current_liquidity_rate,last_update=excluded.last_update
    `);

    stmt1.run(
      reserve,
      aTokenAddress,
      stableDebtTokenAddress,
      variableDebtTokenAddress,
      ltv,
      liquidationThreshold,
      liquidationsBonus,
      decimals,
      reserveFactor,
      variableBorrowIndex.toString(),
      currentVariableBorrowRate.toString(),
      liquidityIndex.toString(),
      currentLiquidityRate.toString(),
      lastUpdateTimestamp,
      "",
    );

    const stmt2 = db.prepare(`
      INSERT INTO TOKEN_INFO
      (
        token,
        interest_rate_mode
      )
      VALUES
        (?,?)
      ON CONFLICT(token)
      DO NOTHING
    `);

    // Register aToken
    stmt2.run(aTokenAddress.toLowerCase(), 0);

    // Register Stable Debt token
    stmt2.run(stableDebtTokenAddress.toLowerCase(), 1);

    // Register Variable Debt token
    stmt2.run(variableDebtTokenAddress.toLowerCase(), 2);
  });
}

run();
