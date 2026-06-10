import { io } from 'socket.io-client'

let _socket = null

export function connect() {
  if (_socket && _socket.connected) return _socket
  const serverUrl = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:3001`
  _socket = io(serverUrl, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
  })
  return _socket
}

export function getSocket() { return _socket }

export function disconnect() {
  if (_socket) { _socket.disconnect(); _socket = null }
}
