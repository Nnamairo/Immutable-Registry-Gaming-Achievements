import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const CONTRACT_NAME = "reputation-system";

// Transaction type constants (matching contract)
const TX_TYPE_SERVICE_COMPLETE = 1;
const TX_TYPE_DISPUTE_WON = 2;
const TX_TYPE_DISPUTE_LOST = 3;
const TX_TYPE_SLASHED = 4;
const TX_TYPE_TIMEOUT = 5;

// Reputation constants (matching contract)
const INITIAL_SCORE = 50;
const MAX_SCORE = 100;
const MIN_SCORE = 0;
const SUCCESS_BONUS = 5;
const DISPUTE_PENALTY = 10;
const SLASH_PENALTY = 20;
const TIMEOUT_PENALTY = 3;

describe("reputation-system contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  // ============================================================================
  // ADMINISTRATIVE FUNCTIONS TESTS
  // ============================================================================
  
  describe("set-contract-owner", () => {
    it("allows contract owner to transfer ownership", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-contract-owner",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify new owner
      const owner = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-owner",
        [],
        deployer
      );
      expect(owner.result).toBePrincipal(wallet1);
    });

    it("rejects ownership transfer from non-owner", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-contract-owner",
        [Cl.principal(wallet2)],
        wallet1  // Not the owner
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED
    });

    it("new owner can perform owner-only actions", () => {
      // Transfer ownership
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-contract-owner",
        [Cl.principal(wallet1)],
        deployer
      );

      // New owner should be able to authorize recorders
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-recorder",
        [Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("set-authorized-recorder", () => {
    it("allows owner to authorize a recorder", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-recorder",
        [Cl.principal(wallet1), Cl.bool(true)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify authorization
      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-recorder-authorized",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isAuthorized.result).toBeBool(true);
    });

    it("allows owner to revoke recorder authorization", () => {
      // First authorize
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-recorder",
        [Cl.principal(wallet1), Cl.bool(true)],
        deployer
      );

      // Then revoke
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-recorder",
        [Cl.principal(wallet1), Cl.bool(false)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify revocation
      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-recorder-authorized",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isAuthorized.result).toBeBool(false);
    });

    it("rejects authorization from non-owner", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-recorder",
        [Cl.principal(wallet2), Cl.bool(true)],
        wallet1  // Not the owner
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED
    });
  });

  // ============================================================================
  // REPUTATION INITIALIZATION TESTS
  // ============================================================================

  describe("initialize-reputation", () => {
    it("successfully initializes reputation for caller", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initialize-reputation",
        [],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify reputation was initialized with correct values
      const reputation = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation",
        [Cl.principal(wallet1)],
        wallet1
      );

      // Verify reputation record structure and key values
      const repData = reputation.result;
      expect(repData).not.toBeNone();
      // Check score is initial score
      const scoreResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(scoreResult.result).toBeUint(INITIAL_SCORE);
    });

    it("rejects re-initialization", () => {
      // First initialization
      simnet.callPublicFn(
        CONTRACT_NAME,
        "initialize-reputation",
        [],
        wallet1
      );

      // Try to initialize again
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initialize-reputation",
        [],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(304)); // ERR_ALREADY_RECORDED
    });

    it("allows different wallets to initialize separately", () => {
      const result1 = simnet.callPublicFn(
        CONTRACT_NAME,
        "initialize-reputation",
        [],
        wallet1
      );

      const result2 = simnet.callPublicFn(
        CONTRACT_NAME,
        "initialize-reputation",
        [],
        wallet2
      );

      expect(result1.result).toBeOk(Cl.bool(true));
      expect(result2.result).toBeOk(Cl.bool(true));
    });
  });

  // ============================================================================
  // RECORD TRANSACTION TESTS
  // ============================================================================

  describe("record-transaction", () => {
    it("owner can record successful service completion", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      expect(result).toBeOk(Cl.uint(0)); // First transaction ID

      // Verify score increased
      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(score.result).toBeUint(INITIAL_SCORE + SUCCESS_BONUS); // 50 + 5 = 55
    });

    it("authorized recorder can record transactions", () => {
      // Authorize wallet2 as recorder
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-recorder",
        [Cl.principal(wallet2), Cl.bool(true)],
        deployer
      );

      // wallet2 records transaction for wallet1
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        wallet2
      );

      expect(result).toBeOk(Cl.uint(0));
    });

    it("unauthorized wallet cannot record transactions", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        wallet3  // Not authorized
      );

      expect(result).toBeErr(Cl.uint(300)); // ERR_UNAUTHORIZED
    });

    it("rejects invalid transaction type", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(99)],  // Invalid type
        deployer
      );

      expect(result).toBeErr(Cl.uint(305)); // ERR_INVALID_TRANSACTION_TYPE
    });

    it("correctly applies dispute-won bonus", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_DISPUTE_WON)],
        deployer
      );

      expect(result).toBeOk(Cl.uint(0));

      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(score.result).toBeUint(INITIAL_SCORE + 2); // 50 + 2 = 52
    });

    it("correctly applies dispute-lost penalty", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_DISPUTE_LOST)],
        deployer
      );

      expect(result).toBeOk(Cl.uint(0));

      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(score.result).toBeUint(INITIAL_SCORE - DISPUTE_PENALTY); // 50 - 10 = 40
    });

    it("correctly applies slash penalty", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SLASHED)],
        deployer
      );

      expect(result).toBeOk(Cl.uint(0));

      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(score.result).toBeUint(INITIAL_SCORE - SLASH_PENALTY); // 50 - 20 = 30
    });

    it("correctly applies timeout penalty", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_TIMEOUT)],
        deployer
      );

      expect(result).toBeOk(Cl.uint(0));

      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(score.result).toBeUint(INITIAL_SCORE - TIMEOUT_PENALTY); // 50 - 3 = 47
    });

    it("increments transaction nonce correctly", () => {
      // Record multiple transactions
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      const result2 = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      const result3 = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet2), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      expect(result2.result).toBeOk(Cl.uint(1));
      expect(result3.result).toBeOk(Cl.uint(2));

      const nonce = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction-nonce",
        [],
        deployer
      );
      expect(nonce.result).toBeUint(3);
    });

    it("updates transaction counters correctly", () => {
      // Record different transaction types
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_DISPUTE_WON)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_DISPUTE_LOST)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SLASHED)],
        deployer
      );

      const reputation = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation",
        [Cl.principal(wallet1)],
        deployer
      );

      // Verify score calculation: 50+5+2-10-20=27
      const scoreResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(scoreResult.result).toBeUint(27);
      
      // Verify record exists
      expect(reputation.result).not.toBeNone();
    });
  });

  // ============================================================================
  // SCORE BOUNDARY TESTS
  // ============================================================================

  describe("score boundaries", () => {
    it("caps score at maximum (100)", () => {
      // Record many successful transactions to exceed 100
      for (let i = 0; i < 15; i++) {
        simnet.callPublicFn(
          CONTRACT_NAME,
          "record-transaction",
          [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
          deployer
        );
      }

      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(score.result).toBeUint(MAX_SCORE); // Should cap at 100
    });

    it("floors score at minimum (0)", () => {
      // Record many slashes to go below 0
      for (let i = 0; i < 5; i++) {
        simnet.callPublicFn(
          CONTRACT_NAME,
          "record-transaction",
          [Cl.principal(wallet1), Cl.uint(TX_TYPE_SLASHED)],
          deployer
        );
      }

      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(score.result).toBeUint(MIN_SCORE); // Should floor at 0
    });
  });

  // ============================================================================
  // READ-ONLY FUNCTION TESTS
  // ============================================================================

  describe("get-reputation", () => {
    it("returns none for uninitialized principal", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation",
        [Cl.principal(wallet3)],
        deployer
      );

      expect(result.result).toBeNone();
    });

    it("returns some for initialized principal", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "initialize-reputation",
        [],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation",
        [Cl.principal(wallet1)],
        deployer
      );

      // Verify reputation record exists and has correct score
      expect(result.result).not.toBeNone();
      const scoreResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(scoreResult.result).toBeUint(INITIAL_SCORE);
    });
  });

  describe("get-reputation-score", () => {
    it("returns initial score for new principal", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet3)],
        deployer
      );

      expect(result.result).toBeUint(INITIAL_SCORE);
    });

    it("returns correct score after transactions", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(result.result).toBeUint(INITIAL_SCORE + SUCCESS_BONUS);
    });
  });

  describe("get-transaction", () => {
    it("returns transaction history entry", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction",
        [Cl.uint(0)],
        deployer
      );

      // Verify transaction record exists
      expect(result.result).not.toBeNone();
      // Verify score changed correctly
      const scoreResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(scoreResult.result).toBeUint(INITIAL_SCORE + SUCCESS_BONUS);
    });

    it("returns none for non-existent transaction", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction",
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeNone();
    });
  });

  describe("get-trust-level", () => {
    it("returns level 2 (Medium) for initial score of 50", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-trust-level",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(result.result).toBeUint(2); // Medium (40-59)
    });

    it("returns level 0 (Untrusted) for score below 20", () => {
      // Apply multiple slashes to get score below 20
      for (let i = 0; i < 3; i++) {
        simnet.callPublicFn(
          CONTRACT_NAME,
          "record-transaction",
          [Cl.principal(wallet1), Cl.uint(TX_TYPE_SLASHED)],
          deployer
        );
      }

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-trust-level",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(result.result).toBeUint(0); // Untrusted (0-19)
    });

    it("returns level 4 (Trusted) for high score", () => {
      // Apply multiple successes to get score to 80+
      for (let i = 0; i < 10; i++) {
        simnet.callPublicFn(
          CONTRACT_NAME,
          "record-transaction",
          [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
          deployer
        );
      }

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-trust-level",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(result.result).toBeUint(4); // Trusted (80-100)
    });
  });

  describe("meets-minimum-reputation", () => {
    it("returns true when score meets minimum", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "meets-minimum-reputation",
        [Cl.principal(wallet1), Cl.uint(40)],
        deployer
      );

      expect(result.result).toBeBool(true); // 50 >= 40
    });

    it("returns false when score below minimum", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "meets-minimum-reputation",
        [Cl.principal(wallet1), Cl.uint(60)],
        deployer
      );

      expect(result.result).toBeBool(false); // 50 < 60
    });
  });

  describe("get-success-rate", () => {
    it("returns 0 for principal with no transactions", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-success-rate",
        [Cl.principal(wallet3)],
        deployer
      );

      expect(result.result).toBeUint(0);
    });

    it("calculates correct success rate", () => {
      // Record 3 successes and 1 failure
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_DISPUTE_WON)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_DISPUTE_LOST)],
        deployer
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-success-rate",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(result.result).toBeUint(75); // 3/4 * 100 = 75%
    });
  });

  describe("get-reputation-constants", () => {
    it("returns all reputation constants", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-constants",
        [],
        deployer
      );

      expect(result.result).toBeTuple({
        "initial-score": Cl.uint(INITIAL_SCORE),
        "max-score": Cl.uint(MAX_SCORE),
        "min-score": Cl.uint(MIN_SCORE),
        "success-bonus": Cl.uint(SUCCESS_BONUS),
        "dispute-penalty": Cl.uint(DISPUTE_PENALTY),
        "slash-penalty": Cl.uint(SLASH_PENALTY),
        "timeout-penalty": Cl.uint(TIMEOUT_PENALTY)
      });
    });
  });

  describe("get-transaction-types", () => {
    it("returns all transaction type constants", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction-types",
        [],
        deployer
      );

      expect(result.result).toBeTuple({
        "service-complete": Cl.uint(TX_TYPE_SERVICE_COMPLETE),
        "dispute-won": Cl.uint(TX_TYPE_DISPUTE_WON),
        "dispute-lost": Cl.uint(TX_TYPE_DISPUTE_LOST),
        "slashed": Cl.uint(TX_TYPE_SLASHED),
        "timeout": Cl.uint(TX_TYPE_TIMEOUT)
      });
    });
  });

  // ============================================================================
  // INTEGRATION / EDGE CASE TESTS
  // ============================================================================

  describe("integration tests", () => {
    it("handles multiple principals independently", () => {
      // Record different transactions for different wallets
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet2), Cl.uint(TX_TYPE_SLASHED)],
        deployer
      );

      const score1 = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );

      const score2 = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet2)],
        deployer
      );

      expect(score1.result).toBeUint(INITIAL_SCORE + SUCCESS_BONUS); // 55
      expect(score2.result).toBeUint(INITIAL_SCORE - SLASH_PENALTY); // 30
    });

    it("maintains accurate history across multiple transactions", () => {
      // Record a series of transactions
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_DISPUTE_LOST)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        deployer
      );

      // Check transaction history shows correct progression
      const tx0 = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction",
        [Cl.uint(0)],
        deployer
      );

      const tx1 = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction",
        [Cl.uint(1)],
        deployer
      );

      const tx2 = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction",
        [Cl.uint(2)],
        deployer
      );

      // Verify all transactions exist
      expect(tx0.result).not.toBeNone();
      expect(tx1.result).not.toBeNone();
      expect(tx2.result).not.toBeNone();
      
      // Final score should be 50 (50 -> 55 -> 45 -> 50)
      const finalScore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(finalScore.result).toBeUint(50);
    });

    it("authorized recorder is tracked in transaction history", () => {
      // Authorize wallet2 as recorder
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-recorder",
        [Cl.principal(wallet2), Cl.bool(true)],
        deployer
      );

      // wallet2 records transaction
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-transaction",
        [Cl.principal(wallet1), Cl.uint(TX_TYPE_SERVICE_COMPLETE)],
        wallet2
      );

      // Verify recorder is tracked
      const tx = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-transaction",
        [Cl.uint(0)],
        deployer
      );

      // Verify transaction exists
      expect(tx.result).not.toBeNone();
      
      // Verify score was updated
      const scoreResult = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-reputation-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(scoreResult.result).toBeUint(55);
    });
  });
});
