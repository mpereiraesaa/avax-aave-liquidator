const { expect } = require('chai');
const hre = require('hardhat');
const { abi: LendingPoolABI } = require('@aave/protocol-v2/artifacts/contracts/protocol/lendingpool/LendingPool.sol/LendingPool.json');
const { abi: AddressesProviderABI } = require('@aave/protocol-v2/artifacts/contracts/protocol/configuration/LendingPoolAddressesProvider.sol/LendingPoolAddressesProvider.json');
const { abi: LendingPoolConfiguratorABI } = require('@aave/protocol-v2/artifacts/contracts/protocol/lendingpool/LendingPoolConfigurator.sol/LendingPoolConfigurator.json');
const { abi: erc20ABI } = require('@aave/protocol-v2/artifacts/@openzeppelin/contracts/token/ERC20/IERC20.sol/IERC20.json');
const { abi: aTokenABI } = require('@aave/protocol-v2/artifacts/contracts/protocol/tokenization/AToken.sol/AToken.json');
const { abi: variableTokenABI } = require('@aave/protocol-v2/artifacts/contracts/protocol/tokenization/VariableDebtToken.sol/VariableDebtToken.json');
const addresses = require('../src/addresses/avax.json');

const { ethers } = hre;

async function transferFunds(to) {
  const signer = await ethers.getSigner(0);

  await (await signer.sendTransaction({ to, value: ethers.utils.parseEther('10') })).wait();
}

// Start test block
describe('Test liquidation', function () {
    it.skip('Custom liquidator contract powered flash loan should work', async function () {
      const provider = ethers.provider;

      const Liquidator = await ethers.getContractFactory("Liquidator");
      let liquidator = await Liquidator.deploy();
      liquidator = await liquidator.deployed();

      console.log('Liquidator balance:', (await provider.getBalance(liquidator.address)).toString());
      console.log(`Liquidator at ${liquidator.address}`);

      const WAVAX = new ethers.Contract("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", erc20ABI, provider);
      const WAVAX_ATOKEN = new ethers.Contract("0xB2AC04b71888E17Aa2c5102cf3d0215467D74100", aTokenABI, provider);

      const prevBalanceCol = await WAVAX.balanceOf(liquidator.address);
      console.log("WAVAX balance: ", prevBalanceCol.toString());

      const prevBalance = await WAVAX_ATOKEN.balanceOf(liquidator.address);
      console.log("WAVAX_ATOKEN balance: ", prevBalance.toString());

      const tx = await (await liquidator.doLiquidate(
        "0xb0F14B88391C32760b34556B66f193917774E98b",
        WAVAX.address,
        WAVAX.address,
        "12295796485890000"        
      )).wait();

      expect(tx.events.some((evt) => evt.event === "LiquidationCall").length > 0);

      const newBalanceCol = await WAVAX.balanceOf(liquidator.address);
      console.log("WAVAX balance: ", newBalanceCol.toString());

      const newBalance = await WAVAX_ATOKEN.balanceOf(liquidator.address);
      console.log("WAVAX_ATOKEN balance: ", newBalance.toString());

      const signer = await ethers.getSigner(0);

      console.log("WAVAX balance for user: ", (await WAVAX.balanceOf(signer.address)).toString());

      console.log(`Owner: ${await liquidator.owner()} User: ${signer.address}`);

      console.log("Withdrawing...");

      await (await liquidator.withdraw(WAVAX.address)).wait();

      console.log("WAVAX balance for user: ", (await WAVAX.balanceOf(signer.address)).toString());
    });

    it.skip('should work', async function () {
      const provider = ethers.provider;
      const lendingPool = await ethers.getContractAt(LendingPoolABI, addresses.LendingPool, provider);

      await ethers.provider.send('hardhat_impersonateAccount', ['0x569059f4a5845f7aa7c44fc28bd3eac2c3955b17']);

      const WAVAX_USER = await ethers.getSigner('0x569059f4a5845f7aa7c44fc28bd3eac2c3955b17');
      const WAVAX = new ethers.Contract("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", erc20ABI, WAVAX_USER);
      const WAVAX_ATOKEN = new ethers.Contract("0xB2AC04b71888E17Aa2c5102cf3d0215467D74100", aTokenABI, WAVAX_USER);

      await transferFunds(WAVAX_USER.address);

      console.log((await WAVAX.balanceOf(WAVAX_USER.address)).toString())

      await WAVAX.approve(lendingPool.address, (5*1e18).toString());
      await lendingPool.connect(WAVAX_USER).deposit(WAVAX.address, (5*1e18).toString(), WAVAX_USER.address, 0);

      const prevBalance = await WAVAX_ATOKEN.balanceOf(WAVAX_USER.address);

      console.log(prevBalance.toString());

      await WAVAX.approve(lendingPool.address, (5*1e18).toString());

      const tx = await (await lendingPool.connect(WAVAX_USER).liquidationCall(
        WAVAX.address,
        WAVAX.address,
        "0xb0F14B88391C32760b34556B66f193917774E98b",
        "12295796485890000",
        false,
      )).wait();

      expect(tx.events.some((evt) => evt.event === "LiquidationCall").length > 0);

      const newBalance = await WAVAX_ATOKEN.balanceOf(WAVAX_USER.address);
      console.log(newBalance.toString());
    });
    it.skip("withdraw should work", async function () {
      const provider = ethers.provider;

      const Liquidator = await ethers.getContractFactory("Liquidator");
      let liquidator = await Liquidator.deploy();
      liquidator = await liquidator.deployed();

      console.log('Liquidator balance:', (await provider.getBalance(liquidator.address)).toString());
      console.log(`Liquidator at ${liquidator.address}`);

      await transferFunds(liquidator.address);

      console.log('Liquidator balance:', (await provider.getBalance(liquidator.address)).toString());

      const signer = await ethers.getSigner(0);
      
      console.log('balance for signer: ', (await signer.getBalance()).toString());

      console.log('Withdrawing...');

      await (await liquidator.withdraw(ethers.constants.AddressZero)).wait();

      console.log('balance for signer: ', (await signer.getBalance()).toString());

      console.log('Liquidator balance:', (await provider.getBalance(liquidator.address)).toString());
    });
    it("Liquidating and swapping collateral should work", async function () {
      const provider = ethers.provider;

      const Liquidator = await ethers.getContractFactory("Liquidator");
      let liquidator = await Liquidator.deploy();
      liquidator = await liquidator.deployed();

      console.log('Liquidator balance:', (await provider.getBalance(liquidator.address)).toString());
      console.log(`Liquidator at ${liquidator.address}`);

      const lendingPool = await ethers.getContractAt(LendingPoolABI, addresses.LendingPool, provider);

      await ethers.provider.send('hardhat_impersonateAccount', ['0x569059f4a5845f7aa7c44fc28bd3eac2c3955b17']);

      const WAVAX_USER = await ethers.getSigner('0x569059f4a5845f7aa7c44fc28bd3eac2c3955b17');
      const WAVAX = new ethers.Contract("0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", erc20ABI, WAVAX_USER);
      const WAVAX_ATOKEN = new ethers.Contract("0xB2AC04b71888E17Aa2c5102cf3d0215467D74100", aTokenABI, WAVAX_USER);

      await transferFunds(WAVAX_USER.address);

      console.log((await WAVAX.balanceOf(WAVAX_USER.address)).toString());

      await WAVAX.approve(lendingPool.address, (15*1e18).toString());
      await lendingPool.connect(WAVAX_USER).deposit(WAVAX.address, (15*1e18).toString(), WAVAX_USER.address, 0);

      console.log("new WAVAX aTokens: ", (await WAVAX_ATOKEN.balanceOf(WAVAX_USER.address)).toString());

      // lendingPoolConfigurator
      const lpConfigurator = await ethers.getContractAt(LendingPoolConfiguratorABI, addresses.LendingPoolConfigurator, provider);
      const USDT = new ethers.Contract("0xc7198437980c041c805A1EDcbA50c1Ce5db95118", erc20ABI, WAVAX_USER);
      const variableUSDT = new ethers.Contract("0xE928AC9837e703f5d36066De9ca98e95bA7774d1", variableTokenABI, WAVAX_USER);

      const addressesProvider = await ethers.getContractAt(AddressesProviderABI, addresses.LendingPoolAddressProvider, provider);

      const admin = await addressesProvider.getPoolAdmin();

      await transferFunds(admin);

      await ethers.provider.send('hardhat_impersonateAccount', [admin]);
      const ADMIN_USER = await ethers.getSigner(admin);

      // Override Loan to value
      await lpConfigurator.connect(ADMIN_USER).configureReserveAsCollateral(
        WAVAX.address,
        "8900",
        "9040",
        "10500"
      );

      await lendingPool.connect(WAVAX_USER).borrow(
        USDT.address,
        (1250*1e6).toString(),
        2,
        0,
        WAVAX_USER.address,
      );

      console.log("borrow balance USDTe:", (await variableUSDT.balanceOf(WAVAX_USER.address)).toString());

      const data = await lendingPool.getUserAccountData(WAVAX_USER.address);
      const [
        totalCollateralETH,
        totalDebtETH,
        availableBorrowsETH,
        currentLiquidationThreshold,
        ltv,
        healthFactor
      ] = data;
      console.log("healthFactor: ", healthFactor.toString());

      await lpConfigurator.connect(ADMIN_USER).configureReserveAsCollateral(
        WAVAX.address,
        "2000",
        "3500",
        "10500"
      );

      const data2 = await lendingPool.getUserAccountData(WAVAX_USER.address);
      const [
        totalCollateralETH2,
        totalDebtETH2,
        availableBorrowsETH2,
        currentLiquidationThreshold2,
        ltv2,
        healthFactor2
      ] = data2;
      console.log("healthFactor: ", healthFactor2.toString());

      const tx = await (await liquidator.doLiquidate(
        WAVAX_USER.address,
        WAVAX.address,
        USDT.address,
        (500*1e6).toString()                
      )).wait();

      expect(tx.events.some((evt) => evt.event === "LiquidationCall").length > 0);

      const newBalanceCol = await USDT.balanceOf(liquidator.address);
      console.log("USDT balance: ", newBalanceCol.toString());

      const newBalance = await variableUSDT.balanceOf(liquidator.address);
      console.log("variableUSDT balance: ", newBalance.toString());      
    });
});
