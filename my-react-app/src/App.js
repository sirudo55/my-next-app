import logo from './logo.svg';
import './App.css';

import { useState } from 'react';

// 子コンポーネント
function Greeting(props){
  return <h1>どうもどうも、{props.name}さんよ！</h1>;
}

// 親コンポーネント
function App(){
  const [name, setName] = useState("太郎");

  const toggleName = () => {
    setName((prevName) => (prevName === "太郎" ? "花子" : "太郎"));
  };

  return (
    <div style={{ textAlign:"center",marginTop:"50px"}}>
      <Greeting name={name} />
      <button onClick={toggleName}>名前を切り替える</button>
    </div>
  );
}

export default App;

