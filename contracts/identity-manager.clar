;; identity-manager.clar
;; Cross-platform identity linking contract
;; Maintains mappings between Stacks principals and platform identities

;; Error codes
(define-constant ERR_UNAUTHORIZED (err u200))
(define-constant ERR_INVALID_INPUT (err u201))
(define-constant ERR_ALREADY_LINKED (err u202))
(define-constant ERR_NOT_FOUND (err u203))
(define-constant ERR_INVALID_PLATFORM (err u204))

;; Constants for validation
(define-constant MIN_USERNAME_LENGTH u1)
(define-constant MAX_USERNAME_LENGTH u256)
(define-constant MIN_PLATFORM_LENGTH u1)
(define-constant MAX_PLATFORM_LENGTH u32)
(define-constant MAX_IDENTITIES_PER_USER u20)

;; Data Variables
(define-data-var contract-owner principal tx-sender)

;; Primary map: (principal, platform, username) -> identity record
(define-map identities
  { stacks-address: principal, platform: (string-ascii 32), username: (string-ascii 256) }
  {
    verified: bool,
    linked-at: uint
  }
)

;; Reverse lookup: (platform, username) -> principal
(define-map identity-reverse-lookup
  { platform: (string-ascii 32), username: (string-ascii 256) }
  { stacks-address: principal }
)

;; Track identity count per principal
(define-map identity-count
  { stacks-address: principal }
  { count: uint }
)

;; Private helper functions

;; Validate username length
(define-private (is-valid-username (username (string-ascii 256)))
  (let ((username-len (len username)))
    (and
      (>= username-len MIN_USERNAME_LENGTH)
      (<= username-len MAX_USERNAME_LENGTH)
    )
  )
)

;; Validate platform length
(define-private (is-valid-platform (platform (string-ascii 32)))
  (let ((platform-len (len platform)))
    (and
      (>= platform-len MIN_PLATFORM_LENGTH)
      (<= platform-len MAX_PLATFORM_LENGTH)
    )
  )
)

;; Get identity count for a principal
(define-private (get-identity-count-helper (stacks-address principal))
  (default-to
    u0
    (get count (map-get? identity-count { stacks-address: stacks-address }))
  )
)

;; Check if caller is contract owner
(define-private (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner))
)

;; Public functions

;; Link a platform identity to the caller's Stacks address
;; @param platform: platform name (e.g., "Steam", "PlayStation", "Xbox")
;; @param username: username on the platform
;; @param verified: initial verification status (typically false until verified by oracle)
;; @returns ok true on success
(define-public (link-identity
    (platform (string-ascii 32))
    (username (string-ascii 256))
    (verified bool)
  )
  (let
    (
      (caller tx-sender)
      (current-count (get-identity-count-helper caller))
    )
    
    ;; Input validation
    (asserts! (is-valid-platform platform) ERR_INVALID_PLATFORM)
    (asserts! (is-valid-username username) ERR_INVALID_INPUT)
    
    ;; Check max identities per user limit
    (asserts! (< current-count MAX_IDENTITIES_PER_USER) ERR_INVALID_INPUT)
    
    ;; Check if identity is already linked
    (asserts!
      (is-none (map-get? identities
        { stacks-address: caller, platform: platform, username: username }
      ))
      ERR_ALREADY_LINKED
    )
    
    ;; Check if platform+username is already linked to another address
    (asserts!
      (is-none (map-get? identity-reverse-lookup
        { platform: platform, username: username }
      ))
      ERR_ALREADY_LINKED
    )
    
    ;; Store identity mapping
    (map-set identities
      { stacks-address: caller, platform: platform, username: username }
      {
        verified: verified,
        linked-at: stacks-block-height
      }
    )
    
    ;; Store reverse lookup
    (map-set identity-reverse-lookup
      { platform: platform, username: username }
      { stacks-address: caller }
    )
    
    ;; Update identity count
    (map-set identity-count
      { stacks-address: caller }
      { count: (+ current-count u1) }
    )
    
    ;; Emit event
    (print {
      event: "identity-linked",
      stacks-address: caller,
      platform: platform,
      username: username,
      verified: verified,
      linked-at: stacks-block-height
    })
    
    (ok true)
  )
)

;; Unlink a platform identity from the caller's Stacks address
;; @param platform: platform name
;; @param username: username on the platform
;; @returns ok true on success
(define-public (unlink-identity
    (platform (string-ascii 32))
    (username (string-ascii 256))
  )
  (let
    (
      (caller tx-sender)
      (current-count (get-identity-count-helper caller))
    )
    
    ;; Verify identity exists and belongs to caller
    (asserts!
      (is-some (map-get? identities
        { stacks-address: caller, platform: platform, username: username }
      ))
      ERR_NOT_FOUND
    )
    
    ;; Delete primary mapping
    (map-delete identities
      { stacks-address: caller, platform: platform, username: username }
    )
    
    ;; Delete reverse lookup
    (map-delete identity-reverse-lookup
      { platform: platform, username: username }
    )
    
    ;; Update identity count
    (map-set identity-count
      { stacks-address: caller }
      { count: (- current-count u1) }
    )
    
    ;; Emit event
    (print {
      event: "identity-unlinked",
      stacks-address: caller,
      platform: platform,
      username: username
    })
    
    (ok true)
  )
)

;; Set verification status for an identity (restricted to contract owner or oracle)
;; @param stacks-address: principal address that owns the identity
;; @param platform: platform name
;; @param username: username on the platform
;; @param verified: new verification status
;; @returns ok true on success
(define-public (set-identity-verified
    (stacks-address principal)
    (platform (string-ascii 32))
    (username (string-ascii 256))
    (verified bool)
  )
  (let
    (
      (identity-record (map-get? identities
        { stacks-address: stacks-address, platform: platform, username: username }
      ))
    )
    
    ;; Only contract owner can set verification (oracle integration in future)
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    
    ;; Verify identity exists
    (asserts! (is-some identity-record) ERR_NOT_FOUND)
    
    ;; Update verification status
    (map-set identities
      { stacks-address: stacks-address, platform: platform, username: username }
      (merge (unwrap-panic identity-record) { verified: verified })
    )
    
    ;; Emit event
    (print {
      event: "identity-verification-updated",
      stacks-address: stacks-address,
      platform: platform,
      username: username,
      verified: verified
    })
    
    (ok true)
  )
)

;; Update contract owner (restricted to current owner)
;; @param new-owner: new owner principal
;; @returns ok true on success
(define-public (set-contract-owner (new-owner principal))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)
  )
)

;; Read-only functions

;; Get identity details for a specific principal, platform, and username
;; @param stacks-address: principal address
;; @param platform: platform name
;; @param username: username on the platform
;; @returns identity record or none
(define-read-only (get-identity
    (stacks-address principal)
    (platform (string-ascii 32))
    (username (string-ascii 256))
  )
  (map-get? identities
    { stacks-address: stacks-address, platform: platform, username: username }
  )
)

;; Resolve a principal from a platform identity (reverse lookup)
;; @param platform: platform name
;; @param username: username on the platform
;; @returns principal or none
(define-read-only (resolve-principal
    (platform (string-ascii 32))
    (username (string-ascii 256))
  )
  (match (map-get? identity-reverse-lookup
    { platform: platform, username: username }
  )
    record (some (get stacks-address record))
    none
  )
)

;; Get total identity count for a principal
;; @param stacks-address: principal address
;; @returns count of linked identities
(define-read-only (get-identity-count (stacks-address principal))
  (get-identity-count-helper stacks-address)
)

;; Get contract owner
;; @returns contract owner principal
(define-read-only (get-contract-owner)
  (var-get contract-owner)
)

;; Check if an identity is verified
;; @param stacks-address: principal address
;; @param platform: platform name
;; @param username: username on the platform
;; @returns true if verified, false otherwise
(define-read-only (is-identity-verified
    (stacks-address principal)
    (platform (string-ascii 32))
    (username (string-ascii 256))
  )
  (match (get-identity stacks-address platform username)
    record (get verified record)
    false
  )
)

