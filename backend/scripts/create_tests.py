#!/usr/bin/env python
"""
Script to create all necessary test files for the backend
Run this with: python scripts/create_tests.py
"""
import os

# Navigate to backend root (in case running from scripts/)
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(backend_dir)

# Create tests directory structure
os.makedirs('tests', exist_ok=True)
os.makedirs('tests/test_models', exist_ok=True)
os.makedirs('tests/test_sockets', exist_ok=True)

# Write tests/__init__.py
with open('tests/__init__.py', 'w', encoding='utf-8') as f:
    f.write('"""Backend test suite"""\n')

# Write tests/conftest.py
CONFTEST_CONTENT = '''"""
Pytest fixtures for backend tests
"""
import os
import pytest
from datetime import datetime
from bson import ObjectId
from flask_jwt_extended import create_access_token

# Set test environment
os.environ['TESTING'] = 'True'


@pytest.fixture(scope='session')
def app():
    """Create and configure a test Flask application instance"""
    from app import create_app
    app = create_app()
    app.config.update({
        'TESTING': True,
        'MONGO_URI': 'mongodb://localhost:27017/unichat_test',
        'JWT_SECRET_KEY': 'test-secret-key',
        'SECRET_KEY': 'test-secret',
    })

    with app.app_context():
        yield app

        # Cleanup: Drop test database after all tests
        from app.extensions import mongo
        try:
            mongo.db.client.drop_database('unichat_test')
        except:
            pass


@pytest.fixture(scope='function')
def client(app):
    """Create a test client for the Flask application"""
    return app.test_client()


@pytest.fixture(scope='function')
def db(app):
    """Get MongoDB database instance and clean collections before each test"""
    from app.extensions import mongo

    with app.app_context():
        # Clean all collections
        for collection_name in mongo.db.list_collection_names():
            mongo.db[collection_name].delete_many({})

        yield mongo.db


@pytest.fixture(scope='function')
def test_user(app, db):
    """Create a test user"""
    from app.models.user import UserModel

    with app.app_context():
        user = UserModel.create(
            email='test@example.com',
            password='TestPassword123!',
            display_name='Test User',
            role='user'
        )
        return user


@pytest.fixture(scope='function')
def admin_user(app, db):
    """Create an admin user"""
    from app.models.user import UserModel

    with app.app_context():
        user = UserModel.create(
            email='admin@example.com',
            password='AdminPassword123!',
            display_name='Admin User',
            role='admin'
        )
        return user


@pytest.fixture(scope='function')
def auth_headers(app, test_user):
    """Generate JWT auth headers for test user"""
    with app.app_context():
        access_token = create_access_token(identity=str(test_user['_id']))
        return {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }


@pytest.fixture(scope='function')
def admin_headers(app, admin_user):
    """Generate JWT auth headers for admin user"""
    with app.app_context():
        access_token = create_access_token(identity=str(admin_user['_id']))
        return {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }
'''

with open('tests/conftest.py', 'w', encoding='utf-8') as f:
    f.write(CONFTEST_CONTENT)

# Write tests/test_auth.py with simple initial tests
TEST_AUTH_CONTENT = '''"""
Tests for authentication routes
"""
import pytest
import json


class TestAuthentication:
    """Test authentication endpoints"""

    def test_register_success(self, client, db):
        """Test successful user registration"""
        response = client.post(
            '/api/auth/register',
            json={
                'email': 'newuser@example.com',
                'password': 'ValidPass123!',
                'display_name': 'New User'
            }
        )

        assert response.status_code == 201
        data = response.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data
        assert 'user' in data
        assert data['user']['email'] == 'newuser@example.com'

    def test_register_duplicate_email(self, client, test_user):
        """Test registration with duplicate email fails"""
        response = client.post(
            '/api/auth/register',
            json={
                'email': 'test@example.com',  # Already exists
                'password': 'ValidPass123!',
                'display_name': 'Another User'
            }
        )

        assert response.status_code == 409
        data = response.get_json()
        assert 'error' in data

    def test_register_missing_fields(self, client):
        """Test registration with missing fields"""
        response = client.post(
            '/api/auth/register',
            json={'email': 'test@example.com'}
        )

        assert response.status_code == 400

    def test_login_success(self, client, test_user):
        """Test successful login"""
        response = client.post(
            '/api/auth/login',
            json={
                'email': 'test@example.com',
                'password': 'TestPassword123!'
            }
        )

        assert response.status_code == 200
        data = response.get_json()
        assert 'access_token' in data
        assert 'refresh_token' in data

    def test_login_wrong_password(self, client, test_user):
        """Test login with wrong password"""
        response = client.post(
            '/api/auth/login',
            json={
                'email': 'test@example.com',
                'password': 'WrongPassword123!'
            }
        )

        assert response.status_code == 401

    def test_login_nonexistent_user(self, client):
        """Test login with nonexistent user"""
        response = client.post(
            '/api/auth/login',
            json={
                'email': 'nonexistent@example.com',
                'password': 'Password123!'
            }
        )

        assert response.status_code == 401
'''

with open('tests/test_auth.py', 'w', encoding='utf-8') as f:
    f.write(TEST_AUTH_CONTENT)

# Write pytest.ini
PYTEST_INI_CONTENT = '''[pytest]
testpaths = tests
python_files = test_*.py
python_classes = Test*
python_functions = test_*
addopts =
    -v
    --tb=short
markers =
    unit: Unit tests
    integration: Integration tests
    slow: Slow running tests
'''

with open('pytest.ini', 'w', encoding='utf-8') as f:
    f.write(PYTEST_INI_CONTENT)

print("Created test files successfully!")
print("Files created:")
print("   - tests/__init__.py")
print("   - tests/conftest.py")
print("   - tests/test_auth.py")
print("   - pytest.ini")
print("\nRun tests with: pytest")
