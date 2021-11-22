require('dotenv').config({ path: '../.env' });

global.currentConfiguration = require("./configuration.json");

const hre = require("hardhat");
const { ethers } = hre;
const { abi: LiquidatorABI } = require("../artifacts/contracts/Liquidator.sol/Liquidator.json");

const provider = new ethers.providers.JsonRpcProvider(currentConfiguration.url);

const wallet = ethers.Wallet.fromMnemonic(process.env.MNEMONIC);
const mainAccount = wallet.connect(provider);
const liquidator = new ethers.Contract(currentConfiguration.liquidator, LiquidatorABI, mainAccount);

async function main() {
  const args = process.argv.slice(2);
  const token = args[0];

  // We get the contract
  const tx = await liquidator.withdraw(token);
  const receipt = await tx.wait();
  console.log(receipt);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
