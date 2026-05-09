"""
Pytest fixtures for backend tests
"""
import os
import pytest
from datetime import datetime
from bson import ObjectId
from flask_jwt_extended import create_access_token

# CRITICAL: must set MONGO_URI to the test DB BEFORE create_app() runs.
# Flask-PyMongo binds the client at init_app() time using app.config['MONGO_URI'],
# which is read from os.environ at Config class-def time. Updating
# app.config['MONGO_URI'] AFTER create_app() is a no-op — the prod 'unichat' DB
# stays bound and gets wiped by the per-test cleanup below. Set the env var
# here, before any `from app import …` import path can run.
os.environ['TESTING'] = 'True'
os.environ['MONGO_URI'] = 'mongodb://localhost:27017/unichat_test'

_TEST_DB_NAME = 'unichat_test'


@pytest.fixture(scope='session')
def app():
    """Create and configure a test Flask application instance"""
    from app import create_app
    from app.extensions import mongo

    app = create_app()
    app.config.update({
        'TESTING': True,
        'JWT_SECRET_KEY': 'test-secret-key',
        'SECRET_KEY': 'test-secret',
    })

    # Defense in depth: if the env var was somehow not honored (older app
    # initialization order, mocks, etc.), refuse to run.
    with app.app_context():
        if mongo.db.name != _TEST_DB_NAME:
            raise RuntimeError(
                f"REFUSING TO RUN TESTS: mongo.db.name is {mongo.db.name!r}, "
                f"expected {_TEST_DB_NAME!r}. The per-test cleanup would wipe "
                f"the prod dev database. Check conftest MONGO_URI ordering."
            )

    with app.app_context():
        yield app

        # Cleanup: Drop test database after all tests
        try:
            mongo.db.client.drop_database(_TEST_DB_NAME)
        except Exception:
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
        # Hard guard: never wipe a database whose name doesn't end in '_test'.
        if mongo.db.name != _TEST_DB_NAME:
            raise RuntimeError(
                f"REFUSING TO WIPE: mongo.db.name is {mongo.db.name!r}, "
                f"expected {_TEST_DB_NAME!r}."
            )
        for collection_name in mongo.db.list_collection_names():
            mongo.db[collection_name].delete_many({})

        yield mongo.db


@pytest.fixture(scope='function')
def test_user(app, db):
    """Create a test user with manager role (can create workspaces)."""
    from app.models.user import UserModel

    with app.app_context():
        user = UserModel.create(
            email='test@gmail.com',
            password='TestPassword123!',
            display_name='Test User',
            role='manager'
        )
        return user


@pytest.fixture(scope='function')
def plain_user(app, db):
    """Create a plain user (role='user') that cannot create workspaces."""
    from app.models.user import UserModel

    with app.app_context():
        user = UserModel.create(
            email='plain@gmail.com',
            password='TestPassword123!',
            display_name='Plain User',
            role='user'
        )
        return user


@pytest.fixture(scope='function')
def plain_headers(app, plain_user):
    """Generate JWT auth headers for plain_user."""
    with app.app_context():
        access_token = create_access_token(identity=str(plain_user['_id']))
        return {
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json'
        }


@pytest.fixture(scope='function')
def admin_user(app, db):
    """Create an admin user"""
    from app.models.user import UserModel

    with app.app_context():
        user = UserModel.create(
            email='admin@gmail.com',
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
