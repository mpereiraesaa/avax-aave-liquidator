global.currentConfiguration = require("./configuration.json");

const createTables = require('./createTables');
createTables();

const { sync } = require('./synchronization');

async function run() {
  await sync(100);
}

run();
