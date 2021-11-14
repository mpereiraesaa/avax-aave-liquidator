const ethers = require('ethers');
const { rayDiv } = require("@aave/protocol-js")
const { hexlify, hexStripZeros } = ethers.utils;
const { getDBConnection, GET_TOKENS, waitForTransactions } = require('../utils');

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

const iface = new ethers.utils.Interface([
  "event Mint(address indexed from, uint value, uint index)",
  "event Mint(address indexed from, address indexed onBehalfOf, uint value, uint index)",
  "event Burn(address indexed from, address indexed target, uint value, uint index)", //aToken
  "event Burn(address indexed user, uint amount, uint index)",
  "event BalanceTransfer(address indexed from, address indexed to, uint value, uint index)"
]);

const MINT_HASH_1 = '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f';
const MINT_HASH_2 = '0x2f00e3cdd69a77be7ed215ec7b2a36784dd158f921fca79ac29deffa353fe6ee';
const BURN_HASH_1 = '0x5d624aa9c148153ab3446c1b154f660ee7701e549fe9b62dab7171b1c80e6fa2';
const BURN_HASH_2 = '0x49995e5dd6158cf69ad3e9777c46755a1a826a446c6416992167462dad033b2a';
const BALANCE_TRANSFER_HASH = '0x4beccb90f994c31aced7a23b5611020728a23d8ec5cddd1a3e9d97b96fda8666';

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
    topics: [[MINT_HASH_1, MINT_HASH_2, BURN_HASH_1, BURN_HASH_2, BALANCE_TRANSFER_HASH]]
  }]);

  const stmt = db.prepare(`
    INSERT INTO TRANSFERS
      (token, user, amount, transfer_unique_id, event_name, block_number, transaction_hash, log_index)
    VALUES
      (?,?,?,?,?,?,?,?)
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
          eventName,
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
          eventName,
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
          eventName,
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
          eventName,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
      }

      if (topic.toLowerCase() === BALANCE_TRANSFER_HASH.toLowerCase()) {
        const from = args[0];
        const to = args[1];
        const amount = args[2].toString();
        const index = args[3].toString();

        const amountScaled = rayDiv(amount, index);

        stmt.run(
          token,
          from,
          "-"+amountScaled.toString(10),
          from + token + pastEvent.transactionHash + pastEvent.logIndex,
          eventName,
          blockNumber,
          pastEvent.transactionHash,
          pastEvent.logIndex
        );
        stmt.run(
          token,
          to,
          amountScaled.toString(10),
          to + token + pastEvent.transactionHash + pastEvent.logIndex,
          eventName,
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
