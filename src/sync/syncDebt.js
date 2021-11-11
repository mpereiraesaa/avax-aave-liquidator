const ethers = require('ethers');
const { hexlify, hexStripZeros } = ethers.utils;
const { abi: StableDebtTokenABI } = require('@aave/protocol-v2/artifacts/contracts/protocol/tokenization/StableDebtToken.sol/StableDebtToken.json');
const { getDBConnection, GET_STABLE_DEBT_TOKENS, waitForTransactions } = require('../utils');

const provider = new ethers.providers.JsonRpcProvider(configuration.url);

const iface = new ethers.utils.Interface(StableDebtTokenABI);

const MINT_HASH = '0xc16f4e4ca34d790de4c656c72fd015c667d688f20be64eea360618545c4c530f';

const syncDebt = async (
  latestBlockSynchronized,
  latestBlockMined
) => {
  const db = getDBConnection();

  const tokens = db.prepare(GET_STABLE_DEBT_TOKENS).all();
  const tokenAddresses = tokens.map((token) => token.token);

  const pastEvents = await provider.send('eth_getLogs', [{
    address: tokenAddresses,
    fromBlock: hexStripZeros(hexlify(latestBlockSynchronized)),
    toBlock: hexStripZeros(hexlify(latestBlockMined)),
    topics: [MINT_HASH]
  }]);

  const stmt = db.prepare(`
    INSERT INTO MINTABLE_DEBT
      (token, user, new_rate, timestamp, token_user_unique_id)
    VALUES
      (?,?,?,?,?)
    ON CONFLICT(token_user_unique_id)
    DO UPDATE SET new_rate=excluded.new_rate, timestamp=excluded.timestamp  
  `);

  const timestampByBlockNumber = {};

  db.transaction(async () => {
    for (pastEvent of pastEvents) {
      const { args } = iface.parseLog(pastEvent);
      const blockNumber = Number(pastEvent.blockNumber);
      const token = pastEvent.address.toLowerCase();

      const user = args[1];
      const newRate = args[5];

      if (!timestampByBlockNumber[blockNumber]) {
        const { timestamp } = await provider.getBlock(blockNumber);
        timestampByBlockNumber[blockNumber] = timestamp;
      }

      stmt.run(token, user, newRate, timestampByBlockNumber[blockNumber], token + user);
    };
  })();

  await waitForTransactions();
}

module.exports = { syncDebt };
