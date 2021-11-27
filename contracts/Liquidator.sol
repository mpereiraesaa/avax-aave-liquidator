pragma solidity 0.6.12;

import {ILendingPool} from "@aave/protocol-v2/contracts/interfaces/ILendingPool.sol";

import "./IERC20.sol";
import "./Ownable.sol";
import "./interfaces.sol";

import {SafeMath} from "./Libraries.sol";

contract Liquidator is Ownable {
    using SafeMath for uint256;

    address internal AAVE_LP_ADDRESS = 0x4F01AeD16D97E3aB5ab2B501154DC9bb0F1A5A2C;
    address internal ROUTER = 0x60aE616a2155Ee3d9A68541Ba4544862310933d4; // traderjoe

    receive() external payable {}

    function withdraw(address _asset) external onlyOwner {
        if (_asset == address(0)) {
          payable(owner()).transfer(address(this).balance);
        } else {
          IERC20(_asset).transfer(owner(), IERC20(_asset).balanceOf(address(this)));
        }
    }

    function doLiquidate(
        address borrower,
        address collateral,
        address debt,
        uint256 debtToCover
    ) external onlyOwner {
        ILendingPool aaveLendingPool = ILendingPool(AAVE_LP_ADDRESS); // Aave LP
        address[] memory assets = new address[](1);
        uint256[] memory amounts = new uint256[](1);
        uint256[] memory modes = new uint256[](1);

        assets[0] = debt;
        amounts[0] = debtToCover;
        modes[0] = 0;

        bytes memory params = abi.encode(borrower, collateral);

        aaveLendingPool.flashLoan(
            address(this),
            assets,
            amounts,
            modes,
            address(this),
            params,
            0
        );
    }

    /** This function is called after your contract has received the flash loaned amount */
    function executeOperation(
        address[] calldata assets,
        uint256[] calldata amounts,
        uint256[] calldata premiums,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        ILendingPool lendingPool = ILendingPool(AAVE_LP_ADDRESS);

        (address borrower, address collateral) = abi.decode(
            params,
            (address, address)
        );

        IERC20(assets[0]).approve(AAVE_LP_ADDRESS, amounts[0]);
        lendingPool.liquidationCall(
            collateral,
            assets[0],
            borrower,
            amounts[0],
            false
        );

        if (collateral != assets[0]) {
            // Swap collateral asset into debt asset for paying flash loan
            address[] memory path = new address[](2);
            path[0] = collateral;
            path[1] = assets[0];

            IERC20 collateralAsset = IERC20(collateral);
            uint256 amountIn = collateralAsset.balanceOf(address(this));
            collateralAsset.approve(ROUTER, amountIn);

            IJoeRouter01(ROUTER).swapExactTokensForTokens(
                amountIn,
                0,
                path,
                address(this),
                block.timestamp
            );
        }

        // Approve the LendingPool contract allowance to *pull* the owed amount
        for (uint256 i = 0; i < assets.length; i++) {
            uint256 amountOwing = amounts[i].add(premiums[i]);
            IERC20(assets[i]).approve(AAVE_LP_ADDRESS, amountOwing);
        }

        return true;
    }
}
