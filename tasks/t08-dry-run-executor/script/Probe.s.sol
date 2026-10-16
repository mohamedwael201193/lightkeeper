// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../contracts/DryRunProbe.sol";

/// @notice Forge script for T08 scenario B.
/// Run WITHOUT --broadcast for the dry-run (simulation only, nothing on-chain).
/// Run WITH --broadcast + private key for the real broadcast whose receipt is
/// compared against the dry-run prediction.
contract ProbeScript is Script {
    function run() external {
        address probe = vm.envAddress("PROBE_ADDRESS");
        vm.startBroadcast();
        DryRunProbe(probe).ping();
        vm.stopBroadcast();
    }
}
