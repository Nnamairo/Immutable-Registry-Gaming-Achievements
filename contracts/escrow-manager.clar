;; escrow-manager.clar
;; Secure escrow management contract for the VPN Marketplace
;; Handles trustless payment holding and release for service transactions
;;
;; This contract implements a secure escrow mechanism where:
;; - Buyers lock STX when purchasing VPN services
;; - Funds are held until service completion or dispute resolution
;; - Operators receive payment upon successful service delivery
;; - Refunds are possible under specific conditions (timeouts, disputes)
;;
;; Security Features:
;; - Time-locked releases with configurable timeout periods
;; - Multi-state transitions preventing invalid operations
;; - Principal verification for all fund movements
;; - Emergency refund mechanism for stuck funds

;; ============================================================================
;; ERROR CODES
;; ============================================================================
;; Error codes are prefixed with u4xx to avoid collision with other contracts

(define-constant ERR_UNAUTHORIZED (err u400))
(define-constant ERR_INVALID_INPUT (err u401))
(define-constant ERR_NOT_FOUND (err u402))
(define-constant ERR_INVALID_STATE (err u403))
(define-constant ERR_INSUFFICIENT_BALANCE (err u404))
(define-constant ERR_ALREADY_EXISTS (err u405))
(define-constant ERR_ESCROW_EXPIRED (err u406))
(define-constant ERR_ESCROW_NOT_EXPIRED (err u407))
(define-constant ERR_TRANSFER_FAILED (err u408))
(define-constant ERR_ZERO_AMOUNT (err u409))
(define-constant ERR_SAME_PARTIES (err u410))

;; ============================================================================
;; CONSTANTS
;; ============================================================================

;; Escrow status values (using uint for gas efficiency)
(define-constant ESCROW_STATUS_LOCKED u1)       ;; Funds locked, service in progress
(define-constant ESCROW_STATUS_RELEASED u2)     ;; Funds released to payee
(define-constant ESCROW_STATUS_REFUNDED u3)     ;; Funds refunded to payer
(define-constant ESCROW_STATUS_DISPUTED u4)     ;; Under dispute resolution
(define-constant ESCROW_STATUS_CANCELLED u5)    ;; Cancelled before service started

;; Default timeout period in blocks (~2 weeks assuming 10-min blocks)
;; 14 days * 24 hours * 6 blocks/hour = 2016 blocks
(define-constant DEFAULT_TIMEOUT_BLOCKS u2016)

;; Minimum escrow amount (prevent dust attacks)
(define-constant MIN_ESCROW_AMOUNT u1000)  ;; 0.001 STX in microSTX

;; Platform fee percentage (2% = 200 basis points)
(define-constant PLATFORM_FEE_BPS u200)

;; Basis points divisor for percentage calculations
(define-constant BPS_DIVISOR u10000)

;; ============================================================================
;; DATA VARIABLES
;; ============================================================================

;; Contract owner for administrative functions
(define-data-var contract-owner principal tx-sender)

;; Platform fee recipient
(define-data-var fee-recipient principal tx-sender)

;; Escrow ID nonce for unique identifiers
(define-data-var escrow-nonce uint u0)

;; Total value locked in escrow (for analytics)
(define-data-var total-value-locked uint u0)

;; Platform toggle for pausing escrow creation
(define-data-var escrows-enabled bool true)

;; ============================================================================
;; DATA MAPS
;; ============================================================================

;; Primary escrow storage
(define-map escrows
  { escrow-id: uint }
  {
    payer: principal,                 ;; Who locked the funds (buyer)
    payee: principal,                 ;; Who receives funds (operator)
    amount: uint,                     ;; Amount locked in escrow (in microSTX)
    fee-amount: uint,                 ;; Platform fee calculated at lock time
    status: uint,                     ;; Current escrow status
    created-at: uint,                 ;; Block height when created
    timeout-block: uint,              ;; Block height after which timeout is possible
    released-at: (optional uint),     ;; Block height when funds were released
    service-id: (optional uint)       ;; Optional reference to service ID
  }
)

;; Index of escrows by payer for pagination
(define-map payer-escrow-index
  { payer: principal, index: uint }
  { escrow-id: uint }
)

;; Count of escrows per payer
(define-map payer-escrow-count
  { payer: principal }
  { count: uint }
)

;; Index of escrows by payee for pagination
(define-map payee-escrow-index
  { payee: principal, index: uint }
  { escrow-id: uint }
)

;; Count of escrows per payee
(define-map payee-escrow-count
  { payee: principal }
  { count: uint }
)

;; Dispute records for escrows under dispute
(define-map disputes
  { escrow-id: uint }
  {
    initiated-by: principal,          ;; Who initiated the dispute
    initiated-at: uint,               ;; Block height when dispute started
    reason: (string-ascii 256),       ;; Reason for dispute
    resolved: bool,                   ;; Whether dispute has been resolved
    resolution: (optional uint)       ;; Resolution: 1=favor payer, 2=favor payee
  }
)

;; ============================================================================
;; PRIVATE HELPER FUNCTIONS
;; ============================================================================

;; Check if caller is contract owner
(define-private (is-contract-owner)
  (is-eq tx-sender (var-get contract-owner))
)

;; Get payer escrow count
(define-private (get-payer-count (payer principal))
  (default-to
    u0
    (get count (map-get? payer-escrow-count { payer: payer }))
  )
)

;; Get payee escrow count
(define-private (get-payee-count (payee principal))
  (default-to
    u0
    (get count (map-get? payee-escrow-count { payee: payee }))
  )
)

;; Calculate platform fee
;; @param amount: total amount to calculate fee from
;; @returns fee amount
(define-private (calculate-fee (amount uint))
  (/ (* amount PLATFORM_FEE_BPS) BPS_DIVISOR)
)

;; Check if escrow is in valid state for release
(define-private (is-releasable-state (status uint))
  (is-eq status ESCROW_STATUS_LOCKED)
)

;; Check if escrow is in valid state for refund
(define-private (is-refundable-state (status uint))
  (or
    (is-eq status ESCROW_STATUS_LOCKED)
    (is-eq status ESCROW_STATUS_DISPUTED)
  )
)

;; Check if escrow has expired (timeout reached)
(define-private (is-expired (timeout-block uint))
  (> stacks-block-height timeout-block)
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
      event: "owner-transferred",
      previous-owner: tx-sender,
      new-owner: new-owner
    })
    
    (ok true)
  )
)

;; Set fee recipient address
;; @param recipient: address to receive platform fees
;; @returns ok true on success
(define-public (set-fee-recipient (recipient principal))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (var-set fee-recipient recipient)
    
    (print {
      event: "fee-recipient-updated",
      recipient: recipient
    })
    
    (ok true)
  )
)

;; Enable or disable escrow creation
;; @param enabled: true to enable, false to disable
;; @returns ok true on success
(define-public (set-escrows-enabled (enabled bool))
  (begin
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    (var-set escrows-enabled enabled)
    
    (print {
      event: "escrows-enabled-changed",
      enabled: enabled
    })
    
    (ok true)
  )
)

;; ============================================================================
;; PUBLIC FUNCTIONS - ESCROW OPERATIONS
;; ============================================================================

;; Lock funds in escrow for a service
;; Creates a new escrow with STX transferred from caller
;;
;; @param payee: recipient of funds upon release (VPN operator)
;; @param amount: amount to lock (in microSTX)
;; @param service-id: optional reference to service ID
;; @param timeout-blocks: optional custom timeout (defaults to DEFAULT_TIMEOUT_BLOCKS)
;; @returns escrow-id on success
(define-public (lock-escrow
    (payee principal)
    (amount uint)
    (service-id (optional uint))
    (timeout-blocks (optional uint))
  )
  (let
    (
      (payer tx-sender)
      (escrow-id (var-get escrow-nonce))
      (fee (calculate-fee amount))
      (timeout (default-to DEFAULT_TIMEOUT_BLOCKS timeout-blocks))
      (timeout-block (+ stacks-block-height timeout))
      (payer-count (get-payer-count payer))
      (payee-count (get-payee-count payee))
    )
    
    ;; Validate escrows are enabled
    (asserts! (var-get escrows-enabled) ERR_UNAUTHORIZED)
    
    ;; Validate amount is above minimum
    (asserts! (>= amount MIN_ESCROW_AMOUNT) ERR_ZERO_AMOUNT)
    
    ;; Validate payer and payee are different
    (asserts! (not (is-eq payer payee)) ERR_SAME_PARTIES)
    
    ;; Transfer STX from payer to contract
    (try! (stx-transfer? amount payer (as-contract tx-sender)))
    
    ;; Store escrow record
    (map-set escrows
      { escrow-id: escrow-id }
      {
        payer: payer,
        payee: payee,
        amount: amount,
        fee-amount: fee,
        status: ESCROW_STATUS_LOCKED,
        created-at: stacks-block-height,
        timeout-block: timeout-block,
        released-at: none,
        service-id: service-id
      }
    )
    
    ;; Update payer index
    (map-set payer-escrow-index
      { payer: payer, index: payer-count }
      { escrow-id: escrow-id }
    )
    (map-set payer-escrow-count
      { payer: payer }
      { count: (+ payer-count u1) }
    )
    
    ;; Update payee index
    (map-set payee-escrow-index
      { payee: payee, index: payee-count }
      { escrow-id: escrow-id }
    )
    (map-set payee-escrow-count
      { payee: payee }
      { count: (+ payee-count u1) }
    )
    
    ;; Update total value locked
    (var-set total-value-locked (+ (var-get total-value-locked) amount))
    
    ;; Increment nonce
    (var-set escrow-nonce (+ escrow-id u1))
    
    ;; Emit event
    (print {
      event: "escrow-locked",
      escrow-id: escrow-id,
      payer: payer,
      payee: payee,
      amount: amount,
      fee-amount: fee,
      timeout-block: timeout-block,
      service-id: service-id
    })
    
    (ok escrow-id)
  )
)

;; Release escrowed funds to the payee
;; Only the payer can release funds (confirms service completion)
;;
;; @param escrow-id: ID of the escrow to release
;; @returns ok true on success
(define-public (release-escrow (escrow-id uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_NOT_FOUND))
      (payer (get payer escrow))
      (payee (get payee escrow))
      (amount (get amount escrow))
      (fee (get fee-amount escrow))
      (net-amount (- amount fee))
      (status (get status escrow))
    )
    
    ;; Only payer can release
    (asserts! (is-eq tx-sender payer) ERR_UNAUTHORIZED)
    
    ;; Check escrow is in locked state
    (asserts! (is-releasable-state status) ERR_INVALID_STATE)
    
    ;; Transfer net amount to payee
    (try! (as-contract (stx-transfer? net-amount tx-sender payee)))
    
    ;; Transfer fee to fee recipient
    (if (> fee u0)
      (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
      true
    )
    
    ;; Update escrow status
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow {
        status: ESCROW_STATUS_RELEASED,
        released-at: (some stacks-block-height)
      })
    )
    
    ;; Update total value locked
    (var-set total-value-locked (- (var-get total-value-locked) amount))
    
    ;; Emit event
    (print {
      event: "escrow-released",
      escrow-id: escrow-id,
      payee: payee,
      net-amount: net-amount,
      fee-amount: fee
    })
    
    (ok true)
  )
)

;; Refund escrowed funds to the payer
;; Can be called by payee (voluntary refund) or by payer after timeout
;;
;; @param escrow-id: ID of the escrow to refund
;; @returns ok true on success
(define-public (refund-escrow (escrow-id uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_NOT_FOUND))
      (payer (get payer escrow))
      (payee (get payee escrow))
      (amount (get amount escrow))
      (status (get status escrow))
      (timeout-block (get timeout-block escrow))
      (caller tx-sender)
      (is-payer (is-eq caller payer))
      (is-payee (is-eq caller payee))
      (is-owner (is-contract-owner))
    )
    
    ;; Verify caller is authorized
    (asserts! (or is-payer is-payee is-owner) ERR_UNAUTHORIZED)
    
    ;; Check escrow is in refundable state
    (asserts! (is-refundable-state status) ERR_INVALID_STATE)
    
    ;; If payer is calling, must be after timeout
    (if is-payer
      (asserts! (is-expired timeout-block) ERR_ESCROW_NOT_EXPIRED)
      true
    )
    
    ;; Transfer full amount back to payer (no fee on refund)
    (try! (as-contract (stx-transfer? amount tx-sender payer)))
    
    ;; Update escrow status
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow {
        status: ESCROW_STATUS_REFUNDED,
        released-at: (some stacks-block-height)
      })
    )
    
    ;; Update total value locked
    (var-set total-value-locked (- (var-get total-value-locked) amount))
    
    ;; Emit event
    (print {
      event: "escrow-refunded",
      escrow-id: escrow-id,
      payer: payer,
      amount: amount,
      refunded-by: caller
    })
    
    (ok true)
  )
)

;; Cancel an escrow before service begins
;; Only possible in locked state, initiated by payer with payee agreement
;; (For simplicity, payee can cancel voluntarily)
;;
;; @param escrow-id: ID of the escrow to cancel
;; @returns ok true on success
(define-public (cancel-escrow (escrow-id uint))
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_NOT_FOUND))
      (payer (get payer escrow))
      (payee (get payee escrow))
      (amount (get amount escrow))
      (status (get status escrow))
      (caller tx-sender)
    )
    
    ;; Only payee can initiate cancellation (voluntary)
    ;; This protects payee from payer unilaterally cancelling
    (asserts! (is-eq caller payee) ERR_UNAUTHORIZED)
    
    ;; Check escrow is in locked state
    (asserts! (is-eq status ESCROW_STATUS_LOCKED) ERR_INVALID_STATE)
    
    ;; Refund to payer
    (try! (as-contract (stx-transfer? amount tx-sender payer)))
    
    ;; Update escrow status
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow {
        status: ESCROW_STATUS_CANCELLED,
        released-at: (some stacks-block-height)
      })
    )
    
    ;; Update total value locked
    (var-set total-value-locked (- (var-get total-value-locked) amount))
    
    ;; Emit event
    (print {
      event: "escrow-cancelled",
      escrow-id: escrow-id,
      payer: payer,
      amount: amount
    })
    
    (ok true)
  )
)

;; Initiate a dispute on an escrow
;; Either party can initiate a dispute
;;
;; @param escrow-id: ID of the escrow to dispute
;; @param reason: reason for the dispute
;; @returns ok true on success
(define-public (initiate-dispute
    (escrow-id uint)
    (reason (string-ascii 256))
  )
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_NOT_FOUND))
      (payer (get payer escrow))
      (payee (get payee escrow))
      (status (get status escrow))
      (caller tx-sender)
    )
    
    ;; Only payer or payee can initiate dispute
    (asserts! (or (is-eq caller payer) (is-eq caller payee)) ERR_UNAUTHORIZED)
    
    ;; Check escrow is in locked state
    (asserts! (is-eq status ESCROW_STATUS_LOCKED) ERR_INVALID_STATE)
    
    ;; Validate reason is not empty
    (asserts! (> (len reason) u0) ERR_INVALID_INPUT)
    
    ;; Check no existing dispute
    (asserts! (is-none (map-get? disputes { escrow-id: escrow-id })) ERR_ALREADY_EXISTS)
    
    ;; Create dispute record
    (map-set disputes
      { escrow-id: escrow-id }
      {
        initiated-by: caller,
        initiated-at: stacks-block-height,
        reason: reason,
        resolved: false,
        resolution: none
      }
    )
    
    ;; Update escrow status to disputed
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow { status: ESCROW_STATUS_DISPUTED })
    )
    
    ;; Emit event
    (print {
      event: "dispute-initiated",
      escrow-id: escrow-id,
      initiated-by: caller,
      reason: reason
    })
    
    (ok true)
  )
)

;; Resolve a dispute (owner/arbitrator only)
;; Resolution: 1 = favor payer (refund), 2 = favor payee (release)
;;
;; @param escrow-id: ID of the disputed escrow
;; @param resolution: 1 for payer, 2 for payee
;; @returns ok true on success
(define-public (resolve-dispute
    (escrow-id uint)
    (resolution uint)
  )
  (let
    (
      (escrow (unwrap! (map-get? escrows { escrow-id: escrow-id }) ERR_NOT_FOUND))
      (dispute (unwrap! (map-get? disputes { escrow-id: escrow-id }) ERR_NOT_FOUND))
      (payer (get payer escrow))
      (payee (get payee escrow))
      (amount (get amount escrow))
      (fee (get fee-amount escrow))
      (net-amount (- amount fee))
      (status (get status escrow))
    )
    
    ;; Only owner can resolve disputes
    (asserts! (is-contract-owner) ERR_UNAUTHORIZED)
    
    ;; Check escrow is in disputed state
    (asserts! (is-eq status ESCROW_STATUS_DISPUTED) ERR_INVALID_STATE)
    
    ;; Check dispute not already resolved
    (asserts! (not (get resolved dispute)) ERR_INVALID_STATE)
    
    ;; Validate resolution value
    (asserts! (or (is-eq resolution u1) (is-eq resolution u2)) ERR_INVALID_INPUT)
    
    ;; Execute resolution
    (if (is-eq resolution u1)
      ;; Favor payer - full refund
      (try! (as-contract (stx-transfer? amount tx-sender payer)))
      ;; Favor payee - release with fee
      (begin
        (try! (as-contract (stx-transfer? net-amount tx-sender payee)))
        (if (> fee u0)
          (try! (as-contract (stx-transfer? fee tx-sender (var-get fee-recipient))))
          true
        )
      )
    )
    
    ;; Update escrow status
    (map-set escrows
      { escrow-id: escrow-id }
      (merge escrow {
        status: (if (is-eq resolution u1) ESCROW_STATUS_REFUNDED ESCROW_STATUS_RELEASED),
        released-at: (some stacks-block-height)
      })
    )
    
    ;; Update dispute record
    (map-set disputes
      { escrow-id: escrow-id }
      (merge dispute {
        resolved: true,
        resolution: (some resolution)
      })
    )
    
    ;; Update total value locked
    (var-set total-value-locked (- (var-get total-value-locked) amount))
    
    ;; Emit event
    (print {
      event: "dispute-resolved",
      escrow-id: escrow-id,
      resolution: resolution,
      favor: (if (is-eq resolution u1) "payer" "payee")
    })
    
    (ok true)
  )
)

;; ============================================================================
;; READ-ONLY FUNCTIONS
;; ============================================================================

;; Get escrow details by ID
;; @param escrow-id: ID of the escrow
;; @returns escrow record or none
(define-read-only (get-escrow (escrow-id uint))
  (map-get? escrows { escrow-id: escrow-id })
)

;; Get dispute details by escrow ID
;; @param escrow-id: ID of the escrow
;; @returns dispute record or none
(define-read-only (get-dispute (escrow-id uint))
  (map-get? disputes { escrow-id: escrow-id })
)

;; Get current escrow nonce (total escrows created)
;; @returns current nonce
(define-read-only (get-escrow-nonce)
  (var-get escrow-nonce)
)

;; Get total value locked in escrow
;; @returns total STX locked
(define-read-only (get-total-value-locked)
  (var-get total-value-locked)
)

;; Get contract owner
;; @returns owner principal
(define-read-only (get-contract-owner)
  (var-get contract-owner)
)

;; Get fee recipient
;; @returns fee recipient principal
(define-read-only (get-fee-recipient)
  (var-get fee-recipient)
)

;; Check if escrows are enabled
;; @returns true if enabled
(define-read-only (are-escrows-enabled)
  (var-get escrows-enabled)
)

;; Get escrow count for a payer
;; @param payer: payer principal
;; @returns count
(define-read-only (get-payer-escrow-count (payer principal))
  (get-payer-count payer)
)

;; Get escrow count for a payee
;; @param payee: payee principal
;; @returns count
(define-read-only (get-payee-escrow-count (payee principal))
  (get-payee-count payee)
)

;; Get payer's escrow by index
;; @param payer: payer principal
;; @param index: index in payer's escrow list
;; @returns escrow record or none
(define-read-only (get-payer-escrow-by-index (payer principal) (index uint))
  (match (map-get? payer-escrow-index { payer: payer, index: index })
    record (get-escrow (get escrow-id record))
    none
  )
)

;; Get payee's escrow by index
;; @param payee: payee principal
;; @param index: index in payee's escrow list
;; @returns escrow record or none
(define-read-only (get-payee-escrow-by-index (payee principal) (index uint))
  (match (map-get? payee-escrow-index { payee: payee, index: index })
    record (get-escrow (get escrow-id record))
    none
  )
)

;; Calculate platform fee for a given amount
;; @param amount: amount to calculate fee for
;; @returns fee amount
(define-read-only (calculate-platform-fee (amount uint))
  (calculate-fee amount)
)

;; Check if an escrow has expired
;; @param escrow-id: ID of the escrow
;; @returns true if expired, false otherwise
(define-read-only (is-escrow-expired (escrow-id uint))
  (match (map-get? escrows { escrow-id: escrow-id })
    escrow (is-expired (get timeout-block escrow))
    false
  )
)

;; Get escrow status as human-readable string
;; @param escrow-id: ID of the escrow
;; @returns status string or none
(define-read-only (get-escrow-status-name (escrow-id uint))
  (match (map-get? escrows { escrow-id: escrow-id })
    escrow 
      (let ((status (get status escrow)))
        (if (is-eq status ESCROW_STATUS_LOCKED)
          (some "locked")
          (if (is-eq status ESCROW_STATUS_RELEASED)
            (some "released")
            (if (is-eq status ESCROW_STATUS_REFUNDED)
              (some "refunded")
              (if (is-eq status ESCROW_STATUS_DISPUTED)
                (some "disputed")
                (if (is-eq status ESCROW_STATUS_CANCELLED)
                  (some "cancelled")
                  none
                )
              )
            )
          )
        )
      )
    none
  )
)

;; Get escrow constants for frontend integration
;; @returns tuple with constants
(define-read-only (get-escrow-constants)
  {
    min-escrow-amount: MIN_ESCROW_AMOUNT,
    default-timeout-blocks: DEFAULT_TIMEOUT_BLOCKS,
    platform-fee-bps: PLATFORM_FEE_BPS,
    status-locked: ESCROW_STATUS_LOCKED,
    status-released: ESCROW_STATUS_RELEASED,
    status-refunded: ESCROW_STATUS_REFUNDED,
    status-disputed: ESCROW_STATUS_DISPUTED,
    status-cancelled: ESCROW_STATUS_CANCELLED
  }
)
