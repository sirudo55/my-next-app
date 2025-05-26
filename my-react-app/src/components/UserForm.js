import { useState } from 'react';
import WelcomeMessage from './WelcomeMessage'; // ← 追加

// ログイン成功後に表示するフォーム画面
function UserForm({ username }) { // ← ここで親から受け取る
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'male',
    agree: false,
    hobby: '読書',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!formData.agree) {
      alert("利用規約に同意してください");
      return;
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div>
        <h2>送信完了！</h2>
        <p>ありがとうございました、{formData.name}さん。</p>
        <p>登録内容:</p>
        <ul>
          <li>年齢: {formData.age}</li>
          <li>性別: {formData.gender}</li>
          <li>趣味: {formData.hobby}</li>
        </ul>
      </div>
    );
  }

  return (
    <div>
      <WelcomeMessage username={username} /> {/* ← ここに渡す */}
      <h2>登録フォーム</h2>

      {/* 以下は前回と同じフォーム内容（省略可能） */}

      <p>
        名前:
        <input
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        />
      </p>

      <p>
        年齢:
        <input
          type="number"
          value={formData.age}
          onChange={(e) => setFormData({ ...formData, age: e.target.value })}
        />
      </p>

      <p>性別:
        <label>
          <input
            type="radio"
            name="gender"
            value="male"
            checked={formData.gender === 'male'}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
          />
          男性
        </label>
        <label>
          <input
            type="radio"
            name="gender"
            value="female"
            checked={formData.gender === 'female'}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
          />
          女性
        </label>
      </p>

      <p>
        趣味:
        <select
          value={formData.hobby}
          onChange={(e) => setFormData({ ...formData, hobby: e.target.value })}
        >
          <option value="読書">読書</option>
          <option value="映画">映画</option>
          <option value="スポーツ">スポーツ</option>
        </select>
      </p>

      <p>
        <label>
          <input
            type="checkbox"
            checked={formData.agree}
            onChange={(e) => setFormData({ ...formData, agree: e.target.checked })}
          />
          利用規約に同意します
        </label>
      </p>

      <button onClick={handleSubmit}>送信</button>
    </div>
  );
}

export default UserForm;