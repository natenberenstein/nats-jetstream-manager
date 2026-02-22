.PHONY: install dev test lint format clean run

# Install production dependencies
install:
	uv pip install -e .

# Install development dependencies
dev:
	uv pip install -e ".[dev]"

# Run tests
test:
	pytest

# Run tests with coverage
test-cov:
	pytest --cov=app --cov-report=html --cov-report=term

# Lint code
lint:
	ruff check app/

# Lint and auto-fix
lint-fix:
	ruff check --fix app/

# Format code
format:
	black app/

# Clean up
clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete
	find . -type d -name "*.egg-info" -exec rm -rf {} +
	rm -rf .pytest_cache
	rm -rf htmlcov
	rm -rf .coverage

# Run development server
run:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run with specific log level
run-debug:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --log-level debug

# Setup virtual environment with uv
venv:
	uv venv
	@echo "Virtual environment created. Activate with: source .venv/bin/activate"

# Complete setup (venv + install)
setup: venv
	uv pip install -e ".[dev]"
	@echo "Setup complete! Activate venv: source .venv/bin/activate"

# Sync dependencies (useful after updating pyproject.toml)
sync:
	uv pip install -e ".[dev]"

# Build Docker image
docker-build:
	docker build -t nats-manager-backend .

# Run Docker container
docker-run:
	docker run -p 8000:8000 --env-file .env nats-manager-backend

# Show help
help:
	@echo "Available commands:"
	@echo "  make install     - Install production dependencies"
	@echo "  make dev         - Install development dependencies"
	@echo "  make test        - Run tests"
	@echo "  make test-cov    - Run tests with coverage"
	@echo "  make lint        - Lint code with ruff"
	@echo "  make lint-fix    - Lint and auto-fix issues"
	@echo "  make format      - Format code with black"
	@echo "  make clean       - Clean up generated files"
	@echo "  make run         - Run development server"
	@echo "  make run-debug   - Run with debug logging"
	@echo "  make venv        - Create virtual environment"
	@echo "  make setup       - Complete setup (venv + dependencies)"
	@echo "  make sync        - Sync dependencies from pyproject.toml"
	@echo "  make docker-build - Build Docker image"
	@echo "  make docker-run  - Run Docker container"
