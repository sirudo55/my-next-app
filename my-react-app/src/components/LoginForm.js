import { useState } from 'react';
import UserForm from './UserForm'; // ← 相対パスに注意

// メイン：ログイン画面と条件分岐
function LoginForm() {
  const [logindata, setLogindata] = useState({
    isLoggedIn: false,
    username: '',
    password: '',
  });

  const handleLogin = () => {
    if (logindata.username === 'user' && logindata.password === 'pass') {
      setLogindata({ ...logindata, isLoggedIn: true });
    } else {
      alert('ログイン失敗');
    }
  };

  if (logindata.isLoggedIn) {
   return <UserForm username={logindata.username} />; // ← propsとして渡す
  }

  return (
    <div>
      <h2>ログイン</h2>
      <input
        type="text"
        placeholder="ユーザー名"
        value={logindata.username}
        onChange={(e) =>
          setLogindata({ ...logindata, username: e.target.value })
        }
      />
      <br />
      <input
        type="password"
        placeholder="パスワード"
        value={logindata.password}
        onChange={(e) =>
          setLogindata({ ...logindata, password: e.target.value })
        }
      />
      <br />
      <button onClick={handleLogin}>ログイン</button>
    </div>
  );
}


export default LoginForm;