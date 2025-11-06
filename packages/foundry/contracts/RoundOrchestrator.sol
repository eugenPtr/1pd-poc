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
    uint256 public constant LIQUIDATION_THRESHOLD = 9000; // 90% price drop
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

        currentRoundId = 1;
    Round storage firstRound = roundIdToRound[1];
        firstRound.startTime = block.timestamp;
        firstRound.duration = firstRoundDuration;
        firstRound.endTime = block.timestamp + firstRoundDuration;

        firstRound.bondingCurve = new LinearBondingCurve(
            "Bonding Curve Token",
            "BCT",
            1e15,
            1e12,
            address(this)
        );

    emit RoundStarted(1, firstRound.startTime, firstRoundDuration, address(firstRound.bondingCurve));
    }
    
    function startRound(uint256 duration) external onlyOwner {
        require(duration >= MIN_DURATION && duration <= MAX_DURATION, "Invalid duration");

    Round storage currentRound = roundIdToRound[currentRoundId];
        require(block.timestamp >= currentRound.endTime, "Current round not finished");

        if (!currentRound.settled) {
            settleRound();
        }

        currentRoundId++;

    Round storage newRound = roundIdToRound[currentRoundId];
        newRound.startTime = block.timestamp;
        newRound.duration = duration;
        newRound.endTime = block.timestamp + duration;

        newRound.bondingCurve = new LinearBondingCurve(
            "Bonding Curve Token",
            "BCT",
            1e15,
            1e12,
            address(this)
        );

    emit RoundStarted(currentRoundId, newRound.startTime, duration, address(newRound.bondingCurve));
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

        // Generate salt for CREATE2
    bytes32 salt = keccak256(abi.encodePacked(currentRoundId, roundIdToRound[currentRoundId].lbps.length + 1));

        // Deploy position token using factory
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
            tokenAmount,
            SWAP_FEE_PERCENTAGE / 1e13,
            address(this),
            address(round.bondingCurve),
            salt
        );

        // Approve tokens to computed LBP address for constructor transfer
        PositionToken(positionToken).approve(lbpAddress, tokenAmount);

        // Deploy LBP using factory with CREATE2
        address lbp = lbpFactory.deploy{value: msg.value}(
            positionToken,
            tokenAmount,
            SWAP_FEE_PERCENTAGE / 1e13,
            address(this),
            address(round.bondingCurve),
            salt
        );

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
    
    function settleRoundEarly() external onlyOwner nonReentrant {
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


    receive() external payable {}
}