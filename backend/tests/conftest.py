"""
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
            email='test@gmail.com',
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
