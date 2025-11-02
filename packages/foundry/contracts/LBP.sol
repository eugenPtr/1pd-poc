// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {PositionToken} from "./PositionToken.sol";

/**
 * @title LBP (Liquidity Bootstrap Pool)
 * @dev Simplified two-token pool: PositionToken + ETH
 * Features declining weights over time for price discovery (unbounded decay)
 * Routes exits through bonding curve for BCT rewards
 * Can be liquidated if price drops 99% or more
 */
contract LBP is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Pool tokens
    IERC20 public immutable POSITION_TOKEN;

    // Integration
    address public immutable ORCHESTRATOR;
    address public immutable BONDING_CURVE;

    // Pool parameters - weights for 99% max drop
    uint256 public constant START_WEIGHT = 9091;  // 90.91%
    // Hyperbolic decay timescale in seconds. With T0 ≈ 9600s (~2.67h), after ~1 day weight ~10% of start
    uint256 public constant DECAY_TIMESCALE = 9600;
    uint256 public startTime;
    uint256 public swapFee;  // Fee in basis points

    // Pool state
    uint256 public positionTokenAmount;
    uint256 public ethAmount;
    uint256 public initialPrice;
    uint256 public liquidationPrice;
    bool public settled;
    bool public liquidated;

    event Swap(address indexed user, bool buyToken, uint256 amountIn, uint256 amountOut);
    event LiquidityAdded(uint256 tokenAmount, uint256 ethAmount);
    event EmergencyExit(uint256 ethAmount);
    event Liquidated(uint256 ethAmount);
    event WinnerSettled(uint256 numWinners, uint256 ethAmount);

    constructor(
        address _positionToken,
        uint256 tokenAmount,
        uint256 _swapFee,
        address _orchestrator,
        address _bondingCurve
    ) payable {
        require(_positionToken != address(0), "Invalid token");
        require(_orchestrator != address(0), "Invalid orchestrator");
        require(_bondingCurve != address(0), "Invalid bonding curve");
        require(tokenAmount > 0, "Invalid token amount");
        require(msg.value > 0, "No ETH provided");

        POSITION_TOKEN = IERC20(_positionToken);
        ORCHESTRATOR = _orchestrator;
        BONDING_CURVE = _bondingCurve;
    swapFee = _swapFee;
        startTime = block.timestamp;

    POSITION_TOKEN.safeTransferFrom(ORCHESTRATOR, address(this), tokenAmount);
        positionTokenAmount = tokenAmount;
        ethAmount = msg.value;

    initialPrice = _calculatePrice(ethAmount, positionTokenAmount, START_WEIGHT, 10000 - START_WEIGHT);
        liquidationPrice = initialPrice / 10;

        emit LiquidityAdded(tokenAmount, ethAmount);
    }

    /**
     * @dev Calculate current weights based on time elapsed (hyperbolic decay)
     */
    function getCurrentWeights() public view returns (uint256 weightToken, uint256 weightEth) {
        uint256 elapsed = block.timestamp - startTime;
        // weightToken = START_WEIGHT * T0 / (T0 + elapsed)
        // ensure at least 1 bp to avoid division issues
        if (elapsed == 0) {
            weightToken = START_WEIGHT;
        } else {
            uint256 numerator = START_WEIGHT * DECAY_TIMESCALE;
            uint256 denom = DECAY_TIMESCALE + elapsed;
            if (denom == 0) {
                weightToken = 1;
            } else {
                weightToken = numerator / denom;
                if (weightToken == 0) {
                    weightToken = 1;
                }
            }
        }
        if (weightToken > 10000) weightToken = 10000;
        weightEth = 10000 - weightToken;
    }

    /**
     * @dev Get current price of position token in ETH
     */
    function getCurrentPrice() public view returns (uint256) {
        if (positionTokenAmount == 0) return 0;
        (uint256 weightToken, uint256 weightEth) = getCurrentWeights();
        return _calculatePrice(ethAmount, positionTokenAmount, weightToken, weightEth);
    }

    /**
     * @dev Swap tokens
     * @param amountIn Amount of input token (for ETH, use msg.value)
     * @param buyToken True to buy position tokens with ETH, false to sell tokens for BCT
     */
    function swap(uint256 amountIn, bool buyToken)
        external
        payable
        nonReentrant
        returns (uint256 amountOut)
    {
        require(!settled, "Pool settled");
        require(!liquidated, "Pool liquidated");
        require(positionTokenAmount > 0 && ethAmount > 0, "Pool not initialized");

        (uint256 weightToken, uint256 weightEth) = getCurrentWeights();

        if (buyToken) {
            require(msg.value > 0, "No ETH sent");
            amountIn = msg.value;

            uint256 feeAmount = (amountIn * swapFee) / 10000;
            uint256 amountInAfterFee = amountIn - feeAmount;

            amountOut = _calculateSwapAmount(
                ethAmount,
                positionTokenAmount,
                weightEth,
                weightToken,
                amountInAfterFee
            );

            require(amountOut <= positionTokenAmount, "Insufficient liquidity");

            ethAmount += amountIn;
            positionTokenAmount -= amountOut;

            POSITION_TOKEN.safeTransfer(msg.sender, amountOut);

        } else {
            require(amountIn > 0, "Invalid amount");

            uint256 feeAmount = (amountIn * swapFee) / 10000;
            uint256 amountInAfterFee = amountIn - feeAmount;

            amountOut = _calculateSwapAmount(
                positionTokenAmount,
                ethAmount,
                weightToken,
                weightEth,
                amountInAfterFee
            );

            require(amountOut > 0, "Swap amount too small");
            require(amountOut <= ethAmount, "Insufficient liquidity");

            POSITION_TOKEN.safeTransferFrom(msg.sender, address(this), amountIn);

            positionTokenAmount += amountIn;
            ethAmount -= amountOut;

            (bool success, bytes memory data) = BONDING_CURVE.call{value: amountOut}(
                abi.encodeWithSignature("mintBctFor(address,uint256)", msg.sender, amountOut)
            );
            require(success, "Bonding curve mint failed");

            uint256 bctAmount = abi.decode(data, (uint256));
            amountOut = bctAmount;
        }

        emit Swap(msg.sender, buyToken, amountIn, amountOut);
    }

    function settleWinner() external nonReentrant returns (address[] memory, uint256[] memory, uint256) {
        require(msg.sender == ORCHESTRATOR, "Only orchestrator");
        require(!settled, "Already settled");
        require(!liquidated, "Pool liquidated");

        PositionToken pt = PositionToken(address(POSITION_TOKEN));
        address[] memory holders = pt.getAllHolders();
        uint256 totalSupply = pt.totalSupply();

        // Check for underflow: if all tokens are in pool, no one owns any
        require(positionTokenAmount < totalSupply, "No owned supply");
        uint256 ownedSupply = totalSupply - positionTokenAmount;
        require(ownedSupply > 0, "No owned supply");

        uint256 winnerCount = 0;
        for (uint256 i = 0; i < holders.length; i++) {
            // Skip the LBP address itself (pool tokens shouldn't count as "owned")
            if (holders[i] == address(this)) continue;
            if (pt.balanceOf(holders[i]) > 0) {
                winnerCount++;
            }
        }
        require(winnerCount > 0, "No winners");

        address[] memory winners = new address[](winnerCount);
        uint256[] memory shares = new uint256[](winnerCount);
        uint256 totalShares = 0;

        uint256 index = 0;
        for (uint256 i = 0; i < holders.length; i++) {
            // Skip the LBP address itself (pool tokens shouldn't count as "owned")
            if (holders[i] == address(this)) continue;
            uint256 balance = pt.balanceOf(holders[i]);
            if (balance > 0) {
                winners[index] = holders[i];
                uint256 share = (balance * 10000) / ownedSupply;
                shares[index] = share;
                totalShares += share;
                index++;
            }
        }

        // Give remainder to last winner to handle rounding
        if (totalShares != 10000 && winnerCount > 0) {
            shares[winnerCount - 1] += (10000 - totalShares);
            totalShares = 10000;
        }

        require(totalShares == 10000, "Shares must sum to 10000");

        settled = true;

        (bool success,) = BONDING_CURVE.call{value: ethAmount}(
            abi.encodeWithSignature("depositEth()")
        );
        require(success, "Deposit failed");

        uint256 ethSent = ethAmount;
        ethAmount = 0;

        emit WinnerSettled(winnerCount, ethSent);

        return (winners, shares, ethSent);
    }

    function liquidatePool() external nonReentrant {
        require(!liquidated, "Already liquidated");
        require(!settled, "Already settled");
        require(positionTokenAmount > 0 && ethAmount > 0, "Pool not initialized");

        uint256 currentPrice = getCurrentPrice();
        require(currentPrice <= liquidationPrice, "Price above liquidation threshold");

        liquidated = true;

        uint256 ethToSend = ethAmount;
        ethAmount = 0;

        (bool success,) = BONDING_CURVE.call{value: ethToSend}(
            abi.encodeWithSignature("depositEth()")
        );
        require(success, "Bonding curve failed");

        emit Liquidated(ethToSend);
    }

    /**
     * @dev Emergency exit - extract all ETH to orchestrator (for settlement)
     */
    function emergencyExit() external nonReentrant returns (uint256) {
        require(msg.sender == ORCHESTRATOR, "Only orchestrator");
        require(!settled, "Already settled");
        require(!liquidated, "Pool liquidated");

        settled = true;

        uint256 ethToSend = ethAmount;
        if (ethToSend > 0) {
            ethAmount = 0;
            payable(ORCHESTRATOR).transfer(ethToSend);
        }

        emit EmergencyExit(ethToSend);
        return ethToSend;
    }

    /**
     * @dev Check if pool is liquidated
     */
    function isLiquidated() external view returns (bool) {
        return liquidated;
    }

    function getReserves() external view returns (uint256 token, uint256 eth) {
        return (positionTokenAmount, ethAmount);
    }

    /**
     * @dev Calculate price: (reserveETH / reserveToken) * (weightToken / weightETH)
     */
    function _calculatePrice(
        uint256 _reserveETH,
        uint256 _reserveToken,
        uint256 weightToken,
        uint256 weightEth
    ) internal pure returns (uint256) {
        return (_reserveETH * 1e18 / _reserveToken) * weightToken / weightEth;
    }

    /**
     * @dev Calculate swap output using weighted constant product formula
     * Simplified approximation for POC
     */
    function _calculateSwapAmount(
        uint256 reserveIn,
        uint256 reserveOut,
        uint256 weightIn,
        uint256 weightOut,
        uint256 amountIn
    ) internal pure returns (uint256) {
        uint256 newReserveIn = reserveIn + amountIn;
        uint256 ratio = (reserveIn * 1e18) / newReserveIn;

        // Weight-adjusted ratio
        uint256 weightRatio = (weightIn * 1e18) / weightOut;
        uint256 adjustedRatio = (ratio * weightRatio) / 1e18;

        // Protect against underflow if adjusted ratio exceeds 1e18
        if (adjustedRatio >= 1e18) {
            return 0;
        }

        uint256 amountOut = (reserveOut * (1e18 - adjustedRatio)) / 1e18;

        return amountOut;
    }

    /**
     * @dev Receive ETH
     */
    receive() external payable {}
}
