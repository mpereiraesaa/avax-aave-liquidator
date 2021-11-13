const ethers = require('ethers');
const { rayDiv } = require("@aave/protocol-js")
const { hexlify, hexStripZeros } = ethers.utils;
const { getDBConnection, GET_TOKENS, waitForTransactions } = require('../utils');

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

const iface = new ethers.utils.Interface([
  "event Transfer(address indexed src, address indexed dst, uint wad)",
  "event Mint(address indexed from, uint value, uint index)",
  "event Mint(address indexed from, address indexed onBehalfOf, uint value, uint index)",
  "event Burn(address indexed from, address indexed target, uint value, uint index)", //aToken
  "event Burn(address indexed user, uint amount, uint index)",
]);

const TRANSFER_TOPIC_HASH = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MINT_HASH_1 = '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f';
const MINT_HASH_2 = '0x2f00e3cdd69a77be7ed215ec7b2a36784dd158f921fca79ac29deffa353fe6ee';
const BURN_HASH_1 = '0x5d624aa9c148153ab3446c1b154f660ee7701e549fe9b62dab7171b1c80e6fa2';
const BURN_HASH_2 = '0x49995e5dd6158cf69ad3e9777c46755a1a826a446c6416992167462dad033b2a';

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
    topics: [[TRANSFER_TOPIC_HASH, MINT_HASH_1, MINT_HASH_2, BURN_HASH_1, BURN_HASH_2]]
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
      const { args, name: eventName, topic } = iface.parseLog(pastEvent);
      const blockNumber = Number(pastEvent.blockNumber);
      const token = pastEvent.address.toLowerCase();

      if (topic.toLowerCase() === MINT_HASH_1.toLowerCase()) {
        const user = args[0];
        const amount = args[1].toString();
        const index = args[2].toString();

        const amountScaled = rayDiv(amount, index);

        stmt.run(
          token,
          user,
          amountScaled.toString(10),
          user + token + pastEvent.transactionHash + pastEvent.logIndex,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
      }

      if (topic.toLowerCase() === MINT_HASH_2.toLowerCase()) {
        const user = args[1];
        const amount = args[2].toString();
        const index = args[3].toString();

        const amountScaled = rayDiv(amount, index);

        stmt.run(
          token,
          user,
          amountScaled.toString(10),
          user + token + pastEvent.transactionHash + pastEvent.logIndex,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
      }

      if (topic.toLowerCase() === BURN_HASH_1.toLowerCase()) {
        const user = args[0];
        const amount = args[2].toString();
        const index = args[3].toString();

        const amountScaled = rayDiv(amount, index);

        stmt.run(
          token,
          user,
          "-"+amountScaled.toString(10),
          user + token + pastEvent.transactionHash + pastEvent.logIndex,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
      }

      if (topic.toLowerCase() === BURN_HASH_2.toLowerCase()) {
        const user = args[0];
        const amount = args[1].toString();
        const index = args[2].toString();

        const amountScaled = rayDiv(amount, index);

        stmt.run(
          token,
          user,
          "-"+amountScaled.toString(10),
          user + token + pastEvent.transactionHash + pastEvent.logIndex,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
      }

      if (topic.toLowerCase() === TRANSFER_TOPIC_HASH.toLowerCase()) {
        const fromAccount = args[0];
        const toAccount = args[1];
    
        const amount = args[2].toString();

        // Not minting or Burning
        if (fromAccount !== ethers.constants.AddressZero && toAccount !== ethers.constants.AddressZero) {
          stmt.run(
            token,
            fromAccount,
            '-' + amount,
            fromAccount + token + pastEvent.transactionHash + pastEvent.logIndex,
            blockNumber,
            pastEvent.transactionHash,
            pastEvent.logIndex
          );
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
      }
    };
  })();

  await waitForTransactions();
}

module.exports = { syncTransfers };
