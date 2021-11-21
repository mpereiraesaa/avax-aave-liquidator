global.currentConfiguration = require("./configuration.json");

const ethers = require('ethers');
const { hexlify, hexStripZeros } = ethers.utils;
const { abi: LendingPoolABI } = require("@aave/protocol-v2/artifacts/contracts/protocol/lendingpool/LendingPool.sol/LendingPool.json");
const { url } = currentConfiguration;
const addresses = require('./addresses/avax.json');
const { getDBConnection, waitForTransactions } = require("./utils");

const provider = new ethers.providers.JsonRpcProvider(url);

const LIQUIDATE_BORROW_TOPIC_HASH = '0xe413a321e8681d831f4dbccbca790d2952b56f977908e45be37335533e005286';

// https://snowtrace.io/address/0x70BbE4A294878a14CB3CDD9315f5EB490e346163#events LP events

const iface = new ethers.utils.Interface(LendingPoolABI);

const db = getDBConnection();

const sync = async (
  latestBlockSynchronized,
  latestBlockMined
) => {
  const pastEvents = await provider.send('eth_getLogs', [{
    address: addresses.LendingPool,
    fromBlock: hexStripZeros(hexlify(latestBlockSynchronized)),
    toBlock: hexStripZeros(hexlify(latestBlockMined)),
    topics: [LIQUIDATE_BORROW_TOPIC_HASH]
  }]);

  const stmt = db.prepare(`
    INSERT INTO LIQUIDATIONS
      (debt_asset, liquidator, borrower, debt_to_cover, collateral_asset, liquidated_collateral_amount, receive_atoken, block_number, transaction_hash, log_index)
    VALUES
      (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(transaction_hash)
    DO NOTHING
  `);

  db.transaction(() => {
    for (pastEvent of pastEvents) {
      const { args } = iface.parseLog(pastEvent);
      const blockNumber = Number(pastEvent.blockNumber);

      const collateralAsset = args[0];
      const debtAsset = args[1];
      const borrower = args[2];
      const debtToCover = args[3].toString();
      const liquidatedCollateralAmount = args[4].toString();
      const liquidator = args[5];
      const receiveAToken = args[6];

      stmt.run(
        debtAsset,
        liquidator,
        borrower,
        debtToCover,
        collateralAsset,
        liquidatedCollateralAmount,
        Number(receiveAToken),
        blockNumber,
        pastEvent.transactionHash,
        pastEvent.logIndex
      )    
    };
  })();

  await waitForTransactions();
}

async function syncLiquidations(iterations = 1) {
  const latestBlockMined = await provider.getBlockNumber();
  const stepSize = 2000;

  let fromBlock = 7161901;
  console.log(`fromBlock: ${fromBlock} -> latestBlockMined: ${latestBlockMined}`);

  let i = 0;
  let toBlock = 0;

  do {
    toBlock = fromBlock + stepSize;
    if (toBlock > latestBlockMined) {
      toBlock = latestBlockMined;
    }

    console.log(`Liquidations:Synchronizing ${fromBlock} -> ${toBlock}`);

    await Promise.all([
      sync(fromBlock, toBlock),
    ]);

    fromBlock = toBlock;
    i++;
  } while (i < iterations && toBlock != latestBlockMined)

  console.log(`Total iterations done: ${i}`);
  console.log(`synchronization complete: ${toBlock}`);
}

module.exports = { syncLiquidations };
