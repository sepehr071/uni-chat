import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'
import toast from 'react-hot-toast'

const SocketContext = createContext(null)

export function SocketProvider({ children }) {
  const { accessToken, isAuthenticated } = useAuth()
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const wasConnectedRef = useRef(false)

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      if (socket) {
        socket.disconnect()
        setSocket(null)
        setIsConnected(false)
      }
      return
    }

    // Create socket connection
    const newSocket = io(window.location.origin, {
      query: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    newSocket.on('connect', () => {
      console.log('Socket connected')
      setIsConnected(true)
      if (wasConnectedRef.current) {
        toast.success('Reconnected to server')
      }
      wasConnectedRef.current = true
    })

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      setIsConnected(false)
      if (wasConnectedRef.current && reason !== 'io client disconnect') {
        toast.error('Connection lost. Reconnecting...')
      }
    })

    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setIsConnected(false)
    })

    setSocket(newSocket)

    return () => {
      newSocket.disconnect()
    }
  }, [isAuthenticated, accessToken])

  const joinConversation = useCallback((conversationId) => {
    if (socket && isConnected) {
      socket.emit('join_conversation', { conversation_id: conversationId })
    }
  }, [socket, isConnected])

  const leaveConversation = useCallback((conversationId) => {
    if (socket && isConnected) {
      socket.emit('leave_conversation', { conversation_id: conversationId })
    }
  }, [socket, isConnected])

  const sendMessage = useCallback((data) => {
    if (socket && isConnected) {
      socket.emit('send_message', data)
    }
  }, [socket, isConnected])

  const stopGeneration = useCallback((messageId) => {
    if (socket && isConnected) {
      socket.emit('stop_generation', { message_id: messageId })
    }
  }, [socket, isConnected])

  const on = useCallback((event, callback) => {
    if (socket) {
      socket.on(event, callback)
      return () => socket.off(event, callback)
    }
    return () => {}
  }, [socket])

  const off = useCallback((event, callback) => {
    if (socket) {
      socket.off(event, callback)
    }
  }, [socket])

  const value = {
    socket,
    isConnected,
    joinConversation,
    leaveConversation,
    sendMessage,
    stopGeneration,
    on,
    off,
  }

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
