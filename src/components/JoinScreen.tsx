import { useState } from 'react';
import { Users, Plus } from 'lucide-react';

interface JoinScreenProps {
  onCreateSession: (username: string) => void;
  onJoinSession: (code: string, username: string) => void;
}

export function JoinScreen({ onCreateSession, onJoinSession }: JoinScreenProps) {
  const [mode, setMode] = useState<'select' | 'create' | 'join'>('select');
  const [username, setUsername] = useState('');
  const [sessionCode, setSessionCode] = useState('');
  const [error, setError] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (username.trim().length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    onCreateSession(username.trim());
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    if (username.trim().length < 2) {
      setError('Username must be at least 2 characters');
      return;
    }

    if (!sessionCode.trim()) {
      setError('Please enter a session code');
      return;
    }

    if (sessionCode.trim().length !== 6) {
      setError('Session code must be 6 characters');
      return;
    }

    onJoinSession(sessionCode.trim().toUpperCase(), username.trim());
  };

  if (mode === 'select') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">Guessing Game</h1>
          <p className="text-center text-gray-600 mb-8">Live multiplayer fun with friends</p>

          <div className="space-y-4">
            <button
              onClick={() => setMode('create')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Plus className="w-5 h-5" />
              Create New Game
            </button>

            <button
              onClick={() => setMode('join')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors flex items-center justify-center gap-3"
            >
              <Users className="w-5 h-5" />
              Join Existing Game
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Create Game Session</h2>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Your Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter username"
                maxLength={20}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('select');
                  setError('');
                  setUsername('');
                }}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-bold text-center mb-6 text-gray-800">Join Game Session</h2>

        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="join-username" className="block text-sm font-medium text-gray-700 mb-2">
              Your Username
            </label>
            <input
              type="text"
              id="join-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="Enter username"
              maxLength={20}
            />
          </div>

          <div>
            <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-2">
              Session Code
            </label>
            <input
              type="text"
              id="code"
              value={sessionCode}
              onChange={(e) => setSessionCode(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent uppercase tracking-wider font-mono text-center text-lg"
              placeholder="ABC123"
              maxLength={6}
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setMode('select');
                setError('');
                setUsername('');
                setSessionCode('');
              }}
              className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
            >
              Join
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
