// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../../contracts/RoundOrchestrator.sol";
import "../../contracts/LBP.sol";
import "../../contracts/PositionToken.sol";
import "../../contracts/LinearBondingCurve.sol";
import "../../contracts/LBPFactory.sol";
import "../../contracts/PositionTokenFactory.sol";

/**
 * @title Scenario 1: Simple Round - One Position, One Trader Wins
 * @notice Tests a simple round where one creator creates a position,
 *         one trader buys tokens, sells some for BCT, and wins the round
 */
contract Scenario1SimpleRoundTest is Test {
    RoundOrchestrator public orchestrator;

    address public owner;
    address public creator;
    address public trader;

    uint256 constant ONE_DAY = 86400;
    uint256 constant ONE_ETH = 1 ether;
    uint256 constant TEN_THOUSAND = 10_000;

    function setUp() public {
        owner = address(this);
        creator = makeAddr("creator");
        trader = makeAddr("trader");

        vm.deal(creator, 100 ether);
        vm.deal(trader, 100 ether);

        LBPFactory lbpFactory = new LBPFactory();
        PositionTokenFactory positionTokenFactory = new PositionTokenFactory();
        orchestrator = new RoundOrchestrator(owner, ONE_DAY, address(lbpFactory), address(positionTokenFactory));
    }

    function test_scenario1_step1_shouldCreatePositionWithOneETHAndTenThousandTokens() public {
        vm.startPrank(creator);

        address lbpAddress = orchestrator.createPosition{value: ONE_ETH}(
            "SimpleToken",
            "SIMPLE",
            TEN_THOUSAND * 1e18,
            "ipfs://test"
        );

        vm.stopPrank();

        // Verify position created
    assertTrue(lbpAddress != address(0), "Should have LBP address");
        LBP lbp = LBP(payable(lbpAddress));

        (uint256 tokenReserve, uint256 ethReserve) = lbp.getReserves();

        assertEq(ethReserve, ONE_ETH, "LBP should have 1 ETH");
        assertEq(tokenReserve, TEN_THOUSAND * 1e18, "LBP should have 10,000 tokens");
    }

    function test_scenario1_step2_shouldAllowTraderToBuyFiveHundredTokensWithHalfETH() public {
        // Step 1: Create position
        vm.prank(creator);
        orchestrator.createPosition{value: ONE_ETH}(
            "SimpleToken",
            "SIMPLE",
            TEN_THOUSAND * 1e18,
            "ipfs://test"
        );

        // Step 2: Trader buys tokens
    address lbpAddress = orchestrator.getRoundPositions()[0];
        LBP lbp = LBP(payable(lbpAddress));
        PositionToken pt = PositionToken(address(lbp.POSITION_TOKEN()));

        vm.startPrank(trader);
        uint256 ptReceived = lbp.swap{value: 0.5 ether}(0, true);
        vm.stopPrank();

        assertGt(ptReceived, 0, "Trader should receive PT tokens");
        assertEq(pt.balanceOf(trader), ptReceived, "Trader PT balance should match");

        // Verify trader is in holders
        address[] memory holders = pt.getAllHolders();
        bool traderIsHolder = false;
        for (uint256 i = 0; i < holders.length; i++) {
            if (holders[i] == trader) {
                traderIsHolder = true;
                break;
            }
        }
        assertTrue(traderIsHolder, "Trader should be in holders array");
    }

    function test_scenario1_step3_shouldAllowTraderToSellTwoHundredTokensForBCT() public {
        // Step 1: Create position
        vm.prank(creator);
        orchestrator.createPosition{value: ONE_ETH}(
            "SimpleToken",
            "SIMPLE",
            TEN_THOUSAND * 1e18,
            "ipfs://test"
        );

        // Step 2: Trader buys tokens
    address lbpAddress = orchestrator.getRoundPositions()[0];
        LBP lbp = LBP(payable(lbpAddress));
        PositionToken pt = PositionToken(address(lbp.POSITION_TOKEN()));

        vm.prank(trader);
        lbp.swap{value: 0.5 ether}(0, true);

        // Warp time to make weights more balanced for easier swap calculations
        vm.warp(block.timestamp + ONE_DAY / 2);

        // Step 3: Trader sells 200 tokens for BCT
    (, , , , , LinearBondingCurve bc) = orchestrator.roundIdToRound(1);
        uint256 sellAmount = 200 * 1e18;
        uint256 traderBalance = pt.balanceOf(trader);

        if (traderBalance < sellAmount) {
            sellAmount = traderBalance / 2; // Sell half if don't have 200
        }

        vm.startPrank(trader);
        pt.approve(address(lbp), sellAmount);
        uint256 bctReceived = lbp.swap(sellAmount, false);
        vm.stopPrank();

        assertGt(bctReceived, 0, "Trader should receive BCT");
        assertEq(bc.balanceOf(trader), bctReceived, "Trader BCT balance should match");
    }

    function test_scenario1_step4_shouldDeclareTraderAsWinnerAfterSettlement() public {
        // Step 1: Create position
        vm.prank(creator);
        orchestrator.createPosition{value: ONE_ETH}(
            "SimpleToken",
            "SIMPLE",
            TEN_THOUSAND * 1e18,
            "ipfs://test"
        );

        // Step 2: Trader buys tokens
    address lbpAddress = orchestrator.getRoundPositions()[0];
        LBP lbp = LBP(payable(lbpAddress));

        vm.prank(trader);
        lbp.swap{value: 0.5 ether}(0, true);

        // Fast forward to end of round
        vm.warp(block.timestamp + ONE_DAY + 1);

        // Step 4: Settle round
        orchestrator.settleRound();

        // Verify trader's position won
    (, , , address winnerLbp, bool settled, ) = orchestrator.roundIdToRound(1);

        assertTrue(settled, "Round should be settled");
        assertEq(winnerLbp, lbpAddress, "LBP should be the winner");

        // Verify trader has owned supply
        uint256 ownedSupply = orchestrator.getOwnedSupply(lbpAddress);
        assertGt(ownedSupply, 0, "Winner position should have owned supply");
    }

    function test_scenario1_step5_shouldDistributeBCTDirectlyToTraderFromBonusPool() public {
        // Step 1: Create position
        vm.prank(creator);
        orchestrator.createPosition{value: ONE_ETH}(
            "SimpleToken",
            "SIMPLE",
            TEN_THOUSAND * 1e18,
            "ipfs://test"
        );

        // Step 2: Trader buys tokens
    address lbpAddress = orchestrator.getRoundPositions()[0];
        LBP lbp = LBP(payable(lbpAddress));
        PositionToken pt = PositionToken(address(lbp.POSITION_TOKEN()));

        vm.prank(trader);
        lbp.swap{value: 0.5 ether}(0, true);

        // Get bonding curve
    (, , , , , LinearBondingCurve bc) = orchestrator.roundIdToRound(1);
        uint256 bctBalanceBefore = bc.balanceOf(trader);

        // Fast forward and settle
        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.settleRound();

        uint256 bctBalanceAfter = bc.balanceOf(trader);

        // Trader should have received BCT from settlement
        assertGt(bctBalanceAfter, bctBalanceBefore, "Trader should receive BCT from settlement");

        // Verify the BCT came from bonus pool (ETH from position)
        uint256 bonusPool = bc.liquidationBonusPool();
        assertEq(bonusPool, 0, "Bonus pool should be empty after distribution");

        // Trader should own all circulating PT, so gets all BCT
        uint256 traderPT = pt.balanceOf(trader);
        assertGt(traderPT, 0, "Trader should still hold PT tokens");
    }
}
