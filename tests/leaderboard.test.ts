import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const CONTRACT_NAME = "leaderboard";

// Point constants (matching contract)
const POINTS_COMMON = 10;
const POINTS_UNCOMMON = 25;
const POINTS_RARE = 50;
const POINTS_EPIC = 100;
const POINTS_LEGENDARY = 250;

describe("leaderboard contract", () => {
  beforeEach(() => {
    simnet.setEpoch("3.0");
  });

  // ============================================================================
  // ADMINISTRATIVE FUNCTIONS TESTS
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
        wallet1
      );

      expect(result).toBeErr(Cl.uint(500)); // ERR_UNAUTHORIZED
    });

    it("new owner can perform owner-only actions", () => {
      // Transfer to wallet1
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-contract-owner",
        [Cl.principal(wallet1)],
        deployer
      );

      // New owner authorizes submitter
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-submitter",
        [Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );

      expect(result).toBeOk(Cl.bool(true));
    });
  });

  describe("set-authorized-submitter", () => {
    it("allows owner to authorize a submitter", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-submitter",
        [Cl.principal(wallet1), Cl.bool(true)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-submitter-authorized",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isAuthorized.result).toBeBool(true);
    });

    it("allows owner to revoke submitter authorization", () => {
      // Authorize
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-submitter",
        [Cl.principal(wallet1), Cl.bool(true)],
        deployer
      );

      // Revoke
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-submitter",
        [Cl.principal(wallet1), Cl.bool(false)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-submitter-authorized",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(isAuthorized.result).toBeBool(false);
    });

    it("rejects authorization from non-owner", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-submitter",
        [Cl.principal(wallet2), Cl.bool(true)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(500)); // ERR_UNAUTHORIZED
    });
  });

  // ============================================================================
  // RECORD SCORE TESTS
  // ============================================================================

  describe("record-score", () => {
    it("owner can record a common achievement score", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(1),  // game-id
          Cl.uint(0),  // achievement-id
          Cl.uint(0),  // rarity-tier: common
        ],
        deployer
      );

      expect(result).toBeOk(Cl.uint(0)); // First entry ID

      // Verify global score
      const globalScore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(globalScore.result).toBeTuple({
        "total-points": Cl.uint(POINTS_COMMON),
        "achievement-count": Cl.uint(1),
      });
    });

    it("awards correct points for each rarity tier", () => {
      const rarityTests = [
        { tier: 0, expectedPoints: POINTS_COMMON },
        { tier: 1, expectedPoints: POINTS_UNCOMMON },
        { tier: 2, expectedPoints: POINTS_RARE },
        { tier: 3, expectedPoints: POINTS_EPIC },
        { tier: 4, expectedPoints: POINTS_LEGENDARY },
      ];

      let totalExpected = 0;

      for (let i = 0; i < rarityTests.length; i++) {
        const { tier, expectedPoints } = rarityTests[i];
        totalExpected += expectedPoints;

        const { result } = simnet.callPublicFn(
          CONTRACT_NAME,
          "record-score",
          [
            Cl.principal(wallet1),
            Cl.uint(1),
            Cl.uint(i),          // different achievement-id for each
            Cl.uint(tier),
          ],
          deployer
        );

        expect(result).toBeOk(Cl.uint(i));
      }

      // Verify total accumulated score
      const globalScore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(globalScore.result).toBeTuple({
        "total-points": Cl.uint(totalExpected),
        "achievement-count": Cl.uint(5),
      });
    });

    it("authorized submitter can record scores", () => {
      // Authorize wallet2
      simnet.callPublicFn(
        CONTRACT_NAME,
        "set-authorized-submitter",
        [Cl.principal(wallet2), Cl.bool(true)],
        deployer
      );

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(2), // rare
        ],
        wallet2
      );

      expect(result).toBeOk(Cl.uint(0));
    });

    it("unauthorized wallet cannot record scores", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(2),
        ],
        wallet3  // Not authorized
      );

      expect(result).toBeErr(Cl.uint(500)); // ERR_UNAUTHORIZED
    });

    it("rejects invalid rarity tier", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(5),  // Invalid tier (max is 4)
        ],
        deployer
      );

      expect(result).toBeErr(Cl.uint(504)); // ERR_INVALID_RARITY
    });

    it("prevents duplicate scoring for same achievement", () => {
      // Record score
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(1),
          Cl.uint(0),
          Cl.uint(2),
        ],
        deployer
      );

      // Try to score same achievement again
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(1),
          Cl.uint(0),  // Same achievement-id
          Cl.uint(2),
        ],
        deployer
      );

      expect(result).toBeErr(Cl.uint(503)); // ERR_ALREADY_RECORDED
    });

    it("tracks game-specific scores separately", () => {
      // Record score for game 1
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(1),  // game-id 1
          Cl.uint(0),
          Cl.uint(2),  // rare = 50 pts
        ],
        deployer
      );

      // Record score for game 2
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [
          Cl.principal(wallet1),
          Cl.uint(2),  // game-id 2
          Cl.uint(1),
          Cl.uint(4),  // legendary = 250 pts
        ],
        deployer
      );

      // Check game 1 score
      const game1Score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-game-score",
        [Cl.principal(wallet1), Cl.uint(1)],
        deployer
      );

      expect(game1Score.result).toBeTuple({
        points: Cl.uint(POINTS_RARE),
        "achievement-count": Cl.uint(1),
      });

      // Check game 2 score
      const game2Score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-game-score",
        [Cl.principal(wallet1), Cl.uint(2)],
        deployer
      );

      expect(game2Score.result).toBeTuple({
        points: Cl.uint(POINTS_LEGENDARY),
        "achievement-count": Cl.uint(1),
      });

      // Check global total
      const globalScore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(globalScore.result).toBeTuple({
        "total-points": Cl.uint(POINTS_RARE + POINTS_LEGENDARY),
        "achievement-count": Cl.uint(2),
      });
    });

    it("increments score nonce correctly", () => {
      // Record two scores
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(0)],
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1), Cl.uint(1)],
        deployer
      );

      const nonce = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-score-nonce",
        [],
        deployer
      );

      expect(nonce.result).toBeUint(2);
    });

    it("tracks scores for multiple players independently", () => {
      // Player 1 gets a rare achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      // Player 2 gets a legendary achievement
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet2), Cl.uint(1), Cl.uint(1), Cl.uint(4)],
        deployer
      );

      const score1 = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );

      const score2 = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet2)],
        deployer
      );

      expect(score1.result).toBeTuple({
        "total-points": Cl.uint(POINTS_RARE),
        "achievement-count": Cl.uint(1),
      });

      expect(score2.result).toBeTuple({
        "total-points": Cl.uint(POINTS_LEGENDARY),
        "achievement-count": Cl.uint(1),
      });
    });
  });

  // ============================================================================
  // DEDUCT SCORE TESTS
  // ============================================================================

  describe("deduct-score", () => {
    it("owner can deduct score for a revoked achievement", () => {
      // First record a score
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      // Deduct score
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "deduct-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      expect(result).toBeOk(Cl.bool(true));

      // Verify score is now 0
      const globalScore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(globalScore.result).toBeTuple({
        "total-points": Cl.uint(0),
        "achievement-count": Cl.uint(0),
      });
    });

    it("deduction removes scored-achievement marker", () => {
      // Record score
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      // Verify it's marked as scored
      let isScored = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-achievement-scored",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(isScored.result).toBeBool(true);

      // Deduct
      simnet.callPublicFn(
        CONTRACT_NAME,
        "deduct-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      // Should no longer be marked as scored
      isScored = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-achievement-scored",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );
      expect(isScored.result).toBeBool(false);
    });

    it("non-owner cannot deduct scores", () => {
      // Record score
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      // wallet1 tries to deduct (not owner)
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "deduct-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        wallet1
      );

      expect(result).toBeErr(Cl.uint(500)); // ERR_UNAUTHORIZED
    });

    it("rejects deduction for unscored achievement", () => {
      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "deduct-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(999), Cl.uint(2)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(502)); // ERR_NOT_FOUND
    });

    it("rejects deduction with invalid rarity tier", () => {
      // Record score first
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      const { result } = simnet.callPublicFn(
        CONTRACT_NAME,
        "deduct-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(5)],
        deployer
      );

      expect(result).toBeErr(Cl.uint(504)); // ERR_INVALID_RARITY
    });

    it("correctly deducts from both global and game scores with multiple entries", () => {
      // Record three scores: game 1 (rare + common), game 2 (epic)
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)], // rare 50pts
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(1), Cl.uint(0)], // common 10pts
        deployer
      );

      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(2), Cl.uint(2), Cl.uint(3)], // epic 100pts
        deployer
      );

      // Global should be 160 pts, 3 achievements
      let globalScore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(globalScore.result).toBeTuple({
        "total-points": Cl.uint(160),
        "achievement-count": Cl.uint(3),
      });

      // Deduct the rare achievement (50 pts) from game 1
      simnet.callPublicFn(
        CONTRACT_NAME,
        "deduct-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      // Global should now be 110 pts, 2 achievements
      globalScore = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );
      expect(globalScore.result).toBeTuple({
        "total-points": Cl.uint(110),
        "achievement-count": Cl.uint(2),
      });

      // Game 1 should be 10 pts, 1 achievement
      const game1Score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-game-score",
        [Cl.principal(wallet1), Cl.uint(1)],
        deployer
      );
      expect(game1Score.result).toBeTuple({
        points: Cl.uint(10),
        "achievement-count": Cl.uint(1),
      });

      // Game 2 should be unaffected: 100 pts, 1 achievement
      const game2Score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-game-score",
        [Cl.principal(wallet1), Cl.uint(2)],
        deployer
      );
      expect(game2Score.result).toBeTuple({
        points: Cl.uint(100),
        "achievement-count": Cl.uint(1),
      });
    });
  });

  // ============================================================================
  // READ-ONLY FUNCTION TESTS
  // ============================================================================

  describe("read-only functions", () => {
    it("get-player-total-score returns zeros for new player", () => {
      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-total-score",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(score.result).toBeTuple({
        "total-points": Cl.uint(0),
        "achievement-count": Cl.uint(0),
      });
    });

    it("get-player-game-score returns zeros for unplayed game", () => {
      const score = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-player-game-score",
        [Cl.principal(wallet1), Cl.uint(999)],
        deployer
      );

      expect(score.result).toBeTuple({
        points: Cl.uint(0),
        "achievement-count": Cl.uint(0),
      });
    });

    it("get-score-entry returns correct data", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(3)],
        deployer
      );

      const entry = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-score-entry",
        [Cl.uint(0)],
        deployer
      );

      expect(entry.result).not.toBeNone();
    });

    it("get-score-entry returns none for non-existent entry", () => {
      const entry = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-score-entry",
        [Cl.uint(999)],
        deployer
      );

      expect(entry.result).toBeNone();
    });

    it("is-achievement-scored returns false for unscored achievement", () => {
      const isScored = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-achievement-scored",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      expect(isScored.result).toBeBool(false);
    });

    it("is-achievement-scored returns true after scoring", () => {
      simnet.callPublicFn(
        CONTRACT_NAME,
        "record-score",
        [Cl.principal(wallet1), Cl.uint(1), Cl.uint(0), Cl.uint(2)],
        deployer
      );

      const isScored = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-achievement-scored",
        [Cl.principal(wallet1), Cl.uint(0)],
        deployer
      );

      expect(isScored.result).toBeBool(true);
    });

    it("get-rarity-points returns correct values for all tiers", () => {
      const tiers = [
        { tier: 0, expected: POINTS_COMMON },
        { tier: 1, expected: POINTS_UNCOMMON },
        { tier: 2, expected: POINTS_RARE },
        { tier: 3, expected: POINTS_EPIC },
        { tier: 4, expected: POINTS_LEGENDARY },
      ];

      for (const { tier, expected } of tiers) {
        const points = simnet.callReadOnlyFn(
          CONTRACT_NAME,
          "get-rarity-points",
          [Cl.uint(tier)],
          deployer
        );

        expect(points.result).toBeUint(expected);
      }
    });

    it("get-points-table returns all point constants", () => {
      const table = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-points-table",
        [],
        deployer
      );

      expect(table.result).toBeTuple({
        common: Cl.uint(POINTS_COMMON),
        uncommon: Cl.uint(POINTS_UNCOMMON),
        rare: Cl.uint(POINTS_RARE),
        epic: Cl.uint(POINTS_EPIC),
        legendary: Cl.uint(POINTS_LEGENDARY),
      });
    });

    it("get-score-nonce starts at zero", () => {
      const nonce = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "get-score-nonce",
        [],
        deployer
      );

      expect(nonce.result).toBeUint(0);
    });

    it("is-submitter-authorized returns false for unauthorized wallet", () => {
      const isAuthorized = simnet.callReadOnlyFn(
        CONTRACT_NAME,
        "is-submitter-authorized",
        [Cl.principal(wallet1)],
        deployer
      );

      expect(isAuthorized.result).toBeBool(false);
    });
  });
});
