const hre = require("hardhat");

async function main() {
  // We get the contract to deploy
  const Liquidator = await hre.ethers.getContractFactory("Liquidator");
  const contract = await Liquidator.deploy();

  await contract.deployed();

  console.log("Liquidator deployed to:", contract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
