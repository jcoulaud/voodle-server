![BETA Badge](https://img.shields.io/badge/status-BETA-yellow)
![APACHE 2.0 License](https://img.shields.io/badge/license-APACHE%202.0-green.svg)
[![X Follow](https://img.shields.io/twitter/follow/JulienCoulaud?style=social)](https://twitter.com/JulienCoulaud)

# Voodle: Crypto trading platform on TON blockchain (Backend)

Voodle is a trading platform where users can create strategies to automatically buy and sell tokens on the TON blockchain, without the need for technical knowledge.

## Disclaimer

This is my first time open-sourcing a project, so I appreciate your patience as I work through any issues. Since I didn’t originally plan to open-source this, the code could be better documented and cleaned up. Improvements are on the way!

The frontend and backend are separated into two repositories:

- [Frontend](https://github.com/jcoulaud/voodle-client)
- [Backend](https://github.com/jcoulaud/voodle-server)

## ⚠️ Status: Working with known issues

Voodle is still under active development and is not fully functional yet. Please use it **at your own risk**.

### Some known issues

- The **trading engine** is operational but needs further work to handle edge cases, especially around concurrency, error handling, and low balance scenarios.
- **Platform fees** are correctly applied on buys, but sometimes not applied on sells (this is a known issue and will be fixed). These fees are separate from blockchain transaction costs and are how the platform generates revenue.
- No **tests** yet!

### Areas for Improvement

There's a lot of room for optimization, particularly in the way strategies are matched against tokens. Currently, each strategy is checked against every existing token on the blockchain, which is inefficient and time-consuming. Planned optimizations include:

- Checking only tokens that have changed since the last trading engine cycle.
- Implementing a **Priority Queue System**.
- Introducing **Batch Processing**.
- Utilizing **Caching** and **Memoization**.
- Improving **Database performance**.
- Transitioning to an **Event-Driven Update** system.

The frontend design needs to be improved.

## Features

- User authentication with magic link
- Real-time trading engine
- Strategy management
- Token and pool tracking
- Transaction history
- Wallet integration
- Multi-DEX support (DeDust and StonFi)

## Tech Stack

- **Backend**: NestJS with GraphQL
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: JWT
- **Blockchain Integration**: TON SDK
- **API Integrations**: TON API, DeDust API, StonFi API

## Getting Started

### Prerequisites

- Node.js (v18.17.1 or later)
- pnpm
- PostgreSQL

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/jcoulaud/voodle-server.git
   cd voodle-server
   ```

2. Install dependencies:

   ```
   pnpm install
   ```

3. Set up environment variables:

   - Copy `.env.example` to `.env` and fill in the required values.
   - Generate the secret keys with `openssl rand 60 | openssl base64 -A`

4. Run database migrations:

   ```
   pnpm run db:migrate
   ```

5. Start the development server:

   ```
   pnpm run start:dev
   ```

6. Start the pool manager (updates token pool information in the database):

   ```
   pnpm run start:pool
   ```

7. Start the trading engine (checking for new strategies to execute):

   ```
   pnpm run start:trading
   ```

8. Start the frontend:

   To run the frontend application, please refer to the [Voodle Frontend Repository](https://github.com/jcoulaud/voodle-client) for installation and setup instructions.

## Project Structure

- `src/`: Source code
  - `db/`: Database related files (migrations, schema)
  - `graphql/`: GraphQL resolvers and type definitions
  - `services/`: Business logic and services
  - `helpers/`: Utility functions
  - `types/`: TypeScript type definitions
  - `emails/`: Email templates

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the [AGPLv3 license](./LICENSE) - see the [LICENSE](./LICENSE) file for details.
