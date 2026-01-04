import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { SocketProvider } from './context/SocketContext'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SocketProvider>
            <App />
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: '#2d2d2d',
                  color: '#e6e6e6',
                  border: '1px solid #333333',
                },
                success: {
                  iconTheme: {
                    primary: '#4ade80',
                    secondary: '#2d2d2d',
                  },
                },
                error: {
                  iconTheme: {
                    primary: '#f87171',
                    secondary: '#2d2d2d',
                  },
                },
              }}
            />
          </SocketProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
