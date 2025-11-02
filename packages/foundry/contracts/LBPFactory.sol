// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.20;

import {LBP} from "./LBP.sol";

/**
 * @title LBPFactory
 * @notice Simple factory for deploying LBP contracts using CREATE2
 * @dev Wraps CREATE2 deployment - no constructor modifications needed
 */
contract LBPFactory {
    event LBPDeployed(address indexed lbp, address indexed positionToken, bytes32 salt);

    /**
     * @notice Deploy a new LBP using CREATE2
     */
    function deploy(
        address _positionToken,
        uint256 _tokenAmount,
        uint256 _swapFee,
        address _orchestrator,
        address _bondingCurve,
        bytes32 salt
    ) external payable returns (address lbp) {
        // Deploy using CREATE2 with all constructor params
        lbp = address(
            new LBP{value: msg.value, salt: salt}(
                _positionToken,
                _tokenAmount,
                _swapFee,
                _orchestrator,
                _bondingCurve
            )
        );

        emit LBPDeployed(lbp, _positionToken, salt);
    }

    /**
     * @notice Compute the CREATE2 address for an LBP deployment
     * @dev Must match the exact bytecode with constructor args
     */
    function getDeployAddress(
        address _positionToken,
        uint256 _tokenAmount,
        uint256 _swapFee,
        address _orchestrator,
        address _bondingCurve,
        bytes32 salt
    ) external view returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(LBP).creationCode,
            abi.encode(_positionToken, _tokenAmount, _swapFee, _orchestrator, _bondingCurve)
        );

        bytes32 hash = keccak256(
            abi.encodePacked(bytes1(0xff), address(this), salt, keccak256(bytecode))
        );

        return address(uint160(uint256(hash)));
    }
}
