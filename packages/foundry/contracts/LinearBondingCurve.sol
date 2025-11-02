// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title LinearBondingCurve
 * @dev A bonding curve token with a linear price function: price = basePrice + (slope * supply)
 * Accepts native ETH for minting and returns ETH when burning
 * Supports liquidation bonus pool for winner distribution
 */
contract LinearBondingCurve is ERC20, Ownable, ReentrancyGuard {
    
    // Linear bonding curve parameters
    uint256 public basePrice;
    uint256 public slope;
    uint256 public liquidationBonusPool;

    // Precision factor for calculations
    uint256 private constant PRECISION = 1e18;

    event TokensMinted(address indexed recipient, uint256 ethAmount, uint256 bctAmount);
    event TokensBurned(address indexed burner, uint256 bctAmount, uint256 ethAmount);
    event BatchMint(uint256 totalEth, uint256 totalBct);
    event ETHDeposited(address indexed depositor, uint256 ethAmount, uint256 bonusPool);
    event DistributedToWinners(
        address[] winners,
        uint256[] bctAmounts,
        uint256 totalEth,
        uint256 totalBct
    );
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 _basePrice,
        uint256 _slope,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        require(_basePrice > 0, "Base price must be positive");

        basePrice = _basePrice;
        slope = _slope;
    }
    
    /**
     * @dev Calculates the current price based on the linear formula
     */
    function getCurrentPrice() public view returns (uint256) {
        return basePrice + (slope * totalSupply()) / PRECISION;
    }
    
    /**
     * @dev Calculates the average price for minting a given amount of tokens
     */
    function getAveragePriceForMint(uint256 tokenAmount) public view returns (uint256) {
        uint256 currentSupply = totalSupply();
        uint256 priceStart = basePrice + (slope * currentSupply) / PRECISION;
        uint256 priceEnd = basePrice + (slope * (currentSupply + tokenAmount)) / PRECISION;
        
        // Average price = (priceStart + priceEnd) / 2
        return (priceStart + priceEnd) / 2;
    }
    
    /**
     * @dev Calculates how many tokens to mint for a given ETH amount
     */
    function calculateBctAmount(uint256 ethAmount) public view returns (uint256) {
        if (ethAmount == 0) return 0;
        
        // For a linear curve with formula price = basePrice + (slope * supply),
        // we can derive the quadratic formula to solve for the token amount:
        //
        // ethAmount = tokenAmount * (basePrice + slope * (supply + tokenAmount/2))
        //
        // Solving for tokenAmount:
        // tokenAmount = (-b + sqrt(b^2 + 4ac)) / 2a
        // where:
        // a = slope/2
        // b = basePrice + slope * supply
        // c = -ethAmount

        uint256 currentSupply = totalSupply();
        uint256 a = slope / 2;
        uint256 b = basePrice + (slope * currentSupply) / PRECISION;

        // If slope is very small, we can approximate with a simple division
        if (a == 0 || b * PRECISION > a * currentSupply) {
            return (ethAmount * PRECISION) / b;
        }

        // Otherwise use the quadratic formula
        uint256 discriminant = b * b + 4 * a * ethAmount / PRECISION;
        uint256 sqrtDiscriminant = sqrt(discriminant * PRECISION);

        return (sqrtDiscriminant - b * PRECISION) * PRECISION / (2 * a);
    }
    
    /**
     * @dev Calculates how much ETH to return for selling a given amount of tokens
     */
    function calculateEthAmount(uint256 bctAmount) public view returns (uint256) {
        if (bctAmount == 0) return 0;
        
        uint256 currentSupply = totalSupply();
        require(bctAmount <= currentSupply, "Cannot sell more than supply");
        
        uint256 priceStart = basePrice + (slope * currentSupply) / PRECISION;
        uint256 priceEnd = basePrice + (slope * (currentSupply - bctAmount)) / PRECISION;
        
        // Average price = (priceStart + priceEnd) / 2
        uint256 averagePrice = (priceStart + priceEnd) / 2;
        
        return (bctAmount * averagePrice) / PRECISION;
    }
    
    /**
     * @dev Square root function
     */
    function sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        
        return y;
    }
    
    /**
     * @dev Mints BCT tokens for a recipient based on ETH input
     * Accepts ETH via msg.value
     */
    function mintBctFor(address recipient, uint256 ethAmount)
        external
        payable
        nonReentrant
        returns (uint256)
    {
        require(msg.value == ethAmount, "ETH amount mismatch");
        require(ethAmount > 0, "ETH amount must be positive");

        // Calculate BCT amount to mint
        uint256 bctAmount = calculateBctAmount(ethAmount);
        require(bctAmount > 0, "BCT amount too small");

        // Mint BCT tokens to recipient
        _mint(recipient, bctAmount);

        emit TokensMinted(recipient, ethAmount, bctAmount);
        return bctAmount;
    }
    
    /**
     * @dev Allows users to burn BCT tokens and receive ETH
     */
    function burnBct(uint256 bctAmount) external nonReentrant returns (uint256) {
        require(bctAmount > 0, "BCT amount must be positive");
        require(balanceOf(msg.sender) >= bctAmount, "Insufficient BCT balance");

        // Calculate ETH amount to return
        uint256 ethAmount = calculateEthAmount(bctAmount);
        require(ethAmount > 0, "ETH amount too small");
        require(ethAmount <= address(this).balance, "Insufficient ETH reserves");

        // Burn BCT tokens
        _burn(msg.sender, bctAmount);

        // Transfer ETH to user
        payable(msg.sender).transfer(ethAmount);

        emit TokensBurned(msg.sender, bctAmount, ethAmount);
        return ethAmount;
    }

    function depositEth() external payable nonReentrant {
        require(msg.value > 0, "Must deposit ETH");

        liquidationBonusPool += msg.value;

        emit ETHDeposited(msg.sender, msg.value, liquidationBonusPool);
    }

    function distributeToWinners(
        address[] calldata winners,
        uint256[] calldata shares
    ) external onlyOwner nonReentrant returns (uint256) {
        require(winners.length == shares.length, "Arrays length mismatch");
        require(winners.length > 0, "No winners");
        require(liquidationBonusPool > 0, "No ETH to distribute");

        uint256 totalBct = calculateBctAmount(liquidationBonusPool);

        uint256[] memory bctAmounts = new uint256[](winners.length);
        for (uint256 i = 0; i < winners.length; i++) {
            uint256 bctAmount = (totalBct * shares[i]) / 10000;
            _mint(winners[i], bctAmount);
            bctAmounts[i] = bctAmount;
        }

        uint256 totalEth = liquidationBonusPool;
        liquidationBonusPool = 0;

        emit DistributedToWinners(winners, bctAmounts, totalEth, totalBct);

        return totalBct;
    }
    
    /**
     * @dev Allows receiving ETH
     */
    receive() external payable {
        // Accept ETH directly
    }
}