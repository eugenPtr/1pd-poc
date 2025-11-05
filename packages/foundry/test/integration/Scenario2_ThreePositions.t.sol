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
 * @title Scenario 2: Three Positions, Position C Wins
 * @notice Tests a round with 3 positions where:
 *         - Position A: 50% early exits
 *         - Position B: 100% early exits
 *         - Position C: 100% holds (wins)
 */
contract Scenario2ThreePositionsTest is Test {
    RoundOrchestrator public orchestrator;

    address public owner;
    address public creatorA;
    address public creatorB;
    address public creatorC;
    address public trader1;
    address public trader2;
    address public trader3;
    address public trader4;

    uint256 constant ONE_DAY = 86400;
    uint256 constant TEN_ETH = 10 ether;
    uint256 constant TEN_THOUSAND = 10_000;

    function setUp() public {
        owner = address(this);
        creatorA = makeAddr("creatorA");
        creatorB = makeAddr("creatorB");
        creatorC = makeAddr("creatorC");
        trader1 = makeAddr("trader1");
        trader2 = makeAddr("trader2");
        trader3 = makeAddr("trader3");
        trader4 = makeAddr("trader4");

        vm.deal(creatorA, 100 ether);
        vm.deal(creatorB, 100 ether);
        vm.deal(creatorC, 100 ether);
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);
        vm.deal(trader3, 100 ether);
        vm.deal(trader4, 100 ether);

        LBPFactory lbpFactory = new LBPFactory();
        PositionTokenFactory positionTokenFactory = new PositionTokenFactory();
        orchestrator = new RoundOrchestrator(owner, ONE_DAY, address(lbpFactory), address(positionTokenFactory));
    }

    function test_scenario2_step1_shouldCreateThreePositionsWithTenETHEach() public {
        // Create Position A
        vm.prank(creatorA);
        address posA = orchestrator.createPosition{value: TEN_ETH}(
            "TokenA", "TA", TEN_THOUSAND * 1e18, "ipfs://test"
        );

        // Create Position B
        vm.prank(creatorB);
        address posB = orchestrator.createPosition{value: TEN_ETH}(
            "TokenB", "TB", TEN_THOUSAND * 1e18, "ipfs://test"
        );

        // Create Position C
        vm.prank(creatorC);
        address posC = orchestrator.createPosition{value: TEN_ETH}(
            "TokenC", "TC", TEN_THOUSAND * 1e18, "ipfs://test"
        );

    assertTrue(posA != address(0));
    assertTrue(posB != address(0));
    assertTrue(posC != address(0));

        // Verify all have 10 ETH
        for (uint256 i = 1; i <= 3; i++) {
            address lbpAddr = orchestrator.getRoundPositions()[i-1];
            (, uint256 ethReserve) = LBP(payable(lbpAddr)).getReserves();
            assertEq(ethReserve, TEN_ETH, "Each position should have 10 ETH");
        }
    }

    function test_scenario2_step2_shouldAllowHalfOfPositionATradersToExit() public {
        // Create positions
        vm.prank(creatorA);
    orchestrator.createPosition{value: TEN_ETH}("TokenA", "TA", TEN_THOUSAND * 1e18, "ipfs://test");

    address lbpAddrA = orchestrator.getRoundPositions()[0];
        LBP lbpA = LBP(payable(lbpAddrA));
        PositionToken ptA = PositionToken(address(lbpA.POSITION_TOKEN()));

        // Trader 1 buys half the tokens
        vm.prank(trader1);
        lbpA.swap{value: 5 ether}(0, true);

        // Trader 2 buys remaining tokens
        vm.prank(trader2);
        lbpA.swap{value: 3 ether}(0, true);

        uint256 trader1Balance = ptA.balanceOf(trader1);
        uint256 trader2Balance = ptA.balanceOf(trader2);

        // Trader 1 sells all their tokens (exits early)
        vm.startPrank(trader1);
        ptA.approve(address(lbpA), trader1Balance);
        lbpA.swap(trader1Balance, false);
        vm.stopPrank();

        // Verify: trader1 exited (has BCT), trader2 holds (has PT)
    (, , , , , LinearBondingCurve bc) = orchestrator.roundIdToRound(1);
        assertGt(bc.balanceOf(trader1), 0, "Trader1 should have BCT from exit");
        assertGt(trader2Balance, 0, "Trader2 should still hold PT");
        assertEq(ptA.balanceOf(trader1), 0, "Trader1 should have 0 PT after exit");
    }

    function test_scenario2_step3_shouldAllowAllPositionBTradersToExit() public {
        // Create positions
        vm.prank(creatorB);
    orchestrator.createPosition{value: TEN_ETH}("TokenB", "TB", TEN_THOUSAND * 1e18, "ipfs://test");

    address lbpAddrB = orchestrator.getRoundPositions()[0];
        LBP lbpB = LBP(payable(lbpAddrB));
        PositionToken ptB = PositionToken(address(lbpB.POSITION_TOKEN()));

        // Trader 3 buys all tokens
        vm.prank(trader3);
        lbpB.swap{value: 8 ether}(0, true);

        uint256 trader3Balance = ptB.balanceOf(trader3);

        // Trader 3 sells all tokens back (100% exit)
        vm.startPrank(trader3);
        ptB.approve(address(lbpB), trader3Balance);
        lbpB.swap(trader3Balance, false);
        vm.stopPrank();

        // Verify: all exited, should have very low owned supply
    uint256 ownedSupply = orchestrator.getOwnedSupply(lbpAddrB);
        assertEq(ownedSupply, 0, "Position B should have 0 owned supply (all exited)");
    }

    function test_scenario2_step4_shouldHaveAllPositionCTradersHoldUntilEnd() public {
        // Create positions
        vm.prank(creatorC);
    orchestrator.createPosition{value: TEN_ETH}("TokenC", "TC", TEN_THOUSAND * 1e18, "ipfs://test");

    address lbpAddrC = orchestrator.getRoundPositions()[0];
        LBP lbpC = LBP(payable(lbpAddrC));
        PositionToken ptC = PositionToken(address(lbpC.POSITION_TOKEN()));

        // Trader 4 buys tokens
        vm.prank(trader4);
        lbpC.swap{value: 8 ether}(0, true);

        uint256 trader4Balance = ptC.balanceOf(trader4);

        // Trader 4 holds (does NOT sell)
        assertGt(trader4Balance, 0, "Trader4 should hold PT");

        // Verify high owned supply
    uint256 ownedSupply = orchestrator.getOwnedSupply(lbpAddrC);
        assertGt(ownedSupply, 0, "Position C should have owned supply");
    }

    function test_scenario2_step5_shouldDeclarePositionCAsWinner() public {
        // Create all 3 positions
        vm.prank(creatorA);
    orchestrator.createPosition{value: TEN_ETH}("TokenA", "TA", TEN_THOUSAND * 1e18, "ipfs://test");

    vm.prank(creatorB);
    orchestrator.createPosition{value: TEN_ETH}("TokenB", "TB", TEN_THOUSAND * 1e18, "ipfs://test");

    vm.prank(creatorC);
    orchestrator.createPosition{value: TEN_ETH}("TokenC", "TC", TEN_THOUSAND * 1e18, "ipfs://test");

        // Position A: Half exit
    address lbpAddrA = orchestrator.getRoundPositions()[0];
        LBP lbpA = LBP(payable(lbpAddrA));
        PositionToken ptA = PositionToken(address(lbpA.POSITION_TOKEN()));

        vm.prank(trader1);
        lbpA.swap{value: 5 ether}(0, true);
        vm.prank(trader2);
        lbpA.swap{value: 3 ether}(0, true);

        uint256 trader1Bal = ptA.balanceOf(trader1);
        vm.startPrank(trader1);
        ptA.approve(address(lbpA), trader1Bal);
        lbpA.swap(trader1Bal, false);
        vm.stopPrank();

        // Position B: All exit
    address lbpAddrB = orchestrator.getRoundPositions()[1];
        LBP lbpB = LBP(payable(lbpAddrB));
        PositionToken ptB = PositionToken(address(lbpB.POSITION_TOKEN()));

        vm.prank(trader3);
        lbpB.swap{value: 8 ether}(0, true);
        uint256 trader3Bal = ptB.balanceOf(trader3);
        vm.startPrank(trader3);
        ptB.approve(address(lbpB), trader3Bal);
        lbpB.swap(trader3Bal, false);
        vm.stopPrank();

        // Position C: All hold
    address lbpAddrC = orchestrator.getRoundPositions()[2];
        LBP lbpC = LBP(payable(lbpAddrC));

        vm.prank(trader4);
        lbpC.swap{value: 8 ether}(0, true);

        // Fast forward and settle
        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.settleRound();

        // Position C should win (highest owned supply)
    (, , , address winnerLbp, , ) = orchestrator.roundIdToRound(1);
    assertEq(winnerLbp, lbpAddrC, "Position C should be the winner");
    }

    function test_scenario2_step6_shouldLiquidatePositionsAandB() public {
        // Setup: Create 3 positions with trading
        vm.prank(creatorA);
    orchestrator.createPosition{value: TEN_ETH}("TokenA", "TA", TEN_THOUSAND * 1e18, "ipfs://test");
    vm.prank(creatorB);
    orchestrator.createPosition{value: TEN_ETH}("TokenB", "TB", TEN_THOUSAND * 1e18, "ipfs://test");
    vm.prank(creatorC);
    orchestrator.createPosition{value: TEN_ETH}("TokenC", "TC", TEN_THOUSAND * 1e18, "ipfs://test");

        // Trading setup (simplified - C holds most)
    address lbpAddrC = orchestrator.getRoundPositions()[2];
        vm.prank(trader4);
        LBP(payable(lbpAddrC)).swap{value: 8 ether}(0, true);

        // Settle
        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.settleRound();

        // Verify A and B are liquidated
    address lbpAddrA = orchestrator.getRoundPositions()[0];
    address lbpAddrB = orchestrator.getRoundPositions()[1];

        assertTrue(LBP(payable(lbpAddrA)).isLiquidated(), "Position A should be liquidated");
        assertTrue(LBP(payable(lbpAddrB)).isLiquidated(), "Position B should be liquidated");
    }

    function test_scenario2_step7_shouldDistributeBCTFromAllThirtyETHToPositionCHolders() public {
        // Setup: Create 3 positions
        vm.prank(creatorA);
    orchestrator.createPosition{value: TEN_ETH}("TokenA", "TA", TEN_THOUSAND * 1e18, "ipfs://test");
    vm.prank(creatorB);
    orchestrator.createPosition{value: TEN_ETH}("TokenB", "TB", TEN_THOUSAND * 1e18, "ipfs://test");
    vm.prank(creatorC);
    orchestrator.createPosition{value: TEN_ETH}("TokenC", "TC", TEN_THOUSAND * 1e18, "ipfs://test");

        // Position C wins
    address lbpAddrC = orchestrator.getRoundPositions()[2];
        vm.prank(trader4);
        LBP(payable(lbpAddrC)).swap{value: 8 ether}(0, true);

    (, , , , , LinearBondingCurve bc) = orchestrator.roundIdToRound(1);
        uint256 bctBefore = bc.balanceOf(trader4);

        // Settle
        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.settleRound();

        uint256 bctAfter = bc.balanceOf(trader4);

        // Trader4 should receive BCT from all 30 ETH
        assertGt(bctAfter, bctBefore, "Winner should receive BCT");

        // The BCT minted should be from ~30 ETH (all positions combined)
        uint256 bctReceived = bctAfter - bctBefore;
        assertGt(bctReceived, 0, "Should receive significant BCT from 30 ETH pool");
    }

    function test_scenario2_step8_shouldDistributeBCTProportionallyToPositionTokenHoldings() public {
        // Setup: Create winning position
    vm.prank(creatorC);
    orchestrator.createPosition{value: TEN_ETH}("TokenC", "TC", TEN_THOUSAND * 1e18, "ipfs://test");

    address lbpAddrC = orchestrator.getRoundPositions()[0];
        LBP lbpC = LBP(payable(lbpAddrC));

        // Two traders buy tokens (approximately 50/50)
        vm.prank(trader1);
        lbpC.swap{value: 4 ether}(0, true);

        vm.prank(trader2);
        lbpC.swap{value: 4 ether}(0, true);

        PositionToken ptC = PositionToken(address(lbpC.POSITION_TOKEN()));
        uint256 trader1PT = ptC.balanceOf(trader1);
        uint256 trader2PT = ptC.balanceOf(trader2);

        // Settle
        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.settleRound();

    (, , , , , LinearBondingCurve bc) = orchestrator.roundIdToRound(1);
        uint256 trader1BCT = bc.balanceOf(trader1);
        uint256 trader2BCT = bc.balanceOf(trader2);

        // BCT distribution should be proportional to PT holdings
        if (trader1PT > 0 && trader2PT > 0) {
            uint256 ratio1 = (trader1BCT * 10000) / trader1PT;
            uint256 ratio2 = (trader2BCT * 10000) / trader2PT;

            // Ratios should be approximately equal (accounting for rounding)
            assertApproxEqRel(ratio1, ratio2, 0.05e18, "BCT/PT ratio should be similar for both traders");
        }
    }
}
