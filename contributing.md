# Contributing to Shopstr

Welcome to Shopstr! 🛒⚡ We're excited to have you contribute to our global, permissionless Nostr marketplace for Bitcoin commerce.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Fork and Clone](#fork-and-clone)
3. [Local Development Setup](#local-development-setup)
4. [Development Workflow](#development-workflow)
5. [Code Quality Standards](#code-quality-standards)
6. [Testing](#testing)
7. [Creating a Pull Request](#creating-a-pull-request)
8. [Docker Development](#docker-development)

## Prerequisites

Before you begin, ensure you have the following installed on your system:

- **Node.js**: Version 18.17.0 or higher
- **npm**: Version 9.6.7 or higher
- **Git**: Latest version
- **Docker** (optional, for containerized development)

### Check Your Versions

```bash
node --version  # Should be >=18.17.0
npm --version   # Should be >=9.6.7
git --version
```

## Fork and Clone

### 1. Fork the Repository

1. Visit [https://github.com/shopstr-eng/shopstr](https://github.com/shopstr-eng/shopstr)
2. Click the "Fork" button in the top-right corner
3. Select your GitHub account to create the fork

### 2. Clone Your Fork

```bash
# Clone your forked repository
git clone https://github.com/YOUR-USERNAME/shopstr.git

# Navigate to the project directory
cd shopstr

# Add the original repository as upstream
git remote add upstream https://github.com/shopstr-eng/shopstr.git

# Verify remotes
git remote -v
```

You should see:
```
origin    https://github.com/YOUR-USERNAME/shopstr.git (fetch)
origin    https://github.com/YOUR-USERNAME/shopstr.git (push)
upstream  https://github.com/shopstr-eng/shopstr.git (fetch)
upstream  https://github.com/shopstr-eng/shopstr.git (push)
```

## Local Development Setup

### 1. Install Dependencies

```bash
# Install all project dependencies
npm ci
```

> **Note**: We use `npm ci` instead of `npm install` for consistent, reproducible installations based on the `package-lock.json` file.

### 2. Start Development Server

```bash
# Start the development server
npm run dev
```

The application will be available at `http://localhost:3000`

### 3. Verify Installation

- Open your browser to `http://localhost:3000`
- Check that the application loads without errors
- Check the browser console for any warnings or errors

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
npm run lint

# Fix auto-fixable issues
npx eslint . --ext .ts,.tsx --fix
```

### 2. TypeScript

Ensure your code passes TypeScript checks:

```bash
# Run type checking
npm run type-check
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
npm run lint-all
```

## Testing

### 1. Run Tests

```bash
# Run all tests
npm test

# Run tests in watch mode during development
npm run test:watch
```

### 2. Writing Tests

- Write tests for new features and bug fixes
- Place test files next to the components they test or in a `__tests__` directory
- Use descriptive test names
- Follow existing test patterns

## Creating a Pull Request

Before creating a pull request, ensure your code meets quality standards by running:

```bash
# Run the full build process
npm run build

# Run all linting and type checks
npm run lint-all

# Run tests
npm test

# Format code
npx prettier --write .
```

Once all checks pass, push your changes and create a pull request.

## Docker Development

### 1. Build Docker Image

```bash
# Build the Docker image
docker build -t shopstr .
```

### 2. Run with Docker

```bash
# Run the container
docker run -p 3000:3000 shopstr
```

### 3. Docker Compose (Optional)

If you need to set up additional services, you can create a `docker-compose.yml` file for your local development needs.

---

Thank you for contributing to Shopstr! 🚀 Your contributions help build the future of decentralized Bitcoin commerce.

## Questions?

Join our [Discord server](https://discord.gg/F9XemadR) to ask questions and get help directly from the maintainers and community!