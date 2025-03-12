const socket = io();
const gameContainer = document.getElementById('game-container');

gameContainer.addEventListener('click', () => {
  socket.emit('move');
});

socket.on('updatePositions', (updatedPlayers) => {
  // Remove existing players first (optional for now)
  document.querySelectorAll('.player').forEach(p => p.remove());

  updatedPlayers.forEach(player => {
    const playerElement = document.createElement('div');
    playerElement.classList.add('player');
    playerElement.id = player.id;
    playerElement.style.left = `${player.position}px`;

    // Add body parts
    const head = document.createElement('div');
    head.classList.add('head');

    const body = document.createElement('div');
    body.classList.add('body');

    const leftArm = document.createElement('div');
    leftArm.classList.add('left-arm');

    const rightArm = document.createElement('div');
    rightArm.classList.add('right-arm');

    const leftLeg = document.createElement('div');
    leftLeg.classList.add('left-leg');

    const rightLeg = document.createElement('div');
    rightLeg.classList.add('right-leg');

    // Append parts to player
    playerElement.appendChild(head);
    playerElement.appendChild(body);
    playerElement.appendChild(leftArm);
    playerElement.appendChild(rightArm);
    playerElement.appendChild(leftLeg);
    playerElement.appendChild(rightLeg);

    gameContainer.appendChild(playerElement);

    // Check win condition
    if (player.position >= 570) {
      alert(`Player ${player.id} won!`);
    }
  });
});
