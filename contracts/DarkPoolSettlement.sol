// Zama fhEVM Builder Track — PrivaDEX DarkPool Settlement
// DECRYPTION FLOW (fhEVM v0.9 self-relaying model):
// 1. Call requestPublicDecryption(requestId) on-chain
// 2. Off-chain: call publicDecrypt() via @zama-fhe/relayer-sdk
// 3. Submit cleartext + proof on-chain; verify via FHE.checkSignatures()
// Note: Zama Oracle (v0.8) is discontinued in v0.9.
// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.26;

import { FHE, euint64, externalEuint64, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DarkPoolSettlement is ZamaEthereumConfig {
    address public authorizedSettler;

    mapping(bytes32 => euint64) private matchResults;
    mapping(bytes32 => address[2]) private counterparties;

    event MatchSettled(bytes32 indexed requestId);

    modifier onlyAuthorizedSettler() {
        require(msg.sender == authorizedSettler, "only authorized settler");
        _;
    }

    constructor(address initialAuthorizedSettler) {
        require(initialAuthorizedSettler != address(0), "authorized settler required");
        authorizedSettler = initialAuthorizedSettler;
    }

    function setAuthorizedSettler(address newAuthorizedSettler) external onlyAuthorizedSettler {
        require(newAuthorizedSettler != address(0), "authorized settler required");
        authorizedSettler = newAuthorizedSettler;
    }

    function registerOrder(
        bytes32 requestId,
        address traderA,
        address traderB
    ) external onlyAuthorizedSettler {
        require(requestId != bytes32(0), "request id required");
        require(traderA != address(0) && traderB != address(0), "counterparty required");
        counterparties[requestId] = [traderA, traderB];
    }

    function settleMatch(
        bytes32 requestId,
        externalEuint64 encryptedResult,
        bytes calldata inputProof
    ) external onlyAuthorizedSettler {
        require(requestId != bytes32(0), "request id required");
        require(counterparties[requestId][0] != address(0) && counterparties[requestId][1] != address(0), "order not registered");
        require(!FHE.isInitialized(matchResults[requestId]), "Already settled");

        euint64 result = FHE.fromExternal(encryptedResult, inputProof);
        ebool matched = FHE.eq(result, FHE.asEuint64(1));
        euint64 finalResult = FHE.select(matched, result, FHE.asEuint64(0));

        matchResults[requestId] = finalResult;

        FHE.allowThis(finalResult);
        FHE.allow(finalResult, counterparties[requestId][0]);
        FHE.allow(finalResult, counterparties[requestId][1]);
        FHE.allow(finalResult, msg.sender);

        emit MatchSettled(requestId);
    }

    /// @notice Marks the match result as publicly decryptable.
    /// Trader then calls publicDecrypt() off-chain via zama-fhe/relayer-sdk,
    /// and submits cleartext + proof back via checkMatchResult().
    /// This is the v0.9 self-relaying decryption model (Oracle is discontinued).
    function requestPublicDecryption(bytes32 requestId) external {
        address[2] memory parties = counterparties[requestId];
        require(
            msg.sender == parties[0] || msg.sender == parties[1] || msg.sender == authorizedSettler,
            "Not authorized"
        );
        FHE.makePubliclyDecryptable(matchResults[requestId]);
    }

    function getMatchResult(bytes32 requestId) external view returns (euint64) {
        address counterpartyA = counterparties[requestId][0];
        address counterpartyB = counterparties[requestId][1];
        require(
            msg.sender == counterpartyA || msg.sender == counterpartyB || msg.sender == authorizedSettler,
            "not authorized"
        );
        return matchResults[requestId];
    }
}
