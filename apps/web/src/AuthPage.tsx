import { useState } from 'react';
import { useSession } from './store/session.js';

export function AuthPage() {
  const signIn = useSession((state) => state.signIn);
  const signUp = useSession((state) => state.signUp);
  const [mode, setMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  return (
    <main className="auth-screen">
      <form
        className="auth-card"
        onSubmit={(event) => {
          event.preventDefault();
          setError('');
          setPending(true);
          const name = displayName.trim();
          const action =
            mode === 'login'
              ? signIn({ email: email.trim(), password })
              : signUp({ email: email.trim(), password, ...(name ? { displayName: name } : {}) });
          void action.catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : '提交失败');
          }).finally(() => setPending(false));
        }}
      >
        <div className="auth-brand">
          <p className="mark">支</p>
          <div>
            <h1>支流</h1>
            <p>注册之后，模型和用量都只属于你。</p>
          </div>
        </div>
        <div className="section-tabs" role="tablist" aria-label="登录或注册">
          <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-on' : ''} onClick={() => setMode('register')}>
            注册
          </button>
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-on' : ''} onClick={() => setMode('login')}>
            登录
          </button>
        </div>
        {mode === 'register' ? (
          <label className="field">
            <span>显示名</span>
            <input value={displayName} autoComplete="nickname" placeholder="可以不填" onChange={(event) => setDisplayName(event.target.value)} />
          </label>
        ) : null}
        <label className="field">
          <span>邮箱</span>
          <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="field">
          <span>密码</span>
          <input
            type="password"
            required
            minLength={mode === 'register' ? 8 : 1}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            value={password}
            placeholder={mode === 'register' ? '至少 8 位' : ''}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? '提交中…' : mode === 'register' ? '注册并进入' : '登录'}
        </button>
      </form>
    </main>
  );
}
