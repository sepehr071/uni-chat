"""
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
                'email': 'newuser@gmail.com',
                'password': 'ValidPass123!',
                'display_name': 'New User'
            }
        )

        assert response.status_code == 201
        data = response.get_json()
        assert 'message' in data
        assert data['message'] == 'Registration successful'
        assert 'user' in data
        assert data['user']['email'] == 'newuser@gmail.com'
        assert data['user']['display_name'] == 'New User'

    def test_register_duplicate_email(self, client, test_user):
        """Test registration with duplicate email fails"""
        response = client.post(
            '/api/auth/register',
            json={
                'email': 'test@gmail.com',  # Already exists
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
            json={'email': 'test@gmail.com'}
        )

        assert response.status_code == 400

    def test_login_success(self, client, test_user):
        """Test successful login"""
        response = client.post(
            '/api/auth/login',
            json={
                'email': 'test@gmail.com',
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
                'email': 'test@gmail.com',
                'password': 'WrongPassword123!'
            }
        )

        assert response.status_code == 401

    def test_login_nonexistent_user(self, client):
        """Test login with nonexistent user"""
        response = client.post(
            '/api/auth/login',
            json={
                'email': 'nonexistent@gmail.com',
                'password': 'Password123!'
            }
        )

        assert response.status_code == 401
