import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const CONTRACT_NAME = "identity-manager";

describe("identity-manager contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  describe("link-identity", () => {
    it("successfully links a new identity", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("rejects identity with empty platform", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii(""), // Empty platform
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(204)); // ERR_INVALID_PLATFORM
    });

    it("rejects identity with empty username", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii(""), // Empty username
          Cl.bool(false),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(201)); // ERR_INVALID_INPUT
    });

    it("prevents duplicate identity linking for same user", () => {
      // Link first time
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Try to link same identity again
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(202)); // ERR_ALREADY_LINKED
    });

    it("prevents same platform+username from being linked to different addresses", () => {
      // Wallet 1 links identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Wallet 2 tries to link same identity
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet2
      );

      expect(result).toBeErr(Cl.uint(202)); // ERR_ALREADY_LINKED
    });

    it("allows linking multiple different identities", () => {
      // Link first identity
      const result1 = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Link second identity
      const result2 = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("PlayStation"),
          Cl.stringAscii("ps_gamer456"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Link third identity
      const result3 = simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Xbox"),
          Cl.stringAscii("xbox_pro789"),
          Cl.bool(true),
        ],
        wallet1
      );

      expect(result1.result).toBeOk(Cl.bool(true));
      expect(result2.result).toBeOk(Cl.bool(true));
      expect(result3.result).toBeOk(Cl.bool(true));
    });

    it("updates identity count correctly", () => {
      // Initial count should be 0
      let count = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity-count",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(count.result).toBeUint(0);

      // Link first identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      count = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity-count",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(count.result).toBeUint(1);

      // Link second identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("PlayStation"),
          Cl.stringAscii("ps_gamer456"),
          Cl.bool(false),
        ],
        wallet1
      );

      count = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity-count",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(count.result).toBeUint(2);
    });
  });

  describe("unlink-identity", () => {
    it("successfully unlinks an existing identity", () => {
      // Link identity first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Unlink identity
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "unlink-identity",
        [Cl.stringAscii("Steam"), Cl.stringAscii("player123")],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("fails to unlink non-existent identity", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "unlink-identity",
        [Cl.stringAscii("Steam"), Cl.stringAscii("nonexistent")],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(203)); // ERR_NOT_FOUND
    });

    it("decrements identity count after unlinking", () => {
      // Link two identities
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("PlayStation"),
          Cl.stringAscii("ps_gamer456"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Count should be 2
      let count = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity-count",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(count.result).toBeUint(2);

      // Unlink one identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "unlink-identity",
        [Cl.stringAscii("Steam"), Cl.stringAscii("player123")],
        wallet1
      );

      // Count should be 1
      count = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity-count",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(count.result).toBeUint(1);
    });

    it("removes both primary and reverse mappings", () => {
      // Link identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Verify identity exists
      let identity = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
        ],
        wallet1
      );
      // Check that identity exists
      expect(identity.result).not.toBeNone();

      // Verify reverse lookup exists
      let principal = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "resolve-principal",
        [Cl.stringAscii("Steam"), Cl.stringAscii("player123")],
        wallet1
      );
      expect(principal.result).toBeSome(Cl.principal(wallet1));

      // Unlink identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "unlink-identity",
        [Cl.stringAscii("Steam"), Cl.stringAscii("player123")],
        wallet1
      );

      // Verify identity no longer exists
      identity = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
        ],
        wallet1
      );
      expect(identity.result).toBeNone();

      // Verify reverse lookup no longer exists
      principal = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "resolve-principal",
        [Cl.stringAscii("Steam"), Cl.stringAscii("player123")],
        wallet1
      );
      expect(principal.result).toBeNone();
    });
  });

  describe("set-identity-verified", () => {
    it("allows contract owner to set verification status", () => {
      // Link identity first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Owner sets verification to true
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(true),
        ],
        deployer // Owner
      );

      expect(result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from setting verification status", () => {
      // Link identity first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Non-owner tries to set verification
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(true),
        ],
        wallet2 // Not owner
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });

    it("fails for non-existent identity", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("nonexistent"),
          Cl.bool(true),
        ],
        deployer
      );

      expect(result).toBeErr(Cl.uint(203)); // ERR_NOT_FOUND
    });

    it("updates verification status correctly", () => {
      // Link identity (unverified)
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Check initial verification status
      let verified = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
        ],
        wallet1
      );
      expect(verified.result).toBeBool(false);

      // Set verification to true
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(true),
        ],
        deployer
      );

      // Check updated verification status
      verified = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
        ],
        wallet1
      );
      expect(verified.result).toBeBool(true);
    });
  });

  describe("set-contract-owner", () => {
    it("allows current owner to transfer ownership", () => {
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
        wallet1
      );
      expect(owner.result).toBePrincipal(wallet1);
    });

    it("prevents non-owner from transferring ownership", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-contract-owner",
        [Cl.principal(wallet2)],
        wallet1 // Not current owner
      );

      expect(result).toBeErr(Cl.uint(200)); // ERR_UNAUTHORIZED
    });
  });

  describe("get-identity", () => {
    it("retrieves linked identity correctly", () => {
      // Link identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Get identity
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
        ],
        wallet1
      );

      // Check that identity exists
      expect(result).not.toBeNone();
    });

    it("returns none for non-existent identity", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("nonexistent"),
        ],
        wallet1
      );

      expect(result).toBeNone();
    });
  });

  describe("resolve-principal", () => {
    it("resolves principal from platform identity", () => {
      // Link identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Resolve principal
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "resolve-principal",
        [Cl.stringAscii("Steam"), Cl.stringAscii("player123")],
        wallet2
      );

      expect(result).toBeSome(Cl.principal(wallet1));
    });

    it("returns none for non-existent platform identity", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "resolve-principal",
        [Cl.stringAscii("Steam"), Cl.stringAscii("nonexistent")],
        wallet1
      );

      expect(result).toBeNone();
    });
  });

  describe("get-identity-count", () => {
    it("returns correct count of linked identities", () => {
      // Initially 0
      let count = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity-count",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(count.result).toBeUint(0);

      // Link 3 identities
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("PlayStation"),
          Cl.stringAscii("ps_gamer456"),
          Cl.bool(false),
        ],
        wallet1
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Xbox"),
          Cl.stringAscii("xbox_pro789"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Count should be 3
      count = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-identity-count",
        [Cl.principal(wallet1)],
        wallet1
      );
      expect(count.result).toBeUint(3);
    });
  });

  describe("is-identity-verified", () => {
    it("returns correct verification status", () => {
      // Link unverified identity
      simnet.callPublicFn(
        CONTRACT_NAME,
        "link-identity",
        [
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(false),
        ],
        wallet1
      );

      // Should be unverified
      let verified = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
        ],
        wallet1
      );
      expect(verified.result).toBeBool(false);

      // Set to verified
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
          Cl.bool(true),
        ],
        deployer
      );

      // Should now be verified
      verified = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("player123"),
        ],
        wallet1
      );
      expect(verified.result).toBeBool(true);
    });

    it("returns false for non-existent identity", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-identity-verified",
        [
          Cl.principal(wallet1),
          Cl.stringAscii("Steam"),
          Cl.stringAscii("nonexistent"),
        ],
        wallet1
      );

      expect(result).toBeBool(false);
    });
  });

  describe("get-contract-owner", () => {
    it("returns correct contract owner", () => {
      const { result } = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-contract-owner",
        [],
        wallet1
      );

      expect(result).toBePrincipal(deployer);
    });
  });
});
