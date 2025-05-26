import { useState, useEffect } from 'react';

function App3() {
  const [gender, setGender] = useState('');

  return (
    <div>
      <p>性別を選んでください：</p>

      <label>
        <input
          type="radio"
          name="gender"
          value="男性"
          checked={gender === '男性'}
          onChange={(e) => setGender(e.target.value)}
        />
        男性
      </label>

      <br />

      <label>
        <input
          type="radio"
          name="gender"
          value="女性"
          checked={gender === '女性'}
          onChange={(e) => setGender(e.target.value)}
        />
        女性
      </label>

      <br />

      <p>選択された性別: {gender}</p>
    </div>
  );
}


export default App3;