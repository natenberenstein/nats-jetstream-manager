# UV Setup Guide

This project uses [uv](https://github.com/astral-sh/uv) for fast Python package management.

## Why uv?

- ⚡ **10-100x faster** than pip
- 🔒 **Deterministic** dependency resolution
- 🎯 **Drop-in replacement** for pip and pip-tools
- 🦀 **Written in Rust** for maximum performance
- 📦 **Better caching** and conflict resolution

## Installation

### macOS and Linux

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

### Windows

```powershell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### Alternative: Using pip

```bash
pip install uv
```

### Verify Installation

```bash
uv --version
```

## Quick Start

### 1. Create Virtual Environment

```bash
cd backend
uv venv
```

This creates a `.venv` directory.

### 2. Activate Virtual Environment

**Linux/macOS:**
```bash
source .venv/bin/activate
```

**Windows:**
```cmd
.venv\Scripts\activate
```

### 3. Install Dependencies

**Production dependencies:**
```bash
uv pip install -e .
```

**With dev dependencies:**
```bash
uv pip install -e ".[dev]"
```

### 4. Run the Application

```bash
uvicorn app.main:app --reload
```

## Using the Makefile

For even easier management:

```bash
# Complete setup (creates venv + installs dependencies)
make setup

# Run the development server
make run

# Run tests
make test

# Format and lint code
make format
make lint

# See all available commands
make help
```

## Common Tasks

### Add a New Dependency

1. Add to `pyproject.toml`:
```toml
[project]
dependencies = [
    "new-package==1.0.0",
]
```

2. Install:
```bash
uv pip install -e .
```

### Update Dependencies

```bash
uv pip install --upgrade -e .
```

### Install a Package for Testing

```bash
uv pip install package-name
```

### Generate requirements.txt (if needed)

```bash
uv pip freeze > requirements.txt
```

## Project Structure

```
backend/
├── pyproject.toml      # Project metadata and dependencies
├── .python-version     # Python version specification
├── .venv/              # Virtual environment (gitignored)
├── Makefile            # Convenient commands
└── app/                # Application code
```

## Comparison with pip

### Traditional pip workflow:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install pytest
pip freeze > requirements.txt
```

### With uv:

```bash
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
```

Much faster and simpler!

## Performance

Real-world example from this project:

- **pip**: ~15-20 seconds to install all dependencies
- **uv**: ~2-3 seconds to install all dependencies

That's **5-10x faster**!

## Docker Integration

The Dockerfile uses uv for even faster image builds:

```dockerfile
# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Install dependencies
RUN uv pip install --system --no-cache -r pyproject.toml
```

## Troubleshooting

### uv not found after installation

Add to your PATH:

**Linux/macOS** (add to `~/.bashrc` or `~/.zshrc`):
```bash
export PATH="$HOME/.cargo/bin:$PATH"
```

**Windows**: The installer should handle this automatically.

### Virtual environment issues

Delete and recreate:
```bash
rm -rf .venv
uv venv
source .venv/bin/activate
uv pip install -e ".[dev]"
```

### Package conflicts

uv has better conflict resolution than pip. If you encounter issues:

```bash
uv pip install --refresh -e ".[dev]"
```

## Additional Resources

- [uv Documentation](https://github.com/astral-sh/uv)
- [pyproject.toml Guide](https://packaging.python.org/en/latest/guides/writing-pyproject-toml/)
- [PEP 621](https://peps.python.org/pep-0621/) - Python project metadata

## Migration from pip

If you have an existing `requirements.txt`:

1. Create `pyproject.toml` with dependencies
2. Run `uv pip install -e .`
3. Delete `requirements.txt` (optional)

The project is now using modern Python packaging with blazing fast installs! 🚀
