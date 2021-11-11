const ethers = require('ethers');
const { getDBConnection } = require('../utils');

const provider = new ethers.providers.JsonRpcProvider(configuration.url);

const DEPLOY_BLOCK = 6628717;

async function syncState(iterations = 1) {
  const db = getDBConnection();

  const latestBlockMined = await provider.getBlockNumber();
  console.log(`latestBlockMined: ${latestBlockMined}`);

  const lastBlockSyncQueryResult = db.prepare(`
    SELECT * FROM SYNCHRONIZED_BLOCKS ORDER BY block_number DESC LIMIT 1  
  `).all();

  // If no block synchronized, i.e database entry == null then set latest block synchronized = 0
  const latestBlockSynchronized = lastBlockSyncQueryResult.length > 0 ? lastBlockSyncQueryResult[0].block_number : 0;
  console.log(`latestBlockSynchronized: ${latestBlockSynchronized}`);

  const stepSize = 5000;

  if (latestBlockSynchronized < latestBlockMined) {
    let fromBlock = latestBlockSynchronized ? latestBlockSynchronized + 1 : 0;
    console.log(`fromBlock: ${fromBlock} -> latestBlockMined: ${latestBlockMined}`);

    if (fromBlock < DEPLOY_BLOCK) {
      fromBlock = DEPLOY_BLOCK;
    }

    let i = 0;
    let toBlock = 0;

    do {
      toBlock = fromBlock + stepSize;
      if (toBlock > latestBlockMined) {
        toBlock = latestBlockMined;
      }

      console.log(`baseSync:Synchronizing ${fromBlock} -> ${toBlock}`);

      try {
        await Promise.all([
          // synchronizeAccounts(fromBlock, toBlock),
        ]);

        fromBlock = toBlock;
      } catch (err) {
        console.log(err.message);
        await new Promise(r => setTimeout(r, 1000));
      }

      i++;
    } while (i < iterations && toBlock != latestBlockMined)

    console.log(`Total iterations done: ${i}`);

    db.prepare(`
      INSERT INTO SYNCHRONIZED_BLOCKS
        (block_number)
      VALUES
        (?)
    `).run(toBlock);

    console.log(`synchronization complete: ${toBlock}`);
  }
}

module.exports = { syncState };
