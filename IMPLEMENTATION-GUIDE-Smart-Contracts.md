# Implementation Guide: Smart Contracts for VPN Marketplace

---

## 1. Project Structure

```
contracts/
├── vpn-marketplace.clar       # Main marketplace contract
├── reputation.clar            # Reputation management
├── escrow.clar               # Payment escrow
├── node-registry.clar        # VPN node registry
└── traits/
    ├── payment-trait.clar    # Payment interface
    └── reputation-trait.clar # Reputation interface
```

---

## 2. Core Contract: VPN Marketplace

### 2.1 Data Structures

```clarity
;; Node registration
(define-map nodes
  { node-id: uint }
  {
    operator: principal,
    bandwidth: uint,
    location: (string-ascii 50),
    price-per-hour: uint,
    collateral: uint,
    status: (string-ascii 20),
    created-at: uint,
    rating: uint
  }
)

;; Service purchases
(define-map services
  { service-id: uint }
  {
    node-id: uint,
    buyer: principal,
    duration-hours: uint,
    total-cost: uint,
    status: (string-ascii 20),
    started-at: uint,
    completed-at: (optional uint),
    rating: (optional uint)
  }
)

;; Counters
(define-data-var next-node-id uint u0)
(define-data-var next-service-id uint u0)
```

### 2.2 Node Registration

```clarity
(define-public (register-node
  (bandwidth uint)
  (location (string-ascii 50))
  (price-per-hour uint)
  (collateral uint))
  (let ((node-id (var-get next-node-id)))
    (asserts! (> collateral u0) (err u1))
    (asserts! (> price-per-hour u0) (err u2))
    
    ;; Transfer collateral from operator
    (try! (stx-transfer? collateral tx-sender (as-contract tx-sender)))
    
    ;; Register node
    (map-set nodes
      { node-id: node-id }
      {
        operator: tx-sender,
        bandwidth: bandwidth,
        location: location,
        price-per-hour: price-per-hour,
        collateral: collateral,
        status: "active",
        created-at: block-height,
        rating: u50
      }
    )
    
    (var-set next-node-id (+ node-id u1))
    (ok node-id)
  )
)
```

### 2.3 Service Purchase

```clarity
(define-public (purchase-service
  (node-id uint)
  (duration-hours uint))
  (let (
    (node (unwrap! (map-get? nodes { node-id: node-id }) (err u3)))
    (total-cost (* (get price-per-hour node) duration-hours))
    (service-id (var-get next-service-id))
  )
    (asserts! (is-eq (get status node) "active") (err u4))
    (asserts! (> duration-hours u0) (err u5))
    
    ;; Lock payment in escrow
    (try! (stx-transfer? total-cost tx-sender (as-contract tx-sender)))
    
    ;; Create service record
    (map-set services
      { service-id: service-id }
      {
        node-id: node-id,
        buyer: tx-sender,
        duration-hours: duration-hours,
        total-cost: total-cost,
        status: "active",
        started-at: block-height,
        completed-at: none,
        rating: none
      }
    )
    
    (var-set next-service-id (+ service-id u1))
    (ok service-id)
  )
)
```

### 2.4 Service Completion

```clarity
(define-public (complete-service (service-id uint))
  (let (
    (service (unwrap! (map-get? services { service-id: service-id }) (err u6)))
    (node (unwrap! (map-get? nodes { node-id: (get node-id service) }) (err u3)))
  )
    (asserts! (is-eq tx-sender (get buyer service)) (err u7))
    (asserts! (is-eq (get status service) "active") (err u8))
    
    ;; Release payment to operator
    (try! (as-contract (stx-transfer?
      (get total-cost service)
      (as-contract tx-sender)
      (get operator node)
    )))
    
    ;; Update service status
    (map-set services
      { service-id: service-id }
      (merge service {
        status: "completed",
        completed-at: (some block-height)
      })
    )
    
    (ok true)
  )
)
```

### 2.5 Rating System

```clarity
(define-public (rate-service
  (service-id uint)
  (rating uint))
  (let (
    (service (unwrap! (map-get? services { service-id: service-id }) (err u6)))
    (node (unwrap! (map-get? nodes { node-id: (get node-id service) }) (err u3)))
  )
    (asserts! (is-eq tx-sender (get buyer service)) (err u7))
    (asserts! (is-eq (get status service) "completed") (err u9))
    (asserts! (<= rating u100) (err u10))
    (asserts! (is-none (get rating service)) (err u11))
    
    ;; Update service rating
    (map-set services
      { service-id: service-id }
      (merge service { rating: (some rating) })
    )
    
    ;; Update node rating (weighted average)
    (let ((new-rating (/ (+ (get rating node) rating) u2)))
      (map-set nodes
        { node-id: (get node-id service) }
        (merge node { rating: new-rating })
      )
    )
    
    (ok true)
  )
)
```

---

## 3. Reputation Contract

### 3.1 Reputation Map

```clarity
(define-map reputation
  { principal: principal }
  {
    score: uint,
    total-transactions: uint,
    successful-transactions: uint,
    disputes-lost: uint,
    last-updated: uint
  }
)

(define-constant INITIAL-SCORE u50)
(define-constant SUCCESS-BONUS u5)
(define-constant DISPUTE-PENALTY u10)
(define-constant SLASH-PENALTY u20)
```

### 3.2 Update Reputation

```clarity
(define-public (update-reputation
  (principal-addr principal)
  (transaction-success bool))
  (let (
    (current (default-to
      {
        score: INITIAL-SCORE,
        total-transactions: u0,
        successful-transactions: u0,
        disputes-lost: u0,
        last-updated: block-height
      }
      (map-get? reputation { principal: principal-addr })
    ))
    (new-score (if transaction-success
      (+ (get score current) SUCCESS-BONUS)
      (- (get score current) DISPUTE-PENALTY)
    ))
  )
    (map-set reputation
      { principal: principal-addr }
      {
        score: (if (> new-score u100) u100 new-score),
        total-transactions: (+ (get total-transactions current) u1),
        successful-transactions: (if transaction-success
          (+ (get successful-transactions current) u1)
          (get successful-transactions current)
        ),
        disputes-lost: (if transaction-success
          (get disputes-lost current)
          (+ (get disputes-lost current) u1)
        ),
        last-updated: block-height
      }
    )
    (ok true)
  )
)
```

---

## 4. Escrow Contract

### 4.1 Escrow State

```clarity
(define-map escrow-accounts
  { service-id: uint }
  {
    amount: uint,
    payer: principal,
    payee: principal,
    status: (string-ascii 20),
    created-at: uint
  }
)
```

### 4.2 Lock & Release

```clarity
(define-public (lock-escrow
  (service-id uint)
  (amount uint)
  (payee principal))
  (begin
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    (map-set escrow-accounts
      { service-id: service-id }
      {
        amount: amount,
        payer: tx-sender,
        payee: payee,
        status: "locked",
        created-at: block-height
      }
    )
    (ok true)
  )
)

(define-public (release-escrow (service-id uint))
  (let ((escrow (unwrap! (map-get? escrow-accounts { service-id: service-id }) (err u12))))
    (asserts! (is-eq (get status escrow) "locked") (err u13))
    (try! (as-contract (stx-transfer?
      (get amount escrow)
      (as-contract tx-sender)
      (get payee escrow)
    )))
    (map-set escrow-accounts
      { service-id: service-id }
      (merge escrow { status: "released" })
    )
    (ok true)
  )
)
```

---

## 5. Testing Strategy

### 5.1 Unit Tests (Clarinet)

```bash
# Run tests
clarinet test

# Test coverage
clarinet test --coverage
```

### 5.2 Test Cases

- [ ] Node registration with valid collateral
- [ ] Node registration with insufficient collateral
- [ ] Service purchase with active node
- [ ] Service purchase with inactive node
- [ ] Service completion and payment release
- [ ] Rating system updates
- [ ] Reputation calculation
- [ ] Escrow lock and release
- [ ] Error handling for all functions

### 5.3 Gas Analysis

```bash
# Analyze gas costs
clarinet check
```

---

## 6. Deployment Checklist

- [ ] All contracts compile without errors
- [ ] 100% test coverage achieved
- [ ] Security audit completed
- [ ] Gas costs optimized
- [ ] Error codes documented
- [ ] Access control verified
- [ ] Emergency pause implemented
- [ ] Multi-sig governance setup
- [ ] Testnet deployment successful
- [ ] Mainnet deployment ready

---

## 7. Common Pitfalls to Avoid

1. **Reentrancy:** Always use checks-effects-interactions
2. **Access Control:** Verify tx-sender for all state changes
3. **Overflow:** Clarity prevents this, but validate inputs
4. **Unbounded Loops:** Avoid loops over user-provided data
5. **Front-Running:** Use commit-reveal for sensitive operations
6. **Timestamp Dependence:** Use block-height instead of timestamps

---

**Document Version:** 1.0  
**Last Updated:** October 23, 2025  
**Status:** Ready for Development

