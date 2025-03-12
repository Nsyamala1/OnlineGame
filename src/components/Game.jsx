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
    // Get the current host's address
    const serverUrl = window.location.hostname === 'localhost' 
      ? 'http://localhost:3001'
      : `http://${window.location.hostname}:3001`;
      
    const newSocket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      cors: {
        origin: '*'
      }
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
          <div style={{ marginBottom: '10px' }}>
            {players.length === 1 ? 'Waiting for more players...' : 
             `${players.filter(p => p.ready).length}/${players.length} players ready`}
          </div>
          {players.length === 1 ? (
            <div style={{ fontSize: '14px', opacity: 0.8, marginBottom: '10px' }}>
              Share this game with friends to play together!
            </div>
          ) : null}
          <button 
            onClick={handleReady}
            className={`ready-button ${currentPlayer?.ready ? 'ready' : ''}`}
            style={{
              cursor: 'pointer',
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: currentPlayer?.ready ? '#27ae60' : '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              transition: 'all 0.2s ease',
              opacity: players.length === 1 ? 0.7 : 1
            }}
            disabled={players.length === 1}
          >
            {currentPlayer?.ready ? '✓ Ready!' : 'Click when ready'}
          </button>
          <div style={{ marginTop: '10px', fontSize: '14px' }}>
            {players.map(p => (
              <div key={p.id} style={{ 
                color: p.ready ? '#27ae60' : '#95a5a6',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px'
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
