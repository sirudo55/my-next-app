import logo from './logo.svg';
import './App.css';

import { useState } from 'react';

function App() {
  const [count, setCount] = useState(0);
  const [name, setName] = useState('');

  return (
    <div>
      <p>現在のカウント: {count}</p>
      <button onClick={() => setCount(count + 1)}>増やす</button>
   
 <hr />

      <p>あなたの名前: {name}</p>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="名前を入力してください"
      />
    </div>

  );
}

export default App;

