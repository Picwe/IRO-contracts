# Low-Risk Asset (IRO) Investment Platform

This project is the smart contract component of the low-risk asset (R1-R2) investment platform, used for managing RWA asset investments and profit distribution.

## Development Environment

- Node.js
- Yarn
- Hardhat
- Solidity 0.8.25

## Installation

```bash
yarn install
```

## Compile Contracts

```bash
npx hardhat compile
```

## Run Tests

```bash
npx hardhat test
```

## Deploy Contracts

```bash
npx hardhat run scripts/deploy/deploy.js --network <network_name>
```

## Directory Structure

- `contracts/`: Contract code
  - `core/`: Core contracts
  - `interfaces/`: Interface definitions
  - `utils/`: Utility contracts
- `test/`: Test code
  - `unit/`: Unit tests
  - `integration/`: Integration tests
- `scripts/`: Script code
  - `deploy/`: Deployment scripts
