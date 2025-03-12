import React, { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import './Game.css';

const Game = () => {
  const [players, setPlayers] = useState([]);
  const [socket, setSocket] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [isNameSubmitted, setIsNameSubmitted] = useState(false);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://10.1.10.160:3001', {
      transports: ['websocket', 'polling'],
      cors: {
        origin: '*'
      }
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('updatePositions', (updatedPlayers) => {
      console.log('Received players update:', updatedPlayers);
      setPlayers(updatedPlayers);
      
      // Check win condition
      const winner = updatedPlayers.find(player => player.position >= 570);
      if (winner) {
        alert(`${winner.name} won!`);
      }
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

  const handleClick = useCallback(() => {
    if (socket && isNameSubmitted) {
      console.log('Sending move event');
      socket.emit('move');
    }
  }, [socket, isNameSubmitted]);

  const Player = ({ position, id, name }) => (
    <div className="player" style={{ left: `${position}px` }} id={id}>
      <div className="player-name">{name}</div>
      <div className="head" />
      <div className="body" />
      <div className="left-arm" />
      <div className="right-arm" />
      <div className="left-leg" />
      <div className="right-leg" />
    </div>
  );

  if (!isNameSubmitted) {
    return (
      <div className="name-form-container">
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
      <div id="game-container" onClick={handleClick}>
        {players.map(player => (
          <Player 
            key={player.id} 
            position={player.position} 
            id={player.id}
            name={player.name || 'Anonymous'}
          />
        ))}
        <div className="finish-line" />
      </div>
    </div>
  );
};

export default Game;
