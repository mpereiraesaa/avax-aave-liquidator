global.currentConfiguration = require("./configuration.json");

const ethers = require('ethers');
const { abi: aTokenABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/tokenization/AToken.sol/AToken.json");
const { abi: variableDebtABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/tokenization/VariableDebtToken.sol/VariableDebtToken.json");
const { sync } = require('./synchronization');
const { getDBConnection, GET_BALANCES } = require('./utils');
const { calculateBalance } = require("./functions");

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

async function run() {
  const db = getDBConnection();

  await sync(100);

  const balanceData = db.prepare(GET_BALANCES).all();

  const { timestamp } = await provider.getBlock('latest');

  for (let i = 0; i < balanceData.slice(1, 3).length; i++) {
    const data = balanceData[i];

    const calculatedBalance = calculateBalance(data, timestamp);

    let token;
    if (data.interest_rate_mode === 0) token = new ethers.Contract(data.token, aTokenABI, provider);
    if (data.interest_rate_mode === 2) token = new ethers.Contract(data.token, variableDebtABI, provider);

    const balanceOnChain = await token.balanceOf(data.user);
    const scaledBalance = await token.scaledBalanceOf(data.user);

    if (balanceOnChain.toString() !== calculatedBalance.toString(10)) {
      console.log(`index: ${i} - user: ${data.user} with token: ${data.token} type ${data.interest_rate_mode} mismatch, due to ${balanceOnChain.toString()} not equal to ${calculatedBalance.toString(10)} - scaled: ${scaledBalance.toString()} - base off-chain balance: ${data.balance}`);
      console.log('current_liquidity_rate', data.current_liquidity_rate);
      console.log('liquidity_index', data.liquidity_index);
      console.log('last_update', data.last_update);
      console.log('currentTimestamp', timestamp);
    }
  }
}

run();