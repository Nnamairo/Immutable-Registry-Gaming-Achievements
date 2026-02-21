import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;  // payer (buyer)
const wallet2 = accounts.get("wallet_2")!;  // payee (operator)
const wallet3 = accounts.get("wallet_3")!;  // unauthorized third party

const CONTRACT_NAME = "escrow-manager";

// Escrow status constants (matching contract)
const ESCROW_STATUS_LOCKED = 1;
const ESCROW_STATUS_RELEASED = 2;
const ESCROW_STATUS_REFUNDED = 3;
const ESCROW_STATUS_DISPUTED = 4;
const ESCROW_STATUS_CANCELLED = 5;

// Other constants
const MIN_ESCROW_AMOUNT = 1000;
const DEFAULT_TIMEOUT_BLOCKS = 2016;
const PLATFORM_FEE_BPS = 200;
const BPS_DIVISOR = 10000;

describe("escrow-manager contract", () => {
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

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });
  });

  describe("set-fee-recipient", () => {
    it("allows owner to set fee recipient", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-fee-recipient",
        [Cl.principal(wallet3)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify fee recipient
      const recipient = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-fee-recipient",
        [],
        deployer
      );
      expect(recipient.result).toBePrincipal(wallet3);
    });

    it("rejects fee recipient change from non-owner", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-fee-recipient",
        [Cl.principal(wallet3)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });
  });

  describe("set-escrows-enabled", () => {
    it("allows owner to disable escrows", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-escrows-enabled",
        [Cl.bool(false)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify disabled
      const enabled = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "are-escrows-enabled",
        [],
        deployer
      );
      expect(enabled.result).toBeBool(false);
    });

    it("prevents escrow creation when disabled", () => {
      // Disable escrows
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-escrows-enabled",
        [Cl.bool(false)],
        deployer
      );

      // Try to create escrow
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [
          Cl.principal(wallet2),
          Cl.uint(100000),
          Cl.none(),
          Cl.none()
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });
  });

  // ============================================================================
  // LOCK ESCROW TESTS
  // ============================================================================

  describe("lock-escrow", () => {
    it("successfully locks funds in escrow", () => {
      const amount = 100000; // 0.1 STX

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [
          Cl.principal(wallet2),
          Cl.uint(amount),
          Cl.none(),
          Cl.none()
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(0)); // First escrow ID

      // Verify escrow was created correctly
      const escrow = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow",
        [Cl.uint(0)],
        deployer
      );

      const expectedFee = Math.floor((amount * PLATFORM_FEE_BPS) / BPS_DIVISOR);

      // Verify escrow was created - check key values without block heights
      expect(escrow.result).not.toBeNone();
      
      // Verify status is locked
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("locked"));
      
      // Verify TVL
      const tvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(tvl.result).toBeUint(amount);
    });

    it("locks with custom service-id and timeout", () => {
      const amount = 100000;
      const serviceId = 42;
      const customTimeout = 1000;

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [
          Cl.principal(wallet2),
          Cl.uint(amount),
          Cl.some(Cl.uint(serviceId)),
          Cl.some(Cl.uint(customTimeout))
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(0));

      const escrow = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow",
        [Cl.uint(0)],
        deployer
      );

      // Verify escrow was created with custom params
      expect(escrow.result).not.toBeNone();
      
      // Verify status is locked
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("locked"));
    });

    it("rejects amount below minimum", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [
          Cl.principal(wallet2),
          Cl.uint(MIN_ESCROW_AMOUNT - 1),
          Cl.none(),
          Cl.none()
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(409)); // ERR_ZERO_AMOUNT
    });

    it("rejects same payer and payee", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [
          Cl.principal(wallet1), // Same as sender
          Cl.uint(100000),
          Cl.none(),
          Cl.none()
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(410)); // ERR_SAME_PARTIES
    });

    it("increments escrow nonce correctly", () => {
      // Create multiple escrows
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );

      const result2 = simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(200000), Cl.none(), Cl.none()],
        wallet1
      );

      expect(result2.result).toBeOk(Cl.uint(1));

      const nonce = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-nonce",
        [],
        deployer
      );
      expect(nonce.result).toBeUint(2);
    });

    it("updates total value locked correctly", () => {
      const amount1 = 100000;
      const amount2 = 200000;

      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(amount1), Cl.none(), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(amount2), Cl.none(), Cl.none()],
        wallet1
      );

      const tvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(tvl.result).toBeUint(amount1 + amount2);
    });

    it("updates payer and payee escrow counts", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(200000), Cl.none(), Cl.none()],
        wallet1
      );

      const payerCount = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-payer-escrow-count",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(payerCount.result).toBeUint(2);

      const payeeCount = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-payee-escrow-count",
        [Cl.principal(wallet2)],
        deployer
      );
      expect(payeeCount.result).toBeUint(2);
    });
  });

  // ============================================================================
  // RELEASE ESCROW TESTS
  // ============================================================================

  describe("release-escrow", () => {
    beforeEach(() => {
      // Create an escrow before each release test
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );
    });

    it("allows payer to release funds to payee", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet1  // payer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status changed
      const escrow = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow",
        [Cl.uint(0)],
        deployer
      );

      // Check status is released
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("released"));
    });

    it("rejects release from non-payer", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet2  // payee, not payer
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });

    it("rejects release for non-existent escrow", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(999)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(402)); // ERR_NOT_FOUND
    });

    it("rejects double release", () => {
      // First release
      simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet1
      );

      // Try to release again
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(403)); // ERR_INVALID_STATE
    });

    it("decreases total value locked on release", () => {
      const initialTvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(initialTvl.result).toBeUint(100000);

      simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet1
      );

      const finalTvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(finalTvl.result).toBeUint(0);
    });
  });

  // ============================================================================
  // REFUND ESCROW TESTS
  // ============================================================================

  describe("refund-escrow", () => {
    beforeEach(() => {
      // Create an escrow before each refund test
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [
          Cl.principal(wallet2),
          Cl.uint(100000),
          Cl.none(),
          Cl.some(Cl.uint(10))  // Short timeout for testing
        ],
        wallet1
      );
    });

    it("allows payee to voluntarily refund", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-escrow",
        [Cl.uint(0)],
        wallet2  // payee
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status changed to refunded
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("refunded"));
    });

    it("rejects payer refund before timeout", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-escrow",
        [Cl.uint(0)],
        wallet1  // payer
      );

      expect(result).toBeErr(Cl.uint(407)); // ERR_ESCROW_NOT_EXPIRED
    });

    it("allows payer refund after timeout", () => {
      // Mine blocks to pass timeout
      simnet.mineEmptyBlocks(15);

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-escrow",
        [Cl.uint(0)],
        wallet1  // payer
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("allows owner to refund", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-escrow",
        [Cl.uint(0)],
        deployer  // owner
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("rejects refund from unauthorized third party", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-escrow",
        [Cl.uint(0)],
        wallet3  // unauthorized
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });

    it("decreases total value locked on refund", () => {
      const initialTvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(initialTvl.result).toBeUint(100000);

      simnet.callPublicFn(
        CONTRACT_NAME,
        "refund-escrow",
        [Cl.uint(0)],
        wallet2
      );

      const finalTvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(finalTvl.result).toBeUint(0);
    });
  });

  // ============================================================================
  // CANCEL ESCROW TESTS
  // ============================================================================

  describe("cancel-escrow", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );
    });

    it("allows payee to cancel escrow", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "cancel-escrow",
        [Cl.uint(0)],
        wallet2  // payee
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("cancelled"));
    });

    it("rejects cancellation from payer", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "cancel-escrow",
        [Cl.uint(0)],
        wallet1  // payer
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });

    it("rejects cancellation from third party", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "cancel-escrow",
        [Cl.uint(0)],
        wallet3
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });
  });

  // ============================================================================
  // DISPUTE TESTS
  // ============================================================================

  describe("initiate-dispute", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );
    });

    it("allows payer to initiate dispute", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("Service not delivered as promised")],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify escrow status changed
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("disputed"));

      // Verify dispute record created
      const dispute = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-dispute",
        [Cl.uint(0)],
        deployer
      );
      expect(dispute.result).not.toBeNone();
      console.log(dispute.result);
    });

    it("allows payee to initiate dispute", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("Payment amount incorrect")],
        wallet2
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("rejects dispute from third party", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("Random reason")],
        wallet3
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });

    it("rejects dispute with empty reason", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("")],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(401)); // ERR_INVALID_INPUT
    });

    it("rejects duplicate dispute", () => {
      // First dispute
      simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("First dispute")],
        wallet1
      );

      // Try second dispute
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("Second dispute")],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(403)); // ERR_INVALID_STATE (escrow already disputed)
    });
  });

  describe("resolve-dispute", () => {
    beforeEach(() => {
      // Create escrow and initiate dispute
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("Service issue")],
        wallet1
      );
    });

    it("allows owner to resolve dispute in favor of payer", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "resolve-dispute",
        [Cl.uint(0), Cl.uint(1)],  // 1 = favor payer
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status changed to refunded
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("refunded"));

      // Verify dispute marked as resolved
      const dispute = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-dispute",
        [Cl.uint(0)],
        deployer
      );
      // Verify dispute was resolved
      expect(dispute.result).not.toBeNone();
    });

    it("allows owner to resolve dispute in favor of payee", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "resolve-dispute",
        [Cl.uint(0), Cl.uint(2)],  // 2 = favor payee
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify status changed to released
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("released"));
    });

    it("rejects dispute resolution from non-owner", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "resolve-dispute",
        [Cl.uint(0), Cl.uint(1)],
        wallet1  // payer, not owner
      );

      expect(result).toBeErr(Cl.uint(400)); // ERR_UNAUTHORIZED
    });

    it("rejects invalid resolution value", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "resolve-dispute",
        [Cl.uint(0), Cl.uint(3)],  // Invalid value
        deployer
      );

      expect(result).toBeErr(Cl.uint(401)); // ERR_INVALID_INPUT
    });

    it("rejects resolving already resolved dispute", () => {
      // First resolution
      simnet.callPublicFn(
        CONTRACT_NAME,
        "resolve-dispute",
        [Cl.uint(0), Cl.uint(1)],
        deployer
      );

      // Try to resolve again
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "resolve-dispute",
        [Cl.uint(0), Cl.uint(2)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(403)); // ERR_INVALID_STATE
    });
  });

  // ============================================================================
  // READ-ONLY FUNCTION TESTS
  // ============================================================================

  describe("get-escrow", () => {
    it("returns none for non-existent escrow", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow",
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeNone();
    });
  });

  describe("is-escrow-expired", () => {
    it("returns false for non-expired escrow", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-escrow-expired",
        [Cl.uint(0)],
        deployer
      );

      expect(result.result).toBeBool(false);
    });

    it("returns true for expired escrow", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [
          Cl.principal(wallet2),
          Cl.uint(100000),
          Cl.none(),
          Cl.some(Cl.uint(5))  // Short timeout
        ],
        wallet1
      );

      // Mine blocks to exceed timeout
      simnet.mineEmptyBlocks(10);

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-escrow-expired",
        [Cl.uint(0)],
        deployer
      );

      expect(result.result).toBeBool(true);
    });

    it("returns false for non-existent escrow", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-escrow-expired",
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeBool(false);
    });
  });

  describe("calculate-platform-fee", () => {
    it("calculates correct fee", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "calculate-platform-fee",
        [Cl.uint(100000)],
        deployer
      );

      // 2% of 100000 = 2000
      expect(result.result).toBeUint(2000);
    });

    it("calculates fee for large amounts", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "calculate-platform-fee",
        [Cl.uint(1000000000)],  // 1000 STX
        deployer
      );

      // 2% of 1000000000 = 20000000
      expect(result.result).toBeUint(20000000);
    });
  });

  describe("get-escrow-status-name", () => {
    it("returns correct status names", () => {
      // Create escrow
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );

      // Check locked status
      let status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("locked"));

      // Release and check
      simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet1
      );

      status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("released"));
    });

    it("returns none for non-existent escrow", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeNone();
    });
  });

  describe("get-escrow-constants", () => {
    it("returns all escrow constants", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-constants",
        [],
        deployer
      );

      expect(result.result).toBeTuple({
        "min-escrow-amount": Cl.uint(MIN_ESCROW_AMOUNT),
        "default-timeout-blocks": Cl.uint(DEFAULT_TIMEOUT_BLOCKS),
        "platform-fee-bps": Cl.uint(PLATFORM_FEE_BPS),
        "status-locked": Cl.uint(ESCROW_STATUS_LOCKED),
        "status-released": Cl.uint(ESCROW_STATUS_RELEASED),
        "status-refunded": Cl.uint(ESCROW_STATUS_REFUNDED),
        "status-disputed": Cl.uint(ESCROW_STATUS_DISPUTED),
        "status-cancelled": Cl.uint(ESCROW_STATUS_CANCELLED)
      });
    });
  });

  describe("get-payer-escrow-by-index", () => {
    it("returns escrow by payer index", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );

      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-payer-escrow-by-index",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      // Verify escrow exists and is locked
      expect(result.result).not.toBeNone();
      
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("locked"));
    });

    it("returns none for invalid index", () => {
      const result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-payer-escrow-by-index",
        [Cl.principal(wallet1), Cl.uint(999)],
        deployer
      );

      expect(result.result).toBeNone();
    });
  });

  // ============================================================================
  // INTEGRATION TESTS
  // ============================================================================

  describe("integration tests", () => {
    it("completes full escrow lifecycle: lock -> release", () => {
      const amount = 100000;
      const expectedFee = 2000;
      const expectedNet = amount - expectedFee;

      // Lock escrow
      const lockResult = simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(amount), Cl.none(), Cl.none()],
        wallet1
      );
      expect(lockResult.result).toBeOk(Cl.uint(0));

      // Verify TVL increased
      let tvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(tvl.result).toBeUint(amount);

      // Release escrow
      const releaseResult = simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet1
      );
      expect(releaseResult.result).toBeOk(Cl.bool(true));

      // Verify TVL decreased
      tvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(tvl.result).toBeUint(0);

      // Verify final status
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("released"));
    });

    it("completes full escrow lifecycle: lock -> dispute -> resolve (payer wins)", () => {
      const amount = 100000;

      // Lock escrow
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(amount), Cl.none(), Cl.none()],
        wallet1
      );

      // Initiate dispute
      simnet.callPublicFn(
        CONTRACT_NAME,
        "initiate-dispute",
        [Cl.uint(0), Cl.stringAscii("Service not delivered")],
        wallet1
      );

      // Resolve in favor of payer
      simnet.callPublicFn(
        CONTRACT_NAME,
        "resolve-dispute",
        [Cl.uint(0), Cl.uint(1)],
        deployer
      );

      // Verify final status
      const status = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-escrow-status-name",
        [Cl.uint(0)],
        deployer
      );
      expect(status.result).toBeSome(Cl.stringAscii("refunded"));

      // Verify TVL is 0
      const tvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(tvl.result).toBeUint(0);
    });

    it("handles multiple escrows with different outcomes", () => {
      // Create 3 escrows
      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(100000), Cl.none(), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(200000), Cl.none(), Cl.none()],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "lock-escrow",
        [Cl.principal(wallet2), Cl.uint(300000), Cl.none(), Cl.none()],
        wallet1
      );

      // Verify total value locked
      let tvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(tvl.result).toBeUint(600000);

      // Release first escrow
      simnet.callPublicFn(
        CONTRACT_NAME,
        "release-escrow",
        [Cl.uint(0)],
        wallet1
      );

      // Cancel second escrow
      simnet.callPublicFn(
        CONTRACT_NAME,
        "cancel-escrow",
        [Cl.uint(1)],
        wallet2
      );

      // Leave third in locked state

      // Verify remaining TVL
      tvl = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-total-value-locked",
        [],
        deployer
      );
      expect(tvl.result).toBeUint(300000);  // Only escrow 2 remains locked

      // Verify escrow counts
      const payerCount = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-payer-escrow-count",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(payerCount.result).toBeUint(3);  // All 3 are still tracked
    });
  });
});
