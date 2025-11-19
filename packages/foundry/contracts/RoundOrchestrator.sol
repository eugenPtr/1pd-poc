// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {LinearBondingCurve} from "./LinearBondingCurve.sol";
import {LBPFactory} from "./LBPFactory.sol";
import {PositionTokenFactory} from "./PositionTokenFactory.sol";
import {LBP} from "./LBP.sol";
import {PositionToken} from "./PositionToken.sol";

contract RoundOrchestrator is Ownable, ReentrancyGuard {
    
    // Constants
    uint256 public constant PERCENTAGE_BASE = 10000; // 100% = 10000
    uint256 public constant MIN_POSITION_ETH = 0.0001 ether;
    uint256 public constant MAX_POSITION_ETH = 100 ether;
    uint256 public constant MIN_DURATION = 10 minutes;
    uint256 public constant MAX_DURATION = 1 days;
    uint256 public constant SWAP_FEE_PERCENTAGE = 5e15; // 0.5% in 1e18 format

    // Factory contract addresses for CREATE2 deployments
    LBPFactory public immutable lbpFactory;
    PositionTokenFactory public immutable positionTokenFactory;

    // Round data
    struct Round {
        uint256 startTime;
        uint256 duration;
        uint256 endTime;
        address[] lbps;
        address winnerLbp;
        bool settled;
        LinearBondingCurve bondingCurve;
    }
    
    // Position data
    struct Position {
        uint256 roundId;
        address creator;
    }
    
    // State variables
    uint256 public currentRoundId;
    uint256 public creatorAllocationBps; // Basis points: 1000 = 10%
    uint256 public startWeightBps; // Defaults to 90.91%
    uint256 public decayTimescale; // Defaults to 400
    uint256 public liquidationThresholdBps; // Defaults to 30%

    mapping(uint256 => Round) public roundIdToRound;
    mapping(address => Position) public lbpAddressToPosition;

    // Events
    event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 duration, address indexed bondingPool);
    event PositionCreated(
        uint256 indexed roundId,
        address indexed lbpAddress,
        address indexed creator,
        address tokenAddress,
        uint256 ethAmount,
        uint256 tokenSupply,
        string name,
        string symbol,
        string imageURI
    );
    event PositionLiquidated(address indexed lbpAddress);
    event RoundSettled(uint256 indexed roundId, address indexed winnerLbp);
    event CreatorAllocationUpdated(uint256 oldBps, uint256 newBps);
    event PoolConfigUpdated(uint256 startWeightBps, uint256 decayTimescale, uint256 liquidationThresholdBps);

    constructor(
        address initialOwner,
        uint256 firstRoundDuration,
        address _lbpFactory,
        address _positionTokenFactory
    ) Ownable(initialOwner) {
        require(firstRoundDuration >= MIN_DURATION && firstRoundDuration <= MAX_DURATION, "Invalid duration");
        require(_lbpFactory != address(0), "Invalid LBP factory");
        require(_positionTokenFactory != address(0), "Invalid PositionToken factory");

        lbpFactory = LBPFactory(_lbpFactory);
        positionTokenFactory = PositionTokenFactory(_positionTokenFactory);
        creatorAllocationBps = 1000; // 10% initial allocation
        startWeightBps = 9091;
        decayTimescale = 400;
        liquidationThresholdBps = 3000;

        currentRoundId = 0;
        _startRoundInternal(firstRoundDuration);
    }
    
    function startRound(uint256 duration) external nonReentrant {
        _validateDuration(duration);

        Round storage currentRound = roundIdToRound[currentRoundId];
        require(block.timestamp >= currentRound.endTime, "Current round not finished");

        if (!currentRound.settled) {
            _settleRound(currentRound);
        }

        _startRoundInternal(duration);
    }

    function startRoundEarly(uint256 duration) external nonReentrant {
        _validateDuration(duration);

        Round storage currentRound = roundIdToRound[currentRoundId];
        if (!currentRound.settled) {
            _settleRound(currentRound);
        }

        _startRoundInternal(duration);
    }

    /**
     * @dev Set the creator allocation percentage
     * @param newBps New allocation in basis points (1000 = 10%)
     */
    function setCreatorAllocation(uint256 newBps) external {
        require(newBps <= 5000, "Allocation cannot exceed 50%");
        uint256 oldBps = creatorAllocationBps;
        creatorAllocationBps = newBps;
        emit CreatorAllocationUpdated(oldBps, newBps);
    }

    function setPoolConfig(
        uint256 newStartWeightBps,
        uint256 newDecayTimescale,
        uint256 newLiquidationThresholdBps
    ) external {
        require(newStartWeightBps > 0 && newStartWeightBps < PERCENTAGE_BASE, "Invalid start weight");
        require(newDecayTimescale > 0, "Invalid decay");
        require(
            newLiquidationThresholdBps > 0 && newLiquidationThresholdBps <= PERCENTAGE_BASE,
            "Invalid liq threshold"
        );

        startWeightBps = newStartWeightBps;
        decayTimescale = newDecayTimescale;
        liquidationThresholdBps = newLiquidationThresholdBps;

        emit PoolConfigUpdated(newStartWeightBps, newDecayTimescale, newLiquidationThresholdBps);
    }

    /**
     * @dev Create a new position in the current round
     */
    function createPosition(
        string memory name,
        string memory symbol,
        uint256 tokenAmount,
        string memory imageURI
    ) external payable nonReentrant returns (address) {
        require(msg.value >= MIN_POSITION_ETH && msg.value <= MAX_POSITION_ETH, "Invalid ETH amount");
        require(tokenAmount > 0, "Token amount must be positive");

    Round storage round = roundIdToRound[currentRoundId];
        require(block.timestamp < round.endTime, "Round already ended");

        // Calculate creator allocation
        uint256 creatorTokens = (tokenAmount * creatorAllocationBps) / PERCENTAGE_BASE;
        uint256 poolTokens = tokenAmount - creatorTokens;
        require(poolTokens > 0, "Pool tokens must be positive");

        // Generate salt for CREATE2
        bytes32 salt = keccak256(abi.encodePacked(currentRoundId, roundIdToRound[currentRoundId].lbps.length + 1));

        // Deploy position token using factory (full supply)
        address positionToken = positionTokenFactory.deploy(
            name,
            symbol,
            tokenAmount,
            address(this),
            imageURI,
            salt
        );

        // Compute LBP address before deployment
        address lbpAddress = lbpFactory.getDeployAddress(
            positionToken,
            poolTokens,  // Only pool portion goes to LBP
            SWAP_FEE_PERCENTAGE / 1e13,
            address(this),
            address(round.bondingCurve),
            startWeightBps,
            decayTimescale,
            liquidationThresholdBps,
            salt
        );

        // Approve only pool tokens to computed LBP address for constructor transfer
        PositionToken(positionToken).approve(lbpAddress, poolTokens);

        // Deploy LBP using factory with CREATE2 (only pool tokens)
        address lbp = lbpFactory.deploy{value: msg.value}(
            positionToken,
            poolTokens,  // Only pool portion goes to LBP
            SWAP_FEE_PERCENTAGE / 1e13,
            address(this),
            address(round.bondingCurve),
            startWeightBps,
            decayTimescale,
            liquidationThresholdBps,
            salt
        );

        // Transfer creator allocation directly to creator
        PositionToken(positionToken).transfer(msg.sender, creatorTokens);

    lbpAddressToPosition[lbp] = Position({ roundId: currentRoundId, creator: msg.sender });

        // Add position to round
        round.lbps.push(lbp);

        emit PositionCreated(
            currentRoundId,
            lbp,
            msg.sender,
            positionToken,
            msg.value,
            tokenAmount,
            name,
            symbol,
            imageURI
        );

        return lbp;
    }
    
    function getOwnedSupply(address lbpAddr) public view returns (uint256) {
        require(lbpAddr != address(0), "Invalid LBP address");

        LBP lbp = LBP(payable(lbpAddr));

        if (lbp.isLiquidated()) return 0;

        PositionToken positionToken = PositionToken(address(lbp.POSITION_TOKEN()));
        uint256 totalSupply = positionToken.totalSupply();

        return totalSupply - lbp.positionTokenAmount();
    }
    
    function liquidatePosition(address lbpAddr) external nonReentrant {
        require(lbpAddr != address(0), "Invalid LBP address");

        LBP lbp = LBP(payable(lbpAddr));

        require(!lbp.isLiquidated(), "Already liquidated");

        Position storage pos = lbpAddressToPosition[lbpAddr];
    Round storage round = roundIdToRound[pos.roundId];
        require(!round.settled, "Round already settled");

        lbp.liquidatePool();

        emit PositionLiquidated(lbpAddr);
    }
    
    function settleRoundEarly() public nonReentrant {
        Round storage round = roundIdToRound[currentRoundId];
        require(!round.settled, "Round already settled");

        _settleRound(round);
    }

    function settleRound() public nonReentrant {
        Round storage round = roundIdToRound[currentRoundId];
        require(block.timestamp >= round.endTime, "Round not ended yet");
        require(!round.settled, "Round already settled");

        _settleRound(round);
    }

    function _settleRound(Round storage round) internal {
        uint256 highestOwned = 0;
        address winnerLbp = address(0);

        for (uint256 i = 0; i < round.lbps.length; i++) {
            address lbpAddr = round.lbps[i];
            uint256 ownedSupply = getOwnedSupply(lbpAddr);

            if (ownedSupply > highestOwned) {
                highestOwned = ownedSupply;
                winnerLbp = lbpAddr;
            }
        }

        round.winnerLbp = winnerLbp;

        for (uint256 i = 0; i < round.lbps.length; i++) {
            address lbpAddr = round.lbps[i];
            LBP lbp = LBP(payable(lbpAddr));

            if (lbpAddr == winnerLbp) {
                (address[] memory winners, uint256[] memory shares, ) = lbp.settleWinner();
                // Distribute BCT to winners via bonding curve
                if (winners.length > 0) {
                    round.bondingCurve.distributeToWinners(winners, shares);
                }
            } else if (!lbp.isLiquidated()) {
                lbp.forceLiquidate();
            }
        }

        round.settled = true;

        emit RoundSettled(currentRoundId, winnerLbp);
    }

    function getRoundPositions() external view returns (address[] memory) {
        return roundIdToRound[currentRoundId].lbps;
    }

    /**
     * @dev Returns the bonding pool (bonding curve) address for the current round
     */
    function getCurrentBondingPool() external view returns (address) {
        return address(roundIdToRound[currentRoundId].bondingCurve);
    }

    function _startRoundInternal(uint256 duration) internal {
        currentRoundId++;

        Round storage newRound = roundIdToRound[currentRoundId];
        newRound.startTime = block.timestamp;
        newRound.duration = duration;
        newRound.endTime = block.timestamp + duration;

        newRound.bondingCurve = new LinearBondingCurve(
            "Bonding Curve Token",
            "BCT",
            1e13,
            1e10,
            address(this)
        );

        emit RoundStarted(currentRoundId, newRound.startTime, duration, address(newRound.bondingCurve));
    }

    function _validateDuration(uint256 duration) internal pure {
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "Invalid duration");
    }

    receive() external payable {}
}
