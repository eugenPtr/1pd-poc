// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract PositionToken is ERC20, Ownable {
    address[] public holders;
    mapping(address => bool) public isHolder;

    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address initialOwner
    ) ERC20(name, symbol) Ownable(initialOwner) {
        _mint(initialOwner, initialSupply);
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);

        // Don't track initial minting to owner (from == address(0) && holders.length == 0)
        // Only track subsequent transfers to actual holders
        if (to != address(0) && !isHolder[to] && value > 0 && !(from == address(0) && holders.length == 0)) {
            holders.push(to);
            isHolder[to] = true;
        }
    }

    function getAllHolders() public view returns (address[] memory) {
        return holders;
    }
}