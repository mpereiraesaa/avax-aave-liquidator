const { syncState } = require('./sync');
const { syncReserves } = require('./sync/syncReserves');
const { cleanDB } = require('./sync/cleanDB');
const { syncAccountBalances } = require('./sync/syncBalances');
const createTables = require('./createTables');
const { waitForTransactions } = require('./utils');

async function sync(iterations = 1) {
  await createTables();
  console.time('Synchronization');
  await syncState(iterations);
  await waitForTransactions();
  syncAccountBalances();
  await waitForTransactions();
  cleanDB();
  await syncReserves();
  await waitForTransactions();
  console.timeEnd('Synchronization');
}

module.exports = { sync }
