# Peer-to-Peer Decentralized VPN Marketplace

A blockchain-based marketplace built on Stacks Layer 2 that enables individuals to monetize their internet bandwidth by operating VPN nodes while allowing users to purchase VPN services in a trustless, decentralized manner.

## Overview

This project leverages the Stacks blockchain and Clarity smart contracts to create a peer-to-peer VPN marketplace with:

- Decentralized infrastructure without central authority
- Smart contract-enforced escrow and payment processing
- On-chain reputation system for accountability
- Bitcoin-backed security through Stacks Layer 2
- STX and sBTC payment support
- Trustless dispute resolution

For detailed product requirements, see [PRD-Peer-to-Peer-Decentralized-VPN-Marketplace.md](./PRD-Peer-to-Peer-Decentralized-VPN-Marketplace.md).

## Key Features

- **Node Registration**: VPN operators register with system specifications and collateral deposit
- **Service Marketplace**: Users browse and purchase VPN services by location, price, and reputation
- **Escrow Payments**: Smart contracts hold payments until service completion
- **Reputation System**: On-chain scoring tracks operator and user reliability
- **Dispute Resolution**: Automated and community-based dispute handling
- **Bitcoin Integration**: sBTC support for Bitcoin-backed transactions
- **Transparent Pricing**: All fees and rates visible on-chain

## Architecture Overview

### Technology Stack

**Blockchain Layer**
- Stacks Layer 2 (Bitcoin-backed)
- Proof of Transfer (PoX) consensus
- sBTC for Bitcoin integration

**Smart Contracts**
- Clarity 2.0+ language
- Core contracts: Marketplace, Reputation, Escrow, Node Registry
- Trait-based design for extensibility

**Frontend** (Planned)
- Next.js 14+
- React with TypeScript
- Stacks.js wallet integration
- Tailwind CSS

**Backend** (Planned)
- Node.js with TypeScript
- Express/Hono API
- PostgreSQL database
- Redis caching

**Development Tools**
- Clarinet for local contract development
- Vitest for testing
- Stacks.js SDK

### System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                   │
│         Wallet Integration | Node Discovery             │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                  Backend API (Node.js)                  │
│    Node Management | Service Processing | Reputation   │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│            Stacks Layer 2 Smart Contracts               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Marketplace │  │  Reputation  │  │   Escrow     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Bitcoin (Settlement Layer)                 │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Software

- Node.js 18.0.0 or higher
- npm 9.0.0 or higher (or yarn/pnpm)
- Git

### Stacks Development Tools

- Clarinet 2.0.0 or higher (for smart contract development)
- Stacks Wallet or Leather Wallet (for testnet interaction)

### Knowledge Requirements

- Basic understanding of blockchain concepts
- Familiarity with Clarity smart contract language
- Experience with TypeScript/JavaScript
- Understanding of REST APIs

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/Peer-to-Peer-Decentralized-VPN-Marketplace.git
cd Peer-to-Peer-Decentralized-VPN-Marketplace

# Install Clarinet (if not already installed)
# macOS
brew install clarinet

# Linux/Windows - Download from https://github.com/hirosystems/clarinet/releases

# Install Node.js dependencies
npm install

# Verify installation
clarinet --version
npm --version
node --version
```

## Project Structure

```
.
├── contracts/                          # Clarity smart contracts
│   ├── vpn-marketplace.clar           # Main marketplace contract
│   ├── reputation.clar                # Reputation management
│   ├── escrow.clar                    # Payment escrow
│   ├── node-registry.clar             # VPN node registry
│   └── traits/                        # Contract interfaces
│       ├── payment-trait.clar
│       └── reputation-trait.clar
├── tests/                              # Test files
│   ├── marketplace.test.ts            # Marketplace tests
│   ├── reputation.test.ts             # Reputation tests
│   ├── escrow.test.ts                 # Escrow tests
│   └── integration.test.ts            # Integration tests
├── settings/                           # Network configurations
│   ├── Devnet.toml                    # Local development
│   ├── Testnet.toml                   # Stacks testnet
│   └── Mainnet.toml                   # Stacks mainnet
├── Clarinet.toml                      # Clarinet project config
├── package.json                       # Node.js dependencies
├── tsconfig.json                      # TypeScript config
├── vitest.config.js                   # Vitest configuration
├── PRD-Peer-to-Peer-Decentralized-VPN-Marketplace.md
├── RESEARCH-Stacks-Clarity-VPN-Marketplace.md
├── IMPLEMENTATION-GUIDE-Smart-Contracts.md
└── README.md                          # This file
```

## Smart Contracts

### Core Contracts

**VPN Marketplace Contract** (`vpn-marketplace.clar`)
- Node registration and management
- Service purchase and completion
- Rating system
- Dispute initiation

**Reputation Contract** (`reputation.clar`)
- Reputation score calculation
- Score updates and decay
- Slashing for malicious behavior
- Recovery mechanisms

**Escrow Contract** (`escrow.clar`)
- Payment locking and release
- Refund handling
- Dispute holds
- Atomic settlement

**Node Registry Contract** (`node-registry.clar`)
- Node metadata storage
- Availability tracking
- Specification management
- Status updates

### Contract Interactions

```
User Purchase Flow:
1. User calls marketplace.purchase-service()
2. Escrow contract locks payment
3. Node operator provides service
4. User calls marketplace.complete-service()
5. Escrow releases payment to operator
6. Reputation updated for both parties
```

## Development

### Local Development Setup

```bash
# Start Clarinet REPL for interactive development
clarinet console

# In the REPL, you can test contracts interactively
(contract-call? .vpn-marketplace register-node u1000 "US-East" u100 u5000)
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run tests with coverage and gas cost analysis
npm run test:report
```

### Test Structure

Tests are organized by contract:

```bash
tests/
├── marketplace.test.ts      # Tests for marketplace functions
├── reputation.test.ts       # Tests for reputation system
├── escrow.test.ts          # Tests for escrow mechanics
└── integration.test.ts      # End-to-end workflow tests
```

### Writing Tests

Example test using Vitest and Clarinet SDK:

```typescript
import { describe, it, expect } from "vitest";

describe("VPN Marketplace", () => {
  it("should register a new VPN node", () => {
    const result = simnet.callPublicFn(
      "vpn-marketplace",
      "register-node",
      [Cl.uint(1000), Cl.stringAscii("US-East"), Cl.uint(100), Cl.uint(5000)],
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTCE693"
    );
    expect(result.result).toBeOk();
  });
});
```

## Deployment

### Testnet Deployment

```bash
# Deploy to Stacks testnet
clarinet deployments generate --testnet

# Verify deployment
clarinet deployments list
```

### Mainnet Deployment

```bash
# Generate mainnet deployment
clarinet deployments generate --mainnet

# Review deployment plan
cat deployments/mainnet.json

# Execute deployment (requires sufficient STX for fees)
clarinet deployments apply --mainnet
```

### Deployment Checklist

- [ ] All contracts compile without errors
- [ ] 100% test coverage achieved
- [ ] Security audit completed
- [ ] Gas costs optimized
- [ ] Error codes documented
- [ ] Access control verified
- [ ] Emergency pause implemented
- [ ] Multi-sig governance setup
- [ ] Testnet deployment successful

## Usage

### As a VPN Node Operator

1. Connect Stacks wallet to marketplace
2. Register as node operator with specifications
3. Deposit collateral (STX)
4. Configure pricing and bandwidth allocation
5. Start accepting connections
6. Monitor reputation and earnings

### As a VPN User

1. Connect Stacks wallet to marketplace
2. Browse available VPN nodes
3. Filter by location, price, and reputation
4. Select node and purchase service package
5. Receive VPN credentials
6. Connect and use service
7. Rate node operator after session

## Testing Strategy

### Unit Tests

Test individual contract functions:

```bash
npm test -- marketplace.test.ts
```

### Integration Tests

Test complete workflows:

```bash
npm test -- integration.test.ts
```

### Gas Analysis

Analyze contract execution costs:

```bash
npm run test:report
```

### Coverage Reports

Generate coverage reports:

```bash
npm run test:report -- --coverage
```

## Security

### Security Audit

This project requires professional security audits before mainnet deployment. Recommended auditors:
- CertiK
- Halborn
- Trail of Bits

### Security Best Practices

- All smart contracts follow checks-effects-interactions pattern
- Access control verified for all state-changing functions
- Reentrancy protection implemented
- Integer overflow/underflow prevented by Clarity
- Emergency pause mechanism for critical functions
- Multi-sig governance for upgrades

### Reporting Security Issues

Please report security vulnerabilities to security@example.com rather than using the issue tracker.

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Write tests for all new functionality
- Ensure 100% test coverage
- Follow Clarity style guide
- Document all public functions
- Update README for significant changes

## License

This project is licensed under the ISC License - see LICENSE file for details.

## Resources

### Official Documentation

- [Stacks Documentation](https://docs.stacks.co)
- [Clarity Language Reference](https://docs.stacks.co/reference/functions)
- [Clarity Book](https://book.clarity-lang.org)
- [Stacks GitHub](https://github.com/stacks-network)

### Development Tools

- [Clarinet](https://github.com/hirosystems/clarinet)
- [Stacks.js SDK](https://github.com/stacks-network/stacks.js)
- [Hiro Wallet](https://wallet.hiro.so)
- [Stacks Explorer](https://explorer.stacks.co)

### Security Resources

- [CertiK Clarity Best Practices](https://www.certik.com/resources/blog/clarity-best-practices-and-checklist)
- [Halborn Clarity Security](https://www.halborn.com/blog/post/understanding-clarity-the-future-of-secure-smart-contracts)
- [OpenZeppelin Readiness Guide](https://www.openzeppelin.com/readiness-guide)

### Project Documentation

- [Product Requirements Document](./PRD-Peer-to-Peer-Decentralized-VPN-Marketplace.md)
- [Research Summary](./RESEARCH-SUMMARY.md)
- [Stacks & Clarity Research](./RESEARCH-Stacks-Clarity-VPN-Marketplace.md)
- [Implementation Guide](./IMPLEMENTATION-GUIDE-Smart-Contracts.md)

## Support

For questions and support:

- Open an issue on GitHub
- Join the Stacks community Discord
- Check existing documentation

## Roadmap

**Phase 1: Foundation** (Weeks 1-4)
- Smart contract development
- Core API endpoints
- Basic UI components

**Phase 2: MVP** (Weeks 5-8)
- Node registration system
- Service marketplace
- Testnet deployment

**Phase 3: Enhancement** (Weeks 9-12)
- Reputation system
- Dispute resolution
- Performance optimization

**Phase 4: Launch** (Weeks 13-16)
- Security audit
- Mainnet deployment
- Community building

---

**Project Status**: In Development  
**Last Updated**: October 23, 2025  
**Version**: 1.0.0-alpha

