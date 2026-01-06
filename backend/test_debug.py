#!/usr/bin/env python
"""Quick debug script to see registration error"""
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
