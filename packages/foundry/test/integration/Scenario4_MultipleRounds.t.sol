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
 * @title Scenario 4: Multiple Rounds Independence
 * @notice Tests that each round has its own bonding curve and BCT tokens are separate
 */
contract Scenario4MultipleRoundsTest is Test {
    RoundOrchestrator public orchestrator;

    address public owner;
    address public creator1;
    address public creator2;
    address public trader1;
    address public trader2;

    uint256 constant ONE_DAY = 86400;
    uint256 constant ONE_ETH = 1 ether;
    uint256 constant TEN_THOUSAND = 10_000;

    function setUp() public {
        owner = address(this);
        creator1 = makeAddr("creator1");
        creator2 = makeAddr("creator2");
        trader1 = makeAddr("trader1");
        trader2 = makeAddr("trader2");

        vm.deal(creator1, 100 ether);
        vm.deal(creator2, 100 ether);
        vm.deal(trader1, 100 ether);
        vm.deal(trader2, 100 ether);

        LBPFactory lbpFactory = new LBPFactory();
        PositionTokenFactory positionTokenFactory = new PositionTokenFactory();
        orchestrator = new RoundOrchestrator(owner, ONE_DAY, address(lbpFactory), address(positionTokenFactory));
    }

    function test_scenario4_step1_shouldCompleteRound1AndDistributeBCT1ToWinner() public {
        // Create position in Round 1
        vm.prank(creator1);
        orchestrator.createPosition{value: ONE_ETH}(
            "Token1",
            "T1",
            TEN_THOUSAND * 1e18
        );

        // Trader buys tokens
    address lbpAddr = orchestrator.getRoundPositions()[0];
    LBP lbp = LBP(payable(lbpAddr));

        vm.prank(trader1);
        lbp.swap{value: 0.5 ether}(0, true);

        // Get Round 1 bonding curve
    (, , , , , LinearBondingCurve bc1) = orchestrator.roundIdToRound(1);

        uint256 bct1BalanceBefore = bc1.balanceOf(trader1);

        // Fast forward and settle
        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.settleRound();

        uint256 bct1BalanceAfter = bc1.balanceOf(trader1);

        // Verify trader1 received BCT from Round 1
        assertGt(bct1BalanceAfter, bct1BalanceBefore, "Trader1 should receive BCT1 from Round 1");

        // Verify round is settled
    (, , , , bool settled, ) = orchestrator.roundIdToRound(1);
        assertTrue(settled, "Round 1 should be settled");
    }

    function test_scenario4_step2_shouldDeployNewBondingCurveForRound2() public {
        // Complete Round 1
        vm.prank(creator1);
    orchestrator.createPosition{value: ONE_ETH}("Token1", "T1", TEN_THOUSAND * 1e18);

    address lbpAddr1 = orchestrator.getRoundPositions()[0];
        vm.prank(trader1);
        LBP(payable(lbpAddr1)).swap{value: 0.5 ether}(0, true);

        vm.warp(block.timestamp + ONE_DAY + 1);

        // Get Round 1 bonding curve
    (, , , , , LinearBondingCurve bc1) = orchestrator.roundIdToRound(1);

        // Start Round 2
        orchestrator.startRound(ONE_DAY);

        // Get Round 2 bonding curve
    (, , , , , LinearBondingCurve bc2) = orchestrator.roundIdToRound(2);

        // Verify different bonding curves
        assertTrue(address(bc2) != address(bc1), "Round 2 should have different bonding curve");
        assertTrue(address(bc2) != address(0), "Round 2 bonding curve should be deployed");

        // Verify Round 2 BC has zero supply
        assertEq(bc2.totalSupply(), 0, "Round 2 BCT supply should start at 0");

        // Verify Round 1 BC still has supply
        assertGt(bc1.totalSupply(), 0, "Round 1 BCT should still have supply");
    }

    function test_scenario4_step3_shouldCompleteRound2AndDistributeBCT2ToWinner() public {
        // Complete Round 1
        vm.prank(creator1);
        orchestrator.createPosition{value: ONE_ETH}("Token1", "T1", TEN_THOUSAND * 1e18);

        address lbpAddr1 = orchestrator.getRoundPositions()[0];
        vm.prank(trader1);
        LBP(payable(lbpAddr1)).swap{value: 0.5 ether}(0, true);

        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.startRound(ONE_DAY);

        // Create position in Round 2
    vm.prank(creator2);
    orchestrator.createPosition{value: ONE_ETH}("Token2", "T2", TEN_THOUSAND * 1e18);

        // Trader2 buys tokens in Round 2
    address lbpAddr2 = orchestrator.getRoundPositions()[0];
    LBP lbp2 = LBP(payable(lbpAddr2));

        vm.prank(trader2);
        lbp2.swap{value: 0.5 ether}(0, true);

        // Get Round 2 bonding curve
    (, , , , , LinearBondingCurve bc2) = orchestrator.roundIdToRound(2);

        uint256 bct2BalanceBefore = bc2.balanceOf(trader2);

        // Fast forward and settle Round 2
        vm.warp(block.timestamp + ONE_DAY + 1);
        orchestrator.settleRound();

        uint256 bct2BalanceAfter = bc2.balanceOf(trader2);

        // Verify trader2 received BCT2 from Round 2
        assertGt(bct2BalanceAfter, bct2BalanceBefore, "Trader2 should receive BCT2 from Round 2");

        // Verify Round 2 is settled
    (, , , , bool settled2, ) = orchestrator.roundIdToRound(2);
        assertTrue(settled2, "Round 2 should be settled");
    }

    function test_scenario4_step4_shouldKeepBCT1andBCT2SeparateWithNoContamination() public {
        // Complete Round 1
        vm.prank(creator1);
    orchestrator.createPosition{value: ONE_ETH}("Token1", "T1", TEN_THOUSAND * 1e18);

    address lbpAddr1 = orchestrator.getRoundPositions()[0];
        vm.prank(trader1);
        LBP(payable(lbpAddr1)).swap{value: 0.5 ether}(0, true);

        vm.warp(block.timestamp + ONE_DAY + 1);

        // Get Round 1 bonding curve and trader1's balance
    (, , , , , LinearBondingCurve bc1) = orchestrator.roundIdToRound(1);
    orchestrator.settleRound();
    uint256 trader1BCT1 = bc1.balanceOf(trader1);

        // Start Round 2
    orchestrator.startRound(ONE_DAY);

    vm.prank(creator2);
    orchestrator.createPosition{value: ONE_ETH}("Token2", "T2", TEN_THOUSAND * 1e18);

    address lbpAddr2 = orchestrator.getRoundPositions()[0];
        vm.prank(trader2);
        LBP(payable(lbpAddr2)).swap{value: 0.5 ether}(0, true);

        vm.warp(block.timestamp + ONE_DAY + 1);

        // Get Round 2 bonding curve and settle
    (, , , , , LinearBondingCurve bc2) = orchestrator.roundIdToRound(2);
        orchestrator.settleRound();
        uint256 trader2BCT2 = bc2.balanceOf(trader2);

        // Verify BCT1 and BCT2 are different tokens
        assertTrue(address(bc1) != address(bc2), "BCT1 and BCT2 should be different tokens");

        // Verify trader1 has BCT1 but not BCT2
        assertGt(trader1BCT1, 0, "Trader1 should have BCT1");
        assertEq(bc2.balanceOf(trader1), 0, "Trader1 should have 0 BCT2");

        // Verify trader2 has BCT2 but not BCT1
        assertGt(trader2BCT2, 0, "Trader2 should have BCT2");
        assertEq(bc1.balanceOf(trader2), 0, "Trader2 should have 0 BCT1");

        // Verify no cross-contamination: trader1's BCT1 balance unchanged by Round 2
        assertEq(bc1.balanceOf(trader1), trader1BCT1, "Trader1's BCT1 balance should be unchanged");
    }
}
