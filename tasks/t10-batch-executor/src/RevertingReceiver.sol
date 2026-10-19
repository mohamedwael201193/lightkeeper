// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Honest partial-failure fixture: a recipient that refuses native dust.
///         Used in the live T10 run so the batch provably isolates one failing
///         action while every other recipient is paid. Deployed on Atlantic.
contract RevertingReceiver {
    event Refused(address indexed from, uint256 amount);

    receive() external payable {
        emit Refused(msg.sender, msg.value);
        revert("RevertingReceiver: refusing native dust");
    }
}
