import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const CONTRACT_NAME = "achievement-registry";

describe("achievement-registry contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("register-achievement", () => {
    it("successfully registers a new achievement", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1), // game-id
          Cl.stringAscii("First Victory"), // achievement-name
          Cl.stringAscii("PC"), // platform
          Cl.uint(1000000), // timestamp
          Cl.stringUtf8("https://example.com/metadata/1"), // metadata-uri
          Cl.uint(2), // rarity-tier (rare)
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.uint(0)); // First achievement ID should be 0
    });

    it("rejects achievement with empty name", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii(""), // Empty name
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR_INVALID_INPUT
    });

    it("rejects achievement with empty platform", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii(""), // Empty platform
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR_INVALID_INPUT
    });

    it("rejects achievement with invalid rarity tier", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(5), // Invalid rarity tier (max is 4)
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(103)); // ERR_OUT_OF_RANGE
    });

    it("rejects achievement with zero timestamp", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(0), // Invalid timestamp
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR_INVALID_INPUT
    });

    it("rejects achievement with empty metadata URI", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8(""), // Empty URI
          Cl.uint(2),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR_INVALID_INPUT
    });

    it("prevents duplicate achievements for same player, game, and name", () => {
      // Register first achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Try to register duplicate
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1), // Same game-id
          Cl.stringAscii("First Victory"), // Same name
          Cl.stringAscii("PlayStation"), // Different platform
          Cl.uint(2000000),
          Cl.stringUtf8("https://example.com/metadata/2"),
          Cl.uint(3),
        ],
        wallet1 // Same wallet
      );

      expect(result).toBeErr(Cl.uint(102)); // ERR_DUPLICATE
    });

    it("allows different players to have same achievement", () => {
      // Wallet 1 registers achievement
      const result1 = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Wallet 2 registers same achievement
      const result2 = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1), // Same game-id
          Cl.stringAscii("First Victory"), // Same name
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet2 // Different wallet
      );

      expect(result1.result).toBeOk(Cl.uint(0));
      expect(result2.result).toBeOk(Cl.uint(1));
    });

    it("increments achievement nonce correctly", () => {
      // Register first achievement
      const result1 = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(0),
        ],
        wallet1
      );

      // Register second achievement
      const result2 = simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(2),
          Cl.stringAscii("Speed Runner"),
          Cl.stringAscii("PC"),
          Cl.uint(2000000),
          Cl.stringUtf8("https://example.com/metadata/2"),
          Cl.uint(3),
        ],
        wallet1
      );

      expect(result1.result).toBeOk(Cl.uint(0));
      expect(result2.result).toBeOk(Cl.uint(1));
    });
  });

  describe("get-achievement", () => {
    it("retrieves registered achievement correctly", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Retrieve achievement
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      expect(result).toBeSome(
        Cl.tuple({
          "game-id": Cl.uint(1),
          "achievement-name": Cl.stringAscii("First Victory"),
          platform: Cl.stringAscii("PC"),
          timestamp: Cl.uint(1000000),
          "metadata-uri": Cl.stringUtf8("https://example.com/metadata/1"),
          "rarity-tier": Cl.uint(2),
          verified: Cl.bool(false),
        })
      );
    });

    it("returns none for non-existent achievement", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement",
        [Cl.principal(wallet1), Cl.uint(999)],
        wallet1
      );

      expect(result).toBeNone();
    });
  });

  describe("get-player-achievement-count", () => {
    it("returns zero for player with no achievements", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-achievement-count",
        [Cl.principal(wallet1)],
        wallet1
      );

      expect(result).toBeUint(0);
    });

    it("returns correct count for player with achievements", () => {
      // Register three achievements
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("Achievement 1"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/1"),
          Cl.uint(0),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(2),
          Cl.stringAscii("Achievement 2"),
          Cl.stringAscii("PC"),
          Cl.uint(2000000),
          Cl.stringUtf8("https://example.com/2"),
          Cl.uint(1),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(3),
          Cl.stringAscii("Achievement 3"),
          Cl.stringAscii("PlayStation"),
          Cl.uint(3000000),
          Cl.stringUtf8("https://example.com/3"),
          Cl.uint(2),
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-achievement-count",
        [Cl.principal(wallet1)],
        wallet1
      );

      expect(result).toBeUint(3);
    });
  });

  describe("get-player-achievement-by-index", () => {
    it("retrieves achievement by index correctly", () => {
      // Register achievements
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Achievement"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/1"),
          Cl.uint(0),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(2),
          Cl.stringAscii("Second Achievement"),
          Cl.stringAscii("Xbox"),
          Cl.uint(2000000),
          Cl.stringUtf8("https://example.com/2"),
          Cl.uint(1),
        ],
        wallet1
      );

      // Get first achievement (index 0)
      const { result: result1 } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-achievement-by-index",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      expect(result1).toBeSome(
        Cl.tuple({
          "game-id": Cl.uint(1),
          "achievement-name": Cl.stringAscii("First Achievement"),
          platform: Cl.stringAscii("PC"),
          timestamp: Cl.uint(1000000),
          "metadata-uri": Cl.stringUtf8("https://example.com/1"),
          "rarity-tier": Cl.uint(0),
          verified: Cl.bool(false),
        })
      );

      // Get second achievement (index 1)
      const { result: result2 } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-achievement-by-index",
        [Cl.principal(wallet1), Cl.uint(1)],
        wallet1
      );

      expect(result2).toBeSome(
        Cl.tuple({
          "game-id": Cl.uint(2),
          "achievement-name": Cl.stringAscii("Second Achievement"),
          platform: Cl.stringAscii("Xbox"),
          timestamp: Cl.uint(2000000),
          "metadata-uri": Cl.stringUtf8("https://example.com/2"),
          "rarity-tier": Cl.uint(1),
          verified: Cl.bool(false),
        })
      );
    });

    it("returns none for invalid index", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-achievement-by-index",
        [Cl.principal(wallet1), Cl.uint(999)],
        wallet1
      );

      expect(result).toBeNone();
    });
  });

  describe("achievement-exists", () => {
    it("returns false for non-existent achievement", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "achievement-exists",
        [
          Cl.principal(wallet1),
          Cl.uint(1),
          Cl.stringAscii("Non-existent"),
        ],
        wallet1
      );

      expect(result).toBeBool(false);
    });

    it("returns true for existing achievement", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "achievement-exists",
        [
          Cl.principal(wallet1),
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
        ],
        wallet1
      );

      expect(result).toBeBool(true);
    });
  });

  describe("get-achievement-nonce", () => {
    it("returns correct nonce after registrations", () => {
      // Initially should be 0
      let result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement-nonce",
        [],
        wallet1
      );
      expect(result.result).toBeUint(0);

      // Register two achievements
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("Achievement 1"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/1"),
          Cl.uint(0),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(2),
          Cl.stringAscii("Achievement 2"),
          Cl.stringAscii("PC"),
          Cl.uint(2000000),
          Cl.stringUtf8("https://example.com/2"),
          Cl.uint(1),
        ],
        wallet1
      );

      // Nonce should be 2 after two registrations
      result = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement-nonce",
        [],
        wallet1
      );
      expect(result.result).toBeUint(2);
    });
  });

  describe("immutability", () => {
    it("achievement data remains immutable after registration", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Get achievement once
      const { result: result1 } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      // Get achievement again
      const { result: result2 } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      // Both should be identical
      expect(result1).toStrictEqual(result2);
    });
  });

  // ============================================================================
  // ADMIN & VERIFIER MANAGEMENT TESTS
  // ============================================================================

  describe("set-contract-owner", () => {
    it("allows deployer to transfer ownership", () => {
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

      expect(result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("new owner can perform owner-only actions", () => {
      // Transfer to wallet1
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-contract-owner",
        [Cl.principal(wallet1)],
        deployer
      );

      // New owner should be able to authorize verifiers
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-verifier",
        [Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("set-authorized-verifier", () => {
    it("allows owner to authorize a verifier", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-verifier",
        [Cl.principal(wallet1), Cl.bool(true)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify authorization
      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-verifier-authorized",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isAuthorized.result).toBeBool(true);
    });

    it("allows owner to revoke verifier authorization", () => {
      // First authorize
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-verifier",
        [Cl.principal(wallet1), Cl.bool(true)],
        deployer
      );

      // Then revoke
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-verifier",
        [Cl.principal(wallet1), Cl.bool(false)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-verifier-authorized",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isAuthorized.result).toBeBool(false);
    });

    it("rejects authorization from non-owner", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-verifier",
        [Cl.principal(wallet2), Cl.bool(true)],
        wallet1  // Not the owner
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });
  });

  // ============================================================================
  // ACHIEVEMENT VERIFICATION TESTS
  // ============================================================================

  describe("verify-achievement", () => {
    it("owner can verify an achievement", () => {
      // Register achievement first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Verify it via deployer (owner)
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Check achievement is now verified
      const achievement = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      expect(achievement.result).toBeSome(
        Cl.tuple({
          "game-id": Cl.uint(1),
          "achievement-name": Cl.stringAscii("First Victory"),
          platform: Cl.stringAscii("PC"),
          timestamp: Cl.uint(1000000),
          "metadata-uri": Cl.stringUtf8("https://example.com/metadata/1"),
          "rarity-tier": Cl.uint(2),
          verified: Cl.bool(true),
        })
      );
    });

    it("authorized verifier can verify an achievement", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("Speed Runner"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(3),
        ],
        wallet1
      );

      // Authorize wallet2 as verifier
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-verifier",
        [Cl.principal(wallet2), Cl.bool(true)],
        deployer
      );

      // wallet2 verifies the achievement
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet2
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("unauthorized wallet cannot verify achievements", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // wallet3 (unauthorized) tries to verify
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet3
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("rejects verification of non-existent achievement", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(999)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(104)); // ERR_NOT_FOUND
    });

    it("rejects re-verification of already verified achievement", () => {
      // Register and verify
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      // Try to verify again
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(105)); // ERR_ALREADY_VERIFIED
    });

    it("rejects verification of a revoked achievement", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Revoke it
      simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Fraudulent submission")],
        deployer
      );

      // Try to verify revoked achievement
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(106)); // ERR_ALREADY_REVOKED
    });
  });

  // ============================================================================
  // ACHIEVEMENT REVOCATION TESTS
  // ============================================================================

  describe("revoke-achievement", () => {
    it("owner can revoke an achievement", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Revoke it
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Cheating detected")],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify it's marked as revoked
      const isRevoked = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-achievement-revoked",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );
      expect(isRevoked.result).toBeBool(true);
    });

    it("revocation unsets verified flag", () => {
      // Register and verify
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "verify-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      // Revoke it
      simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Invalid proof provided")],
        deployer
      );

      // Check achievement is now unverified
      const achievement = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-achievement",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      expect(achievement.result).toBeSome(
        Cl.tuple({
          "game-id": Cl.uint(1),
          "achievement-name": Cl.stringAscii("First Victory"),
          platform: Cl.stringAscii("PC"),
          timestamp: Cl.uint(1000000),
          "metadata-uri": Cl.stringUtf8("https://example.com/metadata/1"),
          "rarity-tier": Cl.uint(2),
          verified: Cl.bool(false),
        })
      );
    });

    it("non-owner cannot revoke achievements", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // wallet1 tries to revoke (not owner)
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Some reason")],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(100)); // ERR_UNAUTHORIZED
    });

    it("rejects revocation of non-existent achievement", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(999), Cl.stringAscii("Cheating")],
        deployer
      );

      expect(result).toBeErr(Cl.uint(104)); // ERR_NOT_FOUND
    });

    it("rejects revocation with empty reason", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Try to revoke with empty reason
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("")],
        deployer
      );

      expect(result).toBeErr(Cl.uint(101)); // ERR_INVALID_INPUT
    });

    it("rejects double revocation", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Revoke
      simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Cheating detected")],
        deployer
      );

      // Try to revoke again
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Second revocation")],
        deployer
      );

      expect(result).toBeErr(Cl.uint(106)); // ERR_ALREADY_REVOKED
    });

    it("get-revocation-details returns correct data", () => {
      // Register achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "register-achievement",
        [
          Cl.uint(1),
          Cl.stringAscii("First Victory"),
          Cl.stringAscii("PC"),
          Cl.uint(1000000),
          Cl.stringUtf8("https://example.com/metadata/1"),
          Cl.uint(2),
        ],
        wallet1
      );

      // Revoke
      simnet.callPublicFn(
        CONTRACT_NAME,
        "revoke-achievement",
        [Cl.principal(wallet1), Cl.uint(0), Cl.stringAscii("Cheating detected")],
        deployer
      );

      // Check revocation details
      const details = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-revocation-details",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      expect(details.result).not.toBeNone();
    });

    it("get-revocation-details returns none for non-revoked achievement", () => {
      const details = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-revocation-details",
        [Cl.principal(wallet1), Cl.uint(0)],
        wallet1
      );

      expect(details.result).toBeNone();
    });
  });
});
