import { GoogleLogin } from '@react-oauth/google';
import { exchangeGoogle, setSession } from '../lib/api.js';

export default function Header({ user, onUser, search, setSearch }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return (
    <header className="sticky top-0 z-30 px-4 md:px-8 py-3 backdrop-blur-md bg-black/30 border-b border-white/10">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg"
               style={{ background: 'linear-gradient(135deg,#ffd86b,#ff6bd4,#6b9dff)', color: '#1a1230' }}>🎬</div>
          <div className="leading-tight">
            <div className="text-lg font-black">CineBoost</div>
            <div className="text-[10px] uppercase tracking-widest text-white/60">top 50 in theaters</div>
          </div>
        </div>
        <div className="flex-1 min-w-[200px] max-w-md">
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Search title…"
                 className="w-full px-4 py-2 rounded-full bg-white/10 border border-white/20 outline-none text-sm focus:border-pink-400" />
        </div>
        {user ? (
          <div className="flex items-center gap-2">
            {user.picture
              ? <img src={user.picture} className="w-8 h-8 rounded-full ring-2 ring-white/40" alt="" />
              : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500" />}
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-semibold">{user.name}</div>
              <div className="text-[10px] text-white/60">{user.email}</div>
            </div>
            <button onClick={() => { setSession(null, null); onUser(null); }}
                    className="text-xs px-2 py-1 rounded-full glass">Log out</button>
          </div>
        ) : clientId ? (
          <GoogleLogin
            onSuccess={async ({ credential }) => {
              try {
                const { token, user: u } = await exchangeGoogle(credential);
                setSession(token, u);
                onUser(u);
              } catch (e) { alert('Login failed: ' + e.message); }
            }}
            onError={() => alert('Google login failed')}
            theme="filled_black" shape="pill" size="medium" />
        ) : (
          <div className="text-xs text-white/60 px-3 py-2 rounded-full glass">
            Set <code>VITE_GOOGLE_CLIENT_ID</code> to enable login
          </div>
        )}
      </div>
    </header>
  );
}
