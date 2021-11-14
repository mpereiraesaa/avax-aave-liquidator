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

  for (let i = 0; i < balanceData.length; i++) {
    const data = balanceData[i];

    const calculatedBalance = calculateBalance(data, timestamp);

    let token;
    if (data.interest_rate_mode === 0) token = new ethers.Contract(data.token, aTokenABI, provider);
    if (data.interest_rate_mode === 2) token = new ethers.Contract(data.token, variableDebtABI, provider);

    const balanceOnChain = await token.balanceOf(data.user);
    const diff = Math.abs(balanceOnChain.toString() - calculatedBalance.toString(10));

    if (diff > 6) {
      console.log(`index: ${i} - user: ${data.user} with token: ${data.token} type ${data.interest_rate_mode} mismatch, due to ${balanceOnChain.toString()} not equal to ${calculatedBalance.toString(10)} - base off-chain balance: ${data.balance}`);
    } else {
      console.log(`diff:${diff} is good for index:${i}`);
    }
  };
}

run();