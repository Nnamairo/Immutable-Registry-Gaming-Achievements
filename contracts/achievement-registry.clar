;; achievement-registry.clar
;; Core achievement registry contract for immutable gaming achievements
;; Supports registration, storage, querying, verification, and revocation of player achievements
;;
;; Features:
;; - Players register achievements with game metadata and rarity tiers
;; - Admin/verifier role system for achievement verification
;; - Revocation mechanism for fraudulent or invalid achievements
;; - Duplicate prevention per player+game+achievement-name
;; - Pagination support via indexed achievement lookups

;; ============================================================================
;; ERROR CODES
;; ============================================================================

(define-constant ERR_UNAUTHORIZED (err u100))
(define-constant ERR_INVALID_INPUT (err u101))
(define-constant ERR_DUPLICATE (err u102))
(define-constant ERR_OUT_OF_RANGE (err u103))
(define-constant ERR_NOT_FOUND (err u104))
(define-constant ERR_ALREADY_VERIFIED (err u105))
(define-constant ERR_ALREADY_REVOKED (err u106))
(define-constant ERR_REVOKED (err u107))

;; ============================================================================
;; CONSTANTS
;; ============================================================================

(define-constant MAX_RARITY_TIER u4)
(define-constant MIN_NAME_LENGTH u1)
(define-constant MAX_NAME_LENGTH u256)
(define-constant MAX_PLATFORM_LENGTH u32)
(define-constant MAX_URI_LENGTH u256)

;; ============================================================================
;; DATA VARIABLES
;; ============================================================================

(define-data-var achievement-nonce uint u0)
(define-data-var contract-owner principal tx-sender)

;; Achievement record structure
(define-map achievements
  { player: principal, achievement-id: uint }
  {
    game-id: uint,
    achievement-name: (string-ascii 256),
    platform: (string-ascii 32),
    timestamp: uint,
    metadata-uri: (string-utf8 256),
    rarity-tier: uint,
    verified: bool
  }
)

;; Player achievement index for pagination
(define-map player-achievement-index
  { player: principal, index: uint }
  { achievement-id: uint }
)

;; Player achievement count for tracking
(define-map player-achievement-count
  { player: principal }
  { count: uint }
)

;; Achievement uniqueness tracker (game-id + name + player)
(define-map achievement-uniqueness
  { player: principal, game-id: uint, achievement-name: (string-ascii 256) }
  { exists: bool }
)

;; Authorized verifiers who can verify achievements
(define-map authorized-verifiers
  { verifier: principal }
  { authorized: bool }
)

;; Revoked achievements tracking
(define-map revoked-achievements
  { player: principal, achievement-id: uint }
  {
    revoked: bool,
    revoked-by: principal,
    revoked-at: uint,
    reason: (string-ascii 256)
  }
)

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

;; Validate achievement name length
(define-private (is-valid-name (name (string-ascii 256)))
  (let ((name-len (len name)))
    (and 
      (>= name-len MIN_NAME_LENGTH)
      (<= name-len MAX_NAME_LENGTH)
    )
  )
)

;; Validate rarity tier range
(define-private (is-valid-rarity (rarity uint))
  (<= rarity MAX_RARITY_TIER)
)

;; Validate platform length
(define-private (is-valid-platform (platform (string-ascii 32)))
  (and
    (> (len platform) u0)
    (<= (len platform) MAX_PLATFORM_LENGTH)
  )
)

;; Get player achievement count helper
(define-private (get-player-count (player principal))
  (default-to 
    u0 
    (get count (map-get? player-achievement-count { player: player }))
  )
)

;; Check if caller is contract owner
(define-private (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner))
)

;; Check if a principal is an authorized verifier
(define-private (is-authorized-verifier (verifier principal))
  (default-to
    false
    (get authorized (map-get? authorized-verifiers { verifier: verifier }))
  )
)

;; Check if an achievement is revoked
(define-private (is-revoked (player principal) (achievement-id uint))
  (default-to
    false
    (get revoked (map-get? revoked-achievements { player: player, achievement-id: achievement-id }))
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - ADMINISTRATIVE
;; ============================================================================

;; Transfer contract ownership to a new principal
;; @param new-owner: new owner principal address
;; @returns ok true on success
(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (var-set contract-owner new-owner)

    (print {
      event: "owner-transferred",
      previous-owner: tx-sender,
      new-owner: new-owner
    })

    (ok true)
  )
)

;; Add or remove an authorized verifier
;; Verifiers can mark achievements as verified after off-chain validation
;; @param verifier: principal to authorize/deauthorize
;; @param authorized: true to authorize, false to revoke
;; @returns ok true on success
(define-public (set-authorized-verifier (verifier principal) (authorized bool))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)

    (map-set authorized-verifiers
      { verifier: verifier }
      { authorized: authorized }
    )

    (print {
      event: "verifier-authorization-changed",
      verifier: verifier,
      authorized: authorized,
      changed-by: tx-sender
    })

    (ok true)
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - ACHIEVEMENT MANAGEMENT
;; ============================================================================

;; Register a new achievement for the caller
;; @param game-id: unique identifier for the game
;; @param achievement-name: name of the achievement
;; @param platform: platform where achievement was earned (e.g., "PC", "PlayStation")
;; @param timestamp: unix timestamp or block-height when earned
;; @param metadata-uri: URI pointing to off-chain metadata (JSON)
;; @param rarity-tier: rarity level (0=common, 1=uncommon, 2=rare, 3=epic, 4=legendary)
;; @returns achievement-id on success
(define-public (register-achievement 
    (game-id uint)
    (achievement-name (string-ascii 256))
    (platform (string-ascii 32))
    (timestamp uint)
    (metadata-uri (string-utf8 256))
    (rarity-tier uint)
  )
  (let
    (
      (player tx-sender)
      (achievement-id (var-get achievement-nonce))
      (player-count (get-player-count player))
    )
    
    ;; Input validation
    (asserts! (is-valid-name achievement-name) ERR_INVALID_INPUT)
    (asserts! (is-valid-platform platform) ERR_INVALID_INPUT)
    (asserts! (is-valid-rarity rarity-tier) ERR_OUT_OF_RANGE)
    (asserts! (> timestamp u0) ERR_INVALID_INPUT)
    (asserts! (> (len metadata-uri) u0) ERR_INVALID_INPUT)
    
    ;; Check for duplicate achievement
    (asserts! 
      (is-none (map-get? achievement-uniqueness 
        { player: player, game-id: game-id, achievement-name: achievement-name }
      ))
      ERR_DUPLICATE
    )
    
    ;; Store achievement record
    (map-set achievements
      { player: player, achievement-id: achievement-id }
      {
        game-id: game-id,
        achievement-name: achievement-name,
        platform: platform,
        timestamp: timestamp,
        metadata-uri: metadata-uri,
        rarity-tier: rarity-tier,
        verified: false
      }
    )
    
    ;; Update player achievement index
    (map-set player-achievement-index
      { player: player, index: player-count }
      { achievement-id: achievement-id }
    )
    
    ;; Update player achievement count
    (map-set player-achievement-count
      { player: player }
      { count: (+ player-count u1) }
    )
    
    ;; Mark achievement as existing to prevent duplicates
    (map-set achievement-uniqueness
      { player: player, game-id: game-id, achievement-name: achievement-name }
      { exists: true }
    )
    
    ;; Increment nonce for next achievement
    (var-set achievement-nonce (+ achievement-id u1))
    
    ;; Emit event via print
    (print {
      event: "achievement-registered",
      player: player,
      achievement-id: achievement-id,
      game-id: game-id,
      achievement-name: achievement-name,
      rarity-tier: rarity-tier
    })
    
    (ok achievement-id)
  )
)

;; Verify an achievement (only authorized verifiers or contract owner)
;; Marks an achievement as verified after off-chain validation
;; @param player: principal address of the achievement holder
;; @param achievement-id: unique achievement identifier
;; @returns ok true on success
(define-public (verify-achievement
    (player principal)
    (achievement-id uint)
  )
  (let
    (
      (caller tx-sender)
      (achievement-record (unwrap! 
        (map-get? achievements { player: player, achievement-id: achievement-id })
        ERR_NOT_FOUND
      ))
    )

    ;; Authorization: only owner or authorized verifiers
    (asserts!
      (or (is-contract-owner) (is-authorized-verifier caller))
      ERR_UNAUTHORIZED
    )

    ;; Check not already verified
    (asserts! (not (get verified achievement-record)) ERR_ALREADY_VERIFIED)

    ;; Check not revoked
    (asserts! (not (is-revoked player achievement-id)) ERR_ALREADY_REVOKED)

    ;; Update achievement to verified
    (map-set achievements
      { player: player, achievement-id: achievement-id }
      (merge achievement-record { verified: true })
    )

    ;; Emit event
    (print {
      event: "achievement-verified",
      player: player,
      achievement-id: achievement-id,
      verified-by: caller
    })

    (ok true)
  )
)

;; Revoke an achievement (only contract owner)
;; Used for fraudulent or invalid achievements discovered after registration
;; @param player: principal address of the achievement holder
;; @param achievement-id: unique achievement identifier
;; @param reason: reason for revocation
;; @returns ok true on success
(define-public (revoke-achievement
    (player principal)
    (achievement-id uint)
    (reason (string-ascii 256))
  )
  (let
    (
      (caller tx-sender)
      (achievement-record (unwrap!
        (map-get? achievements { player: player, achievement-id: achievement-id })
        ERR_NOT_FOUND
      ))
    )

    ;; Only contract owner can revoke
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)

    ;; Must provide a reason
    (asserts! (> (len reason) u0) ERR_INVALID_INPUT)

    ;; Check not already revoked
    (asserts! (not (is-revoked player achievement-id)) ERR_ALREADY_REVOKED)

    ;; Mark achievement as revoked
    (map-set revoked-achievements
      { player: player, achievement-id: achievement-id }
      {
        revoked: true,
        revoked-by: caller,
        revoked-at: stacks-block-height,
        reason: reason
      }
    )

    ;; If it was verified, unverify it
    (if (get verified achievement-record)
      (map-set achievements
        { player: player, achievement-id: achievement-id }
        (merge achievement-record { verified: false })
      )
      true
    )

    ;; Emit event
    (print {
      event: "achievement-revoked",
      player: player,
      achievement-id: achievement-id,
      revoked-by: caller,
      reason: reason
    })

    (ok true)
  )
)

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

;; Get achievement details by player and achievement-id
;; @param player: principal address of the player
;; @param achievement-id: unique achievement identifier
;; @returns achievement record or none
(define-read-only (get-achievement (player principal) (achievement-id uint))
  (map-get? achievements { player: player, achievement-id: achievement-id })
)

;; Get total achievement count for a player
;; @param player: principal address of the player
;; @returns count of achievements
(define-read-only (get-player-achievement-count (player principal))
  (get-player-count player)
)

;; Get achievement by player and index for pagination
;; @param player: principal address of the player
;; @param index: index position in player's achievement list
;; @returns achievement record or none
(define-read-only (get-player-achievement-by-index (player principal) (index uint))
  (let
    (
      (achievement-id-record (map-get? player-achievement-index 
        { player: player, index: index }
      ))
    )
    (match achievement-id-record
      record (get-achievement player (get achievement-id record))
      none
    )
  )
)

;; Check if achievement exists for player, game, and name combination
;; @param player: principal address of the player
;; @param game-id: game identifier
;; @param achievement-name: achievement name
;; @returns true if exists, false otherwise
(define-read-only (achievement-exists 
    (player principal) 
    (game-id uint) 
    (achievement-name (string-ascii 256))
  )
  (is-some (map-get? achievement-uniqueness 
    { player: player, game-id: game-id, achievement-name: achievement-name }
  ))
)

;; Get current achievement nonce (total achievements registered)
;; @returns current nonce value
(define-read-only (get-achievement-nonce)
  (var-get achievement-nonce)
)

;; Get contract owner
;; @returns contract owner principal
(define-read-only (get-contract-owner)
  (var-get contract-owner)
)

;; Check if a principal is an authorized verifier
;; @param verifier: principal to check
;; @returns true if authorized
(define-read-only (is-verifier-authorized (verifier principal))
  (is-authorized-verifier verifier)
)

;; Check if an achievement has been revoked
;; @param player: principal address of the player
;; @param achievement-id: unique achievement identifier
;; @returns true if revoked, false otherwise
(define-read-only (is-achievement-revoked (player principal) (achievement-id uint))
  (is-revoked player achievement-id)
)

;; Get revocation details for an achievement
;; @param player: principal address of the player
;; @param achievement-id: unique achievement identifier
;; @returns revocation record or none
(define-read-only (get-revocation-details (player principal) (achievement-id uint))
  (map-get? revoked-achievements { player: player, achievement-id: achievement-id })
)

