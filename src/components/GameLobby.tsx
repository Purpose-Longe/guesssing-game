import { useState } from 'react';
import { Crown, Users, LogOut, Copy, Check } from 'lucide-react';
import { Chat } from './Chat';
import type { Player, GameSession } from '../services/gameService';

interface GameLobbyProps {
  session: GameSession;
  currentPlayer: Player;
  players: Player[];
  onStartGame: (question: string, answer: string) => void;
  onLeave: () => void;
}

export function GameLobby({ session, currentPlayer, players, onStartGame, onLeave }: GameLobbyProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const isGameMaster = currentPlayer.id === session.game_master_id;
  const canStartGame = players.length >= 2;

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(session.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartGame = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!question.trim()) {
      setError('Please enter a question');
      return;
    }

    if (!answer.trim()) {
      setError('Please enter an answer');
      return;
    }

    if (!canStartGame) {
      setError('Need at least 2 players to start');
      return;
    }

    onStartGame(question.trim(), answer.trim());
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center p-4">
  <div className="bg-white rounded-lg shadow-2xl p-8 max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Game Lobby</h2>
          <button
            onClick={onLeave}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Leave
          </button>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600 mb-1">Session Code</p>
              <p className="text-2xl font-bold font-mono tracking-wider text-blue-700">{session.code}</p>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

  <div className="mb-6 col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-800">
              Players ({players.length})
            </h3>
          </div>

          <div className="space-y-2">
            {players.map((player) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  player.id === currentPlayer.id
                    ? 'bg-blue-100 border-2 border-blue-400'
                    : 'bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-3">
                  {player.id === session.game_master_id && (
                    <Crown className="w-5 h-5 text-yellow-500" />
                  )}
                  <span className="font-medium text-gray-800">{player.username}</span>
                  {player.id === currentPlayer.id && (
                    <span className="text-xs text-blue-600 font-semibold">(You)</span>
                  )}
                </div>
                <span className="text-sm font-semibold text-gray-600">
                  {player.score} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-1 h-full">
          <Chat sessionId={session.id} currentPlayer={currentPlayer} />
        </div>

        {isGameMaster ? (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <Crown className="w-5 h-5 text-yellow-600" />
              <h3 className="text-lg font-semibold text-gray-800">You are the Game Master</h3>
            </div>

            <form onSubmit={handleStartGame} className="space-y-4">
              <div>
                <label htmlFor="question" className="block text-sm font-medium text-gray-700 mb-2">
                  Question
                </label>
                <input
                  type="text"
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="What is the capital of France?"
                  maxLength={200}
                />
              </div>

              <div>
                <label htmlFor="answer" className="block text-sm font-medium text-gray-700 mb-2">
                  Answer
                </label>
                <input
                  type="text"
                  id="answer"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent"
                  placeholder="Paris"
                  maxLength={100}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {!canStartGame && (
                <div className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-3 rounded-lg text-sm">
                  Waiting for at least 2 players to start the game...
                </div>
              )}

              <button
                type="submit"
                disabled={!canStartGame}
                className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors ${
                  canStartGame
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Start Game
              </button>
            </form>
          </div>
        ) : (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
            <p className="text-gray-600">
              Waiting for <span className="font-semibold">
                {players.find(p => p.id === session.game_master_id)?.username}
              </span> to start the game...
            </p>
            {!canStartGame && (
              <p className="text-sm text-orange-600 mt-2">
                Need at least 2 players to start
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
