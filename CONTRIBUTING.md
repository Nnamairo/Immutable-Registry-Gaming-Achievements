# Contributing to Peer-to-Peer Decentralized VPN Marketplace

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for contributing.

## Code of Conduct

We are committed to providing a welcoming and inclusive environment for all contributors. Please be respectful and constructive in all interactions.

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- Clarinet 2.0.0 or higher
- Git
- Basic understanding of Clarity smart contracts
- Familiarity with TypeScript/JavaScript

### Setup Development Environment

```bash
# Clone your fork
git clone https://github.com/yourusername/Peer-to-Peer-Decentralized-VPN-Marketplace.git
cd Peer-to-Peer-Decentralized-VPN-Marketplace

# Add upstream remote
git remote add upstream https://github.com/original/Peer-to-Peer-Decentralized-VPN-Marketplace.git

# Install dependencies
npm install

# Verify setup
npm test
```

## Development Workflow

### Creating a Feature Branch

```bash
# Update main branch
git checkout main
git pull upstream main

# Create feature branch
git checkout -b feature/your-feature-name
```

### Branch Naming Conventions

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions

### Making Changes

#### Smart Contract Changes

1. Create or modify `.clar` files in `contracts/`
2. Follow Clarity style guide:
   - Use kebab-case for function names
   - Use UPPER_CASE for constants
   - Document all public functions
   - Use meaningful variable names

3. Write comprehensive tests in `tests/`
4. Run tests: `npm test`
5. Check gas costs: `npm run test:report`

#### Example Clarity Function

```clarity
;; Register a new VPN node
;; @param bandwidth - Node bandwidth in Mbps
;; @param location - Node location (string-ascii 50)
;; @param price-per-hour - Price in microSTX per hour
;; @param collateral - Collateral deposit in microSTX
;; @returns node-id on success, error code on failure
(define-public (register-node
  (bandwidth uint)
  (location (string-ascii 50))
  (price-per-hour uint)
  (collateral uint))
  ;; Implementation
)
```

#### Test Changes

1. Create test files in `tests/` directory
2. Use Vitest and Clarinet SDK
3. Follow naming convention: `feature.test.ts`
4. Aim for 100% code coverage

Example test:

```typescript
import { describe, it, expect } from "vitest";

describe("Feature Name", () => {
  it("should perform expected behavior", () => {
    const result = simnet.callPublicFn(
      "contract-name",
      "function-name",
      [/* args */],
      "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTCE693"
    );
    expect(result.result).toBeOk();
  });
});
```

### Commit Guidelines

Write clear, descriptive commit messages:

```bash
# Good
git commit -m "feat: add node reputation decay mechanism"
git commit -m "fix: correct escrow payment calculation"
git commit -m "test: add integration tests for service purchase"
git commit -m "docs: update README with deployment instructions"

# Avoid
git commit -m "fix stuff"
git commit -m "update"
git commit -m "WIP"
```

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

**Type**: feat, fix, docs, style, refactor, test, chore  
**Subject**: Imperative, present tense, no period  
**Body**: Explain what and why, not how  
**Footer**: Reference issues (Fixes #123)

## Testing Requirements

### Before Submitting a Pull Request

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:report

# Run tests in watch mode during development
npm run test:watch
```

### Test Coverage Requirements

- Minimum 80% code coverage
- 100% coverage for critical functions
- All error paths tested
- Edge cases covered

### Running Specific Tests

```bash
# Run single test file
npm test -- marketplace.test.ts

# Run tests matching pattern
npm test -- --grep "register-node"

# Run with coverage
npm test -- --coverage
```

## Code Style

### Clarity Style Guide

- Use 2-space indentation
- Use kebab-case for function names
- Use UPPER_CASE for constants
- Use descriptive variable names
- Add comments for complex logic
- Document all public functions

### TypeScript Style Guide

- Use 2-space indentation
- Use camelCase for variables and functions
- Use PascalCase for classes and types
- Use const by default
- Add type annotations
- Use meaningful names

### Linting

```bash
# Check code style (if linter configured)
npm run lint

# Fix style issues
npm run lint:fix
```

## Documentation

### Code Documentation

- Document all public functions
- Include parameter descriptions
- Include return value descriptions
- Add examples for complex functions

### README Updates

Update README.md if your changes:
- Add new features
- Change installation process
- Modify project structure
- Add new dependencies

### Commit Documentation

Include in commit message:
- What changed
- Why it changed
- How to test it

## Pull Request Process

### Before Submitting

1. Update your branch with latest main:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. Run all tests:
   ```bash
   npm test
   npm run test:report
   ```

3. Verify code style and documentation

4. Update CHANGELOG.md if applicable

### Creating a Pull Request

1. Push your branch:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create PR on GitHub with:
   - Clear title describing changes
   - Description of what changed and why
   - Reference to related issues
   - Screenshots/examples if applicable

3. PR Template:
   ```markdown
   ## Description
   Brief description of changes

   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Breaking change
   - [ ] Documentation update

   ## Testing
   How to test these changes

   ## Checklist
   - [ ] Tests pass
   - [ ] Code coverage maintained
   - [ ] Documentation updated
   - [ ] No breaking changes
   ```

### PR Review Process

- Maintainers will review within 48 hours
- Address feedback and push updates
- Rebase and squash commits if requested
- PR will be merged once approved

## Reporting Issues

### Bug Reports

Include:
- Clear description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (OS, Node version, etc.)
- Error messages or logs

### Feature Requests

Include:
- Clear description of the feature
- Use case and motivation
- Proposed implementation (if applicable)
- Examples or mockups

### Security Issues

Do NOT create public issues for security vulnerabilities. Email security@example.com instead.

## Project Structure Guidelines

### Adding New Contracts

1. Create contract file in `contracts/`
2. Follow naming convention: `feature-name.clar`
3. Create corresponding test file: `tests/feature-name.test.ts`
4. Update Clarinet.toml if needed
5. Document in README.md

### Adding New Tests

1. Create test file in `tests/`
2. Use naming convention: `feature.test.ts`
3. Group related tests with `describe()`
4. Use descriptive test names
5. Aim for 100% coverage

## Performance Considerations

### Gas Optimization

- Minimize storage operations
- Use read-only functions for queries
- Batch operations where possible
- Profile execution costs: `npm run test:report`

### Code Efficiency

- Avoid unbounded loops
- Use efficient data structures
- Cache frequently accessed data
- Profile performance regularly

## Security Considerations

### Smart Contract Security

- Follow checks-effects-interactions pattern
- Implement access control
- Prevent reentrancy
- Validate all inputs
- Use safe arithmetic

### Code Review

- All code requires review before merge
- Security-critical code requires additional review
- Automated tests must pass
- Coverage requirements must be met

## Release Process

### Version Numbering

Follow Semantic Versioning (MAJOR.MINOR.PATCH):
- MAJOR: Breaking changes
- MINOR: New features
- PATCH: Bug fixes

### Release Checklist

- [ ] All tests passing
- [ ] Coverage requirements met
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
- [ ] Version bumped
- [ ] Git tag created
- [ ] Release notes written

## Getting Help

- Check existing documentation
- Search closed issues
- Ask in discussions
- Join Stacks community Discord
- Email maintainers

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes
- Project documentation

Thank you for contributing!

---

**Last Updated**: October 23, 2025

