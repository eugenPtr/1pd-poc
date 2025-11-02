// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {PositionToken} from "./PositionToken.sol";

/**
 * @title PositionTokenFactory
 * @notice Simple factory for deploying PositionToken contracts using CREATE2
 * @dev Wraps CREATE2 deployment - no constructor modifications needed
 */
contract PositionTokenFactory {
    event PositionTokenDeployed(address indexed token, string name, string symbol, bytes32 salt);

    /**
     * @notice Deploy a new PositionToken using CREATE2
     */
    function deploy(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _initialOwner,
        bytes32 salt
    ) external returns (address token) {
        // Deploy using CREATE2 with all constructor params
        token = address(
            new PositionToken{salt: salt}(_name, _symbol, _initialSupply, _initialOwner)
        );

        emit PositionTokenDeployed(token, _name, _symbol, salt);
    }

    /**
     * @notice Compute the CREATE2 address for a PositionToken deployment
     * @dev Must match the exact bytecode with constructor args
     */
    function getDeployAddress(
        string memory _name,
        string memory _symbol,
        uint256 _initialSupply,
        address _initialOwner,
        bytes32 salt
    ) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(PositionToken).creationCode,
            abi.encode(_name, _symbol, _initialSupply, _initialOwner)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );

        return address(uint160(uint256(hash)));
    }
}
