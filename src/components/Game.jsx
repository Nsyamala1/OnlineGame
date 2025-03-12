import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import './Game.css';

const Game = () => {
  const [gameState, setGameState] = useState({
    players: [],
    gameState: 'waiting',
    countdown: null
  });
  const [socket, setSocket] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [isNameSubmitted, setIsNameSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Initialize socket connection
  useEffect(() => {
    // Connect to the game server using the network IP
    const serverUrl = 'http://10.1.10.160:3001';
    console.log('Connecting to server:', serverUrl);
    
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 20000,
      forceNew: true
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setError('');
    });

    newSocket.on('gameFull', () => {
      setError('Game is full! Maximum 4 players allowed.');
      newSocket.disconnect();
    });

    newSocket.on('updateGame', (newGameState) => {
      console.log('Game state update:', newGameState);
      setGameState(newGameState);
    });

    setSocket(newSocket);

    // Cleanup socket connection on component unmount
    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (playerName.trim() && socket) {
      socket.emit('setName', playerName);
      setIsNameSubmitted(true);
    }
  };

  const handleMove = useCallback(() => {
    if (socket && isNameSubmitted) {
      socket.emit('move');
      // Scroll to follow the current player
      const currentPlayer = gameState.players.find(p => p.id === socket?.id);
      if (currentPlayer) {
        const container = document.querySelector('.game-wrapper');
        if (container) {
          container.scrollTo({
            left: Math.max(0, currentPlayer.position - window.innerWidth / 3),
            behavior: 'smooth'
          });
        }
      }
    }
  }, [socket, isNameSubmitted, gameState.players]);

  const handleReady = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (socket && isNameSubmitted) {
      socket.emit('toggleReady');
    }
  }, [socket, isNameSubmitted]);

  const handleRestart = useCallback(() => {
    if (socket && isNameSubmitted) {
      socket.emit('requestRestart');
    }
  }, [socket, isNameSubmitted]);

  // Handle both click and touch events
  const handleInteraction = useCallback((e) => {
    e.preventDefault(); // Prevent default touch behavior
    handleMove();
  }, [handleMove]);

  useEffect(() => {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
      gameContainer.addEventListener('touchstart', handleInteraction);
      return () => {
        gameContainer.removeEventListener('touchstart', handleInteraction);
      };
    }
  }, [handleInteraction]);

  const Player = ({ position, id, name, lane, color, ready, wins }) => {
    const laneHeight = window.innerHeight - 100; // Full height minus margins
    const laneSpacing = laneHeight / 5; // Divide height into 5 sections (4 lanes + margins)
    const laneOffset = (lane + 1) * laneSpacing;
    const isWinner = gameState.gameState === 'finished' && position >= 2000;
    return (
      <div 
        className={`player ${gameState.gameState === 'racing' ? 'racing' : ''} ${isWinner ? 'winner' : ''}`}
        style={{ 
          left: `${position}px`,
          top: `${laneOffset}px`
        }} 
        id={id}
      >
        <div className="player-info">
          <div className="player-name">{name}</div>
          <div className="player-stats">Wins: {wins}</div>
          {gameState.gameState === 'waiting' && (
            <div className="player-ready">{ready ? '✓ Ready' : 'Not Ready'}</div>
          )}
        </div>
        <div className="stick-figure" style={{ color: color }}>
          <div className="head" />
          <div className="body" />
          <div className="left-arm" />
          <div className="right-arm" />
          <div className="left-leg" />
          <div className="right-leg" />
        </div>
      </div>
    );
  };

  const GameStatus = () => {
    const { gameState: state, countdown, players } = gameState;
    
    if (state === 'waiting') {
      const currentPlayer = players.find(p => p.id === socket?.id);
      return (
        <div className="game-status">
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '10px' }}>Online Racing Game</h2>
            <div style={{ fontSize: '16px', marginBottom: '15px' }}>
              {players.length === 1 ? 'Waiting for more players...' : 
               `${players.filter(p => p.ready).length}/${players.length} players ready`}
            </div>
            {players.length === 1 && (
              <div style={{ 
                backgroundColor: '#f8f9fa', 
                padding: '15px', 
                borderRadius: '8px',
                marginBottom: '15px'
              }}>
                <h3 style={{ marginBottom: '10px' }}>Invite Friends!</h3>
                <p style={{ marginBottom: '10px' }}>Share this link to play together:</p>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '15px'
                }}>
                  <code style={{ 
                    display: 'block', 
                    padding: '10px', 
                    backgroundColor: '#e9ecef',
                    borderRadius: '4px',
                    marginBottom: '5px'
                  }}>
                    http://10.1.10.160:3000
                  </code>
                  <img 
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=http://10.1.10.160:3000`}
                    alt="QR Code"
                    style={{
                      width: '150px',
                      height: '150px',
                      backgroundColor: 'white',
                      padding: '10px',
                      borderRadius: '8px'
                    }}
                  />
                  <div style={{ fontSize: '14px', opacity: 0.8 }}>
                    Scan to join the game
                  </div>
                </div>
                <p style={{ fontSize: '14px', opacity: 0.8 }}>Players must be on the same network</p>
              </div>
            )}
          </div>
          <button 
            onClick={handleReady}
            className={`ready-button ${currentPlayer?.ready ? 'ready' : ''}`}
            style={{
              cursor: 'pointer',
              padding: '12px 24px',
              fontSize: '18px',
              backgroundColor: currentPlayer?.ready ? '#27ae60' : '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              transition: 'all 0.2s ease',
              opacity: players.length === 1 ? 0.7 : 1,
              width: '200px',
              margin: '0 auto',
              display: 'block'
            }}
            disabled={players.length === 1}
          >
            {currentPlayer?.ready ? '✓ Ready!' : 'Click when ready'}
          </button>
          <div style={{ 
            marginTop: '20px', 
            fontSize: '16px',
            backgroundColor: '#fff',
            padding: '15px',
            borderRadius: '8px',
            maxWidth: '300px',
            margin: '20px auto'
          }}>
            <h3 style={{ marginBottom: '10px', textAlign: 'center' }}>Players</h3>
            {players.map(p => (
              <div key={p.id} style={{ 
                color: p.ready ? '#27ae60' : '#95a5a6',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '8px',
                backgroundColor: '#f8f9fa',
                borderRadius: '4px'
              }}>
                {p.ready ? '✓' : '○'} {p.name}
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    if (state === 'countdown') {
      return (
        <div className="game-status countdown">
          <div>Race starts in...</div>
          <div className="countdown-number">{countdown}</div>
        </div>
      );
    }
    
    if (state === 'finished') {
      const FINISH_LINE = 2000;
      const winner = players.find(p => p.position >= FINISH_LINE);
      if (!winner) return null;
      return (
        <div className="game-status finished">
          <div style={{ fontSize: '24px', marginBottom: '10px' }}>
            {`🎉 ${winner.name} wins! 🎉`}
          </div>
          <button 
            onClick={handleRestart}
            style={{
              padding: '10px 20px',
              fontSize: '18px',
              backgroundColor: '#2ecc71',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              transition: 'transform 0.1s'
            }}
            onMouseDown={e => e.target.style.transform = 'scale(0.95)'}
            onMouseUp={e => e.target.style.transform = 'scale(1)'}
          >
            Play Again
          </button>
        </div>
      );
    }
    
    return null;
  };

  if (!isNameSubmitted) {
    return (
      <div className="name-form-container">
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleNameSubmit} className="name-form">
          <input
            type="text"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Enter your name"
            maxLength="15"
            required
          />
          <button type="submit">Start Game</button>
        </form>
      </div>
    );
  }

  return (
    <div className="game-wrapper">
      <GameStatus />
      <div 
        id="game-container" 
        onClick={gameState.gameState === 'racing' ? handleInteraction : undefined}
        className={gameState.gameState === 'racing' ? 'racing' : ''}
      >
        {gameState.players.map(player => (
          <Player 
            key={player.id} 
            position={player.position} 
            id={player.id}
            name={player.name || 'Anonymous'}
            lane={player.lane}
            color={player.color}
            ready={player.ready}
            wins={player.wins}
          />
        ))}
        <div className="finish-line" />
        {[...Array(3)].map((_, i) => {
          const laneHeight = window.innerHeight - 100;
          const laneSpacing = laneHeight / 5;
          return (
            <div 
              key={i} 
              className="lane-divider" 
              style={{ top: `${(i + 1) * laneSpacing}px` }} 
            />
          );
        })}
      </div>
    </div>
  );
};

export default Game;
