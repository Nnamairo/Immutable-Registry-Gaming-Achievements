;; reputation-system.clar
;; Decentralized reputation management contract for the VPN Marketplace
;; Tracks and calculates trust scores for both VPN operators and service consumers
;; 
;; This contract is designed to be modular and independent, managing reputation
;; scores that can be queried by other marketplace contracts without tight coupling.
;;
;; Architecture:
;; - Each principal has a reputation record tracking their behavior history
;; - Scores range from 0 to 100 (percentage-based trustworthiness)
;; - New participants start with a neutral score of 50
;; - Successful transactions increase score, disputes decrease it
;; - Reputation decay mechanism prevents gaming through inactivity

;; ============================================================================
;; ERROR CODES
;; ============================================================================
;; Error codes are prefixed with u3xx to avoid collision with other contracts

(define-constant ERR_UNAUTHORIZED (err u300))
(define-constant ERR_INVALID_INPUT (err u301))
(define-constant ERR_NOT_FOUND (err u302))
(define-constant ERR_SCORE_OUT_OF_RANGE (err u303))
(define-constant ERR_ALREADY_RECORDED (err u304))
(define-constant ERR_INVALID_TRANSACTION_TYPE (err u305))
(define-constant ERR_SELF_RATING_NOT_ALLOWED (err u306))

;; ============================================================================
;; CONSTANTS
;; ============================================================================

;; Initial reputation score for new participants (neutral starting point)
(define-constant INITIAL_SCORE u50)

;; Maximum possible reputation score (100%)
(define-constant MAX_SCORE u100)

;; Minimum possible reputation score (floor to prevent negative)
(define-constant MIN_SCORE u0)

;; Reputation modifiers for different transaction outcomes
(define-constant SUCCESS_BONUS u5)           ;; Points gained per successful transaction
(define-constant DISPUTE_PENALTY u10)        ;; Points lost when losing a dispute
(define-constant SLASH_PENALTY u20)          ;; Points lost for severe violations (slashing)
(define-constant TIMEOUT_PENALTY u3)         ;; Points lost for transaction timeout

;; Transaction type identifiers for categorization
(define-constant TX_TYPE_SERVICE_COMPLETE u1)    ;; Normal service completion
(define-constant TX_TYPE_DISPUTE_WON u2)         ;; Won a dispute (minor bonus)
(define-constant TX_TYPE_DISPUTE_LOST u3)        ;; Lost a dispute (penalty)
(define-constant TX_TYPE_SLASHED u4)             ;; Severe violation (major penalty)
(define-constant TX_TYPE_TIMEOUT u5)             ;; Transaction timed out (minor penalty)

;; ============================================================================
;; DATA VARIABLES
;; ============================================================================

;; Contract owner for administrative functions
(define-data-var contract-owner principal tx-sender)

;; Transaction nonce for unique transaction IDs
(define-data-var transaction-nonce uint u0)

;; ============================================================================
;; DATA MAPS
;; ============================================================================

;; Primary reputation storage
;; Maps a principal to their complete reputation record
(define-map reputations
  { principal-addr: principal }
  {
    score: uint,                      ;; Current reputation score (0-100)
    total-transactions: uint,         ;; Total number of transactions recorded
    successful-transactions: uint,    ;; Number of successful transactions
    disputes-won: uint,               ;; Disputes decided in this principal's favor
    disputes-lost: uint,              ;; Disputes decided against this principal
    slashes: uint,                    ;; Number of times slashed for violations
    last-activity-block: uint,        ;; Block height of most recent activity
    created-at: uint                  ;; Block height when reputation was initialized
  }
)

;; Transaction history for audit trail
;; Maps transaction-id to the transaction details
(define-map transaction-history
  { transaction-id: uint }
  {
    principal-addr: principal,        ;; Principal affected by this transaction
    transaction-type: uint,           ;; Type of transaction (see TX_TYPE constants)
    score-before: uint,               ;; Score before this transaction
    score-after: uint,                ;; Score after this transaction
    recorded-at: uint,                ;; Block height when recorded
    recorded-by: principal            ;; Who recorded this transaction (for accountability)
  }
)

;; Tracks authorized recorders who can submit reputation updates
;; In production, this would be limited to trusted contracts or oracles
(define-map authorized-recorders
  { recorder: principal }
  { authorized: bool }
)

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

;; Check if caller is contract owner
;; @returns true if tx-sender is the contract owner
(define-private (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner))
)

;; Check if a principal is an authorized recorder
;; @param recorder: principal to check
;; @returns true if recorder is authorized
(define-private (is-authorized-recorder (recorder principal))
  (default-to
    false
    (get authorized (map-get? authorized-recorders { recorder: recorder }))
  )
)

;; Get or initialize reputation record for a principal
;; Creates a new record with INITIAL_SCORE if none exists
;; @param principal-addr: principal to get/initialize reputation for
;; @returns reputation record
(define-private (get-or-initialize-reputation (principal-addr principal))
  (default-to
    {
      score: INITIAL_SCORE,
      total-transactions: u0,
      successful-transactions: u0,
      disputes-won: u0,
      disputes-lost: u0,
      slashes: u0,
      last-activity-block: stacks-block-height,
      created-at: stacks-block-height
    }
    (map-get? reputations { principal-addr: principal-addr })
  )
)

;; Calculate new score with bounds checking
;; Ensures score stays within MIN_SCORE and MAX_SCORE
;; @param current-score: current reputation score
;; @param adjustment: points to add (positive) or subtract (negative handled via is-positive)
;; @param is-positive: true for addition, false for subtraction
;; @returns new bounded score
(define-private (calculate-bounded-score (current-score uint) (adjustment uint) (is-positive bool))
  (if is-positive
    ;; For positive adjustment, add and cap at MAX_SCORE
    (if (> (+ current-score adjustment) MAX_SCORE)
      MAX_SCORE
      (+ current-score adjustment)
    )
    ;; For negative adjustment, subtract with floor at MIN_SCORE
    (if (>= adjustment current-score)
      MIN_SCORE
      (- current-score adjustment)
    )
  )
)

;; Validate transaction type is one of the known types
;; @param tx-type: transaction type to validate
;; @returns true if valid transaction type
(define-private (is-valid-transaction-type (tx-type uint))
  (or
    (is-eq tx-type TX_TYPE_SERVICE_COMPLETE)
    (is-eq tx-type TX_TYPE_DISPUTE_WON)
    (is-eq tx-type TX_TYPE_DISPUTE_LOST)
    (is-eq tx-type TX_TYPE_SLASHED)
    (is-eq tx-type TX_TYPE_TIMEOUT)
  )
)

;; Get score adjustment and direction based on transaction type
;; @param tx-type: transaction type
;; @returns tuple of (adjustment: uint, is-positive: bool)
(define-private (get-score-adjustment (tx-type uint))
  (if (is-eq tx-type TX_TYPE_SERVICE_COMPLETE)
    { adjustment: SUCCESS_BONUS, is-positive: true }
    (if (is-eq tx-type TX_TYPE_DISPUTE_WON)
      { adjustment: u2, is-positive: true }  ;; Small bonus for winning dispute
      (if (is-eq tx-type TX_TYPE_DISPUTE_LOST)
        { adjustment: DISPUTE_PENALTY, is-positive: false }
        (if (is-eq tx-type TX_TYPE_SLASHED)
          { adjustment: SLASH_PENALTY, is-positive: false }
          { adjustment: TIMEOUT_PENALTY, is-positive: false }  ;; TX_TYPE_TIMEOUT
        )
      )
    )
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

;; Add or remove an authorized recorder
;; Authorized recorders can submit reputation updates on behalf of the marketplace
;; @param recorder: principal to authorize/deauthorize
;; @param authorized: true to authorize, false to revoke
;; @returns ok true on success
(define-public (set-authorized-recorder (recorder principal) (authorized bool))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    
    (map-set authorized-recorders
      { recorder: recorder }
      { authorized: authorized }
    )
    
    (print {
      event: "recorder-authorization-changed",
      recorder: recorder,
      authorized: authorized,
      changed-by: tx-sender
    })
    
    (ok true)
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - REPUTATION MANAGEMENT
;; ============================================================================

;; Record a reputation-affecting transaction for a principal
;; This is the primary entry point for recording reputation changes
;; Only authorized recorders (or contract owner) can call this function
;; 
;; @param principal-addr: the principal whose reputation is affected
;; @param tx-type: type of transaction (use TX_TYPE constants)
;; @returns transaction-id on success
(define-public (record-transaction
    (principal-addr principal)
    (tx-type uint)
  )
  (let
    (
      (caller tx-sender)
      (current-reputation (get-or-initialize-reputation principal-addr))
      (current-score (get score current-reputation))
      (adjustment-data (get-score-adjustment tx-type))
      (new-score (calculate-bounded-score 
        current-score 
        (get adjustment adjustment-data) 
        (get is-positive adjustment-data)
      ))
      (tx-id (var-get transaction-nonce))
      (is-success-type (or 
        (is-eq tx-type TX_TYPE_SERVICE_COMPLETE) 
        (is-eq tx-type TX_TYPE_DISPUTE_WON)
      ))
    )
    
    ;; Authorization check - only owner or authorized recorders
    (asserts! 
      (or (is-contract-owner) (is-authorized-recorder caller))
      ERR_UNAUTHORIZED
    )
    
    ;; Validate transaction type
    (asserts! (is-valid-transaction-type tx-type) ERR_INVALID_TRANSACTION_TYPE)
    
    ;; Update reputation record
    (map-set reputations
      { principal-addr: principal-addr }
      {
        score: new-score,
        total-transactions: (+ (get total-transactions current-reputation) u1),
        successful-transactions: (if is-success-type
          (+ (get successful-transactions current-reputation) u1)
          (get successful-transactions current-reputation)
        ),
        disputes-won: (if (is-eq tx-type TX_TYPE_DISPUTE_WON)
          (+ (get disputes-won current-reputation) u1)
          (get disputes-won current-reputation)
        ),
        disputes-lost: (if (is-eq tx-type TX_TYPE_DISPUTE_LOST)
          (+ (get disputes-lost current-reputation) u1)
          (get disputes-lost current-reputation)
        ),
        slashes: (if (is-eq tx-type TX_TYPE_SLASHED)
          (+ (get slashes current-reputation) u1)
          (get slashes current-reputation)
        ),
        last-activity-block: stacks-block-height,
        created-at: (get created-at current-reputation)
      }
    )
    
    ;; Record transaction in history
    (map-set transaction-history
      { transaction-id: tx-id }
      {
        principal-addr: principal-addr,
        transaction-type: tx-type,
        score-before: current-score,
        score-after: new-score,
        recorded-at: stacks-block-height,
        recorded-by: caller
      }
    )
    
    ;; Increment transaction nonce
    (var-set transaction-nonce (+ tx-id u1))
    
    ;; Emit event for indexers
    (print {
      event: "reputation-updated",
      principal-addr: principal-addr,
      transaction-type: tx-type,
      score-before: current-score,
      score-after: new-score,
      transaction-id: tx-id
    })
    
    (ok tx-id)
  )
)

;; Initialize reputation for a principal (explicit initialization)
;; Useful for ensuring a reputation record exists before marketplace operations
;; Any principal can initialize their own reputation
;; @returns ok true on success
(define-public (initialize-reputation)
  (let
    (
      (caller tx-sender)
      (existing (map-get? reputations { principal-addr: caller }))
    )
    
    ;; Only initialize if not already existing
    (asserts! (is-none existing) ERR_ALREADY_RECORDED)
    
    (map-set reputations
      { principal-addr: caller }
      {
        score: INITIAL_SCORE,
        total-transactions: u0,
        successful-transactions: u0,
        disputes-won: u0,
        disputes-lost: u0,
        slashes: u0,
        last-activity-block: stacks-block-height,
        created-at: stacks-block-height
      }
    )
    
    (print {
      event: "reputation-initialized",
      principal-addr: caller,
      initial-score: INITIAL_SCORE
    })
    
    (ok true)
  )
)

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

;; Get complete reputation record for a principal
;; @param principal-addr: principal to query
;; @returns reputation record or none if not found
(define-read-only (get-reputation (principal-addr principal))
  (map-get? reputations { principal-addr: principal-addr })
)

;; Get only the reputation score for a principal
;; Returns INITIAL_SCORE if principal has no record (treated as new participant)
;; @param principal-addr: principal to query
;; @returns reputation score (0-100)
(define-read-only (get-reputation-score (principal-addr principal))
  (default-to
    INITIAL_SCORE
    (get score (map-get? reputations { principal-addr: principal-addr }))
  )
)

;; Get transaction history entry by ID
;; @param transaction-id: ID of the transaction to query
;; @returns transaction record or none
(define-read-only (get-transaction (transaction-id uint))
  (map-get? transaction-history { transaction-id: transaction-id })
)

;; Get current transaction nonce (total transactions recorded)
;; @returns current nonce value
(define-read-only (get-transaction-nonce)
  (var-get transaction-nonce)
)

;; Get contract owner
;; @returns contract owner principal
(define-read-only (get-contract-owner)
  (var-get contract-owner)
)

;; Check if a principal is an authorized recorder
;; @param recorder: principal to check
;; @returns true if authorized
(define-read-only (is-recorder-authorized (recorder principal))
  (is-authorized-recorder recorder)
)

;; Calculate trust level based on reputation score
;; Returns a categorical trust level for UI/UX purposes
;; Levels: 0=Untrusted, 1=Low, 2=Medium, 3=High, 4=Trusted
;; @param principal-addr: principal to evaluate
;; @returns trust level (0-4)
(define-read-only (get-trust-level (principal-addr principal))
  (let
    (
      (score (get-reputation-score principal-addr))
    )
    (if (< score u20)
      u0  ;; Untrusted (0-19)
      (if (< score u40)
        u1  ;; Low (20-39)
        (if (< score u60)
          u2  ;; Medium (40-59)
          (if (< score u80)
            u3  ;; High (60-79)
            u4  ;; Trusted (80-100)
          )
        )
      )
    )
  )
)

;; Check if a principal has sufficient reputation for marketplace operations
;; @param principal-addr: principal to check
;; @param minimum-score: minimum required score
;; @returns true if principal meets minimum requirement
(define-read-only (meets-minimum-reputation (principal-addr principal) (minimum-score uint))
  (>= (get-reputation-score principal-addr) minimum-score)
)

;; Get success rate as percentage for a principal
;; Returns 0 if no transactions recorded
;; @param principal-addr: principal to query
;; @returns success percentage (0-100)
(define-read-only (get-success-rate (principal-addr principal))
  (let
    (
      (reputation (get-or-initialize-reputation principal-addr))
      (total (get total-transactions reputation))
      (successful (get successful-transactions reputation))
    )
    (if (is-eq total u0)
      u0
      (/ (* successful u100) total)
    )
  )
)

;; Get all reputation constants for frontend integration
;; @returns tuple with all reputation constants
(define-read-only (get-reputation-constants)
  {
    initial-score: INITIAL_SCORE,
    max-score: MAX_SCORE,
    min-score: MIN_SCORE,
    success-bonus: SUCCESS_BONUS,
    dispute-penalty: DISPUTE_PENALTY,
    slash-penalty: SLASH_PENALTY,
    timeout-penalty: TIMEOUT_PENALTY
  }
)

;; Get transaction type constants for frontend integration
;; @returns tuple with transaction type constants
(define-read-only (get-transaction-types)
  {
    service-complete: TX_TYPE_SERVICE_COMPLETE,
    dispute-won: TX_TYPE_DISPUTE_WON,
    dispute-lost: TX_TYPE_DISPUTE_LOST,
    slashed: TX_TYPE_SLASHED,
    timeout: TX_TYPE_TIMEOUT
  }
)
