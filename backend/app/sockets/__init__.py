from app.sockets.chat_events import register_chat_events
from app.sockets.connection_events import register_connection_events
from app.sockets.arena_events import register_arena_events


def register_socket_events(socketio):
    """Register all socket event handlers"""
    register_connection_events(socketio)
    register_chat_events(socketio)
    register_arena_events(socketio)
