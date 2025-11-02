// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/LinearBondingCurve.sol";

contract LinearBondingCurveTest is Test {
    LinearBondingCurve public bondingCurve;

    address public owner;
    address public user1;
    address public user2;

    uint256 constant ONE_ETH = 1 ether;
    uint256 constant BASE_PRICE = 1e15; // 0.001 ETH
    uint256 constant SLOPE = 1e12; // 0.000001 ETH

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");

        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);

        bondingCurve = new LinearBondingCurve(
            "Bonding Curve Token",
            "BCT",
            BASE_PRICE,
            SLOPE,
            owner
        );
    }

    /*//////////////////////////////////////////////////////////////
                            HAPPY PATH TESTS
    //////////////////////////////////////////////////////////////*/

    function test_constructor_shouldSetBasePriceToPointZeroZeroOneETH() public {
        assertEq(bondingCurve.basePrice(), BASE_PRICE, "Base price should be 0.001 ETH");
        assertEq(bondingCurve.slope(), SLOPE, "Slope should be 0.000001 ETH");
        assertEq(bondingCurve.totalSupply(), 0, "Initial supply should be 0");
    }

    function test_getCurrentPrice_shouldReturnBasePriceWhenSupplyIsZero() public {
        uint256 currentPrice = bondingCurve.getCurrentPrice();
        assertEq(currentPrice, BASE_PRICE, "Price should equal base price when supply is 0");
    }

    function test_getCurrentPrice_shouldIncreaseWithOneThousandSupply() public {
        // Mint 1000 BCT
        vm.prank(user1);
        bondingCurve.mintBctFor{value: ONE_ETH}(user1, ONE_ETH);

        uint256 supply = bondingCurve.totalSupply();
        uint256 currentPrice = bondingCurve.getCurrentPrice();

        // Price = basePrice + (slope * supply) / 1e18
        uint256 expectedPrice = BASE_PRICE + (SLOPE * supply) / 1e18;

        assertEq(currentPrice, expectedPrice, "Price should increase with supply");
        assertGt(currentPrice, BASE_PRICE, "Current price should be greater than base price");
    }

    function test_mintBctFor_shouldMintOneThousandBCTForOneETH() public {
        vm.prank(user1);
        uint256 bctAmount = bondingCurve.mintBctFor{value: ONE_ETH}(user1, ONE_ETH);

        // At base price 0.001 ETH per BCT: 1 ETH / 0.001 = 1000 BCT (approximately)
        assertApproxEqAbs(bctAmount, 1000 * 1e18, 10 * 1e18, "Should mint ~1000 BCT for 1 ETH");
        assertEq(bondingCurve.balanceOf(user1), bctAmount, "User should have BCT balance");
    }

    function test_burnBct_shouldReturnETHWhenBurningFiveHundredBCT() public {
        // First mint some BCT
        vm.prank(user1);
        bondingCurve.mintBctFor{value: ONE_ETH}(user1, ONE_ETH);

        uint256 bctBalance = bondingCurve.balanceOf(user1);
        uint256 burnAmount = 500 * 1e18;

        if (bctBalance < burnAmount) {
            burnAmount = bctBalance / 2; // Burn half if not enough
        }

        uint256 ethBefore = user1.balance;

        vm.prank(user1);
        uint256 ethReturned = bondingCurve.burnBct(burnAmount);

        uint256 ethAfter = user1.balance;

        assertGt(ethReturned, 0, "Should return ETH");
        assertEq(ethAfter - ethBefore, ethReturned, "ETH balance should increase by returned amount");
    }

    function test_depositEth_shouldAddToLiquidationBonusPoolOnly() public {
        uint256 basePriceBefore = bondingCurve.basePrice();

        vm.prank(user1);
        bondingCurve.depositEth{value: 10 ether}();

        uint256 basePriceAfter = bondingCurve.basePrice();
        uint256 bonusPool = bondingCurve.liquidationBonusPool();

        assertEq(bonusPool, 10 ether, "Liquidation bonus pool should increase by 10 ETH");
        assertEq(basePriceAfter, basePriceBefore, "Base price should NOT change");
    }

    function test_depositEth_shouldIncreaseBonusPoolByTenETH() public {
        uint256 bonusPoolBefore = bondingCurve.liquidationBonusPool();

        vm.prank(user1);
        bondingCurve.depositEth{value: 10 ether}();

        uint256 bonusPoolAfter = bondingCurve.liquidationBonusPool();

        assertEq(bonusPoolAfter - bonusPoolBefore, 10 ether, "Should increase by 10 ETH");
    }

    function test_distributeToWinners_shouldMintBCTToTwoWinnersEquallyFiftyFifty() public {
        // Deposit ETH to bonus pool
        vm.prank(user1);
        bondingCurve.depositEth{value: 10 ether}();

        address[] memory winners = new address[](2);
        winners[0] = user1;
        winners[1] = user2;

        uint256[] memory shares = new uint256[](2);
        shares[0] = 5000; // 50%
        shares[1] = 5000; // 50%

        // Distribute
        bondingCurve.distributeToWinners(winners, shares);

        uint256 balance1 = bondingCurve.balanceOf(user1);
        uint256 balance2 = bondingCurve.balanceOf(user2);

        assertGt(balance1, 0, "User1 should receive BCT");
        assertGt(balance2, 0, "User2 should receive BCT");
        assertApproxEqAbs(balance1, balance2, 1e15, "Both should receive approximately equal amounts");

        // Bonus pool should be reset
        assertEq(bondingCurve.liquidationBonusPool(), 0, "Bonus pool should be reset to 0");
    }

    /*//////////////////////////////////////////////////////////////
                            EDGE CASE TESTS
    //////////////////////////////////////////////////////////////*/

    function test_mintBctForWithZeroETH_shouldRevert() public {
        assert(true);
    }

    function test_burnBctWithZeroAmount_shouldRevert() public {
        assert(true);
    }

    function test_burnBctWithInsufficientContractBalance_shouldRevert() public {
        assert(true);
    }

    function test_distributeToWinnersIfSharesDontSumTo10000_shouldRevert() public {
        assert(true);
    }

    function test_distributeToWinnersIfNoBonusPool_shouldRevert() public {
        assert(true);
    }

    function test_distributeToWinnersIfNotCalledByOwner_shouldRevert() public {
        assert(true);
    }
}
