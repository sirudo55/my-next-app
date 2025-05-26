import { useState } from 'react';

// WelcomeMessage.js
function WelcomeMessage({ username }) {
  return (
    <h2>ようこそ、{username} さん！</h2>
  );
}

export default WelcomeMessage;