@echo off
echo ========================================
echo   Uni-Chat Backend Test Runner
echo ========================================
echo.

REM Activate conda environment
call conda activate uni-chat

REM Check if pytest is installed
python -c "import pytest" 2>nul
if errorlevel 1 (
    echo Installing test dependencies...
    pip install -r requirements-test.txt
    echo.
)

REM Run tests based on argument
if "%1"=="quick" (
    echo Running quick unit tests...
    pytest -m unit --tb=short
) else if "%1"=="coverage" (
    echo Running tests with coverage report...
    pytest --cov=app --cov-report=html --cov-report=term-missing
    echo.
    echo Coverage report generated in htmlcov/index.html
) else if "%1"=="parallel" (
    echo Running tests in parallel...
    pytest -n auto
) else if "%1"=="security" (
    echo Running security tests...
    pytest -m security -v
) else if "%1"=="verbose" (
    echo Running tests with verbose output...
    pytest -vv -s
) else (
    echo Running all tests...
    pytest
)

echo.
echo Tests complete!
pause
