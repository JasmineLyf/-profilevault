import { useState } from 'react';
import { createRoot } from 'react-dom/client';
function Fixture() {
  const [name, setName] = useState(''),
    [country, setCountry] = useState(''),
    [checked, setChecked] = useState(false),
    [time, setTime] = useState('');
  const [submits, setSubmits] = useState(0),
    [submitted, setSubmitted] = useState('');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmits((s) => s + 1);
        setSubmitted(JSON.stringify({ name, country, checked, time }));
      }}
    >
      <h1>虚构 React 受控表单</h1>
      <label>
        姓名
        <input
          id="react-name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        国家
        <select
          id="react-country"
          autoComplete="country"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="">请选择</option>
          <option value="CN">中国</option>
        </select>
      </label>
      <label>
        纸质目录
        <input
          id="react-check"
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
      </label>
      <label>
        上午配送
        <input
          id="react-radio"
          type="radio"
          name="time"
          checked={time === 'am'}
          onChange={(e) => {
            if (e.target.checked) setTime('am');
          }}
        />
      </label>
      <output id="state">{JSON.stringify({ name, country, checked, time })}</output>
      <output id="submits">{submits}</output>
      <output id="submitted">{submitted}</output>
      <button type="submit">用户提交</button>
    </form>
  );
}
createRoot(document.getElementById('root')!).render(<Fixture />);
