const ethers = require('ethers');
const { hexlify, hexStripZeros } = ethers.utils;
const { getDBConnection, GET_TOKENS, waitForTransactions } = require('../utils');

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

const iface = new ethers.utils.Interface([
  "event Transfer(address indexed src, address indexed dst, uint wad)"
]);

const TRANSFER_TOPIC_HASH = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const syncTransfers = async (
  latestBlockSynchronized,
  latestBlockMined
) => {
  const db = getDBConnection();

  const tokens = db.prepare(GET_TOKENS).all();
  const tokenAddresses = tokens.map((token) => token.token);

  const pastEvents = await provider.send('eth_getLogs', [{
    address: tokenAddresses,
    fromBlock: hexStripZeros(hexlify(latestBlockSynchronized)),
    toBlock: hexStripZeros(hexlify(latestBlockMined)),
    topics: [TRANSFER_TOPIC_HASH]
  }]);

  const stmt = db.prepare(`
    INSERT INTO TRANSFERS
      (token, user, amount, transfer_unique_id, block_number, transaction_hash, log_index)
    VALUES
      (?,?,?,?,?,?,?)
    ON CONFLICT(transfer_unique_id)
    DO NOTHING
  `);

  db.transaction(() => {
    for (pastEvent of pastEvents) {
      const { args } = iface.parseLog(pastEvent);
      const blockNumber = Number(pastEvent.blockNumber);
      const token = pastEvent.address.toLowerCase();

      const fromAccount = args[0];
      const toAccount = args[1];
  
      const amount = args[2].toString();
  
      if (fromAccount.toLowerCase() !== token.toLowerCase()) {
        stmt.run(
          token,
          fromAccount,
          '-' + amount,
          fromAccount + token + pastEvent.transactionHash + pastEvent.logIndex,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
      }

      if (toAccount.toLowerCase() !== token.toLowerCase()) {
        stmt.run(
          token,
          toAccount,
          amount,
          toAccount + token + pastEvent.transactionHash + pastEvent.logIndex,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
      }
    };
  })();

  await waitForTransactions();
}

module.exports = { syncTransfers };
