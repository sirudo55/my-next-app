import { useState } from 'react';

function App2() {
  const [name, setName] = useState('');
  const [submittedName, setSubmittedName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault(); // フォームが送信されてページがリロードされるのを防ぐ
    setSubmittedName(name);
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        <input 
          type="text" 
          value={name}
          onChange={(e) => setName(e.target.value)} 
          placeholder="名前を入力"
        />
        <button type="submit">送信</button>
      </form>

      {submittedName && <p>こんにちは、{submittedName} さん！</p>}
    </div>
  );
}

export default App2;