import { useState, useEffect } from 'react';
import { Trophy, Clock, Users, X, Crown } from 'lucide-react';
import { Chat } from './Chat';
import type { Player, GameSession, GameAttempt } from '../services/gameService';

interface GamePlayProps {
  session: GameSession;
  currentPlayer: Player;
  players: Player[];
  attempts: GameAttempt[];
  onSubmitGuess: (guess: string) => void;
  timeRemaining: number;
}

export function GamePlay({
  session,
  currentPlayer,
  players,
  attempts,
  onSubmitGuess,
  timeRemaining
}: GamePlayProps) {
  const [guess, setGuess] = useState('');
  const [error, setError] = useState('');

  const myAttempts = attempts.filter(a => a.player_id === currentPlayer.id);
  const remainingAttempts = 3 - myAttempts.length;
  const hasWon = myAttempts.some(a => a.is_correct);
  const winningAttempt = attempts.find(a => a.is_correct);
  const winner = winningAttempt ? players.find(p => p.id === winningAttempt.player_id) : null;
  const gameOver = timeRemaining <= 0 || !!winner;
  const isGameMaster = currentPlayer.id === session.game_master_id;

  useEffect(() => {
    if (hasWon) {
      setGuess('');
    }
  }, [hasWon]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!guess.trim()) {
      setError('Please enter a guess');
      return;
    }

    if (remainingAttempts <= 0) {
      setError('No attempts remaining');
      return;
    }

    if (gameOver) {
      setError('Game is over');
      return;
    }

    onSubmitGuess(guess.trim());
    setGuess('');
  };

  const formatTime = (seconds: number) => {
    return `${Math.max(0, seconds)}s`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center p-4">
  <div className="bg-white rounded-lg shadow-2xl p-6 max-w-5xl w-full grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Game in Progress</h2>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${
            timeRemaining <= 10 ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
          }`}>
            <Clock className="w-5 h-5" />
            {formatTime(timeRemaining)}
          </div>
        </div>

  <div className="lg:col-span-2">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-6 mb-6">
          <p className="text-sm font-medium mb-2">Question</p>
          <p className="text-xl font-semibold">{session.current_question}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Users className="w-5 h-5 text-gray-600" />
                <h3 className="font-semibold text-gray-800">Leaderboard</h3>
              </div>
              <div className="space-y-2">
                {players
                  .sort((a, b) => b.score - a.score)
                  .map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between p-2 rounded ${
                        player.id === currentPlayer.id ? 'bg-blue-100' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-500 w-6">#{index + 1}</span>
                        {player.id === session.game_master_id && (
                          <Crown className="w-4 h-4 text-yellow-500" />
                        )}
                        <span className="font-medium text-gray-800">{player.username}</span>
                      </div>
                      <span className="font-semibold text-gray-700">{player.score}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Your Attempts</h3>
              <div className="space-y-2 mb-4">
                {myAttempts.map((attempt) => (
                  <div
                    key={attempt.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      attempt.is_correct ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'
                    }`}
                  >
                    <span className="font-medium">{attempt.guess}</span>
                    {attempt.is_correct ? (
                      <Trophy className="w-5 h-5 text-green-600" />
                    ) : (
                      <X className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                ))}
              </div>
              <div className="text-center">
                <span className="text-sm font-medium text-gray-600">Attempts: {remainingAttempts}/3</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-span-1 h-full">
          <Chat sessionId={session.id} currentPlayer={currentPlayer} />
        </div>

        {gameOver ? (
          <div className={`rounded-lg p-6 text-center ${
            winner
              ? winner.id === currentPlayer.id
                ? 'bg-green-100 border-2 border-green-400'
                : 'bg-yellow-100 border-2 border-yellow-400'
              : 'bg-gray-100 border-2 border-gray-400'
          }`}>
            {winner ? (
              <>
                <Trophy className={`w-16 h-16 mx-auto mb-4 ${
                  winner.id === currentPlayer.id ? 'text-green-600' : 'text-yellow-600'
                }`} />
                {winner.id === currentPlayer.id ? (
                  <>
                    <h3 className="text-2xl font-bold text-green-700 mb-2">You Won!</h3>
                    <p className="text-green-600">+10 points</p>
                  </>
                ) : (
                  <>
                    <h3 className="text-2xl font-bold text-yellow-700 mb-2">
                      {winner.username} Won!
                    </h3>
                    <p className="text-yellow-600">Better luck next time</p>
                  </>
                )}
                <div className="mt-4 p-3 bg-white rounded-lg">
                  <p className="text-sm text-gray-600">The answer was:</p>
                  <p className="text-lg font-bold text-gray-800">{session.current_answer}</p>
                </div>
              </>
            ) : (
              <>
                <Clock className="w-16 h-16 mx-auto mb-4 text-gray-600" />
                <h3 className="text-2xl font-bold text-gray-700 mb-2">Time's Up!</h3>
                <p className="text-gray-600">No one guessed the answer</p>
                <div className="mt-4 p-3 bg-white rounded-lg">
                  <p className="text-sm text-gray-600">The answer was:</p>
                  <p className="text-lg font-bold text-gray-800">{session.current_answer}</p>
                </div>
              </>
            )}
          </div>
        ) : hasWon ? (
          <div className="bg-green-100 border-2 border-green-400 rounded-lg p-6 text-center">
            <Trophy className="w-16 h-16 mx-auto mb-4 text-green-600" />
            <h3 className="text-2xl font-bold text-green-700 mb-2">You Got It!</h3>
            <p className="text-green-600">Waiting for game to end...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="guess" className="block text-sm font-medium text-gray-700 mb-2">
                Your Guess
              </label>
              <input
                type="text"
                id="guess"
                value={guess}
                onChange={(e) => setGuess(e.target.value)}
                disabled={isGameMaster || remainingAttempts <= 0 || gameOver}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                placeholder={isGameMaster ? "Game master cannot guess" : (remainingAttempts > 0 ? 'Enter your guess' : 'No attempts remaining')}
                maxLength={100}
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isGameMaster || remainingAttempts <= 0 || gameOver}
              className={`w-full font-semibold py-3 px-4 rounded-lg transition-colors ${
                remainingAttempts > 0 && !gameOver
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              Submit Guess
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
