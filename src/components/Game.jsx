import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import './Game.css';

// Extracted outside Game to prevent remount/flicker on every render
const Player = ({ position, id, name, lane, color, ready, wins, isRacing, isFinished }) => {
  const laneHeight = window.innerHeight - 200;
  const laneSpacing = laneHeight / 4;
  const laneOffset = 100 + (lane * laneSpacing);
  const isWinner = isFinished && position >= 2000;

  return (
    <div
      className={`player ${isRacing ? 'racing' : ''} ${isWinner ? 'winner' : ''}`}
      style={{ left: `${position}px`, top: `${laneOffset}px`, color }}
      id={id}
    >
      <div className="stick-figure">
        <div className="head" />
        <div className="body" />
        <div className="left-arm" />
        <div className="right-arm" />
        <div className="left-leg" />
        <div className="right-leg" />
      </div>
      <div className="player-info">
        <div className="player-name">
          {name}
          {wins > 0 && <span className="wins-badge">🏆 {wins}</span>}
          <span className={`ready-indicator ${ready ? 'ready' : ''}`} />
        </div>
      </div>
    </div>
  );
};

const ProgressBar = ({ players, finishLine }) => {
  if (!players || players.length === 0) return null;
  return (
    <div className="progress-bar-container">
      {players.map(player => (
        <div key={player.id} className="progress-row">
          <span className="progress-label" style={{ color: player.color }}>
            {player.isAI ? '🤖 ' : ''}{player.name}
          </span>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{
                width: `${Math.min((player.position / finishLine) * 100, 100)}%`,
                backgroundColor: player.color
              }}
            />
          </div>
          <span className="progress-pct">
            {Math.round(Math.min((player.position / finishLine) * 100, 100))}%
          </span>
        </div>
      ))}
    </div>
  );
};

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
  const [showLandingPage, setShowLandingPage] = useState(true);
  const [gameMode, setGameMode] = useState('multiplayer');
  const [ripples, setRipples] = useState([]);
  const rippleCounter = useRef(0);

  useEffect(() => {
    const serverUrl = `http://${window.location.hostname}:3001`;
    console.log('Connecting to server:', serverUrl);

    const newSocket = io(serverUrl, {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000
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

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (playerName.trim() && socket) {
      socket.emit('setName', { name: playerName, mode: gameMode });
      setIsNameSubmitted(true);
      setShowLandingPage(false);
    }
  };

  // Auto-scroll to follow current player
  useEffect(() => {
    const currentPlayer = gameState.players.find(p => p.id === socket?.id);
    if (currentPlayer && gameState.gameState === 'racing') {
      const container = document.querySelector('.game-content');
      if (container) {
        const targetScroll = Math.max(0, currentPlayer.position - window.innerWidth / 3);
        container.scrollTo({ left: targetScroll, behavior: 'smooth' });
      }
    }
  }, [gameState.players, socket?.id, gameState.gameState]);

  useEffect(() => {
    if (gameState.gameState === 'racing') {
      const currentPlayer = gameState.players.find(p => p.id === socket?.id);
      if (currentPlayer) {
        const container = document.querySelector('.game-content');
        if (container) {
          const targetScroll = Math.max(0, currentPlayer.position - window.innerWidth / 3);
          container.scrollTo({ left: targetScroll, behavior: 'auto' });
        }
      }
    }
  }, [gameState.gameState, socket?.id]);

  const handleMove = useCallback(() => {
    if (socket && isNameSubmitted) {
      socket.emit('move');
    }
  }, [socket, isNameSubmitted]);

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

  const handleInteraction = useCallback((e) => {
    e.preventDefault();
    // Tap ripple feedback
    const id = rippleCounter.current++;
    const rect = e.currentTarget?.getBoundingClientRect?.();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = clientX - (rect?.left || 0);
    const y = clientY - (rect?.top || 0);
    setRipples(prev => [...prev, { id, x, y }]);
    setTimeout(() => setRipples(prev => prev.filter(r => r.id !== id)), 600);
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
                    {`http://${window.location.hostname}:3000`}
                  </code>
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=http://${window.location.hostname}:3000`}
                    alt="QR Code"
                    style={{
                      width: '150px',
                      height: '150px',
                      backgroundColor: 'white',
                      padding: '10px',
                      borderRadius: '8px'
                    }}
                  />
                  <div style={{ fontSize: '14px', opacity: 0.8 }}>Scan to join the game</div>
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
                {p.ready ? '✓' : '○'} {p.name} {p.isAI ? '🤖' : ''}
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

    if (state === 'racing') {
      return (
        <div className="game-status racing-hint">
          👆 Tap / Click anywhere to move!
        </div>
      );
    }

    if (state === 'finished') {
      const winner = players.find(p => p.position >= 2000);
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

  return (
    <div className="game-container">
      {showLandingPage ? (
        <div className="landing-page">
          <div className="landing-content">
            <h1>Online Racing Game</h1>
            <p>Choose your game mode and start racing!</p>
            {error && <div className="error-message">{error}</div>}
            <form onSubmit={handleNameSubmit} className="name-form">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
                maxLength={15}
                required
              />
              <div className="game-mode-selector">
                <h3>Choose Game Mode</h3>
                <div className="mode-buttons">
                  <button
                    type="button"
                    className={`mode-button ${gameMode === 'multiplayer' ? 'active' : ''}`}
                    onClick={() => setGameMode('multiplayer')}
                  >
                    <span className="mode-icon">👥</span>
                    <span className="mode-text">Play with Friends</span>
                  </button>
                  <button
                    type="button"
                    className={`mode-button ${gameMode === 'ai' ? 'active' : ''}`}
                    onClick={() => setGameMode('ai')}
                  >
                    <span className="mode-icon">🤖</span>
                    <span className="mode-text">Play with AI</span>
                  </button>
                </div>
              </div>
              <button type="submit" className="start-button">Start Game</button>
            </form>
          </div>
        </div>
      ) : (
        <div className="game-wrapper">
          <div className="game-header">
            <span className="game-header-title">🏁 Racing Game</span>
            <button
              onClick={() => {
                setShowLandingPage(true);
                socket.disconnect();
                window.location.reload();
              }}
              className="leave-button"
            >
              Leave Game
            </button>
          </div>

          {/* Floating status overlay — rendered outside header */}
          <GameStatus />

          {/* Progress bar shown only during race */}
          {gameState.gameState === 'racing' && (
            <ProgressBar players={gameState.players} finishLine={2000} />
          )}

          <div className="game-content">
            <div
              id="game-container"
              onClick={gameState.gameState === 'racing' ? handleInteraction : undefined}
              className={`${gameState.gameState === 'racing' ? 'racing' : ''}`}
            >
              {ripples.map(r => (
                <div
                  key={r.id}
                  className="tap-ripple"
                  style={{ left: r.x, top: r.y }}
                />
              ))}
              <div className="finish-line" />
              {[...Array(3)].map((_, i) => {
                const laneHeight = window.innerHeight - 200;
                const laneSpacing = laneHeight / 4;
                return (
                  <div
                    key={i}
                    className="lane-divider"
                    style={{ top: `${100 + ((i + 1) * laneSpacing)}px` }}
                  />
                );
              })}
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
                  isRacing={gameState.gameState === 'racing'}
                  isFinished={gameState.gameState === 'finished'}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Game;
