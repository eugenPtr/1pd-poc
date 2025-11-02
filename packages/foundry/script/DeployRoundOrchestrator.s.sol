// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {ScaffoldETHDeploy} from "./DeployHelpers.s.sol";
import {RoundOrchestrator} from "../contracts/RoundOrchestrator.sol";
import {LBPFactory} from "../contracts/LBPFactory.sol";
import {PositionTokenFactory} from "../contracts/PositionTokenFactory.sol";
import {console} from "forge-std/console.sol";

/**
 * @notice Deploy script for RoundOrchestrator contract
 * @dev Inherits ScaffoldETHDeploy which:
 *      - Includes forge-std/Script.sol for deployment
 *      - Includes ScaffoldEthDeployerRunner modifier
 *      - Provides `deployer` variable
 * Example:
 * yarn deploy --file DeployRoundOrchestrator.s.sol  # local anvil chain
 * yarn deploy --file DeployRoundOrchestrator.s.sol --network optimism # live network (requires keystore)
 */
contract DeployRoundOrchestrator is ScaffoldETHDeploy {
    /**
     * @dev Deployer setup based on `ETH_KEYSTORE_ACCOUNT` in `.env`:
     *      - "scaffold-eth-default": Uses Anvil's account #9 (0xa0Ee7A142d267C1f36714E4a8F75612F20a79720), no password prompt
     *      - "scaffold-eth-custom": requires password used while creating keystore
     *
     * Note: Must use ScaffoldEthDeployerRunner modifier to:
     *      - Setup correct `deployer` account and fund it
     *      - Export contract addresses & ABIs to `nextjs` packages
     */
    function run() external ScaffoldEthDeployerRunner {
        // Step 1: Deploy factory contracts
        console.logString("Deploying factory contracts...");

        LBPFactory lbpFactory = new LBPFactory();
        console.logString(
            string.concat("LBPFactory deployed at: ", vm.toString(address(lbpFactory)))
        );

        PositionTokenFactory positionTokenFactory = new PositionTokenFactory();
        console.logString(
            string.concat("PositionTokenFactory deployed at: ", vm.toString(address(positionTokenFactory)))
        );

        // Step 2: Deploy RoundOrchestrator with factory addresses
        uint256 firstRoundDuration = 1 hours;

        RoundOrchestrator roundOrchestrator = new RoundOrchestrator(
            deployer,
            firstRoundDuration,
            address(lbpFactory),
            address(positionTokenFactory)
        );

        console.logString(
            string.concat(
                "RoundOrchestrator deployed at: ", vm.toString(address(roundOrchestrator))
            )
        );

        // Add to deployments for export
        deployments.push(
            Deployment({name: "LBPFactory", addr: address(lbpFactory)})
        );
        deployments.push(
            Deployment({name: "PositionTokenFactory", addr: address(positionTokenFactory)})
        );
        deployments.push(
            Deployment({name: "RoundOrchestrator", addr: address(roundOrchestrator)})
        );
    }
}
