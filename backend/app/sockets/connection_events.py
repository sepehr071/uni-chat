from flask import request
from flask_socketio import emit, join_room, leave_room
from flask_jwt_extended import decode_token
from app.models.user import UserModel


# Store active connections
active_connections = {}


def register_connection_events(socketio):
    """Register connection-related socket events"""

    @socketio.on('connect')
    def handle_connect():
        """Handle new socket connection"""
        # Get token from query params
        token = request.args.get('token')
        if not token:
            return False  # Reject connection

        try:
            # Decode and verify JWT
            decoded = decode_token(token)
            user_id = decoded['sub']

            # Verify user exists and isn't banned
            user = UserModel.find_by_id(user_id)
            if not user or user.get('status', {}).get('is_banned', False):
                return False

            # Store connection info
            active_connections[request.sid] = {
                'user_id': user_id,
                'conversations': set()
            }

            # Join user's personal room
            join_room(f'user_{user_id}')

            emit('connected', {
                'message': 'Connected successfully',
                'sid': request.sid
            })

            return True

        except Exception as e:
            print(f"Connection error: {e}")
            return False

    @socketio.on('disconnect')
    def handle_disconnect():
        """Handle socket disconnection"""
        if request.sid in active_connections:
            conn = active_connections[request.sid]

            # Leave all conversation rooms
            for conv_id in conn['conversations']:
                leave_room(f'conversation_{conv_id}')

            # Leave user room
            leave_room(f'user_{conn["user_id"]}')

            # Remove from active connections
            del active_connections[request.sid]

    @socketio.on('join_conversation')
    def handle_join_conversation(data):
        """Join a conversation room"""
        if request.sid not in active_connections:
            emit('error', {'message': 'Not authenticated'})
            return

        conversation_id = data.get('conversation_id')
        if not conversation_id:
            emit('error', {'message': 'conversation_id required'})
            return

        # Join the room
        join_room(f'conversation_{conversation_id}')
        active_connections[request.sid]['conversations'].add(conversation_id)

        emit('joined_conversation', {
            'conversation_id': conversation_id,
            'message': 'Joined conversation'
        })

    @socketio.on('leave_conversation')
    def handle_leave_conversation(data):
        """Leave a conversation room"""
        if request.sid not in active_connections:
            return

        conversation_id = data.get('conversation_id')
        if not conversation_id:
            return

        # Leave the room
        leave_room(f'conversation_{conversation_id}')
        active_connections[request.sid]['conversations'].discard(conversation_id)

        emit('left_conversation', {
            'conversation_id': conversation_id,
            'message': 'Left conversation'
        })


def get_user_id_from_sid(sid):
    """Get user ID from socket session ID"""
    conn = active_connections.get(sid)
    return conn['user_id'] if conn else None
