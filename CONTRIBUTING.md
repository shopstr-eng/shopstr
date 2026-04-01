# Contributing to Milk Market

Welcome to Milk Market! 🛒⚡ We're excited to have you contribute to our global, permissionless marketplace for milk-first commerce.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Fork and Clone](#fork-and-clone)
3. [Local Development Setup](#local-development-setup)
4. [Repository Structure](#repository-structure)
5. [Development Workflow](#development-workflow)
6. [Code Quality Standards](#code-quality-standards)
7. [Testing](#testing)
8. [Creating a Pull Request](#creating-a-pull-request)
9. [Docker Development](#docker-development)

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js**: Version 20.0.0 or higher
- **pnpm**: Version 9.15.9 or higher
- **Git**: Latest version
- **Mobile Development (Optional)**:
  - **Xcode** on macOS for the iOS Simulator
  - **Android Studio** for the Android Emulator
  - or a physical iOS/Android device for an Expo development build
- **Docker** (optional, for containerized development)

### Check Your Versions

```bash
node --version  # Should be >=20.0.0
pnpm --version  # Should be >=9.15.9
git --version
```

## Fork and Clone

### 1. Fork the Repository

1. Visit [https://github.com/shopstr-eng/milk-market](https://github.com/shopstr-eng/milk-market)
2. Click the "Fork" button in the top-right corner
3. Select your GitHub account to create the fork

### 2. Clone Your Fork

```bash
# Clone your forked repository
git clone https://github.com/YOUR-USERNAME/milk-market.git

# Navigate to the project directory
cd milk-market

# Add the original repository as upstream
git remote add upstream https://github.com/shopstr-eng/milk-market.git

# Verify remotes
git remote -v
```

You should see:

```
origin    https://github.com/YOUR-USERNAME/milk-market.git (fetch)
origin    https://github.com/YOUR-USERNAME/milk-market.git (push)
upstream  https://github.com/shopstr-eng/milk-market.git (fetch)
upstream  https://github.com/shopstr-eng/milk-market.git (push)
```

## Local Development Setup

### 1. Install Dependencies

```bash
# Install all project dependencies
pnpm install
```

> **Note**: This repository now uses `pnpm` workspaces with a single `pnpm-lock.yaml` file.

### 2. Start Development Server

```bash
# Start the website development server
pnpm run dev:web
```

### 3. Start Mobile Development (Optional)

```bash
# Start the Expo development server
pnpm run dev:mobile
```

In the Expo terminal:

- Press `i` to open the iOS simulator
- Press `w` to open the web preview

### 4. Database Setup

This application requires a PostgreSQL database. You can run it locally using Docker Compose:

1. Start PostgreSQL:

   ```bash
   docker-compose up -d
   ```

2. Create a `.env` file in the root directory with the following:

   ```
   DATABASE_URL=postgresql://milkmarket:milkmarket@localhost:5432/milkmarket
   ```

3. The database tables will be automatically created on first connection.

4. To stop the database:

   ```bash
   docker-compose down
   ```

5. To remove all data and start fresh:
   ```bash
   docker-compose down -v
   ```

The website will be available at `http://localhost:5000`

### 5. Verify Installation

- Open your browser to `http://localhost:5000`
- Check that the application loads without errors
- Check the browser console for any warnings or errors

## Repository Structure

This project is a Turborepo monorepo using `pnpm` workspaces.

- **`/` (root)**: The existing Next.js web application and backend API routes.
- **`apps/mobile`**: The React Native (Expo) mobile application.
- **`packages/domain`**: Pure TypeScript business logic, types, product parsing, pricing logic, and validation schemas shared across web and mobile.
- **`packages/nostr`**: Shared Nostr protocol logic, relay helpers, and related primitives.
- **`packages/api-client`**: Typed wrappers for the existing Next.js API routes.

**Rule of thumb:** If you are writing business logic, pricing math, parsing, or shared data models, put it in a package such as `packages/domain` instead of directly inside UI components.

## Development Workflow

### 1. Stay Updated

Before starting new work, always sync with the upstream repository:

```bash
# Fetch upstream changes
git fetch upstream

# Switch to main branch
git checkout main

# Merge upstream changes
git merge upstream/main

# Push updates to your fork
git push origin main
```

### 2. Create a Feature Branch

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Or for bug fixes
git checkout -b fix/bug-description
```

### 3. Make Your Changes and Commit

Make your changes and commit them to your feature branch.

## Code Quality Standards

### 1. ESLint

Run ESLint to check for code issues:

```bash
# Check for linting errors
pnpm run lint

# Fix auto-fixable issues
npx eslint . --ext .ts,.tsx --fix
```

### 2. TypeScript

Ensure your code passes TypeScript checks:

```bash
# Run type checking
pnpm run typecheck
```

### 3. Prettier

Format your code with Prettier:

```bash
# Check formatting
npx prettier --check .

# Fix formatting issues
npx prettier --write .
```

### 4. Run All Checks

Before committing, run all quality checks:

```bash
# Run linting and type checking together
pnpm run lint-all
```

## Testing

### 1. Run Tests

```bash
# Run website tests
pnpm run test:web

# Run all tests across the monorepo
pnpm run test:all

# Run tests in watch mode during development
pnpm run test:watch
```

### 2. Writing Tests

- Write tests for new features and bug fixes
- Place test files next to the components they test or in a `__tests__` directory
- Use descriptive test names
- Follow existing test patterns

## Creating a Pull Request

Before creating a pull request, ensure your code meets quality standards by running:

```bash
# Run the website production build
pnpm run build:web

# Run package/mobile builds managed by Turbo
pnpm run build:all

# Run workspace type checks
pnpm run typecheck

# Run all tests across the monorepo
pnpm run test:all

# Format code
npx prettier --write .
```

Once all checks pass, push your changes and create a pull request.

## Docker Development

### 1. Build Docker Image

```bash
# Build the Docker image
docker build -t milk-market .
```

### 2. Run with Docker

```bash
# Run the container
docker run -p 3000:3000 milk-market
```

### 3. Docker Compose (Optional)

If you need to set up additional services, you can create a `docker-compose.yml` file for your local development needs.

---

Thank you for contributing to Milk Market! 🚀 Your contributions help build the future of permissionless commerce.

## Questions?

Join our [Discord server](https://discord.gg/F9XemadR) to ask questions and get help directly from the maintainers and community!
