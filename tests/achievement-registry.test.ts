import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

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
});
