;; leaderboard.clar
;; Achievement-based leaderboard and scoring contract
;; Tracks player scores and rankings based on achievement rarity points
;;
;; This contract implements a scoring system where achievements earn points
;; based on their rarity tier, enabling competitive leaderboards per game
;; and across all games globally.
;;
;; Point Values by Rarity:
;;   Tier 0 (Common)    = 10 points
;;   Tier 1 (Uncommon)  = 25 points
;;   Tier 2 (Rare)      = 50 points
;;   Tier 3 (Epic)      = 100 points
;;   Tier 4 (Legendary) = 250 points
;;
;; Design:
;; - Authorized submitters record scores (typically called after achievement registration)
;; - Player scores tracked both globally and per-game
;; - Score entries are immutable once recorded (audit trail)
;; - Duplicate prevention per player+achievement-id combination

;; ============================================================================
;; ERROR CODES
;; ============================================================================

(define-constant ERR_UNAUTHORIZED (err u500))
(define-constant ERR_INVALID_INPUT (err u501))
(define-constant ERR_NOT_FOUND (err u502))
(define-constant ERR_ALREADY_RECORDED (err u503))
(define-constant ERR_INVALID_RARITY (err u504))

;; ============================================================================
;; CONSTANTS - POINT VALUES PER RARITY TIER
;; ============================================================================

(define-constant POINTS_COMMON u10)
(define-constant POINTS_UNCOMMON u25)
(define-constant POINTS_RARE u50)
(define-constant POINTS_EPIC u100)
(define-constant POINTS_LEGENDARY u250)

;; Maximum rarity tier
(define-constant MAX_RARITY_TIER u4)

;; ============================================================================
;; DATA VARIABLES
;; ============================================================================

;; Contract owner for administrative functions
(define-data-var contract-owner principal tx-sender)

;; Score entry nonce for unique identifiers
(define-data-var score-nonce uint u0)

;; ============================================================================
;; DATA MAPS
;; ============================================================================

;; Global player scores (across all games)
(define-map player-scores
  { player: principal }
  {
    total-points: uint,
    achievement-count: uint
  }
)

;; Per-game player scores
(define-map game-scores
  { player: principal, game-id: uint }
  {
    points: uint,
    achievement-count: uint
  }
)

;; Individual score entries for audit trail
(define-map score-entries
  { entry-id: uint }
  {
    player: principal,
    game-id: uint,
    achievement-id: uint,
    rarity-tier: uint,
    points-awarded: uint,
    recorded-at: uint,
    recorded-by: principal
  }
)

;; Duplicate prevention: track which achievements have been scored
(define-map scored-achievements
  { player: principal, achievement-id: uint }
  { scored: bool }
)

;; Authorized score submitters (e.g., the achievement-registry contract or admin)
(define-map authorized-submitters
  { submitter: principal }
  { authorized: bool }
)

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

;; Check if caller is contract owner
(define-private (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner))
)

;; Check if a principal is an authorized submitter
(define-private (is-authorized-submitter (submitter principal))
  (default-to
    false
    (get authorized (map-get? authorized-submitters { submitter: submitter }))
  )
)

;; Calculate points based on rarity tier
;; @param rarity-tier: achievement rarity (0-4)
;; @returns point value for the tier
(define-private (calculate-points (rarity-tier uint))
  (if (is-eq rarity-tier u0)
    POINTS_COMMON
    (if (is-eq rarity-tier u1)
      POINTS_UNCOMMON
      (if (is-eq rarity-tier u2)
        POINTS_RARE
        (if (is-eq rarity-tier u3)
          POINTS_EPIC
          POINTS_LEGENDARY  ;; rarity-tier u4
        )
      )
    )
  )
)

;; Get current global score for a player
(define-private (get-player-score-data (player principal))
  (default-to
    { total-points: u0, achievement-count: u0 }
    (map-get? player-scores { player: player })
  )
)

;; Get current game-specific score for a player
(define-private (get-game-score-data (player principal) (game-id uint))
  (default-to
    { points: u0, achievement-count: u0 }
    (map-get? game-scores { player: player, game-id: game-id })
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - ADMINISTRATIVE
;; ============================================================================

;; Transfer contract ownership
;; @param new-owner: new owner principal address
;; @returns ok true on success
(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (var-set contract-owner new-owner)

    (print {
      event: "leaderboard-owner-transferred",
      previous-owner: tx-sender,
      new-owner: new-owner
    })

    (ok true)
  )
)

;; Add or remove an authorized score submitter
;; @param submitter: principal to authorize/deauthorize
;; @param authorized: true to authorize, false to revoke
;; @returns ok true on success
(define-public (set-authorized-submitter (submitter principal) (authorized bool))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)

    (map-set authorized-submitters
      { submitter: submitter }
      { authorized: authorized }
    )

    (print {
      event: "submitter-authorization-changed",
      submitter: submitter,
      authorized: authorized,
      changed-by: tx-sender
    })

    (ok true)
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - SCORE MANAGEMENT
;; ============================================================================

;; Record a score for an achievement
;; Called by authorized submitters after an achievement is registered
;; Points are automatically calculated based on the rarity tier
;;
;; @param player: the player who earned the achievement
;; @param game-id: the game the achievement belongs to
;; @param achievement-id: the unique achievement identifier
;; @param rarity-tier: rarity tier of the achievement (0-4)
;; @returns entry-id on success
(define-public (record-score
    (player principal)
    (game-id uint)
    (achievement-id uint)
    (rarity-tier uint)
  )
  (let
    (
      (caller tx-sender)
      (entry-id (var-get score-nonce))
      (points (calculate-points rarity-tier))
      (current-global (get-player-score-data player))
      (current-game (get-game-score-data player game-id))
    )

    ;; Authorization: only owner or authorized submitters
    (asserts!
      (or (is-contract-owner) (is-authorized-submitter caller))
      ERR_UNAUTHORIZED
    )

    ;; Validate rarity tier
    (asserts! (<= rarity-tier MAX_RARITY_TIER) ERR_INVALID_RARITY)

    ;; Check this achievement hasn't already been scored
    (asserts!
      (is-none (map-get? scored-achievements { player: player, achievement-id: achievement-id }))
      ERR_ALREADY_RECORDED
    )

    ;; Record score entry
    (map-set score-entries
      { entry-id: entry-id }
      {
        player: player,
        game-id: game-id,
        achievement-id: achievement-id,
        rarity-tier: rarity-tier,
        points-awarded: points,
        recorded-at: stacks-block-height,
        recorded-by: caller
      }
    )

    ;; Update global player score
    (map-set player-scores
      { player: player }
      {
        total-points: (+ (get total-points current-global) points),
        achievement-count: (+ (get achievement-count current-global) u1)
      }
    )

    ;; Update game-specific player score
    (map-set game-scores
      { player: player, game-id: game-id }
      {
        points: (+ (get points current-game) points),
        achievement-count: (+ (get achievement-count current-game) u1)
      }
    )

    ;; Mark achievement as scored
    (map-set scored-achievements
      { player: player, achievement-id: achievement-id }
      { scored: true }
    )

    ;; Increment nonce
    (var-set score-nonce (+ entry-id u1))

    ;; Emit event
    (print {
      event: "score-recorded",
      entry-id: entry-id,
      player: player,
      game-id: game-id,
      achievement-id: achievement-id,
      rarity-tier: rarity-tier,
      points-awarded: points
    })

    (ok entry-id)
  )
)

;; Deduct score for a revoked achievement (admin only)
;; Used when an achievement is revoked to remove its points from the leaderboard
;;
;; @param player: the player whose score should be adjusted
;; @param game-id: the game the achievement belongs to
;; @param achievement-id: the unique achievement identifier
;; @param rarity-tier: rarity tier of the revoked achievement (for point calculation)
;; @returns ok true on success
(define-public (deduct-score
    (player principal)
    (game-id uint)
    (achievement-id uint)
    (rarity-tier uint)
  )
  (let
    (
      (caller tx-sender)
      (points (calculate-points rarity-tier))
      (current-global (get-player-score-data player))
      (current-game (get-game-score-data player game-id))
    )

    ;; Only contract owner can deduct scores
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)

    ;; Validate rarity tier
    (asserts! (<= rarity-tier MAX_RARITY_TIER) ERR_INVALID_RARITY)

    ;; Check this achievement was actually scored
    (asserts!
      (is-some (map-get? scored-achievements { player: player, achievement-id: achievement-id }))
      ERR_NOT_FOUND
    )

    ;; Update global player score (subtract points, floor at 0)
    (map-set player-scores
      { player: player }
      {
        total-points: (if (>= (get total-points current-global) points)
          (- (get total-points current-global) points)
          u0
        ),
        achievement-count: (if (> (get achievement-count current-global) u0)
          (- (get achievement-count current-global) u1)
          u0
        )
      }
    )

    ;; Update game-specific player score (subtract, floor at 0)
    (map-set game-scores
      { player: player, game-id: game-id }
      {
        points: (if (>= (get points current-game) points)
          (- (get points current-game) points)
          u0
        ),
        achievement-count: (if (> (get achievement-count current-game) u0)
          (- (get achievement-count current-game) u1)
          u0
        )
      }
    )

    ;; Remove from scored achievements
    (map-delete scored-achievements { player: player, achievement-id: achievement-id })

    ;; Emit event
    (print {
      event: "score-deducted",
      player: player,
      game-id: game-id,
      achievement-id: achievement-id,
      points-deducted: points
    })

    (ok true)
  )
)

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

;; Get global player score (total across all games)
;; @param player: principal to query
;; @returns player score record or default zeros
(define-read-only (get-player-total-score (player principal))
  (get-player-score-data player)
)

;; Get player score for a specific game
;; @param player: principal to query
;; @param game-id: game identifier
;; @returns game score record or default zeros
(define-read-only (get-player-game-score (player principal) (game-id uint))
  (get-game-score-data player game-id)
)

;; Get a specific score entry by ID
;; @param entry-id: score entry identifier
;; @returns score entry record or none
(define-read-only (get-score-entry (entry-id uint))
  (map-get? score-entries { entry-id: entry-id })
)

;; Check if an achievement has already been scored
;; @param player: principal
;; @param achievement-id: achievement identifier
;; @returns true if already scored
(define-read-only (is-achievement-scored (player principal) (achievement-id uint))
  (is-some (map-get? scored-achievements { player: player, achievement-id: achievement-id }))
)

;; Get points for a given rarity tier
;; @param rarity-tier: rarity tier (0-4)
;; @returns point value
(define-read-only (get-rarity-points (rarity-tier uint))
  (calculate-points rarity-tier)
)

;; Get current score nonce (total score entries recorded)
;; @returns current nonce
(define-read-only (get-score-nonce)
  (var-get score-nonce)
)

;; Get contract owner
;; @returns owner principal
(define-read-only (get-contract-owner)
  (var-get contract-owner)
)

;; Check if a principal is an authorized submitter
;; @param submitter: principal to check
;; @returns true if authorized
(define-read-only (is-submitter-authorized (submitter principal))
  (is-authorized-submitter submitter)
)

;; Get all point constants for frontend integration
;; @returns tuple with all point values
(define-read-only (get-points-table)
  {
    common: POINTS_COMMON,
    uncommon: POINTS_UNCOMMON,
    rare: POINTS_RARE,
    epic: POINTS_EPIC,
    legendary: POINTS_LEGENDARY
  }
)
