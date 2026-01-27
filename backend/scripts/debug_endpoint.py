#!/usr/bin/env python
"""
Quick debug script to test API endpoints.
Run this with: python scripts/debug_endpoint.py
"""
import os
import sys

# Add backend to path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)
os.chdir(backend_dir)

from app import create_app

app = create_app()
app.config.update({
    'TESTING': True,
    'MONGO_URI': 'mongodb://localhost:27017/unichat_test',
})

with app.test_client() as client:
    response = client.post(
        '/api/auth/register',
        json={
            'email': 'newuser@example.com',
            'password': 'ValidPass123!',
            'display_name': 'New User'
        }
    )

    print(f"Status: {response.status_code}")
    print(f"Response: {response.get_json()}")
